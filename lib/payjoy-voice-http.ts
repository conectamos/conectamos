import "server-only";
import { PayJoyVoiceError } from "@/lib/payjoy-voice-service";

export const voiceJson = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff",
} });
export function voiceFailure(error: unknown) {
  if (error instanceof PayJoyVoiceError) return voiceJson({ error: error.message, code: error.code }, error.status);
  const schema = ["P2021", "P2022"].includes(String((error as { code?: unknown })?.code));
  return voiceJson({ error: schema ? "El módulo requiere actualizar su base de datos." : "No fue posible completar la operación. Consulte el estado antes de reintentar.", code: schema ? "SCHEMA_REQUIRED" : "INTERNAL" }, 503);
}
export async function voiceBody(request: Request, limit = 8192): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new PayJoyVoiceError("INVALID_INPUT", 415);
  const reader = request.body?.getReader();
  if (!reader || Number(request.headers.get("content-length")) > limit) throw new PayJoyVoiceError("INVALID_INPUT", 413);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new PayJoyVoiceError("INVALID_INPUT", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new PayJoyVoiceError("INVALID_INPUT"); }
}
export function voiceKeys(body: Record<string, unknown>, keys: string[]) {
  if (!keys.length || Object.keys(body).some(key => !keys.includes(key))) throw new PayJoyVoiceError("INVALID_INPUT");
}
