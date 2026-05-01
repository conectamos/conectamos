import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  NOMBRE_SEDE_BODEGA,
  etiquetaSedeAcreedora,
  esDeudaProveedor,
  esEstadoDeuda,
} from "@/lib/prestamos";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const id = Number(body.id);

    if (!id) {
      return NextResponse.json(
        { error: "ID de prestamo invalido" },
        { status: 400 }
      );
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
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

    const prestamo = await prisma.prestamoSede.findUnique({
      where: { id },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeOrigenId: true,
        sedeDestinoId: true,
        estado: true,
      },
    });

    if (!prestamo) {
      return NextResponse.json(
        { error: "Prestamo no encontrado" },
        { status: 404 }
      );
    }

    if (!esAdmin && user.sedeId !== prestamo.sedeOrigenId) {
      return NextResponse.json(
        { error: "Solo la sede origen puede aprobar esta devolucion" },
        { status: 403 }
      );
    }

    if (prestamo.estado !== "DEVOLUCION_PENDIENTE") {
      return NextResponse.json(
        {
          error: `No se puede aprobar la devolucion. Estado actual: ${prestamo.estado}`,
        },
        { status: 400 }
      );
    }
    const sedesPrestamo = await prisma.sede.findMany({
      where: {
        id: {
          in: Array.from(
            new Set([
              prestamo.sedeOrigenId,
              prestamo.sedeDestinoId,
              sedeBodegaId > 0 ? sedeBodegaId : prestamo.sedeOrigenId,
            ])
          ),
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });
    const nombresSede = new Map(
      sedesPrestamo.map((sede) => [sede.id, sede.nombre])
    );
    const sedeOrigenNombre = etiquetaSedeAcreedora(
      prestamo.sedeOrigenId,
      nombresSede.get(prestamo.sedeOrigenId)
    );
    const sedeDestinoNombre = etiquetaSedeAcreedora(
      prestamo.sedeDestinoId,
      nombresSede.get(prestamo.sedeDestinoId)
    );

    const equipoDestino = await prisma.inventarioSede.findFirst({
      where: {
        imei: prestamo.imei,
        sedeId: prestamo.sedeDestinoId,
      },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        estadoActual: true,
        estadoFinanciero: true,
        deboA: true,
        origen: true,
        distribuidor: true,
        inventarioPrincipalId: true,
      },
    });

    if (!equipoDestino) {
      return NextResponse.json(
        { error: "El equipo no existe en la sede destino" },
        { status: 404 }
      );
    }

    const prestamoDesdePrincipal =
      prestamo.sedeOrigenId === sedeBodegaId ||
      ((String(equipoDestino.origen || "").trim().toUpperCase() ===
        "PRINCIPAL" ||
        !!equipoDestino.inventarioPrincipalId) &&
        esEstadoDeuda(equipoDestino.estadoFinanciero) &&
        esDeudaProveedor(equipoDestino.deboA));

    if (prestamoDesdePrincipal) {
      return NextResponse.json(
        {
          error:
            "Los equipos enviados desde bodega principal no usan este flujo de devolucion. Deben pagarse desde la sede destino.",
        },
        { status: 400 }
      );
    }

    if (String(equipoDestino.estadoActual || "").toUpperCase() !== "BODEGA") {
      return NextResponse.json(
        {
          error:
            "Solo se puede devolver un prestamo cuando el equipo sigue en BODEGA en la sede destino. Si ya fue vendido, debes gestionar el pago.",
        },
        { status: 400 }
      );
    }

    const retornoDirectoAPrincipal = prestamoDesdePrincipal;

    const equipoOrigen = retornoDirectoAPrincipal
      ? null
      : await prisma.inventarioSede.findFirst({
          where: {
            imei: prestamo.imei,
            sedeId: prestamo.sedeOrigenId,
            estadoActual: "PRESTAMO",
          },
          select: {
            id: true,
            deboA: true,
            estadoFinanciero: true,
            distribuidor: true,
            origen: true,
            inventarioPrincipalId: true,
          },
        });

    if (!retornoDirectoAPrincipal && !equipoOrigen) {
      return NextResponse.json(
        { error: "El equipo en la sede origen no esta en PRESTAMO" },
        { status: 404 }
      );
    }

    const deudaPrincipalSeDevuelveAlOrigen =
      !retornoDirectoAPrincipal &&
      !!equipoOrigen &&
      String(equipoOrigen.origen || "").toUpperCase() === "PRINCIPAL" &&
      esEstadoDeuda(equipoDestino.estadoFinanciero) &&
      esDeudaProveedor(equipoDestino.deboA);
    const prestamoPrincipalActivo = deudaPrincipalSeDevuelveAlOrigen
      ? await prisma.prestamoSede.findFirst({
          where: {
            imei: prestamo.imei,
            sedeDestinoId: prestamo.sedeDestinoId,
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

    await prisma.$transaction(async (tx) => {
      await tx.prestamoSede.update({
        where: { id: prestamo.id },
        data: {
          estado: "DEVUELTO",
        },
      });

      if (retornoDirectoAPrincipal) {
        if (equipoDestino.inventarioPrincipalId) {
          await tx.inventarioPrincipal.update({
            where: { id: equipoDestino.inventarioPrincipalId },
            data: {
              estado: "BODEGA",
              sedeDestinoId: null,
              estadoCobro: null,
              fechaEnvio: null,
              observacion: `Devuelto desde ${sedeDestinoNombre}`,
            },
          });
        } else {
          await tx.inventarioPrincipal.updateMany({
            where: {
              imei: prestamo.imei,
              sedeDestinoId: prestamo.sedeDestinoId,
              estado: "PRESTAMO",
            },
            data: {
              estado: "BODEGA",
              sedeDestinoId: null,
              estadoCobro: null,
              fechaEnvio: null,
              observacion: `Devuelto desde ${sedeDestinoNombre}`,
            },
          });
        }
      } else if (equipoOrigen) {
        await tx.inventarioSede.update({
          where: { id: equipoOrigen.id },
          data: {
            estadoAnterior: "PRESTAMO",
            estadoActual: "BODEGA",
            fechaMovimiento: new Date(),
            observacion: `Equipo devuelto desde ${sedeDestinoNombre}`,
            deboA: deudaPrincipalSeDevuelveAlOrigen
              ? equipoDestino.deboA
              : equipoOrigen.deboA,
            estadoFinanciero: deudaPrincipalSeDevuelveAlOrigen
              ? equipoDestino.estadoFinanciero
              : equipoOrigen.estadoFinanciero || "PAGO",
            distribuidor: equipoOrigen.distribuidor,
          },
        });

        if (deudaPrincipalSeDevuelveAlOrigen) {
          if (equipoOrigen.inventarioPrincipalId) {
            await tx.inventarioPrincipal.update({
              where: { id: equipoOrigen.inventarioPrincipalId },
              data: {
                estado: "PRESTAMO",
                sedeDestinoId: prestamo.sedeOrigenId,
                estadoCobro: "PENDIENTE",
                fechaEnvio: new Date(),
                observacion: `Deuda activa retorna a ${sedeOrigenNombre} despues de devolucion desde ${sedeDestinoNombre}.`,
              },
            });
          } else {
            await tx.inventarioPrincipal.updateMany({
              where: {
                imei: prestamo.imei,
              },
              data: {
                estado: "PRESTAMO",
                sedeDestinoId: prestamo.sedeOrigenId,
                estadoCobro: "PENDIENTE",
                fechaEnvio: new Date(),
                observacion: `Deuda activa retorna a ${sedeOrigenNombre} despues de devolucion desde ${sedeDestinoNombre}.`,
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
                sedeDestinoId: prestamo.sedeOrigenId,
                estado: "APROBADO",
                montoPago: null,
                fechaSolicitudPago: null,
                fechaAprobacionPago: null,
              },
            });
          }
        }
      }

      await tx.inventarioSede.delete({
        where: { id: equipoDestino.id },
      });

      await tx.movimientoInventario.create({
        data: {
          imei: prestamo.imei,
          tipoMovimiento: "PRESTAMO_DEVUELTO_SALIDA",
          referencia: prestamo.referencia,
          color: prestamo.color || null,
          costo: prestamo.costo,
          sedeId: prestamo.sedeDestinoId,
          deboA: equipoDestino.deboA ?? sedeOrigenNombre,
          estadoFinanciero: equipoDestino.estadoFinanciero,
          origen: "PRESTAMO",
          observacion: `Equipo devuelto a ${sedeOrigenNombre}. Prestamo #${prestamo.id}`,
        },
      });

      await tx.movimientoInventario.create({
        data: {
          imei: prestamo.imei,
          tipoMovimiento: "PRESTAMO_DEVUELTO_INGRESO",
          referencia: prestamo.referencia,
          color: prestamo.color || null,
          costo: prestamo.costo,
          sedeId: retornoDirectoAPrincipal
            ? sedeBodegaId > 0
              ? sedeBodegaId
              : prestamo.sedeOrigenId
            : prestamo.sedeOrigenId,
          deboA: retornoDirectoAPrincipal
            ? null
            : deudaPrincipalSeDevuelveAlOrigen
              ? equipoDestino.deboA
              : equipoOrigen?.deboA || null,
          estadoFinanciero: retornoDirectoAPrincipal
            ? "PAGO"
            : deudaPrincipalSeDevuelveAlOrigen
              ? equipoDestino.estadoFinanciero
              : equipoOrigen?.estadoFinanciero || "PAGO",
          origen: retornoDirectoAPrincipal
            ? "DEVOLUCION_PRINCIPAL"
            : "DEVOLUCION_PRESTAMO",
          observacion: retornoDirectoAPrincipal
            ? `Equipo retornado a bodega principal desde ${sedeDestinoNombre}. Prestamo #${prestamo.id}`
            : `Equipo retornado desde ${sedeDestinoNombre}. Prestamo #${prestamo.id}`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Prestamo devuelto correctamente",
    });
  } catch (error) {
    console.error("ERROR DEVOLVER PRESTAMO:", error);
    return NextResponse.json(
      { error: "Error interno al devolver prestamo" },
      { status: 500 }
    );
  }
}
