import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { esRolAdministrativo } from "@/lib/access-control";

const ESTADOS_RETORNO_VALIDOS = ["BODEGA", "GARANTIA", "PENDIENTE"];

function limpiarImei(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function imeiValido(value: string) {
  return /^\d{15}$/.test(value);
}

function normalizarEstado(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function actorNombre(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  return String(user.nombre || user.usuario || "admin").trim();
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!esRolAdministrativo(user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede registrar cambios de equipo" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);
    const imeiAnteriorInput = limpiarImei(body.imeiAnterior);
    const imeiNuevoInput = limpiarImei(body.imeiNuevo);
    const estadoRetorno = normalizarEstado(body.estadoRetorno || "BODEGA");
    const observacionManual = String(body.observacion || "").trim();

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    if (!ESTADOS_RETORNO_VALIDOS.includes(estadoRetorno)) {
      return NextResponse.json(
        { error: "Estado de retorno no permitido" },
        { status: 400 }
      );
    }

    const itemBase = await prisma.inventarioSede.findUnique({
      where: { id },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        distribuidor: true,
        sedeId: true,
        deboA: true,
        estadoActual: true,
        estadoFinanciero: true,
        origen: true,
        ventas: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!itemBase) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      );
    }

    const estadoBase = normalizarEstado(itemBase.estadoActual);
    const esReemplazoDesdeVendido = estadoBase === "VENDIDO";
    const esVentaPorCambio = estadoBase === "BODEGA";

    if (!esReemplazoDesdeVendido && !esVentaPorCambio) {
      return NextResponse.json(
        { error: "El cambio solo aplica para equipos en BODEGA o VENDIDO" },
        { status: 400 }
      );
    }

    const imeiNuevo = esReemplazoDesdeVendido ? imeiNuevoInput : itemBase.imei;
    const imeiAnterior = esReemplazoDesdeVendido ? itemBase.imei : imeiAnteriorInput;

    if (!imeiValido(imeiNuevo)) {
      return NextResponse.json(
        { error: "El IMEI nuevo debe tener exactamente 15 digitos" },
        { status: 400 }
      );
    }

    if (!imeiValido(imeiAnterior)) {
      return NextResponse.json(
        { error: "El IMEI anterior debe tener exactamente 15 digitos" },
        { status: 400 }
      );
    }

    if (imeiNuevo === imeiAnterior) {
      return NextResponse.json(
        { error: "El IMEI anterior y el nuevo no pueden ser iguales" },
        { status: 400 }
      );
    }

    const nuevoItem = esReemplazoDesdeVendido
      ? await prisma.inventarioSede.findFirst({
          where: {
            imei: imeiNuevo,
            sedeId: itemBase.sedeId,
          },
          orderBy: { id: "desc" },
          select: {
            id: true,
            imei: true,
            referencia: true,
            color: true,
            costo: true,
            distribuidor: true,
            sedeId: true,
            deboA: true,
            estadoActual: true,
            estadoFinanciero: true,
            origen: true,
            ventas: {
              select: { id: true },
              take: 1,
            },
          },
        })
      : itemBase;

    if (!nuevoItem) {
      const existeEnOtraSede = await prisma.inventarioSede.findFirst({
        where: { imei: imeiNuevo },
        select: { sedeId: true },
      });

      return NextResponse.json(
        {
          error: existeEnOtraSede
            ? "El IMEI nuevo existe, pero no esta en la misma sede del equipo vendido"
            : "El IMEI nuevo no existe en inventario de sede",
        },
        { status: 400 }
      );
    }

    const estadoNuevo = normalizarEstado(nuevoItem.estadoActual);

    if (estadoNuevo !== "BODEGA") {
      return NextResponse.json(
        { error: `El IMEI nuevo debe estar en BODEGA. Estado actual: ${estadoNuevo || "-"}` },
        { status: 400 }
      );
    }

    if (nuevoItem.ventas.length > 0) {
      return NextResponse.json(
        { error: "El IMEI nuevo ya tiene una venta relacionada" },
        { status: 400 }
      );
    }

    const ventaExistenteNuevo = await prisma.venta.findFirst({
      where: {
        OR: [{ serial: nuevoItem.imei }, { inventarioSedeId: nuevoItem.id }],
      },
      select: { id: true },
    });

    if (ventaExistenteNuevo) {
      return NextResponse.json(
        { error: "El IMEI nuevo ya aparece en ventas" },
        { status: 400 }
      );
    }

    const registrosAbiertosNuevo = await prisma.registroVendedorVenta.findFirst({
      where: {
        serialImei: nuevoItem.imei,
        eliminadoEn: null,
        ventaIdRelacionada: null,
      },
      select: { id: true },
    });

    if (registrosAbiertosNuevo) {
      return NextResponse.json(
        { error: "El IMEI nuevo tiene un registro comercial pendiente" },
        { status: 400 }
      );
    }

    const posiblesAnteriores = esReemplazoDesdeVendido
      ? [itemBase]
      : await prisma.inventarioSede.findMany({
          where: { imei: imeiAnterior },
          orderBy: { id: "desc" },
          select: {
            id: true,
            imei: true,
            referencia: true,
            color: true,
            costo: true,
            distribuidor: true,
            sedeId: true,
            deboA: true,
            estadoActual: true,
            estadoFinanciero: true,
            origen: true,
            ventas: {
              select: { id: true },
              take: 1,
            },
          },
        });

    const anteriorMismaSede = posiblesAnteriores.find(
      (item) => item.sedeId === nuevoItem.sedeId
    );
    const existeAnteriorOtraSede =
      !anteriorMismaSede && posiblesAnteriores.length > 0;

    if (existeAnteriorOtraSede) {
      return NextResponse.json(
        { error: "El IMEI anterior existe, pero pertenece a otra sede" },
        { status: 400 }
      );
    }

    const anteriorItem = anteriorMismaSede || null;

    const estadoAnteriorItem = normalizarEstado(anteriorItem?.estadoActual);

    if (
      anteriorItem &&
      anteriorItem.id !== nuevoItem.id &&
      estadoAnteriorItem !== "VENDIDO" &&
      !ESTADOS_RETORNO_VALIDOS.includes(estadoAnteriorItem)
    ) {
      return NextResponse.json(
        { error: "El IMEI anterior existe, pero no esta disponible para retorno" },
        { status: 400 }
      );
    }

    const ventasAnterior = anteriorItem
      ? await prisma.venta.findMany({
          where: {
            OR: [
              { inventarioSedeId: anteriorItem.id },
              { serial: anteriorItem.imei },
            ],
          },
          select: { id: true, idVenta: true },
        })
      : [];

    const now = new Date();
    const actor = actorNombre(user);
    const ventaIds = ventasAnterior.map((venta) => venta.id);
    const detalleVentas = ventasAnterior.length
      ? ` Ventas actualizadas: ${ventasAnterior.map((venta) => venta.idVenta).join(", ")}.`
      : " Sin venta historica relacionada.";
    const observacionBase = [
      `Cambio de equipo autorizado por ${actor}.`,
      `Anterior ${imeiAnterior}. Nuevo ${imeiNuevo}.`,
      detalleVentas.trim(),
      observacionManual ? `Observacion: ${observacionManual}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    await prisma.$transaction(async (tx) => {
      if (ventasAnterior.length > 0) {
        await tx.venta.updateMany({
          where: { id: { in: ventaIds } },
          data: {
            serial: nuevoItem.imei,
            inventarioSedeId: nuevoItem.id,
          },
        });

        await tx.registroVendedorVenta.updateMany({
          where: {
            OR: [
              { serialImei: anteriorItem?.imei },
              { ventaIdRelacionada: { in: ventaIds } },
            ],
          },
          data: {
            serialImei: nuevoItem.imei,
            referenciaEquipo: nuevoItem.referencia,
            color: nuevoItem.color || null,
          },
        });
      } else if (anteriorItem) {
        await tx.registroVendedorVenta.updateMany({
          where: {
            serialImei: anteriorItem.imei,
            eliminadoEn: null,
            ventaIdRelacionada: null,
          },
          data: {
            serialImei: nuevoItem.imei,
            referenciaEquipo: nuevoItem.referencia,
            color: nuevoItem.color || null,
          },
        });
      }

      if (anteriorItem && anteriorItem.id !== nuevoItem.id) {
        await tx.inventarioSede.update({
          where: { id: anteriorItem.id },
          data: {
            estadoAnterior: anteriorItem.estadoActual || null,
            estadoActual: estadoRetorno,
            fechaMovimiento: now,
            observacion: `${observacionBase} Equipo anterior retorna a ${estadoRetorno}.`,
            origen: "CAMBIO",
          },
        });

        await tx.movimientoInventario.create({
          data: {
            imei: anteriorItem.imei,
            tipoMovimiento: "CAMBIO_EQUIPO_ANTERIOR",
            referencia: anteriorItem.referencia,
            color: anteriorItem.color || null,
            costo: anteriorItem.costo,
            sedeId: anteriorItem.sedeId,
            deboA: anteriorItem.deboA || null,
            estadoFinanciero: anteriorItem.estadoFinanciero,
            origen: "CAMBIO",
            observacion: `${observacionBase} Equipo anterior retorna a ${estadoRetorno}.`,
          },
        });
      }

      await tx.inventarioSede.update({
        where: { id: nuevoItem.id },
        data: {
          estadoAnterior: nuevoItem.estadoActual || null,
          estadoActual: "VENDIDO",
          fechaMovimiento: now,
          observacion: `${observacionBase} Equipo nuevo queda VENDIDO por cambio.`,
          origen: "CAMBIO",
        },
      });

      await tx.movimientoInventario.create({
        data: {
          imei: nuevoItem.imei,
          tipoMovimiento: "CAMBIO_EQUIPO_NUEVO",
          referencia: nuevoItem.referencia,
          color: nuevoItem.color || null,
          costo: nuevoItem.costo,
          sedeId: nuevoItem.sedeId,
          deboA: nuevoItem.deboA || null,
          estadoFinanciero: nuevoItem.estadoFinanciero,
          origen: "CAMBIO",
          observacion: `${observacionBase} Equipo nuevo queda VENDIDO por cambio.`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: ventasAnterior.length
        ? "Cambio registrado y ventas actualizadas correctamente"
        : "Cambio registrado correctamente",
      ventasActualizadas: ventasAnterior.length,
    });
  } catch (error) {
    console.error("ERROR CAMBIO EQUIPO:", error);
    return NextResponse.json(
      { error: "Error registrando cambio de equipo" },
      { status: 500 }
    );
  }
}
