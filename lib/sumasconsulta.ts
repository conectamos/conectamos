import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const SUMAS_SECRET_KEY = "cGFzc3dvcmRfc2VjcmV0X3N1bWFzX3BhcmFfdGk=";
const DEFAULT_FRECUENCIA_CUOTA = "MENSUAL";

export type SumasPayCreditoCedula = {
  documento: string;
  financiera: "SUMASPAY";
  clienteNombre: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  frecuenciaCuota: "MENSUAL" | null;
  encontradoEnSumasPay: boolean;
  origen: string;
};

type SumasSession = {
  apiBaseUrl: string;
  accessToken: string;
  currentUser: unknown;
};

type SumasConfig = {
  apiBaseUrl: string;
  origin: string;
  refererUrl: string;
};

type Candidate = {
  record: Record<string, unknown>;
  source: string;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  activeScore: number;
};

type SumasPayload = { source: string; data: unknown };

export class SumasConsultaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SumasConsultaConfigError";
  }
}

export class SumasConsultaLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SumasConsultaLookupError";
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

function joinUrl(baseUrl: string, path: string) {
  return new URL(path.replace(/^\/+/, ""), baseUrl).toString();
}

function getConfiguredSumasConfig(): SumasConfig {
  const rawUrl = String(process.env.SUMASCONSULTA_URL || "").trim();

  if (!rawUrl) {
    throw new SumasConsultaConfigError("Falta configurar SUMASCONSULTA_URL.");
  }

  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SumasConsultaConfigError("SUMASCONSULTA_URL no es una URL valida.");
  }

  const apiIndex = parsed.pathname.toLowerCase().indexOf("/api");

  if (apiIndex >= 0) {
    const apiPath = parsed.pathname.slice(0, apiIndex + 4).replace(/\/+$/, "");
    return {
      apiBaseUrl: `${parsed.origin}${apiPath}/`,
      origin: parsed.origin,
      refererUrl: `${parsed.origin}/auth/login`,
    };
  }

  return {
    apiBaseUrl: `${parsed.origin}/api/`,
    origin: parsed.origin,
    refererUrl: rawUrl,
  };
}

function getSumasBrowserHeaders() {
  const config = getConfiguredSumasConfig();

  return {
    Origin: config.origin,
    Referer: config.refererUrl,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  };
}

function getCredentials() {
  const usuario = String(process.env.SUMASCONSULTA_USUARIO || "").trim();
  const clave = String(process.env.SUMASCONSULTA_CLAVE || "").trim();

  if (!usuario || !clave) {
    throw new SumasConsultaConfigError(
      "Falta configurar SUMASCONSULTA_USUARIO y SUMASCONSULTA_CLAVE."
    );
  }

  return { usuario, clave };
}

function formatSumasDate(date = new Date()) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function evpBytesToKey(password: Buffer, salt: Buffer) {
  const targetLength = 32 + 16;
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);

  while (Buffer.concat(chunks).length < targetLength) {
    previous = createHash("md5")
      .update(Buffer.concat([previous, password, salt]))
      .digest();
    chunks.push(previous);
  }

  const derived = Buffer.concat(chunks).subarray(0, targetLength);

  return {
    key: derived.subarray(0, 32),
    iv: derived.subarray(32, 48),
  };
}

function encryptCryptoJsPassphrase(value: string) {
  const salt = randomBytes(8);
  const { key, iv } = evpBytesToKey(Buffer.from(SUMAS_SECRET_KEY, "utf8"), salt);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([
    Buffer.from("Salted__"),
    salt,
    encrypted,
  ]).toString("base64");
}

function decryptCryptoJsPassphrase(value: string) {
  const payload = Buffer.from(value, "base64");

  if (payload.subarray(0, 8).toString("utf8") !== "Salted__") {
    throw new Error("Formato cifrado no soportado");
  }

  const salt = payload.subarray(8, 16);
  const encrypted = payload.subarray(16);
  const { key, iv } = evpBytesToKey(Buffer.from(SUMAS_SECRET_KEY, "utf8"), salt);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

function getJwtToken(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  if (raw.split(".").length === 3) {
    return raw;
  }

  try {
    const decrypted = decryptCryptoJsPassphrase(raw).trim();
    return decrypted.split(".").length === 3 ? decrypted : null;
  } catch {
    return null;
  }
}

function getMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  return String(payload.message || payload.error || "").trim() || null;
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

async function requestJson(
  url: string,
  init: RequestInit,
  options?: { allowNotFound?: boolean }
) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getSumasBrowserHeaders(),
      ...(init.headers || {}),
    },
  });
  const payload = await readJsonResponse(response);

  if (response.ok) {
    return payload;
  }

  if (options?.allowNotFound && [400, 404].includes(response.status)) {
    return null;
  }

  const message =
    getMessage(payload) || `SUMAS respondio con estado ${response.status}.`;

  if ([401, 403].includes(response.status)) {
    throw new SumasConsultaConfigError(message);
  }

  throw new SumasConsultaLookupError(message);
}

async function loginSumas(): Promise<SumasSession> {
  const { apiBaseUrl } = getConfiguredSumasConfig();
  const { usuario, clave } = getCredentials();
  const body = new URLSearchParams();

  body.set("username", encryptCryptoJsPassphrase(usuario));
  body.set("password", encryptCryptoJsPassphrase(clave));

  const loginPayload = unwrapData(
    await requestJson(joinUrl(apiBaseUrl, "service-user/users/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })
  );

  if (!isRecord(loginPayload)) {
    throw new SumasConsultaLookupError("SUMAS no devolvio una sesion valida.");
  }

  const accessToken = getJwtToken(loginPayload.access_token);

  if (!accessToken) {
    throw new SumasConsultaLookupError(
      "SUMAS no devolvio un token de acceso valido."
    );
  }

  const currentUser = await tryProtectedJson(
    apiBaseUrl,
    accessToken,
    "service-user/users/me"
  );

  return {
    apiBaseUrl,
    accessToken,
    currentUser,
  };
}

async function tryProtectedJson(
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit
) {
  try {
    const payload = await requestJson(
      joinUrl(apiBaseUrl, path),
      {
        ...(init || {}),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers || {}),
        },
      },
      { allowNotFound: true }
    );

    return unwrapData(payload);
  } catch (error) {
    if (error instanceof SumasConsultaConfigError) {
      throw error;
    }

    return null;
  }
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

function directNumber(
  record: Record<string, unknown>,
  keys: string[]
) {
  const normalizedKeys = keys.map((key) => key.toLowerCase());

  for (const [key, value] of Object.entries(record)) {
    if (!normalizedKeys.includes(key.toLowerCase())) {
      continue;
    }

    const parsed = toNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function directString(record: Record<string, unknown>, keys: string[]) {
  const normalizedKeys = keys.map((key) => key.toLowerCase());

  for (const [key, value] of Object.entries(record)) {
    if (!normalizedKeys.includes(key.toLowerCase())) {
      continue;
    }

    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function deepNumber(value: unknown, keys: string[], depth = 0): number | null {
  if (depth > 4) {
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

function deepString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 4) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepString(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const normalizedKeys = keys.map((key) => key.toLowerCase());

  for (const [key, child] of Object.entries(value)) {
    if (!normalizedKeys.includes(key.toLowerCase())) {
      continue;
    }

    const text = String(child || "").replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  for (const child of Object.values(value)) {
    const found = deepString(child, keys, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function getStatusScore(record: Record<string, unknown>) {
  const status = normalizeText(
    [
      deepString(record, ["status", "state", "estado"]),
      deepString(record, ["value", "name"]),
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    status.includes("CLOSED") ||
    status.includes("REJECTED") ||
    status.includes("CANCEL") ||
    status.includes("ANUL")
  ) {
    return -20;
  }

  if (
    status.includes("ACTIVE") ||
    status.includes("APPROVED") ||
    status.includes("AL DIA") ||
    status.includes("MORA") ||
    status.includes("OPEN")
  ) {
    return 20;
  }

  return 0;
}

function getRepaymentPeriods(record: Record<string, unknown>) {
  const schedule = record.repaymentSchedule;

  if (isRecord(schedule) && Array.isArray(schedule.periods)) {
    return schedule.periods.filter(isRecord);
  }

  if (Array.isArray(record.periods)) {
    return record.periods.filter(isRecord);
  }

  return [];
}

function getInstallmentValue(record: Record<string, unknown>) {
  const direct = directNumber(record, [
    "valorCuota",
    "valueQuota",
    "value_quota",
    "quotaValue",
    "quota_value",
    "installmentAmount",
    "periodicPayment",
    "monthlyPayment",
  ]);

  if (direct !== null) {
    return direct;
  }

  const periods = getRepaymentPeriods(record);
  const period =
    periods.find((item) => item.complete === false) ||
    periods.find((item) => toNumber(item.period) !== 0) ||
    periods[1] ||
    periods[0];

  if (!period) {
    return deepNumber(record, [
      "valorCuota",
      "valueQuota",
      "value_quota",
      "quotaValue",
      "quota_value",
      "installmentAmount",
      "totalDueForPeriod",
      "totalOriginalDueForPeriod",
      "totalOutstandingForPeriod",
    ]);
  }

  const periodValue = directNumber(period, [
    "totalDueForPeriod",
    "totalOriginalDueForPeriod",
    "totalOutstandingForPeriod",
    "valueQuota",
    "value_quota",
    "quotaValue",
    "quota_value",
    "valorCuota",
  ]);

  if (periodValue !== null) {
    return periodValue;
  }

  const dueParts = [
    "principalDue",
    "interestDue",
    "feeChargesDue",
    "penaltyChargesDue",
  ].map((key) => directNumber(period, [key]) || 0);
  const total = dueParts.reduce((acc, item) => acc + item, 0);

  return total > 0 ? total : null;
}

function getTerm(record: Record<string, unknown>) {
  const keys = [
    "numeroCuotas",
    "numberOfRepayments",
    "numberOfInstallments",
    "numberInstallments",
    "numberQuota",
    "number_quota",
    "installments",
    "term",
    "loanTerm",
    "quota",
    "loanTermFrequency",
  ];
  const direct = directNumber(record, keys) ?? deepNumber(record, keys);

  if (direct !== null) {
    return Math.round(direct);
  }

  const periods = getRepaymentPeriods(record).filter(
    (period) => toNumber(period.period) !== 0
  );

  return periods.length > 0 ? periods.length : null;
}

function getCreditAmount(record: Record<string, unknown>, source: string) {
  const reportAmountKeys = [
    "loan_amount_initial",
    "loanAmountInitial",
    "capital",
    "credit_value",
    "creditValue",
    "soldCapital",
    "sold_capital",
    "originalLoan",
  ];
  const sourceSpecificKeys =
    source === "list-credit-y2" ||
    source === "client-pos" ||
    source.startsWith("client-credit") ||
    source === "credits-by-client" ||
    source === "loan-detail"
      ? ["value", "ammount", ...reportAmountKeys]
      : [];

  return (
    directNumber(record, [
      ...sourceSpecificKeys,
      "approvedPrincipal",
      "principal",
      "loanAmount",
      "amount",
      "approvedAmount",
      "amountApproved",
      "principalDisbursed",
      "totalPrincipalDisbursed",
      "principalPortion",
      "principal_portion",
      "creditAmount",
      "valorCredito",
    ]) ??
    deepNumber(record, [
      ...sourceSpecificKeys,
      "approvedPrincipal",
      "loanAmount",
      "approvedAmount",
      "principalDisbursed",
      "totalPrincipalDisbursed",
      "principalPortion",
      "principal_portion",
      "creditAmount",
      "valorCredito",
    ])
  );
}

function getClientName(...values: unknown[]) {
  for (const value of values) {
    const byKey = deepString(value, [
      "clienteNombre",
      "clientName",
      "client_name",
      "displayName",
      "fullName",
      "fullname",
      "completeName",
      "nombreCompleto",
      "full_name",
      "razonSocial",
    ]);

    if (byKey) {
      return byKey;
    }

    if (isRecord(value)) {
      const parts = [
        value.firstname,
        value.firstName,
        value.first_name,
        value.name,
        value.secondName,
        value.second_name,
        value.lastname,
        value.lastName,
        value.firstSurname,
        value.first_surname,
        value.surname,
        value.secondSurname,
        value.second_surname,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean);

      if (parts.length >= 2) {
        return parts.join(" ").replace(/\s+/g, " ").trim();
      }
    }
  }

  return null;
}

function acceptsAmountOnlyCandidate(source: string) {
  return (
    source === "client-pos" ||
    source === "list-credit-y2" ||
    source.startsWith("client-credit")
  );
}

function buildCandidates(payloads: SumasPayload[]) {
  const candidates: Candidate[] = [];

  for (const payload of payloads) {
    for (const { record, source } of collectRecords(payload.data, payload.source)) {
      const creditoAutorizado = getCreditAmount(record, source);

      if (creditoAutorizado === null || creditoAutorizado <= 0) {
        continue;
      }

      const numeroCuotas = getTerm(record);
      const valorCuota = getInstallmentValue(record);

      if (
        numeroCuotas === null &&
        valorCuota === null &&
        !acceptsAmountOnlyCandidate(source)
      ) {
        continue;
      }

      candidates.push({
        record,
        source,
        creditoAutorizado,
        numeroCuotas,
        valorCuota,
        activeScore: getStatusScore(record),
      });
    }
  }

  return candidates.sort((a, b) => {
    if (b.activeScore !== a.activeScore) {
      return b.activeScore - a.activeScore;
    }

    const completenessA =
      (a.numeroCuotas === null ? 0 : 1) + (a.valorCuota === null ? 0 : 1);
    const completenessB =
      (b.numeroCuotas === null ? 0 : 1) + (b.valorCuota === null ? 0 : 1);

    if (completenessB !== completenessA) {
      return completenessB - completenessA;
    }

    return b.creditoAutorizado - a.creditoAutorizado;
  });
}

function describePayloads(payloads: SumasPayload[]) {
  return payloads.map((payload) => {
    const data = payload.data;
    const records = collectRecords(data, payload.source);
    const topLevelKeys = isRecord(data) ? Object.keys(data).slice(0, 12) : [];

    return {
      source: payload.source,
      type: Array.isArray(data) ? "array" : typeof data,
      arrayLength: Array.isArray(data) ? data.length : undefined,
      recordCount: records.length,
      topLevelKeys,
    };
  });
}

function getId(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const id = directNumber(value, ["id", "clientId"]);
  return id === null ? null : String(Math.round(id));
}

function getDeepId(value: unknown, keys: string[]) {
  const id = deepNumber(value, keys);
  return id === null ? null : String(Math.round(id));
}

function getStoreCode(value: unknown) {
  if (isRecord(value) && isRecord(value.store)) {
    const direct = deepString(value.store, ["code", "codigo", "storeCode"]);
    if (direct) {
      return direct;
    }
  }

  return deepString(value, [
    "pointOfSalesCode",
    "storeCode",
    "codigoTienda",
  ]);
}

function getCompanyNit(value: unknown) {
  if (isRecord(value) && isRecord(value.company)) {
    const direct = deepString(value.company, [
      "nit",
      "taxId",
      "identification",
      "document",
      "documentNumber",
    ]);

    if (direct) {
      return normalizeDocumento(direct) || direct;
    }
  }

  const fallback = deepString(value, [
    "companyNit",
    "nitCompany",
    "companyIdentification",
    "companyDocument",
  ]);

  return fallback ? normalizeDocumento(fallback) || fallback : null;
}

function getClientCreditReportQueries(documento: string, currentUser: unknown) {
  const queries: Array<{
    source: string;
    params: Record<string, string>;
  }> = [];
  const seen = new Set<string>();
  const storeCode = getStoreCode(currentUser);
  const companyNit = getCompanyNit(currentUser);
  const add = (source: string, params: Record<string, string | null>) => {
    const cleanParams = Object.entries(params).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const text = String(value || "").trim();
        if (text) {
          acc[key] = text;
        }
        return acc;
      },
      {}
    );
    const key = new URLSearchParams(cleanParams).toString();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    queries.push({ source, params: cleanParams });
  };

  add("client-credit", { identification: documento });

  if (storeCode) {
    add("client-credit-store", {
      identification: documento,
      creditPoint: storeCode,
    });
  }

  if (companyNit) {
    add("client-credit-company", {
      identification: documento,
      company: companyNit,
    });
  }

  return queries;
}

async function appendClientCreditReportPayloads(
  session: SumasSession,
  documento: string,
  payloads: SumasPayload[]
) {
  for (const query of getClientCreditReportQueries(
    documento,
    session.currentUser
  )) {
    const params = new URLSearchParams(query.params);
    const clientCredit = await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/core-bridge/client-credit?${params.toString()}`
    );

    if (clientCredit) {
      payloads.push({ source: query.source, data: clientCredit });
    }
  }
}

function getLoanIdFromRecord(record: Record<string, unknown>) {
  const direct = directString(record, [
    "account_no",
    "accountNo",
    "loanId",
    "loan_id",
    "loanNumber",
    "loan_number",
    "numberCredit",
    "number_credit",
    "num_credito",
    "numeroCredito",
  ]);

  if (!direct || !/\d/.test(direct)) {
    return null;
  }

  return direct.replace(/\s+/g, "").trim();
}

function collectLoanIds(payloads: SumasPayload[]) {
  const ids = new Set<string>();

  for (const payload of payloads) {
    for (const { record } of collectRecords(payload.data, payload.source)) {
      const loanId = getLoanIdFromRecord(record);

      if (loanId) {
        ids.add(loanId);
      }
    }
  }

  return Array.from(ids).slice(0, 8);
}

async function appendLoanDetailPayloads(
  session: SumasSession,
  payloads: SumasPayload[]
) {
  for (const loanId of collectLoanIds(payloads)) {
    const loan = await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/loan/${encodeURIComponent(loanId)}`
    );

    if (loan) {
      payloads.push({ source: "loan-detail", data: loan });
    }
  }
}

async function enrichCandidateWithPlan(
  session: SumasSession,
  documento: string,
  candidate: Candidate,
  clientId: string | null
): Promise<Candidate> {
  if (candidate.valorCuota !== null || candidate.numeroCuotas === null || !clientId) {
    return candidate;
  }

  const storeCode = getStoreCode(session.currentUser);

  if (!storeCode) {
    return candidate;
  }

  const planPayload = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/pay/plan/${encodeURIComponent(clientId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientDocumentId: Number(documento),
        pointOfSalesCode: Number(storeCode),
        requestedDate: formatSumasDate(),
        amount: candidate.creditoAutorizado,
        term: candidate.numeroCuotas,
        dateFormat: "dd/MM/yyyy",
        locale: "es",
      }),
    }
  );

  if (!planPayload) {
    return candidate;
  }

  const valorCuota = getInstallmentValue(
    isRecord(planPayload) ? planPayload : { planPayload }
  );

  return valorCuota === null
    ? candidate
    : {
        ...candidate,
        valorCuota,
      };
}

export function isSumasConsultaConfigured() {
  return Boolean(
    String(process.env.SUMASCONSULTA_URL || "").trim() &&
      String(process.env.SUMASCONSULTA_USUARIO || "").trim() &&
      String(process.env.SUMASCONSULTA_CLAVE || "").trim()
  );
}

export async function obtenerCreditoSumasPayPorCedula(
  documentoInput: unknown
): Promise<SumasPayCreditoCedula | null> {
  const documento = normalizeDocumento(documentoInput);

  if (documento.length < 5 || documento.length > 15) {
    throw new SumasConsultaLookupError(
      "La cedula debe tener entre 5 y 15 digitos."
    );
  }

  const session = await loginSumas();
  const payloads: SumasPayload[] = [];

  const listCreditY2 = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/list-credit/y2/${encodeURIComponent(documento)}`
  );

  if (listCreditY2) {
    payloads.push({ source: "list-credit-y2", data: listCreditY2 });
  }

  const clientPos = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/client/pos/${encodeURIComponent(documento)}`
  );

  if (clientPos) {
    payloads.push({ source: "client-pos", data: clientPos });
  }

  await appendClientCreditReportPayloads(session, documento, payloads);

  const clientSecure = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/client/secure/${encodeURIComponent(documento)}`
  );

  if (clientSecure) {
    payloads.push({ source: "client-secure", data: clientSecure });
  }

  const clientOnline =
    clientSecure ||
    (await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/client/${encodeURIComponent(documento)}`
    ));

  if (clientOnline && clientOnline !== clientSecure) {
    payloads.push({ source: "client-online", data: clientOnline });
  }

  const clientId =
    getId(clientSecure) ||
    getId(clientOnline) ||
    getId(clientPos) ||
    getDeepId(clientPos, ["clientId"]);

  if (clientId) {
    const accounts = await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/accounts/${encodeURIComponent(clientId)}`
    );

    if (accounts) {
      payloads.push({ source: "accounts", data: accounts });
    }
  }

  const allCredits = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/core-bridge/credits-by-client/all?identification=${encodeURIComponent(
      documento
    )}`
  );

  if (allCredits) {
    payloads.push({ source: "credits-by-client", data: allCredits });
  }

  await appendLoanDetailPayloads(session, payloads);

  if (payloads.length === 0) {
    console.info("SUMASPAY consulta sin payloads", {
      documento: maskDocumento(documento),
    });

    return null;
  }

  const candidates = buildCandidates(payloads);
  const selectedCandidate = candidates[0];

  if (!selectedCandidate) {
    console.info("SUMASPAY consulta sin candidato", {
      documento: maskDocumento(documento),
      payloads: describePayloads(payloads),
    });

    return null;
  }

  const candidate = await enrichCandidateWithPlan(
    session,
    documento,
    selectedCandidate,
    clientId
  );

  return {
    documento,
    financiera: "SUMASPAY",
    clienteNombre: getClientName(
      clientSecure,
      clientOnline,
      clientPos,
      candidate.record
    ),
    creditoAutorizado: candidate.creditoAutorizado,
    numeroCuotas: candidate.numeroCuotas,
    valorCuota: candidate.valorCuota,
    frecuenciaCuota: DEFAULT_FRECUENCIA_CUOTA,
    encontradoEnSumasPay: true,
    origen: candidate.source,
  };
}
