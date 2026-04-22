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
  } | null;
};

export type PayJoyPaymentSnapshot = {
  deviceTag: string;
  validThrough: Date | null;
  remainingBalance: number | null;
  currency: string | null;
  cost7: number | null;
  cost30: number | null;
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

export async function getPayJoyPaymentSnapshot(deviceTag: string) {
  const normalizedDeviceTag = normalizeDeviceTag(deviceTag);

  if (!normalizedDeviceTag) {
    throw new Error("El device tag es obligatorio.");
  }

  const body = new URLSearchParams();
  body.set("deviceTag", normalizedDeviceTag);
  body.set("endpoint", "pay-payment-api-html");
  body.set("type[paymentApiType]", DEFAULT_PAYMENT_API_TYPE);
  body.set("type[countryCode]", DEFAULT_COUNTRY_CODE);
  body.set("type[vendor]", DEFAULT_VENDOR);

  const response = await fetch(PAYJOY_PUBLIC_PAYMENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

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
    cost7: parseNumber(payload.deviceDetails?.cost7),
    cost30: parseNumber(payload.deviceDetails?.cost30),
    paidInFull,
    message: payload.message || null,
  } satisfies PayJoyPaymentSnapshot;
}
