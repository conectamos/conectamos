import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/dashboard/payjoy/_components/payjoy-40-60-workspace.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/dashboard/payjoy/40-60/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/payjoy/40-60/registros/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source + "\nexport { formatNumber, formatPercent, formatDateTime, formatWeekLabel, summarizeRows, buildProcessingSourceKey };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)(name => {
  if (name === "react/jsx-runtime") return require(name);
  if (name === "react") return {};
  if (name.endsWith(".module.css")) return {};
  return { default: () => null, SalesProfile: () => null };
}, loaded, loaded.exports);
const helpers = loaded.exports;

const rows = Array.from({ length: 32 }, (_, i) => ({ id: String(i), status: i < 20 ? "40/60 APROBADO" : "40/60 NO APROBADO", cedula: i < 27 ? `00123${i}` : "" }));

test("conserva las restricciones ADMIN/AUDITOR y borrado exclusivo ADMIN en página y servidor", () => {
  assert.match(page, /\["ADMIN", "AUDITOR"\]/);
  assert.match(page, /puedeEliminar=.*=== "ADMIN"/s);
  assert.match(api, /function canDelete[\s\S]*?=== "ADMIN"/);
  assert.ok(source.includes("if (!puedeEliminar || operationRef.current"));
});

test("navegación superior conserva módulos, perfil, cierre y acceso a todas las opciones en móvil", () => {
  assert.doesNotMatch(source, /DashboardSidebar|lg:pl-/);
  for (const route of ["/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/sedes", "/dashboard/payjoy"]) assert.ok(source.includes(route));
  assert.match(source, /<SalesProfile name=\{user\.nombre \|\| user\.usuario\}/);
  assert.match(source, /aria-label="Módulos autorizados"/);
  assert.match(source, /item\.href === "\/caja" \? "page"/);
});

test("historial está disponible antes de procesar, cerrado inicialmente y contiene todas las semanas", () => {
  assert.match(source, /savedRecordsExpanded, setSavedRecordsExpanded\] = useState\(false\)/);
  assert.ok(source.indexOf('id="payjoy-history-title"') < source.indexOf("{data && <>"));
  assert.match(source, /savedRecords\.map\(record =>/);
  assert.doesNotMatch(source, /savedRecords\.slice\(/);
  assert.match(source, /aria-controls="payjoy-saved-history"/);
  assert.match(source, /loadStoredRecord\(record\.id\)/);
});

test("procesar y Guardar conservan sus contratos y toda la carga sin usar la página visible", () => {
  for (const endpoint of ["/api/payjoy/40-60/weeks", "/api/payjoy/40-60", "/api/payjoy/40-60/registros"]) assert.ok(source.includes(endpoint));
  assert.match(source, /formData\.append\("file", selectedFile\)/);
  assert.match(source, /formData\.append\("week", selectedWeek\)/);
  assert.doesNotMatch(source, /summary: summarizeRows\((?:paginatedRows|visibleRows)\)|rows: (?:paginatedRows|visibleRows)/);
  assert.match(source, /const pageSize = 25/);
  assert.match(source, /paginatedRows\.map\(row =>/);
});

test("resumen mantiene las 32 filas, cédulas con ceros iniciales y resultados completos", () => {
  assert.deepEqual(helpers.summarizeRows(rows), { aprobados: 20, noAprobados: 12, cedulasEncontradas: 27, cedulasPendientes: 5 });
  assert.deepEqual(helpers.summarizeRows([]), { aprobados: 0, noAprobados: 0, cedulasEncontradas: 0, cedulasPendientes: 0 });
  assert.equal(rows[0].cedula, "001230");
  assert.match(source, /updateCedula\(row\.id,event\.target\.value\)/);
  assert.match(source, /aria-label=\{`Cédula de \$\{row\.deviceTag\}`\}/);
  assert.match(source, /aria-label=\{`Resultado de \$\{row\.deviceTag\}`\}/);
});

test("WEEK se muestra como fecha calendario sin restar un día por zona horaria", () => {
  assert.equal(helpers.formatWeekLabel("2026-06-22"), "22 de junio de 2026");
  assert.equal(helpers.formatWeekLabel("2026-06-22T00:00:00.000Z"), "22 de junio de 2026");
  assert.equal(helpers.formatWeekLabel("Mon Jun 22 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"), "22 de junio de 2026");
  assert.equal(helpers.formatWeekLabel("WEEK 02"), "WEEK 02");
  assert.equal(helpers.formatWeekLabel("invalid"), "invalid");
});

test("fecha de guardado conserva hora Colombia y formatos completos", () => {
  assert.match(helpers.formatDateTime("2026-10-27T02:30:00.000Z"), /26\/10\/26.*9:30/);
  assert.equal(helpers.formatDateTime("invalid"), "-");
  assert.equal(helpers.formatNumber(27645123.5), "27.645.123,5");
  assert.equal(helpers.formatPercent(12.3456), "12,3%");
});

test("identifica archivo y WEEK juntos antes de recargar un guardado", () => {
  const file = { name: "week.xlsx", size: 240, lastModified: 10 };
  assert.notEqual(helpers.buildProcessingSourceKey(file, "WEEK 01"), helpers.buildProcessingSourceKey(file, "WEEK 02"));
  assert.notEqual(helpers.buildProcessingSourceKey(file, "WEEK 01"), helpers.buildProcessingSourceKey({ ...file, lastModified: 11 }, "WEEK 01"));
});
