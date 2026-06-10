import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { esRolAdministrativo, puedeAccederModulosOperativos } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import { etiquetaSedeAcreedora } from "@/lib/prestamos";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede rechazar devoluciones" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = Number(body.id);

    if (!id) {
      return NextResponse.json(
        { error: "ID de prestamo invalido" },
        { status: 400 }
      );
    }

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

    const esAdmin = esRolAdministrativo(user.rolNombre);

    if (!esAdmin && user.sedeId !== prestamo.sedeOrigenId) {
      return NextResponse.json(
        { error: "Solo la sede origen puede rechazar esta devolucion" },
        { status: 403 }
      );
    }

    if (prestamo.estado !== "DEVOLUCION_PENDIENTE") {
      return NextResponse.json(
        {
          error: `No se puede rechazar la devolucion. Estado actual: ${prestamo.estado}`,
        },
        { status: 400 }
      );
    }

    const [equipoDestino, sedesPrestamo] = await Promise.all([
      prisma.inventarioSede.findFirst({
        where: {
          imei: prestamo.imei,
          sedeId: prestamo.sedeDestinoId,
        },
        select: {
          id: true,
          estadoActual: true,
          estadoFinanciero: true,
          deboA: true,
          origen: true,
        },
      }),
      prisma.sede.findMany({
        where: {
          id: {
            in: [prestamo.sedeOrigenId, prestamo.sedeDestinoId],
          },
        },
        select: {
          id: true,
          nombre: true,
        },
      }),
    ]);

    if (!equipoDestino) {
      return NextResponse.json(
        { error: "El equipo no existe en la sede destino" },
        { status: 404 }
      );
    }

    const nombresSede = new Map(sedesPrestamo.map((sede) => [sede.id, sede.nombre]));
    const sedeOrigenNombre = etiquetaSedeAcreedora(
      prestamo.sedeOrigenId,
      nombresSede.get(prestamo.sedeOrigenId)
    );
    const sedeDestinoNombre = etiquetaSedeAcreedora(
      prestamo.sedeDestinoId,
      nombresSede.get(prestamo.sedeDestinoId)
    );
    const estadoDestino = String(equipoDestino.estadoActual || "").toUpperCase();
    const equipoYaVendido = estadoDestino === "VENDIDO";

    await prisma.$transaction(async (tx) => {
      await tx.prestamoSede.update({
        where: { id: prestamo.id },
        data: {
          estado: "APROBADO",
        },
      });

      if (estadoDestino === "DEVOLUCION_PENDIENTE") {
        await tx.inventarioSede.update({
          where: { id: equipoDestino.id },
          data: {
            estadoAnterior: "DEVOLUCION_PENDIENTE",
            estadoActual: "BODEGA",
            fechaMovimiento: new Date(),
            observacion: `Devolucion rechazada por ${sedeOrigenNombre}. El prestamo sigue activo.`,
          },
        });
      }

      await tx.movimientoInventario.create({
        data: {
          imei: prestamo.imei,
          tipoMovimiento: "PRESTAMO_DEVOLUCION_RECHAZADA",
          referencia: prestamo.referencia,
          color: prestamo.color || null,
          costo: prestamo.costo,
          sedeId: prestamo.sedeDestinoId,
          deboA: equipoDestino.deboA ?? sedeOrigenNombre,
          estadoFinanciero: equipoDestino.estadoFinanciero,
          origen: equipoDestino.origen || "PRESTAMO",
          observacion: equipoYaVendido
            ? `Devolucion rechazada porque el equipo ya fue vendido en ${sedeDestinoNombre}. Prestamo #${prestamo.id} vuelve a cobro.`
            : `Devolucion rechazada por ${sedeOrigenNombre}. Prestamo #${prestamo.id} sigue activo.`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: equipoYaVendido
        ? "Devolucion rechazada. El equipo ya fue vendido y el prestamo vuelve a cobro."
        : "Devolucion rechazada. El equipo queda disponible en la sede destino.",
    });
  } catch (error) {
    console.error("ERROR RECHAZAR DEVOLUCION PRESTAMO:", error);
    return NextResponse.json(
      { error: "Error interno al rechazar devolucion" },
      { status: 500 }
    );
  }
}
