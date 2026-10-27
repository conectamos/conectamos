import "server-only";

/**
 * Contract observed in PayJoy Pay's public application on 2026-10-27:
 * https://pay.payjoy.com/extensions/device/{deviceTag}
 * /config.js and /js/main.cc406e9a.js. This is a separate service from Retail.
 * Tokens live only in the current server call. No request automatically retries.
 */
const BASE_URL = "https://extensions.payjoy.io/api/v1/extensions/";
const TIMEOUT_MS = 20_000;
const MAX_BODY_LENGTH = 262_144;

export type PayJoyExtensionOption = {
  id: string;
  extensionType: string;
  extensionTime: number;
  status: string;
  available: boolean;
  reason: string | null;
  reasons: Array<{ id: string; label: string }>;
  details: Record<string, string | number | boolean | null>;
};

export type PayJoyExtensionSelection = {
  extensionType: string;
  extensionTime: number;
  reason: string;
};

export type PayJoyExtensionResult = {
  success: boolean;
  status: string;
  newValidThrough: string | null;
};

export type PayJoyExtensionsErrorCode =
  | "INVALID_INPUT" | "INVALID_RESPONSE" | "AUTH" | "NOT_FOUND"
  | "RATE_LIMIT" | "UNAVAILABLE" | "TIMEOUT" | "REJECTED";

const MESSAGES: Record<PayJoyExtensionsErrorCode, string> = {
  INVALID_INPUT: "Los datos para consultar las extensiones no son válidos.",
  INVALID_RESPONSE: "PayJoy devolvió una respuesta de extensiones que no se pudo verificar.",
  AUTH: "PayJoy no autorizó el acceso a las extensiones de este dispositivo.",
  NOT_FOUND: "PayJoy no encontró la solicitud o el dispositivo indicado.",
  RATE_LIMIT: "PayJoy alcanzó su límite de consultas. Espera antes de consultar de nuevo.",
  UNAVAILABLE: "El servicio de extensiones de PayJoy no está disponible en este momento.",
  TIMEOUT: "PayJoy superó el tiempo máximo de respuesta.",
  REJECTED: "PayJoy rechazó la solicitud de extensión.",
};

export class PayJoyExtensionsProviderError extends Error {
  constructor(
    public readonly code: PayJoyExtensionsErrorCode,
    public readonly status = 502,
    public readonly ambiguous = false,
  ) {
    super(MESSAGES[code]);
    this.name = "PayJoyExtensionsProviderError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f<>]/.test(result)) return null;
  return result;
}

function date(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function device(value: string) {
  const tag = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^D[A-Z0-9]{5,31}$/.test(tag)) throw new PayJoyExtensionsProviderError("INVALID_INPUT", 400);
  return tag;
}

function requestId(value: unknown) {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
  }
  return id;
}

function idempotencyKey(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,160}$/.test(value)) {
    throw new PayJoyExtensionsProviderError("INVALID_INPUT", 400);
  }
  return value;
}

async function call(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  token?: string,
  selecting = false,
): Promise<Record<string, unknown>> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  let raw: string;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Accept-Language": "es-CO",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      const status = response.status;
      // A 409 may describe an already processed idempotency key; without a
      // verified conflict response contract it cannot release the device lock.
      const ambiguous = selecting && (status >= 500 || status === 408 || status === 409 || status === 429 || status < 400);
      const code = status === 401 || status === 403 ? "AUTH"
        : status === 404 ? "NOT_FOUND" : status === 429 ? "RATE_LIMIT"
          : status === 408 ? "TIMEOUT" : status >= 500 ? "UNAVAILABLE" : "REJECTED";
      throw new PayJoyExtensionsProviderError(code, status === 429 ? 429 : 502, ambiguous);
    }
    const length = Number(response.headers.get("content-length"));
    if (length > MAX_BODY_LENGTH) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE", 502, selecting);
    raw = await response.text();
  } catch (error) {
    if (error instanceof PayJoyExtensionsProviderError) throw error;
    throw new PayJoyExtensionsProviderError(signal.aborted ? "TIMEOUT" : "UNAVAILABLE", 502, selecting);
  }
  if (raw.length > MAX_BODY_LENGTH) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE", 502, selecting);
  let result: Record<string, unknown> | null;
  try { result = record(JSON.parse(raw)); }
  catch { throw new PayJoyExtensionsProviderError("INVALID_RESPONSE", 502, selecting); }
  if (!result) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE", 502, selecting);
  return result;
}

async function authenticate(tag: string) {
  const response = await call("app-www-token/", "POST", {
    deviceTag: tag,
    sub: `${tag}@app.www`,
    channel: "APP-WWW",
  });
  const token = response.token;
  if (typeof token !== "string" || token.length < 10 || token.length > 8192 || /\s/.test(token)) {
    throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
  }
  return token;
}

function parseOptions(response: Record<string, unknown>): PayJoyExtensionOption[] {
  if (!Array.isArray(response.options) || response.options.length > 50) {
    throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
  }
  const ids = new Set<string>();
  return response.options.map((value) => {
    const option = record(value);
    const extensionType = text(option?.extensionType, 80);
    const extensionTime = option?.minTime;
    const status = text(option?.status, 80);
    if (!option || !extensionType || !/^[a-z][a-z0-9_]*$/.test(extensionType)
      || typeof extensionTime !== "number" || !Number.isFinite(extensionTime) || extensionTime <= 0
      || !status) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
    const id = `${extensionType}:${extensionTime}`;
    if (ids.has(id)) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
    ids.add(id);
    const reason = option.reasonsKey == null || option.reasonsKey === "" ? null : text(option.reasonsKey, 500);
    if (option.reasonsKey && !reason) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
    const keys = option.uiReasonKeys ?? [];
    const labelsValue = option.uiReasons ?? "";
    if (!Array.isArray(keys) || keys.length > 30 || typeof labelsValue !== "string" || labelsValue.length > 12_000) {
      throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
    }
    const labels = labelsValue ? labelsValue.split("#") : [];
    if (keys.length !== labels.length) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
    const reasons = keys.map((key, index) => {
      const id = text(key);
      const label = text(labels[index], 400);
      if (!id || !label) throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
      return { id, label };
    }).filter(({ id }) => id.toLowerCase() !== "not connected to the internet");
    if (new Set(reasons.map(({ id }) => id)).size !== reasons.length) {
      throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
    }
    const details: PayJoyExtensionOption["details"] = {};
    const extensionData = record(option.extensionData);
    for (const key of ["extensionsRemaining", "extensionsMax"] as const) {
      const value = extensionData?.[key];
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) details[key] = value;
    }
    const nextDate = date(extensionData?.extensionsNextAvailableDate);
    if (nextDate) details.extensionsNextAvailableDate = nextDate;
    // PayJoy's own client defines availability as status !== "denied"; it does
    // not publish a positive enum. Preserve that observed rule, requiring a
    // nonempty status and a valid option instead of inventing "approved".
    const available = status !== "denied" && reason !== "Not available in this country"
      && (keys.length === 0 || reasons.length > 0);
    return { id, extensionType, extensionTime, status, available, reason, reasons, details };
  });
}

export async function beginPayJoyExtension(deviceTag: string, key: string) {
  const tag = device(deviceTag);
  const idemKey = idempotencyKey(key);
  const token = await authenticate(tag);
  const created = await call("", "POST", {
    deviceTag: tag,
    channel: "APP-WWW",
    idempotencyKey: idemKey,
    requesterEmail: `${tag}@app.www`,
  }, token);
  const id = requestId(created.id);
  const currentValidThrough = date(created.currentValidThrough);
  if (created.currentValidThrough != null && !currentValidThrough) {
    throw new PayJoyExtensionsProviderError("INVALID_RESPONSE");
  }
  const options = parseOptions(await call(`${id}/options/`, "GET", undefined, token));
  return { requestId: id, currentValidThrough, options };
}

export async function refreshPayJoyExtensionOptions(deviceTag: string, providerRequestId: string) {
  const tag = device(deviceTag);
  const id = requestId(providerRequestId);
  const token = await authenticate(tag);
  return parseOptions(await call(`${id}/options/`, "GET", undefined, token));
}

export async function selectPayJoyExtension(
  deviceTag: string,
  providerRequestId: string,
  key: string,
  selection: PayJoyExtensionSelection,
): Promise<PayJoyExtensionResult> {
  const tag = device(deviceTag);
  const id = requestId(providerRequestId);
  const idemKey = idempotencyKey(key);
  if (!selection || typeof selection.extensionType !== "string" || !/^[a-z][a-z0-9_]{0,79}$/.test(selection.extensionType)
    || typeof selection.extensionTime !== "number" || !Number.isFinite(selection.extensionTime)
    || selection.extensionTime <= 0 || typeof selection.reason !== "string"
    || (selection.reason !== "" && text(selection.reason) !== selection.reason)) {
    throw new PayJoyExtensionsProviderError("INVALID_INPUT", 400);
  }
  const token = await authenticate(tag);
  const result = await call(`${id}/select/`, "POST", {
    idempotencyKey: idemKey,
    extension_reason: selection.reason,
    extension_type: selection.extensionType,
    extension_time: selection.extensionTime,
  }, token, true);
  const status = text(result.status, 80);
  const newValidThrough = date(result.newValidThrough);
  if (result.success === true && status === "GRANTED" && newValidThrough) {
    return { success: true, status, newValidThrough };
  }
  // No undocumented response state is treated as a confirmed failure or success.
  // A lost/ambiguous response must never trigger an automatic second selection.
  throw new PayJoyExtensionsProviderError("INVALID_RESPONSE", 502, true);
}
