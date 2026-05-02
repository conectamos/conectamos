import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { esRolAdmin } from "@/lib/access-control";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";

const ESTADOS_PRESTAMO_ACTIVOS = [
  "PENDIENTE",
  "APROBADO",
  "PAGO_PENDIENTE_APROBACION",
  "DEVOLUCION_PENDIENTE",
];

function parseIds(value: unknown) {
  const raw = Array.isArray(value) ? value : [value];

  return [
    ...new Set(
      raw
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    ),
  ];
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!esRolAdmin(user.rolNombre)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const ids = parseIds(body.ids ?? body.id);

    if (ids.length === 0) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
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

    if (!sedeBodega) {
      return NextResponse.json(
        { error: "No existe la sede configurada como bodega principal" },
        { status: 400 }
      );
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

    const imeis = items.map((item) => item.imei);
    const inventariosSede = await prisma.inventarioSede.findMany({
      where: {
        inventarioPrincipalId: { in: items.map((item) => item.id) },
      },
      select: {
        id: true,
        imei: true,
        inventarioPrincipalId: true,
        sedeId: true,
        estadoActual: true,
        estadoFinanciero: true,
        deboA: true,
        ventas: {
          select: { id: true },
          take: 1,
        },
      },
    });

    const prestamosActivos = await prisma.prestamoSede.findMany({
      where: {
        imei: { in: imeis },
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
        serialImei: { in: imeis },
        eliminadoEn: null,
        ventaIdRelacionada: null,
      },
      select: { serialImei: true },
    });

    const imeisConRegistroAbierto = new Set(
      registrosVentaAbiertos
        .map((item) => item.serialImei || "")
        .filter(Boolean)
    );

    const restaurables: Array<{
      item: (typeof items)[number];
      inventarioSedeId: number;
      prestamoId: number;
    }> = [];
    const bloqueados: string[] = [];

    for (const item of items) {
      const estadoPrincipal = String(item.estado || "BODEGA").toUpperCase();
      const estadoCobro = String(item.estadoCobro || "").toUpperCase();
      const relacionados = inventariosSede.filter(
        (inventario) => inventario.inventarioPrincipalId === item.id
      );
      const prestamosItem = prestamosActivos.filter(
        (prestamo) => prestamo.imei === item.imei
      );

      if (estadoPrincipal !== "PRESTAMO") {
        bloqueados.push(`${item.imei}: no esta en PRESTAMO`);
        continue;
      }

      if (estadoCobro && estadoCobro !== "PENDIENTE") {
        bloqueados.push(`${item.imei}: ya tiene cobro ${estadoCobro}`);
        continue;
      }

      if (relacionados.length !== 1) {
        bloqueados.push(`${item.imei}: tiene trazabilidad de sede multiple o incompleta`);
        continue;
      }

      const inventarioSede = relacionados[0];
      const estadoSede = String(inventarioSede.estadoActual || "").toUpperCase();

      if (estadoSede !== "BODEGA" || inventarioSede.ventas.length > 0) {
        bloqueados.push(`${item.imei}: ya fue movido o vendido en la sede`);
        continue;
      }

      if (imeiConRegistroAbierto(imeisConRegistroAbierto, item.imei)) {
        bloqueados.push(`${item.imei}: tiene un registro comercial pendiente`);
        continue;
      }

      if (prestamosItem.length !== 1) {
        bloqueados.push(`${item.imei}: tiene prestamos activos adicionales`);
        continue;
      }

      const prestamo = prestamosItem[0];

      if (
        prestamo.estado !== "APROBADO" ||
        prestamo.sedeOrigenId !== sedeBodega.id ||
        prestamo.sedeDestinoId !== inventarioSede.sedeId ||
        prestamo.movimientosCaja.length > 0
      ) {
        bloqueados.push(`${item.imei}: el prestamo ya no esta limpio para correccion`);
        continue;
      }

      restaurables.push({
        item,
        inventarioSedeId: inventarioSede.id,
        prestamoId: prestamo.id,
      });
    }

    if (restaurables.length === 0) {
      return NextResponse.json(
        {
          error: "No hay equipos elegibles para volver a bodega principal",
          bloqueados,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventarioSede.deleteMany({
        where: {
          id: { in: restaurables.map((item) => item.inventarioSedeId) },
        },
      });

      await tx.prestamoSede.updateMany({
        where: {
          id: { in: restaurables.map((item) => item.prestamoId) },
        },
        data: {
          estado: "CANCELADO",
          montoPago: null,
          fechaSolicitudPago: null,
          fechaAprobacionPago: null,
        },
      });

      await tx.inventarioPrincipal.updateMany({
        where: {
          id: { in: restaurables.map(({ item }) => item.id) },
        },
        data: {
          estado: "BODEGA",
          sedeDestinoId: null,
          estadoCobro: null,
          fechaEnvio: null,
          observacion: `Envio revertido por admin ${user.usuario}. Equipo vuelve a bodega principal.`,
        },
      });

      await tx.movimientoInventario.createMany({
        data: restaurables.map(({ item }) => ({
          imei: item.imei,
          tipoMovimiento: "CORRECCION_RETORNO_PRINCIPAL",
          referencia: item.referencia,
          color: item.color || null,
          costo: item.costo,
          sedeId: sedeBodega.id,
          estadoFinanciero: "PAGO",
          origen: "ADMIN",
          observacion: `Admin ${user.usuario} revirtio envio desde bodega principal. Equipo vuelve a BODEGA.`,
        })),
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje:
        restaurables.length === 1
          ? "Equipo devuelto a bodega principal correctamente"
          : `${restaurables.length} equipos devueltos a bodega principal correctamente`,
      restaurados: restaurables.length,
      bloqueados,
    });
  } catch (error) {
    console.error("ERROR RESTAURAR INVENTARIO PRINCIPAL:", error);
    return NextResponse.json(
      { error: "Error devolviendo equipo a bodega principal" },
      { status: 500 }
    );
  }
}

function imeiConRegistroAbierto(registros: Set<string>, imei: string) {
  return registros.has(imei);
}
