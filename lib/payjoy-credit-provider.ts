import "server-only";
import { isPayJoyRetailConfigured, parsePayJoyExtensionDeviceResponse, readPayJoyCreditRetailPayload } from "@/lib/payjoy-retail";
import { readPayJoyCreditPaymentPayload } from "@/lib/payjoy";
import { findStoredPayJoyCreditDevice } from "@/lib/payjoy-credit-device-store";
import type { PayJoyCreditPayment, PayJoyCreditSnapshot } from "@/lib/payjoy-credit-types";

const TAG = /^D[A-Z\d]{5,31}$/;
const IMEI = /^\d{15,16}$/;
const messages: Record<string, string> = {
  INVALID_INPUT: "Ingresa un código PayJoy válido o un IMEI de 15 o 16 dígitos.",
  INVALID_RESPONSE: "No se pudo verificar la información del crédito en PayJoy.",
  DEVICE_UNRESOLVED: "PayJoy no devolvió el código de este equipo. Consulta con su identificador PayJoy.",
  DEVICE_ASSOCIATION_CONFLICT: "La asociación del equipo requiere revisión del administrador.",
  NOT_FOUND: "PayJoy no encontró información para este equipo.",
  AUTH: "PayJoy no autorizó la consulta. Contacta al administrador.",
  CONFIG: "Falta configurar la consulta PayJoy en el servidor.",
  TIMEOUT: "PayJoy tardó demasiado en responder. Intenta nuevamente más tarde.",
  RATE_LIMIT: "PayJoy alcanzó su límite de consultas. Intenta nuevamente más tarde.",
  UNAVAILABLE: "No fue posible consultar PayJoy en este momento.",
};
export class PayJoyCreditProviderError extends Error {
  readonly code: string;
  constructor(code: string) {
    const safeCode = Object.hasOwn(messages, code) ? code : "UNAVAILABLE";
    super(messages[safeCode]); this.name = "PayJoyCreditProviderError"; this.code = safeCode;
  }
}
function safeError(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return new PayJoyCreditProviderError(typeof code === "string" ? code : "UNAVAILABLE");
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}
function positiveInteger(value: unknown) { const parsed = number(value); return parsed !== null && parsed > 0 && Number.isSafeInteger(parsed) ? parsed : null; }
function currency(value: unknown) { return typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase()) ? value.trim().toUpperCase() : null; }
function text(value: unknown, max = 160) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f<>]/.test(value) ? value.trim() : null;
}
function timestamp(value: unknown) {
  const seconds = positiveInteger(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() <= 9999 ? date.toISOString() : null;
}
function paid(value: Record<string, unknown>, allowMessage = false): boolean | null {
  const values = [value.paidInFull, value.fullyPaid].filter(item => typeof item === "boolean") as boolean[];
  if (new Set(values).size > 1) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  const normalized = typeof value.message === "string"
    ? value.message.trim().toLowerCase().replace(/[.!]$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  const explicitMessage = allowMessage && ["no debe un pago adicional", "pagado por completo", "paid in full", "paid off"].includes(normalized);
  if (explicitMessage && values[0] === false) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  return values[0] ?? (explicitMessage ? true : null);
}
function empty(deviceTag: string | null, imei: string | null): PayJoyCreditSnapshot {
  return { deviceTag, imei, model: null, financeOrderId: null, remainingBalance: null, currency: null, validThrough: null,
    paidInFull: null, financeAmount: null, downPayment: null, purchaseAmount: null, months: null,
    weeklyCost: null, fortnightlyCost: null, monthlyCost: null, lastSeen: null, secureStatus: null,
    payments: [], paymentsAvailability: "NO_DISPONIBLE", source: "PAYMENT", warnings: [] };
}
function requireMoneyCurrency(snapshot: PayJoyCreditSnapshot) {
  if (snapshot.currency) return;
  const fields = ["remainingBalance", "financeAmount", "downPayment", "purchaseAmount", "weeklyCost", "fortnightlyCost", "monthlyCost"] as const;
  if (fields.some(field => snapshot[field] !== null)) snapshot.warnings.push("PayJoy no informó una moneda verificable; los importes de esa fuente no se muestran.");
  for (const field of fields) snapshot[field] = null;
}
function history(value: unknown, defaultCurrency: string | null): { payments: PayJoyCreditPayment[]; warning: boolean } {
  if (!Array.isArray(value)) return { payments: [], warning: false };
  const payments: PayJoyCreditPayment[] = [];
  let warning = value.length > 100;
  for (const item of value) {
    const row = record(item);
    const amount = number(row?.amount);
    const paidAt = timestamp(row?.timestamp);
    const code = row && Object.hasOwn(row, "currency") ? currency(row.currency) : defaultCurrency;
    if (amount === null || amount <= 0 || !paidAt || Date.parse(paidAt) > Date.now() + 60_000 || !code) { warning = true; continue; }
    payments.push({ amount, currency: code, paidAt });
  }
  payments.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  return { payments: payments.slice(0, 100), warning };
}
function retailSnapshot(identifier: string, payload: unknown): PayJoyCreditSnapshot {
  const identity = parsePayJoyExtensionDeviceResponse(identifier, payload);
  const data = record(payload)!;
  const finance = record(data.financeOrder);
  const device = record(data.device)!;
  const snapshot: PayJoyCreditSnapshot = { ...empty(identity.deviceTag, identity.imei),
    model: identity.model, financeOrderId: identity.financeOrderId,
    remainingBalance: number(finance?.remainingBalance), currency: currency(finance?.currency), validThrough: identity.validThrough,
    paidInFull: finance ? paid(finance) : null,
    financeAmount: number(finance?.financeAmount), downPayment: number(finance?.downPayment), purchaseAmount: number(finance?.purchaseAmount),
    months: positiveInteger(finance?.months), weeklyCost: number(finance?.weeklyCost), monthlyCost: number(finance?.monthlyCost),
    lastSeen: timestamp(device.lastSeen), secureStatus: text(device.secureStatus), source: "RETAIL",
  };
  if (snapshot.paidInFull === true && snapshot.remainingBalance !== null && snapshot.remainingBalance > 0) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  requireMoneyCurrency(snapshot);
  if (Array.isArray(data.paymentHistory)) {
    const result = history(data.paymentHistory, snapshot.currency);
    snapshot.payments = result.payments;
    snapshot.paymentsAvailability = "INFORMADO";
    if (result.warning) snapshot.warnings.push("Se omitieron pagos sin datos verificables o fuera de los 100 más recientes informados.");
  } else snapshot.warnings.push("PayJoy no proporcionó el historial de pagos en esta consulta.");
  return snapshot;
}
function publicSnapshot(tag: string, payload: unknown): PayJoyCreditSnapshot {
  const data = record(payload);
  if (!data) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  const paidInFull = paid(data, true);
  if (data.valid !== true && !(data.valid === false && paidInFull === true)) throw new PayJoyCreditProviderError(data.valid === false ? "NOT_FOUND" : "INVALID_RESPONSE");
  const details = record(data.deviceDetails);
  if (data.deviceDetails !== undefined && data.deviceDetails !== null && !details) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  for (const value of [data.deviceTag, details?.deviceTag]) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.trim().toUpperCase() !== tag)) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  }
  let feeSchema: Record<string, unknown> | null = null;
  if (typeof details?.feeSchema === "string" && details.feeSchema.length <= 16_384) {
    try { feeSchema = record(JSON.parse(details.feeSchema)); } catch { /* Optional malformed field remains unavailable. */ }
  }
  const result = { ...empty(tag, null), remainingBalance: number(data.remainingBalance), currency: currency(data.currency),
    validThrough: timestamp(details?.validThrough), weeklyCost: number(details?.cost7), monthlyCost: number(details?.cost30),
    fortnightlyCost: number(record(feeSchema?.installmentFees)?.cost14), months: positiveInteger(details?.months), paidInFull };
  if (paidInFull === true && result.remainingBalance !== null && result.remainingBalance > 0) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  if ([result.remainingBalance, result.validThrough, result.weeklyCost, result.monthlyCost, result.fortnightlyCost, paidInFull].every(item => item === null)) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
  requireMoneyCurrency(result);
  return result;
}

/** Queries only existing read APIs. It neither prepares nor executes an extension/payment. */
export async function readPayJoyCreditSnapshot(identifier: string): Promise<PayJoyCreditSnapshot> {
  const locator = typeof identifier === "string" ? identifier.trim().toUpperCase() : "";
  if (!TAG.test(locator) && !IMEI.test(locator)) throw new PayJoyCreditProviderError("INVALID_INPUT");
  let snapshot: PayJoyCreditSnapshot | null = null;
  try {
    if (isPayJoyRetailConfigured()) {
      try { snapshot = retailSnapshot(locator, await readPayJoyCreditRetailPayload(locator)); }
      catch (error) { if ((error as { code?: unknown })?.code !== "DEVICE_UNRESOLVED") throw error; }
    }
    let tag = snapshot?.deviceTag || (TAG.test(locator) ? locator : null);
    let imei = snapshot?.imei || (IMEI.test(locator) ? locator : null);
    if (!snapshot || !tag) {
      const stored = await findStoredPayJoyCreditDevice(locator);
      if (stored) {
        if ((tag && stored.deviceTag !== tag) || (imei && stored.imei !== imei)) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
        tag = stored.deviceTag; imei = stored.imei;
      }
    }
    if (!tag) {
      if (snapshot) {
        snapshot.warnings.push("PayJoy no informó el código del equipo; no fue posible complementar la consulta de saldo.");
        return snapshot;
      }
      throw new PayJoyCreditProviderError("DEVICE_UNRESOLVED");
    }
    let publicData: PayJoyCreditSnapshot;
    try { publicData = publicSnapshot(tag, await readPayJoyCreditPaymentPayload(tag)); }
    catch (error) {
      const problem = safeError(error);
      if (!snapshot || problem.code === "INVALID_RESPONSE") throw problem;
      snapshot.deviceTag = tag;
      snapshot.warnings.push("No se pudo complementar la consulta de saldo; se muestran únicamente los datos informados por la API Retail.");
      return snapshot;
    }
    if (!snapshot) {
      publicData.imei = imei;
      publicData.warnings.push("La consulta pública de saldo no proporciona el detalle del crédito ni su historial de pagos.");
      return publicData;
    }
    if (snapshot.currency && publicData.currency && snapshot.currency !== publicData.currency) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
    const combined: PayJoyCreditSnapshot = { ...snapshot, deviceTag: tag, imei, source: "RETAIL_AND_PAYMENT",
      remainingBalance: publicData.remainingBalance ?? snapshot.remainingBalance,
      currency: publicData.currency ?? snapshot.currency,
      validThrough: publicData.validThrough ?? snapshot.validThrough,
      paidInFull: publicData.paidInFull ?? snapshot.paidInFull,
      weeklyCost: publicData.weeklyCost ?? snapshot.weeklyCost,
      fortnightlyCost: publicData.fortnightlyCost,
      monthlyCost: publicData.monthlyCost ?? snapshot.monthlyCost,
      months: publicData.months ?? snapshot.months,
      warnings: [...new Set([...snapshot.warnings, ...publicData.warnings])],
    };
    if (combined.paidInFull === true && combined.remainingBalance !== null && combined.remainingBalance > 0) throw new PayJoyCreditProviderError("INVALID_RESPONSE");
    return combined;
  } catch (error) { throw safeError(error); }
}
