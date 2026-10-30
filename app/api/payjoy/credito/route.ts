import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeConsultarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
// Kept for old open tabs; retiring the UI must also stop its provider lookups.
async function retired() {
  try {
    const session = await getSessionUser();
    if (!session) return reply({ error: "Inicia sesión para consultar PayJoy.", code: "UNAUTHENTICATED" }, 401);
    if (!puedeConsultarExtensionesPayJoy(session)) return reply({ error: "Tu perfil no tiene acceso a PayJoy.", code: "FORBIDDEN" }, 403);
    return reply({ code: "MODULE_RETIRED", error: "Esta consulta ya no está disponible. Ingresa a Extensiones PayJoy para gestionar tus operaciones." }, 410);
  } catch {
    return reply({ code: "INTERNAL", error: "No se pudo verificar la sesión. Intenta nuevamente." }, 503);
  }
}

export const GET = retired;
export const POST = retired;
