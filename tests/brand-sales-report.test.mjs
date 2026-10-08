import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { brandRankingsBefore } from "./fixtures/commercial-brand-rankings-before.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function loadTypeScript(relativePath, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(join(ROOT, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const testModule = { exports: {} };
  const requireMock = (specifier) => {
    assert.ok(specifier in imports, `Dependencia de prueba inesperada: ${specifier}`);
    return imports[specifier];
  };
  const execute = new Function("require", "module", "exports", outputText);
  execute(requireMock, testModule, testModule.exports);
  return testModule.exports;
}

const financieras = loadTypeScript("lib/ventas-financieras.ts");
const ventasUtils = loadTypeScript("lib/ventas-utils.ts", { "@/lib/ventas-financieras": financieras });
const accessControl = loadTypeScript("lib/access-control.ts");
const referenceRanking = loadTypeScript("lib/reference-sales-ranking.ts");
const sedes = [
  { id: 1, nombre: "Stand Solutions" },
  { id: 2, nombre: "Bogotá" },
  { id: 3, nombre: "SEDE 3" },
  { id: 4, nombre: "Sin ventas" },
  { id: 5, nombre: "Sede histórica inactiva" },
];

function sale(id, sedeId, referencia, descripcion = null, fecha = "2026-09-10T15:00:00.000Z") {
  return {
    id,
    fecha: new Date(fecha),
    ingreso: 100_000,
    utilidad: 10_000,
    cajaOficina: 5_000,
    descripcion,
    inventarioSede: referencia === null ? null : { referencia },
    sede: sedes.find((sede) => sede.id === sedeId),
    jalador: null,
    cerrador: null,
    comision: 0,
  };
}

const fixtureSales = [
  sale(1, 1, " Samsung   A16 ", "OPPO A17"),
  sale(2, 2, null, " tecno  SPARK 30 "),
  sale(3, 1, "INFINIX HOT 50"),
  sale(4, 2, "TECNO SPARK 30"),
  sale(5, 1, null),
  sale(6, 1, "   ", "SAMSUNG A25"),
  sale(7, 2, "APPLE IPHONE 12"),
  {
    ...sale(8, 3, "SAMSUNG A16"),
    financierasDetalle: [
      { nombre: "PAYJOY", valorBruto: 50_000, valorNeto: 50_000 },
      { nombre: "ADDI", valorBruto: 50_000, valorNeto: 46_000 },
    ],
  },
  sale(9, 2, "Samsung-Motorola COMBO"),
  sale(10, 3, "XIAOMI REDMI 15"),
  sale(11, 1, "OPPO A17"),
  sale(12, 2, "HONOR X8"),
  sale(13, 1, "SAMSUNGX"),
  sale(14, 1, "", "SAMSUNG A16", "2026-09-01T05:00:00.000Z"),
  sale(15, 1, "TECNO ANTERIOR", null, "2026-09-01T04:59:59.999Z"),
  sale(16, 2, "HONOR OCTUBRE", null, "2026-10-01T05:00:00.000Z"),
  sale(17, 1, "REALME C67"),
  sale(18, 2, "VIVO Y36"),
];

function matchesScope(venta, where) {
  return venta.fecha >= where.fecha.gte && venta.fecha < where.fecha.lt &&
    (where.sedeId === undefined || venta.sede.id === where.sedeId);
}

function createReportModules(rows = fixtureSales, coverageSedes = sedes) {
  const calls = [];
  const prisma = {
    sede: {
      findMany: async (args) => {
        calls.push({ operation: "sede.findMany", args });
        return [...coverageSedes].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      },
    },
    venta: {
      aggregate: async (args) => {
        calls.push({ operation: "venta.aggregate", args });
        const selected = rows.filter((venta) => matchesScope(venta, args.where));
        return {
          _sum: {
            ingreso: selected.reduce((acc, venta) => acc + venta.ingreso, 0),
            utilidad: selected.reduce((acc, venta) => acc + venta.utilidad, 0),
            cajaOficina: selected.reduce((acc, venta) => acc + venta.cajaOficina, 0),
          },
          _count: { id: selected.length },
        };
      },
      findMany: async (args) => {
        calls.push({ operation: "venta.findMany", args });
        return rows.filter((venta) => matchesScope(venta, args.where));
      },
    },
    cajaMovimiento: {
      groupBy: async (args) => { calls.push({ operation: "cajaMovimiento.groupBy", args }); return []; },
    },
  };
  const commercial = loadTypeScript("lib/dashboard-commercial-summary.ts", {
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/ventas-utils": ventasUtils,
    "@/lib/ventas-financieras": financieras,
  });
  const report = loadTypeScript("lib/brand-sales-report.ts", {
    "@/lib/access-control": accessControl,
    "@/lib/dashboard-commercial-summary": commercial,
    "@/lib/prisma": { __esModule: true, default: prisma },
  });
  return { ...report, ...commercial, calls };
}

test("las marcas, referencias, puestos y denominadores coinciden con la versión anterior para cada cobertura", async () => {
  for (const sedeId of [null, 1, 2, 3, 4]) {
    const { getBrandSalesReport } = createReportModules();
    const { resumen } = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId });
    const periodo = ventasUtils.getBogotaMonthRangeFromInput("2026-09");
    const selected = fixtureSales.filter((venta) => matchesScope(venta, {
      fecha: { gte: periodo.start, lt: periodo.end },
      ...(sedeId === null ? {} : { sedeId }),
    }));
    const before = brandRankingsBefore(selected);
    assert.deepEqual(resumen.topMarcasVendidas, before.topMarcasVendidas);
    assert.deepEqual(resumen.topReferenciasVendidas, before.topReferenciasVendidas);
    assert.deepEqual(resumen.referenciasVendidas, before.referenciasVendidas);
    assert.equal(resumen.ventas, selected.length);
    assert.equal(resumen.topMarcasVendidas.reduce((acc, marca) => acc + marca.total, 0), selected.length);
    assert.equal(resumen.referenciasVendidas.reduce((acc, referencia) => acc + referencia.total, 0), selected.length);
  }
});

test("el detalle sale del mismo recorrido y cada venta aporta una vez, incluso con varias financieras", async () => {
  const { getBrandSalesReport, calls } = createReportModules();
  const { resumen, detalles, coberturas } = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09" });
  assert.equal(resumen.ventas, 16);
  assert.equal(resumen.referenciasVendidas.length, 12);
  assert.equal(resumen.topReferenciasVendidas.length, 10);
  assert.equal(calls.filter((call) => call.operation === "venta.findMany").length, 1);
  assert.deepEqual(new Set(Object.keys(detalles)), new Set(["INFINIX", "TECNO", "MOTOROLA", "SAMSUNG", "XIAOMI", "OPPO", "HONOR", "OTRAS MARCAS"]));
  for (const marca of resumen.topMarcasVendidas) {
    const filas = detalles[marca.nombre];
    assert.equal(filas.length, coberturas.length);
    assert.equal(new Set(filas.map((fila) => fila.sedeId)).size, coberturas.length);
    assert.equal(filas.reduce((acc, fila) => acc + fila.total, 0), marca.total);
    assert.ok(Math.abs(filas.reduce((acc, fila) => acc + fila.porcentaje, 0) - 100) < 1e-10);
    assert.equal(filas.find((fila) => fila.sedeId === 4).total, 0);
  }
  assert.equal(detalles.SAMSUNG.find((fila) => fila.sedeId === 3).total, 1);
  assert.equal(detalles.SAMSUNG.find((fila) => fila.sedeId === 1).total, 2);
});

test("conserva prioridad inventario/descripción, SIN REFERENCIA, coincidencia por palabra y OTRAS MARCAS", async () => {
  const { getBrandSalesReport } = createReportModules();
  const { resumen, detalles } = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(resumen.referenciasVendidas.find((item) => item.nombre === "SIN REFERENCIA").total, 2);
  assert.equal(resumen.referenciasVendidas.some((item) => item.nombre === "SAMSUNG A25"), false);
  assert.equal(resumen.topMarcasVendidas.find((item) => item.nombre === "OTRAS MARCAS").total, 6);
  assert.equal(resumen.topMarcasVendidas.find((item) => item.nombre === "MOTOROLA").total, 1);
  assert.equal(detalles["OTRAS MARCAS"].find((fila) => fila.sedeId === 1).total, 4);
  assert.equal(detalles["OTRAS MARCAS"].find((fila) => fila.sedeId === 2).total, 2);
  const empatadas = resumen.topMarcasVendidas.filter((marca) => marca.total === 1).map((marca) => marca.nombre);
  assert.deepEqual(empatadas, ["INFINIX", "MOTOROLA", "XIAOMI", "OPPO", "HONOR"]);
});

test("una sede válida con nombre vacío conserva la venta en el detalle y no cambia rankings antiguos", async () => {
  const sedeSinNombre = { id: 99, nombre: "" };
  const rows = [{ ...sale(19, 1, "SAMSUNG A16"), sede: sedeSinNombre }];
  const { getBrandSalesReport } = createReportModules(rows, [...sedes, sedeSinNombre]);
  const { resumen, detalles } = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId: 99 });
  const before = brandRankingsBefore(rows);
  assert.deepEqual(resumen.topMarcasVendidas, before.topMarcasVendidas);
  assert.deepEqual(resumen.referenciasVendidas, before.referenciasVendidas);
  assert.equal(resumen.ventas, 1);
  assert.deepEqual(resumen.topVentasSede, []);
  assert.deepEqual(resumen.rendimientoPorSede, []);
  assert.deepEqual(detalles.SAMSUNG, [{ sedeId: 99, nombre: "", total: 1, porcentaje: 100 }]);
  assert.equal(detalles.SAMSUNG.reduce((acc, fila) => acc + fila.total, 0), resumen.topMarcasVendidas[0].total);
});

test("el periodo comercial mantiene límites inclusivo/exclusivo de Bogotá en todas las consultas", async () => {
  const { getBrandSalesReport, calls } = createReportModules();
  const septiembre = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(septiembre.resumen.periodo.start.toISOString(), "2026-09-01T05:00:00.000Z");
  assert.equal(septiembre.resumen.periodo.end.toISOString(), "2026-10-01T05:00:00.000Z");
  assert.equal(septiembre.resumen.tendenciaDiaria[0].ventas, 1);
  for (const call of calls.filter((item) => item.operation.startsWith("venta."))) {
    assert.equal(call.args.where.fecha.gte.toISOString(), "2026-09-01T05:00:00.000Z");
    assert.equal(call.args.where.fecha.lt.toISOString(), "2026-10-01T05:00:00.000Z");
  }
  const octubre = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-10" });
  assert.equal(octubre.resumen.ventas, 1);
  assert.deepEqual(octubre.resumen.topMarcasVendidas.map((marca) => marca.nombre), ["HONOR"]);
});

test("filtrar sede actualiza resumen, referencias y todos los detalles sin cambiar el universo autorizado", async () => {
  const { getBrandSalesReport, calls } = createReportModules();
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId: "2" });
  assert.deepEqual(report.coberturaAplicada, { sedeId: 2, nombre: "Bogotá" });
  assert.equal(report.coberturas.length, 5);
  assert.equal(report.resumen.ventas, 6);
  for (const filas of Object.values(report.detalles)) {
    assert.equal(filas.length, 1);
    assert.equal(filas[0].sedeId, 2);
    assert.equal(filas[0].porcentaje, filas[0].total > 0 ? 100 : 0);
  }
  for (const call of calls.filter((item) => item.operation !== "sede.findMany")) assert.equal(call.args.where.sedeId, 2);
});

test("sede real sin ventas y corte vacío conservan filas cero sin NaN ni líderes inventados", async () => {
  const { getBrandSalesReport } = createReportModules();
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId: 4 });
  assert.equal(report.resumen.ventas, 0);
  assert.deepEqual(report.resumen.topMarcasVendidas, []);
  assert.deepEqual(report.resumen.topReferenciasVendidas, []);
  for (const filas of Object.values(report.detalles)) assert.deepEqual(filas, [{ sedeId: 4, nombre: "Sin ventas", total: 0, porcentaje: 0 }]);
  const empty = await createReportModules([]).getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  for (const filas of Object.values(empty.detalles)) {
    assert.equal(filas.length, 5);
    for (const fila of filas) { assert.equal(fila.total, 0); assert.equal(fila.porcentaje, 0); }
  }
});

test("mantiene acceso exclusivamente por rol ADMIN o AUDITOR y rechaza los demás antes de consultar datos", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", " admin "]) {
    const { getBrandSalesReport } = createReportModules();
    assert.equal((await getBrandSalesReport({ rolNombre }, { period: "2026-09" })).resumen.ventas, 16);
  }
  for (const session of [null, { rolNombre: "SUPERVISOR" }, { rolNombre: "CAJA" }, { rolNombre: "VENDEDOR" }, { rolNombre: "APOYO_OPERATIVO" }, { rolNombre: "SUPERVISOR", perfilTipo: "ADMINISTRADOR" }]) {
    const { getBrandSalesReport, calls } = createReportModules();
    await assert.rejects(getBrandSalesReport(session, { period: "2026-09" }), (error) => error.code === "FORBIDDEN");
    assert.equal(calls.length, 0);
  }
});

test("cobertura inválida o inexistente produce error y jamás cae a todas las sedes", async () => {
  for (const sedeId of ["invalida", "TODAS ", "2.5", "-1", "1e2", "0", 0, -1, 2.5, 999, Number.NaN, Number.POSITIVE_INFINITY, true, ["1"], {}]) {
    const { getBrandSalesReport, calls } = createReportModules();
    await assert.rejects(getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId }), (error) => error.code === "INVALID_SCOPE");
    assert.equal(calls.some((call) => call.operation.startsWith("venta.")), false);
    assert.equal(calls.some((call) => call.operation === "cajaMovimiento.groupBy"), false);
  }
  for (const sedeId of [undefined, null, "", "TODAS"]) {
    const { getBrandSalesReport } = createReportModules();
    assert.deepEqual((await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId })).coberturaAplicada, { sedeId: null, nombre: "Todas las sedes" });
  }
});

test("conserva la regla anterior de periodo ausente o inválido usando el mes actual de Bogotá", async () => {
  for (const period of [undefined, null, "", "invalid"]) {
    const { getBrandSalesReport } = createReportModules();
    const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period });
    assert.equal(report.resumen.periodo.key, ventasUtils.getCurrentBogotaMonthRange().key);
  }
});

test("la búsqueda de referencias incluye más de diez resultados y mantiene puestos y porcentajes del corte", () => {
  const allItems = Array.from({ length: 14 }, (_, index) => ({
    nombre: `SAMSUNG A${String(index + 1).padStart(2, "0")}`,
    total: 14 - index,
    porcentaje: ((14 - index) / 105) * 100,
  }));
  const topItems = allItems.slice(0, 10);
  const original = structuredClone(allItems);
  const results = referenceRanking.getReferenceRanking({ topItems, allItems, query: "  sámsung  ", showAll: false });
  assert.equal(results.length, 14);
  results.forEach((result, index) => {
    assert.equal(result.item, allItems[index]);
    assert.equal(result.puesto, index + 1);
    assert.equal(result.item.porcentaje, original[index].porcentaje);
  });
  const outsideTop = referenceRanking.getReferenceRanking({ topItems, allItems, query: " samsung   a12 ", showAll: false });
  assert.equal(outsideTop.length, 1);
  assert.equal(outsideTop[0].puesto, 12);
  assert.equal(outsideTop[0].item, allItems[11]);
  assert.deepEqual(allItems, original);
});

test("expandir y limpiar búsqueda conservan el ranking completo y los diez originales", () => {
  const allItems = Array.from({ length: 14 }, (_, index) => ({ nombre: `REFERENCIA ${index + 1}`, total: 1, porcentaje: 100 / 14 }));
  const topItems = allItems.slice(0, 10);
  const collapsed = referenceRanking.getReferenceRanking({ topItems, allItems, query: "", showAll: false });
  const expanded = referenceRanking.getReferenceRanking({ topItems, allItems, query: "", showAll: true });
  assert.equal(collapsed.length, 10);
  assert.equal(expanded.length, 14);
  assert.deepEqual(collapsed.map((result) => result.puesto), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(expanded.map((result) => result.item), allItems);
  const filtered = referenceRanking.getReferenceRanking({ topItems, allItems, query: "REFERENCIA 14", showAll: false });
  assert.equal(filtered[0].puesto, 14);
  assert.equal(referenceRanking.normalizarBusquedaReferencias("  SAMSÚNG   Á16  "), "SAMSUNG A16");
});
