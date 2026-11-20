import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { modules, database, admin, invoice } from "./invoice-payments-test-helpers.mjs";

const day = value => new Date(`${value}T00:00:00.000Z`);
function setup(seed = {}, session = admin) {
  const db = database(seed); const loader = modules(db.prisma, { session });
  const service = loader.load("lib/invoice-payments.ts");
  return { db, loader, service, report: (month, extra = "") => service.readInvoicePayments(new URLSearchParams(`month=${month}${extra}`), session) };
}
const create = (overrides = {}) => ({ requestId: "paid-month-create-001", number: "FACT-OCT-001", provider: "Proveedor QA", date: "2026-10-01", amount: 100.29, ...overrides });
const pay = (overrides = {}) => ({ requestId: "paid-month-payment-001", version: 1, date: "2026-11-17", mode: "full", ...overrides });
const edit = (version, overrides = {}) => ({ requestId: `paid-month-edit-${version}`, version, number: "FACT-OCT-001", providerId: 1, date: "2026-10-01", dueDate: null, amount: 100.29, ...overrides });

test("factura de octubre pagada en noviembre pertenece a noviembre con fecha factura histórica intacta", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  const result = await x.service.recordAdministrativeInvoicePayment(1, pay(), admin);
  assert.equal(result.invoice.paidDate, "2026-11-17"); assert.equal(result.invoice.date, "2026-10-01");
  const october = await x.report("2026-10"); const november = await x.report("2026-11");
  assert.equal(october.paid.total, 0); assert.equal(october.summary.invoiceCount, 0);
  assert.equal(november.paid.total, 1); assert.equal(november.summary.totalAmount, 100.29); assert.equal(november.summary.balance, 0);
  assert.equal(november.paid.items[0].paidDate, "2026-11-17"); assert.equal(november.paid.items[0].date, "2026-10-01");
  assert.equal(x.db.tables.facturaAdministrativa[0].paidDate.toISOString(), "2026-11-17T00:00:00.000Z");
});

test("abonos de noviembre y diciembre sólo ubican la factura pagada en el mes de cancelación total", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  const partial = await x.service.recordAdministrativeInvoicePayment(1, pay({ mode: "partial", amount: 40.10 }), admin);
  assert.equal(partial.invoice.paidDate, null); assert.equal((await x.report("2020-01")).pending.total, 1);
  const full = await x.service.recordAdministrativeInvoicePayment(1, pay({ requestId: "paid-month-final-dec", version: 2, date: "2026-12-01" }), admin);
  assert.equal(full.invoice.paidDate, "2026-12-01"); assert.equal((await x.report("2026-11")).paid.total, 0);
  assert.equal((await x.report("2026-12")).paid.total, 1);
  const detail = await x.service.readAdministrativeInvoice(1, admin);
  assert.deepEqual(detail.invoice.payments.map(item => [item.date, item.amount]), [["2026-12-01", 60.19], ["2026-11-17", 40.10]]);
});

test("pagos registrados fuera de orden usan máxima fecha efectiva y nunca createdAt, updatedAt ni orden de inserción", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  await x.service.recordAdministrativeInvoicePayment(1, pay({ mode: "partial", amount: 40.10, date: "2026-12-03" }), admin);
  x.db.tables.pagoFacturaAdministrativa[0].createdAt = day("2040-01-01");
  x.db.tables.facturaAdministrativa[0].updatedAt = day("2041-01-01");
  const final = await x.service.recordAdministrativeInvoicePayment(1, pay({ requestId: "paid-month-backdated", version: 2, date: "2026-11-02" }), admin);
  assert.equal(final.invoice.paidDate, "2026-12-03"); assert.equal((await x.report("2026-11")).paid.total, 0);
  assert.equal((await x.report("2026-12")).paid.total, 1); assert.equal((await x.report("2040-01")).paid.total, 0);
});

test("editar la fecha de factura no traslada el pago a otro mes ni altera su historial", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  await x.service.recordAdministrativeInvoicePayment(1, pay(), admin);
  const changed = await x.service.editAdministrativeInvoice(1, edit(2, { date: "2026-09-12" }), admin);
  assert.equal(changed.invoice.date, "2026-09-12"); assert.equal(changed.invoice.paidDate, "2026-11-17");
  assert.equal((await x.report("2026-09")).paid.total, 0); assert.equal((await x.report("2026-11")).paid.total, 1);
  assert.equal(x.db.tables.pagoFacturaAdministrativa[0].date.toISOString(), "2026-11-17T00:00:00.000Z");
});

test("subir el total vuelve a pendiente y saldar después asigna la nueva fecha sin reutilizar el mes anterior", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  await x.service.recordAdministrativeInvoicePayment(1, pay(), admin);
  const raised = await x.service.editAdministrativeInvoice(1, edit(2, { amount: 150.50 }), admin);
  assert.equal(raised.invoice.status, "PENDIENTE"); assert.equal(raised.invoice.paidDate, null); assert.equal(raised.invoice.balance, 50.21);
  const november = await x.report("2026-11"); assert.equal(november.paid.total, 0); assert.equal(november.pending.total, 1);
  const settled = await x.service.recordAdministrativeInvoicePayment(1, pay({ requestId: "paid-month-resettle", version: 3, date: "2027-01-05" }), admin);
  assert.equal(settled.invoice.paidDate, "2027-01-05"); assert.equal((await x.report("2026-11")).paid.total, 0);
  assert.equal((await x.report("2027-01")).paid.total, 1);
});

test("reducir el importe a lo ya abonado toma la fecha real de esos pagos y deja trazabilidad", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  await x.service.recordAdministrativeInvoicePayment(1, pay({ mode: "partial", amount: 40.10 }), admin);
  const result = await x.service.editAdministrativeInvoice(1, edit(2, { amount: 40.10 }), admin);
  assert.equal(result.invoice.status, "PAGADA"); assert.equal(result.invoice.paidDate, "2026-11-17");
  assert.equal((await x.report("2026-11")).paid.total, 1); assert.equal(x.db.tables.invoiceAdminEvent.length, 1);
  assert.equal(x.db.tables.pagoFacturaAdministrativa.length, 1);
});

test("mes de pago, proveedor y paginación comparten universo; pagadas sin fecha se informan sin inventar mes", async () => {
  const paidRows = Array.from({ length: 12 }, (_, i) => invoice(i + 1, { providerId: 1, date: day("2026-10-01"), paidDate: day(`2026-11-${String(i + 1).padStart(2, "0")}`), amount: "100.29", paidAmount: "100.29", status: "PAGADA" }));
  const x = setup({ facturaAdministrativa: [...paidRows,
    invoice(30, { providerId: 1, date: day("2024-01-01"), amount: "150.50", paidAmount: "50.25", paidDate: null }),
    invoice(31, { providerId: 1, date: day("2026-11-01"), amount: "999.00", paidAmount: "999.00", status: "PAGADA", paidDate: null }),
    invoice(32, { providerId: 2, date: day("2026-10-01"), amount: "700.00", paidAmount: "700.00", status: "PAGADA", paidDate: day("2026-11-01") }),
    invoice(33, { providerId: 2, amount: "800.00", paidAmount: "800.00", status: "PAGADA", paidDate: null }),
  ] });
  const before = structuredClone(x.db.tables);
  const first = await x.report("2026-11", "&providerId=1"); const second = await x.report("2026-11", "&providerId=1&paidPage=2");
  assert.equal(first.paid.total, 12); assert.equal(first.paid.items.length, 10); assert.equal(second.paid.items.length, 2);
  assert.equal(first.pending.total, 1); assert.deepEqual(second.summary, first.summary);
  assert.equal(first.summary.totalAmount, 1353.98); assert.equal(first.summary.paidAmount, 1253.73); assert.equal(first.summary.balance, 100.25);
  assert.equal(first.summary.undatedPaidCount, 1); assert.equal(first.summary.invoiceCount, 13);
  assert.ok([...first.paid.items, ...second.paid.items].every(item => item.providerId === 1 && item.paidDate.startsWith("2026-11")));
  const otherMonth = await x.report("2026-10", "&providerId=1"); assert.equal(otherMonth.paid.total, 0); assert.equal(otherMonth.summary.undatedPaidCount, 1);
  const searched = await x.report("2026-11", "&providerId=1&search=FACT-31"); assert.equal(searched.summary.undatedPaidCount, 1); assert.equal(searched.summary.invoiceCount, 0);
  assert.deepEqual(x.db.tables, before, "Consultar periodos no debe migrar ni modificar información");
});

test("reintento, comprobante PDF y eliminación/restauración conservan el mes del pago y todo su historial", async () => {
  const x = setup(); await x.service.createAdministrativeInvoice(create(), admin);
  const bytes = Uint8Array.from(Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF\n"));
  const receipt = { name: "Comprobante QA.pdf", bytes, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const first = await x.service.recordAdministrativeInvoicePayment(1, pay(), admin, receipt);
  const replay = await x.service.recordAdministrativeInvoicePayment(1, pay(), admin, receipt);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.invoice, first.invoice);
  const paymentId = x.db.tables.pagoFacturaAdministrativa[0].id;
  await x.service.deleteAdministrativeInvoice(1, { requestId: "paid-month-delete", version: 2 }, admin);
  assert.equal((await x.report("2026-11")).paid.total, 0);
  const deletedOctober = await x.service.readDeletedAdministrativeInvoices(new URLSearchParams("month=2026-10"), admin);
  const deletedNovember = await x.service.readDeletedAdministrativeInvoices(new URLSearchParams("month=2026-11"), admin);
  assert.equal(deletedOctober.total, 1); assert.equal(deletedNovember.total, 0);
  const downloaded = await x.loader.load("lib/invoice-payment-receipts.ts").readInvoicePaymentReceipt(1, paymentId, admin);
  assert.deepEqual([...downloaded.bytes], [...bytes]);
  await x.service.restoreAdministrativeInvoice(1, { requestId: "paid-month-restore", version: 3 }, admin);
  assert.equal((await x.report("2026-11")).paid.items[0].paidDate, "2026-11-17");
  assert.equal(x.db.tables.pagoFacturaAdministrativa.length, 1); assert.equal(x.db.tables.invoicePaymentReceipt.length, 1);
});

test("mes de pago y conteos sin fecha mantienen permiso central antes de cualquier lectura", async () => {
  for (const session of [null, { ...admin, perfilTipo: "VENDEDOR" }, { ...admin, perfilTipo: "SUPERVISOR_TIENDA" }]) {
    const x = setup({}, session); const response = await x.loader.load("app/api/pago-facturas/route.ts").GET(new Request("https://conectamos.test/api/pago-facturas?month=2026-11"));
    assert.equal(response.status, session ? 403 : 401); assert.equal(x.db.calls.length, 0);
  }
});

test("saldar un registro antiguo con abonos previos sin historial no inventa su fecha de pago total", async () => {
  const x = setup({ facturaAdministrativa: [invoice(1, { amount: "100.00", paidAmount: "40.00", paidDate: null })] });
  const result = await x.service.recordAdministrativeInvoicePayment(1, pay(), admin);
  assert.equal(result.invoice.status, "PAGADA"); assert.equal(result.invoice.balance, 0); assert.equal(result.invoice.paidDate, null);
  const report = await x.report("2026-11"); assert.equal(report.paid.total, 0); assert.equal(report.summary.undatedPaidCount, 1);
  assert.equal(x.db.tables.pagoFacturaAdministrativa.length, 1); assert.equal(x.db.tables.pagoFacturaAdministrativa[0].amount, "60.00");
});

const migration = readFileSync(new URL("../scripts/apply-cierre-schema.sql", import.meta.url), "utf8");
async function historicalInvoice(pg, id, { amount = "100.00", paidAmount = amount, status = "PAGADA", deleted = false } = {}) {
  await pg.query(`INSERT INTO "FacturaAdministrativa" ("id","number","numberNormalized","provider","providerNormalized","date","amount","paidAmount","status","deletedAt","createRequestId","createRequestHash","createdById","createdBy","createdAt","updatedAt")
    VALUES ($1,$2,$2,'Proveedor SQL QA','PROVEEDOR SQL QA','2026-10-01',$3,$4,$5,$6,$7,'qa',7,'Administrador QA','2040-01-01','2041-01-01')`,
  [id, `HIST-${id}`, amount, paidAmount, status, deleted ? day("2026-11-18") : null, `historical-${id}`]);
}
async function historicalPayment(pg, invoiceId, id, date, amount, before) {
  await pg.query(`INSERT INTO "PagoFacturaAdministrativa" ("id","invoiceId","requestId","requestHash","responseSnapshot","date","mode","amount","balanceBefore","balanceAfter","invoiceNumberSnapshot","providerSnapshot","invoiceAmountSnapshot","createdById","createdBy","createdAt")
    VALUES ($1,$2,$3,'qa','{}',$4,'partial',$5,$6,($6::numeric-$5::numeric),$7,'Proveedor SQL QA',100,7,'Administrador QA','2042-01-01')`,
  [id, invoiceId, `historical-payment-${id}`, date, amount, before, `HIST-${invoiceId}`]);
}

test("migración PostgreSQL recupera sólo fechas acreditadas, respeta pendientes y se puede ejecutar de nuevo", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE "Venta" (id INTEGER PRIMARY KEY); CREATE TABLE "RegistroVendedorVenta" (id INTEGER PRIMARY KEY,"ventaIdRelacionada" INTEGER);');
    await pg.exec(migration);
    await pg.exec("SET TIME ZONE 'America/Los_Angeles';");
    await historicalInvoice(pg, 1); await historicalInvoice(pg, 2);
    await historicalInvoice(pg, 3, { paidAmount: "40.00", status: "PENDIENTE" });
    await historicalInvoice(pg, 4, { deleted: true });
    await historicalInvoice(pg, 5);
    await historicalPayment(pg, 1, 1, "2026-11-17", "40.00", "100.00");
    await historicalPayment(pg, 1, 2, "2026-10-28", "60.00", "60.00");
    await historicalPayment(pg, 3, 3, "2026-11-18", "40.00", "100.00");
    await historicalPayment(pg, 4, 4, "2027-01-01", "100.00", "100.00");
    await historicalPayment(pg, 5, 5, "2026-11-15", "40.00", "100.00");
    // Null is the state of already stored rows before the new column was populated.
    await pg.exec('UPDATE "FacturaAdministrativa" SET "paidDate"=NULL;');
    await pg.exec(migration);
    const read = async () => (await pg.query('SELECT "id","paidDate"::text AS "paidDate","date"::text AS "date" FROM "FacturaAdministrativa" ORDER BY "id"')).rows;
    assert.deepEqual(await read(), [
      { id: 1, paidDate: "2026-11-17", date: "2026-10-01" }, { id: 2, paidDate: null, date: "2026-10-01" },
      { id: 3, paidDate: null, date: "2026-10-01" }, { id: 4, paidDate: "2027-01-01", date: "2026-10-01" },
      { id: 5, paidDate: null, date: "2026-10-01" },
    ]);
    const before = await read(); await pg.exec(migration); assert.deepEqual(await read(), before);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM "PagoFacturaAdministrativa"')).rows[0].n, 5);
    // During a rolling deploy an older process updates the invoice first and
    // inserts its payment next without knowing the new paidDate column.
    await historicalInvoice(pg, 6, { paidAmount: "0.00", status: "PENDIENTE" });
    await pg.exec('UPDATE "FacturaAdministrativa" SET "paidAmount"=40 WHERE "id"=6;');
    await historicalPayment(pg, 6, 6, "2026-11-30", "40.00", "100.00");
    await pg.exec('UPDATE "FacturaAdministrativa" SET "paidAmount"=100,"status"=\'PAGADA\' WHERE "id"=6;');
    assert.equal((await read()).find(row => row.id === 6).paidDate, null, "El INSERT aún no acredita el saldo final");
    await historicalPayment(pg, 6, 7, "2026-11-05", "60.00", "60.00");
    assert.equal((await read()).find(row => row.id === 6).paidDate, "2026-11-30");
    await pg.exec('UPDATE "FacturaAdministrativa" SET "amount"=150,"status"=\'PENDIENTE\' WHERE "id"=6;');
    assert.equal((await read()).find(row => row.id === 6).paidDate, null);
  } finally { await pg.close(); }
});
