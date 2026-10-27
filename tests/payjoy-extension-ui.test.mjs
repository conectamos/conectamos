import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = readFileSync(new URL("../app/vendedor/payjoy/extensiones/workspace.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const stateNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .filter(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(parsed) === "useState")
  .map(node => node.name.elements[0].name.getText(parsed));
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

const option = { id: "courtesy:24", extensionType: "courtesy", extensionTime: 24, status: "available", available: true, reason: null,
  reasons: [{ id: "medical", label: "Motivo comunicado por PayJoy" }], details: { extensionsRemaining: 1 } };
const ready = { id: "qa-operation", status: "LISTA", deviceTag: "DABC1234", imei: "000123456789012", clienteDocumentoUltimos4: "4321", asesorNombre: "Asesor QA", createdAt: "2026-10-27T12:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", currentValidThrough: null, options: [option], selectedOption: null, result: null, errorCode: null, errorMessage: null };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const submit = () => ({ preventDefault() {} });
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
function getButton(tree, label) {
  const button = elements(tree).find(node => node.type === "button" && textOf(node).trim().startsWith(label));
  assert.ok(button, `No se encontró el botón ${label}`);
  return button;
}
function probe({ initial = {}, canManage = true, fetchImpl } = {}) {
  const state = { ...initial }; const refs = []; const effects = []; const calls = [];
  let stateIndex = 0; let refIndex = 0; let collectEffects = true;
  const imports = {
    "react/jsx-runtime": jsx,
    react: {
      useState(value) { const name = stateNames[stateIndex++]; if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useRef(value) { return refs[refIndex++] ??= { current: value }; },
      useCallback: fn => fn,
      useEffect(fn) { if (collectEffects) effects.push(fn); },
    },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "./extensions.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fetch", "crypto", "setTimeout", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loaded, loaded.exports, async (url, init = {}) => {
    const call = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null }; calls.push(call);
    if (fetchImpl) return fetchImpl(call);
    return response({ operations: [], canManage });
  }, { randomUUID }, () => 0);
  const render = () => {
    stateIndex = 0; refIndex = 0;
    const tree = resolve(loaded.exports.default({ canManage, session: { nombre: "Asesor QA", sedeNombre: "Sede QA" } }));
    collectEffects = false; return tree;
  };
  return { state, calls, render, mount: async () => { render(); effects.forEach(fn => fn()); await settle(); return render(); } };
}

test("al montar solo carga historial; recuperar una consulta no envía operaciones a PayJoy", async () => {
  const ui = probe({ fetchImpl: async () => response({ operations: [ready], canManage: true }) });
  let tree = await ui.mount();
  assert.deepEqual(ui.calls.map(item => item.method), ["GET"]);
  getButton(tree, "Recuperar consulta").props.onClick(); tree = ui.render();
  assert.equal(ui.state.operation.id, ready.id);
  assert.match(textOf(tree), /Extensión de 24 horas/);
  assert.equal(ui.calls.length, 1);
});

test("la búsqueda distingue registros locales y ofrece consulta manual cuando no encuentra equipos", async () => {
  const ui = probe({ initial: { cedula: "10000001" }, fetchImpl: async call => response(call.method === "GET" ? { operations: [], canManage: true } : { devices: [], source: "CONECTAMOS", limited: true }) });
  let tree = await ui.mount();
  await elements(tree).find(node => node.type === "form").props.onSubmit(submit()); tree = ui.render();
  assert.match(textOf(tree), /No es un listado completo de dispositivos en PayJoy/);
  assert.match(textOf(tree), /Sin equipos en tus registros/);
  assert.ok(getButton(tree, "Consultar por dispositivo"));
  assert.deepEqual(ui.calls[1].body, { action: "buscar", cedula: "10000001" });
});

test("conserva la UUID al reintentar una consulta cuya respuesta se perdió y bloquea el doble envío", async () => {
  let finish; let attempts = 0;
  const ui = probe({ initial: { manual: true, deviceTag: "DABC1234" }, fetchImpl: async call => {
    if (call.method === "GET") return response({ operations: [], canManage: true });
    attempts++;
    if (attempts === 1) return new Promise((_, reject) => { finish = () => reject(new TypeError("network")); });
    return response({ operation: ready });
  } });
  let tree = await ui.mount();
  const manualForm = elements(tree).find(node => node.props?.id === "payjoy-manual");
  manualForm.props.onSubmit(submit()); manualForm.props.onSubmit(submit());
  assert.equal(attempts, 1);
  finish(); await settle(); tree = ui.render();
  elements(tree).find(node => node.props?.id === "payjoy-manual").props.onSubmit(submit()); await settle();
  const writes = ui.calls.filter(item => item.method === "POST");
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.match(writes[0].body.idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.equal(ui.state.operation.id, ready.id);
});

test("exige motivo real, revisión y confirmación; el doble clic solo ejecuta una gestión", async () => {
  let finish;
  const ui = probe({ initial: { operation: ready }, fetchImpl: async call => {
    if (call.method === "GET") return response({ operations: [ready], canManage: true });
    return new Promise(resolve => { finish = () => resolve(response({ operation: { ...ready, status: "EXITOSA", selectedOption: option, result: { success: true, status: "GRANTED", newValidThrough: "2026-10-29T12:00:00.000Z" } } })); });
  } });
  let tree = await ui.mount();
  elements(tree).find(node => node.type === "input" && node.props.name === "payjoy-option").props.onChange(); tree = ui.render();
  assert.equal(getButton(tree, "Revisar gestión").props.disabled, true);
  elements(tree).find(node => node.props?.id === "payjoy-reason").props.onChange({ target: { value: "medical" } }); tree = ui.render();
  getButton(tree, "Revisar gestión").props.onClick(); tree = ui.render();
  assert.equal(getButton(tree, "Confirmar extensión").props.disabled, true);
  elements(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } }); tree = ui.render();
  const button = getButton(tree, "Confirmar extensión"); button.props.onClick(); button.props.onClick();
  const writes = ui.calls.filter(item => item.method === "POST");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body, { action: "confirmar", operationId: ready.id, optionId: option.id, reason: "medical", confirmed: true });
  finish(); await settle(); tree = ui.render();
  assert.match(textOf(tree), /PayJoy confirmó la extensión/);
  assert.equal(elements(tree).some(node => node.type === "button" && textOf(node).startsWith("Confirmar extensión")), false);
});

test("una respuesta perdida al confirmar bloquea la repetición y pide revisar el historial", async () => {
  const ui = probe({ initial: { operation: ready, optionId: option.id, reason: "medical", review: true, confirmed: true }, fetchImpl: async call => {
    if (call.method === "GET") return response({ operations: [ready], canManage: true });
    throw new TypeError("network");
  } });
  let tree = await ui.mount(); getButton(tree, "Confirmar extensión").props.onClick(); await settle(); tree = ui.render();
  assert.match(textOf(tree), /No repitas la extensión/);
  assert.equal(ui.state.uncertainId, ready.id);
  assert.equal(elements(tree).some(node => node.type === "button" && textOf(node).startsWith("Confirmar extensión")), false);
  assert.equal(ui.calls.filter(item => item.method === "POST").length, 1);
});

test("auditor e historial indeterminado no permiten abrir una confirmación", async () => {
  for (const config of [{ canManage: false, operation: ready }, { canManage: true, operation: { ...ready, status: "INDETERMINADA" } }]) {
    const ui = probe({ canManage: config.canManage, initial: { operation: config.operation, optionId: option.id, reason: "medical" } });
    const tree = await ui.mount();
    assert.equal(elements(tree).some(node => node.type === "button" && ["Revisar gestión", "Confirmar extensión"].includes(textOf(node).trim())), false);
    assert.equal(ui.calls.filter(item => item.method === "POST").length, 0);
  }
});

test("un error de consulta permite una nueva consulta explícita sin confirmar una extensión", async () => {
  const failed = { ...ready, status: "ERROR", options: [], errorMessage: "PayJoy no está disponible" };
  const ui = probe({ initial: { operation: failed }, fetchImpl: async call => response(call.method === "GET" ? { operations: [failed], canManage: true } : { operation: ready }) });
  const tree = await ui.mount(); getButton(tree, "Consultar nuevamente").props.onClick(); await settle();
  assert.equal(ui.calls.filter(item => item.method === "POST").length, 1);
  assert.equal(ui.calls[1].body.action, "preparar");
  assert.equal(ui.calls[1].body.deviceTag, failed.deviceTag);
  assert.equal(ui.state.operation.status, "LISTA");
});

test("una respuesta sin dispositivo abre la consulta manual y conserva cliente y equipo sin reintentar el IMEI", async () => {
  for (const errorCode of ["DEVICE_UNRESOLVED", "MISSING_DEVICE_TAG"]) {
    const device = { registroId: 7, clienteNombre: "Cliente QA", documentoUltimos4: "4321", imei: ready.imei, modelo: "Equipo QA" };
    const failed = { ...ready, status: "ERROR", deviceTag: null, options: [], errorCode, errorMessage: "PayJoy no devolvió los datos del equipo. Ingresa su identificador." };
    const ui = probe({ initial: { cedula: "10004321", devices: [device], selectedDevice: 7 }, fetchImpl: async call => response(call.method === "GET" ? { operations: [], canManage: true } : { operation: failed }) });
    let tree = await ui.mount();
    getButton(tree, "Consultar extensiones del equipo").props.onClick(); await settle(); tree = ui.render();
    assert.equal(ui.state.manual, true);
    assert.equal(ui.state.cedula, "10004321");
    assert.equal(ui.state.selectedDevice, 7);
    assert.deepEqual(ui.state.devices, [device]);
    assert.ok(elements(tree).find(node => node.props?.id === "payjoy-manual"));
    assert.equal(elements(tree).some(node => node.type === "button" && textOf(node).trim() === "Consultar nuevamente"), false);
    getButton(tree, "Ingresar identificador del dispositivo").props.onClick(); tree = ui.render();
    assert.equal(ui.calls.filter(item => item.method === "POST").length, 1);
    elements(tree).find(node => node.props?.id === "payjoy-device-tag").props.onChange({ target: { value: "DABC1234" } }); tree = ui.render();
    elements(tree).find(node => node.props?.id === "payjoy-manual").props.onSubmit(submit()); await settle();
    const writes = ui.calls.filter(item => item.method === "POST");
    assert.deepEqual(writes.map(item => item.body.action), ["preparar", "preparar"]);
    assert.equal(writes[0].body.registroId, 7);
    assert.equal(writes[1].body.deviceTag, "DABC1234");
    assert.equal(writes[1].body.registroId, undefined);
    assert.notEqual(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  }
});

test("una asociación contradictoria requiere revisión administrativa y no ofrece reintento ni confirmación", async () => {
  const failed = { ...ready, status: "ERROR", options: [], errorCode: "DEVICE_ASSOCIATION_CONFLICT", errorMessage: "La asociación del dispositivo requiere revisión." };
  const ui = probe({ initial: { operation: failed }, fetchImpl: async () => response({ operations: [failed], canManage: true }) });
  const tree = await ui.mount();
  assert.match(textOf(tree), /Solicita al administrador/);
  assert.equal(elements(tree).some(node => node.type === "button" && ["Consultar nuevamente", "Revisar gestión", "Confirmar extensión"].includes(textOf(node).trim())), false);
  assert.equal(ui.calls.filter(item => item.method === "POST").length, 0);
});

test("una selección bloqueada antes del envío no se presenta como gestionada y los estados ambiguos conservan su bloqueo", async () => {
  for (const status of ["ERROR", "INDETERMINADA"]) {
    const operation = { ...ready, status, selectedOption: option, result: null,
      errorCode: status === "ERROR" ? "OPTIONS_CHANGED" : "INTERRUPTED",
      errorMessage: status === "ERROR" ? "Las opciones de PayJoy cambiaron. Consulta nuevamente antes de confirmar." : "No se pudo confirmar el resultado." };
    const ui = probe({ initial: { operation }, fetchImpl: async () => response({ operations: [operation], canManage: true }) });
    const tree = await ui.mount();
    assert.match(textOf(tree), /Opción seleccionada/);
    assert.doesNotMatch(textOf(tree), /Opción gestionada|PayJoy confirmó la extensión/);
    assert.equal(elements(tree).some(node => node.type === "button" && ["Revisar gestión", "Confirmar extensión"].includes(textOf(node).trim())), false);
    assert.equal(ui.calls.filter(item => item.method === "POST").length, 0);
    if (status === "INDETERMINADA") {
      assert.match(textOf(tree), /No repitas la extensión/);
      assert.equal(elements(tree).some(node => node.type === "button" && textOf(node).trim() === "Consultar nuevamente"), false);
    }
  }
});
