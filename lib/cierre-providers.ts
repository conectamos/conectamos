/**
 * Read-only provider adapters for the durable CIERRE worker.
 * Importing this module never performs I/O. Report and export handlers must only
 * read the local ledger; they must not call consultarLoteProveedorCierre.
 */
import { CIERRE_RECONCILIATION_REASONS, type CierreReconciliationReason, type CierreReasonCounts } from "@/lib/cierre-reconciliation-reasons";
export { CIERRE_RECONCILIATION_REASONS } from "@/lib/cierre-reconciliation-reasons";
export type { CierreReconciliationReason, CierreReasonCounts } from "@/lib/cierre-reconciliation-reasons";
export type CierreProvider = "SUMASPAY" | "PAYJOY" | "ADDI" | "SISTECREDITO" | "ALO CREDIT" | "FINSERPAY";
export type CierreProviderState = "EFECTIVO" | "ANULADO" | "REVERSADO" | "RECHAZADO" | "PENDIENTE";
export type CierreJson = null | string | number | boolean | CierreJson[] | { [key: string]: CierreJson };
export const CIERRE_ADDI_DIAGNOSTIC_FIELDS = [
  "creditAmount", "loanAmount", "capital", "price", "amount", "approvedAmount",
  "transactionDate", "createdAt", "created_at", "updatedAt", "status", "state", "transactionStatus", "paymentStatus", "estado",
] as const;
const DIAGNOSTIC_TYPES = ["absent", "null", "string", "number", "boolean", "object", "array"] as const;
const DIAGNOSTIC_STATUSES = ["APPROVED", "SUCCESS", "SUCCESSFUL", "COMPLETED", "DISBURSED", "ACTIVE", "PAID IN FULL",
  "REJECTED", "DECLINED", "DENIED", "CANCELLED", "CANCELED", "CANCELADO", "CANCELADA", "ANULADO", "ANULADA",
  "REVERSED", "REVERSAL", "REVERSO", "REVERSADO", "REVERSADA", "REFUNDED", "PENDING", "PROCESSING", "UNKNOWN"] as const;
type DiagnosticField = typeof CIERRE_ADDI_DIAGNOSTIC_FIELDS[number];
type DiagnosticType = typeof DIAGNOSTIC_TYPES[number];
type DiagnosticStatus = typeof DIAGNOSTIC_STATUSES[number];
export type CierreProviderDiagnostics = {
  provider: "ADDI";
  observations: number;
  fieldTypes: Partial<Record<DiagnosticField, Partial<Record<DiagnosticType, number>>>>;
  statuses: Partial<Record<DiagnosticStatus, number>>;
  reasons: CierreReasonCounts;
};

export type CierreProviderCredit = {
  financiera: CierreProvider;
  providerId: string;
  fechaEfectiva: Date | null;
  valor: number | null;
  estado: CierreProviderState;
  cliente: string | null;
  documento: string;
  imei?: string;
  sedeId?: number;
  fuente: string;
  sourceUpdatedAt?: Date;
  providerMerchantId?: string;
  providerMerchantName?: string;
  raw: CierreJson;
};

export type CierreProviderReference = {
  documento?: string;
  imei?: string;
  providerId?: string;
  localKey?: string;
  sedeId?: number;
  effectiveDate?: string;
  amount?: number;
};

export type CierreProviderRequest = {
  financiera: CierreProvider;
  fechaDesde: string;
  fechaHasta: string;
  referencias: CierreProviderReference[];
};

export type CierreProviderBatch = {
  credits: CierreProviderCredit[];
  complete: boolean;
  limitation?: string;
  outcome: "OBSERVED" | "EMPTY" | "UNSUPPORTED_RESPONSE" | "NOT_CONFIGURED" | "MISSING_REFERENCE" | "LOCAL_ONLY";
  pendingCredits?: number;
  diagnostics?: CierreProviderDiagnostics;
};

/** Safe machine-readable errors; never returns a provider message or request URL. */
export function classifyCierreProviderError(error: unknown, now = Date.now()): {
  code: "RATE_LIMIT" | "AUTH" | "UNAVAILABLE" | "INVALID_RESPONSE" | "CONFIG" | "UNKNOWN";
  retryAfterMs?: number;
} {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = Number(value.status);
  const header = typeof value.retryAfter === "string" ? value.retryAfter.trim() : "";
  let retryAfterMs: number | undefined;
  if (header) {
    const duration = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
    if (Number.isFinite(duration) && duration >= 0) retryAfterMs = Math.ceil(duration);
  }
  if (status === 429) return { code: "RATE_LIMIT", retryAfterMs: Math.max(60_000, retryAfterMs ?? 0) };
  if (status === 401 || status === 403) return { code: "AUTH" };
  if (status >= 500 || status === 408 || ["TimeoutError", "AbortError", "TypeError"].includes(String(value.name))) {
    return { code: "UNAVAILABLE", ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
  }
  if (value.code === "INVALID_RESPONSE") return { code: "INVALID_RESPONSE" };
  if (String(value.name).endsWith("ConfigError")) return { code: "CONFIG" };
  return { code: "UNKNOWN" };
}

type SourcePayload = { source: string; data: unknown; loanId?: string };
export type CierreProviderReaders = {
  configured: (provider: CierreProvider) => boolean | Promise<boolean>;
  sumas: (documento: string, providerId?: string) => Promise<SourcePayload[]>;
  payjoy: (imei: string, desde: Date, hasta: Date) => Promise<unknown>;
  addi: (documento: string, desde: string, hasta: string) => Promise<SourcePayload[]>;
  payjoyPeriod?: (desde: Date, hasta: Date) => Promise<unknown>;
};

export const CIERRE_PROVIDER_CAPABILITIES: Record<CierreProvider, {
  source: "API_Y_LOCAL" | "LOCAL";
  history: string;
  limitation: string;
}> = {
  SUMASPAY: {
    source: "API_Y_LOCAL",
    history: "Historial de las cédulas conocidas que devuelva credits-by-client/all; sin fecha mínima garantizada.",
    limitation: "Consulta por cédula o crédito; sólo capital, estado y fecha efectivos verificables. No acredita cobertura global ni créditos ajenos a las referencias locales.",
  },
  PAYJOY: {
    source: "API_Y_LOCAL",
    history: "Listado de transacciones por día de la cuenta, además de consulta por IMEI; sin fecha mínima de retención garantizada.",
    limitation: "Listado diario de cuenta documentado; sólo finance con ID y financeAmount. Sin garantía publicada de paginación, retención o representación completa de reversos; los comercios requieren vinculación de sede.",
  },
  ADDI: {
    source: "API_Y_LOCAL",
    history: "Transacciones por cédula y rango; máximo 5000 resultados por endpoint en el contrato existente.",
    limitation: "APPROVED y createdAt no demuestran desembolso ni fecha de finalización. Sin capital, transactionDate y estado efectivo explícitos se conserva la venta local confirmada; no se garantiza paginación ni cobertura global.",
  },
  SISTECREDITO: {
    source: "LOCAL",
    history: "Ventas confirmadas conservadas en CONECTAMOS.",
    limitation: "No existe un cliente ni endpoint de créditos SISTECREDITO implementado en este repositorio.",
  },
  "ALO CREDIT": {
    source: "LOCAL",
    history: "Ventas confirmadas conservadas en CONECTAMOS.",
    limitation: "El conector actual lee un reporte semanal y acepta ventas recientes; no expone identificador estable ni estado del crédito para conciliar históricos y reversos.",
  },
  FINSERPAY: {
    source: "LOCAL",
    history: "Ventas confirmadas conservadas en CONECTAMOS.",
    limitation: "La consulta por IMEI actual no expone identificador ni estado fiable y limita fechas a hoy/ayer; sus importes alternativos no prueban capital desembolsado.",
  },
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return String(value).trim() || null;
}

function normal(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase().replace(/[\s_-]+/g, " ");
}

function digits(value: unknown) { return String(value ?? "").replace(/\D/g, ""); }

function direct(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  return null;
}

// Never cross an array boundary and accidentally take another loan's capital,
// status or date from the same customer response.
function field(row: Record<string, unknown>, keys: string[], depth = 0): unknown {
  const value = direct(row, keys);
  if (value !== null) return value;
  if (depth >= 3) return null;
  for (const child of Object.values(row)) {
    if (!record(child)) continue;
    const found = field(child, keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function objects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 7) return [];
  if (Array.isArray(value)) return value.flatMap((child) => objects(child, depth + 1));
  if (!record(value)) return [];
  return [value, ...Object.values(value).flatMap((child) => objects(child, depth + 1))];
}

function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let cleaned = value.replace(/[$\s]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) cleaned = cleaned.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return amount(Number(cleaned));
}

export function parseCierreProviderDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value) : null;
  if (Array.isArray(value) && value.length >= 3) {
    return parseCierreProviderDate(`${value[0]}-${String(value[1]).padStart(2, "0")}-${String(value[2]).padStart(2, "0")}`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const result = new Date(value < 100_000_000_000 ? value * 1000 : value);
    return Number.isFinite(result.getTime()) ? result : null;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(raw);
  if (!match) return null;
  const check = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  const rest = match[4];
  // Bare dates and local provider timestamps are Colombia time, never host time.
  const normalized = !rest ? `${raw}T00:00:00-05:00`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rest) ? raw
    : `${raw.replace(" ", "T")}-05:00`;
  const result = new Date(normalized);
  return Number.isFinite(result.getTime()) ? result : null;
}

function statusText(row: Record<string, unknown>) {
  // A nested customer/account status is not the status of this credit.
  const raw = direct(row, ["status", "state", "estado", "transactionStatus", "paymentStatus"]);
  if (record(raw)) return text(direct(raw, ["value", "name", "code"])) ?? "";
  return text(raw) ?? "";
}

function negativeState(value: unknown): CierreProviderState | null {
  const state = normal(value);
  if (/\b(REVERSED|REVERSAL|REVERSO|REVERSADO|REVERSADA|REFUNDED|REFUND|REEMBOLSADO|REEMBOLSADA|DEVUELTO|DEVUELTA)\b/.test(state)) return "REVERSADO";
  if (/\b(VOID|VOIDED|CANCELLED|CANCELED|CANCELADO|CANCELADA|ANULADO|ANULADA)\b/.test(state)) return "ANULADO";
  if (/\b(REJECTED|DECLINED|DENIED|RECHAZADO|RECHAZADA|DENEGADO|DENEGADA)\b/.test(state)) return "RECHAZADO";
  return null;
}

function explicitEffectiveState(value: unknown) {
  return /^(ACTIVE|ACTIVO|ACTIVA|AL DIA|MORA|EN MORA|DISBURSED|DESEMBOLSADO|DESEMBOLSADA|PAID IN FULL|PAGADO|PAGADA|SUCCESS|SUCCESSFUL|EXITOSA|EXITO|COMPLETED|COMPLETADO|COMPLETADA|FINALIZADO|FINALIZADA)$/.test(normal(value));
}

function client(row: Record<string, unknown>) {
  return text(field(row, ["clientName", "clientFullName", "customerName", "customerFullName", "fullName", "nombreCliente", "nombreCompleto", "clienteNombre"]));
}

function document(row: Record<string, unknown>) {
  return digits(field(row, ["documentNumber", "documento", "cedula", "identification", "identificationNumber", "idNumber", "clientDocumentNumber", "customerDocumentNumber"]));
}

function storeName(row: Record<string, unknown>) {
  return text(field(row, ["storeName", "store_name", "puntoCredito", "point_sale_name", "point_credit_name", "pointCreditName", "allyName", "merchantName"]));
}

function isForeignStore(row: Record<string, unknown>) {
  const store = storeName(row);
  return Boolean(store && !normal(store).includes("CONECTAMOS"));
}

function snapshot(
  financiera: CierreProvider,
  providerId: string,
  row: Record<string, unknown>,
  source: string,
  valor: number | null,
  fechaEfectiva: Date | null,
  estado: CierreProviderState,
  reference: CierreProviderReference,
  status: string,
): CierreProviderCredit {
  const sourceUpdatedAt = parseCierreProviderDate(field(row, ["updatedAt", "updated_at"]));
  return {
    financiera, providerId, valor, fechaEfectiva,
    estado: estado === "EFECTIVO" && (!valor || !fechaEfectiva) ? "PENDIENTE" : estado,
    cliente: client(row), documento: document(row) || digits(reference.documento),
    fuente: `API ${financiera} · ${source}`,
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    // Only fields needed to audit the classification. Do not persist auth,
    // contact details, unrelated clients, account limits or the full payload.
    raw: { source, providerId, providerStatus: status, principal: valor,
      effectiveDate: fechaEfectiva?.toISOString() ?? null, storeName: storeName(row), diagnostics: { reasons: [
        ...(valor === null ? ["MISSING_PRINCIPAL"] : []), ...(!fechaEfectiva ? ["MISSING_EFFECTIVE_DATE"] : []),
        ...(estado === "PENDIENTE" ? ["UNCONFIRMED_STATUS"] : []),
      ] } },
  };
}

function dedupe(credits: CierreProviderCredit[]) {
  const found = new Map<string, CierreProviderCredit>();
  const rank = (state: CierreProviderState) => ({ PENDIENTE: 0, EFECTIVO: 1, RECHAZADO: 2, ANULADO: 3, REVERSADO: 4 })[state];
  for (const next of credits) {
    const key = `${next.financiera}:${next.providerId}`;
    const old = found.get(key);
    if (!old) { found.set(key, next); continue; }
    const bothDated = old.sourceUpdatedAt && next.sourceUpdatedAt;
    const newer = bothDated ? next.sourceUpdatedAt!.getTime() - old.sourceUpdatedAt!.getTime() : 0;
    if (newer > 0 || (newer === 0 && rank(next.estado) >= rank(old.estado))) {
      found.set(key, { ...next, valor: next.valor ?? old.valor, fechaEfectiva: next.fechaEfectiva ?? old.fechaEfectiva });
    } else {
      found.set(key, { ...old, valor: old.valor ?? next.valor, fechaEfectiva: old.fechaEfectiva ?? next.fechaEfectiva });
    }
  }
  return [...found.values()];
}

function diagnosticFieldType(row: Record<string, unknown>, key: DiagnosticField, depth = 0): DiagnosticType {
  if (Object.hasOwn(row, key) && row[key] !== undefined) {
    const value = row[key];
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    const type = typeof value;
    return type === "string" || type === "number" || type === "boolean" || type === "object" ? type : "absent";
  }
  // Only principal candidates use the same bounded nested lookup as normalization.
  if (depth < 3 && ["creditAmount", "loanAmount", "capital", "price", "amount", "approvedAmount"].includes(key)) {
    for (const value of Object.values(row)) {
      if (!record(value)) continue;
      const type = diagnosticFieldType(value, key, depth + 1);
      if (type !== "absent") return type;
    }
  }
  return "absent";
}

/** Aggregated allowlisted metadata; never returns identifiers, values or free text. */
export function summarizeCierreProviderDiagnostics(credits: CierreProviderCredit[]): CierreProviderDiagnostics {
  const result: CierreProviderDiagnostics = { provider: "ADDI", observations: 0, fieldTypes: {}, statuses: {}, reasons: {} };
  for (const credit of credits) {
    if (credit.financiera !== "ADDI") continue;
    result.observations++;
    const diagnostics = record(credit.raw) && record(credit.raw.diagnostics) ? credit.raw.diagnostics : {};
    const fields = record(diagnostics.fieldTypes) ? diagnostics.fieldTypes : {};
    for (const field of CIERRE_ADDI_DIAGNOSTIC_FIELDS) {
      const type = fields[field];
      if (!DIAGNOSTIC_TYPES.includes(type as DiagnosticType)) continue;
      const counts = result.fieldTypes[field] ??= {};
      const key = type as DiagnosticType;
      counts[key] = (counts[key] || 0) + 1;
    }
    const status = DIAGNOSTIC_STATUSES.includes(diagnostics.status as DiagnosticStatus) ? diagnostics.status as DiagnosticStatus : "UNKNOWN";
    result.statuses[status] = (result.statuses[status] || 0) + 1;
    const reasons = Array.isArray(diagnostics.reasons) ? diagnostics.reasons : [];
    for (const reason of CIERRE_RECONCILIATION_REASONS) {
      if (reasons.includes(reason)) result.reasons[reason] = (result.reasons[reason] || 0) + 1;
    }
  }
  return result;
}

export function normalizeSumasCierre(payloads: SourcePayload[], reference: CierreProviderReference): CierreProviderCredit[] {
  const credits: CierreProviderCredit[] = [];
  for (const payload of payloads) {
    for (const row of objects(payload.data)) {
      const providerId = text(direct(row, ["account_no", "accountNo", "loanId", "loan_id", "loanNumber", "loan_number", "numberCredit", "number_credit", "num_credito", "numeroCredito"]))
        ?? (payload.source === "loan-detail" && row === payload.data ? payload.loanId : null);
      if (!providerId || isForeignStore(row)) continue;
      const doc = document(row);
      if (doc && reference.documento && doc !== digits(reference.documento)) continue;
      const state = statusText(row);
      const disbursed = parseCierreProviderDate(field(row, ["disbursedOnDate", "disbursed_on_date", "disbursementDate", "disbursement_date"]));
      const fecha = disbursed ?? parseCierreProviderDate(field(row, ["loan_date", "loanDate", "fechaCredito", "fecha_credito"]));
      const valor = amount(field(row, ["principalDisbursed", "totalPrincipalDisbursed", "principal", "capital", "loan_amount_initial", "loanAmountInitial", "soldCapital", "sold_capital", "creditAmount", "valorCredito"]));
      const estado = negativeState(state) ?? (disbursed || explicitEffectiveState(state) ? "EFECTIVO" : "PENDIENTE");
      credits.push(snapshot("SUMASPAY", providerId, row, payload.source, valor, fecha, estado, reference, state));
    }
  }
  return dedupe(credits);
}

export function normalizeAddiCierre(payloads: SourcePayload[], reference: CierreProviderReference): CierreProviderCredit[] {
  const credits: CierreProviderCredit[] = [];
  for (const payload of payloads) {
    for (const row of objects(payload.data)) {
      const state = text(direct(row, ["status", "state", "transactionStatus", "paymentStatus", "estado"]));
      const providerId = text(direct(row, ["orderId", "idDeOrden", "transactionId"]))
        ?? (state && direct(row, ["createdAt", "created_at", "transactionDate"]) ? text(row.id) : null);
      if (!providerId || !state || isForeignStore(row)) continue;
      const doc = document(row);
      if (doc && reference.documento && doc !== digits(reference.documento)) continue;
      const valor = amount(field(row, ["creditAmount", "loanAmount", "capital"]));
      // The existing integration also accepts createdAt, but does not establish
      // whether it dates an application or a completed credit. Only an explicit
      // transactionDate can date this observation; the local sale remains the
      // fallback when that field is absent. updatedAt is never a generation date.
      const fecha = parseCierreProviderDate(direct(row, ["transactionDate"]));
      const estado = negativeState(state) ?? (explicitEffectiveState(state) ? "EFECTIVO" : "PENDIENTE");
      const reasons: CierreReconciliationReason[] = [];
      if (valor === null) reasons.push("MISSING_PRINCIPAL");
      if (!fecha) reasons.push("MISSING_EFFECTIVE_DATE");
      if (estado === "PENDIENTE") reasons.push("UNCONFIRMED_STATUS");
      const credit = snapshot("ADDI", providerId, row, payload.source, valor, fecha, estado, reference, state);
      const status = DIAGNOSTIC_STATUSES.includes(normal(state) as DiagnosticStatus) ? normal(state) as DiagnosticStatus : "UNKNOWN";
      if (record(credit.raw)) credit.raw = { ...credit.raw, diagnostics: {
        fieldTypes: Object.fromEntries(CIERRE_ADDI_DIAGNOSTIC_FIELDS.map((key) => [key, diagnosticFieldType(row, key)])),
        status, reasons,
      } };
      credits.push(credit);
    }
  }
  return dedupe(credits);
}

export function normalizePayJoyCierre(payload: unknown, reference: CierreProviderReference, accountScope = false): CierreProviderCredit[] {
  if (!record(payload) || payload.valid !== true || !Array.isArray(payload.transactions)) return [];
  const credits: CierreProviderCredit[] = [];
  for (const row of payload.transactions) {
    if (!record(row) || !record(row.financeOrder)) continue;
    const order = row.financeOrder;
    const providerId = text(order.id);
    const type = normal(row.type);
    // A payment refund/adjustment does not prove cancellation of the loan.
    // Require an explicit finance-order state (or the finance entry's state).
    const negative = negativeState(statusText(order)) ?? (type === "FINANCE" ? negativeState(statusText(row)) : null);
    if (!providerId || (type !== "FINANCE" && !negative)) continue;
    const imei = record(row.device) ? text(row.device.imei) || "" : "";
    if (reference.imei && imei && imei !== reference.imei.trim()) continue;
    if (!accountScope && !imei && providerId !== reference.providerId) continue;
    const currency = normal(order.currency || row.currency);
    // A multi-country partner account must never label foreign money as COP.
    const valor = (accountScope && currency !== "COP") || (currency && currency !== "COP") ? null : amount(order.financeAmount);
    const state = statusText(order) || statusText(row);
    const pending = /^(PENDING|PROCESSING|PENDIENTE|EN PROCESO)$/.test(normal(state));
    // A finance ledger entry is proof of generation. A reversal's own event
    // time is not the credit-generation date; merge it by order id instead.
    const fecha = type === "FINANCE" ? parseCierreProviderDate(
      typeof row.time === "string" && /^\d+(\.\d+)?$/.test(row.time) ? Number(row.time) : row.time
    ) : null;
    const credit = snapshot("PAYJOY", providerId, order, "list-transactions", valor, fecha,
      negative ?? (pending || (imei && !/^\d{15,16}$/.test(imei)) ? "PENDIENTE" : "EFECTIVO"), reference, state || type);
    if (record(row.customer)) {
      credit.cliente = text(row.customer.name) || credit.cliente;
      credit.documento = document(row.customer) || credit.documento;
    }
    if (record(row.merchant)) {
      const merchantId = text(row.merchant.id);
      const merchantName = text(row.merchant.name);
      if (merchantId) credit.providerMerchantId = merchantId;
      if (merchantName) credit.providerMerchantName = merchantName;
    }
    if (record(credit.raw)) credit.raw = { ...credit.raw,
      currency: currency || null, providerMerchantId: credit.providerMerchantId || null,
      providerMerchantName: credit.providerMerchantName || null } as CierreJson;
    if (imei) credit.imei = imei;
    const eventDate = parseCierreProviderDate(typeof row.time === "string" && /^\d+$/.test(row.time) ? Number(row.time) : row.time);
    if (!credit.sourceUpdatedAt && eventDate) credit.sourceUpdatedAt = eventDate;
    credits.push(credit);
  }
  return dedupe(credits);
}

const defaultReaders: CierreProviderReaders = {
  async configured(provider) {
    if (provider === "SUMASPAY") return (await import("@/lib/sumasconsulta")).isSumasConsultaConfigured();
    if (provider === "PAYJOY") return (await import("@/lib/payjoy-retail")).isPayJoyRetailConfigured();
    if (provider === "ADDI") return (await import("@/lib/addiconsulta")).isAddiConsultaConfigured();
    return false;
  },
  async sumas(documento, providerId) { return (await import("@/lib/sumasconsulta")).readSumasCierreHistory(documento, providerId); },
  async payjoy(imei, desde, hasta) { return (await import("@/lib/payjoy-retail")).readPayJoyCierreTransactions(imei, desde, hasta); },
  async addi(documento, desde, hasta) { return (await import("@/lib/addiconsulta")).readAddiCierreTransactions(documento, desde, hasta); },
  async payjoyPeriod(desde, hasta) { return (await import("@/lib/payjoy-retail")).readPayJoyCierrePeriod(desde, hasta); },
};

function observedBatch(credits: CierreProviderCredit[], emptyResponse: boolean, limitation: string): CierreProviderBatch {
  return {
    credits, complete: false, limitation,
    outcome: credits.length ? "OBSERVED" : emptyResponse ? "EMPTY" : "UNSUPPORTED_RESPONSE",
    pendingCredits: credits.filter((credit) => credit.estado === "PENDIENTE").length,
  };
}

function payjoyHasNoCreditEvents(payload: unknown) {
  // These non-origination event types are documented. An unknown type or an
  // adjustment must not silently become an asserted empty credit list.
  return record(payload) && payload.valid === true && Array.isArray(payload.transactions) &&
    payload.transactions.every((item) => record(item) && ["CASH", "COMMISSION", "OUT", "IN"].includes(normal(item.type)));
}

/** Account-level daily list documented at https://www.payjoy.com/apidocs/basic%20example.html . */
export async function consultarPeriodoPayJoyCierre(
  request: { fechaDesde: string; fechaHasta: string },
  readers: Pick<CierreProviderReaders, "configured" | "payjoyPeriod"> = defaultReaders,
): Promise<CierreProviderBatch> {
  const desde = parseCierreProviderDate(request.fechaDesde);
  const hasta = parseCierreProviderDate(request.fechaHasta);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.fechaDesde) || request.fechaDesde !== request.fechaHasta || !desde || !hasta) {
    throw new Error("El listado PAYJOY de CIERRE procesa un día por trabajo reanudable.");
  }
  if (!await readers.configured("PAYJOY")) return { credits: [], complete: false, outcome: "NOT_CONFIGURED", limitation: "Integración PAYJOY sin configurar." };
  if (!readers.payjoyPeriod) return { credits: [], complete: false, outcome: "UNSUPPORTED_RESPONSE", limitation: "Lector diario PAYJOY no disponible." };
  const payload = await readers.payjoyPeriod(desde, new Date(hasta.getTime() + 86_400_000));
  const credits = normalizePayJoyCierre(payload, {}, true);
  // Keep reversals with no origination date: the worker applies them by ID to an
  // existing credit without substituting the reversal event's date.
  return observedBatch(credits, payjoyHasNoCreditEvents(payload), CIERRE_PROVIDER_CAPABILITIES.PAYJOY.limitation);
}

/** One durable job reference at a time; no hidden fanout, retries or eligibility. */
export async function consultarLoteProveedorCierre(
  request: CierreProviderRequest,
  readers: CierreProviderReaders = defaultReaders,
): Promise<CierreProviderBatch> {
  const capability = CIERRE_PROVIDER_CAPABILITIES[request.financiera];
  if (!capability) throw new Error("Financiera de CIERRE no soportada.");
  const desde = parseCierreProviderDate(request.fechaDesde);
  const hasta = parseCierreProviderDate(request.fechaHasta);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.fechaDesde) || !/^\d{4}-\d{2}-\d{2}$/.test(request.fechaHasta) || !desde || !hasta || hasta < desde) {
    throw new Error("Periodo de CIERRE invalido.");
  }
  if (request.referencias.length > 1) throw new Error("CIERRE procesa una referencia por trabajo para limitar consultas y reanudar el histórico.");
  if (capability.source === "LOCAL") return { credits: [], complete: false, outcome: "LOCAL_ONLY", limitation: capability.limitation };
  if (!await readers.configured(request.financiera)) {
    return { credits: [], complete: false, outcome: "NOT_CONFIGURED", limitation: "Integración sin configurar. Fuente disponible: ventas confirmadas en CONECTAMOS." };
  }
  const reference = request.referencias[0];
  if (!reference) return { credits: [], complete: false, outcome: "MISSING_REFERENCE", limitation: "Sin referencias locales consultables; no demuestra ausencia de créditos en el proveedor." };
  let credits: CierreProviderCredit[];
  let emptyResponse = false;
  if (request.financiera === "PAYJOY") {
    const imei = digits(reference.imei);
    if (!/^\d{15,16}$/.test(imei)) return { credits: [], complete: false, outcome: "MISSING_REFERENCE", limitation: "IMEI pendiente para consultar transacciones PAYJOY." };
    // Also read subsequent events to capture reversals of this original credit.
    const endExclusive = new Date(Math.max(hasta.getTime() + 86_400_000, Date.now()));
    const payload = await readers.payjoy(imei, desde, endExclusive);
    credits = normalizePayJoyCierre(payload, reference);
    emptyResponse = payjoyHasNoCreditEvents(payload);
  } else {
    const doc = digits(reference.documento);
    if (!/^\d{5,15}$/.test(doc)) return { credits: [], complete: false, outcome: "MISSING_REFERENCE", limitation: "Documento pendiente para consultar el historial del crédito." };
    const payloads = request.financiera === "SUMASPAY" ? await readers.sumas(doc, reference.providerId)
      : await readers.addi(doc, request.fechaDesde, request.fechaHasta);
    credits = request.financiera === "SUMASPAY" ? normalizeSumasCierre(payloads, reference) : normalizeAddiCierre(payloads, reference);
    emptyResponse = payloads.length > 0 && payloads.every((payload) => Array.isArray(payload.data) && payload.data.length === 0);
  }
  const end = hasta.getTime() + 86_400_000;
  credits = credits.filter((credit) => credit.providerId === reference.providerId ||
    !credit.fechaEfectiva || (credit.fechaEfectiva >= desde && credit.fechaEfectiva.getTime() < end));
  // Request success only proves that this reference was read. Do not turn an
  // empty/incomplete response, capped list or missing branch mapping into zero.
  const result = observedBatch(credits, emptyResponse, capability.limitation);
  return request.financiera === "ADDI" ? { ...result, diagnostics: summarizeCierreProviderDiagnostics(credits) } : result;
}
