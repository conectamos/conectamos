import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederPanelVendedor } from "@/lib/access-control";
import {
  AloConsultaConfigError,
  AloConsultaLookupError,
  obtenerCreditoAloPorImei,
} from "@/lib/aloconsulta";
import { normalizarImei } from "@/lib/vendor-sale-records";

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

export async function GET(req: Request) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const requestUrl = new URL(req.url);
    const imei = normalizarImei(requestUrl.searchParams.get("imei"));

    if (!imei) {
      return NextResponse.json(
        { error: "El IMEI debe tener 15 digitos" },
        { status: 400 }
      );
    }

    const credito = await obtenerCreditoAloPorImei(imei);

    if (!credito) {
      return NextResponse.json(
        { error: "No se encontro un credito ALO CREDIT creado hoy o ayer para este IMEI" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      credito,
    });
  } catch (error) {
    if (error instanceof AloConsultaConfigError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      );
    }

    if (error instanceof AloConsultaLookupError) {
      return NextResponse.json(
        { error: error.message },
        { status: 502 }
      );
    }

    console.error("ERROR CONSULTANDO CREDITO ALO CREDIT:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando el credito ALO CREDIT",
      },
      { status: 500 }
    );
  }
}
