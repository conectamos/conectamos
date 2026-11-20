import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, admin, invoice } from "./invoice-payments-test-helpers.mjs";

const date = value => new Date(`${value}T00:00:00.000Z`);
const catalog = [
  { id: 1, name: "Proveedor Alfa actual", nameNormalized: "PROVEEDOR ALFA ACTUAL", active: true, version: 2 },
  { id: 2, name: "Proveedor Alfa secundario", nameNormalized: "PROVEEDOR ALFA SECUNDARIO", active: true, version: 1 },
  { id: 3, name: "Proveedor Histórico", nameNormalized: "PROVEEDOR HISTORICO", active: false, version: 3 },
  { id: 4, name: "Catálogo sin facturas", nameNormalized: "CATALOGO SIN FACTURAS", active: true, version: 1 },
];
function row(id, providerId, changes = {}) {
  return invoice(id, { providerId, provider: providerId === 1 ? "Proveedor Alfa anterior" : catalog.find(item => item.id === providerId).name,
    providerNormalized: providerId === 1 ? "PROVEEDOR ALFA ANTERIOR" : catalog.find(item => item.id === providerId).nameNormalized,
    date: date("2026-11-01"), amount: "100.29", paidAmount: "10.10", ...changes });
}
function fixture(session = admin) {
  const pending = Array.from({ length: 12 }, (_, i) => row(i + 1, 1, {
    number: `DEUDA-${i + 1}`, numberNormalized: `DEUDA-${i + 1}`,
    date: date(i % 2 ? "2025-12-01" : "2026-11-01"),
    dueDate: i < 4 ? date(["2026-11-17", "2026-11-18", "2026-11-25", "2026-11-26"][i]) : null,
  }));
  const db = database({ proveedorAdministrativo: catalog, facturaAdministrativa: [...pending,
    row(101, 1, { status: "PAGADA", paidDate: date("2026-11-19"), amount: "200.19", paidAmount: "200.19" }),
    row(102, 1, { status: "PAGADA", paidDate: date("2026-10-31"), amount: "300.29", paidAmount: "300.29" }),
    row(103, 1, { status: "PAGADA", paidDate: date("2025-12-31"), amount: "400.39", paidAmount: "400.39" }),
    row(104, 1, { status: "PAGADA", paidDate: date("2026-01-01"), amount: "500.49", paidAmount: "500.49" }),
    row(201, 2, { number: "DEUDA-1", numberNormalized: "DEUDA-1", amount: "9000.00", paidAmount: "0.00", dueDate: date("2026-11-17") }),
    row(202, 2, { status: "PAGADA", paidDate: date("2026-11-19"), amount: "9000.00", paidAmount: "9000.00" }),
    row(301, 3, { date: date("2024-01-01"), amount: "60.19", paidAmount: "10.00" }),
    row(302, 3, { deletedAt: date("2026-11-17") }),
    row(303, 3, { deletedAt: date("2026-10-31"), date: date("2026-10-31") }),
    row(105, 1, { deletedAt: date("2026-11-17"), amount: "9999.00", paidAmount: "0.00" }),
  ] });
  const loader = modules(db.prisma, { session, mocks: { "@/lib/credit-date-utils": { getDateKeyInColombia: () => "2026-11-18" } } });
  const service = loader.load("lib/invoice-payments.ts");
  return { db, loader, service, read: query => service.readInvoicePayments(new URLSearchParams(query), session) };
}

test("proveedor exacto incluye toda su deuda histórica y sólo pagadas del mes, con totales de todas las páginas", async () => {
  const x = fixture();
  const result = await x.read("month=2026-11&providerId=1");
  assert.equal(result.pendingScope, "ALL_MONTHS"); assert.equal(result.paidMonth, "2026-11");
  assert.equal(result.pending.total, 12); assert.equal(result.pending.items.length, 10); assert.equal(result.pending.pages, 2);
  assert.ok(result.pending.items.every(item => item.providerId === 1));
  assert.deepEqual(result.paid.items.map(item => item.id), [101]);
  assert.deepEqual(result.summary, { invoiceCount: 13, totalAmount: 1403.67, paidAmount: 321.39, balance: 1082.28,
    pendingCount: 12, paidCount: 1, overdueCount: 1, dueSoonCount: 2, undatedPaidCount: 0 });
  const second = await x.read("month=2026-11&providerId=1&pendingPage=999&paidPage=999");
  assert.equal(second.pending.page, 2); assert.equal(second.pending.items.length, 2); assert.equal(second.paid.page, 1);
  assert.deepEqual(second.summary, result.summary);
  assert.equal(new Set([...result.pending.items, ...second.pending.items].map(item => item.id)).size, 12);
});

test("selector devuelve catálogo completo incluso inactivos y sin facturas, sin depender de búsqueda o página", async () => {
  const x = fixture(); const before = structuredClone(x.db.tables);
  const result = await x.read("month=2026-11&providerId=1&search=NO-EXISTE&pendingPage=2");
  assert.equal(result.summary.invoiceCount, 0);
  assert.deepEqual(result.providerOptions, [...catalog].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, active }) => ({ id, name, active })));
  assert.equal(result.providerOptions.find(item => item.id === 3).active, false);
  assert.deepEqual(x.db.tables, before, "Un filtro no debe editar facturas, proveedores ni su historial");
});

test("búsqueda y proveedor se combinan sin mezclar nombres parecidos ni perder snapshot tras renombre", async () => {
  const x = fixture();
  const result = await x.read("month=2026-11&providerId=1&search=DEUDA-1");
  assert.equal(result.pending.total, 4); assert.equal(result.paid.total, 0);
  assert.deepEqual(result.pending.items.map(item => item.id).sort((a, b) => a - b), [1, 10, 11, 12]);
  assert.ok(result.pending.items.every(item => item.provider === "Proveedor Alfa anterior"));
  assert.equal(result.summary.totalAmount, 401.16); assert.equal(result.summary.balance, 360.76);
  const other = await x.read("month=2026-11&providerId=2&search=DEUDA-1");
  assert.deepEqual(other.pending.items.map(item => item.id), [201]); assert.equal(other.summary.balance, 9000);
});

test("proveedor inactivo mantiene deuda antigua y filtro de eliminadas conserva el mes y la identidad", async () => {
  const x = fixture();
  const result = await x.read("month=2026-11&providerId=3");
  assert.deepEqual(result.pending.items.map(item => item.id), [301]); assert.equal(result.summary.balance, 50.19);
  const deleted = await x.service.readDeletedAdministrativeInvoices(new URLSearchParams("month=2026-11&providerId=3"), admin);
  assert.deepEqual(deleted.items.map(item => item.id), [302]); assert.equal(deleted.total, 1);
  assert.equal(deleted.providerOptions.length, catalog.length);
  const october = await x.service.readDeletedAdministrativeInvoices(new URLSearchParams("month=2026-10&providerId=3"), admin);
  assert.deepEqual(october.items.map(item => item.id), [303]);
});

test("cambio de año afecta pagadas filtradas sin ocultar pendientes anteriores", async () => {
  const x = fixture();
  const december = await x.read("month=2025-12&providerId=1");
  const january = await x.read("month=2026-01&providerId=1");
  assert.deepEqual(december.paid.items.map(item => item.id), [103]); assert.deepEqual(january.paid.items.map(item => item.id), [104]);
  assert.equal(december.pending.total, 12); assert.deepEqual(january.pending, december.pending);
  assert.equal(december.summary.totalAmount, 1603.87); assert.equal(january.summary.totalAmount, 1703.97);
});

test("proveedor ausente o vacío significa Todos; ID desconocido devuelve vacío sin ampliar consulta", async () => {
  const x = fixture();
  const all = await x.read("month=2026-11"); const blank = await x.read("month=2026-11&providerId=");
  assert.deepEqual(blank, all); assert.equal(all.pending.total, 14); assert.equal(all.paid.total, 2);
  const missing = await x.read("month=2026-11&providerId=2147483647");
  assert.equal(missing.summary.totalAmount, 0); assert.equal(missing.summary.invoiceCount, 0);
  assert.equal(missing.pending.total, 0); assert.equal(missing.paid.total, 0); assert.equal(missing.providerOptions.length, catalog.length);
});

test("IDs inválidos o duplicados se rechazan antes de consultar facturas o catálogo", async () => {
  const x = fixture();
  for (const query of ["providerId=0", "providerId=-1", "providerId=%2B1", "providerId=1.1", "providerId=1e0", "providerId=%201", "providerId=abc", "providerId=2147483648", "providerId=1&providerId=2", "providerId=&providerId=1"]) {
    await assert.rejects(x.read(`month=2026-11&${query}`), error => error.status === 400, query);
    await assert.rejects(x.service.readDeletedAdministrativeInvoices(new URLSearchParams(`month=2026-11&${query}`), admin), error => error.status === 400, query);
  }
  assert.equal(x.db.calls.length, 0);
});

test("ruta mantiene permiso central antes de devolver opciones o totales del proveedor", async () => {
  for (const session of [null, { ...admin, perfilTipo: "SUPERVISOR_TIENDA" }, { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }]) {
    const x = fixture(session); const route = x.loader.load("app/api/pago-facturas/route.ts");
    for (const suffix of ["", "&deleted=1"]) {
      const response = await route.GET(new Request(`https://conectamos.test/api/pago-facturas?month=2026-11&providerId=3${suffix}`));
      assert.equal(response.status, session ? 403 : 401);
      const body = await response.json(); assert.equal(body.providerOptions, undefined); assert.equal(body.summary, undefined);
    }
    assert.equal(x.db.calls.length, 0);
  }
});
