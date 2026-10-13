import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../app/cierre/workspace.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const financier = { key: "PAYJOY", name: "PAYJOY", units: 12, amount: 12_345_678, complete: true, source: "API PayJoy", lastUpdatedAt: "2026-10-13T05:15:00Z" };
const report = {
  period: { from: "2026-09-01", to: "2026-09-30", label: "Septiembre de 2026" },
  scope: { sedeId: null, label: "Todas las sedes" }, totals: { units: 12, amount: 12_345_678 },
  financiers: [financier, { ...financier, key: "ADDI", name: "ADDI", units: null, amount: null, complete: false, source: "CONECTAMOS" }, { ...financier, key: "OTRA", name: "Otra financiera", units: 0, amount: 0 }],
  complete: false, lastUpdatedAt: "2026-10-13T05:15:00Z",
  localSync: { complete: true, pending: 0, lastUpdatedAt: "2026-10-13T05:15:00Z" },
  options: { canSelectSede: true, sedes: [{ id: 2, nombre: "SEDE 2" }, { id: 3, nombre: "SEDE 3" }] },
};

function descendants(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(descendants);
  return [node, ...descendants(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node.type === "function") return textOf(node.type(node.props));
  return textOf(node.props?.children);
}

function harness({ admin = true, delayed = false, reports = [report] } = {}) {
  const slots = [];
  const effects = [];
  const calls = [];
  const pending = [];
  const downloads = [];
  const timers = new Map();
  const dialogCalls = { opened: 0, closed: 0 };
  const dialogElement = { showModal() { dialogCalls.opened++; }, close() { dialogCalls.closed++; } };
  let timerId = 0;
  let now = 0;
  let reportIndex = 0;
  let index = 0;
  let dirty = true;
  let tree;
  const hooks = {
    useState(initial) {
      const position = index++;
      if (!(position in slots)) slots[position] = typeof initial === "function" ? initial() : initial;
      return [slots[position], (value) => { const next = typeof value === "function" ? value(slots[position]) : value; if (!Object.is(next, slots[position])) { slots[position] = next; dirty = true; } }];
    },
    useRef(initial) { return slots[index++] ||= { current: initial }; },
    useEffect(callback, deps) {
      const position = index++;
      if (!slots[position] || !deps.every((value, i) => Object.is(value, slots[position].deps[i]))) {
        if (slots[position]?.cleanup) effects.push(slots[position].cleanup);
        const slot = { deps };
        slots[position] = slot;
        effects.push(() => { slot.cleanup = callback(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const imports = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { __esModule: true, default: "a" },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: "icon" },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: "sidebar" },
    "./cierre.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  const testModule = { exports: {} };
  const mockFetch = async (url, options) => {
    calls.push({ url: String(url), signal: options.signal });
    if (String(url).startsWith("/api/cierre/export?")) return { ok: true, blob: async () => new Blob(["Excel"]) };
    if (String(url).startsWith("/api/cierre/detalle?")) {
      const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
      return { ok: true, json: async () => ({ page, pageSize: 10, total: 12, units: 12, amount: 12_345_678, complete: true, items: Array.from({ length: page === 1 ? 10 : 2 }, (_, i) => ({ id: `${page}-${i}`, date: "2026-09-01T04:59:00Z", creditNumber: `C-${page}-${i}`, customerName: "Cliente", customerDocument: "1.234.567", sedeName: "SEDE 2", amount: 1_000_000, status: "Efectivo", source: "API PayJoy" })) }) };
    }
    const next = reports[Math.min(reportIndex++, reports.length - 1)];
    if (next instanceof Error) return { ok: false, json: async () => ({ error: next.message }) };
    const result = { ...next, options: { ...next.options, canSelectSede: admin } };
    if (delayed) return new Promise((resolve) => pending.push({ signal: options.signal, resolve: (value = result) => resolve({ ok: true, json: async () => value }) }));
    return { ok: true, json: async () => result };
  };
  const documentMock = {
    body: { style: { overflow: "" }, appendChild() {} },
    createElement: () => { const link = { click() { downloads.push(this.download); }, remove() {} }; return link; },
  };
  const urlMock = { createObjectURL: () => "blob:excel", revokeObjectURL() {} };
  new Function("require", "module", "exports", "fetch", "document", "URL", "setTimeout", "clearTimeout", code)((name) => {
    assert.ok(name in imports, `Unexpected UI dependency: ${name}`);
    return imports[name];
  }, testModule, testModule.exports, mockFetch, documentMock, urlMock, (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, at: now + delay });
    return id;
  }, (id) => timers.delete(id));
  function render() {
    index = 0;
    dirty = false;
    tree = testModule.exports.default({ today: "2026-10-13", user: { name: "Ana", sedeId: 2, sedeName: "SEDE 2", isAdmin: admin, operational: true } });
    for (const node of descendants(tree)) {
      if (node.type === "dialog" && node.props.ref) node.props.ref.current = dialogElement;
    }
    while (effects.length) effects.shift()();
  }
  async function settle() {
    for (let i = 0; i < 12; i++) { if (dirty) render(); await new Promise((resolve) => setImmediate(resolve)); }
  }
  function find(type, text) {
    const found = descendants(tree).find((node) => node.type === type && (text === undefined || textOf(node).includes(text)));
    assert.ok(found, `${type} containing ${text} not found`);
    return found;
  }
  async function setControl(label, value) {
    const field = descendants(tree).find((node) => node.type === "label" && node.props.children[0] === label);
    const control = descendants(field).find((node) => node.type === "input" || node.type === "select");
    assert.ok(control, `No control for ${label}`);
    control.props.onChange({ target: { value } });
    await settle();
  }
  async function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
      await settle();
    }
    now = end;
    await settle();
  }
  function unmount() { for (const slot of slots) slot?.cleanup?.(); }
  return { calls, downloads, pending, settle, advance, unmount, timers, dialogCalls, find, setControl, nodes: () => descendants(tree), text: () => textOf(tree), submit: async () => { find("form").props.onSubmit({ preventDefault() {} }); await settle(); } };
}

test("cierre distinguishes pending from confirmed zero, keeps full COP totals and pages the detail", async () => {
  const ui = harness();
  await ui.settle();
  const rows = ui.nodes().filter((node) => node.type === "tr");
  const addi = textOf(rows.find((row) => textOf(row).includes("ADDI")));
  assert.match(addi, /Sin confirmar/);
  assert.doesNotMatch(addi, /\$\s*0/);
  assert.match(textOf(rows.find((row) => textOf(row).includes("Otra financiera"))), /\$\s*0/);
  assert.match(ui.text(), /12\.345\.678/);
  ui.find("button", "PAYJOY").props.onClick({ currentTarget: { focus() {} } });
  await ui.settle();
  assert.equal(ui.nodes().filter((node) => node.type === "tr" && textOf(node).includes("Cliente")).length, 11); // Header + 10 records.
  assert.match(ui.text(), /1234567/);
  assert.match(ui.text(), /31 de ago de 2026/); // Effective instant in Bogotá, before midnight.
  assert.match(ui.text(), /12 registros/);
  ui.find("button", "Siguiente").props.onClick();
  await ui.settle();
  assert.match(ui.text(), /Página 2 de 2/);
  assert.match(ui.calls.at(-1).url, /page=2/);
  assert.match(ui.text(), /12\.345\.678/); // Whole-period total, not page subtotal.
});

test("historical day, week, month and custom range only query the local report when applied", async () => {
  const ui = harness();
  await ui.settle();
  for (const [mode, label, value, expected] of [
    ["day", "Día", "2025-02-28", "date=2025-02-28"],
    ["week", "Un día de la semana", "2025-12-31", "date=2025-12-31"],
    ["month", "Mes", "2024-02", "month=2024-02"],
  ]) {
    const before = ui.calls.length;
    await ui.setControl("Periodo", mode);
    await ui.setControl(label, value);
    assert.equal(ui.calls.length, before);
    await ui.submit();
    assert.equal(ui.calls.length, before + 1);
    assert.ok(ui.calls.at(-1).url.includes(`mode=${mode}`));
    assert.ok(ui.calls.at(-1).url.includes(expected));
  }
  await ui.setControl("Periodo", "range");
  await ui.setControl("Desde", "2023-01-01");
  await ui.setControl("Hasta", "2023-12-31");
  await ui.setControl("Sede", "3");
  await ui.submit();
  const applied = ui.calls.at(-1).url.split("?")[1];
  assert.match(applied, /from=2023-01-01&to=2023-12-31/);
  assert.match(applied, /sedeId=3/);
  await ui.setControl("Desde", "2023-06-01");
  await ui.find("button", "Exportar Excel").props.onClick();
  assert.equal(ui.calls.at(-1).url, `/api/cierre/export?${applied}`);
  ui.find("button", "PAYJOY").props.onClick({ currentTarget: { focus() {} } });
  await ui.settle();
  assert.equal(ui.calls.at(-1).url, `/api/cierre/detalle?${applied}&financier=PAYJOY&page=1`);
  assert.ok(ui.calls.every((call) => call.url.startsWith("/api/cierre")));
});

test("sede users keep their scope through summary, detail and Excel", async () => {
  const ui = harness({ admin: false });
  await ui.settle();
  assert.equal(ui.nodes().filter((node) => node.type === "select").length, 1);
  await ui.find("button", "Exportar Excel").props.onClick();
  ui.find("button", "PAYJOY").props.onClick({ currentTarget: { focus() {} } });
  await ui.settle();
  assert.ok(ui.calls.every((call) => call.url.includes("sedeId=2")));
  assert.ok(!ui.calls.some((call) => call.url.includes("TODAS")));
});

test("invalid custom range preserves the applied result and disables querying", async () => {
  const ui = harness();
  await ui.settle();
  await ui.setControl("Periodo", "range");
  await ui.setControl("Desde", "2026-10-14");
  await ui.setControl("Hasta", "2026-10-13");
  assert.equal(ui.find("button", "Consultar").props.disabled, true);
  assert.match(ui.text(), /La fecha inicial debe ser anterior/);
  const before = ui.calls.length;
  await ui.submit();
  assert.equal(ui.calls.length, before);
  assert.match(ui.text(), /12\.345\.678/);
});

test("pending local sales show progress and poll only the applied period every ten seconds until complete", async () => {
  const awaiting = { ...report, totals: { units: null, amount: null }, financiers: report.financiers.map((row) => ({ ...row, units: null, amount: null, complete: false })), localSync: { complete: false, pending: 23, lastUpdatedAt: null } };
  const partial = { ...report, localSync: { complete: false, pending: 4, lastUpdatedAt: "2026-10-13T05:15:00Z" } };
  const ui = harness({ reports: [awaiting, partial, report] });
  await ui.settle();
  assert.match(ui.text(), /Consulta finalizada/);
  assert.match(ui.text(), /Cargando ventas del periodo: 23 pendientes/);
  assert.match(ui.text(), /Todavía no hay créditos cargados/);
  assert.doesNotMatch(ui.text(), /\$\s*0/);
  const appliedUrl = ui.calls[0].url;
  await ui.setControl("Mes", "2025-09");
  await ui.advance(9999);
  assert.equal(ui.calls.length, 1);
  await ui.advance(1);
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[1].url, appliedUrl);
  assert.match(ui.text(), /Cargando ventas del periodo: 4 pendientes/);
  assert.match(ui.text(), /12\.345\.678/);
  await ui.advance(10_000);
  assert.equal(ui.calls.length, 3);
  assert.doesNotMatch(ui.text(), /Cargando ventas del periodo/);
  assert.match(ui.text(), /Cobertura parcial/); // Provider coverage remains partial.
  await ui.advance(60_000);
  assert.equal(ui.calls.length, 3);
  assert.equal(ui.timers.size, 0);
  assert.ok(ui.calls.every((call) => call.url === appliedUrl));
});

test("Consultar acknowledges a fresh request even when its filter and result do not change", async () => {
  const ui = harness({ delayed: true });
  await ui.settle();
  ui.pending[0].resolve();
  await ui.settle();
  assert.match(ui.text(), /Consulta finalizada/);
  await ui.submit();
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[0].url, ui.calls[1].url);
  assert.match(ui.text(), /Consultando el periodo seleccionado/);
  assert.doesNotMatch(ui.text(), /Consulta finalizada/);
  ui.pending[1].resolve();
  await ui.settle();
  assert.match(ui.text(), /Consulta finalizada/);
  assert.match(ui.text(), /Cobertura sujeta a las fuentes disponibles/);
});

test("automatic updates refresh the open detail with its applied scope and page without reopening the dialog", async () => {
  const partial = { ...report, localSync: { ...report.localSync, complete: false, pending: 4 } };
  const ui = harness({ admin: false, reports: [partial, report] });
  await ui.settle();
  ui.find("button", "PAYJOY").props.onClick({ currentTarget: { focus() {} } });
  await ui.settle();
  ui.find("button", "Siguiente").props.onClick();
  await ui.settle();
  const appliedDetail = ui.calls.at(-1).url;
  await ui.setControl("Mes", "2025-08");
  await ui.advance(10_000);
  assert.equal(ui.calls.at(-1).url, appliedDetail);
  assert.match(appliedDetail, /sedeId=2/);
  assert.match(appliedDetail, /page=2/);
  assert.match(ui.text(), /Página 2 de 2/);
  assert.equal(ui.dialogCalls.opened, 1);
  assert.equal(ui.dialogCalls.closed, 0);
  assert.equal(ui.timers.size, 0);
});

test("failed automatic updates preserve displayed data and retry without calling providers", async () => {
  const partial = { ...report, localSync: { ...report.localSync, complete: false, pending: 4 } };
  const ui = harness({ reports: [partial, new Error("Conexión temporalmente no disponible"), report] });
  await ui.settle();
  await ui.advance(10_000);
  assert.match(ui.text(), /Se conservan los últimos datos/);
  assert.match(ui.text(), /12\.345\.678/);
  assert.equal(ui.find("button", "Consultar").props.disabled, false);
  await ui.advance(10_000);
  assert.doesNotMatch(ui.text(), /Se conservan los últimos datos/);
  assert.match(ui.text(), /Consulta finalizada/);
  assert.equal(ui.timers.size, 0);
  assert.ok(ui.calls.every((call) => call.url.startsWith("/api/cierre?")));
});

test("changing the applied filter cancels an in-flight poll and ignores its stale result", async () => {
  const partial = { ...report, localSync: { ...report.localSync, complete: false, pending: 4 } };
  const ui = harness({ delayed: true, reports: [partial, partial, report] });
  await ui.settle();
  ui.pending[0].resolve();
  await ui.settle();
  await ui.advance(10_000);
  assert.match(ui.text(), /Actualizando los datos/);
  await ui.setControl("Mes", "2025-02");
  await ui.submit();
  assert.equal(ui.pending[1].signal.aborted, true);
  ui.pending[2].resolve({ ...report, period: { ...report.period, label: "Febrero de 2025" } });
  await ui.settle();
  ui.pending[1].resolve({ ...partial, period: { ...report.period, label: "Respuesta anterior" } });
  await ui.settle();
  assert.match(ui.text(), /Febrero de 2025/);
  assert.doesNotMatch(ui.text(), /Respuesta anterior/);
  await ui.advance(30_000);
  assert.equal(ui.calls.length, 3);
  ui.unmount();
  assert.equal(ui.timers.size, 0);
});

test("unmount cancels the next automatic update", async () => {
  const ui = harness({ reports: [{ ...report, localSync: { ...report.localSync, complete: false, pending: 1 } }] });
  await ui.settle();
  assert.equal(ui.timers.size, 1);
  ui.unmount();
  await ui.advance(30_000);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.timers.size, 0);
});

const providerSync = {
  enabled: false, status: "DESACTIVADA", total: 5, queued: 5, reviewed: 0,
  errors: 0, withoutReference: 0, lastSuccessAt: null,
  limitation: "La integración revisa referencias conocidas; no ofrece cobertura exhaustiva del periodo.",
};

test("disabled external reconciliation is explicit and does not promise or poll for progress", async () => {
  const source = { ...report, providerSync, coverageLabel: "Cobertura parcial", financiers: report.financiers.map((row) => row.key === "ADDI" ? { ...row, providerSync, coverageLabel: "Conciliación desactivada", limitation: providerSync.limitation } : row) };
  const ui = harness({ reports: [source] });
  await ui.settle();
  assert.match(ui.text(), /Conciliación externa desactivada/);
  assert.match(ui.text(), /Conciliación desactivada/);
  assert.match(ui.text(), /no ofrece cobertura exhaustiva/);
  assert.doesNotMatch(ui.text(), /se actualiza automáticamente|Se actualiza automáticamente/);
  assert.equal(ui.timers.size, 0);
  await ui.advance(60_000);
  assert.equal(ui.calls.length, 1);
  const unknown = ui.nodes().find((node) => node.type === "tr" && textOf(node).includes("ADDI"));
  assert.match(textOf(unknown), /Sin confirmar/);
  assert.doesNotMatch(textOf(unknown), /\$\s*0/);
});

test("enabled queued references refresh only the local report and stop at reviewed limited coverage", async () => {
  const queued = { ...providerSync, enabled: true, status: "EN_COLA", reviewed: 2, queued: 3 };
  const reviewed = { ...queued, status: "REVISADA_LIMITADA", reviewed: 5, queued: 0 };
  const ui = harness({ reports: [{ ...report, providerSync: queued }, { ...report, providerSync: reviewed }] });
  await ui.settle();
  assert.match(ui.text(), /2 de 5 referencias revisadas · 3 por consultar/);
  assert.match(ui.text(), /Se actualiza automáticamente/);
  await ui.advance(10_000);
  assert.match(ui.text(), /5 referencias revisadas. La cobertura externa es parcial/);
  assert.equal(ui.timers.size, 0);
  assert.doesNotMatch(ui.text(), /Periodo completo/);
  await ui.advance(60_000);
  assert.equal(ui.calls.length, 2);
  assert.ok(ui.calls.every((call) => call.url.startsWith("/api/cierre?")));
});

test("provider errors and missing credit references do not become indefinite loading states", async () => {
  for (const [status, patch, message] of [
    ["ERROR", { errors: 2 }, /2 referencias requieren revisión/],
    ["SIN_REFERENCIA", { withoutReference: 5 }, /Sin referencias de crédito para consultar/],
  ]) {
    const ui = harness({ reports: [{ ...report, providerSync: { ...providerSync, enabled: true, queued: 0, status, ...patch } }] });
    await ui.settle();
    assert.match(ui.text(), message);
    assert.doesNotMatch(ui.text(), /Se actualiza automáticamente/);
    await ui.advance(60_000);
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.timers.size, 0);
  }
});
