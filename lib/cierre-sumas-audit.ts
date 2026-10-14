import type { Prisma } from "@/app/generated/prisma/client";
import { CIERRE_RECONCILIATION_REASONS } from "@/lib/cierre-reconciliation-reasons";

type Observation = { providerCreditId: string | null; status: string; evidence: unknown };
type AuditCredit = Observation & {
  id: string; localKey: string | null; effectiveAt: Date | null; amount: unknown; source: string;
};
type Scope = { start: Date; end: Date };
type Metric = { units: number; amount: number; missingAmount: number };
const SOURCES = ["credits-by-client", "loan-detail"] as const;
const ledgerStates = ["EFECTIVO", "PENDIENTE", "ANULADO", "REVERSADO", "RECHAZADO", "VINCULADO"];
const empty = (): Metric => ({ units: 0, amount: 0, missingAmount: 0 });
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normal = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toUpperCase().replace(/[\s_-]+/g, " ");
function money(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const amount = Number(value);
  const rounded = Math.round(amount * 100) / 100;
  return Number.isFinite(amount) && rounded > 0 ? rounded : null;
}
function date(value: unknown) {
  if (typeof value !== "string") return null;
  const result = new Date(value);
  // snapshot() writes ISO UTC. Reject rolled-over dates or host-local parsing.
  return Number.isFinite(result.getTime()) && result.toISOString() === value ? result : null;
}
function add(metric: Metric, amount: number | null) {
  metric.units++;
  if (amount === null) metric.missingAmount++;
  else metric.amount = Math.round((metric.amount + amount) * 100) / 100;
}
function negative(state: string) {
  if (/\b(REVERSED|REVERSAL|REVERSO|REVERSADO|REVERSADA|REFUNDED|REFUND|REEMBOLSADO|REEMBOLSADA|DEVUELTO|DEVUELTA)\b/.test(state)) return "REVERSADO";
  if (/\b(VOID|VOIDED|CANCELLED|CANCELED|CANCELADO|CANCELADA|ANULADO|ANULADA)\b/.test(state)) return "ANULADO";
  if (/\b(REJECTED|DECLINED|DENIED|RECHAZADO|RECHAZADA|DENEGADO|DENEGADA)\b/.test(state)) return "RECHAZADO";
  return null;
}
function explicitEffective(state: string) {
  return /^(ACTIVE|ACTIVO|ACTIVA|AL DIA|MORA|EN MORA|DISBURSED|DESEMBOLSADO|DESEMBOLSADA|PAID IN FULL|PAGADO|PAGADA|SUCCESS|SUCCESSFUL|EXITOSA|EXITO|COMPLETED|COMPLETADO|COMPLETADA|FINALIZADO|FINALIZADA)$/.test(state);
}

function classify(raw: Record<string, unknown>) {
  const state = normal(raw.providerStatus);
  if (!SOURCES.some((source) => source === raw.source)) return { state: "DESCONOCIDO", proof: "NONE", reason: "UNSUPPORTED_SOURCE" };
  const terminal = negative(state);
  if (terminal) return { state: terminal, proof: "NONE", reason: "TERMINAL_PROVIDER_STATE" };
  const reasons = object(raw.diagnostics).reasons;
  // Historical SUMAS snapshot semantics are provider-specific: the normalizer
  // records no UNCONFIRMED_STATUS only after an explicit effective state OR a
  // parsed disbursement date. It does not accept loan_date + approval alone.
  // An unknown raw status with that retained proof therefore represents the
  // disbursement path; this rule must never be copied to eligibility adapters.
  if (!Array.isArray(reasons)) return { state: "PENDIENTE", proof: "NONE", reason: "MISSING_CLASSIFICATION_PROOF" };
  if (reasons.includes("UNCONFIRMED_STATUS")) return { state: "PENDIENTE", proof: "NONE", reason: "UNCONFIRMED_STATUS" };
  if (money(raw.principal) === null || reasons.includes("MISSING_PRINCIPAL")) return { state: "PENDIENTE", proof: "NONE", reason: "MISSING_PRINCIPAL" };
  if (!date(raw.effectiveDate) || reasons.includes("MISSING_EFFECTIVE_DATE")) return { state: "PENDIENTE", proof: "NONE", reason: "MISSING_EFFECTIVE_DATE" };
  return { state: "EFECTIVO", proof: explicitEffective(state) ? "EXPLICIT_EFFECTIVE_STATE" : "DERIVED_DISBURSEMENT", reason: null };
}

/** Only normalized SUMAS history/detail evidence can establish a remote loan.
 * The legacy ledger's amount/date and the existence of a local sale are never
 * substitutes for the provider's retained principal and effective date.
 */
export function getEffectiveSumasObservation(row: Observation): { amount: number; effectiveAt: Date } | null {
  if (!row.providerCreditId?.trim() || !["EFECTIVO", "PENDIENTE"].includes(row.status)) return null;
  const raw = object(row.evidence);
  if (raw.providerId !== row.providerCreditId || raw.localTombstone === true || classify(raw).state !== "EFECTIVO") return null;
  return { amount: money(raw.principal)!, effectiveAt: date(raw.effectiveDate)! };
}

export function isEffectiveSumasObservation(row: Observation) {
  return getEffectiveSumasObservation(row) !== null;
}

export function createCierreSumasAudit(scope?: Scope) {
  const totals = {
    ledgerEffective: empty(), localEffective: empty(), linkedEffective: empty(), localUnconfirmedEffective: empty(),
    apiObserved: empty(), apiEffectiveEvidence: empty(), apiReportable: empty(), apiUnlinked: empty(),
    apiUnlinkedEffectiveEvidence: empty(), apiUnlinkedReportable: empty(), excludedApiEffectiveEvidence: empty(),
  };
  const states = new Map<string, { ledgerState: string; source: string; apiState: string; units: number; amount: number; missingAmount: number }>();
  const reasons = new Map<string, Metric>();
  const exclusions = new Map<string, Metric>();
  const evidenceProof = { EXPLICIT_EFFECTIVE_STATE: empty(), DERIVED_DISBURSEMENT: empty() };
  const seen = new Set<string>();
  let duplicateProviderRows = 0;
  const inScope = (value: Date | null) => !scope || Boolean(value && value >= scope.start && value < scope.end);
  return {
    add(row: AuditCredit) {
      const raw = object(row.evidence);
      const api = Boolean(row.providerCreditId && (row.source.includes("API") || SOURCES.some((source) => source === raw.source)));
      const apiDate = date(raw.effectiveDate);
      const localInScope = inScope(row.effectiveAt);
      const apiInScope = api && inScope(apiDate || row.effectiveAt);
      if (!localInScope && !apiInScope) return;
      if (api && seen.has(row.providerCreditId!)) { duplicateProviderRows++; return; }
      if (api) seen.add(row.providerCreditId!);
      const localAmount = money(row.amount);
      const apiAmount = money(raw.principal);
      const classification = classify(raw);
      const ledgerState = ledgerStates.includes(row.status) ? row.status : "OTRO";
      const source = api ? row.localKey ? "API_VINCULADA" : "API_SIN_VINCULO" : "LOCAL";
      const rawState = api ? classification.state : "SIN_EVIDENCIA_API";
      const groupKey = `${ledgerState}:${source}:${rawState}`;
      const group = states.get(groupKey) || { ledgerState, source, apiState: rawState, ...empty() };
      add(group, apiInScope ? apiAmount : localAmount); states.set(groupKey, group);
      const reportable = getEffectiveSumasObservation(row);
      if (localInScope && row.status === "EFECTIVO" && localAmount !== null) {
        add(totals.ledgerEffective, localAmount);
        if (row.localKey) {
          add(totals.localEffective, localAmount);
          add(reportable ? totals.linkedEffective : totals.localUnconfirmedEffective, localAmount);
        }
      }
      if (!apiInScope) return;
      add(totals.apiObserved, apiAmount);
      if (reportable) add(totals.apiReportable, reportable.amount);
      if (classification.state === "EFECTIVO") {
        add(totals.apiEffectiveEvidence, apiAmount);
        add(evidenceProof[classification.proof as keyof typeof evidenceProof], apiAmount);
        if (!reportable) add(totals.excludedApiEffectiveEvidence, apiAmount);
      }
      if (!reportable) {
        const reason = raw.localTombstone === true || !["EFECTIVO", "PENDIENTE"].includes(row.status) ? "LOCAL_TERMINAL_PRESERVED"
          : raw.providerId !== row.providerCreditId ? "PROVIDER_ID_CONFLICT" : classification.reason || "UNCONFIRMED_STATUS";
        const metric = exclusions.get(reason) || empty(); add(metric, apiAmount); exclusions.set(reason, metric);
      }
      if (!row.localKey) {
        add(totals.apiUnlinked, apiAmount);
        if (classification.state === "EFECTIVO") add(totals.apiUnlinkedEffectiveEvidence, apiAmount);
        if (reportable) add(totals.apiUnlinkedReportable, reportable.amount);
        const rawReasons = object(raw.cierreDiagnostics).reasons;
        const classified = Array.isArray(rawReasons) ? CIERRE_RECONCILIATION_REASONS.filter((reason) => rawReasons.includes(reason)) : [];
        for (const reason of classified.length ? classified : ["SIN_MOTIVO_REGISTRADO"]) {
          const metric = reasons.get(reason) || empty(); add(metric, apiAmount); reasons.set(reason, metric);
        }
      }
    },
    result() {
      const asRows = (map: Map<string, Metric>) => [...map].sort(([a], [b]) => a.localeCompare(b)).map(([reason, metric]) => ({ reason, ...metric }));
      return { complete: false, totals, duplicateProviderRows, evidenceProof,
        byStateSource: [...states.values()].sort((a, b) => `${a.source}:${a.ledgerState}:${a.apiState}`.localeCompare(`${b.source}:${b.ledgerState}:${b.apiState}`)),
        unlinkedReasons: asRows(reasons), excludedReasons: asRows(exclusions),
      };
    },
  };
}

/** Administrative aggregate only. No remote I/O, identifiers or payload logs. */
export async function readCierreSumasAudit(tx: Prisma.TransactionClient, scope: Scope) {
  const audit = createCierreSumasAudit(scope);
  let cursor: string | null = null;
  for (;;) {
    const rows: AuditCredit[] = await tx.cierreCredito.findMany({
      where: { financial: "SUMASPAY", OR: [{ providerCreditId: { not: null } }, { effectiveAt: { gte: scope.start, lt: scope.end } }],
        ...(cursor === null ? {} : { id: { gt: cursor } }) },
      orderBy: { id: "asc" }, take: 500,
      select: { id: true, providerCreditId: true, localKey: true, effectiveAt: true, amount: true, status: true, source: true, evidence: true },
    });
    for (const row of rows) audit.add(row);
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  return audit.result();
}
