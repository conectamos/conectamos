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
const read = file => readFileSync(join(ROOT, file), "utf8");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const COMPONENT = "app/dashboard/_components/vendor-welcome-modal.tsx";
const KEY = "conectamos:vendedor-bienvenida-cerrada:session-one:v1";
const message = {
  title: "Convenio configurado por administración", eyebrow: "CONECTAMOS", buttonLabel: "Leído y entendido", fontFamily: "serif", version: "v1",
  body: ["Un mensaje real", "Convenio: 00113950", "Referencia: Número de cédula"],
  bodyBlocks: [{ align: "left", size: "normal", text: "Para las ventas de **FINANCIERA REAL**" }, { align: "center", size: "large", text: "**Convenio:** 00113950" }, { align: "right", size: "normal", text: "Referencia: Número de cédula" }],
};
function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
function text(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(text).join(" "); return typeof node === "object" ? text(node.props?.children) : String(node); }
function resolve(node) { if (!node || typeof node !== "object") return node; if (Array.isArray(node)) return node.map(resolve); if (typeof node.type === "function") return resolve(node.type(node.props)); return { ...node, props: { ...node.props, children: resolve(node.props?.children) } }; }
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
function probe({ stored = {}, unavailable = false, mensaje = message, sessionKey = "session-one" } = {}) {
  let cursor = 0, effectCursor = 0, tree;
  let props = { mensaje, sessionKey };
  const slots = [], effects = [], pending = [], timers = new Map(), writes = [];
  let timerId = 0;
  const document = { body: { style: { overflow: "auto" } }, activeElement: null };
  class Element { isConnected = true; focus() { document.activeElement = this; } }
  const trigger = new Element(), closeButton = new Element(); document.activeElement = trigger;
  const dialog = { open: false, shown: 0, showModal() { this.open = true; this.shown++; }, close() { this.open = false; }, querySelector() { return closeButton; } };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], x => { slots[i] = typeof x === "function" ? x(slots[i]) : x; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useId() { return slots[cursor++] ??= "welcome-test-title"; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = effectCursor++; if (!same(effects[i]?.deps, deps)) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const window = {
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    sessionStorage: { getItem(key) { if (unavailable) throw Error("SecurityError"); return stored[key] ?? null; }, setItem(key, value) { if (unavailable) throw Error("SecurityError"); stored[key] = value; writes.push([key, value]); } },
  };
  const bodyModule = { exports: {} };
  new Function("require", "module", "exports", compile(read("app/dashboard/_components/vendor-message-body.tsx")))(name => name === "react/jsx-runtime" ? jsx : assert.fail(name), bodyModule, bodyModule.exports);
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", "window", "document", "HTMLElement", "fetch", compile(read(COMPONENT)))(name => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name.endsWith("dashboard-icon")) return { __esModule: true, default: props => jsx.jsx("svg", { "data-icon": props.name }) };
    if (name.endsWith("vendor-message-body")) return bodyModule.exports;
    assert.fail(`Unexpected dependency ${name}`);
  }, loadedModule, loadedModule.exports, window, document, Element, () => assert.fail("A notice must never create server operations"));
  const render = () => {
    cursor = effectCursor = 0; pending.length = 0; tree = resolve(loadedModule.exports.default(props));
    for (const node of nodes(tree)) if (node.type === "dialog") node.props.ref.current = dialog;
    for (const run of pending) run();
    return tree;
  };
  const flush = () => { const list = [...timers.values()]; timers.clear(); list.forEach(fn => fn()); render(); };
  const control = predicate => { const value = nodes(tree).find(predicate); assert.ok(value, "Missing notice control"); return value; };
  render(); flush();
  return {
    dialog, document, trigger, closeButton, writes, stored,
    get tree() { return tree; }, render, flush, control,
    update(value) { props = { ...props, ...value }; render(); flush(); },
    close() { control(node => node.type === "button" && node.props["aria-label"]).props.onClick(); render(); },
    confirm() { control(node => node.type === "button" && text(node).includes(props.mensaje.buttonLabel)).props.onClick(); render(); },
    escape() { let prevented = false; control(node => node.type === "dialog").props.onCancel({ preventDefault() { prevented = true; } }); render(); return prevented; },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

test("el aviso muestra exactamente los datos configurados y conserva convenio textual con ceros", () => {
  const p = probe(); const value = text(p.tree);
  assert.ok(value.includes(message.title)); assert.ok(value.includes(message.eyebrow)); assert.ok(value.includes(message.buttonLabel));
  assert.ok(value.includes("00113950")); assert.ok(value.includes("FINANCIERA REAL")); assert.ok(value.includes("Número de cédula"));
  assert.ok(!value.includes("SUMASPAY")); assert.deepEqual(p.writes, []);
  const strong = nodes(p.tree).filter(node => node.type === "strong").map(text);
  assert.deepEqual(strong, ["FINANCIERA REAL", "Convenio:"]);
  const paragraphs = nodes(p.tree).filter(node => node.type === "p");
  assert.ok(paragraphs.some(node => node.props.className.includes("text-center") && node.props.className.includes("text-base")));
  assert.ok(paragraphs.some(node => node.props.className.includes("text-right")));
  assert.ok(nodes(p.tree).some(node => String(node.props?.className).includes("font-serif")));
  p.unmount();
});

test("un mensaje aceptado no vuelve a aparecer en la misma sesión y versión", () => {
  const p = probe({ stored: { [KEY]: "1" } }); assert.equal(p.tree, null); assert.equal(p.dialog.shown, 0); assert.deepEqual(p.writes, []); p.unmount();
});

test("cerrar, Entendido y Escape guardan el reconocimiento con la misma clave existente", () => {
  for (const action of [p => p.close(), p => p.confirm(), p => assert.equal(p.escape(), true)]) {
    const p = probe(); action(p); assert.equal(p.tree, null); assert.equal(p.stored[KEY], "1"); assert.deepEqual(p.writes, [[KEY, "1"]]); p.unmount();
  }
});

test("otra versión o sesión muestra el nuevo aviso sin heredar el cierre anterior", () => {
  const p = probe(); p.confirm();
  p.update({ mensaje: { ...message, version: "v2", title: "Datos actualizados" } });
  assert.ok(text(p.tree).includes("Datos actualizados")); p.confirm();
  assert.equal(p.stored[KEY], "1"); assert.equal(p.stored[KEY.replace(":v1", ":v2")], "1");
  p.update({ sessionKey: "session-two" }); assert.ok(p.tree); p.unmount();
});

test("el diálogo es accesible y restaura foco y desplazamiento al aceptar o desmontar", () => {
  const p = probe(); const modal = p.control(node => node.type === "dialog");
  assert.equal(modal.props["aria-modal"], "true"); assert.equal(modal.props.role, "dialog");
  assert.ok(nodes(p.tree).some(node => node.type === "h2" && node.props.id === modal.props["aria-labelledby"]));
  assert.equal(p.document.activeElement, p.closeButton); assert.equal(p.dialog.open, true); assert.equal(p.document.body.style.overflow, "hidden");
  p.render(); assert.equal(p.dialog.shown, 1);
  p.confirm(); assert.equal(p.dialog.open, false); assert.equal(p.document.activeElement, p.trigger); assert.equal(p.document.body.style.overflow, "auto"); p.unmount();
  const q = probe(); q.unmount(); assert.equal(q.dialog.open, false); assert.equal(q.document.activeElement, q.trigger); assert.equal(q.document.body.style.overflow, "auto");
});

test("el aviso sigue funcionando si el navegador bloquea sessionStorage", () => {
  const p = probe({ unavailable: true }); assert.ok(p.tree); p.confirm(); assert.equal(p.tree, null);
  p.render(); p.flush(); assert.equal(p.tree, null); assert.deepEqual(p.writes, []);
  p.update({ mensaje: { ...message, version: "v2" } }); assert.ok(p.tree); p.close(); assert.equal(p.tree, null); p.unmount();
});

test("un aviso largo conserva todos los bloques y no ejecuta operaciones de servidor", () => {
  const bodyBlocks = Array.from({ length: 8 }, (_, i) => ({ align: "left", size: "normal", text: `Bloque ${i} ` + "Información real de la operación. ".repeat(26) }));
  const p = probe({ mensaje: { ...message, bodyBlocks } });
  for (const block of bodyBlocks) assert.ok(text(p.tree).includes(block.text));
  assert.deepEqual(p.writes, []); p.unmount();
});

