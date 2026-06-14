const ADDI_DEFAULT_AUTH_DOMAIN = "auth.addi.com";
const ADDI_DEFAULT_CLIENT_ID = "LOzXiHhw5VBPNm8xZXK6mYeDo6PEANvg";
const ADDI_DEFAULT_AUDIENCE = "https://api.addi.com";
const ADDI_DEFAULT_CONNECTION = "Username-Password-Authentication";
const ADDI_DEFAULT_CALLBACK_URL = "https://login.addi.com/login";
const ADDI_PORTAL_ORIGIN = "https://aliados.addi.com";
const ADDI_PORTAL_API_BASE_URL = "https://ally-portal.addi.com/";
const ADDI_PORTAL_EXTERNAL_API_BASE_URL =
  "https://ally-portal-external-api.addi.com/";
const ADDI_PAYLINK_API_BASE_URL = "https://backend.addi.com/";
const ADDI_IDENTITY_MANAGEMENT_API_BASE_URL =
  "https://identity-management-sync-api.addi.com/";
const COLOMBIA_TIME_ZONE = "America/Bogota";
const ADDI_STORE_KEYWORD = "CONECTAMOS";
const ADDI_PAYMENT_LOOKUP_PAGE_SIZE = 50;
const ADDI_PAYMENT_REPORT_PAGE_SIZE = 9999;

export type AddiCreditoCedula = {
  documento: string;
  financiera: "ADDI";
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
  callbackUrl: string;
  identityBaseUrl: string;
};

type AddiSession = {
  accessToken: string;
  authCookie: string | null;
};

type AddiPayload = {
  source: string;
  data: unknown;
};

type AddiRequestTrace = {
  source: string;
  path: string;
  queryKeys: string[];
  status: "ok" | "empty" | "error";
  records?: number;
  message?: string;
};

type AddiCandidate = {
  record: Record<string, unknown>;
  source: string;
  clienteNombre: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  direccionCliente: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  estado: string | null;
  ordenId: string | null;
  transactionId: string | null;
  loanId: string | null;
  applicationId: string | null;
  allySlug: string | null;
  storeSlug: string | null;
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
    callbackUrl:
      parsed.searchParams.get("redirect_uri") || ADDI_DEFAULT_CALLBACK_URL,
    identityBaseUrl:
      String(process.env.ADDICONSULTA_IDENTITY_URL || "").trim() ||
      ADDI_IDENTITY_MANAGEMENT_API_BASE_URL,
  };
}

function getAddiPaylinkBaseUrl() {
  const rawUrl = String(process.env.ADDICONSULTA_PAYLINK_URL || "").trim();

  if (!rawUrl) {
    return ADDI_PAYLINK_API_BASE_URL;
  }

  try {
    return new URL("/", rawUrl).toString();
  } catch {
    return ADDI_PAYLINK_API_BASE_URL;
  }
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

type CookieJar = Map<string, string>;

function randomAuthValue() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function splitSetCookieHeader(value: string) {
  return value.split(/,(?=\s*[^;,=]+=)/g).map((item) => item.trim());
}

function getSetCookieHeaders(headers: Headers) {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };

  if (typeof extendedHeaders.getSetCookie === "function") {
    return extendedHeaders.getSetCookie();
  }

  const rawHeaders = extendedHeaders.raw?.();

  if (rawHeaders?.["set-cookie"]) {
    return rawHeaders["set-cookie"];
  }

  const header = headers.get("set-cookie");

  return header ? splitSetCookieHeader(header) : [];
}

function storeResponseCookies(headers: Headers, jar: CookieJar) {
  for (const cookie of getSetCookieHeaders(headers)) {
    const [pair] = cookie.split(";");
    const separatorIndex = pair.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    jar.set(pair.slice(0, separatorIndex).trim(), pair.slice(separatorIndex + 1));
  }
}

function getCookieHeader(jar: CookieJar) {
  return Array.from(jar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function fetchWithCookies(
  url: string,
  init: RequestInit,
  jar: CookieJar,
  timeoutMs = 20000
) {
  const headers = new Headers(init.headers);
  const cookieHeader = getCookieHeader(jar);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const response = await fetchWithTimeout(
    url,
    {
      ...init,
      headers,
      redirect: "manual",
    },
    timeoutMs
  );

  storeResponseCookies(response.headers, jar);

  return response;
}

async function fetchTextFollowingRedirects(
  url: string,
  init: RequestInit,
  jar: CookieJar,
  maxRedirects = 8
) {
  let currentUrl = url;
  let requestInit = init;

  for (let index = 0; index <= maxRedirects; index++) {
    const response = await fetchWithCookies(currentUrl, requestInit, jar);
    const location = response.headers.get("location");

    if (
      location &&
      response.status >= 300 &&
      response.status < 400 &&
      index < maxRedirects
    ) {
      currentUrl = new URL(location, currentUrl).toString();
      requestInit = {
        method: "GET",
        headers: init.headers,
      };
      continue;
    }

    return {
      response,
      text: await response.text(),
      url: currentUrl,
    };
  }

  throw new AddiConsultaLookupError("ADDI excedio los redireccionamientos.");
}

function getRecordValueString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRecordValueRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return isRecord(value) ? value : null;
}

function getOptionString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function parseAuth0LockConfig(html: string) {
  const match =
    html.match(/window\.atob\('([^']+)'\)/) ||
    html.match(/window\.atob\("([^"]+)"\)/);

  if (!match) {
    throw new AddiConsultaConfigError(
      "ADDI no devolvio la configuracion del login."
    );
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const payload = JSON.parse(decoded) as unknown;

  if (!isRecord(payload)) {
    throw new AddiConsultaConfigError(
      "ADDI devolvio una configuracion de login invalida."
    );
  }

  return payload;
}

function buildInitialAuthorizeUrl(config: AddiConfig) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "token",
    response_mode: "form_post",
    redirect_uri: config.callbackUrl,
    audience: config.audience,
    scope: "openid",
    state: JSON.stringify({ redirect_url: `${ADDI_PORTAL_ORIGIN}/` }),
    nonce: randomAuthValue(),
    connection: config.connection,
  });

  return new URL(`/authorize?${params.toString()}`, config.authBaseUrl).toString();
}

function setAuthorizeParam(
  params: URLSearchParams,
  outputKey: string,
  options: Record<string, unknown>,
  inputKeys: string[],
  fallback?: string | null
) {
  const value = getOptionString(options, inputKeys) || fallback;

  if (value) {
    params.set(outputKey, value);
  }
}

function buildTicketAuthorizeUrl(
  config: AddiConfig,
  lockConfig: Record<string, unknown>,
  loginTicket: string
) {
  const internalOptions =
    getRecordValueRecord(lockConfig, "internalOptions") ||
    getRecordValueRecord(lockConfig, "extraParams") ||
    {};
  const params = new URLSearchParams();
  const clientId = getRecordValueString(lockConfig, "clientID") || config.clientId;

  params.set("client_id", clientId);
  setAuthorizeParam(params, "response_type", internalOptions, [
    "response_type",
    "responseType",
  ], "token");
  setAuthorizeParam(params, "response_mode", internalOptions, [
    "response_mode",
    "responseMode",
  ], "form_post");
  setAuthorizeParam(params, "redirect_uri", internalOptions, [
    "redirect_uri",
    "redirectUri",
    "redirectURI",
  ], getRecordValueString(lockConfig, "callbackURL") || config.callbackUrl);
  setAuthorizeParam(params, "audience", internalOptions, ["audience"], config.audience);
  setAuthorizeParam(params, "scope", internalOptions, ["scope"], "openid");
  setAuthorizeParam(params, "state", internalOptions, ["state"], randomAuthValue());
  setAuthorizeParam(params, "nonce", internalOptions, ["nonce"], randomAuthValue());
  setAuthorizeParam(params, "_csrf", internalOptions, ["_csrf"]);
  setAuthorizeParam(params, "_intstate", internalOptions, ["_intstate"]);
  setAuthorizeParam(params, "protocol", internalOptions, ["protocol"], "oauth2");
  params.set(
    "connection",
    getRecordValueString(lockConfig, "connection") || config.connection
  );
  params.set("login_ticket", loginTicket);

  return new URL(`/authorize?${params.toString()}`, config.authBaseUrl).toString();
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    );
}

function getHtmlAttribute(tag: string, attribute: string) {
  const match = tag.match(
    new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];

  return value ? decodeHtmlAttribute(value) : null;
}

function getFormFields(html: string) {
  const fields = new Map<string, string>();
  const inputTags = html.match(/<input\b[^>]*>/gi) || [];

  for (const tag of inputTags) {
    const name = getHtmlAttribute(tag, "name");

    if (!name) {
      continue;
    }

    fields.set(name, getHtmlAttribute(tag, "value") || "");
  }

  return fields;
}

function getAccessTokenFromUrl(value: string) {
  try {
    const url = new URL(value);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const hashToken = new URLSearchParams(hash).get("access_token");

    return hashToken || url.searchParams.get("access_token");
  } catch {
    return null;
  }
}

async function exchangeAuth0TokenForAddiSession(
  auth0AccessToken: string,
  config: AddiConfig
): Promise<AddiSession> {
  const url = new URL("/login", config.identityBaseUrl).toString();
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        ...getAddiBrowserHeaders(),
        Authorization: `Bearer ${auth0AccessToken}`,
      },
    },
    15000
  );
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new AddiConsultaConfigError(
      getMessage(payload) ||
        "ADDI no permitio intercambiar la sesion por token del portal."
    );
  }

  const accessToken = response.headers.get("x-addi-token");

  if (!accessToken) {
    throw new AddiConsultaConfigError("ADDI no devolvio token del portal.");
  }

  const authCookie =
    getSetCookieHeaders(response.headers)
      .find((cookie) =>
        cookie.toLowerCase().startsWith("addiauth=")
      )
      ?.split(";")[0] || null;

  return { accessToken, authCookie };
}

async function loginAddi(): Promise<AddiSession> {
  const config = getConfiguredAddiConfig();
  const { usuario, clave } = getCredentials();
  const jar: CookieJar = new Map();
  const authPage = await fetchTextFollowingRedirects(
    buildInitialAuthorizeUrl(config),
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        ...getAddiBrowserHeaders(),
      },
    },
    jar
  );

  if (!authPage.response.ok) {
    throw new AddiConsultaConfigError(
      `ADDI no abrio el login. Estado ${authPage.response.status}.`
    );
  }

  const lockConfig = parseAuth0LockConfig(authPage.text);
  const authDomain = getRecordValueString(lockConfig, "auth0Domain");
  const authBaseUrl = authDomain ? `https://${authDomain}` : config.authBaseUrl;
  const clientId = getRecordValueString(lockConfig, "clientID") || config.clientId;
  const connection =
    getRecordValueString(lockConfig, "connection") || config.connection;
  const authenticateResponse = await fetchWithCookies(
    new URL("/co/authenticate", authBaseUrl).toString(),
    {
      method: "POST",
      headers: {
        ...getAddiBrowserHeaders(),
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: authBaseUrl,
        Referer: `${authBaseUrl}/login`,
      },
      body: JSON.stringify({
        client_id: clientId,
        username: usuario,
        password: clave,
        realm: connection,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
      }),
    },
    jar,
    15000
  );
  const authenticatePayload = await readJsonResponse(authenticateResponse);

  if (!authenticateResponse.ok) {
    throw new AddiConsultaConfigError(
      getMessage(authenticatePayload) ||
        "ADDI no permitio iniciar sesion con las credenciales configuradas."
    );
  }

  if (
    !isRecord(authenticatePayload) ||
    typeof authenticatePayload.login_ticket !== "string"
  ) {
    throw new AddiConsultaConfigError("ADDI no devolvio ticket de login.");
  }

  const ticketPage = await fetchTextFollowingRedirects(
    buildTicketAuthorizeUrl(
      { ...config, authBaseUrl },
      lockConfig,
      authenticatePayload.login_ticket
    ),
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        ...getAddiBrowserHeaders(),
      },
    },
    jar
  );
  const fields = getFormFields(ticketPage.text);
  const error = fields.get("error");
  const accessToken =
    fields.get("access_token") || getAccessTokenFromUrl(ticketPage.url);

  if (error) {
    throw new AddiConsultaConfigError(
      fields.get("error_description") || "ADDI rechazo el inicio de sesion."
    );
  }

  if (!accessToken) {
    throw new AddiConsultaConfigError("ADDI no devolvio token de acceso.");
  }

  return exchangeAuth0TokenForAddiSession(accessToken, config);
}

async function getProtectedJson(
  baseUrl: string,
  session: AddiSession,
  path: string,
  timeoutMs = 20000
) {
  const url = new URL(path.replace(/^\/+/, ""), baseUrl).toString();

  return unwrapData(
    await requestJson(
      url,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "x-addi-token": session.accessToken,
          "Content-Type": "application/json",
          ...(session.authCookie ? { Cookie: session.authCookie } : {}),
        },
      },
      { allowNotFound: true, timeoutMs }
    )
  );
}

async function postProtectedJson(
  baseUrl: string,
  session: AddiSession,
  path: string,
  body: unknown,
  timeoutMs = 20000
) {
  const url = new URL(path.replace(/^\/+/, ""), baseUrl).toString();

  return unwrapData(
    await requestJson(
      url,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "x-addi-token": session.accessToken,
          "Content-Type": "application/json",
          ...(session.authCookie ? { Cookie: session.authCookie } : {}),
        },
      },
      { allowNotFound: true, timeoutMs }
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

function describeAddiPath(path: string) {
  try {
    const url = new URL(path, "https://addi.local");

    return {
      path: url.pathname,
      queryKeys: Array.from(new Set(url.searchParams.keys())).sort(),
    };
  } catch {
    return { path, queryKeys: [] };
  }
}

function getErrorSummary(error: unknown) {
  return error instanceof Error ? error.message : String(error || "error");
}

function traceAddiRequest(
  traces: AddiRequestTrace[],
  request: { source: string; path: string },
  status: AddiRequestTrace["status"],
  data?: unknown,
  error?: unknown
) {
  const pathInfo = describeAddiPath(request.path);
  const trace: AddiRequestTrace = {
    source: request.source,
    path: pathInfo.path,
    queryKeys: pathInfo.queryKeys,
    status,
  };

  if (status === "ok") {
    trace.records = collectRecords(data, request.source).length;
  }

  if (error) {
    trace.message = getErrorSummary(error).slice(0, 180);
  }

  traces.push(trace);
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

function isTermValue(value: number | null) {
  return Boolean(
    value !== null && Number.isFinite(value) && value >= 1 && value <= 60
  );
}

function normalizeTerm(value: number | null) {
  if (!isTermValue(value)) {
    return null;
  }

  return Math.round(value as number);
}

function isInstallmentValue(value: number | null, amount?: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return false;
  }

  if (amount && amount > 0 && value >= amount) {
    return false;
  }

  return true;
}

function parseTermFromText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(
    /(?:^|[^\d])(\d{1,2})\s*(?:cuota|cuotas|mes|meses|month|months|installment|installments|payment|payments)(?:[^\d]|$)/i
  );

  if (!match) {
    return null;
  }

  return normalizeTerm(Number(match[1]));
}

function findNumberByKey(
  record: Record<string, unknown>,
  keyMatcher: (normalizedKey: string) => boolean,
  valueMatcher: (value: number | null) => boolean,
  depth = 0
): number | null {
  if (depth > 7) {
    return null;
  }

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeKey(key);

    if (keyMatcher(normalizedKey)) {
      const number = toNumber(value);

      if (valueMatcher(number)) {
        return number;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const found = findNumberByKey(
          item,
          keyMatcher,
          valueMatcher,
          depth + 1
        );
        if (found !== null) return found;
      }
      continue;
    }

    if (isRecord(value)) {
      const found = findNumberByKey(
        value,
        keyMatcher,
        valueMatcher,
        depth + 1
      );
      if (found !== null) return found;
    }
  }

  return null;
}

function findTermInText(record: Record<string, unknown>, depth = 0): number | null {
  if (depth > 7) {
    return null;
  }

  for (const value of Object.values(record)) {
    const term = parseTermFromText(value);

    if (term !== null) {
      return term;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const found = findTermInText(item, depth + 1);
        if (found !== null) return found;
      }
      continue;
    }

    if (isRecord(value)) {
      const found = findTermInText(value, depth + 1);
      if (found !== null) return found;
    }
  }

  return null;
}

function isPlanArrayKey(normalizedKey: string) {
  return (
    normalizedKey.includes("PAYMENTPLAN") ||
    normalizedKey.includes("REPAYMENT") ||
    normalizedKey.includes("AMORTIZATION") ||
    normalizedKey.includes("INSTALLMENT") ||
    normalizedKey.includes("CUOTA")
  );
}

function findPlanArrayInfo(
  record: Record<string, unknown>,
  amount: number,
  depth = 0
): { term: number | null; installment: number | null } | null {
  if (depth > 7) {
    return null;
  }

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeKey(key);

    if (
      Array.isArray(value) &&
      isPlanArrayKey(normalizedKey) &&
      value.length >= 1 &&
      value.length <= 60
    ) {
      const installment =
        value
          .map((item) => (isRecord(item) ? getInstallment(item, amount) : null))
          .find((item) => isInstallmentValue(item, amount)) ?? null;

      return {
        term: value.length,
        installment,
      };
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const found = findPlanArrayInfo(item, amount, depth + 1);
        if (found) return found;
      }
      continue;
    }

    if (isRecord(value)) {
      const found = findPlanArrayInfo(value, amount, depth + 1);
      if (found) return found;
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
      "clientId",
      "clientIdNumber",
      "clientIDNumber",
      "clientIdentificationNumber",
      "clientDocumentNumber",
      "clientNationalIdNumber",
      "clientDocument",
      "customerId",
      "customerIdNumber",
      "customerIdentificationNumber",
      "customerDocumentNumber",
      "customerDocument",
      "borrowerIdNumber",
      "userIdNumber",
    ])
  );
}

function getClientName(record: Record<string, unknown>) {
  return deepText(record, [
    "clientName",
    "clientFullName",
    "customerName",
    "customerFullName",
    "applicantName",
    "borrowerName",
    "fullName",
    "nombreCliente",
    "nombreCompleto",
  ]);
}

function getEmail(record: Record<string, unknown>) {
  return deepText(record, [
    "email",
    "emailAddress",
    "clientEmail",
    "customerEmail",
    "userEmail",
    "correo",
    "correoElectronico",
  ]);
}

function getPhone(record: Record<string, unknown>) {
  return deepText(record, [
    "phone",
    "phoneNumber",
    "clientPhone",
    "clientPhoneNumber",
    "customerPhone",
    "customerPhoneNumber",
    "cellPhone",
    "cellPhoneNumber",
    "clientCellPhone",
    "customerCellPhone",
    "mobile",
    "mobilePhone",
    "mobilePhoneNumber",
    "clientMobile",
    "customerMobile",
    "telefono",
    "celular",
  ]);
}

function getAddress(record: Record<string, unknown>) {
  return deepText(record, [
    "address",
    "addressLine",
    "addressLine1",
    "clientAddress",
    "customerAddress",
    "residenceAddress",
    "homeAddress",
    "shippingAddress",
    "billingAddress",
    "direccion",
    "direccionCliente",
    "domicilio",
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

function getAllySlug(record: Record<string, unknown>) {
  return deepText(record, [
    "allySlug",
    "allySLug",
    "allyId",
    "brandSlug",
    "merchantSlug",
  ]);
}

function getStoreSlug(record: Record<string, unknown>) {
  return deepText(record, ["storeSlug", "shopSlug", "commerceSlug"]);
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

function getReportedCreditAmount(record: Record<string, unknown>) {
  return deepNumber(record, [
    "applicationRequestedAmount",
    "applicationRequestedAmountWithoutDiscount",
    "approvedValue",
    "approvedAmount",
    "creditAmount",
    "loanAmount",
    "transactionAmount",
    "totalAmount",
    "capital",
    "value",
    "valor",
    "amount",
  ]);
}

function amountsMatch(a: number | null, b: number | null) {
  if (a === null || b === null) {
    return false;
  }

  return Math.abs(Math.round(a) - Math.round(b)) <= 1;
}

function getInstallment(record: Record<string, unknown>, amount?: number | null) {
  const exact = deepNumber(record, [
    "installmentAmount",
    "installmentValue",
    "monthlyInstallment",
    "monthlyInstallmentAmount",
    "valorCuota",
    "valorDeCuota",
    "cuota",
    "cuotaMensual",
    "montoCuota",
    "monthlyPayment",
    "monthlyPaymentAmount",
    "paymentAmount",
  ]);

  if (isInstallmentValue(exact, amount)) {
    return exact;
  }

  return findNumberByKey(
    record,
    (key) =>
      key.includes("INSTALLMENT") ||
      key.includes("CUOTA") ||
      key.includes("MONTHLYPAYMENT") ||
      key.includes("MONTHLYINSTALLMENT") ||
      key.includes("PAYMENTAMOUNT") ||
      key.includes("PAYMENTVALUE"),
    (value) => isInstallmentValue(value, amount)
  );
}

function getTerm(record: Record<string, unknown>, amount?: number | null) {
  const exact = normalizeTerm(
    deepNumber(record, [
    "installments",
    "installmentsNumber",
    "numberOfInstallments",
    "installmentCount",
    "numberOfPayments",
    "term",
    "loanTerm",
    "termInMonths",
    "months",
    "plazo",
    "numeroCuotas",
    "numCuotas",
    ])
  );

  if (exact !== null) {
    return exact;
  }

  const keyed = normalizeTerm(
    findNumberByKey(
      record,
      (key) =>
        key.includes("TERM") ||
        key.includes("PLAZO") ||
        key.includes("INSTALLMENT") ||
        key.includes("CUOTA") ||
        key.includes("MONTHS") ||
        key.includes("TERMINMONTHS") ||
        key.includes("NUMBEROFMONTHS") ||
        key.includes("PAYMENTPLAN") ||
        key.includes("PLANPAGO"),
      isTermValue
    )
  );

  if (keyed !== null) {
    return keyed;
  }

  const plan = amount ? findPlanArrayInfo(record, amount) : null;

  return plan?.term ?? findTermInText(record);
}

function inferMonthlyInstallment(amount: number, term: number | null) {
  if (!term || term <= 0 || term > 60) {
    return null;
  }

  return Math.round(amount / term);
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

function getTransactionId(record: Record<string, unknown>) {
  return deepText(record, ["transactionId", "transactionID", "id"]);
}

function getLoanId(record: Record<string, unknown>) {
  return deepText(record, [
    "loanId",
    "creditId",
    "creditoId",
    "numeroCredito",
  ]);
}

function getApplicationId(record: Record<string, unknown>) {
  return deepText(record, ["applicationId", "applicationID", "application"]);
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

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function toAddiReportDateTime(dateKey: string) {
  return `${dateKey}T05:00:00-05:00`;
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

function getAddiCandidateDetailIds(candidate: AddiCandidate) {
  return Array.from(
    new Set(
      [
        candidate.transactionId,
        candidate.ordenId,
        candidate.loanId,
        candidate.applicationId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
}

function getCandidateIdentityValues(candidate: AddiCandidate, documento: string) {
  return Array.from(
    new Set(
      [
        documento,
        candidate.transactionId,
        candidate.ordenId,
        candidate.loanId,
        candidate.applicationId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function getRecordIdentityValues(record: Record<string, unknown>) {
  return Array.from(
    new Set(
      [
        getDocument(record),
        getTransactionId(record),
        getOrderId(record),
        getLoanId(record),
        getApplicationId(record),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function recordMatchesCandidate(
  record: Record<string, unknown>,
  candidate: AddiCandidate,
  documento: string
) {
  const recordDocument = getDocument(record);

  if (recordDocument && recordDocument !== documento) {
    return false;
  }

  const candidateValues = new Set(getCandidateIdentityValues(candidate, documento));
  const sharesId = getRecordIdentityValues(record).some((value) =>
    candidateValues.has(value)
  );

  return Boolean(recordDocument || sharesId);
}

function recordContainsCandidate(
  record: Record<string, unknown>,
  candidate: AddiCandidate,
  documento: string
) {
  return collectRecords(record, "candidate-scan").some((item) =>
    recordMatchesCandidate(item.record, candidate, documento)
  );
}

function recordLooksLikeCandidateCredit(record: Record<string, unknown>) {
  return Boolean(
    getTerm(record, getReportedCreditAmount(record) ?? getAmount(record)) ||
      getInstallment(record, getReportedCreditAmount(record) ?? getAmount(record))
  );
}

function recordLikelyCandidateDetail(
  record: Record<string, unknown>,
  candidate: AddiCandidate,
  documento: string
) {
  const recordDocument = getDocument(record);

  if (recordDocument && recordDocument !== documento) {
    return false;
  }

  if (recordContainsCandidate(record, candidate, documento)) {
    return true;
  }

  const reportedAmount = getReportedCreditAmount(record) ?? getAmount(record);

  return (
    recordLooksLikeCandidateCredit(record) &&
    amountsMatch(reportedAmount, candidate.creditoAutorizado)
  );
}

function getCandidateAllySlug(candidate: AddiCandidate) {
  return candidate.allySlug || getAllySlug(candidate.record);
}

function buildAddiPaymentQuery(
  params: Record<string, string | null | undefined>,
  size = ADDI_PAYMENT_LOOKUP_PAGE_SIZE
) {
  const query = new URLSearchParams({
    page: "1",
    size: String(size),
  });

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  return query.toString();
}

function getAddiPaymentLookupPaths(candidate: AddiCandidate, documento: string) {
  const today = getDateInColombia();
  const startDate = shiftDateKey(today, -1);
  const endDate = shiftDateKey(today, 1);
  const start = toAddiReportDateTime(startDate);
  const end = toAddiReportDateTime(endDate);
  const allySlug = getCandidateAllySlug(candidate);
  const paths: string[] = [];
  const directValues = getCandidateIdentityValues(candidate, documento).slice(0, 4);

  for (const value of directValues) {
    paths.push(`/allies/payments?${buildAddiPaymentQuery({ searchField: value })}`);
  }

  if (candidate.applicationId) {
    paths.push(
      `/allies/payments?${buildAddiPaymentQuery({
        applicationId: candidate.applicationId,
      })}`
    );
  }

  if (candidate.loanId) {
    paths.push(
      `/allies/payments?${buildAddiPaymentQuery({ loanId: candidate.loanId })}`
    );
  }

  paths.push(
    `/allies/payments?${buildAddiPaymentQuery(
      {
        start,
        end,
        allyName: allySlug,
      },
      ADDI_PAYMENT_REPORT_PAGE_SIZE
    )}`,
    `/allies/payments?${buildAddiPaymentQuery(
      {
        paymentStart: start,
        paymentEnd: end,
        allyName: allySlug,
      },
      ADDI_PAYMENT_REPORT_PAGE_SIZE
    )}`
  );

  return Array.from(new Set(paths)).slice(0, 8);
}

function getAddiPaymentLookupRequests(
  candidate: AddiCandidate,
  documento: string
) {
  const paths = getAddiPaymentLookupPaths(candidate, documento);
  const requests: Array<{ source: string; path: string }> = [];

  for (const path of paths) {
    requests.push({
      source: "ally-portal-payments",
      path,
    });

    if (path.startsWith("/allies/payments?")) {
      requests.push({
        source: "ally-portal-payments-legacy",
        path: path.replace("/allies/payments?", "/payments?"),
      });
    }
  }

  return requests;
}

function getPaymentIdsFromPayloads(
  payloads: AddiPayload[],
  candidate: AddiCandidate,
  documento: string
) {
  const ids: string[] = [];
  const fallbackIds: string[] = [];

  for (const payload of payloads) {
    const records = collectRecords(payload.data, payload.source);

    for (const { record } of records) {
      const id = deepText(record, [
        "paymentId",
        "paymentID",
        "paymentUuid",
        "id",
      ]);

      if (!id) {
        continue;
      }

      if (recordMatchesCandidate(record, candidate, documento)) {
        ids.push(id);
        continue;
      }

      if (recordContainsCandidate(record, candidate, documento)) {
        ids.push(id);
      } else {
        fallbackIds.push(id);
      }
    }
  }

  const selectedIds = ids.length > 0 ? ids : fallbackIds;

  return Array.from(new Set(selectedIds)).slice(0, ids.length > 0 ? 6 : 3);
}

async function fetchAddiPaymentPayloads(
  session: AddiSession,
  candidate: AddiCandidate,
  documento: string,
  traces: AddiRequestTrace[]
) {
  const lookupRequests = getAddiPaymentLookupRequests(candidate, documento);
  const paymentListRequests: Array<Promise<AddiPayload | null>> =
    lookupRequests.map(async (request) => {
      try {
        const data = await getProtectedJson(
          ADDI_PORTAL_API_BASE_URL,
          session,
          request.path,
          6000
        );

        if (!data) {
          traceAddiRequest(traces, request, "empty");
          return null;
        }

        traceAddiRequest(traces, request, "ok", data);
        return {
          source: request.source,
          data,
        };
      } catch (error) {
        traceAddiRequest(traces, request, "error", undefined, error);
        return null;
      }
    });
  const paymentListResults = await Promise.allSettled(paymentListRequests);
  const payloads = paymentListResults
    .filter(
      (result): result is PromiseFulfilledResult<AddiPayload | null> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((payload): payload is AddiPayload => Boolean(payload));
  const paymentIds = getPaymentIdsFromPayloads(payloads, candidate, documento);
  const paymentDetailRequests: Array<Promise<AddiPayload | null>> =
    paymentIds.flatMap((paymentId) => {
      const encodedPaymentId = encodeURIComponent(paymentId);

      return [
        {
          source: "ally-portal-payment-detail",
          path: `/allies/payments/${encodedPaymentId}`,
        },
        {
          source: "ally-portal-payment-detail-legacy",
          path: `/payments/${encodedPaymentId}`,
        },
      ].map(async (request) => {
        try {
          const data = await getProtectedJson(
            ADDI_PORTAL_API_BASE_URL,
            session,
            request.path,
            6000
          );

          if (!data) {
            traceAddiRequest(traces, request, "empty");
            return null;
          }

          traceAddiRequest(traces, request, "ok", data);
          return {
            source: request.source,
            data,
          };
        } catch (error) {
          traceAddiRequest(traces, request, "error", undefined, error);
          return null;
        }
      });
    });
  const consolidateRequest =
    paymentIds.length > 0
      ? (async () => {
          const request = {
            source: "ally-portal-payments-consolidate",
            path: "/payments/reports/consolidate",
          };

          try {
            const data = await postProtectedJson(
              ADDI_PORTAL_API_BASE_URL,
              session,
              request.path,
              { paymentIds },
              8000
            );

            if (!data) {
              traceAddiRequest(traces, request, "empty");
              return null;
            }

            traceAddiRequest(traces, request, "ok", data);
            return {
              source: request.source,
              data,
            } satisfies AddiPayload;
          } catch (error) {
            traceAddiRequest(traces, request, "error", undefined, error);
            return null;
          }
        })()
      : Promise.resolve(null);
  const [paymentDetailResults, consolidateResult] = await Promise.all([
    Promise.allSettled(paymentDetailRequests),
    consolidateRequest.catch(() => null),
  ]);

  return [
    ...payloads,
    ...paymentDetailResults
      .filter(
        (result): result is PromiseFulfilledResult<AddiPayload | null> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value)
      .filter((payload): payload is AddiPayload => Boolean(payload)),
    ...(consolidateResult ? [consolidateResult] : []),
  ];
}

async function fetchAddiCandidateDetailPayloads(
  session: AddiSession,
  candidate: AddiCandidate,
  documento: string
) {
  if (candidate.numeroCuotas && candidate.valorCuota) {
    return { payloads: [], traces: [] };
  }

  const payloads: AddiPayload[] = [];
  const traces: AddiRequestTrace[] = [];
  const ids = getAddiCandidateDetailIds(candidate);
  const requests: Array<{
    source: string;
    baseUrl: string;
    path: string;
    timeoutMs: number;
    wrapData?: (data: unknown) => unknown;
  }> = [];

  for (const id of ids) {
    const encoded = encodeURIComponent(id);

    requests.push(
      {
        source: "ally-portal-transaction-detail",
        baseUrl: ADDI_PORTAL_API_BASE_URL,
        path: `/transactions/${encoded}`,
        timeoutMs: 7000,
      },
      {
        source: "ally-portal-external-transaction-detail",
        baseUrl: ADDI_PORTAL_EXTERNAL_API_BASE_URL,
        path: `/v1/transactions/${encoded}`,
        timeoutMs: 7000,
      }
    );
  }

  const applicationId = candidate.applicationId || candidate.ordenId;
  const allySlug = getCandidateAllySlug(candidate);

  if (applicationId && allySlug) {
    const query = new URLSearchParams({
      applicationId,
      allySlug,
    });

    requests.push({
      source: "ally-portal-external-balance",
      baseUrl: ADDI_PORTAL_EXTERNAL_API_BASE_URL,
      path: `/v1/balance?${query.toString()}`,
      timeoutMs: 7000,
      wrapData: (balance) => ({
        applicationId,
        allySlug,
        balance,
      }),
    });
  }

  if (allySlug) {
    requests.push({
      source: "addi-paylink-contact-info",
      baseUrl: getAddiPaylinkBaseUrl(),
      path: `/payment-links/customers/${encodeURIComponent(
        allySlug
      )}/${encodeURIComponent(documento)}/contact-info`,
      timeoutMs: 7000,
      wrapData: (contact) =>
        isRecord(contact)
          ? {
              nationalIdNumber: documento,
              allySlug,
              ...contact,
            }
          : {
              nationalIdNumber: documento,
              allySlug,
              contact,
            },
    });
  }

  const [detailResults, paymentPayloads] = await Promise.all([
    Promise.allSettled(
      requests.map(async (request) => {
        try {
          const data = await getProtectedJson(
            request.baseUrl,
            session,
            request.path,
            request.timeoutMs
          );

          if (!data) {
            traceAddiRequest(traces, request, "empty");
            return null;
          }

          const wrappedData = request.wrapData ? request.wrapData(data) : data;
          traceAddiRequest(traces, request, "ok", wrappedData);
          return {
            source: request.source,
            data: wrappedData,
          } satisfies AddiPayload;
        } catch (error) {
          traceAddiRequest(traces, request, "error", undefined, error);
          return null;
        }
      })
    ),
    fetchAddiPaymentPayloads(session, candidate, documento, traces),
  ]);

  for (const result of detailResults) {
    if (result.status === "fulfilled" && result.value) {
      payloads.push(result.value);
    }
  }

  payloads.push(...paymentPayloads);

  return { payloads, traces };
}

function mergeCandidateDetails(
  candidate: AddiCandidate,
  payloads: AddiPayload[],
  documento: string
) {
  if (payloads.length === 0) {
    return candidate;
  }

  const allRecords = payloads.flatMap((payload) =>
    collectRecords(payload.data, payload.source)
  );
  let merged = { ...candidate };

  for (const { record } of allRecords) {
    if (
      !recordMatchesCandidate(record, candidate, documento) &&
      !recordLikelyCandidateDetail(record, candidate, documento)
    ) {
      continue;
    }

    const amount =
      getReportedCreditAmount(record) ??
      getAmount(record) ??
      candidate.creditoAutorizado;
    const plan = findPlanArrayInfo(record, amount);
    const numeroCuotas =
      candidate.numeroCuotas ?? plan?.term ?? getTerm(record, amount);
    const valorCuota =
      candidate.valorCuota ??
      plan?.installment ??
      getInstallment(record, amount) ??
      inferMonthlyInstallment(candidate.creditoAutorizado, numeroCuotas);

    merged = {
      ...merged,
      clienteNombre: merged.clienteNombre ?? getClientName(record),
      correoElectronico: merged.correoElectronico ?? getEmail(record),
      telefonoCliente: merged.telefonoCliente ?? getPhone(record),
      direccionCliente: merged.direccionCliente ?? getAddress(record),
      allySlug: merged.allySlug ?? getAllySlug(record),
      storeSlug: merged.storeSlug ?? getStoreSlug(record),
      numeroCuotas,
      valorCuota,
    };

    if (merged.numeroCuotas && merged.valorCuota) {
      return merged;
    }
  }

  return merged;
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
      const numeroCuotas = getTerm(record, creditoAutorizado);
      const valorCuota =
        getInstallment(record, creditoAutorizado) ??
        inferMonthlyInstallment(creditoAutorizado, numeroCuotas);

      candidates.push({
        record,
        source,
        clienteNombre: getClientName(record),
        correoElectronico: getEmail(record),
        telefonoCliente: getPhone(record),
        direccionCliente: getAddress(record),
        fechaCreacionCredito: parsedDate.dateKey || fechaCreacionCredito,
        puntoCredito: getStoreName(record),
        creditoAutorizado,
        numeroCuotas,
        valorCuota,
        estado: getStatus(record),
        ordenId: getOrderId(record),
        transactionId: getTransactionId(record),
        loanId: getLoanId(record),
        applicationId: getApplicationId(record),
        allySlug: getAllySlug(record),
        storeSlug: getStoreSlug(record),
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

function getRelevantDebugKeys(record: Record<string, unknown>) {
  return Object.keys(record)
    .filter((key) => {
      const normalized = normalizeKey(key);

      return (
        normalized.includes("AMOUNT") ||
        normalized.includes("APPLICATION") ||
        normalized.includes("ADDRESS") ||
        normalized.includes("BALANCE") ||
        normalized.includes("CUOTA") ||
        normalized.includes("DIRECCION") ||
        normalized.includes("EMAIL") ||
        normalized.includes("INSTALLMENT") ||
        normalized.includes("LOAN") ||
        normalized.includes("MONTH") ||
        normalized.includes("PAYMENT") ||
        normalized.includes("PHONE") ||
        normalized.includes("PLAN") ||
        normalized.includes("PLAZO") ||
        normalized.includes("TERM") ||
        normalized.includes("VALUE") ||
        normalized.includes("VALOR")
      );
    })
    .slice(0, 25);
}

function describeDetailPayloads(
  payloads: AddiPayload[],
  candidate: AddiCandidate,
  documento: string
) {
  return payloads.map((payload) => {
    const records = collectRecords(payload.data, payload.source);
    const matchedRecords = records.filter((item) =>
      recordMatchesCandidate(item.record, candidate, documento)
    );
    const relevantKeys = Array.from(
      new Set(matchedRecords.flatMap((item) => getRelevantDebugKeys(item.record)))
    ).slice(0, 30);

    return {
      source: payload.source,
      records: records.length,
      matchedRecords: matchedRecords.length,
      relevantKeys,
    };
  });
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
      session,
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
      session,
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

  const detailLookup = await fetchAddiCandidateDetailPayloads(
    session,
    selectedCandidate,
    documento
  );
  const detailPayloads = detailLookup.payloads;
  const enrichedCandidate = mergeCandidateDetails(
    selectedCandidate,
    detailPayloads,
    documento
  );

  if (!enrichedCandidate.numeroCuotas || !enrichedCandidate.valorCuota) {
    console.info("ADDI credito sin cuota o plazo en payloads consultados", {
      documento: maskDocumento(documento),
      origen: enrichedCandidate.source,
      contexto: {
        idsDetalle: getAddiCandidateDetailIds(selectedCandidate).length,
        tieneApplicationId: Boolean(selectedCandidate.applicationId),
        tieneLoanId: Boolean(selectedCandidate.loanId),
        tieneOrdenId: Boolean(selectedCandidate.ordenId),
        tieneTransactionId: Boolean(selectedCandidate.transactionId),
        tieneAllySlug: Boolean(getCandidateAllySlug(selectedCandidate)),
      },
      intentos: detailLookup.traces,
      fuentes: describeDetailPayloads(
        detailPayloads,
        selectedCandidate,
        documento
      ),
    });
  }

  return {
    documento,
    financiera: "ADDI",
    clienteNombre: enrichedCandidate.clienteNombre,
    correoElectronico: enrichedCandidate.correoElectronico,
    telefonoCliente: enrichedCandidate.telefonoCliente,
    direccionCliente: enrichedCandidate.direccionCliente,
    fechaCreacionCredito: enrichedCandidate.fechaCreacionCredito,
    puntoCredito: enrichedCandidate.puntoCredito,
    creditoAutorizado: enrichedCandidate.creditoAutorizado,
    numeroCuotas: enrichedCandidate.numeroCuotas,
    valorCuota: enrichedCandidate.valorCuota,
    frecuenciaCuota: "MENSUAL",
    encontradoEnAddi: true,
    estado: enrichedCandidate.estado,
    ordenId: enrichedCandidate.ordenId,
    origen: enrichedCandidate.source,
  };
}
