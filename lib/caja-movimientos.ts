import { Prisma } from "@/app/generated/prisma/client";
import { getBogotaDayRangeFromInput } from "@/lib/ventas-utils";

export const CONCEPTOS_PROTEGIDOS = new Set([
  "GASTO CARTERA",
  "PAGO DEUDA INVENTARIO",
  "PAGO PRESTAMO ENTRE SEDES",
  "ABONO TRANSFERENCIA",
  "ABONO FINANCIERA",
]);
export const CONCEPTO_GASTO_CARTERA = "GASTO CARTERA";
export const CAJA_MOVIMIENTOS_LIMIT_DEFAULT = 300;
export const CAJA_MOVIMIENTOS_LIMIT_MAX = 1000;

export const CAJA_MOVIMIENTO_SELECT = {
  id: true,
  tipo: true,
  concepto: true,
  valor: true,
  descripcion: true,
  sedeId: true,
  createdAt: true,
  sede: {
    select: {
      nombre: true,
    },
  },
} satisfies Prisma.CajaMovimientoSelect;

export type CajaMovimientoRow = Prisma.CajaMovimientoGetPayload<{
  select: typeof CAJA_MOVIMIENTO_SELECT;
}>;

export type CajaDateRangeFilter = {
  desde: string | null;
  hasta: string | null;
  key: string;
  label: string;
};

type BuildCajaWhereOptions = {
  esAdmin: boolean;
  sedeIdUsuario: number;
  sedeIdFiltro?: number | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  busqueda?: string | null;
};

type BuildCajaWhereResult =
  | {
      where: Prisma.CajaMovimientoWhereInput;
      rango: CajaDateRangeFilter;
    }
  | {
      error: string;
    };

function normalizarFecha(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function parseSedeId(value: string | null | undefined) {
  const sedeId = Number(value);
  return Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null;
}

export function parseMovimientoId(value: string | null | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseLimit(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return CAJA_MOVIMIENTOS_LIMIT_DEFAULT;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 0) {
    return CAJA_MOVIMIENTOS_LIMIT_DEFAULT;
  }

  return Math.min(limit, CAJA_MOVIMIENTOS_LIMIT_MAX);
}

export function parseCajaPagination(
  pageValue: string | null,
  pageSizeValue: string | null
) {
  const requestedPage = Number(pageValue);
  const requestedPageSize = Number(pageSizeValue);

  return {
    page:
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1,
    pageSize: [10, 20, 50, 100].includes(requestedPageSize)
      ? requestedPageSize
      : 10,
  };
}

export function normalizarConcepto(value: unknown) {
  return String(value ?? "").trim();
}

export function esMovimientoEditable(concepto: string | null | undefined) {
  return !CONCEPTOS_PROTEGIDOS.has(String(concepto || "").trim().toUpperCase());
}

export function buildCajaWhere(
  options: BuildCajaWhereOptions
): BuildCajaWhereResult {
  const fechaDesde = normalizarFecha(options.fechaDesde);
  const fechaHasta = normalizarFecha(options.fechaHasta);
  const rangoDesde = fechaDesde ? getBogotaDayRangeFromInput(fechaDesde) : null;
  const rangoHasta = fechaHasta ? getBogotaDayRangeFromInput(fechaHasta) : null;

  if (fechaDesde && !rangoDesde) {
    return { error: "La fecha inicial no es valida." };
  }

  if (fechaHasta && !rangoHasta) {
    return { error: "La fecha final no es valida." };
  }

  if (rangoDesde && rangoHasta && rangoDesde.start > rangoHasta.start) {
    return {
      error: "La fecha inicial no puede ser mayor que la fecha final.",
    };
  }

  const createdAt =
    rangoDesde || rangoHasta
      ? {
          ...(rangoDesde ? { gte: rangoDesde.start } : {}),
          ...(rangoHasta ? { lt: rangoHasta.end } : {}),
        }
      : undefined;

  const sedeId = options.esAdmin ? options.sedeIdFiltro ?? null : options.sedeIdUsuario;
  const busqueda = String(options.busqueda ?? "").trim();
  const idBuscado = /^#?\d+$/.test(busqueda)
    ? Number(busqueda.replace(/^#/, ""))
    : null;
  const busquedaWhere: Prisma.CajaMovimientoWhereInput[] = busqueda
    ? [
        { tipo: { contains: busqueda, mode: "insensitive" } },
        { concepto: { contains: busqueda, mode: "insensitive" } },
        { descripcion: { contains: busqueda, mode: "insensitive" } },
        { sede: { nombre: { contains: busqueda, mode: "insensitive" } } },
        ...(idBuscado && Number.isSafeInteger(idBuscado) && idBuscado <= 2147483647
          ? [{ id: idBuscado }]
          : []),
      ]
    : [];
  const where: Prisma.CajaMovimientoWhereInput = {
    ...(sedeId ? { sedeId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(busquedaWhere.length ? { OR: busquedaWhere } : {}),
    NOT: {
      concepto: CONCEPTO_GASTO_CARTERA,
    },
  };

  let label = "Todo el historial";
  let key = "historico";

  if (rangoDesde && rangoHasta) {
    label =
      rangoDesde.key === rangoHasta.key
        ? rangoDesde.label
        : `${rangoDesde.label} al ${rangoHasta.label}`;
    key =
      rangoDesde.key === rangoHasta.key
        ? rangoDesde.key
        : `${rangoDesde.key}-a-${rangoHasta.key}`;
  } else if (rangoDesde) {
    label = `Desde ${rangoDesde.label}`;
    key = `desde-${rangoDesde.key}`;
  } else if (rangoHasta) {
    label = `Hasta ${rangoHasta.label}`;
    key = `hasta-${rangoHasta.key}`;
  }

  return {
    where,
    rango: {
      desde: fechaDesde,
      hasta: fechaHasta,
      key,
      label,
    },
  };
}
