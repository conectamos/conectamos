import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, credit, admin, supervisor } from "./cierre-test-helpers.mjs";

const effectiveAt = new Date("2026-09-15T18:00:00Z");
const reviewedAt = new Date("2026-10-01T08:00:00Z");
const params = (extra = "") => new URLSearchParams(`mode=month&month=2026-09${extra}`);
const local = (id, changes = {}) => credit(id, { effectiveAt, ...changes });
function observation(id, changes = {}, evidence = {}) {
  return local(id, { localKey: null, ventaId: null, sedeId: null, providerCreditId: `PAYJOY-${id}`,
    status: "PENDIENTE", source: "API PAYJOY · pendiente de vinculación", ...changes,
    evidence: { source: "list-transactions", providerId: `PAYJOY-${id}`, providerStatus: "FINANCE",
      currency: "COP", principal: 1000000, effectiveDate: effectiveAt.toISOString(), diagnostics: { reasons: [] }, ...evidence } });
}
function dailyJobs(days = 30) {
  return Array.from({ length: days }, (_, index) => {
    const key = `PERIODO:PAYJOY:2026-09-${String(index + 1).padStart(2, "0")}`;
    return { key, localKey: key, financial: "PAYJOY", state: "REVISADO", lastSuccess: reviewedAt };
  });
}
const read = (db, query = params(), session = admin, detail = false, exporting = false) =>
  modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(query, session, detail, exporting);

test("PAYJOY usa órdenes API independientes y no suma locales sin conciliar", async () => {
  const db = database({ cierreSyncTrabajo: dailyJobs(), cierreCredito: [
    observation(1, { localKey: "VENTA:1:PAYJOY", ventaId: 1, sedeId: 1, status: "EFECTIVO", source: "CONECTAMOS + API PAYJOY" }),
    observation(2), observation(3, {}, { principal: 1250000 }), local(4, { amount: 800000 }), local(5, { amount: 700000 }),
  ] });
  const report = await read(db, params("&financier=PAYJOY"), admin, true);
  const row = report.financiers[0];
  assert.equal(report.total, 3);
  assert.deepEqual(report.totals, { units: 3, amount: 3250000 });
  assert.equal(report.items.reduce((sum, item) => sum + item.amount, 0), 3250000);
  assert.ok(report.items.every((item) => item.status === "EFECTIVO" && item.source.includes("API")));
  assert.equal(row.coverageLabel, "Cobertura parcial");
  assert.deepEqual(row.reconciliation, { basis: "PAYJOY_API", api: { units: 3, amount: 3250000 },
    local: { units: 3, amount: 2500000 }, unlinkedApi: { units: 2, amount: 2250000 },
    unmatchedLocal: { units: 2, amount: 1500000 }, daysReviewed: 30, totalDays: 30, delta: { units: 0, amount: 750000 } });
  assert.equal(report.complete, false);
  assert.equal(row.complete, false);
  assert.match(row.source, /API PAYJOY/);
  assert.deepEqual(report.unmatchedLocalItems, []);
});

test("totales, página de diez y exportación usan la misma fuente API", async () => {
  const rows = Array.from({ length: 13 }, (_, index) => observation(index + 1, {}, { principal: 1000000 + index }));
  const db = database({ cierreSyncTrabajo: dailyJobs(), cierreCredito: [...rows, local(30), local(31),
    local(40, { financial: "CELYA", amount: 500000 })] });
  const first = await read(db, params("&financier=PAYJOY"), admin, true);
  const second = await read(db, params("&financier=PAYJOY&page=2"), admin, true);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 3);
  assert.equal(first.total, 13);
  assert.deepEqual(first.totals, second.totals);
  const exported = await read(db, params(), admin, false, true);
  assert.equal(exported.items.length, 14);
  assert.equal(exported.totals.units, 14);
  assert.equal(exported.items.reduce((sum, item) => sum + item.amount, 0), exported.totals.amount);
  assert.equal(exported.unmatchedLocalItems.length, 2);
  assert.ok(exported.unmatchedLocalItems.every((item) => !exported.items.some((counted) => counted.id === item.id)));
  assert.deepEqual(exported.financiers.find((row) => row.name === "CELYA").units, 1);
});

test("días faltantes, pendientes o con error nunca sustituyen API por ventas locales", async () => {
  for (const change of ["missing", "PENDIENTE", "ERROR", "no-success"]) {
    const jobs = dailyJobs();
    if (change === "missing") jobs.pop();
    else if (change === "no-success") jobs[29].lastSuccess = null;
    else jobs[29].state = change;
    const db = database({ cierreSyncTrabajo: jobs, cierreCredito: [local(1, { amount: 800000 }), observation(2)] });
    const report = await read(db, params("&financier=PAYJOY"), admin, true);
    assert.deepEqual(report.totals, { units: 1, amount: 1000000 });
    assert.equal(report.items[0].id, "2");
    assert.equal(report.financiers[0].reconciliation.basis, "PAYJOY_API");
    assert.deepEqual(report.financiers[0].reconciliation.api, { units: 1, amount: 1000000 });
    assert.equal(report.financiers[0].reconciliation.daysReviewed, 29);
    assert.deepEqual(report.financiers[0].reconciliation.local, { units: 1, amount: 800000 });
    assert.match(report.financiers[0].source, /API PAYJOY/);
    assert.equal(report.coverageLabel, "Consulta PAYJOY pendiente");
    assert.equal(report.complete, false);
  }
});

test("sede sólo ve API vinculada autorizada; global incluye órdenes sin sede", async () => {
  const linked = (id, sedeId) => observation(id, { localKey: `VENTA:${id}:PAYJOY`, ventaId: id, sedeId, status: "EFECTIVO" });
  const db = database({ cierreSyncTrabajo: dailyJobs(), cierreCredito: [linked(1, 1), linked(2, 2), observation(3),
    observation(4, { sedeId: 1 }), local(5, { sedeId: 2 })] });
  const global = await read(db, params(), admin, false, true);
  assert.equal(global.financiers.find((row) => row.name === "PAYJOY").units, 4);
  assert.equal(global.items.filter((item) => item.sedeName === "Sede sin vincular").length, 1);
  const branch = await read(db, params("&financier=PAYJOY"), supervisor, true);
  assert.equal(branch.total, 1);
  assert.equal(branch.items[0].id, "1");
  assert.deepEqual(branch.financiers[0].reconciliation.unlinkedApi, { units: 0, amount: 0 });
  const exported = await read(db, params(), supervisor, false, true);
  assert.equal(exported.items.length, 1);
  assert.deepEqual(exported.unmatchedLocalItems, []);
  await assert.rejects(read(db, params("&sedeId=2"), supervisor, false, true), (error) => error.status === 403);
});

test("API usa capital y fecha de evidencia, sin depender de importe o fecha legacy", async () => {
  const start = "2026-09-01T05:00:00.000Z";
  const end = "2026-10-01T05:00:00.000Z";
  const db = database({ cierreSyncTrabajo: dailyJobs(), cierreCredito: [
    observation(1, { effectiveAt: new Date("2026-08-31T18:00:00Z"), amount: 999 }, { principal: 1200000, effectiveDate: start }),
    observation(2, {}, { effectiveDate: "2026-09-01T04:59:59.999Z" }),
    observation(3, {}, { effectiveDate: "2026-10-01T04:59:59.999Z", principal: 900000 }),
    observation(4, {}, { effectiveDate: end }),
  ] });
  const report = await read(db, params("&financier=PAYJOY"), admin, true);
  assert.deepEqual(report.totals, { units: 2, amount: 2100000 });
  assert.deepEqual(report.items.map((item) => item.id), ["3", "1"]);
  assert.equal(report.items[1].date, start);
  assert.equal(report.items[1].amount, 1200000);
});

test("negativos, tombstones y pendientes financieros reales no se promueven a efectivos", async () => {
  const db = database({ cierreSyncTrabajo: dailyJobs(), cierreCredito: [
    observation(1), observation(2, { status: "REVERSADO" }), observation(3, { status: "ANULADO" }),
    observation(4, { status: "RECHAZADO" }), observation(5, {}, { localTombstone: true }),
    observation(6, {}, { diagnostics: { reasons: ["UNCONFIRMED_STATUS"] } }),
    observation(7, {}, { currency: "USD" }), observation(8, {}, { principal: null }),
    observation(9, {}, { effectiveDate: null }), observation(10, {}, { providerStatus: "REVERSED" }),
    observation(11, {}, { providerStatus: "PENDING" }), observation(12, { status: "VINCULADO" }),
  ] });
  const report = await read(db, params("&financier=PAYJOY"), admin, true);
  assert.deepEqual(report.totals, { units: 1, amount: 1000000 });
  assert.deepEqual(report.items.map((item) => item.id), ["1"]);
});

test("día, semana y rango verifican exactamente sus días y aplican Bogotá", async () => {
  const db = database({ cierreSyncTrabajo: dailyJobs(), cierreCredito: [
    observation(1, {}, { effectiveDate: "2026-09-14T04:59:59Z" }),
    observation(2, {}, { effectiveDate: "2026-09-14T05:00:00Z" }),
    observation(3, {}, { effectiveDate: "2026-09-20T23:00:00-05:00" }),
    observation(4, {}, { effectiveDate: "2026-09-21T00:00:00-05:00" }),
  ] });
  for (const [query, units, days] of [
    ["mode=day&date=2026-09-14", 1, 1], ["mode=week&date=2026-09-16", 2, 7],
    ["mode=range&from=2026-09-14&to=2026-09-20", 2, 7],
  ]) {
    const report = await read(db, new URLSearchParams(`${query}&financier=PAYJOY`), admin, true);
    assert.equal(report.total, units);
    assert.equal(report.financiers[0].reconciliation.totalDays, days);
    assert.equal(report.financiers[0].reconciliation.daysReviewed, days);
  }
});

test("día actual revisado y días futuros sólo afectan progreso, nunca la fuente API", async () => {
  const jobs = dailyJobs();
  jobs.forEach((job) => { job.lastSuccess = new Date("2026-09-15T15:00:00Z"); });
  const db = database({ cierreSyncTrabajo: jobs, cierreCredito: [observation(1)] });
  const { readCierrePayJoyReport } = modules(db.prisma).load("lib/cierre-payjoy-report.ts");
  const scope = { sedeId: null, start: new Date("2026-09-15T05:00:00Z"), end: new Date("2026-09-16T05:00:00Z"), from: "2026-09-15", to: "2026-09-15" };
  const now = new Date("2026-09-15T20:00:00Z");
  assert.equal((await readCierrePayJoyReport(db.prisma, scope, now)).reconciliation.basis, "PAYJOY_API");
  const future = await readCierrePayJoyReport(db.prisma, { ...scope, end: new Date("2026-09-17T05:00:00Z"), to: "2026-09-16" }, now);
  assert.equal(future.reconciliation.basis, "PAYJOY_API");
  assert.equal(future.reconciliation.daysReviewed, 1);
});

test("sin observaciones no informa cero confirmado y filtros no importan clientes", async () => {
  const db = database({ cierreSyncTrabajo: dailyJobs() });
  const environment = modules(db.prisma);
  const report = await environment.load("lib/cierre-report.ts").readCierreReport(params("&financier=PAYJOY"), admin, true);
  assert.equal(report.complete, false);
  assert.deepEqual(report.totals, { units: null, amount: null });
  assert.deepEqual(report.financiers[0].reconciliation.api, { units: 0, amount: 0 });
  assert.equal(report.financiers[0].coverageLabel, "Cobertura parcial", "El listado diario no necesita una venta local para consultar");
  assert.equal(report.financiers[0].lastUpdatedAt, null, "La carga local no es una actualización de PAYJOY");
  assert.ok(!environment.imports.some((name) => /cierre-providers|payjoy-retail|cierre-sync/.test(name)));
  assert.ok(!db.calls.some((call) => ["create", "update", "upsert", "deleteMany", "updateMany"].includes(call.method)));
});
