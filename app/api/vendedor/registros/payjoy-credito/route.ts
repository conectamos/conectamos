import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederPanelVendedor } from "@/lib/access-control";
import {
  obtenerCreditoPayJoyPorImei,
  PayJoyRetailConfigError,
} from "@/lib/payjoy-retail";
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

    const credito = await obtenerCreditoPayJoyPorImei(imei);

    if (!credito) {
      return NextResponse.json(
        { error: "No se encontro un credito PayJoy creado hoy o ayer para este IMEI" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      credito,
    });
  } catch (error) {
    if (error instanceof PayJoyRetailConfigError) {
      return NextResponse.json(
        { error: "Falta configurar la clave API de PayJoy en el servidor" },
        { status: 503 }
      );
    }

    console.error("ERROR CONSULTANDO CREDITO PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando el credito PayJoy",
      },
      { status: 500 }
    );
  }
}
