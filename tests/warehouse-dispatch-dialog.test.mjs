import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const COMPONENT = "app/inventario-principal/_components/dispatch-confirmation-dialog.tsx";
const source = file => readFileSync(join(ROOT, file), "utf8");
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const equipo = { id: 73, imei: "001234567890123", referencia: "INFINIX SMART 20 128GB CON REFERENCIA COMPLETA Y CONDICIÓN DE EXHIBICIÓN" };
const sedes = [{ id: 6, nombre: "SEDE 6 CON NOMBRE COMPLETO" }, { id: 12, nombre: "Stand con nombre repetido" }, { id: 13, nombre: "Stand con nombre repetido" }];
const acreedorNombre = "Proveedor de prueba con nombre completo y razón social extensa";
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
const text = node => textOf(node).replace(/\s+/g, " ").trim();
function resolve(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
const depsEqual = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
function probe(overrides = {}) {
  let cursor = 0, effectCursor = 0, currentProps, tree;
  const slots = [], effects = [], scheduled = [], calls = [];
  const document = { body: { style: { overflow: "auto" } }, activeElement: null };
  class Element {
    isConnected = true; focused = 0;
    focus() { this.focused++; document.activeElement = this; }
  }
  const trigger = new Element(), closeControl = new Element(), selectControl = new Element();
  document.activeElement = trigger;
  const nativeDialog = {
    open: false, shown: 0, closed: 0,
    showModal() { this.open = true; this.shown++; }, close() { this.open = false; this.closed++; },
    querySelector(selector) { return selector.includes("select") ? selectControl : closeControl; },
  };
  const hooks = {
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !depsEqual(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useId() { const index = cursor++; return slots[index] ??= `dialog-qa-${index}`; },
    useEffect(fn, deps) { const index = effectCursor++; if (!effects[index] || !depsEqual(effects[index].deps, deps)) scheduled.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; }); },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "document", "HTMLElement", "fetch", compile(source(COMPONENT)))(name => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name.includes("dashboard-icon")) return { __esModule: true, default: props => jsx.jsx("svg", { "data-icon": props.name }) };
    assert.fail(`Dependencia inesperada: ${name}`);
  }, loaded, loaded.exports, document, Element, () => assert.fail("El modal no debe consultar ni escribir en el servidor por sí mismo"));
  currentProps = {
    equipo, sedes, sedeDestinoId: "6", acreedorNombre, busy: false, error: "",
    onDestinoChange(value) { calls.push({ action: "destino", value }); currentProps = { ...currentProps, sedeDestinoId: value }; },
    onConfirm() { calls.push({ action: "confirmar" }); }, onClose() { calls.push({ action: "cerrar" }); },
    ...overrides,
  };
  const Component = loaded.exports.default;
  assert.equal(typeof Component, "function");
  const render = () => {
    cursor = effectCursor = 0; scheduled.length = 0;
    tree = resolve(Component(currentProps));
    for (const node of nodes(tree)) {
      if (node.type === "dialog" && node.props.ref) node.props.ref.current = nativeDialog;
      if (node.type === "select" && node.props.ref) node.props.ref.current = selectControl;
      if (node.type === "button" && node.props.ref) node.props.ref.current = closeControl;
    }
    for (const run of scheduled) run();
    return tree;
  };
  const control = predicate => { const node = nodes(tree).find(predicate); assert.ok(node, "Falta control del modal"); return node; };
  render();
  return {
    calls, document, trigger, closeControl, selectControl, nativeDialog,
    get tree() { return tree; }, get props() { return currentProps; },
    render, update(value) { currentProps = { ...currentProps, ...value }; return render(); }, control,
    get select() { return control(node => node.type === "select"); },
    get confirm() { return control(node => node.type === "button" && /Confirmar (envío|despacho)|Enviando|Procesando/u.test(text(node))); },
    get cancel() { return control(node => node.type === "button" && text(node) === "Cancelar"); },
    get close() { return control(node => node.type === "button" && /^Cerrar/u.test(node.props["aria-label"] || "")); },
    submit() { let prevented = false; control(node => node.type === "form").props.onSubmit({ preventDefault() { prevented = true; } }); return prevented; },
    escape() { let prevented = false; control(node => node.type === "dialog").props.onCancel({ preventDefault() { prevented = true; } }); return prevented; },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

test("el despacho muestra IMEI textual completo, referencia y acreedor reales sin sustituciones", () => {
  const p = probe(); const content = text(p.tree);
  assert.ok(content.includes(equipo.imei)); assert.ok(content.includes(equipo.referencia)); assert.ok(content.includes(acreedorNombre));
  assert.match(content, /Confirmar despacho/); assert.match(content, /BODEGA/); assert.match(content, /deuda/i);
  assert.ok(!content.includes("Proveedor Finser")); assert.deepEqual(p.calls, []); p.unmount();
});

test("el selector conserva sedes por ID aunque tengan el mismo nombre y solo notifica cambios explícitos", () => {
  const p = probe(); const options = nodes(p.select).filter(node => node.type === "option" && String(node.props.value));
  assert.deepEqual(options.map(node => String(node.props.value)), ["6", "12", "13"]);
  assert.equal(options[1].props.children, options[2].props.children); assert.equal(p.select.props.value, "6");
  p.select.props.onChange({ target: { value: "13" } }); p.render();
  assert.equal(p.select.props.value, "13"); assert.deepEqual(p.calls, [{ action: "destino", value: "13" }]); p.unmount();
});

test("la confirmación queda deshabilitada sin una sede elegible de la consulta actual", () => {
  for (const sedeDestinoId of ["", "99", "-1", "0", "no-id"]) {
    const p = probe({ sedeDestinoId }); assert.equal(p.confirm.props.disabled, true, sedeDestinoId); assert.equal(p.submit(), true); assert.deepEqual(p.calls, []); p.unmount();
  }
  const ready = probe(); assert.equal(ready.confirm.props.disabled, false); assert.equal(ready.submit(), true); assert.deepEqual(ready.calls, [{ action: "confirmar" }]); ready.unmount();
});

test("sin destinos disponibles no habilita el despacho ni inventa una sede", () => {
  const p = probe({ sedes: [], sedeDestinoId: "6" });
  assert.equal(p.confirm.props.disabled, true); assert.ok(!nodes(p.select).some(node => node.type === "option" && String(node.props.value)));
  assert.deepEqual(p.calls, []); p.unmount();
});

test("el estado de procesamiento bloquea confirmación, selector y cierre accidental", () => {
  const p = probe({ busy: true });
  assert.equal(p.confirm.props.disabled, true); assert.equal(p.select.props.disabled, true);
  assert.equal(p.cancel.props.disabled, true); assert.equal(p.close.props.disabled, true);
  assert.equal(p.escape(), true); assert.equal(p.submit(), true); assert.deepEqual(p.calls, []); p.unmount();
});

test("Escape, Cancelar y cerrar solicitan el cierre sin ejecutar un despacho", () => {
  for (const action of [p => p.cancel.props.onClick(), p => p.close.props.onClick(), p => assert.equal(p.escape(), true)]) {
    const p = probe(); action(p); assert.deepEqual(p.calls, [{ action: "cerrar" }]); p.unmount();
  }
});

test("el diálogo nativo contiene el foco y restaura el disparador y el desplazamiento al desmontar", () => {
  const p = probe();
  assert.equal(p.nativeDialog.open, true); assert.equal(p.nativeDialog.shown, 1);
  assert.ok([p.closeControl, p.selectControl].includes(p.document.activeElement)); assert.equal(p.document.body.style.overflow, "hidden");
  p.update({ busy: true }); assert.equal(p.nativeDialog.shown, 1, "Actualizar el estado no debe reabrir ni reiniciar el foco del modal");
  p.unmount(); assert.equal(p.nativeDialog.open, false); assert.equal(p.document.activeElement, p.trigger); assert.equal(p.document.body.style.overflow, "auto");
});

test("un error permanece dentro del modal y conserva el equipo y el destino para reintentar", () => {
  const p = probe(); p.update({ error: "El equipo ya no está disponible. Revisa el inventario.", busy: false });
  const alert = p.control(node => node.props?.role === "alert"); assert.match(text(alert), /ya no está disponible/);
  assert.equal(p.select.props.value, "6"); assert.ok(text(p.tree).includes(equipo.imei)); assert.ok(text(p.tree).includes(equipo.referencia));
  assert.equal(p.confirm.props.disabled, false); assert.deepEqual(p.calls, []); p.unmount();
});

test("título, descripción y selector tienen nombres accesibles asociados a elementos reales", () => {
  const p = probe(); const dialog = p.control(node => node.type === "dialog");
  assert.equal(dialog.props["aria-modal"], "true"); assert.equal(dialog.props.role, "dialog");
  for (const attribute of ["aria-labelledby", "aria-describedby"]) {
    const id = dialog.props[attribute]; assert.ok(id); assert.ok(nodes(p.tree).some(node => node.props?.id === id));
  }
  const id = p.select.props.id; assert.ok(id); assert.ok(nodes(p.tree).some(node => node.type === "label" && node.props.htmlFor === id));
  p.unmount();
});

function handlerProbe({ initial = {}, fetchImpl, refreshImpl } = {}) {
  const path = "app/inventario-principal/page.tsx", input = source(path);
  const ast = ts.createSourceFile(path, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ["cerrarModal", "abrirModalEnvio", "enviarASede"].includes(node.name.text)) declarations.set(node.name.text, node.initializer.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(declarations.size, 3, "Deben conservarse los handlers existentes del flujo individual");
  const state = { itemSeleccionado: equipo, sedesDestinoActivas: sedes, sedeDestinoId: "6", cargando: false, mostrarModal: true, errorEnvio: "", mensaje: "", ...initial };
  const envioEnCurso = { current: false }, calls = [], events = [];
  let handlers;
  const setters = Object.fromEntries(["Cargando", "Mensaje", "ErrorEnvio", "MostrarModal", "ItemSeleccionado", "SedeDestinoId"].map(name => [`set${name}`, value => { const key = name[0].toLowerCase() + name.slice(1); state[key] = typeof value === "function" ? value(state[key]) : value; events.push([key, state[key]]); }]));
  const render = () => {
    const globals = {
      ...state, ...setters, envioEnCurso,
      async cargarInventarioPrincipal() { events.push(["refresh"]); if (refreshImpl) await refreshImpl(); },
      async fetch(url, options) { calls.push({ url, options }); return fetchImpl ? fetchImpl(url, options) : { ok: true, json: async () => ({ ok: true, mensaje: "Despacho guardado por el servidor" }) }; },
    };
    const code = `${[...declarations].map(([name, expression]) => `const ${name} = ${expression};`).join("\n")}\nmodule.exports = { cerrarModal, abrirModalEnvio, enviarASede };`;
    const loaded = { exports: {} };
    new Function("module", "exports", ...Object.keys(globals), compile(code))(loaded, loaded.exports, ...Object.values(globals));
    handlers = loaded.exports;
    return handlers;
  };
  render();
  return { state, calls, events, envioEnCurso, render, get handlers() { return handlers; } };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("el flujo individual envía IDs reales una sola vez y actualiza el inventario únicamente tras éxito", async () => {
  const p = handlerProbe(); await p.handlers.enviarASede();
  assert.equal(p.calls.length, 1); assert.equal(p.calls[0].url, "/api/inventario-principal/enviar-a-sede");
  assert.equal(p.calls[0].options.method, "POST"); assert.equal(p.calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(p.calls[0].options.body), { id: equipo.id, sedeDestinoId: 6 });
  assert.equal(p.state.mostrarModal, false); assert.equal(p.state.itemSeleccionado, null); assert.equal(p.state.sedeDestinoId, "");
  assert.equal(p.state.cargando, false); assert.equal(p.envioEnCurso.current, false); assert.equal(p.state.errorEnvio, "");
  assert.ok(p.events.some(([name]) => name === "refresh")); assert.match(p.state.mensaje, /guardado por el servidor/);
});

test("el handler rechaza un destino ajeno a las sedes elegibles antes de consultar al servidor", async () => {
  for (const sedeDestinoId of ["", "99", "-1"]) {
    const p = handlerProbe({ initial: { sedeDestinoId } }); await p.handlers.enviarASede();
    assert.equal(p.calls.length, 0); assert.equal(p.state.mostrarModal, true); assert.equal(p.state.sedeDestinoId, sedeDestinoId);
    assert.match(p.state.errorEnvio, /seleccionar.*sede/i); assert.ok(!p.events.some(([name]) => name === "refresh"));
  }
});

test("dos confirmaciones antes del siguiente render no generan dos despachos y no permiten cerrar en proceso", async () => {
  const next = deferred(); const p = handlerProbe({ fetchImpl: () => next.promise }); const staleHandlers = p.handlers;
  const first = staleHandlers.enviarASede(); assert.equal(p.calls.length, 1); assert.equal(p.envioEnCurso.current, true);
  await staleHandlers.enviarASede(); staleHandlers.cerrarModal(); staleHandlers.abrirModalEnvio({ ...equipo, id: 99 });
  assert.equal(p.calls.length, 1); assert.equal(p.state.mostrarModal, true); assert.equal(p.state.itemSeleccionado.id, equipo.id);
  next.resolve({ ok: true, json: async () => ({ ok: true, mensaje: "Guardado" }) }); await first;
  assert.equal(p.envioEnCurso.current, false); assert.equal(p.state.mostrarModal, false);
});

test("el bloqueo se mantiene hasta que el inventario termina de actualizarse después del despacho", async () => {
  const refreshing = deferred(); const p = handlerProbe({ refreshImpl: () => refreshing.promise }); const stale = p.handlers;
  const saving = stale.enviarASede();
  for (let count = 0; count < 12; count++) await Promise.resolve();
  assert.equal(p.state.mostrarModal, false); assert.equal(p.envioEnCurso.current, true); assert.equal(p.state.cargando, true);
  await stale.enviarASede(); stale.abrirModalEnvio({ ...equipo, id: 99 });
  assert.equal(p.calls.length, 1); assert.equal(p.state.mostrarModal, false);
  refreshing.resolve(); await saving;
  assert.equal(p.envioEnCurso.current, false); assert.equal(p.state.cargando, false);
});

test("un rechazo del servidor conserva equipo y sede, muestra el error dentro del modal y permite reintentar", async () => {
  let fail = true;
  const p = handlerProbe({ fetchImpl: async () => ({ ok: !fail, json: async () => fail ? { error: "El IMEI ya existe en la sede destino" } : { ok: true, mensaje: "Guardado" } }) });
  await p.handlers.enviarASede();
  assert.equal(p.state.mostrarModal, true); assert.deepEqual(p.state.itemSeleccionado, equipo); assert.equal(p.state.sedeDestinoId, "6");
  assert.match(p.state.errorEnvio, /IMEI ya existe/); assert.equal(p.state.cargando, false); assert.equal(p.envioEnCurso.current, false);
  assert.ok(!p.events.some(([name]) => name === "refresh"));
  fail = false; p.render(); await p.handlers.enviarASede();
  assert.equal(p.calls.length, 2); assert.equal(p.state.mostrarModal, false); assert.ok(p.events.some(([name]) => name === "refresh"));
});

test("un fallo de red o respuesta inválida conserva los datos y nunca muestra éxito ni refresca como si hubiera guardado", async () => {
  for (const fetchImpl of [async () => { throw new TypeError("Network unavailable"); }, async () => ({ ok: false, json: async () => { throw new SyntaxError("Invalid JSON"); } })]) {
    const p = handlerProbe({ fetchImpl }); await p.handlers.enviarASede();
    assert.equal(p.state.mostrarModal, true); assert.deepEqual(p.state.itemSeleccionado, equipo); assert.equal(p.state.sedeDestinoId, "6");
    assert.ok(p.state.errorEnvio); assert.equal(p.state.cargando, false); assert.equal(p.envioEnCurso.current, false);
    assert.ok(!p.events.some(([name]) => name === "refresh")); assert.ok(!/correctamente|guardado/i.test(p.state.mensaje));
  }
});
