const FINSERPAY_DEFAULT_URL =
  "https://finserpay.com/api/public/creditos/imei?imei=IMEI_DEL_EQUIPO";
const FINSERPAY_TIMEOUT_MS = 30_000;

type FinserpayConfig = {
  urlTemplate: string;
  token: string;
};

export type FinserpayReferenciaCliente = {
  nombre: string | null;
  telefono: string | null;
};

export type FinserpayCreditoImei = {
  imei: string;
  financiera: "FINSERPAY";
  clienteNombre: string | null;
  documento: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  direccionCliente: string | null;
  referenciaFamiliar1: FinserpayReferenciaCliente;
  referenciaFamiliar2: FinserpayReferenciaCliente;
  creditoAutorizado: number;
  valorCuota: number | null;
  numeroCuotas: number | null;
  frecuenciaCuota: "SEMANAL" | "CATORCENAL" | "MENSUAL" | null;
  moneda: string | null;
  origen: string;
};

export class FinserpayConsultaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinserpayConsultaConfigError";
  }
}

export class FinserpayConsultaLookupError extends Error {
  status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "FinserpayConsultaLookupError";
    this.status = options?.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeImei(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizeDocument(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim() || null;
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

function cleanText(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  return text && text !== "[object Object]" && text !== "-" ? text : null;
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").replace(/\s+/g, "").trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("57")) {
    return digits.slice(2);
  }

  if (digits.length > 10 && digits.startsWith("57")) {
    return digits.slice(-10);
  }

  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits.length === 10 ? digits : null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
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

  if (!normalized || normalized === "-" || normalized === ".") {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function directText(record: Record<string, unknown>, keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey));

  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(normalizeKey(key))) {
      continue;
    }

    const text = cleanText(value);

    if (text) {
      return text;
    }
  }

  return null;
}

function deepText(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 7) {
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
    if (!Array.isArray(child) && !isRecord(child)) {
      continue;
    }

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
  if (depth > 7) {
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
    if (!Array.isArray(child) && !isRecord(child)) {
      continue;
    }

    const found = deepNumber(child, keys, depth + 1);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

function collectRecords(
  value: unknown,
  out: Record<string, unknown>[] = [],
  depth = 0
) {
  if (depth > 7) {
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRecords(item, out, depth + 1);
    }
    return out;
  }

  if (!isRecord(value)) {
    return out;
  }

  out.push(value);

  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) {
      collectRecords(child, out, depth + 1);
    }
  }

  return out;
}

function collectReferenceArrays(
  value: unknown,
  out: unknown[][] = [],
  depth = 0
) {
  if (depth > 6 || !isRecord(value)) {
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);

    if (
      Array.isArray(child) &&
      (normalizedKey.includes("REFER") ||
        normalizedKey.includes("REFERENCE") ||
        normalizedKey.includes("FAMILIAR"))
    ) {
      out.push(child);
      continue;
    }

    if (isRecord(child)) {
      collectReferenceArrays(child, out, depth + 1);
    }
  }

  return out;
}

function getConfig(): FinserpayConfig {
  const urlTemplate = String(
    process.env.FINSERPAYCONSULTA_URL || FINSERPAY_DEFAULT_URL
  ).trim();
  const token = String(
    process.env.FINSERPAYCONSULTA_TOKEN ||
      process.env.FINSERPAY_API_TOKEN ||
      process.env.FINSERPAY_TOKEN ||
      process.env.FINSERPAYCONSULTA_CLAVE ||
      ""
  ).trim();

  if (!urlTemplate || !token) {
    throw new FinserpayConsultaConfigError(
      "Falta configurar FINSERPAYCONSULTA_URL y FINSERPAYCONSULTA_TOKEN."
    );
  }

  try {
    new URL(urlTemplate.replace("IMEI_DEL_EQUIPO", "000000000000000"));
  } catch {
    throw new FinserpayConsultaConfigError(
      "FINSERPAYCONSULTA_URL no es una URL valida."
    );
  }

  return {
    urlTemplate,
    token,
  };
}

export function isFinserpayConsultaConfigured() {
  return Boolean(
    String(process.env.FINSERPAYCONSULTA_URL || FINSERPAY_DEFAULT_URL).trim() &&
      String(
        process.env.FINSERPAYCONSULTA_TOKEN ||
          process.env.FINSERPAY_API_TOKEN ||
          process.env.FINSERPAY_TOKEN ||
          process.env.FINSERPAYCONSULTA_CLAVE ||
          ""
      ).trim()
  );
}

function buildLookupUrl(urlTemplate: string, imei: string) {
  const replaced = urlTemplate
    .replace(/IMEI_DEL_EQUIPO/g, encodeURIComponent(imei))
    .replace(/\{imei\}/gi, encodeURIComponent(imei))
    .replace(/:imei/gi, encodeURIComponent(imei));
  const url = new URL(replaced);

  if (!url.searchParams.has("imei")) {
    url.searchParams.set("imei", imei);
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

function authHeaderVariants(token: string): HeadersInit[] {
  return [
    { authorization: `Bearer ${token}` },
    { authorization: `Token ${token}` },
    { authorization: token },
    { "x-api-key": token },
    { "x-auth-token": token },
    { token },
  ];
}

async function requestFinserpay(url: URL, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FINSERPAY_TIMEOUT_MS);
  let lastUnauthorized: FinserpayConsultaLookupError | null = null;

  try {
    for (const authHeaders of authHeaderVariants(token)) {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          ...authHeaders,
        },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await readResponseBody(response);

      if (response.ok) {
        return body;
      }

      const message =
        typeof body === "string"
          ? body.slice(0, 180)
          : isRecord(body)
            ? String(body.message || body.error || body.detail || "")
            : "";
      const error = new FinserpayConsultaLookupError(
        message
          ? `FINSERPAY respondio con estado ${response.status}: ${message}`
          : `FINSERPAY respondio con estado ${response.status}.`,
        { status: response.status }
      );

      if (response.status === 401 || response.status === 403) {
        lastUnauthorized = error;
        continue;
      }

      throw error;
    }

    throw (
      lastUnauthorized ||
      new FinserpayConsultaLookupError(
        "FINSERPAY no acepto las credenciales configuradas."
      )
    );
  } catch (error) {
    if (error instanceof FinserpayConsultaLookupError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new FinserpayConsultaLookupError(
        "FINSERPAY no respondio a tiempo."
      );
    }

    throw new FinserpayConsultaLookupError(
      error instanceof Error
        ? `Error consultando FINSERPAY: ${error.message}`
        : "Error consultando FINSERPAY."
    );
  } finally {
    clearTimeout(timeout);
  }
}

function getClientName(value: unknown) {
  const fullName = deepText(value, [
    "clienteNombre",
    "nombreCliente",
    "customerName",
    "clientName",
    "fullName",
    "full_name",
    "name",
    "nombre",
    "nombres",
  ]);

  if (fullName) {
    return cleanText(fullName);
  }

  if (!isRecord(value)) {
    return null;
  }

  const parts = [
    deepText(value, ["primerNombre", "firstName", "first_name"]),
    deepText(value, ["segundoNombre", "secondName", "second_name"]),
    deepText(value, ["primerApellido", "firstSurname", "first_surname"]),
    deepText(value, ["segundoApellido", "secondSurname", "second_surname"]),
    deepText(value, ["apellido", "lastName", "last_name"]),
  ].filter(Boolean);

  return cleanText(parts.join(" "));
}

function getReferenceFromObject(value: unknown): FinserpayReferenciaCliente {
  return {
    nombre:
      cleanText(
        deepText(value, [
          "nombre",
          "name",
          "fullName",
          "full_name",
          "nombreReferencia",
          "referenceName",
        ])
      ) || null,
    telefono: normalizePhone(
      deepText(value, [
        "telefono",
        "phone",
        "phoneNumber",
        "phone_number",
        "celular",
        "mobile",
        "whatsapp",
      ])
    ),
  };
}

function getReference(value: unknown, index: 1 | 2): FinserpayReferenciaCliente {
  const suffixes =
    index === 1
      ? ["1", "Uno", "One", "Primer", "Primera"]
      : ["2", "Dos", "Two", "Segundo", "Segunda"];
  const nameKeys = suffixes.flatMap((suffix) => [
    `referencia${suffix}Nombre`,
    `nombreReferencia${suffix}`,
    `reference${suffix}Name`,
    `referenciaFamiliar${suffix}Nombre`,
    `personalReference${suffix}Name`,
  ]);
  const phoneKeys = suffixes.flatMap((suffix) => [
    `referencia${suffix}Telefono`,
    `telefonoReferencia${suffix}`,
    `reference${suffix}Phone`,
    `referenciaFamiliar${suffix}Telefono`,
    `personalReference${suffix}Phone`,
  ]);
  const direct = {
    nombre: cleanText(deepText(value, nameKeys)),
    telefono: normalizePhone(deepText(value, phoneKeys)),
  };

  if (direct.nombre || direct.telefono) {
    return direct;
  }

  const arrays = isRecord(value) ? collectReferenceArrays(value) : [];

  for (const array of arrays) {
    const record = array[index - 1];

    if (!record) {
      continue;
    }

    const parsed = getReferenceFromObject(record);

    if (parsed.nombre || parsed.telefono) {
      return parsed;
    }
  }

  return {
    nombre: null,
    telefono: null,
  };
}

function normalizeFrequency(value: unknown) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  if (text.includes("CATORCEN") || text.includes("QUINCEN")) {
    return "CATORCENAL" as const;
  }

  if (text.includes("SEMAN")) {
    return "SEMANAL" as const;
  }

  if (text.includes("MENS")) {
    return "MENSUAL" as const;
  }

  return null;
}

function parseCreditoFromValue(
  value: unknown,
  imei: string
): FinserpayCreditoImei | null {
  const creditoAutorizado = deepNumber(value, [
    "creditoAutorizado",
    "valorCredito",
    "valor_credito",
    "montoCredito",
    "monto_credito",
    "montoTotal",
    "monto_total",
    "capital",
    "principal",
    "loanAmount",
    "loan_amount",
    "creditAmount",
    "credit_amount",
    "amountFinanced",
    "amount_financed",
    "valorFinanciado",
    "valor_financiado",
  ]);

  if (creditoAutorizado === null || creditoAutorizado <= 0) {
    return null;
  }

  const documento = normalizeDocument(
    deepText(value, [
      "cedula",
      "documento",
      "documentoCliente",
      "document_number",
      "documentNumber",
      "identificacion",
      "identification",
      "identificationNumber",
    ])
  );
  const telefonoCliente = normalizePhone(
    deepText(value, [
      "whatsapp",
      "celular",
      "telefono",
      "telefonoCliente",
      "phone",
      "phoneNumber",
      "phone_number",
      "mobile",
      "mobileNumber",
      "mobile_number",
    ])
  );

  return {
    imei,
    financiera: "FINSERPAY",
    clienteNombre: getClientName(value),
    documento,
    correoElectronico: normalizeEmail(
      deepText(value, [
        "correo",
        "correoElectronico",
        "email",
        "emailAddress",
        "mail",
        "e_mail",
      ])
    ),
    telefonoCliente:
      telefonoCliente && telefonoCliente !== documento ? telefonoCliente : null,
    direccionCliente: cleanText(
      deepText(value, [
        "direccion",
        "direccionCliente",
        "address",
        "addressLine",
        "addressLine1",
        "residenceAddress",
        "residence_address",
        "domicilio",
      ])
    ),
    referenciaFamiliar1: getReference(value, 1),
    referenciaFamiliar2: getReference(value, 2),
    creditoAutorizado,
    valorCuota: deepNumber(value, [
      "valorCuota",
      "valor_cuota",
      "cuota",
      "valorPago",
      "valor_pago",
      "installmentAmount",
      "installment_amount",
      "paymentAmount",
      "payment_amount",
      "monthlyPayment",
      "monthly_payment",
    ]),
    numeroCuotas: deepNumber(value, [
      "plazo",
      "numeroCuotas",
      "numero_cuotas",
      "nCuotas",
      "n_cuotas",
      "cuotas",
      "installments",
      "term",
      "months",
      "meses",
    ]),
    frecuenciaCuota: normalizeFrequency(
      deepText(value, [
        "frecuencia",
        "frecuenciaCuota",
        "frecuencia_cuota",
        "periodicidad",
        "periodicity",
      ])
    ),
    moneda:
      cleanText(deepText(value, ["moneda", "currency", "currencyCode"])) ||
      "COP",
    origen: "finserpay-imei",
  };
}

function valueContainsImei(value: unknown, imei: string) {
  const explicitImei = normalizeImei(
    deepText(value, [
      "imei",
      "serialImei",
      "serial_imei",
      "imeiEquipo",
      "imei_equipo",
      "deviceImei",
      "device_imei",
      "serial",
    ])
  );

  if (explicitImei) {
    return explicitImei === imei;
  }

  return JSON.stringify(value).replace(/\D/g, "").includes(imei);
}

function candidateScore(credito: FinserpayCreditoImei) {
  return [
    credito.clienteNombre,
    credito.documento,
    credito.correoElectronico,
    credito.telefonoCliente,
    credito.direccionCliente,
    credito.referenciaFamiliar1.nombre,
    credito.referenciaFamiliar1.telefono,
    credito.referenciaFamiliar2.nombre,
    credito.referenciaFamiliar2.telefono,
    credito.valorCuota,
    credito.numeroCuotas,
    credito.frecuenciaCuota,
  ].filter(Boolean).length;
}

export async function obtenerCreditoFinserpayPorImei(imeiValue: unknown) {
  const imei = normalizeImei(imeiValue);

  if (imei.length !== 15) {
    throw new FinserpayConsultaLookupError("El IMEI debe tener 15 digitos.");
  }

  const config = getConfig();
  const url = buildLookupUrl(config.urlTemplate, imei);
  const payload = await requestFinserpay(url, config.token);
  const records = collectRecords(payload);
  const sources = [
    ...(isRecord(payload) ? [payload] : []),
    ...records.filter((record) => valueContainsImei(record, imei)),
  ];
  const candidates = (sources.length > 0 ? sources : records)
    .map((source) => parseCreditoFromValue(source, imei))
    .filter((credito): credito is FinserpayCreditoImei => Boolean(credito))
    .sort((a, b) => candidateScore(b) - candidateScore(a));

  return candidates[0] || null;
}
