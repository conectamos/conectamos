import { getSessionUser } from "@/lib/auth";
import { payJoyExtensionRequestHasTrustedOrigin } from "@/lib/payjoy-extensions-origin";
import { puedePrepararBorradoresPayJoyDapta } from "@/lib/payjoy-dapta-access";
import { createPayJoyDaptaBatch, getPayJoyDaptaBatch, listPayJoyDaptaBatches, PayJoyDaptaError, retryPayJoyDaptaBatch, validatePayJoyDaptaBatch } from "@/lib/payjoy-dapta-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function sessionAccess() {
  const session = await getSessionUser();
  if (!session) throw new PayJoyDaptaError("UNAUTHENTICATED", 401);
  if (!puedePrepararBorradoresPayJoyDapta(session)) throw new PayJoyDaptaError("FORBIDDEN", 403);
  return session;
}
function failure(error: unknown) {
  if (error instanceof PayJoyDaptaError) return reply({ error: error.message, code: error.code, sendingEnabled: false }, error.status);
  const missing = ["P2021", "P2022"].includes(String((error as { code?: unknown })?.code));
  return reply({ error: missing ? "El módulo requiere actualizar la base de datos. Contacta al administrador."
    : "No se pudo completar la consulta. Abre el borrador guardado antes de reintentar.", code: missing ? "SCHEMA_REQUIRED" : "INTERNAL", sendingEnabled: false }, 503);
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new PayJoyDaptaError("INVALID_INPUT", 415);
  const reader = request.body?.getReader();
  if (!reader || Number(request.headers.get("content-length")) > 8192) throw new PayJoyDaptaError("INVALID_INPUT", 413);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new PayJoyDaptaError("INVALID_INPUT", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new PayJoyDaptaError("INVALID_INPUT"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PayJoyDaptaError("INVALID_INPUT");
  return body as Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const session = await sessionAccess();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "batchId") || params.getAll("batchId").length > 1) throw new PayJoyDaptaError("INVALID_INPUT");
    return reply(params.has("batchId") ? await getPayJoyDaptaBatch(session, params.get("batchId")) : await listPayJoyDaptaBatches(session));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const session = await sessionAccess();
    if (!payJoyExtensionRequestHasTrustedOrigin(request)) return reply({ code: "ORIGIN", error: "Solicitud de origen no permitido.", sendingEnabled: false }, 403);
    const body = await readBody(request);
    const allowed = body.action === "create" ? ["action", "requestId", "devices"]
      : body.action === "validate" ? ["action", "batchId"] : body.action === "retry" ? ["action", "batchId", "requestId"] : [];
    if (!allowed.length || Object.keys(body).some(key => !allowed.includes(key))) throw new PayJoyDaptaError("INVALID_INPUT");
    if (body.action === "create") return reply(await createPayJoyDaptaBatch(session, body));
    if (body.action === "validate") return reply(await validatePayJoyDaptaBatch(session, body.batchId));
    return reply(await retryPayJoyDaptaBatch(session, body));
  } catch (error) { return failure(error); }
}
