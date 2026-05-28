type SiigoConfig = {
  apiBaseUrl: string;
  authUrl: string;
  username: string;
  accessKey: string;
  partnerId: string;
  documentId: number;
  sendDocumentNumber: boolean;
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
  "apiBaseUrl" | "authUrl" | "username" | "accessKey" | "partnerId"
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

type SiigoInvoiceLookupResponse = {
  results?: Array<{
    id?: string;
    name?: string;
    number?: number;
    document?: {
      id?: number;
      name?: string;
      number?: number;
    };
  }>;
};

type SiigoDocumentType = {
  id?: number;
  code?: string;
  consecutive?: number;
  automatic_number?: boolean;
  active?: boolean;
};

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

export type SiigoCreditNoteResponse = SiigoInvoiceResponse;

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
  siigoCreditNoteId?: string | null;
  siigoCreditNoteCreatedAt?: Date | string | null;
  sede?: {
    id: number;
    nombre: string;
    codigo?: string | null;
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

function normalizeSiigoAuthUrl(rawBaseUrl: string, apiBaseUrl: string) {
  const explicitAuthUrl = process.env.SIIGO_AUTH_URL?.trim();

  if (explicitAuthUrl) {
    return cleanBaseUrl(explicitAuthUrl);
  }

  const rawUrl = cleanBaseUrl(rawBaseUrl);

  if (rawUrl.endsWith("/v1/auth")) {
    return `${rawUrl.slice(0, -"/v1/auth".length)}/auth`;
  }

  if (rawUrl.endsWith("/auth")) {
    return rawUrl;
  }

  const rootUrl = apiBaseUrl.endsWith("/v1")
    ? apiBaseUrl.slice(0, -"/v1".length)
    : apiBaseUrl;

  return `${rootUrl}/auth`;
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
  const rawApiBaseUrl =
    process.env.SIIGO_API_BASE_URL?.trim() || "https://api.siigo.com/v1";
  const apiBaseUrl = normalizeSiigoApiBaseUrl(rawApiBaseUrl);
  const username = readRequiredText("SIIGO_USERNAME", missing);
  const accessKey = readRequiredText("SIIGO_ACCESS_KEY", missing);
  const partnerId = readRequiredText("SIIGO_PARTNER_ID", missing);

  if (missing.length > 0) {
    throw new SiigoConfigurationError(missing);
  }

  return {
    apiBaseUrl,
    authUrl: normalizeSiigoAuthUrl(rawApiBaseUrl, apiBaseUrl),
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
    sendDocumentNumber:
      process.env.SIIGO_SEND_DOCUMENT_NUMBER?.trim().toLowerCase() !== "false",
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
    const errors = detailRecord.Errors;

    if (Array.isArray(errors)) {
      const messages = errors
        .map((item) => {
          if (!item || typeof item !== "object") {
            return "";
          }

          const errorItem = item as Record<string, unknown>;
          const code = String(errorItem.Code || "").trim();
          const message = String(errorItem.Message || "").trim();
          const detail = String(errorItem.Detail || "").trim();

          if (code === "invalid_dian_resolution") {
            return "La resolucion DIAN del documento de esta sede esta vencida o ya agoto el rango autorizado. Renueva la resolucion en Siigo/DIAN o configura otro documento vigente para la sede.";
          }

          return [code, message, detail].filter(Boolean).join(": ");
        })
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join(" | ");
      }
    }

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

  const response = await fetch(config.authUrl, {
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

function getSiigoIdentificationData(tipoDocumento: unknown, value: unknown) {
  const tipo = String(tipoDocumento || "").trim().toUpperCase();
  const raw = String(value || "").trim();

  if (tipo === "NIT") {
    const nitWithDv = raw.match(/^(.+)-([0-9])$/);

    if (nitWithDv) {
      return {
        identification: normalizeIdentification(nitWithDv[1]),
        checkDigit: nitWithDv[2],
      };
    }
  }

  return {
    identification: normalizeIdentification(value),
    checkDigit: "",
  };
}

function resolveSiigoIdType(tipoDocumento: unknown) {
  const tipo = String(tipoDocumento || "").trim().toUpperCase();

  if (tipo === "NIT") {
    return "31";
  }

  if (tipo === "CE") {
    return "22";
  }

  if (tipo === "PPT") {
    return "48";
  }

  return "13";
}

function resolveSiigoPersonType(tipoDocumento: unknown) {
  return String(tipoDocumento || "").trim().toUpperCase() === "NIT"
    ? "Company"
    : "Person";
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

function buildInvoiceCustomerPayload(
  registro: RegistroSiigoInput,
  customer: SiigoCustomer
): Record<string, unknown> {
  return {
    identification: getSiigoIdentificationData(
      registro.tipoDocumento,
      registro.documentoNumero
    ).identification,
    branch_office: customer.branch_office ?? 0,
  };
}

function buildCustomerCreatePayload(
  registro: RegistroSiigoInput,
  config: SiigoConfig
): Record<string, unknown> {
  const { identification, checkDigit } = getSiigoIdentificationData(
    registro.tipoDocumento,
    registro.documentoNumero
  );
  const personType = resolveSiigoPersonType(registro.tipoDocumento);
  const [firstName, lastName] = splitPersonName(registro.clienteNombre);
  const companyName = String(registro.clienteNombre || "Cliente Conectamos")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  const phone = normalizeIdentification(registro.whatsapp).slice(0, 10);
  const email = String(registro.correo || "").trim().toLowerCase();
  const address = [registro.direccion, registro.barrio]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" - ");

  return {
    type: "Customer",
    person_type: personType,
    id_type: resolveSiigoIdType(registro.tipoDocumento),
    identification,
    ...(checkDigit ? { check_digit: checkDigit } : {}),
    branch_office: 0,
    name: personType === "Company" ? [companyName] : [firstName, lastName],
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
              first_name:
                personType === "Company" ? companyName.slice(0, 50) : firstName,
              last_name: personType === "Company" ? "" : lastName,
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

async function createCustomer(
  config: SiigoConfig,
  registro: RegistroSiigoInput
) {
  const payload = buildCustomerCreatePayload(registro, config);

  return siigoFetch<SiigoCustomer>(config, "/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function ensureCustomerForInvoice(
  config: SiigoConfig,
  registro: RegistroSiigoInput
) {
  const identification = getSiigoIdentificationData(
    registro.tipoDocumento,
    registro.documentoNumero
  ).identification;

  if (!identification) {
    throw new SiigoValidationError("El registro no tiene identificacion valida");
  }

  const existingCustomer = await findCustomerByIdentification(
    config,
    identification
  );

  if (existingCustomer) {
    return existingCustomer;
  }

  try {
    const customer = await createCustomer(config, registro);
    return {
      ...customer,
      identification: customer.identification || identification,
      branch_office: customer.branch_office ?? 0,
    };
  } catch (error) {
    if (error instanceof SiigoApiError && [400, 409].includes(error.status)) {
      const customer = await findCustomerByIdentification(
        config,
        identification
      );

      if (customer) {
        return customer;
      }
    }

    throw error;
  }
}

function resolveItemCode(registro: RegistroSiigoInput, config: SiigoConfig) {
  return (
    config.itemCode ||
    String(registro.referenciaEquipo || registro.serialImei || "").trim()
  );
}

function extractCatalogItems(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;

  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(record[key])) {
      return record[key].filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      );
    }
  }

  return [];
}

async function getInvoiceDocumentNumber(config: SiigoConfig) {
  if (!config.sendDocumentNumber) {
    return null;
  }

  const response = await siigoFetch<unknown>(
    config,
    "/document-types?type=FV",
    {
      method: "GET",
    }
  );
  const documentType = extractCatalogItems(response).find(
    (item) => Number(item.id) === config.documentId
  ) as SiigoDocumentType | undefined;
  const consecutive = Number(documentType?.consecutive);

  return Number.isInteger(consecutive) && consecutive > 0 ? consecutive : null;
}

async function resolveCreditNoteDocumentId(config: SiigoConfig) {
  const explicitDocumentId = toPositiveInt(
    process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID
  );

  if (explicitDocumentId !== null) {
    return explicitDocumentId;
  }

  const response = await siigoFetch<unknown>(
    config,
    "/document-types?type=NC",
    {
      method: "GET",
    }
  );
  const activeDocuments = extractCatalogItems(response).filter((item) => {
    const id = Number(item.id);
    return Number.isInteger(id) && id > 0 && item.active !== false;
  });

  if (activeDocuments.length === 1) {
    return Number(activeDocuments[0].id);
  }

  throw new SiigoConfigurationError([
    "SIIGO_CREDIT_NOTE_DOCUMENT_ID (document.id de nota credito Siigo)",
  ]);
}

function resolveCreditNoteReason() {
  return (
    toPositiveInt(process.env.SIIGO_CREDIT_NOTE_REASON_ID) ??
    toPositiveInt(process.env.SIIGO_CREDIT_NOTE_REASON) ??
    2
  );
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

async function findInvoiceIdByName(config: SiigoConfig, invoiceName?: string | null) {
  const name = String(invoiceName || "").trim();

  if (!name) {
    return null;
  }

  const params = new URLSearchParams({
    name,
    page: "1",
    page_size: "5",
  });
  const response = await siigoFetch<SiigoInvoiceLookupResponse>(
    config,
    `/invoices?${params.toString()}`,
    {
      method: "GET",
    }
  );
  const invoices = response.results || [];
  const exactMatch = invoices.find(
    (invoice) => String(invoice.name || "").trim() === name
  );
  const invoice = exactMatch || invoices[0];

  return invoice?.id && isUuid(invoice.id) ? invoice.id : null;
}

async function resolveInvoiceIdForCreditNote(
  config: SiigoConfig,
  invoiceId: string,
  invoiceName?: string | null
) {
  const invoiceIdFromName = await findInvoiceIdByName(config, invoiceName);

  if (invoiceIdFromName) {
    return invoiceIdFromName;
  }

  if (isUuid(invoiceId)) {
    return invoiceId;
  }

  throw new SiigoValidationError(
    "No se encontro el GUID interno de la factura Siigo para generar la nota credito"
  );
}

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function luhnCheckDigit(base: string) {
  let sum = 0;
  let shouldDouble = true;

  for (let index = base.length - 1; index >= 0; index -= 1) {
    let digit = Number(base[index] || 0);

    if (shouldDouble) {
      digit *= 2;
      digit = Math.floor(digit / 10) + (digit % 10);
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return String((10 - (sum % 10)) % 10);
}

function deterministicDigits(seed: string, length: number) {
  let state = hashText(seed) || 1;
  let output = "";

  while (output.length < length) {
    state = Math.imul(state, 1664525) + 1013904223;
    output += String(state >>> 0);
  }

  return output.slice(0, length);
}

function buildSyntheticImei(registro: RegistroSiigoInput, index: number) {
  const original = onlyDigits(registro.serialImei);
  const seed = [
    registro.id,
    registro.documentoNumero,
    registro.serialImei,
    index,
  ].join("|");
  let base = `35${deterministicDigits(seed, 12)}`;
  let imei = `${base}${luhnCheckDigit(base)}`;

  if (imei === original) {
    base = `35${deterministicDigits(`${seed}|ALT`, 12)}`;
    imei = `${base}${luhnCheckDigit(base)}`;
  }

  return imei;
}

function buildItemDescription(registro: RegistroSiigoInput, itemIndex: number) {
  const imei =
    itemIndex === 0
      ? onlyDigits(registro.serialImei)
      : buildSyntheticImei(registro, itemIndex);

  return [
    registro.referenciaEquipo || "Equipo CONECTAMOS",
    imei ? `IMEI ${imei}` : null,
  ]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 450);
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
    description: buildItemDescription(registro, index),
    quantity: 1,
    price,
    taxes: [],
  }));
}

function buildInvoicePayload(
  registro: RegistroSiigoInput,
  config: SiigoConfig,
  customer: SiigoCustomer,
  documentNumber: number | null
) {
  const identification = getSiigoIdentificationData(
    registro.tipoDocumento,
    registro.documentoNumero
  ).identification;
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
    ...(documentNumber ? { number: documentNumber } : {}),
    date: formatBogotaDate(today),
    customer: buildInvoiceCustomerPayload(registro, customer),
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
    ...(config.stampSend ? { stamp: { send: true } } : {}),
    ...(config.mailSend ? { mail: { send: true } } : {}),
  };
}

function buildCreditNotePayload(
  registro: RegistroSiigoInput,
  config: SiigoConfig,
  invoiceId: string,
  creditNoteDocumentId: number
) {
  const total = calculateInvoiceTotal(registro);
  const today = new Date();

  if (!invoiceId) {
    throw new SiigoValidationError(
      "El registro no tiene identificador de factura Siigo para anular"
    );
  }

  if (total <= 0) {
    throw new SiigoValidationError(
      "No se pudo calcular un valor positivo para la nota credito"
    );
  }

  return {
    document: {
      id: creditNoteDocumentId,
    },
    date: formatBogotaDate(today),
    invoice: invoiceId,
    reason: resolveCreditNoteReason(),
    ...(config.costCenterId ? { cost_center: config.costCenterId } : {}),
    seller: config.sellerId,
    observations: [
      `Nota credito por eliminacion de venta`,
      buildObservations(registro),
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 4000),
    items: buildInvoiceItems(registro, config, total),
    payments: [
      {
        id: config.paymentTypeId,
        value: total,
        due_date: formatBogotaDate(today),
      },
    ],
    ...(config.stampSend ? { stamp: { send: true } } : {}),
    ...(config.mailSend ? { mail: { send: true } } : {}),
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

export const getSiigoCreditNoteLabel = getSiigoInvoiceLabel;

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
  const identification = getSiigoIdentificationData(
    registro.tipoDocumento,
    registro.documentoNumero
  ).identification;
  const total = calculateInvoiceTotal(registro);

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

  const customer = await ensureCustomerForInvoice(config, registro);
  const documentNumber = await getInvoiceDocumentNumber(config);
  const payload = buildInvoicePayload(
    registro,
    config,
    customer,
    documentNumber
  );
  const invoiceKeyVersion = registro.siigoCreditNoteId
    ? `R${hashText(registro.siigoCreditNoteId).toString(36).slice(0, 8)}`
    : "N2";
  const idempotencyKey = `CONECTAMOS${registro.id}${invoiceKeyVersion}`.slice(
    0,
    30
  );

  return siigoFetch<SiigoInvoiceResponse>(
    config,
    "/invoices",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      idempotencyKey,
    }
  );
}

export async function createSiigoCreditNoteForRegistro(
  registro: RegistroSiigoInput,
  invoiceId: string,
  invoiceName?: string | null
) {
  const config = getSiigoConfig(registro);
  const resolvedInvoiceId = await resolveInvoiceIdForCreditNote(
    config,
    invoiceId,
    invoiceName
  );
  const creditNoteDocumentId = await resolveCreditNoteDocumentId(config);
  const payload = buildCreditNotePayload(
    registro,
    config,
    resolvedInvoiceId,
    creditNoteDocumentId
  );
  const idempotencyKey = `CONECTAMOSNC${registro.id}N1`.slice(0, 30);

  return siigoFetch<SiigoCreditNoteResponse>(
    config,
    "/credit-notes",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      idempotencyKey,
    }
  );
}

export async function getSiigoSetupCatalogs() {
  const config = getSiigoAuthConfig();

  const [
    documentTypes,
    creditNoteDocumentTypes,
    users,
    paymentTypes,
    products,
  ] = await Promise.all([
    siigoFetch<unknown>(config, "/document-types?type=FV", {
      method: "GET",
    }),
    siigoFetch<unknown>(config, "/document-types?type=NC", {
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
    creditNoteDocumentTypes,
    users,
    paymentTypes,
    products,
  };
}
