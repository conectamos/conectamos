import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  NOMBRE_SEDE_BODEGA,
  esDeudaEntreSedes,
  esDeudaProveedor,
  esEstadoDeuda,
} from "@/lib/prestamos";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const body = await req.json();
    const prestamoId = Number(body.prestamoId ?? body.id);

    if (!prestamoId) {
      return NextResponse.json(
        { error: "ID de prestamo invalido" },
        { status: 400 }
      );
    }

    const prestamo = await prisma.prestamoSede.findUnique({
      where: { id: prestamoId },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeOrigenId: true,
        sedeDestinoId: true,
        estado: true,
        montoPago: true,
      },
    });

    if (!prestamo) {
      return NextResponse.json(
        { error: "Prestamo no encontrado" },
        { status: 404 }
      );
    }

    if (!esAdmin && user.sedeId !== prestamo.sedeOrigenId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (prestamo.estado !== "PAGO_PENDIENTE_APROBACION") {
      return NextResponse.json(
        { error: "Este prestamo no esta pendiente de aprobacion" },
        { status: 400 }
      );
    }

    const montoEsperado = Number(prestamo.costo || 0);
    const montoSolicitado = Number(prestamo.montoPago || 0);

    if (!montoSolicitado || montoSolicitado <= 0) {
      return NextResponse.json(
        { error: "El prestamo no tiene un monto de pago valido" },
        { status: 400 }
      );
    }

    if (montoSolicitado !== montoEsperado) {
      return NextResponse.json(
        {
          error: `El monto de pago debe ser exacto. Valor esperado: ${montoEsperado}`,
        },
        { status: 400 }
      );
    }

    const sedeBodegaPrincipal = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: NOMBRE_SEDE_BODEGA,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });
    const sedeBodegaId = sedeBodegaPrincipal?.id ?? -1;

    const equipoDestino = await prisma.inventarioSede.findFirst({
      where: {
        imei: prestamo.imei,
        sedeId: prestamo.sedeDestinoId,
      },
      select: {
        id: true,
        estadoFinanciero: true,
        deboA: true,
        origen: true,
        inventarioPrincipalId: true,
      },
    });

    const equipoOrigen = await prisma.inventarioSede.findFirst({
      where: {
        imei: prestamo.imei,
        sedeId: prestamo.sedeOrigenId,
        estadoActual: "PRESTAMO",
      },
      select: {
        id: true,
      },
    });

    if (!equipoDestino) {
      return NextResponse.json(
        { error: "No se encontraron los registros del prestamo" },
        { status: 404 }
      );
    }

    const prestamoDesdeBodegaPrincipal =
      prestamo.sedeOrigenId === sedeBodegaId ||
      ((String(equipoDestino.origen || "").trim().toUpperCase() ===
        "PRINCIPAL" ||
        !!equipoDestino.inventarioPrincipalId) &&
        esEstadoDeuda(equipoDestino.estadoFinanciero) &&
        esDeudaProveedor(equipoDestino.deboA));

    if (!prestamoDesdeBodegaPrincipal && !equipoOrigen) {
      return NextResponse.json(
        { error: "No se encontraron los registros del prestamo" },
        { status: 404 }
      );
    }

    if (
      prestamoDesdeBodegaPrincipal &&
      (!esEstadoDeuda(equipoDestino.estadoFinanciero) ||
        !esDeudaProveedor(equipoDestino.deboA))
    ) {
      return NextResponse.json(
        {
          error:
            "Este equipo no tiene una deuda de bodega principal pendiente de aprobacion.",
        },
        { status: 400 }
      );
    }

    if (!prestamoDesdeBodegaPrincipal && !esDeudaEntreSedes(equipoDestino.deboA)) {
      return NextResponse.json(
        {
          error:
            "Este equipo no tiene una deuda entre sedes pendiente de aprobacion.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.prestamoSede.update({
        where: { id: prestamo.id },
        data: {
          estado: "PAGADO",
          fechaAprobacionPago: new Date(),
        },
      });

      await tx.cajaMovimiento.create({
        data: {
          tipo: "INGRESO",
          concepto: "PAGO PRESTAMO ENTRE SEDES",
          valor: montoSolicitado,
          descripcion: prestamoDesdeBodegaPrincipal
            ? `Ingreso por aprobacion de pago a bodega principal IMEI ${prestamo.imei} desde sede ${prestamo.sedeDestinoId}`
            : `Ingreso por aprobacion de pago prestamo IMEI ${prestamo.imei} desde sede ${prestamo.sedeDestinoId}`,
          sedeId: prestamo.sedeOrigenId,
        },
      });

      await tx.cajaMovimiento.create({
        data: {
          tipo: "EGRESO",
          concepto: "PAGO PRESTAMO ENTRE SEDES",
          valor: montoSolicitado,
          descripcion: prestamoDesdeBodegaPrincipal
            ? `Egreso por pago aprobado a bodega principal IMEI ${prestamo.imei}`
            : `Egreso por pago aprobado de prestamo IMEI ${prestamo.imei} hacia sede ${prestamo.sedeOrigenId}`,
          sedeId: prestamo.sedeDestinoId,
        },
      });

      const movimientoPendiente = await tx.movimientoCajaSede.findFirst({
        where: {
          prestamoId: prestamo.id,
        },
        select: {
          id: true,
        },
      });

      if (movimientoPendiente) {
        await tx.movimientoCajaSede.update({
          where: { id: movimientoPendiente.id },
          data: {
            tipo: "INGRESO",
            concepto: "PAGO PRESTAMO ENTRE SEDES",
            valor: montoSolicitado,
            sedeId: prestamo.sedeOrigenId,
          },
        });
      } else {
        await tx.movimientoCajaSede.create({
          data: {
            sedeId: prestamo.sedeOrigenId,
            tipo: "INGRESO",
            concepto: "PAGO PRESTAMO ENTRE SEDES",
            valor: montoSolicitado,
            prestamoId: prestamo.id,
          },
        });
      }

      await tx.movimientoCajaSede.create({
        data: {
          sedeId: prestamo.sedeDestinoId,
          tipo: "EGRESO",
          concepto: "PAGO PRESTAMO ENTRE SEDES",
          valor: montoSolicitado,
          prestamoId: prestamo.id,
        },
      });

      await tx.inventarioSede.update({
        where: { id: equipoDestino.id },
        data: {
          estadoFinanciero: "PAGO",
          deboA: null,
          fechaMovimiento: new Date(),
          observacion: `Pago aprobado a SEDE ${prestamo.sedeOrigenId}`,
        },
      });

      if (prestamoDesdeBodegaPrincipal) {
        if (equipoDestino.inventarioPrincipalId) {
          await tx.inventarioPrincipal.update({
            where: { id: equipoDestino.inventarioPrincipalId },
            data: {
              estado: "PAGO",
              estadoCobro: "PAGADO",
            },
          });
        } else {
          await tx.inventarioPrincipal.updateMany({
            where: {
              imei: prestamo.imei,
              estado: "PRESTAMO",
            },
            data: {
              estado: "PAGO",
              estadoCobro: "PAGADO",
            },
          });
        }
      } else if (equipoOrigen) {
        await tx.inventarioSede.delete({
          where: { id: equipoOrigen.id },
        });
      }

      await tx.movimientoInventario.create({
        data: {
          imei: prestamo.imei,
          tipoMovimiento: "PAGO_PRESTAMO_APROBADO",
          referencia: prestamo.referencia,
          color: prestamo.color || null,
          costo: prestamo.costo,
          sedeId: prestamo.sedeDestinoId,
          deboA: null,
          estadoFinanciero: "PAGO",
          origen: prestamoDesdeBodegaPrincipal
            ? "PAGO_BODEGA_PRINCIPAL"
            : "PRESTAMO_SEDE",
          observacion: prestamoDesdeBodegaPrincipal
            ? `Pago total aprobado a bodega principal. Sede destino: ${prestamo.sedeDestinoId}.`
            : `Pago total aprobado del prestamo. Sede origen: ${prestamo.sedeOrigenId}. Sede destino: ${prestamo.sedeDestinoId}.`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Pago aprobado correctamente",
    });
  } catch (error) {
    console.error("ERROR APROBAR PAGO PRESTAMO:", error);
    return NextResponse.json(
      { error: "Error interno al aprobar pago" },
      { status: 500 }
    );
  }
}
