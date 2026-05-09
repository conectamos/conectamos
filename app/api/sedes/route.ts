import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { esPerfilSupervisor } from "@/lib/access-control";
import { esSedeRetiradaParaSupervisor } from "@/lib/sedes";

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const sedes = await prisma.sede.findMany({
      select: {
        id: true,
        nombre: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    const esSupervisor =
      esPerfilSupervisor(user.perfilTipo) ||
      String(user.rolNombre || "").trim().toUpperCase() === "SUPERVISOR";

    return NextResponse.json(
      esSupervisor
        ? sedes.filter((sede) => !esSedeRetiradaParaSupervisor(sede.nombre))
        : sedes
    );
  } catch (error) {
    console.error("ERROR LISTANDO SEDES:", error);
    return NextResponse.json(
      { error: "Error cargando sedes" },
      { status: 500 }
    );
  }
}
