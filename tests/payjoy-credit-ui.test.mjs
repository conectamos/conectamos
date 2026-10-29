import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = readFileSync(new URL("../app/vendedor/payjoy/seguimiento/workspace.tsx", import.meta.url), "utf8");
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
  followUp: { status: "REQUIERE_REVISION", checkId: null, checkedAt: null, message: "Verifica el resultado de la extensión en PayJoy. Comprobar el equipo no confirma su ejecución ni libera el bloqueo.", currentValidThrough: null, remainingBalance: null, currency: null, paidInFull: null, paymentAfterExtension: null } };
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
function probe({ initial = {}, initialIdentifier, fetchImpl } = {}) {
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
    "../extensiones/extensions.module.css": css, "./follow-up.module.css": css,
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fetch", "crypto", "setTimeout", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loaded, loaded.exports, async (url, init = {}) => {
    assert.equal(url, "/api/payjoy/credito", "El seguimiento no puede ejecutar extensiones ni consultar el proveedor directamente");
    const call = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null }; calls.push(call);
    return fetchImpl ? fetchImpl(call) : response(data());
  }, { randomUUID }, () => 0);
  const render = () => {
    stateIndex = 0; refIndex = 0;
    const tree = resolve(loaded.exports.default({ initialIdentifier, session: { nombre: "Asesor QA", sedeNombre: "Sede QA" } }));
    collectEffects = false; return tree;
  };
  return { state, calls, render, mount: async () => { render(); effects.forEach(fn => fn()); await settle(); return render(); } };
}

const changeFilter = (tree, value) => elements(tree).find(node => node.type === "input" && node.props.id === "payjoy-followup-query").props.onChange({ target: { value } });
const checkButtons = tree => elements(tree).filter(node => node.type === "button" && textOf(node).trim() === "Comprobar equipo");

test("abrir seguimiento con identificador del enlace antiguo solo filtra operaciones guardadas", async () => {
  const ui = probe({ initialIdentifier: saved.deviceTag, fetchImpl: async () => response(data([saved], [follow, { ...follow, id: "otra", deviceTag: "DOTRO123", imei: "359999999999992" }])) });
  const tree = await ui.mount();
  assert.deepEqual(ui.calls.map(call => [call.url, call.method]), [["/api/payjoy/credito", "GET"]]);
  assert.equal(ui.state.query, saved.deviceTag);
  assert.equal(checkButtons(tree).length, 1);
  assert.match(textOf(tree), /Operaciones de extensiones/);
  assert.match(textOf(tree), /DQA12345/);
  assert.doesNotMatch(textOf(tree), /DOTRO123|Ficha del crédito|Consultar crédito|Ver consulta/);
  assert.ok(elements(tree).every(node => node.type !== "form"));
  assert.ok(elements(tree).filter(node => node.type === "a").every(node => !node.props.href.startsWith("/vendedor/payjoy/credito")));
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/vendedor/payjoy/extensiones?deviceTag=DQA12345"));
});

test("un filtro sin operación coincidente y un historial de comprobaciones aisladas no permiten consulta libre", async () => {
  for (const extensions of [[], [follow]]) {
    const ui = probe({ initialIdentifier: "DOTRO123", fetchImpl: async () => response(data([saved], extensions)) });
    let tree = await ui.mount();
    assert.equal(checkButtons(tree).length, 0);
    assert.match(textOf(tree), extensions.length ? /Sin coincidencias/ : /Todavía no hay extensiones/);
    for (const value of ["10004321", "https://pay.payjoy.com/extensions/device/DOTRO123", "DABC", "DNUEVO123"]) {
      changeFilter(tree, value); tree = ui.render();
      assert.equal(checkButtons(tree).length, 0);
    }
    assert.equal(ui.calls.length, 1);
    assert.ok(ui.calls.every(call => call.method === "GET"));
    assert.ok(elements(tree).every(node => node.type !== "form"));
  }
});

test("vigencia y estado se conservan sin mostrar saldos, cuotas, pagos ni la ficha aunque vengan en datos históricos", async () => {
  const rich = { ...saved, snapshot: { ...snapshot, model: "MODELO FINANCIERO QA", financeOrderId: "FINANCIACION-QA", remainingBalance: 987654, currency: "COP", paidInFull: true, weeklyCost: 43210, payments: [{ amount: 88888, currency: "COP", paidAt: "2026-10-28T08:00:00Z" }] } };
  const operation = { ...follow, status: "EXITOSA", grantedValidThrough: "2026-10-29T15:00:00Z", followUp: { ...follow.followUp, status: "CONSULTADO", message: "Vigencia consultada. El resultado original de la extensión se conserva.", checkedAt: "2026-10-28T15:00:00Z", currentValidThrough: "2026-10-30T15:00:00Z", remainingBalance: 987654, currency: "COP", paidInFull: true, paymentAfterExtension: rich.snapshot.payments[0] } };
  const ui = probe({ fetchImpl: async () => response(data([rich], [operation])) });
  const tree = await ui.mount(); const text = textOf(tree);
  assert.match(text, /Extensión confirmada/); assert.match(text, /Equipo comprobado/); assert.match(text, /24 horas/);
  assert.match(text, /Vigencia confirmada de la extensión/); assert.match(text, /Última vigencia consultada/);
  for (const value of [operation.grantedValidThrough, operation.followUp.currentValidThrough]) {
    assert.ok(text.includes(new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))));
  }
  assert.doesNotMatch(text, /Ficha|[Ss]aldo|[Cc]uota|[Pp]ago|Pagado|COP|987|43[.,]?210|88[.,]?888|MODELO FINANCIERO|FINANCIACION-QA/);
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
});

test("una operación sin código válido no envía comprobaciones; un IMEI guardado sí se puede comprobar", async () => {
  for (const deviceTag of [null, "10004321", "https://pay.payjoy.com/extensions/device/DQA12345", "DABC", "DQA/12345"]) {
    const ui = probe({ fetchImpl: async () => response(data([], [{ ...follow, deviceTag, imei: null }])) });
    let tree = await ui.mount(); const action = button(tree, "Comprobar equipo");
    if (deviceTag === null) assert.equal(action.props.disabled, true);
    else { action.props.onClick(); await settle(); tree = ui.render(); assert.match(textOf(tree), /no tiene un código PayJoy o IMEI válido/); }
    assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
  }
  const ui = probe({ fetchImpl: async call => response(call.method === "GET" ? data([], [{ ...follow, deviceTag: null }]) : { check: saved }) });
  button(await ui.mount(), "Comprobar equipo").props.onClick(); await settle();
  assert.equal(ui.calls.find(call => call.method === "POST").body.identifier, saved.imei);
});

test("doble comprobación se bloquea, reintento desconocido conserva UUID y actualización posterior crea otra", async () => {
  let rejectFirst; let posts = 0;
  const ui = probe({ fetchImpl: async call => {
    if (call.method === "GET") return response(data([], [follow]));
    posts++;
    if (posts === 1) return new Promise((_, reject) => { rejectFirst = () => reject(new TypeError("network")); });
    return response({ check: { ...saved, id: `saved${posts}` } });
  } });
  let tree = await ui.mount(); const action = button(tree, "Comprobar equipo");
  action.props.onClick(); action.props.onClick();
  assert.equal(posts, 1); assert.equal(button(ui.render(), "Comprobando…").props.disabled, true);
  rejectFirst(); await settle(); tree = ui.render();
  assert.match(textOf(tree), /No se recibió la respuesta de la comprobación/);
  assert.doesNotMatch(textOf(tree), /network|Failed to fetch/);
  button(tree, "Comprobar equipo").props.onClick(); await settle(); tree = ui.render();
  button(tree, "Comprobar equipo").props.onClick(); await settle();
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 3);
  assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.notEqual(writes[1].body.idempotencyKey, writes[2].body.idempotencyKey);
  assert.ok(writes.every(call => call.body.identifier === follow.deviceTag));
  assert.deepEqual(Object.keys(writes[0].body).sort(), ["idempotencyKey", "identifier"]);
});

test("comprobar una gestión indeterminada mantiene su estado y no ejecuta ni vuelve a confirmar la extensión", async () => {
  const ui = probe({ fetchImpl: async call => response(call.method === "GET" ? data([saved], [follow]) : { check: saved }) });
  let tree = await ui.mount();
  button(tree, "Comprobar equipo").props.onClick(); await settle(); tree = ui.render();
  assert.deepEqual(ui.calls.map(call => call.method), ["GET", "POST", "GET"]);
  assert.equal(ui.calls[1].body.identifier, saved.deviceTag);
  assert.equal(ui.calls[1].body.action, undefined);
  assert.equal(ui.state.extensions[0].status, "INDETERMINADA");
  assert.match(textOf(tree), /Requiere revisión en PayJoy/);
  assert.match(textOf(tree), /Comprobación guardada/);
  assert.match(textOf(tree), /no confirma su ejecución ni libera el bloqueo/);
  assert.equal(elements(tree).some(node => node.type === "button" && /confirmar extensión|actualizar datos|ficha/i.test(textOf(node))), false);
});

test("actualizar y filtrar por estado solo lee historial y un error conserva las operaciones previas", async () => {
  let fail = false;
  const ui = probe({ fetchImpl: async () => fail ? response({ error: "Error de base de datos privado" }, 503) : response(data([], [follow, { ...follow, id: "exitosa", status: "EXITOSA" }])) });
  let tree = await ui.mount();
  elements(tree).find(node => node.type === "select").props.onChange({ target: { value: "EXITOSA" } }); tree = ui.render();
  assert.equal(checkButtons(tree).length, 1);
  assert.match(textOf(tree), /Extensión confirmada/);
  assert.equal(ui.calls.length, 1);
  fail = true; button(tree, "Actualizar seguimiento").props.onClick(); await settle(); tree = ui.render();
  assert.equal(checkButtons(tree).length, 1);
  assert.match(textOf(tree), /No se pudo cargar el seguimiento/);
  assert.doesNotMatch(textOf(tree), /base de datos privado/);
  fail = false; button(tree, "Reintentar seguimiento").props.onClick(); await settle(); tree = ui.render();
  assert.ok(!elements(tree).some(node => node.props?.role === "alert"));
  assert.equal(ui.calls.length, 3);
  assert.ok(ui.calls.every(call => call.method === "GET"));
});

test("comprobación pendiente conserva UUID hasta recuperar su resultado con actualización manual", async () => {
  const pending = { ...saved, status: "CONSULTANDO", snapshot: null, completedAt: null };
  let completed = false;
  const ui = probe({ fetchImpl: async call => response(call.method === "GET" ? data([completed ? saved : pending], [follow]) : { check: pending }) });
  let tree = await ui.mount();
  button(tree, "Comprobar equipo").props.onClick(); await settle(); tree = ui.render();
  assert.match(textOf(tree), /comprobación sigue en curso/);
  const count = ui.calls.length; await settle(); assert.equal(ui.calls.length, count, "No debe consultar al proveedor ni hacer polling automático");
  button(tree, "Comprobar equipo").props.onClick(); await settle(); tree = ui.render();
  completed = true; button(tree, "Actualizar seguimiento").props.onClick(); await settle(); tree = ui.render();
  button(tree, "Comprobar equipo").props.onClick(); await settle();
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 3);
  assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.notEqual(writes[1].body.idempotencyKey, writes[2].body.idempotencyKey);
});

test("treinta operaciones se pueden paginar y filtrar sin consultar PayJoy y comprobar usa la fila elegida", async () => {
  const extensions = Array.from({ length: 30 }, (_, index) => ({ ...follow, id: `extension-${index}`, deviceTag: `DQA${String(index).padStart(5, "0")}` }));
  const ui = probe({ fetchImpl: async call => response(call.method === "GET" ? data([], extensions) : { check: saved }) });
  let tree = await ui.mount();
  assert.equal(checkButtons(tree).length, 10);
  button(tree, "Siguiente").props.onClick(); tree = ui.render(); button(tree, "Siguiente").props.onClick(); tree = ui.render();
  assert.equal(ui.state.page, 3);
  assert.equal(button(tree, "Siguiente").props.disabled, true);
  assert.match(textOf(tree), /DQA00029/);
  changeFilter(tree, "DQA00029"); tree = ui.render();
  assert.equal(ui.state.page, 1); assert.equal(checkButtons(tree).length, 1);
  assert.equal(ui.calls.length, 1);
  button(tree, "Comprobar equipo").props.onClick(); await settle();
  assert.equal(ui.calls.find(call => call.method === "POST").body.identifier, "DQA00029");
});

test("fallo temporal conserva UUID y rechazo de permiso no presenta éxito ni modifica la extensión", async () => {
  for (const status of [403, 503]) {
    let failed = false;
    const message = status === 403 ? "Tu perfil no tiene acceso al seguimiento." : "PayJoy no está disponible.";
    const ui = probe({ fetchImpl: async call => {
      if (call.method === "GET") return response(data([], [follow]));
      if (!failed) { failed = true; return response({ error: message }, status); }
      return response({ check: saved });
    } });
    let tree = await ui.mount(); button(tree, "Comprobar equipo").props.onClick(); await settle(); tree = ui.render();
    assert.ok(textOf(tree).includes(message));
    assert.doesNotMatch(textOf(tree), /Comprobación guardada/);
    assert.equal(ui.state.extensions[0].status, "INDETERMINADA");
    button(tree, "Comprobar equipo").props.onClick(); await settle();
    const writes = ui.calls.filter(call => call.method === "POST");
    assert.equal(writes[0].body.idempotencyKey === writes[1].body.idempotencyKey, status === 503);
  }
});
