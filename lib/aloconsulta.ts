import * as XLSX from "xlsx";

const ALO_DEFAULT_REPORT_URL = "https://consola.alocredit.co/admin_reportes";
const ALO_LOGIN_PATH = "/login";
const ALO_REPORT_PATH = "/admin_reportes";
const ALO_CARTERA_PATH = "/admin_cartera";
const ALO_REPORT_CACHE_MS = 60_000;
const COLOMBIA_CURRENCY = "COP";
const ALO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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

type ConsultedReportsPage = Awaited<ReturnType<typeof fetchTextFollowingRedirects>> & {
  submittedFields: URLSearchParams;
};

type MatrixCell = string | number | boolean | Date | null | undefined;
type ReportSource = Buffer | string;

type CachedReport = {
  source: ReportSource;
  expiresAt: number;
};

type AloSession = {
  jar: CookieJar;
  reportUrl: URL;
};

type AloCarteraTerms = {
  valorCuota: number | null;
  numeroCuotas: number | null;
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

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
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
  return decodeHtml(String(value || ""))
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const endDate = new Date(todayDate);

  startDate.setUTCDate(todayDate.getUTCDate() - daysSinceMonday);
  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return {
    start: formatDateParts(startDate),
    end: formatDateParts(endDate),
    today,
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
  const namedDateFields: Array<{ name: string; isDateInput: boolean }> = [];
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
    const isDateInput = (attributes.get("type") || "").toLowerCase() === "date";

    if (isDateInput || key.includes("FECHA")) {
      namedDateFields.push({ name, isDateInput });
    }

    const dateValue =
      isDateInput
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

  if (!hasStartField && !hasEndField && namedDateFields.length >= 2) {
    const [startField, endField] = namedDateFields;

    fields.set(
      startField.name,
      startField.isDateInput ? defaults.startIso : defaults.start
    );
    fields.set(
      endField.name,
      endField.isDateInput ? defaults.endIso : defaults.end
    );
    hasStartField = true;
    hasEndField = true;
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

async function loginAlo(): Promise<AloSession> {
  const config = getCredentials();
  const jar: CookieJar = new Map();
  const loginPage = await fetchTextFollowingRedirects(
    config.loginUrl.toString(),
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": ALO_USER_AGENT,
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
        "User-Agent": ALO_USER_AGENT,
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

function extractRouteHints(text: string) {
  const hints = new Set<string>();
  const routeRegex =
    /["'`]((?:https?:\/\/[^"'`]+|\/)[^"'`]*?(?:admin|ajax|api|cartera|facturacion|reporte|reportes|descarg|download|export)[^"'`]*)["'`]/gi;

  for (const match of text.matchAll(routeRegex)) {
    const route = decodeHtml(match[1]).trim();

    if (
      route &&
      !route.includes("logout") &&
      !route.includes("login") &&
      route.length <= 220
    ) {
      hints.add(route);
    }
  }

  return Array.from(hints).slice(0, 40);
}

function debugHtmlStructure(html: string, baseUrl: string) {
  const forms = parseForms(html, baseUrl).slice(0, 6).map((form) => {
    const controls =
      form.html.match(/<button\b[^>]*>[\s\S]*?<\/button>|<input\b[^>]*>/gi) ??
      [];

    return {
      actionPath: new URL(form.action).pathname,
      method: form.method,
      fieldKeys: Array.from(form.fields.keys()).sort(),
      controls: controls.slice(0, 8).map((control) => {
        const attrs = getHtmlAttributes(control);

        return {
          text: maskDebugText(control, 80),
          type: attrs.get("type") || "",
          name: attrs.get("name") || "",
          id: attrs.get("id") || "",
          href: attrs.get("href") || "",
          onclick: attrs.get("onclick") ? maskDebugText(attrs.get("onclick") || "", 120) : "",
          dataUrl: attrs.get("data-url") || attrs.get("data-href") || "",
        };
      }),
    };
  });
  const downloadElements = Array.from(
    html.matchAll(/<(a|button|input)\b[^>]*(?:>[\s\S]*?<\/\1>)?/gi)
  )
    .map((match) => {
      const elementHtml = match[0];
      const attrs = getHtmlAttributes(elementHtml);
      const text = maskDebugText(elementHtml, 120);
      const combined = normalizeText(
        `${elementHtml} ${Array.from(attrs.values()).join(" ")}`
      );

      if (
        !combined.includes("DESCARG") &&
        !combined.includes("DOWNLOAD") &&
        !combined.includes("FACTUR") &&
        !combined.includes("REPORTE")
      ) {
        return null;
      }

      return {
        tag: match[1].toLowerCase(),
        text,
        href: attrs.get("href") || "",
        onclick: attrs.get("onclick") ? maskDebugText(attrs.get("onclick") || "", 160) : "",
        dataUrl: attrs.get("data-url") || attrs.get("data-href") || "",
        formaction: attrs.get("formaction") || "",
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  return {
    forms,
    downloadElements,
    routeHints: extractRouteHints(html).slice(0, 20),
    muestras: debugHtmlRows(html, 6),
  };
}

function bufferLooksText(buffer: Buffer) {
  const sample = buffer.subarray(0, 500).toString("utf8");

  return /^[\s\S]*$/.test(sample) && !sample.includes("\u0000");
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

function parseLocalReportDate(value: string) {
  const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (!match) {
    return null;
  }

  return Date.UTC(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );
}

function rowIncludesToday(row: string) {
  const rowDates = extractRowDates(row);

  if (rowDates.length < 2) {
    return false;
  }

  const { today } = currentWeeklyReportDates();
  const todayTime = Date.UTC(
    Number(today.year),
    Number(today.month) - 1,
    Number(today.day)
  );
  const startTime = parseLocalReportDate(rowDates[0]);
  const endTime = parseLocalReportDate(rowDates[1]);

  return (
    startTime !== null &&
    endTime !== null &&
    startTime <= todayTime &&
    todayTime <= endTime
  );
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

function currentWeeklyDateValues() {
  const { start, end } = currentWeeklyReportDates();

  return {
    startDash: dashFromParts(start),
    endDash: dashFromParts(end),
    startSlash: slashFromParts(start),
    endSlash: slashFromParts(end),
    startIso: isoFromParts(start),
    endIso: isoFromParts(end),
  };
}

function datePathCandidates(baseUrl: string, startDate: string, endDate: string) {
  const compactPairs = datePairsForRange(startDate, endDate).filter(
    ([start, end]) => !start.includes("/") && !end.includes("/")
  );
  const slashSegmentPair = [
    slashDate(startDate).split("/").map(encodeURIComponent).join("/"),
    slashDate(endDate).split("/").map(encodeURIComponent).join("/"),
  ];
  const paths = [
    "/admin_facturacion",
    "/admin_facturacion/descargar",
    "/admin_facturacion/download",
    "/admin_facturacion/exportar",
    "/admin_facturacion/reporte",
    "/admin_reportes/facturacion",
    "/admin_reportes/descargar",
    "/admin_reportes/download",
  ];
  const candidates: DownloadCandidate[] = [];

  for (const path of paths) {
    for (const [start, end] of compactPairs) {
      for (const [left, right] of [
        [start, end],
        [end, start],
      ]) {
        candidates.push({
          url: new URL(
            `${path}/${encodeURIComponent(left)}/${encodeURIComponent(right)}`,
            baseUrl
          ).toString(),
          method: "GET",
          score: left === start ? 280 : 245,
        });
      }
    }

    candidates.push({
      url: new URL(
        `${path}/${slashSegmentPair[0]}/${slashSegmentPair[1]}`,
        baseUrl
      ).toString(),
      method: "GET",
      score: 270,
    });
    candidates.push({
      url: new URL(
        `${path}/${slashSegmentPair[1]}/${slashSegmentPair[0]}`,
        baseUrl
      ).toString(),
      method: "GET",
      score: 235,
    });
  }

  return candidates;
}

function findDateFieldPairs(fields: URLSearchParams) {
  const entries = Array.from(fields.entries()).map(([key, value]) => ({
    key,
    value,
    normalized: normalizeKey(key),
  }));
  const starts = entries.filter(({ normalized }) =>
    normalized.includes("INICIO") ||
    normalized.includes("INICIAL") ||
    normalized.includes("INI") ||
    normalized.includes("DESDE") ||
    normalized.includes("START")
  );
  const ends = entries.filter(({ normalized }) =>
    normalized.includes("FIN") ||
    normalized.includes("FINAL") ||
    normalized.includes("HASTA") ||
    normalized.includes("END")
  );
  const pairs: Array<[string, string]> = [];

  for (const start of starts) {
    for (const end of ends) {
      if (start.key !== end.key) {
        pairs.push([start.key, end.key]);
      }
    }
  }

  if (pairs.length === 0) {
    const dateEntries = entries.filter(({ value }) =>
      /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(value)
    );

    if (dateEntries.length >= 2) {
      pairs.push([dateEntries[0].key, dateEntries[1].key]);
    }
  }

  return pairs;
}

function buildDateScopedCandidates(
  candidate: DownloadCandidate,
  startDate: string,
  endDate: string,
  preferredKeyPairs: Array<[string, string]> = []
) {
  const candidates: DownloadCandidate[] = [candidate];
  const datePairs = datePairsForRange(startDate, endDate);
  const keyPairs = [
    ...preferredKeyPairs,
    ["fecha_inicio", "fecha_fin"],
    ["fechaInicio", "fechaFin"],
    ["fechaInicial", "fechaFinal"],
    ["fecha_ini", "fecha_fin"],
    ["fecha_inicial", "fecha_final"],
    ["fechaDesde", "fechaHasta"],
    ["desde", "hasta"],
    ["inicio", "fin"],
    ["start", "end"],
    ["fi", "ff"],
    ["fechaI", "fechaF"],
    ["fInicio", "fFin"],
  ];
  const uniqueKeyPairs = Array.from(
    new Map(keyPairs.map((pair) => [pair.join("\u0000"), pair])).values()
  );

  for (const [inicio, fin] of datePairs) {
    for (const [inicioKey, finKey] of uniqueKeyPairs) {
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

function withDateFields(
  fields: URLSearchParams,
  startValue: string,
  endValue: string
) {
  const next = new URLSearchParams(fields);

  next.set("start_date", startValue);
  next.set("end_date", endValue);

  return next;
}

function exactAloReportCandidates(
  baseUrl: string,
  submittedFields = new URLSearchParams()
) {
  const weeklyDates = currentWeeklyDateValues();
  const isoFields = withDateFields(
    submittedFields,
    weeklyDates.startIso,
    weeklyDates.endIso
  );
  const dashFields = withDateFields(
    submittedFields,
    weeklyDates.startDash,
    weeklyDates.endDash
  );
  const slashFields = withDateFields(
    submittedFields,
    weeklyDates.startSlash,
    weeklyDates.endSlash
  );
  const ajaxFields = new URLSearchParams(isoFields);

  ajaxFields.set("draw", ajaxFields.get("draw") || "1");
  ajaxFields.set("start", ajaxFields.get("start") || "0");
  ajaxFields.set("length", ajaxFields.get("length") || "5000");
  ajaxFields.set("search[value]", ajaxFields.get("search[value]") || "");
  ajaxFields.set("search[regex]", ajaxFields.get("search[regex]") || "false");
  ajaxFields.set("order[0][column]", ajaxFields.get("order[0][column]") || "0");
  ajaxFields.set("order[0][dir]", ajaxFields.get("order[0][dir]") || "desc");

  return [
    {
      url: new URL("/admin_reportes/export", baseUrl).toString(),
      method: "POST" as const,
      body: dashFields,
      score: 1300,
    },
    {
      url: new URL("/admin_reportes/export", baseUrl).toString(),
      method: "GET" as const,
      body: new URLSearchParams(dashFields),
      score: 1250,
    },
    {
      url: new URL("/admin_reportes/export", baseUrl).toString(),
      method: "POST" as const,
      body: new URLSearchParams(isoFields),
      score: 1150,
    },
    {
      url: new URL("/admin_reportes/export", baseUrl).toString(),
      method: "GET" as const,
      body: new URLSearchParams(isoFields),
      score: 1125,
    },
    {
      url: new URL("/admin_reportes/ajax", baseUrl).toString(),
      method: "GET" as const,
      body: new URLSearchParams(submittedFields),
      score: 1000,
    },
    {
      url: new URL("/admin_reportes/export", baseUrl).toString(),
      method: "POST" as const,
      body: slashFields,
      score: 950,
    },
    {
      url: new URL("/admin_facturacion/ajax", baseUrl).toString(),
      method: "GET" as const,
      body: ajaxFields,
      score: 700,
    },
  ];
}

function routeHintDownloadCandidates(
  html: string,
  baseUrl: string,
  submittedFields = new URLSearchParams()
) {
  const { startDash, endDash } = currentWeeklyDateValues();
  const preferredPairs = findDateFieldPairs(submittedFields);
  const baseCandidates = extractRouteHints(html).map((route) => {
    const normalized = normalizeText(route);
    let score = 120;

    if (normalized.includes("FACTUR")) score += 70;
    if (normalized.includes("DESCARG") || normalized.includes("DOWNLOAD")) score += 60;
    if (normalized.includes("EXPORT")) score += 40;
    if (normalized.includes("REPORTE")) score += 20;

    return {
      url: new URL(route, baseUrl).toString(),
      method: "GET" as const,
      body: new URLSearchParams(submittedFields),
      score,
    };
  });

  return dedupeDownloadCandidates(
    baseCandidates.flatMap((candidate) =>
      buildDateScopedCandidates(candidate, startDash, endDash, preferredPairs)
    )
  );
}

function directWeeklyDownloadCandidates(
  baseUrl: string,
  submittedFields = new URLSearchParams()
) {
  const { startDash, endDash } = currentWeeklyDateValues();
  const preferredPairs = findDateFieldPairs(submittedFields);
  const bases: DownloadCandidate[] = [
    {
      url: new URL("/admin_facturacion", baseUrl).toString(),
      method: "GET",
      body: new URLSearchParams(submittedFields),
      score: 240,
    },
    {
      url: new URL("/admin_facturacion", baseUrl).toString(),
      method: "POST",
      body: new URLSearchParams(submittedFields),
      score: 235,
    },
    {
      url: new URL("/admin_reportes/descargar", baseUrl).toString(),
      method: "GET",
      body: new URLSearchParams(submittedFields),
      score: 210,
    },
    {
      url: new URL("/admin_reportes/descargar", baseUrl).toString(),
      method: "POST",
      body: new URLSearchParams(submittedFields),
      score: 205,
    },
    {
      url: new URL("/admin_reportes/download", baseUrl).toString(),
      method: "GET",
      body: new URLSearchParams(submittedFields),
      score: 200,
    },
  ];

  return dedupeDownloadCandidates(
    [
      ...datePathCandidates(baseUrl, startDash, endDash),
      ...bases.flatMap((candidate) =>
        buildDateScopedCandidates(candidate, startDash, endDash, preferredPairs)
      ),
    ]
  );
}

function findWeeklyReportDownloadCandidates(
  html: string,
  baseUrl: string,
  submittedFields = new URLSearchParams()
) {
  const exactCandidates = exactAloReportCandidates(baseUrl, submittedFields);
  const rows = firstTableRows(html, 80).filter(looksLikeWeeklyReportRow);
  const row = rows.find(rowIncludesToday);

  if (!row) {
    return dedupeDownloadCandidates([
      ...exactCandidates,
      ...routeHintDownloadCandidates(html, baseUrl, submittedFields),
      ...directWeeklyDownloadCandidates(baseUrl, submittedFields),
    ]);
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
    return dedupeDownloadCandidates([...exactCandidates, ...rowCandidates]);
  }

  return dedupeDownloadCandidates(
    [
      ...exactCandidates,
      ...rowCandidates.flatMap((candidate) =>
        buildDateScopedCandidates(
          candidate,
          rowDates[0],
          rowDates[1],
          findDateFieldPairs(submittedFields)
        )
      ),
    ]
  );
}

function describeDownloadCandidate(candidate: DownloadCandidate) {
  const bodyPreview = candidate.body
    ? Array.from(candidate.body.entries())
        .filter(([, value]) => /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(value))
        .map(([key, value]) => [key, value])
    : [];

  try {
    const url = new URL(candidate.url);

    return {
      path: url.pathname,
      queryKeys: Array.from(url.searchParams.keys()).sort(),
      pathConFecha: /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(url.pathname),
      method: candidate.method || "GET",
      bodyKeys: candidate.body ? Array.from(candidate.body.keys()).sort() : [],
      bodyPreview,
      score: candidate.score,
    };
  } catch {
    return {
      path: candidate.url.slice(0, 80),
      queryKeys: [],
      pathConFecha: /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(candidate.url),
      method: candidate.method || "GET",
      bodyKeys: candidate.body ? Array.from(candidate.body.keys()).sort() : [],
      bodyPreview,
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
        "Accept-Language": "es-CO,es;q=0.9",
        "User-Agent": ALO_USER_AGENT,
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
    return {
      ...page,
      submittedFields: new URLSearchParams(),
    } satisfies ConsultedReportsPage;
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
        "Accept-Language": "es-CO,es;q=0.9",
        Origin: action.origin,
        Referer: page.url,
        "User-Agent": ALO_USER_AGENT,
      },
    },
    jar
  );

  console.info("ALO CREDIT consulta reporte semanal", {
    actionPath: action.pathname,
    method: consultForm.method === "GET" ? "GET" : "POST",
    fieldKeys: Array.from(fields.keys()).sort(),
    dateFieldPairs: findDateFieldPairs(fields),
    rows: firstTableRows(result.text, 10).length,
    muestras: debugHtmlRows(result.text),
  });
  logAloInfo("ALO CREDIT consulta reporte semanal detalle", {
    actionPath: action.pathname,
    method: consultForm.method === "GET" ? "GET" : "POST",
    fieldKeys: Array.from(fields.keys()).sort(),
    fieldValues: Array.from(fields.entries()).map(([key, value]) => [
      key,
      /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(value) ? value : "***",
    ]),
    dateFieldPairs: findDateFieldPairs(fields),
    rows: firstTableRows(result.text, 10).length,
    muestras: debugHtmlRows(result.text),
    estructura: debugHtmlStructure(result.text, result.url),
  });

  return {
    ...result,
    submittedFields: fields,
  } satisfies ConsultedReportsPage;
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
        "Accept-Language": "es-CO,es;q=0.9",
        Origin: url.origin,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": ALO_USER_AGENT,
        ...(candidate.method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        Referer: referer,
      },
    },
    jar,
    45000
  );

  return {
    ok: response.ok,
    status: response.status,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

async function downloadFirstReport(imei?: string, sessionArg?: AloSession) {
  if (
    cachedReport &&
    cachedReport.expiresAt > Date.now() &&
    (!imei || sourceContainsImei(cachedReport.source, imei))
  ) {
    return cachedReport.source;
  }

  const session = sessionArg ?? (await loginAlo());
  const reportsPage = await getConsultedReportsPage(session.jar, session.reportUrl);
  const weeklyCandidates = findWeeklyReportDownloadCandidates(
    reportsPage.text,
    reportsPage.url,
    reportsPage.submittedFields
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
    rangoSemana: {
      inicio: dashFromParts(currentWeeklyReportDates().start),
      fin: dashFromParts(currentWeeklyReportDates().end),
      hoy: dashFromParts(currentWeeklyReportDates().today),
    },
    candidatos: candidates.slice(0, 5).map(describeDownloadCandidate),
  });
  logAloInfo("ALO CREDIT candidatos de descarga detalle", {
    modo: weeklyCandidates.length > 0 ? "primera-fila-reportes-semanales" : "general",
    rangoSemana: {
      inicio: dashFromParts(currentWeeklyReportDates().start),
      fin: dashFromParts(currentWeeklyReportDates().end),
      hoy: dashFromParts(currentWeeklyReportDates().today),
    },
    candidatos: candidates.slice(0, 8).map(describeDownloadCandidate),
    estructura: debugHtmlStructure(reportsPage.text, reportsPage.url),
  });

  let referer = reportsPage.url;
  let lastHtml = reportsPage.text;
  const triedCandidates = new Set<string>();

  for (let depth = 0; depth < 80 && candidates.length > 0; depth++) {
    const candidate = candidates.find((item) => {
      const key = candidateKey(item);
      return !triedCandidates.has(key) && !isSamePathWithoutQuery(item, referer);
    });

    if (!candidate) {
      break;
    }

    triedCandidates.add(candidateKey(candidate));
    const download = await fetchReportBufferFromUrl(
      session.jar,
      candidate,
      referer
    );

    if (!download.ok) {
      console.info("ALO CREDIT candidato de descarga fallo", {
        origen: describeDownloadCandidate(candidate),
        status: download.status,
      });
      logAloInfo("ALO CREDIT candidato de descarga fallo detalle", {
        origen: describeDownloadCandidate(candidate),
        status: download.status,
      });

      candidates = candidates.filter(
        (item) => !triedCandidates.has(candidateKey(item))
      );
      continue;
    }

    const buffer = download.buffer;

    if (!isHtmlResponse(buffer)) {
      if (!imei || sourceContainsImei(buffer, imei)) {
        cachedReport = {
          source: buffer,
          expiresAt: Date.now() + ALO_REPORT_CACHE_MS,
        };

        return buffer;
      }

      if (bufferLooksText(buffer)) {
        const text = buffer.toString("utf8");
        const nestedCandidates = routeHintDownloadCandidates(
          text,
          candidate.url,
          candidate.body || reportsPage.submittedFields
        );

        if (nestedCandidates.length > 0) {
          candidates = dedupeDownloadCandidates([
            ...candidates.filter((item) => !triedCandidates.has(candidateKey(item))),
            ...nestedCandidates,
          ]);
          console.info("ALO CREDIT respuesta textual sin IMEI con rutas candidatas", {
            origen: describeDownloadCandidate(candidate),
            rutas: nestedCandidates.slice(0, 5).map(describeDownloadCandidate),
          });
          continue;
        }
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
    const nestedFields = candidate.body || reportsPage.submittedFields;
    const nestedCandidates = dedupeDownloadCandidates([
      ...exactAloReportCandidates(referer, nestedFields),
      ...routeHintDownloadCandidates(lastHtml, referer, nestedFields),
      ...findDownloadCandidates(lastHtml, referer),
    ]);

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
  logAloInfo("ALO CREDIT sin descarga valida detalle", {
    imei: imei ? `${"*".repeat(Math.max(0, imei.length - 4))}${imei.slice(-4)}` : null,
    intentos: triedCandidates.size,
    ultimoHtml: {
      filas: firstTableRows(lastHtml, 10).length,
      muestras: debugHtmlRows(lastHtml),
      estructura: debugHtmlStructure(lastHtml, referer),
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

  if (Buffer.isBuffer(source) && bufferLooksText(source)) {
    const text = source.toString("utf8");

    if (text.replace(/\D/g, "").includes(imei)) {
      return true;
    }
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
  if (keys.includes("CUOTA")) score += 1;

  return score;
}

function findHeaderRow(matrix: MatrixCell[][], rowIndex: number) {
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index <= rowIndex; index++) {
    const score = headerScore(matrix[index] || []);

    if (score > bestScore || (score === bestScore && score > 0 && index > bestIndex)) {
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

function getHeaderKey(headerRow: MatrixCell[] | null, index: number) {
  return headerRow ? normalizeKey(getCell(headerRow, index)) : "";
}

function getValuesByHeader(
  row: MatrixCell[],
  headerRow: MatrixCell[] | null,
  matcher: (key: string) => boolean
) {
  if (!headerRow) {
    return [];
  }

  return headerRow
    .map((cell, index) => ({ key: normalizeKey(cell), value: row[index] }))
    .filter(({ key }) => matcher(key))
    .map(({ value }) => value);
}

function findEmail(row: MatrixCell[]) {
  return (
    row.map(visibleText).find((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(cell)) ||
    null
  );
}

function isDocumentKey(key: string) {
  return (
    key.includes("CEDULA") ||
    key.includes("DOCUMENTO") ||
    key.includes("IDENTIFICACION") ||
    key === "CC" ||
    key.includes("NUMERODOC") ||
    key.includes("NRODOC") ||
    key.includes("DOCCLIENTE")
  );
}

function isClientNameKey(key: string) {
  if (
    key.includes("VENDEDOR") ||
    key.includes("ASESOR") ||
    key.includes("TIENDA") ||
    key.includes("PUNTO")
  ) {
    return false;
  }

  if (
    key.includes("CEDULA") ||
    key.includes("DOCUMENTO") ||
    key.includes("IDENTIFICACION") ||
    key.includes("CORREO") ||
    key.includes("EMAIL") ||
    key.includes("MAIL") ||
    key.includes("WHATSAPP") ||
    key.includes("CELULAR") ||
    key.includes("TELEF") ||
    key.includes("DIRECCION") ||
    key.includes("BARRIO") ||
    key.includes("CIUDAD") ||
    key.includes("CONTRATO") ||
    key.includes("CREDITO") ||
    key.includes("MONTO") ||
    key.includes("VALOR") ||
    key.includes("ID")
  ) {
    return false;
  }

  return (
    key.includes("NOMBRECLIENTE") ||
    key.includes("CLIENTE") ||
    key.includes("TITULAR") ||
    key.includes("NOMBRECOMPLETO") ||
    key === "NOMBRE" ||
    key === "NOMBRES" ||
    key === "APELLIDOS"
  );
}

function isPhoneKey(key: string) {
  return (
    key.includes("WHATSAPP") ||
    key.includes("CELULAR") ||
    key.includes("TELEFONO") ||
    key.includes("MOVIL") ||
    key.includes("TELEF") ||
    key.includes("PHONE")
  );
}

function isEmailKey(key: string) {
  return key.includes("CORREO") || key.includes("EMAIL") || key.includes("MAIL");
}

function isTermKey(key: string) {
  if (
    key.includes("VALOR") ||
    key.includes("MONTO") ||
    key.includes("PAGO") ||
    key.includes("ATRAS") ||
    key.includes("MORA") ||
    key.includes("PENDIENT") ||
    key.includes("VENCID") ||
    key.includes("PAGAD")
  ) {
    return false;
  }

  return (
    key.includes("PLAZO") ||
    key.includes("MESES") ||
    key.includes("NUMEROCUOTAS") ||
    key.includes("CANTIDADCUOTAS") ||
    key === "CUOTAS"
  );
}

function isInstallmentValueKey(key: string) {
  if (
    key.includes("INICIAL") ||
    key.includes("CUOTAINICIAL") ||
    key.includes("PLAZO") ||
    key.includes("NUMERO") ||
    key.includes("CANTIDAD")
  ) {
    return false;
  }

  return (
    key.includes("VALORCUOTA") ||
    key.includes("CUOTACATORCENAL") ||
    key.includes("CUOTAQUINCENAL") ||
    key.includes("CUOTAMENSUAL") ||
    (key.includes("VALOR") && key.includes("PAGO")) ||
    key === "CUOTA"
  );
}

function isAccessoryValueKey(key: string) {
  if (key.includes("CANTIDAD") || key.includes("NUMERO") || key.includes("QTY")) {
    return false;
  }

  return (
    (key.includes("SUMA") &&
      key.includes("PRECIO") &&
      key.includes("ACCESORIO")) ||
    (key.includes("PRECIO") && key.includes("ACCESORIO")) ||
    (key.includes("VALOR") && key.includes("ACCESORIO"))
  );
}

function isDocumentCandidate(digits: string, imei: string) {
  return digits.length >= 6 && digits.length <= 12 && digits !== imei;
}

function findDocument(row: MatrixCell[], headerRow: MatrixCell[] | null, imei: string) {
  const fromHeader = onlyDigits(getByHeader(row, headerRow, isDocumentKey));

  if (isDocumentCandidate(fromHeader, imei)) {
    return fromHeader;
  }

  const candidates = row
    .map((cell, index) => ({
      digits: onlyDigits(cell),
      key: getHeaderKey(headerRow, index),
    }))
    .filter(({ digits }) => isDocumentCandidate(digits, imei))
    .filter(({ key }) => !key.includes("MONTO") && !key.includes("VALOR"));

  return candidates.find(({ key }) => isDocumentKey(key))?.digits || "";
}

function normalizeColombianPhone(value: unknown, documento: string | null, imei: string) {
  const digitGroups = onlyDigits(value).match(/\d{10,12}/g) ?? [];
  const forbidden = new Set(
    [documento, imei, imei.slice(-10)].filter(Boolean) as string[]
  );

  for (const raw of digitGroups) {
    const phone = raw.length === 12 && raw.startsWith("57") ? raw.slice(2) : raw;

    if (
      phone.length === 10 &&
      phone.startsWith("3") &&
      !forbidden.has(phone)
    ) {
      return phone;
    }
  }

  return null;
}

function findPhone(
  row: MatrixCell[],
  headerRow: MatrixCell[] | null,
  documento: string | null,
  imei: string
) {
  for (const value of getValuesByHeader(row, headerRow, isPhoneKey)) {
    const phone = normalizeColombianPhone(value, documento, imei);

    if (phone) {
      return phone;
    }
  }

  for (const cell of row) {
    const phone = normalizeColombianPhone(cell, documento, imei);

    if (phone) {
      return phone;
    }
  }

  return null;
}

function findClientName(row: MatrixCell[], headerRow: MatrixCell[] | null) {
  const values = getValuesByHeader(row, headerRow, isClientNameKey)
    .map(visibleText)
    .filter(Boolean);

  return Array.from(new Set(values)).join(" ").trim();
}

function findTermValue(row: MatrixCell[], headerRow: MatrixCell[] | null) {
  const index = findHeaderIndex(headerRow, isTermKey);

  if (index >= 0) {
    return {
      value: getCell(row, index),
      headerKey: getHeaderKey(headerRow, index),
    };
  }

  const value = row
    .map(visibleText)
    .find((cell) =>
      /\b\d{1,2}(?:[.,]\d+)?\s*(?:MESES?|MES|CUOTAS?|CATORCENAS?|QUINCENAS?)\b/i.test(
        cell
      )
    );

  return { value: value || "", headerKey: "" };
}

function parseTermByHeader(value: unknown, headerKey: string) {
  if (
    headerKey.includes("CUOTA") ||
    headerKey.includes("CATORCEN") ||
    headerKey.includes("QUINCEN")
  ) {
    const number = Number(
      String(value ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".")
    );

    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
  }

  return parseTerm(value);
}

function maskNumericValue(value: string) {
  return value ? `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : "";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonCell(value: unknown) {
  return (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  );
}

function toMatrixCell(value: unknown): MatrixCell {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return JSON.stringify(value);
}

function jsonMatricesFromValue(value: unknown) {
  const matrices: MatrixCell[][][] = [];
  const seen = new Set<unknown>();

  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || !node || seen.has(node)) {
      return;
    }

    if (typeof node === "object") {
      seen.add(node);
    }

    if (Array.isArray(node)) {
      const records = node.filter(isPlainRecord);
      const arrays = node.filter(Array.isArray);

      if (records.length > 0) {
        const keys = Array.from(
          new Set(
            records.flatMap((record) =>
              Object.keys(record).filter((key) => isJsonCell(record[key]))
            )
          )
        );

        if (keys.length > 0) {
          matrices.push([
            keys,
            ...records.map((record) => keys.map((key) => toMatrixCell(record[key]))),
          ]);
        }
      }

      if (arrays.length > 0) {
        matrices.push(
          arrays.map((row) =>
            row.map((cell) => toMatrixCell(cell))
          )
        );
      }

      node.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (isPlainRecord(node)) {
      const primitiveEntries = Object.entries(node).filter(([, cell]) =>
        isJsonCell(cell)
      );

      if (primitiveEntries.length >= 2) {
        matrices.push([
          primitiveEntries.map(([key]) => key),
          primitiveEntries.map(([, cell]) => toMatrixCell(cell)),
        ]);
      }

      Object.values(node).forEach((item) => visit(item, depth + 1));
    }
  };

  visit(value, 0);

  return matrices;
}

function readCarteraMatrices(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return jsonMatricesFromValue(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  if (!/<(?:table|tr|td|th)\b/i.test(text)) {
    return [];
  }

  try {
    return readWorkbookMatrix(text).map(({ matrix }) => matrix);
  } catch {
    return [];
  }
}

function rowMatchesAnySearch(row: MatrixCell[], searchValues: string[]) {
  const rowDigits = row.map(visibleText).join(" ").replace(/\D/g, "");

  return searchValues.some(
    (value) => value.length >= 6 && rowDigits.includes(value)
  );
}

function parseCarteraTermsFromRow(
  row: MatrixCell[],
  headerRow: MatrixCell[] | null
): AloCarteraTerms {
  const plazo = findTermValue(row, headerRow);
  const numeroCuotas = parseTermByHeader(plazo.value, plazo.headerKey);
  const valorCuota =
    parseAmount(getByHeader(row, headerRow, isInstallmentValueKey)) ??
    parseAmount(
      getByHeader(
        row,
        headerRow,
        (key) =>
          key.includes("CUOTAVALOR") ||
          key.includes("VALORPAGOCUOTA") ||
          key.includes("VALORCATORCENAL") ||
          key.includes("PAGOCATORCENAL")
      )
    );

  return {
    valorCuota,
    numeroCuotas,
  };
}

function extractTableHeaderCandidates(html: string) {
  return Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi))
    .map((match) => {
      const rowHtml = match[0];
      const cells = Array.from(
        rowHtml.matchAll(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi)
      ).map((cell) => visibleText(cell[0]));

      return cells;
    })
    .filter((cells) => cells.length > 0)
    .sort((left, right) => headerScore(right) - headerScore(left));
}

function findCarteraTermsInText(
  text: string,
  searchValues: string[],
  fallbackHeaders: MatrixCell[][] = []
) {
  const matrices = readCarteraMatrices(text);
  const headers = [...extractTableHeaderCandidates(text), ...fallbackHeaders];

  for (const matrix of matrices) {
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
      const row = matrix[rowIndex] || [];

      if (!rowMatchesAnySearch(row, searchValues)) {
        continue;
      }

      const terms = parseCarteraTermsFromRow(
        row,
        findHeaderRow(matrix, rowIndex) ||
          headers.find((header) => header.length >= row.length) ||
          headers[0] ||
          null
      );

      if (terms.valorCuota !== null || terms.numeroCuotas !== null) {
        return terms;
      }
    }
  }

  return null;
}

function carteraSearchFields(searchValue: string, baseFields = new URLSearchParams()) {
  const fields = new URLSearchParams(baseFields);
  const searchKeys = [
    "search[value]",
    "search",
    "buscar",
    "q",
    "term",
    "filtro",
    "imei",
    "cedula",
    "documento",
    "cc",
    "cc_cliente",
    "cliente",
  ];

  fields.set("draw", fields.get("draw") || "1");
  fields.set("start", fields.get("start") || "0");
  fields.set("length", fields.get("length") || "100");
  fields.set("search[regex]", fields.get("search[regex]") || "false");

  for (const key of searchKeys) {
    fields.set(key, searchValue);
  }

  return fields;
}

function aloCarteraSearchCandidates(
  html: string,
  baseUrl: string,
  searchValue: string
) {
  const candidates: DownloadCandidate[] = [
    {
      url: new URL("/admin_cartera/ajax", baseUrl).toString(),
      method: "GET",
      body: carteraSearchFields(searchValue),
      score: 1000,
    },
    {
      url: new URL("/admin_cartera/ajax", baseUrl).toString(),
      method: "POST",
      body: carteraSearchFields(searchValue),
      score: 980,
    },
    {
      url: new URL("/admin_cartera", baseUrl).toString(),
      method: "GET",
      body: carteraSearchFields(searchValue),
      score: 700,
    },
    {
      url: new URL("/admin_cartera", baseUrl).toString(),
      method: "POST",
      body: carteraSearchFields(searchValue),
      score: 680,
    },
  ];

  for (const route of extractRouteHints(html)) {
    if (!normalizeText(route).includes("CARTERA")) {
      continue;
    }

    candidates.push({
      url: new URL(route, baseUrl).toString(),
      method: "GET",
      body: carteraSearchFields(searchValue),
      score: normalizeText(route).includes("AJAX") ? 950 : 650,
    });
  }

  for (const form of parseForms(html, baseUrl)) {
    if (normalizeText(form.html).includes("_USERNAME")) {
      continue;
    }

    candidates.push({
      url: form.action,
      method: form.method === "GET" ? "GET" : "POST",
      body: carteraSearchFields(searchValue, form.fields),
      score: 800,
    });
  }

  return dedupeDownloadCandidates(candidates).slice(0, 24);
}

async function fetchAloTextCandidate(
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
        Accept: "application/json,text/html,*/*",
        "Accept-Language": "es-CO,es;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Origin: url.origin,
        Referer: referer,
        "User-Agent": ALO_USER_AGENT,
      },
    },
    jar,
    30000
  );

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
    url: url.toString(),
  };
}

async function consultarCuotaPlazoAloCartera(
  session: AloSession,
  credito: AloCreditoImei
) {
  const searchValues = Array.from(
    new Set(
      [credito.imei, credito.documento]
        .map(onlyDigits)
        .filter((value) => value.length >= 6)
    )
  );

  if (searchValues.length === 0) {
    return null;
  }

  const carteraUrl = new URL(ALO_CARTERA_PATH, session.reportUrl.origin);
  const page = await fetchTextFollowingRedirects(
    carteraUrl.toString(),
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-CO,es;q=0.9",
        "User-Agent": ALO_USER_AGENT,
      },
    },
    session.jar
  );

  if (looksLikeLoginPage(page.text)) {
    return null;
  }

  const pageHeaders = extractTableHeaderCandidates(page.text);
  const pageTerms = findCarteraTermsInText(page.text, searchValues, pageHeaders);

  if (pageTerms) {
    return pageTerms;
  }

  const fallos: Array<Record<string, unknown>> = [];

  for (const searchValue of searchValues) {
    const candidates = aloCarteraSearchCandidates(
      page.text,
      page.url,
      searchValue
    );

    for (const candidate of candidates) {
      const result = await fetchAloTextCandidate(
        session.jar,
        candidate,
        page.url
      );

      if (!result.ok) {
        fallos.push({
          origen: describeDownloadCandidate(candidate),
          status: result.status,
        });
        continue;
      }

      const terms = findCarteraTermsInText(result.text, searchValues, pageHeaders);

      if (terms) {
        console.info("ALO CREDIT cartera encontro cuota/plazo", {
          busqueda: maskNumericValue(searchValue),
          origen: describeDownloadCandidate(candidate),
          valorCuota: terms.valorCuota !== null,
          numeroCuotas: terms.numeroCuotas !== null,
        });

        return terms;
      }
    }
  }

  logAloInfo("ALO CREDIT cartera sin cuota/plazo detalle", {
    busquedas: searchValues.map(maskNumericValue),
    estructura: debugHtmlStructure(page.text, page.url),
    fallos: fallos.slice(0, 8),
  });

  return null;
}

async function completarCuotaPlazoDesdeCartera(
  session: AloSession,
  credito: AloCreditoImei
) {
  try {
    const terms = await consultarCuotaPlazoAloCartera(session, credito);

    if (!terms) {
      return credito;
    }

    return {
      ...credito,
      valorCuota: terms.valorCuota ?? credito.valorCuota,
      numeroCuotas: terms.numeroCuotas ?? credito.numeroCuotas,
      origen:
        terms.valorCuota !== null || terms.numeroCuotas !== null
          ? `${credito.origen}+admin_cartera`
          : credito.origen,
    } satisfies AloCreditoImei;
  } catch (error) {
    console.info("ALO CREDIT cartera no pudo complementar cuota/plazo", {
      error: error instanceof Error ? error.message : "error desconocido",
    });

    return credito;
  }
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
    parseAmount(getByHeader(row, headerRow, isAccessoryValueKey)) ??
    (headerRow ? null : parseAmount(getCell(row, 8)));
  const documento = findDocument(row, headerRow, imei);
  const plazo = findTermValue(row, headerRow);
  const valorCuotaRaw = getByHeader(
    row,
    headerRow,
    isInstallmentValueKey
  );
  const correo =
    visibleText(
      getByHeader(row, headerRow, isEmailKey)
    ) ||
    findEmail(row);
  const telefono = findPhone(row, headerRow, documento || null, imei);
  const clienteNombre = findClientName(row, headerRow);
  const numeroCuotas = parseTermByHeader(plazo.value, plazo.headerKey);
  const valorCuota =
    parseAmount(valorCuotaRaw) ??
    (numeroCuotas && numeroCuotas > 0
      ? Math.round(creditoAutorizado / numeroCuotas)
      : null);
  const valorAccesorios =
    accesorios !== null && accesorios > 0 ? accesorios : null;

  if (!clienteNombre || !documento || !valorCuota || !numeroCuotas) {
    logAloInfo("ALO CREDIT credito parcial detalle", {
      faltantes: {
        clienteNombre: !clienteNombre,
        documento: !documento,
        valorCuota: !valorCuota,
        numeroCuotas: !numeroCuotas,
      },
      encabezados: headerRow?.map((cell) => maskDebugText(visibleText(cell), 80)) ?? [],
      fila: row.map((cell) => maskDebugText(visibleText(cell), 80)),
    });
  }

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

  const session = await loginAlo();
  const reportBuffer = await downloadFirstReport(imei, session);

  if (!reportBuffer) {
    return null;
  }

  const credito = findCreditoInWorkbook(reportBuffer, imei);

  if (!credito) {
    return null;
  }

  return completarCuotaPlazoDesdeCartera(session, credito);
}
