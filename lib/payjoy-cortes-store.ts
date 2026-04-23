import prisma from "@/lib/prisma";

export type PayJoyStoredRowStatus = "MORA" | "PAGO" | "PAGO X";

export type PayJoyStoredRow = {
  corteName: string;
  transactionTime: string | null;
  merchantName: string;
  device: string;
  deviceFamily: string;
  imei: string;
  nationalId: string;
  installmentAmount: number | null;
  paymentDueDate: string | null;
  devicePaymentDate: string | null;
  paidInFull: boolean;
  status: PayJoyStoredRowStatus;
  maximumPaymentDate: string | null;
  currency: string | null;
  lookupMessage: string | null;
  manualStatus: PayJoyStoredRowStatus | null;
};

export type PayJoyStoredSummary = {
  mora: number;
  pago: number;
  pagoX: number;
};

export type PayJoyStoredCutListItem = {
  id: number;
  recordName: string;
  totalSources: number;
  sourceNames: string[];
  rawRows: number;
  uniqueRows: number;
  duplicatesRemoved: number;
  summary: PayJoyStoredSummary;
  savedById: number | null;
  savedByName: string;
  savedByUser: string;
  savedAt: string;
  updatedAt: string;
};

export type PayJoyStoredCutDetail = PayJoyStoredCutListItem & {
  rows: PayJoyStoredRow[];
};

type SavePayJoyCutInput = {
  recordName: string;
  totalSources: number;
  sourceNames: string[];
  rawRows: number;
  uniqueRows: number;
  duplicatesRemoved: number;
  summary: PayJoyStoredSummary;
  rows: PayJoyStoredRow[];
  savedBy: {
    id: number | null;
    nombre: string;
    usuario: string;
  };
};

type UpdatePayJoyCutInput = SavePayJoyCutInput & {
  id: number;
};

type StoredCutRowRecord = {
  id: number;
  recordName: string;
  totalSources: number;
  sourceNames: unknown;
  rawRows: number;
  uniqueRows: number;
  duplicatesRemoved: number;
  summaryMora: number;
  summaryPago: number;
  summaryPagoX: number;
  rows?: unknown;
  savedById: number | null;
  savedByName: string;
  savedByUser: string;
  savedAt: Date | string;
  updatedAt?: Date | string;
};

let ensurePayJoyCutsTablePromise: Promise<void> | null = null;

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStoredRow(row: unknown): PayJoyStoredRow | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const candidate = row as Record<string, unknown>;
  const status = String(candidate.status || "").trim().toUpperCase();
  const manualStatusValue = candidate.manualStatus;
  const manualStatus = manualStatusValue
    ? String(manualStatusValue).trim().toUpperCase()
    : "";

  if (status !== "MORA" && status !== "PAGO" && status !== "PAGO X") {
    return null;
  }

  return {
    corteName: String(candidate.corteName || "").trim(),
    transactionTime: candidate.transactionTime
      ? String(candidate.transactionTime)
      : null,
    merchantName: String(candidate.merchantName || "").trim(),
    device: String(candidate.device || "").trim(),
    deviceFamily: String(candidate.deviceFamily || "").trim(),
    imei: String(candidate.imei || "").trim(),
    nationalId: String(candidate.nationalId || "").trim(),
    installmentAmount:
      candidate.installmentAmount === null ||
      candidate.installmentAmount === undefined ||
      candidate.installmentAmount === ""
        ? null
        : toNumber(candidate.installmentAmount, Number.NaN),
    paymentDueDate: candidate.paymentDueDate
      ? String(candidate.paymentDueDate)
      : null,
    devicePaymentDate: candidate.devicePaymentDate
      ? String(candidate.devicePaymentDate)
      : null,
    paidInFull: Boolean(candidate.paidInFull),
    status,
    maximumPaymentDate: candidate.maximumPaymentDate
      ? String(candidate.maximumPaymentDate)
      : null,
    currency: candidate.currency ? String(candidate.currency) : null,
    lookupMessage: candidate.lookupMessage
      ? String(candidate.lookupMessage)
      : null,
    manualStatus:
      manualStatus === "MORA" ||
      manualStatus === "PAGO" ||
      manualStatus === "PAGO X"
        ? manualStatus
        : null,
  };
}

function mapStoredCutRow(record: StoredCutRowRecord): PayJoyStoredCutListItem {
  const sourceNames = parseJsonColumn<unknown[]>(record.sourceNames, []);
  const savedAtDate =
    record.savedAt instanceof Date
      ? record.savedAt
      : new Date(String(record.savedAt || ""));

  return {
    id: toNumber(record.id),
    recordName: String(record.recordName || "").trim(),
    totalSources: toNumber(record.totalSources),
    sourceNames: Array.isArray(sourceNames)
      ? sourceNames.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    rawRows: toNumber(record.rawRows),
    uniqueRows: toNumber(record.uniqueRows),
    duplicatesRemoved: toNumber(record.duplicatesRemoved),
    summary: {
      mora: toNumber(record.summaryMora),
      pago: toNumber(record.summaryPago),
      pagoX: toNumber(record.summaryPagoX),
    },
    savedById:
      record.savedById === null || record.savedById === undefined
        ? null
        : toNumber(record.savedById),
    savedByName: String(record.savedByName || "").trim(),
    savedByUser: String(record.savedByUser || "").trim(),
    savedAt: Number.isNaN(savedAtDate.getTime())
      ? new Date().toISOString()
      : savedAtDate.toISOString(),
    updatedAt:
      record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : record.updatedAt
          ? new Date(String(record.updatedAt)).toISOString()
          : Number.isNaN(savedAtDate.getTime())
            ? new Date().toISOString()
            : savedAtDate.toISOString(),
  };
}

async function ensurePayJoyCutsTable() {
  if (!ensurePayJoyCutsTablePromise) {
    ensurePayJoyCutsTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS payjoy_cortes_guardados (
          id SERIAL PRIMARY KEY,
          nombre_registro TEXT NOT NULL,
          total_sources INTEGER NOT NULL DEFAULT 0,
          source_names JSONB NOT NULL DEFAULT '[]'::jsonb,
          raw_rows INTEGER NOT NULL DEFAULT 0,
          unique_rows INTEGER NOT NULL DEFAULT 0,
          duplicates_removed INTEGER NOT NULL DEFAULT 0,
          summary_mora INTEGER NOT NULL DEFAULT 0,
          summary_pago INTEGER NOT NULL DEFAULT 0,
          summary_pago_x INTEGER NOT NULL DEFAULT 0,
          rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          guardado_por_id INTEGER,
          guardado_por_nombre TEXT NOT NULL DEFAULT '',
          guardado_por_usuario TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE payjoy_cortes_guardados
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      `);

      await prisma.$executeRawUnsafe(`
        UPDATE payjoy_cortes_guardados
        SET updated_at = COALESCE(updated_at, created_at)
        WHERE updated_at IS NULL
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE payjoy_cortes_guardados
        ALTER COLUMN updated_at SET DEFAULT NOW()
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_payjoy_cortes_guardados_created_at
        ON payjoy_cortes_guardados (created_at DESC)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_payjoy_cortes_guardados_updated_at
        ON payjoy_cortes_guardados (updated_at DESC)
      `);
    })().catch((error) => {
      ensurePayJoyCutsTablePromise = null;
      throw error;
    });
  }

  await ensurePayJoyCutsTablePromise;
}

export async function listStoredPayJoyCuts(limit = 24) {
  await ensurePayJoyCutsTable();

  const rows = await prisma.$queryRawUnsafe<StoredCutRowRecord[]>(
    `
      SELECT
        id,
        nombre_registro AS "recordName",
        total_sources AS "totalSources",
        source_names AS "sourceNames",
        raw_rows AS "rawRows",
        unique_rows AS "uniqueRows",
        duplicates_removed AS "duplicatesRemoved",
        summary_mora AS "summaryMora",
        summary_pago AS "summaryPago",
        summary_pago_x AS "summaryPagoX",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
      FROM payjoy_cortes_guardados
      ORDER BY updated_at DESC, id DESC
      LIMIT $1
    `,
    Math.max(1, Math.floor(limit))
  );

  return rows.map(mapStoredCutRow);
}

export async function getStoredPayJoyCutById(id: number) {
  await ensurePayJoyCutsTable();

  const rows = await prisma.$queryRawUnsafe<StoredCutRowRecord[]>(
    `
      SELECT
        id,
        nombre_registro AS "recordName",
        total_sources AS "totalSources",
        source_names AS "sourceNames",
        raw_rows AS "rawRows",
        unique_rows AS "uniqueRows",
        duplicates_removed AS "duplicatesRemoved",
        summary_mora AS "summaryMora",
        summary_pago AS "summaryPago",
        summary_pago_x AS "summaryPagoX",
        rows_json AS "rows",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
      FROM payjoy_cortes_guardados
      WHERE id = $1
      LIMIT 1
    `,
    Math.floor(id)
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const cut = mapStoredCutRow(row);
  const rawRows = parseJsonColumn<unknown[]>(row.rows, []);
  const parsedRows = (Array.isArray(rawRows) ? rawRows : [])
    .map(normalizeStoredRow)
    .filter((candidate): candidate is PayJoyStoredRow => candidate !== null);

  return {
    ...cut,
    rows: parsedRows,
  } satisfies PayJoyStoredCutDetail;
}

export async function saveStoredPayJoyCut(input: SavePayJoyCutInput) {
  await ensurePayJoyCutsTable();

  const rows = await prisma.$queryRawUnsafe<StoredCutRowRecord[]>(
    `
      INSERT INTO payjoy_cortes_guardados (
        nombre_registro,
        total_sources,
        source_names,
        raw_rows,
        unique_rows,
        duplicates_removed,
        summary_mora,
        summary_pago,
        summary_pago_x,
        rows_json,
        guardado_por_id,
        guardado_por_nombre,
        guardado_por_usuario,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3::jsonb,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11,
        $12,
        $13,
        NOW()
      )
      RETURNING
        id,
        nombre_registro AS "recordName",
        total_sources AS "totalSources",
        source_names AS "sourceNames",
        raw_rows AS "rawRows",
        unique_rows AS "uniqueRows",
        duplicates_removed AS "duplicatesRemoved",
        summary_mora AS "summaryMora",
        summary_pago AS "summaryPago",
        summary_pago_x AS "summaryPagoX",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
    `,
    input.recordName,
    input.totalSources,
    JSON.stringify(input.sourceNames),
    input.rawRows,
    input.uniqueRows,
    input.duplicatesRemoved,
    input.summary.mora,
    input.summary.pago,
    input.summary.pagoX,
    JSON.stringify(input.rows),
    input.savedBy.id,
    input.savedBy.nombre,
    input.savedBy.usuario
  );

  return mapStoredCutRow(rows[0]);
}

export async function updateStoredPayJoyCut(input: UpdatePayJoyCutInput) {
  await ensurePayJoyCutsTable();

  const rows = await prisma.$queryRawUnsafe<StoredCutRowRecord[]>(
    `
      UPDATE payjoy_cortes_guardados
      SET
        nombre_registro = $2,
        total_sources = $3,
        source_names = $4::jsonb,
        raw_rows = $5,
        unique_rows = $6,
        duplicates_removed = $7,
        summary_mora = $8,
        summary_pago = $9,
        summary_pago_x = $10,
        rows_json = $11::jsonb,
        guardado_por_id = $12,
        guardado_por_nombre = $13,
        guardado_por_usuario = $14,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        nombre_registro AS "recordName",
        total_sources AS "totalSources",
        source_names AS "sourceNames",
        raw_rows AS "rawRows",
        unique_rows AS "uniqueRows",
        duplicates_removed AS "duplicatesRemoved",
        summary_mora AS "summaryMora",
        summary_pago AS "summaryPago",
        summary_pago_x AS "summaryPagoX",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
    `,
    input.id,
    input.recordName,
    input.totalSources,
    JSON.stringify(input.sourceNames),
    input.rawRows,
    input.uniqueRows,
    input.duplicatesRemoved,
    input.summary.mora,
    input.summary.pago,
    input.summary.pagoX,
    JSON.stringify(input.rows),
    input.savedBy.id,
    input.savedBy.nombre,
    input.savedBy.usuario
  );

  return rows[0] ? mapStoredCutRow(rows[0]) : null;
}

export async function deleteStoredPayJoyCutById(id: number) {
  await ensurePayJoyCutsTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `
      DELETE FROM payjoy_cortes_guardados
      WHERE id = $1
      RETURNING id
    `,
    Math.floor(id)
  );

  return rows.length > 0;
}
