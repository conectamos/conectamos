import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import { esSedeVentas } from "@/lib/sedes";

function parseSedeId(value: string | null) {
  const sedeId = Number(value);
  return Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no tiene acceso a inventario" },
        { status: 403 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    const requestUrl = new URL(req.url);
    const sedeIdFiltro = parseSedeId(requestUrl.searchParams.get("sedeId"));

    const inventario = await prisma.inventarioSede.findMany({
      where: esAdmin
        ? sedeIdFiltro
          ? { sedeId: sedeIdFiltro }
          : {}
        : { sedeId: user.sedeId },
      orderBy: { id: "desc" },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        distribuidor: true,
        deboA: true,
        estadoActual: true,
        estadoFinanciero: true,
        origen: true,
        sedeId: true,
        sede: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    const imeis = [...new Set(inventario.map((item) => item.imei))];
    const sedesOrigenIds = [...new Set(inventario.map((item) => item.sedeId))];

    const prestamosRelacionados =
      imeis.length > 0 && sedesOrigenIds.length > 0
        ? await prisma.prestamoSede.findMany({
            where: {
              imei: {
                in: imeis,
              },
              sedeOrigenId: {
                in: sedesOrigenIds,
              },
              estado: {
                in: [
                  "PENDIENTE",
                  "APROBADO",
                  "PAGO_PENDIENTE_APROBACION",
                  "DEVOLUCION_PENDIENTE",
                  "PAGADO",
                  "FINALIZADO",
                ],
              },
            },
            orderBy: {
              id: "desc",
            },
            select: {
              id: true,
              imei: true,
              estado: true,
              sedeOrigenId: true,
              sedeDestinoId: true,
            },
          })
        : [];

    const sedesDestinoIds = [
      ...new Set(prestamosRelacionados.map((prestamo) => prestamo.sedeDestinoId)),
    ];
    const sedesDestino =
      sedesDestinoIds.length > 0
        ? await prisma.sede.findMany({
            where: {
              id: {
                in: sedesDestinoIds,
              },
            },
            select: {
              id: true,
              nombre: true,
            },
          })
        : [];
    const sedesDestinoPorId = new Map(
      sedesDestino.map((sede) => [sede.id, sede])
    );
    const prestamosPorOrigen = new Map<
      string,
      (typeof prestamosRelacionados)[number]
    >();

    for (const prestamo of prestamosRelacionados) {
      const key = `${prestamo.imei}|${prestamo.sedeOrigenId}`;

      if (!prestamosPorOrigen.has(key)) {
        prestamosPorOrigen.set(key, prestamo);
      }
    }

    const inventarioConPrestamo = inventario.map((item) => {
      const estadoInventario = String(item.estadoActual || "")
        .trim()
        .toUpperCase();
      const debeMostrarDestinoPrestamo = [
        "PRESTAMO",
        "PRESTAMO_POR_ACEPTAR",
        "TRASLADO",
      ].includes(estadoInventario);
      const prestamo = debeMostrarDestinoPrestamo
        ? prestamosPorOrigen.get(`${item.imei}|${item.sedeId}`)
        : null;
      const sedeDestino = prestamo
        ? sedesDestinoPorId.get(prestamo.sedeDestinoId)
        : null;
      const destinoEsLaMismaSede =
        prestamo && prestamo.sedeDestinoId === item.sedeId;

      return {
        ...item,
        prestamoDestino:
          prestamo && sedeDestino && !destinoEsLaMismaSede
            ? {
                id: sedeDestino.id,
                nombre: sedeDestino.nombre,
                prestamoId: prestamo.id,
                estado: prestamo.estado,
              }
            : null,
      };
    });

    return NextResponse.json(inventarioConPrestamo);
  } catch (error) {
    console.error("ERROR GET INVENTARIO:", error);

    return NextResponse.json(
      { error: "Error cargando inventario" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede ingresar inventario" },
        { status: 403 }
      );
    }

    const data = await req.json();

    const imeisRaw = Array.isArray(data.imeis)
      ? data.imeis
      : data.imei
      ? [data.imei]
      : [];

    const imeis = (imeisRaw as unknown[])
      .map((item) => String(item ?? "").replace(/\D/g, "").trim())
      .filter((item) => item.length > 0);

    const referencia = String(data.referencia ?? "").trim();
    const color = String(data.color ?? "").trim();
    const costo = Number(data.costo ?? 0);
    const distribuidor = String(data.distribuidor ?? "").trim();
    const estadoFinanciero = String(data.estadoFinanciero ?? "").trim().toUpperCase();
    const deboA = data.deboA ? String(data.deboA).trim() : null;

    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    const sedeId = esAdmin ? Number(data.sedeId ?? user.sedeId) : user.sedeId;

    if (imeis.length === 0) {
      return NextResponse.json(
        { error: "Debes ingresar al menos un IMEI" },
        { status: 400 }
      );
    }

    const imeiInvalido = imeis.find((item) => !/^\d{15}$/.test(item));
    if (imeiInvalido) {
      return NextResponse.json(
        { error: "Todos los IMEIs deben tener exactamente 15 digitos" },
        { status: 400 }
      );
    }

    if (!referencia) {
      return NextResponse.json(
        { error: "La referencia es obligatoria" },
        { status: 400 }
      );
    }

    if (!costo || costo <= 0) {
      return NextResponse.json(
        { error: "El costo debe ser mayor a 0" },
        { status: 400 }
      );
    }

    if (!distribuidor) {
      return NextResponse.json(
        { error: "Debes seleccionar un distribuidor" },
        { status: 400 }
      );
    }

    if (!estadoFinanciero) {
      return NextResponse.json(
        { error: "Debes seleccionar el estado financiero" },
        { status: 400 }
      );
    }

    if (estadoFinanciero === "DEUDA" && !deboA) {
      return NextResponse.json(
        { error: "Debes seleccionar 'Debe a'" },
        { status: 400 }
      );
    }

    if (!sedeId || sedeId <= 0) {
      return NextResponse.json(
        { error: "Sede invalida" },
        { status: 400 }
      );
    }

    const sede = await prisma.sede.findUnique({
      where: { id: sedeId },
      select: { nombre: true },
    });

    if (!sede) {
      return NextResponse.json(
        { error: "Sede invalida" },
        { status: 400 }
      );
    }

    if (esSedeVentas(sede.nombre)) {
      return NextResponse.json(
        {
          error:
            "La sede VENTAS es informativa y no puede recibir equipos de inventario",
        },
        { status: 400 }
      );
    }

    const imeisUnicos = [...new Set(imeis)];

    const existentesEnSedes = await prisma.inventarioSede.findMany({
      where: {
        imei: { in: imeisUnicos },
      },
      select: {
        imei: true,
        sedeId: true,
        sede: {
          select: {
            nombre: true,
          },
        },
      },
    });

    const existentesOtraSede = existentesEnSedes.filter(
      (item) => item.sedeId !== sedeId
    );

    if (existentesOtraSede.length > 0) {
      const detalle = existentesOtraSede
        .slice(0, 5)
        .map((item) => `${item.imei} (${item.sede?.nombre || "otra sede"})`)
        .join(", ");

      return NextResponse.json(
        {
          error: `Estos IMEI ya existen en otra sede y deben moverse por el flujo de prestamos: ${detalle}`,
        },
        { status: 400 }
      );
    }

    const imeisExistentes = new Set(
      existentesEnSedes
        .filter((item) => item.sedeId === sedeId)
        .map((item) => item.imei)
    );
    const imeisParaInsertar = imeisUnicos.filter(
      (item) => !imeisExistentes.has(item)
    );

    if (imeisParaInsertar.length === 0) {
      return NextResponse.json(
        { error: "Todos los IMEIs ya existen en esta sede" },
        { status: 400 }
      );
    }

    const existentesEnPrincipal = await prisma.inventarioPrincipal.findMany({
      where: {
        imei: { in: imeisParaInsertar },
      },
      select: { imei: true },
    });

    if (existentesEnPrincipal.length > 0) {
      const imeisPrincipal = existentesEnPrincipal
        .map((item) => item.imei)
        .slice(0, 5)
        .join(", ");

      return NextResponse.json(
        {
          error: `Estos IMEI ya existen en Bodega Principal y deben enviarse desde ese modulo: ${imeisPrincipal}`,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventarioSede.createMany({
        data: imeisParaInsertar.map((item) => ({
          imei: item,
          referencia,
          color: color || null,
          costo,
          distribuidor,
          sedeId,
          estadoFinanciero,
          deboA,
          estadoActual: "BODEGA",
          origen: "MANUAL",
          inventarioPrincipalId: null,
        })),
      });

      await tx.movimientoInventario.createMany({
        data: imeisParaInsertar.map((item) => ({
          imei: item,
          tipoMovimiento: "INGRESO_SEDE",
          referencia,
          color: color || null,
          costo,
          sedeId,
          deboA,
          estadoFinanciero,
          origen: "MANUAL",
          observacion: `Ingreso manual desde ${distribuidor}`,
        })),
      });
    });

    const item =
      imeisParaInsertar.length === 1
        ? await prisma.inventarioSede.findFirst({
            where: {
              sedeId,
              imei: imeisParaInsertar[0],
            },
            select: {
              id: true,
              imei: true,
              referencia: true,
              sedeId: true,
              estadoActual: true,
              estadoFinanciero: true,
            },
          })
        : null;

    return NextResponse.json({
      ok: true,
      mensaje: "Guardado correctamente",
      item,
      insertados: imeisParaInsertar.length,
      omitidos: imeisUnicos.length - imeisParaInsertar.length,
      imeisOmitidos: imeisUnicos.filter((itemImei) =>
        imeisExistentes.has(itemImei)
      ),
    });
  } catch (error) {
    console.error("ERROR API INVENTARIO:", error);

    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
