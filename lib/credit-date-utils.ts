const COLOMBIA_TIME_ZONE = "America/Bogota";

export function getDateKeyInColombia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isTodayOrYesterdayDateKey(
  dateKey: string | null | undefined,
  todayKey = getDateKeyInColombia()
) {
  if (!dateKey) {
    return false;
  }

  return dateKey === todayKey || dateKey === shiftDateKey(todayKey, -1);
}

function formatDateParts(year: number, month: number, day: number) {
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

function excelSerialDateToKey(value: number) {
  if (!Number.isFinite(value) || value < 20_000 || value > 80_000) {
    return null;
  }

  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + Math.floor(value) * 86_400_000);

  return formatDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

export function normalizeDateKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : getDateKeyInColombia(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000) {
      const date = new Date(value > 9_999_999_999 ? value : value * 1000);

      return Number.isNaN(date.getTime()) ? null : getDateKeyInColombia(date);
    }

    return excelSerialDateToKey(value) || normalizeDateKey(String(Math.round(value)));
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return formatDateParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return formatDateParts(
      Number(compactMatch[1]),
      Number(compactMatch[2]),
      Number(compactMatch[3])
    );
  }

  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (localMatch) {
    return formatDateParts(
      Number(localMatch[3]),
      Number(localMatch[2]),
      Number(localMatch[1])
    );
  }

  const arrayStringMatch = text.match(/^(\d{4}),(\d{1,2}),(\d{1,2})$/);
  if (arrayStringMatch) {
    return formatDateParts(
      Number(arrayStringMatch[1]),
      Number(arrayStringMatch[2]),
      Number(arrayStringMatch[3])
    );
  }

  return null;
}

export function dateKeyFromUnixTimestamp(value: unknown) {
  const numeric =
    typeof value === "number" ? value : Number(String(value || "").trim());

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const date = new Date(numeric > 9_999_999_999 ? numeric : numeric * 1000);

  return Number.isNaN(date.getTime()) ? null : getDateKeyInColombia(date);
}

export function getYesterdayStartUnixInColombia(todayKey = getDateKeyInColombia()) {
  const yesterdayKey = shiftDateKey(todayKey, -1);

  return Math.floor(Date.parse(`${yesterdayKey}T05:00:00.000Z`) / 1000);
}
