import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const baseline = Boolean(process.env.APPROVALS_TEST_SOURCE);
const workspacePath = process.env.APPROVALS_TEST_SOURCE || "app/dashboard/aprobaciones/workspace.tsx";
const nullComponent = { __esModule: true, default: () => null };
const css = { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };

function load(path, imports = {}, injected = {}, transform = (source) => source) {
  const output = ts.transpileModule(transform(readFileSync(join(ROOT, path), "utf8")), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "console", ...Object.keys(injected), output)((name) => {
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".module.css")) return css;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, module, module.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return module.exports;
}

const access = load("lib/access-control.ts");
const loanHelpers = load("lib/prestamos.ts");
const session = { nombre: "Ana Pérez", perfilNombre: "Operación Norte", sedeNombre: "SEDE 1", rolNombre: "ADMIN", perfilTipoLabel: "Administrador" };
const apiSession = { id: 10, sedeId: 1, sedeNombre: "SEDE 1", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const categories = ["prestamos", "pagos", "devoluciones", "ventas", "prestamos", "pagos"];
const items = categories.map((categoria, index) => ({
  id: `solicitud-${index + 1}`, categoria, titulo: `Título único ${index + 1}`, detalle: `Detalle irrepetible ${index + 1}`,
  estado: `ESTADO_${index + 1}`, fecha: `2026-10-0${index + 1}T12:00:00.000Z`,
  href: categoria === "ventas" ? "/ventas/aprobaciones" : "/prestamos", accion: categoria === "ventas" ? "Completar venta" : "Revisar solicitud",
  prioridad: categoria === "pagos" ? "alta" : "media", imei: `00000000000000${index + 1}`,
  cliente: `Cliente exclusivo ${index + 1}`, referencia: `Referencia exclusiva ${index + 1}`,
  sedeOrigen: `Origen exclusivo ${index + 1}`, sedeDestino: `Destino exclusivo ${index + 1}`,
  valor: index === 0 ? 1_234_567.89 : index === 1 ? 0 : index === 2 ? null : index * 10_000.5,
}));
const summary = { total: 6, prestamos: 2, pagos: 2, devoluciones: 1, ventas: 1, alta: 2 };
const data = { ok: true, cobertura: "Cobertura autorizada", resumen: summary, items };
const emptyData = { ok: true, cobertura: "SEDE 1", resumen: { total: 0, prestamos: 0, pagos: 0, devoluciones: 0, ventas: 0, alta: 0 }, items: [] };

function workspaceProbe({ source = workspacePath, initial = {}, user = session, response = { ok: true, data }, fetchImpl } = {}) {
  const sourceText = readFileSync(join(ROOT, source), "utf8");
  const ast = ts.createSourceFile(source, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((entry) => entry.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body, "Workspace exportado no encontrado");
  const stateNames = component.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((entry) =>
    ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === "useState"
      ? [entry.name.elements[0].name.getText(ast)] : []) : []);
  const captureNames = component.body.statements.flatMap((node) => ts.isVariableStatement(node)
    ? node.declarationList.declarations.filter((entry) => ts.isIdentifier(entry.name)).map((entry) => entry.name.text) : []);
  const lastReturn = component.body.statements.find(ts.isReturnStatement);
  assert.ok(lastReturn);
  const state = { data, cargando: false, ...initial };
  const calls = [];
  const effects = [];
  let cursor = 0;
  let captured;
  const hooks = {
    useState(value) {
      const name = stateNames[cursor++];
      assert.ok(name, "Estado inesperado");
      if (!(name in state)) state[name] = typeof value === "function" ? value() : value;
      return [state[name], (next) => { state[name] = typeof next === "function" ? next(state[name]) : next; }];
    },
    useCallback: (fn) => fn, useMemo: (fn) => fn(), useEffect: (fn) => { effects.push(fn); },
  };
  const imports = {
    react: hooks,
    "next/link": { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) },
    "next/image": nullComponent,
  };
  for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
    const name = statement.moduleSpecifier.text;
    if (name in imports || name.endsWith(".module.css")) continue;
    const mocked = { ...nullComponent };
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) mocked[entry.propertyName?.text ?? entry.name.text] = () => null;
    imports[name] = mocked;
  }
  const Workspace = load(source, imports, {
    __capture: (value) => { captured = value; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const result = fetchImpl ? await fetchImpl(url, options) : response;
      return { ok: result.ok, json: async () => result.data };
    },
  }, (text) => `${text.slice(0, lastReturn.getStart(ast))}__capture({${captureNames.join(",")}});\n${text.slice(lastReturn.getStart(ast))}`).default;
  const render = () => { cursor = 0; const tree = Workspace({ session: user }); return { tree, view: captured }; };
  render();
  return { state, calls, effects, render, get view() { return captured; } };
}

function elements(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function") return [node, ...elements(node.type(node.props))];
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  return elements(node).filter((entry) => typeof entry === "string" || typeof entry === "number").join("");
}
function control(tree, predicate) {
  const found = elements(tree).find((entry) => typeof entry === "object" && predicate(entry));
  assert.ok(found, "Control esperado no disponible");
  return found;
}

test("el resumen y los filtros conservan la consulta completa recibida, independientemente de la búsqueda", () => {
  for (const filtro of ["todos", ...new Set(categories)]) {
    for (const busqueda of ["", "  título ÚNICO 6  ", "000000000000006", "no existe"]) {
      const probe = workspaceProbe({ initial: { filtro, busqueda } });
      const expected = items.filter((item) => filtro === "todos" || item.categoria === filtro).filter((item) => !busqueda.trim()
        || [item.titulo, item.detalle, item.estado, item.imei, item.cliente, item.referencia, item.sedeOrigen, item.sedeDestino].filter(Boolean).join(" ").toLowerCase().includes(busqueda.trim().toLowerCase()));
      assert.deepEqual(probe.view.itemsFiltrados.map((item) => item.id), expected.map((item) => item.id));
      assert.deepEqual(probe.view.resumen, summary);
      assert.equal(probe.view.cobertura, data.cobertura);
      assert.equal(probe.view.items.length, 6);
    }
  }
});

test("la búsqueda encuentra título, detalle, estado, IMEI textual, cliente, referencia y ambas sedes", () => {
  for (const field of ["titulo", "detalle", "estado", "imei", "cliente", "referencia", "sedeOrigen", "sedeDestino"]) {
    const needle = items[5][field];
    const probe = workspaceProbe({ initial: { busqueda: ` ${needle.toUpperCase()} ` } });
    assert.deepEqual(probe.view.itemsFiltrados.map((item) => item.id), [items[5].id], field);
    assert.equal(probe.view.itemsFiltrados[0].imei, "000000000000006");
  }
});

test("la navegación conserva rutas y alcance de ADMIN, AUDITOR y supervisor", () => {
  for (const rolNombre of ["ADMIN", " auditor ", "SUPERVISOR"]) {
    const probe = workspaceProbe({ user: { ...session, rolNombre }, initial: { data: null } });
    const privileged = rolNombre.trim().toUpperCase() !== "SUPERVISOR";
    const routes = probe.view.navigationItems.map((item) => item.href);
    for (const route of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/dashboard/aprobaciones"]) assert.ok(routes.includes(route));
    assert.ok(routes.includes(privileged ? "/dashboard/reportes" : "/dashboard/analitico"));
    assert.equal(routes.includes("/dashboard/sedes"), privileged);
    assert.equal(probe.view.cobertura, privileged ? "Todas las sedes" : "SEDE 1");
  }
});

test("cargar y recargar usan el endpoint original sin caché, reemplazan datos y conservan filtros", async () => {
  const probe = workspaceProbe({ initial: { data: null, filtro: "pagos", busqueda: "IMEI anterior" } });
  assert.ok(probe.effects.length > 0, "La carga inicial debe programarse al montar");
  await probe.view.cargarBandeja();
  assert.deepEqual(probe.calls, [{ url: "/api/dashboard/aprobaciones", options: { cache: "no-store" } }]);
  assert.deepEqual(probe.state.data, data);
  assert.equal(probe.state.cargando, false);
  assert.equal(probe.state.mensaje, "");
  assert.equal(probe.state.filtro, "pagos");
  assert.equal(probe.state.busqueda, "IMEI anterior");
  probe.render();
  await probe.view.cargarBandeja();
  assert.equal(probe.calls.length, 2);
  assert.ok(probe.calls.every((call) => call.url === "/api/dashboard/aprobaciones" && call.options.cache === "no-store"));
});

test("un fallo HTTP o de red descarta datos obsoletos y conserva el error para reintentar", async () => {
  for (const options of [
    { response: { ok: false, data: { error: "Sesión caducada" } }, message: "Sesión caducada" },
    { response: { ok: false, data: {} }, message: "No se pudo cargar la bandeja" },
    { fetchImpl: async () => { throw new Error("Sin red"); }, message: "Error cargando la bandeja de aprobaciones" },
  ]) {
    const probe = workspaceProbe(options);
    await probe.view.cargarBandeja();
    assert.equal(probe.state.data, null);
    assert.equal(probe.state.cargando, false);
    assert.equal(probe.state.mensaje, options.message);
  }
});

test("los datos, prioridad, IMEI, valores decimales y enlaces de gestión siguen visibles por solicitud", () => {
  const tree = workspaceProbe().render().tree;
  const text = textOf(tree);
  for (const item of items) {
    for (const field of ["titulo", "detalle", "imei", "cliente", "referencia", "estado", "sedeOrigen", "sedeDestino"]) assert.ok(text.includes(item[field]), `Dato perdido: ${field} de ${item.id}`);
    assert.ok(elements(tree).some((node) => node?.type === "a" && node.props.href === item.href && textOf(node).includes(item.accion)));
  }
  assert.ok(text.includes("1.234.567,89"));
  assert.ok(text.includes("$ 0"));
  assert.ok(text.includes("Sin valor asociado"));
  assert.ok(text.includes("Prioridad alta"));
});

test("pestañas con contadores y buscador actúan sobre los registros sin cambiar los totales", { skip: baseline }, () => {
  const probe = workspaceProbe();
  let tree = probe.render().tree;
  const tabs = control(tree, (node) => node.props?.["aria-label"] === "Filtrar aprobaciones");
  const paymentTab = control(tabs, (node) => node.props?.role === "tab" && textOf(node).startsWith("Pagos"));
  assert.ok(textOf(paymentTab).includes("2"));
  paymentTab.props.onClick();
  tree = probe.render().tree;
  assert.equal(probe.state.filtro, "pagos");
  assert.equal(control(tree, (node) => node.props?.role === "tab" && textOf(node).startsWith("Pagos")).props["aria-selected"], true);
  assert.deepEqual(probe.view.itemsFiltrados.map((item) => item.id), ["solicitud-2", "solicitud-6"]);
  const search = control(tree, (node) => node.props?.["aria-label"] === "Buscar aprobaciones");
  search.props.onChange({ target: { value: "000000000000006" } });
  probe.render();
  assert.deepEqual(probe.view.itemsFiltrados.map((item) => item.id), ["solicitud-6"]);
  assert.equal(probe.view.resumen.total, 6);
});

test("vacío real muestra la sede y permite actualizar; una búsqueda sin coincidencias solo ofrece limpiar filtros", { skip: baseline }, async () => {
  const empty = workspaceProbe({ initial: { data: emptyData }, response: { ok: true, data } });
  let tree = empty.render().tree;
  assert.ok(textOf(tree).includes("No tienes aprobaciones pendientes"));
  assert.ok(textOf(tree).includes("SEDE 1"));
  control(tree, (node) => node.type === "button" && textOf(node) === "Actualizar bandeja").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(empty.calls.length, 1);
  assert.equal(empty.state.data.items.length, 6);
  for (const initial of [{ busqueda: "No coincide" }, { filtro: "ventas", data: { ...data, items: items.filter((item) => item.categoria !== "ventas") } }]) {
    const filtered = workspaceProbe({ initial });
    tree = filtered.render().tree;
    assert.ok(textOf(tree).includes("No hay solicitudes en esta vista"));
    assert.ok(!textOf(tree).includes("No tienes aprobaciones pendientes"));
    control(tree, (node) => node.type === "button" && textOf(node) === "Limpiar filtros").props.onClick();
    assert.equal(filtered.state.busqueda, "");
    assert.equal(filtered.state.filtro, "todos");
  }
});

test("carga inicial y errores no presentan un éxito vacío ni ceros como datos consultados", { skip: baseline }, () => {
  const assertUnknownCounts = (tree) => {
    const metrics = control(tree, (node) => node.props?.["aria-label"] === "Resumen de aprobaciones");
    const values = elements(metrics).filter((node) => node?.type === "strong").map(textOf);
    assert.deepEqual(values, ["—", "—", "—", "—", "—"], "Ninguno de los cinco indicadores puede aparentar un cero consultado sin datos");
    const tabs = control(tree, (node) => node.props?.["aria-label"] === "Filtrar aprobaciones");
    const tabNodes = elements(tabs).filter((node) => node.props?.role === "tab");
    assert.equal(tabNodes.length, 5);
    assert.ok(tabNodes.every((node) => textOf(node).endsWith("—")), "Los cinco contadores de pestaña también quedan sin datos");
  };
  const pending = workspaceProbe({ initial: { data: null, cargando: true } });
  let tree = pending.render().tree;
  assert.ok(elements(tree).some((node) => node.props?.role === "status" && (node.props["aria-label"] === "Cargando aprobaciones" || textOf(node).includes("Cargando aprobaciones"))));
  assert.ok(!textOf(tree).includes("No tienes aprobaciones pendientes"));
  assert.ok(!textOf(tree).includes("No hay solicitudes en esta vista"));
  assertUnknownCounts(tree);
  assert.ok(!elements(tree).some((node) => node.type === "button" && textOf(node) === "Actualizar bandeja"));
  const failed = workspaceProbe({ initial: { data: null, cargando: false, mensaje: "Sesión caducada" } });
  tree = failed.render().tree;
  const alert = control(tree, (node) => node.props?.role === "alert");
  assert.ok(textOf(alert).includes("Sesión caducada"));
  assert.ok(elements(tree).some((node) => node.type === "button" && textOf(node) === "Reintentar"));
  assert.ok(!textOf(tree).includes("No tienes aprobaciones pendientes"));
  assert.ok(!textOf(tree).includes("No hay solicitudes en esta vista"));
  assertUnknownCounts(tree);
});

test("Actualizar activa carga hasta recibir respuesta y un reintento recupera la consulta", { skip: baseline }, async () => {
  let resolveResponse;
  const pendingResponse = new Promise((resolve) => { resolveResponse = resolve; });
  const probe = workspaceProbe({ initial: { data: null, mensaje: "Error anterior" }, fetchImpl: () => pendingResponse });
  const request = probe.view.cargarBandeja();
  assert.equal(probe.state.cargando, true);
  assert.equal(probe.state.mensaje, "");
  const tree = probe.render().tree;
  const update = control(tree, (node) => node.type === "button" && /Actualizando/.test(textOf(node)));
  assert.equal(update.props.disabled, true);
  assert.ok(!textOf(tree).includes("No tienes aprobaciones pendientes"));
  resolveResponse({ ok: true, data });
  await request;
  assert.equal(probe.state.cargando, false);
  assert.deepEqual(probe.state.data.resumen, summary);
  assert.equal(probe.state.mensaje, "");
});

const date = (day) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`);
const loanRows = [
  { id: 1, estado: "PENDIENTE", sedeOrigenId: 1, sedeDestinoId: 2, costo: 120_000.25, createdAt: date(1), updatedAt: date(2) },
  { id: 2, estado: "PAGO_PENDIENTE_APROBACION", sedeOrigenId: 1, sedeDestinoId: 2, costo: 500_000, montoPago: 234_567.89, fechaSolicitudPago: date(5), createdAt: date(2), updatedAt: date(3) },
  { id: 3, estado: "DEVOLUCION_PENDIENTE", sedeOrigenId: 2, sedeDestinoId: 3, costo: 333_000.5, createdAt: date(3), updatedAt: date(4) },
  { id: 4, estado: "APROBADO", sedeOrigenId: 1, sedeDestinoId: 2, costo: 444_000, createdAt: date(4), updatedAt: date(5) },
  { id: 5, estado: "PENDIENTE", sedeOrigenId: 8, sedeDestinoId: 9, costo: 555_000, createdAt: date(5), updatedAt: date(6) },
  { id: 6, estado: "PAGO_PENDIENTE_APROBACION", sedeOrigenId: 3, sedeDestinoId: 1, costo: 345_678.75, montoPago: 0, createdAt: date(6), updatedAt: date(7) },
].map((row) => ({ ...row, imei: `00000000000000${row.id}`, referencia: `Referencia ${row.id}` }));
const saleRows = [
  { id: 11, sedeId: 1, puntoVenta: "SEDE 1", estadoVentaRegistro: "PENDIENTE", creditoAutorizado: "987654.32", createdAt: date(9) },
  { id: 12, sedeId: 2, puntoVenta: "SEDE 2", estadoVentaRegistro: "PENDIENTE", creditoAutorizado: 0, createdAt: date(8) },
  { id: 13, sedeId: 1, puntoVenta: "SEDE 1", estadoVentaRegistro: "CONVERTIDO_EN_VENTA", createdAt: date(7) },
  { id: 14, sedeId: 1, puntoVenta: "SEDE 1", estadoVentaRegistro: "CANCELADO", createdAt: date(6) },
  { id: 15, sedeId: 1, puntoVenta: "SEDE 1", estadoVentaRegistro: "PENDIENTE", ventaIdRelacionada: 55, createdAt: date(5) },
  { id: 16, sedeId: 1, puntoVenta: "SEDE 1", estadoVentaRegistro: "PENDIENTE", eliminadoEn: date(6), createdAt: date(4) },
  { id: 17, sedeId: null, puntoVenta: "sede 1", estadoVentaRegistro: null, creditoAutorizado: null, createdAt: date(3) },
].map((row) => ({ eliminadoEn: null, ventaIdRelacionada: null, clienteNombre: `Cliente ${row.id}`, asesorNombre: `Asesor ${row.id}`, referenciaEquipo: `Equipo ${row.id}`, serialImei: `0000000000000${row.id}`, ...row }));
const sites = [1, 2, 3, 8, 9].map((id) => ({ id, nombre: `SEDE ${id}` }));

function matches(record, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((condition) => matches(record, condition));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(record[key]);
      if ("equals" in value) return value.mode === "insensitive"
        ? String(record[key]).toLowerCase() === String(value.equals).toLowerCase() : record[key] === value.equals;
    }
    return record[key] === value;
  });
}

function apiProbe(user = apiSession, { failQuery = false, loans = loanRows, sales = saleRows } = {}) {
  const calls = [];
  const query = (name, rows) => async (args) => {
    calls.push({ name, args });
    if (failQuery) throw new Error("Fallo de base de datos");
    const result = rows.filter((record) => matches(record, args.where));
    if (args.orderBy) {
      const [field, direction] = Object.entries(args.orderBy)[0];
      result.sort((a, b) => (new Date(a[field]) - new Date(b[field])) * (direction === "desc" ? -1 : 1));
    }
    return result.slice(0, args.take ?? result.length);
  };
  const route = load("app/api/dashboard/aprobaciones/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status ?? 200 }) } },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/prisma": { __esModule: true, default: { prestamoSede: { findMany: query("loans", loans) }, sede: { findMany: query("sites", sites) }, registroVendedorVenta: { findMany: query("sales", sales) } } },
    "@/lib/access-control": access,
    "@/lib/prestamos": loanHelpers,
  });
  return { ...route, calls };
}

test("el servidor rechaza usuarios sin sesión y perfiles sin acceso antes de consultar datos", async () => {
  for (const user of [null, ...["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"].map((perfilTipo) => ({ ...apiSession, perfilTipo }))]) {
    const probe = apiProbe(user);
    const response = await probe.GET();
    assert.equal(response.status, user ? 403 : 401);
    assert.equal(probe.calls.length, 0);
    assert.ok((await response.json()).error);
  }
});

test("ADMIN y AUDITOR reciben todas las sedes; un supervisor solo consulta solicitudes donde participa su sede", async () => {
  for (const user of [apiSession, { ...apiSession, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }, { ...apiSession, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" }]) {
    const probe = apiProbe(user);
    const response = await probe.GET();
    assert.equal(response.status, 200);
    const body = await response.json();
    const privileged = user.rolNombre !== "SUPERVISOR";
    assert.equal(body.cobertura, privileged ? "Todas las sedes" : "SEDE 1");
    assert.equal(body.items.some((item) => item.id === "prestamo-5"), privileged);
    assert.equal(body.items.some((item) => item.id === "prestamo-devolucion-3"), privileged);
    assert.equal(body.items.some((item) => item.id === "venta-registro-12"), privileged);
    assert.ok(body.items.some((item) => item.id === "venta-registro-17"), "Conserva la compatibilidad de sede por puntoVenta sin distinguir mayúsculas");
    const loansQuery = probe.calls.find((call) => call.name === "loans").args;
    const salesQuery = probe.calls.find((call) => call.name === "sales").args;
    assert.deepEqual(loansQuery.where.estado.in, ["PENDIENTE", "PAGO_PENDIENTE_APROBACION", "DEVOLUCION_PENDIENTE"]);
    assert.equal(loansQuery.take, 120);
    assert.equal(salesQuery.take, 100);
    if (privileged) {
      assert.equal("OR" in loansQuery.where, false);
      assert.equal("OR" in salesQuery.where, false);
    } else {
      assert.deepEqual(loansQuery.where.OR, [{ sedeOrigenId: 1 }, { sedeDestinoId: 1 }]);
      assert.deepEqual(salesQuery.where.OR, [{ sedeId: 1 }, { puntoVenta: { equals: "SEDE 1", mode: "insensitive" } }]);
      assert.deepEqual(body.items.map((item) => item.id).sort(), ["prestamo-1", "prestamo-pago-2", "prestamo-pago-6", "venta-registro-11", "venta-registro-17"].sort());
    }
  }
});

test("categorías, resumen, orden, rutas y montos conservan los criterios reales de la bandeja", async () => {
  const body = await (await apiProbe().GET()).json();
  assert.deepEqual(body.resumen, { total: 8, prestamos: 2, pagos: 2, devoluciones: 1, ventas: 3, alta: 2 });
  assert.equal(body.resumen.total, Object.values(body.resumen).slice(1, 5).reduce((sum, count) => sum + count, 0));
  assert.ok(body.items.every((item, index) => index === 0 || new Date(body.items[index - 1].fecha) >= new Date(item.fecha)));
  for (const item of body.items) assert.equal(item.href, item.categoria === "ventas" ? "/ventas/aprobaciones" : "/prestamos");
  const byId = (id) => body.items.find((item) => item.id === id);
  assert.equal(byId("prestamo-1").valor, 120_000.25);
  assert.equal(byId("prestamo-1").imei, "000000000000001");
  assert.equal(byId("prestamo-pago-2").valor, 234_567.89);
  assert.equal(byId("prestamo-pago-2").fecha, date(5).toISOString());
  assert.equal(byId("prestamo-pago-6").valor, 345_678.75, "Conserva el respaldo al costo cuando montoPago es cero");
  assert.equal(byId("prestamo-devolucion-3").valor, 333_000.5);
  assert.equal(byId("venta-registro-11").valor, 987_654.32);
  assert.equal(byId("venta-registro-12").valor, null);
  assert.ok(!body.items.some((item) => ["prestamo-4", "venta-registro-13", "venta-registro-14", "venta-registro-15", "venta-registro-16"].includes(item.id)));
});

test("los textos de acción por origen y destino conservan la gestión en el módulo responsable", async () => {
  const body = await (await apiProbe({ ...apiSession, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" }).GET()).json();
  const byId = (id) => body.items.find((item) => item.id === id);
  assert.equal(byId("prestamo-1").accion, "Revisar solicitud");
  assert.equal(byId("prestamo-pago-2").accion, "Aprobar pago");
  assert.equal(byId("prestamo-pago-6").accion, "Revisar pago");
  assert.equal(byId("venta-registro-11").accion, "Completar venta");
  const destination = await (await apiProbe({ ...apiSession, sedeId: 2, sedeNombre: "SEDE 2", rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" }).GET()).json();
  assert.equal(destination.items.find((item) => item.id === "prestamo-1").accion, "Aprobar o rechazar");
  assert.equal(destination.items.find((item) => item.id === "prestamo-devolucion-3").accion, "Aprobar devolucion");
});

test("consulta vacía y fallo del servidor permanecen diferenciados", async () => {
  const empty = await apiProbe(apiSession, { loans: [], sales: [] }).GET();
  assert.equal(empty.status, 200);
  const body = await empty.json();
  assert.deepEqual(body.items, []);
  assert.deepEqual(body.resumen, emptyData.resumen);
  const failed = await apiProbe(apiSession, { failQuery: true }).GET();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "Error cargando la bandeja de aprobaciones" });
});
