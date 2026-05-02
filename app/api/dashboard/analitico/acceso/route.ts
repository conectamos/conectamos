import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import {
  createFinancialAccessToken,
  FINANCIAL_ACCESS_COOKIE_NAME,
  getFinancialAccessCookieOptions,
  verifyFinancialPasswordForSede,
} from "@/lib/financial-access";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no tiene acceso al panel analitico" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const clave = String(body.clave ?? "").trim();

    if (!clave) {
      return NextResponse.json(
        { error: "Debes ingresar la clave de la sede" },
        { status: 400 }
      );
    }

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
            "El administrador debe asignar la clave de esta sede para habilitar el panel analitico",
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

    const response = NextResponse.json({
      ok: true,
      mensaje: "Acceso autorizado",
    });

    response.cookies.set(
      FINANCIAL_ACCESS_COOKIE_NAME,
      createFinancialAccessToken(
        user.id,
        user.sedeId,
        resultado.sede.updatedAt.toISOString()
      ),
      getFinancialAccessCookieOptions()
    );

    return response;
  } catch (error) {
    console.error("ERROR VALIDANDO CLAVE PANEL ANALITICO:", error);
    return NextResponse.json(
      { error: "Error validando clave del panel analitico" },
      { status: 500 }
    );
  }
}
