const DEFAULT_EQUALITY_BASE_URL = "https://hbm-api.solucionfaas.com";
const DEFAULT_EQUALITY_PATH = "/v1/hbm";
const DEFAULT_EQUALITY_VARIANT = "A";
const FALLBACK_EQUALITY_TOKEN =
  "GUrlajXkLIIIzWGUGrN+/NnyGWrPYAf69nW1QeUWCUmsOk95LyQrkgQCLnvMbMfqLQjdxyJiRxEoBRP61cKQ+VH3tNSY+F/XoJWEg1dR37MyJlGR9G8pMaDtVNUFSHJcjjZU+Li1GXoSJJsBEAvxCkCs8D3EEJoDVeGAuY46r9k=";
const DEFAULT_LOCK_TITLE = "Telefono bloqueado";
const DEFAULT_LOCK_CONTENT = "Equipo bloqueado por falta de pago.";
const DEFAULT_RELEASE_REASON = "End of contract";
const DEFAULT_DEVICE_TYPE = "smartphone";
const DEFAULT_ID_TYPE = "imei";
const DEFAULT_SERVICE_NAME = "deviceFinancing";
const DEFAULT_PAYMENT_METHOD = "postpaid";

type EqualityEnvelope = {
  service?: {
    code?: string;
    variant?: string;
  };
  statusCode?: number | string | null;
  dataResponse?: unknown;
  [key: string]: unknown;
};

export type EqualityValidationVerdict =
  | "deliverable"
  | "blocked"
  | "review"
  | "not_found"
  | "error";

export type EqualityValidationSummary = {
  verdict: EqualityValidationVerdict;
  label: string;
  detail: string;
  tone: "emerald" | "red" | "amber" | "slate";
  canDeliver: boolean | null;
};

export type EqualityQuerySnapshot = {
  deviceUid: string;
  serviceCode: string;
  variant: string;
  statusCode: number | null;
  resultCode: string | null;
  resultMessage: string | null;
  statuses: string[];
  identifiers: string[];
  locked: boolean;
  validation: EqualityValidationSummary;
  raw: EqualityEnvelope;
};

export type EqualityServiceResult = {
  serviceCode: string;
  variant: string;
  statusCode: number | null;
  resultCode: string | null;
  resultMessage: string | null;
  ok: boolean;
  raw: EqualityEnvelope;
};

export type EqualityActionResult = {
  action: "enroll" | "lock" | "unlock" | "release";
  deviceUid: string;
  ok: boolean;
  message: string;
  steps: EqualityServiceResult[];
  result: EqualityQuerySnapshot | null;
};

function getTokenCandidate() {
  return [
    process.env.EQUALITY_HBM_TOKEN,
    process.env.EQUALITY_ZERO_TOUCH_TOKEN,
    process.env.HBM_EQUALITY_TOKEN,
    process.env.ZERO_TOUCH_TOKEN,
    FALLBACK_EQUALITY_TOKEN,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
}

function getConfiguredToken() {
  const token = getTokenCandidate();

  if (!token) {
    throw new Error("EQUALITY_HBM_TOKEN no esta configurado");
  }

  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function getConfiguredVariant() {
  return (
    String(
      process.env.EQUALITY_HBM_VARIANT ||
        process.env.EQUALITY_ZERO_TOUCH_VARIANT ||
        DEFAULT_EQUALITY_VARIANT
    ).trim() || DEFAULT_EQUALITY_VARIANT
  );
}

function getEndpointUrl() {
  const baseUrl = String(
    process.env.EQUALITY_HBM_BASE_URL ||
      process.env.EQUALITY_ZERO_TOUCH_BASE_URL ||
      process.env.HBM_EQUALITY_BASE_URL ||
      DEFAULT_EQUALITY_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");

  if (baseUrl.toLowerCase().endsWith("/v1/hbm")) {
    return baseUrl;
  }

  return `${baseUrl}${DEFAULT_EQUALITY_PATH}`;
}

export function isEqualityConfigured() {
  return Boolean(getTokenCandidate());
}

function normalizeSpace(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeMarker(value: string | null | undefined) {
  return normalizeSpace(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeDeviceUid(deviceUid: string) {
  return normalizeSpace(deviceUid).replace(/\s+/g, "");
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkUnknown(
  value: unknown,
  visitor: (key: string, rawValue: unknown) => void,
  parentKey = ""
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkUnknown(item, visitor, parentKey);
    }
    return;
  }

  if (!isRecord(value)) {
    if (parentKey) {
      visitor(parentKey, value);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    visitor(key, child);
    walkUnknown(child, visitor, key);
  }
}

function getResultCode(payload: EqualityEnvelope) {
  const dataResponse = isRecord(payload.dataResponse) ? payload.dataResponse : {};
  return normalizeSpace(String(dataResponse.resultCode || "")) || null;
}

function getResultMessage(payload: EqualityEnvelope) {
  const dataResponse = isRecord(payload.dataResponse) ? payload.dataResponse : {};
  return normalizeSpace(String(dataResponse.resultMessage || "")) || null;
}

function buildServiceResult(
  payload: EqualityEnvelope,
  serviceCode: string
): EqualityServiceResult {
  const statusCode = toNumber(payload.statusCode);
  const resultCode = getResultCode(payload);
  const resultMessage = getResultMessage(payload);
  const resultCodeMarker = normalizeMarker(resultCode);

  return {
    serviceCode,
    variant: normalizeSpace(payload.service?.variant) || getConfiguredVariant(),
    statusCode,
    resultCode,
    resultMessage,
    ok:
      (statusCode === null || statusCode < 400) &&
      resultCodeMarker !== "error" &&
      resultCodeMarker !== "failed",
    raw: payload,
  };
}

function collectEqualitySignals(payload: EqualityEnvelope) {
  const statuses = new Set<string>();
  const identifiers = new Set<string>();
  let locked = false;

  const statusKeyPattern = /(status|state|eventtype|locktype|lockstatus)/i;
  const identifierKeyPattern = /(deviceuid|imei|serial)/i;
  const lockedMarkers = ["locked", "blocked", "device_lock"];
  const positiveMarkers = [
    "readyforuse",
    "idle",
    "enrolled",
    "active",
    "unlock",
    "unlocked",
  ];

  walkUnknown(payload, (key, rawValue) => {
    if (typeof rawValue === "boolean" && /locked/i.test(key)) {
      locked = locked || rawValue;
      return;
    }

    if (typeof rawValue !== "string") {
      return;
    }

    const value = normalizeSpace(rawValue);
    const marker = normalizeMarker(value);

    if (!value) {
      return;
    }

    if (identifierKeyPattern.test(key)) {
      identifiers.add(value);
    }

    if (
      statusKeyPattern.test(key) ||
      lockedMarkers.some((candidate) => marker.includes(candidate)) ||
      positiveMarkers.some((candidate) => marker.includes(candidate)) ||
      marker.includes("released")
    ) {
      statuses.add(value);
    }

    if (lockedMarkers.some((candidate) => marker.includes(candidate))) {
      locked = true;
    }
  });

  return {
    statuses: Array.from(statuses),
    identifiers: Array.from(identifiers),
    locked,
  };
}

function buildValidationSummary(input: {
  statusCode: number | null;
  resultCode: string | null;
  resultMessage: string | null;
  statuses: string[];
  locked: boolean;
}): EqualityValidationSummary {
  const resultCodeMarker = normalizeMarker(input.resultCode);
  const messageMarker = normalizeMarker(input.resultMessage);
  const statusMarkers = input.statuses.map((status) => normalizeMarker(status));

  const hasDeliverableStatus = statusMarkers.some((marker) =>
    ["readyforuse", "configured", "provisioned", "applied"].some(
      (candidate) => marker.includes(candidate)
    )
  );

  const hasPendingSetupStatus = statusMarkers.some((marker) =>
    ["idle", "enrolled", "active", "unlock", "unlocked"].some((candidate) =>
      marker.includes(candidate)
    )
  );

  const hasReleasedStatus = statusMarkers.some((marker) =>
    marker.includes("released")
  );

  if (
    messageMarker.includes("notavailableforthiscustomer") ||
    messageMarker.includes("notfound") ||
    messageMarker.includes("notavailable")
  ) {
    return {
      verdict: "not_found",
      label: "No encontrado",
      detail:
        "Equality no reconoce ese deviceUid para este cliente. No se debe entregar sin revisar.",
      tone: "red",
      canDeliver: false,
    };
  }

  if (input.locked) {
    return {
      verdict: "blocked",
      label: "Bloqueado",
      detail:
        "El equipo aparece bloqueado en Equality. No se recomienda entregar hasta desbloquearlo.",
      tone: "red",
      canDeliver: false,
    };
  }

  if (hasDeliverableStatus) {
    return {
      verdict: "deliverable",
      label: "Apto para entrega",
      detail:
        "Equality reporta una senal concluyente de configuracion y el equipo parece listo para entrega.",
      tone: "emerald",
      canDeliver: true,
    };
  }

  if (hasPendingSetupStatus) {
    return {
      verdict: "review",
      label: "Pendiente de configurar",
      detail:
        "El equipo aparece inscrito o activo en Equality, pero aun no hay una senal concluyente de configuracion final para entregarlo.",
      tone: "amber",
      canDeliver: false,
    };
  }

  if (hasReleasedStatus) {
    return {
      verdict: "review",
      label: "Revisar",
      detail:
        "El equipo aparece como liberado. Conviene confirmar la politica comercial antes de entregarlo.",
      tone: "amber",
      canDeliver: null,
    };
  }

  if (
    (input.statusCode !== null && input.statusCode >= 400) ||
    resultCodeMarker === "error"
  ) {
    return {
      verdict: "error",
      label: "Revisar",
      detail:
        input.resultMessage ||
        "Equality devolvio un error y no se puede validar la entrega con esta consulta.",
      tone: "red",
      canDeliver: false,
    };
  }

  return {
    verdict: "review",
    label: "Revisar",
    detail:
      "La consulta respondio, pero el estado no es concluyente. Conviene revisar el detalle antes de entregar.",
    tone: "amber",
    canDeliver: null,
  };
}

async function equalityRequest<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(getEndpointUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: getConfiguredToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (isRecord(data) &&
        typeof data.message === "string" &&
        normalizeSpace(data.message)) ||
      (isRecord(data) &&
        typeof data.error === "string" &&
        normalizeSpace(data.error)) ||
      `Equality respondio con estado HTTP ${response.status}`;

    throw new Error(message);
  }

  return (isRecord(data) ? data : {}) as T;
}

async function executeEqualityService(
  serviceCode: string,
  data: Record<string, unknown>
) {
  const variant = getConfiguredVariant();
  const payload = await equalityRequest<EqualityEnvelope>({
    service: {
      code: serviceCode,
      variant,
    },
    data,
  });

  return buildServiceResult(payload, serviceCode);
}

export async function queryEqualityDevice(
  deviceUid: string
): Promise<EqualityQuerySnapshot> {
  const normalizedDeviceUid = normalizeDeviceUid(deviceUid);

  if (!normalizedDeviceUid) {
    throw new Error("El deviceUid o IMEI es obligatorio");
  }

  const serviceResult = await executeEqualityService("QUERY_DEVICES", {
    deviceList: [
      {
        deviceUid: normalizedDeviceUid,
      },
    ],
  });

  const signals = collectEqualitySignals(serviceResult.raw);

  return {
    deviceUid: normalizedDeviceUid,
    serviceCode: serviceResult.serviceCode,
    variant: serviceResult.variant,
    statusCode: serviceResult.statusCode,
    resultCode: serviceResult.resultCode,
    resultMessage: serviceResult.resultMessage,
    statuses: signals.statuses,
    identifiers: signals.identifiers,
    locked: signals.locked,
    validation: buildValidationSummary({
      statusCode: serviceResult.statusCode,
      resultCode: serviceResult.resultCode,
      resultMessage: serviceResult.resultMessage,
      statuses: signals.statuses,
      locked: signals.locked,
    }),
    raw: serviceResult.raw,
  };
}

async function queryAfterAction(deviceUid: string) {
  try {
    return await queryEqualityDevice(deviceUid);
  } catch {
    return null;
  }
}

export async function enrollEqualityDevice(deviceUid: string) {
  const normalizedDeviceUid = normalizeDeviceUid(deviceUid);

  if (!normalizedDeviceUid) {
    throw new Error("El deviceUid o IMEI es obligatorio");
  }

  const upload = await executeEqualityService("INVENTORY_UPLOAD", {
    deviceList: [
      {
        deviceType: DEFAULT_DEVICE_TYPE,
        idType: DEFAULT_ID_TYPE,
        deviceUid: normalizedDeviceUid,
      },
    ],
  });

  const activate = await executeEqualityService("SERVICE_ACTIVATE", {
    deviceList: [
      {
        deviceUid: normalizedDeviceUid,
        serviceList: [
          {
            serviceName: DEFAULT_SERVICE_NAME,
            paymentMethod: DEFAULT_PAYMENT_METHOD,
          },
        ],
      },
    ],
  });

  const result = await queryAfterAction(normalizedDeviceUid);
  const ok = upload.ok && activate.ok;
  const message =
    activate.resultMessage ||
    upload.resultMessage ||
    (ok
      ? "Equipo inscrito correctamente en Equality."
      : "Equality devolvio una respuesta para revisar durante la inscripcion.");

  return {
    action: "enroll",
    deviceUid: normalizedDeviceUid,
    ok,
    message,
    steps: [upload, activate],
    result,
  } satisfies EqualityActionResult;
}

export async function lockEqualityDevice(
  deviceUid: string,
  options?: {
    title?: string;
    content?: string;
  }
) {
  const normalizedDeviceUid = normalizeDeviceUid(deviceUid);

  if (!normalizedDeviceUid) {
    throw new Error("El deviceUid o IMEI es obligatorio");
  }

  const step = await executeEqualityService("DEVICE_LOCK", {
    lockList: [
      {
        lockMsgTitle: normalizeSpace(options?.title) || DEFAULT_LOCK_TITLE,
        deviceUid: normalizedDeviceUid,
        lockType: "lock",
        lockMsgContent:
          normalizeSpace(options?.content) || DEFAULT_LOCK_CONTENT,
      },
    ],
  });

  const result = await queryAfterAction(normalizedDeviceUid);

  return {
    action: "lock",
    deviceUid: normalizedDeviceUid,
    ok: step.ok,
    message:
      step.resultMessage || "Solicitud de bloqueo enviada correctamente.",
    steps: [step],
    result,
  } satisfies EqualityActionResult;
}

export async function unlockEqualityDevice(deviceUid: string) {
  const normalizedDeviceUid = normalizeDeviceUid(deviceUid);

  if (!normalizedDeviceUid) {
    throw new Error("El deviceUid o IMEI es obligatorio");
  }

  const step = await executeEqualityService("DEVICE_UNLOCK", {
    unLockList: [
      {
        deviceUid: normalizedDeviceUid,
      },
    ],
  });

  const result = await queryAfterAction(normalizedDeviceUid);

  return {
    action: "unlock",
    deviceUid: normalizedDeviceUid,
    ok: step.ok,
    message:
      step.resultMessage || "Solicitud de desbloqueo enviada correctamente.",
    steps: [step],
    result,
  } satisfies EqualityActionResult;
}

export async function releaseEqualityDevice(
  deviceUid: string,
  options?: {
    reason?: string;
  }
) {
  const normalizedDeviceUid = normalizeDeviceUid(deviceUid);

  if (!normalizedDeviceUid) {
    throw new Error("El deviceUid o IMEI es obligatorio");
  }

  const step = await executeEqualityService("DEVICE_RELEASE", {
    deviceReleaseList: [
      {
        reason: normalizeSpace(options?.reason) || DEFAULT_RELEASE_REASON,
        deviceUid: normalizedDeviceUid,
      },
    ],
  });

  const result = await queryAfterAction(normalizedDeviceUid);

  return {
    action: "release",
    deviceUid: normalizedDeviceUid,
    ok: step.ok,
    message: step.resultMessage || "Solicitud de liberacion enviada correctamente.",
    steps: [step],
    result,
  } satisfies EqualityActionResult;
}
