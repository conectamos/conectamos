export type ReferenceRankingItem = {
  nombre: string;
  total: number;
  porcentaje: number;
};

export type RankedReferenceMatch = {
  item: ReferenceRankingItem;
  puesto: number;
};

export function normalizarBusquedaReferencias(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function getReferenceRanking({
  topItems,
  allItems,
  query,
  showAll,
}: {
  topItems: ReferenceRankingItem[];
  allItems: ReferenceRankingItem[];
  query: string;
  showAll: boolean;
}): RankedReferenceMatch[] {
  const rankedItems = allItems.map((item, index) => ({ item, puesto: index + 1 }));
  const termino = normalizarBusquedaReferencias(query);

  if (termino) {
    return rankedItems.filter(({ item }) =>
      normalizarBusquedaReferencias(item.nombre).includes(termino)
    );
  }

  if (showAll) return rankedItems;

  const posiciones = new Map(allItems.map((item, index) => [item.nombre, index + 1]));
  return topItems.map((item, index) => ({
    item,
    puesto: posiciones.get(item.nombre) ?? index + 1,
  }));
}
