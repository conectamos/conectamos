import prisma from "@/lib/prisma";
import {
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthRange,
} from "@/lib/ventas-utils";
import { extraerFinancierasDetalle } from "@/lib/ventas-financieras";

const CONCEPTO_GASTO_CARTERA = "GASTO CARTERA";
const MARCAS_VENDIDAS = [
  "INFINIX",
  "TECNO",
  "MOTOROLA",
  "SAMSUNG",
  "XIAOMI",
  "OPPO",
  "HONOR",
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

function resolveBrand(value: string | null | undefined) {
  const reference = normalizeReference(value);

  if (!reference) {
    return OTRAS_MARCAS;
  }

  const words = reference.split(/[^A-Z0-9]+/).filter(Boolean);
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
}) {
  const periodo =
    (options?.period
      ? getBogotaMonthRangeFromInput(options.period)
      : null) ?? getCurrentBogotaMonthRange();
  const scope = options?.sedeId ? { sedeId: options.sedeId } : {};

  const [ventas, ventasDetalle, ingresosCaja, egresosCaja] = await Promise.all([
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
        descripcion: true,
        jalador: true,
        cerrador: true,
        comision: true,
        inventarioSede: {
          select: {
            referencia: true,
          },
        },
        sede: {
          select: {
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
    prisma.cajaMovimiento.aggregate({
      where: {
        createdAt: {
          gte: periodo.start,
          lt: periodo.end,
        },
        tipo: "INGRESO",
        NOT: {
          concepto: CONCEPTO_GASTO_CARTERA,
        },
        ...scope,
      },
      _sum: {
        valor: true,
      },
    }),
    prisma.cajaMovimiento.aggregate({
      where: {
        createdAt: {
          gte: periodo.start,
          lt: periodo.end,
        },
        tipo: "EGRESO",
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

  const cajaVentas = n(ventas._sum.cajaOficina);
  const cajaOperativa = n(ingresosCaja._sum.valor) - n(egresosCaja._sum.valor);
  const sedesJalador = new Map<string, CommercialRankingItem>();
  const ventasSede = new Map<string, CommercialRankingItem>();
  const jaladores = new Map<string, CommercialRankingItem>();
  const cerradores = new Map<string, CommercialRankingItem>();
  const financieras = new Map<string, CommercialRankingItem>();
  const marcasVendidas = new Map<string, CommercialRankingItem>();
  const referenciasVendidas = new Map<string, CommercialRankingItem>();

  for (const venta of ventasDetalle) {
    const referencia = normalizeReference(
      venta.inventarioSede?.referencia || venta.descripcion
    ) || "SIN REFERENCIA";
    const marca = resolveBrand(referencia);
    pushRanking(marcasVendidas, marca);
    pushRanking(referenciasVendidas, referencia);

    if (venta.sede?.nombre) {
      pushRanking(ventasSede, venta.sede.nombre);
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

    for (const financiera of financierasVenta) {
      pushRanking(financieras, financiera.nombre, n(financiera.valorBruto));
    }
  }

  const referenciasRanking = sortedReferenceRanking(referenciasVendidas);

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
    topFinancieras: sortedRanking(financieras),
    topMarcasVendidas: sortedBrandRanking(marcasVendidas),
    topReferenciasVendidas: referenciasRanking.slice(0, 10),
    referenciasVendidas: referenciasRanking,
  };
}
