import prisma from "@/lib/prisma";
import {
  asegurarTablaCatalogoReferenciasInventario,
  claveReferenciaInventario,
} from "@/lib/inventory-references";

export type CatalogoEquipoRegistro = {
  referencia: string;
  imagenUrl: string | null;
  sistemaOperativo: string | null;
};

/** Adds optional catalog presentation data to records that have already passed access checks. */
export async function enriquecerRegistrosConCatalogo<
  T extends { referenciaEquipo?: unknown },
>(registros: readonly T[]): Promise<Array<T & { catalogoEquipo: CatalogoEquipoRegistro | null }>> {
  const sinCatalogo = () => registros.map((registro) => ({ ...registro, catalogoEquipo: null }));
  const referencias = [...new Set(registros.map((registro) =>
    claveReferenciaInventario(registro.referenciaEquipo)
  ).filter(Boolean))];

  if (referencias.length === 0) return sinCatalogo();

  try {
    await asegurarTablaCatalogoReferenciasInventario();

    const catalogo = await prisma.catalogoReferenciaInventario.findMany({
      where: {
        nombreNormalizado: { in: referencias },
        eliminado: false,
      },
      select: {
        nombre: true,
        nombreNormalizado: true,
        imagenUrl: true,
        sistemaOperativo: true,
      },
    });
    const porReferencia = new Map(catalogo.map((item) => [item.nombreNormalizado, item]));

    return registros.map((registro) => {
      const item = porReferencia.get(claveReferenciaInventario(registro.referenciaEquipo));

      return {
        ...registro,
        catalogoEquipo: item ? {
          referencia: item.nombre,
          imagenUrl: item.imagenUrl,
          sistemaOperativo: item.sistemaOperativo,
        } : null,
      };
    });
  } catch {
    // Catalog media is optional: its availability must not prevent a record lookup.
    return sinCatalogo();
  }
}
