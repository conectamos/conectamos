export const NOMBRE_SEDE_VENTAS = "VENTAS";

function normalizarNombreSede(valor: string | null | undefined) {
  return String(valor || "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function esSedeVentas(nombre: string | null | undefined) {
  return normalizarNombreSede(nombre) === NOMBRE_SEDE_VENTAS;
}

export function esSedeOperativaInventario(nombre: string | null | undefined) {
  return !esSedeVentas(nombre);
}

export function esSedeRetiradaParaSupervisor(nombre: string | null | undefined) {
  const sede = normalizarNombreSede(nombre);

  return sede === "TROPAS" || sede === "SEDE 4" || sede.includes("STAND");
}
