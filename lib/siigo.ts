type SiigoConfig = {
  apiBaseUrl: string;
  username: string;
  accessKey: string;
  partnerId: string;
  documentId: number;
  sellerId: number;
  paymentTypeId: number;
  itemCode: string | null;
  costCenterId: number | null;
  defaultCountryCode: string;
  defaultStateCode: string;
  defaultCityCode: string;
  defaultPostalCode: string | null;
  stampSend: boolean;
  mailSend: boolean;
  paymentDueDays: number;
  exemptItemLimit: number;
  maxInvoiceTotal: number;
};

type SiigoAuthConfig = Pick<
  SiigoConfig,
  "apiBaseUrl" | "username" | "accessKey" | "partnerId"
>;

type SiigoCustomerLookupResponse = {
  results?: Array<{
    id?: string;
    identification?: string;
    branch_office?: number;
    active?: boolean;
  }>;
};

type SiigoCustomer = NonNullable<SiigoCustomerLookupResponse["results"]>[number];

export type SiigoInvoiceResponse = {
  id?: string;
  name?: string;
  number?: number;
  status?: string;
  public_url?: string;
  document?: {
    id?: number;
    name?: string;
    number?: number;
  };
  metadata?: {
    created?: string;
  };
  [key: string]: unknown;
};

export type RegistroSiigoInput = {
  id: number;
  createdAt: Date | string;
  ciudad?: string | null;
  puntoVenta?: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  correo?: string | null;
  whatsapp?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  plataformaCredito: string;
  financierasDetalle?: unknown;
  creditoAutorizado?: unknown;
  cuotaInicial?: unknown;
  medioPago1Tipo?: string | null;
  medioPago1Valor?: unknown;
  medioPago2Tipo?: string | null;
  medioPago2Valor?: unknown;
  referenciaEquipo?: string | null;
  serialImei?: string | null;
  tipoEquipo?: string | null;
  sede?: {
    id: number;
    nombre: string;
    siigoEnabled: boolean;
    siigoInvoiceDocumentId?: number | null;
    siigoSellerId?: number | null;
    siigoPaymentTypeId?: number | null;
    siigoItemCode?: string | null;
    siigoCostCenterId?: number | null;
    siigoDefaultCountryCode?: string | null;
    siigoDefaultStateCode?: string | null;
    siigoDefaultCityCode?: string | null;
    siigoDefaultPostalCode?: string | null;
    siigoStampSend: boolean;
    siigoMailSend: boolean;
    siigoPaymentDueDays: number;
  } | null;
};

export class SiigoConfigurationError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`Falta configuracion de Siigo: ${missing.join(", ")}`);
    this.name = "SiigoConfigurationError";
    this.missing = missing;
  }
}

export class SiigoApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "SiigoApiError";
    this.status = status;
    this.details = details;
  }
}

class SiigoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiigoValidationError";
  }
}

let tokenCache:
  | {
      token: string;
      expiresAt: number;
    }
  | null = null;

function cleanBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeSiigoApiBaseUrl(value: string) {
  let url = cleanBaseUrl(value);

  if (url.endsWith("/v1/auth")) {
    url = url.slice(0, -"/auth".length);
  } else if (url.endsWith("/auth")) {
    url = url.slice(0, -"/auth".length);
  }

  if (!url.endsWith("/v1")) {
    url = `${url}/v1`;
  }

  return url;
}

function readRequiredText(name: string, missing: string[]) {
  const value = process.env[name]?.trim();

  if (!value) {
    missing.push(name);
    return "";
  }

  return value;
}

function toPositiveInt(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toNonNegativeInt(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function readMoney(name: string, fallback: number) {
  const number = Number(
    String(process.env[name] || "")
      .replace(/[^\d.]/g, "")
      .trim()
  );

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toNullableText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function requireSedeNumber(
  value: unknown,
  label: string,
  missing: string[]
) {
  const number = toPositiveInt(value);

  if (number === null) {
    missing.push(label);
    return 0;
  }

  return number;
}

function requireConfigText(value: unknown, label: string, missing: string[]) {
  const text = toNullableText(value);

  if (!text) {
    missing.push(label);
    return "";
  }

  return text;
}

function getSiigoAuthConfig(): SiigoAuthConfig {
  const missing: string[] = [];
  const apiBaseUrl =
    process.env.SIIGO_API_BASE_URL?.trim() || "https://api.siigo.com/v1";
  const username = readRequiredText("SIIGO_USERNAME", missing);
  const accessKey = readRequiredText("SIIGO_ACCESS_KEY", missing);
  const partnerId = readRequiredText("SIIGO_PARTNER_ID", missing);

  if (missing.length > 0) {
    throw new SiigoConfigurationError(missing);
  }

  return {
    apiBaseUrl: normalizeSiigoApiBaseUrl(apiBaseUrl),
    username,
    accessKey,
    partnerId,
  };
}

function getSiigoConfig(registro: RegistroSiigoInput): SiigoConfig {
  const authConfig = getSiigoAuthConfig();
  const missing: string[] = [];
  const sede = registro.sede;
  const sedeLabel = sede?.nombre ? `sede ${sede.nombre}` : "sede del registro";

  if (!sede?.siigoEnabled) {
    missing.push(`activar Siigo en ${sedeLabel}`);
  }

  const documentId = requireSedeNumber(
    sede?.siigoInvoiceDocumentId,
    `resolucion/documento Siigo de ${sedeLabel}`,
    missing
  );
  const sellerId = requireSedeNumber(
    sede?.siigoSellerId,
    `vendedor Siigo de ${sedeLabel}`,
    missing
  );
  const paymentTypeId = requireSedeNumber(
    sede?.siigoPaymentTypeId,
    `forma de pago Siigo de ${sedeLabel}`,
    missing
  );
  const defaultStateCode = requireConfigText(
    sede?.siigoDefaultStateCode ?? process.env.SIIGO_DEFAULT_STATE_CODE,
    `departamento Siigo de ${sedeLabel}`,
    missing
  );
  const defaultCityCode = requireConfigText(
    sede?.siigoDefaultCityCode ?? process.env.SIIGO_DEFAULT_CITY_CODE,
    `ciudad Siigo de ${sedeLabel}`,
    missing
  );

  if (missing.length > 0) {
    throw new SiigoConfigurationError(missing);
  }

  return {
    ...authConfig,
    documentId,
    sellerId,
    paymentTypeId,
    itemCode:
      toNullableText(sede?.siigoItemCode) ||
      process.env.SIIGO_ITEM_CODE?.trim() ||
      null,
    costCenterId: toPositiveInt(sede?.siigoCostCenterId),
    defaultCountryCode:
      toNullableText(sede?.siigoDefaultCountryCode) ||
      process.env.SIIGO_DEFAULT_COUNTRY_CODE?.trim() ||
      "CO",
    defaultStateCode,
    defaultCityCode,
    defaultPostalCode:
      toNullableText(sede?.siigoDefaultPostalCode) ||
      process.env.SIIGO_DEFAULT_POSTAL_CODE?.trim() ||
      null,
    stampSend: Boolean(sede?.siigoStampSend),
    mailSend: Boolean(sede?.siigoMailSend),
    paymentDueDays: toNonNegativeInt(sede?.siigoPaymentDueDays) ?? 0,
    exemptItemLimit: readMoney("SIIGO_EXEMPT_ITEM_LIMIT", 1150000),
    maxInvoiceTotal: readMoney("SIIGO_MAX_INVOICE_TOTAL", 2500000),
  };
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function stringifySiigoDetails(details: unknown) {
  if (!details) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  if (typeof details === "object") {
    const detailRecord = details as Record<string, unknown>;
    const directMessage =
      detailRecord.message ||
      detailRecord.error ||
      detailRecord.detail ||
      detailRecord.title;

    if (directMessage) {
      return String(directMessage);
    }
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

async function authenticate(config: SiigoAuthConfig) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const response = await fetch(`${config.apiBaseUrl}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Partner-Id": config.partnerId,
    },
    body: JSON.stringify({
      username: config.username,
      access_key: config.accessKey,
    }),
  });

  const data = (await readJsonSafely(response)) as
    | {
        access_token?: string;
        expires_in?: number;
        token_type?: string;
      }
    | null;

  if (!response.ok || !data?.access_token) {
    throw new SiigoApiError(
      `Siigo rechazo la autenticacion (${response.status})`,
      response.status,
      data
    );
  }

  const tokenType = data.token_type || "Bearer";
  const expiresIn = Number(data.expires_in || 86400);

  tokenCache = {
    token: `${tokenType} ${data.access_token}`,
    expiresAt: Date.now() + Math.max(expiresIn - 300, 60) * 1000,
  };

  return tokenCache.token;
}

async function siigoFetch<T>(
  config: SiigoAuthConfig,
  path: string,
  init: RequestInit,
  options?: { idempotencyKey?: string; retryAuth?: boolean }
): Promise<T> {
  const token = await authenticate(config);
  const headers = new Headers(init.headers);

  headers.set("Authorization", token);
  headers.set("Partner-Id", config.partnerId);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options?.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  const data = await readJsonSafely(response);

  if (response.status === 401 && options?.retryAuth !== false) {
    tokenCache = null;
    return siigoFetch<T>(config, path, init, {
      ...options,
      retryAuth: false,
    });
  }

  if (!response.ok) {
    const detailMessage = stringifySiigoDetails(data);
    throw new SiigoApiError(
      detailMessage
        ? `Siigo respondio ${response.status}: ${detailMessage}`
        : `Siigo respondio ${response.status}`,
      response.status,
      data
    );
  }

  return data as T;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isContado(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .startsWith("CONTADO");
}

function calculateInvoiceTotal(registro: RegistroSiigoInput) {
  const pago1 = toNumber(registro.medioPago1Valor);
  const pago2 = toNumber(registro.medioPago2Valor);

  if (isContado(registro.plataformaCredito) && pago1 + pago2 > 0) {
    return roundMoney(pago1 + pago2);
  }

  const detalle = Array.isArray(registro.financierasDetalle)
    ? registro.financierasDetalle
    : [];
  const totalDetalle = detalle.reduce((total, item) => {
    if (!item || typeof item !== "object") {
      return total;
    }

    const row = item as Record<string, unknown>;
    return total + toNumber(row.creditoAutorizado) + toNumber(row.cuotaInicial);
  }, 0);

  if (totalDetalle > 0) {
    return roundMoney(totalDetalle);
  }

  const totalBase =
    toNumber(registro.creditoAutorizado) + toNumber(registro.cuotaInicial);

  if (totalBase > 0) {
    return roundMoney(totalBase);
  }

  return roundMoney(pago1 + pago2);
}

function normalizeIdentification(value: unknown) {
  return String(value || "")
    .replace(/[^\dA-Za-z]/g, "")
    .trim();
}

function resolveSiigoIdType(tipoDocumento: unknown) {
  const tipo = String(tipoDocumento || "").trim().toUpperCase();

  if (tipo === "CE") {
    return "22";
  }

  if (tipo === "PPT") {
    return "48";
  }

  return "13";
}

function splitPersonName(value: unknown) {
  const parts = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length === 0) {
    return ["Cliente", "Conectamos"];
  }

  if (parts.length === 1) {
    return [parts[0].slice(0, 100), ""];
  }

  const firstName = parts.slice(0, Math.max(1, parts.length - 2)).join(" ");
  const lastName = parts.slice(Math.max(1, parts.length - 2)).join(" ");

  return [firstName.slice(0, 100), lastName.slice(0, 100)];
}

function formatBogotaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildCustomerPayload(
  registro: RegistroSiigoInput,
  config: SiigoConfig,
  existingCustomer: SiigoCustomer | null
): Record<string, unknown> {
  const identification = normalizeIdentification(registro.documentoNumero);

  if (existingCustomer) {
    return {
      identification,
      branch_office: existingCustomer.branch_office ?? 0,
    };
  }

  const [firstName, lastName] = splitPersonName(registro.clienteNombre);
  const phone = normalizeIdentification(registro.whatsapp).slice(0, 10);
  const email = String(registro.correo || "").trim().toLowerCase();
  const address = [registro.direccion, registro.barrio]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" - ");

  return {
    type: "Customer",
    person_type: "Person",
    id_type: resolveSiigoIdType(registro.tipoDocumento),
    identification,
    branch_office: 0,
    name: [firstName, lastName],
    active: true,
    vat_responsible: false,
    fiscal_responsibilities: [
      {
        code: "R-99-PN",
        name: "Not responsible",
      },
    ],
    address: {
      address: (address || "Direccion no registrada").slice(0, 256),
      city: {
        country_code: config.defaultCountryCode,
        state_code: config.defaultStateCode,
        city_code: config.defaultCityCode,
      },
      ...(config.defaultPostalCode
        ? { postal_code: config.defaultPostalCode }
        : {}),
    },
    ...(phone
      ? {
          phones: [
            {
              indicative: "57",
              number: phone,
            },
          ],
        }
      : {}),
    ...(email
      ? {
          contacts: [
            {
              first_name: firstName,
              last_name: lastName,
              email,
              ...(phone
                ? {
                    phone: {
                      indicative: "57",
                      number: phone,
                    },
                  }
                : {}),
            },
          ],
        }
      : {}),
  };
}

function buildObservations(registro: RegistroSiigoInput) {
  return [
    `Registro CONECTAMOS #${registro.id}`,
    registro.puntoVenta ? `Sede/punto: ${registro.puntoVenta}` : null,
    registro.referenciaEquipo ? `Referencia: ${registro.referenciaEquipo}` : null,
    registro.serialImei ? `IMEI: ${registro.serialImei}` : null,
    registro.plataformaCredito
      ? `Forma comercial: ${registro.plataformaCredito}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 4000);
}

async function findCustomerByIdentification(
  config: SiigoConfig,
  identification: string
) {
  const params = new URLSearchParams({
    identification,
    branch_office: "0",
    active: "true",
    type: "Customer",
    page: "1",
    page_size: "1",
  });
  const response = await siigoFetch<SiigoCustomerLookupResponse>(
    config,
    `/customers?${params.toString()}`,
    {
      method: "GET",
    }
  );

  return response.results?.[0] ?? null;
}

function resolveItemCode(registro: RegistroSiigoInput, config: SiigoConfig) {
  return (
    config.itemCode ||
    String(registro.referenciaEquipo || registro.serialImei || "").trim()
  );
}

function buildInvoiceItems(
  registro: RegistroSiigoInput,
  config: SiigoConfig,
  total: number
) {
  const itemCode = resolveItemCode(registro, config);

  if (!itemCode) {
    throw new SiigoValidationError(
      "No hay codigo de producto para Siigo. Configura SIIGO_ITEM_CODE o registra una referencia."
    );
  }

  const baseDescription = [
    registro.referenciaEquipo || "Equipo CONECTAMOS",
    registro.serialImei ? `IMEI ${registro.serialImei}` : null,
  ]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 450);
  const limit = config.exemptItemLimit;
  const roundedTotal = Math.round(total);
  const itemCount = Math.max(1, Math.ceil(roundedTotal / limit));
  const baseValue = Math.floor(roundedTotal / itemCount);
  let remainingValue = roundedTotal;
  const chunks = Array.from({ length: itemCount }, (_, index) => {
    const isLast = index === itemCount - 1;
    const value = isLast ? remainingValue : baseValue;
    remainingValue -= value;
    return value;
  });

  return chunks.map((price, index) => ({
    code: itemCode,
    description:
      chunks.length > 1
        ? `${baseDescription} - Parte ${index + 1} de ${chunks.length}`
        : baseDescription,
    quantity: 1,
    price,
    taxes: [],
  }));
}

function buildInvoicePayload(
  registro: RegistroSiigoInput,
  config: SiigoConfig,
  existingCustomer: SiigoCustomer | null
) {
  const identification = normalizeIdentification(registro.documentoNumero);
  const total = calculateInvoiceTotal(registro);
  const today = new Date();

  if (!identification) {
    throw new SiigoValidationError("El registro no tiene identificacion valida");
  }

  if (total <= 0) {
    throw new SiigoValidationError(
      "No se pudo calcular un valor positivo para la factura"
    );
  }

  if (total > config.maxInvoiceTotal) {
    throw new SiigoValidationError(
      `La venta supera el valor maximo permitido para facturar en Siigo (${config.maxInvoiceTotal.toLocaleString("es-CO")})`
    );
  }

  return {
    document: {
      id: config.documentId,
    },
    date: formatBogotaDate(today),
    customer: buildCustomerPayload(registro, config, existingCustomer),
    ...(config.costCenterId ? { cost_center: config.costCenterId } : {}),
    seller: config.sellerId,
    observations: buildObservations(registro),
    items: buildInvoiceItems(registro, config, total),
    payments: [
      {
        id: config.paymentTypeId,
        value: total,
        due_date: formatBogotaDate(addDays(today, config.paymentDueDays)),
      },
    ],
    stamp: {
      send: config.stampSend,
    },
    mail: {
      send: config.mailSend,
    },
  };
}

export function getSiigoInvoiceLabel(invoice: SiigoInvoiceResponse) {
  return (
    invoice.name ||
    invoice.document?.name ||
    (typeof invoice.number === "number" ? String(invoice.number) : null) ||
    (typeof invoice.document?.number === "number"
      ? String(invoice.document.number)
      : null) ||
    invoice.id ||
    null
  );
}

export function getSiigoErrorMessage(error: unknown) {
  if (error instanceof SiigoConfigurationError) {
    return error.message;
  }

  if (error instanceof SiigoApiError) {
    return error.message;
  }

  if (error instanceof SiigoValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido enviando factura a Siigo";
}

export function getSiigoErrorStatus(error: unknown) {
  if (error instanceof SiigoConfigurationError) {
    return 400;
  }

  if (error instanceof SiigoValidationError) {
    return 400;
  }

  if (error instanceof SiigoApiError) {
    return 502;
  }

  return 500;
}

export async function createSiigoInvoiceForRegistro(
  registro: RegistroSiigoInput
) {
  const config = getSiigoConfig(registro);
  const identification = normalizeIdentification(registro.documentoNumero);
  const existingCustomer = await findCustomerByIdentification(
    config,
    identification
  );
  const payload = buildInvoicePayload(registro, config, existingCustomer);

  return siigoFetch<SiigoInvoiceResponse>(
    config,
    "/invoices",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      idempotencyKey: `CONECTAMOS${registro.id}`.slice(0, 30),
    }
  );
}

export async function getSiigoSetupCatalogs() {
  const config = getSiigoAuthConfig();

  const [documentTypes, users, paymentTypes, products] = await Promise.all([
    siigoFetch<unknown>(config, "/document-types?type=FV", {
      method: "GET",
    }),
    siigoFetch<unknown>(config, "/users", {
      method: "GET",
    }),
    siigoFetch<unknown>(config, "/payment-types?document_type=FV", {
      method: "GET",
    }),
    siigoFetch<unknown>(config, "/products?page=1&page_size=100", {
      method: "GET",
    }),
  ]);

  return {
    documentTypes,
    users,
    paymentTypes,
    products,
  };
}
