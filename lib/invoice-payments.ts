import { createHash } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { esAdministradorCentral } from "@/lib/access-control";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { decimalProveedorACentavos, centavosADecimalProveedor } from "@/lib/proveedores-pagos";
import { resolveInvoiceProvider, InvoiceProviderError } from "@/lib/invoice-providers";

export class InvoicePaymentsError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_INPUT") { super(message); }
}

type InvoiceSession = { id: number; perfilId?: number | null; perfilNombre?: string | null;
  nombre?: string | null; usuario?: string; rolNombre?: unknown; perfilTipo?: unknown };
type DecimalLike = number | string | { toString(): string };
type InvoiceRecord = {
  id: number; number: string; provider: string; providerId?: number | null; date: Date; amount: DecimalLike; paidAmount: DecimalLike;
  dueDate?: Date | null; deletedAt?: Date | null; deletedBy?: string | null;
  status: string; version: number; _count?: { payments: number };
};
export type InvoiceDueStatus = "SIN_FECHA" | "AL_DIA" | "PROXIMA" | "HOY" | "VENCIDA" | "PAGADA";
export type AdministrativeInvoice = {
  id: number; number: string; provider: string; providerId: number | null; date: string; amount: number; paidAmount: number;
  dueDate: string | null; dueStatus: InvoiceDueStatus; deletedAt: string | null; deletedBy: string | null;
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

function optionalDueDate(value: unknown, invoiceDate: Date) {
  if (value === undefined || value === null) return null;
  const date = validDate(value, "La fecha de vencimiento");
  if (date < invoiceDate) throw new InvoicePaymentsError("El vencimiento no puede ser anterior a la fecha de la factura.");
  return date;
}

export function invoiceDueStatus(dueDate: string | null, paid: boolean, today = getDateKeyInColombia()): InvoiceDueStatus {
  if (paid) return "PAGADA";
  if (!dueDate) return "SIN_FECHA";
  if (dueDate < today) return "VENCIDA";
  if (dueDate === today) return "HOY";
  const days = (validDate(dueDate).getTime() - validDate(today).getTime()) / 86_400_000;
  return days <= 7 ? "PROXIMA" : "AL_DIA";
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

function invoiceDto(row: InvoiceRecord, paymentCount = row._count?.payments ?? 0, today = getDateKeyInColombia()): AdministrativeInvoice {
  const amount = storedCents(row.amount);
  const paid = storedCents(row.paidAmount);
  if (paid > amount) throw new InvoicePaymentsError("El saldo registrado requiere revisión.", 503, "INVALID_STORED_BALANCE");
  const dueDate = row.dueDate?.toISOString().slice(0, 10) ?? null;
  return { id: row.id, number: row.number, provider: row.provider, providerId: row.providerId ?? null, date: row.date.toISOString().slice(0, 10),
    dueDate, dueStatus: invoiceDueStatus(dueDate, paid === amount, today),
    deletedAt: row.deletedAt?.toISOString() ?? null, deletedBy: row.deletedBy ?? null,
    amount: amount / 100, paidAmount: paid / 100, balance: (amount - paid) / 100,
    status: paid === amount ? "PAGADA" : "PENDIENTE", paymentCount, version: row.version };
}

function replayResult(hash: string, expected: string, response: unknown) {
  if (hash !== expected) throw new InvoicePaymentsError("La referencia del intento ya fue usada con datos diferentes. Revisa el formulario.", 409, "IDEMPOTENCY_CONFLICT");
  if (!response || typeof response !== "object" || !("invoice" in response)) {
    throw new InvoicePaymentsError("El intento anterior no tiene un resultado verificable.", 503, "INCOMPLETE_REQUEST");
  }
  const invoice = (response as { invoice: AdministrativeInvoice }).invoice;
  // Older request snapshots predate optional due dates and reversible removal.
  // Keep their financial/version result while supplying the new nullable fields.
  return { invoice: { ...invoice, providerId: invoice.providerId ?? null, dueDate: invoice.dueDate ?? null,
    dueStatus: invoice.dueStatus ?? invoiceDueStatus(invoice.dueDate ?? null, invoice.status === "PAGADA"),
    deletedAt: invoice.deletedAt ?? null, deletedBy: invoice.deletedBy ?? null }, replayed: true };
}

export function parseAdministrativeInvoice(value: unknown) {
  const body = record(value, ["requestId", "number", "provider", "providerId", "date", "dueDate", "amount"]);
  const number = inputText(body.number, "El número de factura", 160);
  const providerId = body.providerId === undefined || body.providerId === null ? null : body.providerId;
  if (providerId !== null && (typeof providerId !== "number" || !Number.isSafeInteger(providerId) || providerId < 1 || providerId > 2_147_483_647)) {
    throw new InvoicePaymentsError("Selecciona un proveedor válido.");
  }
  const provider = inputText(body.provider, "El proveedor", 160, providerId !== null) || undefined;
  const date = validDate(body.date);
  const dueDate = optionalDueDate(body.dueDate, date);
  const cents = moneyCents(body.amount);
  return { requestId: requestId(body.requestId), number, provider, providerId, date, dueDate, cents,
    // Null/omitted dueDate retains the exact hash of earlier create requests.
    requestHash: digest({ number, ...(providerId === null ? { provider } : { providerId }), date: body.date, cents, ...(dueDate ? { dueDate: body.dueDate } : {}) }) };
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

function invoiceListFilters(params: URLSearchParams) {
  const today = getDateKeyInColombia();
  const month = params.get("month") || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new InvoicePaymentsError("Selecciona un mes válido.");
  const from = validDate(`${month}-01`);
  const until = new Date(from); until.setUTCMonth(until.getUTCMonth() + 1);
  const search = normalized(inputText(params.get("search") || "", "La búsqueda", 160, true));
  const searchWhere: Prisma.FacturaAdministrativaWhereInput = search ? { OR: [
    { providerNormalized: { contains: search } }, { numberNormalized: { contains: search.replace(/\s+/g, "") } },
  ] } : {};
  const where: Prisma.FacturaAdministrativaWhereInput = { date: { gte: from, lt: until }, ...searchWhere };
  return { today, month, where, searchWhere };
}

export async function readInvoicePayments(params: URLSearchParams, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const { today, month, where: monthWhere, searchWhere } = invoiceListFilters(params);
  const pendingPage = pageNumber(params, "pendingPage");
  const paidPage = pageNumber(params, "paidPage");
  const pendingWhere = { ...searchWhere, deletedAt: null, status: "PENDIENTE" };
  const paidWhere = { ...monthWhere, deletedAt: null, status: "PAGADA" };
  // The visible report combines all open debts with the selected month's paid
  // invoices. Search applies to both groups; the month never hides an open debt.
  const where = { OR: [pendingWhere, paidWhere] };
  const todayDate = validDate(today);
  const afterSoon = new Date(todayDate); afterSoon.setUTCDate(afterSoon.getUTCDate() + 8);
  return prisma.$transaction(async (tx) => {
    const [summary, pendingCount, paidCount, overdueCount, dueSoonCount] = await Promise.all([
      tx.facturaAdministrativa.aggregate({ where, _sum: { amount: true, paidAmount: true }, _count: { _all: true } }),
      tx.facturaAdministrativa.count({ where: pendingWhere }),
      tx.facturaAdministrativa.count({ where: paidWhere }),
      tx.facturaAdministrativa.count({ where: { ...pendingWhere, dueDate: { lt: todayDate } } }),
      tx.facturaAdministrativa.count({ where: { ...pendingWhere, dueDate: { gte: todayDate, lt: afterSoon } } }),
    ]);
    async function group(status: "PENDIENTE" | "PAGADA", requested: number, total: number) {
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(requested, pages);
      const rows = await tx.facturaAdministrativa.findMany({ where: status === "PENDIENTE" ? pendingWhere : paidWhere,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { date: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        include: { _count: { select: { payments: true } } } });
      return { items: rows.map((row) => invoiceDto(row, row._count.payments, today)), page, pageSize: PAGE_SIZE, total, pages };
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
    return { month, today, pendingScope: "ALL_MONTHS" as const, paidMonth: month, summary: { invoiceCount: summary._count._all, totalAmount: total / 100,
      paidAmount: collected / 100, balance: (total - collected) / 100, pendingCount, paidCount, overdueCount, dueSoonCount }, pending, paid };
  }, { isolationLevel: "RepeatableRead", timeout: 20_000 });
}

export async function readInvoiceAlerts(session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const today = getDateKeyInColombia();
  const afterSoon = validDate(today); afterSoon.setUTCDate(afterSoon.getUTCDate() + 8);
  const rows = await prisma.facturaAdministrativa.findMany({ where: {
    deletedAt: null, status: "PENDIENTE", dueDate: { lt: afterSoon },
  }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { date: "asc" }, { id: "asc" }],
  select: { id: true, number: true, provider: true, dueDate: true, amount: true, paidAmount: true, version: true } });
  const counts = { overdue: 0, dueToday: 0, dueSoon: 0 };
  let balanceCents = BigInt(0);
  const entries = rows.map((row) => {
    const dueDate = row.dueDate!.toISOString().slice(0, 10);
    const dueStatus = invoiceDueStatus(dueDate, false, today);
    const balance = storedCents(row.amount) - storedCents(row.paidAmount);
    if (balance <= 0) throw new InvoicePaymentsError("El saldo registrado requiere revisión.", 503, "INVALID_STORED_BALANCE");
    balanceCents += BigInt(balance);
    if (dueStatus === "VENCIDA") counts.overdue += 1;
    else if (dueStatus === "HOY") counts.dueToday += 1;
    else if (dueStatus === "PROXIMA") counts.dueSoon += 1;
    return { id: row.id, number: row.number, provider: row.provider, dueDate, balance: balance / 100, dueStatus, version: row.version };
  });
  if (balanceCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new InvoicePaymentsError("El saldo de las alertas supera el máximo representable.", 503);
  // Dismissal follows every relevant invoice, including those beyond page one.
  // A new day or any edit/payment must expose the changed state to the user.
  const fingerprint = digest({ today, invoices: entries.map(({ id, version, dueStatus }) => ({ id, version, dueStatus })) });
  return { today, counts, total: rows.length, balance: Number(balanceCents) / 100,
    items: entries.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE, fingerprint };
}

export async function readDeletedAdministrativeInvoices(params: URLSearchParams, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const { where: monthWhere, today } = invoiceListFilters(params);
  const requestedPage = pageNumber(params, "page");
  const where = { ...monthWhere, deletedAt: { not: null } };
  return prisma.$transaction(async (tx) => {
    const total = await tx.facturaAdministrativa.count({ where });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const rows = await tx.facturaAdministrativa.findMany({ where, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { date: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { _count: { select: { payments: true } } } });
    return { items: rows.map((row) => invoiceDto(row, row._count.payments, today)), page, pageSize: PAGE_SIZE, total, pages };
  }, { isolationLevel: "RepeatableRead", timeout: 20_000 });
}

export async function readAdministrativeInvoice(id: number, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  return prisma.$transaction(async (tx) => {
    const row = await tx.facturaAdministrativa.findUnique({ where: { id },
      include: { payments: { orderBy: [{ date: "desc" }, { id: "desc" }] }, events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } });
    if (!row) throw new InvoicePaymentsError("Factura no encontrada.", 404, "NOT_FOUND");
    return { invoice: { ...invoiceDto(row, row.payments.length), payments: row.payments.map((payment) => ({
      id: payment.id, date: payment.date.toISOString().slice(0, 10), amount: storedCents(payment.amount) / 100,
      reference: payment.reference, createdBy: payment.createdBy, createdAt: payment.createdAt.toISOString(),
    })), events: row.events.map((event) => ({ id: event.id, action: event.action, createdBy: event.createdBy,
      createdAt: event.createdAt.toISOString(), snapshot: event.snapshot })) } };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}

async function throwDuplicateInvoice(providerId: number | null, provider: string | undefined, number: string): Promise<never> {
  const duplicate = await prisma.facturaAdministrativa.findFirst({ where: {
    ...(providerId === null ? { providerNormalized: normalized(provider || "") } : { providerId }),
    numberNormalized: normalized(number).replace(/\s+/g, ""),
  } });
  if (duplicate?.deletedAt) throw new InvoicePaymentsError("La factura está eliminada. Restáurala desde Facturas eliminadas para corregirla.", 409, "DUPLICATE_DELETED_INVOICE");
  throw new InvoicePaymentsError("Ya existe una factura con ese número para el proveedor indicado.", 409, "DUPLICATE_INVOICE");
}

export async function createAdministrativeInvoice(value: unknown, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const input = parseAdministrativeInvoice(value);
  const creator = actor(session);
  let resolvedProviderId = input.providerId;
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.facturaAdministrativa.findUnique({ where: { createRequestId: input.requestId } });
      if (previous) return replayResult(previous.createRequestHash, input.requestHash, previous.createResult);
      const provider = await resolveInvoiceProvider(tx, input);
      resolvedProviderId = provider.id;
      const created = await tx.facturaAdministrativa.create({ data: { number: input.number,
        numberNormalized: normalized(input.number).replace(/\s+/g, ""), provider: provider.name, providerId: provider.id,
        providerNormalized: normalized(provider.name), date: input.date, dueDate: input.dueDate, amount: decimal(input.cents),
        createRequestId: input.requestId, createRequestHash: input.requestHash, ...creator } });
      const invoice = invoiceDto(created);
      await tx.facturaAdministrativa.update({ where: { id: created.id }, data: { createResult: { invoice } } });
      return { invoice, replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.facturaAdministrativa.findUnique({ where: { createRequestId: input.requestId } });
    if (previous) return replayResult(previous.createRequestHash, input.requestHash, previous.createResult);
    return throwDuplicateInvoice(resolvedProviderId, input.provider, input.number);
  }
}

type InvoiceAdminAction = "EDIT" | "DELETE" | "RESTORE";

function administrativeChangeInput(id: number, action: InvoiceAdminAction, value: unknown) {
  const body = record(value, action === "EDIT" ? ["requestId", "version", "number", "provider", "providerId", "date", "dueDate", "amount"] : ["requestId", "version"]);
  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 1) {
    throw new InvoicePaymentsError("Actualiza y revisa la factura antes de guardar el cambio.");
  }
  const key = requestId(body.requestId);
  const fields = action === "EDIT" ? parseAdministrativeInvoice({ requestId: key, number: body.number,
    provider: body.provider, providerId: body.providerId, date: body.date, dueDate: body.dueDate, amount: body.amount }) : null;
  const dueDateProvided = Object.hasOwn(body, "dueDate");
  return { requestId: key, version: body.version, fields, dueDateProvided,
    requestHash: digest({ action, id, version: body.version, ...(fields ? { number: fields.number,
      ...(fields.providerId === null ? { provider: fields.provider } : { providerId: fields.providerId }), date: body.date, cents: fields.cents,
      dueDate: dueDateProvided ? body.dueDate : "PRESERVE" } : {}) }) };
}

async function changeAdministrativeInvoice(id: number, value: unknown, action: InvoiceAdminAction, session: InvoiceSession | null) {
  assertInvoicePaymentsAccess(session);
  const input = administrativeChangeInput(id, action, value);
  const creator = actor(session);
  let resolvedProviderId = input.fields?.providerId ?? null;
  try {
    return await prisma.$transaction(async (tx) => {
      // Edits, removal, restoration and payments use the same invoice row lock.
      // No operation may approve an amount from a stale view of its balance.
      const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "FacturaAdministrativa" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked.length) throw new InvoicePaymentsError("Factura no encontrada.", 404, "NOT_FOUND");
      const previous = await tx.invoiceAdminEvent.findUnique({ where: { requestId: input.requestId } });
      if (previous) return replayResult(previous.requestHash, input.requestHash, previous.responseSnapshot);
      const invoice = await tx.facturaAdministrativa.findUniqueOrThrow({ where: { id }, include: { _count: { select: { payments: true } } } });
      if (invoice.version !== input.version) throw new InvoicePaymentsError("La factura cambió. Actualiza y revisa los datos antes de guardar.", 409, "STALE_VERSION");
      const before = invoiceDto(invoice);
      let data: Prisma.FacturaAdministrativaUncheckedUpdateInput;
      if (action === "EDIT") {
        if (invoice.deletedAt) throw new InvoicePaymentsError("La factura está eliminada. Restáurala para corregirla.", 409, "INVOICE_DELETED");
        const fields = input.fields!;
        const paid = storedCents(invoice.paidAmount);
        if (fields.cents < paid) throw new InvoicePaymentsError("El valor de la factura no puede ser menor que el total pagado.", 409, "AMOUNT_BELOW_PAID");
        const dueDate = input.dueDateProvided ? fields.dueDate : invoice.dueDate;
        if (dueDate && dueDate < fields.date) throw new InvoicePaymentsError("El vencimiento no puede ser anterior a la fecha de la factura.");
        const provider = await resolveInvoiceProvider(tx, { ...fields, existing: invoice });
        resolvedProviderId = provider.id;
        data = { number: fields.number, numberNormalized: normalized(fields.number).replace(/\s+/g, ""),
          provider: provider.name, providerId: provider.id, providerNormalized: normalized(provider.name), date: fields.date, dueDate,
          amount: decimal(fields.cents), status: fields.cents === paid ? "PAGADA" : "PENDIENTE", version: { increment: 1 } };
      } else if (action === "DELETE") {
        if (invoice.deletedAt) throw new InvoicePaymentsError("La factura ya está en Facturas eliminadas.", 409, "ALREADY_DELETED");
        data = { deletedAt: new Date(), deletedById: creator.createdById, deletedByProfileId: creator.createdByProfileId,
          deletedBy: creator.createdBy, version: { increment: 1 } };
      } else {
        if (!invoice.deletedAt) throw new InvoicePaymentsError("La factura ya está activa.", 409, "NOT_DELETED");
        data = { deletedAt: null, deletedById: null, deletedByProfileId: null, deletedBy: null, version: { increment: 1 } };
      }
      const updated = await tx.facturaAdministrativa.update({ where: { id }, data });
      const after = invoiceDto(updated, invoice._count.payments);
      const response = { invoice: after };
      await tx.invoiceAdminEvent.create({ data: { invoiceId: id, action, requestId: input.requestId,
        requestHash: input.requestHash, snapshot: { before, after }, responseSnapshot: response, ...creator } });
      return { ...response, replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.invoiceAdminEvent.findUnique({ where: { requestId: input.requestId } });
    if (previous) return replayResult(previous.requestHash, input.requestHash, previous.responseSnapshot);
    if (input.fields) return throwDuplicateInvoice(resolvedProviderId, input.fields.provider, input.fields.number);
    throw new InvoicePaymentsError("No fue posible confirmar este intento. Reintenta con los mismos datos.", 409, "IDEMPOTENCY_CONFLICT");
  }
}

export function editAdministrativeInvoice(id: number, value: unknown, session: InvoiceSession | null) {
  return changeAdministrativeInvoice(id, value, "EDIT", session);
}
export function deleteAdministrativeInvoice(id: number, value: unknown, session: InvoiceSession | null) {
  return changeAdministrativeInvoice(id, value, "DELETE", session);
}
export function restoreAdministrativeInvoice(id: number, value: unknown, session: InvoiceSession | null) {
  return changeAdministrativeInvoice(id, value, "RESTORE", session);
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
      if (invoice.deletedAt) throw new InvoicePaymentsError("La factura está eliminada. Restáurala antes de registrar pagos.", 409, "INVOICE_DELETED");
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
  return error instanceof InvoicePaymentsError || error instanceof InvoiceProviderError ? invoiceJson({ error: error.message, code: error.code }, error.status)
    : invoiceJson({ error: "No fue posible completar la operación. Intenta de nuevo.", code: "UNAVAILABLE" }, 503);
}
