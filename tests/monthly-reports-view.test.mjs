import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { monthlyReportsBefore } from "./fixtures/monthly-reports-before.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
function loadTypeScript(relativePath, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(join(ROOT, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const testModule = { exports: {} };
  const requireMock = (specifier) => {
    assert.ok(specifier in imports, `Dependencia inesperada: ${specifier}`);
    return imports[specifier];
  };
  new Function("require", "module", "exports", outputText)(requireMock, testModule, testModule.exports);
  return testModule.exports;
}

const financieras = loadTypeScript("lib/ventas-financieras.ts");
const originalUtils = loadTypeScript("lib/ventas-utils.ts", { "@/lib/ventas-financieras": financieras });
const utils = { ...originalUtils, getCurrentBogotaMonthInput: () => "2026-10" };
const accessControl = loadTypeScript("lib/access-control.ts");
const financialSource = loadTypeScript("lib/dashboard-financial-summary.ts", {
  "@/lib/prisma": { __esModule: true, default: {} },
  "@/lib/prestamos": {},
  "@/lib/ventas-financieras": financieras,
});
const viewHelpers = loadTypeScript("lib/monthly-reports-view.ts");
const session = { nombre: "Ana Martínez", usuario: "ana", rolNombre: "ADMIN" };
const sedes = [{ id: 1, nombre: "Stand Solutions" }, { id: 2, nombre: "Bogotá" }, { id: 3, nombre: "Sin ventas" }];
const snapshotTime = "2026-10-01T04:50:31.000Z";

function ranking(prefix, includeAmounts = false) {
  return Array.from({ length: 7 }, (_, index) => ({
    nombre: `${prefix} ${index + 1}`,
    total: 7 - index,
    monto: includeAmounts ? (7 - index) * 100_000.5 : 0,
  }));
}
function financialFixture(sedeId, empty = false) {
  if (empty) return {
    cajaGeneralVentas: 0, saldoCaja: 0, cajaDisponible: 0, transferenciasVentas: 0,
    abonosTransferencia: 0, saldoTransferencias: 0, deudaEquipos: 0, financieras: {},
    valorPendiente: 0, valorGarantia: 0, valorBodega: 0, totalGastosCartera: 0, prestamosPorCobrar: 0,
  };
  return {
    cajaGeneralVentas: 88_526_098,
    saldoCaja: sedeId === 2 ? -96_269_487.5 : -2_000_000.5,
    cajaDisponible: sedeId === 2 ? -7_743_389.5 : 86_526_097.5,
    transferenciasVentas: 82_123_300,
    abonosTransferencia: 1_000_000.25,
    saldoTransferencias: 81_123_299.75,
    deudaEquipos: 713_355_000,
    financieras: { PAYJOY: 1_234_296_394.82, SUMASPAY: -4_500.12 },
    valorPendiente: 15_507_000,
    valorGarantia: 2_840_000,
    valorBodega: 64_255_000,
    totalGastosCartera: -70_046_617,
    prestamosPorCobrar: 29_775_000,
  };
}

function createModules({ source = "live", empty = false } = {}) {
  const calls = [];
  const listSedes = async (args) => { calls.push({ operation: "sedes", args }); return [...sedes]; };
  const getMonthlyCommercialSummary = async (args) => {
    calls.push({ operation: "monthly", args });
    const periodo = utils.getBogotaMonthRangeFromInput(args.period) ?? utils.getBogotaMonthRangeFromInput("2026-10");
    const noSales = empty || args.sedeId === 3;
    return {
      periodo,
      utilidad: noSales ? 0 : args.sedeId === 2 ? -1_234.56 : 4_200_000.12,
      ventas: noSales ? 0 : args.sedeId === 2 ? 17 : 64,
      caja: noSales ? 0 : 123_456.78,
      topSedesJalador: noSales ? [] : ranking("SEDE"),
      topVentasSede: noSales ? [] : ranking("Oficina"),
      topJaladores: noSales ? [] : ranking("JALADOR", true),
      topCerradores: noSales ? [] : ranking("Cerrador"),
      topFinancieras: noSales ? [] : ranking("Financiera", true),
    };
  };
  const getFinancialDashboardSummaryForMonthlyReport = async (args) => {
    calls.push({ operation: "financial", args });
    const summary = financialFixture(args.sedeId, empty);
    return {
      source,
      summary,
      snapshot: source === "snapshot" ? {
        periodKey: args.periodKey,
        sedeId: args.sedeId,
        fechaCorte: args.fechaCorte?.toISOString() ?? null,
        capturedAt: snapshotTime,
        summary,
      } : null,
    };
  };
  const dependencies = { ...utils, listSedes, getMonthlyCommercialSummary, getFinancialDashboardSummaryForMonthlyReport, calcularTotalesFinancieros: financialSource.calcularTotalesFinancieros };
  const report = loadTypeScript("lib/monthly-reports-report.ts", {
    "@/lib/access-control": accessControl,
    "@/lib/dashboard-commercial-summary": { getMonthlyCommercialSummary },
    "@/lib/dashboard-financial-summary": { ...financialSource, getFinancialDashboardSummaryForMonthlyReport },
    "@/lib/prisma": { __esModule: true, default: { sede: { findMany: listSedes } } },
    "@/lib/ventas-utils": utils,
  });
  return { ...report, dependencies, calls };
}

test("preserva todos los importes, rankings y consultas anteriores para cada periodo y cobertura válidos", async () => {
  for (const period of ["2026-09", "2026-10"]) {
    for (const sedeId of [undefined, "1", "2", "3"]) {
      const previous = createModules();
      const current = createModules();
      const before = await monthlyReportsBefore({ period, sedeId }, previous.dependencies);
      const view = await current.getMonthlyReportsView(session, { period, sedeId });
      assert.deepEqual(current.calls, previous.calls);
      assert.deepEqual(view.sedes, before.sedes);
      assert.equal(view.consulta.period, before.resumen.periodo.key);
      assert.equal(view.consulta.periodLabel, before.resumen.periodo.label);
      assert.equal(view.consulta.sedeId, before.sedeSeleccionadaId ? String(before.sedeSeleccionadaId) : "");
      assert.equal(view.consulta.cobertura, before.coberturaLabel);
      assert.equal(view.mensual.utilidad, before.resumen.utilidad);
      assert.equal(view.mensual.ventas, before.resumen.ventas);
      assert.deepEqual(view.mensual.financieraLider, before.financieraLider);
      assert.deepEqual(view.financiero, before.financiero);
      assert.deepEqual(view.totales, before.totales);
      assert.deepEqual(view.rankings, {
        oficina: before.resumen.topSedesJalador,
        sede: before.resumen.topVentasSede,
        jalador: before.resumen.topJaladores,
        cerrador: before.resumen.topCerradores,
        financiera: before.resumen.topFinancieras,
      });
    }
  }
});

test("utilidad y ventas son mensuales mientras caja y balance vienen del saldo financiero acumulado al corte", async () => {
  const { getMonthlyReportsView, calls } = createModules();
  const view = await getMonthlyReportsView(session, { period: "2026-09", sedeId: "2" });
  assert.equal(view.mensual.utilidad, -1_234.56);
  assert.equal(view.mensual.ventas, 17);
  assert.equal(view.financiero.cajaDisponible, -7_743_389.5);
  assert.notEqual(view.financiero.cajaDisponible, 123_456.78);
  assert.notEqual(view.totales.resultadoNeto, view.mensual.utilidad);
  assert.deepEqual(calls.find((call) => call.operation === "monthly").args, { period: "2026-09", sedeId: 2 });
  assert.deepEqual(calls.find((call) => call.operation === "financial").args, { periodKey: "2026-09", sedeId: 2, fechaCorte: new Date("2026-10-01T05:00:00.000Z") });
  assert.equal(view.cierre.fechaCorte, "2026-10-01T05:00:00.000Z");
  assert.equal(view.cierre.source, "live");
  assert.equal(view.cierre.capturedAt, null);
});

test("snapshot conserva fuente, captura y todos los valores congelados sin sustituirlos por el mensual", async () => {
  const previous = createModules({ source: "snapshot" });
  const current = createModules({ source: "snapshot" });
  const before = await monthlyReportsBefore({ period: "2026-09", sedeId: "2" }, previous.dependencies);
  const view = await current.getMonthlyReportsView(session, { period: "2026-09", sedeId: "2" });
  assert.deepEqual(current.calls, previous.calls);
  assert.deepEqual(view.financiero, before.lecturaFinanciera.snapshot.summary);
  assert.deepEqual(view.totales, before.totales);
  assert.deepEqual(view.cierre, { source: "snapshot", fechaCorte: "2026-10-01T05:00:00.000Z", capturedAt: snapshotTime });
  assert.equal(view.financiero.totalGastosCartera, -70_046_617);
  assert.equal(view.financiero.financieras.PAYJOY, 1_234_296_394.82);
});

test("los cinco rankings conservan arrays completos, orden, cantidad y montos para Top5/Todos/Montos", async () => {
  const { getMonthlyReportsView } = createModules();
  const view = await getMonthlyReportsView(session, { period: "2026-09" });
  for (const items of Object.values(view.rankings)) {
    assert.equal(items.length, 7);
    assert.deepEqual(items.map((item) => item.total), [7, 6, 5, 4, 3, 2, 1]);
  }
  assert.equal(view.rankings.jalador[0].monto, 700_003.5);
  assert.equal(view.rankings.financiera[6].monto, 100_000.5);
  assert.deepEqual(view.mensual.financieraLider, view.rankings.financiera[0]);
});

test("cobertura inválida conserva el fallback previo a todas y lo muestra como alcance realmente aplicado", async () => {
  for (const sedeId of ["999", "invalida", "0", "-1", "1.5", "TODAS", ""]) {
    const previous = createModules();
    const current = createModules();
    const before = await monthlyReportsBefore({ period: "2026-09", sedeId }, previous.dependencies);
    const view = await current.getMonthlyReportsView(session, { period: "2026-09", sedeId });
    assert.deepEqual(current.calls, previous.calls);
    assert.equal(before.sedeSeleccionadaId, null);
    assert.equal(view.consulta.sedeId, "");
    assert.equal(view.consulta.cobertura, "Todas las sedes");
    for (const call of current.calls.filter((entry) => entry.operation !== "sedes")) assert.equal(call.args.sedeId, null);
  }
});

test("un periodo inválido se normaliza una vez para acoplar el mensual y el cierre financiero al mismo mes de Bogotá", async () => {
  for (const period of ["invalido", "2026-13", undefined, null, ""]) {
    const { getMonthlyReportsView, calls } = createModules();
    const view = await getMonthlyReportsView(session, { period, sedeId: "2" });
    assert.equal(view.consulta.period, "2026-10");
    assert.equal(view.consulta.periodLabel, utils.getBogotaMonthRangeFromInput("2026-10").label);
    const monthly = calls.find((call) => call.operation === "monthly");
    const financial = calls.find((call) => call.operation === "financial");
    assert.equal(monthly.args.period, "2026-10");
    assert.equal(financial.args.periodKey, "2026-10");
    assert.equal(financial.args.fechaCorte.toISOString(), "2026-11-01T05:00:00.000Z");
    assert.equal(view.cierre.fechaCorte, "2026-11-01T05:00:00.000Z");
  }
});

test("ADMIN/AUDITOR conservan acceso y los demás roles o sesión ausente se rechazan antes de leer datos", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", " admin "]) {
    const { getMonthlyReportsView } = createModules();
    assert.equal((await getMonthlyReportsView({ ...session, rolNombre }, { period: "2026-09" })).usuario.rolNombre, rolNombre);
  }
  for (const blocked of [null, { ...session, rolNombre: "SUPERVISOR" }, { ...session, rolNombre: "CAJA" }, { ...session, rolNombre: "VENDEDOR", perfilTipo: "ADMINISTRADOR" }]) {
    const { getMonthlyReportsView, calls } = createModules();
    await assert.rejects(getMonthlyReportsView(blocked, { period: "2026-09" }), (error) => error.code === (blocked ? "FORBIDDEN" : "UNAUTHENTICATED"));
    assert.equal(calls.length, 0);
  }
});

test("vista serializable y corte vacío conservan cero y ausencia real de líder", async () => {
  const { getMonthlyReportsView } = createModules({ empty: true });
  const view = await getMonthlyReportsView(session, { period: "2026-09", sedeId: "3" });
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
  assert.equal(view.mensual.utilidad, 0);
  assert.equal(view.mensual.ventas, 0);
  assert.equal(view.mensual.financieraLider, null);
  assert.deepEqual(view.totales, { totalFinancieras: 0, activos: 0, pasivos: 0, resultadoNeto: 0 });
  for (const items of Object.values(view.rankings)) assert.deepEqual(items, []);
});

test("moneda colombiana conserva signo, centavos y cifras completas sin K/M ni centavos inventados", () => {
  assert.equal(viewHelpers.formatoPesos(-7_743_389.5), "-$ 7.743.389,50");
  assert.equal(viewHelpers.formatoPesos(-1_234.56), "-$ 1.234,56");
  assert.equal(viewHelpers.formatoPesos(-70_046_617), "-$ 70.046.617");
  assert.equal(viewHelpers.formatoPesos(1_234_296_394.82), "$ 1.234.296.394,82");
  assert.equal(viewHelpers.formatoPesos(87_007_927), "$ 87.007.927");
  assert.equal(viewHelpers.formatoPesos(1_234_567_890_123_456), "$ 1.234.567.890.123.456");
  assert.equal(viewHelpers.formatoPesos(0), "$ 0");
  assert.equal(viewHelpers.formatoPesos(-0), "$ 0");
});
