import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeConsultarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import { payJoyExtensionRequestHasTrustedOrigin } from "@/lib/payjoy-extensions-origin";
import { consultarFichaPayJoy, historialFichaPayJoy, PayJoyCreditError } from "@/lib/payjoy-credit-service";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
async function sessionAccess() {
  const session = await getSessionUser();
  if (!session) return null;
  if (!puedeConsultarExtensionesPayJoy(session)) throw new PayJoyCreditError("FORBIDDEN", 403);
  return session;
}
function failure(error: unknown) {
  if (error instanceof PayJoyCreditError) return reply({ error: error.message, code: error.code }, error.status);
  const schemaMissing = ["P2021", "P2022"].includes(String((error as { code?: unknown })?.code));
  return reply({ code: schemaMissing ? "SCHEMA_REQUIRED" : "INTERNAL", error: schemaMissing
    ? "La ficha requiere actualizar su base de datos. Contacta al administrador."
    : "No se pudo completar la consulta. Revisa el historial antes de volver a intentar." }, 503);
}
export async function GET() {
  try {
    const session = await sessionAccess();
    if (!session) return reply({ error: "Inicia sesión para consultar PayJoy.", code: "UNAUTHENTICATED" }, 401);
    return reply(await historialFichaPayJoy(session));
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const session = await sessionAccess();
    if (!session) return reply({ error: "Inicia sesión para consultar PayJoy.", code: "UNAUTHENTICATED" }, 401);
    if (!payJoyExtensionRequestHasTrustedOrigin(req)) return reply({ error: "Solicitud de origen no permitido.", code: "ORIGIN" }, 403);
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ error: "Usa una solicitud JSON válida.", code: "INVALID_INPUT" }, 415);
    if (Number(req.headers.get("content-length") || 0) > 2048) return reply({ error: "Solicitud demasiado grande.", code: "INVALID_INPUT" }, 413);
    const text = await req.text();
    if (text.length > 2048) return reply({ error: "Solicitud demasiado grande.", code: "INVALID_INPUT" }, 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(text); } catch { return reply({ error: "Solicitud JSON inválida.", code: "INVALID_INPUT" }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new PayJoyCreditError("INVALID_INPUT", 400);
    return reply({ check: await consultarFichaPayJoy(session, input) });
  } catch (error) { return failure(error); }
}
