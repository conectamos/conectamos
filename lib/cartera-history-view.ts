import { getDateKeyInColombia, normalizeDateKey } from "./credit-date-utils";

export type CarteraHistoryItem = {
  id: number;
  valor: number;
  observacion: string | null;
  sedeId: number;
  createdAt: string;
  sede?: { nombre: string };
};

export type CarteraHistoryFilters = {
  search: string;
  sedeId: string;
  from: string;
  to: string;
};

export function formatCarteraMoney(value: number) {
  const amount = Number(value || 0);
  const formatted = Math.abs(amount).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "-" : ""}$ ${formatted}`;
}

export function carteraColombiaDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { key: "", date: "Sin fecha", time: "" };
  return {
    key: getDateKeyInColombia(date),
    date: new Intl.DateTimeFormat("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota",
    }).format(date),
    time: new Intl.DateTimeFormat("es-CO", {
      hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota",
    }).format(date),
  };
}

function normalizeSearch(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

export function carteraDateRangeError(from: string, to: string) {
  if ((from && normalizeDateKey(from) !== from) || (to && normalizeDateKey(to) !== to)) {
    return "Selecciona fechas válidas.";
  }
  return from && to && from > to ? "La fecha inicial no puede ser posterior a la final." : "";
}

export function filterCarteraHistory(items: CarteraHistoryItem[], filters: CarteraHistoryFilters) {
  if (carteraDateRangeError(filters.from, filters.to)) return [];
  const term = normalizeSearch(filters.search);
  return items.filter((item) => {
    if (filters.sedeId && String(item.sedeId) !== filters.sedeId) return false;
    const date = carteraColombiaDate(item.createdAt);
    if (filters.from && (!date.key || date.key < filters.from)) return false;
    if (filters.to && (!date.key || date.key > filters.to)) return false;
    if (!term) return true;
    const searchable = [item.id, `#${item.id}`, item.observacion, item.sede?.nombre,
      String(item.valor), formatCarteraMoney(item.valor), date.date, date.time];
    return searchable.some((value) => normalizeSearch(value).includes(term))
      || normalizeSearch(formatCarteraMoney(item.valor)).replace(/\s/g, "").includes(term.replace(/\s/g, ""));
  });
}

// Preserve the existing indicator scope and formulas: the complete consulted
// coverage, independently of search/date filters and the current list page.
export function carteraHistorySummary(items: CarteraHistoryItem[]) {
  const total = items.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  return { total, count: items.length, average: items.length ? total / items.length : 0 };
}

export function paginateCarteraHistory(items: CarteraHistoryItem[], requestedPage: number, requestedSize = 10) {
  const size = Math.min(10, Math.max(1, Math.floor(requestedSize) || 10));
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
  const offset = (page - 1) * size;
  return { page, pages, size, total: items.length, from: items.length ? offset + 1 : 0,
    to: Math.min(offset + size, items.length), items: items.slice(offset, offset + size) };
}

export function carteraHistoryPageNumbers(page: number, pages: number): (number | "…")[] {
  const chosen = new Set([1, pages, page - 1, page, page + 1, ...(page <= 2 ? [2, 3] : [])]);
  const numbers = [...chosen].filter((number) => number > 0 && number <= pages).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  numbers.forEach((number, index) => {
    if (index && number - numbers[index - 1] > 1) result.push("…");
    result.push(number);
  });
  return result;
}

export function carteraHistoryExportRows(items: CarteraHistoryItem[]) {
  return items.map((item) => {
    const date = carteraColombiaDate(item.createdAt);
    return { ID: item.id, Fecha: date.date, "Hora (Colombia)": date.time,
      "Valor (COP)": Number(item.valor), Observación: item.observacion ?? "",
      Sede: item.sede?.nombre ?? `Sede ${item.sedeId}`, "Fecha de registro (UTC)": item.createdAt };
  });
}
