import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PAGE = "app/dashboard/analitico/page.tsx";
const API = "app/api/dashboard/analitico/route.ts";
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const source = path => readFileSync(join(ROOT, path), "utf8");
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const admin = { id: 51, nombre: "Administradora de prueba", usuario: "admin-qa", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeId: 6, sedeNombre: "SEDE 6" };
const auditor = { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" };
const supervisor = { ...admin, rolNombre: "SEDE", perfilTipo: "SUPERVISOR_TIENDA" };
const sedes = [{ id: 6, nombre: "SEDE 6" }, { id: 8, nombre: "ONLINE DE PRUEBA" }, { id: 12, nombre: "Stand de prueba" }, { id: 13, nombre: "Stand de prueba" }];
const money = value => `$ ${Number(value).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
function summary(period = "2026-10", sedeId = null, overrides = {}) {
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5));
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const previousKey = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = key => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(`${key}-01T05:00:00Z`));
  return {
    periodoActual: { key: period, label: label(period) }, periodoAnterior: { key: previousKey, label: label(previousKey) },
    cobertura: sedes.find(sede => sede.id === sedeId)?.nombre ?? "Todas las sedes",
    ventas: { actual: sedeId ? 71 : 1097, anterior: 1416, diferencia: -319, porcentaje: -22.5 },
    utilidad: { actual: 418080631.6789, anterior: 529986893.789, diferencia: -111906262.1101, porcentaje: -21.115 },
    ...overrides,
  };
}
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
const controls = (tree, type) => flatten(tree).filter(node => node.type === type);
const namedButton = (tree, label) => controls(tree, "button").find(node => text(node).toLocaleLowerCase("es") === label.toLocaleLowerCase("es") || node.props["aria-label"] === label);
const monthField = tree => controls(tree, "input").find(node => node.props.type === "month");
const sedeField = tree => controls(tree, "select")[0];
const figures = tree => controls(tree, "figure");
const summaryRegion = tree => flatten(tree).find(node => node.props?.["aria-label"] === "Resumen del periodo");
const hasError = tree => flatten(tree).some(node => node.props?.role === "alert");
async function flush() { for (let index = 0; index < 40; index++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function depsChanged(previous, next) { return !previous || !next || next.some((value, index) => !Object.is(value, previous[index])); }

function pageProbe({ user = admin, responses = {}, now = "2026-11-01T02:30:00Z" } = {}) {
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
    useEffect(fn, deps) { if (!isPage) return; const index = effectCursor++; if (depsChanged(effects[index]?.deps, deps)) pending.push({ index, fn, deps }); },
    useMemo(fn, deps) { if (!isPage) return fn(); const index = memoCursor++; if (!memo[index] || depsChanged(memo[index].deps, deps)) memo[index] = { deps, value: fn() }; return memo[index].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  };
  const fakeWindow = { setTimeout(fn, delay = 0) { const id = ++timerId; scheduled.set(id, { fn, delay }); return id; }, clearTimeout(id) { scheduled.delete(id); } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).getTime(); } }
  const fetch = async (url, options = {}) => {
    calls.push({ url, options }); const path = new URL(url, "http://qa.local");
    const configured = responses[url] ?? responses[path.pathname];
    let result = await (typeof configured === "function" ? configured(url, options) : configured);
    if (result === undefined) {
      const sedeId = ["ADMIN", "AUDITOR"].includes(user?.rolNombre) ? Number(path.searchParams.get("sedeId")) || null : user?.sedeId;
      const data = path.pathname === "/api/session" ? user : path.pathname === "/api/sedes" ? sedes : { ok: true, resumen: summary(path.searchParams.get("period") ?? "2026-10", sedeId) };
      result = { ok: true, data };
    }
    if (result instanceof Response) return result;
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500), json: async () => result.data };
  };
  const cache = new Map();
  const load = relative => {
    const loaded = { exports: {} };
    new Function("require", "module", "exports", "window", "fetch", "Date", compile(source(relative)))(name => {
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
    }, loaded, loaded.exports, fakeWindow, fetch, Clock);
    return loaded.exports;
  };
  const Page = load(PAGE).default;
  const render = () => {
    stateCursor = 0; effectCursor = 0; refCursor = 0; memoCursor = 0; pending = []; isPage = true;
    const tree = Page(); isPage = false; return resolveTree(tree);
  };
  render();
  return {
    calls, render, get live() { return live; },
    async effects() {
      const active = pending.splice(0);
      for (const effect of active) { effects[effect.index]?.cleanup?.(); effects[effect.index] = { deps: effect.deps, cleanup: effect.fn() }; }
      const due = [...scheduled].filter(([, timer]) => timer.delay === 0); due.forEach(([id, timer]) => { scheduled.delete(id); timer.fn(); });
      await flush(); return render();
    },
    async ready() { for (let index = 0; index < 6; index++) await this.effects(); return render(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

function apiProbe(user = admin, access = true, fail = false) {
  const calls = [], loaded = { exports: {} };
  const pure = { exports: {} }; new Function("module", "exports", compile(source("lib/access-control.ts")))(pure, pure.exports);
  const imports = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": pure.exports,
    "@/lib/dashboard-analytics": { getMonthlyAnalyticSummary: async options => { calls.push({ name: "summary", options }); if (fail) throw Error("Fallo QA"); return summary(options.period ?? "2026-10", options.sedeId); } },
    "@/lib/financial-access": { getFinancialAccessState: async options => { calls.push({ name: "gate", options }); return { authorized: access, sede: { claveAsignada: true } }; } },
    "@/lib/prisma": { __esModule: true, default: { sede: { findUnique: async options => { calls.push({ name: "sede", options }); return sedes.find(row => row.id === options.where.id); } } } },
  };
  new Function("require", "module", "exports", "console", compile(source(API)))(name => { assert.ok(name in imports, `Import inesperado de API: ${name}`); return imports[name]; }, loaded, loaded.exports, { error() {} });
  return { calls, get: params => loaded.exports.GET(new Request(`http://qa.local/api/dashboard/analitico?${params}`)) };
}

function calculationProbe(actual, anterior) {
  const calls = [], cache = new Map();
  const prisma = { venta: { aggregate: async options => { const index = calls.length; calls.push(options); return [actual, anterior][index]; } } };
  const load = relative => {
    const loaded = { exports: {} };
    new Function("require", "module", "exports", compile(source(relative)))(name => {
      if (name === "@/lib/prisma") return { __esModule: true, default: prisma };
      assert.ok(name.startsWith("@/lib/"), `Dependencia de cálculo no cubierta: ${name}`);
      const path = `${name.slice(2)}.ts`; if (!cache.has(path)) cache.set(path, load(path)); return cache.get(path);
    }, loaded, loaded.exports);
    return loaded.exports;
  };
  return { calls, get: load("lib/dashboard-analytics.ts").getMonthlyAnalyticSummary };
}

test("el cálculo real compara meses completos de Bogotá y conserva sede, utilidad decimal y cambio de año", async () => {
  const p = calculationProbe({ _count: { id: 1097 }, _sum: { utilidad: { toNumber: () => 418080631.6789 } } }, { _count: { id: 1416 }, _sum: { utilidad: "529986893.789" } });
  const result = await p.get({ period: "2026-01", sedeId: 8 });
  assert.equal(result.periodoActual.key, "2026-01"); assert.equal(result.periodoAnterior.key, "2025-12");
  assert.equal(p.calls[0].where.fecha.gte.toISOString(), "2026-01-01T05:00:00.000Z"); assert.equal(p.calls[0].where.fecha.lt.toISOString(), "2026-02-01T05:00:00.000Z");
  assert.equal(p.calls[1].where.fecha.gte.toISOString(), "2025-12-01T05:00:00.000Z"); assert.equal(p.calls[1].where.fecha.lt.toISOString(), "2026-01-01T05:00:00.000Z");
  assert.ok(p.calls.every(call => call.where.sedeId === 8));
  assert.deepEqual(result.ventas, { actual: 1097, anterior: 1416, diferencia: -319, porcentaje: -319 / 1416 * 100 });
  assert.equal(result.utilidad.actual, 418080631.6789); assert.equal(result.utilidad.anterior, 529986893.789);
  assert.equal(result.utilidad.diferencia, 418080631.6789 - 529986893.789);
  assert.equal(result.utilidad.porcentaje, (418080631.6789 - 529986893.789) / Math.abs(529986893.789) * 100);
});

test("el cálculo mantiene la base cero sin porcentaje y compara bases negativas con su valor absoluto", async () => {
  const p = calculationProbe({ _count: { id: 0 }, _sum: { utilidad: -5 } }, { _count: { id: 0 }, _sum: { utilidad: -10 } });
  const result = await p.get({ period: "2026-10", sedeId: null });
  assert.deepEqual(result.ventas, { actual: 0, anterior: 0, diferencia: 0, porcentaje: null });
  assert.deepEqual(result.utilidad, { actual: -5, anterior: -10, diferencia: 5, porcentaje: 50 });
  assert.ok(p.calls.every(call => !("sedeId" in call.where)));
});

test("el servidor rechaza sesiones y perfiles no autorizados antes de consultar indicadores", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map(perfilTipo => ({ ...supervisor, perfilTipo }))]) {
    const p = apiProbe(user), response = await p.get("period=2026-10&sedeId=8");
    assert.equal(response.status, user ? 403 : 401); assert.deepEqual(p.calls, []);
  }
});

test("el servidor conserva filtros administrativos por ID y todos los valores calculados", async () => {
  for (const user of [admin, auditor]) for (const sedeId of [null, 12, 13]) {
    const p = apiProbe(user), response = await p.get(`period=2026-01${sedeId ? `&sedeId=${sedeId}` : ""}`), data = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(p.calls[0], { name: "summary", options: { period: "2026-01", sedeId } });
    assert.deepEqual(data.resumen.ventas, summary("2026-01", sedeId).ventas); assert.deepEqual(data.resumen.utilidad, summary("2026-01", sedeId).utilidad);
    assert.equal(data.resumen.periodoAnterior.key, "2025-12"); assert.equal(data.resumen.cobertura, sedeId ? "Stand de prueba" : "Todas las sedes");
  }
});

test("el supervisor debe validar su clave financiera y siempre consulta la sede de su sesión", async () => {
  for (const access of [false, true]) {
    const p = apiProbe(supervisor, access), response = await p.get("period=2026-10&sedeId=8");
    assert.deepEqual(p.calls[0], { name: "gate", options: { allowAdminBypass: false } }); assert.equal(response.status, access ? 200 : 403);
    assert.equal(p.calls.some(call => call.name === "summary"), access);
    if (access) assert.deepEqual(p.calls[1], { name: "summary", options: { period: "2026-10", sedeId: 6 } });
    assert.ok(!p.calls.some(call => call.name === "sede"));
  }
});

test("un fallo de cálculo en servidor devuelve error en vez de importes cero", async () => {
  const p = apiProbe(admin, true, true), response = await p.get("period=2026-10");
  assert.equal(response.status, 500); assert.match((await response.json()).error, /Error cargando panel/);
});

test("la navegación conserva Reportes activo, accesos autorizados y cierre de sesión sin sidebar", async () => {
  for (const user of [admin, auditor, supervisor]) {
    const p = pageProbe({ user }), tree = await p.ready(), nodes = flatten(tree), links = controls(tree, "a");
    assert.ok(!nodes.some(node => node.props?.["data-old-sidebar"]));
    assert.ok(nodes.some(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal"));
    const reportHref = user === supervisor ? "/dashboard/analitico" : "/dashboard/reportes";
    assert.ok(links.some(node => node.props.href === reportHref && node.props["aria-current"] === "page"));
    for (const href of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones"]) assert.ok(links.some(node => node.props.href === href), `Falta ${href}`);
    assert.equal(links.some(node => node.props.href === "/dashboard/sedes"), user !== supervisor);
    assert.ok(text(tree).includes(user.nombre)); assert.ok(text(tree).includes(user.rolNombre)); assert.ok(namedButton(tree, "Cerrar sesión")); p.unmount();
  }
});

test("el periodo inicial usa el mes de Colombia incluso cuando UTC ya cambió de mes", async () => {
  const p = pageProbe(), tree = await p.ready();
  assert.equal(monthField(tree).props.value, "2026-10");
  assert.ok(p.calls.filter(call => call.url.startsWith("/api/dashboard/analitico")).every(call => new URL(call.url, "http://qa.local").searchParams.get("period") === "2026-10"));
  assert.ok(text(tree).includes("octubre de 2026")); assert.ok(text(tree).includes("septiembre de 2026"));
  const updated = controls(tree, "time")[0];
  assert.equal(updated.props.dateTime, "2026-11-01T02:30:00.000Z");
  assert.equal(text(updated), new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date("2026-11-01T02:30:00Z"))); p.unmount();
});

test("la vista muestra actual, anterior, diferencia y porcentaje del servidor sin recalcularlos", async () => {
  const original = summary(), p = pageProbe(), tree = await p.ready(), content = text(tree);
  assert.ok(summaryRegion(tree)); assert.equal(figures(tree).length, 2);
  for (const value of ["1.097", "1.416", "-319", "-22,5", money(original.utilidad.actual), money(original.utilidad.anterior), money(original.utilidad.diferencia), "-21,1"]) assert.ok(content.includes(value), `Falta ${value}`);
  assert.ok(!content.includes("418.080.631,6789"));
  assert.ok(!/\$\s*[\d.,]+\s*[MK]\b/.test(content));
  p.unmount();
});

test("mes y sede se combinan por ID y el refresco de diez segundos conserva ambos filtros", async () => {
  const p = pageProbe(); let tree = await p.ready();
  monthField(tree).props.onChange({ target: { value: "2026-01" } }); p.render(); tree = await p.ready();
  sedeField(tree).props.onChange({ target: { value: "13" } }); p.render(); tree = await p.ready();
  assert.equal(monthField(tree).props.value, "2026-01"); assert.equal(sedeField(tree).props.value, "13");
  const options = controls(sedeField(tree), "option"); assert.ok(options.some(row => row.props.value === "12")); assert.ok(options.some(row => row.props.value === "13"));
  assert.equal(p.live.options.intervalMs, 10000); assert.equal(p.live.options.enabled, true);
  await p.live.refresh(); await flush(); tree = p.render();
  const last = new URL(p.calls.filter(call => call.url.startsWith("/api/dashboard/analitico")).at(-1).url, "http://qa.local");
  assert.equal(last.searchParams.get("period"), "2026-01"); assert.equal(last.searchParams.get("sedeId"), "13");
  assert.equal(monthField(tree).props.value, "2026-01"); assert.equal(sedeField(tree).props.value, "13");
  assert.ok(p.calls.every(call => !call.options.method || call.options.method === "GET")); p.unmount();
});

test("un mes vacío o inválido no consulta otro periodo ni deja visibles datos de la selección anterior", async () => {
  const p = pageProbe(); let tree = await p.ready();
  for (const value of ["", "2026-13", "2026-00", "2026-1"]) {
    const before = p.calls.length; monthField(tree).props.onChange({ target: { value } }); p.render(); tree = await p.ready();
    assert.equal(p.calls.length, before); assert.equal(figures(tree).length, 0); assert.equal(monthField(tree).props["aria-invalid"], true);
    assert.equal(namedButton(tree, "Actualizar").props.disabled, true); assert.equal(p.live.options.enabled, false);
    assert.ok(text(tree).includes("Selecciona un mes válido"));
  }
  monthField(tree).props.onChange({ target: { value: "2026-02" } }); p.render(); tree = await p.ready();
  assert.equal(monthField(tree).props["aria-invalid"], false); assert.equal(figures(tree).length, 2); assert.equal(p.live.options.enabled, true); p.unmount();
});

test("la actualización periódica incorpora cifras nuevas sin modificar periodo ni cobertura", async () => {
  let values = { actual: 1097, anterior: 1416, diferencia: -319, porcentaje: -22.5 };
  const p = pageProbe({ responses: { "/api/dashboard/analitico": url => {
    const params = new URL(url, "http://qa.local").searchParams;
    return { ok: true, data: { ok: true, resumen: summary(params.get("period"), Number(params.get("sedeId")) || null, { ventas: values }) } };
  } } });
  let tree = await p.ready(); sedeField(tree).props.onChange({ target: { value: "12" } }); p.render(); tree = await p.ready();
  values = { actual: 2200, anterior: 1416, diferencia: 784, porcentaje: 55.367 };
  await p.live.refresh(); await flush(); tree = p.render();
  assert.ok(text(summaryRegion(tree)).includes("2.200")); assert.ok(text(summaryRegion(tree)).includes("+55,4"));
  assert.ok(text(figures(tree)[0]).includes("784")); assert.equal(monthField(tree).props.value, "2026-10"); assert.equal(sedeField(tree).props.value, "12");
  assert.ok(p.calls.every(call => !call.options.method || call.options.method === "GET")); p.unmount();
});

test("el supervisor ve su sede sin selector ni consulta al catálogo administrativo", async () => {
  const p = pageProbe({ user: supervisor }), tree = await p.ready();
  assert.equal(controls(tree, "select").length, 0); assert.ok(text(tree).includes("SEDE 6"));
  assert.ok(!p.calls.some(call => call.url === "/api/sedes"));
  assert.ok(p.calls.filter(call => call.url.startsWith("/api/dashboard/analitico")).every(call => !call.url.includes("sedeId=")));
  p.unmount();
});

test("la carga inicial no muestra valores cero ni comparaciones inventadas", async () => {
  const delay = deferred(), p = pageProbe({ responses: { "/api/dashboard/analitico": () => delay.promise } }); let tree = await p.ready();
  assert.ok(!text(tree).includes("$ 0")); assert.equal(figures(tree).length, 0); assert.ok(!hasError(tree));
  assert.ok(flatten(tree).some(node => node.props?.role === "status"));
  assert.ok(namedButton(tree, "Actualizando…")?.props.disabled);
  delay.resolve({ ok: true, data: { ok: true, resumen: summary() } }); await flush(); tree = p.render();
  assert.equal(figures(tree).length, 2); p.unmount();
});

test("cero real, utilidad negativa y ausencia de base anterior conservan su significado", async () => {
  const data = summary("2026-10", null, { ventas: { actual: 0, anterior: 0, diferencia: 0, porcentaje: null }, utilidad: { actual: -1500000.25, anterior: 0, diferencia: -1500000.25, porcentaje: null } });
  const p = pageProbe({ responses: { "/api/dashboard/analitico": { ok: true, data: { ok: true, resumen: data } } } }), tree = await p.ready();
  assert.ok(text(tree).includes(money(-1500000.25))); assert.ok(text(tree).includes("Sin base anterior"));
  assert.ok(!/Infinity|NaN/.test(text(tree))); assert.equal(figures(tree).length, 2);
  const widths = figures(tree).map(figure => flatten(figure).filter(node => node.props?.style?.width != null).map(node => node.props.style.width));
  assert.ok(widths[0].length >= 2); assert.ok(widths[0].every(width => width === "0%"));
  assert.ok(widths[1].includes("100%")); assert.ok(widths[1].includes("0%"));
  p.unmount();
});

test("porcentajes positivos y variación sin cambio se muestran con signo y cifras completas", async () => {
  for (const metric of [{ actual: 3, anterior: 2, diferencia: 1, porcentaje: 50 }, { actual: 2, anterior: 2, diferencia: 0, porcentaje: 0 }]) {
    const p = pageProbe({ responses: { "/api/dashboard/analitico": { ok: true, data: { ok: true, resumen: summary("2026-10", null, { ventas: metric }) } } } }), tree = await p.ready();
    assert.ok(text(summaryRegion(tree)).includes(metric.porcentaje ? "+50,0" : "0,0"));
    assert.ok(text(figures(tree)[0]).includes(metric.diferencia ? "+1" : "0")); p.unmount();
  }
});

test("respuestas no autorizadas, fallos y resumen mal formado distinguen error de cero", async () => {
  for (const response of [
    { ok: false, status: 401, data: { error: "Sesión vencida QA" } }, { ok: false, status: 403, data: { error: "Clave requerida QA" } },
    { ok: false, status: 503, data: { error: "Error temporal QA" } }, { ok: true, data: { ok: true } },
    { ok: true, data: { ok: true, resumen: { ...summary(), utilidad: { actual: "no-numérico" } } } }, () => { throw Error("Red QA"); },
  ]) {
    const p = pageProbe({ responses: { "/api/dashboard/analitico": response } }), tree = await p.ready();
    assert.ok(hasError(tree)); assert.ok(!text(tree).includes("$ 0")); assert.equal(figures(tree).length, 0); assert.ok(namedButton(tree, "Reintentar")); p.unmount();
  }
});

test("una sesión pendiente o inválida nunca consulta datos financieros ni catálogo de sedes", async () => {
  for (const response of [{ ok: false, status: 401, data: { error: "No autenticado QA" } }, { ok: true, data: {} }, { ok: true, data: { ...admin, id: 0 } }]) {
    const p = pageProbe({ responses: { "/api/session": response } }), tree = await p.ready();
    assert.ok(hasError(tree)); assert.ok(!p.calls.some(call => call.url.startsWith("/api/dashboard/analitico") || call.url === "/api/sedes")); assert.ok(!text(tree).includes("$ 0")); p.unmount();
  }
  const delay = deferred(), p = pageProbe({ responses: { "/api/session": () => delay.promise } }); await p.ready();
  assert.ok(!p.calls.some(call => call.url.startsWith("/api/dashboard/analitico"))); assert.equal(p.live.options.enabled, false); p.unmount(); delay.resolve({ ok: true, data: admin }); await flush();
});

test("el reintento conserva mes y sede y no vuelve a presentar cifras viejas mientras espera", async () => {
  let fail = false, retry;
  const p = pageProbe({ responses: { "/api/dashboard/analitico": url => {
    if (fail) return { ok: false, status: 503, data: { error: "Lectura interrumpida QA" } };
    if (retry) return retry.promise;
    const params = new URL(url, "http://qa.local").searchParams; return { ok: true, data: { ok: true, resumen: summary(params.get("period"), Number(params.get("sedeId")) || null) } };
  } } });
  let tree = await p.ready(); monthField(tree).props.onChange({ target: { value: "2026-01" } }); p.render(); tree = await p.ready();
  sedeField(tree).props.onChange({ target: { value: "8" } }); p.render(); tree = await p.ready();
  fail = true; await p.live.refresh(); await flush(); tree = p.render();
  assert.ok(text(tree).includes("Lectura interrumpida QA")); assert.equal(figures(tree).length, 0);
  fail = false; retry = deferred(); namedButton(tree, "Reintentar").props.onClick(); tree = p.render();
  assert.equal(figures(tree).length, 0); assert.equal(monthField(tree).props.value, "2026-01"); assert.equal(sedeField(tree).props.value, "8");
  retry.resolve({ ok: true, data: { ok: true, resumen: summary("2026-01", 8) } }); await flush(); tree = p.render();
  assert.equal(figures(tree).length, 2); assert.ok(!hasError(tree)); assert.ok(text(tree).includes("diciembre de 2025")); p.unmount();
});

test("una respuesta tardía del mes o sede anterior se cancela sin reemplazar el filtro actual", async () => {
  const slow = deferred(); let repeated = 0;
  const p = pageProbe({ responses: { "/api/dashboard/analitico": url => {
    const params = new URL(url, "http://qa.local").searchParams;
    if (params.get("period") === "2026-10" && !params.has("sedeId") && ++repeated > 1) return slow.promise;
    return { ok: true, data: { ok: true, resumen: summary(params.get("period"), Number(params.get("sedeId")) || null) } };
  } } });
  let tree = await p.ready(); const oldRefresh = p.live.refresh(); p.render(); const oldCall = p.calls.at(-1);
  monthField(tree).props.onChange({ target: { value: "2026-01" } }); tree = p.render(); assert.equal(figures(tree).length, 0); tree = await p.ready();
  sedeField(tree).props.onChange({ target: { value: "8" } }); p.render(); tree = await p.ready();
  assert.equal(oldCall.options.signal.aborted, true); const current = text(summaryRegion(tree));
  slow.resolve({ ok: true, data: { ok: true, resumen: summary("2026-10", null, { cobertura: "COBERTURA ANTERIOR QA", utilidad: { actual: 999999999, anterior: 1, diferencia: 999999998, porcentaje: 99999999800 } }) } });
  await oldRefresh; await flush(); tree = p.render(); assert.equal(text(summaryRegion(tree)), current); assert.ok(!text(tree).includes("COBERTURA ANTERIOR QA"));
  assert.equal(monthField(tree).props.value, "2026-01"); assert.equal(sedeField(tree).props.value, "8"); p.unmount();
});

test("un catálogo de sedes fallido se reintenta sin convertir un resumen válido en cero", async () => {
  let fail = true;
  const p = pageProbe({ responses: { "/api/sedes": () => fail ? { ok: false, status: 503, data: { error: "Catálogo interrumpido QA" } } : { ok: true, data: sedes } } });
  let tree = await p.ready(); assert.ok(text(tree).includes("Catálogo interrumpido QA")); assert.ok(namedButton(tree, "Reintentar sedes")); assert.equal(figures(tree).length, 2);
  fail = false; namedButton(tree, "Reintentar sedes").props.onClick(); await flush(); tree = p.render();
  assert.ok(!text(tree).includes("Catálogo interrumpido QA")); assert.equal(controls(sedeField(tree), "option").length, sedes.length + 1); p.unmount();
});
