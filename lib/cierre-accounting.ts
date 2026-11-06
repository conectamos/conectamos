import type { Prisma } from "@/app/generated/prisma/client";
import { esAdministradorCentral } from "@/lib/access-control";
import { canonicalFinancialName } from "@/lib/cierre-domain";

export class CierreAccountingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type CierreAccountingScope = { from: string; to: string; sedeId: number | null };
export type CierrePayment = { id: string; date: string | null; amount: number; reference: string | null };
export type CierreAccounting = {
  financial: string;
  correctedAmount: number | null;
  collectedAmount: number | null;
  payments: CierrePayment[];
  hidden: boolean;
  note: string | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
};
type AccountingPatch = Pick<CierreAccounting, "financial" | "version"> &
  Partial<Pick<CierreAccounting, "correctedAmount" | "collectedAmount" | "payments" | "hidden" | "note">>;
type AccountingRow = {
  financial: string; correctedAmount: unknown; collectedAmount: unknown; payments?: unknown;
  hidden: boolean; note: string | null; version: number; updatedAt: Date; updatedBy: string;
};
type AccountingActor = {
  id: number; perfilId?: number | null; perfilNombre?: string | null;
  nombre?: string | null; usuario?: string; rolNombre?: unknown; perfilTipo?: unknown;
};
const STANDARD_FINANCIALS = new Set(["SUMASPAY", "PAYJOY", "ADDI", "SISTECREDITO", "ALO CREDIT", "FINSERPAY"]);
const MAX_MONEY = 999_999_999_999.99;

export const canManageCierreAccounting = esAdministradorCentral;

function scopeKey(scope: CierreAccountingScope) {
  return scope.sedeId === null ? "GLOBAL" : `SEDE:${scope.sedeId}`;
}

function accountingKey(scope: CierreAccountingScope, financial: string) {
  // A month and an equivalent custom range share one record. Overlapping ranges
  // and a branch/global report remain separate accounting scopes.
  return JSON.stringify([scope.from, scope.to, scopeKey(scope), financial]);
}

export function emptyCierreAccounting(financial: string): CierreAccounting {
  return { financial, correctedAmount: null, collectedAmount: null, payments: [], hidden: false,
    note: null, version: 0, updatedAt: null, updatedBy: null };
}

function accountingDto(row: AccountingRow): CierreAccounting {
  const recordedPayments = row.payments === null || row.payments === undefined ? null : validPayments(row.payments);
  const collectedAmount = recordedPayments === null
    ? row.collectedAmount === null ? null : Number(row.collectedAmount)
    : sumPayments(recordedPayments);
  // Existing aggregate receipts remain visible, without inventing a payment
  // date or migrating historical accounting records during a report read.
  const payments = recordedPayments ?? (collectedAmount !== null && collectedAmount > 0
    ? [{ id: "legacy-collected", date: null, amount: collectedAmount, reference: null }] : []);
  return { financial: row.financial,
    correctedAmount: row.correctedAmount === null ? null : Number(row.correctedAmount),
    collectedAmount, payments,
    hidden: row.hidden, note: row.note, version: row.version,
    updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
}

export async function readCierreAccounting(tx: Prisma.TransactionClient, scope: CierreAccountingScope) {
  const rows = await tx.cierreAjuste.findMany({
    where: { periodFrom: scope.from, periodTo: scope.to, scopeKey: scopeKey(scope) },
  });
  return new Map(rows.map((row) => [row.financial, accountingDto(row)]));
}

export function applyCierreAccounting<T extends { name: string; amount: number | null }>(row: T, saved?: CierreAccounting) {
  const accounting = saved ?? emptyCierreAccounting(row.name);
  const amount = accounting.correctedAmount ?? row.amount;
  const balance = amount === null || accounting.collectedAmount === null ? null
    : (Math.round(amount * 100) - Math.round(accounting.collectedAmount * 100)) / 100;
  return { ...row, amount, syncedAmount: row.amount, correctedAmount: accounting.correctedAmount,
    collectedAmount: accounting.collectedAmount, balance, hidden: accounting.hidden, accounting };
}

function validMoney(value: unknown, field: string): number | null {
  if (value === null) return null;
  // Only JSON numbers are accepted; locale-formatted strings are parsed by the
  // form. Never silently round a value with extra decimal places.
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MONEY ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || !Number.isSafeInteger(Math.round(value * 100))) {
    throw new CierreAccountingError(`${field} debe ser un importe no negativo, con máximo dos decimales.`);
  }
  return Math.round(value * 100) / 100;
}

function sumPayments(payments: CierrePayment[]) {
  let cents = 0;
  for (const payment of payments) {
    cents += Math.round(payment.amount * 100);
    if (!Number.isSafeInteger(cents) || cents > Math.round(MAX_MONEY * 100)) {
      throw new CierreAccountingError("La suma de los pagos supera el importe máximo permitido.");
    }
  }
  return cents / 100;
}

function validPayments(value: unknown): CierrePayment[] {
  if (!Array.isArray(value) || value.length > 1000) throw new CierreAccountingError("Registra una lista de máximo 1000 pagos.");
  const ids = new Set<string>();
  const payments = value.map((entry): CierrePayment => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new CierreAccountingError("Los datos de un pago no son válidos.");
    const payment = entry as Record<string, unknown>;
    if (Object.keys(payment).some((key) => !["id", "date", "amount", "reference"].includes(key))) {
      throw new CierreAccountingError("El pago contiene campos no permitidos.");
    }
    if (typeof payment.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(payment.id) || ids.has(payment.id)) {
      throw new CierreAccountingError("Cada pago debe tener una referencia interna única y válida.");
    }
    ids.add(payment.id);
    if (payment.date !== null) {
      if (typeof payment.date !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(payment.date)) {
        throw new CierreAccountingError("Indica una fecha válida para cada pago.");
      }
      const date = new Date(`${payment.date}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== payment.date) {
        throw new CierreAccountingError("La fecha de un pago no existe.");
      }
    }
    const amount = validMoney(payment.amount, "El valor del pago");
    if (amount === null || amount <= 0) throw new CierreAccountingError("El valor de cada pago debe ser mayor que cero.");
    if (payment.reference !== undefined && payment.reference !== null &&
      (typeof payment.reference !== "string" || payment.reference.length > 200)) {
      throw new CierreAccountingError("La referencia de cada pago admite máximo 200 caracteres.");
    }
    return { id: payment.id, date: payment.date, amount,
      reference: typeof payment.reference === "string" ? payment.reference.trim() || null : null };
  });
  sumPayments(payments);
  return payments;
}

export function parseCierreAccountingPatch(value: unknown): AccountingPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CierreAccountingError("Datos del ajuste inválidos.");
  const body = value as Record<string, unknown>;
  const allowed = new Set(["financial", "version", "correctedAmount", "collectedAmount", "payments", "hidden", "note"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new CierreAccountingError("El ajuste contiene campos no permitidos.");
  if (typeof body.financial !== "string" || !body.financial.trim() || body.financial.length > 80 || /[\x00-\x1f]/.test(body.financial)) {
    throw new CierreAccountingError("Selecciona una financiera válida.");
  }
  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 0) {
    throw new CierreAccountingError("La versión del ajuste no es válida. Actualiza el cierre.");
  }
  const patch: AccountingPatch = { financial: canonicalFinancialName(body.financial), version: body.version };
  if (Object.hasOwn(body, "correctedAmount")) patch.correctedAmount = validMoney(body.correctedAmount, "El valor corregido");
  if (Object.hasOwn(body, "collectedAmount")) patch.collectedAmount = validMoney(body.collectedAmount, "El recaudado");
  if (Object.hasOwn(body, "payments")) {
    patch.payments = validPayments(body.payments);
    if (patch.collectedAmount !== undefined && patch.collectedAmount !== sumPayments(patch.payments)) {
      throw new CierreAccountingError("El recaudado debe coincidir con la suma de los pagos.");
    }
  }
  if (Object.hasOwn(body, "hidden")) {
    if (typeof body.hidden !== "boolean") throw new CierreAccountingError("La visibilidad de la financiera no es válida.");
    patch.hidden = body.hidden;
  }
  if (Object.hasOwn(body, "note")) {
    if (body.note !== null && (typeof body.note !== "string" || body.note.length > 500)) {
      throw new CierreAccountingError("La observación admite máximo 500 caracteres.");
    }
    patch.note = typeof body.note === "string" ? body.note.trim() || null : null;
  }
  if (Object.keys(patch).length === 2) throw new CierreAccountingError("Indica el cambio que deseas guardar.");
  return patch;
}

export async function saveCierreAccounting(tx: Prisma.TransactionClient, scope: CierreAccountingScope, actor: AccountingActor, patch: AccountingPatch) {
  if (!canManageCierreAccounting(actor)) throw new CierreAccountingError("Solo un administrador puede ajustar el cierre.", 403);
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0) throw new CierreAccountingError("No fue posible identificar al administrador.", 403);
  if (scope.sedeId !== null && !await tx.sede.findUnique({ where: { id: scope.sedeId }, select: { id: true } })) {
    throw new CierreAccountingError("Sede no encontrada.", 404);
  }
  const key = accountingKey(scope, patch.financial);
  const existing = await tx.cierreAjuste.findUnique({ where: { key } });
  // Existing adjustments remain editable if the final source credit disappears.
  if (!existing && !STANDARD_FINANCIALS.has(patch.financial) && !await tx.cierreCredito.findFirst({
    where: { financial: patch.financial, ...(scope.sedeId === null ? {} : { sedeId: scope.sedeId }) }, select: { id: true },
  })) throw new CierreAccountingError("Financiera no encontrada en el cierre.", 404);
  const before = existing ? accountingDto(existing) : emptyCierreAccounting(patch.financial);
  if (patch.version !== before.version) throw new CierreAccountingError("Otro usuario cambió este cierre. Actualiza y revisa los valores antes de guardar.", 409);
  if (patch.payments) {
    // A dateless historical aggregate may be edited as such. Newly entered
    // payments need a real date, which can fall after the closing period.
    for (const payment of patch.payments) if (payment.date === null &&
      !before.payments.some((previous) => previous.id === payment.id && previous.date === null)) {
      throw new CierreAccountingError("Indica una fecha para cada pago nuevo.");
    }
  } else if (Array.isArray(existing?.payments) && patch.collectedAmount !== undefined && patch.collectedAmount !== before.collectedAmount) {
    // A cached older client must not erase itemized receipts by replacing their
    // total. The current form edits the list and sends its version atomically.
    throw new CierreAccountingError("Modifica el detalle de pagos para cambiar el recaudado.");
  }
  const next = { correctedAmount: patch.correctedAmount === undefined ? before.correctedAmount : patch.correctedAmount,
    collectedAmount: patch.payments === undefined
      ? patch.collectedAmount === undefined ? before.collectedAmount : patch.collectedAmount : sumPayments(patch.payments),
    hidden: patch.hidden ?? before.hidden, note: patch.note === undefined ? before.note : patch.note };
  const paymentsChanged = patch.payments !== undefined &&
    (!Array.isArray(existing?.payments) || JSON.stringify(patch.payments) !== JSON.stringify(before.payments));
  if (next.correctedAmount !== null && !next.note) throw new CierreAccountingError("Indica una observación para identificar el valor corregido.");
  if (existing && next.correctedAmount === before.correctedAmount && next.collectedAmount === before.collectedAmount &&
    next.hidden === before.hidden && next.note === before.note && !paymentsChanged) return before;
  const updatedBy = actor.perfilNombre || actor.nombre || actor.usuario || `Administrador ${actor.id}`;
  const data = { ...next, ...(patch.payments === undefined ? {} : { payments: patch.payments }),
    updatedBy, updatedById: actor.id, updatedByProfileId: actor.perfilId ?? null, version: before.version + 1 };
  let saved;
  if (existing) {
    const changed = await tx.cierreAjuste.updateMany({ where: { key, version: before.version }, data });
    if (changed.count !== 1) throw new CierreAccountingError("Otro usuario cambió este cierre. Actualiza y revisa los valores antes de guardar.", 409);
    saved = await tx.cierreAjuste.findUniqueOrThrow({ where: { key } });
  } else {
    saved = await tx.cierreAjuste.create({ data: { key, financial: patch.financial, periodFrom: scope.from,
      periodTo: scope.to, scopeKey: scopeKey(scope), sedeId: scope.sedeId, ...data } });
  }
  const after = accountingDto(saved);
  await tx.cierreAjusteEvento.create({ data: { adjustmentKey: key, version: after.version, actorId: actor.id,
    actorProfileId: actor.perfilId ?? null, actorName: updatedBy,
    snapshot: { before, after } } });
  return after;
}

export function cierreAccountingTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const requestUrl = new URL(request.url);
  // A browser POST from this exact HTTPS origin is allowed on custom domains.
  // Do not build an origin from client-supplied forwarded-host headers.
  if (requestUrl.protocol === "https:" && origin === requestUrl.origin) return true;
  const configured = [process.env.APP_URL, process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null];
  const trusted = configured.flatMap((value) => {
    if (!value) return [];
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? [url.origin] : []; }
    catch { return []; }
  });
  if (trusted.length) return trusted.includes(origin);
  if (process.env.NODE_ENV === "production") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname) && origin === requestUrl.origin;
}
