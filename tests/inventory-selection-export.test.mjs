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
const invoice = load("lib/inventory-invoice-view.ts");
const { crearLibroSeleccionInventario } = load("lib/inventory-selection-export.ts", {
  "./inventory-debt-view": debt, "./inventory-invoice-view": invoice,
});
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

test("el estado de factura distingue emisión de ausencia, error, proceso y anulación sin falsos positivos", () => {
  assert.deepEqual(invoice.vistaFacturaInventario(null), { estado: "SIN_FACTURA", etiqueta: "Sin factura vinculada", tono: "neutral" });
  assert.deepEqual(invoice.vistaFacturaInventario(undefined), { estado: "SIN_FACTURA", etiqueta: "Sin factura vinculada", tono: "neutral" });
  const expected = [
    ["EMITIDA", "Con factura", "success"],
    ["PROCESANDO", "En proceso", "warning"],
    ["ERROR", "Error de factura", "danger"],
    ["ANULADA", "Anulada", "danger"],
  ];
  for (const [estado, etiqueta, tono] of expected) {
    const factura = { id: 10, estado, nombre: "FV-000010", url: "https://qa.test/fv10", error: null };
    const before = structuredClone(factura);
    assert.deepEqual(invoice.vistaFacturaInventario(factura), { estado, etiqueta, tono });
    assert.deepEqual(factura, before, "La vista no modifica el estado contable");
  }
  for (const estado of [undefined, "", "PENDIENTE_REVISION", "DESCONOCIDO"]) {
    const view = invoice.vistaFacturaInventario({ estado, nombre: "FV-000011", url: "https://qa.test/fv11" });
    assert.notEqual(view.tono, "success");
    assert.notEqual(view.etiqueta, "Con factura");
    assert.notEqual(view.etiqueta, "Sin factura", "Un vínculo de estado desconocido no se oculta como inexistente");
  }
});

test("Excel conserva número, ID, estado y enlace de factura para cada equipo, incluidos vínculos sin número", () => {
  const documents = [
    { id: 50, estado: "EMITIDA", nombre: "0000123", url: "https://qa.test/0000123", error: null },
    null,
    { id: 51, estado: "ERROR", nombre: null, url: null, error: "Siigo rechazó la emisión" },
    { id: 52, estado: "PROCESANDO", nombre: null, url: null, error: null },
    { id: 53, estado: "ANULADA", nombre: "FV-0000124", url: "https://qa.test/fv124", error: null },
  ];
  const selection = documents.map((facturaStand, index) => ({ ...equipment, id: 100 + index, facturaStand }));
  const before = structuredClone(selection);
  const workbook = crearLibroSeleccionInventario(XLSX, selection, "SEDE 8");
  const serialized = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(serialized.Sheets["Equipos seleccionados"], { defval: "" });
  assert.equal(rows.length, documents.length);
  for (const [index, document] of documents.entries()) {
    assert.equal(rows[index]["Factura del stand"], document?.nombre ?? "");
    assert.equal(rows[index]["Estado de factura"], document?.estado ?? "SIN_FACTURA");
    assert.equal(rows[index]["ID factura"], document?.id ?? "");
    assert.equal(rows[index]["Enlace de factura"], document?.url ?? "");
  }
  assert.equal(rows[0]["Factura del stand"], "0000123");
  assert.equal(typeof rows[0]["Factura del stand"], "string");
  assert.equal(serialized.Sheets["Equipos seleccionados"].R2.f, undefined);
  assert.deepEqual(selection, before, "Exportar sólo consulta los documentos existentes");
});
