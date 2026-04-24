export const PLATAFORMAS_CREDITO = [
  "ADDI",
  "CELYA",
  "KAIOWA",
  "SISTECREDITO",
  "SUMAS+",
  "ESMIO",
  "PAYJOY",
  "ALCANOS",
  "BANCO BOGOTA",
  "ALO CREDIT",
  "GORA",
] as const;

export const TIPOS_DOCUMENTO_CLIENTE = ["CC", "PPT"] as const;
export const FRECUENCIAS_CUOTA = ["SEMANAL", "CATORCENAL", "MENSUAL"] as const;
export const MEDIOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"] as const;

export function normalizarTextoCorto(valor: unknown) {
  const texto = String(valor || "").replace(/\s+/g, " ").trim();
  return texto || null;
}

export function normalizarTextoLargo(valor: unknown) {
  const texto = String(valor || "").replace(/\s+/g, " ").trim();
  return texto || null;
}

export function normalizarPlataformaCredito(valor: unknown) {
  const plataforma = String(valor || "").trim().toUpperCase();

  return PLATAFORMAS_CREDITO.includes(
    plataforma as (typeof PLATAFORMAS_CREDITO)[number]
  )
    ? plataforma
    : null;
}

export function normalizarTipoDocumentoCliente(valor: unknown) {
  const tipo = String(valor || "").trim().toUpperCase();

  return TIPOS_DOCUMENTO_CLIENTE.includes(
    tipo as (typeof TIPOS_DOCUMENTO_CLIENTE)[number]
  )
    ? tipo
    : null;
}

export function normalizarFrecuenciaCuota(valor: unknown) {
  const frecuencia = String(valor || "").trim().toUpperCase();

  return FRECUENCIAS_CUOTA.includes(
    frecuencia as (typeof FRECUENCIAS_CUOTA)[number]
  )
    ? frecuencia
    : null;
}

export function normalizarMedioPago(valor: unknown) {
  const tipo = String(valor || "").trim().toUpperCase();

  return MEDIOS_PAGO.includes(tipo as (typeof MEDIOS_PAGO)[number]) ? tipo : null;
}

export function normalizarNumeroEntero(valor: unknown) {
  const limpio = String(valor || "").replace(/[^\d]/g, "").trim();

  if (!limpio) {
    return null;
  }

  const numero = Number(limpio);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export function normalizarMoneda(valor: unknown) {
  const limpio = String(valor || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=.*\.)/g, "")
    .replace(",", ".")
    .trim();

  if (!limpio) {
    return null;
  }

  const numero = Number(limpio);

  if (!Number.isFinite(numero)) {
    return null;
  }

  return numero.toFixed(2);
}

export function normalizarFechaIso(valor: unknown) {
  const texto = String(valor || "").trim();

  if (!texto) {
    return null;
  }

  const fecha = new Date(`${texto}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
