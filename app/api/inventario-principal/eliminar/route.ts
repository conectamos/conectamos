import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const ESTADOS_PRESTAMO_ACTIVOS = [
  "PENDIENTE",
  "APROBADO",
  "PAGO_PENDIENTE_APROBACION",
];

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const esAdmin = user.rolNombre.toUpperCase() === "ADMIN";

    if (!esAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const idsRaw = Array.isArray(body.ids) ? body.ids : [body.id];
    const ids = [
      ...new Set(
        idsRaw
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0)
      ),
    ];

    if (ids.length === 0) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const items = await prisma.inventarioPrincipal.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        estado: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Equipos no encontrados" },
        { status: 404 }
      );
    }

    const inventarioSedeVinculado = await prisma.inventarioSede.findMany({
      where: {
        inventarioPrincipalId: { in: items.map((item) => item.id) },
      },
      select: {
        inventarioPrincipalId: true,
      },
    });

    const prestamosActivos = await prisma.prestamoSede.findMany({
      where: {
        imei: { in: items.map((item) => item.imei) },
        estado: { in: ESTADOS_PRESTAMO_ACTIVOS },
      },
      select: {
        imei: true,
      },
    });

    const idsConInventarioSede = new Set(
      inventarioSedeVinculado
        .map((item) => item.inventarioPrincipalId)
        .filter((item): item is number => typeof item === "number")
    );
    const imeisConPrestamoActivo = new Set(
      prestamosActivos.map((item) => item.imei)
    );

    const eliminables = items.filter(
      (item) =>
        String(item.estado || "BODEGA").toUpperCase() === "BODEGA" &&
        !idsConInventarioSede.has(item.id) &&
        !imeisConPrestamoActivo.has(item.imei)
    );
    const omitidos = items.filter((item) => !eliminables.includes(item));

    if (eliminables.length === 0) {
      return NextResponse.json(
        {
          error:
            "No hay equipos disponibles para eliminar. Solo se eliminan equipos en BODEGA sin envio ni prestamo activo.",
          omitidos: omitidos.length,
          detallesOmitidos: omitidos.map((item) => item.imei),
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventarioPrincipal.deleteMany({
        where: {
          id: { in: eliminables.map((item) => item.id) },
        },
      });

      await tx.movimientoInventario.createMany({
        data: eliminables.map((item) => ({
          imei: item.imei,
          tipoMovimiento: "ELIMINACION_PRINCIPAL",
          referencia: item.referencia,
          color: item.color || null,
          costo: item.costo,
          sedeId: null,
          origen: "PRINCIPAL",
          observacion: "Equipo eliminado de bodega principal por administrador",
        })),
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje:
        eliminables.length === 1
          ? "Equipo eliminado correctamente de bodega principal"
          : `${eliminables.length} equipos eliminados correctamente de bodega principal`,
      eliminados: eliminables.length,
      omitidos: omitidos.length,
      detallesOmitidos: omitidos.map((item) => item.imei),
    });
  } catch (error) {
    console.error("ERROR ELIMINAR INVENTARIO PRINCIPAL:", error);
    return NextResponse.json(
      { error: "Error eliminando equipo" },
      { status: 500 }
    );
  }
}
