import type { CierreCredito, Prisma } from "@/app/generated/prisma/client";
import type { CierreProviderCredit } from "@/lib/cierre-providers";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { saveCierreCredit, getCierreProviderObservationForRow } from "@/lib/cierre-store";
import { getSumasPaidCancellationFact, makeCierreProviderObservation, mergeCierreProviderObservations } from "@/lib/cierre-provider-evidence";
import { CIERRE_RECONCILIATION_REASONS, type CierreReconciliationReason, type CierreReasonCounts } from "@/lib/cierre-reconciliation-reasons";
export { CIERRE_RECONCILIATION_REASONS } from "@/lib/cierre-reconciliation-reasons";
export type { CierreReconciliationReason, CierreReasonCounts } from "@/lib/cierre-reconciliation-reasons";

const terminal = new Set(["ANULADO", "REVERSADO", "RECHAZADO"]);
const imei = (value: string) => /^\d{15,16}$/.test(value.trim()) ? value.trim() : null;
const document = (value: string) => {
  const normalized = value.trim().replace(/[.\s]/g, "");
  return /^\d+$/.test(normalized) ? normalized : null;
};
function identityComparison(credit: CierreProviderCredit, local: CierreCredito): "MATCH" | "MISSING" | "CONFLICT" {
  let matched = false;
  for (const [incoming, stored, normalize] of [
    [credit.imei, local.imei, imei],
    [credit.documento, local.documentNumber, document],
  ] as const) {
    if (!incoming || !stored) continue;
    const normalized = normalize(incoming);
    // A matching document cannot override a contradictory/invalid IMEI, or vice versa.
    if (!normalized || normalized !== normalize(stored)) return "CONFLICT";
    matched = true;
  }
  return matched ? "MATCH" : "MISSING";
}
function matches(credit: CierreProviderCredit, local: CierreCredito) {
  return credit.financiera === local.financial && (local.providerCreditId ? credit.providerId === local.providerCreditId :
    credit.fechaEfectiva && local.effectiveAt && getDateKeyInColombia(credit.fechaEfectiva) === getDateKeyInColombia(local.effectiveAt) &&
    credit.valor !== null && local.amount !== null && Math.abs(credit.valor - Number(local.amount)) < 0.005 && identityComparison(credit, local) === "MATCH");
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  const reasons: CierreReasonCounts = {};
  for (const supplied of credits) {
    const observation = supplied.financiera === "SUMASPAY" && supplied.estado === "ANULADO" &&
      getSumasPaidCancellationFact(supplied.raw, supplied.providerId) ? { ...supplied, estado: "EFECTIVO" as const } : supplied;
    const issues = new Set<CierreReconciliationReason>();
    const countReasons = () => { for (const reason of issues) reasons[reason] = (reasons[reason] || 0) + 1; };
    const evidence = (raw: CierreProviderCredit["raw"]): Prisma.InputJsonValue => ({
      ...(object(raw) ? raw : { providerEvidence: raw }), cierreDiagnostics: { reasons: [...issues] },
    } as Prisma.InputJsonValue);
    const existing = await tx.cierreCredito.findUnique({ where: { financial_providerCreditId: { financial: observation.financiera, providerCreditId: observation.providerId } } });
    const priorObservation = existing ? getCierreProviderObservationForRow(existing) : null;
    const providerObservation = mergeCierreProviderObservations(priorObservation, makeCierreProviderObservation({
      financial: observation.financiera, providerId: observation.providerId, state: observation.estado,
      amount: observation.valor, effectiveAt: observation.fechaEfectiva, sourceUpdatedAt: observation.sourceUpdatedAt, raw: observation.raw,
    }));
    // Preserve the financial fact before any local lifecycle/staleness guard.
    // Only the independent envelope changes; local cancellation/status survives.
    if (existing) await saveCierreCredit(tx, {
      financial: existing.financial, providerCreditId: existing.providerCreditId,
      status: existing.status, source: existing.source, evidence: existing.evidence as Prisma.InputJsonValue,
    }, providerObservation);
    const previousDate = priorObservation?.sourceUpdatedAt ? new Date(priorObservation.sourceUpdatedAt) : existing?.providerUpdatedAt;
    const stale = previousDate && observation.sourceUpdatedAt && observation.sourceUpdatedAt < previousDate;
    const reconcileStoredNegative = stale && !existing?.localKey && existing &&
      terminal.has(priorObservation?.state || existing.status);
    if (stale && !reconcileStoredNegative) { issues.add("STALE_OBSERVATION"); countReasons(); continue; }
    // Re-reading the origination day can discover a newly entered local sale.
    // If a newer negative is already known, link that retained fact rather than
    // reviving the older finance event or waiting to read the reversal day again.
    const incoming = reconcileStoredNegative ? { ...observation,
      estado: existing.status as CierreProviderCredit["estado"], fechaEfectiva: existing.effectiveAt,
      valor: existing.amount == null ? null : Number(existing.amount), documento: existing.documentNumber || "",
      imei: existing.imei || undefined, cliente: existing.customerName,
      sourceUpdatedAt: existing.providerUpdatedAt || undefined, raw: existing.evidence as CierreProviderCredit["raw"],
    } : providerObservation && terminal.has(providerObservation.state) ? { ...observation,
      estado: providerObservation.state, valor: providerObservation.amount,
      fechaEfectiva: providerObservation.effectiveAt ? new Date(providerObservation.effectiveAt) : null,
      sourceUpdatedAt: providerObservation.sourceUpdatedAt ? new Date(providerObservation.sourceUpdatedAt) : undefined,
      raw: providerObservation.raw as CierreProviderCredit["raw"],
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
    const diagnostics = object(incoming.raw) && object(incoming.raw.diagnostics) ? incoming.raw.diagnostics : {};
    const providerReasons = Array.isArray(diagnostics.reasons) ? diagnostics.reasons : [];
    for (const reason of CIERRE_RECONCILIATION_REASONS) {
      if (!providerReasons.includes(reason)) continue;
      if (reason === "MISSING_PRINCIPAL" && credit.valor !== null) continue;
      if (reason === "MISSING_EFFECTIVE_DATE" && credit.fechaEfectiva) continue;
      issues.add(reason);
    }
    if (credit.valor === null) issues.add("MISSING_PRINCIPAL");
    if (!credit.fechaEfectiva) issues.add("MISSING_EFFECTIVE_DATE");
    if (credit.estado === "PENDIENTE" && !Array.isArray(diagnostics.reasons)) issues.add("UNCONFIRMED_STATUS");
    let local = existing?.localKey ? existing : null;
    if (!local && !((credit.imei && imei(credit.imei)) || (credit.documento && document(credit.documento)))) issues.add("MISSING_IDENTITY");
    if (!local && credit.fechaEfectiva && credit.valor !== null) {
      const date = getDateKeyInColombia(credit.fechaEfectiva);
      const start = new Date(`${date}T00:00:00-05:00`);
      const locals = await tx.cierreCredito.findMany({ where: {
        financial: credit.financiera, localKey: { not: null }, amount: credit.valor,
        effectiveAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) },
      } });
      const candidates = locals.filter((row) => matches(credit, row));
      if (candidates.length > 1) issues.add("AMBIGUOUS_LOCAL_MATCH");
      if (candidates.length === 0) {
        if (locals.some((row) => identityComparison(credit, row) === "CONFLICT")) issues.add("IDENTITY_CONFLICT");
        else if (locals.some((row) => identityComparison(credit, row) === "MISSING")) issues.add("MISSING_IDENTITY");
        else issues.add("NO_LOCAL_MATCH");
      }
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
        else issues.add("AMBIGUOUS_PROVIDER_MATCH");
      }
    }
    if (local) {
      linked++;
      const retainedLocal = local;
      const preserveLocal = async () => saveCierreCredit(tx, {
        financial: retainedLocal.financial, providerCreditId: credit.providerId, localKey: retainedLocal.localKey,
        ventaId: retainedLocal.ventaId, registroId: retainedLocal.registroId, localReference: retainedLocal.localReference,
        sedeId: retainedLocal.sedeId, effectiveAt: retainedLocal.effectiveAt, amount: retainedLocal.amount,
        customerName: retainedLocal.customerName, documentNumber: retainedLocal.documentNumber, imei: retainedLocal.imei,
        creditNumber: credit.providerId, status: retainedLocal.status, source: retainedLocal.source,
        evidence: linkedEvidence(retainedLocal, retainedLocal.evidence as CierreProviderCredit["raw"]),
      }, providerObservation);
      if (credit.estado === "PENDIENTE") {
        pending++;
        if (terminal.has(local.status)) { await preserveLocal(); issues.add("LOCAL_TERMINAL_PRESERVED"); countReasons(); continue; }
        await saveCierreCredit(tx, {
          financial: local.financial, providerCreditId: credit.providerId, localKey: local.localKey,
          ventaId: local.ventaId, registroId: local.registroId, localReference: local.localReference,
          sedeId: local.sedeId, effectiveAt: local.effectiveAt, amount: local.amount,
          customerName: local.customerName, documentNumber: local.documentNumber, imei: local.imei,
          creditNumber: credit.providerId, status: local.status, source: local.source,
          evidence: evidence(credit.raw),
        }, providerObservation);
        countReasons();
        continue;
      }
      if (terminal.has(local.status) && credit.estado === "EFECTIVO" &&
          (hasLocalTombstone(local) || !local.source.includes("API") || !credit.sourceUpdatedAt || !local.providerUpdatedAt || credit.sourceUpdatedAt <= local.providerUpdatedAt)) {
        await preserveLocal(); issues.add("LOCAL_TERMINAL_PRESERVED"); countReasons(); continue;
      }
      await saveCierreCredit(tx, {
        financial: credit.financiera, providerCreditId: credit.providerId, localKey: local.localKey,
        ventaId: local.ventaId, registroId: local.registroId, localReference: local.localReference,
        sedeId: local.sedeId, effectiveAt: credit.fechaEfectiva || local.effectiveAt,
        amount: credit.valor ?? local.amount, customerName: credit.cliente || local.customerName,
        documentNumber: credit.documento || local.documentNumber, creditNumber: credit.providerId,
        imei: credit.imei || local.imei, status: credit.estado, source: `CONECTAMOS + API ${credit.financiera}`,
        evidence: linkedEvidence(local, evidence(credit.raw) as CierreProviderCredit["raw"]), providerUpdatedAt: credit.sourceUpdatedAt || local.providerUpdatedAt,
      }, providerObservation);
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
        evidence: evidence(retainNegative ? existing.evidence as CierreProviderCredit["raw"] : credit.raw),
        providerUpdatedAt: retainNegative ? existing.providerUpdatedAt : credit.sourceUpdatedAt || existing?.providerUpdatedAt,
      }, providerObservation);
    }
    countReasons();
  }
  return { observed: credits.length, linked, pending, reasons };
}
