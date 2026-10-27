import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeConsultarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import { payJoyExtensionRequestHasTrustedOrigin } from "@/lib/payjoy-extensions-origin";
import { buscarDispositivosLocalesPayJoy, confirmarExtensionPayJoy, historialExtensionesPayJoy, prepararExtensionPayJoy, PayJoyExtensionsError } from "@/lib/payjoy-extensions-service";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
async function sessionAccess() {
  const session = await getSessionUser();
  if (!session) throw new PayJoyExtensionsError("UNAUTHENTICATED", 401, "Inicia sesión para consultar PayJoy.");
  if (!puedeConsultarExtensionesPayJoy(session)) throw new PayJoyExtensionsError("FORBIDDEN", 403, "Tu perfil no tiene acceso a extensiones PayJoy.");
  return session;
}
function failure(error: unknown) {
  if (error instanceof PayJoyExtensionsError) return reply({ error: error.message, code: error.code }, error.status);
  const schemaMissing = ["P2021", "P2022"].includes(String((error as { code?: unknown })?.code));
  return reply({ error: schemaMissing ? "El módulo requiere actualizar su base de datos. Contacta al administrador." : "No se pudo completar la operación. Consulta el historial antes de volver a intentar.", code: schemaMissing ? "SCHEMA_REQUIRED" : "INTERNAL" }, 503);
}
export async function GET() {
  try { return reply(await historialExtensionesPayJoy(await sessionAccess())); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const session = await sessionAccess();
    // JSON plus configured-origin validation protects every authenticated POST.
    if (!payJoyExtensionRequestHasTrustedOrigin(req)) {
      throw new PayJoyExtensionsError("ORIGIN", 403, "Solicitud de origen no permitido.");
    }
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ error: "Usa una solicitud JSON válida.", code: "INVALID_INPUT" }, 415);
    if (Number(req.headers.get("content-length") || 0) > 4096) return reply({ error: "Solicitud demasiado grande.", code: "INVALID_INPUT" }, 413);
    const text = await req.text();
    if (text.length > 4096) return reply({ error: "Solicitud demasiado grande.", code: "INVALID_INPUT" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return reply({ error: "Solicitud JSON inválida.", code: "INVALID_INPUT" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Solicitud inválida.", code: "INVALID_INPUT" }, 400);
    if (body.action === "buscar") return reply(await buscarDispositivosLocalesPayJoy(session, body.cedula));
    if (body.action === "preparar") return reply({ operation: await prepararExtensionPayJoy(session, body) });
    if (body.action === "confirmar") return reply({ operation: await confirmarExtensionPayJoy(session, body) });
    return reply({ error: "Acción no válida.", code: "INVALID_INPUT" }, 400);
  } catch (error) { return failure(error); }
}
