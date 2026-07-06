import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const SUMAS_SECRET_KEY = "cGFzc3dvcmRfc2VjcmV0X3N1bWFzX3BhcmFfdGk=";
const DEFAULT_FRECUENCIA_CUOTA = "MENSUAL" as const;
const COLOMBIA_TIME_ZONE = "America/Bogota";
const SUMAS_POINT_CREDIT_KEYWORD = "CONECTAMOS";

const SUMASPAY_PROVIDER = {
  envPrefix: "SUMASCONSULTA",
  financiera: "SUMASPAY",
  logLabel: "SUMASPAY",
  requierePerfilPin: false,
} as const;

const ESMIOPCION_PROVIDER = {
  envPrefix: "ESMIOPCIONCONSULTA",
  financiera: "ESMIOPCION",
  logLabel: "ESMIOPCION",
  requierePerfilPin: true,
} as const;

type SumasConsultaProvider =
  | typeof SUMASPAY_PROVIDER
  | typeof ESMIOPCION_PROVIDER;

type SumasCreditoCedulaBase = {
  documento: string;
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
  origen: string;
};

export type SumasPayCreditoCedula = SumasCreditoCedulaBase & {
  financiera: "SUMASPAY";
  encontradoEnSumasPay: boolean;
};

export type SumasPayCreditoCedulaBatchItem = {
  documento: string;
  credito: SumasPayCreditoCedula | null;
  error?: string;
};

export type EsmioOpcionCreditoCedula = SumasCreditoCedulaBase & {
  financiera: "ESMIOPCION";
  encontradoEnEsmioOpcion: boolean;
};

type SumasLikeCreditoCedula =
  | SumasPayCreditoCedula
  | EsmioOpcionCreditoCedula;

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

type SumasCredentials = {
  usuario: string;
  clave: string;
  perfil?: string;
  pin?: string;
  perfilEndpoint?: string;
};

type Candidate = {
  record: Record<string, unknown>;
  source: string;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  activeScore: number;
};

type SumasPayload = { source: string; data: unknown; loanId?: string };

type SumasCreditoLookupOptions = {
  maxCreditAgeDays?: number;
  maxCreditAgeMonths?: number;
  requireConectamosPoint?: boolean;
  allowMissingCreditCreationDate?: boolean;
};

const DEFAULT_SUMAS_CREDITO_LOOKUP_OPTIONS = {
  maxCreditAgeDays: 1,
  requireConectamosPoint: true,
};
const SUMASPAY_BATCH_CONCURRENCY = 1;

export class SumasConsultaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SumasConsultaConfigError";
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let currentIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (currentIndex < items.length) {
        const index = currentIndex;
        currentIndex += 1;
        results[index] = await task(items[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function isSumasServerProcessError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  return message.trim().toLowerCase() === "error process in server";
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

function joinEndpointUrl(baseUrl: string, endpoint: string) {
  try {
    return new URL(endpoint).toString();
  } catch {
    return joinUrl(baseUrl, endpoint);
  }
}

function getConfiguredSumasConfig(
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
): SumasConfig {
  const urlEnv = `${provider.envPrefix}_URL`;
  const rawUrl = String(process.env[urlEnv] || "").trim();

  if (!rawUrl) {
    throw new SumasConsultaConfigError(`Falta configurar ${urlEnv}.`);
  }

  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SumasConsultaConfigError(`${urlEnv} no es una URL valida.`);
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

function getSumasBrowserHeaders(
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
) {
  const config = getConfiguredSumasConfig(provider);

  return {
    Origin: config.origin,
    Referer: config.refererUrl,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  };
}

function getCredentials(
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
): SumasCredentials {
  const usuarioEnv = `${provider.envPrefix}_USUARIO`;
  const claveEnv = `${provider.envPrefix}_CLAVE`;
  const usuario = String(process.env[usuarioEnv] || "").trim();
  const clave = String(process.env[claveEnv] || "").trim();

  if (!usuario || !clave) {
    throw new SumasConsultaConfigError(
      `Falta configurar ${usuarioEnv} y ${claveEnv}.`
    );
  }

  if (!provider.requierePerfilPin) {
    return { usuario, clave };
  }

  const perfilEnv = `${provider.envPrefix}_PERFIL`;
  const pinEnv = `${provider.envPrefix}_PIN`;
  const perfilEndpointEnv = `${provider.envPrefix}_PERFIL_ENDPOINT`;
  const perfil = String(process.env[perfilEnv] || "").trim();
  const pin = String(process.env[pinEnv] || "").trim();
  const perfilEndpoint = String(process.env[perfilEndpointEnv] || "").trim();

  if (!perfil || !pin) {
    throw new SumasConsultaConfigError(
      `Falta configurar ${perfilEnv} y ${pinEnv}.`
    );
  }

  return {
    usuario,
    clave,
    perfil,
    pin,
    perfilEndpoint: perfilEndpoint || undefined,
  };
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
  options?: { allowNotFound?: boolean },
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getSumasBrowserHeaders(provider),
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
    getMessage(payload) ||
    `${provider.logLabel} respondio con estado ${response.status}.`;

  if ([401, 403].includes(response.status)) {
    throw new SumasConsultaConfigError(message);
  }

  throw new SumasConsultaLookupError(message);
}

async function loginSumas(
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
): Promise<SumasSession> {
  const { apiBaseUrl } = getConfiguredSumasConfig(provider);
  const credentials = getCredentials(provider);
  const body = new URLSearchParams();

  body.set("username", encryptCryptoJsPassphrase(credentials.usuario));
  body.set("password", encryptCryptoJsPassphrase(credentials.clave));

  const loginPayload = unwrapData(
    await requestJson(
      joinUrl(apiBaseUrl, "service-user/users/login"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      undefined,
      provider
    )
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

  const session = await completeSumasProfileLogin(
    apiBaseUrl,
    accessToken,
    loginPayload,
    credentials,
    provider
  );

  return {
    apiBaseUrl,
    accessToken: session.accessToken,
    currentUser: session.currentUser,
  };
}

async function tryProtectedJson(
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
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
      { allowNotFound: true },
      provider
    );

    return unwrapData(payload);
  } catch (error) {
    if (error instanceof SumasConsultaConfigError) {
      throw error;
    }

    return null;
  }
}

async function requestProtectedJsonWithStatus(
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  init: RequestInit,
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
) {
  const response = await fetch(joinEndpointUrl(apiBaseUrl, path), {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getSumasBrowserHeaders(provider),
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  const payload = await readJsonResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    payload: unwrapData(payload),
  };
}

function getDeepJwtToken(value: unknown, depth = 0): string | null {
  if (depth > 5) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const token = getDeepJwtToken(item, depth + 1);
      if (token) return token;
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of [
    "access_token",
    "accessToken",
    "token",
    "jwt",
    "idToken",
    "id_token",
  ]) {
    if (key in value) {
      const token = getJwtToken(value[key]);
      if (token) return token;
    }
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) {
      const token = getDeepJwtToken(child, depth + 1);
      if (token) return token;
    }
  }

  return null;
}

function normalizeProfileSelector(value: unknown) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

function getProfileIdFromRecord(record: Record<string, unknown>) {
  return directString(record, [
    "id",
    "profileId",
    "profile_id",
    "perfilId",
    "perfil_id",
    "idProfile",
    "idPerfil",
    "roleId",
    "role_id",
    "rolId",
    "rol_id",
    "userProfileId",
    "user_profile_id",
  ]);
}

function getProfileTextFromRecord(record: Record<string, unknown>) {
  const direct = directString(record, [
    "name",
    "nombre",
    "profile",
    "perfil",
    "profileName",
    "profile_name",
    "perfilNombre",
    "perfil_nombre",
    "role",
    "rol",
    "roleName",
    "role_name",
    "description",
    "descripcion",
  ]);

  if (direct) {
    return direct;
  }

  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

function findProfileId(payloads: unknown[], perfil: string) {
  const trimmed = perfil.trim();

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const selector = normalizeProfileSelector(trimmed);

  if (!selector) {
    return null;
  }

  for (const payload of payloads) {
    for (const { record } of collectRecords(payload, "perfil")) {
      const text = normalizeProfileSelector(getProfileTextFromRecord(record));

      if (!text || (!text.includes(selector) && !selector.includes(text))) {
        continue;
      }

      return getProfileIdFromRecord(record) || trimmed;
    }
  }

  return null;
}

async function resolveProfileId(
  apiBaseUrl: string,
  accessToken: string,
  initialPayloads: unknown[],
  credentials: SumasCredentials,
  provider: SumasConsultaProvider
) {
  if (!credentials.perfil) {
    return null;
  }

  const fromInitialPayloads = findProfileId(initialPayloads, credentials.perfil);

  if (fromInitialPayloads) {
    return fromInitialPayloads;
  }

  for (const path of [
    "service-user/users/profiles",
    "service-user/users/profile",
    "service-user/profiles",
    "service-user/users/roles",
    "service-user/roles",
  ]) {
    const payload = await tryProtectedJson(
      apiBaseUrl,
      accessToken,
      path,
      undefined,
      provider
    );
    const found = findProfileId([payload], credentials.perfil);

    if (found) {
      return found;
    }
  }

  return credentials.perfil;
}

function profileValueForPayload(value: string) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function buildProfilePinPayloads(profileId: string, perfil: string, pin: string) {
  const value = profileValueForPayload(profileId);
  const perfilValue = profileValueForPayload(perfil);
  const payloads: Array<Record<string, unknown>> = [
    { profileId: value, pin },
    { perfilId: value, pin },
    { idProfile: value, pin },
    { idPerfil: value, pin },
    { roleId: value, pin },
    { rolId: value, pin },
    { userProfileId: value, pin },
    { id: value, pin },
    { profile: value, pin },
    { perfil: value, pin },
    { profileName: perfilValue, pin },
    { perfilNombre: perfilValue, pin },
    { profileId: value, password: pin },
    { perfilId: value, password: pin },
    { profileId: value, pinCode: pin },
    { perfilId: value, pinCode: pin },
  ];
  const seen = new Set<string>();

  return payloads.filter((payload) => {
    const key = JSON.stringify(payload);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getProfileEndpointCandidates(credentials: SumasCredentials) {
  const defaults = [
    "service-user/users/profile/login",
    "service-user/users/profiles/login",
    "service-user/users/select-profile",
    "service-user/users/profile/select",
    "service-user/users/profiles/select",
    "service-user/users/validate-pin",
    "service-user/users/pin",
    "service-user/profile/login",
    "service-user/profiles/login",
    "service-user/auth/profile",
  ];

  return Array.from(
    new Set([
      ...(credentials.perfilEndpoint ? [credentials.perfilEndpoint] : []),
      ...defaults,
    ])
  );
}

async function completeSumasProfileLogin(
  apiBaseUrl: string,
  accessToken: string,
  loginPayload: unknown,
  credentials: SumasCredentials,
  provider: SumasConsultaProvider
) {
  const currentUser = await tryProtectedJson(
    apiBaseUrl,
    accessToken,
    "service-user/users/me",
    undefined,
    provider
  );

  if (!provider.requierePerfilPin) {
    return { accessToken, currentUser };
  }

  if (!credentials.perfil || !credentials.pin) {
    throw new SumasConsultaConfigError(
      `Falta configurar ${provider.envPrefix}_PERFIL y ${provider.envPrefix}_PIN.`
    );
  }

  const profileId = await resolveProfileId(
    apiBaseUrl,
    accessToken,
    [loginPayload, currentUser],
    credentials,
    provider
  );

  if (!profileId) {
    throw new SumasConsultaConfigError(
      `${provider.logLabel} no encontro el perfil configurado.`
    );
  }

  const payloads = buildProfilePinPayloads(
    profileId,
    credentials.perfil,
    credentials.pin
  );
  const endpoints = getProfileEndpointCandidates(credentials);
  const attempts: Array<{ endpoint: string; status: number }> = [];

  for (const endpoint of endpoints) {
    for (const payload of payloads) {
      const response = await requestProtectedJsonWithStatus(
        apiBaseUrl,
        accessToken,
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        provider
      );

      attempts.push({ endpoint, status: response.status });

      if (!response.ok) {
        continue;
      }

      const selectedAccessToken =
        getDeepJwtToken(response.payload) || accessToken;
      const selectedUser =
        (await tryProtectedJson(
          apiBaseUrl,
          selectedAccessToken,
          "service-user/users/me",
          undefined,
          provider
        )) ||
        response.payload ||
        currentUser;

      return {
        accessToken: selectedAccessToken,
        currentUser: selectedUser,
      };
    }
  }

  console.info(`${provider.logLabel} seleccion de perfil sin exito`, {
    perfilConfigurado: Boolean(credentials.perfil),
    endpoints: Array.from(new Set(attempts.map((attempt) => attempt.endpoint))),
    estados: attempts.slice(-12),
  });

  throw new SumasConsultaConfigError(
    `${provider.logLabel} no permitio seleccionar el perfil configurado con el PIN.`
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

function getPaymentPeriodNumber(period: Record<string, unknown>) {
  const value = directNumber(period, [
    "#",
    "period",
    "periodNumber",
    "period_number",
    "numeroCuota",
    "numero_cuota",
    "numero",
    "number",
    "no",
    "num",
    "installmentNumber",
    "installment_number",
    "quotaNumber",
    "quota_number",
  ]);

  if (value === null) {
    return null;
  }

  const rounded = Math.round(value);

  return rounded > 0 ? rounded : null;
}

function getTermFromRepaymentPeriods(record: Record<string, unknown>) {
  const periods = getRepaymentPeriods(record);
  const periodNumbers = periods
    .map(getPaymentPeriodNumber)
    .filter((value): value is number => value !== null);

  if (periodNumbers.length === 0) {
    return null;
  }

  return Math.max(...periodNumbers);
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
  const termFromSchedule = getTermFromRepaymentPeriods(record);

  if (termFromSchedule !== null) {
    return termFromSchedule;
  }

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
    (period) => getPaymentPeriodNumber(period) !== null
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
      return cleanClientName(byKey);
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
        return cleanClientName(parts.join(" "));
      }
    }
  }

  return null;
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").replace(/\s+/g, "").trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 12 && digits.startsWith("57")) {
    return digits.slice(2);
  }

  if (digits.length > 10 && digits.startsWith("57")) {
    return digits.slice(-10);
  }

  return digits;
}

function getClientEmail(...values: unknown[]) {
  for (const value of values) {
    const byKey = deepString(value, [
      "correo",
      "correoElectronico",
      "email",
      "emailAddress",
      "mail",
      "clientEmail",
      "e_mail",
    ]);
    const email = normalizeEmail(byKey);

    if (email) {
      return email;
    }
  }

  return null;
}

function getClientPhone(...values: unknown[]) {
  for (const value of values) {
    const byKey = deepString(value, [
      "celular",
      "cellphone",
      "cellPhone",
      "mobile",
      "mobileNumber",
      "phone",
      "phoneNumber",
      "telefono",
      "telephone",
      "whatsapp",
      "clientPhone",
      "clientMobile",
    ]);
    const phone = normalizePhone(byKey);

    if (phone) {
      return phone;
    }
  }

  return null;
}

function getClientAddress(...values: unknown[]) {
  for (const value of values) {
    const address = deepString(value, [
      "direccion",
      "direccionCliente",
      "address",
      "addressLine",
      "addressLine1",
      "clientAddress",
      "customerAddress",
      "residenceAddress",
      "homeAddress",
      "domicilio",
      "dir",
    ]);

    if (address && address !== "[object Object]") {
      return address;
    }
  }

  return null;
}

function formatDateParts(year: number, month: number, day: number) {
  if (year < 1900 || year > 2100) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function normalizeDateInput(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1000000000) {
      const date = new Date(value > 9999999999 ? value : value * 1000);

      if (!Number.isNaN(date.getTime())) {
        return formatDateParts(
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
          date.getUTCDate()
        );
      }
    }

    return normalizeDateInput(String(Math.round(value)));
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day] = value.map((item) => Number(item));

    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) {
      return formatDateParts(year, month, day);
    }
  }

  if (isRecord(value)) {
    const year =
      directNumber(value, ["year", "anio", "ano"]) ??
      directNumber(value, ["years"]);
    const month =
      directNumber(value, ["month", "monthValue", "mes"]) ??
      directNumber(value, ["months"]);
    const day =
      directNumber(value, ["day", "dayOfMonth", "dia"]) ??
      directNumber(value, ["days"]);

    if (
      year !== null &&
      month !== null &&
      day !== null &&
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) {
      return formatDateParts(year, month, day);
    }

    const nested = directString(value, [
      "date",
      "value",
      "fecha",
      "fechaExpedicion",
      "birth_date",
      "date_create",
    ]);

    if (nested) {
      return normalizeDateInput(nested);
    }
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return formatDateParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return formatDateParts(
      Number(compactMatch[1]),
      Number(compactMatch[2]),
      Number(compactMatch[3])
    );
  }

  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (localMatch) {
    return formatDateParts(
      Number(localMatch[3]),
      Number(localMatch[2]),
      Number(localMatch[1])
    );
  }

  const arrayStringMatch = text.match(/^(\d{4}),(\d{1,2}),(\d{1,2})$/);
  if (arrayStringMatch) {
    return formatDateParts(
      Number(arrayStringMatch[1]),
      Number(arrayStringMatch[2]),
      Number(arrayStringMatch[3])
    );
  }

  return null;
}

function collectDeepValues(
  value: unknown,
  keys: string[],
  out: unknown[] = [],
  depth = 0
) {
  if (depth > 5) {
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDeepValues(item, keys, out, depth + 1);
    }
    return out;
  }

  if (!isRecord(value)) {
    return out;
  }

  const normalizedKeys = keys.map((key) => key.toLowerCase());

  for (const [key, child] of Object.entries(value)) {
    if (normalizedKeys.includes(key.toLowerCase())) {
      out.push(child);
    }

    if (Array.isArray(child) || isRecord(child)) {
      collectDeepValues(child, keys, out, depth + 1);
    }
  }

  return out;
}

function getClientDate(values: unknown[], keys: string[]) {
  for (const value of values) {
    const dateValues = collectDeepValues(value, keys);

    for (const dateValue of dateValues) {
      const date = normalizeDateInput(dateValue);

      if (date) {
        return date;
      }
    }
  }

  return null;
}

function getCreditCreationDate(record: Record<string, unknown>) {
  return getClientDate([record], [
    "loan_date",
    "loanDate",
    "fechaCredito",
    "fecha_credito",
    "fechaCreacion",
    "fecha_creacion",
    "createdAt",
    "created_at",
    "createdOn",
    "created_on",
    "createdDate",
    "created_date",
    "creationDate",
    "creation_date",
    "dateCreated",
    "date_created",
    "dateStart",
    "date_start",
    "submittedOnDate",
    "submitted_on_date",
    "disbursedOnDate",
    "disbursed_on_date",
    "disbursementDate",
    "disbursement_date",
  ]);
}

function getPointCreditName(record: Record<string, unknown>) {
  const text = deepString(record, [
    "point_sale_name",
    "pointSaleName",
    "point_credit_name",
    "pointCreditName",
    "creditPointName",
    "credit_point_name",
    "pointOfCreditName",
    "point_of_credit_name",
    "puntoCredito",
    "punto_credito",
    "puntoDeCredito",
    "punto_de_credito",
    "puntoDeVenta",
    "punto_de_venta",
    "puntoVenta",
    "pointOfSaleName",
    "point_of_sale_name",
    "storeName",
    "store_name",
    "branchName",
    "branch_name",
    "officeName",
    "office_name",
  ]);

  if (!text || text === "[object Object]") {
    return null;
  }

  return text;
}

function isConectamosPointCredit(puntoCredito: string | null) {
  return normalizeText(puntoCredito).includes(SUMAS_POINT_CREDIT_KEYWORD);
}

function getDateInColombia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return formatDateParts(year, month, day) || date.toISOString().slice(0, 10);
}

function shiftDateInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map((item) => Number(item));
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return formatDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function shiftMonthInput(value: string, months: number) {
  const [year, month, day] = value.split("-").map((item) => Number(item));
  const date = new Date(Date.UTC(year, month - 1 + months, day));

  return formatDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function isAllowedCreditCreationDate(
  fechaCreacionCredito: string | null,
  options: SumasCreditoLookupOptions,
  today = getDateInColombia()
) {
  const maxCreditAgeMonths = Number(options.maxCreditAgeMonths || 0);
  const maxCreditAgeDays = Number(
    options.maxCreditAgeDays ??
      DEFAULT_SUMAS_CREDITO_LOOKUP_OPTIONS.maxCreditAgeDays
  );
  const minDate =
    (maxCreditAgeMonths > 0
      ? shiftMonthInput(today, -maxCreditAgeMonths)
      : shiftDateInput(today, -Math.max(0, maxCreditAgeDays))) || today;

  return (
    Boolean(fechaCreacionCredito) &&
    String(fechaCreacionCredito) >= minDate &&
    String(fechaCreacionCredito) <= today
  );
}

function getCreditCreationDateByLoanId(payloads: SumasPayload[]) {
  const datesByLoanId = new Map<string, string>();

  for (const payload of payloads) {
    for (const { record } of collectRecords(payload.data, payload.source)) {
      const loanId = getLoanIdFromRecord(record) || payload.loanId;
      const fechaCreacionCredito = getCreditCreationDate(record);

      if (loanId && fechaCreacionCredito && !datesByLoanId.has(loanId)) {
        datesByLoanId.set(loanId, fechaCreacionCredito);
      }
    }
  }

  return datesByLoanId;
}

function getPointCreditNameByLoanId(payloads: SumasPayload[]) {
  const pointCreditByLoanId = new Map<string, string>();

  for (const payload of payloads) {
    for (const { record } of collectRecords(payload.data, payload.source)) {
      const loanId = getLoanIdFromRecord(record) || payload.loanId;
      const puntoCredito = getPointCreditName(record);

      if (loanId && puntoCredito && !pointCreditByLoanId.has(loanId)) {
        pointCreditByLoanId.set(loanId, puntoCredito);
      }
    }
  }

  return pointCreditByLoanId;
}

function getTermByLoanIdFromRepaymentPlan(payloads: SumasPayload[]) {
  const termsByLoanId = new Map<string, number>();

  for (const payload of payloads) {
    for (const { record } of collectRecords(payload.data, payload.source)) {
      const loanId = getLoanIdFromRecord(record) || payload.loanId;
      const numeroCuotas = getTermFromRepaymentPeriods(record);

      if (loanId && numeroCuotas !== null && !termsByLoanId.has(loanId)) {
        termsByLoanId.set(loanId, numeroCuotas);
      }
    }
  }

  return termsByLoanId;
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
  const creationDatesByLoanId = getCreditCreationDateByLoanId(payloads);
  const pointCreditNamesByLoanId = getPointCreditNameByLoanId(payloads);
  const termsByLoanId = getTermByLoanIdFromRepaymentPlan(payloads);

  for (const payload of payloads) {
    for (const { record, source } of collectRecords(payload.data, payload.source)) {
      const creditoAutorizado = getCreditAmount(record, source);

      if (creditoAutorizado === null || creditoAutorizado <= 0) {
        continue;
      }

      const valorCuota = getInstallmentValue(record);
      const loanId = getLoanIdFromRecord(record) || payload.loanId;
      const numeroCuotas =
        (loanId ? termsByLoanId.get(loanId) || null : null) || getTerm(record);
      const fechaCreacionCredito =
        getCreditCreationDate(record) ||
        (loanId ? creationDatesByLoanId.get(loanId) || null : null);
      const puntoCredito =
        getPointCreditName(record) ||
        (loanId ? pointCreditNamesByLoanId.get(loanId) || null : null);

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
        fechaCreacionCredito,
        puntoCredito,
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
  payloads: SumasPayload[],
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
) {
  for (const query of getClientCreditReportQueries(
    documento,
    session.currentUser
  )) {
    const params = new URLSearchParams(query.params);
    const clientCredit = await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/core-bridge/client-credit?${params.toString()}`,
      undefined,
      provider
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
  payloads: SumasPayload[],
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
) {
  for (const loanId of collectLoanIds(payloads)) {
    const loan = await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/loan/${encodeURIComponent(loanId)}`,
      undefined,
      provider
    );

    if (loan) {
      payloads.push({ source: "loan-detail", data: loan, loanId });
    }
  }
}

async function enrichCandidateWithPlan(
  session: SumasSession,
  documento: string,
  candidate: Candidate,
  clientId: string | null,
  provider: SumasConsultaProvider = SUMASPAY_PROVIDER
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
    },
    provider
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

function isSumasLikeConsultaConfigured(provider: SumasConsultaProvider) {
  const basicConfigured = Boolean(
    String(process.env[`${provider.envPrefix}_URL`] || "").trim() &&
      String(process.env[`${provider.envPrefix}_USUARIO`] || "").trim() &&
      String(process.env[`${provider.envPrefix}_CLAVE`] || "").trim()
  );

  if (!basicConfigured || !provider.requierePerfilPin) {
    return basicConfigured;
  }

  return Boolean(
    String(process.env[`${provider.envPrefix}_PERFIL`] || "").trim() &&
      String(process.env[`${provider.envPrefix}_PIN`] || "").trim()
  );
}

export function isSumasConsultaConfigured() {
  return isSumasLikeConsultaConfigured(SUMASPAY_PROVIDER);
}

export function isEsmioOpcionConsultaConfigured() {
  return isSumasLikeConsultaConfigured(ESMIOPCION_PROVIDER);
}

export async function obtenerCreditoSumasPayPorCedula(
  documentoInput: unknown,
  options: SumasCreditoLookupOptions = {}
): Promise<SumasPayCreditoCedula | null> {
  const credito = await obtenerCreditoSumaLikePorCedula(
    documentoInput,
    SUMASPAY_PROVIDER,
    options
  );

  return credito as SumasPayCreditoCedula | null;
}

export async function obtenerCreditosSumasPayPorCedulas(
  documentosInput: unknown[],
  options: SumasCreditoLookupOptions = {}
): Promise<SumasPayCreditoCedulaBatchItem[]> {
  const documentos = documentosInput
    .map((documentoInput) => normalizeDocumento(documentoInput))
    .filter((documento) => documento.length >= 5 && documento.length <= 15);

  if (documentos.length === 0) {
    return [];
  }

  const session = await loginSumas(SUMASPAY_PROVIDER);
  return mapWithConcurrency(
    documentos,
    SUMASPAY_BATCH_CONCURRENCY,
    async (documento): Promise<SumasPayCreditoCedulaBatchItem> => {
      try {
        const credito = await obtenerCreditoSumaLikePorCedulaConSesion(
          documento,
          SUMASPAY_PROVIDER,
          session,
          options
        );

        return {
          documento,
          credito: credito as SumasPayCreditoCedula | null,
        };
      } catch (error) {
        if (isSumasServerProcessError(error)) {
          return {
            documento,
            credito: null,
          };
        }

        return {
          documento,
          credito: null,
          error:
            error instanceof Error
              ? error.message
              : "Error consultando credito SUMASPAY",
        };
      }
    }
  );
}

export async function obtenerCreditoEsmioOpcionPorCedula(
  documentoInput: unknown
): Promise<EsmioOpcionCreditoCedula | null> {
  const credito = await obtenerCreditoSumaLikePorCedula(
    documentoInput,
    ESMIOPCION_PROVIDER,
    {}
  );

  return credito as EsmioOpcionCreditoCedula | null;
}

async function obtenerCreditoSumaLikePorCedula(
  documentoInput: unknown,
  provider: SumasConsultaProvider,
  options: SumasCreditoLookupOptions = {}
): Promise<SumasLikeCreditoCedula | null> {
  const documento = normalizeDocumento(documentoInput);

  if (documento.length < 5 || documento.length > 15) {
    throw new SumasConsultaLookupError(
      "La cedula debe tener entre 5 y 15 digitos."
    );
  }

  const session = await loginSumas(provider);
  return obtenerCreditoSumaLikePorCedulaConSesion(
    documento,
    provider,
    session,
    options
  );
}

async function obtenerCreditoSumaLikePorCedulaConSesion(
  documento: string,
  provider: SumasConsultaProvider,
  session: SumasSession,
  options: SumasCreditoLookupOptions = {}
): Promise<SumasLikeCreditoCedula | null> {
  const payloads: SumasPayload[] = [];

  const listCreditY2 = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/list-credit/y2/${encodeURIComponent(documento)}`,
    undefined,
    provider
  );

  if (listCreditY2) {
    payloads.push({ source: "list-credit-y2", data: listCreditY2 });
  }

  const clientPos = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/client/pos/${encodeURIComponent(documento)}`,
    undefined,
    provider
  );

  if (clientPos) {
    payloads.push({ source: "client-pos", data: clientPos });
  }

  await appendClientCreditReportPayloads(
    session,
    documento,
    payloads,
    provider
  );

  const clientSecure = await tryProtectedJson(
    session.apiBaseUrl,
    session.accessToken,
    `service-credit/manage/client/secure/${encodeURIComponent(documento)}`,
    undefined,
    provider
  );

  if (clientSecure) {
    payloads.push({ source: "client-secure", data: clientSecure });
  }

  const clientOnline =
    clientSecure ||
    (await tryProtectedJson(
      session.apiBaseUrl,
      session.accessToken,
      `service-credit/manage/client/${encodeURIComponent(documento)}`,
      undefined,
      provider
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
      `service-credit/manage/accounts/${encodeURIComponent(clientId)}`,
      undefined,
      provider
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
    )}`,
    undefined,
    provider
  );

  if (allCredits) {
    payloads.push({ source: "credits-by-client", data: allCredits });
  }

  await appendLoanDetailPayloads(session, payloads, provider);

  if (payloads.length === 0) {
    console.info(`${provider.logLabel} consulta sin payloads`, {
      documento: maskDocumento(documento),
    });

    return null;
  }

  const lookupOptions = {
    ...DEFAULT_SUMAS_CREDITO_LOOKUP_OPTIONS,
    ...options,
  };
  const candidates = buildCandidates(payloads);
  const eligibleCandidates = candidates.filter(
    (candidate) =>
      (isAllowedCreditCreationDate(
        candidate.fechaCreacionCredito,
        lookupOptions
      ) ||
        (lookupOptions.allowMissingCreditCreationDate === true &&
          !candidate.fechaCreacionCredito)) &&
      (lookupOptions.requireConectamosPoint === false ||
        isConectamosPointCredit(candidate.puntoCredito))
  );
  const selectedCandidate = eligibleCandidates[0];

  if (!selectedCandidate) {
    if (candidates.length > 0) {
      console.info(`${provider.logLabel} consulta sin credito elegible`, {
        documento: maskDocumento(documento),
        fechaActual: getDateInColombia(),
        opciones: {
          maxCreditAgeDays: lookupOptions.maxCreditAgeDays,
          maxCreditAgeMonths: lookupOptions.maxCreditAgeMonths,
          requireConectamosPoint: lookupOptions.requireConectamosPoint,
          allowMissingCreditCreationDate:
            lookupOptions.allowMissingCreditCreationDate,
        },
        candidatos: candidates.slice(0, 8).map((candidate) => ({
          source: candidate.source,
          fechaCreacionCredito: candidate.fechaCreacionCredito,
          puntoCredito: candidate.puntoCredito,
        })),
      });

      return null;
    }

    console.info(`${provider.logLabel} consulta sin candidato`, {
      documento: maskDocumento(documento),
      payloads: describePayloads(payloads),
    });

    return null;
  }

  const candidate = await enrichCandidateWithPlan(
    session,
    documento,
    selectedCandidate,
    clientId,
    provider
  );
  const clientPayloads = [
    clientSecure,
    clientOnline,
    clientPos,
    candidate.record,
    ...payloads.map((payload) => payload.data),
  ];

  const base = {
    documento,
    clienteNombre: getClientName(...clientPayloads),
    correoElectronico: getClientEmail(...clientPayloads),
    telefonoCliente: getClientPhone(...clientPayloads),
    direccionCliente: getClientAddress(...clientPayloads),
    fechaCreacionCredito: candidate.fechaCreacionCredito,
    puntoCredito: candidate.puntoCredito,
    creditoAutorizado: candidate.creditoAutorizado,
    numeroCuotas: candidate.numeroCuotas,
    valorCuota: candidate.valorCuota,
    frecuenciaCuota: DEFAULT_FRECUENCIA_CUOTA,
    origen: candidate.source,
  };

  if (provider.financiera === "ESMIOPCION") {
    return {
      ...base,
      financiera: "ESMIOPCION",
      encontradoEnEsmioOpcion: true,
    };
  }

  return {
    ...base,
    financiera: "SUMASPAY",
    encontradoEnSumasPay: true,
  };
}
