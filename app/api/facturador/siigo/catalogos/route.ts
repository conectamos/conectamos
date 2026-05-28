import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederPanelFacturador } from "@/lib/access-control";
import {
  getSiigoErrorMessage,
  getSiigoErrorStatus,
  getSiigoSetupCatalogs,
} from "@/lib/siigo";

async function requireFacturador() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!puedeAccederPanelFacturador(session.perfilTipo, session.rolNombre)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el perfil facturador o administrador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const };
}

export async function GET() {
  try {
    const access = await requireFacturador();

    if (!access.ok) {
      return access.response;
    }

    const catalogos = await getSiigoSetupCatalogs();

    return NextResponse.json({
      ok: true,
      catalogos,
    });
  } catch (error) {
    console.error("ERROR GET CATALOGOS SIIGO:", error);

    return NextResponse.json(
      { error: getSiigoErrorMessage(error) },
      { status: getSiigoErrorStatus(error) }
    );
  }
}
