import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { modules, database, admin, invoice, payment } from "./invoice-payments-test-helpers.mjs";

const date = (day) => new Date(`${day}T00:00:00.000Z`);
const month = (extra = "") => new URLSearchParams(`month=2026-10${extra}`);
const change = (overrides = {}) => ({ requestId: "edit-request-001", version: 1, number: "FAC-001", provider: "Proveedor QA", date: "2026-10-15", dueDate: "2026-11-20", amount: 100, ...overrides });
const pay = (overrides = {}) => ({ requestId: "pay-request-001", version: 1, date: "2026-11-05", mode: "partial", amount: 40, ...overrides });
const remove = (overrides = {}) => ({ requestId: "delete-request-001", version: 1, ...overrides });
function setup(seed = {}, session = admin, options = {}) {
  const db = database(seed, options);
  const loader = modules(db.prisma, { session, mocks: { "@/lib/credit-date-utils": { getDateKeyInColombia: () => "2026-11-16" } } });
  return { db, loader, service: loader.load("lib/invoice-payments.ts") };
}

test("vencimientos usan días civiles Bogotá, hoy y los siguientes siete días; pagadas no alertan", () => {
  const { service } = setup();
  for (const [day, expected] of [[null, "SIN_FECHA"], ["2026-11-15", "VENCIDA"], ["2026-11-16", "HOY"],
    ["2026-11-17", "PROXIMA"], ["2026-11-23", "PROXIMA"], ["2026-11-24", "AL_DIA"]]) {
    assert.equal(service.invoiceDueStatus(day, false), expected);
    assert.equal(service.invoiceDueStatus(day, true), "PAGADA");
  }
  const realDates = modules({}).load("lib/credit-date-utils.ts");
  assert.equal(realDates.getDateKeyInColombia(new Date("2026-11-17T04:59:59Z")), "2026-11-16");
  assert.equal(realDates.getDateKeyInColombia(new Date("2026-11-17T05:00:00Z")), "2026-11-17");
});

test("vencimiento opcional valida la factura y el hash de alta anterior sigue siendo reutilizable", async () => {
  const input = { requestId: "create-request-legacy", number: "FAC-001", provider: "Proveedor QA", date: "2026-10-15", amount: 100 };
  const hash = createHash("sha256").update(JSON.stringify({ number: input.number, provider: input.provider, date: input.date, cents: 10000 })).digest("hex");
  const oldResult = { invoice: { id: 1, number: input.number, provider: input.provider, date: input.date, amount: 100,
    paidAmount: 0, balance: 100, status: "PENDIENTE", paymentCount: 0, version: 1 } };
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { createRequestId: input.requestId, createRequestHash: hash, createResult: oldResult })] });
  assert.equal(service.parseAdministrativeInvoice(input).requestHash, hash);
  assert.equal(service.parseAdministrativeInvoice({ ...input, dueDate: null }).requestHash, hash);
  const result = await service.createAdministrativeInvoice(input, admin);
  assert.equal(result.replayed, true); assert.equal(result.invoice.dueDate, null); assert.equal(result.invoice.dueStatus, "SIN_FECHA");
  assert.deepEqual(db.tables.facturaAdministrativa[0].createResult, oldResult);
  assert.throws(() => service.parseAdministrativeInvoice({ ...input, dueDate: "2026-10-14" }), /anterior/);
  assert.throws(() => service.parseAdministrativeInvoice({ ...input, dueDate: "2026-02-30" }), /existe/);
  assert.equal(service.parseAdministrativeInvoice({ ...input, dueDate: "2026-10-15" }).dueDate.toISOString(), "2026-10-15T00:00:00.000Z");
});

test("resumen de vencidas y próximas incluye pendientes de cualquier mes y excluye pagadas o eliminadas", async () => {
  const overdue = Array.from({ length: 12 }, (_, index) => invoice(index + 1, { dueDate: date("2026-11-15") }));
  const rows = [...overdue, invoice(20, { dueDate: date("2026-11-16") }), invoice(21, { dueDate: date("2026-11-23") }),
    invoice(22, { dueDate: date("2026-11-24") }), invoice(23),
    invoice(24, { dueDate: date("2026-11-15"), paidDate: date("2026-10-30"), status: "PAGADA", paidAmount: "1000000.00" }),
    invoice(25, { dueDate: date("2026-11-15"), deletedAt: new Date(), deletedBy: "Admin QA" }),
    invoice(26, { date: date("2026-11-01"), dueDate: date("2026-11-15") })];
  const { service } = setup({ facturaAdministrativa: rows });
  const result = await service.readInvoicePayments(month("&pendingPage=2"), admin);
  assert.equal(result.summary.overdueCount, 13); assert.equal(result.summary.dueSoonCount, 2);
  assert.equal(result.summary.invoiceCount, 18);
  assert.equal(result.pending.items.length, 7);
  const filtered = await service.readInvoicePayments(month("&search=FACT-20"), admin);
  assert.equal(filtered.summary.overdueCount, 0); assert.equal(filtered.summary.dueSoonCount, 1);
});

test("orden por vencimiento se aplica antes de paginar; fechas vacías al final y empates estables", async () => {
  const rows = Array.from({ length: 13 }, (_, index) => invoice(index + 1, { dueDate: date(`2026-11-${String(25 - index).padStart(2, "0")}`) }));
  rows.push(invoice(20), invoice(21, { dueDate: date("2026-11-13"), date: date("2026-10-14") }),
    invoice(22, { dueDate: date("2026-11-13"), date: date("2026-10-14") }));
  const paid = rows.map((row) => ({ ...row, id: row.id + 100, status: "PAGADA", paidAmount: row.amount, paidDate: date("2026-10-30") }));
  const deleted = rows.map((row) => ({ ...row, id: row.id + 200, deletedAt: new Date(), deletedBy: "QA" }));
  const { service } = setup({ facturaAdministrativa: [...rows, ...paid, ...deleted] });
  const page1 = await service.readInvoicePayments(month(), admin);
  const page2 = await service.readInvoicePayments(month("&pendingPage=2&paidPage=2"), admin);
  assert.deepEqual(page1.pending.items.slice(0, 3).map((row) => row.id), [21, 22, 13]);
  assert.equal(page2.pending.items.at(-1).id, 20);
  assert.deepEqual(page1.paid.items.map((row) => row.id), page1.pending.items.map((row) => row.id + 100));
  assert.equal(page2.paid.items.at(-1).id, 120);
  const removed = await service.readDeletedAdministrativeInvoices(month("&page=2"), admin);
  assert.equal(removed.items.at(-1).id, 220); assert.equal(removed.page, 2); assert.equal(removed.total, 16);
});

test("editar conserva abonos y sus snapshots, usa mes efectivo del pago y no permite importe inferior a pagado", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00", paidAmount: "40.00", version: 2 })],
    pagoFacturaAdministrativa: [payment(1, 1, { amount: "40.00", invoiceAmountSnapshot: "100.00" })] });
  const oldPayments = structuredClone(db.tables.pagoFacturaAdministrativa);
  await assert.rejects(service.editAdministrativeInvoice(1, change({ version: 2, amount: 39.99 }), admin), (error) => error.code === "AMOUNT_BELOW_PAID");
  assert.equal(db.tables.invoiceAdminEvent.length, 0);
  const paid = await service.editAdministrativeInvoice(1, change({ version: 2, amount: 40, date: "2026-11-01", number: "CORREGIDA-001" }), admin);
  assert.equal(paid.invoice.status, "PAGADA"); assert.equal(paid.invoice.dueStatus, "PAGADA"); assert.equal(paid.invoice.paymentCount, 1);
  assert.equal(paid.invoice.paidDate, "2026-11-05");
  assert.equal((await service.readInvoicePayments(month(), admin)).summary.invoiceCount, 0);
  assert.equal((await service.readInvoicePayments(new URLSearchParams("month=2026-11"), admin)).paid.total, 1);
  const pending = await service.editAdministrativeInvoice(1, change({ requestId: "edit-request-002", version: 3, amount: 150 }), admin);
  assert.equal(pending.invoice.status, "PENDIENTE"); assert.equal(pending.invoice.balance, 110);
  assert.deepEqual(db.tables.pagoFacturaAdministrativa, oldPayments);
  assert.equal(db.tables.invoiceAdminEvent[0].snapshot.before.amount, 100);
  assert.equal(db.tables.invoiceAdminEvent[0].snapshot.after.amount, 40);
  assert.equal(db.tables.invoiceAdminEvent[0].createdBy, admin.perfilNombre);
});

test("omitir vencimiento en edición lo conserva; no deja mover factura después del vencimiento conservado", async () => {
  const { service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00", dueDate: date("2026-11-20") })] });
  const input = change(); delete input.dueDate;
  const result = await service.editAdministrativeInvoice(1, input, admin);
  assert.equal(result.invoice.dueDate, "2026-11-20");
  await assert.rejects(service.editAdministrativeInvoice(1, { ...input, requestId: "edit-request-002", version: 2, date: "2026-11-21" }, admin), /anterior/);
});

test("eliminación reversible conserva factura y pagos, la excluye de totales y registra quién la eliminó y restauró", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00", paidAmount: "40.00" })],
    pagoFacturaAdministrativa: [payment(1, 1, { amount: "40.00" })] });
  const removed = await service.deleteAdministrativeInvoice(1, remove(), admin);
  assert.ok(removed.invoice.deletedAt); assert.equal(removed.invoice.deletedBy, admin.perfilNombre);
  const active = await service.readInvoicePayments(month(), admin);
  assert.equal(active.summary.invoiceCount, 0); assert.equal(active.summary.totalAmount, 0); assert.equal(active.summary.paidAmount, 0);
  assert.equal((await service.readDeletedAdministrativeInvoices(month(), admin)).total, 1);
  const detail = await service.readAdministrativeInvoice(1, admin);
  assert.equal(detail.invoice.payments.length, 1); assert.equal(detail.invoice.events[0].action, "DELETE");
  await assert.rejects(service.recordAdministrativeInvoicePayment(1, pay({ version: 2 }), admin), (error) => error.code === "INVOICE_DELETED");
  const restored = await service.restoreAdministrativeInvoice(1, { requestId: "restore-request-001", version: 2 }, admin);
  assert.equal(restored.invoice.deletedAt, null); assert.equal(restored.invoice.deletedBy, null); assert.equal(restored.invoice.balance, 60);
  assert.equal((await service.readDeletedAdministrativeInvoices(month(), admin)).total, 0);
  assert.equal((await service.readInvoicePayments(month(), admin)).summary.paidAmount, 40);
  assert.equal(db.tables.facturaAdministrativa.length, 1); assert.equal(db.tables.pagoFacturaAdministrativa.length, 1);
  assert.equal(db.tables.invoiceAdminEvent[1].snapshot.before.deletedBy, admin.perfilNombre);
});

test("edición/eliminación/restauración son idempotentes y no reutilizan claves con otros datos", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00" })] });
  const first = await service.editAdministrativeInvoice(1, change(), admin);
  assert.deepEqual((await service.editAdministrativeInvoice(1, change(), admin)).invoice, first.invoice);
  await assert.rejects(service.editAdministrativeInvoice(1, change({ amount: 200 }), admin), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  const deletion = remove({ version: 2 });
  const deleted = await service.deleteAdministrativeInvoice(1, deletion, admin);
  assert.deepEqual((await service.deleteAdministrativeInvoice(1, deletion, admin)).invoice, deleted.invoice);
  await assert.rejects(service.restoreAdministrativeInvoice(1, deletion, admin), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  const restoration = { requestId: "restore-request-001", version: 3 };
  const restored = await service.restoreAdministrativeInvoice(1, restoration, admin);
  assert.deepEqual((await service.restoreAdministrativeInvoice(1, restoration, admin)).invoice, restored.invoice);
  assert.equal(db.tables.invoiceAdminEvent.length, 3);
});

test("edición o eliminación concurrente con pago comparte lock/versión y nunca sobrescribe el otro resultado", async () => {
  for (const kind of ["edit", "delete"]) {
    const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00" })] });
    const results = await Promise.allSettled([
      kind === "edit" ? service.editAdministrativeInvoice(1, change({ amount: 200 }), admin) : service.deleteAdministrativeInvoice(1, remove(), admin),
      service.recordAdministrativeInvoicePayment(1, pay(), admin),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(["STALE_VERSION", "INVOICE_DELETED"].includes(rejected.reason.code));
    assert.equal(db.tables.pagoFacturaAdministrativa.length + db.tables.invoiceAdminEvent.length, 1);
    assert.equal(db.tables.facturaAdministrativa[0].version, 2);
  }
});

test("falla de auditoría revierte edición, eliminación y restauración dentro de la misma transacción", async () => {
  for (const operation of ["editAdministrativeInvoice", "deleteAdministrativeInvoice", "restoreAdministrativeInvoice"]) {
    const row = invoice(1, { amount: "100.00", ...(operation === "restoreAdministrativeInvoice" ? { deletedAt: new Date(), deletedBy: "QA" } : {}) });
    const { db, service } = setup({ facturaAdministrativa: [row] }, admin, { failEventWrite: true });
    const before = structuredClone(db.tables.facturaAdministrativa[0]);
    await assert.rejects(service[operation](1, operation === "editAdministrativeInvoice" ? change() : remove(), admin), /storage/);
    assert.deepEqual(db.tables.facturaAdministrativa[0], before);
    assert.equal(db.tables.invoiceAdminEvent.length, 0);
  }
});

test("facturas eliminadas mantienen unicidad; conflicto explica cómo restaurarlas", async () => {
  const { service } = setup({ facturaAdministrativa: [invoice(1, { number: "FAC-001", numberNormalized: "FAC-001", deletedAt: new Date() })] });
  const input = { requestId: "create-request-new", number: "FAC-001", provider: "Proveedor QA", date: "2026-10-15", amount: 100 };
  await assert.rejects(service.createAdministrativeInvoice(input, admin), (error) => error.code === "DUPLICATE_DELETED_INVOICE" && /Restáurala/.test(error.message));
});

test("nuevas rutas exigen administrador central y origen permitido antes de acceder a datos", async () => {
  const paths = ["app/api/pago-facturas/[id]/route.ts", "app/api/pago-facturas/[id]/restore/route.ts"];
  const context = { params: Promise.resolve({ id: "1" }) };
  for (const session of [null, { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }, { ...admin, perfilTipo: "SUPERVISOR_TIENDA" }]) {
    const { loader, db } = setup({}, session);
    const item = loader.load(paths[0]); const restore = loader.load(paths[1]); const collection = loader.load("app/api/pago-facturas/route.ts");
    const request = (method) => new Request("https://conectamos.test/api/pago-facturas/1", { method, headers: { Origin: "https://conectamos.test", "Content-Type": "application/json" }, body: JSON.stringify(remove()) });
    const responses = await Promise.all([item.PATCH(request("PATCH"), context), item.DELETE(request("DELETE"), context), restore.POST(request("POST"), context),
      collection.GET(new Request("https://conectamos.test/api/pago-facturas?deleted=1&month=2026-10"))]);
    assert.ok(responses.every((response) => response.status === (session ? 403 : 401)));
    assert.equal(db.calls.length, 0);
  }
  const { loader, db } = setup();
  const foreign = new Request("https://conectamos.test/api/pago-facturas/1", { method: "DELETE", headers: { Origin: "https://ajeno.test", "Content-Type": "application/json" }, body: JSON.stringify(remove()) });
  assert.equal((await loader.load(paths[0]).DELETE(foreign, context)).status, 403);
  assert.equal(db.calls.length, 0);
});
