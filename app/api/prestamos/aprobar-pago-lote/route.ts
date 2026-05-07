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

function parsePrestamoIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

function resumenImeis(imeis: string[]) {
  const visibles = imeis.slice(0, 8).join(", ");
  return imeis.length > 8 ? `${visibles} y ${imeis.length - 8} mas` : visibles;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede aprobar pagos de prestamos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const prestamoIds = parsePrestamoIds(body.prestamoIds ?? body.ids);

    if (prestamoIds.length === 0) {
      return NextResponse.json(
        { error: "Debes seleccionar al menos un pago pendiente" },
        { status: 400 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(
      String(user.rolNombre || "").toUpperCase()
    );

    const [sedeBodegaPrincipal, prestamos] = await Promise.all([
      prisma.sede.findFirst({
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
      }),
      prisma.prestamoSede.findMany({
        where: {
          id: {
            in: prestamoIds,
          },
        },
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
      }),
    ]);

    if (prestamos.length !== prestamoIds.length) {
      return NextResponse.json(
        { error: "Uno o mas prestamos seleccionados no existen" },
        { status: 404 }
      );
    }

    const prestamosOrdenados = prestamoIds
      .map((id) => prestamos.find((prestamo) => prestamo.id === id))
      .filter((prestamo): prestamo is NonNullable<typeof prestamo> =>
        Boolean(prestamo)
      );

    const prestamoNoPendiente = prestamosOrdenados.find(
      (prestamo) => prestamo.estado !== "PAGO_PENDIENTE_APROBACION"
    );

    if (prestamoNoPendiente) {
      return NextResponse.json(
        {
          error: `El prestamo #${prestamoNoPendiente.id} no esta pendiente de aprobacion`,
        },
        { status: 400 }
      );
    }

    const prestamosConMontoInvalido = prestamosOrdenados.find((prestamo) => {
      const montoEsperado = Number(prestamo.costo || 0);
      const montoSolicitado = Number(prestamo.montoPago || 0);
      return !montoSolicitado || montoSolicitado <= 0 || montoSolicitado !== montoEsperado;
    });

    if (prestamosConMontoInvalido) {
      return NextResponse.json(
        {
          error: `El prestamo #${prestamosConMontoInvalido.id} no tiene un monto de pago valido`,
        },
        { status: 400 }
      );
    }

    const paresDestino = Array.from(
      new Map(
        prestamosOrdenados.map((prestamo) => [
          `${prestamo.imei}:${prestamo.sedeDestinoId}`,
          { imei: prestamo.imei, sedeId: prestamo.sedeDestinoId },
        ])
      ).values()
    );
    const paresOrigen = Array.from(
      new Map(
        prestamosOrdenados.map((prestamo) => [
          `${prestamo.imei}:${prestamo.sedeOrigenId}`,
          { imei: prestamo.imei, sedeId: prestamo.sedeOrigenId },
        ])
      ).values()
    );

    const [inventarioDestino, inventarioOrigen] = await Promise.all([
      prisma.inventarioSede.findMany({
        where: {
          OR: paresDestino,
        },
        select: {
          id: true,
          imei: true,
          sedeId: true,
          estadoFinanciero: true,
          deboA: true,
          origen: true,
          inventarioPrincipalId: true,
        },
      }),
      prisma.inventarioSede.findMany({
        where: {
          estadoActual: "PRESTAMO",
          OR: paresOrigen,
        },
        select: {
          id: true,
          imei: true,
          sedeId: true,
          estadoFinanciero: true,
          deboA: true,
        },
      }),
    ]);

    const inventarioDestinoMap = new Map(
      inventarioDestino.map((item) => [`${item.imei}:${item.sedeId}`, item])
    );
    const inventarioOrigenMap = new Map(
      inventarioOrigen.map((item) => [`${item.imei}:${item.sedeId}`, item])
    );
    const sedeBodegaId = sedeBodegaPrincipal?.id ?? -1;

    const contextos = prestamosOrdenados.map((prestamo) => {
      const equipoDestino = inventarioDestinoMap.get(
        `${prestamo.imei}:${prestamo.sedeDestinoId}`
      );
      const equipoOrigen = inventarioOrigenMap.get(
        `${prestamo.imei}:${prestamo.sedeOrigenId}`
      );
      const destinoMarcadoComoPrincipal =
        String(equipoDestino?.origen || "").trim().toUpperCase() ===
          "PRINCIPAL" || !!equipoDestino?.inventarioPrincipalId;
      const destinoTieneDeudaProveedor =
        esEstadoDeuda(equipoDestino?.estadoFinanciero) &&
        esDeudaProveedor(equipoDestino?.deboA);
      const prestamoDesdeBodegaPrincipal =
        destinoMarcadoComoPrincipal && destinoTieneDeudaProveedor;
      const sedeAcreedoraId =
        prestamoDesdeBodegaPrincipal && sedeBodegaId > 0
          ? sedeBodegaId
          : prestamo.sedeOrigenId;

      return {
        prestamo,
        equipoDestino,
        equipoOrigen,
        prestamoDesdeBodegaPrincipal,
        sedeAcreedoraId,
      };
    });

    const contextoSinDestino = contextos.find((contexto) => !contexto.equipoDestino);

    if (contextoSinDestino) {
      return NextResponse.json(
        {
          error: `No se encontro el equipo destino del prestamo #${contextoSinDestino.prestamo.id}`,
        },
        { status: 404 }
      );
    }

    const primerContexto = contextos[0];
    const mismaCaja = contextos.every(
      (contexto) =>
        contexto.sedeAcreedoraId === primerContexto.sedeAcreedoraId &&
        contexto.prestamo.sedeDestinoId === primerContexto.prestamo.sedeDestinoId
    );

    if (!mismaCaja) {
      return NextResponse.json(
        {
          error:
            "Solo se pueden aprobar en lote pagos de la misma sede origen y la misma sede destino",
        },
        { status: 400 }
      );
    }

    if (!esAdmin && user.sedeId !== primerContexto.sedeAcreedoraId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const contextoInvalido = contextos.find((contexto) => {
      const equipoDestino = contexto.equipoDestino!;

      if (contexto.prestamoDesdeBodegaPrincipal) {
        return (
          !esEstadoDeuda(equipoDestino.estadoFinanciero) ||
          !esDeudaProveedor(equipoDestino.deboA)
        );
      }

      return !contexto.equipoOrigen || !esDeudaEntreSedes(equipoDestino.deboA);
    });

    if (contextoInvalido) {
      return NextResponse.json(
        {
          error: `El prestamo #${contextoInvalido.prestamo.id} no cumple las reglas para aprobacion de pago`,
        },
        { status: 400 }
      );
    }

    const sedeIds = Array.from(
      new Set([
        primerContexto.sedeAcreedoraId,
        primerContexto.prestamo.sedeDestinoId,
        ...contextos.flatMap((contexto) => [
          contexto.prestamo.sedeOrigenId,
          contexto.prestamo.sedeDestinoId,
        ]),
      ])
    );
    const sedes = await prisma.sede.findMany({
      where: {
        id: {
          in: sedeIds,
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });
    const nombresSede = new Map(sedes.map((sede) => [sede.id, sede.nombre]));
    const sedeDestinoNombre = etiquetaSedeAcreedora(
      primerContexto.prestamo.sedeDestinoId,
      nombresSede.get(primerContexto.prestamo.sedeDestinoId)
    );
    const sedeAcreedoraNombre =
      primerContexto.prestamoDesdeBodegaPrincipal &&
      primerContexto.sedeAcreedoraId === sedeBodegaId
        ? NOMBRE_SEDE_BODEGA
        : etiquetaSedeAcreedora(
            primerContexto.sedeAcreedoraId,
            nombresSede.get(primerContexto.sedeAcreedoraId)
          );
    const total = contextos.reduce(
      (acumulado, contexto) =>
        acumulado + Number(contexto.prestamo.montoPago || 0),
      0
    );
    const imeis = contextos.map((contexto) => contexto.prestamo.imei);
    const detalleImeis = resumenImeis(imeis);
    const aprobacionEn = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.cajaMovimiento.create({
        data: {
          tipo: "INGRESO",
          concepto: "PAGO PRESTAMO ENTRE SEDES",
          valor: total,
          descripcion: `Ingreso por aprobacion de pago en lote desde ${sedeDestinoNombre}. ${contextos.length} equipo(s): ${detalleImeis}`,
          sedeId: primerContexto.sedeAcreedoraId,
        },
      });

      await tx.cajaMovimiento.create({
        data: {
          tipo: "EGRESO",
          concepto: "PAGO PRESTAMO ENTRE SEDES",
          valor: total,
          descripcion: `Egreso por pago aprobado en lote hacia ${sedeAcreedoraNombre}. ${contextos.length} equipo(s): ${detalleImeis}`,
          sedeId: primerContexto.prestamo.sedeDestinoId,
        },
      });

      for (const contexto of contextos) {
        const prestamo = contexto.prestamo;
        const equipoDestino = contexto.equipoDestino!;

        await tx.prestamoSede.update({
          where: { id: prestamo.id },
          data: {
            sedeOrigenId: contexto.sedeAcreedoraId,
            estado: "PAGADO",
            fechaAprobacionPago: aprobacionEn,
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
              valor: Number(prestamo.montoPago || 0),
              sedeId: contexto.sedeAcreedoraId,
            },
          });
        } else {
          await tx.movimientoCajaSede.create({
            data: {
              sedeId: contexto.sedeAcreedoraId,
              tipo: "INGRESO",
              concepto: "PAGO PRESTAMO ENTRE SEDES",
              valor: Number(prestamo.montoPago || 0),
              prestamoId: prestamo.id,
            },
          });
        }

        await tx.movimientoCajaSede.create({
          data: {
            sedeId: prestamo.sedeDestinoId,
            tipo: "EGRESO",
            concepto: "PAGO PRESTAMO ENTRE SEDES",
            valor: Number(prestamo.montoPago || 0),
            prestamoId: prestamo.id,
          },
        });

        await tx.inventarioSede.update({
          where: { id: equipoDestino.id },
          data: {
            estadoFinanciero: "PAGO",
            deboA: null,
            fechaMovimiento: aprobacionEn,
            observacion: contexto.prestamoDesdeBodegaPrincipal
              ? "Pago aprobado a bodega principal en lote"
              : `Pago aprobado a ${sedeAcreedoraNombre} en lote`,
          },
        });

        if (contexto.prestamoDesdeBodegaPrincipal) {
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
        } else if (contexto.equipoOrigen) {
          const origenConDeudaProveedor =
            esEstadoDeuda(contexto.equipoOrigen.estadoFinanciero) &&
            esDeudaProveedor(contexto.equipoOrigen.deboA);

          if (origenConDeudaProveedor) {
            await tx.inventarioSede.update({
              where: { id: contexto.equipoOrigen.id },
              data: {
                fechaMovimiento: aprobacionEn,
                observacion: `Prestamo pagado por ${sedeDestinoNombre}. La deuda con proveedor sigue pendiente.`,
              },
            });
          } else {
            await tx.inventarioSede.delete({
              where: { id: contexto.equipoOrigen.id },
            });
          }
        }

        await tx.movimientoInventario.create({
          data: {
            imei: prestamo.imei,
            tipoMovimiento: "PAGO_PRESTAMO_APROBADO_LOTE",
            referencia: prestamo.referencia,
            color: prestamo.color || null,
            costo: prestamo.costo,
            sedeId: prestamo.sedeDestinoId,
            deboA: null,
            estadoFinanciero: "PAGO",
            origen: contexto.prestamoDesdeBodegaPrincipal
              ? "PAGO_BODEGA_PRINCIPAL"
              : "PRESTAMO_SEDE",
            observacion: `Pago aprobado en lote por ${sedeAcreedoraNombre}. Total lote: ${total}.`,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Pago en lote aprobado correctamente: ${contextos.length} equipo(s).`,
      total,
      cantidad: contextos.length,
    });
  } catch (error) {
    console.error("ERROR APROBAR PAGO LOTE:", error);
    return NextResponse.json(
      { error: "Error interno al aprobar pago en lote" },
      { status: 500 }
    );
  }
}
