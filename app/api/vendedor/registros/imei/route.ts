import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { puedeAccederPanelVendedor } from "@/lib/access-control";
import { buscarEquipoRegistroVentaPorImei } from "@/lib/vendor-sale-inventory";
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

  return { ok: true as const, session };
}

export async function GET(req: Request) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const requestUrl = new URL(req.url);
    const imei = normalizarImei(
      requestUrl.searchParams.get("imei") || requestUrl.searchParams.get("serial")
    );
    const puntoVenta = String(requestUrl.searchParams.get("puntoVenta") || "")
      .trim();

    if (!imei) {
      return NextResponse.json(
        { error: "El IMEI debe tener 15 digitos" },
        { status: 400 }
      );
    }

    const sedeConsulta = puntoVenta
      ? await prisma.sede.findFirst({
          where: {
            nombre: {
              equals: puntoVenta,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
          },
        })
      : null;

    const equipo = await buscarEquipoRegistroVentaPorImei(
      imei,
      sedeConsulta?.id ?? access.session.sedeId
    );

    if (!equipo) {
      return NextResponse.json(
        {
          error:
            "El IMEI no esta disponible en la sede seleccionada ni en Bodega Principal",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      equipo,
    });
  } catch (error) {
    console.error("ERROR LOOKUP IMEI REGISTRO VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error consultando el IMEI" },
      { status: 500 }
    );
  }
}
