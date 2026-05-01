import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  NOMBRE_SEDE_BODEGA,
  etiquetaSedeAcreedora,
  esDeudaProveedor,
  esEstadoDeuda,
  resolverFinanzasDestinoPrestamo,
} from "@/lib/prestamos";
import { esSedeVentas } from "@/lib/sedes";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const prestamo = await prisma.prestamoSede.findUnique({
      where: { id: Number(id) },
    });

    if (!prestamo) {
      return NextResponse.json(
        { error: "Prestamo no encontrado" },
        { status: 404 }
      );
    }

    if (String(prestamo.estado).toUpperCase() !== "PENDIENTE") {
      return NextResponse.json(
        { error: "El prestamo no esta pendiente" },
        { status: 400 }
      );
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const esDestino = Number(user.sedeId) === Number(prestamo.sedeDestinoId);
    const sedeBodegaPrincipal = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: NOMBRE_SEDE_BODEGA,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });
    const sedeBodegaId = sedeBodegaPrincipal?.id ?? -1;

    if (!esAdmin && !esDestino) {
      return NextResponse.json(
        { error: "No autorizado para aprobar este prestamo" },
        { status: 403 }
      );
    }

    const sedeDestino = await prisma.sede.findUnique({
      where: { id: Number(prestamo.sedeDestinoId) },
      select: { nombre: true },
    });

    if (!sedeDestino) {
      return NextResponse.json(
        { error: "La sede destino no existe" },
        { status: 404 }
      );
    }

    if (esSedeVentas(sedeDestino.nombre)) {
      return NextResponse.json(
        {
          error:
            "La sede VENTAS es informativa y no puede recibir equipos de inventario",
        },
        { status: 400 }
      );
    }

    const itemOrigen = await prisma.inventarioSede.findFirst({
      where: {
        imei: prestamo.imei,
        sedeId: Number(prestamo.sedeOrigenId),
      },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        estadoActual: true,
        estadoFinanciero: true,
        deboA: true,
        distribuidor: true,
        origen: true,
        inventarioPrincipalId: true,
        sede: {
          select: {
            nombre: true,
          },
        },
      },
    });

    if (!itemOrigen) {
      return NextResponse.json(
        { error: "Equipo no encontrado en la sede origen" },
        { status: 404 }
      );
    }

    const trasladaDeudaDePrincipal =
      String(itemOrigen.origen || "").toUpperCase() === "PRINCIPAL" &&
      esEstadoDeuda(itemOrigen.estadoFinanciero) &&
      esDeudaProveedor(itemOrigen.deboA);
    const prestamoPrincipalActivo = trasladaDeudaDePrincipal
      ? await prisma.prestamoSede.findFirst({
          where: {
            imei: prestamo.imei,
            sedeDestinoId: prestamo.sedeOrigenId,
            id: {
              not: prestamo.id,
            },
            estado: {
              in: ["APROBADO", "PAGO_PENDIENTE_APROBACION"],
            },
          },
          orderBy: {
            id: "desc",
          },
          select: {
            id: true,
            sedeOrigenId: true,
          },
        })
      : null;

    const finanzasDestino = resolverFinanzasDestinoPrestamo({
      estadoFinanciero: itemOrigen.estadoFinanciero,
      deboA: itemOrigen.deboA,
      sedeOrigenId: prestamo.sedeOrigenId,
      sedeOrigenNombre: itemOrigen.sede?.nombre,
    });
    const sedeOrigenNombre = etiquetaSedeAcreedora(
      prestamo.sedeOrigenId,
      itemOrigen.sede?.nombre
    );
    const sedeDestinoNombre = sedeDestino.nombre;

    await prisma.$transaction(async (tx) => {
      const existenteDestino = await tx.inventarioSede.findFirst({
        where: {
          imei: prestamo.imei,
          sedeId: Number(prestamo.sedeDestinoId),
        },
      });

      if (existenteDestino) {
        await tx.inventarioSede.update({
          where: { id: existenteDestino.id },
          data: {
            referencia: prestamo.referencia,
            color: prestamo.color,
            costo: Number(prestamo.costo),
            distribuidor: itemOrigen.distribuidor,
            deboA: finanzasDestino.deboA,
            estadoFinanciero: finanzasDestino.estadoFinanciero,
            origen: "PRESTAMO",
            estadoAnterior: existenteDestino.estadoActual,
            estadoActual: "BODEGA",
            fechaMovimiento: new Date(),
            inventarioPrincipalId: itemOrigen.inventarioPrincipalId || null,
            observacion: `Recibido por prestamo desde ${sedeOrigenNombre}`,
          },
        });
      } else {
        await tx.inventarioSede.create({
          data: {
            imei: prestamo.imei,
            referencia: prestamo.referencia,
            color: prestamo.color,
            costo: Number(prestamo.costo),
            distribuidor: itemOrigen.distribuidor,
            sedeId: Number(prestamo.sedeDestinoId),
            deboA: finanzasDestino.deboA,
            estadoFinanciero: finanzasDestino.estadoFinanciero,
            origen: "PRESTAMO",
            estadoAnterior: itemOrigen.estadoActual,
            estadoActual: "BODEGA",
            fechaMovimiento: new Date(),
            inventarioPrincipalId: itemOrigen.inventarioPrincipalId || null,
            observacion: `Recibido por prestamo desde ${sedeOrigenNombre}`,
          },
        });
      }

      await tx.inventarioSede.update({
        where: { id: itemOrigen.id },
        data: {
          estadoAnterior: itemOrigen.estadoActual,
          estadoActual: "PRESTAMO",
          fechaMovimiento: new Date(),
          observacion: trasladaDeudaDePrincipal
            ? `Prestamo aprobado hacia ${sedeDestinoNombre}. La deuda de principal queda trasladada a la sede destino.`
            : `Prestamo aprobado hacia ${sedeDestinoNombre}`,
          estadoFinanciero: trasladaDeudaDePrincipal
            ? "PAGO"
            : itemOrigen.estadoFinanciero,
          deboA: trasladaDeudaDePrincipal ? null : itemOrigen.deboA,
        },
      });

      await tx.prestamoSede.update({
        where: { id: prestamo.id },
        data: {
          estado: "APROBADO",
        },
      });

      if (trasladaDeudaDePrincipal) {
        if (itemOrigen.inventarioPrincipalId) {
          await tx.inventarioPrincipal.update({
            where: { id: itemOrigen.inventarioPrincipalId },
            data: {
              estado: "PRESTAMO",
              sedeDestinoId: prestamo.sedeDestinoId,
              estadoCobro: "PENDIENTE",
              fechaEnvio: new Date(),
              observacion: `Deuda activa trasladada a ${sedeDestinoNombre} despues de aprobacion desde ${sedeOrigenNombre}.`,
            },
          });
        } else {
          await tx.inventarioPrincipal.updateMany({
            where: {
              imei: prestamo.imei,
            },
            data: {
              estado: "PRESTAMO",
              sedeDestinoId: prestamo.sedeDestinoId,
              estadoCobro: "PENDIENTE",
              fechaEnvio: new Date(),
              observacion: `Deuda activa trasladada a ${sedeDestinoNombre} despues de aprobacion desde ${sedeOrigenNombre}.`,
            },
          });
        }

        if (prestamoPrincipalActivo) {
          await tx.prestamoSede.update({
            where: {
              id: prestamoPrincipalActivo.id,
            },
            data: {
              sedeOrigenId:
                prestamoPrincipalActivo.sedeOrigenId === sedeBodegaId
                  ? prestamoPrincipalActivo.sedeOrigenId
                  : sedeBodegaId > 0
                    ? sedeBodegaId
                    : prestamoPrincipalActivo.sedeOrigenId,
              sedeDestinoId: prestamo.sedeDestinoId,
              estado: "APROBADO",
              montoPago: null,
              fechaSolicitudPago: null,
              fechaAprobacionPago: null,
            },
          });
        }
      }

      await tx.movimientoInventario.create({
        data: {
          imei: prestamo.imei,
          tipoMovimiento: "PRESTAMO_RECIBIDO",
          referencia: prestamo.referencia,
          color: prestamo.color || null,
          costo: Number(prestamo.costo),
          sedeId: Number(prestamo.sedeDestinoId),
          deboA: finanzasDestino.deboA,
          estadoFinanciero: finanzasDestino.estadoFinanciero,
          origen: "PRESTAMO",
          observacion: trasladaDeudaDePrincipal
            ? `Prestamo aprobado desde ${sedeOrigenNombre}. La deuda del proveedor queda ahora en la sede destino.`
            : `Prestamo aprobado y recibido desde ${sedeOrigenNombre}.`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Prestamo aprobado correctamente",
    });
  } catch (error) {
    console.error("ERROR APROBANDO PRESTAMO:", error);
    return NextResponse.json(
      { error: "Error aprobando prestamo" },
      { status: 500 }
    );
  }
}
