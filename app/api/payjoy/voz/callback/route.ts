import { payJoyVoiceService } from "@/lib/payjoy-voice-service";
import { voiceBody, voiceFailure, voiceJson } from "@/lib/payjoy-voice-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    // The scoped server-issued token is the credential. This is not a claimed Dapta signature.
    return voiceJson(await payJoyVoiceService.callback(await voiceBody(request, 65_536)));
  } catch (error) { return voiceFailure(error); }
}
