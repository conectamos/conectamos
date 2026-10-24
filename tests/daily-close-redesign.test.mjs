import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PAGE = "app/caja/cierre-dia/page.tsx";
const API = "app/api/caja/cierre-dia/route.ts";
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const NOW = "2026-10-01T02:30:00.000Z";
const administrator = { id: 10, nombre: "Administradora QA", usuario: "admin-qa", sedeId: 1, sedeNombre: "SEDE QA", rolId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const auditor = { ...administrator, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" };
const supervisor = { ...administrator, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" };
const sedes = [{ id: 1, nombre: "SEDE QA" }, { id: 2, nombre: "ONLINE DE PRUEBA" }];
const ClockDate = class extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return Date.parse(NOW); } };
const source = path => readFileSync(join(ROOT, path), "utf8");
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };

function astFor(path) { return ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS); }
function compile(text) { return ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText; }
function resolveTree(node) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolveTree);
  if (typeof node.type === "function") return resolveTree(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolveTree(node.props?.children) } };
}
function elements(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node !== "object") return String(node);
  return textOf(node.props?.children);
}
function normalizedText(node) { return textOf(node).replace(/\s+/g, " ").trim(); }
function button(tree, name) { return elements(tree).find(node => node.type === "button" && normalizedText(node).toLocaleLowerCase("es") === name.toLocaleLowerCase("es")); }
function field(tree, name) {
  const label = elements(tree).find(node => node.type === "label" && normalizedText(node).startsWith(name));
  assert.ok(label, `Falta el campo ${name}`);
  const control = elements(label).find(node => ["input", "select"].includes(node.type));
  assert.ok(control, `Falta el control de ${name}`);
  return control;
}
async function flush() { for (let index = 0; index < 32; index++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function pageProbe({ user = administrator, initial = {}, responses = {} } = {}) {
  const ast = astFor(PAGE);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
  const finalReturn = component.body.statements.find(ts.isReturnStatement);
  assert.ok(finalReturn);
  const captureNames = ["esAdmin", "cobertura", "periodoActual", "buildParams", "generarCierre", "navigationItems"];
  const text = source(PAGE);
  const transformed = text.slice(0, finalReturn.getStart(ast)) + `__capture({${captureNames.join(",")}});\n` + text.slice(finalReturn.getStart(ast));
  const state = { user, sedes, cargando: false, ...initial };
  const calls = [], downloads = [], pendingEffects = [], dependencies = [], refs = [], cleanups = [];
  let capture, cursor = 0, effectCursor = 0, refCursor = 0, renderingPage = false;
  const hooks = {
    Fragment: Symbol.for("react.fragment"), useMemo: fn => fn(), useCallback: fn => fn, useId: () => "daily-close-qa",
    useState(value) {
      if (!renderingPage) return [typeof value === "function" ? value() : value, () => {}];
      const name = states[cursor++]; assert.ok(name, "Estado de página inesperado");
      if (!(name in state)) state[name] = typeof value === "function" ? value() : value;
      return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }];
    },
    useRef(value) { if (!renderingPage) return { current: value }; const index = refCursor++; return refs[index] ??= { current: value }; },
    useEffect(fn, deps) {
      if (!renderingPage) return;
      const index = effectCursor++;
      if (!dependencies[index] || !deps || deps.some((item, dep) => !Object.is(item, dependencies[index][dep]))) pendingEffects.push({ index, fn });
      dependencies[index] = deps;
    },
  };
  const fakeWindow = {
    open(url, target, features) { downloads.push({ url, target, features }); return {}; },
    alert(message) { calls.push({ kind: "alert", message }); },
    setTimeout(fn) { return setTimeout(fn, 0); }, clearTimeout,
  };
  const fetch = async (url, options) => {
    calls.push({ kind: "fetch", url, options });
    const configured = responses[url];
    const result = await (typeof configured === "function" ? configured(url, options) : configured ?? { ok: true, data: url === "/api/session" ? user : sedes });
    if (result instanceof Response) return result;
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500), json: async () => result.data };
  };
  const cache = new Map();
  const load = (relative, replacement) => {
    const loaded = { exports: {} };
    const mockRequire = name => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
      if (name === "next/image") return { __esModule: true, default: props => jsx.jsx("img", { src: props.src, alt: props.alt, width: props.width, height: props.height }) };
      if (name === "next/navigation") return { usePathname: () => "/caja/cierre-dia", useRouter: () => ({ push() {}, replace() {}, refresh() {} }) };
      if (name.endsWith(".css")) return css;
      if (name === "@/app/dashboard/_components/logout-button") return { __esModule: true, default: () => jsx.jsx("button", { children: "Cerrar sesión" }) };
      if (name === "@/app/dashboard/_components/operations-dashboard") return { DashboardSidebar: () => jsx.jsx("aside", { "data-old-sidebar": true }) };
      const base = name.startsWith("@/") ? join(ROOT, name.slice(2)) : name.startsWith(".") ? resolve(dirname(join(ROOT, relative)), name) : null;
      assert.ok(base, `Import no cubierto: ${name}`);
      const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
      assert.ok(file, `Fuente no encontrada: ${name}`);
      const path = file.slice(ROOT.length).replaceAll("\\", "/");
      if (!cache.has(path)) cache.set(path, load(path));
      return cache.get(path);
    };
    new Function("require", "module", "exports", "__capture", "window", "fetch", "Date", compile(replacement ?? source(relative)))(mockRequire, loaded, loaded.exports, value => { capture = value; }, fakeWindow, fetch, ClockDate);
    return loaded.exports;
  };
  const Page = load(PAGE, transformed).default;
  const render = () => {
    cursor = 0; effectCursor = 0; refCursor = 0; renderingPage = true;
    const tree = Page(); renderingPage = false;
    return resolveTree(tree);
  };
  render();
  return {
    state, calls, downloads, render, get view() { return capture; },
    async effects() {
      const current = pendingEffects.splice(0);
      for (const effect of current) { cleanups[effect.index]?.(); cleanups[effect.index] = effect.fn(); }
      await flush(); return render();
    },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}

function apiScopeProbe(user) {
  const ast = astFor(API);
  const functions = ["parseSedeId", "buildPeriodoCierre", "buildPreviousPeriodo"].map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name));
  assert.ok(functions.every(Boolean));
  const get = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "GET");
  const tryBlock = get.body.statements.find(ts.isTryStatement).tryBlock;
  const queries = tryBlock.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isArrayBindingPattern(declaration.name)));
  assert.ok(queries);
  const prefix = source(API).slice(tryBlock.getStart(ast) + 1, queries.getStart(ast));
  const executable = functions.map(fn => fn.getText(ast)).join("\n") + `\nexport async function GET(req: Request) { ${prefix}\nreturn { esAdmin, scope, cobertura, periodo, formato, vista }; }`;
  const loaded = { exports: {} }, reads = [];
  const hooks = { Fragment: Symbol.for("react.fragment"), useEffect() {}, useRef: current => ({ current }) };
  const memo = new Map();
  const loadPure = relative => {
    if (memo.has(relative)) return memo.get(relative);
    const pure = { exports: {} };
    new Function("require", "module", "exports", "Date", compile(source(relative)))(name => {
      if (name === "react") return hooks;
      assert.ok(name.startsWith("@/lib/"), `Import puro inesperado: ${name}`);
      return loadPure(name.slice(2) + ".ts");
    }, pure, pure.exports, ClockDate);
    memo.set(relative, pure.exports); return pure.exports;
  };
  const dates = loadPure("lib/ventas-utils.ts");
  const access = loadPure("lib/access-control.ts");
  new Function("module", "exports", "getSessionUser", "puedeAccederModulosOperativos", "prisma", "NextResponse", ...Object.keys(dates), compile(executable))(
    loaded, loaded.exports, async () => user, access.puedeAccederModulosOperativos,
    { sede: { findUnique: async args => { reads.push(args); return sedes.find(sede => sede.id === args.where.id) || null; } } },
    { json: (body, options) => Response.json(body, options) }, ...Object.values(dates),
  );
  return { reads, get: async params => loaded.exports.GET(new Request(`http://qa.local/api/caja/cierre-dia?${params}`)) };
}

test("la fecha inicial y el mes siguen el calendario de Bogotá incluso al cambiar de día en UTC", () => {
  const p = pageProbe({ initial: { user: null, cargando: true } });
  assert.equal(p.state.fecha, "2026-09-30"); assert.equal(p.state.fechaInicio, "2026-09-30"); assert.equal(p.state.fechaFin, "2026-09-30"); assert.equal(p.state.mes, "2026-09");
  const tree = p.render();
  assert.equal(button(tree, "Descargar PDF").props.disabled, true);
  assert.equal(button(tree, "Descargar Excel").props.disabled, true);
  assert.deepEqual(p.downloads, []);
});

test("la navegación conserva Caja activa, todos los accesos autorizados y el perfil con cierre de sesión", () => {
  for (const user of [administrator, auditor, supervisor]) {
    const p = pageProbe({ user }); const tree = p.render();
    const nodes = elements(tree), links = nodes.filter(node => node.type === "a");
    assert.ok(!nodes.some(node => node.type === "aside" && node.props["data-old-sidebar"]));
    assert.ok(nodes.some(node => node.type === "nav" && node.props["aria-label"] === "Navegación principal"));
    const cash = links.find(node => node.props.href === "/caja" && node.props["aria-current"] === "page"); assert.ok(cash, "Caja debe permanecer activa");
    const paths = new Set(links.map(node => node.props.href));
    for (const path of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones"]) assert.ok(paths.has(path), `Falta ${path}`);
    assert.equal(paths.has("/dashboard/sedes"), user !== supervisor);
    assert.ok(paths.has(user === supervisor ? "/dashboard/analitico" : "/dashboard/reportes"));
    assert.ok(normalizedText(tree).includes(user.nombre));
    assert.ok(button(tree, "Cerrar sesión"));
  }
});

test("ADMIN y AUDITOR descargan PDF y Excel con el periodo y la cobertura completos mediante solo consulta", () => {
  for (const user of [administrator, auditor]) for (const formato of ["pdf", "excel"]) {
    for (const scenario of [
      { periodoTipo: "dia", fecha: "2026-10-04", expected: { fecha: "2026-10-04" } },
      { periodoTipo: "rango", fechaInicio: "2026-09-01", fechaFin: "2026-10-24", expected: { fechaInicio: "2026-09-01", fechaFin: "2026-10-24" } },
      { periodoTipo: "mes", mes: "2026-08", expected: { mes: "2026-08" } },
    ]) {
      const p = pageProbe({ user, initial: { ...scenario, sedeId: "2" } });
      const tree = p.render(); button(tree, `Descargar ${formato === "pdf" ? "PDF" : "Excel"}`).props.onClick();
      assert.equal(p.downloads.length, 1);
      const url = new URL(p.downloads[0].url, "http://qa.local");
      assert.equal(url.pathname, "/api/caja/cierre-dia");
      assert.deepEqual(Object.fromEntries(url.searchParams), { formato, vista: "tabla", ...scenario.expected, sedeId: "2" });
      assert.equal(p.view.cobertura, "ONLINE DE PRUEBA");
      assert.equal(p.downloads[0].target, "_blank"); assert.equal(p.downloads[0].features, "noopener");
      assert.deepEqual(p.calls, [], "Generar una descarga no debe registrar ni modificar datos");
    }
  }
  const all = pageProbe({ initial: { sedeId: "TODAS" } }); all.view.generarCierre("excel");
  assert.equal(new URL(all.downloads[0].url, "http://qa.local").searchParams.has("sedeId"), false);
});

test("supervisor conserva cierre diario y su sede aunque el estado local contenga filtros administrativos", () => {
  const p = pageProbe({ user: supervisor, initial: { periodoTipo: "rango", fecha: "2026-10-06", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", mes: "2026-01", sedeId: "2" } });
  const tree = p.render();
  assert.equal(p.view.esAdmin, false); assert.equal(p.view.cobertura, "SEDE QA"); assert.equal(p.view.periodoActual, "2026-10-06");
  assert.equal(elements(tree).some(node => node.type === "input" && node.props.type === "month"), false);
  assert.equal(elements(tree).some(node => node.type === "select"), false);
  assert.equal(field(tree, "Cobertura por sede").props.readOnly, true);
  for (const formato of ["pdf", "excel"]) {
    p.view.generarCierre(formato);
    const params = new URL(p.downloads.at(-1).url, "http://qa.local").searchParams;
    assert.deepEqual(Object.fromEntries(params), { formato, vista: "tabla", fecha: "2026-10-06" });
  }
});

test("alternar día, rango y mes conserva los valores escritos y el resumen corresponde a la pestaña activa", () => {
  const p = pageProbe({ initial: { fecha: "2026-10-05", fechaInicio: "2026-08-10", fechaFin: "2026-08-28", mes: "2026-07" } });
  for (const label of ["Rango", "Mes completo", "Día", "Rango"]) {
    const tree = p.render(); button(tree, label).props.onClick();
    p.render();
    assert.equal(p.state.fecha, "2026-10-05"); assert.equal(p.state.fechaInicio, "2026-08-10"); assert.equal(p.state.fechaFin, "2026-08-28"); assert.equal(p.state.mes, "2026-07");
  }
  assert.equal(p.view.periodoActual, "2026-08-10 a 2026-08-28");
  field(p.render(), "Fecha inicial").props.onChange({ target: { value: "2026-08-11" } });
  p.render(); assert.equal(p.view.periodoActual, "2026-08-11 a 2026-08-28");
});

test("los campos vacíos muestran el error y no abren una descarga ni borran los demás valores", () => {
  for (const initial of [
    { periodoTipo: "dia", fecha: "" },
    { periodoTipo: "rango", fechaInicio: "", fechaFin: "2026-10-24" },
    { periodoTipo: "rango", fechaInicio: "2026-10-01", fechaFin: "" },
    { periodoTipo: "mes", mes: "" },
  ]) {
    const p = pageProbe({ initial });
    for (const formato of ["pdf", "excel"]) p.view.generarCierre(formato);
    const tree = p.render();
    assert.equal(p.downloads.length, 0); assert.ok(p.state.mensaje);
    assert.ok(elements(tree).some(node => node.props?.role === "alert"));
    for (const [name, value] of Object.entries(initial)) assert.equal(p.state[name], value);
  }
});

test("la carga inicial obtiene la sesión real y solo consulta el catálogo de sedes para ADMIN y AUDITOR", async () => {
  for (const user of [administrator, auditor, supervisor]) {
    const p = pageProbe({ user, initial: { user: null, sedes: [], cargando: true }, responses: { "/api/session": { ok: true, data: user }, "/api/sedes": { ok: true, data: sedes } } });
    await p.effects();
    assert.equal(p.state.user.nombre, user.nombre); assert.equal(p.state.cargando, false);
    assert.equal(p.calls.filter(call => call.url === "/api/sedes").length, user === supervisor ? 0 : 1);
    assert.equal(p.calls[0].url, "/api/session"); assert.equal(p.calls[0].options.cache, "no-store");
    assert.ok(!p.calls.some(call => call.options?.method && call.options.method !== "GET"));
    assert.deepEqual(p.downloads, []); p.unmount();
  }
});

test("carga, error de sesión y error de red no se presentan como un reporte generado", async () => {
  const waiting = deferred();
  const pending = pageProbe({ initial: { user: null, cargando: true }, responses: { "/api/session": () => waiting.promise } });
  await pending.effects();
  assert.equal(pending.state.cargando, true); assert.equal(button(pending.render(), "Descargar PDF").props.disabled, true);
  waiting.resolve({ ok: true, data: administrator }); await flush(); pending.render();
  assert.equal(pending.state.cargando, false); assert.deepEqual(pending.downloads, []); pending.unmount();
  for (const result of [() => { throw Error("Red QA"); }, { ok: false, status: 401, data: { error: "Sesión no autorizada QA" } }, { ok: false, status: 503, data: { error: "Servicio temporal QA" } }]) {
    const p = pageProbe({ initial: { user: null, cargando: true, fecha: "2026-10-12" }, responses: { "/api/session": result } });
    const tree = await p.effects();
    assert.equal(p.state.cargando, false); assert.equal(p.state.user, null); assert.ok(p.state.mensaje);
    assert.equal(button(tree, "Descargar PDF").props.disabled, true); assert.equal(button(tree, "Descargar Excel").props.disabled, true);
    assert.deepEqual(p.downloads, []); assert.equal(p.state.fecha, "2026-10-12"); p.unmount();
  }
});

test("el reintento recupera el catálogo de sedes sin borrar periodo, fechas o cobertura y habilita la descarga solo tras confirmar", async () => {
  let unavailable = true;
  const p = pageProbe({ initial: { user: null, sedes: [], cargando: true, fecha: "2026-10-02", fechaInicio: "2026-09-10", fechaFin: "2026-09-26", mes: "2026-08", periodoTipo: "rango", sedeId: "2" }, responses: {
    "/api/session": { ok: true, data: administrator },
    "/api/sedes": () => unavailable ? { ok: false, status: 503, data: { error: "Catálogo temporalmente no disponible QA" } } : { ok: true, data: sedes },
  } });
  let tree = await p.effects();
  assert.equal(p.state.errorCarga, true);
  assert.equal(button(tree, "Descargar PDF").props.disabled, true);
  p.view.generarCierre("pdf"); assert.deepEqual(p.downloads, []);
  const retry = button(tree, "Reintentar"); assert.ok(retry);
  unavailable = false; retry.props.onClick(); await flush(); tree = p.render();
  assert.equal(p.state.errorCarga, false); assert.equal(p.state.cargando, false);
  for (const [name, value] of Object.entries({ fecha: "2026-10-02", fechaInicio: "2026-09-10", fechaFin: "2026-09-26", mes: "2026-08", periodoTipo: "rango", sedeId: "2" })) assert.equal(p.state[name], value);
  assert.equal(button(tree, "Descargar PDF").props.disabled, false);
  button(tree, "Descargar PDF").props.onClick();
  const params = new URL(p.downloads[0].url, "http://qa.local").searchParams;
  assert.deepEqual(Object.fromEntries(params), { formato: "pdf", vista: "tabla", fechaInicio: "2026-09-10", fechaFin: "2026-09-26", sedeId: "2" });
  assert.equal(p.calls.filter(call => call.url === "/api/sedes").length, 2);
  p.unmount();
});

test("el handler de descarga también bloquea carga, sesión ausente o configuración con error sin depender del botón", () => {
  for (const initial of [{ cargando: true }, { user: null }, { errorCarga: true }]) {
    const p = pageProbe({ initial });
    for (const formato of ["pdf", "excel"]) p.view.generarCierre(formato);
    assert.deepEqual(p.downloads, []);
    const tree = p.render();
    assert.equal(button(tree, "Descargar PDF").props.disabled, true); assert.equal(button(tree, "Descargar Excel").props.disabled, true);
  }
});

test("el contenido conserva ventas, participantes, movimientos, comisiones, financieras y resumen ejecutivo", () => {
  const p = pageProbe(); const text = normalizedText(p.render());
  for (const content of ["Ventas y participantes", "Ingresos y movimientos", "Financieras", "Resumen ejecutivo", "jaladores", "cerradores", "comisiones", "egresos", "salidas", "caja"]) assert.ok(text.includes(content), `Falta ${content}`);
  assert.equal(p.downloads.length, 0); assert.ok(elements(p.render()).some(node => node.type === "a" && node.props.href === "/caja"));
});

test("el servidor conserva las fechas Bogotá y el alcance del supervisor frente a parámetros forjados", async () => {
  const p = apiScopeProbe(supervisor);
  const result = await p.get("formato=excel&vista=tabla&fecha=2026-10-06&fechaInicio=2026-01-01&fechaFin=2026-12-31&mes=2026-01&sedeId=2");
  assert.equal(result.esAdmin, false); assert.deepEqual(result.scope, { sedeId: 1 }); assert.equal(result.cobertura, "SEDE QA");
  assert.equal(result.periodo.tipo, "dia"); assert.equal(result.periodo.start.toISOString(), "2026-10-06T05:00:00.000Z"); assert.equal(result.periodo.end.toISOString(), "2026-10-07T05:00:00.000Z");
  assert.deepEqual(p.reads, []);
});

test("ADMIN y AUDITOR conservan mes completo, rango inclusivo ordenado y selección global o por sede en el servidor", async () => {
  for (const user of [administrator, auditor]) {
    const p = apiScopeProbe(user);
    const monthly = await p.get("mes=2026-02&sedeId=2&formato=pdf");
    assert.deepEqual(monthly.scope, { sedeId: 2 }); assert.equal(monthly.cobertura, "ONLINE DE PRUEBA"); assert.equal(monthly.periodo.start.toISOString(), "2026-02-01T05:00:00.000Z"); assert.equal(monthly.periodo.end.toISOString(), "2026-03-01T05:00:00.000Z");
    const ranged = await p.get("fechaInicio=2026-10-24&fechaFin=2026-10-01&formato=excel");
    assert.deepEqual(ranged.scope, {}); assert.equal(ranged.periodo.tipo, "rango"); assert.equal(ranged.periodo.start.toISOString(), "2026-10-01T05:00:00.000Z"); assert.equal(ranged.periodo.end.toISOString(), "2026-10-25T05:00:00.000Z");
  }
});

test("el servidor rechaza sesión ausente y perfiles sin permiso antes de consultar sedes", async () => {
  for (const user of [null, { ...supervisor, perfilTipo: "VENDEDOR" }]) {
    const p = apiScopeProbe(user); const response = await p.get("mes=2026-10&sedeId=2");
    assert.equal(response.status, user ? 403 : 401); assert.deepEqual(p.reads, []);
  }
});
