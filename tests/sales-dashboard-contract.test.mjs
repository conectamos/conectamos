import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsxRuntime = require("react/jsx-runtime");
function loadTypeScript(path, imports = {}, injected = {}, transform = (source) => source) {
  const source = ts.transpileModule(transform(readFileSync(join(ROOT, path), "utf8")), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  const requireMock = (name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  };
  new Function("require", "module", "exports", "console", ...Object.keys(injected), source)(
    requireMock, testModule, testModule.exports, { error() {} }, ...Object.values(injected),
  );
  return testModule.exports;
}
const financieras = loadTypeScript("lib/ventas-financieras.ts");
const utilsOriginal = loadTypeScript("lib/ventas-utils.ts", { "@/lib/ventas-financieras": financieras });
const utils = { ...utilsOriginal, getTodayBogotaDateKey: () => "2026-09-17" };
const access = loadTypeScript("lib/access-control.ts");
const nullComponent = { __esModule: true, default: () => null };
const salesParts = loadTypeScript("app/ventas/_components/sales-dashboard-parts.tsx", {
  react: { Fragment: Symbol.for("react.fragment"), useRef: (initial) => ({ current: initial }), useEffect() {} },
  "next/link": { __esModule: true, default: ({ children, ...props }) => jsxRuntime.jsx("a", { ...props, children }) },
  "@/app/dashboard/_components/dashboard-icon": nullComponent,
  "@/app/dashboard/_components/logout-button": { __esModule: true, default: () => jsxRuntime.jsx("button", { children: "Cerrar sesión" }) },
  "@/lib/monthly-reports-view": loadTypeScript("lib/monthly-reports-view.ts"),
  "@/lib/ventas-utils": utils, "@/lib/ventas-financieras": financieras,
});
const baselineMode = Boolean(process.env.SALES_DASHBOARD_TEST_SOURCE);
const session = { id: 10, nombre: "Ana Pérez", usuario: "ana", sedeId: 2, sedeNombre: "SEDE 2", rolId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const sales = [
  { id: 4, idVenta: "V-004", fecha: "2026-09-18T05:00:00Z", servicio: "CONTADO", descripcion: "Equipo futuro", serial: "000000000000004", ingreso: 100, cajaOficina: 50, utilidad: 0, sede: { id: 2, nombre: "SEDE 2" } },
  { id: 3, idVenta: "V-003", fecha: "2026-09-17T04:59:59Z", servicio: "ACTIVACIÓN", descripcion: "Equipo anterior", serial: "000000000000003", ingreso: 500, cajaOficina: -100, utilidad: -10, sede: { id: 3, nombre: "SEDE 3" } },
  { id: 2, idVenta: "V-002", fecha: "2026-09-18T04:59:59Z", servicio: "CONTADO", descripcion: "Moto G", serial: "000000000000002", ingreso: 2500, cajaOficina: 200, utilidad: 200, sede: { id: 2, nombre: "SEDE 2" } },
  { id: 1, idVenta: "V-001", fecha: "2026-09-17T05:00:00Z", hora: "00:00", servicio: "FINANCIERA", descripcion: "TECNO SPARK", serial: "001234567890123", jalador: "JALADOR Carlos", cerrador: "CERRADOR Luisa", ingreso: "1000.25", cajaOficina: "100.5", utilidad: "-50.25", comision: "25.5", salida: "10", tipoIngreso: "EFECTIVO / TRANSFERENCIA", ingreso1: "EFECTIVO", ingreso2: "TRANSFERENCIA", primerValor: "500", segundoValor: "500.25", payjoy: 999_999, financierasDetalle: [
    { nombre: "PAYJOY", nombreNormalizado: "PAYJOY", valorBruto: 800, valorNeto: 800, aplicaIntermediacion: false, porcentajeIntermediacion: 0 },
    { nombre: "SUMASPAY", nombreNormalizado: "SUMASPAY", valorBruto: 200, valorNeto: 200, aplicaIntermediacion: false, porcentajeIntermediacion: 0 },
  ], sede: { id: 2, nombre: "SEDE 2" } },
];

function pageProbe(initialState = {}, responses = {}, confirm = true) {
  const path = process.env.SALES_DASHBOARD_TEST_SOURCE || "app/ventas/page.tsx";
  const sourceText = readFileSync(join(ROOT, path), "utf8");
  const ast = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(page?.body, "La página conserva una función real para verificar su contrato");
  const stateNames = page.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((declaration) => {
    const initializer = declaration.initializer;
    return ts.isArrayBindingPattern(declaration.name) && initializer && ts.isCallExpression(initializer) && initializer.expression.getText(ast) === "useState"
      ? [declaration.name.elements[0].name.getText(ast)] : [];
  }) : []);
  const returnStatement = page.body.statements.find((node) => ts.isReturnStatement(node));
  assert.ok(returnStatement);
  const declaredNames = page.body.statements.flatMap((node) => ts.isVariableStatement(node)
    ? node.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name)).map((declaration) => declaration.name.text) : []);
  const captureNames = [
    "esAdmin", "puedeEliminar", "ventasHoy", "ventasMostradas", "totalUtilidadHoy", "totalCajaHoy", "totalIngresosHoy",
    "totalCajaGeneral", "totalCajaAcumulada", "totalIngresos", "cargarVentas", "cargarCajaResumen", "eliminarVenta", "navigationItems",
    "cargarUsuario", "cargarSedes", "ventasDisponibles", "cajaDisponible", "valorMetrica", "valorCajaAcumulada",
    "totalResultados", "totalPaginas", "paginaActual", "ventasPaginadas", "cambiarVista", "alternarDetalle", "reintentar", "consultaScope",
  ].filter((name) => declaredNames.includes(name));
  const state = { ventas: sales, cajaNetaMovimientos: -75.25, user: session, sedesReporte: [{ id: 2, nombre: "SEDE 2" }, { id: 3, nombre: "SEDE 3" }], ventasCargadas: true, cajaResumenCargada: true, ventasScope: "admin:TODAS", cajaScope: "admin:TODAS", ...initialState };
  const calls = [];
  let cursor = 0;
  let refCursor = 0;
  const refs = [];
  let captured;
  const hooks = {
    useState(initial) {
      const name = stateNames[cursor++];
      assert.ok(name, "El probe sólo ejecuta los estados de la página");
      if (!(name in state)) state[name] = typeof initial === "function" ? initial() : initial;
      return [state[name], (value) => { state[name] = typeof value === "function" ? value(state[name]) : value; }];
    },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect() {}, useRef: (initial) => {
      const index = refCursor++;
      return refs[index] ??= { current: initial };
    }, useId: () => "sales-test",
  };
  const Page = loadTypeScript(path, {
    react: hooks, "next/link": nullComponent, "@/lib/ventas-utils": utils,
    "@/lib/use-live-refresh": { useLiveRefresh: (_callback, options) => { calls.push({ name: "refresh", options }); } },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => null },
    "@/app/dashboard/_components/dashboard-icon": nullComponent,
    "@/app/dashboard/_components/logout-button": nullComponent,
    "./_components/sales-dashboard-parts": salesParts,
  }, {
    __capture: (value) => { captured = value; },
    window: { confirm: () => confirm },
    fetch: async (url, options) => {
      calls.push({ name: "fetch", url, options });
      const configured = responses[url];
      const response = await (typeof configured === "function" ? configured(url, options) : configured ?? { ok: true, data: url.startsWith("/api/caja") ? { resumen: { saldo: -75.25 } } : sales });
      return { ok: response.ok, json: async () => response.data };
    },
  }, (text) => `${text.slice(0, returnStatement.getStart(ast))}__capture({${captureNames.join(",")}});\n${text.slice(returnStatement.getStart(ast))}`).default;
  const render = () => { cursor = 0; refCursor = 0; const tree = Page(); return { tree, view: captured }; };
  render();
  return { state, calls, render, get view() { return captured; } };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function elements(node) {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}

function textOf(node) {
  return elements(node).filter((value) => typeof value === "string" || typeof value === "number").join("");
}

test("respuesta HTTP o estructura inválida no fabrica ceros y la última carga válida conserva su cobertura", { skip: baselineMode }, async () => {
  for (const invalid of [{ ok: false, data: { error: "Servicio no disponible" } }, { ok: true, data: { inesperado: true } }]) {
    const probe = pageProbe({ ventas: [], ventasCargadas: false, cajaResumenCargada: false, ventasScope: null, cajaScope: null }, {
      "/api/ventas": invalid, "/api/caja?resumen=1&limit=0": invalid,
    });
    await Promise.all([probe.view.cargarVentas(), probe.view.cargarCajaResumen()]);
    probe.render();
    assert.equal(probe.state.ventasCargadas, false);
    assert.equal(probe.state.cajaResumenCargada, false);
    assert.equal(probe.view.valorMetrica(0), "—");
    assert.equal(probe.view.valorCajaAcumulada, "—");
    assert.match(probe.state.errorVentas, /Reintenta/);
    assert.match(probe.state.errorCaja, /Reintenta/);
    assert.equal(probe.state.cargandoVentas, false);
  }
  const existing = pageProbe({}, {
    "/api/ventas": { ok: false, data: { error: "Caída" } },
    "/api/caja?resumen=1&limit=0": { ok: false, data: { error: "Caída" } },
  });
  await Promise.all([existing.view.cargarVentas(), existing.view.cargarCajaResumen()]);
  const { tree } = existing.render();
  assert.deepEqual(existing.state.ventas, sales);
  assert.equal(existing.state.cajaNetaMovimientos, -75.25);
  assert.equal(existing.view.valorCajaAcumulada, "$ 175,25");
  assert.match(textOf(tree), /últimas ventas cargadas para esta cobertura/);
  assert.match(textOf(tree), /último saldo cargado para esta cobertura/);
});

test("respuestas fuera de orden y fallos tardíos no reemplazan ventas ni caja de la nueva sede", { skip: baselineMode }, async () => {
  for (const oldResponseFails of [false, true]) {
    const oldSales = deferred();
    const oldCash = deferred();
    const newSales = deferred();
    const newCash = deferred();
    const selectedSales = sales.filter((sale) => sale.sede.id === 2);
    const probe = pageProbe({ vistaSedeId: "3", ventasScope: "admin:3", cajaScope: "admin:3" }, {
      "/api/ventas?sedeId=3": () => oldSales.promise,
      "/api/caja?sedeId=3&resumen=1&limit=0": () => oldCash.promise,
      "/api/ventas?sedeId=2": () => newSales.promise,
      "/api/caja?sedeId=2&resumen=1&limit=0": () => newCash.promise,
    });
    const previousRequests = Promise.all([probe.view.cargarVentas(), probe.view.cargarCajaResumen()]);
    probe.state.vistaSedeId = "2";
    probe.render();
    assert.equal(probe.view.ventasDisponibles, false);
    assert.equal(probe.view.cajaDisponible, false);
    assert.equal(probe.view.valorMetrica(2), "—");
    assert.equal(probe.view.valorCajaAcumulada, "—");
    assert.deepEqual(probe.view.ventasPaginadas, []);
    const currentRequests = Promise.all([probe.view.cargarVentas(), probe.view.cargarCajaResumen()]);
    newSales.resolve({ ok: true, data: selectedSales });
    newCash.resolve({ ok: true, data: { resumen: { saldo: 100.25 } } });
    await currentRequests;
    probe.render();
    assert.equal(probe.view.ventasDisponibles, true);
    assert.equal(probe.view.valorCajaAcumulada, "$ 450,75");
    oldSales.resolve({ ok: !oldResponseFails, data: oldResponseFails ? { error: "Caída sede anterior" } : [] });
    oldCash.resolve({ ok: !oldResponseFails, data: oldResponseFails ? { error: "Caída sede anterior" } : { resumen: { saldo: -9999 } } });
    await previousRequests;
    probe.render();
    assert.deepEqual(probe.state.ventas, selectedSales);
    assert.equal(probe.state.cajaNetaMovimientos, 100.25);
    assert.equal(probe.state.ventasScope, "admin:2");
    assert.equal(probe.state.cajaScope, "admin:2");
    assert.equal(probe.state.errorVentas, "");
    assert.equal(probe.state.errorCaja, "");
    assert.equal(probe.state.cargandoVentas, false);
  }
});

test("paginación y filtros conservan todos los registros para métricas y detalles por id", { skip: baselineMode }, () => {
  const manySales = Array.from({ length: 23 }, (_, index) => ({ ...sales[3], id: 23 - index, idVenta: `V-${23 - index}` }));
  const probe = pageProbe({ ventas: manySales, vista: "TODAS", pagina: 3, detallesAbiertos: [1] });
  assert.equal(probe.view.totalResultados, 23);
  assert.equal(probe.view.totalPaginas, 3);
  assert.deepEqual(probe.view.ventasPaginadas.map((sale) => sale.id), [3, 2, 1]);
  assert.equal(probe.view.totalIngresosHoy, 23005.75);
  probe.view.cambiarVista("FECHA");
  assert.equal(probe.state.pagina, 1);
  assert.deepEqual(probe.state.detallesAbiertos, [1]);
  probe.state.busqueda = "no existe";
  probe.render();
  assert.equal(probe.view.totalResultados, 0);
  assert.deepEqual(probe.view.ventasPaginadas, []);
  assert.equal(probe.view.totalIngresosHoy, 23005.75);
});

test("filas reales conservan cobros, IMEI, financieras históricas, comisión, salida y acciones según rol", { skip: baselineMode }, () => {
  const fixture = {
    ...sales[3], inventarioSede: { id: 12, referencia: "TECNO SPARK", color: "NEGRO", costo: 501.5 },
    financierasDetalle: [...sales[3].financierasDetalle, { nombre: "FINANCIERA HISTÓRICA", nombreNormalizado: "FINANCIERA HISTÓRICA", valorBruto: 90.5, valorNeto: 81.45, aplicaIntermediacion: true, porcentajeIntermediacion: 10 }],
  };
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const row = salesParts.SaleRows({ sale: fixture, expanded: true, esAdmin: rolNombre !== "SUPERVISOR", puedeEliminar: rolNombre === "ADMIN", deleting: false, onToggle() {}, onDelete() {} });
    const nodes = elements(row);
    const text = textOf(row);
    for (const expected of ["V-001", "17/09/2026 00:00", "001234567890123", "JALADOR Carlos", "CERRADOR Luisa", "PAYJOY", "SUMASPAY", "FINANCIERA HISTÓRICA", "$ 90,50", "$ 81,45", "-$ 50,25", "$ 100,50", "Comisión", "$ 25,50", "Salida", "$ 10", "EFECTIVO: $ 500 | TRANSFERENCIA: $ 500,25", "NEGRO"]) assert.ok(text.includes(expected), `${rolNombre}: falta ${expected}`);
    const edit = nodes.find((node) => node?.type === "a" && node.props.href === "/ventas/editar/1");
    const deletion = nodes.find((node) => node?.type === "button" && node.props.children === "Eliminar");
    assert.equal(Boolean(edit), rolNombre !== "SUPERVISOR");
    assert.equal(Boolean(deletion), rolNombre === "ADMIN");
    assert.equal(text.includes("Costo del equipo"), rolNombre !== "SUPERVISOR");
  }
  const profile = elements(salesParts.SalesProfile({ name: session.nombre, role: session.rolNombre }));
  assert.ok(profile.some((node) => node?.type === "a" && node.props.href === "/dashboard"));
  assert.ok(profile.some((node) => node?.type === "button" && node.props.children === "Cerrar sesión"));
  assert.equal(salesParts.formatoPesos(-87_007_927.5), "-$ 87.007.927,50");
});

test("KPI diarios usan Bogotá hoy y caja acumulada conserva todo historial más movimientos, sin depender de filtros de filas", () => {
  for (const filters of [
    { vista: "HOY" }, { vista: "TODAS", busqueda: "0012345" },
    { vista: "FECHA", fechaFiltro: "2026-09-16" }, { vista: "TODAS", busqueda: "no existe" },
  ]) {
    const { view } = pageProbe(filters);
    assert.deepEqual(view.ventasHoy.map((venta) => venta.id), [2, 1]);
    assert.equal(view.totalIngresosHoy, 3500.25);
    assert.equal(view.totalCajaHoy, 300.5);
    assert.equal(view.totalUtilidadHoy, 149.75);
    assert.equal(view.totalCajaGeneral, 250.5);
    assert.equal(view.totalCajaAcumulada, 175.25);
    assert.equal(view.totalIngresos, 4100.25);
  }
  assert.deepEqual(pageProbe({ vista: "FECHA", fechaFiltro: "2026-09-16" }).view.ventasMostradas.map((venta) => venta.id), [3]);
  assert.deepEqual(pageProbe({ vista: "TODAS", busqueda: "0012345" }).view.ventasMostradas.map((venta) => venta.id), [1]);
});

test("búsqueda y vista conservan orden y buscan IMEI como texto sin perder ceros iniciales", () => {
  const queries = ["V-001", "TECNO", "001234567890123", "FINANCIERA", "JALADOR CARLOS", "cerrador luisa"];
  for (const busqueda of queries) {
    const result = pageProbe({ vista: "TODAS", busqueda });
    assert.deepEqual(result.view.ventasMostradas.map((venta) => venta.id), [1]);
    assert.equal(result.view.ventasMostradas[0].serial, "001234567890123");
  }
  assert.deepEqual(pageProbe({ vista: "TODAS", busqueda: "SEDE 2" }).view.ventasMostradas.map((venta) => venta.id), [4, 2, 1]);
});

test("carga cliente mantiene sede sólo administrativa y caja histórica resumen=1 limit=0 sin fecha de lista", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = pageProbe({ user: { ...session, rolNombre }, vistaSedeId: "3", vista: "FECHA", fechaFiltro: "2026-09-16", busqueda: "tecno" });
    await probe.view.cargarVentas();
    await probe.view.cargarCajaResumen();
    const urls = probe.calls.filter((call) => call.name === "fetch").map((call) => call.url);
    assert.deepEqual(urls, rolNombre === "SUPERVISOR" ? ["/api/ventas", "/api/caja?resumen=1&limit=0"] : ["/api/ventas?sedeId=3", "/api/caja?sedeId=3&resumen=1&limit=0"]);
    assert.ok(probe.calls.some((call) => call.name === "refresh" && call.options.intervalMs === 30000));
    assert.equal(probe.view.esAdmin, rolNombre !== "SUPERVISOR");
    assert.equal(probe.view.puedeEliminar, rolNombre === "ADMIN");
  }
});

test("eliminar cliente exige confirmación, usa DELETE por id, recarga ventas y conserva error del servidor", async () => {
  const cancel = pageProbe({}, {}, false);
  await cancel.view.eliminarVenta(1);
  assert.equal(cancel.calls.filter((call) => call.name === "fetch").length, 0);
  const success = pageProbe({}, { "/api/ventas?id=1": { ok: true, data: { mensaje: "Venta eliminada" } } });
  await success.view.eliminarVenta(1);
  const calls = success.calls.filter((call) => call.name === "fetch");
  assert.equal(calls[0].url, "/api/ventas?id=1");
  assert.deepEqual(calls[0].options, { method: "DELETE", credentials: "same-origin" });
  assert.ok(calls.some((call) => call.url === "/api/ventas"));
  assert.equal(success.state.eliminandoVentaId, null);
  const rejected = pageProbe({}, { "/api/ventas?id=1": { ok: false, data: { error: "No se eliminó por nota crédito" } } });
  await rejected.view.eliminarVenta(1);
  assert.equal(rejected.state.mensaje, "No se eliminó por nota crédito");
  assert.equal(rejected.calls.filter((call) => call.name === "fetch").length, 1);
});

test("detalle monetario preserva dos ingresos, financieras múltiples históricas y preferencia de JSON sobre columnas legacy", () => {
  assert.equal(utils.detalleIngresosTexto(sales[3]), "EFECTIVO: $ 500 | TRANSFERENCIA: $ 500,25");
  assert.equal(utils.financierasTexto(sales[3]), "PAYJOY: $ 800 | SUMASPAY: $ 200");
  assert.equal(utils.financierasTexto({ payjoy: 1000, sumaspay: 50.5 }), "PAYJOY: $ 1.000 | SUMASPAY: $ 50,5");
  assert.equal(utils.financierasTexto({}), "Sin financieras");
  assert.equal(utils.formatoFechaHoraVenta(sales[3].fecha, sales[3].hora), "17/09/2026 00:00");
});

function apiProbe(user, row = { ...sales[3], sedeId: 2, inventarioSede: { id: 12, estadoActual: "VENDIDO", referencia: "TECNO SPARK", costo: 500 } }) {
  const calls = [];
  const record = (name, result) => async (args) => { calls.push({ name, args }); return result; };
  const transaction = {
    venta: { delete: record("delete", {}) }, inventarioSede: { update: record("inventory-update", {}) },
    movimientoInventario: { create: record("movement", {}) }, registroVendedorVenta: { updateMany: record("registration-update", {}) },
  };
  const prisma = {
    venta: { findMany: record("list", sales), findUnique: record("detail", row) },
    registroVendedorVenta: { findFirst: record("invoice-check", null) },
    $transaction: async (callback) => { calls.push({ name: "transaction" }); return callback(transaction); },
    cajaMovimiento: { groupBy: record("cash-group", [{ tipo: "INGRESO", _sum: { valor: "100.25" } }, { tipo: "EGRESO", _sum: { valor: "175.5" } }]), count: record("cash-count", 2) },
  };
  const next = { NextResponse: { json: (data, options) => Response.json(data, options) } };
  const imports = {
    "next/server": next, "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": access,
    "@/app/generated/prisma/client": { Prisma: { JsonNull: null } },
    "@/lib/ventas-financieras": financieras, "@/lib/ventas-personal": {},
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: record("ensure-schema", undefined) },
    "@/lib/siigo": {}, "@/lib/siigo-attempt": {},
  };
  let calculation;
  const ventasApi = loadTypeScript("app/api/ventas/route.ts", imports,
    { __captureCalculation: (value) => { calculation = value; } },
    (source) => `${source}\n__captureCalculation({buildVentaData});`);
  const cajaHelpers = loadTypeScript("lib/caja-movimientos.ts", { "@/lib/ventas-utils": utilsOriginal });
  const cajaApi = loadTypeScript("app/api/caja/route.ts", { ...imports, "@/lib/caja-movimientos": cajaHelpers });
  return { ventasApi, cajaApi, calls, calculation };
}

test("cálculo guardado distingue ingresos netos, caja y utilidad con voucher, transferencia, intermediación y gastos", () => {
  const { calculation } = apiProbe(session);
  const input = {
    servicio: "FINANCIERA", tipoIngreso1: "VOUCHER", ingreso1Base: 1000,
    tipoIngreso2: "TRANSFERENCIA", ingreso2Base: 500.25, comision: 100.5, salida: 25.75,
    finanzas: [{ nombre: "PAYJOY", valor: 800 }, { nombre: "SUMASPAY", valor: 200 }],
  };
  const result = calculation.buildVentaData(input, 3000, [
    { id: 1, nombre: "PAYJOY", aplicaIntermediacion: true, porcentajeIntermediacion: 10 },
    { id: 2, nombre: "SUMASPAY", aplicaIntermediacion: false, porcentajeIntermediacion: 50 },
  ]);
  assert.equal(result.ingreso1Neto, 950);
  assert.equal(result.ingreso2Neto, 500.25);
  assert.equal(result.totalIngresosNetos, 1450.25);
  assert.equal(result.cajaOficina, 823.75);
  assert.equal(result.utilidad, -756);
  assert.deepEqual(result.detalleFinancieras.map(({ nombre, valorBruto, valorNeto }) => ({ nombre, valorBruto, valorNeto })), [
    { nombre: "PAYJOY", valorBruto: 800, valorNeto: 720 },
    { nombre: "SUMASPAY", valorBruto: 200, valorNeto: 200 },
  ]);
  assert.equal(result.payloadFinancieras.payjoy, 800);
  assert.equal(result.payloadFinancieras.sumaspay, 200);
  const cash = calculation.buildVentaData({ ...input, servicio: "CONTADO", tipoIngreso1: "EFECTIVO", ingreso1Base: 500.25 }, 0, []);
  assert.equal(cash.totalIngresosNetos, 1000.5);
  assert.equal(cash.cajaOficina, 374);
  assert.equal(cash.utilidad, 874.25);
  assert.deepEqual(cash.detalleFinancieras, []);
});

test("layout de ventas y sesión conservan guardia servidor aun si el cliente no tiene datos cargados", async () => {
  for (const user of [null, session, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map((perfilTipo) => ({ ...session, perfilTipo }))]) {
    const redirects = [];
    const auth = { getSessionUser: async () => user };
    const pageAccess = loadTypeScript("lib/page-access.ts", {
      "@/lib/auth": auth, "@/lib/access-control": access,
      "next/navigation": { redirect: (href) => { redirects.push(href); throw new Error(`REDIRECT ${href}`); } },
    });
    const Layout = loadTypeScript("app/ventas/layout.tsx", { "@/lib/page-access": pageAccess }).default;
    if (user === session) assert.equal(await Layout({ children: "contenido autorizado" }), "contenido autorizado");
    else await assert.rejects(() => Layout({ children: "contenido autorizado" }), /REDIRECT/);
    assert.deepEqual(redirects, user === session ? [] : [user ? "/dashboard" : "/"]);
    const sessionApi = loadTypeScript("app/api/session/route.ts", {
      "@/lib/auth": auth, "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    });
    const response = await sessionApi.GET();
    assert.equal(response.status, user ? 200 : 401);
    if (user) assert.deepEqual(await response.json(), user);
  }
});

test("API ventas/caja rechazan sesión ausente y perfiles no operativos antes de consultar datos", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map((perfilTipo) => ({ ...session, perfilTipo }))]) {
    const probe = apiProbe(user);
    const status = user ? 403 : 401;
    assert.equal((await probe.ventasApi.GET(new Request("http://qa.test/api/ventas"))).status, status);
    assert.equal((await probe.cajaApi.GET(new Request("http://qa.test/api/caja?resumen=1&limit=0"))).status, status);
    assert.equal((await probe.ventasApi.PUT(new Request("http://qa.test/api/ventas", { method: "PUT", body: "{}" }))).status, status);
    assert.equal((await probe.ventasApi.DELETE(new Request("http://qa.test/api/ventas?id=1", { method: "DELETE" }))).status, status);
    assert.deepEqual(probe.calls, []);
  }
});

test("API ADMIN/AUDITOR mantienen filtros reales de sede y contrato completo; supervisor no puede ampliar su alcance", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = apiProbe({ ...session, rolNombre, perfilTipo: "OPERATIVO" });
    const response = await probe.ventasApi.GET(new Request("http://qa.test/api/ventas?sedeId=3"));
    assert.equal(response.status, 200);
    const query = probe.calls.find((call) => call.name === "list").args;
    assert.deepEqual(query.where, { sedeId: rolNombre === "SUPERVISOR" ? 2 : 3 });
    assert.deepEqual(query.orderBy, { id: "desc" });
    assert.equal(query.take, undefined);
    for (const field of ["serial", "comision", "salida", "utilidad", "cajaOficina", "ingreso1", "ingreso2", "primerValor", "segundoValor", "financierasDetalle"]) assert.equal(query.select[field], true);
    assert.equal((await response.json())[3].serial, "001234567890123");
    const cash = await probe.cajaApi.GET(new Request("http://qa.test/api/caja?sedeId=3&resumen=1&limit=0"));
    assert.equal(cash.status, 200);
    assert.deepEqual(probe.calls.find((call) => call.name === "cash-group").args.where, { sedeId: rolNombre === "SUPERVISOR" ? 2 : 3, NOT: { concepto: "GASTO CARTERA" } });
    assert.equal((await cash.json()).resumen.saldo, -75.25);
  }
});

test("detalle de venta ajena no es visible para supervisor; ADMIN/AUDITOR pueden leerlo pero sólo ADMIN elimina", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = apiProbe({ ...session, rolNombre, perfilTipo: "OPERATIVO" }, { ...sales[3], sedeId: 3 });
    assert.equal((await probe.ventasApi.GET(new Request("http://qa.test/api/ventas?id=1"))).status, rolNombre === "SUPERVISOR" ? 404 : 200);
    if (rolNombre !== "ADMIN") {
      const response = await probe.ventasApi.DELETE(new Request("http://qa.test/api/ventas?id=1", { method: "DELETE" }));
      assert.equal(response.status, 403);
      assert.ok(!probe.calls.some((call) => call.name === "transaction"));
    }
    if (rolNombre === "SUPERVISOR") assert.equal((await probe.ventasApi.PUT(new Request("http://qa.test/api/ventas", { method: "PUT", body: "{}" }))).status, 403);
  }
});

test("eliminación ADMIN sin factura externa conserva transacción, retorno BODEGA, IMEI literal y desvinculación del registro", async () => {
  const probe = apiProbe(session);
  const response = await probe.ventasApi.DELETE(new Request("http://qa.test/api/ventas?id=1", { method: "DELETE" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.ok(probe.calls.some((call) => call.name === "transaction"));
  assert.deepEqual(probe.calls.find((call) => call.name === "delete").args, { where: { id: 1 } });
  assert.equal(probe.calls.find((call) => call.name === "inventory-update").args.data.estadoActual, "BODEGA");
  const movement = probe.calls.find((call) => call.name === "movement").args.data;
  assert.equal(movement.imei, "001234567890123");
  assert.equal(movement.tipoMovimiento, "VENTA_ELIMINADA");
  const registration = probe.calls.find((call) => call.name === "registration-update").args;
  assert.deepEqual(registration.where, { ventaIdRelacionada: 1 });
  assert.equal(registration.data.estadoVentaRegistro, "PENDIENTE");
  assert.equal(registration.data.ventaIdRelacionada, null);
});
