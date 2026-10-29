import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const jsx = createRequire(import.meta.url)("react/jsx-runtime");
const pageSource = readFileSync(new URL("../app/ventas/equipo-comercial/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
const stateNames = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
const capturePoint = component.body.statements.find(node => ts.isIfStatement(node) || ts.isReturnStatement(node));
const captures = declarations.filter(node => ts.isIdentifier(node.name) && node.getStart(ast) < capturePoint.getStart(ast)).map(node => node.name.getText(ast));
const instrumented = pageSource.slice(0, capturePoint.getStart(ast)) + `__capture({${captures.join(",")}});\n` + pageSource.slice(capturePoint.getStart(ast));
const compiled = ts.transpileModule(instrumented, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

function resolve(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(textOf).join(" "); return typeof node === "object" ? textOf(node.props?.children) : String(node); }
function button(tree, label) { const found = elements(tree).find(node => node.type === "button" && (node.props["aria-label"] === label || textOf(node).trim() === label)); assert.ok(found, `Falta botón ${label}`); return found; }
function dialog(tree) { return elements(tree).find(node => node.type === "dialog"); }
function rows(tree) { return elements(tree).filter(node => node.type === "li"); }
function input(tree, label) { const found = elements(tree).find(node => node.type === "input" && node.props["aria-label"] === label); assert.ok(found, `Falta campo ${label}`); return found; }
const response = (body, status = 200) => Response.json(body, { status });
const admin = { id: 91, nombre: "Administrador QA", usuario: "adminqa", rolNombre: "ADMIN", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL" };
const catalogo = {
  jaladores: [{ id: 1, nombre: "Sede Águila QA" }, { id: 2, nombre: "Equipo Norte QA" }],
  cerradores: [{ id: 3, nombre: "Cerradora Águila QA" }, { id: 4, nombre: "Cerrador Sur QA" }],
  financieras: [{ id: 5, nombre: "Financiera Águila QA", aplicaIntermediacion: true, porcentajeIntermediacion: 8.5 }, { id: 6, nombre: "Financiera Libre QA", aplicaIntermediacion: false, porcentajeIntermediacion: 0 }],
};
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function probe({ state: overrides = {}, fetchImpl = async () => response({ ok: true, catalogo }) } = {}) {
  const state = { user: admin, catalogo: structuredClone(catalogo), cargando: false, ...overrides };
  const refs = []; const calls = []; let cursor = 0; let refCursor = 0; let captured;
  const imports = {
    react: {
      useState(initial) { const key = stateNames[cursor++]; assert.ok(key); if (!(key in state)) state[key] = typeof initial === "function" ? initial() : initial; return [state[key], next => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; },
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; }, useEffect() {}, useMemo(fn) { return fn(); }, useCallback(fn) { return fn; }, useDeferredValue(value) { return value; },
    },
    "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: props => jsx.jsx("a", { ...props }) },
    "next/image": { __esModule: true, default: props => jsx.jsx("img", { ...props }) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: props => jsx.jsx("profile", { children: `${props.name} ${props.role}` }) },
    "./equipo-comercial.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fetch", "__capture", compiled)(name => { assert.ok(name in imports, `Import inesperado: ${name}`); return imports[name]; }, loaded, loaded.exports, async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    return fetchImpl(url, options);
  }, value => { captured = value; });
  const nativeDialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const ui = { state, calls, nativeDialog, render() {
    cursor = 0; refCursor = 0;
    const tree = resolve(loaded.exports.default());
    for (const node of elements(tree)) if (node.props.ref && !node.props.ref.current) node.props.ref.current = node.type === "dialog" ? nativeDialog : { focus() {} };
    return tree;
  }, get view() { return captured; } };
  ui.render(); return ui;
}

test("catálogos reales: ADMIN y AUDITOR conservan acceso y alta, solo ADMIN ve eliminar", () => {
  for (const rolNombre of ["ADMIN", "AUDITOR"]) {
    const ui = probe({ state: { user: { ...admin, rolNombre } } }); const tree = ui.render();
    assert.match(textOf(tree), /Equipo comercial/); assert.match(textOf(tree), /Registros del catálogo/);
    assert.equal(rows(tree).length, 6); assert.ok(button(tree, "Agregar registro"));
    const navigation = elements(tree).find(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal");
    const links = elements(navigation).filter(node => node.type === "a");
    assert.equal(links.find(node => node.props.href === "/ventas").props["aria-current"], "page");
    assert.ok(links.some(node => node.props.href === "/cierre"));
    assert.equal(elements(tree).filter(node => node.type === "button" && String(node.props["aria-label"] || "").startsWith("Eliminar ")).length, rolNombre === "ADMIN" ? 6 : 0);
  }
  for (const user of [null, { ...admin, rolNombre: "BODEGA" }, { ...admin, rolNombre: "USUARIO" }]) {
    const ui = probe({ state: { user } }); assert.match(textOf(ui.render()), /Acceso restringido/);
    assert.equal(rows(ui.render()).length, 0); assert.equal(elements(ui.render()).some(node => node.type === "form"), false);
  }
});

test("carga, error y vacío se distinguen; el error conserva el catálogo y permite reintentar", async () => {
  assert.match(textOf(probe({ state: { cargando: true } }).render()), /Cargando equipo comercial/);
  const empty = probe({ state: { catalogo: { jaladores: [], cerradores: [], financieras: [] } } });
  assert.equal(elements(empty.render()).filter(node => node.type === "strong" && textOf(node) === "Sin registros").length, 3);
  assert.equal(rows(empty.render()).length, 0);
  const failed = probe({ fetchImpl: async url => url === "/api/session" ? response(admin) : response({ error: "Catálogo QA no disponible" }, 503) });
  await failed.view.cargarTodo(); const tree = failed.render();
  assert.equal(failed.state.cargando, false); assert.match(textOf(tree), /Catálogo QA no disponible/); assert.ok(button(tree, "Reintentar"));
  assert.deepEqual(failed.state.catalogo, catalogo); assert.equal(rows(tree).length, 0);
  assert.deepEqual(failed.calls.map(call => call.url).sort(), ["/api/session", "/api/ventas/catalogo-personal"]);
});

test("carga valida sesión y estructura antes de anunciar datos; una consulta anterior no reemplaza la más reciente", async () => {
  for (const body of [{ jaladores: [] }, { ...catalogo, financieras: [{ id: 0, nombre: "Inválida" }] }, { ...catalogo, cerradores: "error" }]) {
    const ui = probe({ fetchImpl: async url => response(url === "/api/session" ? admin : body) });
    await ui.view.cargarTodo(); ui.render(); assert.ok(ui.state.loadError); assert.deepEqual(ui.state.catalogo, catalogo);
  }
  const unauthenticated = probe({ fetchImpl: async url => url === "/api/session" ? response({ error: "No autenticado" }, 401) : response(catalogo) });
  await unauthenticated.view.cargarTodo(); assert.match(unauthenticated.state.loadError, /sesión/);
  const a = deferred(); const b = deferred(); let calls = 0;
  const ui = probe({ fetchImpl: async url => url === "/api/session" ? response(admin) : (++calls === 1 ? a.promise : b.promise) });
  const first = ui.view.cargarTodo(); const second = ui.view.cargarTodo();
  const newest = { ...catalogo, jaladores: [{ id: 21, nombre: "Respuesta más reciente QA" }] };
  b.resolve(response(newest)); await second; a.resolve(response(catalogo)); await first; ui.render();
  assert.deepEqual(ui.state.catalogo, newest); assert.equal(ui.state.cargando, false); assert.equal(ui.state.loadError, "");
});

test("búsqueda combina las tres listas, ignora tildes y no altera indicadores del catálogo completo", () => {
  const ui = probe(); const metrics = textOf(elements(ui.render()).find(node => node.type === "section" && node.props["aria-label"] === "Resumen del catálogo"));
  input(ui.render(), "Buscar en los catálogos").props.onChange({ target: { value: " AGUILA " } }); const tree = ui.render();
  assert.equal(rows(tree).length, 3); assert.ok(rows(tree).every(node => /Águila/.test(textOf(node))));
  assert.equal(textOf(elements(tree).find(node => node.type === "section" && node.props["aria-label"] === "Resumen del catálogo")), metrics);
  button(tree, "Limpiar búsqueda").props.onClick(); assert.equal(rows(ui.render()).length, 6);
});

test("filtra antes de paginar, muestra diez filas por lista y cada paginación conserva las otras", () => {
  const many = { ...catalogo, jaladores: Array.from({ length: 25 }, (_, index) => ({ id: index + 20, nombre: index === 24 ? "Encontrar fuera de la primera página QA" : `Jalador ${index + 1} QA` })) };
  const ui = probe({ state: { catalogo: many } });
  assert.equal(rows(ui.render()).length, 14);
  button(ui.render(), "Siguiente en Jaladores").props.onClick(); let tree = ui.render();
  assert.equal(ui.state.pages.JALADOR, 2); assert.equal(ui.state.pages.CERRADOR, 1); assert.equal(ui.state.pages.FINANCIERA, 1);
  assert.match(textOf(tree), /11–20 de 25/);
  button(tree, "Página 3 de Jaladores").props.onClick(); tree = ui.render(); assert.equal(rows(tree).length, 9); assert.match(textOf(tree), /21–25 de 25/);
  input(tree, "Buscar en los catálogos").props.onChange({ target: { value: "Encontrar" } }); tree = ui.render();
  assert.deepEqual(ui.state.pages, { JALADOR: 1, CERRADOR: 1, FINANCIERA: 1 }); assert.equal(rows(tree).length, 1);
  assert.match(textOf(rows(tree)[0]), /fuera de la primera página/); assert.match(textOf(tree), /1–1 de 1/);
});

test("alta conserva los tres tipos y las reglas de intermediación; éxito llega solo con catálogo confirmado", async () => {
  for (const tipo of ["JALADOR", "CERRADOR", "FINANCIERA"]) {
    const key = { JALADOR: "jaladores", CERRADOR: "cerradores", FINANCIERA: "financieras" }[tipo];
    const updated = { ...catalogo, [key]: [...catalogo[key], { id: 7, nombre: "Nuevo QA" }] };
    const ui = probe({ state: { tipo, nombre: "  Nuevo QA  ", aplicaIntermediacion: true, porcentajeIntermediacion: "8,5" }, fetchImpl: async () => response({ ok: true, mensaje: "Guardado confirmado QA", catalogo: updated }) });
    await ui.view.agregarRegistro(); const tree = ui.render();
    assert.deepEqual(ui.calls, [{ url: "/api/ventas/catalogo-personal", method: "POST", body: { tipo, nombre: "Nuevo QA", aplicaIntermediacion: tipo === "FINANCIERA", porcentajeIntermediacion: tipo === "FINANCIERA" ? 8.5 : 0 } }]);
    assert.deepEqual(ui.state.catalogo, updated); assert.equal(ui.state.nombre, ""); assert.equal(ui.state.aplicaIntermediacion, false); assert.equal(ui.state.porcentajeIntermediacion, "");
    assert.match(textOf(tree), /Guardado confirmado QA/); assert.equal(ui.state.messageType, "success");
  }
});

test("alta rechaza campos inválidos y usuarios sin permiso sin enviar solicitudes", async () => {
  for (const state of [{ nombre: " " }, ...["0", "-1", "NaN", "Infinity"].map(porcentajeIntermediacion => ({ tipo: "FINANCIERA", nombre: "Financiera QA", aplicaIntermediacion: true, porcentajeIntermediacion }))]) {
    const ui = probe({ state }); await ui.view.agregarRegistro(); ui.render();
    assert.deepEqual(ui.calls, []); assert.equal(ui.state.messageType, "error"); assert.ok(ui.state.mensaje);
  }
  for (const user of [null, { ...admin, rolNombre: "USUARIO" }, { ...admin, rolNombre: "BODEGA" }]) {
    const ui = probe({ state: { user, nombre: "No autorizado QA" } }); await ui.view.agregarRegistro(); assert.deepEqual(ui.calls, []);
  }
});

test("alta bloquea doble clic y operaciones simultáneas; mantiene borrador y lista mientras espera", async () => {
  const pending = deferred(); const ui = probe({ state: { nombre: "Borrador QA" }, fetchImpl: () => pending.promise });
  const first = ui.view.agregarRegistro(); const second = ui.view.agregarRegistro(); await ui.view.cargarTodo();
  let tree = ui.render(); assert.equal(ui.calls.length, 1); assert.equal(ui.state.nombre, "Borrador QA"); assert.equal(ui.state.mensaje, ""); assert.deepEqual(ui.state.catalogo, catalogo);
  assert.equal(elements(tree).find(node => node.type === "fieldset").props.disabled, true); assert.ok(button(tree, "Guardando…"));
  assert.ok(elements(tree).filter(node => node.type === "button" && String(node.props["aria-label"] || "").startsWith("Eliminar ")).every(node => node.props.disabled));
  pending.resolve(response({ ok: true, catalogo })); await Promise.all([first, second]); tree = ui.render();
  assert.equal(ui.state.guardando, false); assert.equal(elements(tree).find(node => node.type === "fieldset").props.disabled, false);
});

test("fallos de alta conservan campos e intermediación, no confirman éxito y permiten reintentar", async () => {
  for (const fetchImpl of [async () => response({ error: "Duplicado QA" }, 400), async () => response({ error: "No autorizado QA" }, 403), async () => new Response("<html>Error</html>", { status: 502 }), async () => { throw Error("Sin conexión QA"); }, async () => response({ ok: true }), async () => response({ ok: false, catalogo }), async () => response({ ok: true, catalogo: { jaladores: [] } })]) {
    const ui = probe({ state: { tipo: "FINANCIERA", nombre: "Borrador financiero QA", aplicaIntermediacion: true, porcentajeIntermediacion: "3.25" }, fetchImpl });
    await ui.view.agregarRegistro(); ui.render();
    assert.equal(ui.state.nombre, "Borrador financiero QA"); assert.equal(ui.state.aplicaIntermediacion, true); assert.equal(ui.state.porcentajeIntermediacion, "3.25");
    assert.deepEqual(ui.state.catalogo, catalogo); assert.equal(ui.state.guardando, false); assert.equal(ui.state.messageType, "error"); assert.ok(ui.state.mensaje);
    await ui.view.agregarRegistro(); assert.equal(ui.calls.length, 2);
  }
});

test("eliminar abre confirmación por ID sin retirar datos, cancelar conserva el borrador", () => {
  const ui = probe({ state: { nombre: "Nuevo sin guardar QA" } });
  button(ui.render(), "Eliminar jalador Sede Águila QA").props.onClick(); let tree = ui.render();
  assert.deepEqual(ui.calls, []); assert.equal(ui.state.deleteTarget.id, 1); assert.equal(ui.state.deleteTarget.tipo, "JALADOR");
  assert.equal(dialog(tree).props.role, "alertdialog"); assert.match(textOf(dialog(tree)), /Sede Águila QA/); assert.match(textOf(dialog(tree)), /registros anteriores conservan su información/);
  button(dialog(tree), "Cancelar").props.onClick(); tree = ui.render();
  assert.equal(dialog(tree), undefined); assert.equal(ui.state.nombre, "Nuevo sin guardar QA"); assert.deepEqual(ui.state.catalogo, catalogo);
});

test("eliminar confirma solo el ID seleccionado, bloquea duplicados y actualiza después del servidor", async () => {
  const pending = deferred(); const ui = probe({ fetchImpl: () => pending.promise });
  button(ui.render(), "Eliminar cerrador Cerradora Águila QA").props.onClick(); ui.render();
  const first = ui.view.eliminarRegistro(3); const second = ui.view.eliminarRegistro(3); await ui.view.agregarRegistro();
  let tree = ui.render(); assert.deepEqual(ui.calls, [{ url: "/api/ventas/catalogo-personal?id=3", method: "DELETE", body: null }]);
  assert.equal(button(dialog(tree), "Eliminando…").props.disabled, true); assert.equal(button(dialog(tree), "Cancelar").props.disabled, true);
  button(dialog(tree), "Cancelar").props.onClick(); assert.equal(ui.state.deleteTarget.id, 3); assert.deepEqual(ui.state.catalogo, catalogo); assert.equal(ui.state.mensaje, "");
  const updated = { ...catalogo, cerradores: catalogo.cerradores.slice(1) };
  pending.resolve(response({ ok: true, mensaje: "Retiro confirmado QA", catalogo: updated })); await Promise.all([first, second]); tree = ui.render();
  assert.deepEqual(ui.state.catalogo, updated); assert.equal(dialog(tree), undefined); assert.equal(ui.state.eliminandoId, null); assert.match(textOf(tree), /Retiro confirmado QA/);
});

test("error de eliminación conserva destino y datos para reintentar; respuesta no íntegra nunca confirma", async () => {
  for (const fetchImpl of [async () => response({ error: "Error retirando QA" }, 500), async () => { throw Error("Respuesta perdida QA"); }, async () => new Response("Error", { status: 502 }), async () => response({ ok: true, catalogo }), async () => response({ ok: true }), async () => response({ ok: false, catalogo: { ...catalogo, jaladores: [] } })]) {
    const ui = probe({ state: { nombre: "Borrador preservado QA" }, fetchImpl });
    button(ui.render(), "Eliminar jalador Sede Águila QA").props.onClick(); ui.render(); await ui.view.eliminarRegistro(1); let tree = ui.render();
    assert.equal(ui.state.deleteTarget.id, 1); assert.ok(ui.state.deleteError); assert.equal(ui.state.mensaje, ""); assert.deepEqual(ui.state.catalogo, catalogo); assert.equal(ui.state.nombre, "Borrador preservado QA"); assert.equal(ui.state.eliminandoId, null);
    assert.match(textOf(dialog(tree)), new RegExp(ui.state.deleteError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await ui.view.eliminarRegistro(1); tree = ui.render(); assert.equal(ui.calls.length, 2); assert.ok(dialog(tree));
  }
});

test("eliminar vuelve a comprobar permiso y destino; no permite llamadas sin confirmación", async () => {
  const ui = probe(); await ui.view.eliminarRegistro(1); assert.deepEqual(ui.calls, []);
  button(ui.render(), "Eliminar jalador Sede Águila QA").props.onClick(); ui.render(); await ui.view.eliminarRegistro(2); assert.deepEqual(ui.calls, []);
  ui.state.user = { ...admin, rolNombre: "AUDITOR" }; ui.render(); await ui.view.eliminarRegistro(1); assert.deepEqual(ui.calls, []);
});

