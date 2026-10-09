const IMEI_BULK_SEPARATOR_PATTERN = /[\s,;|]+/g;

export function normalizarSeparadoresImeisMasivos(value: string) {
  return String(value || "").replace(IMEI_BULK_SEPARATOR_PATTERN, "\n");
}

export function extraerImeisMasivos(value: string) {
  return normalizarSeparadoresImeisMasivos(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type EstadoRevisionImei = "VALIDO" | "INCORRECTO" | "REPETIDO" | "EXISTENTE";
export type EntradaRevisionImei = {
  indice: number;
  imei: string;
  estado: EstadoRevisionImei;
  mensaje: string;
};

/** IMEIs are identifiers, never numbers: do not repair malformed identifiers. */
export function esImeiValido(value: unknown): value is string {
  return typeof value === "string" && /^\d{15}$/.test(value.trim());
}

export function revisarEntradasImeis(values: readonly unknown[], existentes: ReadonlySet<string> = new Set()) {
  const encontrados = new Set<string>();
  const entradas: EntradaRevisionImei[] = values.map((value, index) => {
    const imei = typeof value === "string" ? value.trim() : String(value ?? "");
    if (!esImeiValido(value)) {
      return { indice: index + 1, imei, estado: "INCORRECTO", mensaje: "Debe contener exactamente 15 dígitos de texto." };
    }
    if (encontrados.has(imei)) {
      return { indice: index + 1, imei, estado: "REPETIDO", mensaje: "Repetido dentro de esta carga." };
    }
    encontrados.add(imei);
    if (existentes.has(imei)) {
      return { indice: index + 1, imei, estado: "EXISTENTE", mensaje: "Ya existe en el inventario; utiliza el flujo de traslado o préstamo." };
    }
    return { indice: index + 1, imei, estado: "VALIDO", mensaje: "Disponible para registrar." };
  });
  const imeisValidos = entradas.filter((entry) => entry.estado === "VALIDO").map((entry) => entry.imei);
  return {
    entradas,
    imeisValidos,
    detectados: entradas.length,
    validos: imeisValidos.length,
    incorrectos: entradas.filter((entry) => entry.estado === "INCORRECTO").length,
    repetidos: entradas.filter((entry) => entry.estado === "REPETIDO").length,
    existentes: entradas.filter((entry) => entry.estado === "EXISTENTE").length,
  };
}
