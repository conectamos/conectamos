import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
// The same assertions can also run against an isolated pre-redesign source snapshot.
const PAGE_SOURCE = process.env.OPERATIONS_DASHBOARD_TEST_SOURCE || "app/dashboard/page.tsx";
const require = createRequire(import.meta.url);
const jsxRuntime = require("react/jsx-runtime");
function loadTypeScript(path, imports = {}) {
  const source = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const testModule = { exports: {} };
  const requireMock = (name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  };
  new Function("require", "module", "exports", "console", source)(
    requireMock, testModule, testModule.exports, { error() {} },
  );
  return testModule.exports;
}
const financieras = loadTypeScript("lib/ventas-financieras.ts");
const utilsOriginal = loadTypeScript("lib/ventas-utils.ts", {
  "@/lib/ventas-financieras": financieras,
});
const periodoActual = utilsOriginal.getBogotaMonthRangeFromInput("2026-10");
const utils = { ...utilsOriginal, getCurrentBogotaMonthRange: () => periodoActual };
const access = loadTypeScript("lib/access-control.ts");
const sedesHelpers = loadTypeScript("lib/sedes.ts");
const sedes = [
  { id: 4, nombre: "BODEGA PRINCIPAL" },
  { id: 2, nombre: "SEDE 2" },
  { id: 3, nombre: "Stand Solutions" },
];
const baseSession = {
  id: 10, perfilId: 23, nombre: "Ana Pérez", rolNombre: "CAJA",
  perfilTipo: "OPERATIVO", perfilTipoLabel: "Operativo", perfilNombre: "Operación",
  sedeId: 2, sedeNombre: "SEDE 2", sedeSoloInventarioPorCobrar: false,
  sessionKey: "session-qa",
};
const operationalFixture = {
  equiposEnBodega: 19, aprobacionesPendientes: 7, prestamosActivos: 2,
  inventarioAtencion: 3, pendientesTotal: 12,
  detalleAprobaciones: { prestamos: 4, ventas: 3 },
};
const financialFixture = { cajaGeneralVentas: 90_000_000.25, saldoCaja: -3_000_000.5, cajaDisponible: 86_999_999.75 };
function comercialFixture(period) {
  const ranking = [{ nombre: "PAYJOY", total: 11, monto: 47_005_000.5 }];
  return {
    periodo: utils.getBogotaMonthRangeFromInput(period), utilidad: 5_002_300.75,
    caja: 9_100_000, ingresos: 51_105_000.5, ventas: 17, cajaVentas: 9_000_000,
    cajaOperativa: 100_000, topSedesJalador: [], topVentasSede: [], topJaladores: [],
    topCerradores: [], topAsesoresPayJoy: [], topFinancieras: ranking,
    topMarcasVendidas: [], topReferenciasVendidas: [], referenciasVendidas: [],
    tendenciaDiaria: [{ fecha: "2026-09-01", etiqueta: "1", ventas: 17, ingresos: 51_105_000.5, utilidad: 5_002_300.75 }],
    rendimientoPorSede: [{ sedeId: 2, nombre: "SEDE 2", ventas: 17, ingresos: 51_105_000.5, utilidad: 5_002_300.75 }],
    detalleMarcasPorSede: {},
  };
}
function probePage(session, failures = []) {
  const calls = [];
  const component = () => null;
  const defaultComponent = { __esModule: true, default: component };
  const record = (name, value) => async (args) => {
    calls.push({ name, args });
    if (failures.includes(name)) throw new Error(`QA ${name}`);
    return typeof value === "function" ? value(args) : value;
  };
  const imports = {
    "next/link": defaultComponent,
    "@/lib/auth": { getSessionUser: record("session", session) },
    "@/lib/prisma": { __esModule: true, default: { sede: { findMany: record("sedes", sedes) } } },
    "@/lib/access-control": access,
    "@/lib/ventas-utils": utils,
    "@/lib/dashboard-commercial-summary": { getMonthlyCommercialSummary: record("commercial", (args) => comercialFixture(args.period)) },
    "@/lib/dashboard-financial-summary": { getDashboardCashSummary: record("financial", financialFixture) },
    "@/lib/dashboard-overview": { getDashboardOperationalSummary: record("operational", operationalFixture) },
    "@/lib/vendor-welcome-message": { getVendorWelcomeMessage: record("welcome", "Mensaje real") },
    "@/lib/vendor-earnings": { getVendorEarningsSummary: record("earnings", { total: 99 }) },
    "@/lib/dashboard-sales-role-summary": { getSalesRoleActivitySummary: record("activity", { pendientes: 3, registrosPeriodo: 12, convertidos: 8 }) },
    "@/lib/prestamos": { NOMBRE_SEDE_BODEGA: "BODEGA PRINCIPAL" },
    "@/lib/sedes": sedesHelpers,
  };
  for (const name of [
    "dashboard-utility-gate", "logout-button", "vendor-welcome-modal",
    "pending-loan-alert-modal", "operations-dashboard", "dashboard-icon", "sales-role-dashboard",
  ]) imports[`./_components/${name}`] = defaultComponent;
  return { page: loadTypeScript(PAGE_SOURCE, imports).default, calls };
}
function findProps(node, predicate) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) { const found = findProps(child, predicate); if (found) return found; }
    return null;
  }
  if (node.props && predicate(node.props)) return node.props;
  return findProps(node.props?.children, predicate);
}
async function runPage(session, params = { period: "2026-09" }, failures = []) {
  const probe = probePage(session, failures);
  const tree = await probe.page({ searchParams: Promise.resolve(params) });
  return {
    ...probe, tree,
    props: findProps(tree, (props) => "commercial" in props && "operational" in props),
  };
}
function getCall(result, name) { return result.calls.find((call) => call.name === name)?.args; }

test("ADMIN y AUDITOR conservan alcance total, sedes activas y las tres fuentes con el mismo corte", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR"]) {
    const result = await runPage({ ...baseSession, rolNombre, perfilTipo: "ADMINISTRADOR" });
    const props = result.props;
    assert.ok(props);
    assert.equal(props.esAdmin, true);
    assert.equal(props.coverageLabel, "Todas las sedes");
    assert.equal(props.period, "2026-09");
    assert.equal(props.sedeId, null);
    assert.deepEqual(props.sedes, sedes);
    assert.deepEqual(getCall(result, "sedes"), { where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
    assert.deepEqual(getCall(result, "commercial"), { period: "2026-09", sedeId: null });
    const end = new Date("2026-10-01T05:00:00.000Z");
    assert.deepEqual(getCall(result, "financial"), { sedeId: null, fechaCorte: end });
    assert.deepEqual(getCall(result, "operational"), { sedeId: null, incluirBodegaPrincipal: true, puedeVerAprobacionesVenta: true, fechaCorte: end });
    assert.equal(props.commercial.utilidad, 5_002_300.75);
    assert.equal(props.commercial.caja, 9_100_000);
    assert.equal(props.financial.cajaDisponible, 86_999_999.75);
    assert.equal(props.operational.pendientesTotal, 12);
    assert.ok(props.navigationItems.some((item) => item.href === "/dashboard/reportes"));
    assert.ok(props.navigationItems.some((item) => item.href === "/dashboard/sedes"));
  }
});

test("cobertura ADMIN válida limita todas las fuentes; principal sólo Todas o BODEGA PRINCIPAL", async () => {
  for (const id of [2, 3, 4]) {
    const result = await runPage({ ...baseSession, rolNombre: "ADMIN" }, { period: "2026-09", sedeId: String(id) });
    assert.equal(result.props.sedeId, id);
    assert.equal(result.props.coverageLabel, sedes.find((sede) => sede.id === id).nombre);
    for (const name of ["commercial", "financial", "operational"]) assert.equal(getCall(result, name).sedeId, id);
    assert.equal(getCall(result, "operational").incluirBodegaPrincipal, id === 4);
  }
});

test("cobertura inexistente/incorrecta conserva Todas; periodo inválido y espacios aplican un único mes Bogotá", async () => {
  for (const sedeId of ["999", "-1", "1.5", "NaN", "TODAS", "0"]) {
    const result = await runPage({ ...baseSession, rolNombre: "AUDITOR" }, { period: "invalido", sedeId });
    assert.equal(result.props.sedeId, null);
    assert.equal(result.props.period, "2026-10");
    assert.equal(getCall(result, "commercial").period, "2026-10");
    assert.equal(getCall(result, "financial").fechaCorte.toISOString(), "2026-11-01T05:00:00.000Z");
    assert.equal(getCall(result, "operational").fechaCorte.toISOString(), "2026-11-01T05:00:00.000Z");
  }
  const valid = await runPage({ ...baseSession, rolNombre: "ADMIN" }, { period: " 2026-09 " });
  assert.equal(valid.props.period, "2026-09");
});

test("supervisor por perfil o rol siempre usa su sede e ignora sedeId de la URL", async () => {
  for (const identity of [{ perfilTipo: "SUPERVISOR_TIENDA" }, { rolNombre: "SUPERVISOR" }]) {
    const result = await runPage({ ...baseSession, ...identity }, { period: "2026-09", sedeId: "4" });
    assert.equal(result.props.esAdmin, false);
    assert.equal(result.props.esSupervisor, true);
    assert.equal(result.props.sedeId, null);
    assert.deepEqual(result.props.sedes, []);
    assert.equal(result.props.coverageLabel, "SEDE 2");
    assert.equal(result.props.puedeVerEquality, true);
    for (const name of ["commercial", "financial", "operational"]) assert.equal(getCall(result, name).sedeId, 2);
    assert.equal(getCall(result, "operational").incluirBodegaPrincipal, false);
    assert.equal(getCall(result, "operational").puedeVerAprobacionesVenta, true);
    assert.ok(!result.calls.some((call) => call.name === "sedes"));
    assert.ok(!result.props.navigationItems.some((item) => ["/dashboard/reportes", "/dashboard/sedes"].includes(item.href)));
    assert.equal(result.props.detailedRankings.props.mostrarAccionesMonetarias, false);
  }
});

test("stand ordinario mantiene ventas/inventario/caja y no consulta caja ni aprobaciones de venta", async () => {
  const result = await runPage({ ...baseSession, sedeId: 3, sedeNombre: "Stand Solutions" }, { period: "2026-09", sedeId: "4" });
  assert.equal(result.props.esStand, true);
  assert.equal(result.props.esStandSoloInventario, false);
  assert.equal(result.props.financial, null);
  assert.equal(result.props.financialAvailable, true);
  assert.equal(getCall(result, "commercial").sedeId, 3);
  assert.equal(getCall(result, "operational").puedeVerAprobacionesVenta, false);
  assert.ok(!result.calls.some((call) => call.name === "financial"));
  assert.deepEqual(result.props.navigationItems.map((item) => item.href), ["/dashboard", "/ventas", "/inventario", "/caja", "/dashboard/analitico"]);
});

test("stand sólo inventario omite negocio comercial/financiero aun siendo supervisor y conserva préstamos", async () => {
  const result = await runPage({ ...baseSession, perfilTipo: "SUPERVISOR_TIENDA", sedeId: 3, sedeNombre: "Stand Solutions", sedeSoloInventarioPorCobrar: true });
  assert.equal(result.props.esStandSoloInventario, true);
  assert.equal(result.props.commercial.ventas, 0);
  assert.equal(result.props.commercial.utilidad, 0);
  assert.equal(result.props.financial, null);
  assert.equal(result.props.puedeVerEquality, false);
  assert.equal(result.props.detailedRankings, null);
  assert.deepEqual(result.props.navigationItems.map((item) => item.href), ["/dashboard", "/inventario", "/prestamos"]);
  assert.deepEqual(result.calls.map((call) => call.name), ["session", "operational"]);
  assert.equal(getCall(result, "operational").sedeId, 3);
  assert.equal(getCall(result, "operational").puedeVerAprobacionesVenta, false);
});

test("vendedor/apoyo mantienen resumen propio; facturador y sólo-inventario no STAND conservan su rama", async () => {
  for (const perfilTipo of ["VENDEDOR", "APOYO_OPERATIVO"]) {
    const result = await runPage({ ...baseSession, perfilTipo });
    assert.equal(result.props, null);
    const sales = findProps(result.tree, (props) => "activity" in props && "earnings" in props);
    assert.equal(sales.role, perfilTipo);
    assert.equal(getCall(result, "earnings"), 23);
    assert.equal(getCall(result, "activity"), 23);
    assert.deepEqual(result.calls.map((call) => call.name), ["session", "welcome", "earnings", "activity"]);
  }
  for (const session of [
    { ...baseSession, perfilTipo: "FACTURADOR" },
    { ...baseSession, sedeSoloInventarioPorCobrar: true },
  ]) {
    const result = await runPage(session);
    assert.equal(result.props, null);
    assert.deepEqual(result.calls.map((call) => call.name), ["session"]);
  }
});

test("sin sesión no se consultan datos; ADMIN+perfil ventas conserva precedencia de la rama vendedor", async () => {
  const missing = await runPage(null);
  assert.equal(missing.props, null);
  assert.deepEqual(missing.calls.map((call) => call.name), ["session"]);
  const mixed = await runPage({ ...baseSession, rolNombre: "ADMIN", perfilTipo: "VENDEDOR" });
  assert.equal(mixed.props, null);
  assert.ok(findProps(mixed.tree, (props) => props.role === "VENDEDOR"));
  assert.ok(!mixed.calls.some((call) => ["commercial", "financial", "operational"].includes(call.name)));
});

test("un fallo parcial conserva las otras fuentes y marca explícitamente el indicador no disponible", async () => {
  for (const name of ["commercial", "financial", "operational"]) {
    const result = await runPage({ ...baseSession, rolNombre: "ADMIN" }, { period: "2026-09" }, [name]);
    assert.equal(result.props[`${name}Available`], false);
    for (const other of ["commercial", "financial", "operational"].filter((item) => item !== name)) assert.equal(result.props[`${other}Available`], true);
    if (name === "commercial") { assert.equal(result.props.commercial.ventas, 0); assert.equal(result.props.detailedRankings, null); }
    if (name === "financial") assert.equal(result.props.financial, null);
    if (name === "operational") assert.equal(result.props.operational.pendientesTotal, 0);
  }
});

test("pendientes reales cuentan sólo estados abiertos y aplican sede/corte a inventario y ambos extremos del préstamo", async () => {
  const calls = [];
  const record = (name, result) => async (args) => { calls.push({ name, args }); return result; };
  const prisma = {
    inventarioSede: { count: async (args) => { calls.push({ name: "inventario", args }); return args.where.estadoActual === "BODEGA" ? 19 : 3; } },
    inventarioPrincipal: { count: record("principal", 5) },
    prestamoSede: { count: async (args) => { calls.push({ name: "prestamo", args }); return args.where.estado.in.includes("APROBADO") ? 2 : 4; } },
    registroVendedorVenta: { groupBy: record("registros", [
      { estadoVentaRegistro: "PENDIENTE", _count: { _all: 3 } },
      { estadoVentaRegistro: " convertido_en_venta ", _count: { _all: 9 } },
      { estadoVentaRegistro: "CANCELADO", _count: { _all: 8 } },
      { estadoVentaRegistro: null, _count: { _all: 1 } },
    ]) },
  };
  const helper = loadTypeScript("lib/dashboard-overview.ts", { "@/lib/prisma": { __esModule: true, default: prisma } });
  const fechaCorte = new Date("2026-10-01T05:00:00Z");
  const summary = await helper.getDashboardOperationalSummary({ sedeId: 2, fechaCorte, incluirBodegaPrincipal: true, puedeVerAprobacionesVenta: true });
  assert.deepEqual(summary, { equiposEnBodega: 24, aprobacionesPendientes: 8, prestamosActivos: 2, inventarioAtencion: 3, pendientesTotal: 13, detalleAprobaciones: { prestamos: 4, ventas: 4 } });
  for (const call of calls) {
    assert.deepEqual(call.args.where.createdAt, { lt: fechaCorte });
    if (call.name === "prestamo") assert.deepEqual(call.args.where.OR, [{ sedeOrigenId: 2 }, { sedeDestinoId: 2 }]);
    else if (call.name !== "principal") assert.equal(call.args.where.sedeId, 2);
  }
  const loanStates = calls.filter((call) => call.name === "prestamo").map((call) => call.args.where.estado.in);
  assert.deepEqual(loanStates, [["PENDIENTE", "PAGO_PENDIENTE_APROBACION", "DEVOLUCION_PENDIENTE"], ["APROBADO"]]);
  assert.deepEqual(calls.find((call) => call.name === "inventario" && typeof call.args.where.estadoActual === "object").args.where.estadoActual.in, ["PENDIENTE", "GARANTIA"]);
  calls.length = 0;
  const restricted = await helper.getDashboardOperationalSummary({ sedeId: 3, fechaCorte });
  assert.equal(restricted.equiposEnBodega, 19);
  assert.equal(restricted.detalleAprobaciones.ventas, 0);
  assert.ok(!calls.some((call) => ["principal", "registros"].includes(call.name)));
});

test("caja acumulada real suma caja de ventas e ingresos menos egresos, excluye gasto cartera y conserva decimales", async () => {
  const calls = [];
  const decimal = (number) => ({ toNumber: () => number });
  const prisma = {
    venta: { aggregate: async (args) => { calls.push({ name: "ventas", args }); return { _sum: { cajaOficina: decimal(500.25) } }; } },
    cajaMovimiento: { groupBy: async (args) => { calls.push({ name: "movimientos", args }); return [
      { tipo: "INGRESO", _sum: { valor: decimal(20.5) } },
      { tipo: "EGRESO", _sum: { valor: decimal(700.75) } },
    ]; } },
  };
  const helper = loadTypeScript("lib/dashboard-financial-summary.ts", {
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/prestamos": {}, "@/lib/ventas-financieras": financieras,
  });
  const fechaCorte = new Date("2026-10-01T05:00:00Z");
  const result = await helper.getDashboardCashSummary({ sedeId: 2, fechaCorte });
  assert.deepEqual(result, { cajaGeneralVentas: 500.25, saldoCaja: -680.25, cajaDisponible: -180 });
  assert.deepEqual(calls[0].args.where, { sedeId: 2, fecha: { lt: fechaCorte }, createdAt: { lt: fechaCorte } });
  assert.deepEqual(calls[1].args.where, { sedeId: 2, createdAt: { lt: fechaCorte }, tipo: { in: ["INGRESO", "EGRESO"] }, NOT: { concepto: "GASTO CARTERA" } });
});
