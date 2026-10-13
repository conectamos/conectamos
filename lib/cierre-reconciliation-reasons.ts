/** Public diagnostic codes only; no database, provider or side-effect imports. */
export const CIERRE_RECONCILIATION_REASONS = [
  "MISSING_PRINCIPAL", "MISSING_EFFECTIVE_DATE", "UNCONFIRMED_STATUS", "MISSING_IDENTITY",
  "IDENTITY_CONFLICT", "NO_LOCAL_MATCH", "AMBIGUOUS_LOCAL_MATCH", "AMBIGUOUS_PROVIDER_MATCH",
  "STALE_OBSERVATION", "LOCAL_TERMINAL_PRESERVED",
] as const;
export type CierreReconciliationReason = typeof CIERRE_RECONCILIATION_REASONS[number];
export type CierreReasonCounts = Partial<Record<CierreReconciliationReason, number>>;
