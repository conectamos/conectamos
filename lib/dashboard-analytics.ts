import prisma from "@/lib/prisma";
import {
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthRange,
  type NumericValue,
} from "@/lib/ventas-utils";

type MonthRange = {
  start: Date;
  end: Date;
  key: string;
  label: string;
};

export type AnalyticMetric = {
  actual: number;
  anterior: number;
  diferencia: number;
  porcentaje: number | null;
};

export type MonthlyAnalyticSummary = {
  periodoActual: MonthRange;
  periodoAnterior: MonthRange;
  ventas: AnalyticMetric;
  utilidad: AnalyticMetric;
};

function n(value: NumericValue) {
  if (!value) return 0;

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value || 0);
}

function formatMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function previousBogotaMonthRange(periodo: MonthRange): MonthRange {
  const start = new Date(periodo.start);
  start.setUTCMonth(start.getUTCMonth() - 1);

  const end = new Date(periodo.start);

  return {
    start,
    end,
    key: formatMonthKey(start),
    label: new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      month: "long",
      year: "numeric",
    }).format(start),
  };
}

function buildMetric(actual: number, anterior: number): AnalyticMetric {
  const diferencia = actual - anterior;
  const porcentaje =
    anterior === 0 ? null : (diferencia / Math.abs(anterior)) * 100;

  return {
    actual,
    anterior,
    diferencia,
    porcentaje,
  };
}

async function getMonthStats(periodo: MonthRange, sedeId?: number | null) {
  const aggregate = await prisma.venta.aggregate({
    where: {
      fecha: {
        gte: periodo.start,
        lt: periodo.end,
      },
      ...(sedeId ? { sedeId } : {}),
    },
    _count: {
      id: true,
    },
    _sum: {
      utilidad: true,
    },
  });

  return {
    ventas: Number(aggregate._count.id || 0),
    utilidad: n(aggregate._sum.utilidad),
  };
}

export async function getMonthlyAnalyticSummary(options?: {
  period?: string | null;
  sedeId?: number | null;
}): Promise<MonthlyAnalyticSummary> {
  const periodoActual =
    options?.period && getBogotaMonthRangeFromInput(options.period)
      ? getBogotaMonthRangeFromInput(options.period)!
      : getCurrentBogotaMonthRange();
  const periodoAnterior = previousBogotaMonthRange(periodoActual);

  const [actual, anterior] = await Promise.all([
    getMonthStats(periodoActual, options?.sedeId),
    getMonthStats(periodoAnterior, options?.sedeId),
  ]);

  return {
    periodoActual,
    periodoAnterior,
    ventas: buildMetric(actual.ventas, anterior.ventas),
    utilidad: buildMetric(actual.utilidad, anterior.utilidad),
  };
}
