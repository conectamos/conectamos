import * as XLSX from "xlsx";

const ALO_DEFAULT_REPORT_URL = "https://consola.alocredit.co/admin_reportes";
const ALO_LOGIN_PATH = "/login";
const ALO_REPORT_PATH = "/admin_reportes";
const ALO_REPORT_CACHE_MS = 60_000;
const COLOMBIA_CURRENCY = "COP";

type CookieJar = Map<string, string>;

type HtmlForm = {
  action: string;
  method: string;
  fields: URLSearchParams;
  html: string;
};

type DownloadCandidate = {
  url: string;
  score: number;
  method?: "GET" | "POST";
  body?: URLSearchParams;
};

type MatrixCell = string | number | boolean | Date | null | undefined;
type ReportSource = Buffer | string;

type CachedReport = {
  source: ReportSource;
  expiresAt: number;
};

export type AloCreditoImei = {
  imei: string;
  financiera: "ALO CREDIT";
  clienteNombre: string | null;
  documento: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  creditoAutorizado: number;
  valorCuota: number | null;
  numeroCuotas: number | null;
  frecuenciaCuota: "CATORCENAL";
  valorAccesorios: number | null;
  observacionAccesorios: string | null;
  moneda: string | null;
  origen: string;
};

export class AloConsultaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AloConsultaConfigError";
  }
}

export class AloConsultaLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AloConsultaLookupError";
  }
}

let cachedReport: CachedReport | null = null;

function normalizeImei(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
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

function visibleText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isHtmlResponse(buffer: Buffer) {
  return /^\s*<!doctype html|^\s*<html/i.test(
    buffer.subarray(0, 300).toString("utf8")
  );
}

function parseAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  let raw = String(value ?? "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");

  if (!raw || raw === "-" || raw === "." || raw === ",") {
    return null;
  }

  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    raw = raw
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    const decimals = raw.length - lastComma - 1;
    raw =
      decimals > 0 && decimals <= 2
        ? raw.replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = raw.length - lastDot - 1;
    raw = decimals > 0 && decimals <= 2 ? raw : raw.replace(/\./g, "");
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseTerm(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 2);
  }

  const text = normalizeText(value);
  const number = Number(text.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  if (
    text.includes("CATORCEN") ||
    text.includes("QUINCEN") ||
    text.includes("CUOTA")
  ) {
    return Math.round(number);
  }

  return Math.round(number * 2);
}

function getCredentials() {
  const url = String(process.env.ALOCONSULTA_URL || ALO_DEFAULT_REPORT_URL).trim();
  const usuario = String(process.env.ALOCONSULTA_USUARIO || "").trim();
  const clave = String(process.env.ALOCONSULTA_CLAVE || "").trim();

  if (!url || !usuario || !clave) {
    throw new AloConsultaConfigError(
      "Falta configurar ALOCONSULTA_URL, ALOCONSULTA_USUARIO y ALOCONSULTA_CLAVE."
    );
  }

  let configuredUrl: URL;

  try {
    configuredUrl = new URL(url);
  } catch {
    throw new AloConsultaConfigError("ALOCONSULTA_URL no es una URL valida.");
  }

  const reportUrl =
    configuredUrl.pathname.replace(/\/+$/, "") === ALO_REPORT_PATH
      ? configuredUrl
      : new URL(ALO_REPORT_PATH, configuredUrl.origin);

  return {
    reportUrl,
    loginUrl: new URL(ALO_LOGIN_PATH, configuredUrl.origin),
    usuario,
    clave,
  };
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
  timeoutMs = 25000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  const cookieHeader = getCookieHeader(jar);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    storeResponseCookies(response.headers, jar);

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
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

  throw new AloConsultaLookupError("ALO CREDIT excedio los redireccionamientos.");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getHtmlAttribute(tag: string, attribute: string) {
  const match = tag.match(
    new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );

  return decodeHtml(match?.[2] || match?.[3] || match?.[4] || "");
}

function getHtmlAttributes(tag: string) {
  const attributes = new Map<string, string>();

  for (const match of tag.matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
  )) {
    attributes.set(
      match[1].toLowerCase(),
      decodeHtml(match[3] || match[4] || match[5] || "")
    );
  }

  return attributes;
}

function parseForms(html: string, baseUrl: string): HtmlForm[] {
  const forms: HtmlForm[] = [];
  const formRegex = /<form\b[^>]*>[\s\S]*?<\/form>/gi;

  for (const match of html.matchAll(formRegex)) {
    const formHtml = match[0];
    const openTag = formHtml.match(/<form\b[^>]*>/i)?.[0] || "";
    const action = getHtmlAttribute(openTag, "action") || baseUrl;
    const method = (getHtmlAttribute(openTag, "method") || "GET").toUpperCase();
    const fields = new URLSearchParams();

    for (const input of formHtml.matchAll(/<input\b[^>]*>/gi)) {
      const tag = input[0];
      const name = getHtmlAttribute(tag, "name");
      const type = getHtmlAttribute(tag, "type").toLowerCase();

      if (!name || ["submit", "button", "image", "file"].includes(type)) {
        continue;
      }

      fields.set(name, getHtmlAttribute(tag, "value"));
    }

    for (const select of formHtml.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)) {
      const tag = select[0].match(/<select\b[^>]*>/i)?.[0] || "";
      const name = getHtmlAttribute(tag, "name");

      if (!name) {
        continue;
      }

      const selected =
        select[0].match(/<option\b[^>]*selected[^>]*>/i)?.[0] ||
        select[0].match(/<option\b[^>]*>/i)?.[0] ||
        "";

      fields.set(
        name,
        getHtmlAttribute(selected, "value") ||
          decodeHtml(selected.replace(/<[^>]*>/g, " ").trim())
      );
    }

    for (const textarea of formHtml.matchAll(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi)) {
      const tag = textarea[0].match(/<textarea\b[^>]*>/i)?.[0] || "";
      const name = getHtmlAttribute(tag, "name");

      if (!name) {
        continue;
      }

      fields.set(
        name,
        decodeHtml(textarea[0].replace(/^[\s\S]*?>/, "").replace(/<\/textarea>$/i, ""))
      );
    }

    forms.push({
      action: new URL(action, baseUrl).toString(),
      method,
      fields,
      html: formHtml,
    });
  }

  return forms;
}

function todayBogota() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function formatDateParts(date: Date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return { year, month, day };
}

function slashFromParts(parts: { year: string; month: string; day: string }) {
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function dashFromParts(parts: { year: string; month: string; day: string }) {
  return `${parts.day}-${parts.month}-${parts.year}`;
}

function isoFromParts(parts: { year: string; month: string; day: string }) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function reportDateDefaults() {
  const today = todayBogota();

  return {
    start: `01/01/${today.year}`,
    startIso: `${today.year}-01-01`,
    end: slashFromParts(today),
    endIso: isoFromParts(today),
  };
}

function currentWeeklyReportDates() {
  const today = todayBogota();
  const todayDate = new Date(
    Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day))
  );
  const day = todayDate.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startDate = new Date(todayDate);

  startDate.setUTCDate(todayDate.getUTCDate() - daysSinceMonday);

  return {
    start: formatDateParts(startDate),
    end: today,
  };
}

function findSearchSubmitControl(formHtml: string) {
  const controls = formHtml.match(
    /<button\b[^>]*>[\s\S]*?<\/button>|<input\b[^>]*>/gi
  ) ?? [];

  return (
    controls.find((control) => {
      const normalized = normalizeText(control.replace(/<[^>]*>/g, " "));
      const attributes = normalizeText(Array.from(getHtmlAttributes(control).values()).join(" "));

      return (
        normalized.includes("BUSCAR") ||
        normalized.includes("CONSULT") ||
        attributes.includes("BUSCAR") ||
        attributes.includes("CONSULT")
      );
    }) || null
  );
}

function applySearchSubmit(fields: URLSearchParams, formHtml: string) {
  const control = findSearchSubmitControl(formHtml);

  if (!control) {
    return;
  }

  const attributes = getHtmlAttributes(control);
  const name = attributes.get("name");

  if (name) {
    fields.set(name, attributes.get("value") || normalizeText(control.replace(/<[^>]*>/g, " ")) || "1");
  }
}

function applyReportDateDefaults(fields: URLSearchParams, formHtml: string) {
  const defaults = reportDateDefaults();
  const dateInputs = Array.from(formHtml.matchAll(/<input\b[^>]*>/gi));
  let hasStartField = false;
  let hasEndField = false;

  for (const input of dateInputs) {
    const attributes = getHtmlAttributes(input[0]);
    const name = attributes.get("name");

    if (!name) {
      continue;
    }

    const key = normalizeKey(
      `${name} ${attributes.get("id") || ""} ${attributes.get("placeholder") || ""}`
    );
    const dateValue =
      (attributes.get("type") || "").toLowerCase() === "date"
        ? {
            start: defaults.startIso,
            end: defaults.endIso,
          }
        : {
            start: defaults.start,
            end: defaults.end,
          };

    if (
      key.includes("FECHAINICIO") ||
      key.includes("FECHAINICIAL") ||
      key.includes("FECHAINI") ||
      key.includes("DESDE") ||
      key.includes("INICIO") ||
      key.includes("INICIAL") ||
      key.includes("START")
    ) {
      hasStartField = true;
      if (!fields.get(name)) {
        fields.set(name, dateValue.start);
      }
    }

    if (
      key.includes("FECHAFIN") ||
      key.includes("FECHAFINAL") ||
      key.includes("HASTA") ||
      key.includes("FIN") ||
      key.includes("FINAL") ||
      key.includes("END")
    ) {
      hasEndField = true;
      if (!fields.get(name)) {
        fields.set(name, dateValue.end);
      }
    }
  }

  const fallbackPairs = [
    ["fecha_inicio", defaults.start],
    ["fecha_fin", defaults.end],
    ["fechaInicio", defaults.start],
    ["fechaFin", defaults.end],
    ["fechaInicial", defaults.start],
    ["fechaFinal", defaults.end],
    ["fecha_ini", defaults.start],
    ["fecha_fin", defaults.end],
  ];

  for (const [key, value] of fallbackPairs) {
    if (
      (!hasStartField && value === defaults.start) ||
      (!hasEndField && value === defaults.end)
    ) {
      fields.set(key, value);
    }
  }
}

function looksLikeLoginPage(html: string) {
  return /name=["']_username["']/i.test(html) || /id=["']inputPassword["']/i.test(html);
}

async function loginAlo() {
  const config = getCredentials();
  const jar: CookieJar = new Map();
  const loginPage = await fetchTextFollowingRedirects(
    config.loginUrl.toString(),
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    },
    jar
  );
  const loginForm = parseForms(loginPage.text, loginPage.url)[0];
  const fields = loginForm?.fields ?? new URLSearchParams();

  fields.set("_username", config.usuario);
  fields.set("_password", config.clave);

  if (!fields.has("_csrf_token")) {
    fields.set("_csrf_token", "csrf-token");
  }

  const loginResponse = await fetchTextFollowingRedirects(
    loginForm?.action || config.loginUrl.toString(),
    {
      method: loginForm?.method === "GET" ? "GET" : "POST",
      body: loginForm?.method === "GET" ? undefined : fields,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: loginPage.url,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    },
    jar
  );

  if (looksLikeLoginPage(loginResponse.text)) {
    throw new AloConsultaConfigError(
      "ALO CREDIT no permitio iniciar sesion con las credenciales configuradas."
    );
  }

  return { jar, reportUrl: config.reportUrl };
}

function hasDownloadSignal(normalized: string) {
  return (
    normalized.includes("DESCARG") ||
    normalized.includes("DOWNLOAD") ||
    normalized.includes("EXCEL") ||
    normalized.includes("XLS") ||
    normalized.includes("EXPORT") ||
    normalized.includes("CSV") ||
    normalized.includes("ARCHIVO")
  );
}

function scoreDownloadCandidate(text: string, href: string) {
  const normalized = normalizeText(`${text} ${href}`);

  if (normalized.includes("CERRAR SESION") || normalized.includes("LOGOUT")) {
    return 0;
  }

  if (!hasDownloadSignal(normalized)) {
    return 0;
  }

  let score = 0;

  if (normalized.includes("DESCARG")) score += 50;
  if (normalized.includes("DOWNLOAD")) score += 50;
  if (normalized.includes("EXCEL")) score += 35;
  if (normalized.includes("XLS")) score += 35;
  if (normalized.includes("EXPORT")) score += 25;
  if (normalized.includes("CSV")) score += 20;
  if (normalized.includes("ARCHIVO")) score += 15;
  if (normalized.includes("REPORTE")) score += 5;

  return score;
}

function maskDebugText(value: string, maxLength = 220) {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "***@***")
    .replace(/\d/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function firstTableRows(html: string, maxRows = 3) {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)).map(
    (match) => match[0]
  );

  return rows
    .filter((row) => normalizeText(row.replace(/<[^>]*>/g, " ")).length > 0)
    .slice(0, maxRows);
}

function debugHtmlRows(html: string, maxRows = 4) {
  return firstTableRows(html, maxRows)
    .map((row) => maskDebugText(row))
    .filter(Boolean);
}

function logAloInfo(message: string, data: Record<string, unknown>) {
  console.info(`${message} ${JSON.stringify(data)}`);
}

function candidateKey(candidate: DownloadCandidate) {
  const body = candidate.body
    ? Array.from(candidate.body.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join("&")
    : "";

  return `${candidate.method || "GET"} ${candidate.url} ${body}`;
}

function dedupeDownloadCandidates(candidates: DownloadCandidate[]) {
  const byKey = new Map<string, DownloadCandidate>();

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const current = byKey.get(key);

    if (!current || candidate.score > current.score) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.score - a.score);
}

function isSamePathWithoutQuery(candidate: DownloadCandidate, pageUrl: string) {
  if ((candidate.method || "GET") !== "GET" || candidate.body?.toString()) {
    return false;
  }

  try {
    const candidateUrl = new URL(candidate.url, pageUrl);
    const currentUrl = new URL(pageUrl);

    return (
      candidateUrl.origin === currentUrl.origin &&
      candidateUrl.pathname.replace(/\/+$/, "") ===
        currentUrl.pathname.replace(/\/+$/, "") &&
      !candidateUrl.search
    );
  } catch {
    return false;
  }
}

function pushCandidate(
  candidates: DownloadCandidate[],
  baseUrl: string,
  rawUrl: string,
  scoreSource: string,
  scoreBonus = 0,
  options: Pick<DownloadCandidate, "method" | "body"> = {}
) {
  if (
    !rawUrl ||
    rawUrl === "#" ||
    /^javascript:/i.test(rawUrl)
  ) {
    return;
  }

  const score = scoreDownloadCandidate(scoreSource, rawUrl) + scoreBonus;

  if (score <= 0) {
    return;
  }

  candidates.push({
    url: new URL(rawUrl, baseUrl).toString(),
    method: options.method,
    body: options.body,
    score,
  });
}

function extractQuotedUrls(value: string) {
  return Array.from(value.matchAll(/["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((item) => /^(?:https?:)?\/\//i.test(item) || item.startsWith("/"));
}

function pushFunctionRouteCandidates(
  candidates: DownloadCandidate[],
  baseUrl: string,
  value: string,
  signalSource = value,
  scoreBonus = 0
) {
  const normalized = normalizeText(`${signalSource} ${value}`);

  if (!hasDownloadSignal(normalized)) {
    return;
  }

  const functionMatch = value.match(
    /\b([A-Za-z_$][\w$]*)\s*\(([\s\S]*?)\)/
  );
  const args = functionMatch?.[2] || value;
  const explicitUrls = extractQuotedUrls(args);

  for (const rawUrl of explicitUrls) {
    pushCandidate(candidates, baseUrl, rawUrl, value, scoreBonus);
  }

  const id = args.match(/\b\d{1,12}\b/)?.[0];

  if (!id) {
    return;
  }

  for (const rawUrl of [
    `/admin_reportes/descargar/${id}`,
    `/admin_reportes/download/${id}`,
    `/admin_reportes/exportar/${id}`,
    `/admin_reportes/excel/${id}`,
    `/admin_reportes/reporte/${id}`,
    `/admin_reportes/${id}/descargar`,
    `/admin_reportes/${id}/download`,
    `/admin_reportes/${id}/exportar`,
    `/admin_reportes/${id}/excel`,
    `/admin_facturacion/${id}`,
    `/admin_facturacion/descargar/${id}`,
    `/admin_facturacion/download/${id}`,
    `/admin_facturacion/${id}/descargar`,
  ]) {
    pushCandidate(candidates, baseUrl, rawUrl, `${signalSource} ${value}`, scoreBonus - 5);
  }
}

function extractAttributeUrlCandidates(
  html: string,
  baseUrl: string,
  scoreBonus = 0
) {
  const candidates: DownloadCandidate[] = [];
  const tagRegex = /<(a|button|input)\b[^>]*(?:>[\s\S]*?<\/\1>)?/gi;

  for (const match of html.matchAll(tagRegex)) {
    const tagHtml = match[0];
    const attributes = getHtmlAttributes(tagHtml);
    const scoreSource = `${tagHtml} ${Array.from(attributes.values()).join(" ")}`;
    const tagSignal = `${scoreSource} ${tagHtml.replace(/<[^>]*>/g, " ")}`;

    for (const attribute of [
      "href",
      "data-url",
      "data-href",
      "data-download",
      "data-route",
      "data-action",
      "formaction",
    ]) {
      const rawUrl = attributes.get(attribute);

      if (rawUrl) {
        if (/^javascript:/i.test(rawUrl)) {
          pushFunctionRouteCandidates(candidates, baseUrl, rawUrl, tagSignal, scoreBonus);
        }

        pushCandidate(candidates, baseUrl, rawUrl, scoreSource, scoreBonus);
      }
    }

    const onclick = attributes.get("onclick");

    if (onclick) {
      pushFunctionRouteCandidates(candidates, baseUrl, onclick, tagSignal, scoreBonus);
    }
  }

  return candidates;
}

function extractJavascriptUrls(html: string, baseUrl: string) {
  const candidates: DownloadCandidate[] = [];
  const onclickRegex =
    /(?:onclick|data-url|data-href|data-download|data-route|formaction)\s*=\s*("([^"]+)"|'([^']+)')/gi;

  for (const match of html.matchAll(onclickRegex)) {
    const value = decodeHtml(match[2] || match[3] || "");
    const urlMatches = [
      value.match(
        /(?:window\.open|location\.href|location\.assign|location\.replace)\s*\(\s*['"]([^'"]+)['"]/i
      ),
      value.match(/(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i),
      value.match(/(?:href|url)\s*[:=]\s*['"]([^'"]+)['"]/i),
    ].filter(Boolean) as RegExpMatchArray[];

    for (const urlMatch of urlMatches) {
      pushCandidate(candidates, baseUrl, urlMatch[1], value);
    }

    pushFunctionRouteCandidates(candidates, baseUrl, value);
  }

  return candidates;
}

function findSubmitControlCandidates(form: HtmlForm, baseUrl: string) {
  const candidates: DownloadCandidate[] = [];
  const controlRegex =
    /<button\b[^>]*>[\s\S]*?<\/button>|<input\b[^>]*>/gi;

  for (const match of form.html.matchAll(controlRegex)) {
    const controlHtml = match[0];
    const attributes = getHtmlAttributes(controlHtml);
    const type = (attributes.get("type") || "submit").toLowerCase();

    if (["button", "reset", "file"].includes(type)) {
      continue;
    }

    const action = attributes.get("formaction") || form.action;
    const method = (
      attributes.get("formmethod") ||
      form.method ||
      "GET"
    ).toUpperCase();
    const fields = new URLSearchParams(form.fields);
    const name = attributes.get("name");

    if (name) {
      fields.set(name, attributes.get("value") || "1");
    }

    const scoreSource = `${form.html} ${controlHtml}`;
    const score = scoreDownloadCandidate(scoreSource, action) + 10;

    if (score <= 10) {
      continue;
    }

    candidates.push({
      url: new URL(action, baseUrl).toString(),
      method: method === "POST" ? "POST" : "GET",
      body: fields,
      score,
    });
  }

  return candidates;
}

function findDownloadFormCandidates(html: string, baseUrl: string) {
  const candidates: DownloadCandidate[] = [];

  parseForms(html, baseUrl).forEach((form) => {
    const score = scoreDownloadCandidate(form.html, form.action);

    if (score > 0) {
      candidates.push({
        url: form.action,
        method: form.method === "GET" ? "GET" : "POST",
        body: new URLSearchParams(form.fields),
        score,
      });
    }

    candidates.push(...findSubmitControlCandidates(form, baseUrl));
  });

  return candidates;
}

function findDownloadCandidates(
  html: string,
  baseUrl: string,
  options: { includeFirstRows?: boolean } = {}
) {
  const candidates: DownloadCandidate[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1]);
    const text = match[2].replace(/<[^>]*>/g, " ");

    if (/^javascript:/i.test(href)) {
      pushFunctionRouteCandidates(candidates, baseUrl, href, text);
      continue;
    }

    pushCandidate(candidates, baseUrl, href, text);
  }

  candidates.push(...extractAttributeUrlCandidates(html, baseUrl));
  candidates.push(...extractJavascriptUrls(html, baseUrl));
  candidates.push(...findDownloadFormCandidates(html, baseUrl));

  if (options.includeFirstRows !== false) {
    for (const row of firstTableRows(html, 12)) {
      candidates.push(
        ...findDownloadCandidates(row, baseUrl, {
          includeFirstRows: false,
        }).map((candidate) => ({
          ...candidate,
          score: candidate.score + 20,
        }))
      );
    }
  }

  return dedupeDownloadCandidates(candidates).filter(
    (candidate) => !isSamePathWithoutQuery(candidate, baseUrl)
  );
}

function htmlRowText(row: string) {
  return normalizeText(row.replace(/<[^>]*>/g, " "));
}

function looksLikeWeeklyReportRow(row: string) {
  const text = htmlRowText(row);
  const dateMatches = text.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g) ?? [];

  return text.includes("DESCARG") && dateMatches.length >= 2;
}

function extractRowDates(row: string) {
  return htmlRowText(row).match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g)?.slice(0, 2) ?? [];
}

function slashDate(date: string) {
  return date.replace(/-/g, "/");
}

function isoDate(date: string) {
  const match = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (!match) {
    return date;
  }

  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function datePairsForRange(startDate: string, endDate: string) {
  return [
    [startDate, endDate],
    [slashDate(startDate), slashDate(endDate)],
    [isoDate(startDate), isoDate(endDate)],
  ];
}

function buildDateScopedCandidates(
  candidate: DownloadCandidate,
  startDate: string,
  endDate: string
) {
  const candidates: DownloadCandidate[] = [candidate];
  const datePairs = datePairsForRange(startDate, endDate);
  const keyPairs = [
    ["fecha_inicio", "fecha_fin"],
    ["fechaInicio", "fechaFin"],
    ["fechaInicial", "fechaFinal"],
    ["fecha_ini", "fecha_fin"],
    ["fecha_inicial", "fecha_final"],
    ["fechaDesde", "fechaHasta"],
    ["desde", "hasta"],
    ["inicio", "fin"],
    ["start", "end"],
  ];

  for (const [inicio, fin] of datePairs) {
    for (const [inicioKey, finKey] of keyPairs) {
      const body = new URLSearchParams(candidate.body);
      body.set(inicioKey, inicio);
      body.set(finKey, fin);

      candidates.push({
        ...candidate,
        method: candidate.method || "GET",
        body,
        score: candidate.score + 25,
      });
    }
  }

  return candidates;
}

function directWeeklyDownloadCandidates(baseUrl: string) {
  const { start, end } = currentWeeklyReportDates();
  const startDash = dashFromParts(start);
  const endDash = dashFromParts(end);
  const bases: DownloadCandidate[] = [
    {
      url: new URL("/admin_facturacion", baseUrl).toString(),
      method: "GET",
      score: 240,
    },
    {
      url: new URL("/admin_facturacion", baseUrl).toString(),
      method: "POST",
      score: 235,
    },
    {
      url: new URL("/admin_reportes/descargar", baseUrl).toString(),
      method: "GET",
      score: 210,
    },
    {
      url: new URL("/admin_reportes/descargar", baseUrl).toString(),
      method: "POST",
      score: 205,
    },
    {
      url: new URL("/admin_reportes/download", baseUrl).toString(),
      method: "GET",
      score: 200,
    },
  ];

  return dedupeDownloadCandidates(
    bases.flatMap((candidate) =>
      buildDateScopedCandidates(candidate, startDash, endDash)
    )
  );
}

function findWeeklyReportDownloadCandidates(html: string, baseUrl: string) {
  const row = firstTableRows(html, 80).find(looksLikeWeeklyReportRow);

  if (!row) {
    return directWeeklyDownloadCandidates(baseUrl);
  }

  const rowDates = extractRowDates(row);
  const baseCandidates = findDownloadCandidates(row, baseUrl, {
    includeFirstRows: false,
  });
  const rowCandidates = (
    baseCandidates.length > 0
      ? baseCandidates
      : [
          {
            url: new URL("/admin_facturacion", baseUrl).toString(),
            method: "GET" as const,
            score: 80,
          },
          {
            url: new URL("/admin_reportes/descargar", baseUrl).toString(),
            method: "GET" as const,
            score: 70,
          },
        ]
  ).map((candidate) => ({
    ...candidate,
    score: candidate.score + 150,
  }));

  if (rowDates.length < 2) {
    return dedupeDownloadCandidates(rowCandidates);
  }

  return dedupeDownloadCandidates(
    rowCandidates.flatMap((candidate) =>
      buildDateScopedCandidates(candidate, rowDates[0], rowDates[1])
    )
  );
}

function describeDownloadCandidate(candidate: DownloadCandidate) {
  try {
    const url = new URL(candidate.url);

    return {
      path: url.pathname,
      queryKeys: Array.from(url.searchParams.keys()).sort(),
      method: candidate.method || "GET",
      bodyKeys: candidate.body ? Array.from(candidate.body.keys()).sort() : [],
      score: candidate.score,
    };
  } catch {
    return {
      path: candidate.url.slice(0, 80),
      queryKeys: [],
      method: candidate.method || "GET",
      bodyKeys: candidate.body ? Array.from(candidate.body.keys()).sort() : [],
      score: candidate.score,
    };
  }
}

function chooseConsultForm(forms: HtmlForm[]) {
  return (
    forms.find((form) => {
      const normalized = normalizeText(`${form.action} ${form.html}`);
      return (
        !normalized.includes("_USERNAME") &&
        (normalized.includes("CONSULT") ||
          normalized.includes("BUSCAR") ||
          normalized.includes("REPORTE"))
      );
    }) ||
    forms.find((form) => !normalizeText(form.html).includes("_USERNAME")) ||
    null
  );
}

async function getConsultedReportsPage(jar: CookieJar, reportUrl: URL) {
  const page = await fetchTextFollowingRedirects(
    reportUrl.toString(),
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    },
    jar
  );

  if (looksLikeLoginPage(page.text)) {
    throw new AloConsultaConfigError("La sesion de ALO CREDIT no quedo activa.");
  }

  const forms = parseForms(page.text, page.url);
  const consultForm = chooseConsultForm(forms);

  if (!consultForm) {
    return page;
  }

  const fields = new URLSearchParams(consultForm.fields);

  applyReportDateDefaults(fields, consultForm.html);
  applySearchSubmit(fields, consultForm.html);

  const action = new URL(consultForm.action);

  if (consultForm.method === "GET") {
    for (const [key, value] of fields) {
      action.searchParams.set(key, value);
    }
  }

  const result = await fetchTextFollowingRedirects(
    action.toString(),
    {
      method: consultForm.method === "GET" ? "GET" : "POST",
      body: consultForm.method === "GET" ? undefined : fields,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: page.url,
      },
    },
    jar
  );

  console.info("ALO CREDIT consulta reporte semanal", {
    actionPath: action.pathname,
    method: consultForm.method === "GET" ? "GET" : "POST",
    fieldKeys: Array.from(fields.keys()).sort(),
    rows: firstTableRows(result.text, 10).length,
    muestras: debugHtmlRows(result.text),
  });
  logAloInfo("ALO CREDIT consulta reporte semanal detalle", {
    actionPath: action.pathname,
    method: consultForm.method === "GET" ? "GET" : "POST",
    fieldKeys: Array.from(fields.keys()).sort(),
    rows: firstTableRows(result.text, 10).length,
    muestras: debugHtmlRows(result.text),
  });

  return result;
}

async function fetchReportBufferFromUrl(
  jar: CookieJar,
  candidate: DownloadCandidate,
  referer: string
) {
  const url = new URL(candidate.url);

  if (candidate.method === "GET" && candidate.body) {
    for (const [key, value] of candidate.body) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetchWithCookies(
    url.toString(),
    {
      method: candidate.method === "POST" ? "POST" : "GET",
      body:
        candidate.method === "POST" && candidate.body
          ? candidate.body
          : undefined,
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/html,*/*",
        ...(candidate.method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        Referer: referer,
      },
    },
    jar,
    45000
  );

  if (!response.ok) {
    throw new AloConsultaLookupError(
      `ALO CREDIT respondio con estado ${response.status} al descargar el reporte.`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function downloadFirstReport(imei?: string) {
  if (
    cachedReport &&
    cachedReport.expiresAt > Date.now() &&
    (!imei || sourceContainsImei(cachedReport.source, imei))
  ) {
    return cachedReport.source;
  }

  const session = await loginAlo();
  const reportsPage = await getConsultedReportsPage(session.jar, session.reportUrl);
  const weeklyCandidates = findWeeklyReportDownloadCandidates(
    reportsPage.text,
    reportsPage.url
  );
  let candidates =
    weeklyCandidates.length > 0
      ? weeklyCandidates
      : findDownloadCandidates(reportsPage.text, reportsPage.url);

  if (candidates.length === 0) {
    console.info("ALO CREDIT sin candidatos de descarga; se intentara leer HTML", {
      reportPath: new URL(reportsPage.url).pathname,
      forms: parseForms(reportsPage.text, reportsPage.url).length,
      rows: firstTableRows(reportsPage.text, 10).length,
      muestras: debugHtmlRows(reportsPage.text),
    });
    cachedReport = {
      source: reportsPage.text,
      expiresAt: Date.now() + ALO_REPORT_CACHE_MS,
    };

    return reportsPage.text;
  }

  console.info("ALO CREDIT candidatos de descarga", {
    modo: weeklyCandidates.length > 0 ? "primera-fila-reportes-semanales" : "general",
    candidatos: candidates.slice(0, 5).map(describeDownloadCandidate),
  });
  logAloInfo("ALO CREDIT candidatos de descarga detalle", {
    modo: weeklyCandidates.length > 0 ? "primera-fila-reportes-semanales" : "general",
    candidatos: candidates.slice(0, 8).map(describeDownloadCandidate),
  });

  let referer = reportsPage.url;
  let lastHtml = reportsPage.text;
  const triedCandidates = new Set<string>();

  for (let depth = 0; depth < 8 && candidates.length > 0; depth++) {
    const candidate = candidates.find((item) => {
      const key = candidateKey(item);
      return !triedCandidates.has(key) && !isSamePathWithoutQuery(item, referer);
    });

    if (!candidate) {
      break;
    }

    triedCandidates.add(candidateKey(candidate));
    const buffer = await fetchReportBufferFromUrl(session.jar, candidate, referer);

    if (!isHtmlResponse(buffer)) {
      if (!imei || sourceContainsImei(buffer, imei)) {
        cachedReport = {
          source: buffer,
          expiresAt: Date.now() + ALO_REPORT_CACHE_MS,
        };

        return buffer;
      }

      console.info("ALO CREDIT descarga descartada porque no contiene el IMEI", {
        origen: describeDownloadCandidate(candidate),
        imei: `${"*".repeat(Math.max(0, imei.length - 4))}${imei.slice(-4)}`,
        fuente: "archivo",
      });
      logAloInfo("ALO CREDIT descarga descartada detalle", {
        origen: describeDownloadCandidate(candidate),
        imei: `${"*".repeat(Math.max(0, imei.length - 4))}${imei.slice(-4)}`,
        fuente: "archivo",
      });

      candidates = candidates.filter(
        (item) => !triedCandidates.has(candidateKey(item))
      );
      continue;
    }

    lastHtml = buffer.toString("utf8");

    if (!imei || sourceContainsImei(lastHtml, imei)) {
      cachedReport = {
        source: lastHtml,
        expiresAt: Date.now() + ALO_REPORT_CACHE_MS,
      };

      return lastHtml;
    }

    referer = candidate.url;
    const nestedCandidates = findDownloadCandidates(lastHtml, referer);
    candidates = dedupeDownloadCandidates([
      ...candidates.filter((item) => !triedCandidates.has(candidateKey(item))),
      ...nestedCandidates,
    ]);

    console.info("ALO CREDIT descarga devolvio HTML", {
      intento: depth + 1,
      origen: describeDownloadCandidate(candidate),
      candidatos: candidates.slice(0, 5).map(describeDownloadCandidate),
      filas: firstTableRows(lastHtml, 10).length,
      muestras: debugHtmlRows(lastHtml),
      descartadoSinImei: Boolean(imei),
    });

    if (candidates.length === 0) {
      break;
    }
  }

  if (!lastHtml || looksLikeLoginPage(lastHtml)) {
    throw new AloConsultaLookupError(
      "ALO CREDIT no devolvio un reporte valido despues de descargar."
    );
  }

  console.info("ALO CREDIT no encontro una descarga que contenga el IMEI", {
    imei: imei ? `${"*".repeat(Math.max(0, imei.length - 4))}${imei.slice(-4)}` : null,
    intentos: triedCandidates.size,
    ultimoHtml: {
      filas: firstTableRows(lastHtml, 10).length,
      muestras: debugHtmlRows(lastHtml),
    },
  });

  return null;
}

function readWorkbookMatrix(source: ReportSource) {
  const workbook = XLSX.read(source, {
    type: Buffer.isBuffer(source) ? "buffer" : "string",
    cellDates: false,
    raw: false,
  });
  const matrices = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    matrix: XLSX.utils.sheet_to_json<MatrixCell[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    }),
  }));

  return matrices;
}

function sourceContainsImei(source: ReportSource, imei: string) {
  if (typeof source === "string" && !source.replace(/\D/g, "").includes(imei)) {
    return false;
  }

  try {
    return readWorkbookMatrix(source).some(({ matrix }) =>
      matrix.some((row) => rowContainsImei(row || [], imei))
    );
  } catch (error) {
    console.info("ALO CREDIT no pudo validar IMEI en descarga", {
      imei: `${"*".repeat(Math.max(0, imei.length - 4))}${imei.slice(-4)}`,
      fuente: Buffer.isBuffer(source) ? "archivo" : "html",
      error: error instanceof Error ? error.message : "error desconocido",
    });

    return false;
  }
}

function debugMatrixRows(matrix: MatrixCell[][], maxRows = 5) {
  return matrix
    .slice(0, maxRows)
    .map((row) =>
      maskDebugText(row.map((cell) => visibleText(cell)).join(" | "))
    )
    .filter(Boolean);
}

function rowContainsImei(row: MatrixCell[], imei: string) {
  return row.some((cell) => {
    const text = String(cell || "");
    const exact = normalizeImei(text) === imei;
    const groups: string[] = text.match(/\d{15}/g) ?? [];

    return exact || groups.includes(imei);
  });
}

function headerScore(row: MatrixCell[]) {
  const keys = row.map(normalizeKey).join("|");
  let score = 0;

  if (keys.includes("IMEI")) score += 2;
  if (keys.includes("NOMBRE")) score += 1;
  if (keys.includes("CEDULA") || keys.includes("DOCUMENTO")) score += 1;
  if (keys.includes("CORREO") || keys.includes("EMAIL")) score += 1;
  if (keys.includes("WHATSAPP") || keys.includes("TELEFONO") || keys.includes("CELULAR")) score += 1;
  if (keys.includes("MONTO") || keys.includes("TOTAL")) score += 1;
  if (keys.includes("PLAZO")) score += 1;

  return score;
}

function findHeaderRow(matrix: MatrixCell[][], rowIndex: number) {
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = Math.max(0, rowIndex - 12); index <= rowIndex; index++) {
    const score = headerScore(matrix[index] || []);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore >= 2 ? matrix[bestIndex] : null;
}

function findHeaderIndex(
  headerRow: MatrixCell[] | null,
  matcher: (key: string) => boolean
) {
  if (!headerRow) {
    return -1;
  }

  return headerRow.findIndex((cell) => matcher(normalizeKey(cell)));
}

function getCell(row: MatrixCell[], index: number) {
  if (index < 0) {
    return "";
  }

  return row[index] ?? "";
}

function getByHeader(
  row: MatrixCell[],
  headerRow: MatrixCell[] | null,
  matcher: (key: string) => boolean
) {
  return getCell(row, findHeaderIndex(headerRow, matcher));
}

function findEmail(row: MatrixCell[]) {
  return (
    row.map(visibleText).find((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(cell)) ||
    null
  );
}

function findPhone(row: MatrixCell[], documento: string | null, imei: string) {
  for (const cell of row) {
    const digits = String(cell || "").replace(/\D/g, "");

    if (
      digits.length === 10 &&
      digits !== documento &&
      digits !== imei.slice(-10)
    ) {
      return digits;
    }
  }

  return null;
}

function parseCreditoFromRow(row: MatrixCell[], headerRow: MatrixCell[] | null, imei: string) {
  const creditoAutorizado =
    parseAmount(
      getByHeader(
        row,
        headerRow,
        (key) =>
          key.includes("MONTOTOTAL") ||
          (key.includes("MONTO") && key.includes("TOTAL")) ||
          key.includes("VALORTOTAL")
      )
    ) ?? parseAmount(getCell(row, 10));

  if (creditoAutorizado === null || creditoAutorizado <= 0) {
    return null;
  }

  const accesorios =
    parseAmount(
      getByHeader(
        row,
        headerRow,
        (key) =>
          key.includes("ACCESORIO") ||
          key.includes("SUMAPRECIOACCESORIOS") ||
          (key.includes("PRECIO") && key.includes("ACCESORIO"))
      )
    ) ?? parseAmount(getCell(row, 8));
  const documento = normalizeImei(
    getByHeader(
      row,
      headerRow,
      (key) =>
        key.includes("CEDULA") ||
        key.includes("DOCUMENTO") ||
        key.includes("IDENTIFICACION")
    )
  );
  const plazoRaw = getByHeader(row, headerRow, (key) => key.includes("PLAZO"));
  const valorCuotaRaw = getByHeader(
    row,
    headerRow,
    (key) =>
      key.includes("CUOTA") &&
      !key.includes("INICIAL") &&
      !key.includes("CUOTAINICIAL")
  );
  const correo =
    visibleText(
      getByHeader(
        row,
        headerRow,
        (key) => key.includes("CORREO") || key.includes("EMAIL")
      )
    ) ||
    findEmail(row);
  const telefono =
    normalizeImei(
      getByHeader(
        row,
        headerRow,
        (key) =>
          key.includes("WHATSAPP") ||
          key.includes("TELEFONO") ||
          key.includes("CELULAR")
      )
    ) || findPhone(row, documento || null, imei);
  const clienteNombre = visibleText(
    getByHeader(
      row,
      headerRow,
      (key) =>
        key.includes("NOMBRE") &&
        (key.includes("CLIENTE") ||
          key === "NOMBRE" ||
          key.includes("TITULAR"))
    )
  );
  const numeroCuotas = parseTerm(plazoRaw);
  const valorCuota = parseAmount(valorCuotaRaw);
  const valorAccesorios =
    accesorios !== null && accesorios > 0 ? accesorios : null;

  return {
    imei,
    financiera: "ALO CREDIT" as const,
    clienteNombre: clienteNombre || null,
    documento: documento || null,
    correoElectronico: correo || null,
    telefonoCliente: telefono || null,
    creditoAutorizado,
    valorCuota,
    numeroCuotas,
    frecuenciaCuota: "CATORCENAL" as const,
    valorAccesorios,
    observacionAccesorios:
      valorAccesorios === null ? null : `$ ${valorAccesorios.toLocaleString("es-CO")} ACCESORIOS`,
    moneda: COLOMBIA_CURRENCY,
    origen: "admin_reportes",
  } satisfies AloCreditoImei;
}

function findCreditoInWorkbook(source: ReportSource, imei: string) {
  const matrices = readWorkbookMatrix(source);

  for (const { matrix } of matrices) {
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
      const row = matrix[rowIndex] || [];

      if (!rowContainsImei(row, imei)) {
        continue;
      }

      const credito = parseCreditoFromRow(
        row,
        findHeaderRow(matrix, rowIndex),
        imei
      );

      if (credito) {
        return credito;
      }
    }
  }

  console.info("ALO CREDIT reporte leido sin coincidencia de IMEI", {
    imei: `${"*".repeat(Math.max(0, imei.length - 4))}${imei.slice(-4)}`,
    fuente: Buffer.isBuffer(source) ? "archivo" : "html",
    htmlContieneImei:
      typeof source === "string" ? source.replace(/\D/g, "").includes(imei) : null,
    hojas: matrices.slice(0, 5).map(({ sheetName, matrix }) => ({
      sheetName,
      filas: matrix.length,
      columnas: matrix.reduce(
        (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
        0
      ),
      muestras: debugMatrixRows(matrix, 3),
    })),
  });

  return null;
}

export function isAloConsultaConfigured() {
  return Boolean(
    String(process.env.ALOCONSULTA_URL || "").trim() &&
      String(process.env.ALOCONSULTA_USUARIO || "").trim() &&
      String(process.env.ALOCONSULTA_CLAVE || "").trim()
  );
}

export async function obtenerCreditoAloPorImei(imeiValue: unknown) {
  const imei = normalizeImei(imeiValue);

  if (imei.length !== 15) {
    throw new AloConsultaLookupError("El IMEI debe tener 15 digitos.");
  }

  const reportBuffer = await downloadFirstReport(imei);

  if (!reportBuffer) {
    return null;
  }

  return findCreditoInWorkbook(reportBuffer, imei);
}
