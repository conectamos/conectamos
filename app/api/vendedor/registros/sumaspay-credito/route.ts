import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederPanelVendedor } from "@/lib/access-control";
import {
  obtenerCreditoSumasPayPorCedula,
  SumasConsultaConfigError,
  SumasConsultaLookupError,
} from "@/lib/sumasconsulta";

async function requireVendor() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre)) {
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

function normalizarDocumento(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

export async function GET(req: Request) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const requestUrl = new URL(req.url);
    const documento = normalizarDocumento(requestUrl.searchParams.get("documento"));

    if (documento.length < 5) {
      return NextResponse.json(
        { error: "La cedula debe tener entre 5 y 15 digitos" },
        { status: 400 }
      );
    }

    const credito = await obtenerCreditoSumasPayPorCedula(documento);

    if (!credito) {
      return NextResponse.json(
        { error: "No se encontro un credito SUMASPAY creado con CONECTAMOS" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      credito,
    });
  } catch (error) {
    if (error instanceof SumasConsultaConfigError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      );
    }

    if (error instanceof SumasConsultaLookupError) {
      return NextResponse.json(
        { error: error.message },
        { status: 502 }
      );
    }

    console.error("ERROR CONSULTANDO CREDITO SUMASPAY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando el credito SUMASPAY",
      },
      { status: 500 }
    );
  }
}
