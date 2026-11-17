import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../app/_components/invoice-due-notifications.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const jsx = (type, props, key) => ({ type, props: props || {}, key });
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => structuredClone(data) });
const fixture = {
  today: "2026-11-16", counts: { overdue: 11, dueToday: 1, dueSoon: 2 }, total: 14, balance: 1235867.29,
  fingerprint: "2026-11-16-all-invoice-versions", more: true,
  items: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, number: `FAC-${index + 1}`, provider: `Proveedor QA ${index + 1}`,
    dueDate: "2026-11-15", balance: index === 0 ? 1234567.29 : 100, dueStatus: "VENCIDA", version: 1 })),
};
const empty = { today: fixture.today, counts: { overdue: 0, dueToday: 0, dueSoon: 0 }, total: 0, balance: 0, fingerprint: "empty-today", more: false, items: [] };
function resolve(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return text(node.props?.children);
}
const sameDeps = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

function harness({ userKey = "7:11", storage = new Map(), storageFails = false, externalDialog = false } = {}) {
  const slots = [], effects = [], calls = [], queue = [], timers = new Map();
  let cursor = 0, dirty = true, tree, refresh, options, unmounted = false, updatesAfterUnmount = 0, timerId = 0;
  const document = { body: { style: { overflow: "auto" } }, activeElement: null,
    querySelector(selector) { assert.equal(selector, "dialog[open]"); return externalDialog ? { open: true } : dialog.open ? dialog : null; } };
  class Element {
    isConnected = true;
    focus() { document.activeElement = this; }
  }
  const trigger = new Element(); const closeButton = new Element(); document.activeElement = trigger;
  const dialog = { open: false, opened: 0, closed: 0,
    showModal() { this.open = true; this.opened++; closeButton.focus(); },
    close() { this.open = false; this.closed++; } };
  const window = { localStorage: {
    getItem(key) { if (storageFails) throw Error("Storage unavailable"); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageFails) throw Error("Storage unavailable"); storage.set(key, value); },
  }, setTimeout(callback, milliseconds) { const id = ++timerId; timers.set(id, { callback, milliseconds }); return id; },
  clearTimeout(id) { timers.delete(id); } };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        if (unmounted) { updatesAfterUnmount++; return; }
        const next = typeof value === "function" ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useMemo(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].dependencies, dependencies)) slots[index] = { value: callback(), dependencies };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) {
      const index = cursor++; const before = slots[index];
      if (!before || !sameDeps(before.dependencies, dependencies)) {
        const next = { dependencies }; slots[index] = next;
        effects.push(() => { before?.cleanup?.(); next.cleanup = callback(); });
      }
    },
  };
  const imports = { react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": { __esModule: true, default: (props) => jsx("a", props) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: (props) => jsx("svg", { "data-icon": props.name }) },
    "@/lib/monthly-reports-view": { formatoPesos: (amount) => `$ ${amount.toLocaleString("es-CO", { maximumFractionDigits: 2 })}` },
    "@/lib/use-live-refresh": { useLiveRefresh(callback, value) { refresh = callback; options = value; } },
    "./invoice-due-notifications.module.css": { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) },
  };
  const componentModule = { exports: {} };
  new Function("require", "module", "exports", "fetch", "window", "document", "HTMLElement", source)((name) => {
    assert.ok(name in imports, `Unexpected import ${name}`); return imports[name];
  }, componentModule, componentModule.exports, async (url, fetchOptions) => {
    calls.push({ url, options: fetchOptions });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(fetchOptions.signal) : next || response(fixture);
  }, window, document, Element);
  const Component = componentModule.exports.InvoiceDueNotificationSession;
  assert.equal(typeof Component, "function", "La sesión interna debe poder comprobarse por separado del wrapper con key");
  function render() {
    if (unmounted) return;
    let runs = 0;
    do {
      cursor = 0; dirty = false; tree = resolve(Component({ userKey }));
      const native = nodes(tree).find((node) => node.type === "dialog");
      if (native?.props.ref) native.props.ref.current = dialog;
      while (effects.length) effects.shift()();
      assert.ok(++runs < 20, "Render loop");
    } while (dirty);
  }
  async function flush() { for (let n = 0; n < 8; n++) { await Promise.resolve(); if (dirty) render(); } }
  async function tick(data = fixture, status = 200) {
    if (!options.enabled) return;
    queue.push(data instanceof Error ? data : response(data, status));
    await refresh(); await flush();
  }
  render();
  return { calls, storage, document, dialog, trigger, timers,
    get tree() { return tree; }, get text() { return text(tree).replace(/\s+/g, " ").trim(); }, get options() { return options; },
    get updatesAfterUnmount() { return updatesAfterUnmount; }, get modal() { return nodes(tree).find((node) => node.type === "dialog"); },
    tick, flush,
    wrapper(key) { return componentModule.exports.default({ userKey: key }); },
    setExternalDialog(value) { externalDialog = value; },
    async click(label, result = fixture) {
      const node = nodes(tree).find((item) => ["button", "a"].includes(item.type) && (item.props["aria-label"] === label || text(item).trim() === label));
      assert.ok(node, `Falta ${label}`); queue.push(response(result)); node.props.onClick(); render(); await flush();
      // Close-only actions don't consume fetch input.
      queue.length = 0;
    },
    escape() { let prevented = false; this.modal.props.onCancel({ preventDefault() { prevented = true; } }); render(); return prevented; },
    startDeferred() {
      let finish;
      queue.push(() => new Promise((resolve) => { finish = (value) => resolve(response(value)); }));
      const done = refresh().then(flush); const signal = calls.at(-1).options.signal;
      return { done, signal, finish: (value = fixture) => finish(value) };
    },
    unmount() { unmounted = true; slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test("consulta local al montar, abre diálogo y muestra totales de todas las facturas con máximo diez detalles", async () => {
  const p = harness();
  assert.deepEqual(p.options, { enabled: true, intervalMs: 60_000, runOnMount: true });
  assert.equal(p.modal, undefined); await p.tick();
  assert.equal(p.calls.length, 1); assert.equal(p.calls[0].url, "/api/pago-facturas/alerts");
  assert.equal(p.calls[0].options.cache, "no-store"); assert.ok(p.calls[0].options.signal instanceof AbortSignal);
  assert.ok(p.modal); assert.equal(p.dialog.open, true); assert.equal(p.document.body.style.overflow, "hidden");
  assert.equal(nodes(p.tree).filter((node) => node.type === "li").length, 10);
  assert.match(p.text, /14 facturas/); assert.match(p.text, /\$ 1\.234\.567,29/); assert.match(p.text, /11 vencidas/);
  assert.match(p.text, /Se muestran las 10 primeras/); assert.equal(p.timers.size, 0); p.unmount();
});

test("cierre persiste fingerprint por usuario; los mismos datos no reabren y cambios o nuevo día sí", async () => {
  const p = harness(); await p.tick(); await p.click("Entendido");
  assert.equal(p.modal, undefined); assert.equal(p.storage.get("conectamos:invoice-due-reviewed:7:11"), fixture.fingerprint);
  await p.tick(); assert.equal(p.modal, undefined);
  await p.tick({ ...fixture, fingerprint: "invoice-version-changed" }); assert.ok(p.modal);
  await p.click("Cerrar avisos de facturas");
  await p.tick({ ...fixture, today: "2026-11-17", fingerprint: "next-bogota-day" }); assert.ok(p.modal); p.unmount();
});

test("wrapper fuerza remontaje por identidad y el almacenamiento no silencia a otro administrador", async () => {
  const storage = new Map(); const first = harness({ storage });
  assert.equal(first.wrapper("7:11").key, "7:11"); assert.equal(first.wrapper("8:12").key, "8:12");
  assert.equal(first.wrapper("8:12").props.userKey, "8:12");
  await first.tick(); await first.click("Entendido"); first.unmount();
  const same = harness({ storage }); await same.tick(); assert.equal(same.modal, undefined); same.unmount();
  const other = harness({ storage, userKey: "8:12" }); await other.tick(); assert.ok(other.modal); other.unmount();
});

test("storage bloqueado conserva cierre en memoria, Escape y recuperación de foco", async () => {
  const p = harness({ storageFails: true }); await p.tick();
  assert.equal(p.escape(), true); assert.equal(p.dialog.open, false);
  assert.equal(p.document.body.style.overflow, "auto"); assert.equal(p.document.activeElement, p.trigger);
  await p.tick(); assert.equal(p.modal, undefined);
  await p.tick({ ...fixture, fingerprint: "changed" }); assert.ok(p.modal); p.unmount();
});

test("la consulta vacía confirmada retira diálogo y campana sin mostrar deuda ficticia", async () => {
  const p = harness(); await p.tick(); await p.tick(empty);
  assert.equal(p.modal, undefined); assert.equal(nodes(p.tree).filter((node) => node.type === "button").length, 0);
  assert.equal(p.document.body.style.overflow, "auto"); p.unmount();
});

test("errores de red, HTTP y payload inválido conservan los últimos datos y ofrecen reintentar", async () => {
  const p = harness(); await p.tick(new Error("Offline"));
  assert.equal(p.modal, undefined); assert.match(p.text, /Revisar avisos/); assert.ok(!p.text.includes("0 facturas"));
  await p.tick();
  for (const [data, status] of [[{ error: "Unavailable" }, 503], [new Error("Network"), 200], [{}, 200]]) {
    await p.tick(data, status); assert.ok(p.modal); assert.match(p.text, /14 facturas/); assert.match(p.text, /Los datos pueden haber cambiado/);
  }
  await p.tick(); assert.ok(!p.text.includes("Los datos pueden haber cambiado")); p.unmount();
});

test("401 y 403 eliminan los datos visibles y detienen actualizaciones de esa sesión", async () => {
  for (const status of [401, 403]) {
    const p = harness(); await p.tick(); await p.tick({ error: "No autorizado" }, status);
    assert.equal(p.tree, null); assert.equal(p.options.enabled, false); assert.equal(p.dialog.open, false);
    const count = p.calls.length; await p.tick(); assert.equal(p.calls.length, count); p.unmount();
  }
});

test("no interrumpe un formulario abierto y conserva acceso manual sin ejecutar pagos", async () => {
  const p = harness({ externalDialog: true }); await p.tick();
  assert.equal(p.modal, undefined); assert.match(p.text, /Facturas por pagar/);
  p.setExternalDialog(false); await p.tick(); assert.ok(p.modal);
  const link = nodes(p.tree).find((node) => node.type === "a"); assert.equal(link.props.href, "/pago-facturas");
  await p.click("Ir a pagar facturas"); assert.equal(p.modal, undefined);
  assert.ok(p.calls.every((call) => call.url === "/api/pago-facturas/alerts" && !call.options.method)); p.unmount();
});

test("campana vuelve a abrir el aviso descartado a petición del usuario", async () => {
  const p = harness(); await p.tick(); await p.click("Entendido");
  await p.click("14 facturas requieren atención. Ver avisos"); assert.ok(p.modal); p.unmount();
});

test("aborta consultas reemplazadas y desmontadas e ignora respuestas tardías", async () => {
  const p = harness(); const old = p.startDeferred();
  await p.tick({ ...fixture, fingerprint: "newest" }); assert.equal(old.signal.aborted, true);
  old.finish(empty); await old.done; assert.ok(p.modal); assert.match(p.text, /14 facturas/);
  const pending = p.startDeferred(); p.unmount(); assert.equal(pending.signal.aborted, true);
  pending.finish(empty); await pending.done; assert.equal(p.updatesAfterUnmount, 0); assert.equal(p.timers.size, 0);
});
