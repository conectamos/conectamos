import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createFixture, administrator, supervisor, historicalDescription, longDescription } from "./helpers/cierre-dia-fixture.mjs";

const request = (params = {}) => new Request(`https://qa.invalid/api/caja/cierre-dia?${new URLSearchParams({ fecha: "2026-10-29", sedeId: "6", vista: "tabla", formato: "excel", ...params })}`);
async function workbook(fixture, params) {
  const response = await fixture.GET(request(params));
  assert.equal(response.status, 200, JSON.stringify(fixture.errors));
  assert.match(response.headers.get("content-type"), /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = book.getWorksheet("Movimientos de caja");
  assert.ok(sheet, "el detalle de caja debe estar en la hoja anunciada");
  const rows = [];
  sheet.eachRow((row) => {
    if (/^(?:#\d+|GC-\d+)(?:\b|$)/.test(String(row.getCell(1).value))) rows.push(row);
  });
  return { response, book, sheet, rows };
}
const reference = (row) => String(row.getCell(1).value).match(/^#?((?:GC-)?\d+)/)?.[1];
const byId = (rows, id) => rows.find((row) => reference(row) === String(id));
const metric = (sheet, label) => {
  let value;
  sheet.eachRow((row) => row.eachCell((cell, column) => {
    const nextValue = row.getCell(column + 1).value;
    if (cell.value === label && typeof nextValue === "number") value = nextValue;
  }));
  return value;
};

test("Excel conserva destinatario e IMEI históricos, referencia y fecha Bogotá desde SELECT real", async () => {
  const fixture = createFixture();
  const { response, rows } = await workbook(fixture);
  assert.match(response.headers.get("content-disposition"), /cierre-2026-10-29-sede-6.xlsx/);
  const row = byId(rows, 101);
  assert.ok(row);
  assert.equal(row.getCell(3).value, "EGRESO");
  assert.ok(String(row.getCell(4).value).includes(historicalDescription));
  assert.equal(row.getCell(5).value, "SEDE 6 QA");
  assert.equal(row.getCell(6).value, 1250000);
  const date = row.getCell(2).value;
  if (date instanceof Date) assert.equal(date.toISOString(), "2026-10-29T19:17:39.000Z");
  else assert.match(String(date), /29\/10\/2026.*19:17/);
  const query = fixture.calls.find((call) => call.table === "cajaMovimiento" && call.method === "findMany");
  for (const field of ["id", "createdAt", "descripcion"]) assert.equal(query.select[field], true);
});

test("detalle ausente no inventa acreedor; texto largo y gasto cartera conservan todo su contenido", async () => {
  const { rows } = await workbook(createFixture());
  assert.match(String(byId(rows, 103).getCell(4).value), /Sin detalle registrado/i);
  const fullDetail = rows.filter((row) => reference(row) === "104").map((row) => row.getCell(4).value).join(" ").replace(/\s+/g, " ");
  assert.ok(fullDetail.includes(longDescription));
  const expense = byId(rows, "GC-201");
  assert.ok(expense);
  assert.match(String(expense.getCell(4).value), /Gestión de cartera QA/);
  assert.equal(expense.getCell(6).value, 15000);
});

test("agregar detalle no altera valores, totales diarios ni ventas del Excel", async () => {
  const { book, rows } = await workbook(createFixture());
  assert.equal(new Set(rows.map(reference)).size, 7);
  const ingresos = rows.filter((row) => row.getCell(3).value === "INGRESO").reduce((sum, row) => sum + Number(row.getCell(6).value || 0), 0);
  const egresos = rows.filter((row) => row.getCell(3).value === "EGRESO").reduce((sum, row) => sum + Number(row.getCell(6).value || 0), 0);
  assert.equal(ingresos, 260000);
  assert.equal(egresos, 2070000);
  const summary = book.getWorksheet("Cierre del dia");
  assert.equal(metric(summary, "INGRESOS CAJA"), ingresos);
  assert.equal(metric(summary, "EGRESOS CAJA"), egresos);
  assert.equal(metric(summary, "NETO CAJA DIA"), ingresos - egresos);
  assert.equal(metric(summary, "VENTAS"), 1);
  assert.equal(metric(summary, "INGRESOS"), 460000);
  assert.match(JSON.stringify(summary.getSheetValues()), /VENTA-QA-301/);
});

test("periodo día respeta límites de Bogotá y alcance global o por sede", async () => {
  const own = await workbook(createFixture());
  const ownIds = own.rows.map(reference);
  for (const id of ["101", "108", "109"]) assert.ok(ownIds.includes(id));
  for (const id of ["105", "106", "107"]) assert.ok(!ownIds.includes(id));
  const all = await workbook(createFixture(), { sedeId: "" });
  assert.ok(byId(all.rows, 105));
  const month = await workbook(createFixture(), { mes: "2026-10" });
  assert.ok(byId(month.rows, 106));
  assert.ok(byId(month.rows, 107));
  const range = await workbook(createFixture(), { fechaInicio: "2026-10-28", fechaFin: "2026-10-29" });
  assert.ok(byId(range.rows, 106));
  assert.ok(!byId(range.rows, 107));
});

test("supervisor no amplía su sede al manipular filtros; sólo roles ADMIN/AUDITOR ven consolidado", async () => {
  for (const user of [supervisor, { ...supervisor, perfilTipo: "ADMINISTRADOR" }]) {
    const fixture = createFixture({ user });
    const { rows } = await workbook(fixture, { sedeId: "8" });
    assert.ok(byId(rows, 101));
    assert.ok(!byId(rows, 105));
    for (const call of fixture.calls.filter((call) => call.table !== "sede")) assert.equal(call.where.sedeId, 6);
  }
  const auditor = createFixture({ user: { ...administrator, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" } });
  assert.ok(byId((await workbook(auditor, { sedeId: "8" })).rows, 105));
});

test("rechaza sesión ausente y perfiles sin permiso antes de consultar la base", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map((perfilTipo) => ({ ...administrator, perfilTipo }))]) {
    const fixture = createFixture({ user });
    const response = await fixture.GET(request());
    assert.equal(response.status, user ? 403 : 401);
    assert.deepEqual(fixture.calls, []);
  }
});

test("ambas vistas PDF generan un archivo real con destinatario, IMEI y final del detalle largo", async () => {
  for (const vista of ["tabla", "resumen"]) {
    const fixture = createFixture();
    const response = await fixture.GET(request({ vista, formato: "pdf" }));
    assert.equal(response.status, 200, JSON.stringify(fixture.errors));
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const text = fixture.pdfText.join(" ").replace(/\s+/g, " ");
    assert.ok(text.includes(historicalDescription));
    assert.match(text, /FIN DEL DETALLE QA/);
    assert.match(text, /Sin detalle registrado/i);
    assert.match(text, /#?101/);
    assert.match(text, /29\/10\/2026/);
    assert.doesNotMatch(text, /DESTINATARIO SEDE AJENA QA|DIA ANTERIOR QA|DIA SIGUIENTE QA/);
  }
});
