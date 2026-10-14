import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { modules, database, credit, admin, supervisor } from "./cierre-test-helpers.mjs";

const date = new Date("2026-09-12T05:00:00Z");
function sumas(id, changes = {}) {
  return credit(id, { financial: "SUMASPAY", providerCreditId: `S-${id}`,
    localKey: null, sedeId: null, effectiveAt: date, amount: 812345,
    status: "PENDIENTE", source: "API SUMASPAY · pendiente de vinculación",
    evidence: { source: "credits-by-client", providerId: `S-${id}`, providerStatus: "ACTIVE",
      principal: 812345, effectiveDate: date.toISOString(), diagnostics: { reasons: [] } }, ...changes });
}

async function workbook(session) {
  const db = database({ cierreCredito: [
    sumas(1, { localKey: "VENTA:1:SUMASPAY", sedeId: 1, status: "EFECTIVO", source: "CONECTAMOS + API SUMASPAY" }),
    sumas(2), sumas(3, { localKey: "VENTA:3:SUMASPAY", sedeId: 2, status: "EFECTIVO" }),
    sumas(4, { status: "REVERSADO" }),
    credit(5, { financial: "SUMASPAY", localKey: "VENTA:5:SUMASPAY", effectiveAt: date, amount: 900000 }),
    credit(6, { financial: "SUMASPAY", localKey: "VENTA:6:SUMASPAY", effectiveAt: date, sedeId: 2 }),
    credit(7, { effectiveAt: date, amount: 300000 }),
  ] });
  const loader = modules(db.prisma, { session });
  const response = await loader.load("app/api/cierre/export/route.ts").GET(new Request(
    "https://conectamos.test/api/cierre/export?mode=month&month=2026-09&page=2"));
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.ok(!loader.imports.includes("@/lib/sumasconsulta"));
  return book;
}

test("Excel SUMASPAY totaliza sólo API efectiva sin comparaciones locales", async () => {
  const book = await workbook(admin);
  const credits = book.getWorksheet("Créditos");
  assert.equal(credits.rowCount, 4);
  let amount = 0;
  credits.eachRow((row, index) => { if (index > 1) {
    assert.equal(row.getCell(1).value, "SUMASPAY");
    assert.equal(row.getCell(8).value, "EFECTIVO");
    amount += row.getCell(7).value;
  } });
  assert.equal(amount, 2437035);
  const summary = book.getWorksheet("Cierre").getSheetValues().find((row) => row?.[1] === "SUMASPAY");
  assert.equal(summary[2], 3);
  assert.equal(summary[3], amount);
  assert.match(summary[5], /API SUMASPAY/);
  assert.equal(book.getWorksheet("Conciliación SUMASPAY"), undefined);
  assert.equal(book.getWorksheet("Pendientes SUMASPAY"), undefined);
  assert.equal(book.getWorksheet("Pendientes PAYJOY"), undefined);
  const source = book.getWorksheet("Fuentes").getSheetValues().find((row) => row?.[1] === "SUMASPAY");
  assert.match(source.at(-1), /referencias conocidas consultadas/);
});

test("Excel SUMASPAY de sede no expone los créditos sin sede o pendientes ajenos", async () => {
  const book = await workbook(supervisor);
  assert.equal(book.getWorksheet("Créditos").rowCount, 2);
  const summary = book.getWorksheet("Cierre").getSheetValues().find((row) => row?.[1] === "SUMASPAY");
  assert.equal(summary[2], 1);
  assert.equal(summary[3], 812345);
  assert.equal(book.getWorksheet("Pendientes SUMASPAY"), undefined);
  assert.equal(book.getWorksheet("Créditos").getCell("F2").value, "Centro");
});
