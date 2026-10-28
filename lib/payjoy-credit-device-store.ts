import "server-only";
import prisma from "@/lib/prisma";
import { findStoredPayJoyExtensionDevice, PayJoyDeviceAssociationConflictError } from "@/lib/payjoy-extensions-device-store";

const IMEI = /^\d{15,16}$/;
const TAG = /^D[A-Z\d]{5,31}$/;
type CreditDeviceIdentity = { imei: string; deviceTag: string };

/** Exact identity lookup only. No customer/document is returned to the credit sheet. */
export async function findStoredPayJoyCreditDevice(identifier: string): Promise<CreditDeviceIdentity | null> {
  const value = typeof identifier === "string" ? identifier.trim().toUpperCase() : "";
  if (TAG.test(value)) {
    const result = await findStoredPayJoyExtensionDevice({ deviceTag: value });
    return result ? { imei: result.imei, deviceTag: result.deviceTag } : null;
  }
  if (!IMEI.test(value)) return null;
  let rows: Array<{ imei: string; documentoNumero: string; deviceTag: string }>;
  try {
    rows = await prisma.$queryRawUnsafe(`
      WITH latest_cuts AS (
        SELECT rows_json FROM payjoy_cortes_guardados ORDER BY updated_at DESC, id DESC LIMIT 120
      )
      SELECT DISTINCT btrim(item.value->>'imei') AS "imei",
        btrim(item.value->>'nationalId') AS "documentoNumero",
        upper(btrim(item.value->>'device')) AS "deviceTag"
      FROM latest_cuts CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(rows_json) = 'array' THEN rows_json ELSE '[]'::jsonb END
      ) AS item(value)
      WHERE btrim(item.value->>'imei') = $1 LIMIT 3
    `, value);
  } catch (error) {
    const problem = error as { code?: unknown; meta?: { code?: unknown; originalCode?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } } };
    if (problem.code === "P2021" || [problem.code, problem.meta?.code, problem.meta?.originalCode, problem.meta?.driverAdapterError?.cause?.originalCode].includes("42P01")) return null;
    throw error;
  }
  if (!Array.isArray(rows) || rows.length > 1) throw new PayJoyDeviceAssociationConflictError();
  if (!rows.length) return null;
  const row = rows[0];
  if (row.imei !== value || !TAG.test(row.deviceTag || "") || !/^\d{5,15}$/.test(row.documentoNumero || "")) throw new PayJoyDeviceAssociationConflictError();
  const verified = await findStoredPayJoyExtensionDevice({ deviceTag: row.deviceTag });
  if (!verified || verified.imei !== value || verified.documentoNumero !== row.documentoNumero) throw new PayJoyDeviceAssociationConflictError();
  return { imei: verified.imei, deviceTag: verified.deviceTag };
}
