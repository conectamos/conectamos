import prisma from "@/lib/prisma";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";

const WAREHOUSE_MOVEMENTS = [
  "INGRESO_PRINCIPAL",
  "SALIDA_PRINCIPAL_A_SEDE",
  "EDICION_PRINCIPAL",
  "CORRECCION_RETORNO_PRINCIPAL",
];

export async function obtenerHistorialBodega(imei: string) {
  if (!/^\d{15}$/.test(imei)) return null;
  const principal = await prisma.inventarioPrincipal.findUnique({
    where: { imei },
    select: { id: true, imei: true, referencia: true, color: true, costo: true,
      numeroFactura: true, distribuidor: true, estado: true, sedeDestinoId: true,
      estadoCobro: true, createdAt: true },
  });
  // Looking up an arbitrary sede IMEI must not disclose its inventory or sales.
  if (!principal) return null;
  const bodega = await prisma.sede.findFirst({
    where: { nombre: { equals: NOMBRE_SEDE_BODEGA, mode: "insensitive" } },
    select: { id: true, nombre: true },
  });
  if (!bodega) return null;
  const [movimientos, prestamos] = await Promise.all([
    prisma.movimientoInventario.findMany({
      where: { imei, tipoMovimiento: { in: WAREHOUSE_MOVEMENTS } },
      select: { id: true, tipoMovimiento: true, sedeId: true, createdAt: true,
        referencia: true, color: true, costo: true, observacion: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.prestamoSede.findMany({
      where: { imei, OR: [{ sedeOrigenId: bodega.id }, { sedeDestinoId: bodega.id }] },
      select: { id: true, estado: true, sedeOrigenId: true, sedeDestinoId: true, createdAt: true },
      orderBy: { id: "desc" },
    }),
  ]);
  const sedeIds = [...new Set([
    bodega.id, ...(principal.sedeDestinoId ? [principal.sedeDestinoId] : []),
    ...movimientos.flatMap(item => item.sedeId ? [item.sedeId] : []),
    ...prestamos.flatMap(item => [item.sedeOrigenId, item.sedeDestinoId]),
  ])];
  const sedes = await prisma.sede.findMany({
    where: { id: { in: sedeIds } }, select: { id: true, nombre: true },
  });
  return { principal, movimientos, prestamos, sedes };
}
