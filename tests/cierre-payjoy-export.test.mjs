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

test("Excel PAYJOY incluye todos los créditos API sin agregar ventas locales ni comparaciones", async () => {
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
  const summary = book.getWorksheet("Cierre").getSheetValues().find((row) => row?.[1] === "PAYJOY");
  assert.equal(summary[2], 13);
  assert.equal(summary[3], amount);
  assert.match(summary[5], /API PAYJOY/);
  assert.equal(book.getWorksheet("Conciliación PAYJOY"), undefined);
  assert.equal(book.getWorksheet("Pendientes PAYJOY"), undefined);
  assert.equal(credits.columnCount, 9);
  assert.ok(!JSON.stringify(book.getWorksheet("Fuentes").getSheetValues()).includes("Vinculadas"));
});

test("Excel PAYJOY de sede no expone datos globales sin sede ni pendientes de otras sedes", async () => {
  const book = await exportBook(supervisor);
  const credits = book.getWorksheet("Créditos");
  assert.equal(credits.rowCount, 3);
  assert.equal(book.getWorksheet("Pendientes PAYJOY"), undefined);
  const summary = book.getWorksheet("Cierre").getSheetValues().find((row) => row?.[1] === "PAYJOY");
  assert.equal(summary[2], 2);
  assert.equal(summary[3], 1700000);
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
  assert.equal(book.getWorksheet("Pendientes PAYJOY"), undefined);
  const summary = book.getWorksheet("Cierre").getSheetValues().find((row) => row?.[1] === "PAYJOY");
  assert.equal(summary[2], "Sin confirmar");
  assert.equal(summary[3], "Sin confirmar");
  assert.match(summary[5], /API PAYJOY/);
});
