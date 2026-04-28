import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  esPerfilFacturador,
  esPerfilVendedor,
  esRolAdmin,
} from "@/lib/access-control";
import { getMonthlyAnalyticSummary } from "@/lib/dashboard-analytics";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    if (esPerfilVendedor(user.perfilTipo) || esPerfilFacturador(user.perfilTipo)) {
      return NextResponse.json(
        { error: "No tienes acceso al panel analitico" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const period = url.searchParams.get("period");
    const requestedSedeId = Number(url.searchParams.get("sedeId") || 0);
    const esAdmin = esRolAdmin(user.rolNombre);
    const sedeId = esAdmin
      ? requestedSedeId > 0
        ? requestedSedeId
        : null
      : user.sedeId;

    const resumen = await getMonthlyAnalyticSummary({
      period,
      sedeId,
    });
    const sedeFiltrada =
      esAdmin && sedeId
        ? await prisma.sede.findUnique({
            where: { id: sedeId },
            select: { nombre: true },
          })
        : null;

    return NextResponse.json({
      ok: true,
      resumen: {
        periodoActual: {
          key: resumen.periodoActual.key,
          label: resumen.periodoActual.label,
        },
        periodoAnterior: {
          key: resumen.periodoAnterior.key,
          label: resumen.periodoAnterior.label,
        },
        cobertura:
          esAdmin && !sedeId
            ? "Todas las sedes"
            : sedeFiltrada?.nombre ?? user.sedeNombre,
        ventas: resumen.ventas,
        utilidad: resumen.utilidad,
      },
    });
  } catch (error) {
    console.error("ERROR PANEL ANALITICO:", error);
    return NextResponse.json(
      { error: "Error cargando panel analitico" },
      { status: 500 }
    );
  }
}
