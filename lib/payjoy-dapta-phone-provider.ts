import "server-only";
import { readPayJoyCreditPaymentPayload } from "@/lib/payjoy";

/**
 * Read-only contact adapter for draft batches. Reuses the existing payment-data
 * query; it never creates a payment request or calls Dapta.
 *
 * Contract checked against PayJoy on 2026-11-09: deviceDetails.phoneNumber is
 * the Colombian number with country prefix; formattedPhone is its local display
 * form. Both matched the number prefilled by the Nequi screen for the same tag.
 * This is source validation, not proof of ownership, WhatsApp use or opt-in.
 */
export type PayJoyDaptaPhoneResult = {
  phone: string | null;
  source: "PAYJOY_NEQUI_PREFILL" | null;
};

const MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Ingresa un código de dispositivo PayJoy válido.",
  INVALID_RESPONSE: "No se pudo verificar el celular informado por PayJoy.",
  PHONE_CONFLICT: "PayJoy informó celulares diferentes para este equipo. Requiere revisión.",
  DEVICE_MISMATCH: "La respuesta de PayJoy no corresponde al equipo consultado.",
  UNSUPPORTED_COUNTRY: "El equipo no está identificado por PayJoy como un crédito de Colombia.",
  NOT_FOUND: "PayJoy no devolvió información válida para este equipo.",
  AUTH: "PayJoy no autorizó la consulta de este equipo.",
  TIMEOUT: "PayJoy tardó demasiado en responder. Puedes reintentar la consulta.",
  RATE_LIMIT: "PayJoy alcanzó su límite de consultas. Intenta nuevamente más tarde.",
  UNAVAILABLE: "No fue posible consultar el celular en PayJoy.",
};

export class PayJoyDaptaPhoneError extends Error {
  readonly code: string;
  constructor(code: string) {
    const safe = Object.hasOwn(MESSAGES, code) ? code : "UNAVAILABLE";
    super(MESSAGES[safe]);
    this.name = "PayJoyDaptaPhoneError";
    this.code = safe;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function deviceTag(value: unknown): string {
  if (typeof value !== "string") throw new PayJoyDaptaPhoneError("INVALID_INPUT");
  const tag = value.trim().toUpperCase();
  if (!/^D[A-Z0-9]{5,31}$/.test(tag)) throw new PayJoyDaptaPhoneError("INVALID_INPUT");
  return tag;
}

/** Never truncates, guesses a country code or accepts landlines/extensions. */
function colombianMobile(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 32) throw new PayJoyDaptaPhoneError("INVALID_RESPONSE");
  const raw = value.trim();
  if (!raw) return null;
  if (!/^\+?[0-9 ().-]+$/.test(raw)) throw new PayJoyDaptaPhoneError("INVALID_RESPONSE");
  const digits = raw.replace(/\D/g, "");
  if (/^573\d{9}$/.test(digits)) return `+${digits}`;
  if (!raw.startsWith("+") && /^3\d{9}$/.test(digits)) return `+57${digits}`;
  throw new PayJoyDaptaPhoneError("INVALID_RESPONSE");
}

export function parsePayJoyDaptaPhone(tagInput: string, payload: unknown): PayJoyDaptaPhoneResult {
  const tag = deviceTag(tagInput);
  const data = record(payload);
  if (!data) throw new PayJoyDaptaPhoneError("INVALID_RESPONSE");
  if (data.valid !== true) throw new PayJoyDaptaPhoneError("NOT_FOUND");
  const details = record(data.deviceDetails);
  if (!details) throw new PayJoyDaptaPhoneError("INVALID_RESPONSE");
  if (typeof details.deviceTag !== "string" || details.deviceTag.trim().toUpperCase() !== tag) {
    throw new PayJoyDaptaPhoneError("DEVICE_MISMATCH");
  }
  if (details.country !== "CO") throw new PayJoyDaptaPhoneError("UNSUPPORTED_COUNTRY");
  const phone = colombianMobile(details.phoneNumber);
  const displayPhone = colombianMobile(data.formattedPhone);
  if (phone && displayPhone && phone !== displayPhone) throw new PayJoyDaptaPhoneError("PHONE_CONFLICT");
  // Do not fall back to supportPhone, merchantPhone, email or other identities.
  // The structured device number is required even if a display value is present.
  return phone ? { phone, source: "PAYJOY_NEQUI_PREFILL" } : { phone: null, source: null };
}

export async function readPayJoyDaptaPhone(tagInput: string): Promise<PayJoyDaptaPhoneResult> {
  const tag = deviceTag(tagInput);
  try {
    return parsePayJoyDaptaPhone(tag, await readPayJoyCreditPaymentPayload(tag));
  } catch (error) {
    if (error instanceof PayJoyDaptaPhoneError) throw error;
    const code = (error as { code?: unknown } | null)?.code;
    // Never expose upstream payloads, URLs, stack traces or contact data in errors.
    throw new PayJoyDaptaPhoneError(typeof code === "string" ? code : "UNAVAILABLE");
  }
}
