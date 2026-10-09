import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const workspacePath = "app/dashboard/proveedores/workspace.tsx";
const source = path => readFileSync(join(ROOT, path), "utf8");

function load(path, imports = {}, injected = {}, transform = value => value) {
  const output = ts.transpileModule(transform(source(path)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", ...Object.keys(injected), output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return loaded.exports;
}

const pagos = load("lib/proveedores-pagos.ts");
const seleccion = load("lib/proveedores-seleccion.ts", { "./proveedores-pagos": pagos });
const fechas = load("lib/credit-date-utils.ts");
const proveedores = load("lib/proveedores.ts", { "@/lib/credit-date-utils": fechas, "./proveedores-pagos": pagos });
const access = load("lib/access-control.ts");

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
function control(tree, label) {
  const parent = elements(tree).find(node => node.type === "label" && textOf(node).trim().startsWith(label));
  const result = elements(parent).find(node => node.type === "input" || node.type === "textarea");
  assert.ok(result, `Falta el control ${label}`);
  return result;
}
function modal(tree, titleId = "approve-supplier-payment-title") {
  const result = elements(tree).find(node => node.props?.role === "dialog" && node.props["aria-labelledby"] === titleId);
  assert.ok(result, `Falta el modal ${titleId}`);
  return result;
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const submitEvent = () => ({ preventDefault() {} });
const oldReceipt = {
  id: 81, numeroRecibo: "PROV-00000081", valor: 300.05, saldoAnterior: 1000.10, saldoPosterior: 700.05,
  aprobadoEn: "2026-10-08T15:10:20.000Z", aprobadoPor: "Auditor QA", referencia: "ANTERIOR", observacion: null,
  reciboUrl: "/api/proveedores/41/abonos/81/recibo",
};
const invoice = {
  id: 41, aliado: "Proveedor QA", numeroFactura: "QA-100", fechaVencimiento: "2026-10-19", estado: "PENDIENTE",
  valorFactura: 1000.10, valorPagar: 1000.10, valorAbonado: 300.05, saldoPendiente: 700.05, cantidadAbonos: 1,
  diasParaVencer: 10, estadoVencimiento: "AL_DIA", pagoAprobadoEn: null, pagoAprobadoPor: null, abonos: [oldReceipt],
};
const session = { nombre: "Administrador QA", usuario: "admin-qa", rol: "Administrador", rolNombre: "ADMIN", sedeNombre: "Sede QA" };

function paymentResult(amount) {
  const cents = pagos.paymentAmountToCents(String(amount));
  const balance = (70005 - cents) / 100;
  const abono = { ...oldReceipt, id: 82, numeroRecibo: "PROV-00000082", valor: cents / 100, saldoAnterior: 700.05, saldoPosterior: balance, referencia: "QA NUEVO", reciboUrl: "/api/proveedores/41/abonos/82/recibo" };
  const item = { ...invoice, estado: balance === 0 ? "PAGADO" : "PENDIENTE", valorAbonado: (30005 + cents) / 100, saldoPendiente: balance, cantidadAbonos: 2, abonos: [abono, oldReceipt] };
  return { ok: true, item, abono, mensaje: "Abono QA aprobado" };
}

function workspaceProbe({ initial = {}, fetchImpl } = {}) {
  const input = source(workspacePath);
  const ast = ts.createSourceFile(workspacePath, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === "useState" ? [entry.name.elements[0].name.getText(ast)] : []);
  const locals = declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text);
  const finalReturn = component.body.statements.find(ts.isReturnStatement);
  assert.ok(finalReturn);
  const state = { invoices: [invoice], today: "2026-10-09", loading: false, pushStatus: "unsupported", ...initial };
  const refs = []; const calls = []; const refreshes = []; const opened = [];
  let cursor = 0; let refCursor = 0; let captured; let serverInvoices = state.invoices;
  const imports = {
    react: {
      useState(value) { const name = states[cursor++]; assert.ok(name); if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
      useRef(value) { return refs[refCursor++] ??= { current: value }; },
    },
    "react/jsx-runtime": jsx,
    "next/image": { __esModule: true, default: props => jsx.jsx("img", { src: props.src, alt: props.alt }) },
    "next/link": { __esModule: true, default: props => jsx.jsx("a", { ...props }) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/lib/use-live-refresh": { useLiveRefresh() {}, triggerLiveRefresh: event => refreshes.push(event) },
    "@/lib/proveedores-pagos": pagos,
    "@/lib/proveedores-seleccion": seleccion,
    "./proveedores.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  const workspace = load(workspacePath, imports, {
    __capture: value => { captured = value; },
    crypto: { randomUUID },
    window: { open: (...args) => opened.push(args) },
    navigator: {},
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (fetchImpl) return fetchImpl(url, options);
      if (options.method === "POST") {
        const result = paymentResult(JSON.parse(options.body).valorAbono);
        serverInvoices = [result.item];
        return response(result, 201);
      }
      return response({ items: serverInvoices, hoy: "2026-10-09", diasAnticipacion: 3 });
    },
  }, text => text.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(",")}});\n` + text.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, refreshes, opened,
    render() { cursor = 0; refCursor = 0; return resolve(workspace.default({ session })); },
    get view() { return captured; },
    open() { captured.openPaymentDialog(captured.visibleInvoices.find(item => item.id === invoice.id)); return this.render(); },
  };
  instance.render();
  return instance;
}

test("abrir el abono usa la factura elegida y anticipa pago total sin escribir en el servidor", () => {
  const instance = workspaceProbe();
  const tree = instance.open();
  assert.equal(instance.state.paymentForm.valorAbono, "700.05");
  assert.equal(instance.view.paymentBalanceAfter, 0);
  assert.equal(instance.view.paymentWillSettle, true);
  const text = textOf(modal(tree));
  assert.ok(text.includes("Proveedor QA")); assert.ok(text.includes("QA-100"));
  assert.ok(text.includes("La factura quedará pagada"));
  assert.deepEqual(instance.calls, []);
  assert.equal(instance.state.invoices[0], invoice);
});

test("escribir valor, referencia y observación actualiza vista previa parcial con centavos sin guardar", () => {
  const instance = workspaceProbe();
  let tree = instance.open();
  control(modal(tree), "Valor del abono").props.onChange({ target: { value: "250,10" }, nativeEvent: { inputType: "insertFromPaste" } });
  tree = instance.render();
  control(modal(tree), "Referencia").props.onChange({ target: { value: " Ref QA 001 " } });
  control(modal(tree), "Observación").props.onChange({ target: { value: " Abono parcial QA " } });
  instance.render();
  assert.deepEqual(instance.state.paymentForm, { valorAbono: "250.10", referencia: " Ref QA 001 ", observacion: " Abono parcial QA " });
  assert.equal(instance.view.paymentBalanceAfter, 449.95);
  assert.equal(instance.view.paymentWillSettle, false);
  assert.equal(instance.view.paymentExceedsBalance, false);
  assert.deepEqual(instance.calls, []);
  assert.equal(instance.state.invoices[0].saldoPendiente, 700.05);
});

test("cero, vacío, valor inválido y sobreabono no emiten POST ni generan recibo", async () => {
  for (const amount of ["", "0", "0.00", "-1", "abc", "700.06"]) {
    const instance = workspaceProbe(); instance.open();
    instance.state.paymentForm = { valorAbono: amount, referencia: "QA", observacion: "Conservar" };
    instance.render();
    await instance.view.approvePayment(submitEvent()); instance.render();
    assert.ok(instance.state.paymentAmountError, amount);
    assert.deepEqual(instance.calls, [], amount);
    assert.equal(instance.state.receiptPayment, null);
    assert.equal(instance.state.paymentForm.valorAbono, amount);
    assert.equal(instance.state.approvalInvoice.id, invoice.id);
  }
});

test("abono parcial confirmado actualiza saldo, indicadores, historial y acceso al recibo", async () => {
  const instance = workspaceProbe(); instance.open();
  instance.state.receiptHistoryInvoice = instance.state.approvalInvoice;
  instance.state.paymentForm = { valorAbono: "250.10", referencia: " QA NUEVO ", observacion: " Parcial " };
  instance.render();
  await instance.view.approvePayment(submitEvent()); const tree = instance.render();
  assert.deepEqual(instance.calls.map(call => [call.url, call.options.method || "GET"]), [["/api/proveedores/41/aprobar-pago", "POST"], ["/api/proveedores", "GET"]]);
  const payload = JSON.parse(instance.calls[0].options.body);
  assert.equal(payload.valorAbono, "250.10"); assert.equal(payload.referencia, "QA NUEVO"); assert.equal(payload.observacion, "Parcial");
  assert.equal(payload.idempotencyKey, instance.calls[0].options.headers["Idempotency-Key"]);
  assert.equal(instance.state.invoices[0].saldoPendiente, 449.95);
  assert.equal(instance.state.invoices[0].valorAbonado, 550.15);
  assert.equal(instance.state.invoices[0].estado, "PENDIENTE");
  assert.equal(instance.view.summary.pendingTotal, 449.95);
  assert.equal(instance.view.activeReceiptHistory.cantidadAbonos, 2);
  assert.equal(instance.view.activeReceiptHistory.abonos[0].id, 82);
  assert.equal(instance.state.approvalInvoice, null); assert.equal(instance.state.paymentAttempt, null);
  assert.equal(instance.state.flash.tone, "success");
  assert.deepEqual(instance.refreshes, ["pago-proveedor-aprobado"]);
  const receipt = modal(tree, "supplier-payment-receipt-title");
  const openButton = elements(receipt).find(node => node.type === "button" && textOf(node).includes("ABRIR / IMPRIMIR RECIBO"));
  assert.ok(openButton); openButton.props.onClick();
  assert.deepEqual(instance.opened, [["/api/proveedores/41/abonos/82/recibo", "_blank", "noopener,noreferrer"]]);
});

test("pago total confirmado deja saldo cero, factura pagada y recibo completo", async () => {
  const instance = workspaceProbe(); instance.open();
  await instance.view.approvePayment(submitEvent()); instance.render();
  assert.equal(instance.state.invoices[0].saldoPendiente, 0);
  assert.equal(instance.state.invoices[0].valorAbonado, 1000.10);
  assert.equal(instance.state.invoices[0].estado, "PAGADO");
  assert.equal(instance.view.summary.pendingTotal, 0); assert.equal(instance.view.summary.approved, 1);
  assert.equal(instance.state.receiptPayment.abono.valor, 700.05);
  assert.equal(instance.state.receiptPayment.abono.saldoPosterior, 0);
  assert.equal(instance.state.receiptPayment.factura.abonos.length, 2);
});

test("doble clic antes del siguiente render solo inicia un POST y bloquea cierre durante procesamiento", async () => {
  let release;
  const pending = new Promise(resolvePending => { release = resolvePending; });
  const instance = workspaceProbe({ fetchImpl: async (_url, options) => options.method === "POST" ? pending : response({ items: [paymentResult("700.05").item] }) });
  instance.open(); const handler = instance.view.approvePayment;
  const first = handler(submitEvent());
  await handler(submitEvent());
  const tree = instance.render();
  assert.equal(instance.calls.length, 1);
  assert.equal(instance.state.approvingId, 41);
  assert.equal(instance.view.paymentInFlightRef.current, true);
  const submit = elements(modal(tree)).find(node => node.type === "button" && node.props.type === "submit");
  assert.equal(submit.props.disabled, true); assert.ok(textOf(submit).includes("Aprobando"));
  instance.view.closePaymentDialog(); assert.equal(instance.state.approvalInvoice.id, 41);
  release(response(paymentResult("700.05"), 201)); await first; instance.render();
  assert.equal(instance.calls.filter(call => call.options.method === "POST").length, 1);
  assert.equal(instance.view.paymentInFlightRef.current, false); assert.equal(instance.state.approvingId, null);
});

test("fallo de conexión conserva campos y reintenta exactamente el mismo pago con la misma clave", async () => {
  let attempts = 0;
  const instance = workspaceProbe({ fetchImpl: async (_url, options) => {
    if (options.method !== "POST") return response({ items: [paymentResult("250.10").item] });
    if (++attempts === 1) throw Error("Conexión interrumpida QA");
    return response(paymentResult("250.10"), 200);
  } });
  instance.open();
  const form = { valorAbono: "250.10", referencia: "Ref 123", observacion: "Parcial" };
  instance.state.paymentForm = form; instance.render();
  await instance.view.approvePayment(submitEvent()); let tree = instance.render();
  assert.equal(instance.state.paymentForm, form); assert.equal(instance.state.invoices[0], invoice);
  assert.equal(instance.state.receiptPayment, null); assert.equal(instance.state.flash, null);
  assert.ok(instance.state.paymentError); assert.equal(instance.state.approvalInvoice.id, 41);
  assert.ok(instance.state.paymentAttempt); assert.equal(control(modal(tree), "Valor del abono").props.disabled, true);
  const firstBody = instance.calls[0].options.body;
  await instance.view.approvePayment(submitEvent()); tree = instance.render();
  const posts = instance.calls.filter(call => call.options.method === "POST");
  assert.equal(posts.length, 2); assert.equal(posts[1].options.body, firstBody);
  assert.equal(posts[1].options.headers["Idempotency-Key"], posts[0].options.headers["Idempotency-Key"]);
  assert.equal(instance.state.invoices[0].cantidadAbonos, 2); assert.equal(instance.state.approvalInvoice, null);
  assert.ok(modal(tree, "supplier-payment-receipt-title"));
});

test("conflicto de saldo actualiza la factura autoritativa y conserva todos los campos para corregir", async () => {
  const authoritative = { ...invoice, valorAbonado: 500.10, saldoPendiente: 500 };
  const instance = workspaceProbe({ fetchImpl: async () => response({ error: "El saldo cambió", item: authoritative }, 409) });
  instance.open(); const form = { valorAbono: "700.05", referencia: "Ref conservada", observacion: "Observación conservada" };
  instance.state.paymentForm = form; instance.render();
  await instance.view.approvePayment(submitEvent()); instance.render();
  assert.equal(instance.state.paymentForm, form);
  assert.equal(instance.state.invoices[0].saldoPendiente, 500);
  assert.equal(instance.state.approvalInvoice.saldoPendiente, 500);
  assert.equal(instance.state.paymentAttempt, null); assert.equal(instance.state.receiptPayment, null);
  assert.ok(instance.state.paymentAmountError.includes("máximo")); assert.ok(instance.state.paymentError.includes("saldo"));
  assert.equal(instance.view.paymentExceedsBalance, true); assert.equal(instance.view.paymentBalanceAfter, null);
  const firstKey = instance.calls[0].options.headers["Idempotency-Key"];
  assert.notEqual(instance.state.paymentIdempotencyKey, firstKey);
});

test("respuesta 2xx incompleta no confirma éxito y mantiene el intento hasta recuperar su recibo", async () => {
  let attempts = 0;
  const instance = workspaceProbe({ fetchImpl: async (_url, options) => {
    if (options.method !== "POST") return response({ items: [paymentResult("700.05").item] });
    return response(++attempts === 1 ? { ok: true, item: paymentResult("700.05").item } : paymentResult("700.05"));
  } });
  instance.open();
  await instance.view.approvePayment(submitEvent()); instance.render();
  assert.equal(instance.state.flash, null); assert.equal(instance.state.receiptPayment, null);
  assert.equal(instance.state.invoices[0], invoice); assert.ok(instance.state.paymentAttempt);
  assert.ok(instance.state.paymentError); assert.equal(instance.state.approvalInvoice.id, 41);
  await instance.view.approvePayment(submitEvent()); instance.render();
  assert.equal(instance.calls[0].options.body, instance.calls[1].options.body);
  assert.equal(instance.state.receiptPayment.abono.id, 82); assert.equal(instance.state.flash.tone, "success");
});

class NextResponse extends Response {
  static json(body, options = {}) { return response(body, options.status || 200); }
}
function serverProbe({ sessionUser = { id: 7, nombre: "Admin QA", usuario: "adminqa", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" } } = {}) {
  const stored = {
    id: 41, aliado: "Proveedor QA", numeroFactura: "QA-API-41", valorPagar: "1000.10", estado: "PENDIENTE",
    fechaVencimiento: "2026-10-19T00:00:00.000Z", creadoPorId: 7, creadoPorNombre: "Admin QA",
    createdAt: "2026-10-09T10:00:00.000Z", updatedAt: "2026-10-09T10:00:00.000Z",
    pagoAprobadoEn: null, pagoAprobadoPorId: null, pagoAprobadoPorNombre: null, abonos: [],
  };
  const locks = []; const writes = []; const updates = [];
  const tx = {
    $queryRaw: async (_template, id) => { locks.push(id); return id === stored.id ? [{ id }] : []; },
    facturaProveedor: {
      findUnique: async ({ where }) => where.id === stored.id ? { ...stored, abonos: [...stored.abonos] } : null,
      update: async ({ data }) => { updates.push(data); Object.assign(stored, data); return stored; },
    },
    abonoFacturaProveedor: {
      findUnique: async ({ where }) => stored.abonos.find(abono => abono.claveIdempotencia === where.claveIdempotencia) || null,
      create: async ({ data }) => {
        const abono = { ...data, id: 100 + stored.abonos.length, createdAt: data.aprobadoEn, updatedAt: data.aprobadoEn };
        writes.push(abono); stored.abonos.push(abono); return abono;
      },
    },
  };
  const route = load("app/api/proveedores/[id]/aprobar-pago/route.ts", {
    "next/server": { NextResponse },
    "@/lib/auth": { getSessionUser: async () => sessionUser },
    "@/lib/access-control": access,
    "@/lib/proveedores": proveedores,
    "@/lib/prisma": { __esModule: true, default: { $transaction: async fn => fn(tx) } },
  });
  return {
    stored, locks, writes, updates,
    async pay(amount, key = randomUUID(), extra = {}, headerKey = key) {
      const body = { valorAbono: amount, idempotencyKey: key, ...extra };
      const result = await route.POST(new Request("http://qa.local/api/proveedores/41/aprobar-pago", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": headerKey }, body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: "41" }) });
      return { status: result.status, body: await result.json(), cache: result.headers.get("Cache-Control") };
    },
  };
}

test("POST real rechaza cero, negativo y sobreabono en servidor sin crear registros", async () => {
  for (const amount of ["0", "-1", "abc", "1000.11"]) {
    const server = serverProbe(); const result = await server.pay(amount);
    assert.ok([400, 409].includes(result.status), amount);
    assert.equal(server.writes.length, 0); assert.equal(server.updates.length, 0);
    assert.equal(server.stored.abonos.length, 0); assert.equal(server.stored.estado, "PENDIENTE");
    if (amount === "1000.11") {
      assert.equal(result.body.codigo, "SOBREABONO"); assert.equal(result.body.item.saldoPendiente, 1000.10);
      assert.deepEqual(server.locks, [41]);
    }
  }
});

test("POST real registra parcial y total exactos, genera recibos e incluye ambos en historial", async () => {
  const server = serverProbe();
  const partial = await server.pay("250.10", "qa-parcial-41", { referencia: " Ref QA ", observacion: " Parcial QA " });
  assert.equal(partial.status, 201); assert.equal(partial.body.item.saldoPendiente, 750);
  assert.equal(partial.body.item.valorAbonado, 250.10); assert.equal(partial.body.item.estado, "PENDIENTE");
  assert.equal(partial.body.abono.saldoAnterior, 1000.10); assert.equal(partial.body.abono.saldoPosterior, 750);
  assert.equal(partial.body.abono.referencia, "Ref QA"); assert.equal(partial.body.abono.observacion, "Parcial QA");
  assert.equal(partial.body.reciboUrl, "/api/proveedores/41/abonos/100/recibo");
  assert.equal(server.updates.length, 0, "Un abono parcial no liquida la factura");
  const complete = await server.pay("750.00", "qa-total-41");
  assert.equal(complete.status, 201); assert.equal(complete.body.item.saldoPendiente, 0);
  assert.equal(complete.body.item.valorAbonado, 1000.10); assert.equal(complete.body.item.estado, "PAGADO");
  assert.equal(complete.body.item.cantidadAbonos, 2); assert.equal(complete.body.item.abonos.length, 2);
  assert.equal(complete.body.abono.saldoAnterior, 750); assert.equal(complete.body.abono.saldoPosterior, 0);
  assert.equal(server.updates.length, 1); assert.equal(server.stored.pagoAprobadoPorNombre, "Admin QA");
  assert.ok(complete.cache.includes("no-store")); assert.deepEqual(server.locks, [41, 41]);
});

test("POST real reintenta parcial y total con el mismo recibo sin duplicar el abono", async () => {
  const server = serverProbe();
  const partial = await server.pay("300.05", "qa-retry-parcial");
  const repeatedPartial = await server.pay("300.05", "qa-retry-parcial");
  assert.equal(repeatedPartial.status, 200); assert.equal(repeatedPartial.body.repetido, true);
  assert.equal(repeatedPartial.body.abono.id, partial.body.abono.id); assert.equal(server.writes.length, 1);
  assert.equal(repeatedPartial.body.item.saldoPendiente, 700.05);
  const complete = await server.pay("700.05", "qa-retry-total");
  const repeatedComplete = await server.pay("700.05", "qa-retry-total");
  assert.equal(repeatedComplete.status, 200); assert.equal(repeatedComplete.body.repetido, true);
  assert.equal(repeatedComplete.body.abono.id, complete.body.abono.id); assert.equal(server.writes.length, 2);
  assert.equal(repeatedComplete.body.item.saldoPendiente, 0); assert.equal(server.updates.length, 1);
  const extra = await server.pay("1.00", "qa-extra-after-paid");
  assert.equal(extra.status, 409); assert.equal(extra.body.codigo, "SIN_SALDO"); assert.equal(server.writes.length, 2);
});

test("POST real rechaza reutilizar la clave con otro importe o datos y claves inconsistentes", async () => {
  const server = serverProbe();
  await server.pay("300.05", "qa-conflict-key", { referencia: "REF-1", observacion: "OBS-1" });
  for (const [amount, extra] of [["300.06", { referencia: "REF-1", observacion: "OBS-1" }], ["300.05", { referencia: "REF-2", observacion: "OBS-1" }], ["300.05", { referencia: "REF-1", observacion: "OBS-2" }]]) {
    const result = await server.pay(amount, "qa-conflict-key", extra);
    assert.equal(result.status, 409); assert.equal(result.body.codigo, "IDEMPOTENCIA_CONFLICTO");
  }
  const mismatch = await server.pay("1", "qa-body-key", {}, "qa-header-key");
  assert.equal(mismatch.status, 409); assert.equal(mismatch.body.codigo, "IDEMPOTENCIA_CONFLICTO");
  assert.equal(server.writes.length, 1); assert.equal(server.stored.abonos[0].valor, "300.05");
});

test("POST real mantiene permiso y autenticación antes de acceder a la factura", async () => {
  for (const [sessionUser, expected] of [[null, 401], [{ id: 8, rolNombre: "VENDEDOR", perfilTipo: "VENDEDOR" }, 403]]) {
    const server = serverProbe({ sessionUser }); const result = await server.pay("1");
    assert.equal(result.status, expected); assert.deepEqual(server.locks, []); assert.equal(server.writes.length, 0);
  }
});
