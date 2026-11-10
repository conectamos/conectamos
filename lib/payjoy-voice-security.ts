import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type PayJoyVoiceConfig = {
  agentId: string; fromNumber: string; jobSecret: string; eventSecret: string;
  schedulerEnabled: boolean; allowedDevices: string[];
};
export const VOICE_UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TOKEN_EXPIRY = Date.parse("2026-11-10T18:00:00Z");
export function readPayJoyVoiceConfig(): PayJoyVoiceConfig {
  return {
    agentId: process.env.PAYJOY_VOICE_AGENT_ID?.trim() || "",
    fromNumber: process.env.PAYJOY_VOICE_FROM_NUMBER?.trim() || "",
    jobSecret: process.env.PAYJOY_VOICE_JOB_SECRET || "",
    eventSecret: process.env.PAYJOY_VOICE_EVENT_SECRET || "",
    schedulerEnabled: process.env.PAYJOY_VOICE_SCHEDULER_ENABLED === "true",
    allowedDevices: (process.env.PAYJOY_VOICE_ALLOWED_DEVICES || "").split(",").map(value => value.trim().toUpperCase()).filter(Boolean),
  };
}
export function payJoyVoiceConfigured(config: PayJoyVoiceConfig): boolean {
  return VOICE_UUID.test(config.agentId) && config.fromNumber === "+573124085562"
    && config.jobSecret.length >= 32 && config.eventSecret.length >= 32 && config.schedulerEnabled === true
    && config.allowedDevices.length === 7 && new Set(config.allowedDevices).size === 7
    && config.allowedDevices.every(tag => /^D[A-Z0-9]{5,31}$/.test(tag));
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function payJoyVoiceWorkerAuthorized(request: Request): boolean {
  const secret = readPayJoyVoiceConfig().jobSecret;
  const provided = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1] || "";
  return secret.length >= 32 && equal(provided, secret);
}
export function createPayJoyVoiceEventToken(callId: string, secret: string): string {
  if (secret.length < 32 || !VOICE_UUID.test(callId)) throw new Error("Voice token configuration unavailable");
  const payload = Buffer.from(JSON.stringify({ v: 1, id: callId, exp: TOKEN_EXPIRY })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function readPayJoyVoiceEventToken(value: unknown, secret: string, now: Date): string | null {
  if (typeof value !== "string" || value.length > 512 || secret.length < 32) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  if (!equal(parts[1], createHmac("sha256", secret).update(parts[0]).digest("base64url"))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.v === 1 && VOICE_UUID.test(payload.id) && payload.exp === TOKEN_EXPIRY && now.getTime() < TOKEN_EXPIRY
      ? payload.id : null;
  } catch { return null; }
}
