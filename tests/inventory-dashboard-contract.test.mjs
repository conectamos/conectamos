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
    requireMock, testModule, testModule.exports, { error() {}, warn() {} }, ...Object.values(injected),
  );
  return testModule.exports;
}

const prestamos = loadTypeScript("lib/prestamos.ts");
const sedes = loadTypeScript("lib/sedes.ts");
const productTypes = loadTypeScript("lib/product-types.ts");
const access = loadTypeScript("lib/access-control.ts");
const creditorHelpers = loadTypeScript("lib/inventory-creditors.ts", {
  "@/lib/prisma": { __esModule: true, default: {} }, "@/lib/prestamos": prestamos,
});
const baselineMode = Boolean(process.env.INVENTORY_DASHBOARD_TEST_SOURCE);
const nullComponent = { __esModule: true, default: () => null };
const childHooks = {
  Fragment: Symbol.for("react.fragment"), useEffect() {}, useRef: (initial) => ({ current: initial }),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}], useMemo: (fn) => fn(), useId: () => "inventory-test-row",
};
const linkComponent = { __esModule: true, default: ({ children, ...props }) => jsxRuntime.jsx("a", { ...props, children }) };
const monthlyView = loadTypeScript("lib/monthly-reports-view.ts");
const inventoryDebtView = loadTypeScript("lib/inventory-debt-view.ts");
const inventoryDebtParts = loadTypeScript("app/inventario/_components/inventory-debt-parts.tsx", {
  react: childHooks, "@/app/dashboard/_components/dashboard-icon": nullComponent,
  "@/lib/monthly-reports-view": monthlyView,
});
const inventoryParts = loadTypeScript("app/inventario/_components/inventory-dashboard-parts.tsx", {
  react: childHooks, "next/link": linkComponent,
  "@/app/dashboard/_components/dashboard-icon": nullComponent,
  "@/lib/monthly-reports-view": monthlyView, "@/lib/prestamos": prestamos, "@/lib/inventory-debt-view": inventoryDebtView,
});
const financieras = loadTypeScript("lib/ventas-financieras.ts");
const salesParts = loadTypeScript("app/ventas/_components/sales-dashboard-parts.tsx", {
  react: childHooks, "next/link": linkComponent,
  "@/app/dashboard/_components/dashboard-icon": nullComponent,
  "@/app/dashboard/_components/logout-button": { __esModule: true, default: () => jsxRuntime.jsx("button", { children: "Cerrar sesión" }) },
  "@/lib/monthly-reports-view": monthlyView, "@/lib/ventas-financieras": financieras,
  "@/lib/ventas-utils": loadTypeScript("lib/ventas-utils.ts", { "@/lib/ventas-financieras": financieras }),
});
const session = { id: 10, nombre: "Ana Pérez", usuario: "ana", sedeId: 1, sedeNombre: "SEDE 1", rolId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const states = ["BODEGA", "BODEGA", "PENDIENTE", "GARANTIA", "PRESTAMO", "PRESTAMO", "PRESTAMO_PAGO", "TRASLADO", "PRESTAMO_POR_ACEPTAR", "VENDIDO"];
const financialStates = ["DEUDA", "PAGO", "DEUDA", "PAGO", "DEUDA", "PAGO", "DEUDA", "DEUDA", "DEUDA", "CANCELADO"];
const items = states.map((estadoActual, index) => ({
  id: 10 - index, imei: String(1000 + index).padStart(15, "0"), referencia: `Equipo ${10 - index}`,
  tipoProducto: "TELEFONIA", color: index % 2 ? "NEGRO" : "ROJO", costo: index === 0 ? 100.25 : index === 5 ? 600.5 : (index + 1) * 100,
  distribuidor: "DISTRIBUIDOR QA", deboA: index === 4 ? "SEDE 1" : index === 8 ? "SEDE 3" : "Proveedor Finser",
  estadoActual, estadoFinanciero: financialStates[index], origen: [0, 2].includes(index) ? "PRINCIPAL" : "COMPRA",
  sedeId: 1, sede: { id: 1, nombre: "SEDE 1", soloInventarioPorCobrar: false },
  prestamoDestino: estadoActual.startsWith("PRESTAMO") || estadoActual === "TRASLADO" ? { id: 3, nombre: "SEDE 3", prestamoId: 90 + index, estado: estadoActual === "PRESTAMO_POR_ACEPTAR" ? "PENDIENTE" : "APROBADO" } : null,
  ventas: [], facturaStand: null,
}));

function pageProbe(initialState = {}, responses = {}) {
  const path = process.env.INVENTORY_DASHBOARD_TEST_SOURCE || "app/inventario/page.tsx";
  const sourceText = readFileSync(join(ROOT, path), "utf8");
  const ast = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(page?.body);
  const stateNames = page.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((declaration) => {
    const initializer = declaration.initializer;
    return ts.isArrayBindingPattern(declaration.name) && initializer && ts.isCallExpression(initializer) && initializer.expression.getText(ast) === "useState"
      ? [declaration.name.elements[0].name.getText(ast)] : [];
  }) : []);
  const declaredNames = page.body.statements.flatMap((node) => ts.isVariableStatement(node)
    ? node.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name)).map((declaration) => declaration.name.text) : []);
  const captureNames = [
    "esAdmin", "puedeEliminar", "cargarInventario", "totalBodega", "totalPendiente", "totalGarantia", "totalPrestamo", "valorPrestamosPorCobrar",
    "totalPagados", "totalCancelados", "totalDeuda", "totalPagado", "totalDeudaVista", "totalPrestamoVista", "totalDeudaAcreedorSeleccionado",
    "resumenDeudaPorAcreedor", "itemsFiltrados", "itemsSeleccionados", "itemsSeleccionadosParaPrestamo", "itemsSeleccionadosParaPago",
    "itemsSeleccionadosParaPendiente", "itemsSeleccionadosParaGarantia", "itemsSeleccionadosParaFactura", "seleccionFacturaStandValida",
    "cantidadExcluidaFacturaStand", "totalFacturaStand", "totalPagoMasivo", "sedesDestinoMasivo", "idsVisibles", "todosVisiblesSeleccionados",
    "alternarFiltroEstado", "alternarSeleccionVisibles", "abrirEliminacion", "eliminar", "cambiarEstado", "guardarEdicion", "ejecutarCambioEquipo",
    "ejecutarEnvioMasivo", "ejecutarPagoMasivo", "ejecutarCambioEstadoMasivo", "emitirFacturaStand", "puedeDevolverABodega", "puedePasarAPendiente",
    "puedePasarAGarantia", "puedeEnviarPrestamo", "puedePagarDeuda", "puedeRegistrarCambioEquipo", "navigationItems",
    "consultaScope", "inventarioDisponible", "itemsPaginados", "paginaActual", "totalPaginas", "totalResultados", "valorMetrica",
    "vistaDisponible", "itemsPagina", "resultados", "filasPorPagina",
    "paginas", "accionesEquipo",
    "itemsDeudaBase", "itemsDeudaFiltrados", "itemsVista", "totalSeleccionDeuda", "acreedoresPago", "paginaSeleccionada",
    "alternarSeleccionPagina", "cambiarPagina", "cambiarFilasPorPagina", "limpiarFiltros", "limpiarGrupo",
  ].filter((name) => declaredNames.includes(name));
  const returnStatement = page.body.statements.find((node) => ts.isReturnStatement(node));
  assert.ok(returnStatement);
  const state = { user: session, items, inventarioCargado: true, sedes: [{ id: 1, nombre: "SEDE 1" }, { id: 2, nombre: "SEDE 2" }, { id: 3, nombre: "SEDE 3" }, { id: 4, nombre: "VENTAS" }], ...initialState };
  const calls = [];
  let cursor = 0;
  let refCursor = 0;
  const refs = [];
  let captured;
  const hooks = {
    useState(initial) {
      const name = stateNames[cursor++];
      assert.ok(name);
      if (!(name in state)) state[name] = typeof initial === "function" ? initial() : initial;
      return [state[name], (value) => {
        state[name] = typeof value === "function" ? value(state[name]) : value;
        if (name === "mensaje") calls.push({ name: "message", value: state[name] });
      }];
    },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect() {},
    useRef: (initial) => { const index = refCursor++; return refs[index] ??= { current: initial }; },
  };
  const Page = loadTypeScript(path, {
    react: hooks, "next/link": linkComponent,
    "@/lib/prestamos": prestamos, "@/lib/sedes": sedes, "@/lib/product-types": productTypes,
    "@/lib/use-live-refresh": { useLiveRefresh: (_callback, options) => { calls.push({ name: "refresh", options }); } },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => null },
    "@/app/dashboard/_components/dashboard-icon": nullComponent, "@/app/dashboard/_components/logout-button": nullComponent,
    "@/app/inventario/_components/inventory-dashboard-parts": inventoryParts,
    "./_components/inventory-dashboard-parts": inventoryParts,
    "./_components/inventory-debt-parts": inventoryDebtParts,
    "@/lib/inventory-debt-view": inventoryDebtView,
    "@/app/ventas/_components/sales-dashboard-parts": salesParts,
    "@/lib/monthly-reports-view": monthlyView,
  }, {
    __capture: (value) => { captured = value; },
    fetch: async (url, options) => {
      calls.push({ name: "fetch", url, options });
      const configured = responses[url];
      const response = await (typeof configured === "function" ? configured(url, options) : configured ?? { ok: true, data: url.startsWith("/api/inventario?") || url === "/api/inventario" ? items : { ok: true } });
      return { ok: response.ok, json: async () => response.data };
    },
  }, (text) => `${text.slice(0, returnStatement.getStart(ast))}__capture({${captureNames.join(",")}});\n${text.slice(returnStatement.getStart(ast))}`).default;
  const render = () => { cursor = 0; refCursor = 0; const tree = Page(); return { tree, view: captured }; };
  render();
  if (captured.consultaScope && !Object.hasOwn(initialState, "consultaCargada")) {
    state.consultaCargada = captured.consultaScope;
    render();
  }
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

function componentProps(node, component) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) { const props = componentProps(child, component); if (props) return props; }
    return undefined;
  }
  if (node.type === component) return node.props;
  return componentProps(node.props?.children, component);
}

test("identidad de deuda usa ID persistente y conserva etiquetas legacy exactas sin unir homónimos", { skip: baselineMode }, () => {
  const identity = (data) => inventoryDebtView.identidadAcreedor({ ...items[0], ...data });
  assert.deepEqual(identity({ acreedorId: 101, acreedorNombre: "Proveedor Finser" }), { key: "id:101", id: 101, name: "Proveedor Finser" });
  assert.deepEqual(identity({ acreedorId: 102, acreedorNombre: "Proveedor Finser" }), { key: "id:102", id: 102, name: "Proveedor Finser" });
  const names = ["Proveedor Finser", "PROVEEDOR FINSER", "Proveedor Finser ", "Proveedor Fínser"];
  const legacy = names.map((deboA) => identity({ acreedorId: null, acreedorNombre: null, deboA }));
  assert.equal(new Set(legacy.map((creditor) => creditor.key)).size, 4);
  assert.deepEqual(legacy.map((creditor) => creditor.name), names);
  for (const deboA of [null, "", "   "]) assert.deepEqual(identity({ acreedorId: null, acreedorNombre: null, deboA }), { key: "sin-acreedor", id: null, name: "Sin acreedor" });
});

test("resumen y selección de deuda usan saldo pendiente real, centavos y sólo registros en DEUDA", { skip: baselineMode }, () => {
  const row = (id, data) => ({ ...items[0], id, acreedorId: null, acreedorNombre: null, ...data });
  const debt = [
    row(1, { acreedorId: 101, acreedorNombre: "Proveedor Finser", costo: 999, deudaPendiente: 100.25 }),
    row(2, { acreedorId: 102, acreedorNombre: "Proveedor Finser", deudaPendiente: 200.5 }),
    row(3, { acreedorId: 101, acreedorNombre: "Proveedor Finser", deudaPendiente: 0 }),
    row(4, { deboA: "Proveedor Finser", deudaPendiente: 300.75 }),
    row(5, { deboA: "PROVEEDOR FINSER", costo: 400 }),
    row(6, { deboA: "Proveedor Finser ", costo: 500 }),
    row(7, { deboA: "Proveedor Fínser", costo: 600 }),
    row(8, { deboA: "   ", costo: 50 }),
    row(9, { deboA: null, costo: 75 }),
    row(10, { estadoFinanciero: "PAGO", deudaPendiente: 10099 }),
    row(11, { estadoFinanciero: " deuda ", deboA: "Proveedor Finser", costo: 25, deudaPendiente: NaN }),
  ];
  const groups = inventoryDebtView.agruparDeudasPorAcreedor(debt);
  assert.equal(groups.length, 7);
  assert.equal(groups.reduce((sum, creditor) => sum + creditor.count, 0), 10);
  assert.equal(groups.reduce((sum, creditor) => sum + creditor.total, 0), 2251.5);
  assert.deepEqual(groups.filter((creditor) => creditor.id !== null).map((creditor) => [creditor.key, creditor.count, creditor.total]), [["id:102", 1, 200.5], ["id:101", 2, 100.25]]);
  assert.equal(groups.find((creditor) => creditor.key === "sin-acreedor").total, 125);
  assert.ok(groups.every((creditor, index) => index === 0 || groups[index - 1].total >= creditor.total));
  assert.equal(inventoryDebtView.deudaPendienteInventario(debt[2]), 0);
  assert.equal(inventoryDebtView.deudaPendienteInventario(debt[9]), 0);
  assert.equal(inventoryDebtView.deudaPendienteInventario(debt[10]), 25);
  assert.deepEqual(inventoryDebtView.agruparDeudasPorAcreedor([]), []);
});

test("panel de acreedores distingue IDs homónimos y busca fuera de los cinco principales", { skip: baselineMode }, () => {
  const creditors = Array.from({ length: 9 }, (_, index) => ({ key: `id:${101 + index}`, id: 101 + index,
    name: index < 2 ? "Proveedor Finser" : `Proveedor ${index === 8 ? "Tecnologías lejanas" : index}`,
    count: index + 1, total: 100.25 + index * 30.5 }));
  const invoked = [];
  const props = { creditors, selectedKey: "id:101", onSelect: (key) => invoked.push(key), search: "", onSearch() {} };
  const initial = inventoryDebtParts.CreditorsPanel(props);
  const buttons = elements(initial).filter((node) => node?.type === "button" && node.props["aria-pressed"] !== undefined);
  assert.equal(buttons.length, 6);
  const homonyms = buttons.filter((node) => textOf(node).includes("Proveedor Finser"));
  assert.equal(homonyms.length, 2);
  assert.match(textOf(homonyms[0]), /ID 101/);
  assert.match(textOf(homonyms[1]), /ID 102/);
  assert.equal(homonyms[0].props["aria-pressed"], true);
  assert.equal(homonyms[1].props["aria-pressed"], false);
  homonyms[1].props.onClick();
  assert.deepEqual(invoked, ["id:102"]);
  const searched = inventoryDebtParts.CreditorsPanel({ ...props, search: "tecnologias" });
  const matches = elements(searched).filter((node) => node?.type === "button" && node.props["aria-pressed"] !== undefined);
  assert.equal(matches.length, 2);
  const outsideTopFive = matches.find((node) => textOf(node).includes("Tecnologías lejanas"));
  assert.ok(outsideTopFive);
  assert.ok(!textOf(searched).includes("No hay acreedores"));
  outsideTopFive.props.onClick();
  assert.deepEqual(invoked, ["id:102", "id:109"]);
  const failed = inventoryDebtParts.CreditorsPanel({ ...props, creditors: [], loading: true, error: true });
  assert.ok(textOf(failed).includes("No se pudieron cargar los acreedores."));
  assert.ok(textOf(failed).includes("Sin datos cargados"));
  assert.ok(!textOf(failed).includes("Cargando acreedores") && !textOf(failed).includes("No hay acreedores con deuda"));
  assert.equal(failed.props["aria-busy"], false);
  assert.ok(elements(failed).filter((node) => node?.type === "input" || node?.type === "button").every((node) => node.props.disabled));
  const empty = inventoryDebtParts.CreditorsPanel({ ...props, creditors: [], loading: false, error: false });
  assert.ok(textOf(empty).includes("No hay acreedores con deuda."));
  assert.ok(!textOf(empty).includes("No se pudieron cargar"));
});

test("barra de deuda separa selección de página y resultados completos con importes sin abreviar", { skip: baselineMode }, () => {
  const invoked = [];
  const bar = inventoryDebtParts.DebtSelectionBar({ selectedCount: 23, total: 87007927.5, resultsCount: 50,
    pageCount: 3, allSelected: false, pageSelected: true, onSelectAll: () => invoked.push("all"),
    onSelectPage: () => invoked.push("page"), onClear: () => invoked.push("clear"), onPay: () => invoked.push("pay"),
    payDisabled: false, busy: false });
  assert.ok(textOf(bar).includes("$ 87.007.927,50"));
  const buttons = elements(bar).filter((node) => node?.type === "button");
  for (const label of ["Seleccionar resultados (50)", "Quitar selección de página actual (3)", "Limpiar selección", "Pagar seleccionados"]) {
    const button = buttons.find((node) => textOf(node) === label);
    assert.ok(button, label);
    button.props.onClick();
  }
  assert.deepEqual(invoked, ["all", "page", "clear", "pay"]);
  const empty = inventoryDebtParts.DebtSelectionBar({ selectedCount: 0, total: 0, resultsCount: 0, pageCount: 0,
    allSelected: false, pageSelected: false, onSelectAll() {}, onSelectPage() {}, onClear() {}, onPay() {}, payDisabled: true });
  assert.ok(elements(empty).filter((node) => node?.type === "button").every((node) => node.props.disabled));
});

test("cambiar acreedor, búsquedas, estados, sede o pestaña limpia selección antes de usar otro corte", { skip: baselineMode }, () => {
  const initial = { pestana: "deudas", idsSeleccionados: [10, 4], paginaDeudas: 3, acreedorDeudaClave: 'legacy:"Proveedor Finser"', busquedaDeudas: "Equipo", filtrosEstadoDeudas: ["BODEGA"] };
  const cases = [
    ["acreedor", (tree) => componentProps(tree, inventoryDebtParts.CreditorsPanel).onSelect('legacy:"SEDE 1"'), (state) => assert.equal(state.acreedorDeudaClave, 'legacy:"SEDE 1"')],
    ["búsqueda acreedor", (tree) => componentProps(tree, inventoryDebtParts.CreditorsPanel).onSearch("Tecnologías"), (state) => assert.equal(state.busquedaAcreedores, "Tecnologías")],
    ["búsqueda equipo", (tree) => componentProps(tree, inventoryDebtParts.DebtEquipmentFilters).onSearch(items[0].imei), (state) => assert.equal(state.busquedaDeudas, "000000000001000")],
    ["estado", (tree) => componentProps(tree, inventoryDebtParts.DebtEquipmentFilters).onToggleState("PRESTAMO"), (state) => assert.deepEqual(state.filtrosEstadoDeudas, ["BODEGA", "PRESTAMO"])],
    ["limpiar", (tree) => componentProps(tree, inventoryDebtParts.DebtEquipmentFilters).onClear(), (state) => { assert.equal(state.acreedorDeudaClave, "TODOS"); assert.equal(state.busquedaDeudas, ""); assert.deepEqual(state.filtrosEstadoDeudas, []); }],
    ["sede", (tree) => elements(tree).find((node) => node?.type === "select" && node.props["aria-label"] === "Sede del inventario").props.onChange({ target: { value: "3" } }), (state) => assert.equal(state.sedeFiltroId, "3")],
    ["pestaña", (tree) => elements(tree).find((node) => node?.type === "button" && node.props.id === "inventory-equipment-tab").props.onClick(), (state) => assert.equal(state.pestana, "equipos")],
  ];
  for (const [name, change, check] of cases) {
    const probe = pageProbe(initial);
    change(probe.render().tree);
    assert.deepEqual(probe.state.idsSeleccionados, [], name);
    check(probe.state);
    if (!["búsqueda acreedor", "pestaña"].includes(name)) assert.equal(probe.state.paginaDeudas, 1, name);
  }
  const general = pageProbe({ idsSeleccionados: [10], pagina: 3 });
  elements(general.render().tree).find((node) => node?.type === "input" && node.props["aria-label"] === "Buscar equipos").props.onChange({ target: { value: "no existe" } });
  assert.deepEqual(general.state.idsSeleccionados, []);
  assert.equal(general.state.pagina, 1);
});

test("selección de página sólo afecta sus IDs y la selección completa abarca todas las páginas del acreedor filtrado", { skip: baselineMode }, () => {
  const stock = Array.from({ length: 23 }, (_, index) => ({ ...items[0], id: 23 - index,
    imei: String(8000 + index).padStart(15, "0"), acreedorId: index < 14 ? 101 : 102,
    acreedorNombre: "Proveedor Finser", deudaPendiente: 100.25 + index * 10.5 }));
  const probe = pageProbe({ pestana: "deudas", items: stock, filasPorPaginaDeudas: 10, paginaDeudas: 3, idsSeleccionados: [23] });
  assert.deepEqual(probe.view.itemsPagina.map((item) => item.id), [3, 2, 1]);
  probe.view.alternarSeleccionPagina();
  assert.deepEqual(probe.state.idsSeleccionados, [23, 3, 2, 1]);
  probe.render();
  assert.equal(probe.view.paginaSeleccionada, true);
  probe.view.cambiarPagina(2);
  probe.render();
  assert.deepEqual(probe.state.idsSeleccionados, [23, 3, 2, 1]);
  probe.view.alternarSeleccionVisibles();
  probe.render();
  assert.equal(probe.state.idsSeleccionados.length, 23);
  assert.equal(probe.view.todosVisiblesSeleccionados, true);
  assert.equal(probe.view.totalSeleccionDeuda, 4962.25);
  probe.view.alternarSeleccionPagina();
  assert.equal(probe.state.idsSeleccionados.length, 13);
  assert.deepEqual(probe.state.idsSeleccionados.slice(0, 4), [23, 3, 2, 1]);
  probe.view.cambiarFilasPorPagina(25);
  assert.equal(probe.state.paginaDeudas, 1);
  assert.equal(probe.state.idsSeleccionados.length, 13);
  const filtered = pageProbe({ pestana: "deudas", items: stock, filasPorPaginaDeudas: 10, paginaDeudas: 2, acreedorDeudaClave: "id:101" });
  assert.equal(filtered.view.idsVisibles.length, 14);
  assert.deepEqual(filtered.view.itemsPagina.map((item) => item.id), [13, 12, 11, 10]);
  filtered.view.alternarSeleccionVisibles();
  assert.deepEqual(new Set(filtered.state.idsSeleccionados), new Set(stock.filter((item) => item.acreedorId === 101).map((item) => item.id)));
});

test("confirmación lista todos los equipos elegibles y acreedores separados, y no paga antes de confirmar", { skip: baselineMode }, async () => {
  const stock = Array.from({ length: 23 }, (_, index) => ({ ...items[0], id: 230 - index,
    imei: String(9000 + index).padStart(15, "0"), referencia: `Referencia de confirmación ${index}`,
    acreedorId: index < 12 ? 101 : 102, acreedorNombre: "Proveedor Finser", deudaPendiente: 100.25 + index * 10.5 }));
  const ineligible = [{ ...items[2], id: 300, referencia: "No pagable por estado" }, { ...items[0], id: 301, deboA: "SEDE 2", acreedorId: 103, acreedorNombre: "SEDE 2" }];
  const paid = [];
  const probe = pageProbe({ pestana: "deudas", items: [...stock, ...ineligible], idsSeleccionados: [...stock, ...ineligible].map((item) => item.id) }, {
    "/api/inventario/pagar-deuda": (_url, options) => { paid.push(JSON.parse(options.body).id); return { ok: true, data: { ok: true } }; },
  });
  componentProps(probe.render().tree, inventoryDebtParts.DebtSelectionBar).onPay();
  assert.equal(probe.state.mostrarModalPagoMasivo, true);
  assert.deepEqual(paid, []);
  const dialog = elements(probe.render().tree).find((node) => node?.props?.role === "dialog");
  assert.ok(dialog);
  assert.equal(dialog.props["aria-modal"], "true");
  const text = textOf(dialog);
  assert.match(text, /Se procesarán 23 deudas/);
  assert.match(text, /2 seleccionados no aplica/);
  assert.ok(text.includes("$ 4.962,25"));
  assert.ok(text.includes("ID 101") && text.includes("ID 102"));
  for (const item of stock) { assert.ok(text.includes(item.referencia), item.referencia); assert.ok(text.includes(item.imei), item.imei); }
  assert.ok(!text.includes("No pagable por estado"));
  const confirm = elements(dialog).find((node) => node?.type === "button" && textOf(node) === "Confirmar pago");
  await confirm.props.onClick();
  assert.deepEqual(paid, stock.map((item) => item.id));
  assert.deepEqual(probe.state.idsSeleccionados, []);
  assert.equal(probe.state.mostrarModalPagoMasivo, false);
});

test("operaciones conservan resultado y bloqueos parciales tras recargar inventario", { skip: baselineMode }, async () => {
  const probe = pageProbe({ idsSeleccionados: items.map((item) => item.id) }, {
    "/api/inventario/pagar-deuda": (_url, options) => JSON.parse(options.body).id === 4 ? { ok: false, data: { error: "Pago bloqueado" } } : { ok: true, data: { ok: true } },
  });
  await probe.view.ejecutarPagoMasivo();
  assert.match(probe.state.mensaje, /2 solicitudes procesadas/);
  assert.match(probe.state.mensaje, /Pago bloqueado/);
  const deletion = pageProbe({ idsSeleccionados: [10, 9] }, {
    "/api/inventario/eliminar": { ok: true, data: { eliminados: 1, bloqueados: [`${items[1].imei}: registro pendiente`] } },
  });
  await deletion.view.eliminar([10, 9]);
  assert.match(deletion.state.mensaje, /1 equipo eliminado/);
  assert.match(deletion.state.mensaje, /registro pendiente/);
  const changed = pageProbe();
  await changed.view.cambiarEstado(items[0], "PENDIENTE");
  assert.match(changed.state.mensaje, /Estado actualizado a PENDIENTE/);
});

test("fila real conserva IMEI textual, datos adicionales, factura, destino y callbacks de operación", { skip: baselineMode }, () => {
  const fixture = { ...items[0], costo: -87_007_927.5, facturaStand: { id: 20, estado: "ERROR", nombre: "FV20", url: "https://qa.test/fv20", error: "Error de factura existente" } };
  const invoked = [];
  const row = inventoryParts.InventoryRow({
    item: fixture, selected: true, expanded: true, destino: "Pendiente: SEDE 3",
    onSelect: () => invoked.push("select"), onToggle: () => invoked.push("toggle"),
    actions: [{ key: "pay", label: "Pagar deuda", icon: "cash", onClick: () => invoked.push("pay") }],
  });
  const text = textOf(row);
  for (const expected of ["Equipo 10", "000000000001000", "TELEFONIA", "ROJO", "DISTRIBUIDOR QA", "PRINCIPAL", "Proveedor Finser", "SEDE 1", "BODEGA", "DEUDA", "Pendiente: SEDE 3", "FV20", "Error de factura existente", "-$ 87.007.927,50"]) assert.ok(text.includes(expected), `Falta ${expected}`);
  const nodes = elements(row);
  const checkbox = nodes.find((node) => node?.type === "input" && node.props.type === "checkbox");
  assert.equal(checkbox.props.checked, true);
  checkbox.props.onChange();
  const toggle = nodes.find((node) => node?.type === "button" && node.props["aria-expanded"] === true);
  toggle.props.onClick();
  const action = nodes.find((node) => node?.type === "button" && textOf(node) === "Pagar deuda");
  action.props.onClick();
  assert.deepEqual(invoked, ["select", "toggle", "pay"]);
  assert.ok(nodes.some((node) => node?.type === "a" && node.props.href === "https://qa.test/fv20"));
  const missingCreditor = inventoryParts.InventoryRow({ item: { ...fixture, deboA: "   ", acreedorNombre: null, acreedorId: null },
    selected: false, expanded: true, destino: "—", actions: [], variant: "debt", onSelect() {}, onToggle() {} });
  assert.ok(textOf(missingCreditor).includes("Acreedor: Sin acreedor"));
  assert.ok(elements(missingCreditor).some((node) => node?.type === "td" && node.props.colSpan === 6));
});

test("cambiar cobertura oculta cifras y acciones anteriores; respuestas o errores tardíos no reemplazan el corte vigente", { skip: baselineMode }, async () => {
  for (const oldFails of [false, true]) {
    const old = deferred();
    const current = deferred();
    const selectedItems = items.slice(0, 2).map((item) => ({ ...item, sedeId: 3, sede: { id: 3, nombre: "SEDE 3", soloInventarioPorCobrar: false } }));
    const probe = pageProbe({ idsSeleccionados: [10, 9] }, {
      "/api/inventario": () => old.promise,
      "/api/inventario?sedeId=3": () => current.promise,
    });
    const previousRequest = probe.view.cargarInventario();
    const selector = elements(probe.render().tree).find((node) => node?.type === "select" && node.props["aria-label"] === "Sede del inventario");
    selector.props.onChange({ target: { value: "3" } });
    const { tree } = probe.render();
    assert.equal(probe.view.vistaDisponible, false);
    assert.equal(probe.view.valorMetrica(2), "—");
    assert.deepEqual(probe.view.itemsPagina, []);
    assert.deepEqual(probe.state.idsSeleccionados, []);
    assert.ok(!elements(tree).some((node) => node?.type === "button" && /Pagar seleccionados|Enviar a sede|Eliminar seleccion/.test(textOf(node))));
    const currentRequest = probe.view.cargarInventario();
    current.resolve({ ok: true, data: selectedItems });
    await currentRequest;
    probe.render();
    assert.equal(probe.view.vistaDisponible, true);
    assert.equal(probe.state.consultaCargada, "admin:3");
    assert.equal(probe.view.totalBodega, 2);
    assert.equal(probe.view.totalDeuda, 100.25);
    old.resolve({ ok: !oldFails, data: oldFails ? { error: "Error de cobertura anterior" } : items });
    await previousRequest;
    probe.render();
    assert.deepEqual(probe.state.items, selectedItems);
    assert.equal(probe.state.consultaCargada, "admin:3");
    assert.equal(probe.state.mensaje, "");
    assert.equal(probe.state.cargandoInventario, false);
  }
  const invalid = pageProbe({ items: [], inventarioCargado: false, consultaCargada: "" }, { "/api/inventario": { ok: true, data: { inesperado: true } } });
  await invalid.view.cargarInventario();
  invalid.render();
  assert.equal(invalid.state.inventarioCargado, false);
  assert.equal(invalid.view.valorMetrica(0), "—");
  assert.ok(invalid.state.mensaje);
});

test("paginación no cambia KPI ni seleccionar todos los resultados filtrados de todas las páginas", { skip: baselineMode }, () => {
  const stock = Array.from({ length: 23 }, (_, index) => ({ ...items[0], id: 23 - index, imei: String(4000 + index).padStart(15, "0") }));
  const probe = pageProbe({ items: stock, pagina: 3, filasPorPagina: 10, idsExpandidos: [1] });
  assert.equal(probe.view.resultados, 23);
  assert.equal(probe.view.paginas, 3);
  assert.deepEqual(probe.view.itemsPagina.map((item) => item.id), [3, 2, 1]);
  assert.equal(probe.view.totalBodega, 23);
  assert.equal(probe.view.totalDeuda, 2305.75);
  assert.equal(probe.view.idsVisibles.length, 23);
  probe.view.alternarSeleccionVisibles();
  assert.equal(probe.state.idsSeleccionados.length, 23);
  probe.render();
  assert.equal(probe.view.itemsSeleccionadosParaPago.length, 23);
  const pageSize = elements(probe.render().tree).find((node) => node?.type === "select" && node.props["aria-label"] === "Filas por página");
  pageSize.props.onChange({ target: { value: "25" } });
  probe.render();
  assert.equal(probe.state.pagina, 1);
  assert.equal(probe.view.itemsPagina.length, 23);
  assert.deepEqual(probe.state.idsExpandidos, [1]);
  assert.equal(probe.view.totalDeuda, 2305.75);
});

test("acciones conectadas por la página conservan guardias por rol y estado", { skip: baselineMode }, () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = pageProbe({ user: { ...session, rolNombre } });
    for (const item of items) {
      const actions = probe.view.accionesEquipo(item);
      const keys = new Set(actions.map((action) => action.key));
      assert.equal(keys.has("editar"), rolNombre !== "SUPERVISOR");
      assert.equal(keys.has("eliminar"), rolNombre === "ADMIN");
      assert.equal(keys.has("prestamo"), probe.view.puedeEnviarPrestamo(item));
      assert.equal(keys.has("pago"), probe.view.puedePagarDeuda(item));
      assert.equal(keys.has("bodega"), probe.view.puedeDevolverABodega(item));
      assert.equal(keys.has("cambio"), probe.view.puedeRegistrarCambioEquipo(item));
      assert.equal(keys.has("pendiente"), probe.view.puedePasarAPendiente(item));
      assert.equal(keys.has("garantia"), probe.view.puedePasarAGarantia(item));
      const history = actions.find((action) => action.key === "historial");
      assert.equal(history.href, `/inventario/historial?imei=${item.imei}`);
      for (const action of actions.filter((entry) => entry.key !== "historial")) assert.equal(typeof action.onClick, "function");
    }
  }
});

test("KPI de inventario representan toda cobertura y no cambian con estados, acreedor ni búsqueda", () => {
  for (const filters of [{}, { filtrosEstado: ["BODEGA", "DEUDA"], filtroAcreedorDeuda: "Proveedor Finser" }, { busqueda: "no existe" }]) {
    const { view } = pageProbe(filters);
    assert.deepEqual([view.totalBodega, view.totalPendiente, view.totalGarantia, view.totalPrestamo, view.totalPagados, view.totalCancelados], [2, 1, 1, 2, 3, 1]);
    assert.equal(view.valorPrestamosPorCobrar, 1100.5);
    assert.equal(view.totalDeuda, 3300.25);
    assert.equal(view.totalPagado, 1200.5);
  }
});

test("filtros son OR dentro de cada grupo y AND entre operativo, financiero, acreedor y búsqueda", () => {
  const ids = (filters) => pageProbe(filters).view.itemsFiltrados.map((item) => item.id);
  assert.deepEqual(ids({ filtrosEstado: ["BODEGA", "PENDIENTE"] }), [10, 9, 8]);
  assert.deepEqual(ids({ filtrosEstado: ["BODEGA", "PENDIENTE", "DEUDA"] }), [10, 8]);
  assert.deepEqual(ids({ filtrosEstado: ["BODEGA", "PENDIENTE", "DEUDA", "PAGO"] }), [10, 9, 8]);
  if (baselineMode) assert.deepEqual(ids({ filtrosEstado: ["DEUDA", "PAGO"], filtroAcreedorDeuda: "SEDE 1" }), [6]);
  else assert.deepEqual(pageProbe({ pestana: "deudas", acreedorDeudaClave: 'legacy:"SEDE 1"', filtrosEstadoDeudas: ["BODEGA", "PRESTAMO"] }).view.itemsVista.map((item) => item.id), [6]);
  assert.deepEqual(ids({ busqueda: "000000000001000" }), [10]);
  for (const busqueda of ["equipo 10", "ROJO", "distribuidor qa", "PRINCIPAL", "sede 3"]) assert.ok(ids({ busqueda }).length > 0);
  const trimmed = pageProbe({ items: [{ ...items[0], estadoActual: " bodega ", estadoFinanciero: " deuda " }], filtrosEstado: ["BODEGA", "DEUDA"] });
  assert.equal(trimmed.view.itemsFiltrados.length, 1);
  assert.equal(trimmed.view.totalBodega, 0); // KPI conserva normalización anterior sin trim.
});

test("deuda por acreedor y préstamo filtrado usan sus cortes existentes sin alterar el total global", () => {
  if (!baselineMode) {
    const view = pageProbe({ pestana: "deudas", filtrosEstadoDeudas: ["BODEGA"], acreedorDeudaClave: 'legacy:"Proveedor Finser"' }).view;
    assert.deepEqual(view.itemsVista.map((item) => item.id), [10]);
    assert.equal(view.totalDeudaVista, 3300.25);
    assert.equal(view.totalPrestamoVista, 1100.5);
    assert.deepEqual(view.resumenDeudaPorAcreedor, [
      { key: 'legacy:"Proveedor Finser"', id: null, name: "Proveedor Finser", count: 4, total: 1900.25 },
      { key: 'legacy:"SEDE 3"', id: null, name: "SEDE 3", count: 1, total: 900 },
      { key: 'legacy:"SEDE 1"', id: null, name: "SEDE 1", count: 1, total: 500 },
    ]);
    const noCreditor = pageProbe({ items: [{ ...items[0], deboA: "  " }], pestana: "deudas" }).view;
    assert.deepEqual(noCreditor.resumenDeudaPorAcreedor, [{ key: "sin-acreedor", id: null, name: "Sin acreedor", count: 1, total: 100.25 }]);
    return;
  }
  const view = pageProbe({ filtrosEstado: ["BODEGA", "DEUDA", "PAGO"], filtroAcreedorDeuda: "Proveedor Finser" }).view;
  assert.equal(view.totalDeudaVista, 100.25);
  assert.equal(view.totalDeudaAcreedorSeleccionado, 100.25);
  assert.equal(view.totalPrestamoVista, 1100.5);
  assert.deepEqual(view.resumenDeudaPorAcreedor, [{ acreedor: "Proveedor Finser", cantidad: 1, valor: 100.25 }]);
  assert.deepEqual(pageProbe({ filtrosEstado: ["DEUDA"] }).view.resumenDeudaPorAcreedor, [
    { acreedor: "Proveedor Finser", cantidad: 4, valor: 1900.25 }, { acreedor: "SEDE 3", cantidad: 1, valor: 900 }, { acreedor: "SEDE 1", cantidad: 1, valor: 500 },
  ]);
  const noCreditor = pageProbe({ items: [{ ...items[0], deboA: "  " }], filtrosEstado: ["DEUDA"] }).view;
  assert.deepEqual(noCreditor.resumenDeudaPorAcreedor, [{ acreedor: "SIN ACREEDOR", cantidad: 1, valor: 100.25 }]);
});

test("selección de resultados conserva otras páginas, grupos elegibles y excluye VENTAS y sedes origen como destino", () => {
  const probe = pageProbe({ filtrosEstado: ["BODEGA"], filasPorPagina: 1, idsSeleccionados: [9] });
  probe.view.alternarSeleccionVisibles();
  assert.deepEqual(probe.state.idsSeleccionados, [9, 10]);
  probe.render();
  assert.equal(probe.view.todosVisiblesSeleccionados, true);
  assert.deepEqual(probe.view.itemsSeleccionadosParaPrestamo.map((item) => item.id), [10, 9]);
  assert.deepEqual(probe.view.itemsSeleccionadosParaPendiente.map((item) => item.id), [10, 9]);
  assert.deepEqual(probe.view.itemsSeleccionadosParaGarantia.map((item) => item.id), [10, 9]);
  assert.deepEqual(probe.view.itemsSeleccionadosParaPago.map((item) => item.id), [10]);
  assert.deepEqual(probe.view.sedesDestinoMasivo.map((sede) => sede.id), [2, 3]);
  probe.view.alternarSeleccionVisibles();
  assert.deepEqual(probe.state.idsSeleccionados, []);
  probe.view.alternarFiltroEstado("DEUDA");
  assert.deepEqual(probe.state.idsSeleccionados, []);
});

test("acciones individuales respetan estado, proveedor, origen y rol; sólo ADMIN abre eliminación", () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = pageProbe({ user: { ...session, rolNombre } });
    assert.equal(probe.view.esAdmin, rolNombre !== "SUPERVISOR");
    assert.equal(probe.view.puedeEliminar, rolNombre === "ADMIN");
    assert.equal(probe.view.puedeDevolverABodega(items[2]), rolNombre !== "SUPERVISOR");
    assert.equal(probe.view.puedeDevolverABodega(items[3]), true);
    assert.equal(probe.view.puedeEnviarPrestamo(items[0]), true);
    assert.equal(probe.view.puedeEnviarPrestamo(items[4]), false);
    assert.equal(probe.view.puedePasarAPendiente(items[0]), true);
    assert.equal(probe.view.puedePasarAGarantia(items[2]), false);
    assert.equal(probe.view.puedePagarDeuda(items[0]), true);
    assert.equal(probe.view.puedePagarDeuda(items[2]), false);
    assert.equal(probe.view.puedePagarDeuda(items[4]), false);
    assert.equal(probe.view.puedePagarDeuda(items[6]), true);
    assert.equal(probe.view.puedeRegistrarCambioEquipo(items[0]), rolNombre !== "SUPERVISOR");
    probe.view.abrirEliminacion([10]);
    assert.equal(Boolean(probe.state.modalEliminar), rolNombre === "ADMIN");
  }
});

test("factura stand conserva exclusión de equipos ya facturados, total y validación de una sola sede", () => {
  const stand = { id: 2, nombre: "STAND QA", soloInventarioPorCobrar: true };
  const stock = items.slice(0, 3).map((item, index) => ({ ...item, sedeId: 2, sede: stand, facturaStand: index === 2 ? { id: 9, estado: "EMITIDA", nombre: "FV9", url: "https://qa.test/fv9", error: null } : null }));
  const view = pageProbe({ items: stock, idsSeleccionados: [10, 9, 8] }).view;
  assert.equal(view.seleccionFacturaStandValida, true);
  assert.equal(view.cantidadExcluidaFacturaStand, 1);
  assert.equal(view.totalFacturaStand, 300.25);
  assert.deepEqual(view.itemsSeleccionadosParaFactura.map((item) => item.id), [10, 9]);
  assert.equal(pageProbe({ items: stock, idsSeleccionados: [10, 9], user: { ...session, rolNombre: "SUPERVISOR" } }).view.seleccionFacturaStandValida, false);
  assert.equal(pageProbe({ items: [stock[0], { ...stock[1], sedeId: 3 }], idsSeleccionados: [10, 9] }).view.seleccionFacturaStandValida, false);
});

test("carga aplica sede únicamente ADMIN/AUDITOR y mantiene refresco a60s y mensajes HTTP reales", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = pageProbe({ user: { ...session, rolNombre }, sedeFiltroId: "3" });
    await probe.view.cargarInventario();
    assert.equal(probe.calls.find((call) => call.name === "fetch").url, rolNombre === "SUPERVISOR" ? "/api/inventario" : "/api/inventario?sedeId=3");
    assert.ok(probe.calls.some((call) => call.name === "refresh" && call.options.intervalMs === 60000 && call.options.enabled === true));
  }
  const failure = pageProbe({ items: [], inventarioCargado: false }, { "/api/inventario": { ok: false, data: { error: "Base no disponible" } } });
  await failure.view.cargarInventario();
  assert.equal(failure.state.mensaje, "Base no disponible");
  assert.equal(failure.state.inventarioCargado, false);
});

test("operaciones masivas procesan sólo elegibles, mantienen errores parciales y recargan sin modificar los demás", async () => {
  const paid = [];
  const probe = pageProbe({ idsSeleccionados: items.map((item) => item.id), sedeDestinoId: "2" }, {
    "/api/inventario/pagar-deuda": (_url, options) => { const id = JSON.parse(options.body).id; paid.push(id); return { ok: id !== 4, data: id === 4 ? { error: "Pago bloqueado" } : { ok: true } }; },
  });
  await probe.view.ejecutarPagoMasivo();
  assert.deepEqual(paid, [10, 4, 3]);
  assert.ok(probe.calls.some((call) => call.name === "message" && /2 solicitudes procesadas/.test(call.value) && /Pago bloqueado/.test(call.value)));
  assert.deepEqual(probe.state.idsSeleccionados, []);
  assert.ok(probe.calls.some((call) => call.name === "fetch" && call.url === "/api/inventario"));
  const stateProbe = pageProbe({ idsSeleccionados: [10, 9, 8] });
  await stateProbe.view.ejecutarCambioEstadoMasivo("GARANTIA", stateProbe.view.itemsSeleccionadosParaGarantia);
  assert.deepEqual(stateProbe.calls.filter((call) => call.url === "/api/inventario/cambiar-estado").map((call) => JSON.parse(call.options.body)), [{ id: 10, estadoActual: "GARANTIA" }, { id: 9, estadoActual: "GARANTIA" }]);
  const loanProbe = pageProbe({ idsSeleccionados: items.map((item) => item.id), sedeDestinoId: "2" });
  await loanProbe.view.ejecutarEnvioMasivo();
  assert.deepEqual(loanProbe.calls.filter((call) => call.url === "/api/prestamos/crear-desde-inventario").map((call) => JSON.parse(call.options.body)), [{ inventarioId: 10, sedeDestinoId: 2 }, { inventarioId: 9, sedeDestinoId: 2 }]);
  assert.ok(loanProbe.calls.some((call) => call.name === "message" && /2 equipos enviados/.test(call.value)));
});

function apiProbe(user, options = {}) {
  const calls = [];
  const record = (name, result) => async (args) => { calls.push({ name, args }); return typeof result === "function" ? result(args) : result; };
  const row = options.row ?? items[0];
  const transaction = {
    $queryRaw: record("tx-lock", row ? [{ id: row.id }] : []),
    inventarioSede: { findUnique: record("tx-inventory-detail", row), update: record("tx-update", row), deleteMany: record("tx-delete", { count: 1 }) },
    movimientoInventario: { create: record("tx-movement", {}), createMany: record("tx-movements", { count: 1 }) },
  };
  const prisma = {
    inventarioSede: { findMany: record("inventory-list", options.list ?? items), findUnique: record("inventory-detail", row), update: record("update", row) },
    prestamoSede: { findMany: record("loan-list", options.loans ?? []), findFirst: record("loan-detail", options.activeLoan ?? null) },
    sede: { findMany: record("sede-list", [{ id: 3, nombre: "SEDE 3" }]) },
    registroVendedorVenta: { findMany: record("registrations", options.registrations ?? []) },
    movimientoInventario: { create: record("movement", {}) },
    $transaction: async (callback) => { calls.push({ name: "transaction" }); return callback(transaction); },
  };
  const imports = {
    "next/server": { NextResponse: { json: (data, responseOptions) => Response.json(data, responseOptions) } },
    "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access, "@/lib/prestamos": prestamos, "@/lib/sedes": sedes, "@/lib/product-types": productTypes,
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: record("ensure-schema", undefined) }, "@/lib/siigo": {},
    "@/lib/inventory-creditors": {
      ...creditorHelpers,
      resolverIdentidadesAcreedores: async (rows) => new Map([...new Set(rows.map((item) => creditorHelpers.nombreHistoricoAcreedor(item.deboA)).filter((name) => name !== null))]
        .map((nombre, index) => [nombre, { id: 101 + index, nombre }])),
    },
  };
  const endpoints = {};
  for (const path of ["app/api/inventario/route.ts", "app/api/inventario/actualizar/route.ts", "app/api/inventario/eliminar/route.ts", "app/api/inventario/cambiar-estado/route.ts", "app/api/inventario/pagar-deuda/route.ts", "app/api/inventario/cambio-equipo/route.ts", "app/api/inventario/factura-stand/route.ts", "app/api/prestamos/crear-desde-inventario/route.ts"]) endpoints[path] = loadTypeScript(path, imports);
  return { calls, endpoints };
}

function request(path, body) {
  return new Request(`http://qa.test/${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

test("APIs inventario rechazan sesión ausente y roles sin acceso antes de consultar o mutar datos", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map((perfilTipo) => ({ ...session, perfilTipo, rolNombre: "VENDEDOR" }))]) {
    const probe = apiProbe(user);
    for (const [path, endpoint] of Object.entries(probe.endpoints)) {
      const response = path === "app/api/inventario/route.ts" ? await endpoint.GET(request("api/inventario")) : await endpoint.POST(request(path, {}));
      assert.equal(response.status, user ? 403 : 401, path);
    }
    assert.deepEqual(probe.calls, []);
  }
});

test("GET real preserva cobertura, campos completos, último destino por IMEI+sede y factura sin quitar ceros", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const raw = items.map((item) => ({ ...item, facturaStandItem: item.id === 6 ? { factura: { id: 7, estado: "EMITIDA", siigoInvoiceName: "FV7", siigoInvoiceUrl: "https://qa.test/fv7", siigoInvoiceError: null } } : null }));
    const probe = apiProbe({ ...session, rolNombre, perfilTipo: "OPERATIVO" }, { list: raw, loans: [
      { id: 20, imei: items[4].imei, estado: "APROBADO", sedeOrigenId: 1, sedeDestinoId: 3 },
      { id: 19, imei: items[4].imei, estado: "FINALIZADO", sedeOrigenId: 1, sedeDestinoId: 2 },
    ] });
    const response = await probe.endpoints["app/api/inventario/route.ts"].GET(request("api/inventario?sedeId=3"));
    assert.equal(response.status, 200);
    const query = probe.calls.find((call) => call.name === "inventory-list").args;
    assert.deepEqual(query.where, { sedeId: rolNombre === "SUPERVISOR" ? 1 : 3 });
    assert.deepEqual(query.orderBy, { id: "desc" });
    assert.equal(query.take, undefined);
    for (const field of ["imei", "referencia", "tipoProducto", "color", "costo", "distribuidor", "deboA", "origen", "estadoActual", "estadoFinanciero", "sedeId"]) assert.equal(query.select[field], true);
    const data = await response.json();
    assert.equal(data[0].imei, "000000000001000");
    assert.equal(data[0].acreedorId, 101);
    assert.equal(data[0].acreedorNombre, "Proveedor Finser");
    assert.equal(data[0].deudaPendiente, 100.25);
    assert.equal(data[1].deudaPendiente, 0);
    assert.deepEqual(data[4].prestamoDestino, { id: 3, nombre: "SEDE 3", prestamoId: 20, estado: "APROBADO" });
    assert.equal(data[0].prestamoDestino, null);
    assert.equal(data[4].facturaStand.nombre, "FV7");
    assert.equal(data[4].facturaStandItem, undefined);
  }
});

test("cambiar estado protege sede y transiciones exactas, y conserva actualización e historial transaccionales", async () => {
  const probe = apiProbe({ ...session, rolNombre: "SUPERVISOR", perfilTipo: "OPERATIVO" });
  const response = await probe.endpoints["app/api/inventario/cambiar-estado/route.ts"].POST(request("api/inventario/cambiar-estado", { id: 10, estadoActual: "GARANTIA" }));
  assert.equal(response.status, 200);
  assert.equal(probe.calls.find((call) => call.name === "tx-update").args.data.estadoActual, "GARANTIA");
  assert.equal(probe.calls.find((call) => call.name === "tx-movement").args.data.imei, "000000000001000");
  for (const row of [{ ...items[0], sedeId: 3 }, { ...items[0], estadoActual: "VENDIDO" }]) {
    const blocked = apiProbe({ ...session, rolNombre: "SUPERVISOR", perfilTipo: "OPERATIVO" }, { row });
    const result = await blocked.endpoints["app/api/inventario/cambiar-estado/route.ts"].POST(request("api/inventario/cambiar-estado", { id: 10, estadoActual: "BODEGA" }));
    assert.equal(result.status, row.sedeId === 3 ? 403 : 400);
    assert.ok(!blocked.calls.some((call) => call.name === "transaction"));
  }
});

test("editar conserva ADMIN/AUDITOR y bloqueos vendidos/préstamo; eliminar parcial sóloADMIN omite comerciales pendientes", async () => {
  const body = { id: 10, referencia: "Equipo 10", tipoProducto: "TELEFONIA", costo: 120.5, distribuidor: "Proveedor QA", estadoFinanciero: "PAGO", deboA: "deuda vieja" };
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const probe = apiProbe({ ...session, rolNombre });
    const result = await probe.endpoints["app/api/inventario/actualizar/route.ts"].POST(request("api/inventario/actualizar", body));
    assert.equal(result.status, rolNombre === "SUPERVISOR" ? 403 : 200);
    if (rolNombre !== "SUPERVISOR") {
      assert.equal(probe.calls.find((call) => call.name === "update").args.data.deboA, null);
      assert.equal(probe.calls.find((call) => call.name === "movement").args.data.tipoMovimiento, "EDICION_ADMIN");
    }
  }
  for (const options of [{ row: { ...items[0], estadoActual: "VENDIDO" } }, { activeLoan: { id: 1 } }]) {
    const probe = apiProbe(session, options);
    assert.equal((await probe.endpoints["app/api/inventario/actualizar/route.ts"].POST(request("api/inventario/actualizar", body))).status, 400);
    assert.ok(!probe.calls.some((call) => call.name === "update"));
  }
  const stock = [items[0], { ...items[1], ventas: [{ id: 1 }] }, { ...items[2] }, items[4]];
  const probe = apiProbe(session, { list: stock, registrations: [{ serialImei: items[2].imei }] });
  const deletion = await probe.endpoints["app/api/inventario/eliminar/route.ts"].POST(request("api/inventario/eliminar", { ids: [10, 9, 8, 6, 10] }));
  assert.equal(deletion.status, 200);
  const result = await deletion.json();
  assert.equal(result.eliminados, 1);
  assert.equal(result.bloqueados.length, 3);
  assert.deepEqual(probe.calls.find((call) => call.name === "tx-delete").args.where.id.in, [10]);
  assert.equal(probe.calls.find((call) => call.name === "tx-movements").args.data[0].imei, "000000000001000");
  const auditor = apiProbe({ ...session, rolNombre: "AUDITOR" });
  assert.equal((await auditor.endpoints["app/api/inventario/eliminar/route.ts"].POST(request("api/inventario/eliminar", { ids: [10] }))).status, 403);
});

test("préstamo y pago servidor impiden alcance ajeno y estados o deuda entre sedes incorrectos", async () => {
  for (const path of ["app/api/prestamos/crear-desde-inventario/route.ts", "app/api/inventario/pagar-deuda/route.ts"]) {
    const probe = apiProbe({ ...session, rolNombre: "SUPERVISOR", perfilTipo: "OPERATIVO" }, { row: { ...items[0], sedeId: 3 } });
    const response = await probe.endpoints[path].POST(request(path, { id: 10, inventarioId: 10, sedeDestinoId: 2 }));
    assert.equal(response.status, 403);
    assert.ok(!probe.calls.some((call) => ["tx-update", "tx-delete", "tx-movement", "tx-movements"].includes(call.name)));
    if (path === "app/api/inventario/pagar-deuda/route.ts") assert.ok(probe.calls.some((call) => call.name === "tx-lock"));
  }
  const nonStock = apiProbe(session, { row: items[2] });
  assert.equal((await nonStock.endpoints["app/api/prestamos/crear-desde-inventario/route.ts"].POST(request("api/prestamos/crear-desde-inventario", { inventarioId: 8, sedeDestinoId: 2 }))).status, 400);
  const betweenSedes = apiProbe(session, { row: { ...items[0], deboA: "SEDE 2" } });
  const response = await betweenSedes.endpoints["app/api/inventario/pagar-deuda/route.ts"].POST(request("api/inventario/pagar-deuda", { id: 10 }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /modulo de prestamos/);
});
