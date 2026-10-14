import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const PAGE = "app/dashboard/financiero/cartera/detalle/page.tsx";
const source = file => readFileSync(join(ROOT, file), "utf8");
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const admin = { id: 7, nombre: "Administrador QA", usuario: "admin.qa", rolNombre: "ADMIN", rolId: 1, sedeId: 1, sedeNombre: "BODEGA PRINCIPAL" };
const auditor = { ...admin, id: 8, nombre: "Auditor QA", rolNombre: "AUDITOR", rolId: 2 };
const supervisor = { ...admin, id: 9, nombre: "Supervisor QA", rolNombre: "SUPERVISOR", rolId: 3, sedeId: 3, sedeNombre: "SEDE 3" };
const sedes = [{ id: 1, nombre: "BODEGA PRINCIPAL" }, { id: 3, nombre: "SEDE 3" }];
const rows = Array.from({ length: 27 }, (_, index) => ({
  id: 95027 - index,
  valor: index === 26 ? 1500000.25 : 100000 + index * 500,
  observacion: index === 26 ? "Revisión histórica crédito último resultado" : `Gasto sintético ${index + 1}${index % 2 ? " recaudo" : " corte"}`,
  sedeId: index % 2 ? 3 : 1,
  createdAt: index === 26 ? "2026-10-14T04:59:59.999Z" : `2026-10-${String(14 - Math.floor(index / 10)).padStart(2, "0")}T${String(13 + index % 10).padStart(2, "0")}:15:00.000Z`,
  sede: { nombre: index % 2 ? "SEDE 3" : "BODEGA PRINCIPAL" },
}));

function load(file, imports = {}, injected = {}, transform = text => text) {
  const output = ts.transpileModule(transform(source(file)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(injected), output)(name => {
    if (name in imports) return imports[name];
    if (name.endsWith(".module.css")) return css;
    const local = name.startsWith("@/lib/") ? `${name.slice(2)}.ts` : name.startsWith(".") ? join(dirname(file), `${name}.ts`) : null;
    assert.ok(local, `Dependencia inesperada: ${name}`);
    return load(local, imports, injected);
  }, loaded, loaded.exports, ...Object.values(injected));
  return loaded.exports;
}
function elements(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function") return [node, ...elements(node.type(node.props))];
  return [node, ...elements(node.props?.children)];
}
function textOf(node) { return elements(node).filter(value => typeof value === "string" || typeof value === "number").join(" ").replace(/\s+/g, " ").trim(); }
function control(tree, predicate) { const result = elements(tree).find(node => typeof node === "object" && predicate(node)); assert.ok(result, "Control esperado no encontrado"); return result; }
function byId(tree, id) { return control(tree, node => node.props?.id === id); }
function button(tree, label) { return control(tree, node => node.type === "button" && (textOf(node) === label || node.props["aria-label"] === label)); }
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function dataRows(tree) {
  const body = control(tree, node => node.type === "tbody");
  return elements(body).filter(node => node?.type === "tr" && !elements(node).some(child => child?.type === "td" && child.props.colSpan));
}
function rowId(row) { return Number(/#\s*(\d+)/.exec(textOf(row))?.[1]); }
function searchField(tree) { return control(tree, node => node.type === "input" && /observaci[oó]n.*valor.*ID/i.test(node.props.placeholder ?? "")); }
function field(tree, name) {
  const label = control(tree, node => node.type === "label" && textOf(node).toLowerCase() === name.toLowerCase());
  if (label.props.htmlFor) return byId(tree, label.props.htmlFor);
  return control(label, node => ["input", "select", "textarea"].includes(node.type));
}
function rowAction(tree, action, id) {
  return control(tree, node => node.type === "button" && new RegExp(`^${action}.*${id}$`, "i").test(node.props["aria-label"] ?? ""));
}

function probe({ user = admin, records = rows, initial = {}, fetchImpl, confirm = true } = {}) {
  const input = source(PAGE), ast = ts.createSourceFile(PAGE, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const stateNames = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
  const captureNames = [...declarations.filter(node => ts.isIdentifier(node.name)).map(node => node.name.text), ...component.body.statements.filter(ts.isFunctionDeclaration).map(node => node.name.text)];
  const lastReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(lastReturn);
  const state = { ...initial }, calls = [], effects = [], deps = [], refs = [], confirmations = [], exports = [], live = [], refreshes = [], callbacks = [];
  let cursor = 0, effectCursor = 0, refCursor = 0, callbackCursor = 0, captured, revision = 0;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(value) { const name = stateNames[cursor++]; assert.ok(name, "Estado inesperado"); if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { const value = typeof next === "function" ? next(state[name]) : next; if (!Object.is(state[name], value)) { state[name] = value; revision++; } }]; },
    useMemo: callback => callback(),
    useCallback(callback, nextDeps) { const index = callbackCursor++; if (!callbacks[index] || !equal(callbacks[index].deps, nextDeps)) callbacks[index] = { callback, deps: nextDeps }; return callbacks[index].callback; },
    useRef(value) { return refs[refCursor++] ??= { current: value }; },
    useEffect(callback, nextDeps) { const index = effectCursor++; if (!deps[index] || !equal(deps[index], nextDeps)) effects.push(callback); deps[index] = nextDeps || []; },
  };
  const imports = {
    react: hooks, "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) },
    "next/image": { __esModule: true, default: props => jsx.jsx("img", props) },
    "next/navigation": { useRouter: () => ({ refresh() { refreshes.push("router"); } }) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: props => jsx.jsx("svg", { "data-icon": props.name }) },
    "@/app/dashboard/_components/logout-button": { __esModule: true, default: () => jsx.jsx("button", { children: "Cerrar sesión" }) },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => jsx.jsx("aside", {}), DashboardTopbar: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: props => jsx.jsx("div", { "data-profile": true, children: `${props.name} ${props.role} Cerrar sesión` }) },
    "@/lib/use-live-refresh": { useLiveRefresh: (callback, options) => { live[0] = callback; live[1] = options; }, triggerLiveRefresh: event => refreshes.push(event) },
    xlsx: { utils: { json_to_sheet: data => ({ data }), aoa_to_sheet: data => ({ data }), book_new: () => ({ sheets: [] }), book_append_sheet: (book, sheet, name) => book.sheets.push({ sheet, name }) }, writeFile: (book, name) => exports.push({ book, name }), writeFileXLSX: (book, name) => exports.push({ book, name }) },
  };
  const Workspace = load(PAGE, imports, {
    __capture: value => { captured = value; },
    window: { confirm(message) { confirmations.push(message); return confirm; }, setTimeout: callback => callback() },
    document: { activeElement: null, addEventListener() {}, removeEventListener() {} },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const custom = fetchImpl ? await fetchImpl(url, options) : null;
      if (custom) return custom;
      if (url === "/api/session") return response(user);
      if (url === "/api/sedes") return response(sedes);
      const sedeId = new URL(url, "https://synthetic.test").searchParams.get("sedeId");
      const authorized = ["ADMIN", "AUDITOR"].includes(user.rolNombre) ? records : records.filter(row => row.sedeId === user.sedeId);
      const selected = sedeId ? authorized.filter(row => row.sedeId === Number(sedeId)) : authorized;
      if ((options.method ?? "GET") === "GET") return response({ ok: true, items: selected, total: selected.reduce((sum, row) => sum + row.valor, 0) });
      return response({ ok: true, item: { id: 95027 }, mensaje: "Operación sintética completada" });
    },
  }, text => `${text.slice(0, lastReturn.getStart(ast))}__capture({${captureNames.join(",")}});\n${text.slice(lastReturn.getStart(ast))}`).default;
  const instance = {
    state, calls, confirmations, exports, refreshes,
    render() { cursor = effectCursor = refCursor = callbackCursor = 0; return { tree: Workspace(), view: captured }; },
    get view() { return captured; },
    get liveOptions() { return live[1]; },
    async settle() {
      let previous = -1;
      for (let count = 0; count < 32; count++) {
        this.render(); const queued = effects.splice(0); for (const callback of queued) callback();
        await new Promise(resolve => setImmediate(resolve));
        if (!effects.length && revision === previous) break;
        previous = revision;
      }
      return this.render().tree;
    },
    async refresh() { await live[0]?.(); return this.settle(); },
  };
  instance.render(); return instance;
}

test("resumen preserva suma, cantidad y promedio de toda la cobertura con decimales limitados sólo al mostrar", () => {
  const view = load("lib/cartera-history-view.ts");
  const complete = [...rows, { ...rows[0], id: 96001, valor: -1234.56 }];
  const summary = view.carteraHistorySummary(complete), total = complete.reduce((sum, row) => sum + row.valor, 0);
  assert.deepEqual(summary, { total, count: 28, average: total / 28 });
  const average = view.formatCarteraMoney(summary.average);
  assert.match(average, /^\$ [\d.]+(?:,\d{1,2})?$/);
  assert.equal(view.formatCarteraMoney(1500000.2599), "$ 1.500.000,26");
  assert.equal(view.formatCarteraMoney(-1234.56), "-$ 1.234,56");
  assert.deepEqual(view.carteraHistorySummary([]), { total: 0, count: 0, average: 0 });
});

test("rango inválido devuelve error breve y no produce resultados ni una exportación falsa", () => {
  const view = load("lib/cartera-history-view.ts");
  for (const [from, to] of [["2026-10-15", "2026-10-14"], ["2026-02-30", ""], ["", "2026-13-01"]]) {
    assert.ok(view.carteraDateRangeError(from, to));
    assert.deepEqual(view.filterCarteraHistory(rows, { search: "", sedeId: "", from, to }), []);
  }
  assert.equal(view.carteraDateRangeError("2026-10-14", "2026-10-14"), "");
});

test("paginación limita tamaños arbitrarios a diez, ajusta páginas vacías y conserva el contador real", () => {
  const view = load("lib/cartera-history-view.ts");
  const page = view.paginateCarteraHistory(rows, 99, 100);
  assert.deepEqual({ page: page.page, pages: page.pages, size: page.size, total: page.total, from: page.from, to: page.to }, { page: 3, pages: 3, size: 10, total: 27, from: 21, to: 27 });
  assert.deepEqual(page.items, rows.slice(20));
  assert.deepEqual(view.paginateCarteraHistory([], 99, 10), { page: 1, pages: 1, size: 10, total: 0, from: 0, to: 0, items: [] });
  assert.deepEqual(view.carteraHistoryPageNumbers(25, 51), [1, "…", 24, 25, 26, "…", 51]);
});

test("historial mantiene navegación superior autorizada, Caja activa, perfil y destinos actuales", async () => {
  const instance = probe(); const tree = await instance.settle();
  const navigation = control(tree, node => node.type === "nav" && node.props["aria-label"] === "Navegación principal");
  const links = elements(navigation).filter(node => node?.type === "a");
  for (const href of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/sedes"]) assert.ok(links.some(node => node.props.href === href), href);
  assert.equal(control(navigation, node => node.type === "a" && node.props["aria-current"] === "page").props.href, "/caja");
  assert.ok(!elements(tree).some(node => node?.type === "aside"));
  for (const label of ["Historial de gastos de cartera", "Total cartera", "Movimientos", "Promedio por registro", "Gastos de cartera", "Cerrar sesión", "ADMIN"]) assert.ok(textOf(tree).includes(label), label);
  assert.ok(elements(tree).some(node => node?.type === "a" && node.props.href === "/dashboard/financiero" && textOf(node).includes("Volver al panel")));
  assert.ok(elements(tree).some(node => node?.type === "a" && node.props.href === "/dashboard/financiero/cartera" && textOf(node).includes("Registrar gasto")));
});

test("paginación usa todos los resultados reales y nunca muestra más de diez registros", async () => {
  const instance = probe(); let tree = await instance.settle();
  assert.equal(dataRows(tree).length, 10);
  assert.ok(textOf(tree).includes("27"));
  button(tree, "2").props.onClick(); tree = await instance.settle();
  assert.equal(dataRows(tree).length, 10);
  assert.equal(rowId(dataRows(tree)[0]), rows[10].id);
  button(tree, "Siguiente").props.onClick(); tree = await instance.settle();
  assert.equal(dataRows(tree).length, 7);
  assert.equal(rowId(dataRows(tree).at(-1)), rows[26].id);
  assert.equal(button(tree, "Siguiente").props.disabled, true);
  button(tree, "Anterior").props.onClick(); tree = await instance.settle();
  assert.equal(dataRows(tree).length, 10);
});

test("selector de filas conserva el máximo de diez y reinicia la página al cambiar tamaño", async () => {
  const instance = probe(); let tree = await instance.settle();
  const options = elements(byId(tree, "cartera-filas")).filter(node => node?.type === "option").map(node => Number(node.props.value));
  assert.ok(options.every(value => value > 0 && value <= 10));
  button(tree, "3").props.onClick(); tree = await instance.settle();
  byId(tree, "cartera-filas").props.onChange({ target: { value: "5" } }); tree = await instance.settle();
  assert.equal(dataRows(tree).length, 5);
  assert.equal(rowId(dataRows(tree)[0]), rows[0].id);
  assert.equal(button(tree, "Anterior").props.disabled, true);
});

test("búsqueda encuentra observación, ID y valor fuera de la página visible y vuelve al inicio", async () => {
  for (const query of ["revision historica credito", String(rows[26].id), "1.500.000,25", "1500000.25"]) {
    const instance = probe(); let tree = await instance.settle();
    button(tree, "2").props.onClick(); tree = await instance.settle();
    searchField(tree).props.onChange({ target: { value: query } }); tree = await instance.settle();
    assert.equal(dataRows(tree).length, 1, query);
    assert.equal(rowId(dataRows(tree)[0]), rows[26].id, query);
    assert.equal(button(tree, "Anterior").props.disabled, true);
  }
});

test("tabla conserva columnas y muestra fecha y hora de Colombia en dos líneas", async () => {
  const record = { ...rows[0], createdAt: "2026-10-14T04:30:12.000Z", valor: 1500000.25 };
  const instance = probe({ records: [record] }); const tree = await instance.settle();
  const headers = elements(tree).filter(node => node?.type === "th").map(textOf);
  assert.deepEqual(headers, ["ID", "Fecha / Hora", "Valor", "Observación", "Sede", "Acciones"]);
  const row = dataRows(tree)[0], text = textOf(row);
  assert.ok(text.includes("13/10/2026")); assert.ok(/11:30.*p.*m/i.test(text));
  assert.match(text, /\$\s*1\.500\.000,25/);
  assert.ok(elements(row).some(node => node?.props?.["aria-label"]?.includes("Editar")));
  assert.ok(elements(row).some(node => node?.props?.["aria-label"]?.includes("Eliminar")));
});

test("exportación contiene todos los resultados filtrados y no sólo los diez visibles", async () => {
  const instance = probe(); let tree = await instance.settle();
  await button(tree, "Exportar Excel").props.onClick(); await instance.settle();
  assert.equal(instance.exports.length, 1);
  const firstSheet = instance.exports[0].book.sheets[0].sheet;
  assert.equal(firstSheet.data.filter(row => Array.isArray(row) ? String(row[0]).includes("950") : JSON.stringify(row).includes("950")).length, 27);
  searchField(tree).props.onChange({ target: { value: "recaudo" } }); tree = await instance.settle();
  assert.equal(dataRows(tree).length, 10);
  await button(tree, "Exportar Excel").props.onClick(); await instance.settle();
  const filtered = instance.exports[1].book.sheets[0].sheet.data;
  assert.equal(filtered.filter(row => JSON.stringify(row).includes("Gasto sintético")).length, 13);
  assert.ok(filtered.every(row => !JSON.stringify(row).includes(" corte")));
});

test("ADMIN edita y elimina, AUDITOR sólo edita y usuario de sede sólo consulta su cobertura", async () => {
  for (const user of [admin, auditor, supervisor]) {
    const instance = probe({ user }); const tree = await instance.settle();
    const editActions = elements(tree).filter(node => node?.type === "button" && /^Editar gasto/i.test(node.props["aria-label"] ?? ""));
    const deleteActions = elements(tree).filter(node => node?.type === "button" && /^Eliminar gasto/i.test(node.props["aria-label"] ?? ""));
    assert.equal(editActions.length, user.rolNombre === "SUPERVISOR" ? 0 : 10);
    assert.equal(deleteActions.length, user.rolNombre === "ADMIN" ? 10 : 0);
    if (user.rolNombre === "SUPERVISOR") {
      assert.ok(!instance.calls.some(call => call.url === "/api/sedes"));
      assert.ok(dataRows(tree).every(row => textOf(row).includes("SEDE 3")));
      assert.ok(!elements(tree).some(node => node?.type === "a" && node.props.href === "/dashboard/sedes"));
      assert.ok(elements(tree).some(node => node?.type === "a" && node.props.href === "/dashboard/analitico"));
    }
  }
});

test("carga, ausencia de resultados y fallo de consulta tienen estados diferenciados", async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const loading = probe({ fetchImpl: url => url.startsWith("/api/financiero/cartera") ? waiting : null });
  assert.match(textOf(loading.render().tree), /Cargando/);
  release(response({ ok: true, items: [] })); let tree = await loading.settle();
  assert.match(textOf(tree), /No hay gastos/);
  const failed = probe({ fetchImpl: url => url.startsWith("/api/financiero/cartera") ? response({ error: "Historial no disponible QA" }, 503) : null });
  tree = await failed.settle(); assert.ok(textOf(tree).includes("Historial no disponible QA"));
  assert.ok(!textOf(tree).includes("actualizado correctamente"));
});

test("edición fallida conserva campos y no anuncia éxito, sin permitir doble envío", async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const instance = probe({ fetchImpl: (_url, options) => options.method === "PATCH" ? waiting : null });
  let tree = await instance.settle(); rowAction(tree, "Editar", rows[0].id).props.onClick(); tree = instance.render().tree;
  field(tree, "Valor").props.onChange({ target: { value: "1234567.89" } });
  field(tree, "Observación").props.onChange({ target: { value: "Conservar borrador QA" } });
  tree = instance.render().tree;
  const save = instance.view.guardarEdicion;
  const first = save(); await save();
  assert.equal(instance.calls.filter(call => call.options.method === "PATCH").length, 1);
  tree = instance.render().tree; assert.match(textOf(tree), /Guardando/);
  release(response({ error: "Cambio rechazado QA" }, 409)); await first; tree = await instance.settle();
  assert.equal(field(tree, "Observación").props.value, "Conservar borrador QA");
  assert.equal(field(tree, "Valor").props.value, "1234567.89");
  assert.ok(textOf(tree).includes("Cambio rechazado QA"));
  assert.ok(!textOf(tree).includes("actualizado correctamente"));
});

test("edición rechaza importe cero o inválido y sede no autorizada antes de enviar", async () => {
  for (const initial of [{ valorEditando: "0" }, { valorEditando: "Infinity" }, { valorEditando: "no numérico" }, { sedeEditando: "777" }]) {
    const instance = probe(); const tree = await instance.settle();
    rowAction(tree, "Editar", rows[0].id).props.onClick();
    Object.assign(instance.state, initial); instance.render(); await instance.view.guardarEdicion();
    assert.equal(instance.calls.filter(call => call.options.method === "PATCH").length, 0);
    assert.equal(instance.state.editandoId, rows[0].id);
  }
});

test("eliminación exige confirmación y fallo mantiene el registro y sus indicadores", async () => {
  const cancelled = probe({ confirm: false }); let tree = await cancelled.settle();
  await cancelled.view.eliminarGasto(rows[0].id);
  assert.equal(cancelled.confirmations.length, 1); assert.equal(cancelled.calls.filter(call => call.options.method === "DELETE").length, 0);
  const failed = probe({ fetchImpl: (_url, options) => options.method === "DELETE" ? response({ error: "Eliminar rechazado QA" }, 409) : null });
  tree = await failed.settle(); const before = failed.view.total;
  await failed.view.eliminarGasto(rows[0].id); tree = await failed.settle();
  assert.equal(failed.confirmations.length, 1); assert.ok(textOf(tree).includes("Eliminar rechazado QA"));
  assert.equal(rowId(dataRows(tree)[0]), rows[0].id); assert.equal(failed.view.total, before);
});

test("sede, búsqueda y rango de fechas se combinan antes de paginar, conservando indicadores de cobertura", async () => {
  const instance = probe(); let tree = await instance.settle();
  button(tree, "2").props.onClick(); tree = await instance.settle();
  const sede = control(tree, node => node.type === "select" && elements(node).some(child => child?.type === "option" && textOf(child) === "Todas las sedes"));
  sede.props.onChange({ target: { value: "3" } }); tree = await instance.settle();
  const scoped = rows.filter(row => row.sedeId === 3), sum = scoped.reduce((total, row) => total + row.valor, 0);
  assert.equal(instance.view.total, sum);
  assert.equal(button(tree, "Anterior").props.disabled, true);
  searchField(tree).props.onChange({ target: { value: "recaudo" } }); tree = await instance.settle();
  const dates = elements(tree).filter(node => node?.type === "input" && node.props.type === "date");
  assert.equal(dates.length, 2);
  dates[0].props.onChange({ target: { value: "2026-10-14" } });
  dates[1].props.onChange({ target: { value: "2026-10-14" } }); tree = await instance.settle();
  assert.equal(dataRows(tree).length, 5);
  assert.ok(dataRows(tree).every(row => textOf(row).includes("SEDE 3") && textOf(row).includes("14/10/2026")));
  assert.equal(instance.view.total, sum);
  assert.equal(button(tree, "Anterior").props.disabled, true);
  await button(tree, "Exportar Excel").props.onClick(); await instance.settle();
  assert.equal(instance.exports.at(-1).book.sheets[0].sheet.data.filter(row => JSON.stringify(row).includes("Gasto sintético")).length, 5);
});

test("fechas de filtro incluyen el día colombiano completo y excluyen el día siguiente", async () => {
  const boundaryRows = [
    { ...rows[0], id: 96001, createdAt: "2026-10-14T04:59:59.999Z" },
    { ...rows[0], id: 96002, createdAt: "2026-10-14T05:00:00.000Z" },
    { ...rows[0], id: 96003, createdAt: "2026-10-15T04:59:59.999Z" },
    { ...rows[0], id: 96004, createdAt: "2026-10-15T05:00:00.000Z" },
  ];
  const instance = probe({ records: boundaryRows }); let tree = await instance.settle();
  const dates = elements(tree).filter(node => node?.type === "input" && node.props.type === "date");
  dates[0].props.onChange({ target: { value: "2026-10-14" } });
  dates[1].props.onChange({ target: { value: "2026-10-14" } }); tree = await instance.settle();
  assert.deepEqual(dataRows(tree).map(rowId).sort(), [96002, 96003]);
});

test("editar y eliminar con éxito actualizan listado, total y promedio desde la respuesta real", async () => {
  let records = structuredClone(rows);
  const instance = probe({ fetchImpl: (url, options) => {
    if (!url.startsWith("/api/financiero/cartera")) return null;
    if ((options.method ?? "GET") === "GET") return response({ ok: true, items: records });
    const payload = JSON.parse(options.body);
    if (options.method === "PATCH") {
      const item = records.find(row => row.id === payload.id);
      Object.assign(item, payload, { sede: { nombre: sedes.find(sede => sede.id === payload.sedeId).nombre } });
      return response({ ok: true, item });
    }
    records = records.filter(row => row.id !== payload.id);
    return response({ ok: true, deletedId: payload.id });
  } });
  let tree = await instance.settle(); rowAction(tree, "Editar", rows[0].id).props.onClick(); tree = instance.render().tree;
  field(tree, "Valor").props.onChange({ target: { value: "1500000.25" } });
  field(tree, "Observación").props.onChange({ target: { value: "Gasto editado QA" } }); instance.render();
  await instance.view.guardarEdicion(); tree = await instance.settle();
  assert.ok(textOf(dataRows(tree)[0]).includes("Gasto editado QA"));
  assert.equal(instance.view.total, records.reduce((sum, row) => sum + row.valor, 0));
  assert.ok(!elements(tree).some(node => node?.props?.role === "dialog"));
  await instance.view.eliminarGasto(rows[0].id); tree = await instance.settle();
  assert.ok(!textOf(dataRows(tree)).includes("Gasto editado QA"));
  assert.equal(instance.view.total, records.reduce((sum, row) => sum + row.valor, 0));
  assert.equal(instance.view.promedio, instance.view.total / 26);
});

test("controles y handlers de sede y auditor no permiten iniciar operaciones no autorizadas", async () => {
  const scoped = probe({ user: supervisor }); await scoped.settle();
  scoped.view.abrirEdicion(rows[1]); await scoped.view.guardarEdicion(); await scoped.view.eliminarGasto(rows[1].id);
  assert.equal(scoped.calls.filter(call => ["PATCH", "DELETE"].includes(call.options.method)).length, 0);
  const audited = probe({ user: auditor }); await audited.settle(); await audited.view.eliminarGasto(rows[0].id);
  assert.equal(audited.calls.filter(call => call.options.method === "DELETE").length, 0);
});

test("doble clic en eliminar sólo envía una solicitud y mantiene acciones bloqueadas durante el proceso", async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const instance = probe({ fetchImpl: (_url, options) => options.method === "DELETE" ? waiting : null });
  await instance.settle(); const remove = instance.view.eliminarGasto;
  const first = remove(rows[0].id); await remove(rows[0].id);
  assert.equal(instance.calls.filter(call => call.options.method === "DELETE").length, 1);
  const actions = elements(instance.render().tree).filter(node => node?.type === "button" && /^(Editar|Eliminar) gasto/.test(node.props["aria-label"] ?? ""));
  assert.ok(actions.every(node => node.props.disabled));
  release(response({ ok: true })); await first; await instance.settle();
});

test("actualización en vivo conserva los filtros y el borrador de una edición abierta", async () => {
  const instance = probe(); let tree = await instance.settle();
  searchField(tree).props.onChange({ target: { value: "corte" } }); tree = await instance.settle();
  rowAction(tree, "Editar", rows[0].id).props.onClick(); tree = instance.render().tree;
  field(tree, "Observación").props.onChange({ target: { value: "Borrador no guardado QA" } });
  tree = await instance.refresh();
  assert.equal(searchField(tree).props.value, "corte");
  assert.equal(field(tree, "Observación").props.value, "Borrador no guardado QA");
  assert.equal(instance.calls.filter(call => ["PATCH", "DELETE"].includes(call.options.method)).length, 0);
});

test("consulta anterior lenta no sustituye los registros de la cobertura más reciente", async () => {
  let releaseFirst, releaseSecond;
  const first = new Promise(resolve => { releaseFirst = resolve; });
  const second = new Promise(resolve => { releaseSecond = resolve; });
  const instance = probe({ fetchImpl: url => url.endsWith("?sedeId=1") ? first : url.endsWith("?sedeId=3") ? second : null });
  await instance.settle();
  const queryFirst = instance.view.cargar("1", true), querySecond = instance.view.cargar("3", true);
  const latest = rows.filter(row => row.sedeId === 3);
  releaseSecond(response({ ok: true, items: latest })); await querySecond; instance.render();
  assert.deepEqual(instance.state.items, latest);
  releaseFirst(response({ ok: true, items: rows.filter(row => row.sedeId === 1) })); await queryFirst; instance.render();
  assert.deepEqual(instance.state.items, latest); assert.equal(instance.state.cargando, false);
});

test("respuesta incompleta de edición conserva el borrador y no confirma éxito", async () => {
  const instance = probe({ fetchImpl: (_url, options) => options.method === "PATCH" ? response({ ok: true }) : null });
  let tree = await instance.settle(); rowAction(tree, "Editar", rows[0].id).props.onClick(); tree = instance.render().tree;
  field(tree, "Observación").props.onChange({ target: { value: "Conservar ante respuesta incompleta QA" } }); instance.render();
  await instance.view.guardarEdicion(); tree = await instance.settle();
  assert.equal(field(tree, "Observación").props.value, "Conservar ante respuesta incompleta QA");
  assert.ok(textOf(tree).includes("No se pudo confirmar la actualización"));
  assert.ok(!textOf(tree).includes("actualizado correctamente"));
  assert.deepEqual(instance.refreshes, []);
});

test("doble clic en exportar produce un solo archivo de todos los resultados", async () => {
  const instance = probe(); const tree = await instance.settle();
  const click = button(tree, "Exportar Excel").props.onClick; click(); click(); await instance.settle();
  assert.equal(instance.exports.length, 1);
  assert.equal(instance.exports[0].book.sheets[0].sheet.data.length, 27);
  assert.equal(instance.calls.filter(call => ["PATCH", "DELETE", "POST"].includes(call.options.method)).length, 0);
});

test("cambio de sesión ADMIN a sede oculta indicadores anteriores hasta recibir la nueva cobertura autorizada", async () => {
  let session = admin, phase = "ready", releaseOld, releaseNew;
  const oldPending = new Promise(resolve => { releaseOld = resolve; });
  const newPending = new Promise(resolve => { releaseNew = resolve; });
  const instance = probe({ fetchImpl: url => {
    if (url === "/api/session") return response(session);
    if (url.startsWith("/api/financiero/cartera")) return phase === "old" ? oldPending : phase === "new" ? newPending : null;
    return null;
  } });
  let tree = await instance.settle(); const previousTotal = instance.view.total;
  button(tree, "2").props.onClick(); tree = await instance.settle();
  rowAction(tree, "Editar", rows[10].id).props.onClick(); tree = instance.render().tree;
  assert.ok(elements(tree).some(node => node?.props?.role === "dialog"));
  phase = "old"; const oldLoad = instance.view.cargar("", false);
  session = supervisor; phase = "new"; const refresh = instance.refresh();
  await new Promise(resolve => setImmediate(resolve)); tree = instance.render().tree;
  assert.equal(instance.state.user.rolNombre, "SUPERVISOR"); assert.equal(instance.state.cargando, true);
  assert.deepEqual(instance.state.items, []); assert.equal(instance.view.total, 0);
  assert.equal(instance.state.pagina, 1); assert.equal(instance.state.sedeFiltro, "");
  assert.ok(!elements(tree).some(node => node?.props?.role === "dialog"));
  const metrics = control(tree, node => node.type === "section" && /Indicadores/.test(node.props["aria-label"] ?? ""));
  assert.ok(!textOf(metrics).includes(previousTotal.toLocaleString("es-CO")));
  assert.ok(textOf(metrics).includes("—"));
  releaseOld(response({ ok: true, items: rows })); await oldLoad; instance.render();
  assert.deepEqual(instance.state.items, []);
  const authorized = rows.filter(row => row.sedeId === supervisor.sedeId);
  releaseNew(response({ ok: true, items: authorized })); await refresh; tree = instance.render().tree;
  assert.equal(instance.state.cargando, false);
  assert.deepEqual(instance.state.items, authorized);
  assert.equal(instance.view.total, authorized.reduce((sum, row) => sum + row.valor, 0));
  assert.ok(dataRows(tree).every(row => textOf(row).includes("SEDE 3")));
  assert.ok(!elements(tree).some(node => node?.type === "button" && /^(Editar|Eliminar) gasto/.test(node.props["aria-label"] ?? "")));
});

test("fallo transitorio de sesión en actualización conserva borrador y filtros y permite recuperar el historial", async () => {
  let failSession = false;
  const instance = probe({ fetchImpl: url => url === "/api/session" && failSession ? response({ error: "Sesión temporalmente no disponible QA" }, 503) : null });
  let tree = await instance.settle();
  searchField(tree).props.onChange({ target: { value: "corte" } }); tree = await instance.settle();
  button(tree, "2").props.onClick(); tree = await instance.settle();
  rowAction(tree, "Editar", rows[20].id).props.onClick(); tree = instance.render().tree;
  field(tree, "Observación").props.onChange({ target: { value: "Borrador que debe sobrevivir a una falla de sesión QA" } }); instance.render();
  failSession = true; tree = await instance.refresh();
  assert.equal(instance.state.initError, "");
  assert.equal(instance.state.errorCarga, "Sesión temporalmente no disponible QA");
  assert.ok(textOf(tree).includes("Sesión temporalmente no disponible QA"));
  assert.equal(instance.liveOptions.enabled, true);
  assert.equal(searchField(tree).props.value, "corte"); assert.equal(instance.state.pagina, 2);
  assert.equal(field(tree, "Observación").props.value, "Borrador que debe sobrevivir a una falla de sesión QA");
  failSession = false; tree = await instance.refresh();
  assert.equal(instance.state.errorCarga, ""); assert.equal(instance.state.initError, "");
  assert.equal(instance.liveOptions.enabled, true);
  assert.equal(searchField(tree).props.value, "corte"); assert.equal(instance.state.pagina, 2);
  assert.equal(field(tree, "Observación").props.value, "Borrador que debe sobrevivir a una falla de sesión QA");
  assert.equal(dataRows(tree).length, 3);
  assert.equal(instance.calls.filter(call => ["PATCH", "DELETE", "POST"].includes(call.options.method)).length, 0);
});
