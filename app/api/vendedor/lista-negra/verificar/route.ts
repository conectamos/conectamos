import { NextRequest, NextResponse } from "next/server";
import {
  esRolAdministrativo,
  puedeAccederPanelVendedor,
} from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import {
  buscarDocumentoListaNegra,
  normalizarDocumentoListaNegra,
} from "@/lib/vendor-blacklist";

async function requireVendor() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (
    !puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre) ||
    (!session.perfilId && !esRolAdministrativo(session.rolNombre))
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo un perfil vendedor o administrador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const url = new URL(req.url);
    const documento = normalizarDocumentoListaNegra(
      url.searchParams.get("documento")
    );

    if (!documento) {
      return NextResponse.json({
        ok: true,
        reportado: false,
        registro: null,
      });
    }

    const registro = await buscarDocumentoListaNegra(documento);

    return NextResponse.json({
      alerta: registro ? "CEDULA REPORTADA POR FRAUDE" : null,
      ok: true,
      registro,
      reportado: Boolean(registro),
    });
  } catch (error) {
    console.error("ERROR VERIFICANDO LISTA NEGRA:", error);
    return NextResponse.json(
      { error: "Error verificando lista negra" },
      { status: 500 }
    );
  }
}
