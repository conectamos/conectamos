const SERVICIOS_CONTADO_REGISTRO = new Set([
  "CONTADO",
  "CONTADO CLARO",
  "CONTADO LIBRES",
]);

export function esServicioContadoRegistro(value: unknown) {
  return SERVICIOS_CONTADO_REGISTRO.has(
    String(value || "").trim().toUpperCase()
  );
}
