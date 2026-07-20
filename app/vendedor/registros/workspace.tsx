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
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type { RegistroVendedorDetalle } from "./types";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  perfilNombre: string;
  perfilTipo: string;
  perfilTipoLabel: string;
};

type RegistroResumen = {
  id: number;
  clienteNombre: string;
  puntoVenta: string | null;
  plataformaCredito: string;
  referenciaEquipo: string | null;
  serialImei: string | null;
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

type EquipoEncontrado = ImeiLookupResponse["equipo"];
type PasoVenta = 1 | 2 | 3 | 4;
type ErroresCampos = Record<string, string>;

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
    fechaCreacionCredito: string | null;
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
    fechaCreacionCredito: string | null;
    moneda: string | null;
    origen: string;
  };
  error?: string;
};

type FinserpayCreditoResponse = {
  credito?: {
    imei: string;
    financiera: "FINSERPAY";
    clienteNombre: string | null;
    documento: string | null;
    correoElectronico: string | null;
    telefonoCliente: string | null;
    direccionCliente: string | null;
    barrioCliente: string | null;
    fechaNacimiento: string | null;
    fechaExpedicion: string | null;
    referenciaFamiliar1: {
      nombre: string | null;
      telefono: string | null;
    };
    referenciaFamiliar2: {
      nombre: string | null;
      telefono: string | null;
    };
    creditoAutorizado: number;
    valorCuota: number | null;
    numeroCuotas: number | null;
    frecuenciaCuota: string | null;
    fechaCreacionCredito: string | null;
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
  { value: "FINANCIERA", label: "FINANCIADA" },
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
  return `w-full rounded-lg border px-4 py-3.5 text-base font-medium outline-none transition ${
    readOnly
      ? "border-slate-200 bg-slate-100 text-slate-500"
      : "border-slate-300 bg-white text-slate-950 focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
  }`;
}

const formSectionClass =
  "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.055)]";

const formSectionHeaderClass =
  "mb-7 flex items-center justify-between gap-4 text-xl font-black tracking-tight text-slate-950 [&>span:last-child]:hidden";

const fieldLabelClass =
  "flex flex-col gap-2 text-sm font-semibold text-slate-700";

function esEstadoEquipoDisponible(estado: string | null | undefined) {
  return String(estado || "").trim().toUpperCase() === "BODEGA";
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <span role="alert" className="text-sm font-semibold text-[#c4000c]">
      {message}
    </span>
  );
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

function applyFinserpayCreditoToFinancialState(
  item: FinancialFormState,
  credito: NonNullable<FinserpayCreditoResponse["credito"]>,
  plataformaCredito = "FINSERPAY"
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

function resolveFinserpayPlatformName(
  catalogo: FinancieraCatalogoOption[],
  fallback = "FINSERPAY"
) {
  const option = catalogo.find((item) => esPlataformaFinserpay(item.nombre));

  return option?.nombre ?? fallback;
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

function esPlataformaFinserpay(value: unknown) {
  const key = normalizePlatformKey(value);
  return key === "FINSERPAY" || key === "FINSER";
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
    !["VENDEDOR", "APOYO_OPERATIVO"].includes(
      String(session.perfilTipo || "").trim().toUpperCase()
    );
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(() => createInitialState(session));
  const [sedes, setSedes] = useState<SedeOption[]>([]);
  const [jaladores, setJaladores] = useState<JaladorOption[]>([]);
  const [financierasCatalogo, setFinancierasCatalogo] = useState<
    FinancieraCatalogoOption[]
  >([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
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
  const [consultandoFinserpayIndex, setConsultandoFinserpayIndex] = useState<
    number | null
  >(null);
  const [finserpayCreditos, setFinserpayCreditos] = useState<
    Record<number, FinserpayCreditoResponse["credito"]>
  >({});
  const [finserpayErrores, setFinserpayErrores] = useState<Record<number, string>>(
    {}
  );
  const autoPayJoyConsultaRef = useRef<Record<number, string>>({});
  const autoAloConsultaRef = useRef<Record<number, string>>({});
  const autoFinserpayConsultaRef = useRef<Record<number, string>>({});
  const consultarPayJoyAutomaticoRef = useRef<
    ((index: number, imeiValue?: string) => Promise<void>) | null
  >(null);
  const consultarAloAutomaticoRef = useRef<
    ((index: number, imeiValue?: string) => Promise<void>) | null
  >(null);
  const consultarFinserpayAutomaticoRef = useRef<
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
  const tipoDocumentoContadoRef = useRef<string | null>(null);
  const contadoDraftRef = useRef<{
    facturaFotoDataUrl: string;
    medioPago1Tipo: string;
    medioPago1Valor: string;
    medioPago2Tipo: string;
    medioPago2Valor: string;
    segundoIngresoVisible: boolean;
  } | null>(null);
  const financieraDraftRef = useRef<{
    cedulaFrenteDataUrl: string;
    cedulaReversoDataUrl: string;
    clienteSinCedulaFisica: boolean;
    financierasDetalle: FinancialFormState[];
    medioPago1Tipo: string;
    medioPago1Valor: string;
    medioPago2Tipo: string;
    medioPago2Valor: string;
    financierasVisibles: number;
    segundoIngresoVisible: boolean;
  } | null>(null);
  const consultarCreditosCedulaAutomaticoRef = useRef<
    ((
      documentoValue: string,
      options?: { silent?: boolean }
    ) => Promise<void>) | null
  >(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [imeiDetalle, setImeiDetalle] = useState("");
  const [equipoEncontrado, setEquipoEncontrado] =
    useState<EquipoEncontrado | null>(null);
  const [pasoActual, setPasoActual] = useState<PasoVenta>(1);
  const [erroresCampos, setErroresCampos] = useState<ErroresCampos>({});
  const [resumenMovilAbierto, setResumenMovilAbierto] = useState(false);
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

  const limpiarFormulario = (preservarContexto = false) => {
    setImeiDetalle("");
    setEquipoEncontrado(null);
    setPasoActual(1);
    setErroresCampos({});
    setListaNegraAlerta(null);
    setListaNegraModalCerrado(false);
    setRegistroDuplicadoAlerta(null);
    setDuplicadoModalCerrado(false);
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
    contadoDraftRef.current = null;
    financieraDraftRef.current = null;
    tipoDocumentoContadoRef.current = null;
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
        const [sedesRes, catalogoRes] = await Promise.all([
          fetch("/api/sedes", { cache: "no-store" }),
          fetch("/api/ventas/catalogo-personal", { cache: "no-store" }),
        ]);

        const [sedesData, catalogoData] = await Promise.all([
          sedesRes.json(),
          catalogoRes.json(),
        ]);

        if (cancelled) {
          return;
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
    setErroresCampos((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const seleccionarServicio = (servicio: string) => {
    if (servicio === form.servicio) return;

    if (esServicioContado(form.servicio)) {
      contadoDraftRef.current = {
        facturaFotoDataUrl: form.facturaFotoDataUrl,
        medioPago1Tipo: form.medioPago1Tipo,
        medioPago1Valor: form.medioPago1Valor,
        medioPago2Tipo: form.medioPago2Tipo,
        medioPago2Valor: form.medioPago2Valor,
        segundoIngresoVisible: ingresoContado2Visible,
      };
    } else if (esServicioFinanciera(form.servicio)) {
      financieraDraftRef.current = {
        cedulaFrenteDataUrl: form.cedulaFrenteDataUrl,
        cedulaReversoDataUrl: form.cedulaReversoDataUrl,
        clienteSinCedulaFisica: form.clienteSinCedulaFisica,
        financierasDetalle: form.financierasDetalle,
        medioPago1Tipo: form.medioPago1Tipo,
        medioPago1Valor: form.medioPago1Valor,
        medioPago2Tipo: form.medioPago2Tipo,
        medioPago2Valor: form.medioPago2Valor,
        financierasVisibles,
        segundoIngresoVisible: ingresoContado2Visible,
      };
    }

    setForm((current) => {
      if (servicio === "CONTADO") {
        const draft = contadoDraftRef.current;

        return {
          ...current,
          servicio,
          tipoDocumento:
            tipoDocumentoContadoRef.current || current.tipoDocumento,
          facturaFotoDataUrl: draft?.facturaFotoDataUrl ?? "",
          medioPago1Tipo: draft?.medioPago1Tipo ?? "EFECTIVO",
          medioPago1Valor: draft?.medioPago1Valor ?? "",
          medioPago2Tipo: draft?.medioPago2Tipo ?? "",
          medioPago2Valor: draft?.medioPago2Valor ?? "",
          cedulaFrenteDataUrl: "",
          cedulaReversoDataUrl: "",
          clienteSinCedulaFisica: false,
          financierasDetalle: Array.from(
            { length: MAX_FINANCIERAS_REGISTRO },
            createEmptyFinanciera
          ),
        };
      }

      if (current.tipoDocumento === TIPO_DOCUMENTO_CONTADO) {
        tipoDocumentoContadoRef.current = current.tipoDocumento;
      }

      const draft = financieraDraftRef.current;

      return {
        ...current,
        servicio,
        tipoDocumento:
          current.tipoDocumento === TIPO_DOCUMENTO_CONTADO
            ? "CC"
            : current.tipoDocumento,
        facturaFotoDataUrl: "",
        medioPago1Tipo: draft?.medioPago1Tipo ?? "EFECTIVO",
        medioPago1Valor: draft?.medioPago1Valor ?? "",
        medioPago2Tipo: draft?.medioPago2Tipo ?? "",
        medioPago2Valor: draft?.medioPago2Valor ?? "",
        cedulaFrenteDataUrl: draft?.cedulaFrenteDataUrl ?? "",
        cedulaReversoDataUrl: draft?.cedulaReversoDataUrl ?? "",
        clienteSinCedulaFisica: draft?.clienteSinCedulaFisica ?? false,
        financierasDetalle:
          draft?.financierasDetalle ??
          Array.from(
            { length: MAX_FINANCIERAS_REGISTRO },
            createEmptyFinanciera
          ),
      };
    });
    if (servicio === "CONTADO") {
      setFinancierasVisibles(1);
      setIngresoContado2Visible(
        contadoDraftRef.current?.segundoIngresoVisible ?? false
      );
    } else {
      setFinancierasVisibles(
        financieraDraftRef.current?.financierasVisibles ?? 1
      );
      setIngresoContado2Visible(
        financieraDraftRef.current?.segundoIngresoVisible ?? false
      );
    }
    setErroresCampos((current) => {
      const next = { ...current };
      delete next.servicio;
      return next;
    });
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
    setErroresCampos((current) => {
      const key = `financiera-${index}-${String(field)}`;
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const setFinancieraPesoField = (
    index: number,
    field: "creditoAutorizado" | "cuotaInicial" | "valorCuota",
    value: string
  ) => {
    const creditoCedula = creditosFinancierasCedula[index];
    const plataformaCredito = form.financierasDetalle[index]?.plataformaCredito;
    const creditoPayJoy = payjoyCreditos[index];
    const creditoAlo = aloCreditos[index];
    const creditoFinserpay = finserpayCreditos[index];

    if (
      (field === "creditoAutorizado" &&
        esPlataformaPayJoy(plataformaCredito) &&
        Boolean(creditoPayJoy)) ||
      (field === "creditoAutorizado" &&
        esPlataformaAloCredit(plataformaCredito) &&
        Boolean(creditoAlo)) ||
      (field === "creditoAutorizado" &&
        esPlataformaFinserpay(plataformaCredito) &&
        Boolean(creditoFinserpay)) ||
      (field === "creditoAutorizado" &&
        creditoCoincideConPlataforma(creditoCedula, plataformaCredito)) ||
      (field === "valorCuota" &&
        esPlataformaFinserpay(plataformaCredito) &&
        finserpayCreditos[index]?.valorCuota !== null &&
        finserpayCreditos[index]?.valorCuota !== undefined) ||
      (field === "valorCuota" &&
        Boolean(creditoCedula?.valorCuota) &&
        creditoCoincideConPlataforma(creditoCedula, plataformaCredito))
    ) {
      return;
    }

    setFinancieraField(index, field, formatearPesoInput(value));
  };

  const limpiarCreditoAutocompletadoSiCoincide = (
    index: number,
    credito?: {
      creditoAutorizado: number;
      valorCuota?: number | null;
      numeroCuotas?: number | null;
      frecuenciaCuota?: string | null;
    }
  ) => {
    if (!credito || credito.creditoAutorizado <= 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      financierasDetalle: current.financierasDetalle.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (
          moneyInputToNumber(item.creditoAutorizado) !==
          Math.round(credito.creditoAutorizado)
        ) {
          return item;
        }

        const valorCuotaAutocompletado =
          credito.valorCuota !== null &&
          credito.valorCuota !== undefined &&
          moneyInputToNumber(item.valorCuota) === Math.round(credito.valorCuota);
        const plazoAutocompletado =
          credito.numeroCuotas !== null &&
          credito.numeroCuotas !== undefined &&
          Number(item.numeroCuotas) === credito.numeroCuotas;
        const frecuenciaAutocompletada =
          credito.frecuenciaCuota &&
          normalizePlatformKey(item.frecuenciaCuota) ===
            normalizePlatformKey(credito.frecuenciaCuota);

        return {
          ...item,
          creditoAutorizado: "",
          valorCuota: valorCuotaAutocompletado ? "" : item.valorCuota,
          numeroCuotas: plazoAutocompletado ? "" : item.numeroCuotas,
          frecuenciaCuota: frecuenciaAutocompletada ? "" : item.frecuenciaCuota,
        };
      }),
    }));
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
        const creditoAnterior = payjoyCreditos[index];

        setPayjoyCreditos((current) => {
          const next = { ...current };
          delete next[index];
          return next;
        });
        limpiarCreditoAutocompletadoSiCoincide(index, creditoAnterior);
        setPayjoyErrores((current) => ({
          ...current,
          [index]:
            data.error ||
            "No se encontro un credito PayJoy creado hoy o ayer para este IMEI",
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
        const creditoAnterior = aloCreditos[index];

        setAloCreditos((current) => {
          const next = { ...current };
          delete next[index];
          return next;
        });
        limpiarCreditoAutocompletadoSiCoincide(index, creditoAnterior);
        setAloErrores((current) => ({
          ...current,
          [index]:
            data.error ||
            "No se encontro un credito ALO CREDIT creado hoy o ayer para este IMEI",
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

  const consultarCreditoFinserpay = async (index: number, imeiValue?: string) => {
    const imei = onlyDigits(imeiValue || form.serialImei, 15);

    if (imei.length !== 15) {
      setFinserpayErrores((current) => ({
        ...current,
        [index]: "Busca primero un IMEI valido de 15 digitos",
      }));
      return;
    }

    try {
      setConsultandoFinserpayIndex(index);
      setFinserpayErrores((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });

      const params = new URLSearchParams({ imei });
      const response = await fetch(
        `/api/vendedor/registros/finserpay-credito?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as FinserpayCreditoResponse;

      if (!response.ok || !data.credito) {
        const creditoAnterior = finserpayCreditos[index];

        setFinserpayCreditos((current) => {
          const next = { ...current };
          delete next[index];
          return next;
        });
        limpiarCreditoAutocompletadoSiCoincide(index, creditoAnterior);
        setFinserpayErrores((current) => ({
          ...current,
          [index]:
            data.error ||
            "No se encontro un credito FINSERPAY creado hoy o ayer para este IMEI",
        }));
        return;
      }

      const creditoFinserpay = data.credito;

      setFinserpayCreditos((current) => ({
        ...current,
        [index]: creditoFinserpay,
      }));
      setForm((current) => {
        if (onlyDigits(current.serialImei, 15) !== imei) {
          return current;
        }

        const telefonoCredito = onlyDigits(
          creditoFinserpay.telefonoCliente || "",
          10
        );
        const documentoCredito = onlyDigits(
          creditoFinserpay.documento || "",
          15
        );
        const referencia1Telefono = onlyDigits(
          creditoFinserpay.referenciaFamiliar1.telefono || "",
          10
        );
        const referencia2Telefono = onlyDigits(
          creditoFinserpay.referenciaFamiliar2.telefono || "",
          10
        );
        const whatsappCredito =
          telefonoCredito.length === 10 ? telefonoCredito : "";

        return {
          ...current,
          clienteNombre:
            current.clienteNombre ||
            creditoFinserpay.clienteNombre ||
            current.clienteNombre,
          documentoNumero:
            current.documentoNumero || documentoCredito || current.documentoNumero,
          correo:
            current.correo ||
            creditoFinserpay.correoElectronico ||
            current.correo,
          whatsapp: current.whatsapp || whatsappCredito || current.whatsapp,
          telefono: current.telefono || telefonoCredito || current.telefono,
          direccion:
            current.direccion ||
            creditoFinserpay.direccionCliente ||
            current.direccion,
          barrio:
            current.barrio ||
            creditoFinserpay.barrioCliente ||
            current.barrio,
          fechaNacimiento:
            current.fechaNacimiento ||
            creditoFinserpay.fechaNacimiento ||
            current.fechaNacimiento,
          fechaExpedicion:
            current.fechaExpedicion ||
            creditoFinserpay.fechaExpedicion ||
            current.fechaExpedicion,
          referenciaFamiliar1Nombre:
            current.referenciaFamiliar1Nombre ||
            creditoFinserpay.referenciaFamiliar1.nombre ||
            current.referenciaFamiliar1Nombre,
          referenciaFamiliar1Telefono:
            current.referenciaFamiliar1Telefono ||
            referencia1Telefono ||
            current.referenciaFamiliar1Telefono,
          referenciaFamiliar2Nombre:
            current.referenciaFamiliar2Nombre ||
            creditoFinserpay.referenciaFamiliar2.nombre ||
            current.referenciaFamiliar2Nombre,
          referenciaFamiliar2Telefono:
            current.referenciaFamiliar2Telefono ||
            referencia2Telefono ||
            current.referenciaFamiliar2Telefono,
          servicio: "FINANCIERA",
          medioPago2Tipo: "",
          medioPago2Valor: "",
          financierasDetalle: current.financierasDetalle.map((item, itemIndex) => {
            if (itemIndex !== index) {
              return item;
            }

            const plataformaFinserpay = esPlataformaFinserpay(
              item.plataformaCredito
            )
              ? item.plataformaCredito
              : resolveFinserpayPlatformName(financierasCatalogo);

            return applyFinserpayCreditoToFinancialState(
              item,
              creditoFinserpay,
              plataformaFinserpay
            );
          }),
        };
      });
    } catch {
      setFinserpayErrores((current) => ({
        ...current,
        [index]: "Error consultando el credito FINSERPAY",
      }));
    } finally {
      setConsultandoFinserpayIndex(null);
    }
  };
  consultarFinserpayAutomaticoRef.current = consultarCreditoFinserpay;

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
    setFinserpayCreditos((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setFinserpayErrores((current) => {
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
    setFinserpayCreditos((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setFinserpayErrores((current) => {
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

  const aplicarCreditoFinserpayPrincipal = (
    credito: NonNullable<FinserpayCreditoResponse["credito"]>
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
    setFinserpayCreditos((current) => ({
      ...current,
      0: credito,
    }));
    setFinserpayErrores((current) => {
      const next = { ...current };
      delete next[0];
      return next;
    });
    setForm((current) => {
      const telefonoCredito = onlyDigits(credito.telefonoCliente || "", 10);
      const documentoCredito = onlyDigits(credito.documento || "", 15);
      const referencia1Telefono = onlyDigits(
        credito.referenciaFamiliar1.telefono || "",
        10
      );
      const referencia2Telefono = onlyDigits(
        credito.referenciaFamiliar2.telefono || "",
        10
      );
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
        direccion:
          current.direccion || credito.direccionCliente || current.direccion,
        barrio: current.barrio || credito.barrioCliente || current.barrio,
        fechaNacimiento:
          current.fechaNacimiento ||
          credito.fechaNacimiento ||
          current.fechaNacimiento,
        fechaExpedicion:
          current.fechaExpedicion ||
          credito.fechaExpedicion ||
          current.fechaExpedicion,
        referenciaFamiliar1Nombre:
          current.referenciaFamiliar1Nombre ||
          credito.referenciaFamiliar1.nombre ||
          current.referenciaFamiliar1Nombre,
        referenciaFamiliar1Telefono:
          current.referenciaFamiliar1Telefono ||
          referencia1Telefono ||
          current.referenciaFamiliar1Telefono,
        referenciaFamiliar2Nombre:
          current.referenciaFamiliar2Nombre ||
          credito.referenciaFamiliar2.nombre ||
          current.referenciaFamiliar2Nombre,
        referenciaFamiliar2Telefono:
          current.referenciaFamiliar2Telefono ||
          referencia2Telefono ||
          current.referenciaFamiliar2Telefono,
        medioPago2Tipo: "",
        medioPago2Valor: "",
        financierasDetalle: current.financierasDetalle.map((item, itemIndex) =>
          itemIndex === 0
            ? applyFinserpayCreditoToFinancialState(
                item,
                credito,
                resolveFinserpayPlatformName(financierasCatalogo)
              )
            : item
        ),
      };
    });
  };

  const detectarCreditoPayjoyPorImei = async (imeiValue: string) => {
    const imei = onlyDigits(imeiValue, 15);

    if (imei.length !== 15) {
      return;
    }

    const params = new URLSearchParams({ imei });
    const errores: string[] = [];
    let creditoAplicado = false;

    const aplicarPrimerCredito = (callback: () => void) => {
      if (creditoAplicado) {
        return false;
      }

      creditoAplicado = true;
      callback();
      return true;
    };

    const registrarError = (
      financiera: string,
      response: Response,
      error?: string
    ) => {
      if (!creditoAplicado && response.status !== 404 && error) {
        errores.push(`${financiera}: ${error}`);
      }
    };

    setConsultandoPayjoyIndex(0);
    setConsultandoFinserpayIndex(0);
    setConsultandoAloIndex(0);

    await Promise.allSettled([
      (async () => {
        try {
          const response = await fetch(
            `/api/vendedor/registros/payjoy-credito?${params.toString()}`,
            { cache: "no-store" }
          );
          const data = (await response.json()) as PayJoyCreditoResponse;

          if (response.ok && data.credito) {
            aplicarPrimerCredito(() => {
              aplicarCreditoPayjoyPrincipal(data.credito!);
              setFormMessage(
                `Este IMEI esta activo en PAYJOY. Se selecciono PAYJOY automaticamente por ${formatMoney(
                  data.credito!.creditoAutorizado
                )}.`,
                "success"
              );
            });
            return;
          }

          registrarError("PAYJOY", response, data.error);
        } catch {
          if (!creditoAplicado) {
            errores.push("Error consultando PayJoy por IMEI");
          }
        } finally {
          setConsultandoPayjoyIndex(null);
        }
      })(),
      (async () => {
        try {
          const response = await fetch(
            `/api/vendedor/registros/finserpay-credito?${params.toString()}`,
            { cache: "no-store" }
          );
          const data = (await response.json()) as FinserpayCreditoResponse;

          if (response.ok && data.credito) {
            aplicarPrimerCredito(() => {
              aplicarCreditoFinserpayPrincipal(data.credito!);
              setFormMessage(
                `Este IMEI esta activo en FINSERPAY. Se selecciono FINSERPAY automaticamente por ${formatMoney(
                  data.credito!.creditoAutorizado
                )}.`,
                "success"
              );
            });
            return;
          }

          registrarError("FINSERPAY", response, data.error);
        } catch {
          if (!creditoAplicado) {
            errores.push("Error consultando FINSERPAY por IMEI");
          }
        } finally {
          setConsultandoFinserpayIndex(null);
        }
      })(),
      (async () => {
        try {
          const response = await fetch(
            `/api/vendedor/registros/alo-credito?${params.toString()}`,
            { cache: "no-store" }
          );
          const data = (await response.json()) as AloCreditoResponse;

          if (response.ok && data.credito) {
            aplicarPrimerCredito(() => {
              aplicarCreditoAloPrincipal(data.credito!);
              setFormMessage(
                `Este IMEI esta activo en ALO CREDIT. Se selecciono ALO CREDIT automaticamente por ${formatMoney(
                  data.credito!.creditoAutorizado
                )}.`,
                "success"
              );
            });
            return;
          }

          registrarError("ALO CREDIT", response, data.error);
        } catch {
          if (!creditoAplicado) {
            errores.push("Error consultando ALO CREDIT por IMEI");
          }
        } finally {
          setConsultandoAloIndex(null);
        }
      })(),
    ]);

    if (!creditoAplicado && errores.length) {
      setFormMessage(errores[0], "error");
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
    const esFinserpay = esPlataformaFinserpay(value);
    const esConsultaCedula = esPlataformaConsultaCedula(value);
    delete autoPayJoyConsultaRef.current[index];
    delete autoAloConsultaRef.current[index];
    delete autoFinserpayConsultaRef.current[index];

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
    setFinserpayCreditos((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setFinserpayErrores((current) => {
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
                esPayjoy || esAloCredit || esFinserpay || esConsultaCedula
                  ? ""
                  : item.creditoAutorizado,
              valorCuota:
                esPayjoy || esAloCredit || esFinserpay || esConsultaCedula
                  ? ""
                  : item.valorCuota,
              numeroCuotas:
                esPayjoy || esAloCredit || esFinserpay || esConsultaCedula
                  ? ""
                  : item.numeroCuotas,
              frecuenciaCuota:
                esPayjoy || esAloCredit || esFinserpay || esConsultaCedula
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

    if (esFinserpay && form.serialImei.length === 15) {
      void consultarCreditoFinserpay(index);
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
        const esFinserpay = esPlataformaFinserpay(item.plataformaCredito);

        if (!esPayjoy && !esAloCredit && !esFinserpay) {
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

        if (esFinserpay) {
          if (autoFinserpayConsultaRef.current[index] === consultaKey) {
            return;
          }

          autoFinserpayConsultaRef.current[index] = consultaKey;
          void consultarFinserpayAutomaticoRef.current?.(index, form.serialImei);
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
    delete autoFinserpayConsultaRef.current[index];
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
    setFinserpayCreditos((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setFinserpayErrores((current) => {
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

  const buscarImei = async (puntoVentaOverride?: string) => {
    if (form.serialImei.length !== 15) {
      setErroresCampos((current) => ({
        ...current,
        serialImei: "El IMEI debe tener 15 digitos",
      }));
      setFormMessage("El IMEI debe tener 15 digitos", "error");
      return;
    }

    try {
      setBuscandoImei(true);
      setFormMessage("", "success");

      const params = new URLSearchParams({
        imei: form.serialImei,
        puntoVenta: puntoVentaOverride ?? form.puntoVenta,
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
        setEquipoEncontrado(null);
        setErroresCampos((current) => ({
          ...current,
          serialImei: data?.error || "No se pudo consultar el IMEI",
        }));
        setFormMessage(
          data?.error || "No se pudo consultar el IMEI",
          "error"
        );
        return;
      }

      const equipo = data.equipo;
      const disponible = esEstadoEquipoDisponible(equipo.estadoActual);

      setEquipoEncontrado(equipo);
      setErroresCampos((current) => {
        const next = { ...current };

        if (disponible) {
          delete next.serialImei;
        } else {
          next.serialImei = `El equipo no esta disponible. Estado actual: ${
            equipo.estadoActual || "sin estado"
          }`;
        }

        return next;
      });

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

      if (!disponible) {
        setFormMessage(
          `El equipo existe, pero no esta disponible para venta. Estado: ${
            equipo.estadoActual || "sin estado"
          }`,
          "error"
        );
        return;
      }

      const financierasPayJoySeleccionadas = form.financierasDetalle
        .slice(0, financierasVisibles)
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => esPlataformaPayJoy(item.plataformaCredito));
      const financierasAloSeleccionadas = form.financierasDetalle
        .slice(0, financierasVisibles)
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => esPlataformaAloCredit(item.plataformaCredito));
      const financierasFinserpaySeleccionadas = form.financierasDetalle
        .slice(0, financierasVisibles)
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => esPlataformaFinserpay(item.plataformaCredito));

      const consultaFinancierasSeleccionadas =
        financierasPayJoySeleccionadas.length > 0 ||
        financierasAloSeleccionadas.length > 0 ||
        financierasFinserpaySeleccionadas.length > 0;

      if (financierasPayJoySeleccionadas.length) {
        financierasPayJoySeleccionadas.forEach(({ index }) => {
          void consultarCreditoPayjoy(index, equipo.imei);
        });
      }

      if (financierasAloSeleccionadas.length) {
        financierasAloSeleccionadas.forEach(({ index }) => {
          void consultarCreditoAlo(index, equipo.imei);
        });
      }

      if (financierasFinserpaySeleccionadas.length) {
        financierasFinserpaySeleccionadas.forEach(({ index }) => {
          void consultarCreditoFinserpay(index, equipo.imei);
        });
      }

      if (!consultaFinancierasSeleccionadas) {
        void detectarCreditoPayjoyPorImei(equipo.imei);
      }
    } catch {
      setImeiDetalle("");
      setEquipoEncontrado(null);
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
        setPasoActual(1);
        setErroresCampos({});
        setEquipoEncontrado(null);
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

  const validarPaso = (paso: PasoVenta) => {
    const errores: ErroresCampos = {};
    const requerido = (field: keyof FormState, message: string) => {
      if (!isTextFilled(String(form[field] ?? ""))) errores[field] = message;
    };

    if (paso === 1 && !registroEditandoConvertido) {
      requerido("ciudad", "La ciudad es obligatoria");
      requerido("puntoVenta", "Selecciona el punto de venta");
      requerido("servicio", "Selecciona contado o financiada");

      if (form.serialImei.length !== 15) {
        errores.serialImei = "El IMEI debe tener 15 digitos";
      } else if (!registroEditando && !equipoEncontrado) {
        errores.serialImei = "Busca el IMEI y confirma que el equipo este disponible";
      } else if (
        equipoEncontrado &&
        !esEstadoEquipoDisponible(equipoEncontrado.estadoActual)
      ) {
        errores.serialImei = `El equipo no esta disponible. Estado: ${
          equipoEncontrado.estadoActual || "sin estado"
        }`;
      }

      requerido("referenciaEquipo", "La referencia es obligatoria");
      requerido("almacenamiento", "El almacenamiento es obligatorio");
      requerido("color", "El color es obligatorio");
      requerido("tipoEquipo", "Selecciona el tipo de equipo");
    }

    if (paso === 2) {
      if (registroEditandoConvertido) {
        requerido("clienteNombre", "El nombre completo es obligatorio");
        requerido("tipoDocumento", "Selecciona el tipo de documento");
        requerido("documentoNumero", "El numero de documento es obligatorio");
        requerido("correo", "El correo es obligatorio");
        if (form.correo && !esCorreoRegistroValido(form.correo)) {
          errores.correo =
            `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`;
        }
        requerido("whatsapp", "El WhatsApp es obligatorio");
        if (form.whatsapp && !esWhatsappRegistroValido(form.whatsapp)) {
          errores.whatsapp = "El WhatsApp debe tener 10 digitos";
        }
        requerido("direccion", "La direccion es obligatoria");
        const errorDocumentoContacto = validarDocumentoDiferenteDeContactos(form);
        if (errorDocumentoContacto) {
          errores.documentoNumero = errorDocumentoContacto;
        }
        return errores;
      }

      requerido("clienteNombre", "El nombre completo es obligatorio");
      requerido("tipoDocumento", "Selecciona el tipo de documento");
      requerido("documentoNumero", "El numero de documento es obligatorio");
      if (listaNegraAlerta) errores.documentoNumero = "CEDULA REPORTADA POR FRAUDE";
      if (registroDuplicadoAlerta) {
        errores.documentoNumero =
          "Esta cedula y este IMEI ya aparecen juntos en el sistema";
      }
      requerido("correo", "El correo es obligatorio");
      if (form.correo && !esCorreoRegistroValido(form.correo)) {
        errores.correo = `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`;
      }
      requerido("whatsapp", "El WhatsApp es obligatorio");
      if (form.whatsapp && !esWhatsappRegistroValido(form.whatsapp)) {
        errores.whatsapp = "El WhatsApp debe tener 10 digitos";
      }
      requerido("fechaNacimiento", "La fecha de nacimiento es obligatoria");
      requerido("fechaExpedicion", "La fecha de expedicion es obligatoria");
      requerido("direccion", "La direccion es obligatoria");
      requerido("simCardRegistro1", "El registro SIM 1 es obligatorio");

      const errorDocumentoContacto = validarDocumentoDiferenteDeContactos(
        esServicioFinanciera(form.servicio)
          ? form
          : { documentoNumero: form.documentoNumero, whatsapp: form.whatsapp }
      );
      if (errorDocumentoContacto) errores.documentoNumero = errorDocumentoContacto;

      if (!registroEditandoConvertido) {
        if (!form.aceptaDeclaracionIntermediacion) {
          errores.aceptaDeclaracionIntermediacion =
            "Debes confirmar la declaracion de intermediacion";
        }
        if (!form.aceptaPoliticaGarantia) {
          errores.aceptaPoliticaGarantia =
            "Debes confirmar la politica de garantia";
        }
        if (!form.firmaClienteDataUrl) {
          errores.firmaClienteDataUrl = "La firma del cliente es obligatoria";
        }
        if (!form.fotoEntregaDataUrl) {
          errores.fotoEntregaDataUrl = "La foto de entrega es obligatoria";
        }
        if (esServicioContado(form.servicio) && !form.facturaFotoDataUrl) {
          errores.facturaFotoDataUrl = "La foto de la factura es obligatoria";
        }
      }

      if (esServicioFinanciera(form.servicio)) {
        requerido("telefono", "El telefono es obligatorio");
        requerido("barrio", "El barrio es obligatorio");
        requerido("referenciaFamiliar1Nombre", "La primera referencia es obligatoria");
        requerido(
          "referenciaFamiliar1Telefono",
          "El telefono de la primera referencia es obligatorio"
        );
        requerido("referenciaFamiliar2Nombre", "La segunda referencia es obligatoria");
        requerido(
          "referenciaFamiliar2Telefono",
          "El telefono de la segunda referencia es obligatorio"
        );
        if (!registroEditandoConvertido && !form.aceptaCondicionesCredito) {
          errores.aceptaCondicionesCredito =
            "Debes confirmar las condiciones del credito";
        }
        if (
          !registroEditandoConvertido &&
          !form.clienteSinCedulaFisica &&
          (!form.cedulaFrenteDataUrl || !form.cedulaReversoDataUrl)
        ) {
          errores.cedula =
            "Adjunta ambos lados de la cedula o marca la excepcion";
        }
      }
    }

    if (paso === 3 && !registroEditandoConvertido) {
      if (esServicioFinanciera(form.servicio)) {
        if (financierasCatalogo.length === 0) {
          errores.financieras = "No hay financieras creadas en el catalogo comercial";
        }

        form.financierasDetalle
          .slice(0, financierasVisibles)
          .forEach((item, index) => {
            if (index > 0 && !detalleFinancieraTieneDatos(item)) return;
            const prefix = `financiera-${index}`;
            if (!isTextFilled(item.plataformaCredito)) {
              errores[`${prefix}-plataformaCredito`] = "Selecciona la plataforma";
            }
            if (!isTextFilled(item.creditoAutorizado)) {
              errores[`${prefix}-creditoAutorizado`] = "Ingresa el credito autorizado";
            }
            const requiereInicial =
              financieraRequiereInicial(index) ||
              isTextFilled(item.cuotaInicial) ||
              isTextFilled(item.tipoPagoInicial);
            if (requiereInicial && !isTextFilled(item.cuotaInicial)) {
              errores[`${prefix}-cuotaInicial`] = "Ingresa la cuota inicial";
            }
            if (requiereInicial && !isTextFilled(item.tipoPagoInicial)) {
              errores[`${prefix}-tipoPagoInicial`] = "Selecciona el pago de la inicial";
            }
            if (!isTextFilled(item.valorCuota)) {
              errores[`${prefix}-valorCuota`] = "Ingresa el valor de la cuota";
            }
            if (!isTextFilled(item.numeroCuotas)) {
              errores[`${prefix}-numeroCuotas`] = "Selecciona el plazo";
            }
            if (!isTextFilled(item.frecuenciaCuota)) {
              errores[`${prefix}-frecuenciaCuota`] = "Selecciona la frecuencia";
            }
          });

        if (ingresoContado2Visible) {
          const inicial = moneyInputToNumber(
            form.financierasDetalle[0]?.cuotaInicial ?? ""
          );
          const ingreso1 = moneyInputToNumber(form.medioPago1Valor);
          const ingreso2 = moneyInputToNumber(form.medioPago2Valor);
          if (ingreso1 <= 0) errores.medioPago1Valor = "Ingresa el primer valor";
          if (!form.medioPago2Tipo) {
            errores.medioPago2Tipo = "Selecciona el segundo tipo de ingreso";
          }
          if (ingreso2 <= 0) errores.medioPago2Valor = "Ingresa el segundo valor";
          if (ingreso1 + ingreso2 !== inicial) {
            errores.ingresosInicial = "La suma de los ingresos debe ser igual a la inicial";
          }
        }
      } else if (esServicioContado(form.servicio)) {
        requerido("medioPago1Tipo", "Selecciona el tipo del ingreso");
        if (moneyInputToNumber(form.medioPago1Valor) <= 0) {
          errores.medioPago1Valor = "Ingresa un valor mayor que cero";
        }
        if (ingresoContado2Visible) {
          requerido("medioPago2Tipo", "Selecciona el segundo tipo de ingreso");
          if (moneyInputToNumber(form.medioPago2Valor) <= 0) {
            errores.medioPago2Valor = "Ingresa un valor mayor que cero";
          }
        }
        if (!form.facturaFotoDataUrl) {
          errores.facturaFotoDataUrl = "La foto de la factura es obligatoria";
        }
      }

      requerido("jaladorNombre", "Selecciona el jalador");
      requerido("observacion", "La observacion es obligatoria");
    }

    return errores;
  };

  const irAlPaso = (paso: PasoVenta) => {
    if (paso > pasoActual) return;
    setErroresCampos({});
    setPasoActual(paso);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const continuarPaso = () => {
    const errores = validarPaso(pasoActual);
    setErroresCampos(errores);

    if (Object.keys(errores).length > 0) {
      setFormMessage("Revisa los campos marcados antes de continuar", "error");
      return;
    }

    setFormMessage("", "success");
    setPasoActual((current) => Math.min(4, current + 1) as PasoVenta);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

  const guardarRegistro = async () => {
    if (guardandoRef.current) return;

    for (const paso of [1, 2, 3] as PasoVenta[]) {
      const erroresPaso = validarPaso(paso);

      if (Object.keys(erroresPaso).length > 0) {
        setErroresCampos(erroresPaso);
        setPasoActual(paso);
        setFormMessage("Revisa los campos marcados antes de guardar", "error");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    const errorValidacion = validarFormularioVisible();

    if (errorValidacion) {
      if (errorValidacion === "CEDULA REPORTADA POR FRAUDE") {
        setListaNegraModalCerrado(false);
      }
      setFormMessage(errorValidacion, "error");
      return;
    }

    try {
      guardandoRef.current = true;
      setGuardando(true);
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

    } catch {
      setFormMessage(
        registroEditando
          ? "Error actualizando el registro"
          : "Error guardando el registro",
        "error"
      );
    } finally {
      guardandoRef.current = false;
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
  const registros: RegistroResumen[] = [];
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/vendedor/registros", icon: "sales", label: "Ventas" },
    { href: "/dashboard/radar", icon: "inventory", label: "Disponibilidad" },
    { href: "/vendedor/lista-precios", icon: "reports", label: "Lista de precios" },
    ...(puedeBuscarRegistros
      ? [
          {
            href: "/vendedor/registros/buscar",
            icon: "approvals" as const,
            label: "Buscar registro",
          },
        ]
      : []),
  ];
  const pasos: Array<{ numero: PasoVenta; titulo: string; detalle: string }> = [
    { numero: 1, titulo: "Equipo", detalle: "Sede, IMEI y tipo" },
    { numero: 2, titulo: "Cliente", detalle: "Datos y evidencias" },
    { numero: 3, titulo: "Pago", detalle: "Ingresos y financieras" },
    { numero: 4, titulo: "Confirmación", detalle: "Revisión y guardado" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-950">
      <DashboardSidebar
        activeHref="/vendedor/registros"
        coverageLabel={session.sedeNombre}
        footerMode="logout"
        items={navigationItems}
      />
      <div className="lg:pl-[252px]">
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
            <div className="bg-red-700 px-6 py-6 text-white">
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
      {false && confirmacionGuardadoVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 px-4 py-6 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[34px] border border-white/20 bg-white shadow-[0_34px_110px_rgba(2,6,23,0.55)]"
          >
            <div className="border-b border-slate-800 bg-slate-950 px-6 py-6 text-white md:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-red-100">
                    Revision antes de guardar
                  </p>
                  <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight md:text-5xl">
                    Confirma la venta
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-200">
                    Esta es la ultima revision. Valida especialmente punto de venta,
                    documento, IMEI y valores antes de guardar el registro.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmacionGuardadoVisible(false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl font-black leading-none text-white transition hover:bg-white/20"
                  aria-label="Cerrar resumen"
                >
                  x
                </button>
              </div>
            </div>

            <div className="max-h-[calc(92vh-166px)] space-y-5 overflow-y-auto bg-slate-50 px-6 py-6 md:px-8">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-700">
                  Punto de venta seleccionado
                </span>
                <p className="mt-3 text-5xl font-black tracking-tight">
                  {form.puntoVenta || "Sin punto de venta"}
                </p>
                <p className="mt-3 text-sm font-bold leading-6 text-amber-800">
                  Si este punto no es correcto, vuelve y corrige antes de guardar.
                </p>
              </div>

                <div className="grid gap-3 rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
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
                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
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

                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
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
                              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
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

              <div className="grid gap-3 rounded-[30px] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950 sm:grid-cols-2 lg:grid-cols-4">
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
                  onClick={() => void guardarRegistro()}
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
      <div className="mx-auto max-w-[1580px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 pb-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-[34px]">
              {registroEditando ? "Modificar registro" : "Registrar venta"}
            </h1>
            <p className="mt-2 max-w-3xl text-[15px] text-slate-500">
              {registroEditandoConvertido
                ? "Corrige los datos permitidos sin alterar la venta, el inventario ni los valores procesados."
                : "Completa la información para crear un nuevo registro"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {puedeBuscarRegistros && (
              <Link
                href="/vendedor/registros/buscar"
                className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                <DashboardIcon name="approvals" className="h-5 w-5" />
                Buscar registro
              </Link>
            )}
            <Link
              href="/vendedor/lista-precios"
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#11161d] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#e30613]"
            >
              <DashboardIcon name="approvals" className="h-5 w-5" />
              Lista de precios
            </Link>
            <div className="ml-1 flex min-h-12 items-center gap-3 px-1">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600 text-white">
                <DashboardIcon name="user" className="h-7 w-7" />
              </span>
              <div className="hidden md:block">
                <p className="max-w-56 truncate text-sm font-bold text-slate-950">
                  {session.perfilTipoLabel} · {session.sedeNombre}
                </p>
              </div>
              <DashboardIcon name="arrow" className="hidden h-4 w-4 rotate-90 text-slate-600 md:block" />
            </div>
          </div>
        </header>

        {cargando && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#e30613]" />
            Cargando sedes, jaladores y financieras...
          </div>
        )}

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

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_7px_22px_rgba(15,23,42,0.045)] sm:px-7">
          <div className="grid gap-5 md:grid-cols-[130px_minmax(0,1fr)] md:items-center">
            <p className="text-sm font-bold text-slate-800">
              Paso {pasoActual} de 4
            </p>
            <ol className="grid grid-cols-4" aria-label="Pasos del registro de venta">
              {pasos.map((paso, index) => {
                const activo = paso.numero === pasoActual;
                const completado = paso.numero < pasoActual;

                return (
                  <li key={paso.numero} className="relative flex justify-center">
                    {index < pasos.length - 1 && (
                      <span className="absolute left-[calc(50%+24px)] right-[calc(-50%+24px)] top-5 h-px bg-slate-200" />
                    )}
                    <button
                      type="button"
                      onClick={() => irAlPaso(paso.numero)}
                      disabled={paso.numero > pasoActual}
                      aria-current={activo ? "step" : undefined}
                      className="relative z-10 flex min-w-0 flex-col items-center gap-2 text-center disabled:cursor-not-allowed"
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-black shadow-sm transition ${
                          activo
                            ? "bg-[#e30613] text-white"
                            : completado
                              ? "bg-slate-950 text-white"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {completado ? "✓" : paso.numero}
                      </span>
                      <span
                        className={`truncate text-xs font-semibold sm:text-sm ${
                          activo ? "text-[#e30613]" : "text-slate-600"
                        }`}
                      >
                        {paso.titulo}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="space-y-6">
            {pasoActual === 1 && (
            <section className={`${formSectionClass} p-6`}>
              <div className={formSectionHeaderClass}>
                <span>Equipo y tipo de venta</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-[#c4000c]">
                  Datos del equipo
                </span>
              </div>

              <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
                <label className={fieldLabelClass}>
                  Punto de venta
                  <select
                    value={form.puntoVenta}
                    disabled={registroEditandoConvertido}
                    onChange={(event) => {
                      const puntoVenta = event.target.value;
                      setField("puntoVenta", puntoVenta);
                      if (form.serialImei.length === 15) {
                        void buscarImei(puntoVenta);
                      }
                    }}
                    className={inputClass(registroEditandoConvertido)}
                  >
                    {puntosVenta.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <FieldError message={erroresCampos.puntoVenta} />
                </label>

                <label className={fieldLabelClass}>
                  Ciudad
                  <input
                    value={form.ciudad}
                    disabled={registroEditandoConvertido}
                    onChange={(event) => setField("ciudad", event.target.value)}
                    className={inputClass(registroEditandoConvertido)}
                    placeholder="Selecciona la ciudad"
                  />
                  <FieldError message={erroresCampos.ciudad} />
                </label>

                <div className="grid gap-2 md:col-span-2">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <label className={`${fieldLabelClass} flex-1`}>
                      IMEI del equipo
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
                          setEquipoEncontrado(null);
                          setErroresCampos((current) => {
                            const next = { ...current };
                            delete next.serialImei;
                            return next;
                          });
                        }}
                        onBlur={() => {
                          if (!registroEditandoConvertido && form.serialImei.length === 15) {
                            void buscarImei();
                          }
                        }}
                        className={inputClass(registroEditandoConvertido)}
                        placeholder="Ingresa los 15 dígitos"
                      />
                      <FieldError message={erroresCampos.serialImei} />
                    </label>

                    <button
                      type="button"
                      onClick={() => void buscarImei()}
                      disabled={
                        registroEditandoConvertido ||
                        buscandoImei ||
                        form.serialImei.length !== 15
                      }
                      className="min-h-[50px] rounded-lg border border-[#e30613] bg-white px-8 text-sm font-black text-[#e30613] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {buscandoImei ? "Consultando..." : "Buscar IMEI"}
                    </button>
                  </div>
                  <p className="flex items-center gap-2 text-xs leading-5 text-slate-500">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold">i</span>
                    La información del equipo se completará automáticamente si el IMEI está registrado.
                  </p>
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
                          className={`flex min-h-12 items-center justify-center gap-3 rounded-lg border px-5 text-sm font-bold transition ${
                            active
                              ? "border-[#e30613] bg-red-50/40 text-[#e30613]"
                              : "border-slate-300 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50"
                          } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500`}
                        >
                          <DashboardIcon
                            name={option.value === "CONTADO" ? "cash" : "sales"}
                            className="h-5 w-5"
                          />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <FieldError message={erroresCampos.servicio} />
                </div>

                <section className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
                  <p className="text-sm font-semibold text-slate-700">Información del equipo</p>
                  <div className="mt-4 grid items-center gap-5 sm:grid-cols-[105px_minmax(0,1fr)]">
                    <div className="mx-auto flex h-28 w-20 items-center justify-center rounded-[18px] border-2 border-slate-500 bg-slate-50 shadow-[0_8px_18px_rgba(15,23,42,0.09)]">
                      <div className="relative h-[104px] w-[72px] rounded-[15px] bg-[linear-gradient(145deg,#ffffff_0%,#f1f3f5_70%,#ffffff_100%)]">
                        <span className="absolute left-1/2 top-1.5 h-1.5 w-8 -translate-x-1/2 rounded-full bg-slate-500" />
                        <span className="absolute bottom-2 left-1/2 h-0.5 w-6 -translate-x-1/2 bg-slate-500" />
                      </div>
                    </div>
                    <div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Referencia", equipoEncontrado?.referencia || "— — —"],
                          ["Color", equipoEncontrado?.color || "— — —"],
                          ["Costo", equipoEncontrado ? formatMoney(equipoEncontrado.costo) : "— — —"],
                          ["Estado", equipoEncontrado?.estadoActual || "— — —"],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-xs font-bold text-slate-600">{label}</p>
                            <p
                              className={`mt-3 text-sm font-black ${
                                label === "Estado" &&
                                equipoEncontrado &&
                                !esEstadoEquipoDisponible(equipoEncontrado.estadoActual)
                                  ? "text-[#c4000c]"
                                  : "text-slate-900"
                              }`}
                            >
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-5 text-xs text-slate-500">
                        {imeiDetalle ||
                          (equipoEncontrado
                            ? "Información encontrada en el inventario."
                            : "La información se mostrará después de buscar el IMEI.")}
                      </p>
                    </div>
                  </div>
                </section>

                {(esServicioFinanciera(form.servicio) ||
                  esServicioContado(form.servicio)) && (
                  <div className="grid gap-4 border-t border-slate-100 pt-5 md:col-span-2 md:grid-cols-2">
                    <h3 className="text-sm font-bold text-slate-800 md:col-span-2">
                      Detalles del producto
                    </h3>
                    <label className={fieldLabelClass}>
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
                      <FieldError message={erroresCampos.referenciaEquipo} />
                    </label>

                    <label className={fieldLabelClass}>
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
                      <FieldError message={erroresCampos.almacenamiento} />
                    </label>

                    <label className={fieldLabelClass}>
                      Color
                      <input
                        value={form.color}
                        disabled={registroEditandoConvertido}
                        onChange={(event) => setField("color", event.target.value)}
                        className={inputClass(registroEditandoConvertido)}
                        placeholder="Color"
                      />
                      <FieldError message={erroresCampos.color} />
                    </label>

                    <label className={fieldLabelClass}>
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
                      <FieldError message={erroresCampos.tipoEquipo} />
                    </label>

                    <label className={fieldLabelClass}>
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
                  </div>
                )}
              </div>
            </section>
            )}

            {pasoActual === 3 && esServicioFinanciera(form.servicio) && !registroEditandoConvertido && (
            <section className={`${formSectionClass} p-5`}>
              <div className={formSectionHeaderClass}>
                <span>02 Financiacion del tramite</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                  Credito
                </span>
              </div>

              <div className="space-y-4">
                {form.financierasDetalle.map((item, index) => {
                  const shouldShow = index < financierasVisibles;

                  if (!shouldShow) {
                    return null;
                  }
                  const creditoPayJoy = payjoyCreditos[index];
                  const creditoAlo = aloCreditos[index];
                  const creditoFinserpay = finserpayCreditos[index];
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
                    Boolean(index === 0 && finserpayCreditos[0]) ||
                    Boolean(creditoCedula);
                  const bloqueaCreditoPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    Boolean(creditoPayJoy);
                  const bloqueaCreditoAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    Boolean(creditoAlo);
                  const bloqueaCreditoFinserpay =
                    esPlataformaFinserpay(item.plataformaCredito) &&
                    Boolean(creditoFinserpay);
                  const bloqueaCreditoCedula = Boolean(creditoCedula);
                  const bloqueaCredito =
                    bloqueaCreditoPayJoy ||
                    bloqueaCreditoAlo ||
                    bloqueaCreditoFinserpay ||
                    bloqueaCreditoCedula;
                  const bloqueaCuotaPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    creditoPayJoy?.valorCuota !== null &&
                    creditoPayJoy?.valorCuota !== undefined;
                  const bloqueaCuotaAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    creditoAlo?.valorCuota !== null &&
                    creditoAlo?.valorCuota !== undefined;
                  const bloqueaCuotaFinserpay =
                    esPlataformaFinserpay(item.plataformaCredito) &&
                    creditoFinserpay?.valorCuota !== null &&
                    creditoFinserpay?.valorCuota !== undefined;
                  const bloqueaCuotaCedula = Boolean(creditoCedula?.valorCuota);
                  const bloqueaPlazoPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    creditoPayJoy?.numeroCuotas !== null &&
                    creditoPayJoy?.numeroCuotas !== undefined;
                  const bloqueaPlazoAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    creditoAlo?.numeroCuotas !== null &&
                    creditoAlo?.numeroCuotas !== undefined;
                  const bloqueaPlazoFinserpay =
                    esPlataformaFinserpay(item.plataformaCredito) &&
                    creditoFinserpay?.numeroCuotas !== null &&
                    creditoFinserpay?.numeroCuotas !== undefined;
                  const bloqueaPlazoCedula = Boolean(creditoCedula?.numeroCuotas);
                  const bloqueaFrecuenciaPayJoy =
                    esPlataformaPayJoy(item.plataformaCredito) &&
                    Boolean(creditoPayJoy?.frecuenciaCuota);
                  const bloqueaFrecuenciaAlo =
                    esPlataformaAloCredit(item.plataformaCredito) &&
                    Boolean(creditoAlo?.frecuenciaCuota);
                  const bloqueaFrecuenciaFinserpay =
                    esPlataformaFinserpay(item.plataformaCredito) &&
                    Boolean(creditoFinserpay?.frecuenciaCuota);
                  const bloqueaFrecuenciaCedula =
                    Boolean(creditoCedula?.frecuenciaCuota);

                  return (
                    <div
                      key={`financiera-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
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
                          <label className={`${fieldLabelClass} md:col-span-2 xl:col-span-3`}>
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
                          <FieldError
                            message={erroresCampos[`financiera-${index}-plataformaCredito`]}
                          />
                        </label>

                        {financierasCatalogo.length === 0 && (
                          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            No hay financieras creadas en el catalogo comercial.
                          </div>
                        )}

                        {item.plataformaCredito && (
                          <>
                            <label className={fieldLabelClass}>
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
                                readOnly={bloqueaCredito}
                                className={inputClass(bloqueaCredito)}
                                inputMode="numeric"
                                placeholder={
                                  bloqueaCreditoPayJoy
                                    ? "Se completa desde PayJoy"
                                    : bloqueaCreditoAlo
                                      ? "Se completa desde ALO CREDIT"
                                      : bloqueaCreditoFinserpay
                                        ? "Se completa desde FINSERPAY"
                                      : bloqueaCreditoCedula
                                      ? `Se completa desde ${creditoCedula?.financiera}`
                                    : "$ 0"
                                }
                              />
                              <FieldError
                                message={erroresCampos[`financiera-${index}-creditoAutorizado`]}
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
                                            "Si no hay credito consultado, puedes digitar los valores."}
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
                                            "Si no hay credito consultado, puedes digitar los valores."}
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
                              {esPlataformaFinserpay(item.plataformaCredito) && (
                                <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>
                                      {consultandoFinserpayIndex === index
                                        ? "Consultando credito FINSERPAY..."
                                        : finserpayCreditos[index]
                                          ? `Credito FINSERPAY: ${formatMoney(
                                              finserpayCreditos[index]
                                                ?.creditoAutorizado ?? null
                                            )}`
                                          : finserpayErrores[index] ||
                                            "Si no hay credito consultado, puedes digitar los valores."}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void consultarCreditoFinserpay(index)
                                      }
                                      disabled={
                                        consultandoFinserpayIndex === index ||
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
                                  <label className={fieldLabelClass}>
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
                                  <FieldError
                                    message={erroresCampos[`financiera-${index}-cuotaInicial`]}
                                  />
                                </label>

                                <label className={fieldLabelClass}>
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
                                  <FieldError
                                    message={erroresCampos[`financiera-${index}-tipoPagoInicial`]}
                                  />
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
                                          <label className={fieldLabelClass}>
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
                                            <FieldError message={erroresCampos.medioPago1Valor} />
                                          </label>

                                          <label className={fieldLabelClass}>
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
                                            <FieldError message={erroresCampos.medioPago2Valor} />
                                          </label>

                                          <label className={fieldLabelClass}>
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
                                            <FieldError message={erroresCampos.medioPago2Tipo} />
                                          </label>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                            Suma ingresos:{" "}
                                            {formatMoney(totalIngresosInicialFinanciera(form))}
                                          </div>
                                          <FieldError message={erroresCampos.ingresosInicial} />

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

                            <label className={fieldLabelClass}>
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
                                    bloqueaCuotaFinserpay ||
                                    bloqueaCuotaCedula
                                )}
                                readOnly={
                                  bloqueaCuotaPayJoy ||
                                  bloqueaCuotaAlo ||
                                  bloqueaCuotaFinserpay ||
                                  bloqueaCuotaCedula
                                }
                                inputMode="numeric"
                                placeholder={
                                  bloqueaCuotaPayJoy
                                    ? "Se completa desde PayJoy"
                                    : bloqueaCuotaAlo
                                      ? "Se completa desde ALO CREDIT"
                                      : bloqueaCuotaFinserpay
                                        ? "Se completa desde FINSERPAY"
                                      : bloqueaCuotaCedula
                                      ? `Se completa desde ${creditoCedula?.financiera}`
                                    : "$ 0"
                                }
                              />
                              <FieldError
                                message={erroresCampos[`financiera-${index}-valorCuota`]}
                              />
                            </label>

                            <label className={fieldLabelClass}>
                              Plazo
                              <select
                                value={item.numeroCuotas}
                                disabled={
                                  bloqueaPlazoPayJoy ||
                                  bloqueaPlazoAlo ||
                                  bloqueaPlazoFinserpay ||
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
                                    bloqueaPlazoFinserpay ||
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
                              <FieldError
                                message={erroresCampos[`financiera-${index}-numeroCuotas`]}
                              />
                            </label>

                            <label className={fieldLabelClass}>
                              Frecuencia de pago
                              <select
                                value={item.frecuenciaCuota}
                                disabled={
                                  bloqueaFrecuenciaPayJoy ||
                                  bloqueaFrecuenciaAlo ||
                                  bloqueaFrecuenciaFinserpay ||
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
                                    bloqueaFrecuenciaFinserpay ||
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
                              <FieldError
                                message={erroresCampos[`financiera-${index}-frecuenciaCuota`]}
                              />
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

            {pasoActual === 3 && esServicioContado(form.servicio) && !registroEditandoConvertido && (
              <section className={`${formSectionClass} p-5`}>
                <div className={formSectionHeaderClass}>
                  <span>02 Ingresos del contado</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                    Caja
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className={fieldLabelClass}>
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
                    <FieldError message={erroresCampos.medioPago1Valor} />
                  </label>

                  <label className={fieldLabelClass}>
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
                    <FieldError message={erroresCampos.medioPago1Tipo} />
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
                      <label className={fieldLabelClass}>
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
                        <FieldError message={erroresCampos.medioPago2Valor} />
                      </label>

                      <label className={fieldLabelClass}>
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
                        <FieldError message={erroresCampos.medioPago2Tipo} />
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

            {pasoActual === 2 && (
            <section className={`${formSectionClass} p-5`}>
              <div className={formSectionHeaderClass}>
                <span>Paso 2 · Cliente</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-[#c4000c]">
                  Datos y referencias
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={`${fieldLabelClass} md:col-span-2`}>
                  Nombre completo
                  <input
                    value={form.clienteNombre}
                    onChange={(event) => setField("clienteNombre", event.target.value)}
                    className={inputClass()}
                    placeholder="Nombre completo"
                  />
                  <FieldError message={erroresCampos.clienteNombre} />
                </label>

                <label className={fieldLabelClass}>
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
                  <FieldError message={erroresCampos.tipoDocumento} />
                </label>

                <label className={fieldLabelClass}>
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
                      setErroresCampos((current) => {
                        const next = { ...current };
                        delete next.documentoNumero;
                        return next;
                      });
                    }}
                    className={inputClass()}
                    placeholder="Documento"
                  />
                  <FieldError message={erroresCampos.documentoNumero} />
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

                  <label className={fieldLabelClass}>
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
                    <FieldError message={erroresCampos.correo} />
                  </label>

                  <label className={fieldLabelClass}>
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
                    <FieldError message={erroresCampos.whatsapp} />
                  </label>

                {esServicioFinanciera(form.servicio) && (
                  <>
                    <label className={fieldLabelClass}>
                      Telefono
                      <input
                        value={form.telefono}
                        onChange={(event) =>
                          setField("telefono", onlyDigits(event.target.value))
                        }
                        className={inputClass()}
                        placeholder="Telefono principal"
                      />
                      <FieldError message={erroresCampos.telefono} />
                    </label>

                    <label className={fieldLabelClass}>
                      Barrio
                      <input
                        value={form.barrio}
                        onChange={(event) => setField("barrio", event.target.value)}
                        className={inputClass()}
                        placeholder="Barrio"
                      />
                      <FieldError message={erroresCampos.barrio} />
                    </label>
                  </>
                )}

                <label className={fieldLabelClass}>
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={form.fechaNacimiento}
                    onChange={(event) =>
                      setField("fechaNacimiento", event.target.value)
                    }
                    className={inputClass()}
                  />
                  <FieldError message={erroresCampos.fechaNacimiento} />
                </label>

                <label className={fieldLabelClass}>
                  Fecha de expedicion
                  <input
                    type="date"
                    value={form.fechaExpedicion}
                    onChange={(event) =>
                      setField("fechaExpedicion", event.target.value)
                    }
                    className={inputClass()}
                  />
                  <FieldError message={erroresCampos.fechaExpedicion} />
                </label>

                <label className={`${fieldLabelClass} md:col-span-2`}>
                  Direccion
                  <input
                    value={form.direccion}
                    onChange={(event) => setField("direccion", event.target.value)}
                    className={inputClass()}
                    placeholder="Direccion completa"
                  />
                  <FieldError message={erroresCampos.direccion} />
                </label>

                {esServicioFinanciera(form.servicio) && (
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">
                      Referencias familiares
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className={fieldLabelClass}>
                        Referencia familiar 1
                        <input
                          value={form.referenciaFamiliar1Nombre}
                          onChange={(event) =>
                            setField("referenciaFamiliar1Nombre", event.target.value)
                          }
                          className={inputClass()}
                          placeholder="Nombre completo"
                        />
                        <FieldError message={erroresCampos.referenciaFamiliar1Nombre} />
                      </label>

                      <label className={fieldLabelClass}>
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
                        <FieldError message={erroresCampos.referenciaFamiliar1Telefono} />
                      </label>

                      <label className={fieldLabelClass}>
                        Referencia familiar 2
                        <input
                          value={form.referenciaFamiliar2Nombre}
                          onChange={(event) =>
                            setField("referenciaFamiliar2Nombre", event.target.value)
                          }
                          className={inputClass()}
                          placeholder="Nombre completo"
                        />
                        <FieldError message={erroresCampos.referenciaFamiliar2Nombre} />
                      </label>

                      <label className={fieldLabelClass}>
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
                        <FieldError message={erroresCampos.referenciaFamiliar2Telefono} />
                      </label>
                    </div>
                  </div>
                )}

                <label className={fieldLabelClass}>
                  Registro SIM 1
                  <input
                    value={form.simCardRegistro1}
                    onChange={(event) =>
                      setField("simCardRegistro1", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Opcional"
                  />
                  <FieldError message={erroresCampos.simCardRegistro1} />
                </label>

                {esServicioFinanciera(form.servicio) && (
                  <label className={fieldLabelClass}>
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
            )}

            {pasoActual === 2 && !registroEditandoConvertido && (
            <section className={`${formSectionClass} p-5`}>
              <div className={formSectionHeaderClass}>
                <span>Paso 2 · Confirmaciones y evidencias</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-[#c4000c]">
                  Firma y fotos
                </span>
              </div>

              {(esServicioFinanciera(form.servicio) ||
                esServicioContado(form.servicio)) && (
                <div className="space-y-4">
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
                        className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={form[field]}
                          onChange={(event) =>
                            setField(field, event.target.checked)
                          }
                          className="mt-1 h-4 w-4"
                        />
                        <span className="leading-6">
                          {texto}
                          <FieldError message={erroresCampos[field]} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.92fr)]">
                <div>
                  <SignaturePad
                    key={signaturePadKey}
                    value={form.firmaClienteDataUrl}
                    onChange={(dataUrl) => setField("firmaClienteDataUrl", dataUrl)}
                  />
                  <FieldError message={erroresCampos.firmaClienteDataUrl} />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                          className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#e30613]"
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
                  <FieldError message={erroresCampos.fotoEntregaDataUrl} />
                </div>
              </div>

              {esServicioContado(form.servicio) && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        Foto de la factura
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
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
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.facturaFotoDataUrl}
                        alt="Foto de factura"
                        className="h-64 w-full rounded-2xl object-cover"
                      />
                    </div>
                  )}
                  <FieldError message={erroresCampos.facturaFotoDataUrl} />
                </div>
              )}

              {esServicioFinanciera(form.servicio) && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                  <FieldError message={erroresCampos.cedula} />
                </div>
              )}
            </section>
            )}

            {pasoActual === 4 && (
              <section className={`${formSectionClass} p-5`}>
                <div className={formSectionHeaderClass}>
                  <span>Paso 4 · Confirmacion</span>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-[#c4000c]">
                    Revision final
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h2 className="text-lg font-black text-slate-950">Cliente</h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      {[
                        ["Nombre", form.clienteNombre || "Pendiente"],
                        [
                          "Documento",
                          `${form.tipoDocumento || ""} ${form.documentoNumero || "Pendiente"}`,
                        ],
                        ["Correo", form.correo || "Pendiente"],
                        ["WhatsApp", form.whatsapp || "Pendiente"],
                        ["Direccion", form.direccion || "Pendiente"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="max-w-[65%] text-right font-bold text-slate-950">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h2 className="text-lg font-black text-slate-950">Equipo y sede</h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      {[
                        ["Sede", form.puntoVenta || "Pendiente"],
                        ["Ciudad", form.ciudad || "Pendiente"],
                        ["IMEI", form.serialImei || "Pendiente"],
                        ["Equipo", form.referenciaEquipo || "Pendiente"],
                        ["Color", form.color || "Pendiente"],
                        ["Estado", equipoEncontrado?.estadoActual || "Validado al guardar"],
                        ["Costo inventario", formatMoney(equipoEncontrado?.costo ?? null)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="max-w-[65%] text-right font-bold text-slate-950">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
                    <h2 className="text-lg font-black text-slate-950">Pago y equipo comercial</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Tipo de venta</dt>
                          <dd className="font-bold text-slate-950">
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
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Ingreso 1</dt>
                          <dd className="text-right font-bold text-slate-950">
                            {form.medioPago1Tipo || "Sin tipo"} · {formatMoney(
                              moneyInputToNumber(form.medioPago1Valor)
                            )}
                          </dd>
                        </div>
                        {(ingresoContado2Visible || form.medioPago2Valor) && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Ingreso 2</dt>
                            <dd className="text-right font-bold text-slate-950">
                              {form.medioPago2Tipo || "Sin tipo"} · {formatMoney(
                                moneyInputToNumber(form.medioPago2Valor)
                              )}
                            </dd>
                          </div>
                        )}
                      </dl>

                      <div className="space-y-3">
                        {esServicioFinanciera(form.servicio) ? (
                          form.financierasDetalle
                            .slice(0, financierasVisibles)
                            .filter(
                              (item, index) =>
                                index === 0 || detalleFinancieraTieneDatos(item)
                            )
                            .map((item, index) => (
                              <div
                                key={`${item.plataformaCredito}-${index}`}
                                className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
                              >
                                <p className="font-black text-slate-950">
                                  Financiera {index + 1}: {item.plataformaCredito || "Pendiente"}
                                </p>
                                <p className="mt-2 text-slate-600">
                                  Credito {formatMoney(
                                    moneyInputToNumber(item.creditoAutorizado)
                                  )} · Inicial {formatMoney(
                                    moneyInputToNumber(item.cuotaInicial)
                                  )} · {item.numeroCuotas || 0} cuotas
                                </p>
                              </div>
                            ))
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-sm text-slate-500">Total registrado</p>
                            <p className="mt-1 text-2xl font-black text-slate-950">
                              {formatMoney(totalIngresosContado(form))}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                  Caja, descuentos, comision, salida y utilidad no se inventan en este
                  prerregistro: el sistema los calcula en el flujo actual cuando la venta
                  se procesa definitivamente.
                </div>
              </section>
            )}

            {pasoActual === 3 && (
            <section className={`${formSectionClass} p-5`}>
              <div className={formSectionHeaderClass}>
                <span>Paso 3 · Equipo comercial y observaciones</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                  Cierre
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={fieldLabelClass}>
                  Asesor
                  <input value={form.asesorNombre} readOnly className={inputClass(true)} />
                </label>

                {jaladores.length > 0 ? (
                  <label className={fieldLabelClass}>
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
                    <FieldError message={erroresCampos.jaladorNombre} />
                  </label>
                ) : (
                  <label className={fieldLabelClass}>
                    Jalador
                    <input
                      value={form.jaladorNombre}
                      disabled={registroEditandoConvertido}
                      onChange={(event) => setField("jaladorNombre", event.target.value)}
                      className={inputClass(registroEditandoConvertido)}
                      placeholder="Nombre del jalador"
                    />
                    <FieldError message={erroresCampos.jaladorNombre} />
                  </label>
                )}

                <label className={`${fieldLabelClass} md:col-span-2`}>
                  Observacion
                  <textarea
                    value={form.observacion}
                    onChange={(event) => setField("observacion", event.target.value)}
                    className={`${inputClass()} min-h-28 resize-y`}
                    placeholder="Comentarios adicionales del tramite"
                  />
                  <FieldError message={erroresCampos.observacion} />
                </label>
              </div>
            </section>
            )}

            <div className="flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/dashboard"
                className="rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-center text-sm font-bold text-slate-800 transition hover:border-red-200 hover:text-[#e30613]"
              >
                Cancelar
              </Link>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                {pasoActual > 1 && (
                  <button
                    type="button"
                    onClick={() => irAlPaso((pasoActual - 1) as PasoVenta)}
                    disabled={guardando}
                    className="rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Anterior
                  </button>
                )}
                {pasoActual < 4 ? (
                  <button
                    type="button"
                    onClick={continuarPaso}
                    disabled={cargando || cargandoEdicion}
                    className="inline-flex min-w-[200px] items-center justify-center gap-3 rounded-lg bg-[#e30613] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#bd0711] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {cargando || cargandoEdicion ? "Cargando..." : "Continuar"}
                    {!cargando && !cargandoEdicion && (
                      <DashboardIcon name="arrow" className="h-5 w-5" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void guardarRegistro()}
                    disabled={guardando || cargando || cargandoEdicion}
                    className="rounded-lg bg-[#e30613] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#bd0711] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {guardando
                      ? registroEditando
                        ? "Guardando cambios..."
                        : "Guardando venta..."
                      : registroEditando
                        ? "Guardar cambios"
                        : "Guardar venta"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <button
              type="button"
              onClick={() => setResumenMovilAbierto((current) => !current)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 text-left font-black text-slate-950 shadow-sm xl:hidden"
              aria-expanded={resumenMovilAbierto}
            >
              Resumen de la venta
              <DashboardIcon
                name="arrow"
                className={`h-5 w-5 transition ${
                  resumenMovilAbierto ? "rotate-90" : ""
                }`}
              />
            </button>
            <div className={`${resumenMovilAbierto ? "block" : "hidden"} xl:block`}>
            <section className="min-h-[665px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.055)]">
              <div className="px-6 pb-4 pt-6">
                <h2 className="text-xl font-black tracking-tight">Resumen de la venta</h2>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xl font-black">
                    {form.puntoVenta || session.sedeNombre || "Sin seleccionar"}
                  </p>
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    {pasoActual === 4 ? "Por confirmar" : "En proceso"}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200 px-6">
                {[
                  {
                    icon: "cash" as const,
                    label: "Tipo de venta",
                    value: form.servicio || "Pendiente",
                  },
                  {
                    icon: "user" as const,
                    label: "Cliente",
                    value: form.clienteNombre || "Pendiente",
                  },
                  {
                    icon: "reports" as const,
                    label: "IMEI",
                    value: form.serialImei || "Sin registrar",
                  },
                  {
                    icon: "approvals" as const,
                    label: "Financieras",
                    value: esServicioContado(form.servicio)
                      ? "No aplica"
                      : `${form.financierasDetalle
                          .slice(0, financierasVisibles)
                          .filter((item) => detalleFinancieraTieneDatos(item)).length} de ${MAX_FINANCIERAS_REGISTRO}`,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex min-h-[80px] items-center gap-4 border-b border-slate-200 py-4"
                  >
                    <DashboardIcon name={item.icon} className="h-6 w-6 shrink-0 text-slate-600" />
                    <span className="flex-1 text-sm font-medium text-slate-700">{item.label}</span>
                    <span className="max-w-[48%] truncate text-right text-sm font-medium text-slate-600" title={item.value}>
                      {item.value}
                    </span>
                  </div>
                ))}

                {form.jaladorNombre && (
                  <div className="flex min-h-[72px] items-center gap-4 border-b border-slate-200 py-4">
                    <DashboardIcon name="user" className="h-6 w-6 shrink-0 text-slate-600" />
                    <span className="flex-1 text-sm font-medium text-slate-700">Jalador</span>
                    <span className="max-w-[48%] truncate text-right text-sm font-medium text-slate-600">
                      {form.jaladorNombre}
                    </span>
                  </div>
                )}

                {esServicioContado(form.servicio) && totalIngresosContado(form) > 0 && (
                  <div className="flex min-h-[72px] items-center gap-4 border-b border-slate-200 py-4">
                    <DashboardIcon name="cash" className="h-6 w-6 shrink-0 text-slate-600" />
                    <span className="flex-1 text-sm font-medium text-slate-700">Ingresos</span>
                    <span className="text-right text-sm font-bold text-slate-800">
                      {formatMoney(totalIngresosContado(form))}
                    </span>
                  </div>
                )}

                <div className="my-6 flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-400 text-xs font-bold">i</span>
                  <p>El resumen se actualizará mientras completas el registro.</p>
                </div>
              </div>
            </section>

            {false && (
            <section className="hidden" aria-hidden="true">
              <div className={formSectionHeaderClass}>
                <span>Registros recientes</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                  Ultimos
                </span>
              </div>

              <div className="space-y-3">
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
            )}
            </div>
          </aside>
        </section>
          </div>
        </div>
      </div>
  );
}
