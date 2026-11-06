import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { modules, database, credit, admin, supervisor, params } from "./cierre-test-helpers.mjs";

const actor = { ...admin, id: 7, nombre: "Administrador QA" };
const october = { from: "2026-10-01", to: "2026-10-31", sedeId: null };
const query = (extra = "") => params(extra);
function sumas(id, amount, overrides = {}) {
  const effectiveAt = new Date("2026-10-15T18:00:00Z");
  return credit(id, { financial: "SUMASPAY", localKey: `VENTA:${id}:SUMASPAY`,
    providerCreditId: `SUMAS-QA-${id}`, amount, effectiveAt, source: "CONECTAMOS + API SUMASPAY",
    evidence: { source: "credits-by-client", providerId: `SUMAS-QA-${id}`, providerStatus: "ACTIVE",
      principal: amount, effectiveDate: effectiveAt.toISOString(), diagnostics: { reasons: [] } }, ...overrides });
}
function setup(seed = {}) {
  const db = database({ cierreCredito: [sumas(1, 100000000), sumas(2, 68787733)], ...seed });
  const loader = modules(db.prisma, { session: actor });
  const reporting = loader.load("lib/cierre-report.ts");
  const accounting = loader.load("lib/cierre-accounting.ts");
  return { db, loader, read: (p = query(), session = actor, detail = false, exporting = false) => reporting.readCierreReport(p, session, detail, exporting),
    save: (patch, scope = october) => accounting.saveCierreAccounting(db.prisma, scope, actor,
      accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 0, ...patch })) };
}
const financier = (report, name = "SUMASPAY") => report.financiers.find((row) => row.name === name);
async function exportBook(loader, search = query()) {
  const response = await loader.load("app/api/cierre/export/route.ts").GET(new Request(`https://conectamos.test/api/cierre/export?${search}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  return book;
}
const sheetRow = (book, sheet, name) => book.getWorksheet(sheet).getSheetValues().find((row) => row?.[1] === name);

test("corrección guardada sobrevive otra lectura sin alterar capital API, créditos o cobertura", async () => {
  const { db, loader, read, save } = setup();
  const original = structuredClone(db.tables.cierreCredito);
  await save({ correctedAmount: 178027733, collectedAmount: 120000000, note: "Total oficial octubre" });
  const report = await read(query("&financier=SUMASPAY"), actor, true);
  const row = financier(report);
  assert.equal(row.amount, 178027733);
  assert.equal(row.syncedAmount, 168787733);
  assert.equal(row.correctedAmount - row.syncedAmount, 9240000);
  assert.equal(row.collectedAmount, 120000000);
  assert.equal(row.balance, 58027733);
  assert.equal(report.totals.amount, row.amount);
  assert.equal(report.totals.syncedAmount, row.syncedAmount);
  assert.equal(report.totals.collectedAmount, row.collectedAmount);
  assert.equal(report.totals.balance, row.balance);
  assert.equal(report.total, 2);
  assert.equal(report.units, 2);
  assert.equal(report.items.reduce((n, item) => n + item.amount, 0), 168787733);
  assert.equal(row.reconciliation.api.amount, 168787733);
  assert.equal(row.complete, false);
  assert.equal(report.complete, false);
  assert.equal(row.accounting.version, 1);
  assert.equal(row.accounting.updatedBy, actor.nombre);
  assert.deepEqual(db.tables.cierreCredito, original);
  assert.equal(db.tables.cierreAjusteEvento.length, 1);
  const reloaded = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(query(), actor);
  assert.equal(financier(reloaded).amount, 178027733);
  assert.ok(!loader.imports.some((name) => /cierre-providers|sumasconsulta|cierre-sync/.test(name)));
  assert.ok(!db.calls.some((call) => call.table === "cierreCredito" && ["create", "update", "upsert", "deleteMany", "updateMany"].includes(call.method)));
});

test("mes y rango equivalente comparten ajuste; otros periodos y sedes conservan independencia", async () => {
  const { read, save } = setup();
  await save({ correctedAmount: 178027733, collectedAmount: 120000000, note: "Octubre global" });
  const equivalent = await read(new URLSearchParams("mode=range&from=2026-10-01&to=2026-10-31"));
  assert.equal(financier(equivalent).correctedAmount, 178027733);
  for (const p of [query("&sedeId=1"), new URLSearchParams("mode=month&month=2026-09"),
    new URLSearchParams("mode=range&from=2026-10-01&to=2026-10-30"),
    new URLSearchParams("mode=day&date=2026-10-15"), new URLSearchParams("mode=week&date=2026-10-15")]) {
    const row = financier(await read(p));
    assert.equal(row.correctedAmount, null);
    assert.equal(row.collectedAmount, null);
    assert.equal(row.accounting.updatedBy, null);
  }
  await save({ correctedAmount: 999, collectedAmount: 100, note: "Solo Centro" }, { ...october, sedeId: 1 });
  const own = await read(query("&sedeId=TODAS"), supervisor);
  assert.equal(own.scope.sedeId, 1);
  assert.equal(financier(own).amount, 999);
  assert.equal(financier(own).balance, 899);
  assert.equal(own.options.canEditAccounting, false);
  assert.equal(financier(await read()).amount, 178027733);
  await assert.rejects(read(query("&sedeId=2"), supervisor), (error) => error.status === 403);
});

test("cero explícito, recaudo mayor al cierre y retorno al valor sincronizado se distinguen de datos ausentes", async () => {
  const { read, save } = setup();
  let row = financier(await read());
  assert.equal(row.collectedAmount, null);
  assert.equal(row.balance, null);
  await save({ correctedAmount: 0, collectedAmount: 0, note: "Ajuste a cero" });
  let report = await read(query("&financier=SUMASPAY"), actor, true);
  assert.equal(report.totals.amount, 0);
  assert.equal(report.totals.collectedAmount, 0);
  assert.equal(report.totals.balance, 0);
  assert.equal(report.units, 2);
  await save({ version: 1, correctedAmount: 100.25, collectedAmount: 120.5, note: "Diferencia de recaudo" });
  row = financier(await read());
  assert.equal(row.balance, -20.25);
  await save({ version: 2, correctedAmount: null, collectedAmount: null, note: null });
  row = financier(await read());
  assert.equal(row.amount, 168787733);
  assert.equal(row.correctedAmount, null);
  assert.equal(row.collectedAmount, null);
  assert.equal(row.balance, null);
});

test("ocultar excluye créditos, fuentes y totales; restaurar recupera el mismo ajuste guardado", async () => {
  const { db, loader, read, save } = setup({ cierreCredito: [sumas(1, 1000000), credit(2, { financial: "CELYA", amount: 250000 })] });
  await save({ correctedAmount: 1200000, collectedAmount: 300000, hidden: true, note: "Ajuste conservado" });
  const report = await read(query(), actor, false, true);
  assert.equal(financier(report), undefined);
  assert.equal(report.hiddenFinanciers.length, 1);
  assert.equal(report.hiddenFinanciers[0].accounting.correctedAmount, 1200000);
  assert.equal(report.totals.amount, 250000);
  assert.equal(report.totals.units, 1);
  assert.deepEqual(report.items.map((row) => row.financial), ["CELYA"]);
  await assert.rejects(read(query("&financier=SUMASPAY"), actor, true), (error) => error.status === 404);
  const book = await exportBook(loader);
  assert.equal(sheetRow(book, "Cierre", "SUMASPAY"), undefined);
  assert.equal(sheetRow(book, "Fuentes", "SUMASPAY"), undefined);
  assert.equal(sheetRow(book, "Créditos", "SUMASPAY"), undefined);
  assert.equal(sheetRow(book, "Cierre", "TOTAL")[3], 250000);
  assert.equal(book.getWorksheet("Créditos").rowCount, 2);
  await save({ version: 1, hidden: false });
  const restored = await read(query(), actor, false, true);
  assert.equal(restored.hiddenFinanciers.length, 0);
  assert.equal(financier(restored).amount, 1200000);
  assert.equal(financier(restored).collectedAmount, 300000);
  assert.equal(restored.totals.amount, 1450000);
  assert.equal(restored.totals.units, 2);
  assert.equal(restored.items.length, 2);
  assert.equal(db.tables.cierreCredito.length, 2);
});

test("ocultar todas las financieras muestra cero visible sin certificar cobertura pendiente", async () => {
  const { read, save } = setup();
  const names = (await read()).financiers.map((row) => row.name);
  for (const financial of names) await save({ financial, hidden: true });
  const report = await read(query(), actor, false, true);
  assert.equal(report.financiers.length, 0);
  assert.equal(report.hiddenFinanciers.length, names.length);
  assert.equal(report.totals.units, 0);
  assert.equal(report.totals.amount, 0);
  assert.equal(report.items.length, 0);
  assert.equal(report.complete, false);
});

test("Excel distingue ajuste, capital sincronizado y recaudo manteniendo todos los créditos paginados", async () => {
  const { loader, read, save } = setup({ cierreCredito: Array.from({ length: 13 }, (_, index) => sumas(index + 1, 1000000)) });
  await save({ correctedAmount: 14000000, collectedAmount: 10000000, note: "Informe oficial de octubre" });
  const first = await read(query("&financier=SUMASPAY"), actor, true);
  const second = await read(query("&financier=SUMASPAY&page=2"), actor, true);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 3);
  assert.equal(first.total, 13);
  assert.deepEqual(first.totals, second.totals);
  const book = await exportBook(loader, query("&page=2"));
  const row = sheetRow(book, "Cierre", "SUMASPAY");
  assert.equal(row[2], 13);
  assert.equal(row[3], 14000000);
  assert.match(row[5], /API SUMASPAY/);
  assert.equal(row[6], 10000000);
  assert.equal(row[7], 4000000);
  assert.equal(row[8], 13000000);
  assert.equal(row[9], "Sí");
  assert.equal(row[10], "Informe oficial de octubre");
  assert.equal(row[12], actor.nombre);
  assert.equal(book.getWorksheet("Créditos").rowCount, 14);
  const credits = book.getWorksheet("Créditos").getSheetValues().filter((r, index) => index > 1 && r);
  assert.equal(credits.reduce((sum, r) => sum + r[7], 0), 13000000);
  assert.equal(sheetRow(book, "Cierre", "TOTAL")[3], 14000000);
  assert.equal(sheetRow(book, "Cierre", "TOTAL")[6], "Por completar", "Faltan recaudos de otras financieras visibles");
});

test("Excel de sede no expone ajustes ni ocultamientos del consolidado global", async () => {
  const { db, save } = setup();
  await save({ correctedAmount: 178027733, collectedAmount: 150000000, hidden: true, note: "Nota exclusiva global" });
  const loader = modules(db.prisma, { session: supervisor });
  const book = await exportBook(loader);
  const row = sheetRow(book, "Cierre", "SUMASPAY");
  assert.equal(row[3], 168787733);
  assert.equal(row[6], "Sin registrar");
  assert.equal(row[9], "No");
  assert.ok(!JSON.stringify(book.model).includes("Nota exclusiva global"));
  const response = await loader.load("app/api/cierre/export/route.ts").GET(new Request("https://conectamos.test/api/cierre/export?mode=month&month=2026-10&sedeId=2"));
  assert.equal(response.status, 403);
});

test("varios abonos conservan su fecha e importe; el saldo parcial y Excel usan el mismo filtro", async () => {
  const { db, loader, read, save } = setup();
  const payments = [
    { id: "abono-uno", date: "2026-10-25", amount: 10000000.25, reference: "Primer abono" },
    { id: "abono-dos", date: "2026-11-04", amount: 20000000.5, reference: "Segundo abono" },
  ];
  await save({ payments });
  const report = await read();
  assert.equal(report.totals.collectedAmount, null, "las demás financieras siguen sin registro");
  assert.equal(report.totals.recordedPaymentsAmount, 30000000.75);
  assert.equal(report.totals.recordedBalance, 138787732.25);
  const row = financier(report);
  assert.deepEqual(row.accounting.payments, payments);
  assert.equal(row.collectedAmount, 30000000.75);
  assert.equal(row.balance, 138787732.25);
  assert.equal(financier(await read(params("&sedeId=1"), supervisor)).collectedAmount, null);
  assert.equal(financier(await read(new URLSearchParams("mode=month&month=2026-11"))).collectedAmount, null);
  const book = await exportBook(loader);
  assert.deepEqual(book.getWorksheet("Pagos recibidos").getSheetValues().slice(2).map((line) => line.slice(1)), [
    ["SUMASPAY", "25/10/2026", 10000000.25, "Primer abono"],
    ["SUMASPAY", "04/11/2026", 20000000.5, "Segundo abono"],
  ]);
  assert.equal(sheetRow(book, "Cierre", "TOTAL REGISTRADO")[7], 138787732.25);
  const sedeBook = await exportBook(modules(db.prisma, { session: supervisor }), params("&sedeId=1"));
  assert.equal(sedeBook.getWorksheet("Pagos recibidos").rowCount, 1);
  await save({ version: 1, hidden: true });
  const hiddenBook = await exportBook(loader);
  assert.equal(hiddenBook.getWorksheet("Pagos recibidos").rowCount, 1);
});
