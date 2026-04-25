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

export const TIPOS_DOCUMENTO_CLIENTE = ["CC", "CE", "PPT"] as const;
export const FRECUENCIAS_CUOTA = ["SEMANAL", "CATORCENAL", "MENSUAL"] as const;
export const DOMINIOS_CORREO_REGISTRO = [
  "outlook.com",
  "outlook.es",
  "gmail.com",
  "icloud.com",
] as const;
export const DOMINIOS_CORREO_REGISTRO_TEXTO =
  "@outlook.com, @outlook.es, @gmail.com o @icloud.com";
export const MEDIOS_PAGO = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "VOUCHER",
  "TARJETA",
] as const;
export const MEDIOS_PAGO_REGISTRO_VENTA = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "VOUCHER",
] as const;
export const TIPOS_EQUIPO_REGISTRO = [
  "NUEVO",
  "CPO",
  "EXHIBICION",
] as const;

export const MAX_FINANCIERAS_REGISTRO = 4;
export const MIN_PLAZO_CUOTAS = 1;
export const MAX_PLAZO_CUOTAS = 48;
export const IMEI_LENGTH = 15;

export function financieraRequiereInicial(index: number) {
  return index < 2;
}

export const TEXTOS_VISIBLES_CLIENTE = [
  "He sido informado de que CONECTAMOS realiza el acompanamiento comercial del tramite y que la aprobacion del credito depende exclusivamente de la plataforma financiera seleccionada.",
  "Antes de la entrega del producto se me socializo la politica de garantias, cambios y devoluciones aplicable a esta compra.",
  "Acepto los valores, plazo, frecuencia de pago y condiciones del credito que aparecen en este registro digital.",
] as const;

export type DetalleFinancieraRegistro = {
  plataformaCredito: string;
  creditoAutorizado: string;
  cuotaInicial: string | null;
  tipoPagoInicial: string | null;
  valorCuota: string;
  numeroCuotas: number;
  frecuenciaCuota: string;
};

export type TipoEquipoRegistro =
  (typeof TIPOS_EQUIPO_REGISTRO)[number];

const CORREO_REGISTRO_REGEX = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/i;

function textoLimpio(valor: unknown) {
  return String(valor || "").replace(/\s+/g, " ").trim();
}

export function normalizarTextoCorto(valor: unknown) {
  return textoLimpio(valor) || null;
}

export function normalizarTextoLargo(valor: unknown) {
  return textoLimpio(valor) || null;
}

export function normalizarCorreoRegistro(valor: unknown) {
  const correo = textoLimpio(valor).toLowerCase();

  if (!correo) {
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

export function normalizarWhatsappRegistro(valor: unknown) {
  const whatsapp = String(valor || "").replace(/\D/g, "").slice(0, 10);
  return whatsapp.length === 10 ? whatsapp : null;
}

export function esWhatsappRegistroValido(valor: unknown) {
  return normalizarWhatsappRegistro(valor) !== null;
}

export function normalizarPlataformaCredito(valor: unknown) {
  const plataforma = textoLimpio(valor).toUpperCase();

  return PLATAFORMAS_CREDITO.includes(
    plataforma as (typeof PLATAFORMAS_CREDITO)[number]
  )
    ? plataforma
    : null;
}

export function normalizarTipoDocumentoCliente(valor: unknown) {
  const tipo = textoLimpio(valor).toUpperCase();

  return TIPOS_DOCUMENTO_CLIENTE.includes(
    tipo as (typeof TIPOS_DOCUMENTO_CLIENTE)[number]
  )
    ? tipo
    : null;
}

export function normalizarFrecuenciaCuota(valor: unknown) {
  const frecuencia = textoLimpio(valor).toUpperCase();

  return FRECUENCIAS_CUOTA.includes(
    frecuencia as (typeof FRECUENCIAS_CUOTA)[number]
  )
    ? frecuencia
    : null;
}

export function normalizarMedioPago(valor: unknown) {
  const tipo = textoLimpio(valor).toUpperCase();

  return MEDIOS_PAGO.includes(tipo as (typeof MEDIOS_PAGO)[number]) ? tipo : null;
}

export function normalizarTipoEquipoRegistro(valor: unknown) {
  const tipo = textoLimpio(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  return TIPOS_EQUIPO_REGISTRO.includes(tipo as TipoEquipoRegistro)
    ? (tipo as TipoEquipoRegistro)
    : null;
}

export function normalizarTipoPagoRegistroVenta(valor: unknown) {
  const tipo = textoLimpio(valor).toUpperCase();

  return MEDIOS_PAGO_REGISTRO_VENTA.includes(
    tipo as (typeof MEDIOS_PAGO_REGISTRO_VENTA)[number]
  )
    ? tipo
    : null;
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
  const limpio = String(valor || "").replace(/\D/g, "").trim();

  if (!limpio) {
    return null;
  }

  const numero = Number(limpio);

  if (!Number.isFinite(numero)) {
    return null;
  }

  return numero.toFixed(2);
}

export function formatearPesoInput(valor: unknown) {
  const digits = String(valor || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return `$ ${Number(digits).toLocaleString("es-CO")}`;
}

export function normalizarFechaIso(valor: unknown) {
  const texto = String(valor || "").trim();

  if (!texto) {
    return null;
  }

  const fecha = new Date(`${texto}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function normalizarImei(valor: unknown) {
  const imei = String(valor || "").replace(/\D/g, "").slice(0, IMEI_LENGTH);
  return imei.length === IMEI_LENGTH ? imei : null;
}

export function detalleFinancieraTieneDatos(valor: unknown) {
  if (!valor || typeof valor !== "object") {
    return false;
  }

  const row = valor as Record<string, unknown>;

  return [
    row.plataformaCredito,
    row.creditoAutorizado,
    row.cuotaInicial,
    row.tipoPagoInicial,
    row.valorCuota,
    row.numeroCuotas,
    row.frecuenciaCuota,
  ].some((item) => textoLimpio(item).length > 0);
}

export function normalizarFinancierasDetalle(valor: unknown):
  | { data: DetalleFinancieraRegistro[] }
  | { error: string } {
  if (!Array.isArray(valor)) {
    return { error: "Debes registrar al menos una financiera" };
  }

  if (valor.length > MAX_FINANCIERAS_REGISTRO) {
    return {
      error: `Solo puedes registrar hasta ${MAX_FINANCIERAS_REGISTRO} financieras`,
    };
  }

  const detalles: DetalleFinancieraRegistro[] = [];

  for (let index = 0; index < valor.length; index += 1) {
    const item = valor[index];

    if (!detalleFinancieraTieneDatos(item)) {
      continue;
    }

    if (!item || typeof item !== "object") {
      return {
        error: `La financiera ${index + 1} no tiene informacion valida`,
      };
    }

    const row = (item || {}) as Record<string, unknown>;
    const plataformaCredito = normalizarPlataformaCredito(row.plataformaCredito);
    const creditoAutorizado = normalizarMoneda(row.creditoAutorizado);
    const cuotaInicial = normalizarMoneda(row.cuotaInicial);
    const tipoPagoInicial = normalizarTipoPagoRegistroVenta(row.tipoPagoInicial);
    const valorCuota = normalizarMoneda(row.valorCuota);
    const numeroCuotas = normalizarNumeroEntero(row.numeroCuotas);
    const frecuenciaCuota = normalizarFrecuenciaCuota(row.frecuenciaCuota);

    if (!plataformaCredito) {
      return {
        error: `Selecciona una plataforma valida en la financiera ${index + 1}`,
      };
    }

    if (!creditoAutorizado) {
      return {
        error: `Debes registrar el credito autorizado de la financiera ${index + 1}`,
      };
    }

    const requiereInicial =
      financieraRequiereInicial(index) ||
      cuotaInicial !== null ||
      Boolean(tipoPagoInicial);

    if (requiereInicial && cuotaInicial === null) {
      return {
        error: `Debes registrar la inicial de la financiera ${index + 1}`,
      };
    }

    if (requiereInicial && !tipoPagoInicial) {
      return {
        error: `Selecciona el tipo de pago de la inicial en la financiera ${index + 1}`,
      };
    }

    if (!valorCuota) {
      return {
        error: `Debes registrar el valor de la cuota en la financiera ${index + 1}`,
      };
    }

    if (
      !numeroCuotas ||
      numeroCuotas < MIN_PLAZO_CUOTAS ||
      numeroCuotas > MAX_PLAZO_CUOTAS
    ) {
      return {
        error: `El plazo de la financiera ${index + 1} debe estar entre ${MIN_PLAZO_CUOTAS} y ${MAX_PLAZO_CUOTAS} cuotas`,
      };
    }

    if (!frecuenciaCuota) {
      return {
        error: `Selecciona la frecuencia de pago en la financiera ${index + 1}`,
      };
    }

    detalles.push({
      plataformaCredito,
      creditoAutorizado,
      cuotaInicial,
      tipoPagoInicial,
      valorCuota,
      numeroCuotas,
      frecuenciaCuota,
    });
  }

  return { data: detalles };
}
