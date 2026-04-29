import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { verifyFinancialPasswordForSede } from "@/lib/financial-access";
import { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const clave = String(body.clave ?? "").trim();
    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";

    if (!esAdmin && !clave) {
      return NextResponse.json(
        { error: "Debes ingresar la clave de utilidad" },
        { status: 400 }
      );
    }

    if (!esAdmin) {
      const resultado = await verifyFinancialPasswordForSede(user.sedeId, clave);

      if (!resultado) {
        return NextResponse.json(
          { error: "La sede no existe" },
          { status: 404 }
        );
      }

      if (!resultado.claveAsignada) {
        return NextResponse.json(
          {
            error:
              "El administrador debe asignar la clave financiera de esta sede",
          },
          { status: 403 }
        );
      }

      if (!resultado.isValid) {
        return NextResponse.json(
          { error: "Clave incorrecta" },
          { status: 401 }
        );
      }
    }

    const resumenMensual = await getMonthlyCommercialSummary({
      sedeId: esAdmin ? null : user.sedeId,
    });

    return NextResponse.json({
      ok: true,
      resumen: {
        periodo: resumenMensual.periodo.label,
        cobertura: esAdmin ? "Todas las sedes" : user.sedeNombre,
        utilidad: resumenMensual.utilidad,
        caja: resumenMensual.caja,
        ingresos: resumenMensual.ingresos,
        ventas: resumenMensual.ventas,
        topJaladores: resumenMensual.topJaladores,
        topCerradores: resumenMensual.topCerradores,
        topFinancieras: resumenMensual.topFinancieras,
      },
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO UTILIDAD DASHBOARD:", error);
    return NextResponse.json(
      { error: "Error cargando utilidad del mes" },
      { status: 500 }
    );
  }
}
