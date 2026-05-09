import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  esPerfilSupervisor,
  puedeAccederModulosOperativos,
} from "@/lib/access-control";
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

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no tiene acceso a inventario" },
        { status: 403 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    const esSupervisor =
      esPerfilSupervisor(user.perfilTipo) ||
      String(user.rolNombre || "").trim().toUpperCase() === "SUPERVISOR";

    const inventario = await prisma.inventarioSede.findMany({
      where: esAdmin ? {} : { sedeId: user.sedeId },
     select: {
  id: true,
  imei: true,
  referencia: true,
  color: true,
  costo: true,
  sedeId: true,
  distribuidor: true,
  deboA: true,
  estadoFinanciero: true,
  estadoActual: true,
  origen: true,
  sede: {
    select: {
      nombre: true,
    },
  },
},
      orderBy: {
        id: "desc",
      },
    });

    return NextResponse.json(
      esSupervisor
        ? inventario.filter(
            (item) => !esSedeRetiradaParaSupervisor(item.sede?.nombre)
          )
        : inventario
    );
  } catch (error) {
    console.error("ERROR LISTADO INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error cargando inventario" },
      { status: 500 }
    );
  }
}
