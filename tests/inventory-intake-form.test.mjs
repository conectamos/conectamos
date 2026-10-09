import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as imeis from "../lib/inventory-imeis.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const jsx = createRequire(import.meta.url)("react/jsx-runtime");
const path = "app/inventario/nuevo/page.tsx";
const source = readFileSync(join(ROOT, path), "utf8");
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
const locals = declarations.filter(node => ts.isIdentifier(node.name)).map(node => node.name.text);
const finalReturn = component.body.statements.find(ts.isReturnStatement);
const instrumented = source.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(",")}});\n` + source.slice(finalReturn.getStart(ast));
const output = ts.transpileModule(instrumented, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function resolve(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(textOf).join(" "); return typeof node === "object" ? textOf(node.props?.children) : String(node); }
function control(tree, id) { const found = elements(tree).find(node => node.props?.id === id); assert.ok(found, `Falta ${id}`); return found; }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const event = () => ({ preventDefault() {} });
const admin = { id: 4, nombre: "Administrador QA", usuario: "adminqa", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL", rolNombre: "ADMIN" };
const catalogo = [{ id: 1, nombre: "Referencia QA", activo: true }, { id: 2, nombre: "Referencia oculta QA", activo: false }];
const valid = "001234567890123";
const existing = "101234567890123";
const valid2 = "201234567890123";
const initial = { user: admin, catalogo, loading: false, referencia: "Referencia QA", costo: "610000", numeroFactura: "QA-741", distribuidor: "COMUNICARIBE", color: "GRIS" };
const storageKey = userId => `conectamos:inventario-ingreso:pendiente:${userId}`;

function probe({ state: stateInput = {}, fetchImpl, session = admin, storage = new Map() } = {}) {
  const state = { ...stateInput }; const refs = []; const effects = []; const calls = []; const refreshes = [];
  let cursor = 0; let refCursor = 0; let captured; let routerRefreshes = 0;
  const imports = {
    react: {
      useState(value) { const name = states[cursor++]; assert.ok(name); if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
      useEffect(fn) { if (!effects.length) effects.push(fn); }, useMemo: fn => fn(), useRef(value) { return refs[refCursor++] ??= { current: value }; },
    },
    "react/jsx-runtime": jsx,
    "next/image": { __esModule: true, default: props => jsx.jsx("img", { src: props.src, alt: props.alt }) },
    "next/link": { __esModule: true, default: props => jsx.jsx("a", props) },
    "next/navigation": { useRouter: () => ({ refresh() { routerRefreshes++; } }) },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/lib/product-types": { TIPOS_PRODUCTO: ["TELEFONIA", "ELECTRODOMESTICO"] },
    "@/lib/inventory-imeis": imeis,
    "@/lib/use-live-refresh": { triggerLiveRefresh: source => refreshes.push(source) },
    "./nuevo.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "__capture", "crypto", "sessionStorage", "fetch", output)(name => { assert.ok(name in imports, `Import inesperado ${name}`); return imports[name]; }, loaded, loaded.exports, value => { captured = value; }, { randomUUID }, {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  }, async (url, options = {}) => {
    calls.push({ url, options });
    if (fetchImpl) return fetchImpl(url, options);
    if (url === "/api/session") return response(session);
    if (url === "/api/inventario-principal/referencias") return response({ referencias: catalogo });
    if (url === "/api/inventario/revisar") return response({ ok: true, ...imeis.revisarEntradasImeis(JSON.parse(options.body).imeis, new Set([existing])) });
    return response({ ok: true, insertados: JSON.parse(options.body).imeis.length, omitidos: 0 });
  });
  const instance = {
    state, calls, storage, refreshes,
    render() { cursor = 0; refCursor = 0; return resolve(loaded.exports.default()); },
    get view() { return captured; }, get routerRefreshes() { return routerRefreshes; },
    async init() { effects[0](); await new Promise(resolve => setImmediate(resolve)); return this.render(); },
    async review() { await this.view.revisarLista(); return this.render(); },
    async save() { await this.view.guardar(event()); return this.render(); },
  };
  instance.render(); return instance;
}

test("carga sesión y catálogo; navegación completa conserva Inventario activo y referencias ocultas excluidas", async () => {
  const instance = probe(); let tree = instance.render();
  assert.equal(elements(tree).find(node => node.type === "button" && node.props.type === "submit").props.disabled, true);
  tree = await instance.init();
  assert.deepEqual(instance.calls.map(call => call.url), ["/api/session", "/api/inventario-principal/referencias"]);
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/inventario" && node.props["aria-current"] === "page"));
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/dashboard/aprobaciones"));
  assert.ok(elements(tree).some(node => node.type === "a" && node.props.href === "/dashboard/sedes"));
  assert.equal(elements(control(tree, "ingreso-referencia")).filter(node => node.type === "option").length, 2);
});

test("alternar pestañas conserva borradores independientes y no repara ni redondea IMEI incorrectos", () => {
  const instance = probe({ state: initial }); let tree = instance.render();
  control(tree, "imei-individual").props.onChange({ target: { value: valid } }); tree = instance.render();
  control(tree, "tab-masiva").props.onClick(); tree = instance.render();
  assert.ok(!elements(tree).some(node => node.props?.id === "imei-individual"));
  control(tree, "imei-masivo").props.onChange({ target: { value: `${valid2}; 35A123456789012,3.55123456789012e14` } }); tree = instance.render();
  assert.equal(instance.state.imeisMasivos, `${valid2}\n35A123456789012\n3.55123456789012e14`);
  control(tree, "tab-individual").props.onClick(); tree = instance.render();
  assert.equal(control(tree, "imei-individual").props.value, valid);
  assert.equal(instance.state.imeisMasivos.split("\n").length, 3);
  assert.deepEqual(instance.calls, []);
});

test("revisión identifica incorrectos, repetidos y existentes y suma solamente equipos elegibles", async () => {
  const instance = probe({ state: { ...initial, modo: "masiva", imeisMasivos: `${valid}\n${valid}\n${existing}\nmal\n${valid2}` } });
  const tree = await instance.review();
  assert.equal(instance.view.cantidadValida, 2); assert.equal(instance.view.excluidos, 3);
  assert.deepEqual(instance.state.review.imeisValidos, [valid, valid2]);
  assert.match(textOf(elements(tree).find(node => node.type === "aside")), /\$\s+1\.220\.000/);
  assert.ok(textOf(tree).includes("3 entradas excluidas"));
  assert.deepEqual(instance.calls.map(call => call.url), ["/api/inventario/revisar"]);
  assert.deepEqual(instance.refreshes, []);
});

test("guardar sin revisión revisa primero; después envía únicamente válidos de la pestaña activa", async () => {
  const instance = probe({ state: { ...initial, imei: valid2, modo: "masiva", imeisMasivos: `${valid}\n${existing}\n${valid}` } });
  await instance.save();
  assert.deepEqual(instance.calls.map(call => call.url), ["/api/inventario/revisar"]);
  assert.equal(instance.state.pending, false);
  assert.equal(instance.state.notice.error, true);
  await instance.save();
  const call = instance.calls.at(-1);
  assert.equal(call.url, "/api/inventario-principal");
  assert.deepEqual(JSON.parse(call.options.body).imeis, [valid]);
  assert.ok(call.options.headers["Idempotency-Key"]);
  assert.equal(instance.state.imei, valid2); assert.equal(instance.state.imeisMasivos, "");
  assert.equal(instance.state.notice.error, false); assert.deepEqual(instance.refreshes, ["inventario-ingreso"]);
});

test("doble clic antes del render registra una sola carga; solo confirma después de respuesta íntegra", async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const instance = probe({ state: { ...initial, imei: valid }, fetchImpl: async (url, options) => url === "/api/inventario/revisar" ? response({ ok: true, ...imeis.revisarEntradasImeis(JSON.parse(options.body).imeis) }) : waiting });
  await instance.review();
  const handler = instance.view.guardar; const first = handler(event()); await handler(event());
  let tree = instance.render();
  assert.equal(instance.calls.filter(call => call.url === "/api/inventario-principal").length, 1);
  assert.equal(instance.state.guardando, true); assert.equal(instance.state.notice, null);
  assert.equal(control(tree, "imei-individual").props.disabled, true);
  release(response({ ok: true, insertados: 1, omitidos: 0 })); await first; tree = instance.render();
  assert.equal(instance.state.notice.error, false); assert.equal(instance.state.imei, "");
  assert.equal(instance.state.pending, false); assert.equal(instance.routerRefreshes, 1);
  assert.equal(instance.storage.has(storageKey(admin.id)), false);
});

test("fallo incierto conserva datos y clave; reintento usa exactamente el mismo cuerpo sin revisar nuevamente", async () => {
  let attempts = 0;
  const instance = probe({ state: { ...initial, imei: valid }, fetchImpl: async (url, options) => {
    if (url === "/api/inventario/revisar") return response({ ok: true, ...imeis.revisarEntradasImeis(JSON.parse(options.body).imeis) });
    if (++attempts === 1) throw Error("Sin conexión QA");
    return response({ ok: true, insertados: 1, omitidos: 0, replayed: true });
  } });
  await instance.review(); const tree = await instance.save();
  assert.equal(instance.state.imei, valid); assert.equal(instance.state.costo, "610000"); assert.equal(instance.state.pending, true);
  assert.equal(control(tree, "imei-individual").props.disabled, true); assert.equal(instance.state.notice.error, true);
  assert.ok(instance.storage.has(storageKey(admin.id))); assert.deepEqual(instance.refreshes, []);
  await instance.save();
  const writes = instance.calls.filter(call => call.url === "/api/inventario-principal");
  assert.equal(writes.length, 2); assert.equal(writes[0].options.body, writes[1].options.body);
  assert.equal(writes[0].options.headers["Idempotency-Key"], writes[1].options.headers["Idempotency-Key"]);
  assert.equal(instance.calls.filter(call => call.url === "/api/inventario/revisar").length, 1);
  assert.equal(instance.state.notice.error, false);
});

test("respuesta parcial no informa éxito ni borra el intento pendiente", async () => {
  const instance = probe({ state: { ...initial, modo: "masiva", imeisMasivos: `${valid}\n${valid2}` }, fetchImpl: async (url, options) => url === "/api/inventario/revisar" ? response({ ok: true, ...imeis.revisarEntradasImeis(JSON.parse(options.body).imeis) }) : response({ ok: true, insertados: 1, omitidos: 1 }) });
  await instance.review(); await instance.save();
  assert.equal(instance.state.notice.error, true); assert.equal(instance.state.pending, true);
  assert.equal(instance.state.imeisMasivos, `${valid}\n${valid2}`); assert.deepEqual(instance.refreshes, []);
});

test("conflicto de inventario conserva campos, invalida revisión y permite corregir antes de reintentar", async () => {
  const instance = probe({ state: { ...initial, imei: valid }, fetchImpl: async (url, options) => url === "/api/inventario/revisar" ? response({ ok: true, ...imeis.revisarEntradasImeis(JSON.parse(options.body).imeis) }) : response({ error: "El inventario cambió. Revisa nuevamente." }, 409) });
  await instance.review(); const tree = await instance.save();
  assert.equal(instance.state.imei, valid); assert.equal(instance.state.pending, false); assert.equal(instance.state.review, null);
  assert.equal(control(tree, "imei-individual").props.disabled, false); assert.deepEqual(instance.refreshes, []);
});

test("usuario de sede conserva deuda, acreedor y ruta propia; no obtiene acceso administrativo", async () => {
  const instance = probe({ state: { ...initial, user: { ...admin, id: 8, rolNombre: "SUPERVISOR", sedeNombre: "SEDE QA" }, imei: valid, distribuidor: "Proveedor FINSER", estadoFinanciero: "DEUDA", deboA: "Proveedor FINSER" } });
  let tree = instance.render();
  assert.ok(control(tree, "ingreso-acreedor")); assert.equal(control(tree, "ingreso-referencia").type, "input");
  assert.ok(!elements(tree).some(node => node.props?.id === "ingreso-factura"));
  assert.ok(!elements(tree).some(node => node.type === "a" && node.props.href === "/dashboard/sedes"));
  await instance.review(); await instance.save();
  assert.equal(instance.calls[0].url, "/api/inventario/revisar"); assert.equal(JSON.parse(instance.calls[0].options.body).destino, "SEDE");
  const write = instance.calls.at(-1); const payload = JSON.parse(write.options.body);
  assert.equal(write.url, "/api/inventario"); assert.equal(payload.estadoFinanciero, "DEUDA"); assert.equal(payload.deboA, "Proveedor FINSER"); assert.equal(payload.imei, valid);
});

test("recargar recupera un intento pendiente y confirma su clave sin volver a insertar con otra", async () => {
  const request = { key: randomUUID(), endpoint: "/api/inventario-principal", payload: { imeis: [valid], referencia: "Referencia QA", tipoProducto: "TELEFONIA", color: "GRIS", costo: 610000, numeroFactura: "QA-741", distribuidor: "COMUNICARIBE" }, modo: "individual", entrada: valid };
  const storage = new Map([[storageKey(admin.id), JSON.stringify(request)]]);
  const instance = probe({ storage }); await instance.init();
  assert.equal(instance.state.pending, true); assert.equal(instance.state.imei, valid);
  await instance.save();
  const write = instance.calls.at(-1);
  assert.equal(write.options.headers["Idempotency-Key"], request.key); assert.deepEqual(JSON.parse(write.options.body), request.payload);
  assert.ok(!instance.calls.some(call => call.url === "/api/inventario/revisar")); assert.equal(instance.state.notice.error, false);
});
