import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const jsx = createRequire(import.meta.url)("react/jsx-runtime");
const source = readFileSync(new URL("../app/inventario/nuevo/distributor-selector.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("selector.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const states = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .flatMap(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
const finalReturn = component.body.statements.find(ts.isReturnStatement);
const instrumented = source.slice(0, finalReturn.getStart(ast)) + "__capture({add, remove, reload});\n" + source.slice(finalReturn.getStart(ast));
const compiled = ts.transpileModule(instrumented, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const items = [{ id: 1, nombre: "COMUNICARIBE" }, { id: 2, nombre: "Distribuidór Único QA" }];
const catalog = (list = items) => response({ ok: true, distribuidores: list });
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function resolve(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(textOf).join(" "); return typeof node === "object" ? textOf(node.props?.children) : String(node); }
function control(tree, id) { const node = elements(tree).find(item => item.props?.id === id); assert.ok(node, `Falta ${id}`); return node; }
function button(tree, label) { const node = elements(tree).find(item => item.type === "button" && (item.props["aria-label"] === label || textOf(item).trim() === label)); assert.ok(node, `Falta botón ${label}`); return node; }
function probe({ value = "", disabled = false, fetchImpl = async () => catalog() } = {}) {
  const state = {}; const refs = []; const effects = []; const calls = []; const changes = [];
  let cursor = 0; let refCursor = 0; let captured; let cleanup;
  const props = { value, disabled, onChange(next) { changes.push(next); props.value = next; } };
  const loaded = { exports: {} };
  const imports = {
    react: {
      useState(initial) { const key = states[cursor++]; assert.ok(key); if (!(key in state)) state[key] = initial; return [state[key], next => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; },
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
      useEffect(effect) { if (!effects.length) effects.push(effect); },
    },
    "react/jsx-runtime": jsx,
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "./distributor-selector.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  new Function("require", "module", "exports", "fetch", "__capture", compiled)(name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports, async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", options, body: options.body ? JSON.parse(options.body) : null });
    return fetchImpl(url, options);
  }, value => { captured = value; });
  const ui = {
    state, props, calls, changes,
    render() { cursor = 0; refCursor = 0; return resolve(loaded.exports.default(props)); },
    get view() { return captured; },
    async mount() { cleanup = effects[0](); await settle(); return this.render(); },
    unmount() { cleanup?.(); },
    open() { button(this.render(), "Gestionar").props.onClick(); return this.render(); },
  };
  ui.render(); return ui;
}

test("carga el catálogo autorizado sin cache, cerrado inicialmente, y selecciona el nombre real", async () => {
  const ui = probe(); let tree = ui.render();
  assert.equal(control(tree, "ingreso-distribuidor").props.disabled, true);
  assert.equal(elements(tree).some(node => node.props?.id === "distribuidores-panel"), false);
  tree = await ui.mount();
  assert.deepEqual(ui.calls.map(call => [call.url, call.method, call.options.cache]), [["/api/inventario-principal/distribuidores", "GET", "no-store"]]);
  assert.deepEqual(elements(control(tree, "ingreso-distribuidor")).filter(node => node.type === "option").map(textOf), ["Seleccionar distribuidor", ...items.map(item => item.nombre)]);
  control(tree, "ingreso-distribuidor").props.onChange({ target: { value: items[1].nombre } });
  assert.deepEqual(ui.changes, [items[1].nombre]);
});

test("agregar espera la confirmación del servidor, normaliza espacios y bloquea el doble clic", async () => {
  const pending = deferred();
  const ui = probe({ value: items[0].nombre, fetchImpl: async (_url, options) => options.method === "POST" ? pending.promise : catalog() });
  await ui.mount(); let tree = ui.open();
  control(tree, "nuevo-distribuidor").props.onChange({ target: { value: "  NUEVO   ALIADO QA  " } }); ui.render();
  const first = ui.view.add(); const second = ui.view.add(); await settle(); tree = ui.render();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.deepEqual(ui.calls.find(call => call.method === "POST").body, { nombre: "NUEVO ALIADO QA" });
  assert.equal(ui.state.items.length, 2); assert.equal(ui.state.name, "  NUEVO   ALIADO QA  "); assert.equal(ui.state.message, "");
  assert.deepEqual(ui.changes, []); assert.equal(ui.props.value, items[0].nombre);
  assert.equal(control(tree, "nuevo-distribuidor").props.disabled, true);
  pending.resolve(catalog([...items, { id: 3, nombre: "NUEVO ALIADO QA" }])); await Promise.all([first, second]); tree = ui.render();
  assert.equal(ui.state.items.length, 3); assert.equal(ui.state.name, ""); assert.match(textOf(tree), /Distribuidor agregado al catálogo/);
  assert.deepEqual(ui.changes, ["NUEVO ALIADO QA"]); assert.equal(ui.props.value, "NUEVO ALIADO QA");
});

test("selecciona la etiqueta canónica devuelta por el servidor al agregar un nombre existente", async () => {
  const ui = probe({ fetchImpl: async () => catalog([{ id: 3, nombre: "Proveedor QA" }]) });
  await ui.mount(); control(ui.open(), "nuevo-distribuidor").props.onChange({ target: { value: "  proveedor   qa  " } }); ui.render();
  await ui.view.add(); ui.render();
  assert.deepEqual(ui.changes, ["Proveedor QA"]); assert.equal(ui.props.value, "Proveedor QA");
  assert.deepEqual(ui.calls.filter(call => call.method === "POST").map(call => call.body), [{ nombre: "proveedor qa" }]);
});

test("valida nombres vacíos o extensos sin enviar solicitudes ni borrar lo escrito", async () => {
  const ui = probe(); await ui.mount(); let tree = ui.open();
  for (const value of ["   ", "X".repeat(101)]) {
    control(tree, "nuevo-distribuidor").props.onChange({ target: { value } }); ui.render();
    await ui.view.add(); tree = ui.render();
    assert.equal(ui.state.name, value); assert.match(ui.state.error, /1 a 100 caracteres/);
  }
  assert.equal(ui.calls.length, 1); assert.equal(ui.state.message, "");
});

test("un error al agregar conserva nombre, selección y catálogo sin anunciar éxito", async () => {
  const ui = probe({ value: items[0].nombre, fetchImpl: async (_url, options) => options.method === "POST" ? response({ error: "Nombre rechazado QA" }, 400) : catalog() });
  await ui.mount(); const tree = ui.open();
  control(tree, "nuevo-distribuidor").props.onChange({ target: { value: "Proveedor QA" } }); ui.render();
  await ui.view.add(); const after = ui.render();
  assert.equal(ui.state.name, "Proveedor QA"); assert.deepEqual(ui.state.items, items); assert.equal(ui.props.value, items[0].nombre);
  assert.match(textOf(after), /Nombre rechazado QA/); assert.equal(ui.state.message, "");
});

test("no toma una respuesta 200 incompleta o no JSON como un catálogo guardado", async () => {
  for (const broken of [() => response({ ok: true }), () => new Response("<html>Sin respuesta</html>", { status: 200 })]) {
    const ui = probe({ fetchImpl: async (_url, options) => options.method === "POST" ? broken() : catalog() });
    await ui.mount(); control(ui.open(), "nuevo-distribuidor").props.onChange({ target: { value: "Proveedor QA" } }); ui.render();
    await ui.view.add(); ui.render();
    assert.equal(ui.state.name, "Proveedor QA"); assert.deepEqual(ui.state.items, items); assert.match(ui.state.error, /No se pudo confirmar/); assert.equal(ui.state.message, "");
  }
});

test("eliminar exige confirmación, usa el ID y no modifica la selección hasta guardar", async () => {
  const pending = deferred();
  const ui = probe({ value: items[0].nombre, fetchImpl: async (_url, options) => options.method === "DELETE" ? pending.promise : catalog() });
  await ui.mount(); let tree = ui.open();
  button(tree, `Eliminar distribuidor ${items[0].nombre}`).props.onClick(); tree = ui.render();
  assert.equal(ui.calls.length, 1); assert.match(textOf(tree), /Los equipos registrados conservan este distribuidor/);
  button(tree, "Cancelar eliminación").props.onClick(); tree = ui.render(); assert.equal(ui.state.removing, null); assert.equal(ui.calls.length, 1);
  button(tree, `Eliminar distribuidor ${items[0].nombre}`).props.onClick(); tree = ui.render();
  const first = ui.view.remove(); const second = ui.view.remove(); await settle(); tree = ui.render();
  assert.deepEqual(ui.calls.filter(call => call.method === "DELETE").map(call => call.body), [{ id: 1 }]);
  assert.deepEqual(ui.changes, []); assert.equal(ui.state.items.length, 2); assert.equal(button(tree, "Eliminando…").props.disabled, true);
  pending.resolve(catalog([items[1]])); await Promise.all([first, second]); ui.render();
  assert.deepEqual(ui.state.items, [items[1]]); assert.deepEqual(ui.changes, [""]); assert.equal(ui.state.removing, null); assert.match(ui.state.message, /Su historial se conserva/);
});

test("un fallo al eliminar conserva selección, opción e intención de confirmación para reintentar", async () => {
  const ui = probe({ value: items[0].nombre, fetchImpl: async (_url, options) => options.method === "DELETE" ? response({ error: "No se pudo retirar QA" }, 503) : catalog() });
  await ui.mount(); button(ui.open(), `Eliminar distribuidor ${items[0].nombre}`).props.onClick(); ui.render();
  await ui.view.remove(); ui.render();
  assert.deepEqual(ui.state.items, items); assert.deepEqual(ui.changes, []); assert.equal(ui.props.value, items[0].nombre);
  assert.equal(ui.state.removing.id, 1); assert.match(ui.state.error, /No se pudo retirar QA/); assert.equal(ui.state.message, "");
});

test("retirar otra opción conserva el distribuidor seleccionado", async () => {
  const ui = probe({ value: items[0].nombre, fetchImpl: async (_url, options) => options.method === "DELETE" ? catalog([items[0]]) : catalog() });
  await ui.mount(); button(ui.open(), `Eliminar distribuidor ${items[1].nombre}`).props.onClick(); ui.render();
  await ui.view.remove(); ui.render(); assert.deepEqual(ui.changes, []); assert.equal(ui.props.value, items[0].nombre);
});

test("la búsqueda ignora mayúsculas y acentos y muestra un vacío distinto", async () => {
  const ui = probe(); await ui.mount(); let tree = ui.open();
  elements(tree).find(node => node.type === "input" && node.props["aria-label"] === "Buscar distribuidor").props.onChange({ target: { value: " UNICO qa " } }); tree = ui.render();
  assert.deepEqual(elements(tree).filter(node => node.type === "button" && node.props["aria-label"]?.startsWith("Eliminar distribuidor")).map(node => node.props["aria-label"]), [`Eliminar distribuidor ${items[1].nombre}`]);
  elements(tree).find(node => node.type === "input" && node.props["aria-label"] === "Buscar distribuidor").props.onChange({ target: { value: "inexistente" } }); tree = ui.render();
  assert.match(textOf(tree), /No hay coincidencias/); assert.equal(ui.calls.length, 1);
});

test("Enter agrega únicamente un distribuidor y evita enviar el formulario de equipos", async () => {
  const ui = probe(); await ui.mount(); let tree = ui.open(); let prevented = 0;
  control(tree, "nuevo-distribuidor").props.onChange({ target: { value: "Proveedor QA" } }); tree = ui.render();
  control(tree, "nuevo-distribuidor").props.onKeyDown({ key: "Enter", preventDefault() { prevented++; } }); await settle(); tree = ui.render();
  elements(tree).find(node => node.type === "input" && node.props["aria-label"] === "Buscar distribuidor").props.onKeyDown({ key: "Enter", preventDefault() { prevented++; } });
  assert.equal(prevented, 2); assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.ok(ui.calls.every(call => call.url === "/api/inventario-principal/distribuidores"));
  assert.ok(elements(tree).filter(node => node.type === "button").every(node => node.props.type === "button"));
});

test("una carga de equipos pendiente bloquea cambios y preserva su distribuidor histórico", async () => {
  const ui = probe({ value: "DISTRIBUIDOR HISTÓRICO QA", disabled: true }); await ui.mount(); let tree = ui.render();
  assert.equal(control(tree, "ingreso-distribuidor").props.disabled, true); assert.equal(button(tree, "Gestionar").props.disabled, true);
  assert.ok(elements(control(tree, "ingreso-distribuidor")).some(node => node.type === "option" && node.props.value === ui.props.value));
  await ui.view.add(); await ui.view.remove(); await ui.view.reload();
  assert.equal(ui.calls.length, 1); assert.deepEqual(ui.changes, []);
});

test("el error inicial admite reintento sin convertirlo en un catálogo vacío exitoso", async () => {
  let reads = 0;
  const ui = probe({ fetchImpl: async () => ++reads === 1 ? response({ error: "Error de carga QA" }, 500) : catalog() });
  let tree = await ui.mount(); assert.match(textOf(tree), /Error de carga QA/); assert.equal(ui.state.message, "");
  await button(tree, "Actualizar catálogo").props.onClick(); await settle(); tree = ui.render();
  assert.equal(ui.calls.length, 2); assert.deepEqual(ui.state.items, items); assert.equal(ui.state.error, ""); assert.equal(control(tree, "ingreso-distribuidor").props.disabled, false);
});

test("la carga vacía es válida y una respuesta tardía tras desmontar se ignora", async () => {
  const empty = probe({ fetchImpl: async () => catalog([]) }); await empty.mount(); assert.match(textOf(empty.open()), /No hay distribuidores activos/);
  const pending = deferred(); const ui = probe({ fetchImpl: async () => pending.promise }); const mount = ui.mount(); ui.unmount(); pending.resolve(catalog()); await mount;
  assert.deepEqual(ui.state.items, []); assert.equal(ui.state.message, "");
});
