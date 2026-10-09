import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsxRuntime = require("react/jsx-runtime");
const baseline = Boolean(process.env.LOANS_DASHBOARD_TEST_SOURCE);
const nullComponent = { __esModule: true, default: () => null };
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
function load(path, imports = {}, injected = {}, transform = (source) => source) {
  const output = ts.transpileModule(transform(readFileSync(join(ROOT, path), "utf8")), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", "console", ...Object.keys(injected), output)((name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".module.css")) return css;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, testModule, testModule.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return testModule.exports;
}

const loanHelpers = load("lib/prestamos.ts");
const loanView = load("lib/loans-dashboard-view.ts");
const access = load("lib/access-control.ts");
const sedeHelpers = load("lib/sedes.ts");
const session = { id: 10, nombre: "Ana Pérez", usuario: "ana", sedeId: 2, sedeNombre: "SEDE 2", rolId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const statuses = ["APROBADO", "APROBADO", "PENDIENTE", "DEVOLUCION_PENDIENTE", "PAGO_PENDIENTE_APROBACION", "PAGO_PENDIENTE_APROBACION", "PAGO_PENDIENTE_APROBACION", "PAGADO", "RECHAZADO", "CANCELADO", "DEVUELTO", "FINALIZADO"];
const loans = Array.from({ length: 25 }, (_, index) => {
  const id = index + 1;
  return {
    id, imei: String(1000 + id).padStart(15, "0"), referencia: `Equipo ${id}`, color: id % 2 ? "NEGRO" : "ROJO",
    costo: id === 1 ? 100.25 : id === 2 ? 200.5 : id * 100.5,
    sedeOrigenId: id === 2 ? 99 : id > 12 && id % 3 === 0 ? 3 : 1,
    sedeDestinoId: id > 12 && id % 4 === 0 ? 4 : 2,
    // Deliberately identical display names: recipient identity must use IDs.
    sedeOrigenNombre: id === 2 ? "BODEGA PRINCIPAL" : "Sede con nombre parecido", sedeDestinoNombre: "Sede con nombre parecido",
    estado: statuses[index] ?? "APROBADO", requiereAprobacionEntreSedes: id !== 2,
    prestamoDesdePrincipal: id === 2, estadoActualActual: "BODEGA", estadoFinancieroActual: "DEUDA", deboAActual: "SEDE 1",
    montoPago: id === 5 ? 444.75 : id === 6 ? 0 : null,
    fechaSolicitudPago: [5, 6, 7].includes(id) ? `2026-10-08T12:${id === 5 ? "00" : id === 6 ? "04" : "10"}:00.000Z` : null,
  };
});

function pageProbe(initial = {}, responses = {}) {
  const path = process.env.LOANS_DASHBOARD_TEST_SOURCE || "app/prestamos/page.tsx";
  const source = readFileSync(join(ROOT, path), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(page?.body);
  const stateNames = page.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((entry) =>
    ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === "useState"
      ? [entry.name.elements[0].name.getText(ast)] : []) : []);
  const captureNames = page.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.filter((entry) => ts.isIdentifier(entry.name)).map((entry) => entry.name.text) : []);
  const lastReturn = page.body.statements.find((node) => ts.isReturnStatement(node));
  assert.ok(lastReturn);
  const state = { user: session, prestamos: loans, sedes: [{ id: 1, nombre: "SEDE 1" }, { id: 2, nombre: "SEDE 2" }, { id: 3, nombre: "SEDE 3" }, { id: 4, nombre: "SEDE 4" }, { id: 99, nombre: "BODEGA PRINCIPAL" }], cargandoListado: false, ...initial };
  const calls = [];
  let cursor = 0;
  let refCursor = 0;
  const refs = [];
  let captured;
  const hooks = {
    useState(value) {
      const name = stateNames[cursor++];
      assert.ok(name, "Estado del componente inesperado");
      if (!(name in state)) state[name] = typeof value === "function" ? value() : value;
      return [state[name], (next) => { state[name] = typeof next === "function" ? next(state[name]) : next; }];
    },
    Fragment: Symbol.for("react.fragment"),
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect() {},
    useRef: (value) => refs[refCursor++] ??= { current: value },
  };
  const imports = {
    react: hooks, "next/link": { __esModule: true, default: ({ children, ...props }) => jsxRuntime.jsx("a", { ...props, children }) },
    "next/image": nullComponent, "./_components/loan-dialog": nullComponent,
    "@/lib/use-live-refresh": { useLiveRefresh() {} }, "@/lib/loans-dashboard-view": loanView,
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => null },
    "@/app/dashboard/_components/dashboard-icon": nullComponent,
    "@/app/dashboard/_components/logout-button": nullComponent,
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/app/prestamos/_components/loans-dashboard-parts": {}, "./_components/loans-dashboard-parts": {},
  };
  // Child components need not execute to test the page's real data, callbacks and permissions.
  for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
    const name = statement.moduleSpecifier.text;
    if (!name.includes("loans-dashboard-parts")) continue;
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) imports[name] = Object.fromEntries(named.elements.map((entry) => [entry.propertyName?.text ?? entry.name.text, () => null]));
  }
  const Page = load(path, imports, {
    __capture: (value) => { captured = value; },
    window: { confirm: () => true },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const configured = responses[url];
      const response = typeof configured === "function" ? await configured(url, options) : configured ?? { ok: true, data: url.startsWith("/api/prestamos?") || url === "/api/prestamos" ? loans : { ok: true } };
      return { ok: response.ok, json: async () => response.data };
    },
  }, (text) => `${text.slice(0, lastReturn.getStart(ast))}__capture({${captureNames.join(",")}});\n${text.slice(lastReturn.getStart(ast))}`).default;
  const render = () => { cursor = 0; refCursor = 0; const tree = Page(); return { tree, view: captured }; };
  render();
  return { state, calls, render, get view() { return captured; } };
}

test("los siete indicadores mantienen las fórmulas y los importes completos de la cobertura recibida", () => {
  const view = pageProbe().view;
  assert.equal(view.totalPrestamos, 25);
  assert.equal(view.totalDesdePrincipal, 1);
  assert.equal(view.totalEntreSedes, 24);
  assert.equal(view.totalPendientes, 1);
  assert.equal(view.totalPagoPendiente, 3);
  assert.equal(view.totalFinalizados, 5);
  assert.equal(view.valorTotalPrestamos, 32_661.75);
  assert.equal(view.prestamosSeleccionablesPago.length, 14);
});

test("cambiar cobertura modifica la consulta del servidor; un supervisor no puede enviar un filtro de otra sede", async () => {
  const admin = pageProbe({ sedeFiltroId: "3" });
  await admin.view.cargarPrestamos();
  assert.ok(admin.calls.some((call) => call.url === "/api/prestamos?sedeId=3"));
  const supervisor = pageProbe({ sedeFiltroId: "3", user: { ...session, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" } });
  await supervisor.view.cargarPrestamos();
  assert.ok(supervisor.calls.some((call) => call.url === "/api/prestamos"));
  assert.ok(!supervisor.calls.some((call) => call.url.includes("sedeId")));
});

test("elegibilidad de pago respeta estado, deuda entre sedes y permiso del destinatario", () => {
  for (const role of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    for (const site of [1, 2, 77]) {
      const view = pageProbe({ user: { ...session, rolNombre: role, sedeId: site } }).view;
      for (const estado of [...new Set(statuses)]) {
        for (const requiereAprobacionEntreSedes of [true, false]) {
          assert.equal(view.puedeSolicitarPago({ ...loans[0], estado, requiereAprobacionEntreSedes }), estado === "APROBADO" && requiereAprobacionEntreSedes && (role !== "SUPERVISOR" || site === 2));
        }
      }
    }
  }
  assert.equal(pageProbe({ user: null }).view.puedeSolicitarPago(loans[0]), false);
});

test("aprobación, devolución, rechazo y cancelación conservan sus permisos por origen, destino y estado", () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    for (const sedeId of [1, 2, 77]) {
      const view = pageProbe({ user: { ...session, rolNombre, sedeId } }).view;
      const privileged = rolNombre !== "SUPERVISOR";
      for (const estado of [...new Set(statuses)]) {
        const loan = { ...loans[0], estado };
        assert.equal(view.puedeAprobarPrestamo(loan), estado === "PENDIENTE" && (privileged || sedeId === 2));
        assert.equal(view.puedeRechazarPrestamo(loan), estado === "PENDIENTE" && (privileged || sedeId === 2));
        assert.equal(view.puedeCancelarPrestamo(loan), estado === "PENDIENTE" && (privileged || sedeId === 1));
        assert.equal(view.puedeAprobarPago(loan), estado === "PAGO_PENDIENTE_APROBACION" && (privileged || sedeId === 1));
        assert.equal(view.puedeAprobarDevolucion(loan), estado === "DEVOLUCION_PENDIENTE" && (privileged || sedeId === 1));
        assert.equal(view.puedeRechazarDevolucion(loan), estado === "DEVOLUCION_PENDIENTE" && (privileged || sedeId === 1));
        for (const estadoActualActual of ["BODEGA", "VENDIDO", "GARANTIA"]) {
          for (const prestamoDesdePrincipal of [true, false]) {
            assert.equal(view.puedeSolicitarDevolucion({ ...loan, estadoActualActual, prestamoDesdePrincipal }), estado === "APROBADO" && estadoActualActual === "BODEGA" && !prestamoDesdePrincipal && (privileged || sedeId === 2));
          }
        }
      }
    }
  }
});

test("búsqueda consulta todos los préstamos, conserva IMEI como texto y filtros por estado", () => {
  assert.deepEqual(pageProbe({ busqueda: loans[24].imei }).view.prestamosFiltrados.map((item) => item.id), [25]);
  assert.deepEqual(pageProbe({ busqueda: "Equipo 25" }).view.prestamosFiltrados.map((item) => item.id), [25]);
  assert.equal(pageProbe({ filtroEstado: "PAGO_PENDIENTE_APROBACION" }).view.prestamosFiltrados.length, 3);
  assert.equal(pageProbe({ busqueda: "BODEGA PRINCIPAL" }).view.prestamosFiltrados.length, 1);
  assert.equal(pageProbe({ busqueda: "sin coincidencias" }).view.prestamosFiltrados.length, 0);
});

test("selección excluye préstamos no elegibles y agrupa por IDs de origen y destino", () => {
  const view = pageProbe({ idsSolicitudPago: [1, 2, 3, 13, 15, 16, 999] }).view;
  assert.deepEqual(view.prestamosSolicitudPagoSeleccionados.map((item) => item.id), [1, 13, 15, 16]);
  assert.equal(view.totalSolicitudPagoSeleccionada, 4_522.25);
  assert.deepEqual(view.lotesConSeleccionPago.map((lote) => lote.key).sort(), ["1:2", "1:4", "3:2"]);
  assert.equal(view.lotesConSeleccionPago.reduce((sum, lote) => sum + lote.totalSeleccionado, 0), view.totalSolicitudPagoSeleccionada);
});

test("agrupación para aprobar conserva ventana de cinco minutos y el monto solicitado", () => {
  const view = pageProbe().view;
  assert.equal(view.lotesPagoPendiente.length, 2);
  const grouped = view.lotesPagoPendiente.find((lote) => lote.items.length === 2);
  assert.deepEqual(grouped.items.map((item) => item.id), [5, 6]);
  assert.equal(grouped.total, 1_047.75);
  const supervisor = pageProbe({ user: { ...session, sedeId: 2, rolNombre: "SUPERVISOR" } });
  assert.equal(supervisor.view.lotesPagoPendiente.length, 0);
});

test("cada acción conservada llama su endpoint y vuelve a cargar la lista", async () => {
  const routes = {
    solicitarDevolucionPrestamo: "solicitar-devolucion", aprobarDevolucionPrestamo: "devolver", rechazarDevolucionPrestamo: "rechazar-devolucion",
    solicitarPagoPrestamo: "solicitar-pago", aprobarPagoPrestamo: "aprobar-pago", aprobarPrestamo: "aprobar",
  };
  for (const [name, route] of Object.entries(routes)) {
    const probe = pageProbe();
    await probe.view[name](1);
    const call = probe.calls.find((entry) => entry.url === `/api/prestamos/${route}`);
    assert.ok(call, name);
    assert.equal(call.options.method, "POST");
    assert.deepEqual(JSON.parse(call.options.body), { id: 1 });
    assert.ok(probe.calls.some((entry) => entry.url === "/api/prestamos"));
    assert.equal(probe.state.cargando, false);
  }
  const cancelled = pageProbe();
  await cancelled.view.cerrarPrestamoPendiente(3, "CANCELADO");
  assert.deepEqual(JSON.parse(cancelled.calls[0].options.body), { id: 3, accion: "CANCELADO" });
});

test("un fallo de pago conserva la selección para corregir o reintentar", async () => {
  const probe = pageProbe({ idsSolicitudPago: [1] }, { "/api/prestamos/solicitar-pago-lote": { ok: false, data: { error: "Error: préstamo ya cambió de estado" } } });
  await probe.view.solicitarPagoPrestamoLote([1]);
  assert.deepEqual(probe.state.idsSolicitudPago, [1]);
  assert.match(probe.state.mensaje, /cambió de estado/);
  assert.equal(probe.state.cargando, false);
});

test("enviar a pagar conserva IDs textuales exactos en el detalle y libera selección después del éxito", async () => {
  const probe = pageProbe({ idsSolicitudPago: [1, 13] });
  await probe.view.solicitarPagoPrestamoLote([1, 13]);
  const call = probe.calls.find((entry) => entry.url === "/api/prestamos/solicitar-pago-lote");
  assert.deepEqual(JSON.parse(call.options.body), { prestamoIds: [1, 13] });
  assert.deepEqual(probe.state.idsSolicitudPago, []);
});

test("pestañas incluyen todos los estados actuales sin crear estados nuevos", { skip: baseline }, () => {
  const expected = {
    Todos: [...new Set(statuses)], Pendientes: ["PENDIENTE"], Aprobados: ["APROBADO"],
    Pagos: ["PAGO_PENDIENTE_APROBACION", "PAGADO"], Devoluciones: ["DEVOLUCION_PENDIENTE", "DEVUELTO"],
    Finalizados: ["PAGADO", "RECHAZADO", "CANCELADO", "DEVUELTO", "FINALIZADO"],
  };
  for (const [tab, states] of Object.entries(expected)) {
    assert.deepEqual([...new Set(statuses)].filter((estado) => loanView.prestamoEnPestana(estado, tab)), states);
  }
  assert.equal(loanView.textoEstadoPrestamo("PAGO_PENDIENTE_APROBACION"), "Pago por aprobar");
  assert.equal(loanView.textoEstadoPrestamo("ESTADO_FUTURO"), "ESTADO_FUTURO");
});

test("paginación maneja cero resultados, última página y una lista compacta sin posiciones inexistentes", { skip: baseline }, () => {
  assert.equal(loanView.paginasPrestamos(0, 10), 1);
  assert.equal(loanView.paginasPrestamos(25, 10), 3);
  assert.deepEqual(loanView.numerosPaginaPrestamos(1, 1), [1]);
  assert.deepEqual(loanView.numerosPaginaPrestamos(50, 100), [1, 49, 50, 51, 100]);
  assert.deepEqual(loanView.numerosPaginaPrestamos(100, 100), [1, 99, 100]);
});

function elements(node) {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object") return [node];
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  return elements(node).filter((value) => typeof value === "string" || typeof value === "number").join("");
}
function control(tree, predicate) {
  const found = elements(tree).find((node) => typeof node === "object" && predicate(node));
  assert.ok(found, "Control esperado no disponible");
  return found;
}

test("seleccionar visibles afecta solo la página actual y conserva selección al navegar", { skip: baseline }, () => {
  const probe = pageProbe();
  assert.deepEqual(probe.view.prestamosPagina.map((loan) => loan.id), [1, 2, 3, 4, 5]);
  probe.view.seleccionarPagina();
  assert.deepEqual(probe.state.idsSolicitudPago, [1]);
  control(probe.render().tree, (node) => node.props?.["aria-label"] === "Página siguiente").props.onClick();
  control(probe.render().tree, (node) => node.props?.["aria-label"] === "Página siguiente").props.onClick();
  probe.render();
  assert.deepEqual(probe.view.prestamosPagina.map((loan) => loan.id), [11, 12, 13, 14, 15]);
  assert.deepEqual(probe.state.idsSolicitudPago, [1]);
  probe.view.seleccionarPagina();
  assert.deepEqual(probe.state.idsSolicitudPago, [1, 13, 14, 15]);
  probe.render();
  assert.equal(probe.view.prestamosSolicitudPagoSeleccionados.length, 4);
  assert.equal(probe.view.totalSolicitudPagoSeleccionada, 4_321.25);
  assert.equal(probe.view.todosPagablesPaginaSeleccionados, true);
  probe.view.seleccionarPagina();
  assert.deepEqual(probe.state.idsSolicitudPago, [1]);
});

// Reproduces the reported screen: the first five records cannot be paid, while
// 119 eligible records exist on later pages of the same authorized query.
const loansWithPayablesAfterFirstPage = Array.from({ length: 124 }, (_, index) => {
  const id = index + 1;
  return {
    ...loans[0], id, referencia: `Equipo ${id}`, imei: String(5000 + id).padStart(15, "0"),
    costo: id * 100.25, estado: ["FINALIZADO", "APROBADO", "PENDIENTE", "PAGO_PENDIENTE_APROBACION", "DEVUELTO"][index] ?? "APROBADO",
    prestamoDesdePrincipal: id === 2, requiereAprobacionEntreSedes: id !== 2,
    sedeOrigenId: id === 2 ? 99 : id % 2 ? 1 : 3, sedeDestinoId: 2,
    sedeOrigenNombre: id === 2 ? "BODEGA PRINCIPAL" : `SEDE ${id % 2 ? 1 : 3}`,
    sedeDestinoNombre: "SEDE 2", fechaSolicitudPago: null,
  };
});

test("119 disponibles siguen seleccionables aunque ningún préstamo de la página sea pagable", { skip: baseline }, () => {
  const probe = pageProbe({ prestamos: loansWithPayablesAfterFirstPage });
  const expected = loansWithPayablesAfterFirstPage.slice(5);
  assert.equal(probe.view.prestamosSeleccionablesPago.length, 119);
  assert.equal(probe.view.pagablesPagina.length, 0);
  let tree = probe.render().tree;
  const bar = control(tree, (node) => node.props?.["aria-label"] === "Pago por lote");
  const allAvailable = control(bar, (node) => node.type === "input" && node.props?.type === "checkbox");
  assert.equal(allAvailable.props.disabled, false);
  assert.equal(control(tree, (node) => node.props?.["aria-label"] === "Seleccionar préstamos pagables visibles").props.disabled, true);
  for (const loan of loansWithPayablesAfterFirstPage.slice(0, 5)) {
    assert.equal(control(tree, (node) => node.props?.["aria-label"] === `Seleccionar préstamo ${loan.id}`).props.disabled, true);
  }
  const visibleButton = control(bar, (node) => node.type === "button" && textOf(node) === "Seleccionar visibles");
  assert.equal(visibleButton.props.disabled, true);
  allAvailable.props.onChange();
  tree = probe.render().tree;
  assert.deepEqual(probe.state.idsSolicitudPago, expected.map((loan) => loan.id));
  assert.equal(probe.view.totalSolicitudPagoSeleccionada, expected.reduce((sum, loan) => sum + loan.costo, 0));
  assert.equal(probe.view.lotesConSeleccionPago.length, 2);
  assert.equal(probe.view.lotesConSeleccionPago.reduce((sum, group) => sum + group.totalSeleccionado, 0), probe.view.totalSolicitudPagoSeleccionada);
  assert.equal(control(tree, (node) => node.type === "button" && textOf(node) === "Enviar a pagar").props.disabled, false);
  const selectedCheckbox = control(control(tree, (node) => node.props?.["aria-label"] === "Pago por lote"), (node) => node.type === "input" && node.props?.type === "checkbox");
  assert.equal(selectedCheckbox.props.checked, true);
  selectedCheckbox.props.onChange();
  probe.render();
  assert.deepEqual(probe.state.idsSolicitudPago, []);
  assert.equal(probe.view.totalSolicitudPagoSeleccionada, 0);
  assert.equal(probe.calls.length, 0, "Seleccionar préstamos no debe enviar solicitudes de pago");
});

test("Ver disponibles para pago abre los elegibles desde la primera página y permite seleccionar solo los visibles", { skip: baseline }, () => {
  const probe = pageProbe({ prestamos: loansWithPayablesAfterFirstPage, pagina: 12, idsSolicitudPago: [6], detalleId: 6 });
  control(probe.render().tree, (node) => node.type === "button" && node.props?.["aria-label"] === "Ver disponibles para pago").props.onClick();
  let tree = probe.render().tree;
  assert.equal(probe.state.soloPagables, true);
  assert.equal(probe.state.pagina, 1);
  assert.equal(probe.state.detalleId, null);
  assert.deepEqual(probe.state.idsSolicitudPago, []);
  assert.deepEqual(probe.view.prestamosFiltrados.map((loan) => loan.id), loansWithPayablesAfterFirstPage.slice(5).map((loan) => loan.id));
  assert.deepEqual(probe.view.prestamosPagina.map((loan) => loan.id), [6, 7, 8, 9, 10]);
  const headerCheckbox = control(tree, (node) => node.props?.["aria-label"] === "Seleccionar préstamos pagables visibles");
  assert.equal(headerCheckbox.props.disabled, false);
  headerCheckbox.props.onChange();
  tree = probe.render().tree;
  assert.deepEqual(probe.state.idsSolicitudPago, [6, 7, 8, 9, 10]);
  control(tree, (node) => node.type === "button" && node.props?.["aria-label"] === "Quitar filtro de disponibles").props.onClick();
  probe.render();
  assert.equal(probe.state.soloPagables, false);
  assert.equal(probe.state.pagina, 1);
  assert.deepEqual(probe.state.idsSolicitudPago, []);
  assert.equal(probe.view.prestamosFiltrados.length, 124);
  assert.equal(probe.view.totalSolicitudPagoSeleccionada, 0);
});

test("el filtro de disponibles conserva búsqueda, sede, estado y pestaña sin ampliar la consulta", { skip: baseline }, () => {
  const probe = pageProbe({ prestamos: loansWithPayablesAfterFirstPage, busqueda: "Equipo 1", sedeFiltroId: "2", filtroEstado: "APROBADO", pestana: "Aprobados" });
  const before = probe.view.prestamosSeleccionablesPago.map((loan) => loan.id);
  control(probe.render().tree, (node) => node.type === "button" && node.props?.["aria-label"] === "Ver disponibles para pago").props.onClick();
  probe.render();
  assert.equal(probe.state.busqueda, "Equipo 1");
  assert.equal(probe.state.sedeFiltroId, "2");
  assert.equal(probe.state.filtroEstado, "APROBADO");
  assert.equal(probe.state.pestana, "Aprobados");
  assert.deepEqual(probe.view.prestamosFiltrados.map((loan) => loan.id), before);
  probe.view.seleccionarDisponibles();
  probe.render();
  assert.deepEqual(probe.state.idsSolicitudPago, before);
  assert.ok(probe.view.prestamosSolicitudPagoSeleccionados.every((loan) => loan.referencia.includes("Equipo 1") && probe.view.puedeSolicitarPago(loan)));
  assert.equal(probe.calls.length, 0);
});

test("seleccionar disponibles respeta el permiso del destinatario y permanece inactivo durante carga o sin resultados", { skip: baseline }, () => {
  const scopedLoans = loansWithPayablesAfterFirstPage.map((loan) => loan.id % 3 === 0 ? { ...loan, sedeDestinoId: 4, sedeDestinoNombre: "SEDE 4" } : loan);
  const probe = pageProbe({ prestamos: scopedLoans, user: { ...session, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" } });
  const eligible = scopedLoans.filter((loan) => loan.id > 5 && loan.sedeDestinoId === 2);
  probe.view.seleccionarDisponibles();
  probe.render();
  assert.deepEqual(probe.state.idsSolicitudPago, eligible.map((loan) => loan.id));
  assert.equal(probe.view.totalSolicitudPagoSeleccionada, eligible.reduce((sum, loan) => sum + loan.costo, 0));
  for (const initial of [{ prestamos: scopedLoans, cargando: true }, { prestamos: scopedLoans, cargandoListado: true }, { prestamos: scopedLoans, busqueda: "No existe" }]) {
    const disabled = pageProbe(initial);
    const bar = control(disabled.render().tree, (node) => node.props?.["aria-label"] === "Pago por lote");
    assert.equal(control(bar, (node) => node.type === "input" && node.props?.type === "checkbox").props.disabled, true);
    disabled.view.seleccionarDisponibles();
    assert.deepEqual(disabled.state.idsSolicitudPago, []);
  }
});

test("el lote seleccionado entre todas las páginas solo se envía después de confirmar sus equipos y destinatarios", { skip: baseline }, async () => {
  const probe = pageProbe({ prestamos: loansWithPayablesAfterFirstPage });
  const expectedIds = loansWithPayablesAfterFirstPage.slice(5).map((loan) => loan.id);
  const bar = control(probe.render().tree, (node) => node.props?.["aria-label"] === "Pago por lote");
  control(bar, (node) => node.type === "input" && node.props?.type === "checkbox").props.onChange();
  control(probe.render().tree, (node) => node.type === "button" && textOf(node) === "Enviar a pagar").props.onClick();
  probe.render();
  assert.deepEqual(probe.state.confirmacionPago, { tipo: "solicitar", ids: expectedIds });
  assert.equal(probe.calls.length, 0);
  assert.equal(probe.view.confirmacionValida, true);
  assert.equal(probe.view.itemsConfirmacion.length, 119);
  assert.equal(probe.view.gruposConfirmacion.length, 2);
  assert.equal(probe.view.totalConfirmacion, probe.view.totalSolicitudPagoSeleccionada);
  assert.deepEqual(probe.view.itemsConfirmacion.map((loan) => loan.imei), loansWithPayablesAfterFirstPage.slice(5).map((loan) => loan.imei));
  await probe.view.confirmarPago();
  assert.deepEqual(JSON.parse(probe.calls.find((call) => call.url === "/api/prestamos/solicitar-pago-lote").options.body), { prestamoIds: expectedIds });
  assert.deepEqual(probe.state.idsSolicitudPago, []);
  assert.equal(probe.state.confirmacionPago, null);
});

test("cambiar búsqueda, sede, estado o pestaña limpia selección y detalle sin permitir pagar equipos ocultos", { skip: baseline }, () => {
  for (const label of ["Buscar préstamos", "Filtrar por sede", "Filtrar por estado"]) {
    const probe = pageProbe({ idsSolicitudPago: [1], detalleId: 1, pagina: 3 });
    const tree = probe.render().tree;
    control(tree, (node) => node.props?.["aria-label"] === label).props.onChange({ target: { value: label === "Filtrar por sede" ? "3" : label === "Filtrar por estado" ? "PAGADO" : "Equipo 25" } });
    assert.deepEqual(probe.state.idsSolicitudPago, []);
    assert.equal(probe.state.pagina, 1);
    assert.equal(probe.state.detalleId, null);
    probe.render();
    assert.equal(probe.view.prestamosSolicitudPagoSeleccionados.length, 0);
  }
  const probe = pageProbe({ idsSolicitudPago: [1], pagina: 3, detalleId: 1 });
  control(probe.render().tree, (node) => node.props?.role === "tab" && textOf(node) === "Finalizados").props.onClick();
  probe.render();
  assert.deepEqual(probe.state.idsSolicitudPago, []);
  assert.equal(probe.state.pagina, 1);
  assert.equal(probe.state.detalleId, null);
  assert.equal(probe.view.prestamosFiltrados.length, 5);
});

test("abrir y cerrar detalle mantiene los filtros, página y selección existentes", { skip: baseline }, () => {
  const probe = pageProbe({ busqueda: "Equipo", filtroEstado: "APROBADO", pagina: 2, idsSolicitudPago: [1] });
  const visibleId = probe.view.prestamosPagina[0].id;
  control(probe.render().tree, (node) => node.props?.["aria-label"] === `Ver detalle del préstamo ${visibleId}`).props.onClick();
  probe.render();
  assert.equal(probe.state.detalleId, visibleId);
  control(probe.render().tree, (node) => node.type === "button" && node.props?.["aria-expanded"] && node.props?.["aria-label"] === `Cerrar detalle del préstamo ${visibleId}`).props.onClick();
  assert.equal(probe.state.detalleId, null);
  assert.equal(probe.state.busqueda, "Equipo");
  assert.equal(probe.state.filtroEstado, "APROBADO");
  assert.equal(probe.state.pagina, 2);
  assert.deepEqual(probe.state.idsSolicitudPago, [1]);
});

test("confirmación agrupa destinatarios por ID y revalida toda la selección antes del envío", { skip: baseline }, async () => {
  const probe = pageProbe({ idsSolicitudPago: [1, 13, 15], confirmacionPago: { tipo: "solicitar", ids: [1, 13, 15] } });
  assert.equal(probe.view.confirmacionValida, true);
  assert.equal(probe.view.gruposConfirmacion.length, 2);
  assert.equal(probe.view.totalConfirmacion, 2_914.25);
  assert.deepEqual(probe.view.itemsConfirmacion.map((loan) => loan.imei), ["000000000001001", "000000000001013", "000000000001015"]);
  await probe.view.confirmarPago();
  assert.deepEqual(JSON.parse(probe.calls.find((call) => call.url === "/api/prestamos/solicitar-pago-lote").options.body), { prestamoIds: [1, 13, 15] });
  assert.equal(probe.state.confirmacionPago, null);
  assert.deepEqual(probe.state.idsSolicitudPago, []);
  for (const invalid of [[], [1, 3], [999]]) {
    const guarded = pageProbe({ confirmacionPago: { tipo: "solicitar", ids: invalid } });
    assert.equal(guarded.view.confirmacionValida, false);
    await guarded.view.confirmarPago();
    assert.equal(guarded.calls.length, 0);
  }
  const direct = pageProbe();
  await direct.view.solicitarPagoPrestamoLote([1, 3]);
  assert.equal(direct.calls.length, 0);
  assert.match(direct.state.mensaje, /no son elegibles/);
});

const paymentConfirmationLoans = [
  { id: 51, sedeOrigenId: 7, sedeOrigenNombre: "SEDE NORTE", sedeDestinoId: 2, sedeDestinoNombre: "SEDE CENTRO", costo: 1_000.25, montoPago: 101.25 },
  { id: 52, sedeOrigenId: 7, sedeOrigenNombre: "SEDE NORTE", sedeDestinoId: 2, sedeDestinoNombre: "SEDE CENTRO", costo: 250.5, montoPago: 0 },
  { id: 53, sedeOrigenId: 8, sedeOrigenNombre: "SEDE SUR", sedeDestinoId: 2, sedeDestinoNombre: "SEDE CENTRO", costo: 900.75, montoPago: null },
  { id: 54, sedeOrigenId: 7, sedeOrigenNombre: "SEDE NORTE", sedeDestinoId: 3, sedeDestinoNombre: "SEDE OCCIDENTE", costo: 825.25, montoPago: 800.5 },
].map((item) => ({ ...loans[0], ...item, referencia: `Referencia completa del equipo ${item.id}`, imei: `0000000000000${item.id}` }));

function confirmationLabelValue(tree, label) {
  const field = control(tree, (node) => elements(node.props?.children).some((child) => child?.type === "span" && textOf(child) === label) &&
    (Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]).some((child) => child?.type === "strong"));
  return textOf(control(field, (node) => node.type === "strong"));
}

function assertPaymentConfirmation(probe, expected) {
  const dialog = control(probe.render().tree, (node) => node.props?.title === expected.title);
  assert.equal(probe.view.confirmacionValida, true);
  assert.equal(probe.view.totalConfirmacion, expected.total);
  assert.equal(confirmationLabelValue(dialog, expected.totalLabel), expected.formattedTotal);
  assert.ok(textOf(dialog).includes("4 equipos · 3 grupos de pago"));
  const groups = elements(dialog).filter((node) => node?.type === "details");
  assert.equal(groups.length, 3);
  for (const [index, route] of [
    { paga: "SEDE CENTRO", recibe: "SEDE NORTE", ids: [51, 52] },
    { paga: "SEDE CENTRO", recibe: "SEDE SUR", ids: [53] },
    { paga: "SEDE OCCIDENTE", recibe: "SEDE NORTE", ids: [54] },
  ].entries()) {
    const group = groups[index];
    assert.ok(!group.props.open, "El resumen de cada destinatario debe comenzar cerrado");
    const summary = control(group, (node) => node.type === "summary" && node.props?.["aria-label"] === `Ver equipos: ${route.paga} paga a ${route.recibe}`);
    assert.equal(confirmationLabelValue(summary, "Paga"), route.paga);
    assert.equal(confirmationLabelValue(summary, "Recibe"), route.recibe);
    assert.equal(confirmationLabelValue(summary, "Importe"), expected.formattedSubtotals[index]);
    assert.ok(textOf(summary).includes(`${route.ids.length} ${route.ids.length === 1 ? "equipo" : "equipos"}`));
    assert.ok(textOf(summary).includes("Ver equipos"));
    const equipment = control(group, (node) => node.type === "ul" && node.props?.["aria-label"] === `Equipos: ${route.paga} paga a ${route.recibe}`);
    const rows = elements(equipment).filter((node) => node?.type === "li");
    assert.equal(rows.length, route.ids.length);
    for (const [rowIndex, id] of route.ids.entries()) {
      const item = paymentConfirmationLoans.find((loan) => loan.id === id);
      assert.ok(textOf(rows[rowIndex]).includes(item.referencia));
      assert.ok(textOf(rows[rowIndex]).includes(`IMEI ${item.imei}`), "El detalle conserva el IMEI textual completo, incluidos ceros iniciales");
      assert.ok(textOf(rows[rowIndex]).endsWith(expected.formattedAmounts[id]));
    }
  }
  assert.equal(probe.calls.length, 0, "Revisar destinatarios y equipos no debe enviar el pago");
  return dialog;
}

test("confirmar envío distingue quién paga y quién recibe, con subtotales por par de sedes y equipos desplegables", { skip: baseline }, () => {
  const ids = paymentConfirmationLoans.map((loan) => loan.id);
  const probe = pageProbe({ prestamos: paymentConfirmationLoans, idsSolicitudPago: ids, confirmacionPago: { tipo: "solicitar", ids } });
  const dialog = assertPaymentConfirmation(probe, {
    title: "Confirmar envío a pagar", totalLabel: "Total a enviar", total: 2_976.75, formattedTotal: "$ 2.976,75",
    formattedSubtotals: ["$ 1.250,75", "$ 900,75", "$ 825,25"],
    formattedAmounts: { 51: "$ 1.000,25", 52: "$ 250,5", 53: "$ 900,75", 54: "$ 825,25" },
  });
  const cancel = control(dialog.props.footer, (node) => node.type === "button" && textOf(node) === "Cancelar");
  cancel.props.onClick();
  assert.equal(probe.state.confirmacionPago, null);
  assert.deepEqual(probe.state.idsSolicitudPago, ids);
  assert.equal(probe.calls.length, 0);
});

test("confirmar aprobación mantiene la dirección del pago y los montos solicitados sin sustituirlos por el costo", { skip: baseline }, () => {
  const ids = paymentConfirmationLoans.map((loan) => loan.id);
  const probe = pageProbe({ prestamos: paymentConfirmationLoans.map((loan) => ({ ...loan, estado: "PAGO_PENDIENTE_APROBACION" })), confirmacionPago: { tipo: "aprobar", ids } });
  const dialog = assertPaymentConfirmation(probe, {
    title: "Confirmar aprobación de pago", totalLabel: "Total a aprobar", total: 2_053, formattedTotal: "$ 2.053",
    formattedSubtotals: ["$ 351,75", "$ 900,75", "$ 800,5"],
    formattedAmounts: { 51: "$ 101,25", 52: "$ 250,5", 53: "$ 900,75", 54: "$ 800,5" },
  });
  const confirm = control(dialog.props.footer, (node) => node.type === "button" && textOf(node) === "Confirmar aprobación");
  assert.equal(confirm.props.disabled, false);
  // Approval actions normally open one origin/destination batch at a time.
  probe.state.confirmacionPago = { tipo: "aprobar", ids: [51, 52] };
  const batch = control(probe.render().tree, (node) => node.props?.title === "Confirmar aprobación de pago");
  assert.equal(probe.view.gruposConfirmacion.length, 1);
  assert.equal(probe.view.totalConfirmacion, 351.75);
  assert.equal(confirmationLabelValue(batch, "Total a aprobar"), "$ 351,75");
  assert.ok(textOf(batch).includes("2 equipos · 1 grupo de pago"));
  assert.equal(probe.calls.length, 0);
});

test("la barra de pagos está disponible, deshabilita el envío vacío y permite cancelar confirmación sin perder selección", { skip: baseline }, () => {
  const empty = pageProbe();
  const send = control(empty.render().tree, (node) => node.type === "button" && textOf(node) === "Enviar a pagar");
  assert.equal(send.props.disabled, true);
  const selected = pageProbe({ idsSolicitudPago: [1, 13], confirmacionPago: { tipo: "solicitar", ids: [1, 13] } });
  const dialog = control(selected.render().tree, (node) => node.props?.title === "Confirmar envío a pagar");
  dialog.props.onClose();
  assert.equal(selected.state.confirmacionPago, null);
  assert.deepEqual(selected.state.idsSolicitudPago, [1, 13]);
});

test("una actualización de datos retira selección de préstamos que ya no permiten pago", { skip: baseline }, async () => {
  const fresh = loans.map((loan) => loan.id === 1 ? { ...loan, estado: "PAGO_PENDIENTE_APROBACION" } : loan);
  const probe = pageProbe({ idsSolicitudPago: [1, 13] }, { "/api/prestamos": { ok: true, data: fresh } });
  await probe.view.cargarPrestamos();
  assert.deepEqual(probe.state.idsSolicitudPago, [13]);
  probe.render();
  assert.equal(probe.view.totalSolicitudPagoSeleccionada, 1_306.5);
});

test("una respuesta atrasada de otra cobertura no reemplaza la consulta más reciente", { skip: baseline }, async () => {
  const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
  const old = pending();
  const latest = pending();
  const probe = pageProbe({}, { "/api/prestamos": () => old.promise, "/api/prestamos?sedeId=3": () => latest.promise });
  const oldRequest = probe.view.cargarPrestamos();
  probe.state.sedeFiltroId = "3";
  probe.render();
  const newRequest = probe.view.cargarPrestamos();
  latest.resolve({ ok: true, data: [loans[14]] });
  await newRequest;
  old.resolve({ ok: true, data: loans });
  await oldRequest;
  assert.deepEqual(probe.state.prestamos.map((loan) => loan.id), [15]);
});

const responseMock = { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status ?? 200, headers: { "Content-Type": "application/json" } }) } };
function route(path, user, prisma) {
  return load(path, {
    "next/server": responseMock, "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": access,
    "@/lib/prestamos": loanHelpers, "@/lib/sedes": sedeHelpers,
  });
}
const postRequest = (body) => new Request("http://localhost/api/prestamos/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("servidor: ninguna operación de préstamo admite sesión ausente o perfil sin acceso operativo", async () => {
  const actions = ["aprobar", "cerrar-pendiente", "solicitar-devolucion", "devolver", "rechazar-devolucion", "solicitar-pago", "solicitar-pago-lote", "aprobar-pago", "aprobar-pago-lote"];
  const unreachable = new Proxy({}, { get() { assert.fail("La validación debe impedir consultar o escribir datos"); } });
  for (const action of actions) {
    const path = `app/api/prestamos/${action}/route.ts`;
    assert.equal((await route(path, null, unreachable).POST(postRequest({ id: 1, prestamoIds: [1] }))).status, 401, action);
    for (const perfilTipo of ["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"]) {
      assert.equal((await route(path, { ...session, perfilTipo }, unreachable).POST(postRequest({ id: 1, prestamoIds: [1] }))).status, 403, `${action}: ${perfilTipo}`);
    }
  }
});

function paymentDatabase(options = {}) {
  const records = structuredClone(options.loans ?? [loans[0]]);
  const inventory = structuredClone(options.inventory ?? records.map((loan) => ({ id: loan.id * 10, imei: loan.imei, sedeId: loan.sedeDestinoId, estadoFinanciero: "DEUDA", deboA: "SEDE 1" })));
  const writes = [];
  let transactions = 0;
  const prisma = {
    prestamoSede: { findMany: async ({ where }) => records.filter((item) => where.id.in.includes(item.id)) },
    inventarioSede: { findMany: async () => inventory },
    sede: { findMany: async () => [{ id: 1, nombre: "SEDE 1" }, { id: 2, nombre: "SEDE 2" }, { id: 3, nombre: "SEDE 3" }, { id: 4, nombre: "SEDE 4" }] },
    $transaction: async (fn) => {
      transactions++;
      const tx = {
        prestamoSede: { update: async (args) => { writes.push({ name: "loan", args }); return {}; } },
        movimientoCajaSede: { findFirst: async () => null, update: async (args) => { writes.push({ name: "cashUpdate", args }); return {}; }, create: async (args) => { writes.push({ name: "cash", args }); return {}; } },
        movimientoInventario: { create: async (args) => { writes.push({ name: "history", args }); return {}; } },
      };
      return fn(tx);
    },
  };
  return { prisma, records, inventory, writes, get transactions() { return transactions; } };
}

test("servidor: solicitud de lote deduplica IDs y calcula monto por costos reales en una transacción", async () => {
  const database = paymentDatabase({ loans: [loans[0], loans[12]] });
  const response = await route("app/api/prestamos/solicitar-pago-lote/route.ts", session, database.prisma).POST(postRequest({ prestamoIds: [1, 13, 1, -1, "nada"] }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.cantidad, 2);
  assert.equal(result.total, 1_406.75);
  assert.equal(database.transactions, 1);
  const loanWrites = database.writes.filter((entry) => entry.name === "loan");
  assert.deepEqual(loanWrites.map((entry) => entry.args.where.id), [1, 13]);
  assert.deepEqual(loanWrites.map((entry) => entry.args.data.montoPago), [100.25, 1_306.5]);
  assert.ok(loanWrites.every((entry) => entry.args.data.estado === "PAGO_PENDIENTE_APROBACION"));
  assert.equal(database.writes.filter((entry) => entry.name === "history").length, 2);
});

test("servidor: pago por lote vuelve a validar existencia, sede, estado, equipo y deuda antes de escribir", async () => {
  const cases = [
    { loan: loans[0], user: { ...session, rolNombre: "SUPERVISOR", sedeId: 77 }, status: 403 },
    { loan: { ...loans[0], estado: "PAGO_PENDIENTE_APROBACION" }, status: 400 },
    { loan: loans[0], inventory: [], status: 404 },
    { loan: loans[0], financial: "PAGO", status: 400 },
    { loan: loans[0], creditor: "Proveedor Finser", status: 400 },
  ];
  for (const config of cases) {
    const database = paymentDatabase({ loans: [config.loan], ...(config.inventory ? { inventory: config.inventory } : {}) });
    if (config.financial) database.inventory[0].estadoFinanciero = config.financial;
    if (config.creditor) database.inventory[0].deboA = config.creditor;
    const response = await route("app/api/prestamos/solicitar-pago-lote/route.ts", config.user ?? session, database.prisma).POST(postRequest({ prestamoIds: [1] }));
    assert.equal(response.status, config.status);
    assert.equal(database.transactions, 0);
    assert.deepEqual(database.writes, []);
  }
  const database = paymentDatabase();
  assert.equal((await route("app/api/prestamos/solicitar-pago-lote/route.ts", session, database.prisma).POST(postRequest({ prestamoIds: [999] }))).status, 404);
  assert.equal((await route("app/api/prestamos/solicitar-pago-lote/route.ts", session, database.prisma).POST(postRequest({ prestamoIds: [] }))).status, 400);
  assert.equal(database.transactions, 0);
});

test("servidor: una sede no puede ampliar su cobertura mediante el filtro de consulta", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    let where;
    const prisma = {
      sede: { findFirst: async () => ({ id: 99, nombre: "BODEGA PRINCIPAL" }), findMany: async () => [] },
      prestamoSede: { findMany: async (args) => { where = args.where; return []; } },
    };
    const response = await route("app/api/prestamos/route.ts", { ...session, rolNombre }, prisma).GET(new Request("http://localhost/api/prestamos?sedeId=77"));
    assert.equal(response.status, 200);
    const effectiveSite = rolNombre === "SUPERVISOR" ? 2 : 77;
    assert.deepEqual(where, { OR: [{ sedeOrigenId: effectiveSite }, { sedeDestinoId: effectiveSite }] });
  }
});

function approvalDatabase(options = {}) {
  const records = structuredClone(options.loans ?? [loans[0], loans[12]]).map((loan) => ({ ...loan, estado: "PAGO_PENDIENTE_APROBACION", montoPago: loan.costo }));
  if (options.invalidAmount) records[0].montoPago -= 0.01;
  const origins = records.map((loan) => ({ id: loan.id * 10 + 1, imei: loan.imei, sedeId: loan.sedeOrigenId, estadoActual: "PRESTAMO", estadoFinanciero: "PAGO", deboA: null }));
  const destinations = records.map((loan) => ({ id: loan.id * 10 + 2, imei: loan.imei, sedeId: loan.sedeDestinoId, estadoFinanciero: "DEUDA", deboA: `SEDE ${loan.sedeOrigenId}`, origen: "PRESTAMO_SEDE", inventarioPrincipalId: null }));
  const calls = [];
  const recordWrite = (name) => async (args) => { calls.push({ name, args }); return {}; };
  const prisma = {
    sede: {
      findFirst: async () => ({ id: 99, nombre: "BODEGA PRINCIPAL" }),
      findMany: async () => [1, 2, 3, 4].map((id) => ({ id, nombre: `SEDE ${id}`, soloInventarioPorCobrar: false })),
    },
    prestamoSede: { findMany: async ({ where }) => records.filter((loan) => where.id.in.includes(loan.id)) },
    inventarioSede: { findMany: async ({ where }) => where.estadoActual ? origins : destinations },
    $transaction: async (fn) => {
      calls.push({ name: "transaction" });
      return fn({
        prestamoSede: { updateMany: async (args) => { calls.push({ name: "claim", args }); return { count: options.conflict ? 0 : records.length }; } },
        cajaMovimiento: { create: recordWrite("cash") },
        movimientoCajaSede: { findMany: async () => [], create: recordWrite("siteCash"), update: recordWrite("siteCashUpdate") },
        inventarioSede: { update: recordWrite("inventory"), delete: recordWrite("inventoryDelete") },
        movimientoInventario: { create: recordWrite("history") },
      });
    },
  };
  return { prisma, records, calls };
}

test("servidor: aprobación de lote conserva suma, origen y destino en caja, inventario e historial", async () => {
  const database = approvalDatabase();
  const response = await route("app/api/prestamos/aprobar-pago-lote/route.ts", session, database.prisma).POST(postRequest({ prestamoIds: [1, 13] }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 1_406.75);
  const cash = database.calls.filter((call) => call.name === "cash");
  assert.deepEqual(cash.map((call) => [call.args.data.tipo, call.args.data.sedeId, call.args.data.valor]), [["INGRESO", 1, 1_406.75], ["EGRESO", 2, 1_406.75]]);
  const inventory = database.calls.filter((call) => call.name === "inventory");
  assert.equal(inventory.length, 2);
  assert.ok(inventory.every((call) => call.args.data.estadoFinanciero === "PAGO" && call.args.data.deboA === null));
  assert.equal(database.calls.filter((call) => call.name === "history").length, 2);
});

test("servidor: el guard de aprobación concurrente impide contabilizar un lote ya procesado", async () => {
  const database = approvalDatabase({ conflict: true });
  const response = await route("app/api/prestamos/aprobar-pago-lote/route.ts", session, database.prisma).POST(postRequest({ prestamoIds: [1, 13] }));
  assert.equal(response.status, 409);
  assert.deepEqual(database.calls.map((call) => call.name), ["transaction", "claim"]);
  assert.deepEqual(database.calls[1].args.where, { id: { in: [1, 13] }, estado: "PAGO_PENDIENTE_APROBACION" });
});

test("servidor: aprobación por lote rechaza cajas diferentes, monto alterado y un usuario de destino", async () => {
  for (const config of [
    { options: { loans: [loans[0], loans[14]] }, status: 400 },
    { options: { invalidAmount: true }, status: 400 },
    { options: {}, user: { ...session, rolNombre: "SUPERVISOR", sedeId: 2 }, status: 403 },
  ]) {
    const database = approvalDatabase(config.options);
    const response = await route("app/api/prestamos/aprobar-pago-lote/route.ts", config.user ?? session, database.prisma).POST(postRequest({ prestamoIds: database.records.map((loan) => loan.id) }));
    assert.equal(response.status, config.status);
    assert.deepEqual(database.calls, []);
  }
});
