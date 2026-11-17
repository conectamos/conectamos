import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../app/pago-facturas/reminder-status.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const jsx = (type, props) => ({ type, props: props || {} });
const textOf = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(textOf).join("") : textOf(node.props?.children);
const nodes = (node) => node == null || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const state = (extra = {}) => ({ enabled: true, configured: true, recipient: "+57 DESTINO QA", hour: 8, timeZone: "America/Bogota", lastSentAt: "2026-11-16T13:03:00Z", pending: 2, failed: 1, uncertain: 3, ...extra });

function harness(responses = [state()]) {
  const queue = [...responses], slots = [], effects = [], calls = [], pending = [];
  let cursor = 0, dirty = true, view, refresh, liveOptions, writes = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; dirty = true; writes++; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useCallback(callback, deps) { const index = cursor++; if (!slots[index] || !deps.every((value, i) => Object.is(value, slots[index].deps[i]))) slots[index] = { callback, deps }; return slots[index].callback; },
    useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !deps.every((value, i) => Object.is(value, slots[index].deps[i]))) { if (slots[index]?.cleanup) effects.push(slots[index].cleanup); const slot = { deps }; slots[index] = slot; effects.push(() => { slot.cleanup = callback(); }); } },
  };
  const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
  const fetch = async (path, options) => {
    calls.push({ path, ...options });
    const next = queue.shift();
    if (next === "network") throw Error("network");
    if (next === "pending") return new Promise((resolve) => pending.push((body) => resolve(response(body))));
    if (typeof next === "number") return response({}, next);
    return response(next);
  };
  const imports = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: "icon" },
    "@/lib/use-live-refresh": { useLiveRefresh: (callback, options) => { refresh = callback; liveOptions = options; } },
    "./reminder-status.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "fetch", "window", code)((name) => imports[name], mod, mod.exports, fetch, { setTimeout: () => 1, clearTimeout: () => {} });
  function render() { cursor = 0; dirty = false; view = mod.exports.default(); while (effects.length) effects.shift()(); }
  async function settle() { for (let i = 0; i < 8; i++) { if (dirty) render(); await new Promise((resolve) => setImmediate(resolve)); } }
  render();
  return { calls, pending, settle, poll: async () => { await refresh(); await settle(); }, start: () => refresh(), text: () => textOf(view), view: () => view, options: () => liveOptions, writes: () => writes, button: () => nodes(view).find((node) => node.type === "button"), unmount: () => slots.forEach((slot) => slot?.cleanup?.()) };
}

test("reminder status only reads the local status every minute and labels provider acceptance accurately", async () => {
  const ui = harness();
  assert.match(ui.text(), /Consultando recordatorios/); assert.doesNotMatch(ui.text(), /0 pendientes|Sin envíos/);
  assert.deepEqual(ui.options(), { enabled: true, intervalMs: 60000, runOnMount: true });
  await ui.poll();
  assert.match(ui.text(), /Recordatorio por WhatsApp activo/); assert.match(ui.text(), /8:00 a\. m\. de Colombia, aunque la aplicación esté cerrada/);
  assert.match(ui.text(), /Destino: \+57 DESTINO QA/); assert.match(ui.text(), /Último envío aceptado por el proveedor/);
  assert.match(ui.text(), /2 pendientes1 fallidos3 por confirmar/); assert.doesNotMatch(ui.text(), /entregado|leído|correo|email/i);
  assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].path, "/api/pago-facturas/reminders"); assert.equal(ui.calls[0].method ?? "GET", "GET"); assert.equal(ui.calls[0].body, undefined); ui.unmount();
});

test("unconfigured and disabled WhatsApp never promise active deliveries or expose an invented destination", async () => {
  for (const extra of [{ enabled: false, configured: false, recipient: null }, { enabled: true, configured: false, recipient: null }, { enabled: false, configured: true, recipient: "+57 QA" }]) {
    const ui = harness([state({ ...extra, lastSentAt: null, pending: 0, failed: 0, uncertain: 0 })]); await ui.poll();
    assert.match(ui.text(), extra.configured ? /WhatsApp desactivado/ : /WhatsApp pendiente de activar/);
    assert.doesNotMatch(ui.text(), /Recordatorio por WhatsApp activo|aunque la aplicación esté cerrada/);
    if (!extra.recipient) assert.doesNotMatch(ui.text(), /Destino:/);
    assert.match(ui.text(), /Sin envíos aceptados por el proveedor/); ui.unmount();
  }
});

test("failed or malformed first status stays unknown and a read-only retry recovers", async () => {
  for (const first of ["network", 503, {}, state({ pending: -1 }), state({ lastSentAt: "invalid" })]) {
    const ui = harness([first, state()]); await ui.poll();
    assert.match(ui.text(), /Estado de WhatsApp no actualizado/); assert.doesNotMatch(ui.text(), /0 pendientes|Sin envíos aceptados|WhatsApp activo/);
    ui.button().props.onClick(); await ui.settle();
    assert.match(ui.text(), /WhatsApp activo/); assert.equal(ui.calls.length, 2); assert.ok(ui.calls.every((call) => !call.method || call.method === "GET")); ui.unmount();
  }
});

test("refresh errors retain the last known counts with an explicit stale-state message", async () => {
  const ui = harness([state(), "network"]); await ui.poll(); await ui.poll();
  assert.match(ui.text(), /Se muestra la última información recibida/); assert.match(ui.text(), /2 pendientes1 fallidos3 por confirmar/); ui.unmount();
});

test("unauthorized status clears financial reminder data and stops refreshes", async () => {
  for (const status of [401, 403]) {
    const ui = harness([state(), status]); await ui.poll(); await ui.poll();
    assert.equal(ui.view(), null); assert.equal(ui.options().enabled, false); assert.doesNotMatch(ui.text(), /DESTINO QA|pendientes/); ui.unmount();
  }
});

test("unmount cancels an in-flight status read and ignores a late response", async () => {
  const ui = harness(["pending"]); const inFlight = ui.start();
  assert.equal(ui.calls.length, 1); ui.unmount(); assert.equal(ui.calls[0].signal.aborted, true);
  const writesBefore = ui.writes(); ui.pending[0](state()); await inFlight; await ui.settle();
  assert.equal(ui.writes(), writesBefore); assert.doesNotMatch(ui.text(), /DESTINO QA/);
});
