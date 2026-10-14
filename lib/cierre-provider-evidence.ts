/** Provider financial facts are independent from local sale lifecycle markers. */
export type CierreProviderObservation = {
  version: 1;
  financial: string;
  providerId: string;
  state: "EFECTIVO" | "PENDIENTE" | "ANULADO" | "REVERSADO" | "RECHAZADO";
  amount: number | null;
  effectiveAt: string | null;
  sourceUpdatedAt: string | null;
  raw: Record<string, unknown>;
};
export const providerTerminal = (state: string) => ["ANULADO", "REVERSADO", "RECHAZADO"].includes(state);
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const iso = (value: Date | null | undefined) => value && Number.isFinite(value.getTime()) ? value.toISOString() : null;

/** SUMASPAY explicitly uses this exact Spanish status for a fully paid loan.
 * Recover the old ANULADO classification only from its original financial
 * evidence, never from a local sale, an approval or an English cancellation.
 */
export function getSumasPaidCancellationFact(evidence: unknown, providerId: string | null): { amount: number; effectiveAt: Date } | null {
  const raw = object(evidence);
  if (!providerId || raw.providerId !== providerId || String(raw.providerStatus ?? "").trim().toUpperCase() !== "CANCELADO" ||
      !["credits-by-client", "loan-detail"].includes(String(raw.source))) return null;
  const principal = typeof raw.principal === "number" || typeof raw.principal === "string" ? Number(raw.principal) : NaN;
  const amount = Math.round(principal * 100) / 100;
  const effectiveAt = typeof raw.effectiveDate === "string" ? new Date(raw.effectiveDate) : null;
  const reasons = object(raw.diagnostics).reasons;
  if (!Number.isFinite(amount) || amount <= 0 || !effectiveAt || !Number.isFinite(effectiveAt.getTime()) ||
      effectiveAt.toISOString() !== raw.effectiveDate || !Array.isArray(reasons) ||
      reasons.some((reason) => ["UNCONFIRMED_STATUS", "MISSING_PRINCIPAL", "MISSING_EFFECTIVE_DATE"].includes(String(reason)))) return null;
  return { amount, effectiveAt };
}

function correctSumasPaidState(value: CierreProviderObservation): CierreProviderObservation {
  if (value.financial !== "SUMASPAY" || value.state !== "ANULADO") return value;
  const paid = getSumasPaidCancellationFact(value.raw, value.providerId);
  return paid ? { ...value, state: "EFECTIVO", amount: paid.amount, effectiveAt: paid.effectiveAt.toISOString() } : value;
}

export function hasCierreProviderObservation(evidence: unknown) {
  return Object.hasOwn(object(evidence), "providerObservation");
}

export function readCierreProviderObservation(evidence: unknown, financial: string, providerId: string | null): CierreProviderObservation | null {
  const value = object(object(evidence).providerObservation);
  if (value.version !== 1 || value.financial !== financial || !providerId || value.providerId !== providerId ||
      !["EFECTIVO", "PENDIENTE", "ANULADO", "REVERSADO", "RECHAZADO"].includes(String(value.state)) ||
      !value.raw || typeof value.raw !== "object" || Array.isArray(value.raw) || Object.hasOwn(value.raw, "providerObservation")) return null;
  const raw = object(value.raw);
  if (raw.providerId != null && raw.providerId !== providerId) return null;
  return correctSumasPaidState(value as CierreProviderObservation);
}

export function makeCierreProviderObservation(input: {
  financial: string; providerId: string; state: CierreProviderObservation["state"];
  amount: number | null; effectiveAt: Date | null; sourceUpdatedAt?: Date | null; raw: unknown;
}): CierreProviderObservation {
  const raw = { ...object(input.raw) };
  // Local reconciliation markers and prior envelopes are never provider facts.
  for (const key of ["providerObservation", "localTombstone", "localStatus", "reason", "cierreDiagnostics"]) delete raw[key];
  return correctSumasPaidState({ version: 1, financial: input.financial, providerId: input.providerId, state: input.state,
    amount: input.amount, effectiveAt: iso(input.effectiveAt), sourceUpdatedAt: iso(input.sourceUpdatedAt), raw });
}

/** Unknown or historical reads cannot erase a fact. A negative state can only
 * change with complete effective evidence and a strictly later provider time.
 */
export function mergeCierreProviderObservations(previous: CierreProviderObservation | null, incoming: CierreProviderObservation | null) {
  if (previous) previous = correctSumasPaidState(previous);
  if (incoming) incoming = correctSumasPaidState(incoming);
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (previous.financial !== incoming.financial || previous.providerId !== incoming.providerId) return previous;
  const oldDate = previous.sourceUpdatedAt ? Date.parse(previous.sourceUpdatedAt) : NaN;
  const newDate = incoming.sourceUpdatedAt ? Date.parse(incoming.sourceUpdatedAt) : NaN;
  if (Number.isFinite(oldDate) && Number.isFinite(newDate) && newDate < oldDate) return previous;
  if (providerTerminal(previous.state) && !providerTerminal(incoming.state) &&
      !(incoming.state === "EFECTIVO" && hasFinancialFields(incoming) &&
        Number.isFinite(oldDate) && Number.isFinite(newDate) && newDate > oldDate)) return previous;
  if (incoming.state === "PENDIENTE" && previous.state !== "PENDIENTE") return previous;
  // An incomplete read must not erase the last complete financial fact. This
  // only retains provider evidence; local amount/date never fill this envelope.
  if (previous.state === "EFECTIVO" && incoming.state === "EFECTIVO" &&
      hasFinancialFields(previous) && !hasFinancialFields(incoming)) return previous;
  if (providerTerminal(previous.state) && providerTerminal(incoming.state) &&
      (!Number.isFinite(newDate) || (Number.isFinite(oldDate) && newDate === oldDate))) return previous;
  return { ...incoming, amount: incoming.amount ?? previous.amount, effectiveAt: incoming.effectiveAt ?? previous.effectiveAt };
}

function hasFinancialFields(value: CierreProviderObservation) {
  const raw = value.raw;
  const reasons = object(raw.diagnostics).reasons;
  const principal = typeof raw.principal === "number" || typeof raw.principal === "string" ? Number(raw.principal) : NaN;
  const allowedSource = value.financial === "PAYJOY" ? raw.source === "list-transactions" && raw.currency === "COP"
    : value.financial === "SUMASPAY" ? ["credits-by-client", "loan-detail"].includes(String(raw.source)) : true;
  return allowedSource && value.amount !== null && value.amount > 0 && Boolean(value.effectiveAt) &&
    Number.isFinite(principal) && principal > 0 && typeof raw.effectiveDate === "string" && Number.isFinite(Date.parse(raw.effectiveDate)) &&
    Array.isArray(reasons) && !reasons.some((reason) => ["UNCONFIRMED_STATUS", "MISSING_PRINCIPAL", "MISSING_EFFECTIVE_DATE"].includes(String(reason)));
}

export function withCierreProviderObservation(evidence: unknown, observation: CierreProviderObservation | null) {
  const result = { ...object(evidence) };
  // Only the trusted observation argument can replace this envelope.
  delete result.providerObservation;
  if (observation) result.providerObservation = observation;
  return result;
}

export function negativeCierreProviderState(value: unknown, financial?: string): CierreProviderObservation["state"] | null {
  const state = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
  if (financial === "SUMASPAY" && state === "CANCELADO") return null;
  if (/\b(REVERSED|REVERSAL|REVERSO|REVERSADO|REVERSADA|REFUNDED|REFUND|REEMBOLSADO|REEMBOLSADA|DEVUELTO|DEVUELTA)\b/.test(state)) return "REVERSADO";
  if (/\b(VOID|VOIDED|CANCELLED|CANCELED|CANCELADO|CANCELADA|ANULADO|ANULADA)\b/.test(state)) return "ANULADO";
  if (/\b(REJECTED|DECLINED|DENIED|RECHAZADO|RECHAZADA|DENEGADO|DENEGADA)\b/.test(state)) return "RECHAZADO";
  return null;
}
