import type {
  InventoryAdminSummary,
  InventoryBrandReferenceSummary,
  InventoryBrandSummary,
} from "./dashboard-inventory-summary";

export type RadarLocationFilter = "TODAS" | "PRINCIPAL" | "SEDES";

export type RadarQuery = {
  search: string;
  location: RadarLocationFilter;
  brand: string;
};

export type RadarReference = InventoryBrandReferenceSummary & { marca: string };

const BRAND_TAB_ORDER = ["APPLE", "HONOR", "SAMSUNG", "MOTOROLA", "XIAOMI", "INFINIX"];
const PAGE_SIZE = 10;

function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function buildRadarView(
  summary: InventoryAdminSummary,
  query: RadarQuery,
  requestedPage = 1
) {
  const search = normalizeSearch(query.search);
  const selectedBrand = normalizeSearch(query.brand) || "TODAS";
  const brandIndexes = new Map(summary.marcas.map((brand, index) => [brand.marca, index]));
  const brands: InventoryBrandSummary[] = summary.marcas
    .map((brand) => {
      const referencias = brand.referencias
        .map((reference) => {
          if (query.location === "PRINCIPAL") {
            return {
              ...reference,
              total: reference.bodegaPrincipal,
              sedes: 0,
              sedesDetalle: [],
            };
          }

          if (query.location === "SEDES") {
            return {
              ...reference,
              total: reference.sedes,
              bodegaPrincipal: 0,
            };
          }

          return reference;
        })
        .filter(
          (reference) =>
            reference.total > 0 &&
            (!search || normalizeSearch(`${brand.marca} ${reference.referencia}`).includes(search))
        );

      return {
        ...brand,
        total: referencias.reduce((sum, reference) => sum + reference.total, 0),
        referencias,
      };
    })
    .sort((first, second) => {
      const firstPreferredIndex = BRAND_TAB_ORDER.indexOf(first.marca);
      const secondPreferredIndex = BRAND_TAB_ORDER.indexOf(second.marca);
      const firstIndex = firstPreferredIndex < 0
        ? BRAND_TAB_ORDER.length + (brandIndexes.get(first.marca) ?? 0)
        : firstPreferredIndex;
      const secondIndex = secondPreferredIndex < 0
        ? BRAND_TAB_ORDER.length + (brandIndexes.get(second.marca) ?? 0)
        : secondPreferredIndex;

      return firstIndex - secondIndex;
    });

  const references: RadarReference[] = brands
    .filter((brand) => selectedBrand === "TODAS" || normalizeSearch(brand.marca) === selectedBrand)
    .flatMap((brand) => brand.referencias.map((reference) => ({ ...reference, marca: brand.marca })))
    .sort((first, second) => second.total - first.total || first.referencia.localeCompare(second.referencia, "es"));
  const metrics = {
    totalBodega: 0,
    totalBodegaPrincipal: 0,
    totalSedes: 0,
    referenciasEnBodega: references.length,
  };

  for (const reference of references) {
    metrics.totalBodega += reference.total;
    metrics.totalBodegaPrincipal += reference.bodegaPrincipal;
    metrics.totalSedes += reference.sedes;
  }

  const pageCount = Math.max(1, Math.ceil(references.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));

  return {
    brands,
    references,
    metrics,
    totalUnits: brands.reduce((sum, brand) => sum + brand.total, 0),
    page,
    pageCount,
    pageRows: references.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    totalReferences: references.length,
  };
}
