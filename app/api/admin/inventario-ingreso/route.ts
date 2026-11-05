import { NextResponse } from "next/server";
import { esAdministradorCentral } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import { guardarIngresoDirectoSede, leerIngresoDirectoSede } from "@/lib/inventory-intake-policy";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
    if (!esAdministradorCentral(user)) {
      return NextResponse.json({ error: "Solo el administrador central puede consultar este permiso." }, { status: 403, headers });
    }

    return NextResponse.json({ habilitado: await leerIngresoDirectoSede() }, { headers });
  } catch (error) {
    console.error("ERROR CONSULTANDO INGRESO DIRECTO:", error);
    return NextResponse.json({ error: "No se pudo consultar el permiso de ingreso." }, { status: 500, headers });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
    if (!esAdministradorCentral(user)) {
      return NextResponse.json({ error: "Solo el administrador central puede cambiar este permiso." }, { status: 403, headers });
    }

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !("habilitado" in body) || typeof body.habilitado !== "boolean") {
      return NextResponse.json({ error: "Selecciona un estado válido para el permiso." }, { status: 400, headers });
    }

    await guardarIngresoDirectoSede(body.habilitado, user.usuario);
    return NextResponse.json({ habilitado: body.habilitado }, { headers });
  } catch (error) {
    console.error("ERROR ACTUALIZANDO INGRESO DIRECTO:", error);
    return NextResponse.json({ error: "No se pudo guardar el permiso de ingreso." }, { status: 500, headers });
  }
}
