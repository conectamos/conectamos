"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  detalleFinancieraTieneDatos,
  DOMINIOS_CORREO_REGISTRO_TEXTO,
  esCorreoRegistroValido,
  esWhatsappRegistroValido,
  financieraRequiereInicial,
  FRECUENCIAS_CUOTA,
  MAX_FINANCIERAS_REGISTRO,
  MAX_PLAZO_CUOTAS,
  MEDIOS_PAGO_REGISTRO_VENTA,
  TEXTOS_VISIBLES_CLIENTE,
  TIPOS_DOCUMENTO_CLIENTE,
  formatearPesoInput,
  validarDocumentoDiferenteDeContactos,
} from "@/lib/vendor-sale-records";
import { TIPOS_PRODUCTO } from "@/lib/product-types";
import type { RegistroVendedorDetalle } from "./types";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type RegistroResumen = {
  id: number;
  clienteNombre: string;
  puntoVenta: string | null;
  plataformaCredito: string;
  referenciaEquipo: string | null;
  serialImei: string | null;
  tipoProducto: string | null;
  creditoAutorizado: number | null;
  cuotaInicial: number | null;
  valorCuota: number | null;
  numeroCuotas: number | null;
  medioPago1Tipo: string | null;
  medioPago1Valor: number | null;
  medioPago2Tipo: string | null;
  medioPago2Valor: number | null;
  jaladorNombre: string | null;
  totalFinancieras: number;
  createdAt: string;
};

type JaladorOption = {
  id: number;
  nombre: string;
};

type FinancieraCatalogoOption = {
  id: number;
  nombre: string;
};

type SedeOption = {
  id: number;
  nombre: string;
};

type ListaNegraAlerta = {
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  updatedAt: string;
};

type RegistroDuplicadoAlerta = {
  id: number;
  clienteNombre: string;
  documentoNumero: string;
  serialImei: string | null;
  plataformaCredito: string;
  puntoVenta: string | null;
  estadoVentaRegistro: string;
  createdAt: string;
  perfilVendedorNombre: string | null;
  sedeNombre: string | null;
};

type CatalogoPersonalResponse = {
  jaladores: JaladorOption[];
  financieras: FinancieraCatalogoOption[];
};

type ConsentField =
  | "aceptaDeclaracionIntermediacion"
  | "aceptaPoliticaGarantia"
  | "aceptaCondicionesCredito";

type FinancialFormState = {
  plataformaCredito: string;
  creditoAutorizado: string;
  cuotaInicial: string;
  tipoPagoInicial: string;
  valorCuota: string;
  numeroCuotas: string;
  frecuenciaCuota: string;
};

type FormState = {
  servicio: string;
  ciudad: string;
  puntoVenta: string;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  aceptaDeclaracionIntermediacion: boolean;
  aceptaPoliticaGarantia: boolean;
  aceptaCondicionesCredito: boolean;
  observacion: string;
  referenciaEquipo: string;
  almacenamiento: string;
  color: string;
  serialImei: string;
  tipoEquipo: string;
  tipoProducto: string;
  correo: string;
  whatsapp: string;
  fechaNacimiento: string;
  fechaExpedicion: string;
  direccion: string;
  barrio: string;
  referenciaFamiliar1Nombre: string;
  referenciaFamiliar1Telefono: string;
  referenciaFamiliar2Nombre: string;
  referenciaFamiliar2Telefono: string;
  telefono: string;
  simCardRegistro1: string;
  simCardRegistro2: string;
  medioPago1Tipo: string;
  medioPago1Valor: string;
  medioPago2Tipo: string;
  medioPago2Valor: string;
  asesorNombre: string;
  jaladorNombre: string;
  firmaClienteDataUrl: string;
  fotoEntregaDataUrl: string;
  facturaFotoDataUrl: string;
  cedulaFrenteDataUrl: string;
  cedulaReversoDataUrl: string;
  clienteSinCedulaFisica: boolean;
  confirmacionCliente: boolean;
  financierasDetalle: FinancialFormState[];
};

type ImageFormField =
  | "fotoEntregaDataUrl"
  | "facturaFotoDataUrl"
  | "cedulaFrenteDataUrl"
  | "cedulaReversoDataUrl";

type ImeiLookupResponse = {
  equipo: {
    imei: string;
    referencia: string;
    color: string | null;
    tipoProducto: string;
    costo: number | null;
    origen: "SEDE" | "BODEGA_PRINCIPAL";
    sedeId: number | null;
    sedeNombre: string | null;
    estadoActual: string | null;
  };
};

type PayJoyCreditoResponse = {
  credito?: {
    imei: string;
    creditoAutorizado: number;
    moneda: string | null;
    ordenId: string | null;
    enganche: number | null;
    valorCuota: number | null;
    numeroCuotas: number | null;
    frecuenciaCuota: string | null;
    valorCompra: number | null;
    origen: string;
  };
  error?: string;
};

type AloCreditoResponse = {
  credito?: {
    imei: string;
    financiera: "ALO CREDIT";
    clienteNombre: string | null;
    documento: string | null;
    correoElectronico: string | null;
    telefonoCliente: string | null;
    creditoAutorizado: number;
    valorCuota: number | null;
    numeroCuotas: number | null;
    frecuenciaCuota: string | null;
    valorAccesorios: number | null;
    observacionAccesorios: string | null;
    moneda: string | null;
    origen: string;
  };
  error?: string;
};

type CreditoFinancieraCedula = {
  documento: string;
  financiera: "SUMASPAY" | "ADDI" | "ESMIOPCION";
  clienteNombre: string | null;
  correoElectronico: string | null;
  telefonoCliente: string | null;
  direccionCliente: string | null;
  fechaCreacionCredito: string | null;
  puntoCredito: string | null;
  creditoAutorizado: number;
  numeroCuotas: number | null;
  valorCuota: number | null;
  frecuenciaCuota: string | null;
  origen: string;
  estado?: string | null;
  ordenId?: string | null;
  encontradoEnSumasPay?: boolean;
  encontradoEnAddi?: boolean;
  encontradoEnEsmioOpcion?: boolean;
};

type CreditosFinancierasResponse = {
  creditos?: CreditoFinancieraCedula[];
  errores?: Array<{
    financiera: CreditoFinancieraCedula["financiera"];
    error: string;
  }>;
  error?: string;
};

const PUNTOS_VENTA_EXCLUIDOS = new Set(["VENTAS", "BODEGA PRINCIPAL"]);

const PLAZO_OPTIONS = Array.from({ length: MAX_PLAZO_CUOTAS }, (_, index) =>
  String(index + 1)
);
const TIPO_EQUIPO_OPTIONS = [
  { value: "NUEVO", label: "NUEVO" },
  { value: "CPO", label: "CPO" },
  { value: "EXHIBICION", label: "EXHIBICION" },
] as const;
const TIPO_PRODUCTO_OPTIONS = TIPOS_PRODUCTO.map((tipo) => ({
  value: tipo,
  label: tipo === "TELEFONIA" ? "TELEFONIA" : "ELECTRODOMESTICO",
}));
const TIPO_DOCUMENTO_CONTADO = "NIT";

const SERVICIO_REGISTRO_OPTIONS = [
  { value: "CONTADO", label: "CONTADO" },
  { value: "FINANCIERA", label: "FINANCIERA" },
] as const;

function createEmptyFinanciera(): FinancialFormState {
  return {
    plataformaCredito: "",
    creditoAutorizado: "",
    cuotaInicial: "",
    tipoPagoInicial: "",
    valorCuota: "",
    numeroCuotas: "",
    frecuenciaCuota: "",
  };
}

function createInitialState(session: SessionProps): FormState {
  return {
    servicio: "",
    ciudad: "",
    puntoVenta: PUNTOS_VENTA_EXCLUIDOS.has(
      String(session.sedeNombre || "").trim().toUpperCase()
    )
      ? ""
      : session.sedeNombre,
    clienteNombre: "",
    tipoDocumento: "CC",
    documentoNumero: "",
    aceptaDeclaracionIntermediacion: false,
    aceptaPoliticaGarantia: false,
    aceptaCondicionesCredito: false,
    observacion: "",
    referenciaEquipo: "",
    almacenamiento: "",
    color: "",
    serialImei: "",
    tipoEquipo: "",
    tipoProducto: "TELEFONIA",
    correo: "",
    whatsapp: "",
    fechaNacimiento: "",
    fechaExpedicion: "",
    direccion: "",
    barrio: "",
    referenciaFamiliar1Nombre: "",
    referenciaFamiliar1Telefono: "",
    referenciaFamiliar2Nombre: "",
    referenciaFamiliar2Telefono: "",
    telefono: "",
    simCardRegistro1: "",
    simCardRegistro2: "",
    medioPago1Tipo: "EFECTIVO",
    medioPago1Valor: "",
    medioPago2Tipo: "",
    medioPago2Valor: "",
    asesorNombre: session.perfilNombre,
    jaladorNombre: "",
    firmaClienteDataUrl: "",
    fotoEntregaDataUrl: "",
    facturaFotoDataUrl: "",
    cedulaFrenteDataUrl: "",
    cedulaReversoDataUrl: "",
    clienteSinCedulaFisica: false,
    confirmacionCliente: false,
    financierasDetalle: Array.from(
      { length: MAX_FINANCIERAS_REGISTRO },
      createEmptyFinanciera
    ),
  };
}

function inputClass(readOnly = false) {
  return `w-full rounded-[18px] border px-4 py-3 text-sm font-semibold outline-none transition ${
    readOnly
      ? "border-slate-200 bg-slate-100 text-slate-500"
      : "border-slate-300 bg-white text-slate-950 shadow-[0_1px_0_rgba(15,23,42,0.04)] focus:border-teal-500 focus:bg-white focus:ring-[3px] focus:ring-teal-100"
  }`;
}

function onlyDigits(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Sin valor";
  }

  return `$ ${Math.round(value).toLocaleString("es-CO")}`;
}

function moneyInputToNumber(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatMoneyInputFromStored(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    return formatearPesoInput(value);
  }

  const normalized = String(value).trim();

  if (/^\d+(\.\d{1,2})?$/.test(normalized)) {
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return formatearPesoInput(parsed);
    }
  }

  return formatearPesoInput(normalized);
}

function applyPayJoyCreditoToFinancialState(
  item: FinancialFormState,
  credito: NonNullable<PayJoyCreditoResponse["credito"]>
) {
  return {
    ...item,
    plataformaCredito: "PAYJOY",
    creditoAutorizado: formatearPesoInput(credito.creditoAutorizado),
    valorCuota:
      credito.valorCuota === null
        ? item.valorCuota
        : formatearPesoInput(credito.valorCuota),
    numeroCuotas:
      credito.numeroCuotas === null
        ? item.numeroCuotas
        : String(credito.numeroCuotas),
    frecuenciaCuota: credito.frecuenciaCuota ?? item.frecuenciaCuota,
  };
}

function applyAloCreditoToFinancialState(
  item: FinancialFormState,
  credito: NonNullable<AloCreditoResponse["credito"]>
) {
  return {
    ...item,
    plataformaCredito: "ALO CREDIT",
    creditoAutorizado: formatearPesoInput(credito.creditoAutorizado),
    valorCuota:
      credito.valorCuota === null
        ? item.valorCuota
        : formatearPesoInput(credito.valorCuota),
    numeroCuotas:
      credito.numeroCuotas === null
        ? item.numeroCuotas
        : String(credito.numeroCuotas),
    frecuenciaCuota: credito.frecuenciaCuota ?? item.frecuenciaCuota,
  };
}

function normalizePlatformKey(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

function esPlataformaSumasPay(value: unknown) {
  const key = normalizePlatformKey(value);
  return key === "SUMASPAY" || key === "SUMAS";
}

function esPlataformaAddi(value: unknown) {
  return normalizePlatformKey(value) === "ADDI";
}

function esPlataformaEsmioOpcion(value: unknown) {
  const key = normalizePlatformKey(value);
  return key === "ESMIO" || key === "ESMIOPCION";
}

function esPlataformaConsultaCedula(value: unknown) {
  return (
    esPlataformaSumasPay(value) ||
    esPlataformaAddi(value) ||
    esPlataformaEsmioOpcion(value)
  );
}

function creditoCoincideConPlataforma(
  credito: CreditoFinancieraCedula | null | undefined,
  plataformaCredito: unknown
) {
  if (!credito) {
    return false;
  }

  if (credito.financiera === "SUMASPAY") {
    return esPlataformaSumasPay(plataformaCredito);
  }

  if (credito.financiera === "ADDI") {
    return esPlataformaAddi(plataformaCredito);
  }

  if (credito.financiera === "ESMIOPCION") {
    return esPlataformaEsmioOpcion(plataformaCredito);
  }

  return false;
}

function resolvePlatformName(
  catalogo: FinancieraCatalogoOption[],
  financiera: CreditoFinancieraCedula["financiera"]
) {
  const matcher =
    financiera === "SUMASPAY"
      ? esPlataformaSumasPay
      : financiera === "ADDI"
        ? esPlataformaAddi
        : esPlataformaEsmioOpcion;
  const option = catalogo.find((item) => matcher(item.nombre));

  return option?.nombre ?? financiera;
}

function getPlataformaConsultaLabel(value: unknown) {
  if (esPlataformaSumasPay(value)) return "SUMASPAY";
  if (esPlataformaAddi(value)) return "ADDI";
  if (esPlataformaEsmioOpcion(value)) return "ESMIOPCION";
  return "la financiera";
}

function applyCreditoFinancieraCedulaToFinancialState(
  item: FinancialFormState,
  credito: CreditoFinancieraCedula,
  plataformaCredito: string
) {
  return {
    ...item,
    plataformaCredito,
    creditoAutorizado: formatearPesoInput(credito.creditoAutorizado),
    valorCuota:
      credito.valorCuota === null
        ? item.valorCuota
        : formatearPesoInput(credito.valorCuota),
    numeroCuotas:
      credito.numeroCuotas === null
        ? item.numeroCuotas
        : String(credito.numeroCuotas),
    frecuenciaCuota: credito.frecuenciaCuota ?? item.frecuenciaCuota,
  };
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function isTextFilled(value: string) {
  return value.trim().length > 0;
}

function mergeObservacionAccesorios(
  observacionActual: string,
  observacionAccesorios: string | null | undefined
) {
  const actual = observacionActual.trim();
  const accesorios = String(observacionAccesorios || "").trim();

  if (!accesorios) {
    return observacionActual;
  }

  if (actual.toUpperCase().includes(accesorios.toUpperCase())) {
    return observacionActual;
  }

  return actual ? `${actual} | ${accesorios}` : accesorios;
}

function esServicioContado(value: unknown) {
  const servicio = String(value || "").trim().toUpperCase();
  return (
    servicio === "CONTADO" ||
    servicio === "CONTADO CLARO" ||
    servicio === "CONTADO LIBRES"
  );
}

function esServicioFinanciera(value: unknown) {
  return String(value || "").trim().toUpperCase() === "FINANCIERA";
}

function esPlataformaPayJoy(value: unknown) {
  return String(value || "").trim().toUpperCase() === "PAYJOY";
}

function esPlataformaAloCredit(value: unknown) {
  const key = normalizePlatformKey(value);
  return key === "ALOCREDIT" || key === "ALOCREDITO";
}

function esPlataformaConsultaImei(value: unknown) {
  return esPlataformaPayJoy(value) || esPlataformaAloCredit(value);
}

function esRegistroConvertido(registro: RegistroVendedorDetalle | null) {
  return Boolean(
    registro?.ventaIdRelacionada ||
      String(registro?.estadoVentaRegistro || "").trim().toUpperCase() ===
        "CONVERTIDO_EN_VENTA"
  );
}

function totalIngresosContado(form: Pick<FormState, "medioPago1Valor" | "medioPago2Valor">) {
  return moneyInputToNumber(form.medioPago1Valor) + moneyInputToNumber(form.medioPago2Valor);
}

function totalIngresosInicialFinanciera(form: Pick<FormState, "medioPago1Valor" | "medioPago2Valor">) {
  return totalIngresosContado(form);
}

function debeMostrarSegundoIngreso(form: FormState) {
  const tieneSegundoIngreso = Boolean(form.medioPago2Tipo || form.medioPago2Valor);

  if (!tieneSegundoIngreso) {
    return false;
  }

  if (esServicioContado(form.servicio)) {
    return true;
  }

  const inicial = moneyInputToNumber(form.financierasDetalle[0]?.cuotaInicial ?? "");
  const ingresos = totalIngresosInicialFinanciera(form);

  return inicial > 0 && ingresos === inicial;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 10);
}

function isFinancieraCompleta(item: FinancialFormState, index: number) {
  const requiereInicial =
    financieraRequiereInicial(index) ||
    isTextFilled(item.cuotaInicial) ||
    isTextFilled(item.tipoPagoInicial);

  return (
    isTextFilled(item.plataformaCredito) &&
    isTextFilled(item.creditoAutorizado) &&
    (!requiereInicial ||
      (isTextFilled(item.cuotaInicial) && isTextFilled(item.tipoPagoInicial))) &&
    isTextFilled(item.valorCuota) &&
    isTextFilled(item.numeroCuotas) &&
    isTextFilled(item.frecuenciaCuota)
  );
}

function financieraMuestraInicial(index: number) {
  return index === 0 || index === 1;
}

function getDescripcionFinanciera(index: number) {
  if (index === 0) {
    return "Registra plataforma, valores, plazo y forma de pago de la inicial.";
  }

  if (index === 1) {
    return "Registra plataforma, crédito autorizado, valor cuota, plazo y frecuencia de pago. La inicial es opcional.";
  }

  return "Registra plataforma, credito autorizado, valor cuota, plazo y frecuencia de pago.";
}

function mapRegistroToForm(
  registro: RegistroVendedorDetalle,
  session: SessionProps
) {
  const nextForm = createInitialState(session);
  const servicio = esServicioContado(registro.plataformaCredito)
    ? "CONTADO"
    : "FINANCIERA";
  const detalleFinancieras =
    servicio === "FINANCIERA" &&
    Array.isArray(registro.financierasDetalle) &&
    registro.financierasDetalle.length > 0
      ? registro.financierasDetalle
      : servicio === "FINANCIERA"
        ? [
          {
            plataformaCredito: registro.plataformaCredito,
            creditoAutorizado: registro.creditoAutorizado,
            cuotaInicial: registro.cuotaInicial,
            tipoPagoInicial: registro.medioPago1Tipo,
            valorCuota: registro.valorCuota,
            numeroCuotas: registro.numeroCuotas,
            frecuenciaCuota: registro.frecuenciaCuota,
          },
        ]
        : [];

  const financierasDetalle = Array.from(
    { length: MAX_FINANCIERAS_REGISTRO },
    createEmptyFinanciera
  );

  detalleFinancieras.slice(0, MAX_FINANCIERAS_REGISTRO).forEach((item, index) => {
    financierasDetalle[index] = {
      plataformaCredito: String(item?.plataformaCredito || ""),
      creditoAutorizado: formatMoneyInputFromStored(item?.creditoAutorizado),
      cuotaInicial: formatMoneyInputFromStored(item?.cuotaInicial),
      tipoPagoInicial: String(item?.tipoPagoInicial || ""),
      valorCuota: formatMoneyInputFromStored(item?.valorCuota),
      numeroCuotas:
        item?.numeroCuotas === null || item?.numeroCuotas === undefined
          ? ""
          : String(item.numeroCuotas),
      frecuenciaCuota: String(item?.frecuenciaCuota || ""),
    };
  });

  return {
    form: {
      ...nextForm,
      servicio,
      ciudad: registro.ciudad ?? "",
      puntoVenta: registro.puntoVenta ?? nextForm.puntoVenta,
      clienteNombre: registro.clienteNombre,
      tipoDocumento: registro.tipoDocumento,
      documentoNumero: registro.documentoNumero,
      aceptaDeclaracionIntermediacion: registro.aceptaDeclaracionIntermediacion,
      aceptaPoliticaGarantia: registro.aceptaPoliticaGarantia,
      aceptaCondicionesCredito: registro.aceptaCondicionesCredito,
      observacion: registro.observacion ?? "",
      referenciaEquipo: registro.referenciaEquipo ?? "",
      almacenamiento: registro.almacenamiento ?? "",
      color: registro.color ?? "",
      serialImei: registro.serialImei ?? "",
      tipoEquipo: registro.tipoEquipo ?? "",
      tipoProducto: registro.tipoProducto ?? "TELEFONIA",
      correo: registro.correo ?? "",
      whatsapp: registro.whatsapp ?? "",
      fechaNacimiento: toDateInputValue(registro.fechaNacimiento),
      fechaExpedicion: toDateInputValue(registro.fechaExpedicion),
      direccion: registro.direccion ?? "",
      barrio: registro.barrio ?? "",
      referenciaFamiliar1Nombre: registro.referenciaFamiliar1Nombre ?? "",
      referenciaFamiliar1Telefono: registro.referenciaFamiliar1Telefono ?? "",
      referenciaFamiliar2Nombre: registro.referenciaFamiliar2Nombre ?? "",
      referenciaFamiliar2Telefono: registro.referenciaFamiliar2Telefono ?? "",
      telefono: registro.telefono ?? "",
      simCardRegistro1: registro.simCardRegistro1 ?? "",
      simCardRegistro2: registro.simCardRegistro2 ?? "",
      medioPago1Tipo: registro.medioPago1Tipo ?? "EFECTIVO",
      medioPago1Valor: formatMoneyInputFromStored(registro.medioPago1Valor),
      medioPago2Tipo: registro.medioPago2Tipo ?? "",
      medioPago2Valor: formatMoneyInputFromStored(registro.medioPago2Valor),
      asesorNombre: registro.asesorNombre ?? nextForm.asesorNombre,
      jaladorNombre: registro.jaladorNombre ?? "",
      firmaClienteDataUrl: registro.firmaClienteDataUrl ?? "",
      fotoEntregaDataUrl: registro.fotoEntregaDataUrl ?? "",
      facturaFotoDataUrl: registro.facturaFotoDataUrl ?? "",
      cedulaFrenteDataUrl: registro.cedulaFrenteDataUrl ?? "",
      cedulaReversoDataUrl: registro.cedulaReversoDataUrl ?? "",
      clienteSinCedulaFisica: registro.clienteSinCedulaFisica,
      confirmacionCliente: registro.confirmacionCliente,
      financierasDetalle,
    },
    financierasVisibles:
      servicio === "FINANCIERA"
        ? Math.max(
            1,
            Math.min(detalleFinancieras.length, MAX_FINANCIERAS_REGISTRO)
          )
        : 1,
  };
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo procesar la imagen"));
    image.src = src;
  });
}

async function compressImageToDataUrl(file: File) {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    return originalDataUrl;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);

  const prepareCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return null;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#0f172a";
    return context;
  };

  useEffect(() => {
    prepareCanvas();
  }, []);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const beginSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const point = getPoint(event);

    drawingRef.current = true;
    dirtyRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const point = getPoint(event);

    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}

    const canvas = canvasRef.current;

    if (dirtyRef.current && canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    dirtyRef.current = false;
    onChange("");
    prepareCanvas();
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">Firma del cliente</p>
        <button
          type="button"
          onClick={clearSignature}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          Limpiar
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={960}
          height={240}
          onPointerDown={beginSignature}
          onPointerMove={drawSignature}
          onPointerUp={endSignature}
          onPointerLeave={endSignature}
          className="h-56 w-full touch-none bg-white"
        />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        El cliente debe firmar aqui antes de guardar el registro.
      </p>

      {value && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Vista previa
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Firma del cliente"
            className="mt-3 h-24 rounded-2xl border border-slate-200 object-contain"
          />
        </div>
      )}
    </div>
  );
}

export default function VendedorRegistroWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const puedeBuscarRegistros =
    String(session.perfilTipoLabel || "").trim().toUpperCase() !== "VENDEDOR";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(() => createInitialState(session));
  const [registros, setRegistros] = useState<RegistroResumen[]>([]);
  const [sedes, setSedes] = useState<SedeOption[]>([]);
  const [jaladores, setJaladores] = useState<JaladorOption[]>([]);
  const [financierasCatalogo, setFinancierasCatalogo] = useState<
    FinancieraCatalogoOption[]
  >([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [buscandoImei, setBuscandoImei] = useState(false);
  const [consultandoPayjoyIndex, setConsultandoPayjoyIndex] = useState<
    number | null
  >(null);
  const [payjoyCreditos, setPayjoyCreditos] = useState<
    Record<number, PayJoyCreditoResponse["credito"]>
  >({});
  const [payjoyErrores, setPayjoyErrores] = useState<Record<number, string>>({});
  const [consultandoAloIndex, setConsultandoAloIndex] = useState<
    number | null
  >(null);
  const [aloCreditos, setAloCreditos] = useState<
    Record<number, AloCreditoResponse["credito"]>
  >({});
  const [aloErrores, setAloErrores] = useState<Record<number, string>>({});
  const autoPayJoyConsultaRef = useRef<Record<number, string>>({});
  const autoAloConsultaRef = useRef<Record<number, string>>({});
  const consultarPayJoyAutomaticoRef = useRef<
    ((index: number, imeiValue?: string) => Promise<void>) | null
  >(null);
  const consultarAloAutomaticoRef = useRef<
    ((index: number, imeiValue?: string) => Promise<void>) | null
  >(null);
  const [consultandoCreditosCedula, setConsultandoCreditosCedula] =
    useState(false);
  const [creditosFinancierasCedula, setCreditosFinancierasCedula] = useState<
    Record<number, CreditoFinancieraCedula>
  >({});
  const [creditosCedulaError, setCreditosCedulaError] = useState("");
  const autoCreditosCedulaConsultaRef = useRef("");
  const documentoActualRef = useRef("");
  const consultarCreditosCedulaAutomaticoRef = useRef<
    ((
      documentoValue: string,
      options?: { silent?: boolean }
    ) => Promise<void>) | null
  >(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [imeiDetalle, setImeiDetalle] = useState("");
  const [listaNegraAlerta, setListaNegraAlerta] =
    useState<ListaNegraAlerta | null>(null);
  const [listaNegraModalCerrado, setListaNegraModalCerrado] = useState(false);
  const [registroDuplicadoAlerta, setRegistroDuplicadoAlerta] =
    useState<RegistroDuplicadoAlerta | null>(null);
  const [duplicadoModalCerrado, setDuplicadoModalCerrado] = useState(false);
  const [verificandoListaNegra, setVerificandoListaNegra] = useState(false);
  const [verificandoDuplicado, setVerificandoDuplicado] = useState(false);
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const [financierasVisibles, setFinancierasVisibles] = useState(1);
  const [ingresoContado2Visible, setIngresoContado2Visible] = useState(false);
  const [confirmacionGuardadoVisible, setConfirmacionGuardadoVisible] =
    useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [errorCamara, setErrorCamara] = useState("");
  const [registroEditando, setRegistroEditando] =
    useState<RegistroVendedorDetalle | null>(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);
  const facturaInputRef = useRef<HTMLInputElement | null>(null);
  const cedulaFrenteInputRef = useRef<HTMLInputElement | null>(null);
  const cedulaReversoInputRef = useRef<HTMLInputElement | null>(null);
  const registroEditandoConvertido = esRegistroConvertido(registroEditando);

  useEffect(() => {
    documentoActualRef.current = onlyDigits(form.documentoNumero, 15);
  }, [form.documentoNumero]);

  const setFormMessage = (texto: string, tipo: "success" | "error") => {
    setMensaje(texto);
    setMensajeTipo(tipo);
  };

  const cargarRegistrosRecientes = async () => {
    const registrosRes = await fetch("/api/vendedor/registros", {
      cache: "no-store",
    });
    const registrosData = await registrosRes.json();

    if (registrosRes.ok) {
      setRegistros(Array.isArray(registrosData.registros) ? registrosData.registros : []);
      return;
    }

    throw new Error(registrosData.error || "No se pudieron cargar los registros");
  };

  const limpiarFormulario = (preservarContexto = false) => {
    setImeiDetalle("");
    setListaNegraAlerta(null);
    setListaNegraModalCerrado(false);
    setRegistroDuplicadoAlerta(null);
    setDuplicadoModalCerrado(false);
    setConfirmacionGuardadoVisible(false);
    setSignaturePadKey((current) => current + 1);
    setFinancierasVisibles(1);
    setIngresoContado2Visible(false);
    setRegistroEditando(null);
    setCreditosFinancierasCedula({});
    setCreditosCedulaError("");
    setConsultandoCreditosCedula(false);
    setPayjoyCreditos({});
    setPayjoyErrores({});
    setConsultandoPayjoyIndex(null);
    setAloCreditos({});
    setAloErrores({});
    setConsultandoAloIndex(null);
    autoPayJoyConsultaRef.current = {};
    autoAloConsultaRef.current = {};
    autoCreditosCedulaConsultaRef.current = "";
    setForm((current) => {
      if (preservarContexto) {
        return {
          ...createInitialState(session),
          ciudad: current.ciudad,
          puntoVenta: current.puntoVenta,
          asesorNombre: current.asesorNombre,
        };
      }

      return createInitialState(session);
    });
    router.replace("/vendedor/registros", { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;

    const cargarTodo = async () => {
      try {
        const [registrosRes, sedesRes, catalogoRes] = await Promise.all([
          fetch("/api/vendedor/registros", { cache: "no-store" }),
          fetch("/api/sedes", { cache: "no-store" }),
          fetch("/api/ventas/catalogo-personal", { cache: "no-store" }),
        ]);

        const [registrosData, sedesData, catalogoData] = await Promise.all([
          registrosRes.json(),
          sedesRes.json(),
          catalogoRes.json(),
        ]);

        if (cancelled) {
          return;
        }

        if (registrosRes.ok) {
          setRegistros(Array.isArray(registrosData.registros) ? registrosData.registros : []);
        } else {
          setMensaje(registrosData.error || "No se pudieron cargar los registros");
          setMensajeTipo("error");
        }

        if (sedesRes.ok && Array.isArray(sedesData)) {
          setSedes(sedesData);
          const puntosVentaPermitidos = sedesData
            .map((item) => String(item?.nombre || "").trim())
            .filter(
              (nombre) =>
                nombre.length > 0 &&
                !PUNTOS_VENTA_EXCLUIDOS.has(nombre.toUpperCase())
            );

          setForm((current) => ({
            ...current,
            puntoVenta:
              current.puntoVenta &&
              !PUNTOS_VENTA_EXCLUIDOS.has(current.puntoVenta.toUpperCase())
                ? current.puntoVenta
                : puntosVentaPermitidos[0] || "",
          }));
        }

        if (catalogoRes.ok) {
          const catalogo = catalogoData as Partial<CatalogoPersonalResponse>;

          setJaladores(
            Array.isArray(catalogo.jaladores) ? catalogo.jaladores : []
          );
          setFinancierasCatalogo(
            Array.isArray(catalogo.financieras) ? catalogo.financieras : []
          );
        }
      } catch {
        if (!cancelled) {
          setMensaje("Error cargando el modulo");
          setMensajeTipo("error");
        }
      } finally {
        if (!cancelled) {
          setCargando(false);
        }
      }
    };

    void cargarTodo();

    return () => {
      cancelled = true;
    };
  }, [session.sedeNombre]);

  useEffect(() => {
    const documento = onlyDigits(form.documentoNumero, 15);

    if (documento.length < 5) {
      setListaNegraAlerta(null);
      setListaNegraModalCerrado(false);
      setVerificandoListaNegra(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const verificar = async () => {
      try {
        setVerificandoListaNegra(true);
        const res = await fetch(
          `/api/vendedor/lista-negra/verificar?documento=${encodeURIComponent(documento)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = await res.json();

        if (cancelled) {
          return;
        }

        if (res.ok && data?.reportado && data?.registro) {
          setListaNegraAlerta({
            motivo: data.registro.motivo ?? null,
            reportadoPorNombre: data.registro.reportadoPorNombre ?? null,
            sedeNombre: data.registro.sedeNombre ?? null,
            updatedAt: data.registro.updatedAt ?? "",
          });
          setListaNegraModalCerrado(false);
          return;
        }

        setListaNegraAlerta(null);
        setListaNegraModalCerrado(false);
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setListaNegraAlerta(null);
          setListaNegraModalCerrado(false);
        }
      } finally {
        if (!cancelled) {
          setVerificandoListaNegra(false);
        }
      }
    };

    void verificar();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [form.documentoNumero]);

  useEffect(() => {
    const documento = onlyDigits(form.documentoNumero, 15);
    const imei = onlyDigits(form.serialImei, 15);

    if (documento.length < 5 || imei.length !== 15) {
      setRegistroDuplicadoAlerta(null);
      setDuplicadoModalCerrado(false);
      setVerificandoDuplicado(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const verificar = async () => {
        try {
          setVerificandoDuplicado(true);
          const params = new URLSearchParams({
            documento,
            imei,
          });

          if (registroEditando?.id) {
            params.set("excluirId", String(registroEditando.id));
          }

          const res = await fetch(
            `/api/vendedor/registros/duplicado?${params.toString()}`,
            { cache: "no-store", signal: controller.signal }
          );
          const data = await res.json();

          if (cancelled) {
            return;
          }

          if (res.ok && data?.duplicado) {
            setRegistroDuplicadoAlerta(data.duplicado as RegistroDuplicadoAlerta);
            setDuplicadoModalCerrado(false);
            return;
          }

          setRegistroDuplicadoAlerta(null);
          setDuplicadoModalCerrado(false);
        } catch {
          if (!cancelled && !controller.signal.aborted) {
            setRegistroDuplicadoAlerta(null);
          }
        } finally {
          if (!cancelled) {
            setVerificandoDuplicado(false);
          }
        }
      };

      void verificar();
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [form.documentoNumero, form.serialImei, registroEditando?.id]);

  useEffect(() => {
    const documento = onlyDigits(form.documentoNumero, 15);

    if (
      registroEditandoConvertido ||
      esServicioContado(form.servicio) ||
      documento.length < 5
    ) {
      setConsultandoCreditosCedula(false);
      autoCreditosCedulaConsultaRef.current = "";
      if (documento.length < 5) {
        setCreditosFinancierasCedula({});
        setCreditosCedulaError("");
      }
      return;
    }

    const consultaKey = `${documento}:financieras`;

    if (autoCreditosCedulaConsultaRef.current === consultaKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      autoCreditosCedulaConsultaRef.current = consultaKey;
      void consultarCreditosCedulaAutomaticoRef.current?.(documento, {
        silent: true,
      });
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [form.documentoNumero, form.servicio, registroEditandoConvertido]);

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const seleccionarServicio = (servicio: string) => {
    setForm((current) => {
      if (servicio === "CONTADO") {
        return {
          ...current,
          servicio,
          cedulaFrenteDataUrl: "",
          cedulaReversoDataUrl: "",
          clienteSinCedulaFisica: false,
          financierasDetalle: Array.from(
            { length: MAX_FINANCIERAS_REGISTRO },
            createEmptyFinanciera
          ),
        };
      }

      return {
        ...current,
        servicio,
        tipoDocumento:
          current.tipoDocumento === TIPO_DOCUMENTO_CONTADO
            ? "CC"
            : current.tipoDocumento,
        facturaFotoDataUrl: "",
        medioPago1Tipo: "EFECTIVO",
        medioPago1Valor: "",
        medioPago2Tipo: "",
        medioPago2Valor: "",
      };
    });
    setPayjoyCreditos({});
    setPayjoyErrores({});
    setCreditosFinancierasCedula({});
    setCreditosCedulaError("");
    autoCreditosCedulaConsultaRef.current = "";
    setFinancierasVisibles(1);
    setIngresoContado2Visible(false);
  };

  const setFinancieraField = <K extends keyof FinancialFormState>(
    index: number,
    field: K,
    value: FinancialFormState[K]
  ) => {
    setForm((current) => ({
      ...current,
      financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
    }));
  };

  const setFinancieraPesoField = (
    index: number,
    field: "creditoAutorizado" | "cuotaInicial" | "valorCuota",
    value: string
  ) => {
    const creditoCedula = creditosFinancierasCedula[index];
    const plataformaCredito = form.financierasDetalle[index]?.plataformaCredito;

    if (
      (field === "creditoAutorizado" &&
        esPlataformaPayJoy(plataformaCredito)) ||
      (field === "creditoAutorizado" &&
        esPlataformaAloCredit(plataformaCredito)) ||
      (field === "creditoAutorizado" &&
        creditoCoincideConPlataforma(creditoCedula, plataformaCredito)) ||
      (field === "valorCuota" &&
        Boolean(creditoCedula?.valorCuota) &&
        creditoCoincideConPlataforma(creditoCedula, plataformaCredito))
    ) {
      return;
    }

    setFinancieraField(index, field, formatearPesoInput(value));
  };

  const consultarCreditoPayjoy = async (index: number, imeiValue?: string) => {
    const imei = onlyDigits(imeiValue || form.serialImei, 15);

    if (imei.length !== 15) {
      setPayjoyErrores((current) => ({
        ...current,
        [index]: "Busca primero un IMEI valido de 15 digitos",
      }));
      return;
    }

    try {
      setConsultandoPayjoyIndex(index);
      setPayjoyErrores((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });

      const params = new URLSearchParams({ imei });
      const response = await fetch(
        `/api/vendedor/registros/payjoy-credito?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as PayJoyCreditoResponse;

      if (!response.ok || !data.credito) {
        setPayjoyCreditos((current) => {
          const next = { ...current };
          delete next[index];
          return next;
        });
        setFinancieraField(index, "creditoAutorizado", "");
        setPayjoyErrores((current) => ({
          ...current,
          [index]:
            data.error ||
            "No se encontro un credito PayJoy para este IMEI",
        }));
        return;
      }

      const creditoPayJoy = data.credito;

      setPayjoyCreditos((current) => ({
        ...current,
        [index]: creditoPayJoy,
      }));
      setForm((current) => {
        if (current.serialImei !== imei) {
          return current;
        }

        return {
          ...current,
          financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
            itemIndex === index
              ? applyPayJoyCreditoToFinancialState(item, creditoPayJoy)
              : item
          ),
        };
      });
    } catch {
      setPayjoyErrores((current) => ({
        ...current,
        [index]: "Error consultando el credito PayJoy",
      }));
    } finally {
      setConsultandoPayjoyIndex(null);
    }
  };
  consultarPayJoyAutomaticoRef.current = consultarCreditoPayjoy;

  const consultarCreditoAlo = async (index: number, imeiValue?: string) => {
    const imei = onlyDigits(imeiValue || form.serialImei, 15);

    if (imei.length !== 15) {
      setAloErrores((current) => ({
        ...current,
        [index]: "Busca primero un IMEI valido de 15 digitos",
      }));
      return;
    }

    try {
      setConsultandoAloIndex(index);
      setAloErrores((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });

      const params = new URLSearchParams({ imei });
      const response = await fetch(
        `/api/vendedor/registros/alo-credito?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as AloCreditoResponse;

      if (!response.ok || !data.credito) {
        setAloCreditos((current) => {
          const next = { ...current };
          delete next[index];
          return next;
        });
        setFinancieraField(index, "creditoAutorizado", "");
        setAloErrores((current) => ({
          ...current,
          [index]:
            data.error ||
            "No se encontro un credito ALO CREDIT para este IMEI",
        }));
        return;
      }

      const creditoAlo = data.credito;

      setAloCreditos((current) => ({
        ...current,
        [index]: creditoAlo,
      }));
      setForm((current) => {
        if (onlyDigits(current.serialImei, 15) !== imei) {
          return current;
        }

        const telefonoCredito = onlyDigits(creditoAlo.telefonoCliente || "", 10);
        const documentoCredito = onlyDigits(creditoAlo.documento || "", 15);
        const whatsappCredito =
          telefonoCredito.length === 10 ? telefonoCredito : "";

        return {
          ...current,
          clienteNombre:
            current.clienteNombre || creditoAlo.clienteNombre || current.clienteNombre,
          documentoNumero:
            current.documentoNumero || documentoCredito || current.documentoNumero,
          correo: current.correo || creditoAlo.correoElectronico || current.correo,
          whatsapp: current.whatsapp || whatsappCredito || current.whatsapp,
          telefono: current.telefono || telefonoCredito || current.telefono,
          observacion: mergeObservacionAccesorios(
            current.observacion,
            creditoAlo.observacionAccesorios
          ),
          servicio: "FINANCIERA",
          medioPago2Tipo: "",
          medioPago2Valor: "",
          financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
            itemIndex === index
              ? applyAloCreditoToFinancialState(item, creditoAlo)
              : item
          ),
        };
      });
    } catch {
      setAloErrores((current) => ({
        ...current,
        [index]: "Error consultando el credito ALO CREDIT",
      }));
    } finally {
      setConsultandoAloIndex(null);
    }
  };
  consultarAloAutomaticoRef.current = consultarCreditoAlo;

  const aplicarCreditoPayjoyPrincipal = (
    credito: NonNullable<PayJoyCreditoResponse["credito"]>
  ) => {
    setFinancierasVisibles((current) => Math.max(current, 1));
    setIngresoContado2Visible(false);
    setAloCreditos((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setAloErrores((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setPayjoyCreditos((current) => ({
      ...current,
      0: credito,
    }));
    setPayjoyErrores((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setForm((current) => ({
      ...current,
      servicio: "FINANCIERA",
      medioPago2Tipo: "",
      medioPago2Valor: "",
      financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
        itemIndex === 0
          ? applyPayJoyCreditoToFinancialState(item, credito)
          : item
      ),
    }));
  };

  const aplicarCreditoAloPrincipal = (
    credito: NonNullable<AloCreditoResponse["credito"]>
  ) => {
    setFinancierasVisibles((current) => Math.max(current, 1));
    setIngresoContado2Visible(false);
    setPayjoyCreditos((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setPayjoyErrores((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setAloCreditos((current) => ({
      ...current,
      0: credito,
    }));
    setAloErrores((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setForm((current) => {
      const telefonoCredito = onlyDigits(credito.telefonoCliente || "", 10);
      const documentoCredito = onlyDigits(credito.documento || "", 15);
      const whatsappCredito =
        telefonoCredito.length === 10 ? telefonoCredito : "";

      return {
        ...current,
        servicio: "FINANCIERA",
        clienteNombre:
          current.clienteNombre || credito.clienteNombre || current.clienteNombre,
        documentoNumero:
          current.documentoNumero || documentoCredito || current.documentoNumero,
        correo: current.correo || credito.correoElectronico || current.correo,
        whatsapp: current.whatsapp || whatsappCredito || current.whatsapp,
        telefono: current.telefono || telefonoCredito || current.telefono,
        observacion: mergeObservacionAccesorios(
          current.observacion,
          credito.observacionAccesorios
        ),
        medioPago2Tipo: "",
        medioPago2Valor: "",
        financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
          itemIndex === 0 ? applyAloCreditoToFinancialState(item, credito) : item
        ),
      };
    });
  };

  const detectarCreditoPayjoyPorImei = async (imeiValue: string) => {
    const imei = onlyDigits(imeiValue, 15);

    if (imei.length !== 15) {
      return;
    }

    try {
      setConsultandoPayjoyIndex(0);
      const params = new URLSearchParams({ imei });
      const response = await fetch(
        `/api/vendedor/registros/payjoy-credito?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as PayJoyCreditoResponse;

      if (response.ok && data.credito) {
        aplicarCreditoPayjoyPrincipal(data.credito);
        setFormMessage(
          `Este IMEI esta activo en PAYJOY. Se selecciono PAYJOY automaticamente por ${formatMoney(
            data.credito.creditoAutorizado
          )}.`,
          "success"
        );
        return;
      }
    } catch {
    } finally {
      setConsultandoPayjoyIndex(null);
    }

    try {
      setConsultandoAloIndex(0);
      const params = new URLSearchParams({ imei });
      const response = await fetch(
        `/api/vendedor/registros/alo-credito?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as AloCreditoResponse;

      if (!response.ok || !data.credito) {
        if (response.status !== 404 && data.error) {
          setFormMessage(`ALO CREDIT: ${data.error}`, "error");
        }
        return;
      }

      aplicarCreditoAloPrincipal(data.credito);
      setFormMessage(
        `Este IMEI esta activo en ALO CREDIT. Se selecciono ALO CREDIT automaticamente por ${formatMoney(
          data.credito.creditoAutorizado
        )}.`,
        "success"
      );
    } catch {
      setFormMessage("Error consultando ALO CREDIT por IMEI", "error");
      return;
    } finally {
      setConsultandoAloIndex(null);
    }
  };

  const aplicarCreditosFinancierasCedula = (
    creditos: CreditoFinancieraCedula[],
    documentoEsperado?: string
  ) => {
    if (
      documentoEsperado &&
      documentoActualRef.current &&
      documentoActualRef.current !== documentoEsperado
    ) {
      return false;
    }

    const creditosAplicables = creditos.slice(0, MAX_FINANCIERAS_REGISTRO);
    const creditoNombre =
      creditosAplicables.find((credito) => credito.clienteNombre) ||
      creditosAplicables[0];
    const creditoCorreo = creditosAplicables.find(
      (credito) => credito.correoElectronico
    );
    const creditoTelefono = creditosAplicables.find(
      (credito) => credito.telefonoCliente
    );
    const creditoDireccion = creditosAplicables.find(
      (credito) => credito.direccionCliente
    );
    const creditosPorIndex = Object.fromEntries(
      creditosAplicables.map((credito, index) => [index, credito])
    ) as Record<number, CreditoFinancieraCedula>;

    setFinancierasVisibles((current) =>
      Math.max(current, Math.max(1, creditosAplicables.length))
    );
    setIngresoContado2Visible(false);
    setCreditosFinancierasCedula(creditosPorIndex);
    setCreditosCedulaError("");
    setForm((current) => {
      const telefonoCredito = onlyDigits(creditoTelefono?.telefonoCliente || "");
      const whatsappCredito = onlyDigits(
        creditoTelefono?.telefonoCliente || "",
        10
      );

      if (
        documentoEsperado &&
        onlyDigits(current.documentoNumero, 15) !== documentoEsperado
      ) {
        return current;
      }

      return {
        ...current,
        servicio: "FINANCIERA",
        clienteNombre: creditoNombre?.clienteNombre || current.clienteNombre,
        correo: creditoCorreo?.correoElectronico || current.correo,
        whatsapp:
          whatsappCredito.length === 10 ? whatsappCredito : current.whatsapp,
        telefono: telefonoCredito || current.telefono,
        direccion: creditoDireccion?.direccionCliente || current.direccion,
        medioPago2Tipo: "",
        medioPago2Valor: "",
        financierasDetalle: current.financierasDetalle.map((item, itemIndex) => {
          const credito = creditosPorIndex[itemIndex];

          if (!credito) {
            return item;
          }

          return applyCreditoFinancieraCedulaToFinancialState(
            item,
            credito,
            resolvePlatformName(financierasCatalogo, credito.financiera)
          );
        }),
      };
    });
    return true;
  };

  const consultarCreditosFinancierasCedula = async (
    documentoValue?: string,
    options?: { silent?: boolean }
  ) => {
    const documento = onlyDigits(documentoValue || form.documentoNumero, 15);

    if (documento.length < 5) {
      setCreditosCedulaError("Ingresa una cedula valida para consultar creditos");
      return;
    }

    try {
      setConsultandoCreditosCedula(true);
      setCreditosCedulaError("");

      const params = new URLSearchParams({ documento });
      const response = await fetch(
        `/api/vendedor/registros/creditos-financieras?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as CreditosFinancierasResponse;

      if (!response.ok || !Array.isArray(data.creditos) || data.creditos.length === 0) {
        setCreditosFinancierasCedula({});
        const sinCreditoEncontrado =
          response.status === 404 ||
          (response.ok && Array.isArray(data.creditos) && data.creditos.length === 0);

        setCreditosCedulaError(
          sinCreditoEncontrado
            ? ""
            : options?.silent
              ? "No se pudieron consultar las financieras. Usa Consultar para reintentar."
              : data.error || "No se pudieron consultar las financieras"
        );
        return;
      }

      const applied = aplicarCreditosFinancierasCedula(data.creditos, documento);
      if (!applied) {
        return;
      }
      const erroresConsulta = Array.isArray(data.errores)
        ? data.errores.filter((item) => item.error)
        : [];

      if (erroresConsulta.length > 0) {
        setCreditosCedulaError(
          erroresConsulta
            .map((item) => `${item.financiera}: ${item.error}`)
            .join(" | ")
        );
      }

      const resumen = data.creditos
        .map(
          (credito) =>
            `${credito.financiera}: ${formatMoney(credito.creditoAutorizado)}`
        )
        .join(" | ");
      setFormMessage(
        `Creditos encontrados para ${
          data.creditos[0]?.clienteNombre || documento
        }: ${resumen}.`,
        "success"
      );
    } catch {
      setCreditosCedulaError("Error consultando los creditos por cedula");
    } finally {
      setConsultandoCreditosCedula(false);
    }
  };
  consultarCreditosCedulaAutomaticoRef.current =
    consultarCreditosFinancierasCedula;

  const seleccionarPlataformaFinanciera = (index: number, value: string) => {
    const esPayjoy = esPlataformaPayJoy(value);
    const esAloCredit = esPlataformaAloCredit(value);
    const esConsultaCedula = esPlataformaConsultaCedula(value);
    delete autoPayJoyConsultaRef.current[index];
    delete autoAloConsultaRef.current[index];

    setPayjoyCreditos((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setPayjoyErrores((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setAloCreditos((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setAloErrores((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setCreditosFinancierasCedula((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setCreditosCedulaError("");
    autoCreditosCedulaConsultaRef.current = "";
    setForm((current) => ({
      ...current,
      financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              plataformaCredito: value,
              creditoAutorizado:
                esPayjoy || esAloCredit || esConsultaCedula
                  ? ""
                  : item.creditoAutorizado,
              valorCuota:
                esPayjoy || esAloCredit || esConsultaCedula
                  ? ""
                  : item.valorCuota,
              numeroCuotas:
                esPayjoy || esAloCredit || esConsultaCedula
                  ? ""
                  : item.numeroCuotas,
              frecuenciaCuota:
                esPayjoy || esAloCredit || esConsultaCedula
                  ? ""
                  : item.frecuenciaCuota,
            }
          : item
      ),
    }));

    if (esConsultaCedula && form.documentoNumero.length >= 5) {
      void consultarCreditosFinancierasCedula();
    }

    if (esAloCredit && form.serialImei.length === 15) {
      void consultarCreditoAlo(index);
    }
  };

  useEffect(() => {
    if (registroEditandoConvertido || form.serialImei.length !== 15) {
      return;
    }

    form.financierasDetalle
      .slice(0, financierasVisibles)
      .forEach((item, index) => {
        const esPayjoy = esPlataformaPayJoy(item.plataformaCredito);
        const esAloCredit = esPlataformaAloCredit(item.plataformaCredito);

        if (!esPayjoy && !esAloCredit) {
          return;
        }

        const faltanDatosConsultaImei =
          !isTextFilled(item.creditoAutorizado) ||
          !isTextFilled(item.valorCuota) ||
          !isTextFilled(item.numeroCuotas) ||
          !isTextFilled(item.frecuenciaCuota);

        if (!faltanDatosConsultaImei) {
          return;
        }

        const consultaKey = `${form.serialImei}:${index}:${item.plataformaCredito}`;

        if (esPayjoy) {
          if (autoPayJoyConsultaRef.current[index] === consultaKey) {
            return;
          }

          autoPayJoyConsultaRef.current[index] = consultaKey;
          void consultarPayJoyAutomaticoRef.current?.(index, form.serialImei);
        }

        if (esAloCredit) {
          if (autoAloConsultaRef.current[index] === consultaKey) {
            return;
          }

          autoAloConsultaRef.current[index] = consultaKey;
          void consultarAloAutomaticoRef.current?.(index, form.serialImei);
        }
      });
  }, [
    form.financierasDetalle,
    form.serialImei,
    financierasVisibles,
    registroEditandoConvertido,
  ]);

  const resetFinanciera = (index: number) => {
    delete autoPayJoyConsultaRef.current[index];
    delete autoAloConsultaRef.current[index];
    setPayjoyCreditos((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setPayjoyErrores((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setAloCreditos((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setAloErrores((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setCreditosFinancierasCedula((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setForm((current) => ({
      ...current,
      financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
        itemIndex === index ? createEmptyFinanciera() : item
      ),
    }));
  };

  const quitarUltimaFinanciera = () => {
    if (financierasVisibles <= 1) {
      return;
    }

    const indexToReset = financierasVisibles - 1;
    resetFinanciera(indexToReset);
    setFinancierasVisibles((current) => Math.max(1, current - 1));
  };

  const buscarImei = async () => {
    if (form.serialImei.length !== 15) {
      setFormMessage("El IMEI debe tener 15 digitos", "error");
      return;
    }

    try {
      setBuscandoImei(true);
      setFormMessage("", "success");

      const params = new URLSearchParams({
        imei: form.serialImei,
        puntoVenta: form.puntoVenta,
      });
      const response = await fetch(
        `/api/vendedor/registros/imei?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as
        | ({ error?: string } & Partial<ImeiLookupResponse>)
        | undefined;

      if (!response.ok || !data?.equipo) {
        setImeiDetalle("");
        setFormMessage(
          data?.error || "No se pudo consultar el IMEI",
          "error"
        );
        return;
      }

      const equipo = data.equipo;

      setForm((current) => ({
        ...current,
        serialImei: equipo.imei,
        referenciaEquipo: equipo.referencia,
        tipoProducto: equipo.tipoProducto,
        color: equipo.color ?? current.color,
      }));
      setImeiDetalle(
        `${equipo.referencia} | ${equipo.tipoProducto} | ${equipo.sedeNombre ?? "Sin ubicacion"} | ${equipo.estadoActual ?? "Sin estado"}`
      );

      const financierasPayJoySeleccionadas = form.financierasDetalle
        .slice(0, financierasVisibles)
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => esPlataformaPayJoy(item.plataformaCredito));
      const financierasAloSeleccionadas = form.financierasDetalle
        .slice(0, financierasVisibles)
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => esPlataformaAloCredit(item.plataformaCredito));

      if (financierasPayJoySeleccionadas.length) {
        financierasPayJoySeleccionadas.forEach(({ index }) => {
          void consultarCreditoPayjoy(index, equipo.imei);
        });
      } else if (financierasAloSeleccionadas.length) {
        financierasAloSeleccionadas.forEach(({ index }) => {
          void consultarCreditoAlo(index, equipo.imei);
        });
      } else {
        void detectarCreditoPayjoyPorImei(equipo.imei);
      }
    } catch {
      setImeiDetalle("");
      setFormMessage("Error consultando el IMEI", "error");
    } finally {
      setBuscandoImei(false);
    }
  };

  const cargarImagenCampo = async (
    event: ChangeEvent<HTMLInputElement>,
    field: ImageFormField,
    label: string
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setCargandoFoto(true);
      const dataUrl = await compressImageToDataUrl(file);
      setField(field, dataUrl);
    } catch {
      setFormMessage(`No se pudo procesar ${label}`, "error");
    } finally {
      setCargandoFoto(false);
      event.target.value = "";
    }
  };

  const cargarFotoEntrega = async (event: ChangeEvent<HTMLInputElement>) => {
    await cargarImagenCampo(event, "fotoEntregaDataUrl", "la foto de entrega");
  };

  const detenerCamara = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCamaraAbierta(false);
  };

  const abrirCamara = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCamara(
        "Este dispositivo no permite abrir la camara desde el navegador."
      );
      return;
    }

    try {
      setErrorCamara("");
      detenerCamara();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCamaraAbierta(true);
    } catch {
      setErrorCamara(
        "No se pudo abrir la camara. Puedes usar la opcion de subir imagen."
      );
    }
  };

  const capturarFotoDesdeCamara = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      setFormMessage("No se pudo capturar la foto desde la camara", "error");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    setField("fotoEntregaDataUrl", canvas.toDataURL("image/jpeg", 0.85));
    detenerCamara();
  };

  useEffect(() => {
    if (!camaraAbierta || !videoRef.current || !streamRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setErrorCamara("La camara se abrio, pero no se pudo iniciar la vista previa.");
    });
  }, [camaraAbierta]);

  useEffect(() => {
    return () => {
      detenerCamara();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const editar = Number(searchParams.get("editar"));

    if (!Number.isInteger(editar) || editar <= 0) {
      if (!cancelled) {
        setRegistroEditando(null);
      }
      return () => {
        cancelled = true;
      };
    }

    const cargarRegistroEditando = async () => {
      try {
        setCargandoEdicion(true);
        setFormMessage("", "success");

        const res = await fetch(`/api/vendedor/registros?id=${editar}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok || !data?.registro) {
          if (!cancelled) {
            setFormMessage(
              data?.error || "No se pudo cargar el registro para editar",
              "error"
            );
          }
          return;
        }

        if (cancelled) {
          return;
        }

        const registro = data.registro as RegistroVendedorDetalle;
        const mapped = mapRegistroToForm(registro, session);

        setRegistroEditando(registro);
        setForm(mapped.form);
        setFinancierasVisibles(mapped.financierasVisibles);
        setIngresoContado2Visible(debeMostrarSegundoIngreso(mapped.form));
        setImeiDetalle(
          [
            registro.referenciaEquipo,
            registro.puntoVenta ?? registro.sedeNombre,
            registro.serialImei,
          ]
            .filter(Boolean)
            .join(" | ")
        );
        setSignaturePadKey((current) => current + 1);
      } catch {
        if (!cancelled) {
          setFormMessage("Error cargando el registro para editar", "error");
        }
      } finally {
        if (!cancelled) {
          setCargandoEdicion(false);
        }
      }
    };

    void cargarRegistroEditando();

    return () => {
      cancelled = true;
    };
  }, [searchParams, session]);

  const validarFormularioVisible = () => {
    if (registroEditandoConvertido) {
      if (!isTextFilled(form.clienteNombre)) {
        return "El nombre del cliente es obligatorio";
      }
      if (!isTextFilled(form.tipoDocumento)) {
        return "Debes seleccionar el tipo de documento";
      }
      if (!isTextFilled(form.documentoNumero)) {
        return "El documento del cliente es obligatorio";
      }
      if (!isTextFilled(form.correo)) return "El correo es obligatorio";
      if (!esCorreoRegistroValido(form.correo)) {
        return `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`;
      }
      if (!isTextFilled(form.whatsapp)) return "El WhatsApp es obligatorio";
      if (!esWhatsappRegistroValido(form.whatsapp)) {
        return "El WhatsApp debe tener 10 digitos";
      }
      const errorDocumentoContacto = validarDocumentoDiferenteDeContactos(form);

      if (errorDocumentoContacto) {
        return errorDocumentoContacto;
      }
      if (!isTextFilled(form.direccion)) return "La direccion es obligatoria";

      return null;
    }

    if (!isTextFilled(form.ciudad)) return "La ciudad es obligatoria";
    if (!isTextFilled(form.puntoVenta)) return "Debes seleccionar el punto de venta";
    if (!isTextFilled(form.clienteNombre)) return "El nombre del cliente es obligatorio";
    if (!isTextFilled(form.tipoDocumento)) return "Debes seleccionar el tipo de documento";
    if (!isTextFilled(form.documentoNumero)) return "El documento del cliente es obligatorio";
    if (listaNegraAlerta) return "CEDULA REPORTADA POR FRAUDE";
    if (registroDuplicadoAlerta) {
      return "REGISTRO DUPLICADO: esta cedula e IMEI ya aparecen en el sistema";
    }
    if (!isTextFilled(form.servicio)) return "Selecciona CONTADO o FINANCIERA";
    if (!isTextFilled(form.serialImei) || form.serialImei.length !== 15) {
      return "El IMEI debe tener 15 digitos";
    }

    if (!isTextFilled(form.referenciaEquipo)) {
      return "La referencia del equipo es obligatoria";
    }
    if (!isTextFilled(form.almacenamiento)) return "El almacenamiento es obligatorio";
    if (!isTextFilled(form.color)) return "El color es obligatorio";
    if (!isTextFilled(form.tipoEquipo)) return "Debes seleccionar el tipo de equipo";

    if (esServicioFinanciera(form.servicio)) {
      if (financierasCatalogo.length === 0) {
        return "No hay financieras creadas en el catalogo comercial";
      }

      const financierasActivas = form.financierasDetalle.slice(0, financierasVisibles);

      for (let index = 0; index < financierasActivas.length; index += 1) {
        const item = financierasActivas[index];

        if (index > 0 && !detalleFinancieraTieneDatos(item)) {
          continue;
        }

        if (!isFinancieraCompleta(item, index)) {
          return `Todos los campos de la financiera ${index + 1} son obligatorios`;
        }
      }

      const primeraFinanciera = financierasActivas[0];

      if (ingresoContado2Visible && primeraFinanciera) {
        const inicial = moneyInputToNumber(primeraFinanciera.cuotaInicial);
        const ingreso1 = moneyInputToNumber(form.medioPago1Valor);
        const ingreso2 = moneyInputToNumber(form.medioPago2Valor);

        if (ingreso1 <= 0) {
          return "Registra el valor del primer ingreso de la inicial";
        }

        if (!isTextFilled(form.medioPago2Tipo)) {
          return "Selecciona el tipo del segundo ingreso de la inicial";
        }

        if (ingreso2 <= 0) {
          return "Registra el valor del segundo ingreso de la inicial";
        }

        if (ingreso1 + ingreso2 !== inicial) {
          return "La suma de los ingresos debe ser igual a la inicial";
        }
      }
    } else if (esServicioContado(form.servicio)) {
      if (!isTextFilled(form.medioPago1Tipo)) {
        return "Selecciona el tipo del ingreso contado";
      }
      if (moneyInputToNumber(form.medioPago1Valor) <= 0) {
        return "Registra el valor del ingreso contado";
      }
      if (ingresoContado2Visible) {
        if (!isTextFilled(form.medioPago2Tipo)) {
          return "Selecciona el tipo del segundo ingreso contado";
        }
        if (moneyInputToNumber(form.medioPago2Valor) <= 0) {
          return "Registra el valor del segundo ingreso contado";
        }
      }
      if (!form.facturaFotoDataUrl) {
        return "Debes adjuntar la foto de la factura";
      }
    }

    if (!isTextFilled(form.correo)) return "El correo es obligatorio";
    if (!esCorreoRegistroValido(form.correo)) {
      return `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`;
    }
    if (!isTextFilled(form.whatsapp)) return "El WhatsApp es obligatorio";
    if (!esWhatsappRegistroValido(form.whatsapp)) {
      return "El WhatsApp debe tener 10 digitos";
    }
    const errorDocumentoContacto = validarDocumentoDiferenteDeContactos(
      esServicioFinanciera(form.servicio)
        ? form
        : {
            documentoNumero: form.documentoNumero,
            whatsapp: form.whatsapp,
          }
    );

    if (errorDocumentoContacto) {
      return errorDocumentoContacto;
    }
    if (!isTextFilled(form.direccion)) return "La direccion es obligatoria";
    if (!isTextFilled(form.fechaNacimiento)) {
      return "La fecha de nacimiento es obligatoria";
    }
    if (!isTextFilled(form.fechaExpedicion)) {
      return "La fecha de expedicion es obligatoria";
    }
    if (!isTextFilled(form.simCardRegistro1)) return "El registro SIM 1 es obligatorio";
    if (!form.aceptaDeclaracionIntermediacion) {
      return "Debes confirmar el texto de intermediacion visible al cliente";
    }
    if (!form.aceptaPoliticaGarantia) {
      return "Debes confirmar la politica de garantia visible al cliente";
    }

    if (esServicioFinanciera(form.servicio)) {
      if (!isTextFilled(form.telefono)) return "El telefono es obligatorio";
      if (!isTextFilled(form.barrio)) return "El barrio es obligatorio";
      if (!isTextFilled(form.referenciaFamiliar1Nombre)) {
        return "La referencia familiar 1 es obligatoria";
      }
      if (!isTextFilled(form.referenciaFamiliar1Telefono)) {
        return "El telefono de la referencia familiar 1 es obligatorio";
      }
      if (!isTextFilled(form.referenciaFamiliar2Nombre)) {
        return "La referencia familiar 2 es obligatoria";
      }
      if (!isTextFilled(form.referenciaFamiliar2Telefono)) {
        return "El telefono de la referencia familiar 2 es obligatorio";
      }
      if (!form.aceptaCondicionesCredito) {
        return "Debes confirmar las condiciones de credito visibles del formato";
      }
      if (
        !form.clienteSinCedulaFisica &&
        (!form.cedulaFrenteDataUrl || !form.cedulaReversoDataUrl)
      ) {
        return "Debes adjuntar foto de cedula por ambos lados o marcar que el cliente no trae cedula";
      }
    }
    if (!isTextFilled(form.jaladorNombre)) return "Debes seleccionar el jalador";
    if (!isTextFilled(form.observacion)) return "La observacion es obligatoria";
    if (!form.firmaClienteDataUrl) {
      return "Debes capturar la firma digital del cliente";
    }
    if (!form.fotoEntregaDataUrl) {
      return "Debes adjuntar la foto de entrega del producto";
    }

    return null;
  };

  const guardarRegistro = async (confirmado = false) => {
    const errorValidacion = validarFormularioVisible();

    if (errorValidacion) {
      setConfirmacionGuardadoVisible(false);
      if (errorValidacion === "CEDULA REPORTADA POR FRAUDE") {
        setListaNegraModalCerrado(false);
      }
      setFormMessage(errorValidacion, "error");
      return;
    }

    if (!registroEditando && !confirmado) {
      setFormMessage("", "success");
      setConfirmacionGuardadoVisible(true);
      return;
    }

    try {
      setGuardando(true);
      setConfirmacionGuardadoVisible(false);
      setFormMessage("", "success");

      const payload = {
        ...form,
        confirmacionCliente: true,
        financierasDetalle: esServicioFinanciera(form.servicio)
          ? form.financierasDetalle
              .slice(0, financierasVisibles)
              .filter((item, index) => index === 0 || detalleFinancieraTieneDatos(item))
          : [],
        medioPago2Tipo:
          (esServicioContado(form.servicio) || esServicioFinanciera(form.servicio)) &&
          ingresoContado2Visible
            ? form.medioPago2Tipo
            : "",
        medioPago2Valor:
          (esServicioContado(form.servicio) || esServicioFinanciera(form.servicio)) &&
          ingresoContado2Visible
            ? form.medioPago2Valor
            : "",
      };
      const payloadConvertido = {
        clienteNombre: form.clienteNombre,
        tipoDocumento: form.tipoDocumento,
        documentoNumero: form.documentoNumero,
        observacion: form.observacion,
        correo: form.correo,
        whatsapp: form.whatsapp,
        fechaNacimiento: form.fechaNacimiento,
        fechaExpedicion: form.fechaExpedicion,
        direccion: form.direccion,
        barrio: form.barrio,
        referenciaFamiliar1Nombre: form.referenciaFamiliar1Nombre,
        referenciaFamiliar1Telefono: form.referenciaFamiliar1Telefono,
        referenciaFamiliar2Nombre: form.referenciaFamiliar2Nombre,
        referenciaFamiliar2Telefono: form.referenciaFamiliar2Telefono,
        telefono: form.telefono,
        simCardRegistro1: form.simCardRegistro1,
        simCardRegistro2: form.simCardRegistro2,
      };

      const res = await fetch("/api/vendedor/registros", {
        method: registroEditando ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          registroEditando
            ? {
                ...(registroEditandoConvertido ? payloadConvertido : payload),
                id: registroEditando.id,
                modo: "EDITAR",
              }
            : payload
        ),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.listaNegra) {
          setListaNegraAlerta({
            motivo: data.listaNegra.motivo ?? null,
            reportadoPorNombre: data.listaNegra.reportadoPorNombre ?? null,
            sedeNombre: data.listaNegra.sedeNombre ?? null,
            updatedAt: data.listaNegra.updatedAt ?? "",
          });
          setListaNegraModalCerrado(false);
        }
        if (data?.duplicado) {
          setRegistroDuplicadoAlerta(data.duplicado as RegistroDuplicadoAlerta);
          setDuplicadoModalCerrado(false);
        }
        setFormMessage(data.error || "No se pudo guardar el registro", "error");
        return;
      }

      setFormMessage(
        data.mensaje ||
          (registroEditando
            ? "Registro actualizado correctamente"
            : "Registro guardado correctamente"),
        "success"
      );

      if (registroEditando && data?.registro) {
        const registro = data.registro as RegistroVendedorDetalle;
        const mapped = mapRegistroToForm(registro, session);

        setRegistroEditando(registro);
        setForm(mapped.form);
        setFinancierasVisibles(mapped.financierasVisibles);
        setIngresoContado2Visible(debeMostrarSegundoIngreso(mapped.form));
      } else {
        limpiarFormulario(true);
      }

      await cargarRegistrosRecientes();
    } catch {
      setFormMessage(
        registroEditando
          ? "Error actualizando el registro"
          : "Error guardando el registro",
        "error"
      );
    } finally {
      setGuardando(false);
    }
  };

  const puntosVenta = Array.from(
    new Map(
      [session.sedeNombre, ...sedes.map((item) => item.nombre)]
        .map((nombre) => String(nombre || "").trim())
        .filter(
          (nombre) =>
            nombre.length > 0 &&
            !PUNTOS_VENTA_EXCLUIDOS.has(nombre.toUpperCase())
        )
        .map((nombre) => [nombre, nombre])
    ).values()
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      {registroDuplicadoAlerta && !duplicadoModalCerrado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border-2 border-red-300 bg-white shadow-[0_30px_90px_rgba(127,29,29,0.35)]"
          >
            <div className="bg-red-600 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-100">
                    Alerta de duplicado
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight">
                    REGISTRO YA APARECE EN SISTEMA
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicadoModalCerrado(true)}
                  className="h-10 w-10 rounded-full border border-white/30 bg-white/10 text-xl font-black leading-none text-white transition hover:bg-white/20"
                  aria-label="Cerrar alerta"
                >
                  x
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <p className="text-base font-semibold leading-7 text-red-950">
                La cedula y el IMEI coinciden con otro registro. Revisa antes de
                crear otra venta para evitar duplicar la operacion.
              </p>

              <div className="grid gap-3 rounded-[26px] border border-red-100 bg-red-50 p-4 text-sm text-red-950 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-red-700">
                    Registro
                  </span>
                  <strong className="mt-1 block">#{registroDuplicadoAlerta.id}</strong>
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-red-700">
                    Cliente
                  </span>
                  <strong className="mt-1 block">
                    {registroDuplicadoAlerta.clienteNombre}
                  </strong>
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-red-700">
                    Punto
                  </span>
                  <strong className="mt-1 block">
                    {registroDuplicadoAlerta.puntoVenta ||
                      registroDuplicadoAlerta.sedeNombre ||
                      "Sin punto"}
                  </strong>
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-red-700">
                    Asesor
                  </span>
                  <strong className="mt-1 block">
                    {registroDuplicadoAlerta.perfilVendedorNombre || "Sin asesor"}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDuplicadoModalCerrado(true)}
                className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Entendido, voy a revisar
              </button>
            </div>
          </section>
        </div>
      )}
      {listaNegraAlerta && !listaNegraModalCerrado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border-2 border-red-300 bg-white shadow-[0_30px_90px_rgba(127,29,29,0.45)]"
          >
            <div className="bg-[linear-gradient(135deg,#7f1d1d_0%,#dc2626_100%)] px-6 py-6 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-100">
                    Alerta critica
                  </p>
                  <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                    CEDULA REPORTADA POR FRAUDE
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setListaNegraModalCerrado(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl font-black leading-none text-white transition hover:bg-white/20"
                  aria-label="Cerrar alerta"
                >
                  x
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <p className="text-base font-semibold leading-7 text-red-950">
                No se puede guardar una venta con este documento. Verifica la
                informacion antes de continuar.
              </p>

              {(listaNegraAlerta.sedeNombre ||
                listaNegraAlerta.reportadoPorNombre ||
                listaNegraAlerta.motivo) && (
                <div className="rounded-[26px] border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-950">
                  {listaNegraAlerta.sedeNombre && (
                    <p>
                      <span className="font-black">Reportada por: </span>
                      {listaNegraAlerta.sedeNombre}
                    </p>
                  )}
                  {listaNegraAlerta.reportadoPorNombre && (
                    <p>
                      <span className="font-black">Asesor: </span>
                      {listaNegraAlerta.reportadoPorNombre}
                    </p>
                  )}
                  {listaNegraAlerta.motivo && (
                    <p>
                      <span className="font-black">Observacion: </span>
                      {listaNegraAlerta.motivo}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setListaNegraModalCerrado(true)}
                className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800"
              >
                Entendido
              </button>
            </div>
          </section>
        </div>
      )}
      {confirmacionGuardadoVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/75 px-4 py-6 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_34px_100px_rgba(2,6,23,0.48)]"
          >
            <div className="border-b border-slate-200 bg-white px-6 py-5 md:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-teal-700">
                    Revision antes de guardar
                  </p>
                  <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-950 md:text-4xl">
                    Resumen del registro
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                    Revisa que el punto de venta, el cliente, el IMEI y los valores
                    correspondan al tramite. Al confirmar se guardara el registro.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmacionGuardadoVisible(false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xl font-black leading-none text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  aria-label="Cerrar resumen"
                >
                  x
                </button>
              </div>
            </div>

            <div className="max-h-[calc(92vh-150px)] space-y-5 overflow-y-auto bg-slate-50 px-6 py-6 md:px-8">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-[26px] border border-slate-900 bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.2)]">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-teal-200">
                  Punto de venta seleccionado
                </span>
                <p className="mt-3 text-4xl font-black tracking-tight">
                  {form.puntoVenta || "Sin punto de venta"}
                </p>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                  Si este punto no es correcto, vuelve y corrige antes de guardar.
                </p>
              </div>

                <div className="grid gap-3 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
                  <div>
                    <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Tipo
                    </span>
                    <strong className="mt-1 block text-slate-950">
                      {form.servicio || "Pendiente"}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Asesor
                    </span>
                    <strong className="mt-1 block text-slate-950">
                      {form.asesorNombre || session.perfilNombre}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Jalador
                    </span>
                    <strong className="mt-1 block text-slate-950">
                      {form.jaladorNombre || "Pendiente"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Cliente y equipo
                  </h3>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Cliente</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.clienteNombre || "Pendiente"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Documento</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.tipoDocumento || "Documento"}{" "}
                        {form.documentoNumero || "Pendiente"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">IMEI</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.serialImei || "Pendiente"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Referencia</dt>
                      <dd className="max-w-[55%] text-right font-bold text-slate-950">
                        {form.referenciaEquipo || "Pendiente"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Color</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.color || "Pendiente"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Tipo equipo</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.tipoEquipo || "Pendiente"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Venta y pagos
                  </h3>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Tipo de venta</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.servicio || "Pendiente"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Asesor</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.asesorNombre || session.perfilNombre}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Jalador</dt>
                      <dd className="text-right font-bold text-slate-950">
                        {form.jaladorNombre || "Pendiente"}
                      </dd>
                    </div>
                    {esServicioContado(form.servicio) ? (
                      <>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Ingreso total</dt>
                          <dd className="text-right font-bold text-emerald-700">
                            {formatMoney(totalIngresosContado(form))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Medio 1</dt>
                          <dd className="text-right font-bold text-slate-950">
                            {form.medioPago1Tipo || "Sin medio"} |{" "}
                            {formatMoney(moneyInputToNumber(form.medioPago1Valor))}
                          </dd>
                        </div>
                        {ingresoContado2Visible && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Medio 2</dt>
                            <dd className="text-right font-bold text-slate-950">
                              {form.medioPago2Tipo || "Sin medio"} |{" "}
                              {formatMoney(moneyInputToNumber(form.medioPago2Valor))}
                            </dd>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {form.financierasDetalle
                          .slice(0, financierasVisibles)
                          .filter(
                            (item, index) =>
                              index === 0 || detalleFinancieraTieneDatos(item)
                          )
                          .map((item, index) => (
                            <div
                              key={`${item.plataformaCredito}-${index}`}
                              className="rounded-2xl border border-white bg-white px-4 py-3"
                            >
                              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                Financiera {index + 1}
                              </span>
                              <div className="mt-2 grid gap-2">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Plataforma</span>
                                  <strong className="text-right text-slate-950">
                                    {item.plataformaCredito || "Pendiente"}
                                  </strong>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Credito</span>
                                  <strong className="text-right text-slate-950">
                                    {formatMoney(
                                      moneyInputToNumber(item.creditoAutorizado)
                                    )}
                                  </strong>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Inicial</span>
                                  <strong className="text-right text-slate-950">
                                    {formatMoney(moneyInputToNumber(item.cuotaInicial))}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          ))}
                        {ingresoContado2Visible && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Ingresos inicial</dt>
                            <dd className="text-right font-bold text-emerald-700">
                              {formatMoney(totalIngresosInicialFinanciera(form))}
                            </dd>
                          </div>
                        )}
                      </>
                    )}
                  </dl>
                </div>
              </div>

              <div className="grid gap-3 rounded-[26px] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Firma cliente
                  </span>
                  <strong>{form.firmaClienteDataUrl ? "Lista" : "Pendiente"}</strong>
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Foto entrega
                  </span>
                  <strong>{form.fotoEntregaDataUrl ? "Lista" : "Pendiente"}</strong>
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Factura contado
                  </span>
                  <strong>
                    {esServicioContado(form.servicio)
                      ? form.facturaFotoDataUrl
                        ? "Lista"
                        : "Pendiente"
                      : "No aplica"}
                  </strong>
                </div>
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Cedula financiera
                  </span>
                  <strong>
                    {esServicioFinanciera(form.servicio)
                      ? form.clienteSinCedulaFisica
                        ? "Marcada sin cedula"
                        : form.cedulaFrenteDataUrl && form.cedulaReversoDataUrl
                          ? "Lista"
                          : "Pendiente"
                      : "No aplica"}
                  </strong>
                </div>
              </div>

              <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur sm:flex-row sm:justify-end md:-mx-8 md:px-8">
                <button
                  type="button"
                  onClick={() => setConfirmacionGuardadoVisible(false)}
                  className="rounded-2xl border border-slate-300 bg-white px-6 py-4 text-sm font-black text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Corregir datos
                </button>
                <button
                  type="button"
                  onClick={() => void guardarRegistro(true)}
                  disabled={guardando}
                  className="rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {guardando ? "Guardando..." : "Confirmar y guardar"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      <div className="mx-auto max-w-[1500px]">
        <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.28),transparent_34%),linear-gradient(135deg,#0f172a_0%,#111827_58%,#164e63_100%)] px-6 py-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Hoja digital
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                {registroEditando ? "MODIFICAR REGISTRO" : "REGISTRAR VENTA"}
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                {registroEditandoConvertido
                  ? "Corrige datos basicos del cliente y del tramite sin alterar la venta, el inventario ni los valores ya procesados."
                  : registroEditando
                  ? "Actualiza la informacion del tramite, las financieras, la validacion del cliente y la entrega del equipo."
                  : "Captura digital del tramite, las financieras, la validacion del cliente y la entrega del equipo en un solo registro."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[410px]">
              <Link
                href="/vendedor/lista-precios"
                className="rounded-[18px] border border-white/10 bg-white px-5 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-slate-100"
              >
                LISTA DE PRECIOS
              </Link>
              {puedeBuscarRegistros && (
                <Link
                  href="/vendedor/registros/buscar"
                  className="rounded-[18px] border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Buscar registro
                </Link>
              )}
              {registroEditando && (
                <button
                  type="button"
                  onClick={() => limpiarFormulario(false)}
                  className="rounded-[18px] border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Cancelar edicion
                </button>
              )}
              <Link
                href="/dashboard"
                className="rounded-[18px] border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver a CONECTAMOS
              </Link>
            </div>
          </div>
        </section>

        {(registroEditando || cargandoEdicion) && (
          <section className="mt-6 rounded-[30px] border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Edicion activa
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-950">
                  {cargandoEdicion
                    ? "Cargando datos del registro..."
                    : `Estas editando el registro #${registroEditando?.id ?? ""} de ${registroEditando?.clienteNombre ?? "cliente"}.`}
                </p>
                {registroEditandoConvertido && (
                  <p className="mt-2 text-sm font-semibold text-amber-800">
                    Este registro ya esta convertido en venta: quedan bloqueados
                    IMEI, sede, financieras, ingresos, jalador y evidencia.
                  </p>
                )}
              </div>

              {registroEditando && puedeBuscarRegistros && (
                <Link
                  href="/vendedor/registros/buscar"
                  className="rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-center text-sm font-semibold text-emerald-800 transition hover:border-emerald-400"
                >
                  Volver a buscar
                </Link>
              )}
            </div>
          </section>
        )}

        {mensaje && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 text-sm font-medium shadow-sm ${
              mensajeTipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-[20px] border border-teal-100 bg-teal-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-700">
                01 Punto
              </p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {form.puntoVenta || "Sin seleccionar"}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                02 Cliente
              </p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {form.clienteNombre || "Pendiente"}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                03 Equipo
              </p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {form.serialImei || "Sin IMEI"}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                04 Venta
              </p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {form.servicio || "Sin tipo"}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                01 Cliente, punto e IMEI
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Ciudad
                  <input
                    value={form.ciudad}
                    disabled={registroEditandoConvertido}
                    onChange={(event) => setField("ciudad", event.target.value)}
                    className={inputClass(registroEditandoConvertido)}
                    placeholder="Ciudad"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Punto de venta
                  <select
                    value={form.puntoVenta}
                    disabled={registroEditandoConvertido}
                    onChange={(event) => setField("puntoVenta", event.target.value)}
                    className={inputClass(registroEditandoConvertido)}
                  >
                    {puntosVenta.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2 grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end">
                    <label className="flex-1 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      IMEI
                      <input
                        value={form.serialImei}
                        disabled={registroEditandoConvertido}
                        onChange={(event) => {
                          const nextImei = onlyDigits(event.target.value, 15);

                          autoPayJoyConsultaRef.current = {};
                          setForm((current) => ({
                            ...current,
                            serialImei: nextImei,
                            financierasDetalle: current.financierasDetalle.map(
                              (item) =>
                                esPlataformaPayJoy(item.plataformaCredito)
                                  ? {
                                      ...item,
                                      creditoAutorizado: "",
                                      valorCuota: "",
                                      numeroCuotas: "",
                                      frecuenciaCuota: "",
                                    }
                                  : item
                            ),
                          }));
                          setPayjoyCreditos({});
                          setPayjoyErrores({});
                          setImeiDetalle("");
                        }}
                        onBlur={() => {
                          if (!registroEditandoConvertido && form.serialImei.length === 15) {
                            void buscarImei();
                          }
                        }}
                        className={inputClass(registroEditandoConvertido)}
                        placeholder="15 digitos"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void buscarImei()}
                      disabled={
                        registroEditandoConvertido ||
                        buscandoImei ||
                        form.serialImei.length !== 15
                      }
                      className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {buscandoImei ? "Consultando..." : "Buscar IMEI"}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                    {imeiDetalle ||
                      "Cuando el IMEI exista en cualquier sede o en bodega principal, se completara la informacion disponible del equipo."}
                  </div>
                  {verificandoDuplicado && (
                    <p className="text-xs font-semibold text-amber-700">
                      Verificando si esta cedula e IMEI ya existen en el
                      sistema...
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <p className="mb-2 text-sm font-semibold text-slate-700">
                    Tipo de venta
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SERVICIO_REGISTRO_OPTIONS.map((option) => {
                      const active = form.servicio === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={registroEditandoConvertido}
                          onClick={() => seleccionarServicio(option.value)}
                          className={`rounded-2xl border px-4 py-4 text-left text-sm font-black transition ${
                            active
                              ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                          } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Nombre del cliente
                  <input
                    value={form.clienteNombre}
                    onChange={(event) => setField("clienteNombre", event.target.value)}
                    className={inputClass()}
                    placeholder="Nombre completo"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Tipo de documento
                  <select
                    value={form.tipoDocumento}
                    onChange={(event) => setField("tipoDocumento", event.target.value)}
                    className={inputClass()}
                  >
                    {TIPOS_DOCUMENTO_CLIENTE.filter(
                      (item) =>
                        esServicioContado(form.servicio) ||
                        item !== TIPO_DOCUMENTO_CONTADO
                    ).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Numero de documento
                  <input
                    value={form.documentoNumero}
                    onChange={(event) => {
                      const documento = onlyDigits(event.target.value);

                      setCreditosFinancierasCedula({});
                      setCreditosCedulaError("");
                      autoCreditosCedulaConsultaRef.current = "";
                      setForm((current) => ({
                        ...current,
                        documentoNumero: documento,
                        financierasDetalle: current.financierasDetalle.map(
                          (item) =>
                            esPlataformaConsultaCedula(item.plataformaCredito)
                              ? {
                                  ...item,
                                  creditoAutorizado: "",
                                  valorCuota: "",
                                  numeroCuotas: "",
                                  frecuenciaCuota: "",
                                }
                              : item
                        ),
                      }));
                    }}
                    className={inputClass()}
                    placeholder="Documento"
                  />
                  {verificandoListaNegra && (
                    <span className="text-xs font-semibold text-slate-500">
                      Verificando lista negra...
                    </span>
                  )}
                  {consultandoCreditosCedula && (
                    <span className="text-xs font-semibold text-emerald-700">
                      Consultando creditos financieros...
                    </span>
                  )}
                  {Object.values(creditosFinancierasCedula).length > 0 && (
                    <span className="text-xs font-semibold text-emerald-700">
                      {Object.values(creditosFinancierasCedula)
                        .map(
                          (credito) =>
                            `${credito.financiera}: ${formatMoney(
                              credito.creditoAutorizado
                            )}${
                              credito.numeroCuotas
                                ? ` | ${credito.numeroCuotas} cuotas`
                                : ""
                            }${
                              credito.valorCuota
                                ? ` | cuota ${formatMoney(credito.valorCuota)}`
                                : ""
                            }`
                        )
                        .join(" - ")}
                    </span>
                  )}
                  {creditosCedulaError && (
                    <span className="text-xs font-semibold text-amber-700">
                      {creditosCedulaError}
                    </span>
                  )}
                </label>

                {(esServicioFinanciera(form.servicio) ||
                  esServicioContado(form.servicio)) && (
                  <>
                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Referencia
                      <input
                        value={form.referenciaEquipo}
                        disabled={registroEditandoConvertido}
                        onChange={(event) =>
                          setField("referenciaEquipo", event.target.value)
                        }
                        className={inputClass(registroEditandoConvertido)}
                        placeholder="Se completa desde el IMEI"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Almacenamiento
                      <input
                        value={form.almacenamiento}
                        disabled={registroEditandoConvertido}
                        onChange={(event) =>
                          setField("almacenamiento", event.target.value)
                        }
                        className={inputClass(registroEditandoConvertido)}
                        placeholder="128 GB"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Color
                      <input
                        value={form.color}
                        disabled={registroEditandoConvertido}
                        onChange={(event) => setField("color", event.target.value)}
                        className={inputClass(registroEditandoConvertido)}
                        placeholder="Color"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Tipo de equipo
                      <select
                        value={form.tipoEquipo}
                        disabled={registroEditandoConvertido}
                        onChange={(event) =>
                          setField("tipoEquipo", event.target.value)
                        }
                        className={inputClass(registroEditandoConvertido)}
                      >
                        <option value="">Selecciona una opcion</option>
                        {TIPO_EQUIPO_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Tipo de producto
                      <select
                        value={form.tipoProducto}
                        disabled={registroEditandoConvertido}
                        onChange={(event) =>
                          setField("tipoProducto", event.target.value)
                        }
                        className={inputClass(registroEditandoConvertido)}
                      >
                        {TIPO_PRODUCTO_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            </section>

            {esServicioFinanciera(form.servicio) && !registroEditandoConvertido && (
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                02 Financiacion del tramite
              </div>

              <div className="mt-6 space-y-4">
                {form.financierasDetalle.map((item, index) => {
                  const shouldShow = index < financierasVisibles;

                  if (!shouldShow) {
                    return null;
                  }
                  const creditoPayJoy = payjoyCreditos[index];
                  const creditoAlo = aloCreditos[index];
                  const creditoCedula =
                    creditoCoincideConPlataforma(
                      creditosFinancierasCedula[index],
                      item.plataformaCredito
                    )
                      ? creditosFinancierasCedula[index]
                      : null;
                  const plataformaConsultaLabel = getPlataformaConsultaLabel(
                    item.plataformaCredito
                  );
                  const bloqueaPlataforma =
                    Boolean(index === 0 && payjoyCreditos[0]) ||
                    Boolean(index === 0 && aloCreditos[0]) ||
                    Boolean(creditoCedula);
                  const bloqueaCredito =
                    esPlataformaConsultaImei(item.plataformaCredito) ||
                    Boolean(creditoCedula);
                  const bloqueaCuotaPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    creditoPayJoy?.valorCuota !== null &&
                    creditoPayJoy?.valorCuota !== undefined;
                  const bloqueaCuotaAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    creditoAlo?.valorCuota !== null &&
                    creditoAlo?.valorCuota !== undefined;
                  const bloqueaCuotaCedula = Boolean(creditoCedula?.valorCuota);
                  const bloqueaPlazoPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    creditoPayJoy?.numeroCuotas !== null &&
                    creditoPayJoy?.numeroCuotas !== undefined;
                  const bloqueaPlazoAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    creditoAlo?.numeroCuotas !== null &&
                    creditoAlo?.numeroCuotas !== undefined;
                  const bloqueaPlazoCedula = Boolean(creditoCedula?.numeroCuotas);
                  const bloqueaFrecuenciaPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    Boolean(creditoPayJoy?.frecuenciaCuota);
                  const bloqueaFrecuenciaAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    Boolean(creditoAlo?.frecuenciaCuota);
                  const bloqueaFrecuenciaCedula =
                    Boolean(creditoCedula?.frecuenciaCuota);

                  return (
                    <div
                      key={`financiera-${index}`}
                      className="rounded-[28px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-bold text-slate-900">
                              Financiera {index + 1}
                            </p>
                            <p className="text-xs text-slate-500">
                              {getDescripcionFinanciera(index)}
                            </p>
                          </div>

                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => resetFinanciera(index)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label className="md:col-span-2 xl:col-span-3 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                          Plataforma de credito utilizada
                          <select
                            value={item.plataformaCredito}
                            disabled={bloqueaPlataforma}
                            onChange={(event) =>
                              seleccionarPlataformaFinanciera(
                                index,
                                event.target.value
                              )
                            }
                            className={inputClass(bloqueaPlataforma)}
                          >
                            <option value="">Selecciona una plataforma</option>
                            {financierasCatalogo.map((option) => (
                              <option key={option.id} value={option.nombre}>
                                {option.nombre}
                              </option>
                            ))}
                          </select>
                        </label>

                        {financierasCatalogo.length === 0 && (
                          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            No hay financieras creadas en el catalogo comercial.
                          </div>
                        )}

                        {item.plataformaCredito && (
                          <>
                            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                              Credito autorizado
                              <input
                                value={item.creditoAutorizado}
                                onChange={(event) =>
                                  setFinancieraPesoField(
                                    index,
                                    "creditoAutorizado",
                                    event.target.value
                                  )
                                }
                                readOnly={esPlataformaPayJoy(
                                  item.plataformaCredito
                                ) || esPlataformaAloCredit(
                                  item.plataformaCredito
                                ) || Boolean(creditoCedula)}
                                className={inputClass(bloqueaCredito)}
                                inputMode="numeric"
                                placeholder={
                                  esPlataformaPayJoy(item.plataformaCredito)
                                    ? "Se completa desde PayJoy"
                                    : esPlataformaAloCredit(item.plataformaCredito)
                                      ? "Se completa desde ALO CREDIT"
                                      : creditoCedula
                                      ? `Se completa desde ${creditoCedula.financiera}`
                                    : "$ 0"
                                }
                              />
                              {esPlataformaPayJoy(item.plataformaCredito) && (
                                <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>
                                      {consultandoPayjoyIndex === index
                                        ? "Consultando credito PayJoy..."
                                        : payjoyCreditos[index]
                                          ? `Credito PayJoy: ${formatMoney(
                                              payjoyCreditos[index]
                                                ?.creditoAutorizado ?? null
                                            )}`
                                          : payjoyErrores[index] ||
                                            "El valor se valida por IMEI en PayJoy."}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void consultarCreditoPayjoy(index)
                                      }
                                      disabled={
                                        consultandoPayjoyIndex === index ||
                                        form.serialImei.length !== 15
                                      }
                                      className="rounded-full border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Consultar
                                    </button>
                                  </div>
                                </div>
                              )}
                              {esPlataformaAloCredit(item.plataformaCredito) && (
                                <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>
                                      {consultandoAloIndex === index
                                        ? "Consultando credito ALO CREDIT..."
                                        : aloCreditos[index]
                                          ? `Credito ALO CREDIT: ${formatMoney(
                                              aloCreditos[index]
                                                ?.creditoAutorizado ?? null
                                            )}`
                                          : aloErrores[index] ||
                                            "El valor se valida por IMEI en ALO CREDIT."}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void consultarCreditoAlo(index)
                                      }
                                      disabled={
                                        consultandoAloIndex === index ||
                                        form.serialImei.length !== 15
                                      }
                                      className="rounded-full border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Consultar
                                    </button>
                                  </div>
                                </div>
                              )}
                              {esPlataformaConsultaCedula(
                                item.plataformaCredito
                              ) && (
                                <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>
                                      {consultandoCreditosCedula
                                        ? `Consultando credito ${plataformaConsultaLabel}...`
                                        : creditoCedula
                                          ? `Credito ${creditoCedula.financiera}: ${formatMoney(
                                              creditoCedula.creditoAutorizado
                                            )}`
                                          : creditosCedulaError ||
                                            `El valor se consulta por cedula en ${plataformaConsultaLabel}.`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void consultarCreditosFinancierasCedula()
                                      }
                                      disabled={
                                        consultandoCreditosCedula ||
                                        form.documentoNumero.length < 5
                                      }
                                      className="rounded-full border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Consultar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </label>

                            {financieraMuestraInicial(index) && (
                                <>
                                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                                    Inicial
                                  <input
                                    value={item.cuotaInicial}
                                    onChange={(event) =>
                                      setFinancieraPesoField(
                                        index,
                                        "cuotaInicial",
                                        event.target.value
                                      )
                                    }
                                    className={inputClass()}
                                    inputMode="numeric"
                                    placeholder="$ 0"
                                  />
                                </label>

                                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                                  {index === 0 && ingresoContado2Visible
                                    ? "Tipo ingreso 1"
                                    : "Tipo de pago de la inicial"}
                                  <select
                                    value={item.tipoPagoInicial}
                                    onChange={(event) =>
                                      setFinancieraField(
                                        index,
                                        "tipoPagoInicial",
                                        event.target.value
                                      )
                                    }
                                    className={inputClass()}
                                  >
                                    <option value="">Selecciona una opcion</option>
                                    {MEDIOS_PAGO_REGISTRO_VENTA.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                {index === 0 && (
                                  <div className="md:col-span-2 xl:col-span-3 rounded-[24px] border border-slate-200 bg-white p-4">
                                    {!ingresoContado2Visible ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!form.medioPago1Valor && item.cuotaInicial) {
                                            setField("medioPago1Valor", item.cuotaInicial);
                                          }
                                          setIngresoContado2Visible(true);
                                        }}
                                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                                      >
                                        + Agregar segundo ingreso
                                      </button>
                                    ) : (
                                      <div className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-3">
                                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                                            Valor ingreso 1
                                            <input
                                              value={form.medioPago1Valor}
                                              onChange={(event) =>
                                                setField(
                                                  "medioPago1Valor",
                                                  formatearPesoInput(event.target.value)
                                                )
                                              }
                                              className={inputClass()}
                                              inputMode="numeric"
                                              placeholder="$ 0"
                                            />
                                          </label>

                                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                                            Valor ingreso 2
                                            <input
                                              value={form.medioPago2Valor}
                                              onChange={(event) =>
                                                setField(
                                                  "medioPago2Valor",
                                                  formatearPesoInput(event.target.value)
                                                )
                                              }
                                              className={inputClass()}
                                              inputMode="numeric"
                                              placeholder="$ 0"
                                            />
                                          </label>

                                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                                            Tipo ingreso 2
                                            <select
                                              value={form.medioPago2Tipo}
                                              onChange={(event) =>
                                                setField("medioPago2Tipo", event.target.value)
                                              }
                                              className={inputClass()}
                                            >
                                              <option value="">Selecciona una opcion</option>
                                              {MEDIOS_PAGO_REGISTRO_VENTA.map((option) => (
                                                <option key={option} value={option}>
                                                  {option}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                            Suma ingresos:{" "}
                                            {formatMoney(totalIngresosInicialFinanciera(form))}
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setIngresoContado2Visible(false);
                                              setField("medioPago1Valor", "");
                                              setField("medioPago2Tipo", "");
                                              setField("medioPago2Valor", "");
                                            }}
                                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                                          >
                                            Quitar segundo ingreso
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                              Valor cuota
                              <input
                                value={item.valorCuota}
                                onChange={(event) =>
                                  setFinancieraPesoField(
                                    index,
                                    "valorCuota",
                                    event.target.value
                                  )
                                }
                                className={inputClass(
                                  bloqueaCuotaPayJoy ||
                                    bloqueaCuotaAlo ||
                                    bloqueaCuotaCedula
                                )}
                                readOnly={
                                  bloqueaCuotaPayJoy ||
                                  bloqueaCuotaAlo ||
                                  bloqueaCuotaCedula
                                }
                                inputMode="numeric"
                                placeholder={
                                  bloqueaCuotaPayJoy
                                    ? "Se completa desde PayJoy"
                                    : bloqueaCuotaAlo
                                      ? "Se completa desde ALO CREDIT"
                                      : bloqueaCuotaCedula
                                      ? `Se completa desde ${creditoCedula?.financiera}`
                                    : "$ 0"
                                }
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                              Plazo
                              <select
                                value={item.numeroCuotas}
                                disabled={
                                  bloqueaPlazoPayJoy ||
                                  bloqueaPlazoAlo ||
                                  bloqueaPlazoCedula
                                }
                                onChange={(event) =>
                                  setFinancieraField(
                                    index,
                                    "numeroCuotas",
                                    event.target.value
                                  )
                                }
                                className={inputClass(
                                  bloqueaPlazoPayJoy ||
                                    bloqueaPlazoAlo ||
                                    bloqueaPlazoCedula
                                )}
                              >
                                <option value="">1 a 48 cuotas</option>
                                {PLAZO_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                              Frecuencia de pago
                              <select
                                value={item.frecuenciaCuota}
                                disabled={
                                  bloqueaFrecuenciaPayJoy ||
                                  bloqueaFrecuenciaAlo ||
                                  bloqueaFrecuenciaCedula
                                }
                                onChange={(event) =>
                                  setFinancieraField(
                                    index,
                                    "frecuenciaCuota",
                                    event.target.value
                                  )
                                }
                                className={inputClass(
                                  bloqueaFrecuenciaPayJoy ||
                                    bloqueaFrecuenciaAlo ||
                                    bloqueaFrecuenciaCedula
                                )}
                              >
                                <option value="">Selecciona una frecuencia</option>
                                {FRECUENCIAS_CUOTA.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-wrap gap-3">
                  {financierasVisibles < MAX_FINANCIERAS_REGISTRO && (
                    <button
                      type="button"
                      onClick={() =>
                        setFinancierasVisibles((current) =>
                          Math.min(MAX_FINANCIERAS_REGISTRO, current + 1)
                        )
                      }
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Agregar financiera
                    </button>
                  )}

                  {financierasVisibles > 1 && (
                    <button
                      type="button"
                      onClick={quitarUltimaFinanciera}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                    >
                      Quitar ultima financiera
                    </button>
                  )}
                </div>
              </div>
            </section>
            )}

            {esServicioContado(form.servicio) && !registroEditandoConvertido && (
              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  02 Ingresos del contado
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Valor ingreso
                    <input
                      value={form.medioPago1Valor}
                      onChange={(event) =>
                        setField("medioPago1Valor", formatearPesoInput(event.target.value))
                      }
                      className={inputClass()}
                      inputMode="numeric"
                      placeholder="$ 0"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Tipo de ingreso
                    <select
                      value={form.medioPago1Tipo}
                      onChange={(event) => setField("medioPago1Tipo", event.target.value)}
                      className={inputClass()}
                    >
                      {MEDIOS_PAGO_REGISTRO_VENTA.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Total contado
                    </p>
                    <p className="mt-2 text-xl font-black text-emerald-700">
                      {formatMoney(totalIngresosContado(form))}
                    </p>
                  </div>
                </div>

                {!ingresoContado2Visible ? (
                  <button
                    type="button"
                    onClick={() => setIngresoContado2Visible(true)}
                    className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    Agregar segundo ingreso
                  </button>
                ) : (
                  <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Segundo valor
                        <input
                          value={form.medioPago2Valor}
                          onChange={(event) =>
                            setField("medioPago2Valor", formatearPesoInput(event.target.value))
                          }
                          className={inputClass()}
                          inputMode="numeric"
                          placeholder="$ 0"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Tipo segundo ingreso
                        <select
                          value={form.medioPago2Tipo}
                          onChange={(event) =>
                            setField("medioPago2Tipo", event.target.value)
                          }
                          className={inputClass()}
                        >
                          <option value="">Selecciona una opcion</option>
                          {MEDIOS_PAGO_REGISTRO_VENTA.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIngresoContado2Visible(false);
                        setField("medioPago2Tipo", "");
                        setField("medioPago2Valor", "");
                      }}
                      className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                    >
                      Quitar segundo ingreso
                    </button>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                03 Contacto, fechas y referencias
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Correo
                    <input
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      value={form.correo}
                      onChange={(event) => setField("correo", event.target.value)}
                      className={inputClass()}
                      placeholder="cliente@gmail.com"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    WhatsApp
                    <input
                      inputMode="numeric"
                      maxLength={10}
                      value={form.whatsapp}
                      onChange={(event) =>
                        setField("whatsapp", onlyDigits(event.target.value, 10))
                      }
                      className={inputClass()}
                      placeholder="3001234567"
                    />
                  </label>

                {esServicioFinanciera(form.servicio) && (
                  <>
                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Telefono
                      <input
                        value={form.telefono}
                        onChange={(event) =>
                          setField("telefono", onlyDigits(event.target.value))
                        }
                        className={inputClass()}
                        placeholder="Telefono principal"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Barrio
                      <input
                        value={form.barrio}
                        onChange={(event) => setField("barrio", event.target.value)}
                        className={inputClass()}
                        placeholder="Barrio"
                      />
                    </label>
                  </>
                )}

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={form.fechaNacimiento}
                    onChange={(event) =>
                      setField("fechaNacimiento", event.target.value)
                    }
                    className={inputClass()}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Fecha de expedicion
                  <input
                    type="date"
                    value={form.fechaExpedicion}
                    onChange={(event) =>
                      setField("fechaExpedicion", event.target.value)
                    }
                    className={inputClass()}
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Direccion
                  <input
                    value={form.direccion}
                    onChange={(event) => setField("direccion", event.target.value)}
                    className={inputClass()}
                    placeholder="Direccion completa"
                  />
                </label>

                {esServicioFinanciera(form.servicio) && (
                  <div className="md:col-span-2 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">
                      Referencias familiares
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Referencia familiar 1
                        <input
                          value={form.referenciaFamiliar1Nombre}
                          onChange={(event) =>
                            setField("referenciaFamiliar1Nombre", event.target.value)
                          }
                          className={inputClass()}
                          placeholder="Nombre completo"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Telefono referencia 1
                        <input
                          value={form.referenciaFamiliar1Telefono}
                          onChange={(event) =>
                            setField(
                              "referenciaFamiliar1Telefono",
                              onlyDigits(event.target.value)
                            )
                          }
                          className={inputClass()}
                          placeholder="Telefono"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Referencia familiar 2
                        <input
                          value={form.referenciaFamiliar2Nombre}
                          onChange={(event) =>
                            setField("referenciaFamiliar2Nombre", event.target.value)
                          }
                          className={inputClass()}
                          placeholder="Nombre completo"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Telefono referencia 2
                        <input
                          value={form.referenciaFamiliar2Telefono}
                          onChange={(event) =>
                            setField(
                              "referenciaFamiliar2Telefono",
                              onlyDigits(event.target.value)
                            )
                          }
                          className={inputClass()}
                          placeholder="Telefono"
                        />
                      </label>
                    </div>
                  </div>
                )}

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Registro SIM 1
                  <input
                    value={form.simCardRegistro1}
                    onChange={(event) =>
                      setField("simCardRegistro1", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Opcional"
                  />
                </label>

                {esServicioFinanciera(form.servicio) && (
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Registro SIM 2
                    <input
                      value={form.simCardRegistro2}
                      onChange={(event) =>
                        setField("simCardRegistro2", event.target.value)
                      }
                      className={inputClass()}
                      placeholder="Opcional"
                    />
                  </label>
                )}
              </div>
            </section>

            {!registroEditandoConvertido && (
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                04 Confirmaciones del cliente
              </div>

              {(esServicioFinanciera(form.servicio) ||
                esServicioContado(form.servicio)) && (
                <div className="mt-6 space-y-4">
                  {TEXTOS_VISIBLES_CLIENTE.filter(
                    (_, index) => esServicioFinanciera(form.servicio) || index < 2
                  ).map((texto, index) => {
                    const field: ConsentField =
                      index === 0
                        ? "aceptaDeclaracionIntermediacion"
                        : index === 1
                          ? "aceptaPoliticaGarantia"
                          : "aceptaCondicionesCredito";

                    return (
                      <label
                        key={field}
                        className="flex items-start gap-4 rounded-[26px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={form[field]}
                          onChange={(event) =>
                            setField(field, event.target.checked)
                          }
                          className="mt-1 h-4 w-4"
                        />
                        <span className="leading-6">{texto}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.92fr)]">
                <SignaturePad
                  key={signaturePadKey}
                  value={form.firmaClienteDataUrl}
                  onChange={(dataUrl) => setField("firmaClienteDataUrl", dataUrl)}
                />

                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Foto con entrega del producto
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void abrirCamara()}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Abrir camara
                    </button>

                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                    >
                      {cargandoFoto ? "Procesando..." : "Subir imagen"}
                    </button>

                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => void cargarFotoEntrega(event)}
                      className="hidden"
                    />
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    Abrir camara usa la camara del dispositivo. Subir imagen
                    permite seleccionar una foto guardada en el equipo.
                  </p>

                  {errorCamara && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {errorCamara}
                    </div>
                  )}

                  {camaraAbierta && (
                    <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-3">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-72 w-full rounded-2xl bg-slate-950 object-cover"
                      />

                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={capturarFotoDesdeCamara}
                          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                        >
                          Capturar foto
                        </button>

                        <button
                          type="button"
                          onClick={detenerCamara}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                        >
                          Cerrar camara
                        </button>
                      </div>
                    </div>
                  )}

                  {form.fotoEntregaDataUrl && (
                    <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.fotoEntregaDataUrl}
                        alt="Foto de entrega"
                        className="h-64 w-full rounded-2xl object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              {esServicioContado(form.servicio) && (
                <div className="mt-5 rounded-[28px] border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-emerald-950">
                        Foto de la factura
                      </p>
                      <p className="mt-1 text-xs text-emerald-800">
                        Obligatoria para ventas de contado.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => facturaInputRef.current?.click()}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {cargandoFoto ? "Procesando..." : "Subir factura"}
                    </button>
                    <input
                      ref={facturaInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        void cargarImagenCampo(
                          event,
                          "facturaFotoDataUrl",
                          "la foto de la factura"
                        )
                      }
                      className="hidden"
                    />
                  </div>

                  {form.facturaFotoDataUrl && (
                    <div className="mt-4 rounded-3xl border border-emerald-100 bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.facturaFotoDataUrl}
                        alt="Foto de factura"
                        className="h-64 w-full rounded-2xl object-cover"
                      />
                    </div>
                  )}
                </div>
              )}

              {esServicioFinanciera(form.servicio) && (
                <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        Cedula del cliente
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Sube ambos lados de la cedula. Si el cliente no la trae
                        fisicamente, marca la excepcion.
                      </p>
                    </div>
                    <label className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                      <input
                        type="checkbox"
                        checked={form.clienteSinCedulaFisica}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            clienteSinCedulaFisica: event.target.checked,
                            cedulaFrenteDataUrl: event.target.checked
                              ? ""
                              : current.cedulaFrenteDataUrl,
                            cedulaReversoDataUrl: event.target.checked
                              ? ""
                              : current.cedulaReversoDataUrl,
                          }))
                        }
                        className="h-4 w-4"
                      />
                      Cliente no trae cedula
                    </label>
                  </div>

                  {!form.clienteSinCedulaFisica && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-700">
                            Frente
                          </p>
                          <button
                            type="button"
                            onClick={() => cedulaFrenteInputRef.current?.click()}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-slate-500"
                          >
                            Subir frente
                          </button>
                          <input
                            ref={cedulaFrenteInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              void cargarImagenCampo(
                                event,
                                "cedulaFrenteDataUrl",
                                "la foto frontal de la cedula"
                              )
                            }
                            className="hidden"
                          />
                        </div>
                        {form.cedulaFrenteDataUrl && (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={form.cedulaFrenteDataUrl}
                            alt="Cedula frente"
                            className="mt-4 h-44 w-full rounded-2xl object-cover"
                          />
                          </>
                        )}
                      </div>

                      <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-700">
                            Reverso
                          </p>
                          <button
                            type="button"
                            onClick={() => cedulaReversoInputRef.current?.click()}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-slate-500"
                          >
                            Subir reverso
                          </button>
                          <input
                            ref={cedulaReversoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              void cargarImagenCampo(
                                event,
                                "cedulaReversoDataUrl",
                                "la foto posterior de la cedula"
                              )
                            }
                            className="hidden"
                          />
                        </div>
                        {form.cedulaReversoDataUrl && (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={form.cedulaReversoDataUrl}
                            alt="Cedula reverso"
                            className="mt-4 h-44 w-full rounded-2xl object-cover"
                          />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
            )}

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                06 Equipo comercial y observaciones
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Asesor
                  <input value={form.asesorNombre} readOnly className={inputClass(true)} />
                </label>

                {jaladores.length > 0 ? (
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Jalador
                    <select
                      value={form.jaladorNombre}
                      disabled={registroEditandoConvertido}
                      onChange={(event) => setField("jaladorNombre", event.target.value)}
                      className={inputClass(registroEditandoConvertido)}
                    >
                      <option value="">Selecciona un jalador</option>
                      {jaladores.map((item) => (
                        <option key={item.id} value={item.nombre}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Jalador
                    <input
                      value={form.jaladorNombre}
                      disabled={registroEditandoConvertido}
                      onChange={(event) => setField("jaladorNombre", event.target.value)}
                      className={inputClass(registroEditandoConvertido)}
                      placeholder="Nombre del jalador"
                    />
                  </label>
                )}

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Observacion
                  <textarea
                    value={form.observacion}
                    onChange={(event) => setField("observacion", event.target.value)}
                    className={`${inputClass()} min-h-28 resize-y`}
                    placeholder="Comentarios adicionales del tramite"
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="bg-slate-950 px-5 py-5 text-white">
                <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                Revision en vivo
              </div>
                <p className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-teal-200">
                  Punto de venta
                </p>
                <p className="mt-1 text-2xl font-black tracking-tight">
                  {form.puntoVenta || "Sin seleccionar"}
                </p>
              </div>

              <div className="space-y-3 p-5 text-sm text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Tipo
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.servicio || "Pendiente"}
                  </span>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Financieras
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {esServicioContado(form.servicio)
                      ? "No aplica"
                      : `${financierasVisibles} / ${MAX_FINANCIERAS_REGISTRO}`}
                  </span>
                </div>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Cliente
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.clienteNombre || "Pendiente"}
                  </span>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    IMEI
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.serialImei || "Pendiente"}
                  </span>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Jalador
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.jaladorNombre || "Pendiente"}
                  </span>
                </div>

                {esServicioContado(form.servicio) ? (
                  <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-emerald-700">
                      Ingresos
                    </span>
                    <span className="mt-1 block font-semibold text-emerald-800">
                      {formatMoney(totalIngresosContado(form))}
                    </span>
                  </div>
                ) : null}

              <button
                type="button"
                onClick={() => void guardarRegistro()}
                disabled={guardando || cargando || cargandoEdicion}
                className="mt-5 w-full rounded-[18px] bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando
                  ? registroEditando
                    ? "Guardando cambios..."
                    : "Guardando..."
                  : registroEditando
                    ? "Guardar cambios del registro"
                    : "Guardar registro digital"}
              </button>
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Registros recientes
              </div>

              <div className="mt-5 space-y-3">
                {cargando && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Cargando registros...
                  </div>
                )}

                {!cargando && registros.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Aun no hay registros guardados.
                  </div>
                )}

                {registros.map((registro) => (
                  <article
                    key={registro.id}
                    className="rounded-[26px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {registro.clienteNombre}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {registro.puntoVenta || "Sin punto"} |{" "}
                          {esServicioContado(registro.plataformaCredito)
                            ? "CONTADO"
                            : registro.plataformaCredito}
                        </p>
                      </div>

                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        #{registro.id}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-slate-600">
                      <span>IMEI: {registro.serialImei || "Sin IMEI"}</span>
                      <span>Referencia: {registro.referenciaEquipo || "Sin referencia"}</span>
                      <span>Jalador: {registro.jaladorNombre || "Sin jalador"}</span>
                      {esServicioContado(registro.plataformaCredito) ? (
                        <>
                          <span>
                            Ingreso:{" "}
                            {formatMoney(
                              (registro.medioPago1Valor ?? 0) +
                                (registro.medioPago2Valor ?? 0)
                            )}
                          </span>
                          <span>
                            Detalle:{" "}
                            {[registro.medioPago1Tipo, registro.medioPago2Tipo]
                              .filter(Boolean)
                              .join(" / ") || "Sin detalle"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            Credito: {formatMoney(registro.creditoAutorizado)} | Inicial:{" "}
                            {formatMoney(registro.cuotaInicial)}
                          </span>
                          <span>
                            Cuota: {formatMoney(registro.valorCuota)} | Plazo:{" "}
                            {registro.numeroCuotas || 0}
                          </span>
                          <span>Financieras: {registro.totalFinancieras || 1}</span>
                        </>
                      )}
                      <span>{formatDate(registro.createdAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
