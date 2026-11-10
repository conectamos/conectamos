import { payJoyVoiceWorkerAuthorized } from "@/lib/payjoy-voice-security";
import { payJoyVoiceService } from "@/lib/payjoy-voice-service";
import { voiceBody, voiceFailure, voiceJson, voiceKeys } from "@/lib/payjoy-voice-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!payJoyVoiceWorkerAuthorized(request)) return voiceJson({ code: "UNAUTHORIZED", error: "No autorizado." }, 401);
    const body = await voiceBody(request);
    voiceKeys(body, body.action === "claim" ? ["action"] : body.action === "authorize_dispatch" ? ["action", "event_token"] : body.action === "receipt" ? ["action", "event_token", "call_id", "accepted", "error_code"] : []);
    return voiceJson(body.action === "claim" ? await payJoyVoiceService.claim() : body.action === "authorize_dispatch" ? await payJoyVoiceService.authorizeDispatch(body) : await payJoyVoiceService.receipt(body));
  } catch (error) { return voiceFailure(error); }
}
