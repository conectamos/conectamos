import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
function compile(source, imports, inject = {}) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(inject), code)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, testModule, testModule.exports, ...Object.values(inject));
  return testModule.exports;
}
const navigation = compile(readFileSync("lib/bodega-navigation.ts", "utf8"), {});
const { agruparDeudasPorSede } = compile(readFileSync("lib/warehouse-debt-groups.ts", "utf8"), {});
const sedes = Array.from({ length: 13 }, (_, index) => ({ id: index + 1, nombre: index < 2 ? "Sede compartida" : `SEDE ${index + 1}` }));
const equiposConDeuda = sedes.flatMap((sede, index) => Array.from({ length: index === 0 ? 14 : 1 }, (_, item) => ({
  id: (index + 1) * 100 + item, imei: String((index + 1) * 100 + item).padStart(15, "0"),
  referencia: `Equipo de prueba ${index + 1}-${item}`, color: "Negro", costo: index === 0 ? 1000.25 : 100 + index,
  estado: "PRESTAMO", estadoCobro: "PENDIENTE", sedeDestinoId: sede.id, sedeDestinoNombre: sede.nombre,
  fechaEnvio: "2026-10-19T03:30:00Z",
})));
const deudores = agruparDeudasPorSede(equiposConDeuda, sedes);
const fixture = { metrics: { equiposEnBodega: 8, valorEnBodega: 45_123_456.75, enviadosASede: 30,
  totalPorCobrar: deudores.reduce((sum, group) => sum + Math.round(group.totalPendiente * 100), 0) / 100,
  equiposPorCobrar: equiposConDeuda.length, sedesDeudoras: deudores.length },
  deudores, equiposConDeuda, updatedAt: "2026-10-19T17:30:00Z", sedeNombre: "BODEGA PRINCIPAL" };

function probe({ initialData = fixture, initialError = "", initial = {}, fetchImpl = async () => Response.json({ ok: true, ...fixture }) } = {}) {
  const source = readFileSync("app/dashboard/_components/bodega-dashboard.tsx", "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const states = fn.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.filter(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer?.expression?.getText(ast) === "useState").map(entry => entry.name.elements[0].name.getText(ast)) : []);
  const values = fn.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text) : []);
  const returnAt = fn.body.statements.find(ts.isReturnStatement).getStart(ast);
  const state = { ...initial };
  const refs = [];
  let cursor = 0, refIndex = 0, captured, tree;
  const calls = [];
  const sidebarProps = [];
  const Sidebar = props => {
    sidebarProps.push(props);
    return jsx.jsx("aside", { "aria-label": "Navegación de bodega", children: props.items.map(item => jsx.jsx("a", { href: item.href, children: item.label }, item.href)) });
  };
  const Null = { __esModule: true, default: () => null };
  const styles = new Proxy({}, { get: (_object, key) => String(key) });
  const Page = compile(`${source.slice(0, returnAt)}__capture({${values.join(",")}});${source.slice(returnAt)}`, {
    "react/jsx-runtime": jsx,
    react: { useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
      useRef: value => { const index = refIndex++; return refs[index] ||= { current: value }; },
      useState(value) { const key = states[cursor++]; if (!(key in state)) state[key] = typeof value === "function" ? value() : value; return [state[key], next => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; } },
    "next/link": { __esModule: true, default: "a" }, "next/image": Null,
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/app/prestamos/_components/loan-dialog": { __esModule: true, default: ({ title, children }) => jsx.jsx("div", { role: "dialog", "aria-label": title, children }) },
    "./dashboard-icon": Null,
    "./operations-dashboard": { DashboardSidebar: Sidebar },
    "@/lib/bodega-navigation": navigation,
    "@/lib/use-live-refresh": { useLiveRefresh() {} },
    "./bodega-dashboard.module.css": { __esModule: true, default: styles },
  }, { __capture: value => { captured = value; }, fetch: async (...args) => { calls.push(args); return fetchImpl(...args); } }).default;
  const render = () => { cursor = 0; refIndex = 0; tree = Page({ initialData, initialError, nombre: "Operador de bodega QA" }); return tree; };
  render();
  return { state, calls, sidebarProps, render, get view() { return captured; }, html() { return renderToStaticMarkup(tree); } };
}
function nodes(node) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }

test("dashboard BODEGA muestra cifras reales completas, Radar, perfil y ninguna ruta de caja o ventas", () => {
  const p = probe();
  const html = p.html();
  assert.match(html, /Dashboard de bodega/);
  assert.match(html, /45\.123\.456,75/);
  assert.match(html, /Quién le debe a bodega/);
  const links = Array.from(html.matchAll(/href="([^"]+)"/g), match => match[1]);
  assert.ok(links.includes("/dashboard/radar"));
  assert.ok(links.includes("/dashboard#quien-me-debe"));
  assert.ok(links.every(path => !/^\/(?:caja|ventas|cierre)|financiero|proveedores/.test(path)));
  assert.equal(p.state.data.metrics.totalPorCobrar, fixture.metrics.totalPorCobrar);
});

test("navegación blanca de Bodega reutiliza el marco del administrador sin añadir CIERRE", () => {
  const p = probe(); p.html();
  assert.equal(p.sidebarProps.length, 1);
  const sidebar = p.sidebarProps[0];
  assert.equal(sidebar.appearance, "white");
  assert.equal(sidebar.includeCierre, false);
  assert.equal(sidebar.activeHref, "/dashboard");
  assert.deepEqual(sidebar.items.map(item => item.href), navigation.getBodegaNavigation().map(item => item.href));
  assert.ok(sidebar.items.every(item => item.href !== "/cierre"));
});

test("ranking conserva las cinco mayores deudas globales y abre el mismo detalle sin perder filtros", () => {
  const p = probe({ initial: { search: "SEDE 13", page: 2 } });
  const ranking = nodes(p.render()).find(node => node.type === "section" && node.props["aria-label"] === "Sedes con mayor deuda");
  assert.ok(ranking);
  const buttons = nodes(ranking).filter(node => node.type === "button");
  assert.equal(buttons.length, 5);
  assert.deepEqual(p.view.topDebtors.map(group => group.key), fixture.deudores.slice(0, 5).map(group => group.key));
  assert.equal(p.view.visibleGroups.length, 1);
  assert.equal(p.view.visibleGroups[0].sedeId, 13);
  let focused = false;
  buttons[0].props.onClick({ currentTarget: { focus() { focused = true; } } });
  p.render();
  assert.equal(p.state.selected, fixture.deudores[0].key);
  assert.equal(p.view.currentGroup.totalPendiente, fixture.deudores[0].totalPendiente);
  assert.equal(p.view.detailItems.length, 14);
  assert.match(p.html(), /000000000000100/);
  p.view.close(); p.render();
  assert.equal(focused, true);
  assert.equal(p.state.search, "SEDE 13");
  assert.equal(p.state.page, 2);
});

test("resumen de inventario usa cobertura completa y conserva cero válido sin proporciones inválidas", () => {
  const p = probe({ initial: { page: 2, search: "SEDE 13" } });
  assert.equal(p.view.stockAndSent, fixture.metrics.equiposEnBodega + fixture.metrics.enviadosASede);
  assert.ok(p.view.warehouseShare > 0 && p.view.warehouseShare < 100);
  const stock = nodes(p.render()).find(node => node.type === "section" && node.props["aria-label"] === "Estado del inventario de bodega");
  assert.ok(stock);
  const empty = probe({ initialData: { ...fixture, metrics: { ...fixture.metrics, equiposEnBodega: 0, enviadosASede: 0 } } });
  assert.equal(empty.view.stockAndSent, 0);
  assert.equal(empty.view.warehouseShare, 0);
  assert.doesNotMatch(empty.html(), /NaN|Infinity/);
});

test("sedes se buscan sobre todas las páginas y el total general no cambia con la búsqueda", () => {
  const p = probe({ initial: { page: 2 } });
  assert.equal(p.view.visibleGroups.length, 3);
  const search = nodes(p.render()).find(node => node.type === "input" && node.props.placeholder === "Buscar sede deudora…");
  search.props.onChange({ target: { value: "seDE 13" } });
  p.render();
  assert.equal(p.state.page, 1);
  assert.equal(p.view.groups.length, 1);
  assert.equal(p.view.visibleGroups[0].sedeId, 13);
  assert.equal(p.state.data.metrics.totalPorCobrar, fixture.metrics.totalPorCobrar);
  assert.equal(p.view.totalFiltered, 112);
});

test("el detalle usa ID de sede, conserva IMEI con ceros y encuentra equipos fuera de su página", () => {
  const p = probe();
  const opener = { focus() {} };
  p.view.open("sede:1", opener); p.render();
  assert.equal(p.view.currentGroup.sedeId, 1);
  assert.equal(p.view.detailItems.length, 14);
  assert.equal(p.view.visibleDetails.length, 10);
  assert.equal(p.view.detailPages, 2);
  assert.match(p.html(), /000000000000100/);
  const query = nodes(p.render()).find(node => node.type === "input" && node.props.placeholder === "Buscar IMEI, referencia o ID…");
  query.props.onChange({ target: { value: "000000000000113" } }); p.render();
  assert.equal(p.view.detailItems.length, 1);
  assert.equal(p.view.visibleDetails[0].id, 113);
  assert.equal(p.view.currentGroup.totalPendiente, 14003.5);
  assert.match(p.html(), /18\/10\/26/);
});

test("nombres iguales no mezclan deudas y cerrar detalle conserva búsqueda y página de sedes", () => {
  const p = probe({ initial: { page: 2, search: "" } });
  let focused = false;
  p.view.open("sede:2", { focus: () => { focused = true; } }); p.render();
  assert.equal(p.view.currentGroup.nombre, "Sede compartida");
  assert.equal(p.view.detailItems.length, 1);
  assert.equal(p.view.detailItems[0].sedeDestinoId, 2);
  p.view.close(); p.render();
  assert.equal(focused, true);
  assert.equal(p.state.selected, null);
  assert.equal(p.state.page, 2);
  assert.equal(p.state.search, "");
});

test("carga, error y ausencia de deuda se distinguen sin cifras ficticias", () => {
  const failed = probe({ initialData: null, initialError: "Error de conexión" });
  assert.match(failed.html(), /Error de conexión/);
  assert.doesNotMatch(failed.html(), /\$ 0/);
  const loading = probe({ initialData: null, initial: { loading: true } });
  assert.match(loading.html(), /Cargando saldos/);
  const empty = probe({ initialData: { ...fixture, deudores: [], equiposConDeuda: [], metrics: { ...fixture.metrics, totalPorCobrar: 0, sedesDeudoras: 0, equiposPorCobrar: 0 } } });
  assert.match(empty.html(), /No hay cobros pendientes/);
});

test("actualizar evita duplicación, consulta solo API autorizada y conserva filtros", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const p = probe({ initial: { search: "SEDE 13", page: 2 }, fetchImpl: () => pending });
  const first = p.view.refresh(); const second = p.view.refresh();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0][0], "/api/dashboard/bodega");
  assert.equal(p.calls[0][1].cache, "no-store");
  assert.equal(p.state.loading, true);
  release(Response.json({ ok: true, ...fixture }));
  await Promise.all([first, second]);
  assert.equal(p.state.loading, false);
  assert.equal(p.state.search, "SEDE 13");
  assert.equal(p.state.page, 2);
  assert.equal(p.state.error, "");
});

test("fallo e información incompleta preservan datos; sesión no autorizada los oculta incluso sin JSON", async () => {
  for (const response of [Response.json({ error: "Fallo temporal" }, { status: 500 }), Response.json({ ok: true, metrics: {} })]) {
    const p = probe({ fetchImpl: async () => response });
    await p.view.refresh(); p.render();
    assert.equal(p.state.data, fixture);
    assert.ok(p.state.error);
    assert.match(p.html(), /última actualización correcta/);
  }
  for (const status of [401, 403]) {
    const p = probe({ initial: { selected: "sede:1" }, fetchImpl: async () => new Response("Denied", { status }) });
    await p.view.refresh(); p.render();
    assert.equal(p.state.data, null);
    assert.equal(p.state.selected, null);
    assert.doesNotMatch(p.html(), /45\.123\.456,75/);
  }
});

test("una actualización de deuda cambia totales y cierra el detalle cuando esa sede queda sin saldo", async () => {
  const result = { ...fixture, deudores: fixture.deudores.filter(group => group.sedeId !== 1), equiposConDeuda: fixture.equiposConDeuda.filter(item => item.sedeDestinoId !== 1), metrics: { ...fixture.metrics, totalPorCobrar: 1278, sedesDeudoras: 12, equiposPorCobrar: 12 } };
  const p = probe({ initial: { selected: "sede:1" }, fetchImpl: async () => Response.json({ ok: true, ...result }) });
  await p.view.refresh(); p.render();
  assert.equal(p.state.data.metrics.totalPorCobrar, 1278);
  assert.equal(p.state.selected, null);
  assert.equal(p.view.currentGroup, undefined);
});
