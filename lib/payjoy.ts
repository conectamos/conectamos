const PAYJOY_PUBLIC_PAYMENT_URL = "https://www.payjoy.com/payments/pay-cc.php";
const DEFAULT_PAYMENT_API_TYPE =
  process.env.PAYJOY_PAYMENT_API_TYPE || "WOMPI";
const DEFAULT_COUNTRY_CODE = process.env.PAYJOY_COUNTRY_CODE || "CO";
const DEFAULT_VENDOR = process.env.PAYJOY_VENDOR || "NEQUI";

type PayJoyPublicResponse = {
  valid?: boolean;
  message?: string;
  remainingBalance?: string | number | null;
  currency?: string | null;
  deviceDetails?: {
    deviceTag?: string | null;
    validThrough?: string | number | null;
    cost7?: string | number | null;
    cost30?: string | number | null;
    months?: string | number | null;
    feeSchema?: string | null;
  } | null;
};

export type PayJoyPaymentSnapshot = {
  deviceTag: string;
  validThrough: Date | null;
  remainingBalance: number | null;
  currency: string | null;
  cost14: number | null;
  cost7: number | null;
  cost30: number | null;
  months: number | null;
  paidInFull: boolean;
  message: string | null;
};

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/,/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseUnixDate(value: string | number | null | undefined) {
  const unixSeconds = parseNumber(value);

  if (!unixSeconds) {
    return null;
  }

  const parsed = new Date(unixSeconds * 1000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePositiveInteger(value: string | number | null | undefined) {
  const parsed = parseNumber(value);

  return parsed && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDeviceTag(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeMessage(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isPaidInFullMessage(message: string | null | undefined) {
  const normalized = normalizeMessage(message);

  return (
    normalized.includes("no debe un pago adicional") ||
    normalized.includes("pagado por completo") ||
    normalized.includes("paid in full") ||
    normalized.includes("paid off")
  );
}

function parseCost14FromFeeSchema(value: string | null | undefined) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      installmentFees?: {
        cost14?: string | number | null;
      } | null;
    };

    return parseNumber(parsed.installmentFees?.cost14);
  } catch {
    return null;
  }
}

function resolveCost14(payload: PayJoyPublicResponse) {
  const fromFeeSchema = parseCost14FromFeeSchema(payload.deviceDetails?.feeSchema);
  const cost7 = parseNumber(payload.deviceDetails?.cost7);

  if (fromFeeSchema !== null) {
    return fromFeeSchema;
  }

  return cost7 === null ? null : cost7 * 2;
}

function requestPayJoyPaymentPayload(normalizedDeviceTag: string, signal?: AbortSignal) {
  const body = new URLSearchParams();
  body.set("deviceTag", normalizedDeviceTag);
  body.set("endpoint", "pay-payment-api-html");
  body.set("type[paymentApiType]", DEFAULT_PAYMENT_API_TYPE);
  body.set("type[countryCode]", DEFAULT_COUNTRY_CODE);
  body.set("type[vendor]", DEFAULT_VENDOR);

  return fetch(PAYJOY_PUBLIC_PAYMENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
    ...(signal ? { signal, redirect: "error" as const } : {}),
  });
}

/** Read-only server adapter. No payment is recorded by this existing endpoint. */
export async function readPayJoyCreditPaymentPayload(deviceTag: string): Promise<unknown> {
  const tag = typeof deviceTag === "string" ? normalizeDeviceTag(deviceTag) : "";
  if (!/^D[A-Z0-9]{5,31}$/.test(tag)) throw Object.assign(new Error("Identificador inválido."), { code: "INVALID_INPUT" });
  const signal = AbortSignal.timeout(20_000);
  try {
    const response = await requestPayJoyPaymentPayload(tag, signal);
    if (!response.ok) throw Object.assign(new Error("No fue posible consultar PayJoy."), { status: response.status });
    const max = 262_144;
    if (Number(response.headers.get("content-length")) > max) throw Object.assign(new Error(), { code: "INVALID_RESPONSE" });
    let raw = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > max) { await reader.cancel(); throw Object.assign(new Error(), { code: "INVALID_RESPONSE" }); }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
    } else {
      raw = await response.text();
      if (raw.length > max) throw Object.assign(new Error(), { code: "INVALID_RESPONSE" });
    }
    try { return JSON.parse(raw); }
    catch { throw Object.assign(new Error(), { code: "INVALID_RESPONSE" }); }
  } catch (error) {
    const failure = error as { code?: unknown; status?: unknown; name?: unknown } | null;
    const code = signal.aborted || failure?.name === "AbortError" || failure?.name === "TimeoutError" || failure?.status === 408 ? "TIMEOUT"
      : failure?.code === "INVALID_RESPONSE" ? "INVALID_RESPONSE"
        : failure?.status === 401 || failure?.status === 403 ? "AUTH"
          : failure?.status === 404 ? "NOT_FOUND" : failure?.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE";
    throw Object.assign(new Error("No se pudo verificar la consulta de PayJoy."), { code });
  }
}

export async function getPayJoyPaymentSnapshot(deviceTag: string) {
  const normalizedDeviceTag = normalizeDeviceTag(deviceTag);
  if (!normalizedDeviceTag) throw new Error("El device tag es obligatorio.");
  const response = await requestPayJoyPaymentPayload(normalizedDeviceTag);

  const text = await response.text();
  let data: PayJoyPublicResponse | null = null;

  try {
    data = text ? (JSON.parse(text) as PayJoyPublicResponse) : null;
  } catch {
    throw new Error("PayJoy devolvio una respuesta no valida.");
  }

  const payload: PayJoyPublicResponse = data || {};

  if (!response.ok) {
    throw new Error(
      payload.message || `PayJoy respondio con estado ${response.status}.`
    );
  }

  const remainingBalance = parseNumber(payload.remainingBalance);
  const paidInFull =
    isPaidInFullMessage(payload.message) ||
    (remainingBalance !== null && remainingBalance <= 0);

  if (!payload.valid && !paidInFull) {
    throw new Error(payload.message || "PayJoy no devolvio datos validos.");
  }

  return {
    deviceTag: normalizedDeviceTag,
    validThrough: parseUnixDate(payload.deviceDetails?.validThrough),
    remainingBalance,
    currency: payload.currency || null,
    cost14: resolveCost14(payload),
    cost7: parseNumber(payload.deviceDetails?.cost7),
    cost30: parseNumber(payload.deviceDetails?.cost30),
    months: parsePositiveInteger(payload.deviceDetails?.months),
    paidInFull,
    message: payload.message || null,
  } satisfies PayJoyPaymentSnapshot;
}
