import { NextRequest, NextResponse } from "next/server";
import {
  esRolAdministrativo,
  puedeAccederPanelVendedor,
} from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import {
  guardarDocumentoListaNegra,
  listarDocumentosListaNegra,
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

  return { ok: true as const, session };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 80);
    const registros = await listarDocumentosListaNegra(limit);

    return NextResponse.json({
      ok: true,
      registros,
    });
  } catch (error) {
    console.error("ERROR LISTA NEGRA:", error);
    return NextResponse.json(
      { error: "Error cargando lista negra" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const resultado = await guardarDocumentoListaNegra({
      documento: body.documentoNumero,
      motivo: body.motivo,
      reportadoPorNombre:
        access.session.perfilNombre ??
        access.session.nombre ??
        access.session.usuario ??
        "Usuario",
      reportadoPorPerfilId: access.session.perfilId ?? null,
      sedeId: access.session.sedeId ?? null,
      sedeNombre: access.session.sedeNombre ?? null,
    });

    if ("error" in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Cedula agregada a lista negra",
      registro: resultado.data,
    });
  } catch (error) {
    console.error("ERROR GUARDANDO LISTA NEGRA:", error);
    return NextResponse.json(
      { error: "Error guardando en lista negra" },
      { status: 500 }
    );
  }
}
