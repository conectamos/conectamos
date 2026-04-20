const NUOVOPAY_BASE_URL = "https://api.nuovopay.com";

type RawNuovoPayDevice = {
  id?: number | string;
  imei_no?: string | null;
  imei_no2?: string | null;
  serial_no?: string | null;
  phone_no?: string | null;
  name?: string | null;
  model?: string | null;
  make?: string | null;
  status?: string | null;
  locked?: boolean | number | string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  enrolled_on?: string | null;
};

export type NuovoPayEnrollment = {
  approved: boolean;
  label: string;
  detail: string;
  tone: string;
};

export type NuovoPayDeviceRecord = {
  deviceId: number;
  imei: string | null;
  imei2: string | null;
  serial: string | null;
  phone: string | null;
  name: string | null;
  model: string | null;
  make: string | null;
  status: string | null;
  locked: boolean;
  customerName: string | null;
  customerEmail: string | null;
  enrolledOn: string | null;
  enrollment: NuovoPayEnrollment;
};

function getConfiguredToken() {
  const token = String(process.env.NUOVOPAY_API_TOKEN || "").trim();

  if (!token) {
    throw new Error("NUOVOPAY_API_TOKEN no esta configurado");
  }

  if (
    token.startsWith("Token ") ||
    token.startsWith("Bearer ") ||
    token.startsWith("Basic ")
  ) {
    return token;
  }

  return `Token ${token}`;
}

export function isNuovoPayConfigured() {
  return Boolean(String(process.env.NUOVOPAY_API_TOKEN || "").trim());
}

async function nuovoPayRequest<T>(
  path: string,
  init?: {
    method?: string;
    body?: BodyInit;
    contentType?: string;
  }
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: getConfiguredToken(),
  });

  if (init?.contentType) {
    headers.set("Content-Type", init.contentType);
  }

  const response = await fetch(`${NUOVOPAY_BASE_URL}${path}`, {
    method: init?.method || "GET",
    headers,
    body: init?.body,
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
      (typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string" &&
        data.error) ||
      (typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof data.message === "string" &&
        data.message) ||
      `NuovoPay respondio con estado ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

function asDeviceArray(payload: unknown): RawNuovoPayDevice[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is RawNuovoPayDevice =>
        typeof item === "object" && item !== null
    );
  }

  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const record = payload as Record<string, unknown>;

  for (const key of ["devices", "items", "data", "records", "results"]) {
    if (Array.isArray(record[key])) {
      return record[key].filter(
        (item): item is RawNuovoPayDevice =>
          typeof item === "object" && item !== null
      );
    }
  }

  if (
    "id" in record ||
    "imei_no" in record ||
    "serial_no" in record ||
    "status" in record
  ) {
    return [record as RawNuovoPayDevice];
  }

  return [];
}

function normalizeImei(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizeBoolean(value: boolean | number | string | null | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return ["1", "true", "yes", "y", "si", "on", "locked"].includes(normalized);
}

export function getEnrollmentSummary(status: string | null | undefined) {
  const normalized = normalizeStatus(status);

  if (normalized === "enrolled") {
    return {
      approved: true,
      label: "Aprobada",
      detail: "El dispositivo ya quedo inscrito en Nuovo Pay.",
      tone: "emerald",
    };
  }

  if (normalized === "waiting_for_activation") {
    return {
      approved: false,
      label: "Pendiente de activacion",
      detail: "La inscripcion existe, pero aun no termina la activacion.",
      tone: "amber",
    };
  }

  if (normalized === "registered" || normalized === "checkin") {
    return {
      approved: false,
      label: "Pendiente de inscripcion",
      detail: "El equipo fue registrado, pero todavia no aparece como inscrito.",
      tone: "amber",
    };
  }

  if (normalized === "enrollment_failed") {
    return {
      approved: false,
      label: "Fallida",
      detail: "Nuovo Pay reporta que la inscripcion fallo.",
      tone: "red",
    };
  }

  if (normalized === "un_registered") {
    return {
      approved: false,
      label: "No registrado",
      detail: "El equipo no esta registrado actualmente en Nuovo Pay.",
      tone: "slate",
    };
  }

  if (normalized === "reconciled") {
    return {
      approved: true,
      label: "Reconciliado",
      detail: "El equipo fue conciliado dentro de Nuovo Pay.",
      tone: "indigo",
    };
  }

  return {
    approved: false,
    label: status ? String(status) : "Sin informacion",
    detail: "No fue posible clasificar el estado recibido por Nuovo Pay.",
    tone: "slate",
  };
}

function mapNuovoPayDevice(
  payload: RawNuovoPayDevice
): NuovoPayDeviceRecord | null {
  const deviceId = Number(payload.id || 0);

  if (!deviceId) {
    return null;
  }

  return {
    deviceId,
    imei: payload.imei_no || null,
    imei2: payload.imei_no2 || null,
    serial: payload.serial_no || null,
    phone: payload.phone_no || null,
    name: payload.name || null,
    model: payload.model || null,
    make: payload.make || null,
    status: payload.status || null,
    locked: normalizeBoolean(payload.locked),
    customerName: payload.customer_name || null,
    customerEmail: payload.customer_email || null,
    enrolledOn: payload.enrolled_on || null,
    enrollment: getEnrollmentSummary(payload.status),
  };
}

export async function searchNuovoPayDevices(search?: string) {
  const searchValue = String(search || "").trim();
  const query = searchValue
    ? `?search_string=${encodeURIComponent(searchValue)}`
    : "";

  const payload = await nuovoPayRequest<unknown>(
    `/dm/api/v1/devices.json${query}`
  );

  const devices = asDeviceArray(payload);
  const uniqueDevices = new Map<number, NuovoPayDeviceRecord>();

  for (const device of devices) {
    const mapped = mapNuovoPayDevice(device);

    if (!mapped) {
      continue;
    }

    if (!uniqueDevices.has(mapped.deviceId)) {
      uniqueDevices.set(mapped.deviceId, mapped);
    }
  }

  return Array.from(uniqueDevices.values());
}

export async function searchNuovoPayDeviceByImei(imei: string) {
  const normalizedImei = normalizeImei(imei);

  if (!normalizedImei) {
    throw new Error("El IMEI es obligatorio");
  }

  const devices = await searchNuovoPayDevices(normalizedImei);
  const exact =
    devices.find(
      (device) =>
        normalizeImei(device.imei) === normalizedImei ||
        normalizeImei(device.imei2) === normalizedImei
    ) || devices[0];

  if (!exact?.deviceId) {
    return null;
  }

  return getNuovoPayDeviceById(exact.deviceId);
}

export async function getNuovoPayDeviceById(deviceId: number | string) {
  const normalizedDeviceId = Number(deviceId || 0);

  if (!normalizedDeviceId) {
    throw new Error("El deviceId es obligatorio");
  }

  const payload = await nuovoPayRequest<RawNuovoPayDevice>(
    `/dm/api/v1/devices/${normalizedDeviceId}.json?device_id=${normalizedDeviceId}`
  );

  const mapped = mapNuovoPayDevice({
    ...payload,
    id: payload.id || normalizedDeviceId,
  });

  if (!mapped) {
    throw new Error("Nuovo Pay no devolvio informacion del dispositivo");
  }

  return mapped;
}

function buildDeviceIdsForm(deviceIds: number[]) {
  const form = new URLSearchParams();

  for (const deviceId of deviceIds) {
    form.append("device_ids[]", String(deviceId));
  }

  return form.toString();
}

export async function lockNuovoPayDevices(deviceIds: number[]) {
  if (!deviceIds.length) {
    throw new Error("No hay dispositivos para bloquear");
  }

  await nuovoPayRequest<unknown>("/dm/api/v1/devices/lock.json", {
    method: "PATCH",
    body: buildDeviceIdsForm(deviceIds),
    contentType: "application/x-www-form-urlencoded",
  });
}

export async function unlockNuovoPayDevices(deviceIds: number[]) {
  if (!deviceIds.length) {
    throw new Error("No hay dispositivos para desbloquear");
  }

  await nuovoPayRequest<unknown>("/dm/api/v1/devices/unlock.json", {
    method: "PATCH",
    body: buildDeviceIdsForm(deviceIds),
    contentType: "application/x-www-form-urlencoded",
  });
}
