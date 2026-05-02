import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";

const ESTADOS_PRESTAMO_ACTIVOS = [
  "PENDIENTE",
  "APROBADO",
  "PAGO_PENDIENTE_APROBACION",
  "DEVOLUCION_PENDIENTE",
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
        estadoCobro: true,
        sedeDestinoId: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Equipos no encontrados" },
        { status: 404 }
      );
    }

    const sedeBodega = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: NOMBRE_SEDE_BODEGA,
          mode: "insensitive",
        },
      },
      select: { id: true, nombre: true },
    });

    const inventarioSedeVinculado = await prisma.inventarioSede.findMany({
      where: {
        inventarioPrincipalId: { in: items.map((item) => item.id) },
      },
      select: {
        id: true,
        imei: true,
        inventarioPrincipalId: true,
        sedeId: true,
        estadoActual: true,
        ventas: {
          select: { id: true },
          take: 1,
        },
      },
    });

    const prestamosActivos = await prisma.prestamoSede.findMany({
      where: {
        imei: { in: items.map((item) => item.imei) },
        estado: { in: ESTADOS_PRESTAMO_ACTIVOS },
      },
      select: {
        id: true,
        imei: true,
        estado: true,
        sedeOrigenId: true,
        sedeDestinoId: true,
        movimientosCaja: {
          select: { id: true },
          take: 1,
        },
      },
    });

    const registrosVentaAbiertos = await prisma.registroVendedorVenta.findMany({
      where: {
        serialImei: { in: items.map((item) => item.imei) },
        eliminadoEn: null,
        ventaIdRelacionada: null,
      },
      select: {
        serialImei: true,
      },
    });

    const imeisConRegistroAbierto = new Set(
      registrosVentaAbiertos
        .map((item) => item.serialImei || "")
        .filter(Boolean)
    );

    const eliminablesBodega: typeof items = [];
    const eliminablesCorreccion: Array<{
      item: (typeof items)[number];
      inventarioSedeId: number;
      prestamoId: number;
    }> = [];
    const omitidos: typeof items = [];

    for (const item of items) {
      const estadoPrincipal = String(item.estado || "BODEGA").toUpperCase();
      const estadoCobro = String(item.estadoCobro || "").toUpperCase();
      const inventariosItem = inventarioSedeVinculado.filter(
        (inventario) => inventario.inventarioPrincipalId === item.id
      );
      const prestamosItem = prestamosActivos.filter(
        (prestamo) => prestamo.imei === item.imei
      );
      const tieneRegistroAbierto = imeisConRegistroAbierto.has(item.imei);

      if (estadoPrincipal === "BODEGA") {
        if (
          inventariosItem.length === 0 &&
          prestamosItem.length === 0 &&
          !tieneRegistroAbierto
        ) {
          eliminablesBodega.push(item);
        } else {
          omitidos.push(item);
        }
        continue;
      }

      if (estadoPrincipal === "PRESTAMO" && sedeBodega) {
        const inventarioSede = inventariosItem[0];
        const prestamo = prestamosItem[0];
        const cobroLimpio = !estadoCobro || estadoCobro === "PENDIENTE";
        const esCorreccionSegura =
          cobroLimpio &&
          inventariosItem.length === 1 &&
          String(inventarioSede?.estadoActual || "").toUpperCase() === "BODEGA" &&
          inventarioSede.ventas.length === 0 &&
          prestamosItem.length === 1 &&
          prestamo.estado === "APROBADO" &&
          prestamo.sedeOrigenId === sedeBodega.id &&
          prestamo.sedeDestinoId === inventarioSede.sedeId &&
          prestamo.movimientosCaja.length === 0 &&
          !tieneRegistroAbierto;

        if (esCorreccionSegura) {
          eliminablesCorreccion.push({
            item,
            inventarioSedeId: inventarioSede.id,
            prestamoId: prestamo.id,
          });
        } else {
          omitidos.push(item);
        }
        continue;
      }

      omitidos.push(item);
    }

    const eliminables = [
      ...eliminablesBodega,
      ...eliminablesCorreccion.map(({ item }) => item),
    ];

    if (eliminables.length === 0) {
      return NextResponse.json(
        {
          error:
            "No hay equipos elegibles para eliminar. Solo se eliminan equipos en BODEGA o envios en PRESTAMO sin ventas, pagos ni movimientos posteriores.",
          omitidos: omitidos.length,
          detallesOmitidos: omitidos.map((item) => item.imei),
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      if (eliminablesCorreccion.length > 0) {
        await tx.inventarioSede.deleteMany({
          where: {
            id: {
              in: eliminablesCorreccion.map((item) => item.inventarioSedeId),
            },
          },
        });

        await tx.prestamoSede.deleteMany({
          where: {
            id: {
              in: eliminablesCorreccion.map((item) => item.prestamoId),
            },
          },
        });
      }

      await tx.inventarioPrincipal.deleteMany({
        where: {
          id: { in: eliminables.map((item) => item.id) },
        },
      });

      await tx.movimientoInventario.createMany({
        data: eliminables.map((item) => ({
          imei: item.imei,
          tipoMovimiento: eliminablesCorreccion.some(
            (correccion) => correccion.item.id === item.id
          )
            ? "ELIMINACION_PRINCIPAL_CORRECCION_ENVIO"
            : "ELIMINACION_PRINCIPAL",
          referencia: item.referencia,
          color: item.color || null,
          costo: item.costo,
          sedeId: null,
          origen: "PRINCIPAL",
          observacion: eliminablesCorreccion.some(
            (correccion) => correccion.item.id === item.id
          )
            ? `Equipo eliminado por admin ${user.usuario}; se revirtio el envio a sede antes de eliminar.`
            : "Equipo eliminado de bodega principal por administrador",
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
