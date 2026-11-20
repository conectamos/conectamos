import { effectiveLoanAge } from "@/lib/payjoy-40-60-age";

export type FortySixtyNumericFilter = {
  min: string;
  max: string;
  missing: "all" | "known" | "missing";
};
export type NumericFilter = FortySixtyNumericFilter;
export type FortySixtyFilters = {
  week: string;
  merchantName: string;
  deviceTag: string;
  cedula: string;
  loanAgeDays: FortySixtyNumericFilter;
  numberOfPayments: FortySixtyNumericFilter;
  loanRepaymentBiweek: FortySixtyNumericFilter;
};
export type FortySixtyFilterColumn = keyof FortySixtyFilters;
type FilterRow = {
  week: string;
  merchantName: string;
  deviceTag: string;
  cedula: string;
  loanAgeDays: number | null;
  numberOfPayments: number | null;
  loanRepaymentBiweek: number | null;
  status: string;
};
type NumericOptions = { integer: boolean; label: string };

export function createFortySixtyFilters(): FortySixtyFilters {
  const numeric = (): FortySixtyNumericFilter => ({ min: "", max: "", missing: "all" });
  return { week: "", merchantName: "", deviceTag: "", cedula: "",
    loanAgeDays: numeric(), numberOfPayments: numeric(), loanRepaymentBiweek: numeric() };
}

function numericBound(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return Number.NaN;
  const number = Number(text);
  return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER ? number : Number.NaN;
}

export function validateFortySixtyNumericFilter(filter: FortySixtyNumericFilter, { integer, label }: NumericOptions): string {
  if (!filter || typeof filter !== "object" || typeof filter.min !== "string" || typeof filter.max !== "string"
    || !["all", "known", "missing"].includes(filter.missing)) return `${label}: el filtro no es válido.`;
  const min = numericBound(filter.min);
  const max = numericBound(filter.max);
  for (const value of [min, max]) {
    if (value !== null && (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value)))) {
      return `${label}: usa ${integer ? "números enteros" : "números"} mayores o iguales a cero${integer ? "." : ", con punto para los decimales."}`;
    }
  }
  if (filter.missing === "missing" && (min !== null || max !== null)) return `${label}: quita el rango para mostrar solo los registros sin dato.`;
  if (min !== null && max !== null && max < min) return `${label}: el máximo debe ser mayor o igual al mínimo.`;
  return "";
}

const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-CO");
const normalizeTag = (value: string) => value.trim().toLocaleLowerCase("es-CO");
const digits = (value: string) => value.replace(/\D/g, "");

export function isFortySixtyColumnFiltered(filters: FortySixtyFilters, key: FortySixtyFilterColumn): boolean {
  const value = filters[key];
  if (typeof value === "string") return key === "cedula" ? digits(value).length > 0 : value.trim().length > 0;
  return value.missing !== "all" || value.min.trim() !== "" || value.max.trim() !== "";
}

function numericMatcher(filter: FortySixtyNumericFilter) {
  const min = numericBound(filter.min);
  const max = numericBound(filter.max);
  return (value: number | null) => {
    const known = typeof value === "number" && Number.isFinite(value);
    if (filter.missing === "missing") return !known;
    if (!known) return filter.missing === "all" && min === null && max === null;
    return (min === null || value >= min) && (max === null || value <= max);
  };
}

/** Filter the complete working set. Pagination and the existing status filter
 * remain outside; neither filtering nor deriving today's age changes saved rows. */
export function filterFortySixtyRows<T extends FilterRow>(rows: T[], filters: FortySixtyFilters,
  ageReferenceDate: string | null, today: string): T[] {
  if (validateFortySixtyNumericFilter(filters.loanAgeDays, { integer: true, label: "Edad del crédito" })
    || validateFortySixtyNumericFilter(filters.numberOfPayments, { integer: true, label: "Pagos" })
    || validateFortySixtyNumericFilter(filters.loanRepaymentBiweek, { integer: false, label: "Cuota quincenal" })) return [];
  const merchant = normalizeText(filters.merchantName);
  const tag = normalizeTag(filters.deviceTag);
  const cedula = digits(filters.cedula);
  const ageMatches = numericMatcher(filters.loanAgeDays);
  const paymentsMatch = numericMatcher(filters.numberOfPayments);
  const repaymentMatches = numericMatcher(filters.loanRepaymentBiweek);
  return rows.filter(row => (!filters.week || row.week === filters.week)
    && (!merchant || normalizeText(row.merchantName).includes(merchant))
    && (!tag || normalizeTag(row.deviceTag).includes(tag))
    && (!cedula || digits(row.cedula).includes(cedula))
    && ageMatches(effectiveLoanAge(row.loanAgeDays, ageReferenceDate, today))
    && paymentsMatch(row.numberOfPayments)
    && repaymentMatches(row.loanRepaymentBiweek));
}
