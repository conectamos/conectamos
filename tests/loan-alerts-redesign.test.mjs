import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PAGE = "app/alertas/prestamos/page.tsx";
const API = "app/api/alertas/prestamos/route.ts";
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = path => readFileSync(join(ROOT, path), "utf8");
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const administrator = { id: 71, nombre: "Administradora QA", usuario: "admin-qa", sedeId: 1, sedeNombre: "SEDE QA", rolId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const auditor = { ...administrator, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" };
const supervisor = { ...administrator, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" };
const sedes = [{ id: 1, nombre: "SEDE QA" }, { id: 2, nombre: "ONLINE DE PRUEBA" }, { id: 3, nombre: "SEDE DESTINO DE NOMBRE EXTENSO" }, { id: 99, nombre: "BODEGA PRINCIPAL" }];
const loanRows = Array.from({ length: 27 }, (_, index) => {
  const [sedeOrigenId, sedeDestinoId] = [[99, 1], [1, 2], [2, 3], [3, 1]][index % 4];
  return {
    id: 10200 - index, imei: String(index + 1).padStart(15, "0"),
    referencia: index === 22 ? "REFERENCIA FUERA DE LA PRIMERA PAGINA" : `EQUIPO DE PRUEBA ${index + 1}`,
    color: index % 2 ? "AZUL" : "PLATA", costo: index === 0 ? 1718499321 : 570000 + index * 100.25,
    sedeOrigenId, sedeDestinoId,
    sedeOrigenNombre: sedes.find(sede => sede.id === sedeOrigenId).nombre,
    sedeDestinoNombre: sedes.find(sede => sede.id === sedeDestinoId).nombre,
    estado: index % 3 ? "APROBADO" : "PAGO_PENDIENTE_APROBACION",
  };
});
const sumCosts = rows => rows.reduce((sum, row) => sum + row.costo, 0);
const money = value => `$ ${Number(value).toLocaleString("es-CO")}`;
function flatten(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...flatten(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
const text = node => textOf(node).replace(/\s+/g, " ").trim();
function resolveTree(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolveTree);
  if (typeof node.type === "function") return resolveTree(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolveTree(node.props?.children) } };
}
const buttons = tree => flatten(tree).filter(node => node.type === "button");
const namedButton = (tree, name) => buttons(tree).find(node => text(node).toLocaleLowerCase("es") === name.toLocaleLowerCase("es") || node.props["aria-label"] === name);
const dataRows = tree => flatten(tree).filter(node => node.type === "tr" && flatten(node).some(child => child.type === "td") && !flatten(node).some(child => child.props?.colSpan));
function metric(tree, label) {
  const card = flatten(tree).find(node => node.type === "article" && flatten(node).some(child => child.type === "p" && text(child) === label));
  assert.ok(card, `Falta el indicador ${label}`);
  return text(flatten(card).find(node => node.type === "strong"));
}
async function flush() { for (let index = 0; index < 40; index++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function dependenciesChanged(previous, next) { return !previous || !next || next.some((value, index) => !Object.is(value, previous[index])); }

function pageProbe({ user = administrator, responses = {} } = {}) {
  const file = source(PAGE), ast = ts.createSourceFile(PAGE, file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
  const state = {}, calls = [], effects = [], refs = [], memo = [], scheduled = new Map();
  let stateCursor = 0, effectCursor = 0, refCursor = 0, memoCursor = 0, isPage = false, pending = [], timerId = 0, live;
  const hooks = {
    Fragment: Symbol.for("react.fragment"),
    useState(value) {
      if (!isPage) return [typeof value === "function" ? value() : value, () => {}];
      const name = states[stateCursor++]; assert.ok(name, "Estado de página inesperado");
      if (!(name in state)) state[name] = typeof value === "function" ? value() : value;
      return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }];
    },
    useRef(value) { if (!isPage) return { current: value }; const index = refCursor++; return refs[index] ??= { current: value }; },
    useEffect(fn, deps) {
      if (!isPage) return;
      const index = effectCursor++;
      if (dependenciesChanged(effects[index]?.deps, deps)) pending.push({ index, fn, deps });
    },
    useMemo(fn, deps) {
      if (!isPage) return fn();
      const index = memoCursor++;
      if (!memo[index] || dependenciesChanged(memo[index].deps, deps)) memo[index] = { deps, value: fn() };
      return memo[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  };
  const fakeWindow = { setTimeout(fn, delay = 0) { const id = ++timerId; scheduled.set(id, { fn, delay }); return id; }, clearTimeout(id) { scheduled.delete(id); } };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const path = new URL(url, "http://qa.local");
    const configured = responses[url] ?? responses[path.pathname];
    let result = await (typeof configured === "function" ? configured(url, options) : configured);
    if (result === undefined) {
      let data = path.pathname === "/api/session" ? user : path.pathname === "/api/sedes" ? sedes : loanRows;
      if (path.pathname === "/api/alertas/prestamos") {
        const admin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre);
        const filter = admin ? Number(path.searchParams.get("sedeId")) || null : user?.sedeId;
        data = loanRows.filter(row => !filter || row.sedeOrigenId === filter || row.sedeDestinoId === filter);
      }
      result = { ok: true, data };
    }
    if (result instanceof Response) return result;
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500), json: async () => result.data };
  };
  const cache = new Map();
  const load = (relative, replacement) => {
    const loaded = { exports: {} };
    new Function("require", "module", "exports", "window", "fetch", compile(replacement ?? source(relative)))(name => {
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
      assert.ok(base, `Import no cubierto: ${name}`);
      const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate)); assert.ok(file, `Fuente ausente: ${name}`);
      const path = file.slice(ROOT.length).replaceAll("\\", "/");
      if (!cache.has(path)) cache.set(path, load(path));
      return cache.get(path);
    }, loaded, loaded.exports, fakeWindow, fetch);
    return loaded.exports;
  };
  const Page = load(PAGE).default;
  const render = () => {
    stateCursor = 0; effectCursor = 0; refCursor = 0; memoCursor = 0; pending = []; isPage = true;
    const tree = Page(); isPage = false;
    return resolveTree(tree);
  };
  render();
  return {
    calls, render, get live() { return live; },
    async effects() {
      const active = pending.splice(0);
      for (const effect of active) { effects[effect.index]?.cleanup?.(); effects[effect.index] = { deps: effect.deps, cleanup: effect.fn() }; }
      const due = [...scheduled].filter(([, timer]) => timer.delay === 0);
      due.forEach(([id, timer]) => { scheduled.delete(id); timer.fn(); });
      await flush(); return render();
    },
    async ready() { for (let index = 0; index < 6; index++) await this.effects(); return render(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

function match(row, where) {
  return Object.entries(where || {}).every(([key, value]) => key === "OR" ? value.some(part => match(row, part)) : key === "AND" ? value.every(part => match(row, part)) : value && typeof value === "object" && "in" in value ? value.in.includes(row[key]) : row[key] === value);
}
function apiProbe(user = administrator, fail = false) {
  const calls = [];
  const universe = [...loanRows, ...["PENDIENTE", "PAGADO", "FINALIZADO", "DEVUELTO"].map((estado, index) => ({ ...loanRows[0], id: 15000 + index, estado }))];
  const read = (name, callback) => async args => { calls.push({ name, args }); if (fail) throw Error("Fallo sintético de lectura"); return callback(args); };
  const prisma = {
    prestamoSede: { findMany: read("prestamoSede.findMany", args => universe.filter(row => match(row, args.where)).sort((a, b) => b.id - a.id)) },
    sede: { findMany: read("sede.findMany", args => sedes.filter(row => match(row, args.where))) },
  };
  const loadPure = path => {
    const loaded = { exports: {} };
    new Function("module", "exports", compile(source(path)))(loaded, loaded.exports); return loaded.exports;
  };
  const loaded = { exports: {} };
  const imports = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": loadPure("lib/access-control.ts"), "@/lib/prestamos": loadPure("lib/prestamos.ts"),
  };
  new Function("require", "module", "exports", "console", compile(source(API)))(name => { assert.ok(name in imports, `Import de API inesperado: ${name}`); return imports[name]; }, loaded, loaded.exports, { error() {} });
  return { calls, get: params => loaded.exports.GET(new Request(`http://qa.local/api/alertas/prestamos?${params}`)) };
}

test("el servidor conserva únicamente los estados abiertos aprobados o con pago por aprobar en todas las sedes", async () => {
  for (const user of [administrator, auditor]) {
    const p = apiProbe(user), response = await p.get(""); const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.length, loanRows.length);
    assert.deepEqual(data.map(row => row.id), loanRows.map(row => row.id));
    assert.ok(data.every(row => ["APROBADO", "PAGO_PENDIENTE_APROBACION"].includes(row.estado)));
    assert.deepEqual(p.calls[0].args.where.estado.in, ["APROBADO", "PAGO_PENDIENTE_APROBACION"]);
    assert.equal(p.calls[0].args.take, undefined);
    assert.equal(data[0].imei, "000000000000001"); assert.equal(data[0].sedeOrigenNombre, "BODEGA PRINCIPAL");
  }
});

test("la cobertura administrativa incluye sede origen o destino por ID sin recortar ni duplicar registros", async () => {
  for (const user of [administrator, auditor]) for (const id of [1, 2, 99]) {
    const p = apiProbe(user), response = await p.get(`sedeId=${id}`), data = await response.json();
    assert.deepEqual(data.map(row => row.id), loanRows.filter(row => row.sedeOrigenId === id || row.sedeDestinoId === id).map(row => row.id));
    assert.equal(new Set(data.map(row => row.id)).size, data.length);
    assert.deepEqual(p.calls[0].args.where.OR, [{ sedeOrigenId: id }, { sedeDestinoId: id }]);
  }
});

test("el supervisor conserva su sede aunque intente ampliar la cobertura con parámetros administrativos", async () => {
  for (const params of ["", "sedeId=2", "sedeId=TODAS", "sedeId=99"]) {
    const p = apiProbe(supervisor), response = await p.get(params), data = await response.json();
    assert.deepEqual(data.map(row => row.id), loanRows.filter(row => row.sedeOrigenId === 1 || row.sedeDestinoId === 1).map(row => row.id));
    assert.ok(p.calls[0].args.where.OR.every(part => (part.sedeOrigenId ?? part.sedeDestinoId) === 1));
  }
});

test("sesión ausente y perfiles sin permiso son rechazados antes de leer préstamos o sedes", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map(perfilTipo => ({ ...supervisor, perfilTipo }))]) {
    const p = apiProbe(user), response = await p.get("sedeId=99");
    assert.equal(response.status, user ? 403 : 401); assert.deepEqual(p.calls, []);
  }
});

test("el fallo de lectura devuelve error en lugar de un conjunto vacío de alertas estables", async () => {
  const p = apiProbe(administrator, true), response = await p.get("");
  assert.equal(response.status, 500); assert.match((await response.json()).error, /Error cargando alertas/);
  assert.equal(p.calls.length, 1);
});

test("la interfaz conserva Préstamos activo, navegación autorizada, CIERRE y el usuario con cierre de sesión", async () => {
  for (const user of [administrator, auditor, supervisor]) {
    const p = pageProbe({ user }); const tree = await p.ready(); const nodes = flatten(tree), links = nodes.filter(node => node.type === "a");
    assert.ok(!nodes.some(node => node.props?.["data-old-sidebar"]));
    assert.ok(nodes.some(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal"));
    assert.ok(links.some(node => node.props.href === "/prestamos" && node.props["aria-current"] === "page"));
    for (const href of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones"]) assert.ok(links.some(node => node.props.href === href), `Falta ${href}`);
    assert.equal(links.some(node => node.props.href === "/dashboard/sedes"), user !== supervisor);
    assert.ok(links.some(node => node.props.href === (user === supervisor ? "/dashboard/analitico" : "/dashboard/reportes")));
    assert.ok(text(tree).includes(user.nombre)); assert.ok(namedButton(tree, "Cerrar sesión"));
    p.unmount();
  }
});

test("los indicadores suman la cobertura completa mientras la tabla muestra como máximo diez préstamos por página", async () => {
  const p = pageProbe(); let tree = await p.ready();
  assert.equal(metric(tree, "Alertas activas"), "27"); assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(loanRows)));
  assert.ok(text(tree).includes(money(sumCosts(loanRows)))); assert.equal(dataRows(tree).length, 10);
  const next = namedButton(tree, "Siguiente"); assert.ok(next && !next.props.disabled); next.props.onClick(); tree = p.render();
  assert.equal(dataRows(tree).length, 10); assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(loanRows)));
  const firstPageIds = loanRows.slice(0, 10).map(row => `#${row.id}`);
  assert.ok(dataRows(tree).every(row => !firstPageIds.some(id => text(row).includes(id))));
  namedButton(tree, "Siguiente").props.onClick(); tree = p.render(); assert.equal(dataRows(tree).length, 7);
  assert.equal(namedButton(tree, "Siguiente").props.disabled, true);
  namedButton(tree, "Anterior").props.onClick(); tree = p.render(); assert.equal(dataRows(tree).length, 10);
  assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(loanRows))); p.unmount();
});

function searchField(tree) { const control = flatten(tree).find(node => node.type === "input" && (node.props.type === "search" || node.props.placeholder?.includes("IMEI"))); assert.ok(control, "Falta buscador de préstamos"); return control; }
function selectField(tree) { const control = flatten(tree).find(node => node.type === "select"); assert.ok(control, "Falta selector de sede"); return control; }

test("búsqueda y sede se combinan sobre toda la colección antes de paginar y conservan las fórmulas de cobertura", async () => {
  const p = pageProbe(); let tree = await p.ready();
  namedButton(tree, "Siguiente").props.onClick(); p.render();
  searchField(p.render()).props.onChange({ target: { value: loanRows[22].imei } }); tree = p.render();
  assert.equal(dataRows(tree).length, 1); assert.ok(text(dataRows(tree)[0]).includes(loanRows[22].referencia));
  assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(loanRows)));
  assert.ok(namedButton(tree, "Anterior")?.props.disabled ?? true);
  searchField(tree).props.onChange({ target: { value: "" } }); tree = p.render();
  selectField(tree).props.onChange({ target: { value: "2" } }); await p.ready();
  const expected = loanRows.filter(row => row.sedeOrigenId === 2 || row.sedeDestinoId === 2);
  assert.equal(metric(p.render(), "Alertas activas"), String(expected.length)); assert.equal(metric(p.render(), "Valor comprometido"), money(sumCosts(expected)));
  assert.ok(p.calls.some(call => call.url === "/api/alertas/prestamos?sedeId=2"));
  searchField(p.render()).props.onChange({ target: { value: "PAGO_PENDIENTE_APROBACION" } }); tree = p.render();
  const matches = expected.filter(row => row.estado === "PAGO_PENDIENTE_APROBACION");
  assert.equal(dataRows(tree).length, Math.min(10, matches.length));
  assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(expected)));
  assert.ok(text(tree).includes(money(sumCosts(expected)))); p.unmount();
});

test("la búsqueda conserva IMEI de texto, referencia, color, ambas sedes y estado fuera de la primera página", async () => {
  const p = pageProbe(); await p.ready();
  for (const term of [loanRows[22].imei, loanRows[22].referencia.toLowerCase(), "azul", "bodega principal", "nombre extenso", "pago_pendiente_aprobacion"]) {
    searchField(p.render()).props.onChange({ target: { value: ` ${term} ` } }); const tree = p.render();
    const expected = loanRows.filter(row => [row.imei, row.referencia, row.color, row.sedeOrigenNombre, row.sedeDestinoNombre, row.estado].some(value => String(value).toLowerCase().includes(term)));
    assert.equal(dataRows(tree).length, Math.min(10, expected.length)); assert.ok(expected.length > 0);
    assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(loanRows)));
  }
  searchField(p.render()).props.onChange({ target: { value: loanRows[0].imei } }); const tree = p.render();
  const row = text(dataRows(tree)[0]);
  for (const value of ["000000000000001", "EQUIPO DE PRUEBA 1", "PLATA", "BODEGA PRINCIPAL", "SEDE QA", "$ 1.718.499.321"]) assert.ok(row.includes(value), `Falta ${value}`);
  p.unmount();
});

test("supervisor solo consulta su cobertura y conserva el nombre de su sede sin selector administrativo", async () => {
  const p = pageProbe({ user: supervisor }); const tree = await p.ready();
  const expected = loanRows.filter(row => row.sedeOrigenId === 1 || row.sedeDestinoId === 1);
  assert.equal(metric(tree, "Alertas activas"), String(expected.length)); assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(expected)));
  assert.ok(!flatten(tree).some(node => node.type === "select"));
  assert.ok(text(tree).includes("SEDE QA"));
  assert.ok(p.calls.filter(call => call.url.startsWith("/api/alertas/prestamos")).every(call => !call.url.includes("sedeId=")));
  assert.ok(!p.calls.some(call => call.url === "/api/sedes"));
  assert.equal(p.live.options.intervalMs, 12000);
  assert.ok(p.calls.every(call => !call.options.method || call.options.method === "GET"));
  p.unmount();
});

test("una consulta sin coincidencias no borra el total de cobertura ni muestra un estado estable falso", async () => {
  const p = pageProbe(); await p.ready();
  searchField(p.render()).props.onChange({ target: { value: "NADA-COINCIDE-QA" } }); const tree = p.render();
  assert.equal(dataRows(tree).length, 0); assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(loanRows))); assert.equal(metric(tree, "Alertas activas"), "27");
  assert.ok(!text(tree).includes("ESTABLE"));
  p.unmount();
});

test("la ausencia real de préstamos muestra el estado vacío estable solo tras una respuesta válida", async () => {
  const p = pageProbe({ responses: { "/api/alertas/prestamos": { ok: true, data: [] } } }); const tree = await p.ready();
  assert.equal(metric(tree, "Alertas activas"), "0"); assert.equal(metric(tree, "Valor comprometido"), "$ 0"); assert.equal(dataRows(tree).length, 0);
  assert.match(text(tree), /ESTABLE|Sin alertas|sin alertas|Al día/); p.unmount();
});

test("los fallos HTTP o JSON inválido se muestran como error y nunca como una lista vacía exitosa", async () => {
  for (const response of [
    { ok: false, status: 401, data: { error: "No autenticado QA" } },
    { ok: false, status: 403, data: { error: "Sin permiso QA" } },
    { ok: false, status: 503, data: { error: "Fallo temporal QA" } },
    { ok: true, data: { error: "Formato incompleto QA" } },
    () => { throw Error("Red interrumpida QA"); },
  ]) {
    const p = pageProbe({ responses: { "/api/alertas/prestamos": response } }); const tree = await p.ready();
    assert.ok(flatten(tree).some(node => node.props?.role === "alert"), "Debe distinguir error de ausencia de alertas");
    assert.ok(!text(tree).includes("ESTABLE")); assert.equal(dataRows(tree).length, 0);
    assert.ok(!text(tree).includes("$ 0"));
    p.unmount();
  }
});

test("la sesión pendiente o no autorizada no consulta datos ni presenta indicadores financieros falsos", async () => {
  const delayed = deferred();
  const p = pageProbe({ responses: { "/api/session": () => delayed.promise } }); let tree = await p.ready();
  assert.ok(!p.calls.some(call => call.url.startsWith("/api/alertas/prestamos")));
  assert.ok(!text(tree).includes("ESTABLE")); assert.ok(!text(tree).includes("$ 0"));
  delayed.resolve({ ok: false, status: 401, data: { error: "Sesión no autorizada QA" } }); await flush(); tree = p.render();
  assert.ok(flatten(tree).some(node => node.props?.role === "alert"));
  assert.ok(!p.calls.some(call => call.url.startsWith("/api/alertas/prestamos"))); p.unmount();
});

test("la carga inicial distingue consulta en curso de ausencia real de alertas", async () => {
  const loading = deferred();
  const p = pageProbe({ responses: { "/api/alertas/prestamos": () => loading.promise } }); let tree = await p.ready();
  assert.equal(metric(tree, "Alertas activas"), "—"); assert.equal(metric(tree, "Valor comprometido"), "—");
  assert.equal(metric(tree, "Estado general"), "—"); assert.equal(dataRows(tree).length, 0);
  assert.ok(flatten(tree).some(node => node.props?.role === "status" && text(node).includes("Cargando alertas")));
  assert.ok(!flatten(tree).some(node => node.props?.role === "alert"));
  assert.equal(namedButton(tree, "Actualizando…").props.disabled, true);
  assert.equal(namedButton(tree, "Siguiente").props.disabled, true);
  loading.resolve({ ok: true, data: loanRows }); await flush(); tree = p.render();
  assert.equal(metric(tree, "Alertas activas"), "27"); assert.equal(dataRows(tree).length, 10); p.unmount();
});

test("una respuesta tardía de otra cobertura se cancela y no reemplaza las alertas de la sede actual", async () => {
  const slow = deferred(); let allRequests = 0;
  const p = pageProbe({ responses: { "/api/alertas/prestamos": url => {
    const sede = Number(new URL(url, "http://qa.local").searchParams.get("sedeId"));
    if (!sede && ++allRequests > 1) return slow.promise;
    return { ok: true, data: loanRows.filter(row => !sede || row.sedeOrigenId === sede || row.sedeDestinoId === sede) };
  } } });
  let tree = await p.ready(); const oldRefresh = p.live.refresh(); tree = p.render();
  const oldCall = p.calls.filter(call => call.url === "/api/alertas/prestamos").at(-1);
  selectField(tree).props.onChange({ target: { value: "2" } }); tree = p.render();
  assert.equal(metric(tree, "Valor comprometido"), "—"); assert.equal(dataRows(tree).length, 0);
  tree = await p.ready(); const expected = loanRows.filter(row => row.sedeOrigenId === 2 || row.sedeDestinoId === 2);
  assert.equal(oldCall.options.signal.aborted, true);
  assert.equal(metric(tree, "Alertas activas"), String(expected.length));
  assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(expected)));
  const visible = dataRows(tree).map(text);
  slow.resolve({ ok: true, data: [{ ...loanRows[0], referencia: "COBERTURA VIEJA QUE NO DEBE APARECER", costo: 999999999 }] });
  await oldRefresh; await flush(); tree = p.render();
  assert.deepEqual(dataRows(tree).map(text), visible);
  assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(expected)));
  assert.ok(!text(tree).includes("COBERTURA VIEJA QUE NO DEBE APARECER")); p.unmount();
});

test("el reintento conserva búsqueda, sede y página, oculta cifras antiguas mientras hay error y restaura la consulta válida", async () => {
  let fail = false;
  const p = pageProbe({ responses: { "/api/alertas/prestamos": url => {
    if (fail) return { ok: false, status: 503, data: { error: "Lectura temporalmente interrumpida QA" } };
    const sede = Number(new URL(url, "http://qa.local").searchParams.get("sedeId"));
    return { ok: true, data: loanRows.filter(row => !sede || row.sedeOrigenId === sede || row.sedeDestinoId === sede) };
  } } });
  let tree = await p.ready(); selectField(tree).props.onChange({ target: { value: "2" } }); p.render(); tree = await p.ready();
  searchField(tree).props.onChange({ target: { value: "EQUIPO" } }); tree = p.render();
  namedButton(tree, "Siguiente").props.onClick(); tree = p.render();
  const originalRows = dataRows(tree).map(text); assert.equal(originalRows.length, 3);
  fail = true; namedButton(tree, "Actualizar").props.onClick(); await flush(); tree = p.render();
  assert.ok(text(tree).includes("Lectura temporalmente interrumpida QA"));
  assert.equal(metric(tree, "Alertas activas"), "—"); assert.equal(metric(tree, "Valor comprometido"), "—");
  assert.equal(dataRows(tree).length, 0); assert.equal(searchField(tree).props.value, "EQUIPO"); assert.equal(selectField(tree).props.value, "2");
  fail = false; namedButton(tree, "Reintentar").props.onClick(); await flush(); tree = p.render();
  assert.deepEqual(dataRows(tree).map(text), originalRows);
  assert.equal(searchField(tree).props.value, "EQUIPO"); assert.equal(selectField(tree).props.value, "2");
  assert.equal(namedButton(tree, "Página 2").props["aria-current"], "page");
  assert.ok(!flatten(tree).some(node => node.props?.role === "alert")); p.unmount();
});

test("la actualización de doce segundos conserva filtros y página e incorpora nuevos totales sin mutaciones", async () => {
  let rows = loanRows;
  const p = pageProbe({ responses: { "/api/alertas/prestamos": () => ({ ok: true, data: rows }) } });
  let tree = await p.ready();
  searchField(tree).props.onChange({ target: { value: "EQUIPO" } }); tree = p.render(); namedButton(tree, "Siguiente").props.onClick(); tree = p.render();
  assert.equal(p.live.options.enabled, true); assert.equal(p.live.options.intervalMs, 12000);
  rows = loanRows.slice(0, 12);
  await p.live.refresh(); await flush(); tree = p.render();
  assert.equal(searchField(tree).props.value, "EQUIPO"); assert.equal(namedButton(tree, "Página 2").props["aria-current"], "page");
  assert.equal(dataRows(tree).length, 2); assert.equal(metric(tree, "Alertas activas"), "12");
  assert.equal(metric(tree, "Valor comprometido"), money(sumCosts(rows)));
  rows = loanRows.slice(0, 3); await p.live.refresh(); await flush(); tree = p.render();
  assert.equal(namedButton(tree, "Página 1").props["aria-current"], "page"); assert.equal(dataRows(tree).length, 3);
  assert.equal(namedButton(tree, "Siguiente").props.disabled, true);
  assert.ok(p.calls.every(call => !call.options.method || call.options.method === "GET"));
  p.unmount();
});

test("el fallo del catálogo de sedes ofrece reintento sin convertirlo en una ausencia de alertas", async () => {
  let fail = true;
  const p = pageProbe({ responses: { "/api/sedes": () => fail ? { ok: false, status: 503, data: { error: "Catálogo no disponible QA" } } : { ok: true, data: sedes } } });
  let tree = await p.ready();
  assert.ok(text(tree).includes("Catálogo no disponible QA")); assert.ok(namedButton(tree, "Reintentar sedes"));
  assert.equal(metric(tree, "Alertas activas"), "27"); assert.equal(dataRows(tree).length, 10);
  fail = false; namedButton(tree, "Reintentar sedes").props.onClick(); await flush(); tree = p.render();
  assert.ok(!text(tree).includes("Catálogo no disponible QA"));
  assert.equal(flatten(selectField(tree)).filter(node => node.type === "option").length, sedes.length + 1); p.unmount();
});
