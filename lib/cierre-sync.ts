import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { getDateKeyInColombia, shiftDateKey } from "@/lib/credit-date-utils";
import { drainCierreLocalQueue, saveCierreCredit } from "@/lib/cierre-store";
import { consultarLoteProveedorCierre, type CierreProvider, type CierreProviderCredit } from "@/lib/cierre-providers";
import type { Prisma } from "@/app/generated/prisma/client";

function identityMatches(credit: CierreProviderCredit, local: { documentNumber: string | null; imei: string | null }) {
  const digits = (value: string | null | undefined) => String(value || "").replace(/\D/g, "");
  return Boolean((credit.imei && local.imei && digits(credit.imei) === digits(local.imei)) ||
    (credit.documento && local.documentNumber && digits(credit.documento) === digits(local.documentNumber)));
}

async function syncOneProviderReference() {
  const job = await prisma.cierreSyncTrabajo.findFirst({ where: { nextAttempt: { lte: new Date() }, state: { not: "RETIRADO" } }, orderBy: [{ nextAttempt: "asc" }, { key: "asc" }] });
  if (!job) return { processed: 0 };
  const local = await prisma.cierreCredito.findUnique({ where: { localKey: job.localKey } });
  if (!local?.effectiveAt || !local.ventaId || !(await prisma.venta.findUnique({ where: { id: local.ventaId }, select: { id: true } }))) {
    await prisma.cierreSyncTrabajo.update({ where: { key: job.key }, data: { state: "RETIRADO" } });
    return { processed: 1 };
  }
  const date = getDateKeyInColombia(local.effectiveAt);
  // Persist the attempt before I/O. A crash retries after backoff, never in a tight loop.
  const nextAttempt = new Date(Date.now() + Math.min(24 * 60, 5 * 2 ** Math.min(job.attempts, 8)) * 60_000);
  await prisma.cierreSyncTrabajo.update({ where: { key: job.key }, data: { state: "PENDIENTE", attempts: { increment: 1 }, nextAttempt } });
  try {
    const result = await consultarLoteProveedorCierre({
      financiera: job.financial as CierreProvider, fechaDesde: shiftDateKey(date, -1), fechaHasta: shiftDateKey(date, 1),
      referencias: [{ documento: local.documentNumber || undefined, imei: local.imei || undefined,
        providerId: local.providerCreditId || undefined, localKey: job.localKey, sedeId: local.sedeId || undefined,
        effectiveDate: date, amount: Number(local.amount) }],
    });
    await prisma.$transaction(async (tx) => {
      // Link only an immutable provider identity. For the first association the
      // reference, date AND principal must match uniquely; customer ID alone is insufficient.
      const candidates = result.credits.filter((c) => c.financiera === local.financial &&
        (local.providerCreditId ? c.providerId === local.providerCreditId :
          c.fechaEfectiva && getDateKeyInColombia(c.fechaEfectiva) === date &&
          c.valor !== null && Math.abs(c.valor - Number(local.amount)) < 0.005 && identityMatches(c, local)));
      let match = candidates.length === 1 ? candidates[0] : null;
      if (match && !local.providerCreditId) {
        const dayStart = new Date(`${date}T00:00:00-05:00`);
        const possibleLocals = await tx.cierreCredito.findMany({ where: {
          financial: local.financial, localKey: { not: null }, status: "EFECTIVO", amount: local.amount,
          effectiveAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
        } });
        if (possibleLocals.filter((row) => identityMatches(match!, row)).length !== 1) match = null;
      }
      for (const credit of result.credits) {
        const existing = await tx.cierreCredito.findUnique({ where: { financial_providerCreditId: { financial: credit.financiera, providerCreditId: credit.providerId } } });
        if (existing?.providerUpdatedAt && credit.sourceUpdatedAt && credit.sourceUpdatedAt < existing.providerUpdatedAt) continue;
        const linksLocal = match?.providerId === credit.providerId && (!existing?.localKey || existing.localKey === local.localKey);
        if (linksLocal && credit.estado === "PENDIENTE") {
          // An approval/unknown response cannot disprove a confirmed local sale.
          // Retain evidence without adopting its proposed amount or generation date.
          await saveCierreCredit(tx, {
            financial: local.financial, providerCreditId: credit.providerId, localKey: local.localKey,
            ventaId: local.ventaId, registroId: local.registroId, localReference: local.localReference,
            sedeId: local.sedeId, effectiveAt: local.effectiveAt, amount: local.amount,
            customerName: local.customerName, documentNumber: local.documentNumber, imei: local.imei,
            creditNumber: credit.providerId, status: local.status, source: local.source,
            evidence: credit.raw as Prisma.InputJsonValue,
          });
        } else if (linksLocal || existing?.localKey) {
          const linked = linksLocal ? local : existing!;
          // Unknown older observations never overwrite a known terminal state.
          if (credit.estado === "PENDIENTE") continue;
          if (["ANULADO", "REVERSADO", "RECHAZADO"].includes(linked.status) && credit.estado === "EFECTIVO" &&
              (!linked.source.includes("API") || !credit.sourceUpdatedAt || !linked.providerUpdatedAt || credit.sourceUpdatedAt <= linked.providerUpdatedAt)) continue;
          await saveCierreCredit(tx, {
            financial: credit.financiera, providerCreditId: credit.providerId, localKey: linked.localKey,
            ventaId: linked.ventaId, registroId: linked.registroId, localReference: linked.localReference,
            sedeId: linked.sedeId, effectiveAt: credit.fechaEfectiva || linked.effectiveAt,
            amount: credit.valor ?? linked.amount, customerName: credit.cliente || linked.customerName,
            documentNumber: credit.documento || linked.documentNumber, creditNumber: credit.providerId,
            imei: credit.imei || linked.imei, status: credit.estado,
            source: `CONECTAMOS + API ${credit.financiera}`, evidence: credit.raw as Prisma.InputJsonValue,
            providerUpdatedAt: credit.sourceUpdatedAt || linked.providerUpdatedAt,
          });
        } else {
          // Unmatched provider observations have no trustworthy branch attribution.
          // Retain them for reconciliation, excluded from effective totals.
          await saveCierreCredit(tx, {
            financial: credit.financiera, providerCreditId: credit.providerId,
            effectiveAt: credit.fechaEfectiva, amount: credit.valor,
            customerName: credit.cliente, documentNumber: credit.documento, creditNumber: credit.providerId,
            imei: credit.imei || null, status: "PENDIENTE", source: `API ${credit.financiera} · pendiente de vinculación`,
            evidence: credit.raw as Prisma.InputJsonValue, providerUpdatedAt: credit.sourceUpdatedAt,
          });
        }
      }
      await tx.cierreSyncTrabajo.update({ where: { key: job.key }, data: {
        state: "REVISADO", attempts: 0, lastSuccess: new Date(),
        nextAttempt: new Date(Date.now() + 24 * 60 * 60_000), limitation: result.limitation || null,
      } });
    }, { timeout: 20_000 });
    return { processed: 1 };
  } catch {
    // Do not persist provider response errors: some include URLs or credentials.
    await prisma.cierreSyncTrabajo.update({ where: { key: job.key }, data: { state: "ERROR", limitation: "Consulta pendiente de reintento; se conservan los datos confirmados." } });
    return { processed: 1, failed: true };
  }
}

export async function runCierreSyncBatch() {
  const token = randomUUID();
  const now = new Date();
  await prisma.cierreSyncEstado.upsert({ where: { key: "WORKER" }, create: { key: "WORKER" }, update: {} });
  const lease = await prisma.cierreSyncEstado.updateMany({ where: { key: "WORKER", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockToken: token, lockedUntil: new Date(now.getTime() + 10 * 60_000) } });
  if (lease.count !== 1) return { busy: true };
  try {
    const local = await drainCierreLocalQueue(100);
    // Explicit deployment switch allows operators to verify limits/costs before
    // enabling existing read APIs. Local history does not depend on this switch.
    const provider = process.env.CIERRE_PROVIDER_SYNC_ENABLED === "1" ? await syncOneProviderReference() : { processed: 0, disabled: true };
    return { busy: false, local, provider };
  } finally {
    await prisma.cierreSyncEstado.updateMany({ where: { key: "WORKER", lockToken: token }, data: { lockedUntil: null, lockToken: null } });
  }
}
