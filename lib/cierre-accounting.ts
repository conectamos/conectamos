import type { Prisma } from "@/app/generated/prisma/client";
import { esAdministradorCentral } from "@/lib/access-control";
import { canonicalFinancialName } from "@/lib/cierre-domain";

export class CierreAccountingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type CierreAccountingScope = { from: string; to: string; sedeId: number | null };
export type CierreAccounting = {
  financial: string;
  correctedAmount: number | null;
  collectedAmount: number | null;
  hidden: boolean;
  note: string | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
};
type AccountingPatch = Pick<CierreAccounting, "financial" | "version"> &
  Partial<Pick<CierreAccounting, "correctedAmount" | "collectedAmount" | "hidden" | "note">>;
type AccountingRow = {
  financial: string; correctedAmount: unknown; collectedAmount: unknown;
  hidden: boolean; note: string | null; version: number; updatedAt: Date; updatedBy: string;
};
type AccountingActor = {
  id: number; perfilId?: number | null; perfilNombre?: string | null;
  nombre?: string | null; usuario?: string; rolNombre?: unknown; perfilTipo?: unknown;
};
const STANDARD_FINANCIALS = new Set(["SUMASPAY", "PAYJOY", "ADDI", "SISTECREDITO", "ALO CREDIT", "FINSERPAY"]);

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
  return { financial, correctedAmount: null, collectedAmount: null, hidden: false,
    note: null, version: 0, updatedAt: null, updatedBy: null };
}

function accountingDto(row: AccountingRow): CierreAccounting {
  return { financial: row.financial,
    correctedAmount: row.correctedAmount === null ? null : Number(row.correctedAmount),
    collectedAmount: row.collectedAmount === null ? null : Number(row.collectedAmount),
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
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999_999_999_999.99 ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || !Number.isSafeInteger(Math.round(value * 100))) {
    throw new CierreAccountingError(`${field} debe ser un importe no negativo, con máximo dos decimales.`);
  }
  return Math.round(value * 100) / 100;
}

export function parseCierreAccountingPatch(value: unknown): AccountingPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CierreAccountingError("Datos del ajuste inválidos.");
  const body = value as Record<string, unknown>;
  const allowed = new Set(["financial", "version", "correctedAmount", "collectedAmount", "hidden", "note"]);
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
  const next = { correctedAmount: patch.correctedAmount === undefined ? before.correctedAmount : patch.correctedAmount,
    collectedAmount: patch.collectedAmount === undefined ? before.collectedAmount : patch.collectedAmount,
    hidden: patch.hidden ?? before.hidden, note: patch.note === undefined ? before.note : patch.note };
  if (next.correctedAmount !== null && !next.note) throw new CierreAccountingError("Indica una observación para identificar el valor corregido.");
  if (existing && next.correctedAmount === before.correctedAmount && next.collectedAmount === before.collectedAmount &&
    next.hidden === before.hidden && next.note === before.note) return before;
  const updatedBy = actor.perfilNombre || actor.nombre || actor.usuario || `Administrador ${actor.id}`;
  const data = { ...next, updatedBy, updatedById: actor.id, updatedByProfileId: actor.perfilId ?? null, version: before.version + 1 };
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
