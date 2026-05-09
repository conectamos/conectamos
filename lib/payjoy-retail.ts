import { getPayJoyPaymentSnapshot } from "@/lib/payjoy";

const PAYJOY_RETAIL_API_BASE_URL =
  process.env.PAYJOY_RETAIL_API_BASE_URL || "https://partner.payjoy.com/v1";
const DEFAULT_LOOKBACK_DAYS = 450;

type PayJoyAmount = string | number | null | undefined;
type PayJoyFinanceOrder = {
  id?: string | number | null;
  financeAmount?: PayJoyAmount;
  downPayment?: PayJoyAmount;
  monthlyCost?: PayJoyAmount;
  months?: string | number | null;
  purchaseAmount?: PayJoyAmount;
  currency?: string | null;
  weeklyCost?: PayJoyAmount;
  [key: string]: unknown;
};
type PayJoyPaymentOption = {
  amount?: PayJoyAmount;
  type?: string | null;
  [key: string]: unknown;
};
type PayJoyDevice = {
  imei?: string | null;
  deviceTag?: string | null;
  [key: string]: unknown;
};

type PayJoyCustomerLookupResponse = {
  valid?: boolean;
  message?: string;
  financeOrder?: PayJoyFinanceOrder | null;
  paymentOptions?: PayJoyPaymentOption[] | null;
  device?: PayJoyDevice | null;
};

type PayJoyTransactionResponse = {
  valid?: boolean;
  message?: string;
  transactions?: Array<{
    type?: string | null;
    time?: string | number | null;
    amount?: PayJoyAmount;
    currency?: string | null;
    financeOrder?: PayJoyFinanceOrder | null;
    device?: PayJoyDevice | null;
  }>;
};

export type PayJoyCreditoImei = {
  imei: string;
  creditoAutorizado: number;
  moneda: string | null;
  ordenId: string | null;
  deviceTag: string | null;
  enganche: number | null;
  valorCuota: number | null;
  numeroCuotas: number | null;
  frecuenciaCuota: "CATORCENAL" | null;
  valorCompra: number | null;
  origen: "lookup-customer" | "list-transactions";
};

export class PayJoyRetailConfigError extends Error {
  constructor() {
    super("Falta configurar la clave API de PayJoy en el servidor.");
    this.name = "PayJoyRetailConfigError";
  }
}

export class PayJoyRetailLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayJoyRetailLookupError";
  }
}

function getApiKey() {
  const key = getConfiguredApiKey();

  if (!key) {
    throw new PayJoyRetailConfigError();
  }

  return key;
}

export function getConfiguredApiKey() {
  return (
    process.env.PAYJOY_RETAIL_API_KEY ||
    process.env.PAYJOY_PARTNER_API_KEY ||
    process.env.PAYJOY_API_KEY ||
    ""
  ).trim();
}

export function isPayJoyRetailConfigured() {
  return getConfiguredApiKey().length > 0;
}

function normalizeImei(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizeDeviceTag(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function parseAmount(value: PayJoyAmount) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let raw = String(value ?? "")
    .replace(/[^\d.,-]/g, "")
    .trim();

  if (!raw) {
    return null;
  }

  if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",") && raw.includes(".")) {
    raw =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInteger(value: string | number | null | undefined) {
  const normalized =
    typeof value === "string" ? value.match(/\d+/)?.[0] : value;
  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getFinanceOrderAmount(
  financeOrder: PayJoyFinanceOrder | null | undefined,
  keys: string[]
) {
  if (!financeOrder) {
    return null;
  }

  for (const key of keys) {
    const amount = parseAmount(financeOrder[key] as PayJoyAmount);

    if (amount !== null) {
      return amount;
    }
  }

  return null;
}

function getFinanceOrderInteger(
  financeOrder: PayJoyFinanceOrder | null | undefined,
  keys: string[]
) {
  if (!financeOrder) {
    return null;
  }

  for (const key of keys) {
    const value = parsePositiveInteger(
      financeOrder[key] as string | number | null | undefined
    );

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function looksLikeDeviceTag(value: unknown) {
  return /^D[A-Z0-9]{5,}$/.test(normalizeDeviceTag(value));
}

function findDeviceTagInPayload(value: unknown, seen = new Set<unknown>()): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    const candidate = normalizeDeviceTag(value);
    return looksLikeDeviceTag(candidate) ? candidate : null;
  }

  if (typeof value !== "object" || seen.has(value)) {
    return null;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findDeviceTagInPayload(item, seen);

      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.deviceTag,
    record.device_tag,
    record.tag,
    record.device,
    record.deviceId,
    record.device_id,
  ];

  for (const candidate of candidates) {
    const deviceTag = normalizeDeviceTag(candidate);

    if (looksLikeDeviceTag(deviceTag)) {
      return deviceTag;
    }
  }

  for (const item of Object.values(record)) {
    const candidate = findDeviceTagInPayload(item, seen);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getDeviceTag(...sources: unknown[]) {
  for (const source of sources) {
    const candidate = findDeviceTagInPayload(source);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getPaymentOptionAmount(
  paymentOptions: PayJoyPaymentOption[] | null | undefined,
  types: string[]
) {
  const normalizedTypes = types.map((item) => item.toLowerCase());
  const option = paymentOptions?.find(
    (item) =>
      normalizedTypes.includes(String(item.type || "").trim().toLowerCase())
  );

  return (
    parseAmount(option?.amount) ??
    parseAmount(option?.cost as PayJoyAmount) ??
    parseAmount(option?.payment as PayJoyAmount) ??
    parseAmount(option?.price as PayJoyAmount)
  );
}

function resolveInstallmentInfo(
  financeOrder: PayJoyFinanceOrder | null | undefined,
  paymentOptions?: PayJoyPaymentOption[] | null
) {
  const directCatorcenalCost = getFinanceOrderAmount(financeOrder, [
    "biweeklyCost",
    "biWeeklyCost",
    "biweeklyPayment",
    "biWeeklyPayment",
    "fortnightlyCost",
    "fortnightlyPayment",
    "catorcenalCost",
    "catorcenalPayment",
  ]) ?? getPaymentOptionAmount(paymentOptions, [
    "biweekly",
    "bi-weekly",
    "fortnightly",
    "catorcenal",
  ]);
  const monthlyCost =
    getFinanceOrderAmount(financeOrder, [
      "monthlyCost",
      "monthlyPayment",
      "monthCost",
      "monthPayment",
    ]) ?? getPaymentOptionAmount(paymentOptions, ["month", "monthly"]);
  const weeklyCost =
    getFinanceOrderAmount(financeOrder, [
      "weeklyCost",
      "weeklyPayment",
      "weekCost",
      "weekPayment",
    ]) ?? getPaymentOptionAmount(paymentOptions, ["week", "weekly"]);
  const months = getFinanceOrderInteger(financeOrder, [
    "months",
    "termMonths",
    "term_months",
    "durationMonths",
    "loanMonths",
    "tenorMonths",
    "plazoMeses",
  ]);
  const installments = getFinanceOrderInteger(financeOrder, [
    "numberOfPayments",
    "paymentCount",
    "installments",
    "installmentCount",
    "cuotas",
  ]);
  const catorcenalCost =
    directCatorcenalCost !== null && directCatorcenalCost > 0
      ? roundCurrency(directCatorcenalCost)
      : monthlyCost !== null && monthlyCost > 0
      ? roundCurrency(monthlyCost / 2)
      : weeklyCost !== null && weeklyCost > 0
        ? roundCurrency(weeklyCost * 2)
        : null;
  const numeroCuotas = months !== null ? months * 2 : installments;

  if (financeOrder || catorcenalCost !== null || numeroCuotas !== null) {
    return {
      valorCuota: catorcenalCost,
      numeroCuotas,
      frecuenciaCuota: "CATORCENAL" as const,
    };
  }

  return {
    valorCuota: null,
    numeroCuotas: null,
    frecuenciaCuota: null,
  };
}

function getLookbackDays() {
  const configured = Number(process.env.PAYJOY_RETAIL_LOOKBACK_DAYS);

  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_LOOKBACK_DAYS;
}

function getUnixNow() {
  return Math.floor(Date.now() / 1000);
}

async function fetchPayJoy<T>(
  endpoint: string,
  params: Record<string, string | number>
) {
  const url = new URL(`${PAYJOY_RETAIL_API_BASE_URL}/${endpoint}`);

  url.searchParams.set("key", getApiKey());

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    cache: "no-store",
  });

  const text = await response.text();
  let data: T & { message?: string; valid?: boolean };

  try {
    data = text
      ? (JSON.parse(text) as T & { message?: string; valid?: boolean })
      : ({} as T & { message?: string; valid?: boolean });
  } catch {
    throw new PayJoyRetailLookupError("PayJoy devolvio una respuesta no valida.");
  }

  if (!response.ok) {
    throw new PayJoyRetailLookupError(
      data.message || `PayJoy respondio con estado ${response.status}.`
    );
  }

  return data;
}

async function completeWithPaymentSnapshot(
  credito: PayJoyCreditoImei,
  deviceTag: string | null
) {
  if (!deviceTag) {
    return credito;
  }

  if (
    credito.valorCuota !== null &&
    credito.numeroCuotas !== null
  ) {
    return credito;
  }

  try {
    const snapshot = await getPayJoyPaymentSnapshot(deviceTag);

    return {
      ...credito,
      deviceTag,
      valorCuota: snapshot.cost14 ?? credito.valorCuota,
      numeroCuotas:
        credito.numeroCuotas ??
        (snapshot.months === null ? null : snapshot.months * 2),
      frecuenciaCuota: "CATORCENAL" as const,
    };
  } catch {
    return credito;
  }
}

async function buildCreditoFromFinanceOrder(
  imei: string,
  financeOrder: PayJoyCustomerLookupResponse["financeOrder"],
  source: PayJoyCreditoImei["origen"],
  currency?: string | null,
  paymentOptions?: PayJoyPaymentOption[] | null,
  device?: PayJoyDevice | null,
  ...deviceSources: unknown[]
): Promise<PayJoyCreditoImei | null> {
  const creditoAutorizado = parseAmount(financeOrder?.financeAmount);

  if (creditoAutorizado === null) {
    return null;
  }
  const installment = resolveInstallmentInfo(financeOrder, paymentOptions);
  const deviceTag = getDeviceTag(device, financeOrder, ...deviceSources);

  return completeWithPaymentSnapshot({
    imei,
    creditoAutorizado,
    moneda: financeOrder?.currency || currency || null,
    ordenId:
      financeOrder?.id === null || financeOrder?.id === undefined
        ? null
        : String(financeOrder.id),
    deviceTag,
    enganche: parseAmount(financeOrder?.downPayment),
    valorCuota: installment.valorCuota,
    numeroCuotas: installment.numeroCuotas,
    frecuenciaCuota: installment.frecuenciaCuota,
    valorCompra: parseAmount(financeOrder?.purchaseAmount),
    origen: source,
  }, deviceTag);
}

async function lookupCustomerFinanceByImei(imei: string) {
  const data = await fetchPayJoy<PayJoyCustomerLookupResponse>(
    "lookup-customer.php",
    {
      customerLocator: imei,
      fields: "device.description",
    }
  );

  if (!data.valid || !data.financeOrder) {
    return null;
  }

  return buildCreditoFromFinanceOrder(
    imei,
    data.financeOrder,
    "lookup-customer",
    data.financeOrder.currency,
    data.paymentOptions,
    data.device,
    data
  );
}

async function lookupTransactionFinanceByImei(imei: string) {
  const endtime = getUnixNow();
  const starttime = endtime - getLookbackDays() * 86_400;
  const data = await fetchPayJoy<PayJoyTransactionResponse>(
    "list-transactions.php",
    {
      starttime,
      endtime,
      filter: `device.imei:${imei}`,
    }
  );

  if (!data.valid || !Array.isArray(data.transactions)) {
    return null;
  }

  const transaction = data.transactions
    .filter((item) => {
      const type = String(item.type || "").trim().toLowerCase();
      return type === "finance" && normalizeImei(item.device?.imei) === imei;
    })
    .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))[0];

  if (!transaction) {
    return null;
  }

  const fromFinanceOrder = await buildCreditoFromFinanceOrder(
    imei,
    transaction.financeOrder,
    "list-transactions",
    transaction.currency,
    null,
    transaction.device,
    transaction
  );

  if (fromFinanceOrder) {
    return fromFinanceOrder;
  }

  const amount = parseAmount(transaction.amount);

  if (amount === null) {
    return null;
  }
  const installment = resolveInstallmentInfo(transaction.financeOrder);
  const deviceTag = getDeviceTag(transaction.device, transaction.financeOrder, transaction);

  return completeWithPaymentSnapshot({
    imei,
    creditoAutorizado: amount,
    moneda: transaction.currency || null,
    ordenId:
      transaction.financeOrder?.id === null ||
      transaction.financeOrder?.id === undefined
        ? null
        : String(transaction.financeOrder.id),
    deviceTag,
    enganche: parseAmount(transaction.financeOrder?.downPayment),
    valorCuota: installment.valorCuota,
    numeroCuotas: installment.numeroCuotas,
    frecuenciaCuota: installment.frecuenciaCuota,
    valorCompra: parseAmount(transaction.financeOrder?.purchaseAmount),
    origen: "list-transactions",
  } satisfies PayJoyCreditoImei, deviceTag);
}

function needsPaymentDetails(credito: PayJoyCreditoImei) {
  return credito.valorCuota === null || credito.numeroCuotas === null;
}

function mergeCreditoDetails(
  primary: PayJoyCreditoImei,
  fallback: PayJoyCreditoImei | null
) {
  if (!fallback) {
    return primary;
  }

  return {
    ...primary,
    deviceTag: primary.deviceTag ?? fallback.deviceTag,
    enganche: primary.enganche ?? fallback.enganche,
    valorCuota: primary.valorCuota ?? fallback.valorCuota,
    numeroCuotas: primary.numeroCuotas ?? fallback.numeroCuotas,
    frecuenciaCuota: primary.frecuenciaCuota ?? fallback.frecuenciaCuota,
    valorCompra: primary.valorCompra ?? fallback.valorCompra,
  };
}

export async function obtenerCreditoPayJoyPorImei(imeiValue: string) {
  const imei = normalizeImei(imeiValue);

  if (!imei) {
    throw new PayJoyRetailLookupError("El IMEI es obligatorio para consultar PayJoy.");
  }

  const customerResult = await lookupCustomerFinanceByImei(imei);

  if (customerResult && !needsPaymentDetails(customerResult)) {
    return customerResult;
  }

  try {
    const transactionResult = await lookupTransactionFinanceByImei(imei);

    return customerResult
      ? mergeCreditoDetails(customerResult, transactionResult)
      : transactionResult;
  } catch (error) {
    if (customerResult) {
      return customerResult;
    }

    throw error;
  }
}
