import * as XLSX from "xlsx";

const TARGET_SHEET_NAME = "transacciones";

const HEADER_ALIASES = {
  transactionTime: [
    "transaction time",
    "transaction_time",
    "transactiontime",
    "fecha transaccion",
    "fecha de transaccion",
    "transaction date",
  ],
  merchantName: [
    "merchant name",
    "merchant_name",
    "merchant",
    "comercio",
    "tienda",
  ],
  device: ["device", "device tag", "device_tag", "devicetag"],
  deviceFamily: [
    "device family",
    "device_family",
    "devicefamily",
    "family",
    "familia",
  ],
  imei: ["imei", "device imei"],
  nationalId: [
    "national id",
    "national_id",
    "nationalid",
    "cedula",
    "customer national id",
    "documento",
  ],
} as const;

type ImportField = keyof typeof HEADER_ALIASES;

export type PayJoyTransactionRow = {
  rowNumber: number;
  transactionTime: Date | null;
  merchantName: string;
  device: string;
  deviceFamily: string;
  imei: string;
  nationalId: string;
};

export type PayJoyWorkbookImport = {
  fileName: string;
  sheetName: string;
  totalRows: number;
  rows: PayJoyTransactionRow[];
};

function normalizeHeader(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function parseDateCell(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    return new Date(
      parsed.y,
      Math.max(parsed.m - 1, 0),
      parsed.d,
      parsed.H,
      parsed.M,
      Math.round(parsed.S)
    );
  }

  const raw = normalizeText(value);

  if (!raw) {
    return null;
  }

  const isoAttempt = new Date(raw);

  if (!Number.isNaN(isoAttempt.getTime())) {
    return isoAttempt;
  }

  const match = raw.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasMeaningfulData(row: unknown[]) {
  return row.some((cell) => normalizeText(cell) !== "");
}

function findTargetSheetName(sheetNames: string[]) {
  const exact = sheetNames.find(
    (sheetName) => normalizeHeader(sheetName) === TARGET_SHEET_NAME
  );

  if (exact) {
    return exact;
  }

  throw new Error(
    `No se encontro la hoja "Transacciones". Hojas disponibles: ${sheetNames.join(", ")}`
  );
}

function resolveColumnIndexes(headerRow: unknown[]) {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));
  const resolved = {} as Record<ImportField, number>;

  (Object.keys(HEADER_ALIASES) as ImportField[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field] as readonly string[];
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));

    if (index === -1) {
      throw new Error(
        `La hoja "Transacciones" no contiene la columna requerida "${field}".`
      );
    }

    resolved[field] = index;
  });

  return resolved;
}

export function parsePayJoyWorkbook(
  buffer: Buffer,
  fileName: string
): PayJoyWorkbookImport {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: true,
  });

  const sheetName = findTargetSheetName(workbook.SheetNames);
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`No fue posible leer la hoja "${sheetName}".`);
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerIndex = matrix.findIndex((row) => {
    if (!Array.isArray(row) || !row.length) {
      return false;
    }

    const normalizedHeaders = row.map((cell) => normalizeHeader(cell));

    return (
      normalizedHeaders.includes("transaction time") &&
      normalizedHeaders.includes("merchant name") &&
      normalizedHeaders.includes("device")
    );
  });

  if (headerIndex === -1) {
    throw new Error(
      'No se encontro una fila de encabezados valida dentro de la hoja "Transacciones".'
    );
  }

  const headerRow = matrix[headerIndex] || [];
  const columnIndexes = resolveColumnIndexes(headerRow);
  const rows: PayJoyTransactionRow[] = [];

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];

    if (!Array.isArray(row) || !hasMeaningfulData(row)) {
      continue;
    }

    const transactionTime = parseDateCell(row[columnIndexes.transactionTime]);
    const merchantName = normalizeText(row[columnIndexes.merchantName]);
    const device = normalizeText(row[columnIndexes.device]).toUpperCase();
    const deviceFamily = normalizeText(row[columnIndexes.deviceFamily]);
    const imei = normalizeText(row[columnIndexes.imei]);
    const nationalId = normalizeText(row[columnIndexes.nationalId]);

    if (
      !transactionTime &&
      !merchantName &&
      !device &&
      !deviceFamily &&
      !imei &&
      !nationalId
    ) {
      continue;
    }

    rows.push({
      rowNumber: index + 1,
      transactionTime,
      merchantName,
      device,
      deviceFamily,
      imei,
      nationalId,
    });
  }

  if (!rows.length) {
    throw new Error(
      'La hoja "Transacciones" no contiene filas de datos para procesar.'
    );
  }

  return {
    fileName,
    sheetName,
    totalRows: rows.length,
    rows,
  };
}
