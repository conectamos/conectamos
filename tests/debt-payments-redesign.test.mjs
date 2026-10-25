import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PAGE = "app/dashboard/deuda-sedes/page.tsx";
const API = "app/api/dashboard/deuda-sedes/route.ts";
const require = createRequire(import.meta.url), jsx = require("react/jsx-runtime");
const source = file => readFileSync(join(ROOT, file), "utf8");
const compile = input => ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const admin = { id: 56, nombre: "Administradora QA", usuario: "admin-qa", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeId: 6, sedeNombre: "SEDE 6" };
const auditor = { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" };
const supervisor = { ...admin, rolNombre: "SEDE", perfilTipo: "SUPERVISOR_TIENDA" };
const sedes = [{ id: 6, nombre: "SEDE 6" }, { id: 8, nombre: "SEDE 8" }, { id: 12, nombre: "Stand de prueba" }, { id: 13, nombre: "Stand de prueba" }, { id: 99, nombre: "BODEGA PRINCIPAL" }];
const money = value => `$ ${Number(value).toLocaleString("es-CO")}`;
const sum = items => items.reduce((total, item) => total + Number(item.valor || 0), 0);
function debt(index, overrides = {}) {
  const sedeOrigenId = index % 2 ? 99 : 6, sedeDestinoId = index % 3 ? 8 : 12;
  return { id: 7000 + index, prestamoId: 11000 + index, imei: String(index + 1).padStart(15, "0"), referencia: index === 23 ? "REFERENCIA EN PAGINA TRES" : `EQUIPO QA ${index + 1}`, valor: index === 0 ? 1357500000.75 : 570000 + index * 100.25, sedeOrigenId, sedeDestinoId, sedeOrigenNombre: sedes.find(item => item.id === sedeOrigenId).nombre, sedeDestinoNombre: sedes.find(item => item.id === sedeDestinoId).nombre, fechaSolicitudPago: new Date(Date.UTC(2026, 9, 24, 20, index * 11)).toISOString(), estado: "PAGO_PENDIENTE_APROBACION", puedeAprobar: true, ...overrides };
}
const rows = Array.from({ length: 26 }, (_, index) => debt(index));
function flatten(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(flatten); return [node, ...flatten(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(textOf).join(" "); return typeof node === "object" ? textOf(node.props?.children) : String(node); }
const text = node => textOf(node).replace(/\s+/g, " ").trim();
function resolveTree(node) { if (!node || typeof node !== "object") return node; if (Array.isArray(node)) return node.map(resolveTree); if (typeof node.type === "function") return resolveTree(node.type(node.props)); return { ...node, props: { ...node.props, children: resolveTree(node.props?.children) } }; }
const controls = (tree, type) => flatten(tree).filter(node => node.type === type);
const namedButton = (tree, name) => controls(tree, "button").find(node => text(node).toLocaleLowerCase("es") === name.toLocaleLowerCase("es") || node.props["aria-label"] === name);
const sedeField = tree => controls(tree, "select")[0];
const bodyRows = table => flatten(table).filter(node => node.type === "tr" && flatten(node).some(child => child.type === "td") && !flatten(node).some(child => child.props?.colSpan));
const paymentTable = tree => controls(tree, "table").find(node => controls(node, "th").length === 8);
const errors = tree => flatten(tree).filter(node => node.props?.role === "alert");
function metric(tree, label) { const article = controls(tree, "article").find(node => controls(node, "p").some(p => text(p) === label)); assert.ok(article, `Falta indicador ${label}`); return text(controls(article, "strong")[0]); }
async function flush() { for (let index = 0; index < 50; index++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function depsChanged(previous, next) { return !previous || !next || next.some((value, index) => !Object.is(value, previous[index])); }
function pageProbe({ user = admin, responses = {}, confirmation = true } = {}) {
  const file = source(PAGE), ast = ts.createSourceFile(PAGE, file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
  const identifiers = new Set(declarations.filter(node => ts.isIdentifier(node.name)).map(node => node.name.text));
  const captures = ["aprobarPago", "aprobarPagoLote", "cargar", "lotesPagoPendiente", "idsEnLotesMultiples", "alternarDetalleLote", "totalSolicitudes", "promedioPendiente", "navigationItems", "disponible"].filter(name => identifiers.has(name));
  const finalReturn = component.body.statements.findLast(node => ts.isReturnStatement(node));
  const replacement = file.slice(0, finalReturn.getStart(ast)) + `capture({${captures.join(",")}});\n` + file.slice(finalReturn.getStart(ast));
  const state = {}, calls = [], confirmations = [], effects = [], refs = [], memo = [];
  let stateCursor = 0, effectCursor = 0, refCursor = 0, memoCursor = 0, isPage = false, pending = [], live, captured;
  const hooks = {
    Fragment: Symbol.for("react.fragment"),
    useState(value) { if (!isPage) return [typeof value === "function" ? value() : value, () => {}]; const name = states[stateCursor++]; assert.ok(name, "Estado inesperado"); if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
    useRef(value) { if (!isPage) return { current: value }; const index = refCursor++; return refs[index] ??= { current: value }; },
    useEffect(fn, deps) { if (!isPage) return; const index = effectCursor++; if (depsChanged(effects[index]?.deps, deps)) pending.push({ index, fn, deps }); },
    useMemo(fn, deps) { if (!isPage) return fn(); const index = memoCursor++; if (!memo[index] || depsChanged(memo[index].deps, deps)) memo[index] = { deps, value: fn() }; return memo[index].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  };
  const fakeWindow = { confirm(message) { confirmations.push(message); return typeof confirmation === "function" ? confirmation(message) : confirmation; } };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options }); const path = new URL(url, "http://qa.local");
    const configured = responses[url] ?? responses[path.pathname];
    let result = await (typeof configured === "function" ? configured(url, options) : configured);
    if (result === undefined) {
      let data = user;
      if (path.pathname === "/api/sedes") data = sedes;
      if (path.pathname === "/api/dashboard/deuda-sedes") { const filter = ["ADMIN", "AUDITOR"].includes(user?.rolNombre) ? Number(path.searchParams.get("sedeId")) || null : user?.sedeId; const items = rows.filter(row => !filter || row.sedeOrigenId === filter || row.sedeDestinoId === filter); data = { items, totalPendiente: sum(items) }; }
      if (options.method === "POST") data = { ok: true, mensaje: "Pago de prueba aprobado" };
      result = { ok: true, data };
    }
    if (result instanceof Response) return result;
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500), json: async () => result.data };
  };
  const cache = new Map();
  const load = relative => {
    const loaded = { exports: {} };
    new Function("require", "module", "exports", "window", "fetch", "capture", compile(relative === PAGE ? replacement : source(relative)))(name => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
      if (name === "next/image") return { __esModule: true, default: props => jsx.jsx("img", { src: props.src, alt: props.alt, width: props.width, height: props.height }) };
      if (name === "next/navigation") return { useRouter: () => ({ replace() {}, push() {}, refresh() {} }) };
      if (name.endsWith(".css")) return css;
      if (name === "@/lib/use-live-refresh") return { useLiveRefresh: (refresh, options) => { live = { refresh, options }; } };
      if (name === "@/app/dashboard/_components/logout-button") return { __esModule: true, default: () => jsx.jsx("button", { children: "Cerrar sesión" }) };
      if (name === "@/app/dashboard/_components/operations-dashboard") return { DashboardSidebar: () => jsx.jsx("aside", { "data-old-sidebar": true }) };
      const base = name.startsWith("@/") ? join(ROOT, name.slice(2)) : name.startsWith(".") ? resolve(dirname(join(ROOT, relative)), name) : null;
      assert.ok(base, `Import no cubierto: ${name}`); const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate)); assert.ok(file, `Fuente ausente: ${name}`);
      const path = file.slice(ROOT.length).replaceAll("\\", "/"); if (!cache.has(path)) cache.set(path, load(path)); return cache.get(path);
    }, loaded, loaded.exports, fakeWindow, fetch, value => { captured = value; }); return loaded.exports;
  };
  const Page = load(PAGE).default;
  const render = () => { stateCursor = effectCursor = refCursor = memoCursor = 0; pending = []; isPage = true; const tree = Page(); isPage = false; return resolveTree(tree); };
  render();
  return {
    calls, confirmations, state, render, get view() { return captured; }, get live() { return live; },
    async effects() { const active = pending.splice(0); for (const effect of active) { effects[effect.index]?.cleanup?.(); effects[effect.index] = { deps: effect.deps, cleanup: effect.fn() }; } await flush(); return render(); },
    async ready() { for (let index = 0; index < 7; index++) await this.effects(); return render(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

function pure(path) { const loaded = { exports: {} }; new Function("module", "exports", compile(source(path)))(loaded, loaded.exports); return loaded.exports; }
function apiProbe(user = admin, fail = false) {
  const calls = [];
  const movements = [...rows.map(row => ({ id: row.id, valor: row.valor, tipo: "PENDIENTE_APROBACION", prestamoId: row.prestamoId, createdAt: new Date(row.fechaSolicitudPago), prestamo: { id: row.prestamoId, imei: row.imei, referencia: row.referencia, costo: row.valor + 999, sedeOrigenId: row.sedeOrigenId, sedeDestinoId: row.sedeDestinoId, estado: row.estado, fechaSolicitudPago: new Date(row.fechaSolicitudPago) } })), { id: 8000, tipo: "INGRESO", prestamoId: rows[0].prestamoId, prestamo: null, createdAt: new Date() }, { id: 8001, tipo: "PENDIENTE_APROBACION", prestamoId: null, prestamo: null, createdAt: new Date() }];
  const prisma = {
    movimientoCajaSede: { findMany: async args => { calls.push({ name: "movimientos", args }); if (fail) throw Error("Fallo de prueba"); return movements.filter(row => row.tipo === args.where.tipo && row.prestamoId != null && (!args.where.prestamo || args.where.prestamo.is.OR.some(filter => Object.entries(filter).every(([key, value]) => row.prestamo[key] === value)))); } },
    sede: { findMany: async args => { calls.push({ name: "sedes", args }); return sedes.filter(row => args.where.id.in.includes(row.id)); } },
  };
  const imports = { "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } }, "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": pure("lib/access-control.ts"), "@/lib/prestamos": pure("lib/prestamos.ts") };
  const loaded = { exports: {} }; new Function("require", "module", "exports", "console", compile(source(API)))(name => { assert.ok(name in imports, `Import API no cubierto: ${name}`); return imports[name]; }, loaded, loaded.exports, { error() {} });
  return { calls, get: params => loaded.exports.GET(new Request(`http://qa.local/api/dashboard/deuda-sedes?${params}`)) };
}

test("API conserva el universo de pendientes, valores y permisos administrativos sin paginar en servidor", async () => {
  for (const user of [admin, auditor]) { const p = apiProbe(user), response = await p.get(""); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.items.length, rows.length); assert.equal(data.totalPendiente, sum(rows)); assert.ok(data.items.every(row => row.puedeAprobar)); assert.equal(data.items[0].imei, "000000000000001"); assert.equal(data.items[0].valor, rows[0].valor); assert.equal(p.calls[0].args.take, undefined); assert.equal(p.calls[0].args.where.tipo, "PENDIENTE_APROBACION"); }
});
test("API combina origen y destino por ID y fuerza la sede del supervisor", async () => {
  for (const user of [admin, auditor, supervisor]) for (const filter of [6, 8, 12, 13]) { const p = apiProbe(user), data = await (await p.get(`sedeId=${filter}`)).json(); const effective = user === supervisor ? 6 : filter; const expected = rows.filter(row => [row.sedeOrigenId, row.sedeDestinoId].includes(effective)); assert.deepEqual(data.items.map(row => row.id), expected.map(row => row.id)); assert.equal(data.totalPendiente, sum(expected)); assert.ok(data.items.every(row => row.puedeAprobar === (user !== supervisor || row.sedeOrigenId === 6))); assert.deepEqual(p.calls[0].args.where.prestamo.is.OR, [{ sedeOrigenId: effective }, { sedeDestinoId: effective }]); }
});
test("API rechaza sesiones y perfiles sin permiso antes de consultar datos; errores no son saldos cero", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map(perfilTipo => ({ ...supervisor, perfilTipo }))]) { const p = apiProbe(user), response = await p.get(""); assert.equal(response.status, user ? 403 : 401); assert.equal(p.calls.length, 0); }
  const p = apiProbe(admin, true), response = await p.get(""); assert.equal(response.status, 500); assert.ok((await response.json()).error);
});
test("navegación superior conserva módulos, perfil, cerrar sesión y Deuda entre sedes activo", async () => {
  const p = pageProbe(), tree = await p.ready(); assert.ok(!flatten(tree).some(node => node.props?.["data-old-sidebar"]));
  const nav = flatten(tree).find(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal"); assert.ok(nav);
  const paths = new Set(controls(nav, "a").map(node => node.props.href)); for (const path of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/dashboard/deuda-sedes", "/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/reportes"]) assert.ok(paths.has(path), path);
  assert.equal(controls(nav, "a").find(node => node.props["aria-current"] === "page")?.props.href, "/dashboard/deuda-sedes"); assert.ok(text(tree).includes(admin.nombre)); assert.ok(namedButton(tree, "Cerrar sesión"));
});
test("indicadores y tabla conservan datos completos y totales del alcance completo antes de paginar", async () => {
  const p = pageProbe(), tree = await p.ready(); assert.equal(metric(tree, "Total pendiente"), money(sum(rows))); assert.equal(metric(tree, "Solicitudes activas"), "26"); assert.ok(metric(tree, "Promedio por solicitud").startsWith("$ "));
  const table = paymentTable(tree); assert.ok(table); assert.equal(controls(table, "th").length, 8); assert.equal(bodyRows(table).length, 10); assert.ok(text(table).includes(rows[0].imei)); assert.ok(text(table).includes(money(rows[0].valor)));
  const next = namedButton(tree, "Siguiente") || namedButton(tree, "Página siguiente"); assert.ok(next); next.props.onClick(); const page2 = p.render(); assert.equal(bodyRows(paymentTable(page2)).length, 10); assert.equal(metric(page2, "Total pendiente"), money(sum(rows)));
});
test("filtro de sede consulta todo el alcance por ID, vuelve a primera página y conserva refresco de diez segundos", async () => {
  const p = pageProbe(); let tree = await p.ready(); assert.equal(p.live.options.intervalMs, 10000); assert.equal(p.live.options.enabled, true);
  const next = namedButton(tree, "Siguiente") || namedButton(tree, "Página siguiente"); next.props.onClick(); tree = p.render(); sedeField(tree).props.onChange({ target: { value: "12" } }); p.render(); tree = await p.ready();
  const expected = rows.filter(row => [row.sedeOrigenId, row.sedeDestinoId].includes(12)); assert.equal(metric(tree, "Solicitudes activas"), String(expected.length)); assert.equal(metric(tree, "Total pendiente"), money(sum(expected))); assert.equal(sedeField(tree).props.value, "12");
  await p.live.refresh(); tree = p.render(); assert.equal(sedeField(tree).props.value, "12"); assert.ok(p.calls.filter(call => call.url.includes("deuda-sedes")).every(call => !call.options.method || call.options.method === "GET"));
});
test("supervisor conserva cobertura de sesión sin catálogo ni selector administrativo", async () => {
  const p = pageProbe({ user: supervisor }), tree = await p.ready(); assert.equal(sedeField(tree), undefined); assert.ok(text(tree).includes(supervisor.sedeNombre)); assert.equal(p.calls.filter(call => call.url === "/api/sedes").length, 0); assert.ok(!p.calls.some(call => /sedeId=/.test(call.url)));
});
test("agrupación conserva IDs de sedes, ventana encadenada de cinco minutos y exclusión de no autorizados", async () => {
  const make = (index, minutes, origin = 6, destination = 8, extra = {}) => debt(index, { sedeOrigenId: origin, sedeDestinoId: destination, sedeOrigenNombre: "MISMO NOMBRE", sedeDestinoNombre: "MISMO NOMBRE", fechaSolicitudPago: new Date(Date.UTC(2026, 9, 24, 20, minutes)).toISOString(), valor: 100 + index, ...extra });
  const items = [make(0, 0), make(1, 4), make(2, 8), make(3, 14), make(4, 15, 12), make(5, 16, 13), make(6, 18, 6, 8, { puedeAprobar: false }), make(7, 0, 6, 8, { fechaSolicitudPago: "" }), make(8, 0, 6, 8, { fechaSolicitudPago: "invalid" })];
  const p = pageProbe({ responses: { "/api/dashboard/deuda-sedes": { ok: true, data: { items, totalPendiente: sum(items) } } } }); await p.ready(); const groups = p.view.lotesPagoPendiente;
  assert.ok(groups.some(group => group.items.map(item => item.id).join() === items.slice(0, 3).map(item => item.id).join())); assert.ok(groups.some(group => group.items.length === 1 && group.items[0].id === items[3].id)); assert.ok(groups.some(group => group.items[0].sedeOrigenId === 12)); assert.ok(groups.some(group => group.items[0].sedeOrigenId === 13)); assert.ok(!groups.some(group => group.items.some(item => item.id === items[6].id))); assert.ok(groups.some(group => group.items.map(item => item.id).join() === [items[7].id, items[8].id].join())); assert.deepEqual([...groups].sort((a, b) => b.total - a.total).map(group => group.total), groups.map(group => group.total));
});
test("cancelar la confirmación no aprueba un pago ni un lote", async () => {
  const p = pageProbe({ confirmation: false }); await p.ready(); await p.view.aprobarPago(rows[0]); await p.view.aprobarPagoLote(p.view.lotesPagoPendiente[0]); assert.equal(p.calls.filter(call => call.options.method === "POST").length, 0); assert.equal(p.confirmations.length, 2); assert.ok(p.confirmations[0].includes(rows[0].imei)); assert.ok(p.confirmations[0].includes(money(rows[0].valor)));
});
test("aprobar un pago usa el endpoint y cuerpo existentes, bloquea el doble clic y refresca después del servidor", async () => {
  const pending = deferred(); const p = pageProbe({ responses: { "/api/prestamos/aprobar-pago": () => pending.promise } }); await p.ready(); const approve = p.view.aprobarPago, before = p.calls.filter(call => call.url.includes("dashboard/deuda-sedes")).length;
  const first = approve(rows[0]); const second = approve(rows[0]); assert.equal(p.calls.filter(call => call.options.method === "POST").length, 1); assert.equal(p.calls.filter(call => call.url.includes("dashboard/deuda-sedes")).length, before); pending.resolve({ ok: true, data: { ok: true } }); await Promise.all([first, second]); p.render();
  const post = p.calls.find(call => call.options.method === "POST"); assert.equal(post.url, "/api/prestamos/aprobar-pago"); assert.deepEqual(JSON.parse(post.options.body), { prestamoId: rows[0].prestamoId }); assert.ok(p.calls.filter(call => call.url.includes("dashboard/deuda-sedes")).length > before);
});
test("aprobar lote conserva todos sus préstamos y no mezcla solicitudes de otro lote", async () => {
  const p = pageProbe(); await p.ready(); const lote = p.view.lotesPagoPendiente[0]; await p.view.aprobarPagoLote(lote); const post = p.calls.find(call => call.options.method === "POST"); assert.equal(post.url, "/api/prestamos/aprobar-pago-lote"); assert.deepEqual(JSON.parse(post.options.body), { prestamoIds: lote.items.map(item => item.prestamoId) }); assert.ok(p.confirmations[0].includes(money(lote.total)));
});
test("acciones rechazan solicitudes sin permiso y lotes que ya no son elegibles", async () => {
  const denied = { ...rows[0], puedeAprobar: false }, items = [denied, ...rows.slice(1)]; const p = pageProbe({ responses: { "/api/dashboard/deuda-sedes": { ok: true, data: { items, totalPendiente: sum(items) } } } }); await p.ready(); await p.view.aprobarPago(denied); await p.view.aprobarPagoLote({ ...p.view.lotesPagoPendiente[0], key: String(denied.prestamoId), items: [denied] }); assert.equal(p.calls.filter(call => call.options.method === "POST").length, 0);
});
test("un fallo de aprobación conserva la solicitud y solo muestra error, sin refrescar ni fingir éxito", async () => {
  const p = pageProbe({ responses: { "/api/prestamos/aprobar-pago": { ok: false, status: 409, data: { error: "El préstamo ya cambió de estado" } } } }); let tree = await p.ready(); const before = p.calls.length; await p.view.aprobarPago(rows[0]); tree = p.render(); assert.ok(errors(tree).some(node => text(node).includes("ya cambió de estado"))); assert.equal(p.state.items.length, rows.length); assert.equal(p.calls.slice(before).filter(call => call.url.includes("dashboard/deuda-sedes")).length, 0); assert.ok(!text(tree).includes("Pago aprobado correctamente"));
});
test("errores de carga y respuestas malformadas no aparecen como cero pendientes y permiten reintentar", async () => {
  for (const response of [{ ok: false, data: { error: "Lectura rechazada QA" } }, { ok: true, data: { items: null, totalPendiente: 0 } }]) { const responses = { "/api/dashboard/deuda-sedes": response }; const p = pageProbe({ responses }); let tree = await p.ready(); assert.ok(errors(tree).length); assert.equal(metric(tree, "Total pendiente"), "—"); assert.ok(namedButton(tree, "Reintentar")); responses["/api/dashboard/deuda-sedes"] = undefined; namedButton(tree, "Reintentar").props.onClick(); await flush(); tree = await p.ready(); assert.equal(metric(tree, "Solicitudes activas"), "26"); }
});
test("el estado vacío usa ceros reales y conserva las opciones de actualización", async () => {
  const p = pageProbe({ responses: { "/api/dashboard/deuda-sedes": { ok: true, data: { items: [], totalPendiente: 0 } } } }), tree = await p.ready(); assert.equal(metric(tree, "Total pendiente"), "$ 0"); assert.equal(metric(tree, "Solicitudes activas"), "0"); assert.ok(/No hay pagos pendientes|No tienes pagos pendientes/.test(text(tree))); assert.ok(namedButton(tree, "Actualizar")); assert.equal(bodyRows(paymentTable(tree)).length, 0);
});
test("sesión fallida evita consulta de deuda, mantiene indicadores sin datos y permite recuperar", async () => {
  const responses = { "/api/session": { ok: false, status: 401, data: { error: "Sesión de prueba no disponible" } } }; const p = pageProbe({ responses }); let tree = await p.ready(); assert.equal(p.live.options.enabled, false); assert.ok(errors(tree).length); assert.equal(metric(tree, "Total pendiente"), "—"); assert.equal(p.calls.filter(call => call.url.includes("deuda-sedes")).length, 0); responses["/api/session"] = undefined; namedButton(tree, "Reintentar").props.onClick(); await flush(); tree = await p.ready(); assert.equal(metric(tree, "Solicitudes activas"), "26");
});
test("cambiar de sede cancela la consulta anterior e ignora una respuesta tardía de otra cobertura", async () => {
  const late = deferred(), responses = {}; const p = pageProbe({ responses }); await p.ready(); responses["/api/dashboard/deuda-sedes?sedeId=12"] = () => late.promise; sedeField(p.render()).props.onChange({ target: { value: "12" } }); p.render(); await p.effects(); const call12 = p.calls.find(call => call.url.endsWith("sedeId=12")); assert.ok(call12); assert.equal(metric(p.render(), "Total pendiente"), "—");
  sedeField(p.render()).props.onChange({ target: { value: "13" } }); p.render(); let tree = await p.ready(); assert.equal(call12.options.signal.aborted, true); const current = metric(tree, "Total pendiente"); late.resolve({ ok: true, data: { items: [rows[0]], totalPendiente: 999999999999 } }); await flush(); tree = p.render(); assert.equal(sedeField(tree).props.value, "13"); assert.equal(metric(tree, "Total pendiente"), current);
});

test("detalle de lote permite consultar todos los IMEI completos y conserva su expansión al actualizar", async () => {
  const items = Array.from({ length: 13 }, (_, index) => debt(index, { sedeOrigenId: 6, sedeDestinoId: 8, sedeOrigenNombre: "SEDE 6", sedeDestinoNombre: "SEDE 8", fechaSolicitudPago: new Date(Date.UTC(2026, 9, 24, 20, index)).toISOString() }));
  const p = pageProbe({ responses: { "/api/dashboard/deuda-sedes": { ok: true, data: { items, totalPendiente: sum(items) } } } }); await p.ready(); const lote = p.view.lotesPagoPendiente[0]; assert.equal(lote.items.length, 13); const viewButton = controls(p.render(), "button").find(node => text(node).startsWith("Lotes para aprobar")); if (viewButton) { viewButton.props.onClick(); p.render(); } p.view.alternarDetalleLote(lote.key); let tree = p.render(); const detail = controls(tree, "table").find(table => controls(table, "th").length === 4); assert.ok(detail); assert.equal(bodyRows(detail).length, 13); for (const item of items) assert.ok(text(detail).includes(item.imei));
  await p.live.refresh(); tree = p.render(); assert.ok(controls(tree, "table").some(table => controls(table, "th").length === 4));
});

test("Aprobar desde lote abre la página y el detalle del lote correcto sin registrar pagos", async () => {
  const items = Array.from({ length: 40 }, (_, index) => { const group = Math.floor(index / 2); return debt(index, { sedeOrigenId: 6, sedeOrigenNombre: "SEDE 6", sedeDestinoId: 100 + group, sedeDestinoNombre: `DESTINO QA ${group}`, fechaSolicitudPago: new Date(Date.UTC(2026, 9, 24, 20, index % 2)).toISOString(), valor: 100000 - group }); });
  const p = pageProbe({ responses: { "/api/dashboard/deuda-sedes": { ok: true, data: { items, totalPendiente: sum(items) } } } }); let tree = await p.ready();
  for (let index = 0; index < 3; index++) { (namedButton(tree, "Siguiente") || namedButton(tree, "Página siguiente")).props.onClick(); tree = p.render(); }
  const target = items[30], row = bodyRows(paymentTable(tree)).find(item => text(item).includes(String(target.prestamoId))); assert.ok(row); const action = controls(row, "button").find(item => text(item).includes("Aprobar desde lote")); assert.ok(action); action.props.onClick(); tree = p.render();
  const selected = controls(tree, "button").find(node => text(node).startsWith("Lotes para aprobar")); assert.equal(selected?.props["aria-pressed"], true); const details = controls(tree, "table").find(table => controls(table, "th").length === 4); assert.ok(details); assert.ok(text(details).includes(items[30].imei)); assert.ok(text(details).includes(items[31].imei)); assert.equal(p.calls.filter(call => call.options.method === "POST").length, 0); assert.equal(metric(tree, "Solicitudes activas"), "40");
});

test("un lote pendiente bloquea también aprobaciones individuales y un error permite reintentar", async () => {
  const waiting = deferred(), responses = { "/api/prestamos/aprobar-pago-lote": () => waiting.promise }; const p = pageProbe({ responses }); await p.ready(); const batch = p.view.aprobarPagoLote, individual = p.view.aprobarPago, group = p.view.lotesPagoPendiente[0];
  const first = batch(group), second = batch(group), third = individual(rows[0]); assert.equal(p.calls.filter(call => call.options.method === "POST").length, 1); assert.equal(p.confirmations.length, 1); waiting.resolve({ ok: false, status: 409, data: { error: "El lote de prueba cambió de estado" } }); await Promise.all([first, second, third]); let tree = p.render(); assert.ok(errors(tree).some(node => text(node).includes("cambió de estado"))); assert.equal(p.state.items.length, rows.length);
  responses["/api/prestamos/aprobar-pago-lote"] = undefined; await p.view.aprobarPagoLote(group); tree = p.render(); assert.equal(p.calls.filter(call => call.options.method === "POST").length, 2); assert.ok(/aprobado/.test(text(tree)));
});
test("fallar el catálogo de sedes no convierte los indicadores en cero y su reintento conserva la consulta", async () => {
  const responses = { "/api/sedes": { ok: false, data: { error: "Catálogo de prueba no disponible" } } }; const p = pageProbe({ responses }); let tree = await p.ready(); assert.equal(metric(tree, "Solicitudes activas"), "26"); assert.ok(errors(tree).some(node => text(node).includes("Catálogo"))); const retry = namedButton(tree, "Reintentar sedes"); assert.ok(retry); responses["/api/sedes"] = undefined; retry.props.onClick(); await flush(); tree = p.render(); assert.equal(sedeField(tree).props.value, "TODAS"); assert.equal(controls(sedeField(tree), "option").length, sedes.length + 1); assert.equal(metric(tree, "Total pendiente"), money(sum(rows)));
});
