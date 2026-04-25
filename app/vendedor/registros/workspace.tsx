"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import {
  detalleFinancieraTieneDatos,
  financieraRequiereInicial,
  FRECUENCIAS_CUOTA,
  MAX_FINANCIERAS_REGISTRO,
  MAX_PLAZO_CUOTAS,
  MEDIOS_PAGO_REGISTRO_VENTA,
  PLATAFORMAS_CREDITO,
  TEXTOS_VISIBLES_CLIENTE,
  TIPOS_DOCUMENTO_CLIENTE,
  formatearPesoInput,
} from "@/lib/vendor-sale-records";

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
  jaladorNombre: string | null;
  totalFinancieras: number;
  createdAt: string;
};

type JaladorOption = {
  id: number;
  nombre: string;
};

type SedeOption = {
  id: number;
  nombre: string;
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
  referenciaContacto: string;
  referenciaFamiliar1Nombre: string;
  referenciaFamiliar1Telefono: string;
  referenciaFamiliar2Nombre: string;
  referenciaFamiliar2Telefono: string;
  telefono: string;
  simCardRegistro1: string;
  simCardRegistro2: string;
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

const PLAZO_OPTIONS = Array.from({ length: MAX_PLAZO_CUOTAS }, (_, index) =>
  String(index + 1)
);
const TIPO_EQUIPO_OPTIONS = [
  { value: "NUEVO", label: "NUEVO" },
  { value: "CPO", label: "CPO" },
  { value: "EXHIBICION", label: "EXHIBICION" },
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
    ciudad: "",
    puntoVenta: session.sedeNombre,
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
    referenciaContacto: "",
    referenciaFamiliar1Nombre: "",
    referenciaFamiliar1Telefono: "",
    referenciaFamiliar2Nombre: "",
    referenciaFamiliar2Telefono: "",
    telefono: "",
    simCardRegistro1: "",
    simCardRegistro2: "",
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
  const [form, setForm] = useState<FormState>(() => createInitialState(session));
  const [registros, setRegistros] = useState<RegistroResumen[]>([]);
  const [sedes, setSedes] = useState<SedeOption[]>([]);
  const [jaladores, setJaladores] = useState<JaladorOption[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [buscandoImei, setBuscandoImei] = useState(false);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [imeiDetalle, setImeiDetalle] = useState("");
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const [financierasVisibles, setFinancierasVisibles] = useState(1);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [errorCamara, setErrorCamara] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  const setFormMessage = (texto: string, tipo: "success" | "error") => {
    setMensaje(texto);
    setMensajeTipo(tipo);
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

          setForm((current) => ({
            ...current,
            puntoVenta: current.puntoVenta || sedesData[0]?.nombre || session.sedeNombre,
          }));
        }

        if (catalogoRes.ok && catalogoData?.jaladores) {
          setJaladores(
            Array.isArray(catalogoData.jaladores) ? catalogoData.jaladores : []
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

      const response = await fetch(
        `/api/vendedor/registros/imei?imei=${form.serialImei}`,
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

  const validarFormularioVisible = () => {
    if (!isTextFilled(form.ciudad)) return "La ciudad es obligatoria";
    if (!isTextFilled(form.puntoVenta)) return "Debes seleccionar el punto de venta";
    if (!isTextFilled(form.clienteNombre)) return "El nombre del cliente es obligatorio";
    if (!isTextFilled(form.tipoDocumento)) return "Debes seleccionar el tipo de documento";
    if (!isTextFilled(form.documentoNumero)) return "El documento del cliente es obligatorio";
    if (!isTextFilled(form.serialImei) || form.serialImei.length !== 15) {
      return "El IMEI debe tener 15 digitos";
    }
    if (!isTextFilled(form.referenciaEquipo)) {
      return "La referencia del equipo es obligatoria";
    }
    if (!isTextFilled(form.almacenamiento)) return "El almacenamiento es obligatorio";
    if (!isTextFilled(form.color)) return "El color es obligatorio";
    if (!isTextFilled(form.tipoEquipo)) return "Debes seleccionar el tipo de equipo";

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

    if (!isTextFilled(form.correo)) return "El correo es obligatorio";
    if (!isTextFilled(form.whatsapp)) return "El WhatsApp es obligatorio";
    if (!isTextFilled(form.telefono)) return "El telefono es obligatorio";
    if (!isTextFilled(form.barrio)) return "El barrio es obligatorio";
    if (!isTextFilled(form.fechaNacimiento)) {
      return "La fecha de nacimiento es obligatoria";
    }
    if (!isTextFilled(form.fechaExpedicion)) {
      return "La fecha de expedicion es obligatoria";
    }
    if (!isTextFilled(form.direccion)) return "La direccion es obligatoria";
    if (!isTextFilled(form.referenciaContacto)) {
      return "El punto de referencia de la direccion es obligatorio";
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
    if (!isTextFilled(form.simCardRegistro1)) return "El registro SIM 1 es obligatorio";
    if (!isTextFilled(form.simCardRegistro2)) return "El registro SIM 2 es obligatorio";
    if (!form.aceptaDeclaracionIntermediacion) {
      return "Debes confirmar el primer texto visible del formato";
    }
    if (!form.aceptaPoliticaGarantia) {
      return "Debes confirmar el segundo texto visible del formato";
    }
    if (!form.aceptaCondicionesCredito) {
      return "Debes confirmar el tercer texto visible del formato";
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
        financierasDetalle: form.financierasDetalle
          .slice(0, financierasVisibles)
          .filter((item, index) => index === 0 || detalleFinancieraTieneDatos(item)),
      };

      const res = await fetch("/api/vendedor/registros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormMessage(data.error || "No se pudo guardar el registro", "error");
        return;
      }

      setFormMessage(data.mensaje || "Registro guardado correctamente", "success");
      setImeiDetalle("");
      setSignaturePadKey((current) => current + 1);
      setFinancierasVisibles(1);
      setForm((current) => ({
        ...createInitialState(session),
        ciudad: current.ciudad,
        puntoVenta: current.puntoVenta,
        asesorNombre: current.asesorNombre,
      }));

      const registrosRes = await fetch("/api/vendedor/registros", {
        cache: "no-store",
      });
      const registrosData = await registrosRes.json();

      if (registrosRes.ok) {
        setRegistros(Array.isArray(registrosData.registros) ? registrosData.registros : []);
      }
    } catch {
      setFormMessage("Error guardando el registro", "error");
    } finally {
      setGuardando(false);
    }
  };

  const puntosVenta = Array.from(
    new Map(
      [session.sedeNombre, ...sedes.map((item) => item.nombre)].map((nombre) => [
        nombre,
        nombre,
      ])
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
                REGISTRAR VENTA
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Captura digital del tramite, las financieras, la validacion del
                cliente y la entrega del equipo en un solo registro.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver a CONECTAMOS
              </Link>
            </div>
          </div>
        </section>

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
                    onChange={(event) => setField("almacenamiento", event.target.value)}
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
                    onChange={(event) => setField("tipoEquipo", event.target.value)}
                    className={inputClass()}
                  >
                    <option value="">Selecciona una opcion</option>
                    {TIPO_EQUIPO_OPTIONS.map((item) => (
                      <option
                        key={item.value}
                        value={item.value}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

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
                            Registra plataforma, valores, plazo y forma de pago de
                            la inicial.
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
                            {PLATAFORMAS_CREDITO.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>

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

                            {financieraRequiereInicial(index) && (
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
                      disabled={
                        !isFinancieraCompleta(
                          form.financierasDetalle[financierasVisibles - 1],
                          financierasVisibles - 1
                        )
                      }
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
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

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Contacto y referencias
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Correo
                  <input
                    value={form.correo}
                    onChange={(event) => setField("correo", event.target.value)}
                    className={inputClass()}
                    placeholder="correo@cliente.com"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  WhatsApp
                  <input
                    value={form.whatsapp}
                    onChange={(event) =>
                      setField("whatsapp", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Numero"
                  />
                </label>

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

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Direccion
                  <input
                    value={form.direccion}
                    onChange={(event) => setField("direccion", event.target.value)}
                    className={inputClass()}
                    placeholder="Direccion completa"
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Punto de referencia de la direccion
                  <input
                    value={form.referenciaContacto}
                    onChange={(event) =>
                      setField("referenciaContacto", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Casa esquinera, frente a..."
                  />
                </label>

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
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Texto visible al cliente
              </div>

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

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Financieras cargadas
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900">
                    {financierasVisibles}{" "}
                    / {MAX_FINANCIERAS_REGISTRO}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void guardarRegistro()}
                disabled={guardando || cargando}
                className="mt-6 w-full rounded-2xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando ? "Guardando..." : "Guardar registro digital"}
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
                          {registro.puntoVenta || "Sin punto"} | {registro.plataformaCredito}
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
                      <span>
                        Credito: {formatMoney(registro.creditoAutorizado)} | Inicial:{" "}
                        {formatMoney(registro.cuotaInicial)}
                      </span>
                      <span>
                        Cuota: {formatMoney(registro.valorCuota)} | Plazo:{" "}
                        {registro.numeroCuotas || 0}
                      </span>
                      <span>Financieras: {registro.totalFinancieras || 1}</span>
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
