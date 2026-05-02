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
} from "@/lib/vendor-sale-records";
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
  confirmacionCliente: boolean;
  financierasDetalle: FinancialFormState[];
};

type ImeiLookupResponse = {
  equipo: {
    imei: string;
    referencia: string;
    color: string | null;
    costo: number | null;
    origen: "SEDE" | "BODEGA_PRINCIPAL";
    sedeId: number | null;
    sedeNombre: string | null;
    estadoActual: string | null;
  };
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
    confirmacionCliente: false,
    financierasDetalle: Array.from(
      { length: MAX_FINANCIERAS_REGISTRO },
      createEmptyFinanciera
    ),
  };
}

function inputClass(readOnly = false) {
  return `w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
    readOnly
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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

  return `$ ${value.toLocaleString("es-CO")}`;
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

function totalIngresosContado(form: Pick<FormState, "medioPago1Valor" | "medioPago2Valor">) {
  return moneyInputToNumber(form.medioPago1Valor) + moneyInputToNumber(form.medioPago2Valor);
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
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [imeiDetalle, setImeiDetalle] = useState("");
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const [financierasVisibles, setFinancierasVisibles] = useState(1);
  const [ingresoContado2Visible, setIngresoContado2Visible] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [errorCamara, setErrorCamara] = useState("");
  const [registroEditando, setRegistroEditando] =
    useState<RegistroVendedorDetalle | null>(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

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
    setSignaturePadKey((current) => current + 1);
    setFinancierasVisibles(1);
    setIngresoContado2Visible(false);
    setRegistroEditando(null);
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
          financierasDetalle: Array.from(
            { length: MAX_FINANCIERAS_REGISTRO },
            createEmptyFinanciera
          ),
        };
      }

      return {
        ...current,
        servicio,
        medioPago1Tipo: "EFECTIVO",
        medioPago1Valor: "",
        medioPago2Tipo: "",
        medioPago2Valor: "",
      };
    });
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
    setFinancieraField(index, field, formatearPesoInput(value));
  };

  const resetFinanciera = (index: number) => {
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
        color: equipo.color ?? current.color,
      }));
      setImeiDetalle(
        `${equipo.referencia} | ${equipo.sedeNombre ?? "Sin ubicacion"} | ${equipo.estadoActual ?? "Sin estado"}`
      );
    } catch {
      setImeiDetalle("");
      setFormMessage("Error consultando el IMEI", "error");
    } finally {
      setBuscandoImei(false);
    }
  };

  const cargarFotoEntrega = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setCargandoFoto(true);
      const dataUrl = await compressImageToDataUrl(file);
      setField("fotoEntregaDataUrl", dataUrl);
    } catch {
      setFormMessage("No se pudo procesar la foto de entrega", "error");
    } finally {
      setCargandoFoto(false);
      event.target.value = "";
    }
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
        setIngresoContado2Visible(
          Boolean(mapped.form.medioPago2Tipo || mapped.form.medioPago2Valor)
        );
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
    if (!isTextFilled(form.ciudad)) return "La ciudad es obligatoria";
    if (!isTextFilled(form.puntoVenta)) return "Debes seleccionar el punto de venta";
    if (!isTextFilled(form.clienteNombre)) return "El nombre del cliente es obligatorio";
    if (!isTextFilled(form.tipoDocumento)) return "Debes seleccionar el tipo de documento";
    if (!isTextFilled(form.documentoNumero)) return "El documento del cliente es obligatorio";
    if (!isTextFilled(form.servicio)) return "Selecciona CONTADO o FINANCIERA";
    if (!isTextFilled(form.serialImei) || form.serialImei.length !== 15) {
      return "El IMEI debe tener 15 digitos";
    }

    if (esServicioFinanciera(form.servicio)) {
      if (!isTextFilled(form.referenciaEquipo)) {
        return "La referencia del equipo es obligatoria";
      }
      if (!isTextFilled(form.almacenamiento)) return "El almacenamiento es obligatorio";
      if (!isTextFilled(form.color)) return "El color es obligatorio";
      if (!isTextFilled(form.tipoEquipo)) return "Debes seleccionar el tipo de equipo";
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
    }

    if (!isTextFilled(form.correo)) return "El correo es obligatorio";
    if (!esCorreoRegistroValido(form.correo)) {
      return `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`;
    }
    if (!isTextFilled(form.whatsapp)) return "El WhatsApp es obligatorio";
    if (!esWhatsappRegistroValido(form.whatsapp)) {
      return "El WhatsApp debe tener 10 digitos";
    }
    if (!isTextFilled(form.direccion)) return "La direccion es obligatoria";
    if (!isTextFilled(form.simCardRegistro1)) return "El registro SIM 1 es obligatorio";

    if (esServicioFinanciera(form.servicio)) {
      if (!isTextFilled(form.telefono)) return "El telefono es obligatorio";
      if (!isTextFilled(form.barrio)) return "El barrio es obligatorio";
      if (!isTextFilled(form.fechaNacimiento)) {
        return "La fecha de nacimiento es obligatoria";
      }
      if (!isTextFilled(form.fechaExpedicion)) {
        return "La fecha de expedicion es obligatoria";
      }
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
      if (!form.aceptaDeclaracionIntermediacion) {
        return "Debes confirmar el primer texto visible del formato";
      }
      if (!form.aceptaPoliticaGarantia) {
        return "Debes confirmar el segundo texto visible del formato";
      }
      if (!form.aceptaCondicionesCredito) {
        return "Debes confirmar el tercer texto visible del formato";
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
    const errorValidacion = validarFormularioVisible();

    if (errorValidacion) {
      setFormMessage(errorValidacion, "error");
      return;
    }

    try {
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
          esServicioContado(form.servicio) && ingresoContado2Visible
            ? form.medioPago2Tipo
            : "",
        medioPago2Valor:
          esServicioContado(form.servicio) && ingresoContado2Visible
            ? form.medioPago2Valor
            : "",
      };

      const res = await fetch("/api/vendedor/registros", {
        method: registroEditando ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          registroEditando
            ? {
                ...payload,
                id: registroEditando.id,
                modo: "EDITAR",
              }
            : payload
        ),
      });

      const data = await res.json();

      if (!res.ok) {
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
        setIngresoContado2Visible(
          Boolean(mapped.form.medioPago2Tipo || mapped.form.medioPago2Valor)
        );
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
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Hoja digital
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                {registroEditando ? "MODIFICAR REGISTRO" : "REGISTRAR VENTA"}
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                {registroEditando
                  ? "Actualiza la informacion del tramite, las financieras, la validacion del cliente y la entrega del equipo."
                  : "Captura digital del tramite, las financieras, la validacion del cliente y la entrega del equipo en un solo registro."}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/vendedor/lista-precios"
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-slate-100"
              >
                LISTA DE PRECIOS
              </Link>
              {puedeBuscarRegistros && (
                <Link
                  href="/vendedor/registros/buscar"
                  className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Buscar registro
                </Link>
              )}
              {registroEditando && (
                <button
                  type="button"
                  onClick={() => limpiarFormulario(false)}
                  className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Cancelar edicion
                </button>
              )}
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
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

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-5">
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Cliente y equipo
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Ciudad
                  <input
                    value={form.ciudad}
                    onChange={(event) => setField("ciudad", event.target.value)}
                    className={inputClass()}
                    placeholder="Ciudad"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Punto de venta
                  <select
                    value={form.puntoVenta}
                    onChange={(event) => setField("puntoVenta", event.target.value)}
                    className={inputClass()}
                  >
                    {puntosVenta.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

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
                          onClick={() => seleccionarServicio(option.value)}
                          className={`rounded-2xl border px-4 py-4 text-left text-sm font-black transition ${
                            active
                              ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                          }`}
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
                    {TIPOS_DOCUMENTO_CLIENTE.map((item) => (
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
                    onChange={(event) =>
                      setField("documentoNumero", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Documento"
                  />
                </label>

                <div className="md:col-span-2 grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end">
                    <label className="flex-1 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      IMEI
                      <input
                        value={form.serialImei}
                        onChange={(event) => {
                          setField(
                            "serialImei",
                            onlyDigits(event.target.value, 15)
                          );
                          setImeiDetalle("");
                        }}
                        onBlur={() => {
                          if (form.serialImei.length === 15) {
                            void buscarImei();
                          }
                        }}
                        className={inputClass()}
                        placeholder="15 digitos"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void buscarImei()}
                      disabled={buscandoImei || form.serialImei.length !== 15}
                      className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {buscandoImei ? "Consultando..." : "Buscar IMEI"}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                    {imeiDetalle ||
                      "Cuando el IMEI exista en cualquier sede o en bodega principal, se completara la informacion disponible del equipo."}
                  </div>
                </div>

                {esServicioFinanciera(form.servicio) && (
                  <>
                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Referencia
                      <input
                        value={form.referenciaEquipo}
                        onChange={(event) =>
                          setField("referenciaEquipo", event.target.value)
                        }
                        className={inputClass()}
                        placeholder="Se completa desde el IMEI"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Almacenamiento
                      <input
                        value={form.almacenamiento}
                        onChange={(event) =>
                          setField("almacenamiento", event.target.value)
                        }
                        className={inputClass()}
                        placeholder="128 GB"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Color
                      <input
                        value={form.color}
                        onChange={(event) => setField("color", event.target.value)}
                        className={inputClass()}
                        placeholder="Color"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Tipo de equipo
                      <select
                        value={form.tipoEquipo}
                        onChange={(event) =>
                          setField("tipoEquipo", event.target.value)
                        }
                        className={inputClass()}
                      >
                        <option value="">Selecciona una opcion</option>
                        {TIPO_EQUIPO_OPTIONS.map((item) => (
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

            {esServicioFinanciera(form.servicio) && (
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Financieras del tramite
              </div>

              <div className="mt-6 space-y-4">
                {form.financierasDetalle.map((item, index) => {
                  const shouldShow = index < financierasVisibles;

                  if (!shouldShow) {
                    return null;
                  }

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
                            onChange={(event) =>
                              setFinancieraField(
                                index,
                                "plataformaCredito",
                                event.target.value
                              )
                            }
                            className={inputClass()}
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
                                className={inputClass()}
                                inputMode="numeric"
                                placeholder="$ 0"
                              />
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
                                  Tipo de pago de la inicial
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
                                className={inputClass()}
                                inputMode="numeric"
                                placeholder="$ 0"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                              Plazo
                              <select
                                value={item.numeroCuotas}
                                onChange={(event) =>
                                  setFinancieraField(
                                    index,
                                    "numeroCuotas",
                                    event.target.value
                                  )
                                }
                                className={inputClass()}
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
                                onChange={(event) =>
                                  setFinancieraField(
                                    index,
                                    "frecuenciaCuota",
                                    event.target.value
                                  )
                                }
                                className={inputClass()}
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

            {esServicioContado(form.servicio) && (
              <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Ingresos del contado
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

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Contacto y referencias
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
                  </>
                )}

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

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {esServicioFinanciera(form.servicio)
                  ? "Texto visible al cliente"
                  : "Firma y entrega"}
              </div>

              {esServicioFinanciera(form.servicio) && (
                <div className="mt-6 space-y-4">
                  {TEXTOS_VISIBLES_CLIENTE.map((texto, index) => {
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
                      capture="environment"
                      onChange={(event) => void cargarFotoEntrega(event)}
                      className="hidden"
                    />
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    En celular intentara abrir la camara trasera. En computador,
                    abrira la camara del navegador si esta disponible.
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
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Equipo comercial y observaciones
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
                      onChange={(event) => setField("jaladorNombre", event.target.value)}
                      className={inputClass()}
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
                      onChange={(event) => setField("jaladorNombre", event.target.value)}
                      className={inputClass()}
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
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Resumen del registro
              </div>

              <div className="mt-5 space-y-3 text-sm text-slate-700">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Tipo
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.servicio || "Pendiente"}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Punto de venta
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.puntoVenta || "Sin seleccionar"}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Cliente
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.clienteNombre || "Pendiente"}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    IMEI
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.serialImei || "Pendiente"}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Jalador
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {form.jaladorNombre || "Pendiente"}
                  </span>
                </div>

                {esServicioContado(form.servicio) ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-emerald-700">
                      Ingresos
                    </span>
                    <span className="mt-1 block font-semibold text-emerald-800">
                      {formatMoney(totalIngresosContado(form))}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                      Financieras cargadas
                    </span>
                    <span className="mt-1 block font-semibold text-slate-900">
                      {financierasVisibles} / {MAX_FINANCIERAS_REGISTRO}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void guardarRegistro()}
                disabled={guardando || cargando || cargandoEdicion}
                className="mt-6 w-full rounded-2xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando
                  ? registroEditando
                    ? "Guardando cambios..."
                    : "Guardando..."
                  : registroEditando
                    ? "Guardar cambios del registro"
                    : "Guardar registro digital"}
              </button>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
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
