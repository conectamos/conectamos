import * as XLSX from "xlsx";

const ALO_DEFAULT_REPORT_URL = "https://consola.alocredit.co/admin_reportes";
const ALO_LOGIN_PATH = "/login";
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

type CachedReport = {
  buffer: Buffer;
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

  let reportUrl: URL;

  try {
    reportUrl = new URL(url);
  } catch {
    throw new AloConsultaConfigError("ALOCONSULTA_URL no es una URL valida.");
  }

  return {
    reportUrl,
    loginUrl: new URL(ALO_LOGIN_PATH, reportUrl.origin),
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

function scoreDownloadCandidate(text: string, href: string) {
  const normalized = normalizeText(`${text} ${href}`);

  if (normalized.includes("CERRAR SESION") || normalized.includes("LOGOUT")) {
    return 0;
  }

  let score = 0;

  if (normalized.includes("DESCARG")) score += 50;
  if (normalized.includes("DOWNLOAD")) score += 50;
  if (normalized.includes("EXCEL")) score += 35;
  if (normalized.includes("XLS")) score += 35;
  if (normalized.includes("EXPORT")) score += 25;
  if (normalized.includes("REPORTE")) score += 10;

  return score;
}

function firstTableRows(html: string, maxRows = 3) {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)).map(
    (match) => match[0]
  );

  return rows
    .filter((row) => normalizeText(row.replace(/<[^>]*>/g, " ")).length > 0)
    .slice(0, maxRows);
}

function extractJavascriptUrls(html: string, baseUrl: string) {
  const candidates: DownloadCandidate[] = [];
  const onclickRegex =
    /(?:onclick|data-url|data-href)\s*=\s*("([^"]+)"|'([^']+)')/gi;

  for (const match of html.matchAll(onclickRegex)) {
    const value = decodeHtml(match[2] || match[3] || "");
    const urlMatch = value.match(
      /(?:window\.open|location\.href|location\.assign|location\.replace)\s*\(\s*['"]([^'"]+)['"]/i
    ) || value.match(/(?:href|url)\s*[:=]\s*['"]([^'"]+)['"]/i);
    const rawUrl = urlMatch?.[1];

    if (!rawUrl) {
      continue;
    }

    const score = scoreDownloadCandidate(value, rawUrl);

    if (score <= 0) {
      continue;
    }

    candidates.push({
      url: new URL(rawUrl, baseUrl).toString(),
      score,
    });
  }

  return candidates;
}

function findDownloadFormCandidates(html: string, baseUrl: string) {
  const candidates: DownloadCandidate[] = [];

  parseForms(html, baseUrl).forEach((form, index) => {
    const score =
      scoreDownloadCandidate(form.html, form.action) + (index === 0 ? 5 : 0);

    if (score <= 0) {
      return;
    }

    candidates.push({
      url: form.action,
      method: form.method === "GET" ? "GET" : "POST",
      body: new URLSearchParams(form.fields),
      score,
    });
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
    const score = scoreDownloadCandidate(text, href);

    if (score <= 0) {
      continue;
    }

    candidates.push({
      url: new URL(href, baseUrl).toString(),
      score,
    });
  }

  candidates.push(...extractJavascriptUrls(html, baseUrl));
  candidates.push(...findDownloadFormCandidates(html, baseUrl));

  if (options.includeFirstRows !== false) {
    for (const row of firstTableRows(html)) {
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

  return candidates.sort((a, b) => b.score - a.score);
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
  const submitMatch = consultForm.html.match(
    /<(button|input)\b[^>]*(consult|buscar)[^>]*>/i
  );

  if (submitMatch) {
    const name = getHtmlAttribute(submitMatch[0], "name");
    if (name) {
      fields.set(name, getHtmlAttribute(submitMatch[0], "value") || "1");
    }
  }

  const action = new URL(consultForm.action);

  if (consultForm.method === "GET") {
    for (const [key, value] of fields) {
      action.searchParams.set(key, value);
    }
  }

  return fetchTextFollowingRedirects(
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

async function downloadFirstReport() {
  if (cachedReport && cachedReport.expiresAt > Date.now()) {
    return cachedReport.buffer;
  }

  const session = await loginAlo();
  const reportsPage = await getConsultedReportsPage(session.jar, session.reportUrl);
  const candidates = findDownloadCandidates(reportsPage.text, reportsPage.url);

  if (candidates.length === 0) {
    throw new AloConsultaLookupError(
      "No se encontro el enlace de descarga del primer reporte de ALO CREDIT."
    );
  }

  let buffer = await fetchReportBufferFromUrl(
    session.jar,
    candidates[0],
    reportsPage.url
  );
  const asText = buffer.subarray(0, 300).toString("utf8");

  if (/^\s*<!doctype html|^\s*<html/i.test(asText)) {
    const nested = findDownloadCandidates(buffer.toString("utf8"), candidates[0].url);
    if (nested.length > 0) {
      buffer = await fetchReportBufferFromUrl(
        session.jar,
        nested[0],
        candidates[0].url
      );
    }
  }

  if (/^\s*<!doctype html|^\s*<html/i.test(buffer.subarray(0, 300).toString("utf8"))) {
    throw new AloConsultaLookupError(
      "ALO CREDIT no devolvio un archivo Excel al descargar el reporte."
    );
  }

  cachedReport = {
    buffer,
    expiresAt: Date.now() + ALO_REPORT_CACHE_MS,
  };

  return buffer;
}

function readWorkbookMatrix(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
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
  const creditoAutorizado = parseAmount(getCell(row, 10));

  if (creditoAutorizado === null || creditoAutorizado <= 0) {
    return null;
  }

  const accesorios = parseAmount(getCell(row, 8));
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

function findCreditoInWorkbook(buffer: Buffer, imei: string) {
  for (const { matrix } of readWorkbookMatrix(buffer)) {
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

  const reportBuffer = await downloadFirstReport();

  return findCreditoInWorkbook(reportBuffer, imei);
}
