import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = readFileSync(new URL("../app/dashboard/payjoy/dapta/workspace.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const stateNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .filter(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState")
  .map(node => node.name.elements[0].name.getText(ast));
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const pendingItem = { id: "qa-item", deviceTag: "DQA0001", lookupStatus: "PENDING", phone: null, phoneMasked: null, phoneSource: null, ownershipStatus: "PENDING_REVIEW", consentStatus: "PENDING_REVIEW", reviewStatus: "PENDING_REVIEW", duplicateOfId: null, messagePreview: null, errorCode: null, errorMessage: null, checkedAt: null };
const pending = { id: "qa-batch", status: "DRAFT_ONLY", agreement: "112090", createdAt: "2026-11-09T13:00:00.000Z", updatedAt: "2026-11-09T13:00:00.000Z", createdBy: "Administrador QA", counts: { total: 1, pending: 1, checking: 0, found: 0, missing: 0, error: 0, duplicatePhones: 0 }, items: [pendingItem] };
const found = { ...pending, counts: { ...pending.counts, pending: 0, found: 1 }, items: [{ ...pendingItem, lookupStatus: "FOUND", phone: "+573000000001", phoneMasked: "+57******0001", phoneSource: "PAYJOY_NEQUI_PREFILL", messagePreview: "Borrador QA convenio Efecty 112090", checkedAt: "2026-11-09T13:02:00.000Z" }] };
const summary = batch => Object.fromEntries(Object.entries(batch).filter(([key]) => key !== "items"));
const history = (batches = []) => ({ batches: batches.map(summary), limit: 20, sendingEnabled: false });
const batchResult = (batch, processedCount = 0) => ({ batch, hasMore: batch.counts.pending > 0, processedCount, sendingEnabled: false });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const event = () => ({ preventDefault() {} });
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
  const result = elements(tree).find(node => node.type === "button" && textOf(node).trim().startsWith(label));
  assert.ok(result, `Falta botón ${label}`); return result;
}
function probe({ initial = {}, fetchImpl, clipboardImpl, clipboardAvailable = true } = {}) {
  const state = { ...initial }; const refs = []; const effects = []; const calls = []; const clipboardCalls = [];
  let stateIndex = 0; let refIndex = 0; let collectEffects = true;
  const imports = {
    "react/jsx-runtime": jsx,
    react: {
      useState(value) { const name = stateNames[stateIndex++]; if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useRef(value) { return refs[refIndex++] ??= { current: value }; }, useCallback: fn => fn,
      useEffect(fn) { if (collectEffects) effects.push(fn); },
    },
    "next/link": { __esModule: true, default: ({ href, children }) => jsx.jsx("a", { href, children }) },
    "next/image": { __esModule: true, default: () => null },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/lib/payjoy-dapta-types": { PAYJOY_DAPTA_AGREEMENT: "112090", PAYJOY_DAPTA_DEVICE_LIMIT: 25 },
    "./dapta.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fetch", "crypto", "navigator", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loaded, loaded.exports, async (url, init = {}) => {
    const call = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null }; calls.push(call);
    return fetchImpl ? fetchImpl(call) : response(history());
  }, { randomUUID }, clipboardAvailable ? { clipboard: { writeText: async value => { clipboardCalls.push(value); await clipboardImpl?.(value); } } } : {});
  const render = () => {
    stateIndex = 0; refIndex = 0;
    const tree = resolve(loaded.exports.default({ user: { nombre: "Administrador QA", rolNombre: "ADMIN", sedeNombre: "Sede QA" } }));
    collectEffects = false; return tree;
  };
  return { state, calls, clipboardCalls, render, mount: async () => { render(); effects.forEach(fn => fn()); await settle(); return render(); } };
}

test("montar y abrir historial solo lee CONECTAMOS; no consulta proveedores ni envía mensajes", async () => {
  const ui = probe({ fetchImpl: async call => response(call.url.includes("batchId=") ? batchResult(found) : history([found])) });
  let tree = await ui.mount();
  assert.deepEqual(ui.calls.map(call => [call.url, call.method]), [["/api/payjoy/dapta", "GET"]]);
  assert.doesNotMatch(textOf(tree), /\+573000000001/);
  button(tree, "Abrir borrador").props.onClick(); await settle(); tree = ui.render();
  assert.match(textOf(tree), /Celular informado por PayJoy/);
  assert.match(textOf(tree), /\+573000000001/);
  assert.match(textOf(tree), /Titularidad y autorización de contacto pendientes/);
  assert.match(textOf(tree), /Envío deshabilitado/);
  assert.ok(ui.calls.every(call => call.method === "GET"));
  assert.equal(elements(tree).filter(node => node.type === "button").some(node => /enviar|exportar|activar/i.test(textOf(node))), false);
});

test("valida códigos y límite antes de crear el borrador", async () => {
  for (const input of ["", "3000000001", "DQA0001 https://example.invalid", Array.from({ length: 26 }, (_, index) => `DQA${String(index).padStart(4, "0")}`).join("\n")]) {
    const ui = probe({ initial: { input } }); const tree = await ui.mount();
    await elements(tree).find(node => node.type === "form").props.onSubmit(event());
    assert.ok(ui.state.inputError); assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
  }
});

test("normaliza y deduplica códigos; crea antes de validar y bloquea doble clic", async () => {
  let finishCreate;
  const ui = probe({ initial: { input: "dqa0001; DQA0001\nDQA0002" }, fetchImpl: async call => {
    if (call.method === "GET") return response(history());
    if (call.body.action === "create") return new Promise(resolve => { finishCreate = () => resolve(response(batchResult({ ...pending, counts: { ...pending.counts, total: 2, pending: 2 }, items: [pendingItem, { ...pendingItem, id: "qa-item-2", deviceTag: "DQA0002" }] }))); });
    return response(batchResult(found, 2));
  } });
  const tree = await ui.mount(); const form = elements(tree).find(node => node.type === "form");
  const first = form.props.onSubmit(event()); await form.props.onSubmit(event());
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  finishCreate(); await first;
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.deepEqual(writes.map(call => call.body.action), ["create", "validate"]);
  assert.deepEqual(writes[0].body.devices, ["DQA0001", "DQA0002"]);
  assert.equal(ui.state.batch.status, "DRAFT_ONLY");
});

test("conserva requestId al reintentar un create sin respuesta", async () => {
  let attempts = 0;
  const ui = probe({ initial: { input: "DQA0001" }, fetchImpl: async call => {
    if (call.method === "GET") return response(history());
    attempts++; if (attempts === 1) throw new TypeError("network");
    return response(batchResult(found));
  } });
  let tree = await ui.mount(); await elements(tree).find(node => node.type === "form").props.onSubmit(event()); tree = ui.render();
  await elements(tree).find(node => node.type === "form").props.onSubmit(event());
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 2); assert.equal(writes[0].body.requestId, writes[1].body.requestId);
  assert.match(writes[0].body.requestId, /^[0-9a-f-]{36}$/);
});

test("procesa bloques pendientes bajo el clic explícito y detiene el ciclo si no hay avance", async () => {
  let validates = 0;
  const ui = probe({ initial: { batch: pending }, fetchImpl: async call => {
    if (call.method === "GET") return response(history([pending]));
    validates++; return response(batchResult(pending, 0));
  } });
  const tree = await ui.mount(); button(tree, "Continuar consulta").props.onClick(); await settle();
  assert.equal(validates, 1); assert.match(ui.state.progress, /quedan consultas pendientes/);
  assert.equal(ui.state.busy, null);
});

test("reintento con respuesta perdida conserva requestId sin marcar el contacto como verificado", async () => {
  const failed = { ...pending, counts: { ...pending.counts, pending: 0, error: 1 }, items: [{ ...pendingItem, lookupStatus: "ERROR" }] };
  let attempts = 0;
  const ui = probe({ initial: { batch: failed }, fetchImpl: async call => {
    if (call.method === "GET") return response(history([failed]));
    attempts++; if (attempts === 1) throw new TypeError("network");
    return response(batchResult(found, 1));
  } });
  let tree = await ui.mount(); button(tree, "Reintentar consultas").props.onClick(); await settle(); tree = ui.render();
  button(tree, "Reintentar consultas").props.onClick(); await settle(); tree = ui.render();
  const writes = ui.calls.filter(call => call.method === "POST");
  assert.equal(writes[0].body.requestId, writes[1].body.requestId);
  assert.ok(writes.every(call => call.body.action === "retry"));
  assert.match(textOf(tree), /Pendiente de verificar/); assert.match(textOf(tree), /Pendiente de revisar/);
});

test("móvil duplicado no genera un segundo mensaje ni inventa saldos o mora", async () => {
  const duplicate = { ...found, counts: { ...found.counts, total: 2, found: 2, duplicatePhones: 1 }, items: [found.items[0], { ...found.items[0], id: "qa-item-2", deviceTag: "DQA0002", reviewStatus: "DUPLICATE_PHONE", duplicateOfId: "qa-item", messagePreview: null }] };
  const ui = probe({ initial: { batch: duplicate } }); const tree = await ui.mount();
  assert.equal(elements(tree).filter(node => node.type === "details").length, 1);
  assert.equal(elements(tree).filter(node => node.type === "button" && textOf(node) === "Copiar mensaje").length, 1);
  assert.match(textOf(tree), /mismo móvil aparece en\s+DQA0001/);
  assert.match(textOf(tree), /no consulta saldos ni cuotas y no afirma que exista mora/);
  assert.match(textOf(tree), /112090/);
});

test("copia el mensaje exacto con párrafos y enlace completo sin solicitudes ni envíos", async () => {
  const message = `Borrador QA de CONECTAMOS para PayJoy.\n\nEfecty, convenio 112090 — Adelantos Colombia.\n\nhttps://example.invalid/payjoy/${"qa-device-".repeat(35)}?reference=qa`;
  const draft = { ...found, items: [{ ...found.items[0], messagePreview: message }] };
  let finishCopy;
  const ui = probe({ initial: { batch: draft }, clipboardImpl: () => new Promise(resolve => { finishCopy = resolve; }) });
  let tree = await ui.mount();
  assert.ok(elements(tree).some(node => node.type === "p" && node.props.children === message));
  const copy = button(tree, "Copiar mensaje");
  assert.equal(copy.props["aria-label"], "Copiar mensaje de DQA0001");
  const first = copy.props.onClick(); await copy.props.onClick();
  tree = ui.render();
  assert.equal(button(tree, "Copiando…").props.disabled, true);
  assert.deepEqual(ui.clipboardCalls, [message]);
  assert.doesNotMatch(textOf(tree), /Mensaje copiado\./);
  finishCopy(); await first; tree = ui.render();
  const feedback = elements(tree).find(node => node.props?.id === copy.props["aria-describedby"]);
  assert.equal(feedback.props.role, "status");
  assert.equal(feedback.props["aria-live"], "polite");
  assert.equal(feedback.props["aria-atomic"], "true");
  assert.equal(textOf(feedback), "Mensaje copiado.");
  assert.equal(button(tree, "Copiar mensaje").props.disabled, false);
  assert.match(textOf(tree), /Vista previa · Sin enviar/);
  assert.ok(ui.calls.every(call => call.method === "GET" && call.url === "/api/payjoy/dapta"));
  assert.equal(elements(tree).some(node => node.type === "a" && /wa\.me|whatsapp/i.test(node.props.href)), false);
});

test("un fallo del portapapeles se anuncia sin éxito falso y permite reintentar", async () => {
  let attempts = 0;
  const ui = probe({ initial: { batch: found }, clipboardImpl: async () => { if (++attempts === 1) throw new Error("denied"); } });
  let tree = await ui.mount();
  await button(tree, "Copiar mensaje").props.onClick(); tree = ui.render();
  const feedback = elements(tree).find(node => node.props?.id === "copy-message-qa-item");
  assert.equal(feedback.props.role, "status");
  assert.match(textOf(feedback), /No se pudo copiar.*manualmente/);
  assert.doesNotMatch(textOf(tree), /Mensaje copiado\./);
  assert.equal(button(tree, "Copiar mensaje").props.disabled, false);
  await button(tree, "Copiar mensaje").props.onClick(); tree = ui.render();
  assert.match(textOf(tree), /Mensaje copiado\./);
  assert.equal(attempts, 2);
  assert.ok(ui.calls.every(call => call.method === "GET"));
});

test("sin API de portapapeles ofrece copia manual y no marca el mensaje como copiado", async () => {
  const ui = probe({ initial: { batch: found }, clipboardAvailable: false });
  let tree = await ui.mount();
  await button(tree, "Copiar mensaje").props.onClick(); tree = ui.render();
  assert.match(textOf(tree), /No se pudo copiar.*manualmente/);
  assert.doesNotMatch(textOf(tree), /Mensaje copiado\./);
  assert.equal(ui.clipboardCalls.length, 0);
  assert.equal(button(tree, "Copiar mensaje").props.disabled, false);
});
