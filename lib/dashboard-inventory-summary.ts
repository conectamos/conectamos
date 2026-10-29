import prisma from "@/lib/prisma";
import { esSedeRetiradaParaSupervisor } from "@/lib/sedes";
import { MARCAS_VENDIDAS, resolveCommercialProductBrand } from "@/lib/commercial-product-brand";

export type InventoryBrandReferenceSummary = {
  referencia: string;
  total: number;
  bodegaPrincipal: number;
  sedes: number;
  sedesDetalle: Array<{
    sede: string;
    total: number;
  }>;
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

const MARCAS_RADAR = MARCAS_VENDIDAS;

function normalizeReference(value: string | null | undefined) {
  return String(value || "SIN REFERENCIA")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function ensureReference(
  map: Map<string, InventoryBrandReferenceSummary>,
  rawReference: string | null | undefined,
  tipoProducto?: string | null
) {
  const referencia = normalizeReference(rawReference);
  // Use the sales Top rules, while counting each available unit only once.
  const marca = resolveCommercialProductBrand(referencia, tipoProducto);
  const key = `${marca}\u0000${referencia}`;
  const existing = map.get(key);

  if (existing) {
    return existing;
  }

  const next: InventoryBrandReferenceSummary = {
    referencia,
    total: 0,
    bodegaPrincipal: 0,
    sedes: 0,
    sedesDetalle: [],
  };

  map.set(key, next);
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

export async function getAdminInventorySummary(options?: {
  ocultarPuntosRetiradosSupervisor?: boolean;
}): Promise<InventoryAdminSummary> {
  const [principalRows, sedeRows] = await Promise.all([
    prisma.inventarioPrincipal.findMany({
      where: {
        estado: "BODEGA",
      },
      select: {
        referencia: true,
        tipoProducto: true,
      },
    }),
    prisma.inventarioSede.findMany({
      where: {
        estadoActual: "BODEGA",
      },
      select: {
        referencia: true,
        tipoProducto: true,
        sede: {
          select: {
            nombre: true,
          },
        },
      },
    }),
  ]);
  const sedeRowsVisibles = options?.ocultarPuntosRetiradosSupervisor
    ? sedeRows.filter((item) => !esSedeRetiradaParaSupervisor(item.sede?.nombre))
    : sedeRows;

  const referencias = new Map<string, InventoryBrandReferenceSummary>();

  for (const item of principalRows) {
    const ref = ensureReference(referencias, item.referencia, item.tipoProducto);
    ref.total += 1;
    ref.bodegaPrincipal += 1;
  }

  for (const item of sedeRowsVisibles) {
    const ref = ensureReference(referencias, item.referencia, item.tipoProducto);
    const sedeNombre = String(item.sede?.nombre || "Sede sin nombre").trim();
    ref.total += 1;
    ref.sedes += 1;
    const sedeExistente = ref.sedesDetalle.find((detalle) => detalle.sede === sedeNombre);

    if (sedeExistente) {
      sedeExistente.total += 1;
    } else {
      ref.sedesDetalle.push({
        sede: sedeNombre,
        total: 1,
      });
    }
  }

  const brandMap = new Map<string, InventoryBrandSummary>();

  for (const marca of MARCAS_RADAR) {
    brandMap.set(marca, {
      marca,
      total: 0,
      referencias: [],
    });
  }

  for (const [key, referencia] of referencias) {
    const marca = key.slice(0, key.indexOf("\u0000"));
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
      referencias: sortReferences(marca.referencias).map((referencia) => ({
        ...referencia,
        sedesDetalle: [...referencia.sedesDetalle].sort((a, b) => {
          if (b.total !== a.total) {
            return b.total - a.total;
          }

          return a.sede.localeCompare(b.sede, "es");
        }),
      })),
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
    totalBodega: principalRows.length + sedeRowsVisibles.length,
    totalBodegaPrincipal: principalRows.length,
    totalSedes: sedeRowsVisibles.length,
    referenciasEnBodega: new Set(Array.from(referencias.values(), item => item.referencia)).size,
    marcas,
  };
}
