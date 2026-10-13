import type { CierreCredito, Prisma } from "@/app/generated/prisma/client";
import type { CierreProviderCredit } from "@/lib/cierre-providers";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { saveCierreCredit } from "@/lib/cierre-store";

const terminal = new Set(["ANULADO", "REVERSADO", "RECHAZADO"]);
function identityMatches(credit: CierreProviderCredit, local: CierreCredito) {
  const imei = (value: string) => /^\d{15,16}$/.test(value.trim()) ? value.trim() : null;
  const document = (value: string) => {
    const normalized = value.trim().replace(/[.\s]/g, "");
    return /^\d+$/.test(normalized) ? normalized : null;
  };
  let matched = false;
  for (const [incoming, stored, normalize] of [
    [credit.imei, local.imei, imei],
    [credit.documento, local.documentNumber, document],
  ] as const) {
    if (!incoming || !stored) continue;
    const normalized = normalize(incoming);
    // A matching document cannot override a contradictory/invalid IMEI, or vice versa.
    if (!normalized || normalized !== normalize(stored)) return false;
    matched = true;
  }
  return matched;
}
function matches(credit: CierreProviderCredit, local: CierreCredito) {
  return credit.financiera === local.financial && (local.providerCreditId ? credit.providerId === local.providerCreditId :
    credit.fechaEfectiva && local.effectiveAt && getDateKeyInColombia(credit.fechaEfectiva) === getDateKeyInColombia(local.effectiveAt) &&
    credit.valor !== null && local.amount !== null && Math.abs(credit.valor - Number(local.amount)) < 0.005 && identityMatches(credit, local));
}

function hasLocalTombstone(local: CierreCredito) {
  const evidence = local.evidence;
  return (terminal.has(local.status) && !local.source.includes("API")) ||
    (evidence !== null && typeof evidence === "object" && !Array.isArray(evidence) && evidence.localTombstone === true);
}

function linkedEvidence(local: CierreCredito, raw: CierreProviderCredit["raw"]): Prisma.InputJsonValue {
  if (!hasLocalTombstone(local)) return raw as Prisma.InputJsonValue;
  const old = local.evidence && typeof local.evidence === "object" && !Array.isArray(local.evidence) ? local.evidence : {};
  const incoming = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { providerEvidence: raw };
  return { ...incoming, localTombstone: true, localStatus: old.localStatus || local.status,
    ...(old.reason ? { reason: old.reason } : {}) } as Prisma.InputJsonValue;
}

/** Persist observations once by provider ID, linking only an unambiguous local credit. */
export async function reconcileCierreCredits(tx: Prisma.TransactionClient, credits: CierreProviderCredit[]) {
  let linked = 0;
  let pending = 0;
  for (const observation of credits) {
    const existing = await tx.cierreCredito.findUnique({ where: { financial_providerCreditId: { financial: observation.financiera, providerCreditId: observation.providerId } } });
    const stale = existing?.providerUpdatedAt && observation.sourceUpdatedAt && observation.sourceUpdatedAt < existing.providerUpdatedAt;
    const reconcileStoredNegative = stale && !existing?.localKey && existing && terminal.has(existing.status);
    if (stale && !reconcileStoredNegative) continue;
    // Re-reading the origination day can discover a newly entered local sale.
    // If a newer negative is already known, link that retained fact rather than
    // reviving the older finance event or waiting to read the reversal day again.
    const incoming = reconcileStoredNegative ? { ...observation,
      estado: existing.status as CierreProviderCredit["estado"], fechaEfectiva: existing.effectiveAt,
      valor: existing.amount == null ? null : Number(existing.amount), documento: existing.documentNumber || "",
      imei: existing.imei || undefined, cliente: existing.customerName,
      sourceUpdatedAt: existing.providerUpdatedAt || undefined, raw: existing.evidence as CierreProviderCredit["raw"],
    } : observation;
    // A later reversal has an event date, not another origination date. Reuse
    // only facts retained under the exact same provider identity for matching.
    const credit = { ...incoming,
      fechaEfectiva: incoming.fechaEfectiva || existing?.effectiveAt || null,
      valor: incoming.valor ?? (existing?.amount == null ? null : Number(existing.amount)),
      documento: incoming.documento || existing?.documentNumber || "",
      imei: incoming.imei || existing?.imei || undefined,
      cliente: incoming.cliente || existing?.customerName || null,
    };
    let local = existing?.localKey ? existing : null;
    if (!local && credit.fechaEfectiva && credit.valor !== null) {
      const date = getDateKeyInColombia(credit.fechaEfectiva);
      const start = new Date(`${date}T00:00:00-05:00`);
      const locals = await tx.cierreCredito.findMany({ where: {
        financial: credit.financiera, localKey: { not: null }, amount: credit.valor,
        effectiveAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) },
      } });
      const candidates = locals.filter((row) => matches(credit, row));
      if (candidates.length === 1) {
        // Other unlinked IDs may have arrived in an earlier batch. They are as
        // ambiguous as two matching loans within the current provider response.
        const previousObservations = await tx.cierreCredito.findMany({ where: {
          financial: credit.financiera, providerCreditId: { not: null }, localKey: null,
          amount: credit.valor, effectiveAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) },
        } });
        const competingBatch = credits.some((other) => other.providerId !== credit.providerId && matches(other, candidates[0]));
        const competingStored = previousObservations.some((other) => other.providerCreditId !== credit.providerId && matches({
          ...credit, providerId: other.providerCreditId!, fechaEfectiva: other.effectiveAt,
          valor: other.amount == null ? null : Number(other.amount), documento: other.documentNumber || "", imei: other.imei || undefined,
        }, candidates[0]));
        if (!competingBatch && !competingStored) local = candidates[0];
      }
    }
    if (local) {
      linked++;
      if (credit.estado === "PENDIENTE") {
        pending++;
        if (terminal.has(local.status)) continue;
        await saveCierreCredit(tx, {
          financial: local.financial, providerCreditId: credit.providerId, localKey: local.localKey,
          ventaId: local.ventaId, registroId: local.registroId, localReference: local.localReference,
          sedeId: local.sedeId, effectiveAt: local.effectiveAt, amount: local.amount,
          customerName: local.customerName, documentNumber: local.documentNumber, imei: local.imei,
          creditNumber: credit.providerId, status: local.status, source: local.source,
          evidence: credit.raw as Prisma.InputJsonValue,
        });
        continue;
      }
      if (terminal.has(local.status) && credit.estado === "EFECTIVO" &&
          (hasLocalTombstone(local) || !local.source.includes("API") || !credit.sourceUpdatedAt || !local.providerUpdatedAt || credit.sourceUpdatedAt <= local.providerUpdatedAt)) continue;
      await saveCierreCredit(tx, {
        financial: credit.financiera, providerCreditId: credit.providerId, localKey: local.localKey,
        ventaId: local.ventaId, registroId: local.registroId, localReference: local.localReference,
        sedeId: local.sedeId, effectiveAt: credit.fechaEfectiva || local.effectiveAt,
        amount: credit.valor ?? local.amount, customerName: credit.cliente || local.customerName,
        documentNumber: credit.documento || local.documentNumber, creditNumber: credit.providerId,
        imei: credit.imei || local.imei, status: credit.estado, source: `CONECTAMOS + API ${credit.financiera}`,
        evidence: linkedEvidence(local, credit.raw), providerUpdatedAt: credit.sourceUpdatedAt || local.providerUpdatedAt,
      });
    } else {
      pending++;
      // A merchant name alone cannot prove the branch or absence of a duplicate.
      // Unlinked negative states are still real observations, not pending loans.
      const retainNegative = existing && terminal.has(existing.status) && (credit.estado === "PENDIENTE" ||
        (credit.estado === "EFECTIVO" && (!credit.sourceUpdatedAt || !existing.providerUpdatedAt || credit.sourceUpdatedAt <= existing.providerUpdatedAt)));
      const status = retainNegative ? existing.status : terminal.has(credit.estado) ? credit.estado : "PENDIENTE";
      await saveCierreCredit(tx, {
        financial: credit.financiera, providerCreditId: credit.providerId,
        effectiveAt: credit.fechaEfectiva || existing?.effectiveAt, amount: credit.valor ?? existing?.amount,
        customerName: credit.cliente, documentNumber: credit.documento, creditNumber: credit.providerId,
        imei: credit.imei || null, status, source: `API ${credit.financiera} · pendiente de vinculación`,
        evidence: retainNegative ? existing.evidence as Prisma.InputJsonValue : credit.raw as Prisma.InputJsonValue,
        providerUpdatedAt: retainNegative ? existing.providerUpdatedAt : credit.sourceUpdatedAt || existing?.providerUpdatedAt,
      });
    }
  }
  return { observed: credits.length, linked, pending };
}
