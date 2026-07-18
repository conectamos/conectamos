import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { etiquetaSedeAcreedora } from "@/lib/prestamos";

export async function GET() {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(session.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede recibir alertas de prestamos" },
        { status: 403 }
      );
    }

    const sedeDestinoId = Number(session.sedeId || 0);

    if (!Number.isInteger(sedeDestinoId) || sedeDestinoId <= 0) {
      return NextResponse.json({ total: 0, items: [] });
    }

    const [total, prestamos] = await Promise.all([
      prisma.prestamoSede.count({
        where: {
          sedeDestinoId,
          estado: "PENDIENTE",
        },
      }),
      prisma.prestamoSede.findMany({
        where: {
          sedeDestinoId,
          estado: "PENDIENTE",
        },
        select: {
          id: true,
          imei: true,
          referencia: true,
          costo: true,
          sedeOrigenId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
      }),
    ]);

    const sedeOrigenIds = Array.from(
      new Set(prestamos.map((prestamo) => prestamo.sedeOrigenId))
    );
    const sedesOrigen =
      sedeOrigenIds.length > 0
        ? await prisma.sede.findMany({
            where: {
              id: { in: sedeOrigenIds },
            },
            select: {
              id: true,
              nombre: true,
            },
          })
        : [];
    const nombresSede = new Map(
      sedesOrigen.map((sede) => [sede.id, sede.nombre])
    );

    return NextResponse.json(
      {
        total,
        items: prestamos.map((prestamo) => ({
          id: prestamo.id,
          imei: prestamo.imei,
          referencia: prestamo.referencia,
          costo: Number(prestamo.costo || 0),
          sedeOrigenNombre: etiquetaSedeAcreedora(
            prestamo.sedeOrigenId,
            nombresSede.get(prestamo.sedeOrigenId)
          ),
          creadoEn: prestamo.createdAt.toISOString(),
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("ERROR ALERTA PRESTAMOS DESTINO:", error);
    return NextResponse.json(
      { error: "Error cargando prestamos pendientes" },
      { status: 500 }
    );
  }
}
