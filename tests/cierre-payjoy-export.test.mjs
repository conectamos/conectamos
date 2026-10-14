import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { modules, database, credit, admin, supervisor } from "./cierre-test-helpers.mjs";

function fixture() {
  const date = new Date("2026-09-15T18:00:00Z");
  const api = Array.from({ length: 13 }, (_, index) => credit(`api-${index}`, {
    providerCreditId: `payjoy-${index}`, creditNumber: `payjoy-${index}`,
    localKey: index < 3 ? `VENTA:${index}:PAYJOY` : null,
    sedeId: index < 2 ? 1 : index === 2 ? 2 : null,
    effectiveAt: date, amount: 850000,
    status: index < 3 ? "EFECTIVO" : "PENDIENTE",
    source: index < 3 ? "CONECTAMOS + API PAYJOY" : "API PAYJOY · pendiente de vinculación",
    evidence: { source: "list-transactions", providerId: `payjoy-${index}`, providerStatus: "FINANCE",
      currency: "COP", principal: 850000, effectiveDate: date.toISOString(), diagnostics: { reasons: [] } },
  }));
  return database({ cierreCredito: [...api,
    credit("local-review", { effectiveAt: date, amount: 900000 }),
    credit("other-branch-review", { effectiveAt: date, amount: 700000, sedeId: 2 }),
  ], cierreSyncTrabajo: [{ key: "PERIODO:PAYJOY:2026-09-15", financial: "PAYJOY",
    localKey: "PERIODO:PAYJOY:2026-09-15", state: "REVISADO", lastSuccess: new Date("2026-10-14T15:00:00Z") }] });
}

async function exportBook(session, extra = "") {
  const db = fixture();
  const loader = modules(db.prisma, { session });
  const response = await loader.load("app/api/cierre/export/route.ts").GET(new Request(
    `https://conectamos.test/api/cierre/export?mode=day&date=2026-09-15&page=2${extra}`));
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.ok(!loader.imports.includes("@/lib/cierre-sync"));
  assert.ok(!loader.imports.includes("@/lib/payjoy-retail"));
  return book;
}

test("Excel PAYJOY incluye todos los créditos API y separa locales pendientes sin sumarlos", async () => {
  const book = await exportBook(admin);
  const credits = book.getWorksheet("Créditos");
  assert.equal(credits.rowCount, 14, "13 créditos API; el filtro page no limita exportación");
  let amount = 0;
  const ids = new Set();
  credits.eachRow((row, index) => {
    if (index === 1) return;
    ids.add(row.getCell(3).value);
    amount += row.getCell(7).value;
    assert.equal(row.getCell(8).value, "EFECTIVO");
  });
  assert.equal(ids.size, 13);
  assert.equal(amount, 11050000);
  const comparison = book.getWorksheet("Conciliación PAYJOY");
  assert.equal(comparison.getCell("B2").value, "API PAYJOY");
  assert.equal(comparison.getCell("B7").value, 13);
  assert.equal(comparison.getCell("C7").value, amount);
  assert.equal(comparison.getCell("B8").value, 5);
  assert.equal(comparison.getCell("B12").value, 10);
  assert.equal(comparison.getCell("B13").value, 2);
  const pending = book.getWorksheet("Pendientes PAYJOY");
  assert.equal(pending.rowCount, 3);
  assert.match(pending.getCell("I2").value, /no sumar al total API/);
});

test("Excel PAYJOY de sede no expone datos globales sin sede ni pendientes de otras sedes", async () => {
  const book = await exportBook(supervisor);
  const credits = book.getWorksheet("Créditos");
  assert.equal(credits.rowCount, 3);
  assert.equal(book.getWorksheet("Pendientes PAYJOY").rowCount, 2);
  const comparison = book.getWorksheet("Conciliación PAYJOY");
  assert.equal(comparison.getCell("B7").value, 2);
  assert.equal(comparison.getCell("B8").value, 3);
  assert.equal(comparison.getCell("B12").value, 0);
  assert.equal(comparison.getCell("B13").value, 1);
  const global = await exportBook(admin, "&sedeId=1");
  assert.equal(global.getWorksheet("Créditos").rowCount, credits.rowCount);
});

test("sin datos API el Excel no sustituye el total PAYJOY con ventas locales ni certifica cero", async () => {
  const db = database({ cierreCredito: [credit(1)] });
  const response = await modules(db.prisma, { session: admin }).load("app/api/cierre/export/route.ts").GET(new Request(
    "https://conectamos.test/api/cierre/export?mode=day&date=2026-10-12"));
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(book.getWorksheet("Créditos").rowCount, 1);
  assert.equal(book.getWorksheet("Pendientes PAYJOY").rowCount, 2);
  const comparison = book.getWorksheet("Conciliación PAYJOY");
  assert.equal(comparison.getCell("B2").value, "API PAYJOY");
  assert.equal(comparison.getCell("B7").value, "Sin confirmar");
  assert.equal(comparison.getCell("C7").value, "Sin confirmar");
  assert.equal(comparison.getCell("B9").value, "Sin confirmar");
  assert.equal(comparison.getCell("B8").value, 1);
  assert.equal(comparison.getCell("C8").value, 1000000);
});
