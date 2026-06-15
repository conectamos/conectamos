const ESMIO_DEFAULT_URL = "https://esmio.appmikro.com/commerce/home";
const ESMIO_DEFAULT_TENANT = "esmio";
const COLOMBIA_TIME_ZONE = "America/Bogota";
const DEFAULT_FRECUENCIA_CUOTA = "MENSUAL" as const;
const ESMIO_TIMEOUT_MS = 30_000;

export type EsmioOpcionCreditoCedula = {
  documento: string;
  financiera: "ESMIOPCION";
  clienteNombre: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  direccionCliente: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  frecuenciaCuota: "MENSUAL" | null;
  encontradoEnEsmioOpcion: boolean;
  origen: string;
};

type EsmioConfig = {
  apiBaseUrl: string;
  usuario: string;
  clave: string;
  perfil: string;
  pin: string;
};

type EsmioSession = {
  storeToken: string;
  employeeToken: string | null;
  selectedEmployee: Record<string, unknown> | null;
};

type ReportAttempt = {
  source: string;
  data: unknown;
};

type EsmioCandidate = {
  record: Record<string, unknown>;
  source: string;
  creditId: string | null;
  documento: string;
  clienteNombre: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  sortTime: number;
};

type EsmioPaymentTerms = {
  numeroCuotas: number | null;
  valorCuota: number | null;
};

export class EsmioOpcionConsultaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsmioOpcionConsultaConfigError";
  }
}

export class EsmioOpcionConsultaLookupError extends Error {
  status?: number;
  label?: string;

  constructor(message: string, options?: { status?: number; label?: string }) {
    super(message);
    this.name = "EsmioOpcionConsultaLookupError";
    this.status = options?.status;
    this.label = options?.label;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDocumento(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

function maskDocumento(documento: string) {
  if (documento.length <= 4) {
    return "****";
  }

  return `${"*".repeat(documento.length - 4)}${documento.slice(-4)}`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized = cleaned;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    normalized = cleaned
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    const commaCount = (cleaned.match(/,/g) || []).length;
    const decimals = cleaned.length - lastComma - 1;

    normalized =
      commaCount === 1 && decimals > 0 && decimals <= 2
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const dotCount = (cleaned.match(/\./g) || []).length;
    const decimals = cleaned.length - lastDot - 1;

    normalized =
      dotCount === 1 && decimals > 0 && decimals <= 2
        ? cleaned
        : cleaned.replace(/\./g, "");
  }

  if (
    !normalized ||
    normalized === "-" ||
    normalized === "." ||
    normalized === "-."
  ) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function getTenantFromUrl(url: URL) {
  const hostParts = url.hostname.split(".");

  return hostParts[0] || ESMIO_DEFAULT_TENANT;
}

function getConfiguredApiBaseUrl(rawUrl: string) {
  const override = String(process.env.ESMIOPCIONCONSULTA_API_URL || "").trim();

  if (override) {
    try {
      const parsedOverride = new URL(override);
      return parsedOverride.href.replace(/\/?$/, "/");
    } catch {
      throw new EsmioOpcionConsultaConfigError(
        "ESMIOPCIONCONSULTA_API_URL no es una URL valida."
      );
    }
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl || ESMIO_DEFAULT_URL);
  } catch {
    throw new EsmioOpcionConsultaConfigError(
      "ESMIOPCIONCONSULTA_URL no es una URL valida."
    );
  }

  if (parsedUrl.hostname.includes("back.appmikro.com")) {
    return `${parsedUrl.origin}/`;
  }

  const tenant = getTenantFromUrl(parsedUrl);

  return `https://${tenant}back.appmikro.com/`;
}

function getConfig(): EsmioConfig {
  const rawUrl = String(
    process.env.ESMIOPCIONCONSULTA_URL || ESMIO_DEFAULT_URL
  ).trim();
  const usuario = String(process.env.ESMIOPCIONCONSULTA_USUARIO || "").trim();
  const clave = String(process.env.ESMIOPCIONCONSULTA_CLAVE || "").trim();
  const perfil = String(process.env.ESMIOPCIONCONSULTA_PERFIL || "").trim();
  const pin = String(process.env.ESMIOPCIONCONSULTA_PIN || "").trim();

  if (!rawUrl || !usuario || !clave || !perfil || !pin) {
    throw new EsmioOpcionConsultaConfigError(
      "Falta configurar ESMIOPCIONCONSULTA_URL, ESMIOPCIONCONSULTA_USUARIO, ESMIOPCIONCONSULTA_CLAVE, ESMIOPCIONCONSULTA_PERFIL y ESMIOPCIONCONSULTA_PIN."
    );
  }

  return {
    apiBaseUrl: getConfiguredApiBaseUrl(rawUrl),
    usuario,
    clave,
    perfil,
    pin,
  };
}

export function isEsmioOpcionConsultaConfigured() {
  return Boolean(
    String(process.env.ESMIOPCIONCONSULTA_URL || ESMIO_DEFAULT_URL).trim() &&
      String(process.env.ESMIOPCIONCONSULTA_USUARIO || "").trim() &&
      String(process.env.ESMIOPCIONCONSULTA_CLAVE || "").trim() &&
      String(process.env.ESMIOPCIONCONSULTA_PERFIL || "").trim() &&
      String(process.env.ESMIOPCIONCONSULTA_PIN || "").trim()
  );
}

function buildApiUrl(baseUrl: string, path: string, params?: URLSearchParams) {
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);

  if (params) {
    params.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
  }

  return url;
}

async function readResponseBody(response: Response) {
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

function getErrorMessage(body: unknown) {
  if (isRecord(body)) {
    const code = body.code;
    const detail = body.detail || body.message || body.error;

    return [code, detail].filter(Boolean).join(": ");
  }

  return typeof body === "string" ? body.slice(0, 180) : "";
}

async function requestJson(
  url: URL,
  init: RequestInit,
  label: string
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESMIO_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      const suffix = getErrorMessage(body);

      throw new EsmioOpcionConsultaLookupError(
        suffix
          ? `ESMIOPCION respondio con estado ${response.status} en ${label}: ${suffix}`
          : `ESMIOPCION respondio con estado ${response.status} en ${label}.`,
        { status: response.status, label }
      );
    }

    return body;
  } catch (error) {
    if (error instanceof EsmioOpcionConsultaLookupError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EsmioOpcionConsultaLookupError(
        `ESMIOPCION no respondio a tiempo en ${label}.`
      );
    }

    throw new EsmioOpcionConsultaLookupError(
      error instanceof Error
        ? `Error consultando ESMIOPCION en ${label}: ${error.message}`
        : `Error consultando ESMIOPCION en ${label}.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractStringByKeys(value: unknown, keys: string[]) {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const raw = value[key];

    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }

    if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(raw);
    }
  }

  return null;
}

function extractToken(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const direct = extractStringByKeys(value, [
    "token",
    "store_token",
    "employee_token",
    "access_token",
    "key",
  ]);

  if (direct) {
    return direct;
  }

  for (const nested of Object.values(value)) {
    const nestedToken: string | null = extractToken(nested);

    if (nestedToken) {
      return nestedToken;
    }
  }

  return null;
}

function extractRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  const knownArrays = [
    value.results,
    value.data,
    value.items,
    value.records,
    value.employees,
    value.employeesStoreLogin,
  ];

  for (const item of knownArrays) {
    if (Array.isArray(item)) {
      return item.filter(isRecord);
    }
  }

  for (const nested of Object.values(value)) {
    const records = extractRecords(nested);

    if (records.length > 0) {
      return records;
    }
  }

  return [];
}

function collectRecords(
  value: unknown,
  source: string,
  out: Array<{ record: Record<string, unknown>; source: string }> = [],
  depth = 0
) {
  if (depth > 7) {
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRecords(item, source, out, depth + 1);
    }
    return out;
  }

  if (!isRecord(value)) {
    return out;
  }

  out.push({ record: value, source });

  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) {
      collectRecords(child, source, out, depth + 1);
    }
  }

  return out;
}

function directText(record: Record<string, unknown>, keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey));

  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(normalizeKey(key))) {
      continue;
    }

    const text = String(value || "").replace(/\s+/g, " ").trim();

    if (text && text !== "[object Object]") {
      return text;
    }
  }

  return null;
}

function deepText(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepText(item, keys, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const direct = directText(value, keys);

  if (direct) {
    return direct;
  }

  for (const child of Object.values(value)) {
    const found = deepText(child, keys, depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

function directNumber(record: Record<string, unknown>, keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey));

  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(normalizeKey(key))) {
      continue;
    }

    const number = toNumber(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

function deepNumber(value: unknown, keys: string[], depth = 0): number | null {
  if (depth > 5) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepNumber(item, keys, depth + 1);

      if (found !== null) {
        return found;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const direct = directNumber(value, keys);

  if (direct !== null) {
    return direct;
  }

  for (const child of Object.values(value)) {
    const found = deepNumber(child, keys, depth + 1);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

async function loginStore(config: EsmioConfig) {
  const url = buildApiUrl(config.apiBaseUrl, "stores/login_store/");
  const response = await requestJson(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        username: config.usuario,
        password: config.clave,
      }),
    },
    "login tienda"
  );
  const token = extractToken(response);

  if (!token) {
    throw new EsmioOpcionConsultaLookupError(
      "ESMIOPCION no devolvio token de tienda al iniciar sesion."
    );
  }

  return token;
}

async function getEmployees(config: EsmioConfig, storeToken: string) {
  const url = buildApiUrl(config.apiBaseUrl, "stores/get_employees_login/");
  const response = await requestJson(
    url,
    {
      method: "GET",
      headers: {
        authorization: `Token ${storeToken}`,
      },
    },
    "perfiles"
  );

  return extractRecords(response);
}

function getEmployeeSearchValues(employee: Record<string, unknown>) {
  return [
    employee.id,
    employee.username,
    employee.full_name,
    employee.name,
    employee.first_name,
    employee.last_name,
    employee.document_number,
    employee.identification,
    employee.email,
  ].filter((item) => item !== null && item !== undefined && item !== "");
}

function matchEmployee(
  employee: Record<string, unknown>,
  expectedProfile: string
) {
  const expectedText = normalizeText(expectedProfile);
  const expectedKey = normalizeKey(expectedProfile);
  const expectedDigits = normalizeDocumento(expectedProfile);

  return getEmployeeSearchValues(employee).some((value) => {
    const valueText = normalizeText(value);
    const valueKey = normalizeKey(value);
    const valueDigits = normalizeDocumento(value);

    return (
      (expectedText && (valueText === expectedText || valueText.includes(expectedText))) ||
      (expectedKey && (valueKey === expectedKey || valueKey.includes(expectedKey))) ||
      (expectedDigits && valueDigits === expectedDigits)
    );
  });
}

function getEmployeeUsername(
  employee: Record<string, unknown> | null,
  fallback: string
) {
  return (
    extractStringByKeys(employee, [
      "username",
      "document_number",
      "identification",
      "email",
      "id",
    ]) || fallback
  );
}

async function loginEmployee(
  config: EsmioConfig,
  storeToken: string,
  employee: Record<string, unknown> | null
) {
  const username = getEmployeeUsername(employee, config.perfil);
  const url = buildApiUrl(config.apiBaseUrl, "employees/login_employee/");
  const response = await requestJson(
    url,
    {
      method: "POST",
      headers: {
        authorization: `Token ${storeToken}`,
      },
      body: JSON.stringify({
        login_type: "PIN",
        username,
        password: config.pin,
      }),
    },
    "login perfil"
  );

  return extractToken(response);
}

async function loginEsmio(config: EsmioConfig): Promise<EsmioSession> {
  const storeToken = await loginStore(config);
  const employees = await getEmployees(config, storeToken);
  const selectedEmployee =
    employees.find((employee) => matchEmployee(employee, config.perfil)) || null;

  if (!selectedEmployee) {
    console.info("ESMIOPCION perfil no encontrado", {
      perfil: config.perfil,
      perfiles: employees.slice(0, 8).map((employee) => ({
        id: employee.id,
        username: employee.username,
        full_name: employee.full_name,
        name: employee.name,
      })),
    });
  }

  const employeeToken = await loginEmployee(config, storeToken, selectedEmployee);

  if (!employeeToken) {
    throw new EsmioOpcionConsultaLookupError(
      "ESMIOPCION no devolvio token de empleado al validar el PIN."
    );
  }

  return {
    storeToken,
    employeeToken,
    selectedEmployee,
  };
}

function datePartsInColombia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function formatDateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function getDateInColombia(date = new Date()) {
  const parts = datePartsInColombia(date);

  return formatDateKey(parts.year, parts.month, parts.day);
}

function getAllowedCreditDates() {
  const now = new Date();
  const today = getDateInColombia(now);
  const yesterday = getDateInColombia(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  return new Set([today, yesterday]);
}

function normalizeDateInput(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getDateInColombia(value);
  }

  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime()) && /T|\d{2}:\d{2}/.test(raw)) {
      return getDateInColombia(parsed);
    }

    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const localMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (localMatch) {
    return formatDateKey(
      Number(localMatch[3]),
      Number(localMatch[2]),
      Number(localMatch[1])
    );
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : getDateInColombia(parsed);
}

function toSortableDate(value: unknown) {
  const raw = String(value || "").trim();
  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function cleanClientName(value: unknown) {
  const parts = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const cleanedParts: string[] = [];

  for (const part of parts) {
    const currentKey = normalizeText(part);
    const previousKey = normalizeText(cleanedParts[cleanedParts.length - 1]);

    if (currentKey && currentKey === previousKey) {
      continue;
    }

    cleanedParts.push(part);
  }

  return cleanedParts.join(" ").trim() || null;
}

function getClientName(value: unknown) {
  if (typeof value === "string") {
    const trimmed = cleanClientName(value);

    return trimmed && trimmed !== "-" ? trimmed : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const fullName = extractStringByKeys(value, [
    "full_name",
    "name",
    "names",
    "customer_name",
  ]);

  if (fullName) {
    return cleanClientName(fullName);
  }

  const parts = [
    value.first_name,
    value.second_name,
    value.first_surname,
    value.second_surname,
    value.last_name,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return parts.length > 0 ? cleanClientName(parts.join(" ")) : null;
}

const PAYMENT_AMOUNT_KEYS = [
  "amount",
  "theorical_planned_payments__amount",
  "theoricalPlannedPaymentsAmount",
  "theoretical_planned_payments__amount",
  "theoreticalPlannedPaymentsAmount",
  "planned_payment_amount",
  "plannedPaymentAmount",
  "installment_amount",
  "installmentAmount",
  "installment_value",
  "installmentValue",
  "quota_value",
  "quotaValue",
  "payment_amount",
  "paymentAmount",
  "monthly_payment",
  "monthlyPayment",
  "fee",
  "fee_value",
  "valor_cuota",
  "valorCuota",
];

const PAYMENT_COUNT_KEYS = [
  "periods",
  "cuotas",
  "installments",
  "numberOfInstallments",
  "number_of_installments",
  "number_of_payments",
  "numberOfPayments",
  "term",
];

const PAYMENT_INDEX_KEYS = [
  "number",
  "number_payment",
  "numberPayment",
  "installment_number",
  "installmentNumber",
  "period",
  "period_number",
  "periodNumber",
  "quota_number",
  "quotaNumber",
  "nro_cuota",
  "nroCuota",
];

function mostRepeatedNumber(values: number[]) {
  const counts = new Map<number, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ||
    null
  );
}

function getCreditId(record: Record<string, unknown>) {
  return (
    directText(record, ["credit_id", "creditId", "id", "credit"]) ||
    deepText(record, ["credit_id", "creditId"])
  );
}

function extractPaymentTerms(value: unknown): EsmioPaymentTerms {
  const records = collectRecords(value, "planned_payment").map(
    (item) => item.record
  );
  const amountValues: number[] = [];
  const installmentIndexes: number[] = [];
  const directPaymentCount = deepNumber(value, PAYMENT_COUNT_KEYS);

  for (const record of records) {
    const amount = directNumber(record, PAYMENT_AMOUNT_KEYS);

    if (amount !== null && amount > 0) {
      amountValues.push(amount);
    }

    const installmentIndex = directNumber(record, PAYMENT_INDEX_KEYS);

    if (installmentIndex !== null && installmentIndex > 0) {
      installmentIndexes.push(installmentIndex);
    }
  }

  const paymentRows = records.filter(
    (record) =>
      directNumber(record, PAYMENT_AMOUNT_KEYS) !== null ||
      directNumber(record, PAYMENT_INDEX_KEYS) !== null
  );

  return {
    numeroCuotas:
      directPaymentCount !== null && directPaymentCount > 0
        ? directPaymentCount
        : installmentIndexes.length > 0
          ? Math.max(...installmentIndexes)
          : paymentRows.length > 0
            ? paymentRows.length
            : null,
    valorCuota:
      amountValues.length > 0 ? mostRepeatedNumber(amountValues) : null,
  };
}

function buildCandidate(
  record: Record<string, unknown>,
  source: string,
  documentoEsperado: string
): EsmioCandidate | null {
  const documentoRecord = normalizeDocumento(
    deepText(record, [
      "customer__document_number",
      "customer_document_number",
      "customerDocumentNumber",
      "document_number",
      "documentNumber",
      "doc_cliente",
      "docClient",
      "client_document",
      "clientDocument",
      "clientDocumentNumber",
      "identification",
      "identificationNumber",
      "cedula",
    ])
  );
  const documento =
    documentoRecord ||
    (source.startsWith("credit/get_customer_credits") ? documentoEsperado : "");

  if (documento !== documentoEsperado) {
    return null;
  }

  const fechaCreacionCredito = normalizeDateInput(
    deepText(record, [
      "timestamp",
      "created_at",
      "createdAt",
      "created",
      "date",
      "start_date",
      "startDate",
      "generation_date",
      "generationDate",
    ])
  );

  if (!fechaCreacionCredito || !getAllowedCreditDates().has(fechaCreacionCredito)) {
    return null;
  }

  const creditoAutorizado = toNumber(
    deepNumber(record, [
      "capital",
      "total_capital",
      "totalCapital",
      "loan_amount_initial",
      "loanAmountInitial",
      "credit_value",
      "creditValue",
      "approvedAmount",
      "approved_amount",
      "principal",
      "value",
    ])
  );

  if (creditoAutorizado === null || creditoAutorizado <= 0) {
    return null;
  }

  const clienteNombre =
    getClientName(record.customer__names) ||
    getClientName(record.customer) ||
    getClientName(record.client) ||
    getClientName(
      deepText(record, [
        "customer_name",
        "customerName",
        "client_name",
        "clientName",
        "customerFullName",
        "clientFullName",
        "cliente",
        "Cliente",
      ])
    );
  const numeroCuotas = toNumber(
    deepNumber(record, PAYMENT_COUNT_KEYS)
  );
  const valorCuota = toNumber(
    deepNumber(record, PAYMENT_AMOUNT_KEYS)
  );

  return {
    record,
    source,
    creditId: getCreditId(record),
    documento,
    clienteNombre,
    fechaCreacionCredito,
    puntoCredito:
      deepText(record, [
        "store__name",
        "store_name",
        "storeName",
        "store",
        "commerceName",
      ]) || null,
    creditoAutorizado,
    numeroCuotas,
    valorCuota,
    sortTime: toSortableDate(
      record.timestamp || record.created_at || record.createdAt || record.created
    ),
  };
}

function describeRows(rows: Record<string, unknown>[]) {
  return rows.slice(0, 8).map((row) => ({
    documento: maskDocumento(
      normalizeDocumento(deepText(row, ["customer__document_number"]))
    ),
    fecha: normalizeDateInput(deepText(row, ["timestamp", "created_at"])),
    capital: deepNumber(row, ["capital", "total_capital", "value"]),
    periods: deepNumber(row, ["periods", "installments"]),
    amount: deepNumber(row, ["amount", "installment_amount"]),
  }));
}

function pushReportAttempt(
  attempts: ReportAttempt[],
  source: string,
  data: unknown
) {
  attempts.push({ source, data });
}

async function fetchCreditsReport(
  config: EsmioConfig,
  session: EsmioSession,
  documento: string
) {
  const allowedDates = Array.from(getAllowedCreditDates()).sort();
  const attempts: ReportAttempt[] = [];
  const requestConfigs = [
    new URLSearchParams({
      search: documento,
      page_size: "50",
    }),
    new URLSearchParams({
      search: documento,
      start: allowedDates[0],
      end: allowedDates[allowedDates.length - 1],
      page_size: "50",
    }),
    new URLSearchParams({
      search: documento,
    }),
    new URLSearchParams({
      search: documento,
      start: allowedDates[0],
      end: allowedDates[allowedDates.length - 1],
    }),
    new URLSearchParams({
      all: "true",
      search: documento,
    }),
    new URLSearchParams({
      all: "true",
      search: documento,
      start: allowedDates[0],
      end: allowedDates[allowedDates.length - 1],
    }),
  ];

  for (const params of requestConfigs) {
    const url = buildApiUrl(
      config.apiBaseUrl,
      "commerce_reports/get_credits_table/",
      params
    );
    let response: unknown;

    try {
      response = await requestJson(
        url,
        {
          method: "GET",
          headers: {
            authorization: `Token ${session.storeToken}`,
          },
        },
        "tabla de creditos"
      );
    } catch (error) {
      if (
        error instanceof EsmioOpcionConsultaLookupError &&
        (error.status === 404 || error.status === 500)
      ) {
        pushReportAttempt(
          attempts,
          `commerce_reports/get_credits_table/?${params.toString()}`,
          []
        );
        continue;
      }

      throw error;
    }

    pushReportAttempt(
      attempts,
      `commerce_reports/get_credits_table/?${params.toString()}`,
      response
    );

    const rows = collectRecords(
      response,
      `commerce_reports/get_credits_table/?${params.toString()}`
    ).map((item) => item.record);
    const hasDocumento = rows.some(
      (row) =>
        normalizeDocumento(deepText(row, ["customer__document_number"])) ===
        documento
    );

    if (hasDocumento) {
      break;
    }
  }

  return attempts;
}

async function fetchCustomerCreditsFallback(
  config: EsmioConfig,
  session: EsmioSession,
  documento: string
) {
  const attempts: ReportAttempt[] = [];
  const endpoints = [
    `credit/get_customer_credits/?document_number=${encodeURIComponent(documento)}`,
    `credit/get_customer_credits_pg/?document_number=${encodeURIComponent(
      documento
    )}&page_size=50`,
  ];

  for (const endpoint of endpoints) {
    const url = buildApiUrl(config.apiBaseUrl, endpoint);

    try {
      const response = await requestJson(
        url,
        {
          method: "GET",
          headers: {
            authorization: `Token ${session.employeeToken || session.storeToken}`,
          },
        },
        "creditos por cliente"
      );

      pushReportAttempt(attempts, endpoint, response);
    } catch (error) {
      if (
        error instanceof EsmioOpcionConsultaLookupError &&
        (error.status === 404 || error.status === 500)
      ) {
        pushReportAttempt(attempts, endpoint, []);
        continue;
      }

      throw error;
    }
  }

  return attempts;
}

async function fetchPaymentPlanTerms(
  config: EsmioConfig,
  session: EsmioSession,
  candidate: EsmioCandidate
): Promise<EsmioPaymentTerms> {
  if (!candidate.creditId) {
    return {
      numeroCuotas: null,
      valorCuota: null,
    };
  }

  const endpoint = `planned_payment/get_customer_planned_payment/?credit_id=${encodeURIComponent(
    candidate.creditId
  )}`;
  const url = buildApiUrl(config.apiBaseUrl, endpoint);

  try {
    const response = await requestJson(
      url,
      {
        method: "GET",
        headers: {
          authorization: `Token ${session.employeeToken || session.storeToken}`,
        },
      },
      "plan de pagos"
    );

    const terms = extractPaymentTerms(response);

    if (terms.valorCuota === null && candidate.valorCuota === null) {
      console.info("ESMIOPCION plan de pagos sin valor cuota", {
        documento: maskDocumento(candidate.documento),
        creditId: candidate.creditId,
        filas: collectRecords(response, "planned_payment").length,
      });
    }

    return terms;
  } catch (error) {
    if (
      error instanceof EsmioOpcionConsultaLookupError &&
      (error.status === 404 || error.status === 500)
    ) {
      console.info("ESMIOPCION no pudo leer plan de pagos", {
        documento: maskDocumento(candidate.documento),
        creditId: candidate.creditId,
        status: error.status,
      });

      return {
        numeroCuotas: null,
        valorCuota: null,
      };
    }

    throw error;
  }
}

export async function obtenerCreditoEsmioOpcionPorCedula(
  documentoInput: unknown
): Promise<EsmioOpcionCreditoCedula | null> {
  const documento = normalizeDocumento(documentoInput);

  if (documento.length < 5 || documento.length > 15) {
    throw new EsmioOpcionConsultaLookupError(
      "La cedula debe tener entre 5 y 15 digitos."
    );
  }

  const config = getConfig();
  const session = await loginEsmio(config);
  const attempts = [
    ...(await fetchCreditsReport(config, session, documento)),
    ...(await fetchCustomerCreditsFallback(config, session, documento)),
  ];
  const seenCandidates = new Set<string>();
  const candidates = attempts
    .flatMap((attempt) =>
      collectRecords(attempt.data, attempt.source).map(({ record }) =>
        buildCandidate(record, attempt.source, documento)
      )
    )
    .filter((candidate): candidate is EsmioCandidate => Boolean(candidate))
    .filter((candidate) => {
      const key = [
        candidate.documento,
        candidate.fechaCreacionCredito,
        candidate.creditoAutorizado,
        candidate.numeroCuotas,
        candidate.valorCuota,
      ].join("|");

      if (seenCandidates.has(key)) {
        return false;
      }

      seenCandidates.add(key);
      return true;
    })
    .sort((a, b) => b.sortTime - a.sortTime);
  const selected = candidates[0];

  if (!selected) {
    const rows = attempts.flatMap((attempt) =>
      collectRecords(attempt.data, attempt.source).map((item) => item.record)
    );

    console.info("ESMIOPCION consulta sin credito reciente", {
      documento: maskDocumento(documento),
      fechaActual: getDateInColombia(),
      filas: rows.length,
      muestras: describeRows(rows),
    });

    return null;
  }

  const paymentTerms =
    selected.valorCuota === null || selected.numeroCuotas === null
      ? await fetchPaymentPlanTerms(config, session, selected)
      : {
          numeroCuotas: null,
          valorCuota: null,
        };

  return {
    documento: selected.documento,
    financiera: "ESMIOPCION",
    clienteNombre: selected.clienteNombre,
    correoElectronico: null,
    telefonoCliente: null,
    direccionCliente: null,
    fechaCreacionCredito: selected.fechaCreacionCredito,
    puntoCredito: selected.puntoCredito,
    creditoAutorizado: selected.creditoAutorizado,
    numeroCuotas: selected.numeroCuotas ?? paymentTerms.numeroCuotas,
    valorCuota: selected.valorCuota ?? paymentTerms.valorCuota,
    frecuenciaCuota: DEFAULT_FRECUENCIA_CUOTA,
    encontradoEnEsmioOpcion: true,
    origen: selected.source,
  };
}
