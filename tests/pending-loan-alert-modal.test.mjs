import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const fixture = Array.from({ length: 9 }, (_, index) => ({
  id: 800 + index, creadoEn: "2026-10-24T20:00:00.000Z", costo: index === 0 ? 1234567890.25 : 1350000 + index,
  imei: `00123456789012${index}`, referencia: `REFERENCIA COMPLETA ${index} CON CAPACIDAD Y CONDICIÓN`,
  sedeOrigenNombre: `Sede remitente completa ${index}`,
}));
const payload = { total: 17, items: fixture };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const equalDependencies = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));

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

function probe({ sessionKey = "qa-session", storage = new Map(), storageFails = false } = {}) {
  let currentKey = sessionKey, cursor = 0, effectCursor = 0, tree = null, refreshCallback, refreshOptions;
  const slots = [], effects = [], pendingEffects = [], calls = [];
  const queue = [];
  const document = { body: { style: { overflow: "auto" } }, activeElement: null };
  class FakeHTMLElement {
    isConnected = true;
    focusCount = 0;
    focus() { this.focusCount += 1; document.activeElement = this; }
  }
  const trigger = new FakeHTMLElement();
  document.activeElement = trigger;
  const closeButton = new FakeHTMLElement();
  const nativeDialog = {
    open: false, opened: 0, closed: 0,
    showModal() { this.open = true; this.opened += 1; },
    close() { this.open = false; this.closed += 1; },
    querySelector(selector) { assert.equal(selector, "button"); return closeButton; },
  };
  const window = { sessionStorage: {
    getItem(key) { if (storageFails) throw new Error("Storage bloqueado"); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageFails) throw new Error("Storage bloqueado"); storage.set(key, value); },
  } };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ||= { current: initial };
    },
    useMemo(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || !equalDependencies(slots[index].dependencies, dependencies)) slots[index] = { value: callback(), dependencies };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || !equalDependencies(previous.dependencies, dependencies)) pendingEffects.push(() => {
        previous?.cleanup?.(); effects[index] = { dependencies, cleanup: callback() };
      });
    },
  };
  const compiled = ts.transpileModule(readFileSync("app/dashboard/_components/pending-loan-alert-modal.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const imports = {
    react: hooks, "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: props => jsx.jsx("a", props) },
    "@/lib/use-live-refresh": { useLiveRefresh(callback, options) { refreshCallback = callback; refreshOptions = options; } },
    "./dashboard-icon": { __esModule: true, default: props => jsx.jsx("svg", { "data-icon": props.name }) },
    "./pending-loan-alert-modal.module.css": { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "window", "document", "HTMLElement", "fetch", compiled)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loaded, loaded.exports, window, document, FakeHTMLElement, async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next || response(payload);
  });
  const Component = loaded.exports.default;
  const render = () => {
    cursor = 0; effectCursor = 0; pendingEffects.length = 0;
    tree = resolve(Component({ sessionKey: currentKey }));
    const dialog = elements(tree).find(node => node.type === "dialog");
    if (dialog?.props.ref) dialog.props.ref.current = nativeDialog;
    pendingEffects.forEach(run => run());
    return tree;
  };
  render();
  return {
    calls, storage, queue, document, nativeDialog, trigger, closeButton,
    get tree() { return tree; }, get options() { return refreshOptions; },
    async refresh(value = payload, status = 200) { queue.push(value instanceof Error ? value : response(value, status)); await refreshCallback(); return render(); },
    async changeSession(key) { currentKey = key; render(); await refreshCallback(); return render(); },
    click(label) {
      const button = elements(tree).find(node => (node.type === "button" || node.type === "a") && (node.props["aria-label"] === label || textOf(node).trim() === label));
      assert.ok(button, `Falta la acción ${label}`); button.props.onClick(); return render();
    },
    escape() { let prevented = false; const dialog = elements(tree).find(node => node.type === "dialog"); dialog.props.onCancel({ preventDefault() { prevented = true; } }); render(); return prevented; },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

test("el aviso usa solo la consulta autorizada actual y conserva la actualización cada treinta segundos", async () => {
  const p = probe();
  assert.equal(p.tree, null);
  assert.deepEqual(p.options, { intervalMs: 30000, runOnMount: true });
  await p.refresh();
  assert.deepEqual(p.calls, [{ url: "/api/prestamos/pendientes-destino", options: { cache: "no-store" } }]);
  p.unmount();
});

test("muestra el total real y seis solicitudes completas sin confundir el resto con el listado visible", async () => {
  const p = probe(); await p.refresh();
  const text = textOf(p.tree).replace(/\s+/g, " ");
  assert.match(text, /17 equipos por recibir/);
  assert.match(text, /Mostrando 6 de 17/);
  assert.match(text, /Consulta 11 equipos adicionales/);
  assert.equal(elements(p.tree).filter(node => node.type === "article").length, 6);
  for (const item of fixture.slice(0, 6)) {
    assert.ok(text.includes(item.referencia)); assert.ok(text.includes(item.imei)); assert.ok(text.includes(item.sedeOrigenNombre));
  }
  assert.ok(text.includes("$ 1.234.567.890,25"));
  assert.ok(!text.includes(fixture[6].referencia));
  p.unmount();
});

test("el único acceso de revisión conserva préstamos y no aprueba ni paga desde la alerta", async () => {
  const p = probe(); await p.refresh();
  const links = elements(p.tree).filter(node => node.type === "a");
  assert.equal(links.length, 1); assert.equal(links[0].props.href, "/prestamos");
  assert.equal(textOf(links[0]).trim(), "Revisar y aprobar");
  p.click("Revisar y aprobar");
  assert.equal(p.tree, null);
  assert.ok(p.calls.every(call => call.url === "/api/prestamos/pendientes-destino" && !call.options.method));
});

test("recordar después evita volver a mostrar los mismos IDs aunque cambie su orden", async () => {
  const p = probe(); await p.refresh(); p.click("Recordar después");
  assert.equal(p.tree, null);
  assert.equal(p.storage.get("conectamos:prestamos-destino-revisados:qa-session"), "800,801,802,803,804,805,806,807,808");
  await p.refresh({ ...payload, items: [...fixture].reverse() });
  assert.equal(p.tree, null);
  await p.refresh({ total: 18, items: [...fixture, { ...fixture[0], id: 990 }] });
  assert.ok(p.tree); p.unmount();
});

test("la firma de recordatorio sigue aislada por sesión y persiste al remontar", async () => {
  const storage = new Map();
  const first = probe({ storage }); await first.refresh(); first.click("Recordar después"); first.unmount();
  const same = probe({ storage }); await same.refresh(); assert.equal(same.tree, null); same.unmount();
  const other = probe({ storage, sessionKey: "otra-sesion" }); await other.refresh(); assert.ok(other.tree); other.unmount();
});

test("cerrar sigue funcionando con almacenamiento bloqueado y no reaparece en cada actualización", async () => {
  const p = probe({ storageFails: true }); await p.refresh();
  assert.ok(p.tree); p.click("Cerrar alerta de préstamo"); assert.equal(p.tree, null);
  await p.refresh(); assert.equal(p.tree, null);
  await p.refresh({ total: 1, items: [{ ...fixture[0], id: 777 }] }); assert.ok(p.tree); p.unmount();
});

test("el modal nativo contiene el foco, permite Escape y restaura el foco y el desplazamiento", async () => {
  const p = probe(); await p.refresh();
  assert.equal(p.tree.type, "dialog"); assert.equal(p.tree.props.role, "dialog"); assert.equal(p.tree.props["aria-modal"], "true");
  assert.equal(p.tree.props["aria-labelledby"], "titulo-alerta-prestamo");
  assert.equal(p.nativeDialog.open, true); assert.equal(p.document.activeElement, p.closeButton); assert.equal(p.document.body.style.overflow, "hidden");
  assert.equal(p.escape(), true);
  assert.equal(p.nativeDialog.open, false); assert.equal(p.document.activeElement, p.trigger); assert.equal(p.document.body.style.overflow, "auto");
  assert.equal(p.tree, null);
});

test("un fallo temporal no bloquea el dashboard ni elimina una alerta vigente", async () => {
  const p = probe(); await p.refresh(new Error("Red temporal")); assert.equal(p.tree, null);
  await p.refresh(); const original = textOf(p.tree);
  await p.refresh({ error: "Error temporal" }, 500); assert.equal(textOf(p.tree), original);
  await p.refresh(new Error("Sin conexión")); assert.equal(textOf(p.tree), original);
  p.unmount(); assert.equal(p.document.body.style.overflow, "auto");
});

test("no muestra un modal vacío y se cierra cuando el servidor ya no informa pendientes", async () => {
  const p = probe(); await p.refresh({ total: 0, items: [] }); assert.equal(p.tree, null);
  await p.refresh(); assert.ok(p.tree);
  await p.refresh({ total: 0, items: [] }); assert.equal(p.tree, null);
  await p.refresh({ total: 0, items: fixture }); assert.equal(p.tree, null);
  await p.refresh({ total: 9, items: [] }); assert.equal(p.tree, null);
});

test("el singular conserva todos los datos y no inventa equipos adicionales", async () => {
  const p = probe(); await p.refresh({ total: 1, items: fixture.slice(0, 1) });
  const text = textOf(p.tree).replace(/\s+/g, " "); assert.match(text, /1 equipo por recibir/); assert.match(text, /Mostrando 1 de 1/); assert.ok(!text.includes("adicional"));
  p.unmount();
});
