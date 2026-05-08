import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import {
  etiquetaSedeAcreedora,
  esDeudaEntreSedes,
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

function resumirImeis(imeis: string[]) {
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
        { error: "Este perfil no puede solicitar pagos de prestamos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const prestamoIds = parsePrestamoIds(body.prestamoIds ?? body.ids);

    if (prestamoIds.length === 0) {
      return NextResponse.json(
        { error: "Debes seleccionar al menos un prestamo para enviar a pagar" },
        { status: 400 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(
      String(user.rolNombre || "").toUpperCase()
    );

    const prestamos = await prisma.prestamoSede.findMany({
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
      },
    });

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

    const noAutorizado = prestamosOrdenados.find(
      (prestamo) => !esAdmin && user.sedeId !== prestamo.sedeDestinoId
    );

    if (noAutorizado) {
      return NextResponse.json(
        {
          error: `Solo la sede destino puede solicitar el pago del prestamo #${noAutorizado.id}`,
        },
        { status: 403 }
      );
    }

    const noAprobado = prestamosOrdenados.find(
      (prestamo) => prestamo.estado !== "APROBADO"
    );

    if (noAprobado) {
      return NextResponse.json(
        {
          error: `El prestamo #${noAprobado.id} no esta aprobado. Estado actual: ${noAprobado.estado}`,
        },
        { status: 400 }
      );
    }

    const paresDestino = prestamosOrdenados.map((prestamo) => ({
      imei: prestamo.imei,
      sedeId: prestamo.sedeDestinoId,
    }));

    const inventarioDestino = await prisma.inventarioSede.findMany({
      where: {
        OR: paresDestino,
      },
      select: {
        id: true,
        imei: true,
        sedeId: true,
        estadoFinanciero: true,
        deboA: true,
      },
    });
    const inventarioDestinoMap = new Map(
      inventarioDestino.map((item) => [`${item.imei}:${item.sedeId}`, item])
    );

    for (const prestamo of prestamosOrdenados) {
      const equipoDestino = inventarioDestinoMap.get(
        `${prestamo.imei}:${prestamo.sedeDestinoId}`
      );

      if (!equipoDestino) {
        return NextResponse.json(
          {
            error: `No se encontro el equipo destino del prestamo #${prestamo.id}`,
          },
          { status: 404 }
        );
      }

      if (!esEstadoDeuda(equipoDestino.estadoFinanciero)) {
        return NextResponse.json(
          {
            error: `El equipo del prestamo #${prestamo.id} no esta en DEUDA`,
          },
          { status: 400 }
        );
      }

      if (!esDeudaEntreSedes(equipoDestino.deboA)) {
        return NextResponse.json(
          {
            error: `El prestamo #${prestamo.id} no debe pagarse entre sedes. El pago al proveedor se hace desde inventario.`,
          },
          { status: 400 }
        );
      }
    }

    const sedeIds = Array.from(
      new Set(
        prestamosOrdenados.flatMap((prestamo) => [
          prestamo.sedeOrigenId,
          prestamo.sedeDestinoId,
        ])
      )
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
    const solicitudEn = new Date();
    const total = prestamosOrdenados.reduce(
      (acumulado, prestamo) => acumulado + Number(prestamo.costo || 0),
      0
    );
    const imeis = prestamosOrdenados.map((prestamo) => prestamo.imei);

    await prisma.$transaction(async (tx) => {
      for (const prestamo of prestamosOrdenados) {
        const sedeOrigenNombre = etiquetaSedeAcreedora(
          prestamo.sedeOrigenId,
          nombresSede.get(prestamo.sedeOrigenId)
        );
        const sedeDestinoNombre = etiquetaSedeAcreedora(
          prestamo.sedeDestinoId,
          nombresSede.get(prestamo.sedeDestinoId)
        );
        const equipoDestino = inventarioDestinoMap.get(
          `${prestamo.imei}:${prestamo.sedeDestinoId}`
        )!;

        await tx.prestamoSede.update({
          where: { id: prestamo.id },
          data: {
            estado: "PAGO_PENDIENTE_APROBACION",
            montoPago: prestamo.costo,
            fechaSolicitudPago: solicitudEn,
            fechaAprobacionPago: null,
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
              sedeId: prestamo.sedeOrigenId,
              tipo: "PENDIENTE_APROBACION",
              concepto: "PAGO PRESTAMO ENTRE SEDES",
              valor: prestamo.costo,
            },
          });
        } else {
          await tx.movimientoCajaSede.create({
            data: {
              sedeId: prestamo.sedeOrigenId,
              tipo: "PENDIENTE_APROBACION",
              concepto: "PAGO PRESTAMO ENTRE SEDES",
              valor: prestamo.costo,
              prestamoId: prestamo.id,
            },
          });
        }

        await tx.movimientoInventario.create({
          data: {
            imei: prestamo.imei,
            tipoMovimiento: "PRESTAMO_SOLICITA_PAGO_LOTE",
            referencia: prestamo.referencia,
            color: prestamo.color || null,
            costo: prestamo.costo,
            sedeId: prestamo.sedeDestinoId,
            deboA: equipoDestino.deboA,
            estadoFinanciero: "DEUDA",
            origen: "PRESTAMO",
            observacion: `${sedeDestinoNombre} solicita pago por lote a ${sedeOrigenNombre}. Prestamo #${prestamo.id}.`,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Solicitud de pago enviada por lote: ${prestamosOrdenados.length} equipo(s).`,
      cantidad: prestamosOrdenados.length,
      total,
      imeis: resumirImeis(imeis),
    });
  } catch (error) {
    console.error("ERROR SOLICITAR PAGO LOTE:", error);
    return NextResponse.json(
      { error: "Error interno al solicitar pago por lote" },
      { status: 500 }
    );
  }
}
