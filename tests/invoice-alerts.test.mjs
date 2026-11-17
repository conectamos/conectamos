import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, admin, invoice } from "./invoice-payments-test-helpers.mjs";

const date = (key) => new Date(`${key}T00:00:00.000Z`);
function setup(rows = [], session = admin, today = "2026-11-16") {
  const db = database({ facturaAdministrativa: rows });
  let currentDay = today;
  const loader = modules(db.prisma, { session, mocks: { "@/lib/credit-date-utils": { getDateKeyInColombia: () => currentDay } } });
  return { db, loader, service: loader.load("lib/invoice-payments.ts"), setDay: (day) => { currentDay = day; } };
}

test("alertas incluyen deudas antiguas, hoy y siete días siguientes; excluyen pagadas, eliminadas y sin fecha", async () => {
  const rows = [invoice(1, { date: date("2026-01-01"), dueDate: date("2026-02-01"), amount: "100.29", paidAmount: "10.10" }),
    invoice(2, { dueDate: date("2026-11-16"), amount: "200.00" }), invoice(3, { dueDate: date("2026-11-23"), amount: "300.00" }),
    invoice(4, { dueDate: date("2026-11-24") }), invoice(5),
    invoice(6, { dueDate: date("2026-11-15"), status: "PAGADA", paidAmount: "1000000.00" }),
    invoice(7, { dueDate: date("2026-11-15"), deletedAt: new Date() })];
  const { service } = setup(rows);
  const result = await service.readInvoiceAlerts(admin);
  assert.deepEqual(result.counts, { overdue: 1, dueToday: 1, dueSoon: 1 });
  assert.equal(result.total, 3); assert.equal(result.balance, 590.19); assert.equal(result.more, false);
  assert.deepEqual(result.items.map(({ id, dueStatus }) => ({ id, dueStatus })), [
    { id: 1, dueStatus: "VENCIDA" }, { id: 2, dueStatus: "HOY" }, { id: 3, dueStatus: "PROXIMA" },
  ]);
  assert.equal(result.items[0].dueDate, "2026-02-01");
  assert.deepEqual(Object.keys(result.items[0]).sort(), ["balance", "dueDate", "dueStatus", "id", "number", "provider", "version"]);
});

test("alertas limitan detalle a diez pero saldo, conteos y huella incluyen todos los resultados", async () => {
  const rows = Array.from({ length: 14 }, (_, index) => invoice(index + 1, {
    date: date(index % 2 ? "2026-09-01" : "2026-10-01"), dueDate: date("2026-11-15"), amount: "10.29", paidAmount: "0.10",
  }));
  const { db, service } = setup(rows);
  const first = await service.readInvoiceAlerts(admin);
  assert.equal(first.total, 14); assert.equal(first.items.length, 10); assert.equal(first.more, true); assert.equal(first.balance, 142.66);
  assert.deepEqual(first.counts, { overdue: 14, dueToday: 0, dueSoon: 0 });
  assert.deepEqual(first.items.map(({ id }) => id), [2, 4, 6, 8, 10, 12, 14, 1, 3, 5]);
  const hidden = db.tables.facturaAdministrativa.find((row) => row.id === 13);
  hidden.version += 1; hidden.paidAmount = "1.10";
  const updated = await service.readInvoiceAlerts(admin);
  assert.deepEqual(updated.items, first.items); assert.notEqual(updated.fingerprint, first.fingerprint); assert.equal(updated.balance, 141.66);
  hidden.status = "PAGADA"; hidden.paidAmount = hidden.amount; hidden.version += 1;
  const paid = await service.readInvoiceAlerts(admin);
  assert.equal(paid.total, 13); assert.notEqual(paid.fingerprint, updated.fingerprint);
});

test("huella cambia con el día Bogotá y estados; permanecer en el mismo estado no cambia al consultar", async () => {
  const { service, setDay } = setup([invoice(1, { dueDate: date("2026-11-17") })]);
  const first = await service.readInvoiceAlerts(admin);
  assert.equal((await service.readInvoiceAlerts(admin)).fingerprint, first.fingerprint);
  setDay("2026-11-17");
  const next = await service.readInvoiceAlerts(admin);
  assert.equal(next.counts.dueToday, 1); assert.equal(next.counts.dueSoon, 0); assert.notEqual(next.fingerprint, first.fingerprint);
  setDay("2026-11-18");
  const overdue = await service.readInvoiceAlerts(admin);
  assert.equal(overdue.counts.overdue, 1); assert.notEqual(overdue.fingerprint, next.fingerprint);
});

test("búsqueda y mes del reporte no restringen notificaciones globales", async () => {
  const { loader, service } = setup([invoice(1, { date: date("2026-01-01"), dueDate: date("2026-02-01") }), invoice(2, { dueDate: date("2026-11-20") })]);
  const report = await service.readInvoicePayments(new URLSearchParams("month=2025-01&search=FACT-2"), admin);
  assert.equal(report.pending.total, 1); assert.equal(report.summary.overdueCount, 0);
  const route = loader.load("app/api/pago-facturas/alerts/route.ts");
  const response = await route.GET(new Request("https://conectamos.test/api/pago-facturas/alerts?month=2025-01&search=FACT-2"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  const alerts = await response.json();
  assert.equal(alerts.total, 2); assert.deepEqual(alerts.counts, { overdue: 1, dueToday: 0, dueSoon: 1 });
});

test("alertas vacías son cero confirmado y la ruta deniega sin consultar para roles no centrales", async () => {
  const { service } = setup();
  const empty = await service.readInvoiceAlerts(admin);
  assert.deepEqual(empty.counts, { overdue: 0, dueToday: 0, dueSoon: 0 });
  assert.equal(empty.total, 0); assert.equal(empty.balance, 0); assert.equal(empty.more, false); assert.deepEqual(empty.items, []);
  for (const session of [null, { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }, { ...admin, perfilTipo: "SUPERVISOR_TIENDA" }, { ...admin, perfilTipo: "VENDEDOR" }]) {
    const fixture = setup([], session);
    await assert.rejects(fixture.service.readInvoiceAlerts(session), (error) => error.status === (session ? 403 : 401));
    const response = await fixture.loader.load("app/api/pago-facturas/alerts/route.ts").GET();
    assert.equal(response.status, session ? 403 : 401); assert.equal(fixture.db.calls.length, 0);
  }
});
