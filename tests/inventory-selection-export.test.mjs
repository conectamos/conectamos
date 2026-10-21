import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function load(path, imports = {}) {
  const javascript = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", javascript)((name) => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const debt = load("lib/inventory-debt-view.ts");
const { crearLibroSeleccionInventario } = load("lib/inventory-selection-export.ts", { "./inventory-debt-view": debt });
const equipment = {
  id: 10, imei: "001234567890123", referencia: "IPHONE 15", tipoProducto: "TELEFONIA", color: "AZUL",
  costo: 1_715_000, sedeId: 8, sede: { nombre: "SEDE 8" }, acreedorId: 101,
  acreedorNombre: "Proveedor QA", deboA: "Nombre histórico", deudaPendiente: 1_200_000.75,
  estadoActual: "BODEGA", estadoFinanciero: "DEUDA", distribuidor: "Distribuidor QA", origen: "COMPRA",
  prestamoDestino: { nombre: "SEDE 3", prestamoId: 50, estado: "APROBADO" }, facturaStand: { nombre: "0000123" },
};

test("Excel conserva IMEI y textos literales, saldos reales y los detalles completos de la selección", () => {
  const selection = [
    { ...equipment, referencia: "=1+1", distribuidor: "+Distribuidor QA", facturaStand: { nombre: "0000123" } },
    { ...equipment, id: 11, imei: "000000000000011", costo: 900_000.5, estadoFinanciero: "PAGO", deudaPendiente: 800_000,
      acreedorId: 102, acreedorNombre: "Proveedor QA", prestamoDestino: null, facturaStand: null },
  ];
  const before = structuredClone(selection);
  const workbook = crearLibroSeleccionInventario(XLSX, selection, "SEDE 8");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const downloaded = XLSX.read(bytes, { type: "buffer", cellNF: true });
  assert.deepEqual(downloaded.SheetNames, ["Equipos seleccionados", "Resumen"]);
  const sheet = downloaded.Sheets["Equipos seleccionados"];
  const rows = XLSX.utils.sheet_to_json(sheet);
  assert.equal(rows.length, 2);
  assert.equal(sheet.B2.t, "s");
  assert.equal(sheet.B2.z, "@");
  assert.equal(sheet.B2.v, "001234567890123");
  assert.equal(sheet.B3.v, "000000000000011");
  assert.equal(sheet.C2.t, "s");
  assert.equal(sheet.C2.v, "=1+1");
  assert.equal(sheet.C2.f, undefined, "Las referencias se exportan como texto, nunca como fórmulas");
  assert.equal(sheet.M2.v, "+Distribuidor QA");
  assert.equal(sheet.R2.t, "s");
  assert.equal(sheet.R2.v, "0000123");
  assert.equal(sheet.F2.t, "n");
  assert.equal(sheet.F2.v, 1_715_000);
  assert.equal(sheet.F2.z, '"$"#,##0');
  assert.equal(sheet.F3.v, 900_000.5);
  assert.equal(sheet.F3.z, '"$"#,##0.00');
  assert.equal(sheet.L2.t, "n");
  assert.equal(sheet.L2.v, 1_200_000.75);
  assert.equal(sheet.L2.z, '"$"#,##0.00');
  assert.equal(sheet.L3.v, 0, "Un equipo pagado no inventa saldo pendiente");
  assert.deepEqual(rows.map((row) => [row.Acreedor, row["ID acreedor"]]), [["Proveedor QA", 101], ["Proveedor QA", 102]], "Los acreedores homónimos conservan su ID");
  assert.equal(rows[0].Sede, "SEDE 8");
  assert.equal(rows[0]["Sede destino"], "SEDE 3");
  assert.equal(rows[0]["ID préstamo"], 50);
  assert.equal(rows[0]["Estado préstamo"], "APROBADO");
  assert.equal(rows[0]["Estado del equipo"], "BODEGA");
  assert.equal(rows[0]["Estado financiero"], "DEUDA");
  assert.equal(rows[0].Origen, "COMPRA");
  const summary = downloaded.Sheets.Resumen;
  assert.equal(summary.B2.v, "SEDE 8");
  assert.equal(summary.B3.v, 2);
  assert.equal(summary.B4.v, 2_615_000.5);
  assert.equal(summary.B5.v, 1_200_000.75);
  assert.equal(summary.B4.t, "n");
  assert.equal(summary.B5.z, '"$"#,##0.00');
  assert.deepEqual(selection, before, "Exportar es una operación de lectura");
});

test("Excel incluye 355 equipos de la selección completa y calcula sus totales sin limitar páginas", () => {
  const selection = Array.from({ length: 355 }, (_, index) => ({
    ...equipment, id: index + 1, imei: String(index + 1).padStart(15, "0"), costo: 1_000,
    deudaPendiente: index % 2 ? 500 : 250, estadoFinanciero: index % 3 ? "DEUDA" : "PAGO",
  }));
  const workbook = crearLibroSeleccionInventario(XLSX, selection, "Todas las sedes");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Equipos seleccionados"]);
  assert.equal(rows.length, 355);
  assert.deepEqual(rows.map((row) => row.ID), selection.map((row) => row.id));
  assert.equal(rows.at(-1).IMEI, "000000000000355");
  assert.equal(workbook.Sheets.Resumen.B3.v, 355);
  assert.equal(workbook.Sheets.Resumen.B4.v, 355_000);
  assert.equal(workbook.Sheets.Resumen.B5.v, selection.reduce((total, row) => total + debt.deudaPendienteInventario(row), 0));
});

test("Excel rechaza una selección vacía o importes no finitos sin producir cifras engañosas", () => {
  assert.throws(() => crearLibroSeleccionInventario(XLSX, [], "SEDE 8"), /Selecciona al menos un equipo/);
  for (const costo of [NaN, Infinity, -Infinity]) {
    assert.throws(() => crearLibroSeleccionInventario(XLSX, [{ ...equipment, costo }], "SEDE 8"), /ID 10/);
  }
});
