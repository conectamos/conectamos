import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = readFileSync(new URL("../app/vendedor/payjoy/credito/workspace.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const stateNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .filter(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(parsed) === "useState")
  .map(node => node.name.elements[0].name.getText(parsed));
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const snapshot = {
  deviceTag: "DQA12345", imei: "359999999999991", model: null, financeOrderId: null,
  remainingBalance: null, currency: null, validThrough: null, paidInFull: null,
  financeAmount: null, downPayment: null, purchaseAmount: null, months: null, weeklyCost: null,
  fortnightlyCost: null, monthlyCost: null, lastSeen: null, secureStatus: null,
  payments: [], paymentsAvailability: "NO_DISPONIBLE", source: "PAYMENT", warnings: ["El historial de pagos no está disponible."],
};
const saved = { id: "saved1", identifier: "DQA12345", deviceTag: "DQA12345", imei: snapshot.imei,
  asesorNombre: "Asesor QA", status: "LISTA", createdAt: "2026-10-28T10:00:00.000Z", completedAt: "2026-10-28T10:00:02.000Z", snapshot, errorCode: null, errorMessage: null };
const follow = { id: "extension1", deviceTag: saved.deviceTag, imei: saved.imei, asesorNombre: saved.asesorNombre,
  status: "INDETERMINADA", createdAt: saved.createdAt, completedAt: saved.completedAt, extensionHours: 24, grantedValidThrough: null,
  followUp: { status: "REQUIERE_REVISION", checkId: null, checkedAt: null, message: "Revisa esta gestión en PayJoy; una consulta de saldo no confirma su aplicación.", currentValidThrough: null, remainingBalance: null, currency: null, paidInFull: null, paymentAfterExtension: null } };
const data = (checks = [], extensions = []) => ({ checks, extensions, limit: 30, serverTime: saved.createdAt });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
function resolve(node) {
  if (Array.isArray(node)) return node.map(resolve);
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
function button(tree, label) {
  const found = elements(tree).find(node => node.type === "button" && textOf(node).trim().startsWith(label));
  assert.ok(found, `Botón ausente: ${label}`); return found;
}
function probe({ initial = {}, initialIdentifier, initialTab, fetchImpl } = {}) {
  const state = { ...initial }; const refs = []; const effects = []; const calls = [];
  let stateIndex = 0; let refIndex = 0; let collectEffects = true;
  const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  const imports = {
    "react/jsx-runtime": jsx,
    react: {
      useState(value) { const name = stateNames[stateIndex++]; if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useRef(value) { return refs[refIndex++] ??= { current: value }; }, useCallback: fn => fn,
      useEffect(fn) { if (collectEffects) effects.push(fn); },
    },
    "next/link": { __esModule: true, default: ({ href, children, ...props }) => jsx.jsx("a", { href, ...props, children }) },
    "next/image": { __esModule: true, default: props => jsx.jsx("img", Object.fromEntries(Object.entries(props).filter(([key]) => key !== "priority"))) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: ({ name }) => jsx.jsx("svg", { "data-icon": name }) },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: ({ name }) => jsx.jsx("span", { children: name }) },
    "../extensiones/extensions.module.css": css, "./credit.module.css": css,
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fetch", "crypto", "setTimeout", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loaded, loaded.exports, async (url, init = {}) => {
    const call = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null }; calls.push(call);
    return fetchImpl ? fetchImpl(call) : response(data());
  }, { randomUUID }, () => 0);
  const render = () => {
    stateIndex = 0; refIndex = 0;
    const tree = resolve(loaded.exports.default({ initialIdentifier, initialTab, session: { nombre: "Asesor QA", sedeNombre: "Sede QA" } }));
    collectEffects = false; return tree;
  };
  return { state, calls, render, mount: async () => { render(); effects.forEach(fn => fn()); await settle(); return render(); } };
}

test("abrir ficha con código precargado solo lee historial y recuperar consulta no llama al proveedor", async () => {
  const ui = probe({ initialIdentifier: saved.deviceTag, fetchImpl: async () => response(data([saved])) });
  let tree = await ui.mount();
  assert.deepEqual(ui.calls.map(call => [call.url, call.method]), [["/api/payjoy/credito", "GET"]]);
  assert.equal(ui.state.identifier, saved.deviceTag);
  assert.equal(ui.state.check.id, saved.id);
  button(tree, "Ver consulta").props.onClick(); tree = ui.render();
  assert.equal(ui.calls.length, 1);
  assert.match(textOf(tree), /Consulta guardada/);
  assert.match(textOf(tree), /2026/);
});

test("un código diferente al historial no presenta la ficha de otro equipo", async () => {
  const ui = probe({ initialIdentifier: "DOTRO123", fetchImpl: async () => response(data([saved])) });
  const tree = await ui.mount();
  assert.equal(ui.state.check, null);
  assert.match(textOf(tree), /Consulta un equipo para comenzar/);
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
});

test("campos ausentes y pagos no disponibles no se convierten en cero ni en pagado", async () => {
  const ui = probe({ fetchImpl: async () => response(data([saved])) });
  const tree = await ui.mount();
  assert.match(textOf(tree), /No informado/);
  assert.match(textOf(tree), /no significa que el cliente no haya pagado/);
  assert.doesNotMatch(textOf(tree), /Pagado por completo|COP\s*0|Saldo cero/);
  assert.equal(elements(tree).some(node => node.type === "button" && /abono|cobrar|pagar/i.test(textOf(node))), false);
});

test("rechaza cédula, URL y código inválido sin enviar consultas", async () => {
  for (const identifier of ["10004321", "https://pay.payjoy.com/extensions/device/DQA12345", "DABC", "DQA/12345"]) {
    const ui = probe({ initial: { identifier } });
    let tree = await ui.mount();
    elements(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await settle(); tree = ui.render();
    assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
    assert.equal(ui.state.fieldError, true);
    assert.match(textOf(tree), /No uses la cédula ni una URL/);
  }
});

test("doble envío se bloquea, reintento desconocido conserva UUID y actualización explícita crea otra", async () => {
  let rejectFirst; let posts = 0;
  const ui = probe({ initialIdentifier: saved.deviceTag, fetchImpl: async call => {
    if (call.method === "GET") return response(data());
    posts++;
    if (posts === 1) return new Promise((_, reject) => { rejectFirst = () => reject(new TypeError("network")); });
    return response({ check: { ...saved, id: `saved${posts}` } });
  } });
  let tree = await ui.mount(); const form = elements(tree).find(node => node.type === "form");
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  assert.equal(posts, 1); rejectFirst(); await settle(); tree = ui.render();
  assert.match(textOf(tree), /No se recibió la respuesta de la consulta/);
  assert.doesNotMatch(textOf(tree), /network|Failed to fetch/);
  elements(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await settle(); tree = ui.render();
  button(tree, "Actualizar datos").props.onClick(); await settle();
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 3);
  assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.notEqual(writes[1].body.idempotencyKey, writes[2].body.idempotencyKey);
  assert.deepEqual(Object.keys(writes[0].body).sort(), ["idempotencyKey", "identifier"]);
});

test("comprobar una gestión indeterminada solo consulta crédito y mantiene su estado original", async () => {
  const ui = probe({ initialTab: "seguimiento", fetchImpl: async call => response(call.method === "GET" ? data([saved], [follow]) : { check: saved }) });
  let tree = await ui.mount();
  assert.equal(ui.state.tab, "seguimiento");
  assert.match(textOf(tree), /Requiere revisión en PayJoy/);
  button(tree, "Comprobar equipo").props.onClick(); await settle(); tree = ui.render();
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url, "/api/payjoy/credito");
  assert.equal(writes[0].body.identifier, saved.deviceTag);
  assert.equal(writes[0].body.action, undefined);
  assert.equal(ui.state.extensions[0].status, "INDETERMINADA");
  assert.equal(ui.state.tab, "credito");
  assert.match(textOf(tree), /Requiere revisión en PayJoy/);
  assert.equal(ui.calls.some(call => call.url === "/api/payjoy/extensiones"), false);
});

test("actualizar seguimiento y cambiar de pestaña no hacen consultas remotas", async () => {
  const ui = probe({ fetchImpl: async () => response(data([], [follow])) });
  let tree = await ui.mount();
  button(tree, "Seguimiento de extensiones").props.onClick(); tree = ui.render();
  button(tree, "Actualizar seguimiento").props.onClick(); await settle(); tree = ui.render();
  assert.equal(ui.state.tab, "seguimiento");
  assert.equal(ui.calls.length, 2);
  assert.ok(ui.calls.every(call => call.method === "GET"));
  assert.equal(elements(tree).some(node => node.type === "button" && /confirmar extensión/i.test(textOf(node))), false);
});

test("una consulta pendiente recuperada como completa permite otra actualización con una UUID nueva", async () => {
  let posted = false;
  const pending = { ...saved, status: "CONSULTANDO", snapshot: null, completedAt: null };
  const ui = probe({ initialIdentifier: saved.deviceTag, fetchImpl: async call => {
    if (call.method === "GET") return response(data(posted ? [saved] : []));
    posted = true; return response({ check: pending });
  } });
  let tree = await ui.mount();
  elements(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await settle(); tree = ui.render();
  assert.equal(ui.state.check.status, "LISTA");
  button(tree, "Actualizar datos").props.onClick(); await settle();
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 2);
  assert.notEqual(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
});

test("el historial permite recuperar las últimas treinta consultas sin nuevas solicitudes", async () => {
  const checks = Array.from({ length: 30 }, (_, index) => ({ ...saved, id: `consulta-${index}`, identifier: `DQA${String(index).padStart(5, "0")}`, deviceTag: `DQA${String(index).padStart(5, "0")}` }));
  const ui = probe({ fetchImpl: async () => response(data(checks)) });
  let tree = await ui.mount();
  const next = () => elements(tree).find(node => node.type === "button" && node.props["aria-label"] === "Más consultas guardadas");
  next().props.onClick(); tree = ui.render(); next().props.onClick(); tree = ui.render();
  assert.equal(ui.state.checkPage, 3);
  assert.equal(next().props.disabled, true);
  const target = elements(tree).find(node => node.type === "button" && node.props["aria-label"]?.startsWith("Ver consulta de DQA00029"));
  assert.ok(target); target.props.onClick(); ui.render();
  assert.equal(ui.state.check.id, "consulta-29");
  assert.equal(ui.calls.length, 1);
});
