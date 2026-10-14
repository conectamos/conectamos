import type { Prisma } from "@/app/generated/prisma/client";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { CIERRE_RECONCILIATION_REASONS } from "@/lib/cierre-reconciliation-reasons";
import { hasCierreProviderObservation, readCierreProviderObservation } from "@/lib/cierre-provider-evidence";

type AuditCredit = {
  id: string; providerCreditId: string | null; localKey: string | null;
  effectiveAt: Date | null; amount: unknown; status: string; source: string; evidence: unknown;
};
type Metric = { units: number; amount: number; missingAmount: number };
type Scope = { start: Date; end: Date };
const empty = (): Metric => ({ units: 0, amount: 0, missingAmount: 0 });
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function money(value: unknown) {
  if (value === null || value === undefined || typeof value === "boolean" || Array.isArray(value) || String(value).trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? Math.round(result * 100) / 100 : null;
}
function add(metric: Metric, amount: number | null) {
  metric.units++;
  if (amount === null) metric.missingAmount++;
  else metric.amount = Math.round((metric.amount + amount) * 100) / 100;
}
const ledgerStates = ["EFECTIVO", "PENDIENTE", "ANULADO", "REVERSADO", "RECHAZADO", "VINCULADO"];

/** Classify retained adapter evidence, never the pending state used for linking.
 * No remote payload or merchant/customer identifier is returned by this audit.
 */
function evidenceState(raw: Record<string, unknown>) {
  if (raw.source !== "list-transactions") return "DESCONOCIDO";
  const state = String(raw.providerStatus || "").trim().toUpperCase().replace(/[_-]/g, " ");
  if (/\b(REVERSED|REVERSAL|REVERSO|REVERSADO|REVERSADA|REFUNDED|REFUND|REEMBOLSADO|REEMBOLSADA|DEVUELTO|DEVUELTA)\b/.test(state)) return "REVERSADO";
  if (/\b(VOID|VOIDED|CANCELLED|CANCELED|CANCELADO|CANCELADA|ANULADO|ANULADA)\b/.test(state)) return "ANULADO";
  if (/\b(REJECTED|DECLINED|DENIED|RECHAZADO|RECHAZADA|DENEGADO|DENEGADA)\b/.test(state)) return "RECHAZADO";
  const diagnostics = object(raw.diagnostics);
  const reasons = Array.isArray(diagnostics.reasons) ? diagnostics.reasons : null;
  // The persisted adapter contract records an effectiveDate only for finance
  // events. Missing/legacy evidence remains unknown rather than manufacturing
  // a confirmed API amount from the fallback local sale.
  if (reasons === null || reasons.includes("UNCONFIRMED_STATUS") || /^(PENDING|PROCESSING|PENDIENTE|EN PROCESO)$/.test(state)) return "PENDIENTE";
  if (raw.currency !== "COP" || money(raw.principal) === null || typeof raw.effectiveDate !== "string" || !Number.isFinite(Date.parse(raw.effectiveDate))) return "PENDIENTE";
  return "EFECTIVO";
}

export function getEffectivePayJoyObservation(row: { providerCreditId: string | null; status: string; evidence: unknown }): { amount: number; effectiveAt: Date } | null {
  if (row.status === "VINCULADO") return null;
  if (hasCierreProviderObservation(row.evidence)) {
    const observation = readCierreProviderObservation(row.evidence, "PAYJOY", row.providerCreditId);
    if (!observation || observation.state !== "EFECTIVO") return null;
    return getEffectivePayJoyObservation({ providerCreditId: observation.providerId, status: "EFECTIVO", evidence: observation.raw });
  }
  if (!row.providerCreditId?.trim() || !["EFECTIVO", "PENDIENTE"].includes(row.status)) return null;
  const raw = object(row.evidence);
  if (raw.providerId != null && String(raw.providerId) !== row.providerCreditId) return null;
  if (raw.localTombstone === true || evidenceState(raw) !== "EFECTIVO") return null;
  return { amount: money(raw.principal)!, effectiveAt: new Date(String(raw.effectiveDate)) };
}

export function isEffectivePayJoyObservation(row: Parameters<typeof getEffectivePayJoyObservation>[0]) {
  return getEffectivePayJoyObservation(row) !== null;
}

export function createCierrePayJoyAudit(scope?: Scope) {
  const totals = {
    ledgerEffective: empty(), localEffective: empty(), linkedEffective: empty(), localUnconfirmedEffective: empty(),
    apiObserved: empty(), apiEffectiveEvidence: empty(), apiReportable: empty(), apiUnlinked: empty(), apiUnlinkedEffectiveEvidence: empty(), excludedApiEffectiveEvidence: empty(),
  };
  const days = new Map<string, { date: string; ledgerEffective: Metric; apiEffectiveEvidence: Metric; apiUnlinked: Metric }>();
  const states = new Map<string, { ledgerState: string; source: string; apiState: string; units: number; amount: number; missingAmount: number }>();
  const reasons = new Map<string, Metric>();
  const seen = new Set<string>();
  const unlinkedMerchants = { withId: 0, withoutId: 0 };
  let duplicateProviderRows = 0;
  const inScope = (value: Date | null) => !scope || Boolean(value && value >= scope.start && value < scope.end);
  const dayFor = (value: Date | null) => {
    const date = value && Number.isFinite(value.getTime()) ? getDateKeyInColombia(value) : "SIN_FECHA";
    const day = days.get(date) || { date, ledgerEffective: empty(), apiEffectiveEvidence: empty(), apiUnlinked: empty() };
    days.set(date, day);
    return day;
  };
  return {
    add(row: AuditCredit) {
      const retained = readCierreProviderObservation(row.evidence, "PAYJOY", row.providerCreditId);
      const raw = retained ? retained.raw : object(row.evidence);
      const api = Boolean(row.providerCreditId && (row.source.includes("API") || raw.source === "list-transactions"));
      const apiDate = typeof raw.effectiveDate === "string" && Number.isFinite(Date.parse(raw.effectiveDate))
        ? new Date(raw.effectiveDate) : row.effectiveAt;
      const localInScope = inScope(row.effectiveAt);
      const apiInScope = api && inScope(apiDate);
      if (!localInScope && !apiInScope) return;
      if (api && seen.has(row.providerCreditId!)) { duplicateProviderRows++; return; }
      if (api) seen.add(row.providerCreditId!);
      const amount = money(row.amount);
      const apiAmount = money(raw.principal) ?? (row.source.includes("API") ? amount : null);
      const rawState = api ? evidenceState(raw) : "SIN_EVIDENCIA_API";
      const ledgerState = ledgerStates.includes(row.status) ? row.status : "OTRO";
      const source = api ? row.localKey ? "API_VINCULADA" : "API_SIN_VINCULO" : "LOCAL";
      const groupKey = `${ledgerState}:${source}:${rawState}`;
      const group = states.get(groupKey) || { ledgerState, source, apiState: rawState, ...empty() };
      add(group, apiInScope ? apiAmount : amount); states.set(groupKey, group);
      if (localInScope && row.status === "EFECTIVO" && amount !== null) {
        add(totals.ledgerEffective, amount); add(dayFor(row.effectiveAt).ledgerEffective, amount);
        if (row.localKey) {
          add(totals.localEffective, amount);
          add(row.source.includes("API") && row.providerCreditId ? totals.linkedEffective : totals.localUnconfirmedEffective, amount);
        }
      }
      if (!apiInScope) return;
      const apiDay = dayFor(apiDate);
      add(totals.apiObserved, apiAmount);
      const reportable = getEffectivePayJoyObservation(row);
      if (reportable) add(totals.apiReportable, reportable.amount);
      if (rawState === "EFECTIVO") {
        add(totals.apiEffectiveEvidence, money(raw.principal)); add(apiDay.apiEffectiveEvidence, money(raw.principal));
        if (row.status !== "EFECTIVO") add(totals.excludedApiEffectiveEvidence, money(raw.principal));
      }
      if (!row.localKey) {
        add(totals.apiUnlinked, apiAmount); add(apiDay.apiUnlinked, apiAmount);
        if (rawState === "EFECTIVO") add(totals.apiUnlinkedEffectiveEvidence, money(raw.principal));
        if (typeof raw.providerMerchantId === "string" && raw.providerMerchantId.trim()) unlinkedMerchants.withId++;
        else unlinkedMerchants.withoutId++;
        const rawReasons = object(object(row.evidence).cierreDiagnostics).reasons;
        const classifiedReasons = Array.isArray(rawReasons) ? CIERRE_RECONCILIATION_REASONS.filter((reason) => rawReasons.includes(reason)) : [];
        for (const reason of classifiedReasons.length ? classifiedReasons : ["SIN_MOTIVO_REGISTRADO"]) {
          const metric = reasons.get(reason) || empty(); add(metric, apiAmount); reasons.set(reason, metric);
        }
      }
    },
    result() {
      return { complete: false, totals, duplicateProviderRows, unlinkedMerchants,
        byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
        byStateSource: [...states.values()].sort((a, b) => `${a.source}:${a.ledgerState}:${a.apiState}`.localeCompare(`${b.source}:${b.ledgerState}:${b.apiState}`)),
        unlinkedReasons: [...reasons].sort(([a], [b]) => a.localeCompare(b)).map(([reason, metric]) => ({ reason, ...metric })),
      };
    },
  };
}

/** Global administrative log only; no report route calls this or external APIs. */
export async function readCierrePayJoyAudit(tx: Prisma.TransactionClient, scope: Scope) {
  const audit = createCierrePayJoyAudit(scope);
  let cursor: string | null = null;
  for (;;) {
    const rows: AuditCredit[] = await tx.cierreCredito.findMany({
      where: { financial: "PAYJOY", OR: [{ providerCreditId: { not: null } }, { effectiveAt: { gte: scope.start, lt: scope.end } }],
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
