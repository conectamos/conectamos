import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function transpile(relative) {
  return ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
}
const code = transpile("app/pago-facturas/workspace.tsx");
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function nodes(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === "function") return [node, ...nodes(node.type(node.props))];
  return [node, ...nodes(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return typeof node.type === "function" ? textOf(node.type(node.props)) : textOf(node.props?.children);
}
const money = (amount) => `${amount < 0 ? "-" : ""}$ ${Math.abs(amount).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
const invoice = (id, extra = {}) => ({ id, number: `FAC-${id}`, provider: `Proveedor ${id}`, date: "2026-11-01", amount: 1000, paidAmount: 0, balance: 1000, status: "PENDIENTE", paymentCount: 0, version: 1, payments: [], ...extra });
const result = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });

function harness({ invoices = [invoice(1)], postOutcomes = [], delayLists = false, listFailures = 0 } = {}) {
  const data = structuredClone(invoices);
  const calls = [];
  const pendingLists = [];
  const replay = new Map();
  const slots = [];
  const effects = [];
  let cursor = 0;
  let dirty = true;
  let tree;
  let postIndex = 0;
  const dialogs = { opened: 0, closed: 0 };
  const dialogElement = { showModal() { dialogs.opened++; }, close() { dialogs.closed++; } };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { const next = typeof value === "function" ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !deps.every((value, i) => Object.is(value, slots[index].deps[i]))) { if (slots[index]?.cleanup) effects.push(slots[index].cleanup); const slot = { deps }; slots[index] = slot; effects.push(() => { slot.cleanup = callback(); }); } },
  };
  function list(url) {
    const month = url.searchParams.get("month");
    const search = url.searchParams.get("search").toLocaleLowerCase("es-CO");
    const selected = data.filter((item) => item.date.startsWith(month) && `${item.provider} ${item.number}`.toLocaleLowerCase("es-CO").includes(search));
    const pending = selected.filter((item) => item.balance > 0);
    const paid = selected.filter((item) => item.balance === 0);
    const sum = (key) => selected.reduce((cents, item) => cents + Math.round(item[key] * 100), 0) / 100;
    function page(items, field) { const pages = Math.max(1, Math.ceil(items.length / 10)); const number = Math.min(pages, Number(url.searchParams.get(field))); return { items: structuredClone(items.slice((number - 1) * 10, number * 10)), page: number, pageSize: 10, total: items.length, pages }; }
    return { month, today: "2026-11-16", summary: { invoiceCount: selected.length, totalAmount: sum("amount"), paidAmount: sum("paidAmount"), balance: sum("balance"), pendingCount: pending.length, paidCount: paid.length }, pending: page(pending, "pendingPage"), paid: page(paid, "paidPage") };
  }
  const mockFetch = async (path, options = {}) => {
    const url = new URL(path, "http://localhost");
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: String(path), method: options.method || "GET", body, signal: options.signal });
    if (options.method === "POST") {
      const outcome = postOutcomes[postIndex++];
      if (outcome === "503") return result({ error: "Servicio temporalmente no disponible." }, 503);
      if (replay.has(body.requestId)) return result({ invoice: replay.get(body.requestId) });
      let saved;
      if (url.pathname === "/api/pago-facturas") {
        if (data.some((item) => item.provider === body.provider && item.number === body.number)) return result({ error: "La factura ya existe." }, 409);
        saved = invoice(data.length + 1, { number: body.number, provider: body.provider, date: body.date, amount: body.amount, balance: body.amount });
        data.push(saved);
      } else {
        saved = data.find((item) => item.id === Number(url.pathname.split("/")[3]));
        if (saved.version !== body.version) return result({ error: "La factura cambió. Actualiza sus datos.", code: "STALE_VERSION" }, 409);
        const amount = body.mode === "full" ? saved.balance : body.amount;
        saved.paidAmount = (Math.round(saved.paidAmount * 100) + Math.round(amount * 100)) / 100;
        saved.balance = (Math.round(saved.amount * 100) - Math.round(saved.paidAmount * 100)) / 100;
        saved.status = saved.balance === 0 ? "PAGADA" : "PENDIENTE";
        saved.version++;
        saved.paymentCount++;
        saved.payments.push({ id: saved.paymentCount, date: body.date, amount, reference: body.reference, createdBy: "Administración QA", createdAt: "2026-11-16T16:30:00Z" });
      }
      replay.set(body.requestId, structuredClone(saved));
      if (outcome === "commit-network") throw new Error("Connection lost after commit");
      return result({ invoice: saved });
    }
    if (url.pathname === "/api/pago-facturas") {
      if (listFailures > 0) { listFailures--; return result({ error: "No fue posible consultar el mes." }, 503); }
      const snapshot = list(url);
      if (delayLists) return new Promise((resolve) => pendingLists.push({ resolve: () => resolve(result(snapshot)), signal: options.signal }));
      return result(snapshot);
    }
    return result({ invoice: data.find((item) => item.id === Number(url.pathname.split("/")[3])) });
  };
  const imports = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { __esModule: true, default: "a" },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: "icon" },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: "sidebar" },
    "@/lib/monthly-reports-view": { formatoPesos: money },
    "./pago-facturas.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "fetch", "document", code)((name) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; }, mod, mod.exports, mockFetch, { body: { style: { overflow: "" } } });
  function render() { cursor = 0; dirty = false; tree = mod.exports.default({ today: "2026-11-16", userName: "Administración QA" }); for (const node of nodes(tree)) if (node.type === "dialog") node.props.ref.current = dialogElement; while (effects.length) effects.shift()(); }
  async function settle() { for (let i = 0; i < 12; i++) { if (dirty) render(); await new Promise((resolve) => setImmediate(resolve)); } }
  function find(type, text) { const node = nodes(tree).find((item) => item.type === type && (text === undefined || textOf(item).includes(text))); assert.ok(node, `Missing ${type}: ${text}`); return node; }
  function byLabel(label) { const node = nodes(tree).find((item) => item.props["aria-label"] === label); assert.ok(node, `Missing label: ${label}`); return node; }
  function field(label) { const wrapper = nodes(tree).find((node) => node.type === "label" && [node.props.children].flat().filter((child) => typeof child === "string").join("") === label); const input = nodes(wrapper).find((node) => node.type === "input"); assert.ok(input, `Missing field ${label}`); return input; }
  async function setControl(label, value) { field(label).props.onChange({ target: { value } }); await settle(); }
  async function click(button) { button.props.onClick({ currentTarget: { focus() {} } }); await settle(); }
  async function submit() { const form = nodes(find("dialog")).find((node) => node.type === "form"); assert.ok(form); await form.props.onSubmit({ preventDefault() {} }); await settle(); }
  async function apply() { await find("form").props.onSubmit({ preventDefault() {} }); await settle(); }
  return { data, calls, pendingLists, dialogs, settle, find, byLabel, field, setControl, click, submit, apply, text: () => textOf(tree), nodes: () => nodes(tree), unmount: () => slots.forEach((slot) => slot?.cleanup?.()) };
}

test("invoice page restricts central administration before rendering any financial UI", async () => {
  const access = { exports: {} };
  new Function("module", "exports", transpile("lib/access-control.ts"))(access, access.exports);
  for (const [session, allowed] of [
    [{ rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" }, true],
    [{ rolNombre: "ADMIN", perfilTipo: null }, true],
    [{ rolNombre: "ADMIN", perfilTipo: "SUPERVISOR_TIENDA" }, false],
    [{ rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }, false],
    [{ rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" }, false],
    [{ rolNombre: "BODEGA", perfilTipo: "BODEGA" }, false],
  ]) {
    const mod = { exports: {} };
    const imports = { "next/navigation": { redirect: (path) => { throw new Error(`Redirect ${path}`); } }, "@/lib/access-control": access.exports, "@/lib/page-access": { requireSessionPage: async () => ({ ...session, nombre: "QA" }) }, "@/lib/ventas-utils": { getTodayBogotaDateKey: () => "2026-11-16" }, "./workspace": { __esModule: true, default: "workspace" }, "react/jsx-runtime": { jsx } };
    new Function("require", "module", "exports", transpile("app/pago-facturas/page.tsx"))((name) => imports[name], mod, mod.exports);
    if (allowed) { const view = await mod.exports.default(); assert.equal(view.type, "workspace"); assert.equal(view.props.today, "2026-11-16"); }
    else await assert.rejects(mod.exports.default(), /Redirect \/dashboard/);
  }
});

test("monthly columns paginate independently while summaries include all filtered invoices", async () => {
  const invoices = [...Array.from({ length: 12 }, (_, i) => invoice(i + 1)), ...Array.from({ length: 11 }, (_, i) => invoice(i + 13, { paidAmount: 1000, balance: 0, status: "PAGADA", paymentCount: 1 }))];
  const ui = harness({ invoices }); await ui.settle();
  assert.match(ui.text(), /FACTURAS PENDIENTES12/); assert.match(ui.text(), /FACTURAS PAGAS11/);
  assert.match(textOf(ui.byLabel("Resumen de facturas del mes")), /Total facturas\$ 23\.00023 facturas.*Abonado\$ 11\.000.*Saldo pendiente\$ 12\.000/);
  assert.equal(ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").length, 20);
  await ui.click(ui.byLabel("Página siguiente de pendientes"));
  assert.match(ui.calls.at(-1).path, /pendingPage=2&paidPage=1/);
  assert.match(textOf(ui.byLabel("Resumen de facturas del mes")), /\$ 23\.000/);
  await ui.click(ui.byLabel("Página siguiente de pagas"));
  assert.match(ui.calls.at(-1).path, /pendingPage=2&paidPage=2/);
  assert.equal(ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").length, 3);
  ui.unmount();
});

test("historical months and searches only apply on Consultar and reset both page numbers", async () => {
  const ui = harness({ invoices: [invoice(1), invoice(2, { date: "2025-02-01", provider: "Proveedor histórico" })] }); await ui.settle();
  const before = ui.calls.length;
  await ui.setControl("Mes de la factura", "2025-02"); await ui.setControl("Buscar factura o proveedor", "histórico");
  assert.equal(ui.calls.length, before); assert.match(ui.text(), /Filtros sin aplicar/);
  await ui.apply();
  const url = new URL(ui.calls.at(-1).path, "http://localhost");
  assert.equal(url.searchParams.get("month"), "2025-02"); assert.equal(url.searchParams.get("search"), "histórico");
  assert.equal(url.searchParams.get("pendingPage"), "1"); assert.equal(url.searchParams.get("paidPage"), "1");
  assert.match(ui.text(), /Proveedor histórico/); assert.doesNotMatch(ui.text(), /Proveedor 1/);
  await ui.click(ui.find("button", "Nueva factura"));
  assert.equal(ui.field("Fecha de la factura").props.value, "2025-02-01"); ui.unmount();
});

test("new invoices preserve full COP amounts and refresh both columns and summaries", async () => {
  const ui = harness({ invoices: [] }); await ui.settle();
  await ui.click(ui.find("button", "Nueva factura"));
  await ui.setControl("Proveedor", "Comercial QA"); await ui.setControl("Número de factura", "FACT-001"); await ui.setControl("Valor de la factura (COP)", "1.250.000,50");
  await ui.submit();
  const write = ui.calls.find((call) => call.method === "POST");
  assert.equal(write.path, "/api/pago-facturas"); assert.equal(write.body.amount, 1250000.5); assert.equal(write.body.date, "2026-11-16"); assert.match(write.body.requestId, /^[a-f\d-]{36}$/i);
  assert.equal(ui.data.length, 1); assert.equal(ui.nodes().filter((node) => node.type === "dialog").length, 0);
  assert.match(ui.text(), /Factura FACT-001 registrada/); assert.match(ui.text(), /Comercial QA/); assert.match(textOf(ui.byLabel("Resumen de facturas del mes")), /1\.250\.000,5/);
  assert.match(ui.calls.at(-1).path, /\/api\/pago-facturas\?/); ui.unmount();
});

test("partial payment reduces balance and full payment moves invoice into pagas within invoice month", async () => {
  const ui = harness(); await ui.settle();
  await ui.click(ui.find("button", "Abonar / pagar"));
  await ui.setControl("Abono parcial", "partial"); await ui.setControl("Valor del abono (COP)", "400,25"); await ui.setControl("Fecha del pago", "2026-12-05"); await ui.setControl("Referencia o comprobante (opcional)", "Transferencia 001");
  assert.match(textOf(ui.find("dialog")), /Saldo después del pago\$ 599,75/);
  await ui.submit();
  assert.equal(ui.data[0].balance, 599.75); assert.equal(ui.data[0].status, "PENDIENTE"); assert.match(ui.text(), /Abono parcial/);
  await ui.click(ui.find("button", "Abonar / pagar")); await ui.submit();
  const writes = ui.calls.filter((call) => call.method === "POST");
  assert.equal(writes[1].body.mode, "full"); assert.ok(!Object.hasOwn(writes[1].body, "amount")); assert.equal(writes[1].body.version, 2);
  assert.equal(ui.data[0].balance, 0); assert.equal(ui.data[0].paymentCount, 2); assert.equal(ui.data[0].status, "PAGADA"); assert.equal(ui.data[0].date, "2026-11-01");
  assert.match(ui.text(), /FACTURAS PENDIENTES0/); assert.match(ui.text(), /FACTURAS PAGAS1/);
  await ui.click(ui.byLabel("Ver pagos de factura FAC-1"));
  assert.match(textOf(ui.find("dialog")), /05 de dic de 2026\$ 400,25Transferencia 001/); assert.match(textOf(ui.find("dialog")), /Administración QA/);
  ui.unmount();
});

test("ambiguous payment result locks intent and retry uses the same key and body without a duplicate", async () => {
  const ui = harness({ postOutcomes: ["commit-network"] }); await ui.settle();
  await ui.click(ui.find("button", "Abonar / pagar")); await ui.setControl("Abono parcial", "partial"); await ui.setControl("Valor del abono (COP)", "300"); await ui.submit();
  assert.equal(ui.data[0].paymentCount, 1); assert.match(textOf(ui.find("dialog")), /Reintentar pago/);
  assert.equal(ui.field("Valor del abono (COP)").props.disabled, true); assert.equal(ui.find("button", "Cancelar").props.disabled, true);
  const first = ui.calls.find((call) => call.method === "POST");
  await ui.submit();
  const writes = ui.calls.filter((call) => call.method === "POST"); assert.deepEqual(writes[1].body, first.body);
  assert.equal(ui.data[0].paymentCount, 1); assert.equal(ui.data[0].paidAmount, 300); assert.equal(ui.data[0].balance, 700);
  assert.equal(ui.nodes().filter((node) => node.type === "dialog").length, 0); ui.unmount();
});

test("ambiguous invoice creation retries the original request instead of adding another invoice", async () => {
  const ui = harness({ invoices: [], postOutcomes: ["commit-network"] }); await ui.settle(); await ui.click(ui.find("button", "Nueva factura"));
  await ui.setControl("Proveedor", "Proveedor QA"); await ui.setControl("Número de factura", "N-1"); await ui.setControl("Valor de la factura (COP)", "500"); await ui.submit();
  assert.equal(ui.data.length, 1); assert.equal(ui.field("Proveedor").props.disabled, true); assert.match(textOf(ui.find("dialog")), /Reintentar registro/);
  await ui.submit(); const writes = ui.calls.filter((call) => call.method === "POST"); assert.deepEqual(writes[1].body, writes[0].body); assert.equal(ui.data.length, 1); ui.unmount();
});

test("stale invoice version requires explicit refresh before a new payment intent", async () => {
  const ui = harness(); await ui.settle(); await ui.click(ui.find("button", "Abonar / pagar"));
  ui.data[0].version = 2; ui.data[0].paidAmount = 100; ui.data[0].balance = 900;
  await ui.submit(); assert.match(textOf(ui.find("dialog")), /La factura cambió/); assert.equal(ui.data[0].paymentCount, 0);
  const first = ui.calls.find((call) => call.method === "POST");
  await ui.click(ui.find("button", "Actualizar factura y revisar")); assert.match(textOf(ui.find("dialog")), /Valor del pago\$ 900/);
  await ui.submit(); const writes = ui.calls.filter((call) => call.method === "POST"); assert.notEqual(writes[1].body.requestId, first.body.requestId); assert.equal(writes[1].body.version, 2);
  assert.equal(ui.data[0].paymentCount, 1); assert.equal(ui.data[0].balance, 0); ui.unmount();
});

test("invalid invoices and overpayments are rejected locally and retain entered values", async () => {
  const ui = harness(); await ui.settle(); await ui.click(ui.find("button", "Nueva factura")); await ui.submit(); assert.match(textOf(ui.find("dialog")), /Indica el número de factura y el proveedor/);
  await ui.setControl("Proveedor", "QA"); await ui.setControl("Número de factura", "N-2");
  for (const value of ["-10", "0", "", "1.23", "1.000,123"]) { await ui.setControl("Valor de la factura (COP)", value); await ui.submit(); assert.equal(ui.field("Valor de la factura (COP)").props.value, value); }
  assert.equal(ui.calls.filter((call) => call.method === "POST").length, 0);
  await ui.click(ui.find("button", "Cancelar")); await ui.click(ui.find("button", "Abonar / pagar")); await ui.setControl("Abono parcial", "partial"); await ui.setControl("Valor del abono (COP)", "1.000,01"); await ui.submit();
  assert.match(textOf(ui.find("dialog")), /no superar el saldo/); assert.equal(ui.calls.filter((call) => call.method === "POST").length, 0); ui.unmount();
});

test("late list response cannot replace the newly selected historical month", async () => {
  const ui = harness({ delayLists: true, invoices: [invoice(1), invoice(2, { date: "2025-02-01", provider: "Histórico QA" })] }); await ui.settle();
  await ui.setControl("Mes de la factura", "2025-02"); await ui.apply();
  assert.equal(ui.pendingLists.length, 2); assert.equal(ui.pendingLists[0].signal.aborted, true);
  ui.pendingLists[1].resolve(); await ui.settle(); assert.match(ui.text(), /Histórico QA/);
  ui.pendingLists[0].resolve(); await ui.settle(); assert.match(ui.text(), /Histórico QA/); assert.doesNotMatch(ui.text(), /Proveedor 1/); ui.unmount();
});

test("failed initial query never presents zero invoice counts as confirmed data and retry recovers", async () => {
  const ui = harness({ listFailures: 1 }); await ui.settle();
  assert.match(ui.text(), /No fue posible consultar el mes/);
  assert.match(ui.text(), /FACTURAS PENDIENTES—/); assert.match(ui.text(), /FACTURAS PAGAS—/);
  assert.match(ui.text(), /Sin datos confirmados/); assert.doesNotMatch(ui.text(), /0 facturas/);
  assert.doesNotMatch(textOf(ui.byLabel("Resumen de facturas del mes")), /\$ 0/);
  await ui.click(ui.find("button", "Reintentar"));
  assert.match(ui.text(), /FACTURAS PENDIENTES1/); assert.match(ui.text(), /FACTURAS PAGAS0/);
  assert.match(ui.text(), /Proveedor 1/); ui.unmount();
});
