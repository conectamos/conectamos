import prisma from "@/lib/prisma";
import {
  getBogotaDateKey,
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthRange,
} from "@/lib/ventas-utils";
import { extraerFinancierasDetalle } from "@/lib/ventas-financieras";
import { esElectrodomestico } from "@/lib/product-types";

const CONCEPTO_GASTO_CARTERA = "GASTO CARTERA";
const CATEGORIA_ELECTRODOMESTICOS = "ELECTRODOMÉSTICOS";
const CATEGORIA_FLECHAS = "FLECHAS";
const CATEGORIA_TABLETS = "TABLETS";
const CATEGORIA_PORTATILES = "PORTÁTILES";
const CATEGORIA_CONSOLAS = "CONSOLAS";
const BRAND_REFERENCE_ALIASES: Readonly<Record<string, string>> = {
  "16 PRO MAX DE EXHIBICION": "IPHONE",
  "COMPUTADOR HP 14": CATEGORIA_ELECTRODOMESTICOS,
  "LENOVO B15": CATEGORIA_PORTATILES,
  "MOTO G85 G5 256GB": "MOTOROLA",
  "NOTE 60 PRO": "INFINIX",
  "S26 ULTRA 512": "SAMSUNG",
  "SAMSING A37 DE 256": "SAMSUNG",
  "SAMSUG S26 ULTRA": "SAMSUNG",
  "SMART WATCH": CATEGORIA_CONSOLAS,
};
const MARCAS_VENDIDAS = [
  "INFINIX",
  "TECNO",
  "MOTOROLA",
  "SAMSUNG",
  "XIAOMI",
  "OPPO",
  "HONOR",
  "IPHONE",
  "VIVO",
  "ZTE",
  "POCO",
  CATEGORIA_ELECTRODOMESTICOS,
  CATEGORIA_FLECHAS,
  CATEGORIA_TABLETS,
  CATEGORIA_PORTATILES,
  CATEGORIA_CONSOLAS,
];
const OTRAS_MARCAS = "OTRAS MARCAS";

export type CommercialRankingItem = {
  nombre: string;
  total: number;
  monto: number;
};

export type CommercialBrandRankingItem = CommercialRankingItem & {
  porcentaje: number;
};

export type CommercialReferenceRankingItem = CommercialRankingItem & {
  porcentaje: number;
};

export type DailyCommercialPoint = {
  fecha: string;
  etiqueta: string;
  ventas: number;
  ingresos: number;
  utilidad: number;
};

export type SedePerformanceItem = {
  sedeId: number;
  nombre: string;
  ventas: number;
  ingresos: number;
  utilidad: number;
};

export type BrandSalesSede = {
  id: number;
  nombre: string;
};

export type BrandSalesSedeDetail = {
  sedeId: number;
  nombre: string;
  total: number;
  porcentaje: number;
};

function n(value: unknown) {
  if (!value) return 0;

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value || 0);
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeLabel(value).toUpperCase();
}

function normalizeReference(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function isApplianceReference(value: string | null | undefined) {
  const text = normalizeReference(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(?:ESTUFAS?|NEVERAS?|REFRIGERADOR(?:ES)?|CONGELADOR(?:ES)?|LAVADORAS?|SECADORAS?|FREIDORAS?|AIR\s*FRYER|LICUADORAS?|TELEVISOR(?:ES)?|TELEVISION|HORNOS?|MICROONDAS|LAVAVAJILLAS|ASPIRADORAS?|VENTILADOR(?:ES)?|CAFETERAS?|SANDUCHERAS?|ARROCERAS?)\b|\bTV(?=\d|\b)|\bAIRE\s+ACONDICIONADO\b|\bOLLA\s+(?:ELECTRICA|ARROCERA|MULTIFUNCIONAL|DE\s+PRESION)\b/.test(text);
}

function isTabletReference(value: string | null | undefined) {
  const text = normalizeReference(value);
  return /\b(?:TABLETS?|TABLETAS?)\b|\bIPAD(?:\b|(?:A|AIR|MINI|PRO)?\d)|\b(?:XIAOMI|REDMI)\s*PAD(?=\b|\d)|\b(?:SAMSUNG\s+(?:GALAXY\s+)?|GALAXY\s+)TAB(?:\b|[AS]\d)/.test(text);
}

function isPortableReference(value: string | null | undefined) {
  const text = normalizeReference(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(?:PORTATIL(?:ES)?|PORTARL|LAPTOPS?|MACBOOK)\b/.test(text);
}

function isConsoleReference(value: string | null | undefined) {
  const text = normalizeReference(value);
  return /\b(?:CONSOLAS?|PLAY\s*STATION\s*[345](?:\b|PRO\b|SLIM\b)|PS[345]\b|XBOX\b|NINTENDO\s+SWITCH\b)/.test(text);
}

function resolveBrand(value: string | null | undefined, tipoProducto?: string | null) {
  const reference = normalizeReference(value);
  const plainReference = reference.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Product groups take precedence over phone brands so each sale counts once.
  // Recover tablets/flechas that were historically saved under a broad category.
  if (isTabletReference(reference) || isTabletReference(tipoProducto)) {
    return CATEGORIA_TABLETS;
  }
  if (/\bFLECHAS?\b/.test(reference) || /\bFLECHAS?\b/.test(normalizeReference(tipoProducto))) {
    return CATEGORIA_FLECHAS;
  }
  if (isPortableReference(reference) || isPortableReference(tipoProducto)) {
    return CATEGORIA_PORTATILES;
  }
  if (isConsoleReference(reference) || isConsoleReference(tipoProducto)) {
    return CATEGORIA_CONSOLAS;
  }
  // Explicit report aliases also repair broad legacy product types without
  // changing the original reference or inventory record.
  const referenceAlias = BRAND_REFERENCE_ALIASES[plainReference];
  if (referenceAlias) {
    return referenceAlias;
  }
  if (reference.split(/[^A-Z0-9]+/).some(word => /^POCO(?:[XFMC]\d[A-Z0-9]*)?$/.test(word))) {
    return "POCO";
  }
  if (reference.includes("REDMI")) {
    return "XIAOMI";
  }

  // For the remaining products, keep the saved appliance category. Clear legacy
  // labels also recover products whose historic type was the default TELEFONIA.
  if (esElectrodomestico(tipoProducto) || isApplianceReference(tipoProducto) || isApplianceReference(reference)) {
    return CATEGORIA_ELECTRODOMESTICOS;
  }

  if (!reference) {
    return OTRAS_MARCAS;
  }

  const words = reference.split(/[^A-Z0-9]+/).filter(Boolean);
  // Keep iPhone sales together, including APPLE IPHONE and compact model labels.
  if (words.some((word) => /^IPHONE(?:\d[A-Z0-9]*|X(?:R|S(?:MAX)?)?|SE(?:\d+)?)?$/.test(word))) {
    return "IPHONE";
  }
  if (words.some((word) => /^VIVO(?:[YVXTZSU]\d[A-Z0-9]*|NEX\d[A-Z0-9]*)$/.test(word))) {
    return "VIVO";
  }
  if (words.some((word) => /^ZTE(?:[AVL]\d[A-Z0-9]*|BLADE[A-Z]?\d[A-Z0-9]*)$/.test(word))) {
    return "ZTE";
  }
  return MARCAS_VENDIDAS.find((marca) => words.includes(marca)) || OTRAS_MARCAS;
}

function pushRanking(
  map: Map<string, CommercialRankingItem>,
  rawName: string,
  amount = 0
) {
  const nombre = normalizeLabel(rawName);

  if (!nombre) {
    return;
  }

  const key = normalizeKey(nombre);
  const current = map.get(key);

  if (current) {
    current.total += 1;
    current.monto += amount;
    return;
  }

  map.set(key, {
    nombre,
    total: 1,
    monto: amount,
  });
}

function isSedeJalador(value: string) {
  return /^SEDE\s*\d+$/i.test(normalizeLabel(value));
}

function isJaladorPersonal(value: string) {
  return /^JALADOR\b/i.test(normalizeLabel(value));
}

function sortedRanking(map: Map<string, CommercialRankingItem>) {
  return Array.from(map.values())
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      if (b.monto !== a.monto) {
        return b.monto - a.monto;
      }

      return a.nombre.localeCompare(b.nombre, "es");
    });
}

function brandOrder(nombre: string) {
  const index = MARCAS_VENDIDAS.indexOf(nombre);
  return index >= 0 ? index : MARCAS_VENDIDAS.length;
}

function sortedBrandRanking(
  map: Map<string, CommercialRankingItem>
): CommercialBrandRankingItem[] {
  const totalVentasMarca = Array.from(map.values()).reduce(
    (acc, item) => acc + item.total,
    0
  );

  if (totalVentasMarca === 0) {
    return [];
  }

  return Array.from(map.values())
    .filter((item) => item.total > 0)
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      const orderA = brandOrder(a.nombre);
      const orderB = brandOrder(b.nombre);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return a.nombre.localeCompare(b.nombre, "es");
    })
    .map((item) => ({
      ...item,
      porcentaje: (item.total / totalVentasMarca) * 100,
    }));
}

function sortedReferenceRanking(
  map: Map<string, CommercialRankingItem>
): CommercialReferenceRankingItem[] {
  const totalVentasReferencia = Array.from(map.values()).reduce(
    (acc, item) => acc + item.total,
    0
  );

  if (totalVentasReferencia === 0) {
    return [];
  }

  return sortedRanking(map).map((item) => ({
    ...item,
    porcentaje: (item.total / totalVentasReferencia) * 100,
  }));
}

export async function getMonthlyCommercialSummary(options?: {
  period?: string | null;
  sedeId?: number | null;
  sedesDetalleMarcas?: BrandSalesSede[];
}) {
  const periodo =
    (options?.period
      ? getBogotaMonthRangeFromInput(options.period)
      : null) ?? getCurrentBogotaMonthRange();
  const scope = options?.sedeId ? { sedeId: options.sedeId } : {};

  const [ventas, ventasDetalle, movimientosCaja] = await Promise.all([
    prisma.venta.aggregate({
      where: {
        fecha: {
          gte: periodo.start,
          lt: periodo.end,
        },
        ...scope,
      },
      _sum: {
        utilidad: true,
        cajaOficina: true,
        ingreso: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.venta.findMany({
      where: {
        fecha: {
          gte: periodo.start,
          lt: periodo.end,
        },
        ...scope,
      },
      select: {
        fecha: true,
        ingreso: true,
        utilidad: true,
        descripcion: true,
        jalador: true,
        cerrador: true,
        comision: true,
        inventarioSede: {
          select: {
            referencia: true,
            tipoProducto: true,
          },
        },
        sede: {
          select: {
            id: true,
            nombre: true,
          },
        },
        financierasDetalle: true,
        alcanos: true,
        payjoy: true,
        sistecredito: true,
        addi: true,
        sumaspay: true,
        celya: true,
        bogota: true,
        alocredit: true,
        esmio: true,
        kaiowa: true,
        finser: true,
        gora: true,
      },
    }),
    prisma.cajaMovimiento.groupBy({
      by: ["tipo"],
      where: {
        createdAt: {
          gte: periodo.start,
          lt: periodo.end,
        },
        tipo: {
          in: ["INGRESO", "EGRESO"],
        },
        NOT: {
          concepto: CONCEPTO_GASTO_CARTERA,
        },
        ...scope,
      },
      _sum: {
        valor: true,
      },
    }),
  ]);

  const valorMovimiento = (tipo: "INGRESO" | "EGRESO") =>
    n(
      movimientosCaja.find((movimiento) => movimiento.tipo === tipo)?._sum
        .valor
    );
  const cajaVentas = n(ventas._sum.cajaOficina);
  const cajaOperativa =
    valorMovimiento("INGRESO") - valorMovimiento("EGRESO");
  const sedesJalador = new Map<string, CommercialRankingItem>();
  const ventasSede = new Map<string, CommercialRankingItem>();
  const jaladores = new Map<string, CommercialRankingItem>();
  const cerradores = new Map<string, CommercialRankingItem>();
  const asesoresPayJoy = new Map<string, CommercialRankingItem>();
  const financieras = new Map<string, CommercialRankingItem>();
  const marcasVendidas = new Map<string, CommercialRankingItem>();
  const ventasMarcaPorSede = new Map<string, Map<number, number>>();
  const referenciasVendidas = new Map<string, CommercialRankingItem>();
  const referenciasVendidasPorMarca = new Map<string, Map<string, CommercialRankingItem>>();
  const rendimientoDiario = new Map<string, DailyCommercialPoint>();
  const rendimientoSedes = new Map<number, SedePerformanceItem>();

  for (const venta of ventasDetalle) {
    const fecha = getBogotaDateKey(venta.fecha);
    const puntoDiario = rendimientoDiario.get(fecha) ?? {
      fecha,
      etiqueta: String(Number(fecha.slice(-2))),
      ventas: 0,
      ingresos: 0,
      utilidad: 0,
    };

    puntoDiario.ventas += 1;
    puntoDiario.ingresos += n(venta.ingreso);
    puntoDiario.utilidad += n(venta.utilidad);
    rendimientoDiario.set(fecha, puntoDiario);

    const referencia = normalizeReference(
      venta.inventarioSede?.referencia || venta.descripcion
    ) || "SIN REFERENCIA";
    const marca = resolveBrand(referencia, venta.inventarioSede?.tipoProducto);
    pushRanking(marcasVendidas, marca);
    pushRanking(referenciasVendidas, referencia);
    const referenciasMarca = referenciasVendidasPorMarca.get(marca) ?? new Map<string, CommercialRankingItem>();
    pushRanking(referenciasMarca, referencia);
    referenciasVendidasPorMarca.set(marca, referenciasMarca);

    const detalleMarca = ventasMarcaPorSede.get(marca) ?? new Map<number, number>();
    detalleMarca.set(venta.sede.id, (detalleMarca.get(venta.sede.id) ?? 0) + 1);
    ventasMarcaPorSede.set(marca, detalleMarca);

    if (venta.sede?.nombre) {
      pushRanking(ventasSede, venta.sede.nombre);

      const rendimientoSede = rendimientoSedes.get(venta.sede.id) ?? {
        sedeId: venta.sede.id,
        nombre: venta.sede.nombre,
        ventas: 0,
        ingresos: 0,
        utilidad: 0,
      };

      rendimientoSede.ventas += 1;
      rendimientoSede.ingresos += n(venta.ingreso);
      rendimientoSede.utilidad += n(venta.utilidad);
      rendimientoSedes.set(venta.sede.id, rendimientoSede);
    }

    if (venta.jalador) {
      if (isSedeJalador(venta.jalador)) {
        pushRanking(sedesJalador, venta.jalador);
      } else if (isJaladorPersonal(venta.jalador)) {
        pushRanking(jaladores, venta.jalador, n(venta.comision));
      }
    }

    if (venta.cerrador) {
      pushRanking(cerradores, venta.cerrador);
    }

    const financierasVenta = extraerFinancierasDetalle(
      venta as Record<string, unknown>
    );

    const financierasPayJoy = financierasVenta.filter(
      (financiera) =>
        financiera.nombreNormalizado === "PAYJOY" && n(financiera.valorBruto) > 0
    );

    if (venta.cerrador && financierasPayJoy.length > 0) {
      const montoPayJoy = financierasPayJoy.reduce(
        (total, financiera) => total + n(financiera.valorBruto),
        0
      );
      pushRanking(asesoresPayJoy, venta.cerrador, montoPayJoy);
    }

    for (const financiera of financierasVenta) {
      pushRanking(financieras, financiera.nombre, n(financiera.valorBruto));
    }
  }

  const referenciasRanking = sortedReferenceRanking(referenciasVendidas);
  const tendenciaDiaria: DailyCommercialPoint[] = [];

  for (
    const cursor = new Date(periodo.start);
    cursor.getTime() < periodo.end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const fecha = getBogotaDateKey(cursor);
    tendenciaDiaria.push(
      rendimientoDiario.get(fecha) ?? {
        fecha,
        etiqueta: String(Number(fecha.slice(-2))),
        ventas: 0,
        ingresos: 0,
        utilidad: 0,
      }
    );
  }

  const rendimientoPorSede = Array.from(rendimientoSedes.values()).sort(
    (a, b) => {
      if (b.ingresos !== a.ingresos) {
        return b.ingresos - a.ingresos;
      }

      if (b.utilidad !== a.utilidad) {
        return b.utilidad - a.utilidad;
      }

      return a.nombre.localeCompare(b.nombre, "es");
    }
  );

  const sedesDetalleMarcas = options?.sedesDetalleMarcas ?? Array.from(
    rendimientoSedes.values(),
    (sede) => ({ id: sede.sedeId, nombre: sede.nombre })
  );
  const detalleMarcasPorSede: Record<string, BrandSalesSedeDetail[]> = {};
  const referenciasPorMarca: Record<string, CommercialReferenceRankingItem[]> = {};
  for (const marca of [...MARCAS_VENDIDAS, OTRAS_MARCAS]) {
    const totalMarca = marcasVendidas.get(normalizeKey(marca))?.total ?? 0;
    const ventasPorSede = ventasMarcaPorSede.get(marca);
    // The detail's participation uses this brand's sales, unlike the global ranking.
    referenciasPorMarca[marca] = sortedReferenceRanking(
      referenciasVendidasPorMarca.get(marca) ?? new Map<string, CommercialRankingItem>()
    );
    detalleMarcasPorSede[marca] = sedesDetalleMarcas
      .map((sede) => {
        const total = ventasPorSede?.get(sede.id) ?? 0;
        return {
          sedeId: sede.id,
          nombre: sede.nombre,
          total,
          porcentaje: totalMarca > 0 ? (total / totalMarca) * 100 : 0,
        };
      })
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es") || a.sedeId - b.sedeId);
  }

  return {
    periodo,
    utilidad: n(ventas._sum.utilidad),
    caja: cajaVentas + cajaOperativa,
    ingresos: n(ventas._sum.ingreso),
    ventas: Number(ventas._count.id || 0),
    cajaVentas,
    cajaOperativa,
    topSedesJalador: sortedRanking(sedesJalador),
    topVentasSede: sortedRanking(ventasSede),
    topJaladores: sortedRanking(jaladores),
    topCerradores: sortedRanking(cerradores),
    topAsesoresPayJoy: sortedRanking(asesoresPayJoy).slice(0, 10),
    topFinancieras: sortedRanking(financieras),
    topMarcasVendidas: sortedBrandRanking(marcasVendidas),
    topReferenciasVendidas: referenciasRanking.slice(0, 10),
    referenciasVendidas: referenciasRanking,
    tendenciaDiaria,
    rendimientoPorSede,
    detalleMarcasPorSede,
    referenciasPorMarca,
  };
}
