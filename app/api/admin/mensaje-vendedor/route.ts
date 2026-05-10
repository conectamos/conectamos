import { NextResponse } from "next/server";
import { esRolAdmin } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import {
  getVendorWelcomeMessage,
  saveVendorWelcomeMessage,
} from "@/lib/vendor-welcome-message";

function puedeEditarMensaje(session: Awaited<ReturnType<typeof getSessionUser>>) {
  return Boolean(session && esRolAdmin(session.rolNombre) && !session.perfilId);
}

export async function GET() {
  try {
    const session = await getSessionUser();

    if (!puedeEditarMensaje(session)) {
      return NextResponse.json(
        { error: "Solo el administrador principal puede consultar este mensaje" },
        { status: 403 }
      );
    }

    const mensaje = await getVendorWelcomeMessage();

    return NextResponse.json({
      mensaje,
      ok: true,
    });
  } catch (error) {
    console.error("ERROR CARGANDO MENSAJE VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error cargando el mensaje de vendedores" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getSessionUser();

    if (!puedeEditarMensaje(session)) {
      return NextResponse.json(
        { error: "Solo el administrador principal puede actualizar este mensaje" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const mensaje = await saveVendorWelcomeMessage(body, session?.usuario ?? "admin");

    return NextResponse.json({
      mensaje,
      ok: true,
    });
  } catch (error) {
    console.error("ERROR ACTUALIZANDO MENSAJE VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error actualizando el mensaje de vendedores" },
      { status: 500 }
    );
  }
}
