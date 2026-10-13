/**
 * Read-only provider adapters for the durable CIERRE worker.
 * Importing this module never performs I/O. Report and export handlers must only
 * read the local ledger; they must not call consultarLoteProveedorCierre.
 */
export type CierreProvider = "SUMASPAY" | "PAYJOY" | "ADDI" | "SISTECREDITO" | "ALO CREDIT" | "FINSERPAY";
export type CierreProviderState = "EFECTIVO" | "ANULADO" | "REVERSADO" | "RECHAZADO" | "PENDIENTE";
export type CierreJson = null | string | number | boolean | CierreJson[] | { [key: string]: CierreJson };

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
};

type SourcePayload = { source: string; data: unknown; loanId?: string };
export type CierreProviderReaders = {
  configured: (provider: CierreProvider) => boolean | Promise<boolean>;
  sumas: (documento: string, providerId?: string) => Promise<SourcePayload[]>;
  payjoy: (imei: string, desde: Date, hasta: Date) => Promise<unknown>;
  addi: (documento: string, desde: string, hasta: string) => Promise<SourcePayload[]>;
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
    history: "Transacciones por IMEI y rango que conserve el proveedor; sin fecha mínima garantizada.",
    limitation: "Sólo transacciones finance con financeOrder.id y financeAmount. El listado por IMEI no garantiza cobertura global ni todos los reversos históricos.",
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
  if (/\b(REVERSED|REVERSAL|REVERSADO|REVERSADA|REFUNDED|REFUND|REEMBOLSADO|REEMBOLSADA)\b/.test(state)) return "REVERSADO";
  if (/\b(VOID|VOIDED|CANCELLED|CANCELED|ANULADO|ANULADA)\b/.test(state)) return "ANULADO";
  if (/\b(REJECTED|DECLINED|RECHAZADO|RECHAZADA|DENEGADO|DENEGADA)\b/.test(state)) return "RECHAZADO";
  return null;
}

function explicitEffectiveState(value: unknown) {
  return /^(ACTIVE|ACTIVO|ACTIVA|AL DIA|MORA|EN MORA|DISBURSED|DESEMBOLSADO|DESEMBOLSADA|PAID IN FULL|PAGADO|PAGADA|SUCCESS|SUCCESSFUL|EXITOSA|EXITO|COMPLETED|COMPLETADO|COMPLETADA|FINALIZADO|FINALIZADA)$/.test(normal(value));
}

function client(row: Record<string, unknown>) {
  return text(field(row, ["clientName", "clientFullName", "customerName", "customerFullName", "fullName", "nombreCliente", "nombreCompleto", "clienteNombre"]));
}

function document(row: Record<string, unknown>) {
  return digits(field(row, ["documentNumber", "documento", "cedula", "identificationNumber", "clientDocumentNumber", "customerDocumentNumber"]));
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
      effectiveDate: fechaEfectiva?.toISOString() ?? null, storeName: storeName(row) },
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
      credits.push(snapshot("ADDI", providerId, row, payload.source, valor, fecha, estado, reference, state));
    }
  }
  return dedupe(credits);
}

export function normalizePayJoyCierre(payload: unknown, reference: CierreProviderReference): CierreProviderCredit[] {
  if (!record(payload) || payload.valid !== true || !Array.isArray(payload.transactions)) return [];
  const credits: CierreProviderCredit[] = [];
  for (const row of payload.transactions) {
    if (!record(row) || !record(row.financeOrder)) continue;
    const order = row.financeOrder;
    const providerId = text(order.id);
    const type = normal(row.type);
    const negative = negativeState(statusText(order)) ?? negativeState(statusText(row)) ?? negativeState(type);
    if (!providerId || (type !== "FINANCE" && !negative)) continue;
    const imei = record(row.device) ? digits(row.device.imei) : "";
    if (reference.imei && imei && imei !== digits(reference.imei)) continue;
    if (!imei && providerId !== reference.providerId) continue;
    const valor = amount(order.financeAmount);
    const state = statusText(order) || statusText(row);
    const pending = /^(PENDING|PROCESSING|PENDIENTE|EN PROCESO)$/.test(normal(state));
    // A finance ledger entry is proof of generation. A reversal's own event
    // time is not the credit-generation date; merge it by order id instead.
    const fecha = type === "FINANCE" ? parseCierreProviderDate(
      typeof row.time === "string" && /^\d+(\.\d+)?$/.test(row.time) ? Number(row.time) : row.time
    ) : null;
    const credit = snapshot("PAYJOY", providerId, order, "list-transactions", valor, fecha,
      negative ?? (pending ? "PENDIENTE" : "EFECTIVO"), reference, state || type);
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
};

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
  if (capability.source === "LOCAL") return { credits: [], complete: false, limitation: capability.limitation };
  if (!await readers.configured(request.financiera)) {
    return { credits: [], complete: false, limitation: "Integración sin configurar. Fuente disponible: ventas confirmadas en CONECTAMOS." };
  }
  const reference = request.referencias[0];
  if (!reference) return { credits: [], complete: false, limitation: "Sin referencias locales consultables; no demuestra ausencia de créditos en el proveedor." };
  let credits: CierreProviderCredit[];
  if (request.financiera === "PAYJOY") {
    const imei = digits(reference.imei);
    if (!/^\d{15,16}$/.test(imei)) return { credits: [], complete: false, limitation: "IMEI pendiente para consultar transacciones PAYJOY." };
    // Also read subsequent events to capture reversals of this original credit.
    const endExclusive = new Date(Math.max(hasta.getTime() + 86_400_000, Date.now()));
    credits = normalizePayJoyCierre(await readers.payjoy(imei, desde, endExclusive), reference);
  } else {
    const doc = digits(reference.documento);
    if (!/^\d{5,15}$/.test(doc)) return { credits: [], complete: false, limitation: "Documento pendiente para consultar el historial del crédito." };
    credits = request.financiera === "SUMASPAY"
      ? normalizeSumasCierre(await readers.sumas(doc, reference.providerId), reference)
      : normalizeAddiCierre(await readers.addi(doc, request.fechaDesde, request.fechaHasta), reference);
  }
  const end = hasta.getTime() + 86_400_000;
  credits = credits.filter((credit) => credit.providerId === reference.providerId ||
    !credit.fechaEfectiva || (credit.fechaEfectiva >= desde && credit.fechaEfectiva.getTime() < end));
  // Request success only proves that this reference was read. Do not turn an
  // empty/incomplete response, capped list or missing branch mapping into zero.
  return { credits, complete: false, limitation: capability.limitation };
}
