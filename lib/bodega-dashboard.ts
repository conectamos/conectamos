import prisma from "@/lib/prisma";
import { esSedeBodegaPrincipal } from "@/lib/access-control";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";
import { agruparDeudasPorSede, type GrupoDeudaSede } from "@/lib/warehouse-debt-groups";

export type BodegaDashboardDebtItem = {
  id: number;
  imei: string;
  referencia: string;
  color: string | null;
  costo: number;
  estado: string;
  estadoCobro: string | null;
  sedeDestinoId: number | null;
  sedeDestinoNombre: string | null;
  fechaEnvio: string | null;
};

export type BodegaDashboardData = {
  metrics: {
    equiposEnBodega: number;
    valorEnBodega: number;
    enviadosASede: number;
    totalPorCobrar: number;
    equiposPorCobrar: number;
    sedesDeudoras: number;
  };
  deudores: GrupoDeudaSede[];
  equiposConDeuda: BodegaDashboardDebtItem[];
  updatedAt: string;
  sedeNombre: string;
};

function finiteCost(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function dateIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

// This service reads only principal warehouse stock. Its callers must authorize
// the session before invoking it; it never reads sales, caja or sede stock.
export async function getBodegaDashboard(): Promise<BodegaDashboardData> {
  const [items, sedes] = await Promise.all([
    prisma.inventarioPrincipal.findMany({
      orderBy: { id: "desc" },
      select: {
        id: true, imei: true, referencia: true, color: true, costo: true,
        estado: true, estadoCobro: true, sedeDestinoId: true, fechaEnvio: true,
      },
    }),
    prisma.sede.findMany({ select: { id: true, nombre: true } }),
  ]);
  const nombresSedes = new Map(sedes.map(sede => [sede.id, sede.nombre]));
  const equipos = items.map((item): BodegaDashboardDebtItem => ({
    id: item.id,
    imei: item.imei,
    referencia: item.referencia,
    color: item.color,
    costo: finiteCost(item.costo),
    estado: String(item.estado || "BODEGA").toUpperCase(),
    estadoCobro: item.estadoCobro,
    sedeDestinoId: item.sedeDestinoId,
    sedeDestinoNombre: item.sedeDestinoId ? nombresSedes.get(item.sedeDestinoId) || null : null,
    fechaEnvio: dateIso(item.fechaEnvio),
  }));
  const equiposEnBodega = equipos.filter(item => item.estado === "BODEGA");
  const deudores = agruparDeudasPorSede(equipos, sedes);
  const equiposConDeuda = equipos.filter(item => item.estadoCobro?.trim().toUpperCase() === "PENDIENTE");

  return {
    metrics: {
      equiposEnBodega: equiposEnBodega.length,
      valorEnBodega: equiposEnBodega.reduce((total, item) => total + item.costo, 0),
      enviadosASede: equipos.filter(item => ["PRESTAMO", "PAGO"].includes(item.estado)).length,
      totalPorCobrar: deudores.reduce((centavos, grupo) => centavos + Math.round(grupo.totalPendiente * 100), 0) / 100,
      equiposPorCobrar: equiposConDeuda.length,
      sedesDeudoras: deudores.length,
    },
    deudores,
    equiposConDeuda,
    updatedAt: new Date().toISOString(),
    sedeNombre: sedes.find(sede => esSedeBodegaPrincipal(sede.nombre))?.nombre || NOMBRE_SEDE_BODEGA,
  };
}
