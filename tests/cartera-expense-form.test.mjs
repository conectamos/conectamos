import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const componentPath = "app/_components/gasto-cartera-form.tsx";
const componentSource = readFileSync(join(ROOT, componentPath), "utf8");
const ast = ts.createSourceFile(componentPath, componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
assert.ok(component?.body);
const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
const stateNames = declarations.flatMap(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === "useState" ? [entry.name.elements[0].name.getText(ast)] : []);
const locals = declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text);
const finalReturn = component.body.statements.find(ts.isReturnStatement);
assert.ok(finalReturn);
const instrumented = componentSource.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(",")}});\n` + componentSource.slice(finalReturn.getStart(ast));
const output = ts.transpileModule(instrumented, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function resolve(node) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
function control(tree, id) {
  const result = elements(tree).find(node => node.props?.id === id);
  assert.ok(result, `Falta el campo ${id}`);
  return result;
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const submitEvent = () => ({ preventDefault() {} });
const admin = { id: 7, nombre: "Administrador QA", usuario: "adminqa", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL", rolId: 1, rolNombre: "ADMIN" };
const sedes = [{ id: 1, nombre: "BODEGA PRINCIPAL" }, { id: 3, nombre: "SEDE 3" }];
const savedResult = { ok: true, item: { id: 91, valor: 1500000, observacion: "QA", sedeId: 1 }, mensaje: "Gasto registrado" };
const pendingStorageKey = userId => `conectamos:gasto-cartera:pendiente:${userId}`;

function formProbe({ session = admin, initial = {}, fetchImpl, storage = new Map() } = {}) {
  const state = { ...initial }; const refs = []; const effects = []; const calls = []; const refreshes = [];
  let cursor = 0; let refCursor = 0; let captured; let routerRefreshes = 0;
  const imports = {
    react: {
      useState(value) { const name = stateNames[cursor++]; assert.ok(name); if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useEffect(fn) { if (!effects.length) effects.push(fn); },
      useRef(value) { return refs[refCursor++] ??= { current: value }; },
    },
    "react/jsx-runtime": jsx,
    "next/image": { __esModule: true, default: props => jsx.jsx("img", { src: props.src, alt: props.alt }) },
    "next/link": { __esModule: true, default: props => jsx.jsx("a", { ...props }) },
    "next/navigation": { useRouter: () => ({ refresh() { routerRefreshes++; } }) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/lib/use-live-refresh": { triggerLiveRefresh: event => refreshes.push(event) },
    "./gasto-cartera-form.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "__capture", "crypto", "sessionStorage", "fetch", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loaded, loaded.exports, value => { captured = value; }, { randomUUID }, {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }, async (url, options = {}) => {
    calls.push({ url, options });
    if (fetchImpl) return fetchImpl(url, options);
    if (url === "/api/session") return response(session);
    if (url === "/api/sedes") return response(sedes);
    return response(savedResult);
  });
  const instance = {
    state, calls, refreshes, storage,
    render(props = {}) { cursor = 0; refCursor = 0; return resolve(loaded.exports.default(props)); },
    get view() { return captured; },
    get routerRefreshes() { return routerRefreshes; },
    async init() { effects[0](); await new Promise(resolve => setImmediate(resolve)); return this.render(); },
  };
  instance.render(); return instance;
}

test("carga inicial bloquea registro; administrador recibe sedes reales y conserva rutas", async () => {
  const instance = formProbe();
  let tree = instance.render();
  assert.ok(textOf(tree).includes("Cargando información de cartera"));
  const submit = elements(tree).find(node => node.type === "button" && node.props.type === "submit");
  assert.equal(submit.props.disabled, true);
  await instance.view.guardar(submitEvent()); assert.deepEqual(instance.calls, []);
  tree = await instance.init();
  assert.deepEqual(instance.calls.map(call => call.url), ["/api/session", "/api/sedes"]);
  assert.equal(instance.state.sedeId, "1"); assert.equal(instance.view.sedeSeleccionada, "BODEGA PRINCIPAL");
  assert.equal(control(tree, "cartera-sede").type, "select");
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/dashboard/financiero/cartera/detalle"));
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/dashboard" && textOf(node) === "Volver"));
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/caja" && node.props["aria-current"] === "page"));
});

test("usuario de sede conserva cobertura restringida y no consulta el listado administrativo", async () => {
  const instance = formProbe({ session: { ...admin, id: 9, rolNombre: "SUPERVISOR", sedeId: 3, sedeNombre: "SEDE 3" } });
  const tree = await instance.init();
  assert.deepEqual(instance.calls.map(call => call.url), ["/api/session"]);
  assert.equal(control(tree, "cartera-sede").props.readOnly, true);
  assert.equal(control(tree, "cartera-sede").props.value, "SEDE 3");
  assert.equal(instance.state.sedeId, "3");
  assert.ok(!elements(tree).some(node => node.type === "a" && node.props.href === "/dashboard/sedes"));
});

test("el formulario compartido conserva Volver personalizado y la opción de ocultar Ver detalle", () => {
  const instance = formProbe();
  const tree = instance.render({ backHref: "/caja", detailHref: null, description: "Registro desde caja QA" });
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/caja" && textOf(node) === "Volver"));
  assert.ok(!elements(tree).some(node => node.type === "a" && textOf(node).includes("Ver detalle")));
  assert.ok(textOf(tree).includes("Registro desde caja QA"));
});

test("vista previa muestra sede, importe colombiano completo y observación sin guardar", async () => {
  const instance = formProbe(); let tree = await instance.init();
  control(tree, "cartera-sede").props.onChange({ target: { value: "3" } });
  control(tree, "cartera-valor").props.onChange({ target: { value: "1.500.000" } });
  control(tree, "cartera-observacion").props.onChange({ target: { value: " Motivo del gasto QA " } });
  tree = instance.render();
  assert.equal(instance.view.sedeSeleccionada, "SEDE 3"); assert.equal(instance.state.valor, "1500000");
  assert.equal(control(tree, "cartera-valor").props.value, "1.500.000");
  const preview = elements(tree).find(node => node.type === "aside");
  assert.match(textOf(preview), /\$\s+1\.500\.000/); assert.ok(textOf(preview).includes("Motivo del gasto QA"));
  assert.equal(instance.calls.filter(call => call.options.method === "POST").length, 0);
  assert.deepEqual(instance.refreshes, []);
});

test("valor no positivo, inválido o sede fuera del catálogo no envía solicitudes", async () => {
  for (const initial of [{ valor: "0" }, { valor: "-5" }, { valor: "Infinity" }, { valor: "abc" }, { valor: "1500", sedeId: "8" }]) {
    const instance = formProbe(); await instance.init(); Object.assign(instance.state, initial); instance.render();
    await instance.view.guardar(submitEvent()); instance.render();
    assert.equal(instance.calls.filter(call => call.options.method === "POST").length, 0);
    assert.equal(instance.state.notice.error, true); assert.equal(instance.state.pending, false);
  }
});

test("doble clic antes del render inicia un solo registro y espera confirmación del servidor", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const instance = formProbe({ initial: { user: admin, sedes, sedeId: "1", valor: "1500000", observacion: " QA ", cargando: false }, fetchImpl: () => pending });
  const handler = instance.view.guardar; const first = handler(submitEvent()); await handler(submitEvent());
  let tree = instance.render();
  assert.equal(instance.calls.length, 1); assert.equal(instance.state.guardando, true);
  assert.equal(instance.state.notice, null); assert.equal(instance.state.valor, "1500000");
  assert.equal(elements(tree).find(node => node.type === "fieldset").props.disabled, true);
  assert.ok(textOf(tree).includes("Registrando…"));
  release(response(savedResult)); await first; tree = instance.render();
  assert.equal(instance.calls.length, 1); assert.equal(instance.state.valor, ""); assert.equal(instance.state.observacion, "");
  assert.equal(instance.state.notice.error, false); assert.equal(instance.state.pending, false);
  assert.deepEqual(instance.refreshes, ["gasto-cartera"]); assert.equal(instance.routerRefreshes, 1);
  assert.equal(instance.storage.has(pendingStorageKey(admin.id)), false);
});

test("fallo de red conserva campos y clave; reintento confirma el mismo gasto", async () => {
  let attempts = 0;
  const initial = { user: admin, sedes, sedeId: "1", valor: "1500000", observacion: " QA ", cargando: false };
  const instance = formProbe({ initial, fetchImpl: async () => { if (++attempts === 1) throw Error("Sin conexión QA"); return response(savedResult); } });
  await instance.view.guardar(submitEvent()); let tree = instance.render();
  assert.equal(instance.state.valor, initial.valor); assert.equal(instance.state.observacion, initial.observacion);
  assert.equal(instance.state.notice.error, true); assert.equal(instance.state.pending, true);
  assert.equal(elements(tree).find(node => node.type === "fieldset").props.disabled, true);
  assert.ok(instance.storage.has(pendingStorageKey(admin.id))); assert.deepEqual(instance.refreshes, []);
  await instance.view.guardar(submitEvent()); instance.render();
  assert.equal(instance.calls.length, 2); assert.equal(instance.calls[1].options.body, instance.calls[0].options.body);
  assert.equal(instance.calls[1].options.headers["Idempotency-Key"], instance.calls[0].options.headers["Idempotency-Key"]);
  assert.deepEqual(JSON.parse(instance.calls[0].options.body), { valor: 1500000, observacion: "QA", sedeId: 1 });
  assert.equal(instance.state.notice.error, false); assert.equal(instance.storage.has(pendingStorageKey(admin.id)), false);
});

test("recargar recupera un intento incierto y lo reenvía sin cambiar importe ni clave", async () => {
  const key = randomUUID(); const payload = { valor: 1500000, sedeId: 3, observacion: "Intento pendiente QA" };
  const storage = new Map([[pendingStorageKey(admin.id), JSON.stringify({ key, payload })]]);
  const instance = formProbe({ storage }); const tree = await instance.init();
  assert.equal(instance.state.pending, true); assert.equal(instance.state.sedeId, "3"); assert.equal(instance.state.valor, "1500000");
  assert.equal(instance.state.observacion, payload.observacion); assert.equal(instance.state.notice.error, true);
  assert.equal(elements(tree).find(node => node.type === "fieldset").props.disabled, true);
  await instance.view.guardar(submitEvent()); instance.render();
  const post = instance.calls.find(call => call.options.method === "POST");
  assert.equal(post.options.headers["Idempotency-Key"], key); assert.deepEqual(JSON.parse(post.options.body), payload);
  assert.equal(instance.state.pending, false); assert.equal(storage.has(pendingStorageKey(admin.id)), false);
});

test("errores de validación desbloquean corrección y conservan los datos escritos", async () => {
  const instance = formProbe({ initial: { user: admin, sedes, sedeId: "1", valor: "1500000", observacion: "Conservar QA", cargando: false }, fetchImpl: async () => response({ error: "Sede no autorizada QA" }, 403) });
  await instance.view.guardar(submitEvent()); const tree = instance.render();
  assert.equal(instance.state.valor, "1500000"); assert.equal(instance.state.observacion, "Conservar QA");
  assert.equal(instance.state.pending, false); assert.equal(instance.view.requestRef.current, null);
  assert.equal(elements(tree).find(node => node.type === "fieldset").props.disabled, false);
  assert.equal(instance.state.notice.text, "Sede no autorizada QA"); assert.deepEqual(instance.refreshes, []);
});

test("respuesta incompleta no informa éxito ni pierde la clave del intento", async () => {
  const instance = formProbe({ initial: { user: admin, sedes, sedeId: "1", valor: "1500000", observacion: "Conservar QA", cargando: false }, fetchImpl: async () => response({ ok: true }) });
  await instance.view.guardar(submitEvent()); instance.render();
  assert.equal(instance.state.notice.error, true); assert.equal(instance.state.pending, true);
  assert.equal(instance.state.valor, "1500000"); assert.ok(instance.view.requestRef.current.key);
  assert.ok(instance.storage.has(pendingStorageKey(admin.id))); assert.deepEqual(instance.refreshes, []);
});

test("fallo al iniciar sesión o cargar sedes mantiene el registro deshabilitado", async () => {
  for (const failSedes of [false, true]) {
    const instance = formProbe({ fetchImpl: async url => url === "/api/session" && failSedes ? response(admin) : response({ error: "Carga inicial fallida QA" }, 500) });
    const tree = await instance.init();
    assert.ok(instance.state.initError); assert.equal(instance.state.cargando, false);
    assert.equal(elements(tree).find(node => node.type === "button" && node.props.type === "submit").props.disabled, true);
    await instance.view.guardar(submitEvent());
    assert.equal(instance.calls.filter(call => call.options.method === "POST").length, 0);
  }
});
