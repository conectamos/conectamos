import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, credit, admin, supervisor } from "./cierre-test-helpers.mjs";

const date = new Date("2026-09-15T18:00:00Z");
const params = (extra = "") => new URLSearchParams(`mode=month&month=2026-09${extra}`);
const local = (id, changes = {}) => credit(id, { financial: "SUMASPAY", localKey: `VENTA:${id}:SUMASPAY`, effectiveAt: date, ...changes });
function observation(id, changes = {}, raw = {}) {
  const stored = { ...raw };
  if (typeof stored.effectiveDate === "string" && Number.isFinite(Date.parse(stored.effectiveDate))) stored.effectiveDate = new Date(stored.effectiveDate).toISOString();
  return local(id, { localKey: null, ventaId: null, sedeId: null, providerCreditId: `SUMAS-${id}`,
    status: "PENDIENTE", source: "API SUMASPAY · pendiente de vinculación", ...changes,
    evidence: { source: "credits-by-client", providerId: `SUMAS-${id}`, providerStatus: "ACTIVE", principal: 1000000,
      effectiveDate: date.toISOString(), diagnostics: { reasons: [] }, ...stored } });
}
const read = (db, query = params(), session = admin, detail = false, exporting = false) =>
  modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(query, session, detail, exporting);

test("SUMASPAY cuenta créditos API de IDs distintos y conserva locales sólo para comparar", async () => {
  const db = database({ cierreCredito: [
    observation(1, { localKey: "VENTA:1:SUMASPAY", sedeId: 1, status: "EFECTIVO", source: "CONECTAMOS + API SUMASPAY" }),
    observation(2), observation(3, {}, { principal: 1250000 }), local(4, { amount: 800000 }), local(5, { amount: 700000 }),
  ] });
  const report = await read(db, params("&financier=SUMASPAY"), admin, true);
  assert.deepEqual(report.totals, { units: 3, amount: 3250000 });
  assert.equal(report.items.length, 3);
  assert.ok(report.items.every((row) => row.source === "API SUMASPAY" && row.status === "EFECTIVO"));
  assert.equal(report.complete, false);
  const reconciliation = report.financiers[0].reconciliation;
  assert.deepEqual(reconciliation, { basis: "SUMASPAY_API", financial: "SUMASPAY", api: { units: 3, amount: 3250000 },
    local: { units: 3, amount: 2500000 }, unlinkedApi: { units: 2, amount: 2250000 }, unmatchedLocal: { units: 2, amount: 1500000 },
    delta: { units: 0, amount: 750000 }, referencesReviewed: 0, totalReferences: 3, daysReviewed: null, totalDays: null });
  assert.match(report.financiers[0].source, /API SUMASPAY/);
});

test("sin API efectiva no muestra cero ni sustituye total por las ventas locales", async () => {
  for (const state of ["PENDIENTE", "ERROR", "REVISADO"]) {
    const db = database({ cierreCredito: [local(1)], cierreSyncTrabajo: [{ key: "j", financial: "SUMASPAY", localKey: "VENTA:1:SUMASPAY", state, lastSuccess: new Date("2026-10-01T08:00:00Z") }] });
    const report = await read(db, params("&financier=SUMASPAY"), admin, true);
    assert.deepEqual(report.totals, { units: null, amount: null });
    assert.equal(report.items.length, 0);
    assert.equal(report.financiers[0].reconciliation.basis, "SUMASPAY_API");
    assert.equal(report.financiers[0].reconciliation.local.units, 1);
    assert.equal(report.financiers[0].reconciliation.referencesReviewed, state === "REVISADO" ? 1 : 0);
    assert.equal(report.complete, false);
  }
});

test("progreso SUMASPAY cuenta referencias vigentes del periodo y sede, sin inventar días", async () => {
  const states = ["REVISADO", "PENDIENTE", "ERROR", "SIN_REFERENCIA", "RETIRADO", "REVISADO"];
  const credits = states.map((_, index) => local(index + 1, index === 5 ? { status: "ANULADO" } : {}));
  const jobs = states.map((state, index) => ({ key: `j${index}`, financial: "SUMASPAY", localKey: credits[index].localKey, state, lastSuccess: new Date("2026-10-01T08:00:00Z") }));
  const db = database({ cierreCredito: [...credits, local(20, { sedeId: 2 }), local(21, { effectiveAt: new Date("2026-10-12T18:00:00Z") })], cierreSyncTrabajo: jobs });
  const report = await read(db, params("&financier=SUMASPAY"), supervisor, true);
  const progress = report.financiers[0].reconciliation;
  assert.equal(progress.totalReferences, 5);
  assert.equal(progress.referencesReviewed, 2);
  assert.equal(progress.totalDays, null);
  assert.equal(progress.daysReviewed, null);
});

test("totales, detalle de diez y exportación mixta comparten las mismas órdenes API", async () => {
  const rows = Array.from({ length: 13 }, (_, index) => observation(index + 1, {}, { principal: 1000000.16 + index }));
  const payjoy = credit(40, { localKey: null, sedeId: null, effectiveAt: date, providerCreditId: "PAYJOY-40", status: "PENDIENTE", source: "API PAYJOY",
    evidence: { source: "list-transactions", providerId: "PAYJOY-40", providerStatus: "FINANCE", currency: "COP", principal: 500000, effectiveDate: date.toISOString(), diagnostics: { reasons: [] } } });
  const db = database({ cierreCredito: [...rows, local(30), credit(31, { effectiveAt: date }), payjoy, credit(41, { financial: "CELYA", effectiveAt: date, amount: 200000 })] });
  const first = await read(db, params("&financier=SUMASPAY"), admin, true);
  const second = await read(db, params("&financier=SUMASPAY&page=2"), admin, true);
  assert.equal(first.items.length, 10); assert.equal(second.items.length, 3);
  assert.equal(first.total, 13); assert.deepEqual(first.totals, second.totals);
  assert.equal(first.totals.amount, 13000080.08);
  const exported = await read(db, params(), admin, false, true);
  assert.equal(exported.items.length, 15);
  assert.equal(exported.totals.amount, 13700080.08);
  assert.deepEqual(new Set(exported.unmatchedLocalItems.map((row) => row.financial)), new Set(["PAYJOY", "SUMASPAY"]));
  assert.ok(exported.unmatchedLocalItems.every((row) => !exported.items.some((counted) => counted.id === row.id)));
});

test("sede no ve API sin vincular ni datos y conteos de otras sedes", async () => {
  const linked = (id, sedeId) => observation(id, { localKey: `VENTA:${id}:SUMASPAY`, sedeId, status: "EFECTIVO" });
  const db = database({ cierreCredito: [linked(1, 1), linked(2, 2), observation(3), observation(4, { sedeId: 1 }), local(5, { sedeId: 2 })] });
  const global = await read(db, params("&financier=SUMASPAY"), admin, true);
  assert.equal(global.units, 4);
  const branch = await read(db, params("&financier=SUMASPAY"), supervisor, true);
  assert.equal(branch.units, 1); assert.equal(branch.items[0].id, "1");
  assert.equal(branch.financiers[0].reconciliation.unlinkedApi.units, 0);
  const exported = await read(db, params(), supervisor, false, true);
  assert.deepEqual(exported.items.map((row) => row.id), ["1"]);
  assert.equal(exported.unmatchedLocalItems.length, 0);
  await assert.rejects(read(db, params("&sedeId=2"), supervisor, false, true), (error) => error.status === 403);
});

test("capital y fecha API determinan día, semana, mes y rango históricos en Bogotá", async () => {
  const db = database({ cierreCredito: [
    observation(1, { amount: 999, effectiveAt: new Date("2026-08-31T18:00:00Z") }, { principal: 1200000, effectiveDate: "2026-09-14T05:00:00Z" }),
    observation(2, {}, { effectiveDate: "2026-09-14T04:59:59Z" }),
    observation(3, {}, { effectiveDate: "2026-09-20T23:00:00-05:00" }),
    observation(4, {}, { effectiveDate: "2026-09-21T00:00:00-05:00" }),
    observation(5, {}, { effectiveDate: "2026-10-01T05:00:00Z" }),
  ] });
  for (const [query, units, amount] of [
    ["mode=day&date=2026-09-14", 1, 1200000], ["mode=week&date=2026-09-16", 2, 2200000],
    ["mode=range&from=2026-09-14&to=2026-09-20", 2, 2200000], ["mode=month&month=2026-09", 4, 4200000],
  ]) {
    const report = await read(db, new URLSearchParams(`${query}&financier=SUMASPAY`), admin, true);
    assert.deepEqual(report.totals, { units, amount });
  }
});

test("negativos, aprobaciones pendientes, tombstones e IDs repetidos no inflan el cierre", async () => {
  const db = database({ cierreCredito: [
    observation(1), observation(2, { status: "REVERSADO" }), observation(3, { status: "ANULADO" }), observation(4, { status: "RECHAZADO" }),
    observation(5, {}, { localTombstone: true }), observation(6, {}, { diagnostics: { reasons: ["UNCONFIRMED_STATUS"] }, providerStatus: "APPROVED" }),
    observation(7, {}, { principal: null }), observation(8, {}, { effectiveDate: null }), observation(9, {}, { providerStatus: "REVERSED" }),
    observation(10, {}, { providerId: "mismatch" }), observation(11, { status: "VINCULADO" }),
    observation(12, { providerCreditId: "SUMAS-1" }, { providerId: "SUMAS-1" }),
  ] });
  const environment = modules(db.prisma);
  const report = await environment.load("lib/cierre-report.ts").readCierreReport(params("&financier=SUMASPAY"), admin, true);
  assert.deepEqual(report.totals, { units: 1, amount: 1000000 });
  assert.ok(!environment.imports.some((name) => /cierre-providers|sumasconsulta|cierre-sync/.test(name)));
  assert.ok(!db.calls.some((call) => ["create", "update", "upsert", "deleteMany", "updateMany"].includes(call.method)));
});

test("180 hechos API sintéticos totalizan su capital sin sumar créditos locales", async () => {
  const rows = Array.from({ length: 180 }, (_, index) => observation(index + 1, {}, { principal: index === 179 ? 3341714 : 900000 }));
  const db = database({ cierreCredito: [...rows, local(300, { amount: 10000000 })] });
  const report = await read(db, params("&financier=SUMASPAY"), admin, true, true);
  assert.deepEqual(report.totals, { units: 180, amount: 164441714 });
  assert.equal(report.items.length, 180);
  assert.equal(report.complete, false);
});
