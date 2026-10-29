import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
function load(path, imports = {}) {
  const compiled = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", compiled)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {} });
  return loaded.exports;
}
const access = load("lib/access-control.ts");
const navigation = load("lib/bodega-navigation.ts");
const sedes = load("lib/sedes.ts");
const productTypes = load("lib/product-types.ts");
const productBrands = load("lib/commercial-product-brand.ts", { "@/lib/product-types": productTypes });
const view = load("lib/radar-inventory-view.ts");
const legacy = load("lib/radar-inventory-export.ts");
const bodega = { id: 9, rolNombre: "BODEGA", perfilTipo: "BODEGA", perfilNombre: "Encargado QA", perfilTipoLabel: "Bodega", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL" };
const branches = [
  { referencia: "IPHONE QA", estadoActual: "BODEGA", sede: { nombre: "SEDE 1" } },
  { referencia: "IPHONE QA", estadoActual: "BODEGA", sede: { nombre: "Stand Solutions" } },
  { referencia: "SAMSUNG QA", estadoActual: "BODEGA", sede: { nombre: "SEDE 2" } },
  { referencia: "VENDIDO QA", estadoActual: "VENDIDO", sede: { nombre: "SEDE 2" } },
];
const principal = [
  { referencia: "IPHONE QA", estado: "BODEGA" },
  { referencia: "SAMSUNG QA", estado: "BODEGA" },
  { referencia: "YA EN SEDE QA", estado: "PRESTAMO" },
];
function summaryProbe({ principalRows = principal, sedeRows = branches, fail = false } = {}) {
  const calls = [];
  const db = {
    inventarioPrincipal: { findMany: async args => { calls.push({ model: "principal", ...args }); if (fail) throw Error("Error QA"); return principalRows.filter(row => row.estado === args.where.estado); } },
    inventarioSede: { findMany: async args => { calls.push({ model: "sedes", ...args }); if (fail) throw Error("Error QA"); return sedeRows.filter(row => row.estadoActual === args.where.estadoActual); } },
  };
  return { calls, db, ...load("lib/dashboard-inventory-summary.ts", { "@/lib/prisma": { __esModule: true, default: db }, "@/lib/sedes": sedes, "@/lib/commercial-product-brand": productBrands }) };
}
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const css = { __esModule: true, default: new Proxy({}, { get: (_object, key) => String(key) }) };
function nodes(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join("");
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
function pageProbe(user = bodega) {
  const summary = summaryProbe();
  const page = load("app/dashboard/radar/page.tsx", {
    "react/jsx-runtime": jsx, "next/image": { __esModule: true, default: "image" }, "next/link": { __esModule: true, default: "a" },
    "next/navigation": { redirect: path => { throw Error(`REDIRECT:${path}`); } },
    "@/lib/access-control": access, "@/lib/bodega-navigation": navigation,
    "@/lib/page-access": { requireSessionPage: async () => { if (!user) throw Error("REDIRECT:/"); return user; } },
    "@/lib/dashboard-inventory-summary": summary,
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: "icon" },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: "profile" },
    "./radar.module.css": css, "./workspace": { __esModule: true, default: "workspace" },
  });
  return { calls: summary.calls, render: page.default };
}
class NextResponse extends Response {
  static json(data, options = {}) { return new NextResponse(JSON.stringify(data), { ...options, headers: { "Content-Type": "application/json" } }); }
}
function exportProbe(user = bodega, options = {}) {
  const summary = summaryProbe(options);
  const route = load("app/api/dashboard/radar/export/route.ts", {
    exceljs: { __esModule: true, default: ExcelJS }, "next/server": { NextResponse },
    "@/lib/access-control": access, "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/prisma": { __esModule: true, default: summary.db },
    "@/lib/dashboard-inventory-summary": summary, "@/lib/radar-inventory-view": view,
    "@/lib/radar-inventory-export": legacy,
  });
  return { calls: summary.calls, request: (query = "") => route.GET(new Request(`http://qa.local/api/dashboard/radar/export${query}`)) };
}
async function workbookOf(response) {
  assert.equal(response.status, 200); assert.match(response.headers.get("Content-Type"), /spreadsheetml/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer())); return workbook;
}
const rowsOf = worksheet => worksheet.getSheetValues().slice(2).map(row => row.slice(1));

test("BODEGA abre Radar completo, con navegación propia, usuario y acceso solo a su inventario principal", async () => {
  const probe = pageProbe(); const tree = nodes(await probe.render());
  const nav = tree.find(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal");
  assert.deepEqual(nodes(nav).filter(node => node.type === "a").map(node => node.props.href), navigation.getBodegaNavigation().map(item => item.href));
  assert.equal(nodes(nav).find(node => node.props?.["aria-current"] === "page").props.href, "/dashboard/radar");
  assert.ok(!nodes(nav).some(node => ["/ventas", "/caja", "/inventario", "/dashboard/sedes"].includes(node.props?.href)));
  const profile = tree.find(node => node.type === "profile"); assert.equal(profile.props.name, "Encargado QA"); assert.equal(profile.props.role, "Bodega");
  for (const label of ["Bodega principal", "Ver inventario"]) {
    assert.equal(tree.find(node => node.type === "a" && textOf(node) === label).props.href, "/inventario-principal");
  }
  const summary = tree.find(node => node.type === "workspace").props.summary;
  assert.equal(summary.totalBodegaPrincipal, 2); assert.equal(summary.totalSedes, 3); assert.equal(summary.totalBodega, 5);
  assert.ok(summary.marcas.flatMap(item => item.referencias.flatMap(ref => ref.sedesDetalle)).some(item => item.sede === "Stand Solutions"));
  assert.deepEqual(probe.calls.map(call => call.where), [{ estado: "BODEGA" }, { estadoActual: "BODEGA" }]);
  assert.equal(access.esRolAdministrativo("BODEGA"), false);
});

test("roles sin acceso siguen rechazados antes de leer disponibilidad", async () => {
  for (const user of [null, { ...bodega, rolNombre: "SEDE", perfilTipo: null }, { ...bodega, rolNombre: "VENDEDOR", perfilTipo: "VENDEDOR" }]) {
    const page = pageProbe(user); await assert.rejects(page.render(), /REDIRECT:/); assert.deepEqual(page.calls, []);
    for (const query of ["", "?alcance=consulta"]) {
      const exporter = exportProbe(user); const response = await exporter.request(query);
      assert.equal(response.status, user ? 403 : 401); assert.deepEqual(exporter.calls, []);
    }
  }
});

test("BODEGA exporta misma disponibilidad real y distribución por todas las sedes", async () => {
  const probe = exportProbe(); const workbook = await workbookOf(await probe.request("?alcance=consulta&ubicacion=TODAS&marca=TODAS"));
  const inventory = rowsOf(workbook.getWorksheet("Disponibilidad")); const distribution = rowsOf(workbook.getWorksheet("Distribución"));
  assert.equal(inventory.length, 2); assert.equal(inventory.reduce((sum, row) => sum + row[4], 0), 5);
  assert.equal(distribution.reduce((sum, row) => sum + row[3], 0), 5);
  assert.ok(distribution.some(row => row[2] === "Stand Solutions"));
  assert.ok(!inventory.some(row => row[1] === "VENDIDO QA" || row[1] === "YA EN SEDE QA"));
  assert.deepEqual(probe.calls.map(call => call.where), [{ estado: "BODEGA" }, { estadoActual: "BODEGA" }]);
});

test("BODEGA combina búsqueda, marca y ubicación y exporta todos los resultados fuera de página", async () => {
  const references = Array.from({ length: 25 }, (_value, index) => ({ referencia: `SAMSUNG QA ${String(index + 1).padStart(2, "0")}`, estado: "BODEGA" }));
  const probe = exportProbe(bodega, { principalRows: references, sedeRows: references.map(row => ({ ...row, estadoActual: "BODEGA", sede: { nombre: "SEDE QA" } })) });
  const workbook = await workbookOf(await probe.request("?alcance=consulta&q=s%C3%A1msung%20qa&ubicacion=SEDES&marca=SAMSUNG&page=2"));
  const inventory = rowsOf(workbook.getWorksheet("Disponibilidad"));
  assert.equal(inventory.length, 25); assert.ok(inventory.every(row => row[2] === 0 && row[3] === 1 && row[4] === 1));
  assert.ok(rowsOf(workbook.getWorksheet("Distribución")).every(row => row[2] === "SEDE QA"));
  assert.ok(probe.calls.every(call => !("take" in call) && !("skip" in call)));
});

test("BODEGA conserva exportación previa de bodega y no crea ni modifica movimientos", async () => {
  const probe = exportProbe(); const workbook = await workbookOf(await probe.request("?q=iphone"));
  assert.equal(workbook.worksheets.length, 1); assert.equal(workbook.worksheets[0].name, "Bodega principal");
  assert.deepEqual(rowsOf(workbook.worksheets[0]), [["IPHONE QA", 1]]);
  assert.deepEqual(probe.calls.map(call => call.where), [{ estado: "BODEGA" }]);
});

test("fallo de lectura se devuelve como error y no como un Excel válido", async () => {
  const response = await exportProbe(bodega, { fail: true }).request("?alcance=consulta");
  assert.equal(response.status, 500); assert.match(response.headers.get("Content-Type"), /json/); assert.ok((await response.json()).error);
});
