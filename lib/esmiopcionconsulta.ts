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
  documento: string;
  clienteNombre: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  sortTime: number;
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

function getClientName(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

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
    return fullName;
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

  return parts.length > 0 ? parts.join(" ") : null;
}

function getFirstFromKeys(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== null && record[key] !== undefined && record[key] !== "") {
      return record[key];
    }
  }

  return null;
}

function buildCandidate(
  record: Record<string, unknown>,
  source: string,
  documentoEsperado: string
): EsmioCandidate | null {
  const documento = normalizeDocumento(
    getFirstFromKeys(record, [
      "customer__document_number",
      "customer_document_number",
      "document_number",
      "doc_cliente",
      "docClient",
      "client_document",
    ])
  );

  if (documento !== documentoEsperado) {
    return null;
  }

  const fechaCreacionCredito = normalizeDateInput(
    getFirstFromKeys(record, ["timestamp", "created_at", "created", "date"])
  );

  if (!fechaCreacionCredito || !getAllowedCreditDates().has(fechaCreacionCredito)) {
    return null;
  }

  const creditoAutorizado = toNumber(
    getFirstFromKeys(record, ["capital", "Capital", "total_capital"])
  );

  if (creditoAutorizado === null || creditoAutorizado <= 0) {
    return null;
  }

  const clienteNombre =
    getClientName(record.customer__names) ||
    getClientName(
      getFirstFromKeys(record, [
        "customer_name",
        "client_name",
        "cliente",
        "Cliente",
      ])
    );
  const numeroCuotas = toNumber(
    getFirstFromKeys(record, ["periods", "cuotas", "installments"])
  );
  const valorCuota = toNumber(
    getFirstFromKeys(record, [
      "amount",
      "theorical_planned_payments__amount",
      "installment_amount",
      "valor_cuota",
    ])
  );

  return {
    record,
    source,
    documento,
    clienteNombre,
    fechaCreacionCredito,
    puntoCredito:
      extractStringByKeys(record, ["store__name", "store_name", "store"]) || null,
    creditoAutorizado,
    numeroCuotas,
    valorCuota,
    sortTime: toSortableDate(record.timestamp || record.created_at || record.created),
  };
}

function describeRows(rows: Record<string, unknown>[]) {
  return rows.slice(0, 8).map((row) => ({
    documento: maskDocumento(normalizeDocumento(row.customer__document_number)),
    fecha: normalizeDateInput(row.timestamp),
    capital: toNumber(row.capital),
    periods: row.periods,
    amount: row.amount,
  }));
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
        error.status === 404
      ) {
        attempts.push({
          source: `commerce_reports/get_credits_table/?${params.toString()}`,
          data: [],
        });
        continue;
      }

      throw error;
    }

    attempts.push({
      source: `commerce_reports/get_credits_table/?${params.toString()}`,
      data: response,
    });

    const rows = extractRecords(response);
    const hasDocumento = rows.some(
      (row) => normalizeDocumento(row.customer__document_number) === documento
    );

    if (hasDocumento) {
      break;
    }
  }

  return attempts;
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
  const attempts = await fetchCreditsReport(config, session, documento);
  const candidates = attempts
    .flatMap((attempt) =>
      extractRecords(attempt.data).map((record) =>
        buildCandidate(record, attempt.source, documento)
      )
    )
    .filter((candidate): candidate is EsmioCandidate => Boolean(candidate))
    .sort((a, b) => b.sortTime - a.sortTime);
  const selected = candidates[0];

  if (!selected) {
    const rows = attempts.flatMap((attempt) => extractRecords(attempt.data));

    console.info("ESMIOPCION consulta sin credito reciente", {
      documento: maskDocumento(documento),
      fechaActual: getDateInColombia(),
      filas: rows.length,
      muestras: describeRows(rows),
    });

    return null;
  }

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
    numeroCuotas: selected.numeroCuotas,
    valorCuota: selected.valorCuota,
    frecuenciaCuota: DEFAULT_FRECUENCIA_CUOTA,
    encontradoEnEsmioOpcion: true,
    origen: selected.source,
  };
}
