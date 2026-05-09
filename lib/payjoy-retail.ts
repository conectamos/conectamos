const PAYJOY_RETAIL_API_BASE_URL =
  process.env.PAYJOY_RETAIL_API_BASE_URL || "https://partner.payjoy.com/v1";
const DEFAULT_LOOKBACK_DAYS = 450;

type PayJoyAmount = string | number | null | undefined;

type PayJoyCustomerLookupResponse = {
  valid?: boolean;
  message?: string;
  financeOrder?: {
    id?: string | number | null;
    financeAmount?: PayJoyAmount;
    downPayment?: PayJoyAmount;
    purchaseAmount?: PayJoyAmount;
    currency?: string | null;
  } | null;
  device?: {
    imei?: string | null;
  } | null;
};

type PayJoyTransactionResponse = {
  valid?: boolean;
  message?: string;
  transactions?: Array<{
    type?: string | null;
    time?: string | number | null;
    amount?: PayJoyAmount;
    currency?: string | null;
    financeOrder?: {
      id?: string | number | null;
      financeAmount?: PayJoyAmount;
      downPayment?: PayJoyAmount;
      purchaseAmount?: PayJoyAmount;
    } | null;
    device?: {
      imei?: string | null;
    } | null;
  }>;
};

export type PayJoyCreditoImei = {
  imei: string;
  creditoAutorizado: number;
  moneda: string | null;
  ordenId: string | null;
  enganche: number | null;
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
  const key =
    process.env.PAYJOY_RETAIL_API_KEY ||
    process.env.PAYJOY_PARTNER_API_KEY ||
    process.env.PAYJOY_API_KEY ||
    "";

  if (!key.trim()) {
    throw new PayJoyRetailConfigError();
  }

  return key.trim();
}

function normalizeImei(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim();
}

function parseAmount(value: PayJoyAmount) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
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

function buildCreditoFromFinanceOrder(
  imei: string,
  financeOrder: PayJoyCustomerLookupResponse["financeOrder"],
  source: PayJoyCreditoImei["origen"],
  currency?: string | null
): PayJoyCreditoImei | null {
  const creditoAutorizado = parseAmount(financeOrder?.financeAmount);

  if (creditoAutorizado === null) {
    return null;
  }

  return {
    imei,
    creditoAutorizado,
    moneda: financeOrder?.currency || currency || null,
    ordenId:
      financeOrder?.id === null || financeOrder?.id === undefined
        ? null
        : String(financeOrder.id),
    enganche: parseAmount(financeOrder?.downPayment),
    valorCompra: parseAmount(financeOrder?.purchaseAmount),
    origen: source,
  };
}

async function lookupCustomerFinanceByImei(imei: string) {
  const data = await fetchPayJoy<PayJoyCustomerLookupResponse>(
    "lookup-customer.php",
    {
      customerLocator: imei,
    }
  );

  if (!data.valid || !data.financeOrder) {
    return null;
  }

  return buildCreditoFromFinanceOrder(
    imei,
    data.financeOrder,
    "lookup-customer",
    data.financeOrder.currency
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

  const fromFinanceOrder = buildCreditoFromFinanceOrder(
    imei,
    transaction.financeOrder,
    "list-transactions",
    transaction.currency
  );

  if (fromFinanceOrder) {
    return fromFinanceOrder;
  }

  const amount = parseAmount(transaction.amount);

  if (amount === null) {
    return null;
  }

  return {
    imei,
    creditoAutorizado: amount,
    moneda: transaction.currency || null,
    ordenId:
      transaction.financeOrder?.id === null ||
      transaction.financeOrder?.id === undefined
        ? null
        : String(transaction.financeOrder.id),
    enganche: parseAmount(transaction.financeOrder?.downPayment),
    valorCompra: parseAmount(transaction.financeOrder?.purchaseAmount),
    origen: "list-transactions",
  } satisfies PayJoyCreditoImei;
}

export async function obtenerCreditoPayJoyPorImei(imeiValue: string) {
  const imei = normalizeImei(imeiValue);

  if (!imei) {
    throw new PayJoyRetailLookupError("El IMEI es obligatorio para consultar PayJoy.");
  }

  const customerResult = await lookupCustomerFinanceByImei(imei);

  if (customerResult) {
    return customerResult;
  }

  return lookupTransactionFinanceByImei(imei);
}
