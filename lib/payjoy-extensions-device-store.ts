import "server-only";
import prisma from "@/lib/prisma";

export type StoredPayJoyExtensionDevice = {
  imei: string;
  documentoNumero: string;
  deviceTag: string;
};
type DeviceInput = { imei: string; documentoNumero: string } | { deviceTag: string };
const IMEI = /^\d{15,16}$/;
const DOCUMENT = /^\d{5,15}$/;
const TAG = /^D[A-Z\d]{5,31}$/;

export class PayJoyDeviceAssociationConflictError extends Error {
  readonly code = "DEVICE_ASSOCIATION_CONFLICT";
  constructor() {
    super("La asociación guardada del dispositivo no se pudo verificar. Requiere revisión del administrador.");
    this.name = "PayJoyDeviceAssociationConflictError";
  }
}

// Same 120-cut window as getLatestNationalIdsByDeviceTags. This reader performs
// no schema initialization and retrieves only an exact match, never a portfolio.
const SELECT_ASSOCIATION = `
  WITH latest_cuts AS (
    SELECT rows_json FROM payjoy_cortes_guardados
    ORDER BY updated_at DESC, id DESC
    LIMIT 120
  )
  SELECT DISTINCT
    btrim(item.value->>'imei') AS "imei",
    btrim(item.value->>'nationalId') AS "documentoNumero",
    upper(btrim(item.value->>'device')) AS "deviceTag"
  FROM latest_cuts
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(rows_json) = 'array' THEN rows_json ELSE '[]'::jsonb END
  ) AS item(value)
`;
const SELECT_BY_PAIR = `${SELECT_ASSOCIATION}
  WHERE btrim(item.value->>'imei') = $1 AND btrim(item.value->>'nationalId') = $2
  LIMIT 3
`;
const SELECT_BY_TAG = `${SELECT_ASSOCIATION}
  WHERE upper(btrim(item.value->>'device')) = $1
  LIMIT 3
`;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function missingTable(error: unknown): boolean {
  const value = record(error);
  const meta = record(value?.meta);
  const driver = record(meta?.driverAdapterError);
  return value?.code === "P2021" || [value, meta, record(value?.cause), record(driver?.cause)]
    .some((part) => part?.code === "42P01" || part?.originalCode === "42P01");
}
function uniqueAssociation(rows: unknown, matches: (row: StoredPayJoyExtensionDevice) => boolean): StoredPayJoyExtensionDevice | null {
  if (!Array.isArray(rows)) throw new PayJoyDeviceAssociationConflictError();
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new PayJoyDeviceAssociationConflictError();
  const row = record(rows[0]);
  if (typeof row?.imei !== "string" || !IMEI.test(row.imei)
      || typeof row.documentoNumero !== "string" || !DOCUMENT.test(row.documentoNumero)
      || typeof row.deviceTag !== "string" || !TAG.test(row.deviceTag)) {
    throw new PayJoyDeviceAssociationConflictError();
  }
  const association = { imei: row.imei, documentoNumero: row.documentoNumero, deviceTag: row.deviceTag };
  if (!matches(association)) throw new PayJoyDeviceAssociationConflictError();
  return association;
}

/** Resolves identity only; it does not authorize access to a local sale/customer. */
export async function findStoredPayJoyExtensionDevice(input: DeviceInput): Promise<StoredPayJoyExtensionDevice | null> {
  const value = record(input);
  if (!value) return null;
  const hasTag = Object.hasOwn(value, "deviceTag");
  const hasPair = Object.hasOwn(value, "imei") || Object.hasOwn(value, "documentoNumero");
  if (hasTag && hasPair) return null;
  const tag = typeof value.deviceTag === "string" ? value.deviceTag.trim().toUpperCase() : "";
  const imei = typeof value.imei === "string" ? value.imei.trim() : "";
  const documentoNumero = typeof value.documentoNumero === "string" ? value.documentoNumero.trim() : "";
  if (hasTag ? !TAG.test(tag) : !IMEI.test(imei) || !DOCUMENT.test(documentoNumero)) return null;

  try {
    if (hasTag) {
      const rows = await prisma.$queryRawUnsafe<unknown[]>(SELECT_BY_TAG, tag);
      const association = uniqueAssociation(rows, (row) => row.deviceTag === tag);
      if (!association) return null;
      // Multiple historical tags for one pair cannot create independent locks
      // for the same device through different manually supplied aliases.
      const pairRows = await prisma.$queryRawUnsafe<unknown[]>(SELECT_BY_PAIR, association.imei, association.documentoNumero);
      const verified = uniqueAssociation(pairRows, (row) => row.deviceTag === tag
        && row.imei === association.imei && row.documentoNumero === association.documentoNumero);
      if (!verified) throw new PayJoyDeviceAssociationConflictError();
      return verified;
    }
    const rows = await prisma.$queryRawUnsafe<unknown[]>(SELECT_BY_PAIR, imei, documentoNumero);
    const association = uniqueAssociation(rows, (row) => row.imei === imei && row.documentoNumero === documentoNumero);
    if (!association) return null;
    // A tag must also resolve to this exact pair across all cuts in the window.
    const tagRows = await prisma.$queryRawUnsafe<unknown[]>(SELECT_BY_TAG, association.deviceTag);
    const verified = uniqueAssociation(tagRows, (row) => row.deviceTag === association.deviceTag
      && row.imei === imei && row.documentoNumero === documentoNumero);
    if (!verified) throw new PayJoyDeviceAssociationConflictError();
    return verified;
  } catch (error) {
    if (missingTable(error)) return null;
    throw error;
  }
}
