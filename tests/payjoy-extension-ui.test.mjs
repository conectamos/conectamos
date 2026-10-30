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
function probe({ initial = {}, initialDeviceTag, canManage = true, fetchImpl, navigation, session } = {}) {
  const state = { ...initial }; const refs = []; const effects = []; const calls = [];
  let stateIndex = 0; let refIndex = 0; let collectEffects = true;
  const imports = {
    "react/jsx-runtime": jsx,
    react: {
      useState(value) { const name = stateNames[stateIndex++]; if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useRef(value) { return refs[refIndex++] ??= { current: value }; },
      useCallback: fn => fn,
      useMemo: fn => fn(),
      useEffect(fn) { if (collectEffects) effects.push(fn); },
    },
    "next/link": { __esModule: true, default: ({ href, children, ...props }) => jsx.jsx("a", { href, ...props, children }) },
    "next/image": { __esModule: true, default: props => jsx.jsx("img", Object.fromEntries(Object.entries(props).filter(([key]) => !["priority", "fill"].includes(key)))) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: ({ name }) => jsx.jsx("svg", { "data-icon": name }) },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: ({ name, role }) => jsx.jsx("span", { "data-profile": true, children: `${name} · ${role}` }) },
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
    const tree = resolve(loaded.exports.default({ canManage, navigation, initialDeviceTag, session: { nombre: "Asesor QA", sedeNombre: "Sede QA", ...session } }));
    collectEffects = false; return tree;
  };
  return { state, calls, render, mount: async () => { render(); effects.forEach(fn => fn()); await settle(); return render(); } };
}

test("montar con enlace antiguo o recuperar una consulta solo carga el historial, sin consultas automáticas a PayJoy", async () => {
  for (const initialDeviceTag of ["", ready.deviceTag]) {
    const ui = probe({ initialDeviceTag, fetchImpl: async () => response({ operations: [ready], canManage: true }) });
    let tree = await ui.mount();
    assert.deepEqual(ui.calls.map(item => [item.url, item.method]), [["/api/payjoy/extensiones", "GET"]]);
    assert.equal(ui.state.deviceTag, initialDeviceTag);
    assert.equal(ui.state.manual, Boolean(initialDeviceTag));
    assert.equal(ui.state.operation, null);
    assert.doesNotMatch(textOf(tree), /Ficha del crédito|Seguimiento de extensiones/);
    assert.ok(elements(tree).filter(node => node.type === "a").every(node => !/^\/vendedor\/payjoy\/(?:credito|seguimiento)/.test(node.props.href)));
    getButton(tree, "Recuperar consulta").props.onClick(); tree = ui.render();
    assert.equal(ui.state.operation.id, ready.id);
    assert.match(textOf(tree), /Extensión de 24 horas/);
    assert.equal(ui.calls.length, 1);
  }
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
  assert.equal(getButton(tree, "Revisar gestión").props.disabled, true);
  assert.equal(getButton(tree, "Revisar gestión").props["aria-describedby"], "payjoy-review-help");
  assert.match(textOf(tree), /Selecciona una opción disponible para revisar la gestión/);
  getButton(tree, "Revisar gestión").props.onClick(); tree = ui.render();
  assert.equal(ui.state.review, false);
  elements(tree).find(node => node.type === "input" && node.props.name === "payjoy-option").props.onChange(); tree = ui.render();
  assert.equal(getButton(tree, "Revisar gestión").props.disabled, true);
  assert.match(textOf(tree), /Selecciona el motivo de la extensión para continuar/);
  getButton(tree, "Revisar gestión").props.onClick(); tree = ui.render();
  assert.equal(ui.state.review, false);
  elements(tree).find(node => node.props?.id === "payjoy-reason").props.onChange({ target: { value: "medical" } }); tree = ui.render();
  assert.equal(getButton(tree, "Revisar gestión").props.disabled, false);
  assert.equal(getButton(tree, "Revisar gestión").props["aria-describedby"], undefined);
  assert.equal(ui.calls.filter(item => item.method === "POST").length, 0);
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

test("un perfil sin permiso de gestión o historial indeterminado no permiten abrir una confirmación", async () => {
  for (const config of [{ canManage: false, operation: ready }, { canManage: true, operation: { ...ready, status: "INDETERMINADA" } }]) {
    const ui = probe({ canManage: config.canManage, initial: { operation: config.operation, optionId: option.id, reason: "medical" } });
    const tree = await ui.mount();
    assert.equal(elements(tree).some(node => node.type === "button" && ["Revisar gestión", "Confirmar extensión"].includes(textOf(node).trim())), false);
    assert.equal(ui.calls.filter(item => item.method === "POST").length, 0);
  }
});

test("revisar permanece visible durante la carga pero no permite abrir una revisión", async () => {
  const ui = probe({ initial: { operation: ready, optionId: option.id, reason: "medical", busy: "preparar" } });
  let tree = await ui.mount();
  assert.equal(getButton(tree, "Revisar gestión").props.disabled, true);
  getButton(tree, "Revisar gestión").props.onClick(); tree = ui.render();
  assert.equal(ui.state.review, false);
  assert.equal(ui.calls.filter(item => item.method === "POST").length, 0);
});

test("el botón visible no permite revisar opciones no disponibles ni operaciones cerradas o ambiguas", async () => {
  const unavailable = { ...option, available: false, status: "denied" };
  const blocked = probe({ initial: { operation: { ...ready, options: [unavailable] }, optionId: option.id, reason: "medical" } });
  let tree = await blocked.mount();
  assert.equal(getButton(tree, "Revisar gestión").props.disabled, true);
  getButton(tree, "Revisar gestión").props.onClick(); tree = blocked.render();
  assert.equal(blocked.state.review, false);
  assert.equal(blocked.calls.filter(item => item.method === "POST").length, 0);
  for (const changes of [
    { operation: { ...ready, status: "EXPIRADA" } },
    { operation: { ...ready, status: "ERROR" } },
    { operation: { ...ready, status: "EJECUTANDO", selectedOption: option } },
    { operation: { ...ready, status: "EXITOSA", selectedOption: option } },
    { operation: { ...ready, status: "LISTA", selectedOption: option } },
    { uncertainId: ready.id },
  ]) {
    const ui = probe({ initial: { operation: ready, optionId: option.id, reason: "medical", ...changes } });
    tree = await ui.mount();
    assert.equal(elements(tree).some(node => node.type === "button" && textOf(node).trim() === "Revisar gestión"), false);
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

test("la navegación superior conserva exclusivamente los enlaces autorizados recibidos y marca PayJoy activo", async () => {
  const navigation = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
    { href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" },
  ];
  const ui = probe({ navigation, session: { roleLabel: "Vendedor" } });
  const tree = await ui.mount();
  const nav = elements(tree).find(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal");
  assert.ok(nav);
  const links = elements(nav).filter(node => node.type === "a");
  assert.deepEqual(links.map(node => node.props.href), navigation.map(item => item.href));
  assert.deepEqual(links.filter(node => node.props["aria-current"] === "page").map(node => node.props.href), ["/vendedor/payjoy/extensiones"]);
  assert.equal(links.some(node => node.props.href === "/dashboard/sedes"), false);
  assert.match(textOf(tree), /Asesor QA · Vendedor/);
  assert.deepEqual(ui.calls.map(call => call.method), ["GET"]);
});

test("la navegación administrativa conserva todos sus destinos y mantiene PayJoy visible fuera de Más", async () => {
  const navigation = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "wallet", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
    { href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" },
  ];
  const ui = probe({ navigation, session: { roleLabel: "Administrador" } });
  const tree = await ui.mount();
  const nav = elements(tree).find(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal");
  const links = elements(nav).filter(node => node.type === "a");
  assert.equal(links.length, navigation.length);
  assert.deepEqual(new Set(links.map(node => node.props.href)), new Set(navigation.map(item => item.href)));
  const more = elements(nav).find(node => node.type === "details");
  assert.ok(more);
  assert.notEqual(more.props.open, true);
  assert.ok(elements(more).some(node => node.type === "summary" && textOf(node).trim() === "Más"));
  const overflow = elements(more).filter(node => node.type === "a");
  assert.deepEqual(overflow.map(node => node.props.href), ["/cierre", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/sedes"]);
  const active = links.filter(node => node.props["aria-current"] === "page");
  assert.equal(active.length, 1);
  assert.equal(active[0].props.href, "/vendedor/payjoy/extensiones");
  assert.equal(overflow.includes(active[0]), false);
  assert.match(textOf(tree), /Asesor QA · Administrador/);
  assert.deepEqual(ui.calls.map(call => call.method), ["GET"]);
});

test("las reglas permanecen en una ayuda desplegable y los indicadores usan el historial autorizado", async () => {
  const ui = probe({ fetchImpl: async () => response({ operations: [ready, { ...ready, id: "other", status: "ERROR" }], canManage: true }) });
  const tree = await ui.mount();
  const rules = elements(tree).find(node => node.type === "details");
  assert.ok(rules);
  assert.notEqual(rules.props.open, true);
  assert.ok(elements(rules).some(node => node.type === "summary" && /consulta/.test(textOf(node))));
  assert.match(textOf(rules), /No es un listado completo de dispositivos en PayJoy/);
  const metrics = elements(tree).find(node => node.type === "section" && node.props["aria-label"] === "Resumen de la gestión");
  assert.ok(metrics);
  assert.match(textOf(metrics), /Sede QA/);
  assert.match(textOf(metrics), /Sin consulta/);
  assert.match(textOf(metrics), /Operaciones recientes 2/);
  assert.equal(ui.calls.length, 1);
});

test("los pasos distinguen inicio, equipo seleccionado, opciones y resultado confirmado sin adelantar el éxito", async () => {
  const cases = [
    { initial: {}, active: "Cliente o dispositivo", completed: 0 },
    { initial: { devices: [{ registroId: 4 }] }, active: "Cliente o dispositivo", completed: 0 },
    { initial: { devices: [{ registroId: 4 }], selectedDevice: 4 }, active: "Opciones de extensión", completed: 1 },
    { initial: { operation: { ...ready, status: "ERROR" } }, active: "Cliente o dispositivo", completed: 0 },
    { initial: { operation: ready }, active: "Revisar y confirmar", completed: 2 },
    { initial: { operation: ready, optionId: option.id, reason: "medical", review: true }, active: "Revisar y confirmar", completed: 2 },
    { initial: { operation: { ...ready, status: "EXITOSA", selectedOption: option, result: { success: true, status: "GRANTED", newValidThrough: null } } }, active: "Revisar y confirmar", completed: 3 },
  ];
  for (const { initial, active, completed } of cases) {
    const ui = probe({ initial });
    const tree = await ui.mount();
    const steps = elements(tree).find(node => node.type === "ol" && node.props["aria-label"] === "Pasos de la gestión");
    assert.ok(steps);
    const current = elements(steps).filter(node => node.type === "li" && node.props["aria-current"] === "step");
    assert.equal(current.length, 1);
    assert.ok(textOf(current[0]).includes(active));
    assert.equal(elements(steps).filter(node => node.type === "svg" && node.props["data-icon"] === "shield").length, completed);
    if (initial.operation?.status !== "EXITOSA") assert.doesNotMatch(textOf(steps), /Extensión confirmada por PayJoy/);
    assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
  }
});

test("el historial pagina diez operaciones y busca sobre todas antes de paginar sin enviar gestiones", async () => {
  const history = Array.from({ length: 23 }, (_, index) => ({
    ...ready, id: `history-${index + 1}`, deviceTag: `DQA${String(index + 1).padStart(5, "0")}`,
    imei: String(index + 1).padStart(15, "0"), asesorNombre: index === 22 ? "Asesóra Única" : `Asesor ${index + 1}`,
  }));
  const ui = probe({ fetchImpl: async () => response({ operations: history, canManage: true }) });
  let tree = await ui.mount();
  const rows = () => {
    const table = elements(tree).find(node => node.type === "table");
    const body = elements(table).find(node => node.type === "tbody");
    return elements(body).filter(node => node.type === "tr");
  };
  assert.equal(rows().length, 10);
  assert.match(textOf(rows()), /DQA00001/);
  assert.doesNotMatch(textOf(rows()), /DQA00011/);
  assert.equal(getButton(tree, "Anterior").props.disabled, true);
  getButton(tree, "Siguiente").props.onClick(); tree = ui.render();
  assert.equal(rows().length, 10);
  assert.match(textOf(rows()), /DQA00011/);
  getButton(tree, "Siguiente").props.onClick(); tree = ui.render();
  assert.equal(rows().length, 3);
  assert.match(textOf(tree), /Mostrando 21–23 de 23 operaciones/);
  assert.equal(getButton(tree, "Siguiente").props.disabled, true);
  elements(tree).find(node => node.type === "input" && node.props["aria-label"] === "Buscar en historial").props.onChange({ target: { value: " asesora unica " } }); tree = ui.render();
  assert.equal(rows().length, 1);
  assert.match(textOf(rows()), /DQA00023/);
  assert.match(textOf(rows()), /000000000000023/);
  assert.match(textOf(tree), /Mostrando 1–1 de 1 operación/);
  assert.equal(getButton(tree, "Anterior").props.disabled, true);
  getButton(tree, "Recuperar consulta").props.onClick(); tree = ui.render();
  assert.equal(ui.state.operation.id, "history-23");
  assert.deepEqual(ui.calls.map(call => call.method), ["GET"]);
});

test("preparar una consulta nueva conserva el límite reciente de treinta sin ocultar su resultado ni ejecutar la extensión", async () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    ...ready, id: `previous-${index + 1}`, deviceTag: `DOLD${String(index + 1).padStart(5, "0")}`,
    imei: String(index + 1).padStart(15, "0"),
  }));
  const next = { ...ready, id: "fresh-query", deviceTag: "DNEW1234", imei: "000999999999999" };
  const ui = probe({ initial: { manual: true, deviceTag: next.deviceTag }, fetchImpl: async call =>
    response(call.method === "GET" ? { operations: history, canManage: true } : { operation: next }),
  });
  let tree = await ui.mount();
  elements(tree).find(node => node.props?.id === "payjoy-manual").props.onSubmit(submit());
  await settle(); tree = ui.render();
  const rows = () => {
    const table = elements(tree).find(node => node.type === "table");
    const body = elements(table).find(node => node.type === "tbody");
    return elements(body).filter(node => node.type === "tr");
  };
  const metrics = elements(tree).find(node => node.type === "section" && node.props["aria-label"] === "Resumen de la gestión");
  assert.match(textOf(metrics), /Operaciones recientes 30/);
  assert.match(textOf(rows()), /DNEW1234/);
  assert.match(textOf(tree), /Mostrando 1–10 de 30 operaciones/);
  getButton(tree, "Siguiente").props.onClick(); tree = ui.render();
  getButton(tree, "Siguiente").props.onClick(); tree = ui.render();
  assert.equal(rows().length, 10);
  assert.match(textOf(tree), /Mostrando 21–30 de 30 operaciones/);
  assert.match(textOf(rows()), /DOLD00029/);
  assert.doesNotMatch(textOf(rows()), /DOLD00030/);
  assert.equal(getButton(tree, "Siguiente").props.disabled, true);
  elements(tree).find(node => node.type === "input" && node.props["aria-label"] === "Buscar en historial").props.onChange({ target: { value: "DOLD00030" } }); tree = ui.render();
  assert.match(textOf(rows()), /No hay operaciones que coincidan/);
  elements(tree).find(node => node.type === "input" && node.props["aria-label"] === "Buscar en historial").props.onChange({ target: { value: "DNEW1234" } }); tree = ui.render();
  assert.equal(rows().length, 1);
  assert.match(textOf(rows()), /DNEW1234/);
  assert.match(textOf(rows()), /000999999999999/);
  assert.equal(ui.state.operation.id, next.id);
  assert.deepEqual(ui.calls.map(call => [call.method, call.body?.action]), [["GET", undefined], ["POST", "preparar"]]);
});

test("la carga y el fallo del historial no inventan cifras ni limpian los campos de consulta", async () => {
  const ui = probe({ initial: { cedula: "10000001", deviceTag: "DABC1234", manual: true }, fetchImpl: async () => response({ error: "No se pudo cargar el historial de prueba." }, 503) });
  let tree = ui.render();
  const before = elements(tree).find(node => node.type === "section" && node.props["aria-label"] === "Resumen de la gestión");
  assert.match(textOf(before), /Operaciones recientes …/);
  tree = await ui.mount();
  const after = elements(tree).find(node => node.type === "section" && node.props["aria-label"] === "Resumen de la gestión");
  assert.match(textOf(after), /Operaciones recientes No disponible/);
  assert.match(textOf(tree), /No se pudo cargar el historial/);
  assert.equal(ui.state.cedula, "10000001");
  assert.equal(ui.state.deviceTag, "DABC1234");
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
});
