/** Pure closing-report rules. This module must never contact a provider. */
export const CIERRE_TIME_ZONE = "America/Bogota";
export const CIERRE_PAGE_SIZE = 10;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CIERRE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
export type CierrePeriodMode = "dia" | "semana" | "mes" | "rango";
export type CreditStatus = "EFECTIVO" | "ANULADO" | "REVERSADO" | "RECHAZADO" | "PENDIENTE";

export class CierreInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CierreInputError";
    this.status = status;
  }
}

export type CierrePeriodInput = {
  periodo?: CierrePeriodMode | string;
  fecha?: string | null;
  mes?: string | null;
  desde?: string | null;
  hasta?: string | null;
};

export type CierrePeriod = {
  periodo: CierrePeriodMode;
  desde: string;
  hasta: string;
  start: Date;
  end: Date;
  label: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function bogotaDayKey(value: Date | string = new Date()) {
  // An explicit date-only input is already a civil date, never UTC midnight.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parseDay(value);
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new CierreInputError("La fecha no es válida");
  const parts = dayFormatter.formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((p) => p.type === type)?.value).join("-");
}

function parseDay(value: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) {
    throw new CierreInputError("Usa una fecha válida con formato AAAA-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CierreInputError("La fecha no existe");
  }
  return date;
}

function addCivilDays(value: string, days: number) {
  const date = parseDay(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayStart(value: string, afterDay = false) {
  const nominal = parseDay(value).getTime();
  // Find the civil-day boundary using the IANA zone. This also handles older
  // Colombia dates whose offset differed from today's UTC-05:00.
  const target = Number(value.replace(/-/g, ""));
  let lower = nominal - 18 * 3_600_000;
  let upper = nominal + (afterDay ? 42 : 18) * 3_600_000;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const current = Number(bogotaDayKey(new Date(middle)).replace(/-/g, ""));
    if (afterDay ? current <= target : current < target) lower = middle + 1;
    else upper = middle;
  }
  return new Date(lower);
}

export function resolveCierrePeriod(input: CierrePeriodInput = {}, now = new Date()): CierrePeriod {
  const periodo = input.periodo || "dia";
  if (!["dia", "semana", "mes", "rango"].includes(periodo)) {
    throw new CierreInputError("El periodo no es válido");
  }
  const today = bogotaDayKey(now);
  let desde: string;
  let hasta: string;
  if (periodo === "rango") {
    if (!input.desde || !input.hasta) throw new CierreInputError("Selecciona las dos fechas del rango");
    desde = input.desde;
    hasta = input.hasta;
    parseDay(desde);
    parseDay(hasta);
    if (desde > hasta) throw new CierreInputError("La fecha inicial debe ser anterior o igual a la final");
  } else if (periodo === "mes") {
    const month = input.mes || (input.fecha ? input.fecha.slice(0, 7) : today.slice(0, 7));
    if (!/^[1-9]\d{3}-\d{2}$/.test(month)) throw new CierreInputError("El mes no es válido");
    desde = `${month}-01`;
    const last = parseDay(desde);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    hasta = last.toISOString().slice(0, 10);
  } else {
    const anchor = input.fecha || today;
    const anchorDate = parseDay(anchor);
    desde = periodo === "semana" ? addCivilDays(anchor, -((anchorDate.getUTCDay() + 6) % 7)) : anchor;
    hasta = periodo === "semana" ? addCivilDays(desde, 6) : desde;
  }
  const start = dayStart(desde);
  const end = dayStart(hasta, true);
  const format = (value: string) => value.split("-").reverse().join("/");
  return {
    periodo: periodo as CierrePeriodMode, desde, hasta, start, end,
    label: desde === hasta ? format(desde) : `${format(desde)} – ${format(hasta)}`,
  };
}

export function canonicalFinancialName(value: unknown) {
  const name = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
  const compact = name.replace(/[\s_-]+/g, "");
  const aliases: Record<string, string> = {
    PAYJOY: "PAYJOY", SUMASPAY: "SUMASPAY", ADDI: "ADDI", SISTECREDITO: "SISTECREDITO",
    ALO: "ALO CREDIT", ALOCREDIT: "ALO CREDIT", FINSER: "FINSERPAY", FINSERPAY: "FINSERPAY",
    BOGOTA: "BANCO BOGOTA", BANCOBOGOTA: "BANCO BOGOTA", BANCODEBOGOTA: "BANCO BOGOTA",
    ESMIO: "ESMIO", ESMIOPCION: "ESMIO",
  };
  return aliases[compact] || name;
}

/** Adapters must supply an effective status, not an eligibility/limit approval. */
export function normalizeCreditStatus(value: unknown): CreditStatus {
  const state = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (["EFECTIVO", "DESEMBOLSADO", "GENERADO", "FINALIZADO", "DISBURSED", "CONVERTIDO_EN_VENTA"].includes(state)) return "EFECTIVO";
  if (["ANULADO", "ANULADA", "CANCELADO", "CANCELADA", "CANCELED", "CANCELLED", "VOIDED", "ELIMINADO"].includes(state)) return "ANULADO";
  if (["REVERSADO", "REVERSADA", "REVERSO", "REVERSED", "REFUNDED", "DEVUELTO"].includes(state)) return "REVERSADO";
  if (["RECHAZADO", "RECHAZADA", "REJECTED", "DECLINED", "DENIED"].includes(state)) return "RECHAZADO";
  return "PENDIENTE";
}

export type LocalSale = {
  id: number;
  idVenta: string;
  fecha: Date | string;
  sedeId: number;
  financierasDetalle?: unknown;
  estado?: unknown;
  eliminadoEn?: unknown;
  updatedAt?: Date | string;
  alcanos?: unknown; payjoy?: unknown; sistecredito?: unknown; addi?: unknown;
  sumaspay?: unknown; celya?: unknown; bogota?: unknown; alocredit?: unknown;
  esmio?: unknown; kaiowa?: unknown; finser?: unknown; gora?: unknown;
};

export type LocalSaleRecord = {
  id: number;
  ventaIdRelacionada?: number | null;
  sedeId?: number;
  clienteNombre?: string | null;
  documentoNumero?: string | null;
  eliminadoEn?: Date | string | null;
  estadoVentaRegistro?: string | null;
};

export type CreditProjection = {
  localKey: string | null;
  financial: string;
  providerCreditId: string | null;
  creditNumber: string | null;
  localReference: string | null;
  ventaId: number | null;
  registroId: number | null;
  sedeId: number | null;
  effectiveAt: Date;
  amount: number;
  customerName: string | null;
  documentNumber: string | null;
  status: CreditStatus;
  source: string;
  updatedAt?: Date;
};

export type LocalCreditProjection = CreditProjection & {
  localKey: string;
  localReference: string;
  ventaId: number;
  sedeId: number;
  source: "CONECTAMOS";
};

const LEGACY_FINANCIALS = [
  ["alcanos", "ALCANOS"], ["payjoy", "PAYJOY"], ["sistecredito", "SISTECREDITO"],
  ["addi", "ADDI"], ["sumaspay", "SUMASPAY"], ["celya", "CELYA"],
  ["bogota", "BANCO BOGOTA"], ["alocredit", "ALO CREDIT"], ["esmio", "ESMIO"],
  ["kaiowa", "KAIOWA"], ["finser", "FINSERPAY"], ["gora", "GORA"],
] as const;

function positiveMoney(value: unknown) {
  if (value === null || value === undefined || typeof value === "boolean" || Array.isArray(value) || text(value) === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round((amount + Number.EPSILON) * 100) / 100 : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Venta is the confirmed sale. Registro is only linked identity, never a source
 * of credit value or date. Values in Venta are principal before intermediation.
 * The legacy data has one financial amount per sale/financial, not loan IDs.
 */
export function projectLocalSaleCredits(venta: LocalSale, registros: LocalSaleRecord[] = []): LocalCreditProjection[] {
  if (!Number.isSafeInteger(venta.id) || venta.id <= 0 || !Number.isSafeInteger(venta.sedeId) || venta.sedeId <= 0) {
    throw new CierreInputError("La venta confirmada no tiene identificadores válidos");
  }
  const effectiveAt = typeof venta.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(venta.fecha)
    ? dayStart(venta.fecha) : new Date(venta.fecha);
  if (!Number.isFinite(effectiveAt.getTime())) throw new CierreInputError("La venta no tiene fecha efectiva válida");
  const linked = registros.filter((r) => r.ventaIdRelacionada === venta.id && !r.eliminadoEn &&
    (r.sedeId === undefined || r.sedeId === venta.sedeId)).sort((a, b) => b.id - a.id)[0];
  if (venta.financierasDetalle != null && !Array.isArray(venta.financierasDetalle)) {
    throw new CierreInputError("El detalle de financieras de la venta no es válido");
  }
  const stored = Array.isArray(venta.financierasDetalle) ? venta.financierasDetalle : [];
  const sourceRows: Array<{ name: unknown; amount: unknown }> = stored.length
    ? stored.map((item) => {
      const row = record(item);
      if (!row) throw new CierreInputError("El detalle de financieras de la venta está incompleto");
      const amount = row.valorBruto;
      const explicitZero = (typeof amount === "number" || typeof amount === "string") && text(amount) !== "" && Number(amount) === 0;
      if (!explicitZero && (positiveMoney(amount) === null || !text(row.nombre))) {
        // Keep its outbox entry pending rather than reporting an unverified zero.
        throw new CierreInputError("La financiera de la venta no tiene nombre o valor de crédito válido");
      }
      return { name: row.nombre, amount };
    })
    : LEGACY_FINANCIALS.map(([key, name]) => ({ name, amount: venta[key] }));
  const amounts = new Map<string, number>();
  for (const item of sourceRows) {
    const financial = canonicalFinancialName(item.name);
    const amount = positiveMoney(item.amount);
    if (!financial || amount === null) continue;
    amounts.set(financial, Math.round(((amounts.get(financial) || 0) + amount) * 100) / 100);
  }
  const status = venta.eliminadoEn ? "ANULADO" : venta.estado ? normalizeCreditStatus(venta.estado) : "EFECTIVO";
  return Array.from(amounts, ([financial, amount]) => ({
    localKey: `VENTA:${venta.id}:${financial}`, financial, providerCreditId: null, creditNumber: null,
    localReference: venta.idVenta, ventaId: venta.id, registroId: linked?.id ?? null,
    sedeId: venta.sedeId, effectiveAt, amount, customerName: text(linked?.clienteNombre) || null,
    documentNumber: text(linked?.documentoNumero).replace(/[^0-9]/g, "") || null,
    status, source: "CONECTAMOS",
    ...(venta.updatedAt ? { updatedAt: new Date(venta.updatedAt) } : {}),
  }));
}

export function isEffectiveCredit(credit: Pick<CreditProjection, "status" | "amount">) {
  return credit.status === "EFECTIVO" && Number.isFinite(credit.amount) && credit.amount > 0;
}

/** Exact provider IDs + financial; a localKey link must have been verified upstream. */
export function deduplicateCredits(credits: CreditProjection[]) {
  const providers = new Map<string, CreditProjection>();
  const locals = new Map<string, CreditProjection>();
  function latest(previous: CreditProjection | undefined, incoming: CreditProjection) {
    if (!previous) return incoming;
    const oldTime = previous.updatedAt?.getTime() || 0;
    const newTime = incoming.updatedAt?.getTime() || 0;
    if (newTime < oldTime) return previous;
    return { ...incoming, localKey: incoming.localKey || previous.localKey,
      localReference: incoming.localReference || previous.localReference,
      ventaId: incoming.ventaId ?? previous.ventaId, registroId: incoming.registroId ?? previous.registroId,
      sedeId: incoming.sedeId ?? previous.sedeId, customerName: incoming.customerName || previous.customerName,
      documentNumber: incoming.documentNumber || previous.documentNumber };
  }
  for (const input of credits) {
    const credit = { ...input, financial: canonicalFinancialName(input.financial) };
    if (credit.providerCreditId) {
      const key = `${credit.financial}:${credit.providerCreditId}`;
      providers.set(key, latest(providers.get(key), credit));
    } else if (credit.localKey) {
      const key = `${credit.financial}:${credit.localKey}`;
      locals.set(key, latest(locals.get(key), credit));
    } else {
      throw new CierreInputError("No se puede consolidar un crédito sin identificador estable");
    }
  }
  const result: CreditProjection[] = [];
  for (const credit of providers.values()) {
    const local = credit.localKey ? locals.get(`${credit.financial}:${credit.localKey}`) : undefined;
    result.push({ ...credit, localReference: credit.localReference || local?.localReference || null,
      ventaId: credit.ventaId ?? local?.ventaId ?? null, registroId: credit.registroId ?? local?.registroId ?? null,
      sedeId: credit.sedeId ?? local?.sedeId ?? null, customerName: credit.customerName || local?.customerName || null,
      documentNumber: credit.documentNumber || local?.documentNumber || null });
    if (local) locals.delete(`${credit.financial}:${credit.localKey}`);
  }
  return [...result, ...locals.values()];
}

export function aggregateCredits(credits: CreditProjection[], filter: { period: CierrePeriod; sedeId?: number | null; financial?: string | null }) {
  const financialFilter = canonicalFinancialName(filter.financial);
  const detail = deduplicateCredits(credits).filter((credit) =>
    isEffectiveCredit(credit) && credit.effectiveAt >= filter.period.start && credit.effectiveAt < filter.period.end &&
    (filter.sedeId == null || credit.sedeId === filter.sedeId) && (!financialFilter || credit.financial === financialFilter)
  ).sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime() || text(a.providerCreditId || a.localKey).localeCompare(text(b.providerCreditId || b.localKey)));
  const groups = new Map<string, { financial: string; units: number; amount: number }>();
  for (const credit of detail) {
    const group = groups.get(credit.financial) || { financial: credit.financial, units: 0, amount: 0 };
    group.units += 1;
    group.amount = Math.round((group.amount + credit.amount) * 100) / 100;
    groups.set(credit.financial, group);
  }
  return { detail, rows: [...groups.values()].sort((a, b) => a.financial.localeCompare(b.financial)),
    totalUnits: detail.length, totalAmount: Math.round(detail.reduce((sum, item) => sum + item.amount, 0) * 100) / 100 };
}

export function canViewGlobalCierre(user: { rolNombre?: unknown; perfilTipo?: unknown }) {
  return text(user.rolNombre).toUpperCase() === "ADMIN" || text(user.perfilTipo).toUpperCase() === "ADMINISTRADOR";
}

/** Use this same scope for summaries, detail and export; never trust the client. */
export function resolveCierreSede(user: { rolNombre?: unknown; perfilTipo?: unknown; sedeId?: number | null }, requested?: unknown): number | null {
  const hasRequested = requested !== undefined && requested !== null && requested !== "";
  const requestedNumber = hasRequested ? Number(requested) : null;
  if (hasRequested && (!Number.isSafeInteger(requestedNumber) || (requestedNumber as number) <= 0)) {
    throw new CierreInputError("La sede seleccionada no es válida");
  }
  if (canViewGlobalCierre(user)) return requestedNumber;
  if (!Number.isSafeInteger(user.sedeId) || (user.sedeId as number) <= 0) {
    throw new CierreInputError("El usuario no tiene una sede autorizada", 403);
  }
  if (hasRequested && requestedNumber !== user.sedeId) throw new CierreInputError("No tienes acceso a esa sede", 403);
  return user.sedeId as number;
}
