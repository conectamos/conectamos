import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import {
  NOMBRE_SEDE_BODEGA,
  etiquetaSedeAcreedora,
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

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede pagar deuda de inventario" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = Number(body.id);

    if (!id) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase());

    const item = await prisma.inventarioSede.findUnique({
      where: { id },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        estadoActual: true,
        estadoAnterior: true,
        estadoFinanciero: true,
        deboA: true,
        origen: true,
        inventarioPrincipalId: true,
        sede: {
          select: {
            nombre: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      );
    }

    if (!esAdmin && item.sedeId !== user.sedeId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (!esEstadoDeuda(item.estadoFinanciero)) {
      return NextResponse.json(
        { error: "Este equipo no tiene deuda activa" },
        { status: 400 }
      );
    }

    const estadoActual = String(item.estadoActual || "").toUpperCase();
    const deudaProveedor = esDeudaProveedor(item.deboA);
    const equipoPrestadoConDeudaProveedor =
      estadoActual === "PRESTAMO" && deudaProveedor;
    const equipoTrasladadoConDeudaProveedor =
      estadoActual === "TRASLADO" && deudaProveedor;
    const equipoPrestamoPagoConDeudaProveedor =
      estadoActual === "PRESTAMO_PAGO" && deudaProveedor;
    const equipoYaVendido = estadoActual === "VENDIDO";
    const sedeItemNombre = etiquetaSedeAcreedora(item.sedeId, item.sede?.nombre);

    if (
      estadoActual !== "BODEGA" &&
      estadoActual !== "VENDIDO" &&
      !equipoPrestadoConDeudaProveedor &&
      !equipoTrasladadoConDeudaProveedor &&
      !equipoPrestamoPagoConDeudaProveedor
    ) {
      return NextResponse.json(
        {
          error:
            "Solo se puede pagar deuda del equipo que esta en BODEGA, VENDIDO, PRESTAMO, PRESTAMO PAGO o TRASLADO con deuda a proveedor.",
        },
        { status: 400 }
      );
    }

    if (esDeudaEntreSedes(item.deboA)) {
      return NextResponse.json(
        {
          error:
            "La deuda entre sedes debe solicitarse y aprobarse desde el modulo de prestamos.",
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
    const inventarioPrincipalRelacionado = item.inventarioPrincipalId
      ? await prisma.inventarioPrincipal.findUnique({
          where: { id: item.inventarioPrincipalId },
          select: { id: true },
        })
      : await prisma.inventarioPrincipal.findUnique({
          where: { imei: item.imei },
          select: { id: true },
        });
    const inventarioPrincipalRelacionadoId =
      item.inventarioPrincipalId || inventarioPrincipalRelacionado?.id || null;

    const prestamosActivos = await prisma.prestamoSede.findMany({
      where: {
        imei: item.imei,
        estado: {
          in: ["APROBADO", "PAGO_PENDIENTE_APROBACION"],
        },
      },
      select: {
        id: true,
        sedeOrigenId: true,
        sedeDestinoId: true,
        estado: true,
      },
    });

    const deudaProveedorDebeAprobarBodegaPrincipal =
      esDeudaProveedor(item.deboA) &&
      item.sedeId !== sedeBodegaId &&
      (String(item.origen || "").trim().toUpperCase() === "PRINCIPAL" ||
        !!inventarioPrincipalRelacionadoId);
    const prestamosDestinoActual = prestamosActivos.filter(
      (prestamo) => prestamo.sedeDestinoId === item.sedeId
    );
    const prestamoBodegaPrincipal = deudaProveedorDebeAprobarBodegaPrincipal
      ? prestamosDestinoActual.find(
          (prestamo) => prestamo.sedeOrigenId === sedeBodegaId
        ) ||
        prestamosDestinoActual[0] ||
        null
      : null;

    if (deudaProveedorDebeAprobarBodegaPrincipal) {
      if (sedeBodegaId <= 0) {
        return NextResponse.json(
          {
            error:
              "No se encontro Bodega Principal para solicitar aprobacion del pago.",
          },
          { status: 400 }
        );
      }

      const sedeAcreedoraId = sedeBodegaId;

      if (sedeAcreedoraId === item.sedeId) {
        return NextResponse.json(
          { error: "No se puede solicitar pago hacia la misma sede" },
          { status: 400 }
        );
      }

      if (prestamoBodegaPrincipal?.estado === "PAGO_PENDIENTE_APROBACION") {
        return NextResponse.json(
          { error: "Este pago ya esta pendiente de aprobacion" },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        let prestamoPagoId = prestamoBodegaPrincipal?.id ?? null;

        if (prestamoPagoId) {
          await tx.prestamoSede.update({
            where: { id: prestamoPagoId },
            data: {
              sedeOrigenId: sedeAcreedoraId,
              sedeDestinoId: item.sedeId,
              estado: "PAGO_PENDIENTE_APROBACION",
              montoPago: item.costo,
              fechaSolicitudPago: new Date(),
              fechaAprobacionPago: null,
            },
          });
        } else {
          const prestamoCreado = await tx.prestamoSede.create({
            data: {
              imei: item.imei,
              referencia: item.referencia,
              color: item.color || null,
              costo: item.costo,
              sedeOrigenId: sedeAcreedoraId,
              sedeDestinoId: item.sedeId,
              estado: "PAGO_PENDIENTE_APROBACION",
              montoPago: item.costo,
              fechaSolicitudPago: new Date(),
              fechaAprobacionPago: null,
            },
            select: {
              id: true,
            },
          });

          prestamoPagoId = prestamoCreado.id;
        }

        if (inventarioPrincipalRelacionadoId && !item.inventarioPrincipalId) {
          await tx.inventarioSede.update({
            where: { id: item.id },
            data: {
              inventarioPrincipalId: inventarioPrincipalRelacionadoId,
            },
          });
        }

        const movimientoPendiente = await tx.movimientoCajaSede.findFirst({
          where: {
            prestamoId: prestamoPagoId,
          },
          select: {
            id: true,
          },
        });

        if (movimientoPendiente) {
          await tx.movimientoCajaSede.update({
            where: { id: movimientoPendiente.id },
            data: {
              sedeId: sedeAcreedoraId,
              tipo: "PENDIENTE_APROBACION",
              concepto: "PAGO PRESTAMO ENTRE SEDES",
              valor: item.costo,
            },
          });
        } else {
          await tx.movimientoCajaSede.create({
            data: {
              sedeId: sedeAcreedoraId,
              tipo: "PENDIENTE_APROBACION",
              concepto: "PAGO PRESTAMO ENTRE SEDES",
              valor: item.costo,
              prestamoId: prestamoPagoId,
            },
          });
        }

        await tx.movimientoInventario.create({
          data: {
            imei: item.imei,
            tipoMovimiento: "PRESTAMO_SOLICITA_PAGO",
            referencia: item.referencia,
            color: item.color || null,
            costo: item.costo,
            sedeId: item.sedeId,
            deboA: item.deboA,
            estadoFinanciero: "DEUDA",
            origen: item.origen || "PRINCIPAL",
            observacion: `${sedeItemNombre} solicita pagar deuda a bodega principal. Prestamo #${prestamoPagoId}.`,
          },
        });
      });

      return NextResponse.json({
        ok: true,
        mensaje:
          "Solicitud de pago enviada. Bodega principal debe aprobarla desde Prestamos.",
      });
    }

    const prestamosConPlaceholder = prestamosActivos.filter(
      (prestamo) => prestamo.sedeOrigenId !== item.sedeId
    );
    const prestamosPorCobrarDesdeEstaSede = prestamosActivos.filter(
      (prestamo) => prestamo.sedeOrigenId === item.sedeId
    );

    if (equipoPrestadoConDeudaProveedor) {
      await prisma.$transaction(async (tx) => {
        await tx.cajaMovimiento.create({
          data: {
            tipo: "EGRESO",
            concepto: "PAGO DEUDA INVENTARIO",
            valor: item.costo,
            descripcion: `Pago de deuda del equipo prestado IMEI ${item.imei}${item.deboA ? ` a ${item.deboA}` : ""}`,
            sedeId: item.sedeId,
          },
        });

        if (prestamosPorCobrarDesdeEstaSede.length > 0) {
          await tx.inventarioSede.update({
            where: { id: item.id },
            data: {
              estadoFinanciero: "PAGO",
              deboA: null,
              estadoAnterior: item.estadoAnterior || item.estadoActual || null,
              estadoActual: "PRESTAMO",
              fechaMovimiento: new Date(),
              observacion:
                "Deuda pagada al proveedor. El equipo sigue prestado hasta que la sede destino pague.",
            },
          });
        } else {
          await tx.inventarioSede.delete({
            where: { id: item.id },
          });
        }

        await tx.movimientoInventario.create({
          data: {
            imei: item.imei,
            tipoMovimiento: "PAGO_DEUDA_INVENTARIO",
            referencia: item.referencia,
            color: item.color || null,
            costo: item.costo,
            sedeId: item.sedeId,
            deboA: null,
            estadoFinanciero: "PAGO",
            origen: item.origen || "INVENTARIO",
            observacion:
              prestamosPorCobrarDesdeEstaSede.length > 0
                ? "Se pago la deuda al proveedor. Queda pendiente el cobro del prestamo a la sede destino."
                : "Se pago la deuda al proveedor y se retiro el registro informativo del prestamo.",
          },
        });
      });

      return NextResponse.json({
        ok: true,
        mensaje: "Deuda pagada correctamente",
      });
    }

    if (equipoTrasladadoConDeudaProveedor || equipoPrestamoPagoConDeudaProveedor) {
      await prisma.$transaction(async (tx) => {
        await tx.cajaMovimiento.create({
          data: {
            tipo: "EGRESO",
            concepto: "PAGO DEUDA INVENTARIO",
            valor: item.costo,
            descripcion: `Pago de deuda del equipo trasladado IMEI ${item.imei}${item.deboA ? ` a ${item.deboA}` : ""}`,
            sedeId: item.sedeId,
          },
        });

        await tx.inventarioSede.update({
          where: { id: item.id },
          data: {
            estadoFinanciero: "PAGO",
            deboA: null,
            estadoAnterior: item.estadoAnterior || item.estadoActual || null,
            estadoActual: estadoActual === "PRESTAMO_PAGO" ? "PRESTAMO_PAGO" : "TRASLADO",
            fechaMovimiento: new Date(),
            observacion:
              estadoActual === "PRESTAMO_PAGO"
                ? "Deuda pagada al proveedor. El registro queda como prestamo pago."
                : "Deuda pagada al proveedor. El registro queda como traslado operativo.",
          },
        });

        await tx.movimientoInventario.create({
          data: {
            imei: item.imei,
            tipoMovimiento: "PAGO_DEUDA_INVENTARIO",
            referencia: item.referencia,
            color: item.color || null,
            costo: item.costo,
            sedeId: item.sedeId,
            deboA: null,
            estadoFinanciero: "PAGO",
            origen: item.origen || estadoActual,
            observacion:
              estadoActual === "PRESTAMO_PAGO"
                ? "Se pago la deuda al proveedor de un prestamo ya pagado por la sede destino."
                : "Se pago la deuda al proveedor de un equipo ya trasladado.",
          },
        });
      });

      return NextResponse.json({
        ok: true,
        mensaje: "Deuda pagada correctamente",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.cajaMovimiento.create({
        data: {
          tipo: "EGRESO",
          concepto: "PAGO DEUDA INVENTARIO",
          valor: item.costo,
          descripcion: `Pago de deuda del equipo IMEI ${item.imei}${item.deboA ? ` a ${item.deboA}` : ""}`,
          sedeId: item.sedeId,
        },
      });

      await tx.inventarioSede.update({
        where: { id: item.id },
        data: {
          estadoFinanciero: "PAGO",
          deboA: null,
          estadoAnterior: equipoYaVendido
            ? item.estadoAnterior || item.estadoActual || null
            : item.estadoActual || null,
          estadoActual: equipoYaVendido ? "VENDIDO" : "BODEGA",
          fechaMovimiento: new Date(),
          observacion: equipoYaVendido
            ? "Deuda pagada al proveedor. Equipo vendido queda en PAGO."
            : "Deuda pagada al proveedor. Equipo queda en PAGO.",
        },
      });

      if (prestamosActivos.length > 0) {
        await tx.prestamoSede.updateMany({
          where: {
            id: {
              in: prestamosActivos.map((prestamo) => prestamo.id),
            },
          },
          data: {
            estado: "PAGADO",
            fechaAprobacionPago: new Date(),
          },
        });

        for (const prestamo of prestamosConPlaceholder) {
          await tx.inventarioSede.deleteMany({
            where: {
              imei: item.imei,
              sedeId: prestamo.sedeOrigenId,
              estadoActual: "PRESTAMO",
            },
          });

          await tx.movimientoCajaSede.updateMany({
            where: {
              prestamoId: prestamo.id,
              tipo: "PENDIENTE_APROBACION",
            },
            data: {
              tipo: "ANULADO",
            },
          });
        }

        await tx.inventarioPrincipal.updateMany({
          where: {
            imei: item.imei,
            estado: "PRESTAMO",
          },
          data: {
            estado: "PAGO",
            estadoCobro: "PAGADO",
          },
        });
      }

      await tx.movimientoInventario.create({
        data: {
          imei: item.imei,
          tipoMovimiento: "PAGO_DEUDA_INVENTARIO",
          referencia: item.referencia,
          color: item.color || null,
          costo: item.costo,
          sedeId: item.sedeId,
          deboA: null,
          estadoFinanciero: "PAGO",
          origen: item.origen || "INVENTARIO",
          observacion:
            prestamosActivos.length > 0
              ? "Se pago la deuda del proveedor y se cerraron los prestamos activos del equipo."
              : "Se pago la deuda del equipo.",
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Deuda pagada correctamente",
    });
  } catch (error) {
    console.error("ERROR PAGAR DEUDA INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error interno pagando deuda" },
      { status: 500 }
    );
  }
}
