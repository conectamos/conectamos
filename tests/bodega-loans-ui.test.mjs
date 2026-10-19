import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
function transpile(source, imports, injected = {}) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(injected), output)((name) => {
    assert.ok(name in imports, `Unexpected dependency ${name}`);
    return imports[name];
  }, testModule, testModule.exports, ...Object.values(injected));
  return testModule.exports;
}
const viewHelpers = transpile(readFileSync(new URL("../lib/loans-dashboard-view.ts", import.meta.url), "utf8"), {});
const user = { id: 10, nombre: "Operador bodega", usuario: "bodega", sedeId: 99, sedeNombre: "BODEGA PRINCIPAL", rolNombre: "BODEGA", perfilTipo: "BODEGA" };
const loan = { id: 20, imei: "001234567890123", referencia: "Equipo bodega", color: "Negro", costo: 1000000, sedeOrigenId: 99, sedeDestinoId: 2, estado: "PENDIENTE", prestamoDesdePrincipal: true, requiereAprobacionEntreSedes: true, estadoActualActual: "BODEGA" };
function probe(initial = {}) {
  const source = readFileSync(new URL("../app/prestamos/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword));
  const states = page.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.filter((entry) => ts.isArrayBindingPattern(entry.name) && entry.initializer?.expression?.getText(ast) === "useState").map((entry) => entry.name.elements[0].name.getText(ast)) : []);
  const captures = page.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.filter((entry) => ts.isIdentifier(entry.name)).map((entry) => entry.name.text) : []);
  const firstReturn = page.body.statements.find(ts.isReturnStatement).getStart(ast);
  const state = { user, prestamos: [loan], cargandoListado: false, ...initial };
  let cursor = 0;
  let captured;
  const calls = [];
  const Null = { __esModule: true, default: () => null };
  const Page = transpile(`${source.slice(0, firstReturn)}__capture({${captures.join(",")}});\n${source.slice(firstReturn)}`, {
    "react/jsx-runtime": jsx,
    react: { Fragment: Symbol.for("react.fragment"), useEffect() {}, useRef: (value) => ({ current: value }), useMemo: (fn) => fn(), useCallback: (fn) => fn, useState(value) { const key = states[cursor++]; if (!(key in state)) state[key] = typeof value === "function" ? value() : value; return [state[key], (next) => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; } },
    "next/link": { __esModule: true, default: "a" }, "next/image": Null,
    "@/app/dashboard/_components/dashboard-icon": Null,
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "./_components/loan-dialog": Null,
    "@/lib/loans-dashboard-view": viewHelpers,
    "@/lib/use-live-refresh": { useLiveRefresh() {} },
    "./loans.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  }, {
    __capture: (value) => { captured = value; },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [loan] }; },
    window: { confirm: () => true },
  }).default;
  const render = () => { cursor = 0; const tree = Page(); return { tree, view: captured }; };
  render();
  return { state, calls, render, get view() { return captured; } };
}
function flatten(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...flatten(node.props?.children)];
}

test("BODEGA dispone de logística de principal, sin elegibilidad ni controles de pago", () => {
  const p = probe({ prestamos: [loan, { ...loan, id: 21, estado: "APROBADO" }, { ...loan, id: 22, estado: "PAGO_PENDIENTE_APROBACION" }] });
  assert.equal(p.view.puedeAprobarPrestamo(loan), true);
  assert.equal(p.view.puedeRechazarPrestamo(loan), true);
  assert.equal(p.view.puedeCancelarPrestamo(loan), true);
  assert.equal(p.view.puedeAprobarPrestamo({ ...loan, sedeOrigenId: 2, sedeDestinoId: 3 }), false);
  for (const row of p.state.prestamos) {
    assert.equal(p.view.puedeSolicitarPago(row), false);
    assert.equal(p.view.puedeAprobarPago(row), false);
  }
  assert.deepEqual(p.view.prestamosSeleccionablesPago, []);
  assert.deepEqual(p.view.lotesPagoPendiente, []);
  const nodes = flatten(p.render().tree);
  assert.ok(!nodes.some((node) => node.props?.["aria-label"] === "Pago por lote"));
  assert.ok(!nodes.some((node) => node.type === "input" && node.props?.type === "checkbox"));
});

test("BODEGA conserva todos los estados consultables y únicamente navegación autorizada", async () => {
  const p = probe({ sedeFiltroId: "2" });
  assert.deepEqual(p.view.navigationItems.map((item) => item.href), ["/inventario-principal", "/inventario/nuevo", "/prestamos"]);
  assert.ok(p.view.estadosFiltro.includes("PAGO_PENDIENTE_APROBACION"));
  assert.ok(p.view.estadosFiltro.includes("DEVOLUCION_PENDIENTE"));
  await p.view.cargarPrestamos();
  assert.equal(p.calls[0].url, "/api/prestamos?sedeId=2");
  assert.deepEqual(p.state.idsSolicitudPago, []);
});

test("ADMIN y AUDITOR conservan sus acciones financieras existentes", () => {
  for (const rolNombre of ["ADMIN", "AUDITOR"]) {
    const p = probe({ user: { ...user, rolNombre } });
    assert.equal(p.view.puedeSolicitarPago({ ...loan, estado: "APROBADO" }), true);
    assert.equal(p.view.puedeAprobarPago({ ...loan, estado: "PAGO_PENDIENTE_APROBACION" }), true);
    assert.ok(p.view.navigationItems.some((item) => item.href === "/caja"));
  }
});
