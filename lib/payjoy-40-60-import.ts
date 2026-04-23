import * as XLSX from "xlsx";

const HEADER_ALIASES = {
  week: ["week", "semana"],
  merchantName: [
    "merchantname",
    "merchant name",
    "merchant_name",
    "merchant",
    "tienda",
    "comercio",
  ],
  deviceTag: [
    "device_tag",
    "device tag",
    "devicetag",
    "device",
    "tag",
  ],
  loanAgeDays: [
    "loan_age_days",
    "loan age days",
    "loanagedays",
    "loan age",
  ],
  numberOfPayments: [
    "number_of_payments",
    "number of payments",
    "numberofpayments",
    "payments",
  ],
  pay40At60: [
    "pay_40_at_60",
    "pay 40 at 60",
    "pay40at60",
    "40/60",
    "40 60",
  ],
} as const;

type ImportField = keyof typeof HEADER_ALIASES;

export type PayJoyFortySixtyImportRow = {
  rowNumber: number;
  week: string;
  merchantName: string;
  deviceTag: string;
  loanAgeDays: number | null;
  numberOfPayments: number | null;
  pay40At60: 0 | 1 | null;
};

export type PayJoyFortySixtyImport = {
  fileName: string;
  sheetName: string;
  totalRows: number;
  rows: PayJoyFortySixtyImportRow[];
};

export function listPayJoyFortySixtyWeeks(rows: PayJoyFortySixtyImportRow[]) {
  const seen = new Set<string>();
  const weeks: string[] = [];

  for (const row of rows) {
    const week = normalizeText(row.week);

    if (!week || seen.has(week)) {
      continue;
    }

    seen.add(week);
    weeks.push(week);
  }

  return weeks;
}

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

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = normalizeText(value).replace(/,/g, "");

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBinaryFlag(value: unknown): 0 | 1 | null {
  const raw = normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!raw) {
    return null;
  }

  if (raw === "1" || raw === "true" || raw === "si" || raw === "yes") {
    return 1;
  }

  if (raw === "0" || raw === "false" || raw === "no") {
    return 0;
  }

  const parsed = parseNumber(raw);

  return parsed === 1 ? 1 : parsed === 0 ? 0 : null;
}

function hasMeaningfulData(row: unknown[]) {
  return row.some((cell) => normalizeText(cell) !== "");
}

function resolveColumnIndexes(headerRow: unknown[]) {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));
  const resolved = {} as Record<ImportField, number>;

  (Object.keys(HEADER_ALIASES) as ImportField[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field] as readonly string[];
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));

    if (index === -1) {
      throw new Error(
        `El archivo 40/60 no contiene la columna requerida "${field}".`
      );
    }

    resolved[field] = index;
  });

  return resolved;
}

function findHeaderIndex(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    if (!Array.isArray(row) || !row.length) {
      return false;
    }

    const normalizedHeaders = row.map((cell) => normalizeHeader(cell));

    return (
      (normalizedHeaders.includes("week") ||
        normalizedHeaders.includes("semana")) &&
      (normalizedHeaders.includes("merchantname") ||
        normalizedHeaders.includes("merchant name")) &&
      (normalizedHeaders.includes("device tag") ||
        normalizedHeaders.includes("device_tag") ||
        normalizedHeaders.includes("devicetag"))
    );
  });
}

function findBestSheet(workbook: XLSX.WorkBook) {
  const candidates = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    const headerIndex = findHeaderIndex(matrix);

    return {
      sheetName,
      matrix,
      headerIndex,
    };
  }).filter((item) => item.headerIndex !== -1);

  if (candidates[0]) {
    return candidates[0];
  }

  throw new Error(
    `No se encontro una hoja valida para 40/60. Hojas disponibles: ${workbook.SheetNames.join(", ")}`
  );
}

export function parsePayJoyFortySixtyWorkbook(
  buffer: Buffer,
  fileName: string
): PayJoyFortySixtyImport {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: true,
  });

  const { sheetName, matrix, headerIndex } = findBestSheet(workbook);
  const headerRow = matrix[headerIndex] || [];
  const columnIndexes = resolveColumnIndexes(headerRow);
  const rows: PayJoyFortySixtyImportRow[] = [];

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];

    if (!Array.isArray(row) || !hasMeaningfulData(row)) {
      continue;
    }

    rows.push({
      rowNumber: index + 1,
      week: normalizeText(row[columnIndexes.week]),
      merchantName: normalizeText(row[columnIndexes.merchantName]),
      deviceTag: normalizeText(row[columnIndexes.deviceTag]).toUpperCase(),
      loanAgeDays: parseNumber(row[columnIndexes.loanAgeDays]),
      numberOfPayments: parseNumber(row[columnIndexes.numberOfPayments]),
      pay40At60: parseBinaryFlag(row[columnIndexes.pay40At60]),
    });
  }

  return {
    fileName,
    sheetName,
    totalRows: rows.length,
    rows,
  };
}
