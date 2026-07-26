export type AloReportCell = string | number | boolean | Date | null | undefined;

export type AloReportTable = {
  header: AloReportCell[] | null;
  rows: AloReportCell[][];
};

export type AloReportCreditMatch = {
  documento: string | null;
  imei: string | null;
  fechaCreacionCredito: string;
  creditoAutorizado: number;
  header: AloReportCell[] | null;
  row: AloReportCell[];
  tableIndex: number;
  rowIndex: number;
};

export type AloReportParserOptions = {
  documento?: unknown;
  todayKey?: string;
  html?: string;
  htmlHeaders?: AloReportCell[][];
};

export type AloAmountParserOptions = {
  allowLegacyColumn10?: boolean;
};

export type AloDateParserOptions = {
  allowLegacyColumn0?: boolean;
};

export type AloReportParseDiagnostic = {
  code: "DATE_INVALID" | "AMOUNT_INVALID";
  headerKeys: string[];
};

function visibleText(value: unknown) {
  return String(value ?? "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: unknown) {
  return visibleText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, "")
    .toUpperCase();
}

function onlyDigits(value: unknown) {
  return visibleText(value).replace(/\D/g, "");
}

function identityDigits(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }

  const text = visibleText(value).trim();
  const decimalInteger = text.match(/^(\d+)[,.]0+$/);

  if (decimalInteger) {
    return decimalInteger[1];
  }

  if (/^\d+(?:[,.]\d+)?e[+-]?\d+$/i.test(text)) {
    const numericValue = Number(text.replace(",", "."));

    if (Number.isSafeInteger(numericValue)) {
      return String(numericValue);
    }
  }

  return onlyDigits(text);
}

function imeiDigits(value: unknown) {
  const text = visibleText(value).trim();
  const decimalImei = text.match(/^(\d{15})[,.]0+$/);

  if (decimalImei) {
    return decimalImei[1];
  }

  const digits = onlyDigits(text);

  return digits.length === 15 ? digits : "";
}

function validDateKey(year: number, month: number, day: number) {
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

function expandYear(value: number) {
  if (value >= 100) {
    return value;
  }

  return value <= 69 ? 2000 + value : 1900 + value;
}

function dateKeyFromUtcDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return validDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function dateKeyFromTimestampInBogota(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return validDateKey(
    Number(values.year),
    Number(values.month),
    Number(values.day)
  );
}

function dateKeysFromNumber(value: number) {
  if (!Number.isFinite(value)) {
    return [];
  }

  if (value > 1_000_000_000) {
    const milliseconds = value > 9_999_999_999 ? value : value * 1000;
    const key = dateKeyFromTimestampInBogota(new Date(milliseconds));
    return key ? [key] : [];
  }

  if (value >= 20_000 && value <= 80_000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const key = dateKeyFromUtcDate(
      new Date(excelEpoch + Math.floor(value) * 86_400_000)
    );
    return key ? [key] : [];
  }

  return [];
}

export function dateKeysFromAloValue(value: unknown) {
  if (value instanceof Date) {
    const key = dateKeyFromTimestampInBogota(value);
    return key ? [key] : [];
  }

  if (typeof value === "number") {
    return dateKeysFromNumber(value);
  }

  const text = visibleText(value);

  if (!text) {
    return [];
  }

  if (/^\d{10,13}$/.test(text)) {
    const numericKeys = dateKeysFromNumber(Number(text));

    if (numericKeys.length > 0) {
      return numericKeys;
    }
  }

  if (/^\d{5}(?:[.,]0+)?$/.test(text)) {
    const numericKeys = dateKeysFromNumber(
      Number(text.replace(",", "."))
    );

    if (numericKeys.length > 0) {
      return numericKeys;
    }
  }

  const keys: string[] = [];
  const add = (key: string | null) => {
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
  };

  for (const match of text.matchAll(
    /(?:^|[^\d])(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=$|[^\d])/g
  )) {
    add(validDateKey(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  const compactMatch = text.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?=$|[^\d])/);

  if (compactMatch) {
    add(
      validDateKey(
        Number(compactMatch[1]),
        Number(compactMatch[2]),
        Number(compactMatch[3])
      )
    );
  }

  for (const match of text.matchAll(
    /(?:^|[^\d])(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})(?=$|[^\d])/g
  )) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    const year = expandYear(Number(match[3]));

    // Colombia normalmente entrega DD/MM, pero el API tambien ha usado MM/DD.
    add(validDateKey(year, right, left));
    add(validDateKey(year, left, right));
  }

  return keys;
}

function shiftDateKey(dateKey: string, days: number) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)
  );

  return validDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function todayKeyInBogota() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function dateHeaderScore(header: unknown) {
  const key = normalizeHeader(header);
  const hasDateWord =
    key.includes("FECHA") ||
    key.includes("DATE") ||
    key.includes("CREATED") ||
    key.includes("TIMESTAMP");

  if (!key || !hasDateWord) {
    return 0;
  }

  if (
    key.includes("NACIM") ||
    key.includes("EXPED") ||
    key.includes("VENC") ||
    key.includes("PAGO") ||
    ((key.includes("INICIO") ||
      key.includes("FINAL") ||
      key.includes("HASTA")) &&
      !key.includes("CREDITO") &&
      !key.includes("VENTA"))
  ) {
    return -50;
  }

  if (
    key.includes("VENTA") ||
    key.includes("CREDITO") ||
    key.includes("CREACION") ||
    key.includes("REGISTRO") ||
    key.includes("FINANCIACION") ||
    key.includes("DESEMBOLS") ||
    key.includes("APROBACION") ||
    key.includes("OTORGAMIENTO") ||
    key.includes("CREATEDAT")
  ) {
    return 100;
  }

  return key.includes("FECHA") || key.endsWith("DATE") ? 20 : 0;
}

export function findRecentAloDate(
  row: AloReportCell[],
  header: AloReportCell[] | null = null,
  todayKey = todayKeyInBogota(),
  options: AloDateParserOptions = {}
) {
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const recent = new Set([todayKey, yesterdayKey].filter(Boolean));
  const candidates: Array<{
    key: string;
    headerScore: number;
    columnIndex: number;
  }> = [];

  row.forEach((cell, columnIndex) => {
    const headerScore = dateHeaderScore(header?.[columnIndex]);

    if (header && headerScore <= 0) {
      return;
    }

    for (const key of dateKeysFromAloValue(cell)) {
      if (!recent.has(key)) {
        continue;
      }

      candidates.push({
        key,
        headerScore,
        columnIndex,
      });
    }
  });

  candidates.sort((left, right) => {
    if (left.headerScore !== right.headerScore) {
      return right.headerScore - left.headerScore;
    }

    if (left.key !== right.key) {
      return right.key.localeCompare(left.key);
    }

    return left.columnIndex - right.columnIndex;
  });

  if (candidates.length > 0) {
    return candidates[0].key;
  }

  if (
    options.allowLegacyColumn0 &&
    isAllowedLegacyDateHeader(header?.[0])
  ) {
    return (
      dateKeysFromAloValue(row[0]).find((key) => recent.has(key)) ?? null
    );
  }

  return null;
}

export function parseAloCurrencyAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  let raw = visibleText(value)
    .replace(/\$/g, "")
    .replace(/\bCOP\b/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");

  if (!raw || raw === "-" || raw === "." || raw === ",") {
    return null;
  }

  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    raw = raw
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    const decimals = raw.length - lastComma - 1;
    raw =
      decimals > 0 && decimals <= 2
        ? raw.replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = raw.length - lastDot - 1;
    raw = decimals > 0 && decimals <= 2 ? raw : raw.replace(/\./g, "");
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function safeMoneyMarkerScore(value: unknown) {
  if (typeof value !== "string") {
    return 0;
  }

  const text = visibleText(value);

  if (text.includes("$") || /\bCOP\b/i.test(text)) {
    return 2;
  }

  return /(?:^|[^\d])\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?(?=$|[^\d])/.test(
    text
  )
    ? 1
    : 0;
}

function isUnsafeIdentifierOrDate(value: unknown) {
  const text = visibleText(value);
  const digitGroups = text.match(/\d+/g) ?? [];

  return (
    dateKeysFromAloValue(value).length > 0 ||
    digitGroups.some((group) => group.length === 15) ||
    onlyDigits(text).length === 15
  );
}

function amountHeaderScore(header: unknown) {
  const key = normalizeHeader(header);

  if (!key) {
    return -1;
  }

  if (
    key.includes("CUOTA") ||
    key.includes("INICIAL") ||
    key.includes("SALDO") ||
    key.includes("ACCESORIO") ||
    key.includes("MORA") ||
    key.includes("PENDIENTE")
  ) {
    return -1;
  }

  const hasAmountWord =
    key.includes("VALOR") ||
    key.includes("MONTO") ||
    key.includes("TOTAL") ||
    key.includes("CUPO");
  const hasCreditState =
    key.includes("CREDITO") ||
    key.includes("FINANCIAD") ||
    key.includes("AUTORIZ") ||
    key.includes("APROBAD") ||
    key.includes("DESEMBOLS") ||
    key.includes("OTORGAD");

  if (
    (hasAmountWord && hasCreditState) ||
    key.includes("CREDITOAUTORIZ") ||
    key.includes("CREDITOAPROBAD") ||
    key.includes("CREDITODESEMBOLS")
  ) {
    return 140;
  }

  if (
    key.includes("MONTOTOTAL") ||
    key.includes("VALORTOTAL") ||
    (key.includes("TOTAL") && key.includes("CREDITO"))
  ) {
    return 120;
  }

  if (
    key === "MONTO" ||
    key === "TOTAL" ||
    key === "VALOR" ||
    key === "CUPO"
  ) {
    return 100;
  }

  return -1;
}

function isExplicitlyExcludedAmountHeader(header: unknown) {
  const key = normalizeHeader(header);

  return (
    key.includes("CUOTA") ||
    key.includes("INICIAL") ||
    key.includes("SALDO") ||
    key.includes("ACCESORIO") ||
    key.includes("MORA") ||
    key.includes("PENDIENTE")
  );
}

function isAllowedLegacyDateHeader(header: unknown) {
  const key = normalizeHeader(header);

  if (!key) {
    return true;
  }

  if (
    key.includes("PAGO") ||
    key.includes("VENC") ||
    key.includes("NACIM") ||
    key.includes("EXPED") ||
    key.includes("INICIAL") ||
    key.includes("FINAL") ||
    key.includes("HASTA")
  ) {
    return false;
  }

  return (
    key.includes("FEC") ||
    key.includes("DATE") ||
    key.includes("CREA") ||
    key.includes("REGIST") ||
    key.includes("VENTA") ||
    key.includes("CREDITO") ||
    key.includes("DESEMBOLS") ||
    key.includes("APROB") ||
    key.includes("OTORG")
  );
}

export function findAloAuthorizedAmount(
  row: AloReportCell[],
  header: AloReportCell[] | null = null,
  options: AloAmountParserOptions = {}
) {
  const candidates: Array<{
    amount: number;
    score: number;
    columnIndex: number;
  }> = [];

  if (header && header.length > 0) {
    header.forEach((cell, columnIndex) => {
      const score = amountHeaderScore(cell);

      if (score < 0) {
        return;
      }

      const amount = parseAloCurrencyAmount(row[columnIndex]);

      if (amount !== null && amount > 0) {
        candidates.push({ amount, score, columnIndex });
      }
    });
  }

  candidates.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    return left.columnIndex - right.columnIndex;
  });

  if (candidates.length > 0) {
    return candidates[0].amount;
  }

  // Contrato del Excel historico de ALO: el monto total esta en columna 11,
  // incluso cuando el archivo trae encabezados con nombres no reconocidos.
  if (
    options.allowLegacyColumn10 &&
    !isExplicitlyExcludedAmountHeader(header?.[10])
  ) {
    const fallback = parseAloCurrencyAmount(row[10]);

    if (fallback !== null && fallback > 0) {
      return fallback;
    }
  }

  if (!header || header.length === 0) {
    const inferred = row
      .flatMap((cell) => {
        const amount = parseAloCurrencyAmount(cell);
        const markerScore = safeMoneyMarkerScore(cell);

        if (
          markerScore <= 0 ||
          isUnsafeIdentifierOrDate(cell) ||
          amount === null ||
          amount <= 0
        ) {
          return [];
        }

        return [{ amount, markerScore }];
      });
    const strongestMarker = inferred.reduce(
      (max, item) => Math.max(max, item.markerScore),
      0
    );
    const strongestAmounts = Array.from(
      new Set(
        inferred
          .filter((item) => item.markerScore === strongestMarker)
          .map((item) => item.amount)
      )
    );

    return strongestAmounts.length === 1 ? strongestAmounts[0] : null;
  }

  return null;
}

export function diagnoseAloReportRow(
  row: AloReportCell[],
  header: AloReportCell[] | null = null,
  todayKey = todayKeyInBogota(),
  amountOptions: AloAmountParserOptions = {}
): AloReportParseDiagnostic | null {
  const headerKeys = (header ?? [])
    .map(normalizeHeader)
    .filter(
      (key) =>
        Boolean(key) &&
        key.length <= 80 &&
        !/\d{5,}/.test(key) &&
        /FECHA|DATE|CREATED|TIMESTAMP|CEDULA|DOCUMENTO|IDENTIFICACION|IMEI|MONTO|TOTAL|VALOR|CUPO|CREDITO|FINANCIAD|AUTORIZ|APROBAD|DESEMBOLS|CUOTA|PLAZO|CLIENTE|NOMBRE/.test(
          key
        )
    );

  if (
    !findRecentAloDate(row, header, todayKey, {
      allowLegacyColumn0: amountOptions.allowLegacyColumn10,
    })
  ) {
    return {
      code: "DATE_INVALID",
      headerKeys,
    };
  }

  if (findAloAuthorizedAmount(row, header, amountOptions) === null) {
    return {
      code: "AMOUNT_INVALID",
      headerKeys,
    };
  }

  return null;
}

function isDocumentHeader(value: unknown) {
  const key = normalizeHeader(value);
  const isIdentifier =
    key.includes("CEDULA") ||
    key.includes("DOCUMENTO") ||
    key.includes("IDENTIFICACION") ||
    key === "CC" ||
    key.includes("NUMERODOC") ||
    key.includes("NRODOC") ||
    key.includes("DOCCLIENTE");

  if (!isIdentifier) {
    return false;
  }

  return !(
    key.includes("ASESOR") ||
    key.includes("VENDEDOR") ||
    key.includes("CERRADOR") ||
    key.includes("JALADOR") ||
    key.includes("EMPLEADO") ||
    key.includes("USUARIO") ||
    key.includes("AGENTE") ||
    key.includes("ALIADO") ||
    key.includes("COMERCIO") ||
    key.includes("TIENDA") ||
    key.includes("PUNTO") ||
    key.includes("REFERENCIA") ||
    key.includes("FAMILIAR") ||
    key.includes("CONTACTO")
  );
}

function isNonClientIdentityHeader(value: unknown) {
  const key = normalizeHeader(value);

  return (
    key.includes("ASESOR") ||
    key.includes("VENDEDOR") ||
    key.includes("CERRADOR") ||
    key.includes("JALADOR") ||
    key.includes("EMPLEADO") ||
    key.includes("USUARIO") ||
    key.includes("AGENTE") ||
    key.includes("ALIADO") ||
    key.includes("COMERCIO") ||
    key.includes("TIENDA") ||
    key.includes("PUNTO") ||
    key.includes("REFERENCIA") ||
    key.includes("FAMILIAR") ||
    key.includes("CONTACTO")
  );
}

function isImeiHeader(value: unknown) {
  return normalizeHeader(value).includes("IMEI");
}

function semanticHeaderScore(header: AloReportCell[]) {
  let score = 0;

  for (const cell of header) {
    const key = normalizeHeader(cell);

    if (isDocumentHeader(cell)) score += 2;
    if (isImeiHeader(cell)) score += 2;
    if (dateHeaderScore(cell) > 0) score += 1;
    if (amountHeaderScore(cell) >= 0) score += 2;
    if (
      key.includes("CUOTA") ||
      key.includes("PLAZO") ||
      key.includes("CLIENTE") ||
      key.includes("NOMBRE")
    ) {
      score += 1;
    }
  }

  return score;
}

export function extractAloHtmlHeaderCandidates(html: string) {
  const candidates: AloReportCell[][] = [];

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const rowHtml = rowMatch[0];
    const cells = Array.from(
      rowHtml.matchAll(/<th\b[^>]*>[\s\S]*?<\/th>/gi)
    ).map((cellMatch) => visibleText(cellMatch[0]));

    if (cells.length > 0 && semanticHeaderScore(cells) > 0) {
      candidates.push(cells);
    }
  }

  return candidates;
}

export function selectCompatibleAloHeader(
  candidates: AloReportCell[][],
  rowLength: number
) {
  const scored = candidates
    .filter((header) => header.length >= rowLength)
    .map((header, index) => ({
      header,
      index,
      distance: header.length - rowLength,
      semanticScore: semanticHeaderScore(header),
    }))
    .filter((item) => item.semanticScore > 0)
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      if (left.semanticScore !== right.semanticScore) {
        return right.semanticScore - left.semanticScore;
      }

      return left.index - right.index;
    });

  return scored[0]?.header ?? null;
}

function isPrimitiveCell(value: unknown): value is AloReportCell {
  return (
    value === null ||
    value === undefined ||
    value instanceof Date ||
    ["string", "number", "boolean"].includes(typeof value)
  );
}

function recordTable(records: Record<string, unknown>[]): AloReportTable | null {
  const keys = Array.from(
    new Set(
      records.flatMap((record) =>
        Object.keys(record).filter((key) => isPrimitiveCell(record[key]))
      )
    )
  );

  if (keys.length === 0) {
    return null;
  }

  return {
    header: keys,
    rows: records.map((record) =>
      keys.map((key) =>
        isPrimitiveCell(record[key]) ? record[key] as AloReportCell : ""
      )
    ),
  };
}

function tableFromArray(value: unknown[]): AloReportTable | null {
  const arrayRows = value.filter(Array.isArray) as unknown[][];
  const recordRows = value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );

  if (arrayRows.length === value.length && arrayRows.length > 0) {
    const rows = arrayRows.map((row) =>
      row.map((cell) => isPrimitiveCell(cell) ? cell : JSON.stringify(cell))
    );
    const firstRow = rows[0];

    if (semanticHeaderScore(firstRow) >= 2) {
      return {
        header: firstRow,
        rows: rows.slice(1),
      };
    }

    return { header: null, rows };
  }

  if (recordRows.length === value.length && recordRows.length > 0) {
    return recordTable(recordRows);
  }

  return null;
}

export function extractAloReportTables(source: unknown) {
  let parsed = source;

  if (typeof source === "string") {
    const trimmed = source.trim();

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return [];
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  const tables: AloReportTable[] = [];
  const visited = new Set<unknown>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || !value || visited.has(value)) {
      return;
    }

    if (typeof value === "object") {
      visited.add(value);
    }

    if (Array.isArray(value)) {
      const table = tableFromArray(value);

      if (table) {
        tables.push(table);
        return;
      }

      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "data",
      "aaData",
      "rows",
      "items",
      "results",
      "resultados",
    ];
    const preferredValues = preferredKeys
      .map((key) => record[key])
      .filter((item) => Array.isArray(item));

    if (preferredValues.length > 0) {
      preferredValues.forEach((item) => visit(item, depth + 1));
      return;
    }

    Object.values(record).forEach((item) => {
      if (Array.isArray(item) || (item && typeof item === "object")) {
        visit(item, depth + 1);
      }
    });
  };

  visit(parsed, 0);
  return tables;
}

function conservativeDocumentFromCell(value: unknown) {
  const text = visibleText(value);

  if (
    !text ||
    text.includes("$") ||
    /\bCOP\b/i.test(text) ||
    dateKeysFromAloValue(value).length > 0
  ) {
    return null;
  }

  if (!/^[\d.\s-]+$/.test(text)) {
    return null;
  }

  const digits = identityDigits(text);

  return digits.length >= 5 && digits.length <= 12 ? digits : null;
}

function documentHeaderIndexes(header: AloReportCell[] | null) {
  if (!header) {
    return [];
  }

  return header
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => isDocumentHeader(cell))
    .map(({ index }) => index);
}

export function matchesAloReportDocument(
  row: AloReportCell[],
  documento: string,
  header: AloReportCell[] | null
) {
  const semanticIndexes = documentHeaderIndexes(header);

  if (semanticIndexes.length > 0) {
    return semanticIndexes.some(
      (index) => identityDigits(row[index]) === documento
    );
  }

  return row.some((cell, index) => {
    if (
      header &&
      (isNonClientIdentityHeader(header[index]) ||
        isImeiHeader(header[index]) ||
        dateHeaderScore(header[index]) !== 0 ||
        amountHeaderScore(header[index]) >= 0)
    ) {
      return false;
    }

    return conservativeDocumentFromCell(cell) === documento;
  });
}

export function findAloReportDocument(
  row: AloReportCell[],
  header: AloReportCell[] | null,
  expectedDocument: string
) {
  const expected = onlyDigits(expectedDocument);
  const semanticValues = documentHeaderIndexes(header)
    .map((index) => identityDigits(row[index]))
    .filter((digits) => digits.length >= 5 && digits.length <= 15);

  if (expected && semanticValues.includes(expected)) {
    return expected;
  }

  if (semanticValues.length > 0) {
    return semanticValues[0];
  }

  if (
    expected &&
    matchesAloReportDocument(row, expected, header)
  ) {
    return expected;
  }

  return null;
}

export function matchesAloReportImei(
  row: AloReportCell[],
  imeiValue: unknown,
  header: AloReportCell[] | null,
  options: { allowLegacyAnyCell?: boolean } = {}
) {
  const expectedImei = imeiDigits(imeiValue);

  if (!expectedImei) {
    return false;
  }

  const semanticIndexes = (header ?? [])
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => isImeiHeader(cell))
    .map(({ index }) => index);

  if (semanticIndexes.length > 0) {
    return semanticIndexes.some(
      (index) => imeiDigits(row[index]) === expectedImei
    );
  }

  if (!options.allowLegacyAnyCell) {
    return false;
  }

  return row.some((cell) => {
    if (imeiDigits(cell) === expectedImei) {
      return true;
    }

    const groups: string[] = visibleText(cell).match(/\d{15}/g) ?? [];
    return groups.includes(expectedImei);
  });
}

function findImei(row: AloReportCell[], header: AloReportCell[] | null) {
  if (header) {
    for (let index = 0; index < header.length; index++) {
      if (!isImeiHeader(header[index])) {
        continue;
      }

      const digits = imeiDigits(row[index]);

      if (digits.length === 15) {
        return digits;
      }
    }
  }

  for (const cell of row) {
    const groups = visibleText(cell).match(/\d{15}/g) ?? [];

    if (groups.length > 0) {
      return groups[0] ?? null;
    }
  }

  return null;
}

export function parseAloReportCredits(
  source: unknown,
  options: AloReportParserOptions = {}
) {
  const documento = onlyDigits(options.documento).slice(0, 15);
  const todayKey = options.todayKey || todayKeyInBogota();
  const htmlHeaders = [
    ...(options.htmlHeaders ?? []),
    ...(options.html ? extractAloHtmlHeaderCandidates(options.html) : []),
  ];
  const matches: AloReportCreditMatch[] = [];

  extractAloReportTables(source).forEach((table, tableIndex) => {
    table.rows.forEach((row, rowIndex) => {
      const header =
        table.header ?? selectCompatibleAloHeader(htmlHeaders, row.length);

      if (documento && !matchesAloReportDocument(row, documento, header)) {
        return;
      }

      const fechaCreacionCredito = findRecentAloDate(row, header, todayKey);

      if (!fechaCreacionCredito) {
        return;
      }

      const creditoAutorizado = findAloAuthorizedAmount(row, header);

      if (creditoAutorizado === null || creditoAutorizado <= 0) {
        return;
      }

      matches.push({
        documento: findAloReportDocument(row, header, documento),
        imei: findImei(row, header),
        fechaCreacionCredito,
        creditoAutorizado,
        header,
        row,
        tableIndex,
        rowIndex,
      });
    });
  });

  return matches;
}

export function selectAloCreditByImei<T extends { imei: unknown }>(
  credits: T[],
  imeiValue: unknown
) {
  const imei = imeiDigits(imeiValue);

  if (imei.length !== 15) {
    return null;
  }

  return credits.find((credit) => imeiDigits(credit.imei) === imei) ?? null;
}

export function selectAloCreditForSale<T extends { imei: unknown }>(
  credits: T[],
  imeiValue: unknown
):
  | { status: "MATCHED"; credit: T }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
  | { status: "IMEI_MISMATCH" } {
  const imeiDigits = onlyDigits(imeiValue);

  if (imeiDigits.length === 15) {
    const credit = selectAloCreditByImei(credits, imeiDigits);

    return credit
      ? { status: "MATCHED", credit }
      : { status: credits.length > 0 ? "IMEI_MISMATCH" : "NOT_FOUND" };
  }

  if (credits.length === 0) {
    return { status: "NOT_FOUND" };
  }

  if (credits.length > 1) {
    return { status: "AMBIGUOUS" };
  }

  return { status: "MATCHED", credit: credits[0] };
}
