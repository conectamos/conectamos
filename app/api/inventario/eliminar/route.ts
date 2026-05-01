import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

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
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";

    if (!esAdmin) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? body.ids
      : body.id
      ? [body.id]
      : [];

    const idsValidos: number[] = Array.from(
      new Set(
        ids
          .map((item: unknown) => Number(item))
          .filter((item: number) => Number.isInteger(item) && item > 0)
      )
    );

    if (idsValidos.length === 0) {
      return NextResponse.json(
        { error: "ID invalido" },
        { status: 400 }
      );
    }

    const items = await prisma.inventarioSede.findMany({
      where: { id: { in: idsValidos } },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        deboA: true,
        estadoFinanciero: true,
        estadoActual: true,
        origen: true,
        distribuidor: true,
        ventas: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Equipos no encontrados" },
        { status: 404 }
      );
    }

    const imeis = [...new Set(items.map((item) => item.imei))];

    const prestamosActivos = await prisma.prestamoSede.findMany({
      where: {
        imei: { in: imeis },
        estado: { in: ESTADOS_PRESTAMO_ACTIVOS },
      },
      select: {
        imei: true,
      },
    });

    const registrosVentaAbiertos = await prisma.registroVendedorVenta.findMany({
      where: {
        serialImei: { in: imeis },
        eliminadoEn: null,
        ventaIdRelacionada: null,
      },
      select: {
        serialImei: true,
      },
    });

    const imeisConPrestamoActivo = new Set(
      prestamosActivos.map((item) => item.imei)
    );
    const imeisConRegistroAbierto = new Set(
      registrosVentaAbiertos
        .map((item) => item.serialImei || "")
        .filter(Boolean)
    );

    const eliminables: typeof items = [];
    const bloqueados: string[] = [];

    for (const item of items) {
      const estadoActual = String(item.estadoActual || "").trim().toUpperCase();

      if (item.ventas.length > 0 || estadoActual === "VENDIDO") {
        bloqueados.push(`${item.imei}: tiene venta relacionada`);
        continue;
      }

      if (imeisConPrestamoActivo.has(item.imei) || estadoActual === "PRESTAMO") {
        bloqueados.push(`${item.imei}: tiene un prestamo activo`);
        continue;
      }

      if (imeisConRegistroAbierto.has(item.imei)) {
        bloqueados.push(`${item.imei}: tiene un registro comercial pendiente`);
        continue;
      }

      eliminables.push(item);
    }

    if (eliminables.length === 0) {
      return NextResponse.json(
        {
          error: "No hay equipos elegibles para eliminar",
          bloqueados,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventarioSede.deleteMany({
        where: {
          id: {
            in: eliminables.map((item) => item.id),
          },
        },
      });

      await tx.movimientoInventario.createMany({
        data: eliminables.map((item) => ({
          imei: item.imei,
          tipoMovimiento: "ELIMINADO",
          referencia: item.referencia,
          color: item.color ?? null,
          costo: item.costo,
          sedeId: item.sedeId,
          deboA: item.deboA ?? null,
          estadoFinanciero: item.estadoFinanciero,
          origen: item.origen,
          observacion: `Eliminado manualmente por ${user.usuario}. Distribuidor: ${item.distribuidor ?? "-"}`,
        })),
      });
    });

    return NextResponse.json({
      ok: true,
      eliminados: eliminables.length,
      bloqueados,
    });
  } catch (error) {
    console.error("ERROR ELIMINAR INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error eliminando equipo" },
      { status: 500 }
    );
  }
}
