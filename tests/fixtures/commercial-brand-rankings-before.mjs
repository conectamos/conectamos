// Brand/reference rules copied from dashboard-commercial-summary.ts at commit
// 5c534bd5a3ef8f246d10376395dd2a1d3eb8d29c, before adding the sede detail.
const MARCAS_VENDIDAS = ["INFINIX", "TECNO", "MOTOROLA", "SAMSUNG", "XIAOMI", "OPPO", "HONOR"];
const OTRAS_MARCAS = "OTRAS MARCAS";
function normalizeLabel(value) { return value.trim().replace(/\s+/g, " "); }
function normalizeKey(value) { return normalizeLabel(value).toUpperCase(); }
function normalizeReference(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}
function resolveBrand(value) {
  const reference = normalizeReference(value);
  if (!reference) return OTRAS_MARCAS;
  const words = reference.split(/[^A-Z0-9]+/).filter(Boolean);
  return MARCAS_VENDIDAS.find((marca) => words.includes(marca)) || OTRAS_MARCAS;
}
function pushRanking(map, rawName, amount = 0) {
  const nombre = normalizeLabel(rawName);
  if (!nombre) return;
  const key = normalizeKey(nombre);
  const current = map.get(key);
  if (current) { current.total += 1; current.monto += amount; return; }
  map.set(key, { nombre, total: 1, monto: amount });
}
function sortedRanking(map) {
  return Array.from(map.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.monto !== a.monto) return b.monto - a.monto;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}
function brandOrder(nombre) {
  const index = MARCAS_VENDIDAS.indexOf(nombre);
  return index >= 0 ? index : MARCAS_VENDIDAS.length;
}
function sortedBrandRanking(map) {
  const totalVentasMarca = Array.from(map.values()).reduce((acc, item) => acc + item.total, 0);
  if (totalVentasMarca === 0) return [];
  return Array.from(map.values()).filter((item) => item.total > 0).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const orderA = brandOrder(a.nombre);
    const orderB = brandOrder(b.nombre);
    if (orderA !== orderB) return orderA - orderB;
    return a.nombre.localeCompare(b.nombre, "es");
  }).map((item) => ({ ...item, porcentaje: (item.total / totalVentasMarca) * 100 }));
}
function sortedReferenceRanking(map) {
  const totalVentasReferencia = Array.from(map.values()).reduce((acc, item) => acc + item.total, 0);
  if (totalVentasReferencia === 0) return [];
  return sortedRanking(map).map((item) => ({ ...item, porcentaje: (item.total / totalVentasReferencia) * 100 }));
}

export function brandRankingsBefore(ventasDetalle) {
  const marcasVendidas = new Map();
  const referenciasVendidas = new Map();
  for (const venta of ventasDetalle) {
    const referencia = normalizeReference(venta.inventarioSede?.referencia || venta.descripcion) || "SIN REFERENCIA";
    const marca = resolveBrand(referencia);
    pushRanking(marcasVendidas, marca);
    pushRanking(referenciasVendidas, referencia);
  }
  const referenciasRanking = sortedReferenceRanking(referenciasVendidas);
  return {
    topMarcasVendidas: sortedBrandRanking(marcasVendidas),
    topReferenciasVendidas: referenciasRanking.slice(0, 10),
    referenciasVendidas: referenciasRanking,
  };
}
