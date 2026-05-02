import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede consultar IMEI para prestamos" },
        { status: 403 }
      );
    }

    const { imei, sedeOrigenId } = await req.json();

    if (!imei) {
      return NextResponse.json({ error: "IMEI requerido" }, { status: 400 });
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const sedeId = esAdmin ? Number(sedeOrigenId || 0) : user.sedeId;

    if (!sedeId || sedeId <= 0) {
      return NextResponse.json(
        { error: "Debes seleccionar la sede origen" },
        { status: 400 }
      );
    }

    const item = await prisma.inventarioSede.findFirst({
      where: {
        imei: String(imei).trim(),
        sedeId,
      },
      select: {
        referencia: true,
        color: true,
        costo: true,
        estadoActual: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "No se encontro el IMEI en la sede origen seleccionada" },
        { status: 404 }
      );
    }

    if (String(item.estadoActual || "").toUpperCase() !== "BODEGA") {
      return NextResponse.json(
        {
          error: `Solo se pueden prestar equipos en BODEGA. Estado actual: ${item.estadoActual}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(item);
  } catch {
    return NextResponse.json(
      { error: "Error consultando IMEI" },
      { status: 500 }
    );
  }
}
