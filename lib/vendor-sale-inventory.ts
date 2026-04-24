import prisma from "@/lib/prisma";
import { normalizarImei } from "@/lib/vendor-sale-records";

export type EquipoRegistroVentaLookup = {
  imei: string;
  referencia: string;
  color: string | null;
  costo: number | null;
  origen: "SEDE" | "BODEGA_PRINCIPAL";
  sedeId: number | null;
  sedeNombre: string | null;
  estadoActual: string | null;
};

export async function buscarEquipoRegistroVentaPorImei(
  valor: unknown,
  sedeActualId?: number | null
) {
  const imei = normalizarImei(valor);

  if (!imei) {
    return null;
  }

  const inventarioSedes = await prisma.inventarioSede.findMany({
    where: { imei },
    select: {
      id: true,
      imei: true,
      referencia: true,
      color: true,
      costo: true,
      estadoActual: true,
      sedeId: true,
      sede: {
        select: {
          nombre: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  if (inventarioSedes.length > 0) {
    const item =
      inventarioSedes.find((row) => row.sedeId === sedeActualId) ?? inventarioSedes[0];

    return {
      imei: item.imei,
      referencia: item.referencia,
      color: item.color ?? null,
      costo: Number.isFinite(item.costo) ? item.costo : null,
      origen: "SEDE" as const,
      sedeId: item.sedeId,
      sedeNombre: item.sede.nombre,
      estadoActual: item.estadoActual ?? null,
    };
  }

  const inventarioPrincipal = await prisma.inventarioPrincipal.findUnique({
    where: { imei },
    select: {
      imei: true,
      referencia: true,
      color: true,
      costo: true,
      estado: true,
    },
  });

  if (!inventarioPrincipal) {
    return null;
  }

  return {
    imei: inventarioPrincipal.imei,
    referencia: inventarioPrincipal.referencia,
    color: inventarioPrincipal.color ?? null,
    costo: Number.isFinite(inventarioPrincipal.costo)
      ? inventarioPrincipal.costo
      : null,
    origen: "BODEGA_PRINCIPAL" as const,
    sedeId: null,
    sedeNombre: "Bodega principal",
    estadoActual: inventarioPrincipal.estado ?? "BODEGA",
  };
}
