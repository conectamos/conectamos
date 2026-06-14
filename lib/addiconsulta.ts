const ADDI_DEFAULT_AUTH_DOMAIN = "auth.addi.com";
const ADDI_DEFAULT_CLIENT_ID = "LOzXiHhw5VBPNm8xZXK6mYeDo6PEANvg";
const ADDI_DEFAULT_AUDIENCE = "https://api.addi.com";
const ADDI_DEFAULT_CONNECTION = "Username-Password-Authentication";
const ADDI_PORTAL_ORIGIN = "https://aliados.addi.com";
const ADDI_PORTAL_API_BASE_URL = "https://ally-portal.addi.com/";
const ADDI_PORTAL_EXTERNAL_API_BASE_URL =
  "https://ally-portal-external-api.addi.com/";
const COLOMBIA_TIME_ZONE = "America/Bogota";
const ADDI_STORE_KEYWORD = "CONECTAMOS";

export type AddiCreditoCedula = {
  documento: string;
  financiera: "ADDI";
  clienteNombre: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  frecuenciaCuota: "MENSUAL" | null;
  encontradoEnAddi: boolean;
  estado: string | null;
  ordenId: string | null;
  origen: string;
};

type AddiConfig = {
  authBaseUrl: string;
  audience: string;
  clientId: string;
  connection: string;
};

type AddiSession = {
  accessToken: string;
};

type AddiPayload = {
  source: string;
  data: unknown;
};

type AddiCandidate = {
  record: Record<string, unknown>;
  source: string;
  clienteNombre: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  estado: string | null;
  ordenId: string | null;
  sortTime: number;
};

export class AddiConsultaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddiConsultaConfigError";
  }
}

export class AddiConsultaLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddiConsultaLookupError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDocumento(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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

  const normalized = String(value)
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  if (
    !normalized ||
    normalized === "-" ||
    normalized === "." ||
    normalized === "-."
  ) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getConfiguredAddiConfig(): AddiConfig {
  const rawUrl = String(process.env.ADDICONSULTA_URL || "").trim();

  if (!rawUrl) {
    throw new AddiConsultaConfigError("Falta configurar ADDICONSULTA_URL.");
  }

  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AddiConsultaConfigError("ADDICONSULTA_URL no es una URL valida.");
  }

  const authDomain =
    parsed.hostname.includes("auth.addi.com")
      ? parsed.hostname
      : ADDI_DEFAULT_AUTH_DOMAIN;

  return {
    authBaseUrl: `https://${authDomain}`,
    audience:
      parsed.searchParams.get("audience") ||
      parsed.searchParams.get("aud") ||
      ADDI_DEFAULT_AUDIENCE,
    clientId:
      parsed.searchParams.get("client") ||
      parsed.searchParams.get("client_id") ||
      ADDI_DEFAULT_CLIENT_ID,
    connection:
      parsed.searchParams.get("connection") || ADDI_DEFAULT_CONNECTION,
  };
}

function getCredentials() {
  const usuario = String(process.env.ADDICONSULTA_USUARIO || "").trim();
  const clave = String(process.env.ADDICONSULTA_CLAVE || "").trim();

  if (!usuario || !clave) {
    throw new AddiConsultaConfigError(
      "Falta configurar ADDICONSULTA_USUARIO y ADDICONSULTA_CLAVE."
    );
  }

  return { usuario, clave };
}

function getAddiBrowserHeaders() {
  return {
    Origin: ADDI_PORTAL_ORIGIN,
    Referer: `${ADDI_PORTAL_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  };
}

async function readJsonResponse(response: Response) {
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

function unwrapData(payload: unknown) {
  if (isRecord(payload) && "data" in payload) {
    return payload.data;
  }

  return payload;
}

function getMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return typeof payload === "string" ? payload : null;
  }

  return (
    String(
      payload.error_description ||
        payload.message ||
        payload.error ||
        payload.detail ||
        ""
    ).trim() || null
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  options?: { timeoutMs?: number; allowNotFound?: boolean }
) {
  const response = await fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        Accept: "application/json",
        ...getAddiBrowserHeaders(),
        ...(init.headers || {}),
      },
    },
    options?.timeoutMs ?? 20000
  );
  const payload = await readJsonResponse(response);

  if (response.ok) {
    return payload;
  }

  if (options?.allowNotFound && [400, 404].includes(response.status)) {
    return null;
  }

  const message =
    getMessage(payload) || `ADDI respondio con estado ${response.status}.`;

  if ([401, 403].includes(response.status)) {
    throw new AddiConsultaConfigError(message);
  }

  throw new AddiConsultaLookupError(message);
}

async function loginAddi(): Promise<AddiSession> {
  const config = getConfiguredAddiConfig();
  const { usuario, clave } = getCredentials();
  const url = new URL("/oauth/token", config.authBaseUrl).toString();
  const attempts = [
    {
      grant_type: "password",
      username: usuario,
      password: clave,
      audience: config.audience,
      scope: "openid profile email",
      client_id: config.clientId,
      connection: config.connection,
    },
  ];
  const errors: string[] = [];

  for (const body of attempts) {
    try {
      const payload = await requestJson(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://login.addi.com",
            Referer: "https://login.addi.com/",
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: 15000 }
      );

      if (isRecord(payload) && typeof payload.access_token === "string") {
        return { accessToken: payload.access_token };
      }

      errors.push("ADDI no devolvio token de acceso.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const blockedGrant = errors.some((message) => {
    const normalized = normalizeText(message);

    return normalized.includes("GRANT TYPE") && normalized.includes("NOT ALLOWED");
  });

  throw new AddiConsultaConfigError(
    blockedGrant
      ? "ADDI no permite iniciar sesion directo con usuario y clave para esta aplicacion. Se requiere habilitar Password Grant o usar una credencial API de ADDI."
      : errors.find(Boolean) ||
          "ADDI no permitio iniciar sesion con las credenciales configuradas."
  );
}

async function getProtectedJson(baseUrl: string, accessToken: string, path: string) {
  const url = new URL(path.replace(/^\/+/, ""), baseUrl).toString();

  return unwrapData(
    await requestJson(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
      { allowNotFound: true, timeoutMs: 20000 }
    )
  );
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

function deepText(
  record: Record<string, unknown>,
  keys: string[],
  depth = 0
): string | null {
  const text = directText(record, keys);

  if (text || depth > 5) {
    return text;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const found = deepText(item, keys, depth + 1);
        if (found) return found;
      }
      continue;
    }

    if (isRecord(value)) {
      const found = deepText(value, keys, depth + 1);
      if (found) return found;
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

function deepNumber(
  record: Record<string, unknown>,
  keys: string[],
  depth = 0
): number | null {
  const number = directNumber(record, keys);

  if (number !== null || depth > 5) {
    return number;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const found = deepNumber(item, keys, depth + 1);
        if (found !== null) return found;
      }
      continue;
    }

    if (isRecord(value)) {
      const found = deepNumber(value, keys, depth + 1);
      if (found !== null) return found;
    }
  }

  return null;
}

function getDocument(record: Record<string, unknown>) {
  return normalizeDocumento(
    deepText(record, [
      "documentNumber",
      "documento",
      "cedula",
      "identification",
      "identificationNumber",
      "idNumber",
      "nationalIdNumber",
      "nationalIdentificationNumber",
      "clientDocument",
      "customerDocument",
    ])
  );
}

function getClientName(record: Record<string, unknown>) {
  return deepText(record, [
    "clientName",
    "customerName",
    "customerFullName",
    "fullName",
    "nombreCliente",
  ]);
}

function getEmail(record: Record<string, unknown>) {
  return deepText(record, ["email", "correo", "correoElectronico"]);
}

function getPhone(record: Record<string, unknown>) {
  return deepText(record, [
    "phone",
    "phoneNumber",
    "cellPhone",
    "cellPhoneNumber",
    "mobile",
    "telefono",
    "celular",
  ]);
}

function getStoreName(record: Record<string, unknown>) {
  const direct = deepText(record, [
    "storeName",
    "allyName",
    "merchantName",
    "commerceName",
    "shopName",
    "tienda",
    "puntoCredito",
    "puntoDeCredito",
  ]);

  if (direct) {
    return direct;
  }

  for (const [key, value] of Object.entries(record)) {
    const normalized = normalizeKey(key);

    if (
      !(
        normalized.includes("STORE") ||
        normalized.includes("ALLY") ||
        normalized.includes("MERCHANT") ||
        normalized.includes("TIENDA")
      )
    ) {
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (isRecord(value)) {
      const nested = directText(value, ["name", "nombre", "slug"]);
      if (nested) return nested;
    }
  }

  return null;
}

function getAmount(record: Record<string, unknown>) {
  return deepNumber(record, [
    "amount",
    "value",
    "valor",
    "totalAmount",
    "transactionAmount",
    "approvedAmount",
    "creditAmount",
    "loanAmount",
    "capital",
    "price",
  ]);
}

function getInstallment(record: Record<string, unknown>) {
  return deepNumber(record, [
    "installmentAmount",
    "installmentValue",
    "valorCuota",
    "cuota",
    "monthlyPayment",
  ]);
}

function getTerm(record: Record<string, unknown>) {
  return deepNumber(record, [
    "installments",
    "installmentsNumber",
    "numberOfInstallments",
    "term",
    "plazo",
    "numeroCuotas",
  ]);
}

function getStatus(record: Record<string, unknown>) {
  return deepText(record, [
    "status",
    "state",
    "transactionStatus",
    "paymentStatus",
    "estado",
  ]);
}

function getOrderId(record: Record<string, unknown>) {
  return deepText(record, [
    "orderId",
    "idDeOrden",
    "applicationId",
    "transactionId",
    "id",
  ]);
}

function getCreditDate(record: Record<string, unknown>) {
  return deepText(record, [
    "createdAt",
    "created_at",
    "creationDate",
    "date",
    "fecha",
    "transactionDate",
    "updatedAt",
  ]);
}

function getDateInColombia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function getRecentDateSet() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return new Set([getDateInColombia(now), getDateInColombia(yesterday)]);
}

function parseSpanishDate(value: string) {
  const match = value
    .toLowerCase()
    .match(
      /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i
    );

  if (!match) {
    return null;
  }

  const monthMap: Record<string, number> = {
    ene: 0,
    feb: 1,
    mar: 2,
    abr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    ago: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dic: 11,
  };
  const day = Number(match[1]);
  const month = monthMap[match[2]];
  const year = Number(match[3]);

  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) {
    return null;
  }

  let hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const meridian = String(match[6] || "").toLowerCase();

  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;

  return {
    dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`,
    sortTime: Date.UTC(year, month, day, hour, minute),
  };
}

function parseCreditDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { dateKey: null as string | null, sortTime: 0 };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return {
        dateKey: getDateInColombia(date),
        sortTime: date.getTime(),
      };
    }
  }

  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    return {
      dateKey: raw,
      sortTime: Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      ),
    };
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return {
      dateKey: getDateInColombia(parsed),
      sortTime: parsed.getTime(),
    };
  }

  const spanish = parseSpanishDate(raw);

  if (spanish) {
    return spanish;
  }

  return { dateKey: null, sortTime: 0 };
}

function isRecentCreditDate(value: unknown) {
  const { dateKey } = parseCreditDate(value);
  return Boolean(dateKey && getRecentDateSet().has(dateKey));
}

function isConectamosStore(value: unknown) {
  return normalizeText(value).includes(ADDI_STORE_KEYWORD);
}

function isSuccessfulStatus(value: unknown) {
  const status = normalizeText(value);

  return (
    status === "EXITOSA" ||
    status === "EXITO" ||
    status === "SUCCESS" ||
    status === "SUCCESSFUL" ||
    status === "APPROVED" ||
    status === "APROBADA" ||
    status === "APROBADO"
  );
}

function buildCandidates(payloads: AddiPayload[], documento: string) {
  const candidates: AddiCandidate[] = [];

  for (const payload of payloads) {
    const records = collectRecords(payload.data, payload.source);

    for (const { record, source } of records) {
      const recordDocument = getDocument(record);

      if (recordDocument && recordDocument !== documento) {
        continue;
      }

      const creditoAutorizado = getAmount(record);

      if (creditoAutorizado === null || creditoAutorizado <= 0) {
        continue;
      }

      const fechaCreacionCredito = getCreditDate(record);
      const parsedDate = parseCreditDate(fechaCreacionCredito);

      candidates.push({
        record,
        source,
        clienteNombre: getClientName(record),
        correoElectronico: getEmail(record),
        telefonoCliente: getPhone(record),
        fechaCreacionCredito: parsedDate.dateKey || fechaCreacionCredito,
        puntoCredito: getStoreName(record),
        creditoAutorizado,
        numeroCuotas: getTerm(record),
        valorCuota: getInstallment(record),
        estado: getStatus(record),
        ordenId: getOrderId(record),
        sortTime: parsedDate.sortTime,
      });
    }
  }

  return candidates.sort((a, b) => b.sortTime - a.sortTime);
}

function describeCandidates(candidates: AddiCandidate[]) {
  return candidates.slice(0, 8).map((candidate) => ({
    source: candidate.source,
    estado: candidate.estado,
    fechaCreacionCredito: candidate.fechaCreacionCredito,
    puntoCredito: candidate.puntoCredito,
    creditoAutorizado: candidate.creditoAutorizado,
  }));
}

export function isAddiConsultaConfigured() {
  return Boolean(
    String(process.env.ADDICONSULTA_URL || "").trim() &&
      String(process.env.ADDICONSULTA_USUARIO || "").trim() &&
      String(process.env.ADDICONSULTA_CLAVE || "").trim()
  );
}

export async function obtenerCreditoAddiPorCedula(
  documentoInput: unknown
): Promise<AddiCreditoCedula | null> {
  const documento = normalizeDocumento(documentoInput);

  if (documento.length < 5 || documento.length > 15) {
    throw new AddiConsultaLookupError(
      "La cedula debe tener entre 5 y 15 digitos."
    );
  }

  const session = await loginAddi();
  const query = new URLSearchParams({
    limit: "10",
    offset: "0",
    searchField: documento,
  });
  const payloads: AddiPayload[] = [];
  const errors: unknown[] = [];

  try {
    const portalTransactions = await getProtectedJson(
      ADDI_PORTAL_API_BASE_URL,
      session.accessToken,
      `/transactions?${query.toString()}`
    );

    if (portalTransactions) {
      payloads.push({
        source: "ally-portal-transactions",
        data: portalTransactions,
      });
    }
  } catch (error) {
    errors.push(error);
  }

  try {
    const externalTransactions = await getProtectedJson(
      ADDI_PORTAL_EXTERNAL_API_BASE_URL,
      session.accessToken,
      `/v1/transactions?${query.toString()}`
    );

    if (externalTransactions) {
      payloads.push({
        source: "ally-portal-external-transactions",
        data: externalTransactions,
      });
    }
  } catch (error) {
    errors.push(error);
  }

  if (payloads.length === 0) {
    const firstError = errors[0];

    if (firstError instanceof AddiConsultaConfigError) {
      throw firstError;
    }

    if (firstError instanceof AddiConsultaLookupError) {
      throw firstError;
    }

    console.info("ADDI consulta sin payloads", {
      documento: maskDocumento(documento),
    });

    return null;
  }

  const candidates = buildCandidates(payloads, documento);
  const selectedCandidate = candidates.find(
    (candidate) =>
      isSuccessfulStatus(candidate.estado) &&
      isRecentCreditDate(candidate.fechaCreacionCredito) &&
      isConectamosStore(candidate.puntoCredito)
  );

  if (!selectedCandidate) {
    console.info("ADDI consulta sin credito exitoso CONECTAMOS reciente", {
      documento: maskDocumento(documento),
      fechaActual: getDateInColombia(),
      candidatos: describeCandidates(candidates),
    });

    return null;
  }

  return {
    documento,
    financiera: "ADDI",
    clienteNombre: selectedCandidate.clienteNombre,
    correoElectronico: selectedCandidate.correoElectronico,
    telefonoCliente: selectedCandidate.telefonoCliente,
    fechaCreacionCredito: selectedCandidate.fechaCreacionCredito,
    puntoCredito: selectedCandidate.puntoCredito,
    creditoAutorizado: selectedCandidate.creditoAutorizado,
    numeroCuotas: selectedCandidate.numeroCuotas,
    valorCuota: selectedCandidate.valorCuota,
    frecuenciaCuota: "MENSUAL",
    encontradoEnAddi: true,
    estado: selectedCandidate.estado,
    ordenId: selectedCandidate.ordenId,
    origen: selectedCandidate.source,
  };
}
