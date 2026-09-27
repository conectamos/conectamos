export const DOMINIOS_CORREO_REGISTRO = [
  "outlook.com",
  "outlook.es",
  "gmail.com",
  "icloud.com",
  "hotmail.com",
  "hotmail.es",
  "mercacambios.com",
] as const;

export const DOMINIOS_CORREO_REGISTRO_TEXTO =
  "@outlook.com, @outlook.es, @gmail.com, @icloud.com, @hotmail.com, @hotmail.es o @mercacambios.com";

const CORREO_REGISTRO_REGEX = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/i;
const LETRA_ENE_REGEX = /ñ/i;

function limpiarCorreo(valor: unknown) {
  return String(valor || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizarCorreoRegistro(valor: unknown) {
  const correo = limpiarCorreo(valor);

  if (!correo || LETRA_ENE_REGEX.test(correo)) {
    return null;
  }

  const match = correo.match(CORREO_REGISTRO_REGEX);

  if (!match) {
    return null;
  }

  const dominio = match[1].toLowerCase();

  return DOMINIOS_CORREO_REGISTRO.includes(
    dominio as (typeof DOMINIOS_CORREO_REGISTRO)[number]
  )
    ? correo
    : null;
}

export function esCorreoRegistroValido(valor: unknown) {
  return normalizarCorreoRegistro(valor) !== null;
}

export function obtenerErrorCorreoRegistro(valor: unknown) {
  const correo = limpiarCorreo(valor);

  if (!correo || normalizarCorreoRegistro(correo)) {
    return null;
  }

  if (LETRA_ENE_REGEX.test(correo)) {
    return "El correo no puede contener la letra ñ";
  }

  return `Ingresa un correo valido terminado en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`;
}
