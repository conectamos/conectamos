import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { projectLocalSaleCredits } from "@/lib/cierre-domain";

type Tx = Prisma.TransactionClient;
type CreditData = Omit<Prisma.CierreCreditoUncheckedCreateInput, "id">;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

function businessSnapshot(value: Record<string, unknown>) {
  const keys = ["financial", "providerCreditId", "localKey", "ventaId", "registroId", "localReference", "sedeId", "effectiveAt", "amount", "customerName", "documentNumber", "creditNumber", "imei", "status", "source", "evidence", "providerUpdatedAt"];
  return json(Object.fromEntries(keys.map((key) => [key, key === "amount" && value[key] != null ? Number(value[key]) : value[key] ?? null])));
}

// Both observations and updates are retained, while retries with the exact same
// business data produce no additional events. No identity uses the customer's ID.
export async function saveCierreCredit(tx: Tx, data: CreditData) {
  const providerMatch = data.providerCreditId ? await tx.cierreCredito.findUnique({
    where: { financial_providerCreditId: { financial: data.financial, providerCreditId: data.providerCreditId } },
  }) : null;
  const localMatch = data.localKey ? await tx.cierreCredito.findUnique({ where: { localKey: data.localKey } }) : null;
  if (providerMatch && localMatch && providerMatch.id !== localMatch.id) {
    // Only the explicitly linked local credit is superseded. Its history remains.
    await tx.cierreCredito.update({ where: { id: localMatch.id }, data: { localKey: null, status: "VINCULADO", updatedAt: new Date() } });
    await tx.cierreEvento.upsert({ where: { eventKey: `link:${localMatch.id}:${providerMatch.id}` }, update: {}, create: {
      creditId: localMatch.id, eventKey: `link:${localMatch.id}:${providerMatch.id}`,
      snapshot: { status: "VINCULADO", creditId: providerMatch.id, localKey: data.localKey || null },
    } });
  }
  const existing = providerMatch || localMatch;
  const business = businessSnapshot({ ...existing, ...data });
  const changed = !existing || JSON.stringify(businessSnapshot(existing)) !== JSON.stringify(business);
  const hash = createHash("sha256").update(`${existing?.updatedAt.toISOString() || "new"}:${JSON.stringify(business)}`).digest("hex");
  const row = existing
    ? await tx.cierreCredito.update({ where: { id: existing.id }, data: { ...data, syncedAt: new Date(), updatedAt: new Date() } })
    : await tx.cierreCredito.create({ data });
  if (changed) await tx.cierreEvento.upsert({
    where: { eventKey: `${row.id}:${hash}` }, update: {},
    create: { creditId: row.id, eventKey: `${row.id}:${hash}`, snapshot: business },
  });
  return row;
}

const recordSelect = {
  id: true, sedeId: true, ventaIdRelacionada: true, clienteNombre: true, documentoNumero: true,
  estadoVentaRegistro: true, estadoFacturacion: true, eliminadoEn: true,
} as const;

export async function drainCierreLocalQueue(limit = 100) {
  const startedAt = Date.now();
  let processed = 0;
  const queue = await prisma.cierreVentaPendiente.findMany({ where: { nextAttempt: { lte: new Date() } }, orderBy: [{ updatedAt: "asc" }, { ventaId: "asc" }], take: limit });
  for (const pending of queue) {
    if (Date.now() - startedAt > 30_000) break;
    try { await prisma.$transaction(async (tx) => {
      const sale = await tx.venta.findUnique({ where: { id: pending.ventaId } });
      const records = await tx.registroVendedorVenta.findMany({ where: { ventaIdRelacionada: pending.ventaId }, select: recordSelect });
      const previous = await tx.cierreCredito.findMany({ where: { ventaId: pending.ventaId, localKey: { not: null } } });
      const projected = sale ? projectLocalSaleCredits(sale, records) : [];
      // A deleted sale can precede the first worker run: preserve its outbox image.
      if (!sale && previous.length === 0 && pending.snapshot && typeof pending.snapshot === "object") {
        const snapshot = pending.snapshot as Record<string, unknown>;
        const removed = projectLocalSaleCredits({ ...snapshot, fecha: new Date(String(snapshot.fecha)) } as Parameters<typeof projectLocalSaleCredits>[0], []);
        for (const credit of removed) await saveCierreCredit(tx, { ...credit, status: "ANULADO", source: "CONECTAMOS · venta eliminada", evidence: { reason: "VENTA_ELIMINADA" } });
      }
      for (const credit of projected) {
        const prior = previous.find((r) => r.localKey === credit.localKey);
        // An explicit provider reversal remains authoritative on subsequent local
        // edits; a new local snapshot cannot resurrect that provider operation.
        const providerAuthoritative = Boolean(prior?.providerCreditId && prior.source.includes("API"));
        await saveCierreCredit(tx, {
          ...credit, imei: sale?.serial || null,
          ...(prior?.providerCreditId ? { providerCreditId: prior.providerCreditId, creditNumber: prior.creditNumber } : {}),
          ...(providerAuthoritative ? {
            providerCreditId: prior!.providerCreditId, creditNumber: prior!.creditNumber,
            status: credit.status === "EFECTIVO" ? prior!.status : credit.status, amount: prior!.amount, effectiveAt: prior!.effectiveAt,
            source: credit.status === "EFECTIVO" ? prior!.source : credit.source,
            evidence: credit.status === "EFECTIVO" ? prior!.evidence as Prisma.InputJsonValue : { reason: "ESTADO_LOCAL", status: credit.status },
            providerUpdatedAt: prior!.providerUpdatedAt,
          } : {}),
        });
        if (["SUMASPAY", "PAYJOY", "ADDI"].includes(credit.financial)) {
          await tx.cierreSyncTrabajo.upsert({ where: { key: credit.localKey }, update: {}, create: { key: credit.localKey, financial: credit.financial, localKey: credit.localKey } });
        }
      }
      for (const old of previous) {
        if (projected.some((c) => c.localKey === old.localKey)) continue;
        await saveCierreCredit(tx, {
          financial: old.financial, localKey: old.localKey, providerCreditId: old.providerCreditId,
          ventaId: old.ventaId, registroId: old.registroId, localReference: old.localReference,
          sedeId: old.sedeId, effectiveAt: old.effectiveAt, amount: old.amount,
          customerName: old.customerName, documentNumber: old.documentNumber,
          creditNumber: old.creditNumber, imei: old.imei, status: "ANULADO",
          source: "CONECTAMOS · venta retirada", evidence: { reason: sale ? "FINANCIERA_RETIRADA" : "VENTA_ELIMINADA" },
        });
      }
      // Do not lose an update arriving after this batch's read.
      await tx.cierreVentaPendiente.deleteMany({ where: { ventaId: pending.ventaId, revision: pending.revision } });
    }, { timeout: 20_000 }); }
    catch {
      await prisma.cierreVentaPendiente.updateMany({ where: { ventaId: pending.ventaId, revision: pending.revision }, data: {
        attempts: { increment: 1 }, nextAttempt: new Date(Date.now() + Math.min(1440, 5 * 2 ** Math.min(pending.attempts, 8)) * 60_000),
        lastError: "No se pudo proyectar esta venta; revisar sus datos antes de completar el periodo.",
      } });
    }
    processed++;
  }
  const remaining = await prisma.cierreVentaPendiente.count();
  if (remaining === 0) await prisma.cierreSyncEstado.update({ where: { key: "LOCAL" }, data: { initialized: true, lastSuccess: new Date() } });
  return { processed, remaining };
}
