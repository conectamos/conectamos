import prisma from "@/lib/prisma";

export type FortySixtyStoredStatus = "40/60 APROBADO" | "40/60 NO APROBADO";

export type FortySixtyStoredRow = {
  id: string;
  week: string;
  merchantName: string;
  deviceTag: string;
  loanAgeDays: number | null;
  numberOfPayments: number | null;
  loanRepaymentBiweek: number | null;
  cedula: string;
  status: FortySixtyStoredStatus;
  pay40At60: 0 | 1 | null;
  paidInFull: boolean;
};

export type FortySixtyStoredSummary = {
  aprobados: number;
  noAprobados: number;
  cedulasEncontradas: number;
  cedulasPendientes: number;
};

export type FortySixtyStoredListItem = {
  id: number;
  recordName: string;
  week: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  filteredRows: number;
  summary: FortySixtyStoredSummary;
  savedById: number | null;
  savedByName: string;
  savedByUser: string;
  savedAt: string;
  updatedAt: string;
};

export type FortySixtyStoredDetail = FortySixtyStoredListItem & {
  rows: FortySixtyStoredRow[];
};

type SaveFortySixtyInput = {
  recordName: string;
  week: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  filteredRows: number;
  summary: FortySixtyStoredSummary;
  rows: FortySixtyStoredRow[];
  savedBy: {
    id: number | null;
    nombre: string;
    usuario: string;
  };
};

type UpdateFortySixtyInput = SaveFortySixtyInput & {
  id: number;
};

type StoredRecordRow = {
  id: number;
  recordName: string;
  week: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  filteredRows: number;
  summaryAprobados: number;
  summaryNoAprobados: number;
  summaryCedulasEncontradas: number;
  summaryCedulasPendientes: number;
  rows?: unknown;
  savedById: number | null;
  savedByName: string;
  savedByUser: string;
  savedAt: Date | string;
  updatedAt?: Date | string;
};

let ensureFortySixtyTablePromise: Promise<void> | null = null;

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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStoredRow(row: unknown): FortySixtyStoredRow | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const candidate = row as Record<string, unknown>;
  const status = normalizeText(candidate.status).toUpperCase();
  const pay40At60Value = candidate.pay40At60;
  const numericPay40At60 =
    pay40At60Value === null ||
    pay40At60Value === undefined ||
    pay40At60Value === ""
      ? null
      : Number(pay40At60Value);

  if (status !== "40/60 APROBADO" && status !== "40/60 NO APROBADO") {
    return null;
  }

  return {
    id: normalizeText(candidate.id),
    week: normalizeText(candidate.week),
    merchantName: normalizeText(candidate.merchantName),
    deviceTag: normalizeText(candidate.deviceTag).toUpperCase(),
    loanAgeDays:
      candidate.loanAgeDays === null ||
      candidate.loanAgeDays === undefined ||
      candidate.loanAgeDays === ""
        ? null
        : toNumber(candidate.loanAgeDays, Number.NaN),
    numberOfPayments:
      candidate.numberOfPayments === null ||
      candidate.numberOfPayments === undefined ||
      candidate.numberOfPayments === ""
        ? null
        : toNumber(candidate.numberOfPayments, Number.NaN),
    loanRepaymentBiweek:
      candidate.loanRepaymentBiweek === null ||
      candidate.loanRepaymentBiweek === undefined ||
      candidate.loanRepaymentBiweek === ""
        ? null
        : toNumber(candidate.loanRepaymentBiweek, Number.NaN),
    cedula: normalizeText(candidate.cedula),
    status: status as FortySixtyStoredStatus,
    pay40At60:
      numericPay40At60 === 1 ? 1 : numericPay40At60 === 0 ? 0 : null,
    paidInFull: Boolean(candidate.paidInFull),
  };
}

function mapStoredRecord(record: StoredRecordRow): FortySixtyStoredListItem {
  const savedAtDate =
    record.savedAt instanceof Date
      ? record.savedAt
      : new Date(String(record.savedAt || ""));

  return {
    id: toNumber(record.id),
    recordName: normalizeText(record.recordName),
    week: normalizeText(record.week),
    fileName: normalizeText(record.fileName),
    sheetName: normalizeText(record.sheetName),
    totalRows: toNumber(record.totalRows),
    filteredRows: toNumber(record.filteredRows),
    summary: {
      aprobados: toNumber(record.summaryAprobados),
      noAprobados: toNumber(record.summaryNoAprobados),
      cedulasEncontradas: toNumber(record.summaryCedulasEncontradas),
      cedulasPendientes: toNumber(record.summaryCedulasPendientes),
    },
    savedById:
      record.savedById === null || record.savedById === undefined
        ? null
        : toNumber(record.savedById),
    savedByName: normalizeText(record.savedByName),
    savedByUser: normalizeText(record.savedByUser),
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

async function ensureFortySixtyTable() {
  if (!ensureFortySixtyTablePromise) {
    ensureFortySixtyTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS payjoy_40_60_guardados (
          id SERIAL PRIMARY KEY,
          nombre_registro TEXT NOT NULL,
          week_label TEXT NOT NULL DEFAULT '',
          file_name TEXT NOT NULL DEFAULT '',
          sheet_name TEXT NOT NULL DEFAULT '',
          total_rows INTEGER NOT NULL DEFAULT 0,
          filtered_rows INTEGER NOT NULL DEFAULT 0,
          summary_aprobados INTEGER NOT NULL DEFAULT 0,
          summary_no_aprobados INTEGER NOT NULL DEFAULT 0,
          summary_cedulas_encontradas INTEGER NOT NULL DEFAULT 0,
          summary_cedulas_pendientes INTEGER NOT NULL DEFAULT 0,
          rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          guardado_por_id INTEGER,
          guardado_por_nombre TEXT NOT NULL DEFAULT '',
          guardado_por_usuario TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_payjoy_40_60_guardados_updated_at
        ON payjoy_40_60_guardados (updated_at DESC)
      `);
    })().catch((error) => {
      ensureFortySixtyTablePromise = null;
      throw error;
    });
  }

  await ensureFortySixtyTablePromise;
}

export async function listStoredFortySixtyRecords(limit = 24) {
  await ensureFortySixtyTable();

  const rows = await prisma.$queryRawUnsafe<StoredRecordRow[]>(
    `
      SELECT
        id,
        nombre_registro AS "recordName",
        week_label AS "week",
        file_name AS "fileName",
        sheet_name AS "sheetName",
        total_rows AS "totalRows",
        filtered_rows AS "filteredRows",
        summary_aprobados AS "summaryAprobados",
        summary_no_aprobados AS "summaryNoAprobados",
        summary_cedulas_encontradas AS "summaryCedulasEncontradas",
        summary_cedulas_pendientes AS "summaryCedulasPendientes",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
      FROM payjoy_40_60_guardados
      ORDER BY updated_at DESC, id DESC
      LIMIT $1
    `,
    Math.max(1, Math.floor(limit))
  );

  return rows.map(mapStoredRecord);
}

export async function getStoredFortySixtyRecordById(id: number) {
  await ensureFortySixtyTable();

  const rows = await prisma.$queryRawUnsafe<StoredRecordRow[]>(
    `
      SELECT
        id,
        nombre_registro AS "recordName",
        week_label AS "week",
        file_name AS "fileName",
        sheet_name AS "sheetName",
        total_rows AS "totalRows",
        filtered_rows AS "filteredRows",
        summary_aprobados AS "summaryAprobados",
        summary_no_aprobados AS "summaryNoAprobados",
        summary_cedulas_encontradas AS "summaryCedulasEncontradas",
        summary_cedulas_pendientes AS "summaryCedulasPendientes",
        rows_json AS "rows",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
      FROM payjoy_40_60_guardados
      WHERE id = $1
      LIMIT 1
    `,
    Math.floor(id)
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const record = mapStoredRecord(row);
  const rawRows = parseJsonColumn<unknown[]>(row.rows, []);
  const parsedRows = (Array.isArray(rawRows) ? rawRows : [])
    .map(normalizeStoredRow)
    .filter(
      (candidate): candidate is FortySixtyStoredRow => candidate !== null
    );

  return {
    ...record,
    rows: parsedRows,
  } satisfies FortySixtyStoredDetail;
}

export async function saveStoredFortySixtyRecord(input: SaveFortySixtyInput) {
  await ensureFortySixtyTable();

  const rows = await prisma.$queryRawUnsafe<StoredRecordRow[]>(
    `
      INSERT INTO payjoy_40_60_guardados (
        nombre_registro,
        week_label,
        file_name,
        sheet_name,
        total_rows,
        filtered_rows,
        summary_aprobados,
        summary_no_aprobados,
        summary_cedulas_encontradas,
        summary_cedulas_pendientes,
        rows_json,
        guardado_por_id,
        guardado_por_nombre,
        guardado_por_usuario,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        $12,
        $13,
        $14,
        NOW()
      )
      RETURNING
        id,
        nombre_registro AS "recordName",
        week_label AS "week",
        file_name AS "fileName",
        sheet_name AS "sheetName",
        total_rows AS "totalRows",
        filtered_rows AS "filteredRows",
        summary_aprobados AS "summaryAprobados",
        summary_no_aprobados AS "summaryNoAprobados",
        summary_cedulas_encontradas AS "summaryCedulasEncontradas",
        summary_cedulas_pendientes AS "summaryCedulasPendientes",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
    `,
    input.recordName,
    input.week,
    input.fileName,
    input.sheetName,
    input.totalRows,
    input.filteredRows,
    input.summary.aprobados,
    input.summary.noAprobados,
    input.summary.cedulasEncontradas,
    input.summary.cedulasPendientes,
    JSON.stringify(input.rows),
    input.savedBy.id,
    input.savedBy.nombre,
    input.savedBy.usuario
  );

  return mapStoredRecord(rows[0]);
}

export async function updateStoredFortySixtyRecord(input: UpdateFortySixtyInput) {
  await ensureFortySixtyTable();

  const rows = await prisma.$queryRawUnsafe<StoredRecordRow[]>(
    `
      UPDATE payjoy_40_60_guardados
      SET
        nombre_registro = $2,
        week_label = $3,
        file_name = $4,
        sheet_name = $5,
        total_rows = $6,
        filtered_rows = $7,
        summary_aprobados = $8,
        summary_no_aprobados = $9,
        summary_cedulas_encontradas = $10,
        summary_cedulas_pendientes = $11,
        rows_json = $12::jsonb,
        guardado_por_id = $13,
        guardado_por_nombre = $14,
        guardado_por_usuario = $15,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        nombre_registro AS "recordName",
        week_label AS "week",
        file_name AS "fileName",
        sheet_name AS "sheetName",
        total_rows AS "totalRows",
        filtered_rows AS "filteredRows",
        summary_aprobados AS "summaryAprobados",
        summary_no_aprobados AS "summaryNoAprobados",
        summary_cedulas_encontradas AS "summaryCedulasEncontradas",
        summary_cedulas_pendientes AS "summaryCedulasPendientes",
        guardado_por_id AS "savedById",
        guardado_por_nombre AS "savedByName",
        guardado_por_usuario AS "savedByUser",
        created_at AS "savedAt",
        updated_at AS "updatedAt"
    `,
    input.id,
    input.recordName,
    input.week,
    input.fileName,
    input.sheetName,
    input.totalRows,
    input.filteredRows,
    input.summary.aprobados,
    input.summary.noAprobados,
    input.summary.cedulasEncontradas,
    input.summary.cedulasPendientes,
    JSON.stringify(input.rows),
    input.savedBy.id,
    input.savedBy.nombre,
    input.savedBy.usuario
  );

  return rows[0] ? mapStoredRecord(rows[0]) : null;
}

export async function deleteStoredFortySixtyRecordById(id: number) {
  await ensureFortySixtyTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `
      DELETE FROM payjoy_40_60_guardados
      WHERE id = $1
      RETURNING id
    `,
    Math.floor(id)
  );

  return rows.length > 0;
}
