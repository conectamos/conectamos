import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import {
  NOMBRE_SEDE_BODEGA,
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
        { error: "Este perfil no puede solicitar devoluciones" },
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
      },
    });
    const sedeBodegaId = sedeBodegaPrincipal?.id ?? -1;

    const prestamo = await prisma.prestamoSede.findUnique({
      where: { id },
      select: {
        id: true,
        imei: true,
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

    if (!esAdmin && user.sedeId !== prestamo.sedeDestinoId) {
      return NextResponse.json(
        { error: "Solo la sede destino puede solicitar la devolucion" },
        { status: 403 }
      );
    }

    if (prestamo.estado !== "APROBADO") {
      return NextResponse.json(
        {
          error: `Solo se puede solicitar devolucion desde un prestamo APROBADO. Estado actual: ${prestamo.estado}`,
        },
        { status: 400 }
      );
    }

    const equipoDestino = await prisma.inventarioSede.findFirst({
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
            "Los equipos enviados desde bodega principal no pueden devolverse desde la sede destino. Deben pagarse.",
        },
        { status: 400 }
      );
    }

    if (String(equipoDestino.estadoActual || "").toUpperCase() !== "BODEGA") {
      return NextResponse.json(
        {
          error:
            "Solo se puede solicitar devolucion cuando el equipo sigue en BODEGA en la sede destino.",
        },
        { status: 400 }
      );
    }

    await prisma.prestamoSede.update({
      where: { id: prestamo.id },
      data: {
        estado: "DEVOLUCION_PENDIENTE",
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje:
        "Solicitud de devolucion enviada correctamente. La sede origen debe aprobarla o rechazarla.",
    });
  } catch (error) {
    console.error("ERROR SOLICITAR DEVOLUCION PRESTAMO:", error);
    return NextResponse.json(
      { error: "Error interno al solicitar devolucion" },
      { status: 500 }
    );
  }
}
