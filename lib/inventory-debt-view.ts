export type InventoryDebtSourceItem = {
  id: number;
  costo: number;
  estadoFinanciero: string | null;
  deboA?: string | null;
  acreedorId?: number | null;
  acreedorNombre?: string | null;
  deudaPendiente?: number;
};

export function deudaPendienteInventario(item: InventoryDebtSourceItem) {
  if (String(item.estadoFinanciero || "").trim().toUpperCase() !== "DEUDA") return 0;
  return Number.isFinite(item.deudaPendiente) ? Number(item.deudaPendiente) : Number(item.costo || 0);
}

export function identidadAcreedor(item: InventoryDebtSourceItem) {
  const name = item.acreedorNombre ?? item.deboA;
  if (item.acreedorId != null) return { key: `id:${item.acreedorId}`, id: item.acreedorId, name: name || "Sin acreedor" };
  if (!name?.trim()) return { key: "sin-acreedor", id: null, name: "Sin acreedor" };
  // Compatibilidad con respuestas anteriores: conservar el texto histórico exacto.
  return { key: `legacy:${JSON.stringify(name)}`, id: null, name };
}

export function agruparDeudasPorAcreedor(items: InventoryDebtSourceItem[]) {
  const creditors = new Map<string, ReturnType<typeof identidadAcreedor> & { count: number; total: number }>();
  for (const item of items) {
    if (String(item.estadoFinanciero || "").trim().toUpperCase() !== "DEUDA") continue;
    const identity = identidadAcreedor(item);
    const creditor = creditors.get(identity.key) ?? { ...identity, count: 0, total: 0 };
    creditor.count += 1;
    creditor.total += deudaPendienteInventario(item);
    creditors.set(identity.key, creditor);
  }
  return [...creditors.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
