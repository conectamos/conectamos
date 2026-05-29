export const TIPOS_PRODUCTO = ["TELEFONIA", "ELECTRODOMESTICO"] as const;

export type TipoProducto = (typeof TIPOS_PRODUCTO)[number];

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function normalizarTipoProducto(
  value: unknown,
  fallback: TipoProducto = "TELEFONIA"
): TipoProducto {
  const tipo = normalizeText(value).replace(/\s+/g, "_");

  if (
    tipo === "ELECTRODOMESTICO" ||
    tipo === "ELECTRO" ||
    tipo === "ELECTRODOMESTICOS"
  ) {
    return "ELECTRODOMESTICO";
  }

  if (tipo === "TELEFONIA" || tipo === "TELEFONO" || tipo === "CELULAR") {
    return "TELEFONIA";
  }

  return fallback;
}

export function esElectrodomestico(value: unknown) {
  return normalizarTipoProducto(value) === "ELECTRODOMESTICO";
}
