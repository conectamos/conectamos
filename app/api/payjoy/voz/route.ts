import { getSessionUser } from "@/lib/auth";
import { payJoyExtensionRequestHasTrustedOrigin } from "@/lib/payjoy-extensions-origin";
import { PayJoyVoiceError, payJoyVoiceService } from "@/lib/payjoy-voice-service";
import { voiceBody, voiceFailure, voiceJson, voiceKeys } from "@/lib/payjoy-voice-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return voiceJson({ code: "UNAUTHENTICATED", error: "Inicie sesión para consultar las llamadas." }, 401);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "sourceBatchId") || params.getAll("sourceBatchId").length !== 1) throw new PayJoyVoiceError("INVALID_INPUT");
    return voiceJson(await payJoyVoiceService.get(session, params.get("sourceBatchId")));
  } catch (error) { return voiceFailure(error); }
}
export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return voiceJson({ code: "UNAUTHENTICATED", error: "Inicie sesión para gestionar las llamadas." }, 401);
    if (!payJoyExtensionRequestHasTrustedOrigin(request)) return voiceJson({ code: "ORIGIN", error: "Solicitud de origen no permitido." }, 403);
    const body = await voiceBody(request);
    voiceKeys(body, body.action === "schedule" ? ["action", "sourceBatchId", "requestId", "confirmed"] : body.action === "cancel" ? ["action", "batchId"] : []);
    return voiceJson(body.action === "schedule" ? await payJoyVoiceService.schedule(session, body) : await payJoyVoiceService.cancel(session, body.batchId));
  } catch (error) { return voiceFailure(error); }
}
