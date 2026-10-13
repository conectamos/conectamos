import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { modules, database, credit, sale, admin, supervisor, params } from "./cierre-test-helpers.mjs";
test("servidor filtra sede, estado y fecha efectiva antes de totalizar y pagina máximo diez", async () => {
  const db = database({ cierreCredito: [
    ...Array.from({ length: 23 }, (_, index) => credit(index + 1)), credit(90, { sedeId: 2 }),
    credit(91, { status: "REVERSADO" }), credit(92, { status: "ANULADO" }), credit(93, { status: "RECHAZADO" }),
    credit(94, { effectiveAt: new Date("2026-11-01T05:00:00Z") }), credit(95, { amount: null }),
  ] });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params("&financier=PAYJOY&page=2"), supervisor, true);
  assert.equal(report.total, 23);
  assert.equal(report.items.length, 10);
  assert.equal(report.totals.amount, 23000000);
  assert.ok(report.items.every((row) => row.sedeName === "Centro" && row.customerDocument === "1234567"));
  assert.equal(report.scope.sedeId, 1);
  assert.equal(report.complete, false);
  assert.equal(db.calls.find((c) => c.table === "$transaction").options.isolationLevel, "RepeatableRead");
});

test("administrador consolida global; supervisor y auditor no consultan otra sede", async () => {
  const db = database({ cierreCredito: [credit(1), credit(2, { sedeId: 2 })] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  assert.equal((await readCierreReport(params(), admin)).totals.units, 2);
  for (const session of [supervisor, { ...supervisor, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }]) {
    const previousCount = db.calls.length;
    await assert.rejects(readCierreReport(params("&sedeId=2"), session), (error) => error.status === 403);
    assert.equal(db.calls.length, previousCount, "Deniega antes de leer datos");
    assert.equal((await readCierreReport(params("&sedeId=TODAS"), session)).totals.units, 1);
  }
});

test("pendientes no se presentan como ceros confirmados y fuentes locales sin API sí completan", async () => {
  const db = database({ cierreCredito: [credit(1, { financial: "CELYA" })], cierreVentaPendiente: [{ ventaId: 99 }] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  let report = await readCierreReport(params(), supervisor);
  assert.equal(report.financiers.find((r) => r.name === "SISTECREDITO").units, null);
  assert.equal(report.financiers.find((r) => r.name === "CELYA").complete, false);
  db.tables.cierreVentaPendiente.length = 0;
  report = await readCierreReport(params(), supervisor);
  assert.equal(report.financiers.find((r) => r.name === "CELYA").complete, true);
  assert.equal(report.financiers.find((r) => r.name === "SISTECREDITO").units, 0);
  assert.equal(report.financiers.find((r) => r.name === "PAYJOY").units, null);
  assert.equal(report.complete, false, "Consultar referencias conocidas no prueba cobertura API exhaustiva");
});

test("septiembre local se completa aunque queden otros meses o sedes en la carga inicial", async () => {
  const db = database({
    cierreSyncEstado: [{ key: "LOCAL", initialized: false, lastSuccess: new Date("2026-10-13T12:00:00Z") }],
    venta: [sale(1, { fecha: new Date("2026-08-20T17:00:00Z") }), sale(2, { sedeId: 2, fecha: new Date("2026-09-20T17:00:00Z") })],
    cierreVentaPendiente: [{ ventaId: 1 }, { ventaId: 2 }],
  });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  const september = new URLSearchParams("mode=month&month=2026-09");
  const report = await readCierreReport(september, supervisor);
  assert.deepEqual(report.localSync, { pending: 0, complete: true, lastUpdatedAt: "2026-10-13T12:00:00.000Z" });
  assert.equal(report.financiers.find((row) => row.name === "SISTECREDITO").units, 0);
  assert.equal(report.financiers.find((row) => row.name === "PAYJOY").complete, false);
  assert.equal(report.complete, false, "La cobertura local no acredita una API exhaustiva");
  assert.equal((await readCierreReport(september, admin)).localSync.pending, 1);
  assert.equal((await readCierreReport(new URLSearchParams("mode=month&month=2026-08"), supervisor)).localSync.pending, 1);
});

test("una eliminación pendiente conserva el periodo y sede del snapshot sin filtrar por financiera", async () => {
  const db = database({ cierreVentaPendiente: [
    { ventaId: 1, snapshot: { sedeId: 1, fecha: "2026-09-30T23:30:00" } },
    { ventaId: 2, snapshot: { sedeId: 2, fecha: "2026-09-30T23:30:00" } },
  ] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  const report = await readCierreReport(new URLSearchParams("mode=month&month=2026-09&financier=SISTECREDITO"), supervisor, true);
  assert.deepEqual(report.localSync, { pending: 1, complete: false, lastUpdatedAt: "2026-10-13T12:00:00.000Z" });
  assert.equal(report.totals.units, null);
  assert.equal(report.complete, false);
});

test("editar fecha y sede mantiene pendientes el ledger anterior, snapshot y venta actual", async () => {
  const db = database({
    cierreVentaPendiente: [{ ventaId: 1, snapshot: { sedeId: 1, fecha: "2026-08-15T18:00:00.000Z" } }],
    venta: [sale(1, { sedeId: 2, fecha: new Date("2026-10-10T18:00:00Z") })],
    cierreCredito: [credit(1, { effectiveAt: new Date("2026-09-15T18:00:00Z") }), credit(2, { ventaId: 1, effectiveAt: new Date("2026-09-15T18:00:00Z") })],
  });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  for (const month of ["2026-08", "2026-09"]) {
    assert.equal((await readCierreReport(new URLSearchParams(`mode=month&month=${month}`), supervisor)).localSync.pending, 1);
  }
  assert.equal((await readCierreReport(params("&sedeId=2"), admin)).localSync.pending, 1);
  assert.equal((await readCierreReport(params(), supervisor)).localSync.pending, 0);
  assert.equal((await readCierreReport(params(), supervisor)).localSync.complete, true);
});

test("snapshot inválido no falla ni certifica cero y datos sin sede no exponen conteos", async () => {
  const db = database({ cierreVentaPendiente: [
    { ventaId: 1, snapshot: { sedeId: 2, fecha: "no-es-fecha" } },
    { ventaId: 2, snapshot: { fecha: "2026-09-15T18:00:00Z" } },
  ] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  const september = new URLSearchParams("mode=month&month=2026-09");
  let report = await readCierreReport(september, supervisor);
  assert.equal(report.localSync.pending, 0, "Ningún conteo de sede ajena o desconocida sale al usuario de sede");
  assert.equal(report.localSync.complete, false);
  assert.equal(report.financiers.find((row) => row.name === "SISTECREDITO").units, null);
  for (const date of ["no-es-fecha", "2026-02-30T12:00:00Z", "2026-09-15T25:00:00Z", { unexpected: true }]) {
    db.tables.cierreVentaPendiente[1].snapshot = { sedeId: 1, fecha: date };
    report = await readCierreReport(september, supervisor);
    assert.equal(report.localSync.pending, 1);
    assert.equal(report.localSync.complete, false);
  }
});

test("snapshot PostgreSQL sin offset conserva el instante UTC al aplicar límites Bogotá", async () => {
  const db = database({ cierreVentaPendiente: [{ ventaId: 1, snapshot: { sedeId: 1, fecha: "2026-09-01T04:30:00" } }] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  assert.equal((await readCierreReport(new URLSearchParams("mode=month&month=2026-09"), supervisor)).localSync.pending, 0);
  assert.equal((await readCierreReport(new URLSearchParams("mode=day&date=2026-08-31"), supervisor)).localSync.pending, 1);
  db.tables.cierreVentaPendiente[0].snapshot.fecha = "2026-09-01T00:30:00-05:00";
  assert.equal((await readCierreReport(new URLSearchParams("mode=month&month=2026-09"), supervisor)).localSync.pending, 1);
});

test("sin marcador transaccional de seed no se declara completo un periodo vacío", async () => {
  const db = database({ cierreSyncEstado: [] });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params(), supervisor);
  assert.deepEqual(report.localSync, { pending: 0, complete: false, lastUpdatedAt: null });
  assert.ok(report.financiers.every((row) => !row.complete && row.units === null && row.amount === null));
  assert.equal(report.totals.units, null);
});

test("cobertura pagina la cola sin perder el último lote ni inflar cantidades por créditos múltiples", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({ ventaId: index + 1,
    snapshot: { sedeId: index === 500 ? 1 : 2, fecha: "2026-09-15T18:00:00Z" } }));
  const db = database({ cierreVentaPendiente: rows });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(new URLSearchParams("mode=month&month=2026-09"), supervisor);
  assert.equal(report.localSync.pending, 1);
  const reads = db.calls.filter((call) => call.table === "cierreVentaPendiente" && call.method === "findMany");
  assert.equal(reads.length, 2);
  assert.ok(reads.every((call) => call.args.take === 500));
  assert.deepEqual(reads[1].args.where, { ventaId: { gt: 500 } });
});

test("progreso de proveedores une referencias del periodo y sede sin exponer trabajos ajenos", async () => withProviderEnabled(async () => {
  const make = (id, changes = {}) => credit(id, { financial: "SUMASPAY", localKey: `VENTA:${id}:SUMASPAY`, ...changes });
  const jobs = ["PENDIENTE", "REVISADO", "ERROR", "SIN_REFERENCIA", "RETIRADO", "ERROR", "ERROR"].map((state, index) => ({
    key: `j-${index + 1}`, localKey: `VENTA:${index + 1}:SUMASPAY`, financial: "SUMASPAY", state,
    lastSuccess: index === 1 ? new Date("2026-10-13T13:00:00Z") : index > 4 ? new Date("2099-01-01T00:00:00Z") : null,
  }));
  const db = database({ cierreCredito: [make(1), make(2), make(3), make(4, { documentNumber: null }), make(5),
    make(6, { sedeId: 2 }), make(7, { effectiveAt: new Date("2026-09-10T15:00:00Z") })], cierreSyncTrabajo: jobs });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  let report = await readCierreReport(params(), supervisor);
  let source = report.financiers.find((row) => row.name === "SUMASPAY");
  assert.deepEqual(Object.fromEntries(["enabled", "status", "total", "queued", "reviewed", "errors", "withoutReference", "lastSuccessAt"].map((key) => [key, source.providerSync[key]])), {
    enabled: true, status: "ERROR", total: 4, queued: 1, reviewed: 1, errors: 1, withoutReference: 1,
    lastSuccessAt: "2026-10-13T13:00:00.000Z",
  });
  assert.equal(report.providerSync.total, 4);
  assert.equal(source.coverageLabel, "Conciliación con errores");
  assert.equal(report.financiers.find((row) => row.name === "SISTECREDITO").providerSync, null);
  for (const job of db.tables.cierreSyncTrabajo.slice(0, 4)) {
    job.state = "REVISADO";
    job.lastSuccess = new Date("2026-10-13T14:00:00Z");
  }
  report = await readCierreReport(params(), supervisor);
  source = report.financiers.find((row) => row.name === "SUMASPAY");
  assert.equal(source.providerSync.status, "REVISADA_LIMITADA");
  assert.equal(source.providerSync.reviewed, 4);
  assert.equal(source.coverageLabel, "Cobertura parcial");
  assert.equal(source.complete, false);
  assert.equal(report.complete, false);
  assert.equal(report.coverageLabel, "Cobertura parcial");
  db.tables.cierreSyncTrabajo[0].state = "PENDIENTE";
  report = await readCierreReport(params(), supervisor);
  source = report.financiers.find((row) => row.name === "SUMASPAY");
  assert.equal(source.providerSync.status, "EN_COLA", "Una edición requiere otra consulta aunque exista éxito anterior");
  assert.equal(source.providerSync.queued, 1);
  assert.equal(source.providerSync.reviewed, 3);
  assert.equal(source.providerSync.consulted, 3, "Una consulta histórica anterior a la edición no completa la referencia vigente");
}));

test("consultar una referencia no la vincula: aprobaciones observadas no son créditos conciliados", async () => withProviderEnabled(async () => {
  const db = database({ cierreCredito: [credit(1, { providerCreditId: "p-1", source: "CONECTAMOS + API PAYJOY" }),
    credit(2, { providerCreditId: "approval-2", source: "CONECTAMOS" })],
    cierreSyncTrabajo: [1, 2].map((id) => ({ key: `j-${id}`, localKey: `VENTA:${id}:PAYJOY`, financial: "PAYJOY", state: "REVISADO", lastSuccess: new Date() })) });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params(), supervisor);
  const progress = report.financiers.find((row) => row.name === "PAYJOY").providerSync;
  assert.equal(progress.consulted, 2);
  assert.equal(progress.linked, 1);
  assert.equal(progress.unconfirmed, 1);
  assert.equal(progress.status, "REVISADA_LIMITADA");
  assert.equal(report.complete, false);
}));

test("actividad, pausas y motivos se restringen al periodo y sede del reporte", async (t) => withProviderEnabled(async () => {
  const now = new Date("2026-10-13T12:00:00Z");
  t.mock.timers.enable({ apis: ["Date"], now });
  const scopeDate = new Date("2026-09-15T18:00:00Z");
  const previousFrom = process.env.CIERRE_PRIORITY_FROM;
  const previousTo = process.env.CIERRE_PRIORITY_TO;
  process.env.CIERRE_PRIORITY_FROM = "2026-09-01";
  process.env.CIERRE_PRIORITY_TO = "2026-09-30";
  t.after(() => {
    if (previousFrom === undefined) delete process.env.CIERRE_PRIORITY_FROM; else process.env.CIERRE_PRIORITY_FROM = previousFrom;
    if (previousTo === undefined) delete process.env.CIERRE_PRIORITY_TO; else process.env.CIERRE_PRIORITY_TO = previousTo;
  });
  const db = database({ cierreCredito: [credit(1, { financial: "ADDI", effectiveAt: scopeDate }), credit(2, { financial: "ADDI", sedeId: 2, effectiveAt: scopeDate }),
    credit(3, { financial: "ADDI" })], cierreSyncTrabajo: [1, 2, 3].map((id) => ({ key: `j-${id}`, localKey: `VENTA:${id}:PAYJOY`, financial: "ADDI", state: "PENDIENTE", nextAttempt: new Date(0) })),
    cierreSyncEstado: [
      { key: "LOCAL", initialized: true }, { key: "WORKER", updatedAt: now, lockedUntil: null },
      { key: "PROVIDER_RATE", lockedUntil: new Date(now.getTime() + 60000) },
      { key: "PROVIDER_ACTIVITY", lockToken: JSON.stringify({ financial: "ADDI", localKey: "VENTA:2:PAYJOY", day: "2026-09-15", startedAt: now.toISOString() }), lockedUntil: new Date(now.getTime() + 600000) },
      { key: "RESULT:j-1", lockToken: JSON.stringify({ reasons: { MISSING_PRINCIPAL: 1, UNKNOWN_PRIVATE_CODE: 5 } }), updatedAt: now },
      { key: "RESULT:j-2", lockToken: JSON.stringify({ reasons: { IDENTITY_CONFLICT: 1 } }), updatedAt: new Date(now.getTime() + 1000) },
    ] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  const september = new URLSearchParams("mode=month&month=2026-09");
  let report = await readCierreReport(september, supervisor);
  let progress = report.financiers.find((row) => row.name === "ADDI").providerSync;
  assert.equal(progress.total, 1);
  assert.equal(progress.active, null, "No mostrar consulta de otra sede");
  assert.equal(progress.status, "PAUSADA");
  assert.equal(progress.resumeAt, "2026-10-13T12:01:00.000Z");
  assert.equal(progress.lastActivityAt, now.toISOString());
  assert.deepEqual(progress.reasons, ["MISSING_PRINCIPAL"]);
  assert.deepEqual(progress.priority, { from: "2026-09-01", to: "2026-09-30", applies: true });
  const activity = db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_ACTIVITY");
  activity.lockToken = JSON.stringify({ financial: "ADDI", localKey: "VENTA:1:PAYJOY", day: "2026-09-15", startedAt: now.toISOString() });
  report = await readCierreReport(september, supervisor);
  assert.equal(report.providerSync.status, "CONSULTANDO");
  assert.deepEqual(report.providerSync.active, { financial: "ADDI", day: "2026-09-15" });
  const october = await readCierreReport(params(), supervisor);
  assert.equal(october.providerSync.active, null, "No mostrar consulta de otro periodo");
  assert.equal(october.providerSync.priority.applies, false);
  activity.lockedUntil = new Date(0);
  db.tables.cierreSyncEstado.find((row) => row.key === "WORKER").updatedAt = new Date(now.getTime() - 300000);
  progress = (await readCierreReport(september, supervisor)).providerSync;
  assert.equal(progress.status, "DETENIDA");
  assert.equal(progress.workerActive, false);
  assert.equal(progress.active, null);
}));

test("número de préstamo no sustituye un documento válido en progreso SUMASPAY", async () => withProviderEnabled(async () => {
  const db = database({ cierreCredito: [credit(1, { financial: "SUMASPAY", localKey: "VENTA:1:SUMASPAY", providerCreditId: "p-1", documentNumber: "12" })],
    cierreSyncTrabajo: [{ key: "job", localKey: "VENTA:1:SUMASPAY", financial: "SUMASPAY", state: "PENDIENTE" }] });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params(), supervisor);
  const progress = report.financiers.find((row) => row.name === "SUMASPAY").providerSync;
  assert.equal(progress.status, "SIN_REFERENCIA");
  assert.equal(progress.queued, 0);
  assert.equal(progress.withoutReference, 1);
}));

test("sin referencias conocidas nunca se inventa un cero remoto; PAYJOY por periodo no exige IMEI", async () => withProviderEnabled(async () => {
  const db = database({ cierreCredito: [
    credit(1, { financial: "ADDI", localKey: "VENTA:1:ADDI", documentNumber: null }),
    credit(2, { imei: null }),
  ], cierreSyncTrabajo: [{ key: "PERIODO:PAYJOY:2026-10-12", localKey: "PERIODO:PAYJOY:2026-10-12", financial: "PAYJOY", state: "REVISADO", lastSuccess: new Date() }] });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params(), supervisor);
  assert.equal(report.financiers.find((row) => row.name === "ADDI").providerSync.status, "SIN_REFERENCIA");
  assert.equal(report.financiers.find((row) => row.name === "ADDI").providerSync.withoutReference, 1);
  assert.equal(report.financiers.find((row) => row.name === "PAYJOY").providerSync.status, "EN_COLA");
  assert.equal(report.financiers.find((row) => row.name === "PAYJOY").providerSync.total, 1, "El trabajo de periodo no duplica la referencia local");
  const sumas = report.financiers.find((row) => row.name === "SUMASPAY");
  assert.equal(sumas.providerSync.status, "SIN_REFERENCIA");
  assert.equal(sumas.units, null);
  assert.equal(sumas.amount, null);
}));

test("flag desactivado informa el estado real y conserva revisiones previas sin consultas de red", async () => {
  const previous = process.env.CIERRE_PROVIDER_SYNC_ENABLED;
  const original = globalThis.fetch;
  process.env.CIERRE_PROVIDER_SYNC_ENABLED = "0";
  globalThis.fetch = () => { throw new Error("El reporte no consulta proveedores"); };
  try {
    const db = database({ cierreCredito: [credit(1)], cierreSyncTrabajo: [{
      key: "job", localKey: "VENTA:1:PAYJOY", financial: "PAYJOY", state: "REVISADO", lastSuccess: new Date("2026-10-13T14:00:00Z"),
    }] });
    const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params(), supervisor);
    const source = report.financiers.find((row) => row.name === "PAYJOY");
    assert.equal(source.providerSync.enabled, false);
    assert.equal(source.providerSync.status, "DESACTIVADA");
    assert.equal(source.providerSync.reviewed, 1);
    assert.equal(source.coverageLabel, "Conciliación desactivada");
    assert.equal(report.providerSync.status, "DESACTIVADA");
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.CIERRE_PROVIDER_SYNC_ENABLED;
    else process.env.CIERRE_PROVIDER_SYNC_ENABLED = previous;
  }
});

test("progreso pagina referencias y el detalle conserva su financiera autorizada", async () => withProviderEnabled(async () => {
  const db = database({ cierreCredito: [...Array.from({ length: 501 }, (_, index) => credit(index + 1)),
    credit(900, { financial: "ADDI", localKey: "VENTA:900:ADDI" })] });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params("&financier=PAYJOY"), supervisor, true);
  assert.equal(report.providerSync.total, 501);
  assert.equal(report.providerSync.queued, 501);
  assert.equal(report.providerSync.status, "EN_COLA");
  assert.equal(report.items.length, 10);
  assert.ok(report.financiers.every((row) => row.name === "PAYJOY"));
  const reads = db.calls.filter((call) => call.table === "cierreCredito" && call.args?.take === 500);
  assert.equal(reads.length, 2);
}));

test("día, semana, mes y rango históricos del servidor no importan ni llaman proveedores", async () => {
  const db = database({ cierreCredito: [credit(1, { effectiveAt: new Date("2024-02-29T23:00:00Z") })] });
  const fixture = modules(db.prisma);
  const { readCierreReport } = fixture.load("lib/cierre-report.ts");
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Unexpected provider network request"); };
  try {
    for (const query of ["mode=day&date=2024-02-29", "mode=week&date=2024-03-03", "mode=month&month=2024-02", "mode=range&from=2024-02-28&to=2024-02-29"]) {
      assert.equal((await readCierreReport(new URLSearchParams(query), supervisor)).total, 1);
    }
    assert.ok(!fixture.imports.some((id) => /provider|consulta|cierre-sync|cierre-store/.test(id)));
  } finally { globalThis.fetch = original; }
});

test("rutas resumen, detalle y Excel deniegan sin sesión o sede ajena", async () => {
  for (const path of ["app/api/cierre/route.ts", "app/api/cierre/detalle/route.ts", "app/api/cierre/export/route.ts"]) {
    const db = database();
    const request = new Request("https://conectamos.test/api/cierre?mode=month&month=2026-10&sedeId=2&financier=PAYJOY");
    assert.equal((await modules(db.prisma, { session: null }).load(path).GET(request)).status, 401);
    assert.equal((await modules(db.prisma).load(path).GET(request)).status, 403);
    assert.equal(db.calls.length, 0);
  }
});

test("Excel real incluye todos los resultados autorizados, pesos completos y totales parciales", async () => {
  const db = database({ cierreCredito: [...Array.from({ length: 23 }, (_, index) => credit(index + 1)), credit(99, { sedeId: 2, customerName: "Privado" })] });
  const response = await modules(db.prisma).load("app/api/cierre/export/route.ts").GET(new Request("https://conectamos.test/api/cierre/export?mode=month&month=2026-10&page=2"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /spreadsheetml/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = workbook.getWorksheet("Créditos");
  assert.equal(sheet.rowCount, 24);
  assert.equal(sheet.getCell("E2").value, "1234567");
  assert.equal(sheet.getCell("G2").value, 1000000);
  assert.match(sheet.getCell("G2").numFmt, /#,##0/);
  assert.ok(!JSON.stringify(sheet.getSheetValues()).includes("Privado"));
  const summary = workbook.getWorksheet("Cierre");
  assert.match(summary.getCell("B2").value, /parcial/);
  assert.equal(summary.getRow(summary.rowCount).getCell(2).value, 23);
  assert.equal(summary.getRow(summary.rowCount).getCell(3).value, 23000000);
  const sources = workbook.getWorksheet("Fuentes");
  assert.ok(sources);
  assert.ok(sources.getSheetValues().slice(2).every((row) => !row || row[6] === "Centro"));
  const payjoy = sources.getSheetValues().find((row) => row?.[1] === "PAYJOY");
  assert.equal(payjoy[7], 23, "Exportación excluye referencias de otra sede");
  const sumas = summary.getSheetValues().find((row) => row?.[1] === "SUMASPAY");
  const sistecredito = summary.getSheetValues().find((row) => row?.[1] === "SISTECREDITO");
  assert.equal(sumas[2], "Sin confirmar");
  assert.equal(sistecredito[2], 0, "El cero local confirmado se distingue de la cobertura remota desconocida");
});

test("guardado idempotente usa financiera más ID y vincula venta una sola vez conservando eventos", async () => {
  const local = credit(1);
  const provider = credit(2, { localKey: null, providerCreditId: "provider-1", status: "PENDIENTE" });
  const db = database({ cierreCredito: [local, provider] });
  const { saveCierreCredit } = modules(db.prisma).load("lib/cierre-store.ts");
  const data = { ...local, providerCreditId: "provider-1", source: "CONECTAMOS + API PAYJOY" };
  delete data.id; delete data.syncedAt;
  await saveCierreCredit(db.prisma, data);
  await saveCierreCredit(db.prisma, data);
  assert.equal(db.tables.cierreCredito.filter((r) => r.status === "EFECTIVO").length, 1);
  assert.equal(db.tables.cierreCredito.find((r) => r.id === "1").status, "VINCULADO");
  assert.equal(db.tables.cierreEvento.length, 2, "Un evento vínculo y una observación; reintento no duplica");
  await saveCierreCredit(db.prisma, { ...data, localKey: null, providerCreditId: "provider-2" });
  assert.equal(db.tables.cierreCredito.filter((r) => r.status === "EFECTIVO").length, 2, "Misma cédula no deduplica otro préstamo");
});

test("histórico se procesa por lotes reanudables sin perder fechas ni completar antes de drenar", async () => {
  const sales = Array.from({ length: 105 }, (_, index) => sale(index + 1));
  const db = database({ venta: sales, cierreVentaPendiente: sales.map((s) => ({ ventaId: s.id, revision: 1, updatedAt: new Date(0) })),
    cierreSyncEstado: [{ key: "LOCAL", initialized: false }] });
  const { drainCierreLocalQueue } = modules(db.prisma).load("lib/cierre-store.ts");
  assert.deepEqual(await drainCierreLocalQueue(100), { processed: 100, remaining: 5 });
  assert.equal(db.tables.cierreSyncEstado[0].initialized, false);
  assert.ok(db.tables.cierreSyncEstado[0].lastSuccess instanceof Date, "La actualización se informa antes de terminar todo el histórico");
  assert.equal(db.tables.cierreCredito.length, 100);
  assert.equal(db.tables.cierreCredito[0].ventaId, 105, "La carga inicial prioriza ventas recientes dentro de la misma fecha de cola");
  assert.ok(!db.tables.cierreCredito.some((row) => row.ventaId === 1));
  assert.deepEqual(await drainCierreLocalQueue(100), { processed: 5, remaining: 0 });
  assert.equal(db.tables.cierreSyncEstado[0].initialized, true);
  assert.equal(db.tables.cierreCredito.length, 105);
  assert.ok(db.tables.cierreCredito.every((r) => r.effectiveAt.toISOString() === "2025-02-03T19:00:00.000Z"));
  await drainCierreLocalQueue(100);
  assert.equal(db.tables.cierreCredito.length, 105);
});

test("venta eliminada antes del primer lote deja trazabilidad anulada y actualización concurrente conserva outbox", async () => {
  const db = database({ cierreVentaPendiente: [{ ventaId: 1, revision: 1, snapshot: sale(1), updatedAt: new Date() }] });
  const { drainCierreLocalQueue } = modules(db.prisma).load("lib/cierre-store.ts");
  const original = db.prisma.cierreVentaPendiente.deleteMany;
  db.prisma.cierreVentaPendiente.deleteMany = async (args) => {
    db.tables.cierreVentaPendiente[0].revision = 2;
    return original(args);
  };
  assert.deepEqual(await drainCierreLocalQueue(), { processed: 1, remaining: 1 });
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].status, "ANULADO");
  assert.equal(db.tables.cierreEvento.length, 1);
});

test("editar venta local no resucita reverso confirmado por proveedor", async () => {
  const db = database({ venta: [sale(1)], cierreCredito: [credit(1, { providerCreditId: "p-1", status: "REVERSADO", source: "CONECTAMOS + API PAYJOY" })],
    cierreVentaPendiente: [{ ventaId: 1, revision: 1, updatedAt: new Date() }] });
  await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].status, "REVERSADO");
});

test("editar una venta conserva ID proveedor observado aunque aún use importes locales", async () => {
  const db = database({ venta: [sale(1, { payjoy: 1500000 })], cierreCredito: [credit(1, { providerCreditId: "p-observado", creditNumber: "p-observado", source: "CONECTAMOS" })],
    cierreVentaPendiente: [{ ventaId: 1, revision: 1, updatedAt: new Date() }] });
  await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].providerCreditId, "p-observado");
  assert.equal(db.tables.cierreCredito[0].amount, 1500000);
});

test("dato local incompleto mantiene cobertura pendiente y no impide procesar otras ventas", async () => {
  const db = database({ venta: [sale(1, { financierasDetalle: [{ nombre: "PAYJOY", valorNeto: 1000000 }] }), sale(2)],
    cierreVentaPendiente: [1, 2].map((ventaId) => ({ ventaId, revision: 1, updatedAt: new Date(0) })),
    cierreSyncEstado: [{ key: "LOCAL", initialized: false }] });
  const result = await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(result.remaining, 1);
  assert.equal(db.tables.cierreSyncEstado[0].initialized, false);
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].ventaId, 2);
  assert.equal(db.tables.cierreVentaPendiente[0].ventaId, 1);
  assert.ok(db.tables.cierreVentaPendiente[0].nextAttempt > new Date());
});

async function withProviderEnabled(run) {
  const previous = process.env.CIERRE_PROVIDER_SYNC_ENABLED;
  process.env.CIERRE_PROVIDER_SYNC_ENABLED = "1";
  try { return await run(); }
  finally { if (previous === undefined) delete process.env.CIERRE_PROVIDER_SYNC_ENABLED; else process.env.CIERRE_PROVIDER_SYNC_ENABLED = previous; }
}

test("lote local acelerado nunca consulta proveedores aunque estén habilitados y haya trabajos listos", async () => withProviderEnabled(async () => {
  const db = database({ venta: [sale(1)], cierreCredito: [credit(1)],
    cierreSyncTrabajo: [{ key: "job-1", financial: "PAYJOY", localKey: "VENTA:1:PAYJOY", state: "PENDIENTE", attempts: 0, nextAttempt: new Date(0) }] });
  let calls = 0;
  const provider = async () => { calls++; throw new Error("No debe consultar en localOnly"); };
  const result = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch({ localOnly: true });
  assert.equal(calls, 0);
  assert.deepEqual(result.provider, { processed: 0, deferred: true });
  assert.equal(db.tables.cierreSyncTrabajo[0].attempts, 0);
}));

test("lease impide dos workers y secreto protege endpoint de sincronización", async () => {
  const db = database({ cierreSyncEstado: [{ key: "WORKER", lockedUntil: new Date(Date.now() + 60000), lockToken: "other" }] });
  assert.deepEqual(await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch(), { busy: true });
  assert.equal(db.calls.filter((c) => c.table === "cierreVentaPendiente").length, 0);
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-worker-secret";
  try {
    const route = modules(db.prisma).load("app/api/cierre/sync/route.ts");
    assert.equal((await route.POST(new Request("https://conectamos.test/api/cierre/sync", { method: "POST" }))).status, 401);
    assert.equal((await route.POST(new Request("https://conectamos.test/api/cierre/sync", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status, 401);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});
