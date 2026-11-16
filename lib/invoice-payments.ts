import { createHash } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { esAdministradorCentral } from "@/lib/access-control";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { decimalProveedorACentavos, centavosADecimalProveedor } from "@/lib/proveedores-pagos";

export class InvoicePaymentsError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_INPUT") { super(message); }
}

type InvoiceSession = { id: number; perfilId?: number | null; perfilNombre?: string | null;
  nombre?: string | null; usuario?: string; rolNombre?: unknown; perfilTipo?: unknown };
type DecimalLike = number | string | { toString(): string };
type InvoiceRecord = {
  id: number; number: string; provider: string; date: Date; amount: DecimalLike; paidAmount: DecimalLike;
  status: string; version: number; _count?: { payments: number };
};
export type AdministrativeInvoice = {
  id: number; number: string; provider: string; date: string; amount: number; paidAmount: number;
  balance: number; status: "PENDIENTE" | "PAGADA"; paymentCount: number; version: number;
};
const PAGE_SIZE = 10;
const MAX_CENTS = 99_999_999_999_999;

export function assertInvoicePaymentsAccess(session: InvoiceSession | null | undefined): asserts session is InvoiceSession {
  if (!session) throw new InvoicePaymentsError("No autenticado", 401, "UNAUTHENTICATED");
  if (!esAdministradorCentral(session)) throw new InvoicePaymentsError("Solo el administrador central puede gestionar el pago de facturas.", 403, "FORBIDDEN");
}

function actor(session: InvoiceSession) {
  if (!Number.isSafeInteger(session.id) || session.id <= 0) throw new InvoicePaymentsError("No fue posible identificar al administrador.", 403, "FORBIDDEN");
  return { createdById: session.id, createdByProfileId: session.perfilId ?? null,
    createdBy: session.perfilNombre || session.nombre || session.usuario || `Administrador ${session.id}` };
}

function record(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvoicePaymentsError("Los datos enviados no son válidos.");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new InvoicePaymentsError("La solicitud contiene campos no permitidos.");
  return result;
}

function inputText(value: unknown, label: string, max: number, optional = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string") throw new InvoicePaymentsError(`${label} no es válido.`);
  const clean = value.replace(/\s+/g, " ").trim();
  if ((!clean && !optional) || clean.length > max || /[\x00-\x08\x0e-\x1f]/.test(clean)) {
    throw new InvoicePaymentsError(`${label} debe contener ${optional ? "máximo" : "entre 1 y"} ${max} caracteres.`);
  }
  return clean;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("es-CO");
}

function requestId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value)) {
    throw new InvoicePaymentsError("Falta una referencia válida para guardar este intento. Actualiza la página.");
  }
  return value;
}

function validDate(value: unknown, label = "La fecha") {
  if (typeof value !== "string" || !/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(value) && !/^2100-\d{2}-\d{2}$/.test(value)) {
    throw new InvoicePaymentsError(`${label} debe tener formato AAAA-MM-DD y estar entre 1900 y 2100.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new InvoicePaymentsError(`${label} no existe.`);
  return date;
}

function moneyCents(value: unknown, label = "El valor") {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new InvoicePaymentsError(`${label} debe ser un importe válido.`);
  const cents = decimalProveedorACentavos(value);
  if (cents === null || cents <= 0 || cents > MAX_CENTS) throw new InvoicePaymentsError(`${label} debe ser mayor que cero y tener máximo dos decimales.`);
  return cents;
}

function storedCents(value: DecimalLike) {
  const result = decimalProveedorACentavos(value);
  if (result === null) throw new InvoicePaymentsError("No fue posible verificar el importe registrado.", 503, "INVALID_STORED_AMOUNT");
  return result;
}

function decimal(cents: number) {
  const result = centavosADecimalProveedor(cents);
  if (result === null) throw new InvoicePaymentsError("El importe supera el máximo permitido.");
  return result;
}

function digest(value: object) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function uniqueConflict(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"); }

function invoiceDto(row: InvoiceRecord, paymentCount = row._count?.payments ?? 0): AdministrativeInvoice {
  const amount = storedCents(row.amount);
  const paid = storedCents(row.paidAmount);
  if (paid > amount) throw new InvoicePaymentsError("El saldo registrado requiere revisión.", 503, "INVALID_STORED_BALANCE");
  return { id: row.id, number: row.number, provider: row.provider, date: row.date.toISOString().slice(0, 10),
    amount: amount / 100, paidAmount: paid / 100, balance: (amount - paid) / 100,
    status: paid === amount ? "PAGADA" : "PENDIENTE", paymentCount, version: row.version };
}

function replayResult(hash: string, expected: string, response: unknown) {
  if (hash !== expected) throw new InvoicePaymentsError("La referencia del intento ya fue usada con datos diferentes. Revisa el formulario.", 409, "IDEMPOTENCY_CONFLICT");
  if (!response || typeof response !== "object" || !("invoice" in response)) {
    throw new InvoicePaymentsError("El intento anterior no tiene un resultado verificable.", 503, "INCOMPLETE_REQUEST");
  }
  return { invoice: (response as { invoice: AdministrativeInvoice }).invoice, replayed: true };
}

export function parseAdministrativeInvoice(value: unknown) {
  const body = record(value, ["requestId", "number", "provider", "date", "amount"]);
  const number = inputText(body.number, "El número de factura", 160);
  const provider = inputText(body.provider, "El proveedor", 160);
  const date = validDate(body.date);
  const cents = moneyCents(body.amount);
  return { requestId: requestId(body.requestId), number, provider, date, cents,
    requestHash: digest({ number, provider, date: body.date, cents }) };
}

export function parseAdministrativePayment(value: unknown, invoiceId: number) {
  const body = record(value, ["requestId", "version", "date", "mode", "amount", "reference"]);
  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 1) throw new InvoicePaymentsError("Actualiza la factura antes de registrar un pago.");
  if (body.mode !== "partial" && body.mode !== "full") throw new InvoicePaymentsError("Selecciona abono o pago total.");
  if (body.mode === "full" && Object.hasOwn(body, "amount")) throw new InvoicePaymentsError("El pago total se calcula con el saldo de la factura.");
  const cents = body.mode === "partial" ? moneyCents(body.amount, "El abono") : null;
  const date = validDate(body.date, "La fecha del pago");
  const reference = inputText(body.reference, "La referencia del pago", 200, true) || null;
  return { requestId: requestId(body.requestId), version: body.version, date, mode: body.mode, cents, reference,
    requestHash: digest({ invoiceId, version: body.version, date: body.date, mode: body.mode, cents, reference }) };
}

export function administrativeInvoiceId(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new InvoicePaymentsError("La factura no es válida.");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) throw new InvoicePaymentsError("La factura no es válida.");
  return id;
}

function pageNumber(params: URLSearchParams, field: string) {
  const value = params.get(field) || "1";
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new InvoicePaymentsError("La página solicitada no es válida.");
  return Number(value);
}

export async function readInvoicePayments(params: URLSearchParams, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const today = getDateKeyInColombia();
  const month = params.get("month") || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new InvoicePaymentsError("Selecciona un mes válido.");
  const from = validDate(`${month}-01`);
  const until = new Date(from); until.setUTCMonth(until.getUTCMonth() + 1);
  const pendingPage = pageNumber(params, "pendingPage");
  const paidPage = pageNumber(params, "paidPage");
  const search = normalized(inputText(params.get("search") || "", "La búsqueda", 160, true));
  const where: Prisma.FacturaAdministrativaWhereInput = { date: { gte: from, lt: until }, ...(search ? { OR: [
    { providerNormalized: { contains: search } }, { numberNormalized: { contains: search.replace(/\s+/g, "") } },
  ] } : {}) };
  return prisma.$transaction(async (tx) => {
    const [summary, pendingCount, paidCount] = await Promise.all([
      tx.facturaAdministrativa.aggregate({ where, _sum: { amount: true, paidAmount: true }, _count: { _all: true } }),
      tx.facturaAdministrativa.count({ where: { ...where, status: "PENDIENTE" } }),
      tx.facturaAdministrativa.count({ where: { ...where, status: "PAGADA" } }),
    ]);
    async function group(status: "PENDIENTE" | "PAGADA", requested: number, total: number) {
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(requested, pages);
      const rows = await tx.facturaAdministrativa.findMany({ where: { ...where, status },
        orderBy: [{ date: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        include: { _count: { select: { payments: true } } } });
      return { items: rows.map((row) => invoiceDto(row)), page, pageSize: PAGE_SIZE, total, pages };
    }
    const [pending, paid] = await Promise.all([group("PENDIENTE", pendingPage, pendingCount), group("PAGADA", paidPage, paidCount)]);
    // Decimal aggregate strings may exceed the per-invoice limit, so sum values
    // with BigInt cents and reject totals that cannot be represented accurately.
    const sumCents = (value: DecimalLike | null) => {
      const match = String(value ?? "0").match(/^(\d+)(?:\.(\d{1,2}))?$/);
      if (!match) throw new InvoicePaymentsError("No fue posible verificar el total del periodo.", 503);
      const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] || "").padEnd(2, "0"));
      if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new InvoicePaymentsError("El total del periodo supera el máximo representable.", 503);
      return Number(cents);
    };
    const total = sumCents(summary._sum.amount);
    const collected = sumCents(summary._sum.paidAmount);
    return { month, today, summary: { invoiceCount: summary._count._all, totalAmount: total / 100,
      paidAmount: collected / 100, balance: (total - collected) / 100, pendingCount, paidCount }, pending, paid };
  }, { isolationLevel: "RepeatableRead", timeout: 20_000 });
}

export async function readAdministrativeInvoice(id: number, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  return prisma.$transaction(async (tx) => {
    const row = await tx.facturaAdministrativa.findUnique({ where: { id },
      include: { payments: { orderBy: [{ date: "desc" }, { id: "desc" }] } } });
    if (!row) throw new InvoicePaymentsError("Factura no encontrada.", 404, "NOT_FOUND");
    return { invoice: { ...invoiceDto(row, row.payments.length), payments: row.payments.map((payment) => ({
      id: payment.id, date: payment.date.toISOString().slice(0, 10), amount: storedCents(payment.amount) / 100,
      reference: payment.reference, createdBy: payment.createdBy, createdAt: payment.createdAt.toISOString(),
    })) } };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}

export async function createAdministrativeInvoice(value: unknown, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const input = parseAdministrativeInvoice(value);
  const creator = actor(session);
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.facturaAdministrativa.findUnique({ where: { createRequestId: input.requestId } });
      if (previous) return replayResult(previous.createRequestHash, input.requestHash, previous.createResult);
      const created = await tx.facturaAdministrativa.create({ data: { number: input.number,
        numberNormalized: normalized(input.number).replace(/\s+/g, ""), provider: input.provider,
        providerNormalized: normalized(input.provider), date: input.date, amount: decimal(input.cents),
        createRequestId: input.requestId, createRequestHash: input.requestHash, ...creator } });
      const invoice = invoiceDto(created);
      await tx.facturaAdministrativa.update({ where: { id: created.id }, data: { createResult: { invoice } } });
      return { invoice, replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.facturaAdministrativa.findUnique({ where: { createRequestId: input.requestId } });
    if (previous) return replayResult(previous.createRequestHash, input.requestHash, previous.createResult);
    throw new InvoicePaymentsError("Ya existe una factura con ese número para el proveedor indicado.", 409, "DUPLICATE_INVOICE");
  }
}

export async function recordAdministrativeInvoicePayment(id: number, value: unknown, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const input = parseAdministrativePayment(value, id);
  const creator = actor(session);
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize all payments for this invoice. Two different request IDs may
      // not both consume the same balance or version, including full payments.
      const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "FacturaAdministrativa" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked.length) throw new InvoicePaymentsError("Factura no encontrada.", 404, "NOT_FOUND");
      const previous = await tx.pagoFacturaAdministrativa.findUnique({ where: { requestId: input.requestId } });
      if (previous) return replayResult(previous.requestHash, input.requestHash, previous.responseSnapshot);
      const invoice = await tx.facturaAdministrativa.findUniqueOrThrow({ where: { id }, include: { _count: { select: { payments: true } } } });
      if (invoice.version !== input.version) throw new InvoicePaymentsError("La factura cambió. Actualiza y revisa el saldo antes de registrar el pago.", 409, "STALE_VERSION");
      const total = storedCents(invoice.amount);
      const alreadyPaid = storedCents(invoice.paidAmount);
      const balance = total - alreadyPaid;
      if (balance <= 0) throw new InvoicePaymentsError("La factura ya está pagada.", 409, "ALREADY_PAID");
      const cents = input.cents ?? balance;
      if (cents > balance) throw new InvoicePaymentsError("El abono no puede superar el saldo de la factura.", 409, "OVERPAYMENT");
      const afterBalance = balance - cents;
      const updated = await tx.facturaAdministrativa.update({ where: { id }, data: { paidAmount: decimal(alreadyPaid + cents),
        status: afterBalance === 0 ? "PAGADA" : "PENDIENTE", version: { increment: 1 } } });
      const result = { invoice: invoiceDto(updated, invoice._count.payments + 1) };
      await tx.pagoFacturaAdministrativa.create({ data: { invoiceId: id, requestId: input.requestId,
        requestHash: input.requestHash, responseSnapshot: result, date: input.date, mode: input.mode,
        amount: decimal(cents), balanceBefore: decimal(balance), balanceAfter: decimal(afterBalance),
        invoiceNumberSnapshot: invoice.number, providerSnapshot: invoice.provider, invoiceAmountSnapshot: decimal(total),
        reference: input.reference, ...creator } });
      return { ...result, replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.pagoFacturaAdministrativa.findUnique({ where: { requestId: input.requestId } });
    if (previous) return replayResult(previous.requestHash, input.requestHash, previous.responseSnapshot);
    throw new InvoicePaymentsError("No fue posible confirmar este intento. Reintenta con los mismos datos.", 409, "IDEMPOTENCY_CONFLICT");
  }
}

export function assertInvoiceWriteRequest(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const configured = [process.env.APP_URL, process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null];
  const allowed = configured.flatMap((value) => {
    if (!value) return [];
    try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? [parsed.origin] : []; }
    catch { return []; }
  });
  const sameOrigin = origin === url.origin && (url.protocol === "https:" ||
    (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  if (!origin || origin === "null" || request.headers.get("sec-fetch-site") === "cross-site" || (!sameOrigin && !allowed.includes(origin))) {
    throw new InvoicePaymentsError("Origen de la solicitud no permitido.", 403, "FORBIDDEN_ORIGIN");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new InvoicePaymentsError("Envía los datos como JSON.", 415, "INVALID_CONTENT_TYPE");
  }
}

export async function readInvoiceJson(request: Request) {
  try { return await request.json(); } catch { throw new InvoicePaymentsError("Los datos enviados no son JSON válido."); }
}
export function invoiceJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function invoiceErrorResponse(error: unknown) {
  return error instanceof InvoicePaymentsError ? invoiceJson({ error: error.message, code: error.code }, error.status)
    : invoiceJson({ error: "No fue posible completar la operación. Intenta de nuevo.", code: "UNAVAILABLE" }, 503);
}
