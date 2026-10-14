import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { projectLocalSaleCredits } from "@/lib/cierre-domain";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { getEffectivePayJoyObservation } from "@/lib/cierre-payjoy-audit";
import { getEffectiveSumasObservation } from "@/lib/cierre-sumas-audit";
import { hasCierreProviderObservation, readCierreProviderObservation, makeCierreProviderObservation,
  mergeCierreProviderObservations, withCierreProviderObservation, negativeCierreProviderState,
  type CierreProviderObservation } from "@/lib/cierre-provider-evidence";

type Tx = Prisma.TransactionClient;
type CreditData = Omit<Prisma.CierreCreditoUncheckedCreateInput, "id">;
const terminal = new Set(["ANULADO", "REVERSADO", "RECHAZADO"]);

export function getCierreProviderObservationForRow(row: {
  financial: string; providerCreditId: string | null; status: string; source: string;
  evidence: unknown; providerUpdatedAt?: Date | null;
}): CierreProviderObservation | null {
  if (!row.providerCreditId) return null;
  if (hasCierreProviderObservation(row.evidence)) return readCierreProviderObservation(row.evidence, row.financial, row.providerCreditId);
  const raw = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence) ? row.evidence as Record<string, unknown> : {};
  // Never promote a reversal belonging to a different provider identity.
  if ((raw.providerId != null && raw.providerId !== row.providerCreditId) ||
      (row.financial === "SUMASPAY" && raw.providerId !== row.providerCreditId)) return null;
  const fact = row.financial === "PAYJOY" ? getEffectivePayJoyObservation(row)
    : row.financial === "SUMASPAY" ? getEffectiveSumasObservation(row) : null;
  const negative = negativeCierreProviderState(raw.providerStatus, row.financial) ||
    (!fact && row.source.includes("API") && raw.localTombstone !== true && terminal.has(row.status) ? row.status as CierreProviderObservation["state"] : null);
  if (!fact && !negative) return null;
  return makeCierreProviderObservation({ financial: row.financial, providerId: row.providerCreditId,
    state: negative || "EFECTIVO", amount: fact?.amount ?? null, effectiveAt: fact?.effectiveAt ?? null,
    sourceUpdatedAt: row.providerUpdatedAt, raw });
}

function localStateEvidence(evidence: unknown, reason: string | null, status: string): Prisma.InputJsonValue {
  const value = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? { ...evidence } as Record<string, unknown> : {};
  delete value.reason;
  delete value.localStatus;
  delete value.localTombstone;
  return json({ ...value, ...(reason ? { reason, localStatus: status, localTombstone: true } : {}) });
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

function businessSnapshot(value: Record<string, unknown>) {
  const keys = ["financial", "providerCreditId", "localKey", "ventaId", "registroId", "localReference", "sedeId", "effectiveAt", "amount", "customerName", "documentNumber", "creditNumber", "imei", "status", "source", "evidence", "providerUpdatedAt"];
  return json(Object.fromEntries(keys.map((key) => [key, key === "amount" && value[key] != null ? Number(value[key]) : value[key] ?? null])));
}

// Both observations and updates are retained, while retries with the exact same
// business data produce no additional events. No identity uses the customer's ID.
export async function saveCierreCredit(tx: Tx, data: CreditData, observation: CierreProviderObservation | null = null) {
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
  const retained = existing ? getCierreProviderObservationForRow(existing) : null;
  const providerObservation = mergeCierreProviderObservations(retained, observation);
  if (providerObservation) data = { ...data, evidence: json(withCierreProviderObservation(data.evidence ?? existing?.evidence, providerObservation)) };
  else if (existing && hasCierreProviderObservation(existing.evidence)) {
    // A malformed/unsupported envelope stays fail-closed during a local edit.
    // Only a fresh normalized provider observation may replace it.
    const old = existing.evidence as Record<string, unknown>;
    const incoming = data.evidence && typeof data.evidence === "object" && !Array.isArray(data.evidence) ? data.evidence : {};
    data = { ...data, evidence: json({ ...incoming, providerObservation: old.providerObservation }) };
  }
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
  let succeeded = 0;
  // Initial history shares one timestamp: start with recent sales, while older
  // queued changes retain priority over newly arriving edits.
  const queue = await prisma.cierreVentaPendiente.findMany({ where: { nextAttempt: { lte: new Date() } }, orderBy: [{ updatedAt: "asc" }, { ventaId: "desc" }], take: limit });
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
        const providerTerminal = providerAuthoritative && terminal.has(prior!.status);
        await saveCierreCredit(tx, {
          ...credit, imei: sale?.serial || null,
          ...(prior?.providerCreditId ? { providerCreditId: prior.providerCreditId, creditNumber: prior.creditNumber } : {}),
          ...(providerAuthoritative ? {
            providerCreditId: prior!.providerCreditId, creditNumber: prior!.creditNumber,
            status: providerTerminal || credit.status === "EFECTIVO" ? prior!.status : credit.status, amount: prior!.amount, effectiveAt: prior!.effectiveAt,
            source: providerTerminal || credit.status === "EFECTIVO" ? prior!.source : credit.source,
            evidence: providerTerminal || credit.status === "EFECTIVO"
              ? localStateEvidence(prior!.evidence, credit.status === "EFECTIVO" ? null : "ESTADO_LOCAL", credit.status)
              : { reason: "ESTADO_LOCAL", status: credit.status, localTombstone: true },
            providerUpdatedAt: prior!.providerUpdatedAt,
          } : {}),
        });
        if (["SUMASPAY", "PAYJOY", "ADDI"].includes(credit.financial)) {
          const changedReference = !prior || prior.documentNumber !== credit.documentNumber || prior.imei !== (sale?.serial || null) ||
            Number(prior.amount) !== Number(credit.amount) || prior.effectiveAt?.getTime() !== credit.effectiveAt.getTime();
          // A corrected reference wakes missing-data work; unrelated edits do not
          // repeatedly spend provider requests on an already reviewed credit.
          const update = changedReference ? { state: "PENDIENTE", attempts: 0, nextAttempt: new Date(), limitation: null } : {};
          await tx.cierreSyncTrabajo.upsert({ where: { key: credit.localKey }, update, create: { key: credit.localKey, financial: credit.financial, localKey: credit.localKey } });
          if (credit.financial === "PAYJOY" && changedReference) {
            const key = `PERIODO:PAYJOY:${getDateKeyInColombia(credit.effectiveAt)}`;
            await tx.cierreSyncTrabajo.upsert({ where: { key }, update, create: { key, localKey: key, financial: "PAYJOY" } });
          }
        }
      }
      for (const old of previous) {
        if (projected.some((c) => c.localKey === old.localKey)) continue;
        const providerTerminal = Boolean(old.providerCreditId && old.source.includes("API") && terminal.has(old.status));
        await saveCierreCredit(tx, {
          financial: old.financial, localKey: old.localKey, providerCreditId: old.providerCreditId,
          ventaId: old.ventaId, registroId: old.registroId, localReference: old.localReference,
          sedeId: old.sedeId, effectiveAt: old.effectiveAt, amount: old.amount,
          customerName: old.customerName, documentNumber: old.documentNumber,
          creditNumber: old.creditNumber, imei: old.imei, status: providerTerminal ? old.status : "ANULADO",
          source: providerTerminal ? old.source : "CONECTAMOS · venta retirada",
          evidence: localStateEvidence(providerTerminal ? old.evidence : null, sale ? "FINANCIERA_RETIRADA" : "VENTA_ELIMINADA", "ANULADO"),
        });
      }
      // Do not lose an update arriving after this batch's read.
      await tx.cierreVentaPendiente.deleteMany({ where: { ventaId: pending.ventaId, revision: pending.revision } });
    }, { timeout: 20_000 }); succeeded++; }
    catch {
      await prisma.cierreVentaPendiente.updateMany({ where: { ventaId: pending.ventaId, revision: pending.revision }, data: {
        attempts: { increment: 1 }, nextAttempt: new Date(Date.now() + Math.min(1440, 5 * 2 ** Math.min(pending.attempts, 8)) * 60_000),
        lastError: "No se pudo proyectar esta venta; revisar sus datos antes de completar el periodo.",
      } });
    }
    processed++;
  }
  const remaining = await prisma.cierreVentaPendiente.count();
  if (remaining === 0 || succeeded > 0) await prisma.cierreSyncEstado.update({ where: { key: "LOCAL" }, data: {
    ...(remaining === 0 ? { initialized: true } : {}), lastSuccess: new Date(),
  } });
  return { processed, remaining };
}
