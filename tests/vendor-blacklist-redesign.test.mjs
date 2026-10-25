import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
const doc = index => String(700000000 + index).padStart(15, "0");
const records = Array.from({ length: 31 }, (_, index) => ({ id: index + 1, documentoNumero: doc(index), motivo: index === 30 ? "ÚLTIMA PÁGINA — observación extensa de prueba" : "Motivo de prueba", reportadoPorNombre: index === 30 ? "Ángela QA" : "Asesor QA", sedeNombre: index % 2 ? "SEDE QA 2" : "SEDE QA 1", tipoObservacion: "PRESTA_NOMBRE", financieraDeuda: null, createdAt: "2026-10-24T20:00:00Z", updatedAt: "2026-10-25T02:30:00Z" }));
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function pageData(url, source = records) {
  const params = new URL(url, "http://qa.local").searchParams;
  const query = normalize(params.get("search") || "");
  const filtered = source.filter(item => normalize(`${item.documentoNumero} PRESTA NOMBRE ${item.motivo} ${item.sedeNombre} ${item.reportadoPorNombre}`).includes(query));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10)); const page = Math.min(Number(params.get("page") || 1), totalPages);
  return { ok: true, registros: filtered.slice((page - 1) * 10, page * 10), pagination: { page, pageSize: 10, total: filtered.length, totalPages }, summary: { totalRegistros: source.length, sedesAfectadas: 2 } };
}
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(text).join(" ") : typeof node === "object" ? text(node.props?.children) : String(node);
const normalizedText = node => text(node).replace(/\s+/g, " ").trim();
function resolve(node) { if (!node || typeof node !== "object") return node; if (Array.isArray(node)) return node.map(resolve); if (typeof node.type === "function") return resolve(node.type(node.props)); return { ...node, props: { ...node.props, children: resolve(node.props?.children) } }; }
const control = (tree, predicate) => { const found = nodes(tree).find(predicate); assert.ok(found, "Control ausente"); return found; };
const button = (tree, name) => control(tree, node => node.type === "button" && (node.props["aria-label"] === name || normalizedText(node) === name));
const search = tree => control(tree, node => node.type === "input" && node.props.type === "search");
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function load(path, imports, extra = {}, transform = value => value) { const loadedModule = { exports: {} }; new Function("require", "module", "exports", ...Object.keys(extra), compile(transform(read(path))))(name => { assert.ok(name in imports, `Import sin mock: ${name}`); return imports[name]; }, loadedModule, loadedModule.exports, ...Object.values(extra)); return loadedModule.exports; }
function probe({ admin = true, responses, confirm = true } = {}) {
  const path = "app/vendedor/lista-negra/workspace.tsx", source = read(path), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ListaNegraWorkspace");
  const stateNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []).filter(node => ts.isArrayBindingPattern(node.name) && node.initializer?.expression?.getText(ast) === "useState").map(node => node.name.elements[0].name.text);
  const returnNode = [...component.body.statements].reverse().find(ts.isReturnStatement);
  const states = {}, refs = [], memo = [], effects = [], pending = []; let cursor = 0, refCursor = 0, memoCursor = 0, effectCursor = 0, captured;
  const changed = (before, after) => !before || !after || after.some((value, index) => !Object.is(value, before[index]));
  const react = {
    useState(value) { const name = stateNames[cursor++]; if (!(name in states)) states[name] = typeof value === "function" ? value() : value; return [states[name], next => { states[name] = typeof next === "function" ? next(states[name]) : next; }]; },
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
    useCallback(callback, deps) { const index = memoCursor++; if (!memo[index] || changed(memo[index].deps, deps)) memo[index] = { deps, callback }; return memo[index].callback; },
    useEffect(callback, deps) { const index = effectCursor++; if (changed(effects[index]?.deps, deps)) { pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; }); } },
  };
  const calls = [], confirmations = [];
  const fetch = async (url, options = {}) => { calls.push({ url, options }); const configured = responses ? await responses(url, options) : undefined; if (configured instanceof Error) throw configured; return configured ?? { ok: true, json: async () => options.method ? { ok: true, mensaje: "Operación QA correcta" } : pageData(url) }; };
  const mod = load(path, { react, "react/jsx-runtime": jsx, "next/link": { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) }, "next/image": { __esModule: true, default: props => jsx.jsx("img", props) }, "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null }, "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: props => jsx.jsx("div", { "data-profile": true, children: [props.name, props.role, jsx.jsx("button", { children: "Cerrar sesión" })] }) }, "./blacklist.module.css": css }, { fetch, window: { confirm(value) { confirmations.push(value); return confirm; } }, capture: value => { captured = value; } }, value => value.slice(0, returnNode.getStart(ast)) + "capture({guardar,iniciarEdicion,guardarEdicion,eliminarRegistro,cargarLista,disponible});\n" + value.slice(returnNode.getStart(ast)));
  const p = { states, calls, confirmations, get view() { return captured; }, render() { cursor = refCursor = memoCursor = effectCursor = 0; return resolve(mod.default({ puedeAdministrar: admin, session: { perfilNombre: "Perfil QA", sedeNombre: "SEDE QA 1" } })); }, async settle() { for (let count = 0; count < 8; count++) { this.render(); while (pending.length) pending.shift()(); for (let i = 0; i < 14; i++) await Promise.resolve(); } return this.render(); }, unmount() { effects.forEach(effect => effect?.cleanup?.()); } }; p.render(); return p;
}

test("navegación blanca conserva accesos, cierre, perfil y Lista negra activa", async () => {
  const p = probe(); const tree = await p.settle();
  const links = nodes(tree).filter(node => node.type === "a").map(node => node.props.href);
  for (const path of ["/dashboard", "/vendedor/registros", "/vendedor/registros/buscar", "/vendedor/lista-negra", "/vendedor/lista-precios", "/dashboard/radar", "/cierre"]) assert.ok(links.includes(path));
  assert.equal(control(tree, node => node.type === "a" && node.props["aria-current"] === "page").props.href, "/vendedor/lista-negra");
  assert.ok(normalizedText(tree).includes("Perfil QA")); assert.ok(normalizedText(tree).includes("Cerrar sesión"));
});
test("paginación consulta servidor, limita10 y KPI conserva el alcance completo", async () => {
  const p = probe(); let tree = await p.settle(); assert.equal(p.states.registros.length, 10); assert.equal(p.states.summary.totalRegistros, 31);
  button(tree, "Página 4").props.onClick(); tree = await p.settle(); assert.equal(p.states.registros.length, 1); assert.equal(p.states.registros[0].id, 31);
  assert.equal(p.states.pagination.total, 31); assert.equal(p.states.summary.totalRegistros, 31); assert.ok(normalizedText(tree).includes("Mostrando 31–31 de 31"));
  assert.ok(p.calls.every(call => call.options.method || new URL(call.url, "http://qa.local").searchParams.get("paginated") === "1"));
});
test("buscar consulta colección completa, encuentra última página y regresa a primera", async () => {
  const p = probe(); let tree = await p.settle(); button(tree, "Página 4").props.onClick(); tree = await p.settle();
  search(tree).props.onChange({ target: { value: "angela" } }); tree = await p.settle(); assert.equal(p.states.pagina, 1); assert.equal(p.states.registros[0].id, 31); assert.equal(p.states.pagination.total, 1); assert.equal(p.states.summary.totalRegistros, 31);
  assert.ok(normalizedText(tree).includes(doc(30))); assert.ok(normalizedText(tree).includes("ÚLTIMA PÁGINA"));
});
test("carga,error,malformado y vacío son estados distintos sin indicadores cero falsos", async () => {
  for (const result of [{ ok: false, json: async () => ({ error: "Error QA" }) }, { ok: true, json: async () => ({ registros: [] }) }, new TypeError("Failed to fetch")]) {
    const p = probe({ responses: async () => result }); let tree = p.render(); assert.ok(normalizedText(tree).includes("Cargando lista negra")); tree = await p.settle(); assert.equal(p.view.disponible, false); assert.ok(nodes(tree).some(node => node.props?.role === "alert")); assert.ok(normalizedText(tree).includes("—")); assert.ok(!normalizedText(tree).includes("0 resultados"));
  }
  const p = probe({ responses: async url => ({ ok: true, json: async () => pageData(url, []) }) }); const tree = await p.settle(); assert.ok(normalizedText(tree).includes("0 resultados")); assert.ok(normalizedText(tree).includes("No hay cédulas para esta búsqueda"));
});
test("error y reintento conservan filtro; respuestas antiguas no reemplazan búsqueda nueva", async () => {
  let fail = false; const old = deferred();
  const p = probe({ responses: async url => { if (url.includes("search=antigua")) return old.promise; return fail ? { ok: false, json: async () => ({ error: "Error QA" }) } : undefined; } }); let tree = await p.settle();
  search(tree).props.onChange({ target: { value: "antigua" } }); await p.settle(); search(p.render()).props.onChange({ target: { value: "angela" } }); tree = await p.settle();
  old.resolve({ ok: true, json: async () => pageData("/api/vendedor/lista-negra?page=1") }); tree = await p.settle(); assert.equal(p.states.busqueda, "angela"); assert.equal(p.states.registros.length, 1);
  fail = true; await p.view.cargarLista(); tree = await p.settle(); assert.equal(p.view.disponible, false); fail = false; button(tree, "Reintentar").props.onClick(); await p.settle(); assert.equal(p.states.busqueda, "angela"); assert.equal(p.states.registros[0].id, 31);
});
test("no administrador puede crear pero no editar ni eliminar por UI o handler", async () => {
  const p = probe({ admin: false }); const tree = await p.settle();
  assert.ok(!nodes(tree).some(node => node.type === "th" && normalizedText(node) === "Acciones"));
  p.view.iniciarEdicion(records[0]); await p.view.guardarEdicion(1); await p.view.eliminarRegistro(1); assert.equal(p.calls.filter(call => call.options.method).length, 0); assert.equal(p.confirmations.length, 0);
});
test("guardar conserva texto y evita doble envío; falla sin borrar campos y solo limpia con servidorok", async () => {
  const save = deferred(); let attempt = 0;
  const p = probe({ responses: async (_url, options) => options.method === "POST" ? (++attempt === 1 ? save.promise : undefined) : undefined }); await p.settle(); p.states.documentoNumero = "00123456789"; p.states.motivo = "Detalle QA"; p.render();
  const handler = p.view.guardar; const first = handler(); await handler(); assert.equal(attempt, 1);
  save.resolve({ ok: false, json: async () => ({ error: "Error QA de escritura" }) }); await first; await p.settle(); assert.equal(p.states.documentoNumero, "00123456789"); assert.equal(p.states.motivo, "Detalle QA"); assert.equal(p.states.mensajeTipo, "error");
  await p.view.guardar(); await p.settle(); assert.equal(p.states.documentoNumero, ""); assert.equal(p.states.motivo, "");
  const payload = JSON.parse(p.calls.find(call => call.options.method === "POST").options.body); assert.deepEqual(payload, { documentoNumero: "00123456789", motivo: "Detalle QA" });
});
test("editar envía contrato existente y preserva formulario cuando falla", async () => {
  let failed = true; const p = probe({ responses: async (_url, options) => options.method === "PATCH" && failed ? { ok: false, json: async () => ({ error: "Error QA" }) } : undefined }); await p.settle();
  p.view.iniciarEdicion(records[0]); p.render(); p.states.editMotivo = "Cambio QA"; p.render(); await p.view.guardarEdicion(1); await p.settle(); assert.equal(p.states.editandoId, 1); assert.equal(p.states.editMotivo, "Cambio QA");
  failed = false; await p.view.guardarEdicion(1); await p.settle(); assert.equal(p.states.editandoId, null); assert.deepEqual(JSON.parse(p.calls.find(call => call.options.method === "PATCH").options.body), { id: 1, documentoNumero: records[0].documentoNumero, motivo: "Cambio QA" });
});
test("eliminar exige confirmación y conserva soft-delete actual, sin ejecutar al cancelar", async () => {
  const cancelled = probe({ confirm: false }); await cancelled.settle(); await cancelled.view.eliminarRegistro(1); assert.equal(cancelled.calls.filter(call => call.options.method).length, 0);
  const p = probe(); await p.settle(); await p.view.eliminarRegistro(1); assert.equal(p.confirmations.length, 1); assert.ok(p.confirmations[0].includes("historial interno se conserva")); assert.ok(p.calls.some(call => call.url === "/api/vendedor/lista-negra?id=1" && call.options.method === "DELETE"));
});
test("validación local respeta cédula5a15 y fecha visible usa Bogotá", async () => {
  const p = probe(); const tree = await p.settle(); p.states.documentoNumero = "1234"; p.render(); await p.view.guardar(); assert.equal(p.calls.filter(call => call.options.method).length, 0);
  const bogota = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-10-25T02:30:00Z"));
  const utc = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-10-25T02:30:00Z"));
  assert.ok(normalizedText(tree).includes(bogota)); assert.ok(!normalizedText(tree).includes(utc));
});

const access = load("lib/access-control.ts", {});
function apiProbe(user) { const calls = []; return { calls, route: load("app/api/vendedor/lista-negra/route.ts", { "next/server": { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), { status: init?.status || 200, headers: { "Content-Type": "application/json" } }) } }, "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": access, "@/lib/vendor-blacklist": { listarDocumentosListaNegra: async limit => { calls.push({ kind: "legacy", limit }); return records.slice(0, 2); }, listarDocumentosListaNegraPaginado: async options => { calls.push({ kind: "paginated", options }); return pageData(`/api/vendedor/lista-negra?page=${options.page}&search=${options.search}`); }, actualizarDocumentoListaNegra() {}, desactivarDocumentoListaNegra() {}, guardarDocumentoListaNegra() {} } }) }; }
test("GET mantiene compatibilidad antigua y modo paginado explícito", async () => {
  const p = apiProbe({ rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" }); const old = await p.route.GET(new Request("http://qa.local/api/vendedor/lista-negra")); assert.equal(old.status, 200); assert.equal((await old.json()).registros.length, 2); assert.deepEqual(p.calls[0], { kind: "legacy", limit: 80 });
  const current = await p.route.GET(new Request("http://qa.local/api/vendedor/lista-negra?paginated=1&page=2&pageSize=10&search=angela")); assert.equal(current.status, 200); assert.equal((await current.json()).pagination.total, 1); assert.deepEqual(p.calls[1], { kind: "paginated", options: { search: "angela", page: 2, pageSize: 10 } });
});
test("GET conserva permisos y no consulta datos para sesión o perfil inválidos", async () => {
  for (const [user, status] of [[null, 401], [{ rolNombre: "BODEGA", perfilTipo: "BODEGA", perfilId: 7 }, 403], [{ rolNombre: "SEDE", perfilTipo: "VENDEDOR" }, 403]]) {
    const p = apiProbe(user); assert.equal((await p.route.GET(new Request("http://qa.local/api/vendedor/lista-negra?paginated=1"))).status, status); assert.equal(p.calls.length, 0);
  }
  const p = apiProbe({ rolNombre: "SEDE", perfilTipo: "VENDEDOR", perfilId: 7 }); assert.equal((await p.route.GET(new Request("http://qa.local/api/vendedor/lista-negra?paginated=1"))).status, 200);
});
test("consultas paginadas cuentan todo activo antes de LIMIT, escapan búsqueda y max10", async () => {
  const calls = []; const lib = load("lib/vendor-blacklist.ts", { "@/lib/prisma": { __esModule: true, default: { $executeRawUnsafe: async () => 0, $queryRawUnsafe: async (sql, ...params) => { calls.push({ sql, params }); return sql.includes('COUNT(*) AS "totalRegistros"') ? [{ totalRegistros: 550n, sedesAfectadas: 15n, resultados: 91n }] : []; } } } });
  const data = await lib.listarDocumentosListaNegraPaginado({ search: "Ángela%_\\'", page: 99, pageSize: 400 });
  assert.deepEqual(data.pagination, { page: 10, pageSize: 10, total: 91, totalPages: 10 }); assert.deepEqual(data.summary, { totalRegistros: 550, sedesAfectadas: 15 });
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.sql.includes('"activo" = true'))); assert.ok(calls[0].sql.includes("COUNT(*) FILTER")); assert.ok(calls[0].sql.includes("normalize(lower")); assert.ok(!calls[0].sql.includes("LIMIT"));
  assert.equal(calls[0].params[0], "%angela\\%\\_\\\\'%"); assert.deepEqual(calls[1].params, [calls[0].params[0], 10, 90]); assert.ok(calls[1].sql.indexOf("LIKE $1") < calls[1].sql.indexOf("LIMIT $2 OFFSET $3")); assert.ok(!calls[1].sql.includes("Ángela"));
});
test("paginación vacía clamp1, conserva ceros iniciales y no cambia la normalización de bloqueo", async () => {
  const lib = load("lib/vendor-blacklist.ts", { "@/lib/prisma": { __esModule: true, default: { $executeRawUnsafe: async () => 0, $queryRawUnsafe: async sql => sql.includes('COUNT(*) AS "totalRegistros"') ? [{ totalRegistros: 0n, sedesAfectadas: 0n, resultados: 0n }] : [] } } });
  const data = await lib.listarDocumentosListaNegraPaginado({ page: 0, pageSize: 0 }); assert.deepEqual(data.pagination, { page: 1, pageSize: 10, total: 0, totalPages: 1 });
  assert.equal(lib.normalizarDocumentoListaNegra("00.123 456"), "00123456"); assert.equal(lib.normalizarDocumentoListaNegra("1234"), null);
});
