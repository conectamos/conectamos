import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modules, database, admin, invoice } from "./invoice-payments-test-helpers.mjs";

const createInput = (changes = {}) => ({ requestId: "create-request-001", number: "FAC-001", provider: "Proveedor QA", date: "2026-10-31", amount: 100, ...changes });
const payInput = (changes = {}) => ({ requestId: "payment-request-001", version: 1, date: "2026-11-05", mode: "partial", amount: 40, reference: "Transferencia QA", ...changes });
function setup(seed = {}, session = admin, options = {}) {
  const db = database(seed, options);
  const loader = modules(db.prisma, { session });
  return { db, loader, service: loader.load("lib/invoice-payments.ts") };
}
function request(path, body, changes = {}) {
  return new Request(`https://conectamos.test${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Origin: "https://conectamos.test", "Content-Type": "application/json", ...changes.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...changes });
}
const context = (id) => ({ params: Promise.resolve({ id: String(id) }) });
const detailPath = "app/api/pago-facturas/[id]/route.ts";
const payPath = "app/api/pago-facturas/[id]/payments/route.ts";

test("alta guarda factura independiente, fecha civil, dinero decimal e identidad del administrador", async () => {
  const { db, service } = setup();
  const result = await service.createAdministrativeInvoice(createInput({ amount: 1234567.29 }), admin);
  assert.deepEqual(result.invoice, { id: 1, number: "FAC-001", provider: "Proveedor QA", providerId: 1, date: "2026-10-31", amount: 1234567.29,
    dueDate: null, dueStatus: "SIN_FECHA", deletedAt: null, deletedBy: null,
    paidAmount: 0, balance: 1234567.29, status: "PENDIENTE", paymentCount: 0, version: 1 });
  const saved = db.tables.facturaAdministrativa[0];
  assert.equal(saved.amount, "1234567.29");
  assert.equal(saved.date.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(saved.createdById, admin.id);
  assert.equal(saved.createdByProfileId, admin.perfilId);
  assert.equal(saved.createdBy, admin.perfilNombre);
  assert.deepEqual(saved.createResult, { invoice: result.invoice });
  assert.equal(db.tables.pagoFacturaAdministrativa.length, 0);
});

test("alta idempotente devuelve el resultado original; cuerpo distinto y duplicado normalizado se rechazan", async () => {
  const { db, service } = setup();
  const original = await service.createAdministrativeInvoice(createInput({ provider: "Proveedor Élite", number: "F A C-001" }), admin);
  const retry = await service.createAdministrativeInvoice(createInput({ provider: "Proveedor Élite", number: "F A C-001" }), admin);
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.invoice, original.invoice);
  await assert.rejects(service.createAdministrativeInvoice(createInput({ amount: 200 }), admin), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  await assert.rejects(service.createAdministrativeInvoice(createInput({ requestId: "new-create-request", provider: "proveedor elite", number: "FAC-001" }), admin), (error) => error.code === "DUPLICATE_INVOICE");
  assert.equal(db.tables.facturaAdministrativa.length, 1);
});

test("dos altas concurrentes con el mismo intento crean una sola factura", async () => {
  const { db, service } = setup();
  const results = await Promise.all([
    service.createAdministrativeInvoice(createInput(), admin), service.createAdministrativeInvoice(createInput(), admin),
  ]);
  assert.equal(db.tables.facturaAdministrativa.length, 1);
  assert.deepEqual(results[0].invoice, results[1].invoice);
  assert.equal(results.filter((result) => result.replayed).length, 1);
});

test("abonos parciales y pago total calculan saldo en servidor y conservan historial al pasar a pagadas", async () => {
  const { db, service } = setup();
  await service.createAdministrativeInvoice(createInput({ amount: 100.30 }), admin);
  const first = await service.recordAdministrativeInvoicePayment(1, payInput({ amount: 20.10 }), admin);
  assert.equal(first.invoice.paidAmount, 20.10);
  assert.equal(first.invoice.balance, 80.20);
  assert.equal(first.invoice.status, "PENDIENTE");
  const full = { requestId: "payment-full-002", version: 2, date: "2026-12-01", mode: "full", reference: "Saldo final" };
  const paid = await service.recordAdministrativeInvoicePayment(1, full, admin);
  assert.equal(paid.invoice.paidAmount, 100.30);
  assert.equal(paid.invoice.balance, 0);
  assert.equal(paid.invoice.status, "PAGADA");
  assert.equal(paid.invoice.version, 3);
  assert.equal(paid.invoice.paymentCount, 2);
  assert.equal(db.tables.pagoFacturaAdministrativa[1].amount, "80.20", "El cliente no determina el importe del pago total");
  assert.equal(db.tables.pagoFacturaAdministrativa[1].balanceBefore, "80.20");
  assert.equal(db.tables.pagoFacturaAdministrativa[1].balanceAfter, "0.00");
  assert.equal(db.tables.pagoFacturaAdministrativa[1].invoiceAmountSnapshot, "100.30");
  const history = await service.readAdministrativeInvoice(1, admin);
  assert.equal(history.invoice.payments.length, 2);
  assert.deepEqual(history.invoice.payments.map((row) => row.date), ["2026-12-01", "2026-11-05"]);
  assert.equal(history.invoice.payments[0].reference, "Saldo final");
  assert.equal(history.invoice.payments[0].createdBy, admin.perfilNombre);
  const month = await service.readInvoicePayments(new URLSearchParams("month=2026-10"), admin);
  assert.equal(month.pending.total, 0);
  assert.equal(month.paid.total, 1);
  assert.equal(month.paid.items[0].date, "2026-10-31");
  assert.equal((await service.readInvoicePayments(new URLSearchParams("month=2026-11"), admin)).summary.invoiceCount, 0);
  assert.ok(db.calls.filter((call) => call.table === "$transaction" && call.options.isolationLevel === "RepeatableRead").length >= 3);
});

test("reintento de pago total es idempotente aunque ya cambió la versión; no puede reutilizarse para otra factura", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00" }), invoice(2, { amount: "100.00" })] });
  const full = { requestId: "full-payment-request", version: 1, date: "2026-11-05", mode: "full" };
  const first = await service.recordAdministrativeInvoicePayment(1, full, admin);
  const repeated = await service.recordAdministrativeInvoicePayment(1, full, admin);
  assert.equal(repeated.replayed, true);
  assert.deepEqual(repeated.invoice, first.invoice);
  assert.equal(db.tables.pagoFacturaAdministrativa.length, 1);
  await assert.rejects(service.recordAdministrativeInvoicePayment(1, { ...full, reference: "Otro comprobante" }, admin), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  await assert.rejects(service.recordAdministrativeInvoicePayment(2, full, admin), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  assert.equal(db.tables.facturaAdministrativa[1].paidAmount, "0.00");
});

test("dos pagos simultáneos bloquean la factura: solo uno consume la versión y el saldo", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00" })] });
  const results = await Promise.allSettled([
    service.recordAdministrativeInvoicePayment(1, payInput({ amount: 60 }), admin),
    service.recordAdministrativeInvoicePayment(1, payInput({ requestId: "second-payment-request", amount: 60 }), admin),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failed = results.find((result) => result.status === "rejected");
  assert.equal(failed.reason.code, "STALE_VERSION");
  assert.equal(db.tables.facturaAdministrativa[0].paidAmount, "60.00");
  assert.equal(db.tables.facturaAdministrativa[0].version, 2);
  assert.equal(db.tables.pagoFacturaAdministrativa.length, 1);
  assert.equal(db.calls.filter((call) => call.table === "$queryRaw").length, 2);
});

test("reintentos simultáneos del mismo pago se resuelven sin duplicación", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00" })] });
  const results = await Promise.all([
    service.recordAdministrativeInvoicePayment(1, payInput(), admin), service.recordAdministrativeInvoicePayment(1, payInput(), admin),
  ]);
  assert.deepEqual(results[0].invoice, results[1].invoice);
  assert.equal(results.filter((result) => result.replayed).length, 1);
  assert.equal(db.tables.pagoFacturaAdministrativa.length, 1);
});

test("sobreabono y fallo al guardar historial no alteran el saldo ni generan pagos parciales", async () => {
  const { db, service } = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00" })] }, admin, { failPaymentWrite: true });
  await assert.rejects(service.recordAdministrativeInvoicePayment(1, payInput({ amount: 100.01 }), admin), (error) => error.code === "OVERPAYMENT");
  await assert.rejects(service.recordAdministrativeInvoicePayment(1, payInput(), admin), /storage/);
  assert.equal(db.tables.facturaAdministrativa[0].paidAmount, "0.00");
  assert.equal(db.tables.facturaAdministrativa[0].version, 1);
  assert.equal(db.tables.pagoFacturaAdministrativa.length, 0);
});

test("resumen completo, dos paginaciones y búsqueda comparten el mes de factura", async () => {
  const rows = Array.from({ length: 23 }, (_, index) => invoice(index + 1, { amount: "100.00", paidAmount: "25.00" }));
  rows.push(...Array.from({ length: 12 }, (_, index) => invoice(index + 100, { amount: "100.00", paidAmount: "100.00", status: "PAGADA" })));
  rows.push(invoice(900, { date: new Date("2026-09-30T00:00:00Z") }), invoice(901, { date: new Date("2026-11-01T00:00:00Z") }));
  const { service } = setup({ facturaAdministrativa: rows });
  const result = await service.readInvoicePayments(new URLSearchParams("month=2026-10&pendingPage=2&paidPage=2"), admin);
  assert.deepEqual(result.summary, { invoiceCount: 35, totalAmount: 3500, paidAmount: 1775, balance: 1725, pendingCount: 23, paidCount: 12, overdueCount: 0, dueSoonCount: 0 });
  assert.equal(result.pending.page, 2); assert.equal(result.pending.items.length, 10); assert.equal(result.pending.total, 23);
  assert.equal(result.paid.page, 2); assert.equal(result.paid.items.length, 2); assert.equal(result.paid.total, 12);
  const clamped = await service.readInvoicePayments(new URLSearchParams("month=2026-10&pendingPage=999&paidPage=999"), admin);
  assert.equal(clamped.pending.page, 3); assert.equal(clamped.paid.page, 2);
  const searched = await service.readInvoicePayments(new URLSearchParams("month=2026-10&search=FACT-100"), admin);
  assert.equal(searched.summary.invoiceCount, 1); assert.equal(searched.paid.total, 1); assert.equal(searched.pending.total, 0);
  const empty = await service.readInvoicePayments(new URLSearchParams("month=2025-01"), admin);
  assert.equal(empty.summary.totalAmount, 0); assert.equal(empty.pending.page, 1); assert.equal(empty.paid.pages, 1);
});

test("diciembre y enero se conservan separados sin depender de la fecha de creación o pago", async () => {
  const { service } = setup({ facturaAdministrativa: [invoice(1, { date: new Date("2026-12-31T00:00:00Z") }), invoice(2, { date: new Date("2027-01-01T00:00:00Z") })] });
  assert.equal((await service.readInvoicePayments(new URLSearchParams("month=2026-12"), admin)).pending.items[0].id, 1);
  assert.equal((await service.readInvoicePayments(new URLSearchParams("month=2027-01"), admin)).pending.items[0].id, 2);
});

test("validaciones rechazan dinero ambiguo, fechas inexistentes, cuerpo extra y páginas inválidas", async () => {
  const { service, db } = setup();
  for (const amount of [0, -1, 0.001, NaN, Infinity, "100.00", {}, 1000000000000]) {
    assert.throws(() => service.parseAdministrativeInvoice(createInput({ amount })));
    assert.throws(() => service.parseAdministrativePayment(payInput({ amount }), 1));
  }
  for (const date of ["2026-02-30", "2026-13-01", "2026-1-01", "2026-01-01T05:00:00Z", "1899-12-31", null]) {
    assert.throws(() => service.parseAdministrativeInvoice(createInput({ date })));
  }
  assert.equal(service.parseAdministrativeInvoice(createInput({ date: "2028-02-29", amount: 0.29 })).cents, 29);
  assert.equal(service.parseAdministrativeInvoice(createInput({ amount: 999999999999.99 })).cents, 99999999999999);
  assert.throws(() => service.parseAdministrativePayment(payInput({ mode: "full" }), 1), /saldo/);
  assert.throws(() => service.parseAdministrativeInvoice(createInput({ sedeId: 2 })), /campos/);
  assert.throws(() => service.parseAdministrativePayment(payInput({ reference: "x".repeat(201) }), 1), /200/);
  for (const params of ["month=2026-13", "month=invalid", "month=2026-10&paidPage=1.5", "month=2026-10&pendingPage=0"]) {
    await assert.rejects(service.readInvoicePayments(new URLSearchParams(params), admin));
  }
  assert.equal(db.calls.length, 0, "Valida antes de consultar o modificar la base");
});

test("página API y detalles rechazan toda identidad distinta del administrador central", async () => {
  for (const session of [null, { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }, { ...admin, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" },
    { ...admin, perfilTipo: "VENDEDOR" }, { ...admin, perfilTipo: "FACTURADOR" }, { ...admin, perfilTipo: "BODEGA" }]) {
    const { loader, db } = setup({}, session);
    const list = loader.load("app/api/pago-facturas/route.ts");
    const detail = loader.load(detailPath); const pay = loader.load(payPath);
    const statuses = await Promise.all([
      list.GET(request("/api/pago-facturas?month=2026-10")), list.POST(request("/api/pago-facturas", createInput())),
      detail.GET(request("/api/pago-facturas/1"), context(1)), pay.POST(request("/api/pago-facturas/1/payments", payInput()), context(1)),
    ]);
    assert.ok(statuses.every((response) => response.status === (session ? 403 : 401)));
    assert.equal(db.calls.length, 0, "Rechaza antes de leer facturas o registrar pagos");
  }
});

test("rutas reales aceptan alta/pagos válidos y deniegan origen ajeno, JSON inválido e ID inválido", async () => {
  const { loader, db } = setup();
  const list = loader.load("app/api/pago-facturas/route.ts");
  const pay = loader.load(payPath); const detail = loader.load(detailPath);
  const foreign = new Request("https://conectamos.test/api/pago-facturas", { method: "POST", headers: { Origin: "https://ajeno.test", "Content-Type": "application/json" }, body: JSON.stringify(createInput()) });
  assert.equal((await list.POST(foreign)).status, 403);
  assert.equal((await list.POST(new Request("https://conectamos.test/api/pago-facturas", { method: "POST", headers: { Origin: "https://conectamos.test", "Content-Type": "application/json" }, body: "{" }))).status, 400);
  assert.equal((await detail.GET(request("/api/pago-facturas/no"), context("no"))).status, 400);
  assert.equal((await detail.GET(request("/api/pago-facturas/999"), context(999))).status, 404);
  const created = await list.POST(request("/api/pago-facturas", createInput()));
  assert.equal(created.status, 201); assert.equal((await created.json()).invoice.id, 1);
  assert.equal((await list.POST(request("/api/pago-facturas", createInput()))).status, 200);
  const paid = await pay.POST(request("/api/pago-facturas/1/payments", payInput()), context(1));
  assert.equal(paid.status, 201); assert.equal((await paid.json()).invoice.balance, 60);
  assert.equal((await pay.POST(request("/api/pago-facturas/1/payments", payInput()), context(1))).status, 200);
  assert.equal((await pay.POST(request("/api/pago-facturas/1/payments", payInput({ requestId: "stale-request-002" })), context(1))).status, 409);
  const response = await list.GET(request("/api/pago-facturas?month=2026-10"));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).summary.paidAmount, 40);
  assert.equal(db.tables.facturaAdministrativa.length, 1); assert.equal(db.tables.pagoFacturaAdministrativa.length, 1);
  assert.ok(!loader.imports.some((name) => /cierre-providers|siigo|payjoy-retail|proveedores-push/.test(name)));
});

test("esquema independiente y migración aditiva mantienen restricciones de dinero y trazabilidad", () => {
  const sql = readFileSync(new URL("../scripts/apply-cierre-schema.sql", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "FacturaAdministrativa"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PagoFacturaAdministrativa"/);
  assert.match(sql, /"paidAmount" <= "amount"/);
  assert.match(sql, /"balanceAfter" = "balanceBefore" - "amount"/);
  assert.match(sql, /"invoiceId" INTEGER NOT NULL REFERENCES "FacturaAdministrativa" \("id"\) ON DELETE RESTRICT/);
  assert.match(schema, /model PagoFacturaAdministrativa[\s\S]*?requestId\s+String\s+@unique/);
});
