import prisma from "@/lib/prisma";
import { getCurrentBogotaMonthRange } from "@/lib/ventas-utils";

function normalizarEstado(estado: string | null | undefined) {
  return String(estado || "").trim().toUpperCase();
}

function esRegistroPendiente(estado: string | null | undefined) {
  const normalizado = normalizarEstado(estado);
  return normalizado !== "CONVERTIDO_EN_VENTA" && normalizado !== "CANCELADO";
}

export async function getSalesRoleActivitySummary(
  perfilVendedorId: number
) {
  const periodo = getCurrentBogotaMonthRange();

  if (!Number.isInteger(perfilVendedorId) || perfilVendedorId <= 0) {
    return {
      periodo,
      registrosPeriodo: 0,
      pendientes: 0,
      convertidos: 0,
    };
  }

  const registrosPorEstado = await prisma.registroVendedorVenta.groupBy({
    by: ["estadoVentaRegistro"],
    where: {
      perfilVendedorId,
      eliminadoEn: null,
      createdAt: {
        gte: periodo.start,
        lt: periodo.end,
      },
    },
    _count: {
      _all: true,
    },
  });

  return registrosPorEstado.reduce(
    (resumen, grupo) => {
      const total = grupo._count._all;
      const estado = normalizarEstado(grupo.estadoVentaRegistro);

      resumen.registrosPeriodo += total;

      if (esRegistroPendiente(estado)) {
        resumen.pendientes += total;
      }

      if (estado === "CONVERTIDO_EN_VENTA") {
        resumen.convertidos += total;
      }

      return resumen;
    },
    {
      periodo,
      registrosPeriodo: 0,
      pendientes: 0,
      convertidos: 0,
    }
  );
}

export type SalesRoleActivitySummary = Awaited<
  ReturnType<typeof getSalesRoleActivitySummary>
>;
