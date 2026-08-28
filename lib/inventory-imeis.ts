const IMEI_BULK_SEPARATOR_PATTERN = /[\s,;|]+/g;

export function normalizarSeparadoresImeisMasivos(value: string) {
  return String(value || "").replace(IMEI_BULK_SEPARATOR_PATTERN, "\n");
}

export function extraerImeisMasivos(value: string) {
  return normalizarSeparadoresImeisMasivos(value)
    .split("\n")
    .map((item) => item.replace(/\D/g, "").trim())
    .filter(Boolean);
}
