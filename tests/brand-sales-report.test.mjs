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
const productTypes = loadTypeScript("lib/product-types.ts");
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
    "@/lib/product-types": productTypes,
  });
  const report = loadTypeScript("lib/brand-sales-report.ts", {
    "@/lib/access-control": accessControl,
    "@/lib/dashboard-commercial-summary": commercial,
    "@/lib/prisma": { __esModule: true, default: prisma },
  });
  return { ...report, ...commercial, calls };
}

test("separa IPHONE y VIVO del ranking anterior sin alterar otras marcas, referencias ni denominadores por cobertura", async () => {
  for (const sedeId of [null, 1, 2, 3, 4]) {
    const { getBrandSalesReport } = createReportModules();
    const { resumen } = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId });
    const periodo = ventasUtils.getBogotaMonthRangeFromInput("2026-09");
    const selected = fixtureSales.filter((venta) => matchesScope(venta, {
      fecha: { gte: periodo.start, lt: periodo.end },
      ...(sedeId === null ? {} : { sedeId }),
    }));
    const before = brandRankingsBefore(selected);
    // Existing fixtures 7 and 18 are the only categories reclassified from the old ranking.
    const iphoneCount = selected.filter((venta) => venta.id === 7).length;
    const vivoCount = selected.filter((venta) => venta.id === 18).length;
    const expectedBrands = new Map(before.topMarcasVendidas.map((marca) => [marca.nombre, marca.total]));
    if (iphoneCount) {
      expectedBrands.set("IPHONE", iphoneCount);
    }
    if (vivoCount) expectedBrands.set("VIVO", vivoCount);
    if (iphoneCount || vivoCount) expectedBrands.set("OTRAS MARCAS", expectedBrands.get("OTRAS MARCAS") - iphoneCount - vivoCount);
    const expectedNames = [...expectedBrands].filter(([, total]) => total > 0).map(([nombre]) => nombre);
    assert.deepEqual(new Set(resumen.topMarcasVendidas.map((marca) => marca.nombre)), new Set(expectedNames));
    for (const marca of resumen.topMarcasVendidas) {
      assert.equal(marca.total, expectedBrands.get(marca.nombre));
      assert.equal(marca.porcentaje, marca.total / selected.length * 100);
    }
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
  assert.deepEqual(new Set(Object.keys(detalles)), new Set(["INFINIX", "TECNO", "MOTOROLA", "SAMSUNG", "XIAOMI", "OPPO", "HONOR", "IPHONE", "VIVO", "ZTE", "ELECTRODOMÉSTICOS", "FLECHAS", "TABLETS", "OTRAS MARCAS"]));
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
  assert.equal(resumen.topMarcasVendidas.find((item) => item.nombre === "OTRAS MARCAS").total, 4);
  assert.equal(resumen.topMarcasVendidas.find((item) => item.nombre === "IPHONE").total, 1);
  assert.equal(resumen.topMarcasVendidas.find((item) => item.nombre === "VIVO").total, 1);
  assert.equal(resumen.topMarcasVendidas.find((item) => item.nombre === "MOTOROLA").total, 1);
  assert.equal(detalles["OTRAS MARCAS"].find((fila) => fila.sedeId === 1).total, 4);
  assert.equal(detalles["OTRAS MARCAS"].find((fila) => fila.sedeId === 2).total, 0);
  const empatadas = resumen.topMarcasVendidas.filter((marca) => marca.total === 1).map((marca) => marca.nombre);
  assert.deepEqual(empatadas, ["INFINIX", "MOTOROLA", "XIAOMI", "OPPO", "HONOR", "IPHONE", "VIVO"]);
});

test("las referencias de cada marca conservan todas las ventas y su porcentaje dentro de la marca", async () => {
  const { getBrandSalesReport, calls } = createReportModules();
  const { resumen, referenciasPorMarca } = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(referenciasPorMarca, resumen.referenciasPorMarca);
  assert.equal(calls.filter((call) => call.operation === "venta.findMany").length, 1);
  assert.equal(Object.values(referenciasPorMarca).flat().reduce((sum, item) => sum + item.total, 0), resumen.ventas);
  for (const marca of resumen.topMarcasVendidas) {
    const referencias = referenciasPorMarca[marca.nombre];
    assert.equal(referencias.reduce((sum, item) => sum + item.total, 0), marca.total);
    assert.ok(Math.abs(referencias.reduce((sum, item) => sum + item.porcentaje, 0) - 100) < 1e-10);
    for (const ref of referencias) {
      assert.equal(ref.porcentaje, ref.total / marca.total * 100);
      assert.equal(ref.total, resumen.referenciasVendidas.find((item) => item.nombre === ref.nombre).total);
    }
  }
  assert.deepEqual(referenciasPorMarca["OTRAS MARCAS"].map((item) => [item.nombre, item.total]), [["SIN REFERENCIA", 2], ["REALME C67", 1], ["SAMSUNGX", 1]]);
  assert.deepEqual(referenciasPorMarca.VIVO.map((item) => [item.nombre, item.total]), [["VIVO Y36", 1]]);
  assert.deepEqual(referenciasPorMarca.IPHONE.map((item) => [item.nombre, item.total]), [["APPLE IPHONE 12", 1]]);
});

test("VIVO reconoce nombres normalizados y compactos sin incluir prefijos ajenos ni duplicar financieras", async () => {
  const rows = [
    sale(40, 1, "  vivo   y05 128gb "),
    { ...sale(41, 2, "VIVO Y05 128GB"), financierasDetalle: [
      { nombre: "PAYJOY", valorBruto: 50_000, valorNeto: 50_000 },
      { nombre: "ADDI", valorBruto: 50_000, valorNeto: 46_000 },
    ] },
    sale(42, 2, "vivoY36 256GB"),
    sale(43, 3, null, "VIVO V50 256GB"),
    sale(44, 1, "VIVOV50 256GB"),
    sale(45, 1, "VIVOTEK IP CAMERA"),
    sale(46, 2, "LGVIVOY05"),
    sale(47, 3, "REALME C67"),
    sale(48, 1, "IPHONE 13"),
    sale(49, 2, "IPHONE13"),
  ];
  const { getBrandSalesReport } = createReportModules(rows);
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(report.resumen.ventas, 10);
  assert.deepEqual(report.resumen.topMarcasVendidas.map((marca) => [marca.nombre, marca.total, marca.porcentaje]), [["VIVO", 5, 50], ["OTRAS MARCAS", 3, 30], ["IPHONE", 2, 20]]);
  assert.equal(report.referenciasPorMarca.VIVO.length, 4);
  assert.equal(report.referenciasPorMarca.VIVO[0].nombre, "VIVO Y05 128GB");
  assert.equal(report.referenciasPorMarca.VIVO[0].total, 2);
  assert.equal(report.referenciasPorMarca.VIVO[0].porcentaje, 40);
  assert.deepEqual(new Set(report.referenciasPorMarca["OTRAS MARCAS"].map((item) => item.nombre)), new Set(["VIVOTEK IP CAMERA", "LGVIVOY05", "REALME C67"]));
  const scoped = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId: "2" });
  assert.equal(scoped.resumen.ventas, 4);
  assert.deepEqual(new Set(scoped.referenciasPorMarca.VIVO.map((item) => item.nombre)), new Set(["VIVO Y05 128GB", "VIVOY36 256GB"]));
  assert.equal(scoped.referenciasPorMarca.VIVO.reduce((sum, item) => sum + item.total, 0), 2);
  assert.equal(scoped.referenciasPorMarca.VIVO.every((item) => item.porcentaje === 50), true);
  assert.deepEqual(scoped.referenciasPorMarca["OTRAS MARCAS"].map((item) => item.nombre), ["LGVIVOY05"]);
  const empty = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId: "4" });
  assert.equal(Object.values(empty.referenciasPorMarca).every((refs) => refs.length === 0), true);
});

test("ZTE mantiene medición y referencias propias por sede, sin reconocer marcas con prefijos similares", async () => {
  const rows = [
    sale(60, 1, "  zte blade a35  "),
    sale(61, 2, "ZTEA35E 64GB"),
    sale(62, 2, null, "ZTE BLADE V70 DESIGN 256GB"),
    sale(63, 1, "AZTECA EQUIPO"),
    sale(64, 2, "BZTEA35E"),
  ];
  const { getBrandSalesReport } = createReportModules(rows);
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(report.resumen.ventas, 5);
  assert.deepEqual(report.resumen.topMarcasVendidas.map((item) => [item.nombre, item.total, item.porcentaje]), [["ZTE", 3, 60], ["OTRAS MARCAS", 2, 40]]);
  assert.equal(report.referenciasPorMarca.ZTE.length, 3);
  assert.equal(report.referenciasPorMarca.ZTE.reduce((sum, item) => sum + item.total, 0), 3);
  assert.deepEqual(new Set(report.referenciasPorMarca["OTRAS MARCAS"].map((item) => item.nombre)), new Set(["AZTECA EQUIPO", "BZTEA35E"]));
  const scoped = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId: "2" });
  assert.equal(scoped.resumen.ventas, 3);
  assert.equal(scoped.referenciasPorMarca.ZTE.length, 2);
  assert.equal(scoped.referenciasPorMarca.ZTE.every((item) => item.porcentaje === 50), true);
  assert.deepEqual(scoped.detalles.ZTE, [{ sedeId: 2, nombre: "Bogotá", total: 2, porcentaje: 100 }]);
});

test("electrodomésticos usa la categoría guardada o referencias claras de legado y conserva los demás productos", async () => {
  function typedSale(id, sedeId, reference, tipoProducto) {
    const row = sale(id, sedeId, reference);
    row.inventarioSede.tipoProducto = tipoProducto;
    return row;
  }
  const appliances = [
    typedSale(70, 1, "PRODUCTO QA SIN MODELO", "ELECTRODOMESTICO"),
    typedSale(71, 1, "PC GENERICO REGISTRADO", "ELECTRODOMÉSTICOS"),
    typedSale(72, 2, "NEVERA SAMSUNG 254L", "TELEFONIA"),
    sale(73, 2, "SAMSUNG TV55 CRYSTAL"),
    typedSale(74, 3, "TELEVISOR KALLEY", "TELEVISORES"),
    typedSale(75, 3, "REFERENCIA INCOMPLETA", "NEVERA"),
    sale(76, 3, null, "LAVADORA HACEB"),
    // An explicit saved category is authoritative, even when its label resembles a phone.
    typedSale(77, 2, "IPHONE 13 REGISTRADO COMO ELECTRO", "ELECTRODOMESTICO"),
    typedSale(78, 1, "FREIDORA DE AIRE OSTER", "TELEFONIA"),
    sale(79, 1, "LICUADORA OSTER"),
  ];
  const otherProducts = [
    sale(80, 1, "COMPUTADOR LENOVO 256GB"), sale(81, 2, "TABLET IPAD 10"),
    sale(82, 3, "SMARTWATCH GENERICO"), sale(83, 3, "CONSOLA PS5"),
  ];
  const phones = [typedSale(84, 1, "SAMSUNG A16", "TELEFONIA"), typedSale(85, 2, "IPHONE 13", "TELEFONIA"), typedSale(86, 3, "VIVO Y05", "TELEFONIA")];
  const { getBrandSalesReport, calls } = createReportModules([...appliances, ...otherProducts, ...phones]);
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(report.resumen.ventas, 17);
  const electro = report.resumen.topMarcasVendidas.find((item) => item.nombre === "ELECTRODOMÉSTICOS");
  assert.equal(electro.total, 10);
  assert.equal(electro.porcentaje, 10 / 17 * 100);
  assert.equal(report.referenciasPorMarca["ELECTRODOMÉSTICOS"].length, 10);
  assert.equal(report.referenciasPorMarca["ELECTRODOMÉSTICOS"].every((item) => item.total === 1 && item.porcentaje === 10), true);
  assert.equal(report.referenciasPorMarca["OTRAS MARCAS"].length, 3);
  assert.deepEqual(report.referenciasPorMarca.TABLETS.map((item) => item.nombre), ["TABLET IPAD 10"]);
  assert.equal(report.resumen.topMarcasVendidas.find((item) => item.nombre === "SAMSUNG").total, 1);
  assert.equal(report.resumen.topMarcasVendidas.find((item) => item.nombre === "IPHONE").total, 1);
  assert.equal(report.resumen.topMarcasVendidas.find((item) => item.nombre === "VIVO").total, 1);
  assert.equal(report.resumen.topMarcasVendidas.reduce((sum, item) => sum + item.total, 0), 17);
  assert.equal(report.resumen.ingresos, 1_700_000);
  assert.equal(calls.filter((call) => call.operation === "venta.findMany").length, 1);
  assert.equal(calls.find((call) => call.operation === "venta.findMany").args.select.inventarioSede.select.tipoProducto, true);
  const scoped = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId: "2" });
  assert.equal(scoped.resumen.ventas, 5);
  assert.deepEqual(new Set(scoped.referenciasPorMarca["ELECTRODOMÉSTICOS"].map((item) => item.nombre)), new Set(["NEVERA SAMSUNG 254L", "SAMSUNG TV55 CRYSTAL", "IPHONE 13 REGISTRADO COMO ELECTRO"]));
  assert.equal(scoped.referenciasPorMarca["ELECTRODOMÉSTICOS"].reduce((sum, item) => sum + item.total, 0), 3);
});

test("IPHONE agrupa modelos y variantes de escritura, conserva su distribución y no duplica ventas", async () => {
  const phones = [
    sale(30, 1, "  iphone 13 PRO MAX 128gb  "),
    sale(31, 1, "APPLE IPHONE 12"),
    sale(32, 2, "Iphone15PRO 256GB"),
    sale(33, 2, "IPHONE-16 EXHIBICIÓN"),
    sale(34, 3, "iPhoneXR 128GB"),
    sale(35, 3, null, "  Apple iPhone SE 2022  "),
    { ...sale(36, 1, "IPHONE SE2022"), financierasDetalle: [
      { nombre: "PAYJOY", valorBruto: 50_000, valorNeto: 50_000 },
      { nombre: "ADDI", valorBruto: 50_000, valorNeto: 46_000 },
    ] },
  ];
  const others = [sale(37, 1, "APPLE IPAD 10"), sale(38, 2, "APPLE WATCH"), sale(39, 2, "SAMSUNG A16")];
  const { getBrandSalesReport } = createReportModules([...phones, ...others]);
  const { resumen, detalles } = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(resumen.ventas, 10);
  assert.equal(resumen.topMarcasVendidas.find((marca) => marca.nombre === "IPHONE").total, 7);
  assert.equal(resumen.topMarcasVendidas.find((marca) => marca.nombre === "IPHONE").porcentaje, 70);
  assert.equal(resumen.topMarcasVendidas.find((marca) => marca.nombre === "OTRAS MARCAS").total, 1);
  assert.equal(resumen.topMarcasVendidas.find((marca) => marca.nombre === "TABLETS").total, 1);
  assert.equal(resumen.topMarcasVendidas.reduce((sum, marca) => sum + marca.total, 0), 10);
  assert.deepEqual(detalles.IPHONE.map((sede) => [sede.sedeId, sede.total]).sort((a, b) => a[0] - b[0]), [[1, 3], [2, 2], [3, 2], [4, 0], [5, 0]]);
  assert.equal(detalles.IPHONE.reduce((sum, sede) => sum + sede.total, 0), 7);
  const scoped = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId: "2" });
  assert.equal(scoped.resumen.ventas, 4);
  assert.equal(scoped.resumen.topMarcasVendidas.find((marca) => marca.nombre === "IPHONE").total, 2);
  assert.deepEqual(scoped.detalles.IPHONE, [{ sedeId: 2, nombre: "Bogotá", total: 2, porcentaje: 100 }]);
});

test("el alias de exhibición solicitado cuenta como IPHONE y conserva la referencia sin ampliar a modelos ambiguos", async () => {
  const rows = [
    sale(100, 1, "  16   pro max de exhibicion  "),
    { ...sale(101, 2, "16 PRO MAX DE EXHIBICIÓN"), inventarioSede: { referencia: "16 PRO MAX DE EXHIBICIÓN", tipoProducto: "ELECTRODOMESTICO" } },
    sale(102, 2, "16 PRO MAX"),
    sale(103, 3, "16 PRO MAX OTRO PRODUCTO"),
  ];
  const original = structuredClone(rows);
  const { getBrandSalesReport } = createReportModules(rows);
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(report.resumen.topMarcasVendidas.find((item) => item.nombre === "IPHONE").total, 2);
  assert.deepEqual(new Set(report.referenciasPorMarca.IPHONE.map((item) => item.nombre)), new Set(["16 PRO MAX DE EXHIBICION", "16 PRO MAX DE EXHIBICIÓN"]));
  assert.deepEqual(new Set(report.referenciasPorMarca["OTRAS MARCAS"].map((item) => item.nombre)), new Set(["16 PRO MAX", "16 PRO MAX OTRO PRODUCTO"]));
  assert.deepEqual(rows, original);
  const scoped = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId: "2" });
  assert.equal(scoped.resumen.ventas, 2);
  assert.deepEqual(scoped.detalles.IPHONE, [{ sedeId: 2, nombre: "Bogotá", total: 1, porcentaje: 100 }]);
  assert.deepEqual(scoped.referenciasPorMarca.IPHONE.map((item) => item.nombre), ["16 PRO MAX DE EXHIBICIÓN"]);
});

test("REDMI cuenta en XIAOMI con sus variantes de escritura y cada venta financiada cuenta una vez", async () => {
  const rows = [
    sale(110, 1, "REDMI NOTE 17 PRO 256GB"),
    { ...sale(111, 2, "  redmi note 17 pro max  "), inventarioSede: { referencia: "  redmi note 17 pro max  ", tipoProducto: "ELECTRODOMESTICO" } },
    sale(112, 3, null, "REDMI A7PRO DE 128"),
    sale(113, 2, "REDMINOTE17 256GB"),
    sale(114, 1, "REDMI_NOTE_15 PRO 5G"),
    { ...sale(115, 2, "XIAOMI REDMI 15"), financierasDetalle: [
      { nombre: "PAYJOY", valorBruto: 50_000, valorNeto: 50_000 },
      { nombre: "ADDI", valorBruto: 50_000, valorNeto: 46_000 },
    ] },
    sale(116, 3, "REALME C67"),
  ];
  const { getBrandSalesReport, calls } = createReportModules(rows);
  const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09" });
  assert.equal(report.resumen.ventas, 7);
  assert.equal(report.resumen.topMarcasVendidas.find((item) => item.nombre === "XIAOMI").total, 6);
  assert.equal(report.referenciasPorMarca.XIAOMI.length, 6);
  assert.equal(report.referenciasPorMarca.XIAOMI.every((item) => item.total === 1 && item.porcentaje === 1 / 6 * 100), true);
  assert.deepEqual(report.referenciasPorMarca["OTRAS MARCAS"].map((item) => item.nombre), ["REALME C67"]);
  assert.equal(calls.filter((call) => call.operation === "venta.findMany").length, 1);
  assert.equal(report.resumen.ingresos, 700_000);
  const scoped = await getBrandSalesReport({ rolNombre: "AUDITOR" }, { period: "2026-09", sedeId: "2" });
  assert.equal(scoped.resumen.ventas, 3);
  assert.equal(scoped.referenciasPorMarca.XIAOMI.reduce((sum, item) => sum + item.total, 0), 3);
  assert.deepEqual(scoped.detalles.XIAOMI, [{ sedeId: 2, nombre: "Bogotá", total: 3, porcentaje: 100 }]);
});

test("FLECHAS y TABLETS tienen grupos exclusivos, referencias completas y prioridad frente a marca o tipo de legado", async () => {
  function typed(id, sedeId, reference, tipoProducto) {
    const row = sale(id, sedeId, reference);
    row.inventarioSede.tipoProducto = tipoProducto;
    return row;
  }
  const categories = [
    [sale(120, 1, "FLECHA CORN"), "FLECHAS"],
    [sale(121, 2, "FLECHAS NOKIA 110 4G"), "FLECHAS"],
    [typed(122, 3, "NOKIA 105", "FLECHA"), "FLECHAS"],
    [sale(123, 1, "TABLET REDMI PAD2"), "TABLETS"],
    [sale(124, 2, "REDMI PAD 2"), "TABLETS"],
    [sale(125, 3, "TABLETA LENOVO CON TECLADO"), "TABLETS"],
    [sale(126, 1, "APPLE IPAD A16"), "TABLETS"],
    [sale(127, 2, "IPADA16 128GB"), "TABLETS"],
    [sale(128, 3, "SAMSUNG GALAXY TAB A9"), "TABLETS"],
    [sale(129, 1, "SAMSUNG TAB S9 FE"), "TABLETS"],
    [typed(130, 2, "XIAOMI PAD 7", "ELECTRODOMESTICO"), "TABLETS"],
    [typed(131, 3, "REFERENCIA SIN MODELO", "TABLET"), "TABLETS"],
    [typed(132, 1, "OTRA REFERENCIA", "TABLETA"), "TABLETS"],
    [typed(133, 2, "PRODUCTO SIN MODELO", "IPAD"), "TABLETS"],
    [sale(134, 3, "COMPUTADOR HP 14"), "ELECTRODOMÉSTICOS"],
    [sale(135, 1, "computador   hp 14"), "ELECTRODOMÉSTICOS"],
    [sale(136, 2, "COMPUTADOR LENOVO 256GB"), "OTRAS MARCAS"],
    [sale(137, 3, "COMPUTADOR HP 140"), "OTRAS MARCAS"],
    [sale(138, 1, "CABLE TABLETOP"), "OTRAS MARCAS"],
    [sale(139, 2, "SAMSUNG A16"), "SAMSUNG"],
    [sale(140, 3, "REDMI NOTE 17 PRO MAX"), "XIAOMI"],
  ];
  const rows = categories.map(([row]) => row);
  const original = structuredClone(rows);
  const { getBrandSalesReport, calls } = createReportModules(rows);
  for (const sedeId of [null, 1, 2, 3, 4]) {
    const report = await getBrandSalesReport({ rolNombre: "ADMIN" }, { period: "2026-09", sedeId });
    const selected = categories.filter(([row]) => sedeId === null || row.sede.id === sedeId);
    assert.equal(report.resumen.ventas, selected.length);
    assert.equal(report.resumen.ingresos, selected.length * 100_000);
    assert.equal(report.resumen.topMarcasVendidas.reduce((sum, item) => sum + item.total, 0), selected.length);
    assert.equal(Object.values(report.referenciasPorMarca).flat().reduce((sum, item) => sum + item.total, 0), selected.length);
    for (const group of ["FLECHAS", "TABLETS", "ELECTRODOMÉSTICOS", "OTRAS MARCAS", "SAMSUNG", "XIAOMI"]) {
      const expected = selected.filter(([, name]) => name === group);
      const references = report.referenciasPorMarca[group];
      assert.equal(references.reduce((sum, item) => sum + item.total, 0), expected.length, `${group}: sede ${sedeId}`);
      assert.deepEqual(new Set(references.map((item) => item.nombre)), new Set(expected.map(([row]) => row.inventarioSede.referencia.trim().replace(/\s+/g, " ").toUpperCase())));
      assert.equal(report.detalles[group].reduce((sum, item) => sum + item.total, 0), expected.length);
      if (expected.length) {
        const ranking = report.resumen.topMarcasVendidas.find((item) => item.nombre === group);
        assert.equal(ranking.porcentaje, expected.length / selected.length * 100);
        assert.ok(Math.abs(references.reduce((sum, item) => sum + item.porcentaje, 0) - 100) < 1e-10);
      }
    }
  }
  assert.equal(calls.filter((call) => call.operation === "venta.findMany").length, 5);
  assert.deepEqual(rows, original);
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
