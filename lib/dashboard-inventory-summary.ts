import prisma from "@/lib/prisma";

export type InventoryBrandReferenceSummary = {
  referencia: string;
  total: number;
  bodegaPrincipal: number;
  sedes: number;
};

export type InventoryBrandSummary = {
  marca: string;
  total: number;
  referencias: InventoryBrandReferenceSummary[];
};

export type InventoryAdminSummary = {
  totalBodega: number;
  totalBodegaPrincipal: number;
  totalSedes: number;
  referenciasEnBodega: number;
  marcas: InventoryBrandSummary[];
};

const MARCAS_RADAR = [
  "HONOR",
  "SAMSUNG",
  "INFINIX",
  "MOTOROLA",
  "TECNO",
  "XIAOMI",
  "ZTE",
];

function normalizeReference(value: string | null | undefined) {
  return String(value || "SIN REFERENCIA")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeState(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function resolveBrand(reference: string) {
  const words = reference.split(/[^A-Z0-9]+/).filter(Boolean);
  const brand = MARCAS_RADAR.find((item) => words.includes(item));

  return brand || "OTRAS REFERENCIAS";
}

function ensureReference(
  map: Map<string, InventoryBrandReferenceSummary>,
  rawReference: string | null | undefined
) {
  const referencia = normalizeReference(rawReference);
  const existing = map.get(referencia);

  if (existing) {
    return existing;
  }

  const next: InventoryBrandReferenceSummary = {
    referencia,
    total: 0,
    bodegaPrincipal: 0,
    sedes: 0,
  };

  map.set(referencia, next);
  return next;
}

function sortReferences(items: InventoryBrandReferenceSummary[]) {
  return [...items].sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }

    return a.referencia.localeCompare(b.referencia, "es");
  });
}

export async function getAdminInventorySummary(): Promise<InventoryAdminSummary> {
  const [principalRows, sedeRows] = await Promise.all([
    prisma.inventarioPrincipal.findMany({
      select: {
        referencia: true,
        estado: true,
      },
    }),
    prisma.inventarioSede.findMany({
      select: {
        referencia: true,
        estadoActual: true,
      },
    }),
  ]);

  const referencias = new Map<string, InventoryBrandReferenceSummary>();
  const principalBodega = principalRows.filter(
    (item) => normalizeState(item.estado || "BODEGA") === "BODEGA"
  );
  const sedesBodega = sedeRows.filter(
    (item) => normalizeState(item.estadoActual) === "BODEGA"
  );

  for (const item of principalBodega) {
    const ref = ensureReference(referencias, item.referencia);
    ref.total += 1;
    ref.bodegaPrincipal += 1;
  }

  for (const item of sedesBodega) {
    const ref = ensureReference(referencias, item.referencia);
    ref.total += 1;
    ref.sedes += 1;
  }

  const brandMap = new Map<string, InventoryBrandSummary>();

  for (const marca of MARCAS_RADAR) {
    brandMap.set(marca, {
      marca,
      total: 0,
      referencias: [],
    });
  }

  for (const referencia of referencias.values()) {
    const marca = resolveBrand(referencia.referencia);
    const group =
      brandMap.get(marca) ||
      ({
        marca,
        total: 0,
        referencias: [],
      } satisfies InventoryBrandSummary);

    group.total += referencia.total;
    group.referencias.push(referencia);
    brandMap.set(marca, group);
  }

  const marcas = Array.from(brandMap.values())
    .map((marca) => ({
      ...marca,
      referencias: sortReferences(marca.referencias),
    }))
    .filter((marca) => MARCAS_RADAR.includes(marca.marca) || marca.total > 0)
    .sort((a, b) => {
      const indexA = MARCAS_RADAR.includes(a.marca)
        ? MARCAS_RADAR.indexOf(a.marca)
        : MARCAS_RADAR.length;
      const indexB = MARCAS_RADAR.includes(b.marca)
        ? MARCAS_RADAR.indexOf(b.marca)
        : MARCAS_RADAR.length;

      if (indexA !== indexB) {
        return indexA - indexB;
      }

      return a.marca.localeCompare(b.marca, "es");
    });

  return {
    totalBodega: principalBodega.length + sedesBodega.length,
    totalBodegaPrincipal: principalBodega.length,
    totalSedes: sedesBodega.length,
    referenciasEnBodega: referencias.size,
    marcas,
  };
}
