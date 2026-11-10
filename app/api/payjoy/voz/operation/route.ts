import { payJoyVoiceService } from "@/lib/payjoy-voice-service";
import { voiceBody, voiceFailure, voiceJson, voiceKeys } from "@/lib/payjoy-voice-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await voiceBody(request);
    voiceKeys(body, body.action === "verify_identity" ? ["action", "event_token", "confirmed"] : body.action === "outcome" ? ["action", "event_token", "outcome", "note"] : body.action === "optout" ? ["action", "event_token", "note"] : []);
    return voiceJson(await payJoyVoiceService.operation(body));
  } catch (error) { return voiceFailure(error); }
}
