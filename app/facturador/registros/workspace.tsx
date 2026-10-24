"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./workspace.module.css";
import {
  esPerfilAdministrativo,
  esPerfilFacturador,
  esRolAdministrativo,
} from "@/lib/access-control";
import {
  TIPOS_DOCUMENTO_CLIENTE,
  esCorreoRegistroValido,
  esWhatsappRegistroValido,
  financieraRequiereInicial,
  formatearPesoInput,
  obtenerErrorCorreoRegistro,
} from "@/lib/vendor-sale-records";
import { esElectrodomestico } from "@/lib/product-types";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipo: string;
  perfilTipoLabel: string;
};

type CatalogoPersonalResponse = {
  financieras: Array<{ id: number; nombre: string }>;
};

type SiigoReporteResumen = {
  cantidad: number;
  valor: number;
  aprobadas: number;
  valorAprobado: number;
};

type SiigoReporteMensual = {
  desde: string;
  hasta: string;
  facturas: SiigoReporteResumen;
  notasCredito: SiigoReporteResumen;
  notasCreditoDetalle?: Array<{
    nombre: string;
    fecha: string | null;
    estado: string;
    factura: string;
    valor: number;
    incluida: boolean;
  }>;
  totalProductos?: {
    cantidad: number;
    valorBruto: number;
    descuento: number;
    subtotal: number;
    impuestoCargo: number;
    impuestoRetencion: number;
    total: number;
  };
  neto: number;
  netoAprobado: number;
};

type FinancieraRegistro = {
  plataformaCredito?: string;
  creditoAutorizado?: string | number | null;
  cuotaInicial?: string | number | null;
};

type RegistroFacturacion = {
  id: number;
  createdAt: string;
  puntoVenta: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  correo: string | null;
  whatsapp: string | null;
  direccion: string | null;
  barrio: string | null;
  plataformaCredito: string;
  creditoAutorizado: number | null;
  cuotaInicial: number | null;
  medioPago1Tipo: string | null;
  medioPago1Valor: number | null;
  medioPago2Tipo: string | null;
  medioPago2Valor: number | null;
  referenciaEquipo: string | null;
  serialImei: string | null;
  tipoEquipo: string | null;
  tipoProducto: string | null;
  jaladorNombre: string | null;
  numeroFactura: string | null;
  estadoFacturacion: string | null;
  siigoInvoiceId: string | null;
  siigoInvoiceName: string | null;
  siigoInvoiceStatus: string | null;
  siigoInvoiceUrl: string | null;
  siigoInvoiceError: string | null;
  siigoInvoiceCreatedAt: string | null;
  siigoCreditNoteId: string | null;
  siigoCreditNoteName: string | null;
  siigoCreditNoteStatus: string | null;
  siigoCreditNoteUrl: string | null;
  siigoCreditNoteError: string | null;
  siigoCreditNoteCreatedAt: string | null;
  estadoVentaRegistro: string | null;
  ventaIdRelacionada: number | null;
  financierasDetalle: FinancieraRegistro[] | null;
};

type EditFinancieraState = {
  plataformaCredito: string;
  creditoAutorizado: string;
  cuotaInicial: string;
};

type EditDraft = {
  id: number;
  tipoDocumento: string;
  documentoNumero: string;
  clienteNombre: string;
  correo: string;
  whatsapp: string;
  direccion: string;
  barrio: string;
  referenciaEquipo: string;
  serialImei: string;
  numeroFactura: string;
  estadoFacturacion: string;
  convertidoEnVenta: boolean;
  financierasDetalle: EditFinancieraState[];
};

const ESTADO_OPTIONS = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "FACTURADO", label: "Facturado" },
  { value: "NOTA_CREDITO", label: "Nota credito" },
] as const;

const SIIGO_MAX_FACTURA_TOTAL = 2300000;
const REGISTROS_POR_PAGINA = 25;

type FiltroRegistro =
  | "TODOS"
  | "PENDIENTES"
  | "FACTURADOS"
  | "NC"
  | "ERRORES_SIIGO"
  | "SUPERA_TOPE";

const FILTROS_REGISTROS: Array<{
  value: FiltroRegistro;
  label: string;
}> = [
  { value: "TODOS", label: "Todos" },
  { value: "PENDIENTES", label: "Pendientes" },
  { value: "FACTURADOS", label: "Facturados" },
  { value: "NC", label: "Notas crédito" },
  { value: "ERRORES_SIIGO", label: "Errores Siigo" },
  { value: "SUPERA_TOPE", label: "Supera tope" },
];

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

function onlyDigits(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Sin valor";
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^\d.]/g, ""));

  if (!Number.isFinite(parsed)) {
    return "Sin valor";
  }

  return `$ ${parsed.toLocaleString("es-CO")}`;
}

function isSiigoTemporaryMessage(value: string | null | undefined) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    text.includes("document_query_service") ||
    text.includes("temporalmente no disponible") ||
    text.includes("temporarily unavailable") ||
    text.includes("try in a few minutes")
  );
}

function defaultMonthInput() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function toMoneyNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const raw = String(value).trim().replace(/[^\d.,-]/g, "");
  const dots = raw.match(/\./g)?.length ?? 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : dots > 1 || /^\d+\.\d{3}$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function esRegistroContado(registro: RegistroFacturacion) {
  return String(registro.plataformaCredito || "").trim().toUpperCase() === "CONTADO";
}

function esRegistroConvertido(registro: RegistroFacturacion) {
  return (
    Boolean(registro.ventaIdRelacionada) ||
    String(registro.estadoVentaRegistro || "").trim().toUpperCase() ===
      "CONVERTIDO_EN_VENTA"
  );
}

function resolvePagosContado(registro: RegistroFacturacion) {
  return [
    {
      tipo: registro.medioPago1Tipo,
      valor: registro.medioPago1Valor,
    },
    {
      tipo: registro.medioPago2Tipo,
      valor: registro.medioPago2Valor,
    },
  ].filter(
    (
      item
    ): item is {
      tipo: string;
      valor: number;
    } => Boolean(item.tipo) && typeof item.valor === "number" && item.valor > 0
  );
}

function totalPagosContado(registro: RegistroFacturacion) {
  return resolvePagosContado(registro).reduce(
    (total, item) => total + item.valor,
    0
  );
}

function resolveFinancieras(registro: RegistroFacturacion) {
  if (esRegistroContado(registro)) {
    const totalContado = totalPagosContado(registro);

    return [
      {
        plataformaCredito: "CONTADO",
        creditoAutorizado: totalContado > 0 ? totalContado : null,
        cuotaInicial: null,
      },
    ];
  }

  const detalle = Array.isArray(registro.financierasDetalle)
    ? registro.financierasDetalle
        .map((item) => ({
          plataformaCredito: String(item?.plataformaCredito || "").trim(),
          creditoAutorizado: item?.creditoAutorizado ?? null,
          cuotaInicial: item?.cuotaInicial ?? null,
        }))
        .filter(
          (item) =>
            item.plataformaCredito ||
            item.creditoAutorizado !== null ||
            item.cuotaInicial !== null
        )
    : [];

  if (detalle.length > 0) {
    return detalle;
  }

  return [
    {
      plataformaCredito: registro.plataformaCredito,
      creditoAutorizado: registro.creditoAutorizado,
      cuotaInicial: registro.cuotaInicial,
    },
  ].filter((item) => item.plataformaCredito || item.creditoAutorizado !== null);
}

function totalFacturableSiigo(registro: RegistroFacturacion) {
  return resolveFinancieras(registro).reduce(
    (total, item) =>
      total +
      toMoneyNumber(item.creditoAutorizado) +
      toMoneyNumber(item.cuotaInicial),
    0
  );
}

function filtroRegistro(registro: RegistroFacturacion): FiltroRegistro {
  if (
    String(registro.estadoFacturacion || "").trim().toUpperCase() ===
      "NOTA_CREDITO" ||
    registro.siigoCreditNoteId
  ) {
    return "NC";
  }

  if (
    resolveEstadoBadge(registro.estadoFacturacion, registro.numeroFactura)
      .label === "Facturado"
  ) {
    return "FACTURADOS";
  }

  if (
    !esElectrodomestico(registro.tipoProducto) &&
    totalFacturableSiigo(registro) > SIIGO_MAX_FACTURA_TOTAL
  ) {
    return "SUPERA_TOPE";
  }

  if (registro.siigoInvoiceError || registro.siigoCreditNoteError) {
    return "ERRORES_SIIGO";
  }

  return "PENDIENTES";
}

function resolveEstadoBadge(estadoFacturacion: string | null, numeroFactura: string | null) {
  const estado = String(estadoFacturacion || "").trim().toUpperCase();

  if (estado === "NOTA_CREDITO") {
    return {
      label: "Nota credito",
      rowClass: "bg-amber-50 text-amber-950",
      pillClass: "border-amber-200 bg-amber-100 text-amber-700",
      inputClass:
        "border-amber-300 bg-white text-amber-950 focus:border-amber-500 focus:ring-2 focus:ring-amber-100",
      buttonClass: "bg-amber-600 text-white hover:bg-amber-500",
    };
  }

  if (estado === "FACTURADO" || numeroFactura) {
    return {
      label: "Facturado",
      rowClass: "bg-emerald-50 text-emerald-950",
      pillClass: "border-emerald-200 bg-emerald-100 text-emerald-700",
      inputClass:
        "border-emerald-300 bg-white text-emerald-950 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100",
      buttonClass: "bg-emerald-600 text-white hover:bg-emerald-500",
    };
  }

  return {
    label: "Pendiente",
    rowClass: "bg-slate-50 text-slate-900",
    pillClass: "border-amber-200 bg-amber-50 text-amber-700",
    inputClass:
      "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100",
    buttonClass: "bg-slate-900 text-white hover:bg-slate-800",
  };
}

function SummaryCard({
  detail,
  icon,
  label,
  value,
  tone = "neutral",
}: {
  detail: string;
  icon: DashboardIconName;
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <article className={`${styles.metric} ${styles[`metric_${tone}`]}`} title={detail}>
      <span className={styles.metricIcon}><DashboardIcon name={icon} /></span>
      <div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

function createEditDraft(registro: RegistroFacturacion): EditDraft {
  const financieras = resolveFinancieras(registro).map((item) => ({
    plataformaCredito: item.plataformaCredito,
    creditoAutorizado: formatMoneyInputFromStored(item.creditoAutorizado),
    cuotaInicial:
      item.cuotaInicial === null || item.cuotaInicial === undefined
        ? ""
        : formatMoneyInputFromStored(item.cuotaInicial),
  }));

  return {
    id: registro.id,
    tipoDocumento: registro.tipoDocumento,
    documentoNumero: registro.documentoNumero,
    clienteNombre: registro.clienteNombre,
    correo: registro.correo ?? "",
    whatsapp: registro.whatsapp ?? "",
    direccion: registro.direccion ?? "",
    barrio: registro.barrio ?? "",
    referenciaEquipo: registro.referenciaEquipo ?? "",
    serialImei: registro.serialImei ?? "",
    numeroFactura: registro.numeroFactura ?? "",
    estadoFacturacion: registro.estadoFacturacion ?? (registro.numeroFactura ? "FACTURADO" : "PENDIENTE"),
    convertidoEnVenta: esRegistroConvertido(registro),
    financierasDetalle: financieras.length > 0
      ? financieras
      : [
          {
            plataformaCredito: "",
            creditoAutorizado: "",
            cuotaInicial: "",
          },
        ],
  };
}

export default function FacturadorRegistrosWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const esAdmin =
    ["ADMIN", "AUDITOR"].includes(String(session.rolNombre || "").trim().toUpperCase()) ||
    String(session.perfilTipoLabel || "").trim().toUpperCase() === "ADMINISTRADOR";
  const esAdministrativo =
    esAdmin ||
    esRolAdministrativo(session.rolNombre) ||
    esPerfilAdministrativo(session.perfilTipo);
  const esFacturador =
    !esAdministrativo && esPerfilFacturador(session.perfilTipo);
  const puedeVerReporteSiigo =
    esAdmin ||
    String(session.perfilTipo || "").trim().toUpperCase() === "AUDITOR" ||
    String(session.perfilNombre || "").trim().toUpperCase().includes("CONTABILIDAD");
  const puedeEliminar = String(session.rolNombre || "").trim().toUpperCase() === "ADMIN";
  const [registros, setRegistros] = useState<RegistroFacturacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);
  const [emitiendoSiigoId, setEmitiendoSiigoId] = useState<number | null>(null);
  const [emitiendoNcId, setEmitiendoNcId] = useState<number | null>(null);
  const [reenviandoCorreoId, setReenviandoCorreoId] = useState<number | null>(null);
  const [limpiandoSiigoId, setLimpiandoSiigoId] = useState<number | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [modoSoporteSiigo, setModoSoporteSiigo] = useState(false);
  const [filtroActivo, setFiltroActivo] = useState<FiltroRegistro>("TODOS");
  const [paginaActual, setPaginaActual] = useState(1);
  const [facturandoPendientes, setFacturandoPendientes] = useState(false);
  const [reporteSiigoMes, setReporteSiigoMes] = useState(defaultMonthInput);
  const [reporteSiigo, setReporteSiigo] = useState<SiigoReporteMensual | null>(
    null
  );
  const [consultandoReporteSiigo, setConsultandoReporteSiigo] = useState(false);
  const [facturasDraft, setFacturasDraft] = useState<Record<number, string>>({});
  const [editando, setEditando] = useState<EditDraft | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [financierasCatalogo, setFinancierasCatalogo] = useState<
    Array<{ id: number; nombre: string }>
  >([]);

  const cargarRegistros = async () => {
    try {
      const [res, catalogoRes] = await Promise.all([
        fetch("/api/facturador/registros", { cache: "no-store" }),
        fetch("/api/ventas/catalogo-personal", { cache: "no-store" }),
      ]);
      const [data, catalogoData] = await Promise.all([
        res.json(),
        catalogoRes.json(),
      ]);

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudieron cargar los registros");
        return;
      }

      const nextRegistros = Array.isArray(data.registros) ? data.registros : [];

      setRegistros(nextRegistros);
      setFacturasDraft((current) => {
        const next = { ...current };

        for (const item of nextRegistros) {
          next[item.id] = current[item.id] ?? item.numeroFactura ?? "";
        }

        return next;
      });

      if (catalogoRes.ok) {
        const catalogo = catalogoData as Partial<CatalogoPersonalResponse>;

        setFinancierasCatalogo(
          Array.isArray(catalogo.financieras) ? catalogo.financieras : []
        );
      }
    } catch {
      setMensajeTipo("error");
      setMensaje("Error cargando registros");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarRegistros();
  }, []);

  const conteosFiltro = useMemo(() => {
    const conteos: Record<FiltroRegistro, number> = {
      TODOS: registros.length,
      PENDIENTES: 0,
      FACTURADOS: 0,
      NC: 0,
      ERRORES_SIIGO: 0,
      SUPERA_TOPE: 0,
    };

    for (const registro of registros) {
      conteos[filtroRegistro(registro)] += 1;
    }

    return conteos;
  }, [registros]);

  const registrosFiltrados = useMemo(() => {
    const criterio = busqueda.trim().toLowerCase();

    const registrosPorEstado =
      filtroActivo === "TODOS"
        ? registros
        : registros.filter((registro) => filtroRegistro(registro) === filtroActivo);

    if (!criterio) {
      return registrosPorEstado;
    }

    const digits = criterio.replace(/\D/g, "");

    return registrosPorEstado.filter((registro) => {
      const documento = String(registro.documentoNumero || "").replace(/\D/g, "");
      const imei = String(registro.serialImei || "").replace(/\D/g, "");
      const textoBase = [
        registro.clienteNombre,
        registro.puntoVenta,
        registro.referenciaEquipo,
        registro.tipoProducto,
        registro.numeroFactura,
        registro.siigoInvoiceName,
        registro.siigoInvoiceStatus,
        registro.siigoCreditNoteName,
        registro.siigoCreditNoteStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        textoBase.includes(criterio) ||
        (digits.length > 0 &&
          (documento.includes(digits) || imei.includes(digits)))
      );
    });
  }, [busqueda, filtroActivo, registros]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(registrosFiltrados.length / REGISTROS_POR_PAGINA)
  );
  const registrosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * REGISTROS_POR_PAGINA;

    return registrosFiltrados.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  }, [paginaActual, registrosFiltrados]);
  const paginasVisibles = useMemo(() => {
    const candidatas = new Set([
      1,
      paginaActual - 1,
      paginaActual,
      paginaActual + 1,
      totalPaginas,
    ]);

    return [...candidatas]
      .filter((pagina) => pagina >= 1 && pagina <= totalPaginas)
      .sort((a, b) => a - b);
  }, [paginaActual, totalPaginas]);
  const primerRegistroVisible =
    registrosFiltrados.length === 0
      ? 0
      : (paginaActual - 1) * REGISTROS_POR_PAGINA + 1;
  const ultimoRegistroVisible = Math.min(
    paginaActual * REGISTROS_POR_PAGINA,
    registrosFiltrados.length
  );

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroActivo]);

  useEffect(() => {
    setPaginaActual((pagina) => Math.min(pagina, totalPaginas));
  }, [totalPaginas]);

  const guardarFactura = async (registroId: number) => {
    const numeroFactura = String(facturasDraft[registroId] || "").trim();

    if (!numeroFactura) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el numero de factura");
      return;
    }

    try {
      setGuardandoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: registroId,
          numeroFactura,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo guardar el numero de factura");
        return;
      }

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroId ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroId]: registroActualizado.numeroFactura ?? numeroFactura,
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Numero de factura actualizado");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error guardando numero de factura");
    } finally {
      setGuardandoId(null);
    }
  };

  const emitirFacturaSiigo = async (registroId: number) => {
    const confirmar = window.confirm(
      "Se creara una factura en Siigo para este registro. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setEmitiendoSiigoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/siigo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: registroId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.registro) {
          const registroConError = data.registro as RegistroFacturacion;

          setRegistros((current) =>
            current.map((item) =>
              item.id === registroId ? registroConError : item
            )
          );
        }

        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo emitir la factura en Siigo");
        return;
      }

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroId ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroId]: registroActualizado.numeroFactura ?? "",
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Factura emitida correctamente en Siigo");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error enviando factura a Siigo");
    } finally {
      setEmitiendoSiigoId(null);
    }
  };

  const reenviarCorreoSiigo = async (registroId: number) => {
    const confirmar = window.confirm(
      "Se reenviara el correo desde Siigo para esta factura ya emitida. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setReenviandoCorreoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/siigo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "REENVIAR_CORREO",
          id: registroId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo reenviar el correo desde Siigo");
        return;
      }

      if (data.registro) {
        const registroActualizado = data.registro as RegistroFacturacion;

        setRegistros((current) =>
          current.map((item) =>
            item.id === registroActualizado.id ? registroActualizado : item
          )
        );
      }

      setMensajeTipo("success");
      setMensaje(data.mensaje || "Correo reenviado desde Siigo");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error reenviando correo desde Siigo");
    } finally {
      setReenviandoCorreoId(null);
    }
  };

  const facturarPendientesSiigo = async () => {
    const confirmar = window.confirm(
      "Se emitiran en Siigo hasta 20 ventas ya convertidas que siguen pendientes. Las que superen el tope o tengan error quedaran marcadas. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setFacturandoPendientes(true);
      setMensaje("");

      const res = await fetch("/api/facturador/siigo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "FACTURAR_PENDIENTES",
          limit: 20,
        }),
      });

      const data = await res.json();
      const registrosActualizados = Array.isArray(data.registros)
        ? (data.registros as RegistroFacturacion[])
        : [];

      if (registrosActualizados.length > 0) {
        setRegistros((current) => {
          const actualizadosPorId = new Map(
            registrosActualizados.map((item) => [item.id, item])
          );

          return current.map((item) => actualizadosPorId.get(item.id) ?? item);
        });
        setFacturasDraft((current) => {
          const next = { ...current };

          for (const item of registrosActualizados) {
            next[item.id] = item.numeroFactura ?? "";
          }

          return next;
        });
      }

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudieron facturar pendientes en Siigo");
        return;
      }

      const totalErrores = Number(data.resumen?.errores || 0);

      setMensajeTipo(totalErrores > 0 ? "error" : "success");
      setMensaje(data.mensaje || "Pendientes procesados en Siigo");
      await cargarRegistros();
    } catch {
      setMensajeTipo("error");
      setMensaje("Error facturando pendientes en Siigo");
    } finally {
      setFacturandoPendientes(false);
    }
  };

  const consultarReporteSiigo = async () => {
    try {
      setConsultandoReporteSiigo(true);
      setMensaje("");

      const params = new URLSearchParams({
        month: reporteSiigoMes || defaultMonthInput(),
      });
      const res = await fetch(`/api/facturador/siigo/reporte?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo consultar el reporte Siigo");
        return;
      }

      setReporteSiigo(data.reporte as SiigoReporteMensual);
      setMensajeTipo("success");
      setMensaje("Reporte Siigo consultado correctamente");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error consultando el reporte Siigo");
    } finally {
      setConsultandoReporteSiigo(false);
    }
  };

  const emitirNotaCreditoSiigo = async (registroId: number) => {
    const confirmar = window.confirm(
      "Se emitira una nota credito en Siigo para esta factura. La venta NO se eliminara y el inventario/caja NO se moveran. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setEmitiendoNcId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/siigo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "NOTA_CREDITO",
          id: registroId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.registro) {
          const registroConError = data.registro as RegistroFacturacion;

          setRegistros((current) =>
            current.map((item) =>
              item.id === registroId ? registroConError : item
            )
          );
        }

        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo emitir la nota credito en Siigo");
        return;
      }

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroActualizado.id ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroActualizado.id]: registroActualizado.numeroFactura ?? "",
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Nota credito emitida en Siigo");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error emitiendo nota credito en Siigo");
    } finally {
      setEmitiendoNcId(null);
    }
  };

  const quitarFacturaBorradaSiigo = async (registroId: number) => {
    const confirmar = window.confirm(
      "Usa esto solo si ya borraste esa factura/borrador en Siigo. Conectamos quitara la marca local de factura, sin tocar venta, inventario ni caja. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setLimpiandoSiigoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "QUITAR_FACTURA_BORRADA",
          id: registroId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo quitar la factura borrada");
        return;
      }

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroActualizado.id ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroActualizado.id]: registroActualizado.numeroFactura ?? "",
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Factura borrada quitada de Conectamos");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error quitando la factura borrada");
    } finally {
      setLimpiandoSiigoId(null);
    }
  };

  const guardarEdicion = async () => {
    if (!editando) {
      return;
    }

    if (!editando.documentoNumero.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el numero de cedula");
      return;
    }

    if (!editando.clienteNombre.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el nombre completo");
      return;
    }

    if (!editando.correo.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el correo electronico");
      return;
    }

    if (!esCorreoRegistroValido(editando.correo)) {
      setMensajeTipo("error");
      setMensaje(
        obtenerErrorCorreoRegistro(editando.correo) || "El correo no es valido"
      );
      return;
    }

    if (!editando.whatsapp.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el WhatsApp");
      return;
    }

    if (!esWhatsappRegistroValido(editando.whatsapp)) {
      setMensajeTipo("error");
      setMensaje("El WhatsApp debe tener 10 digitos");
      return;
    }

    if (!editando.direccion.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar la direccion");
      return;
    }

    if (!editando.barrio.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el barrio");
      return;
    }

    if (
      (editando.estadoFacturacion === "FACTURADO" ||
        editando.estadoFacturacion === "NOTA_CREDITO") &&
      !editando.numeroFactura.trim()
    ) {
      setMensajeTipo("error");
      setMensaje("Debes conservar el numero de factura para ese estado");
      return;
    }

    try {
      setGuardandoEdicion(true);
      setMensaje("");

      const payload: Record<string, unknown> = {
        modo: "EDITAR",
        id: editando.id,
        tipoDocumento: editando.tipoDocumento,
        documentoNumero: editando.documentoNumero,
        clienteNombre: editando.clienteNombre,
        correo: editando.correo,
        whatsapp: editando.whatsapp,
        direccion: editando.direccion,
        barrio: editando.barrio,
        numeroFactura: editando.numeroFactura,
        estadoFacturacion: editando.estadoFacturacion,
      };

      if (!editando.convertidoEnVenta) {
        Object.assign(payload, {
          referenciaEquipo: editando.referenciaEquipo,
          serialImei: editando.serialImei,
          financierasDetalle: editando.financierasDetalle,
        });
      }

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo actualizar el registro");
        return;
      }

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroActualizado.id ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroActualizado.id]: registroActualizado.numeroFactura ?? "",
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro actualizado correctamente");
      setEditando(null);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error actualizando el registro");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const eliminarRegistro = async (registroId: number) => {
    const confirmar = window.confirm(
      "Este registro se eliminara del panel operativo, pero quedara trazabilidad interna. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setEliminandoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "ELIMINAR",
          id: registroId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo eliminar el registro");
        return;
      }

      setRegistros((current) => current.filter((item) => item.id !== registroId));
      setFacturasDraft((current) => {
        const next = { ...current };
        delete next[registroId];
        return next;
      });
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro eliminado correctamente");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error eliminando el registro");
    } finally {
      setEliminandoId(null);
    }
  };

  const editandoConvertido = Boolean(editando?.convertidoEnVenta);
  const resumenDisponible = !cargando && !(mensaje && mensajeTipo === "error" && registros.length === 0);
  const coverageLabel = esAdministrativo
    ? "Todas las sedes"
    : session.sedeNombre;
  const navigationItems: NavigationItem[] = esAdministrativo
    ? [
        { href: "/dashboard", icon: "home", label: "Inicio" },
        { href: "/ventas", icon: "sales", label: "Ventas" },
        { href: "/inventario", icon: "inventory", label: "Inventario" },
        { href: "/prestamos", icon: "loans", label: "Préstamos" },
        { href: "/caja", icon: "cash", label: "Caja" },
        { href: "/cierre", icon: "reports", label: "CIERRE" },
        {
          href: "/dashboard/aprobaciones",
          icon: "approvals",
          label: "Aprobaciones",
        },
        { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
        {
          href: "/dashboard/sedes",
          icon: "settings",
          label: "Configuración",
        },
      ]
    : [
        { href: "/dashboard", icon: "home", label: "Inicio" },
        { href: "/cierre", icon: "reports", label: "CIERRE" },
        {
          href: "/facturador/registros",
          icon: "document",
          label: "Facturación",
        },
      ];
  const sidebarActiveHref = esAdministrativo
    ? "/dashboard/aprobaciones"
    : "/facturador/registros";
  const secondaryNavigation = navigationItems.filter(item => ["/cierre", "/dashboard/reportes", "/dashboard/sedes"].includes(item.href));
  const primaryNavigation = navigationItems.filter(item => !secondaryNavigation.includes(item));
  const navigationLink = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === sidebarActiveHref ? styles.navActive : ""}`} aria-current={item.href === sidebarActiveHref ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS · Inicio"><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
        <nav className={styles.navigation} aria-label="Navegación principal">
          {primaryNavigation.map(navigationLink)}
          <div className={styles.extraNavigation}>{secondaryNavigation.map(navigationLink)}</div>
          {secondaryNavigation.length > 0 && <details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secondaryNavigation.map(navigationLink)}</div></details>}
        </nav>
        <SalesProfile name={session.nombre} role={session.rolNombre || session.perfilTipoLabel} />
      </header>

      <div className={styles.workspace}>
        <main className={styles.main}>
          <header className={styles.heading}>
            <div className="min-w-0">
              <p className={styles.eyebrow}>
                {esFacturador ? "Facturación" : "Gestión de registros"}
              </p>
              <h1>
                {esAdmin ? "Consultar registros" : "Registros guardados"}
              </h1>
              <p className={styles.subtitle}>
                {esAdmin
                  ? "Consulta, corrige y gestiona la facturación de los registros comerciales."
                  : "Revisa los registros capturados, completa la factura y gestiona su estado en Siigo."}
              </p>
            </div>

            <div className={styles.headingActions}>
              <span className={styles.coverage}><DashboardIcon name="store" />{coverageLabel}</span>
              <button type="button" className={styles.button} onClick={() => void cargarRegistros()} disabled={cargando}><DashboardIcon name="refresh" />{cargando ? "Actualizando…" : "Actualizar"}</button>
              {esAdministrativo && (
                <Link
                  href="/ventas/aprobaciones"
                  className={`${styles.button} ${styles.primary}`}
                >
                  <DashboardIcon name="approvals" />
                  Registros por aprobar
                </Link>
              )}
            </div>
          </header>

        {mensaje && (
          <div
            role={mensajeTipo === "error" ? "alert" : "status"}
            className={`mt-6 rounded-2xl border px-4 py-4 text-sm font-medium shadow-sm ${
              mensajeTipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section
          className={styles.summary}
          aria-label="Resumen de registros"
          aria-busy={cargando}
        >
          <SummaryCard
            label="Total de registros"
            value={resumenDisponible ? conteosFiltro.TODOS.toLocaleString("es-CO") : "—"}
            detail="Registros comerciales disponibles"
            icon="document"
          />
          <SummaryCard
            label="Pendientes"
            value={resumenDisponible ? conteosFiltro.PENDIENTES.toLocaleString("es-CO") : "—"}
            detail="Sin factura y dentro del tope"
            icon="calendar"
            tone="warning"
          />
          <SummaryCard
            label="Facturados"
            value={resumenDisponible ? conteosFiltro.FACTURADOS.toLocaleString("es-CO") : "—"}
            detail="Con número de factura registrado"
            icon="approvals"
            tone="success"
          />
          <SummaryCard
            label="Notas crédito"
            value={resumenDisponible ? conteosFiltro.NC.toLocaleString("es-CO") : "—"}
            detail="Facturas anuladas mediante NC"
            icon="document"
            tone="warning"
          />
          <SummaryCard
            label="Errores Siigo"
            value={resumenDisponible ? conteosFiltro.ERRORES_SIIGO.toLocaleString("es-CO") : "—"}
            detail="Requieren corrección operativa"
            icon="warning"
            tone="danger"
          />
          <SummaryCard
            label="Superan el tope"
            value={resumenDisponible ? conteosFiltro.SUPERA_TOPE.toLocaleString("es-CO") : "—"}
            detail="No se pueden emitir por Siigo"
            icon="warning"
            tone="warning"
          />

        </section>

        {puedeVerReporteSiigo && (
            <section
              id="reporte-siigo"
              className={styles.report}
            >
              <div className={styles.reportHeader}>
                <div className={styles.reportTitle}>
                  <span className={styles.reportIcon}><DashboardIcon name="document-search" /></span>
                  <div><h2>Resumen Siigo</h2><p>{reporteSiigo ? formatMoney(reporteSiigo.neto) : "Consulta el reporte mensual"}</p></div>
                </div>

                <div className={styles.reportControls}>
                  <label className={styles.monthField}><span>Mes del reporte</span>
                  <input
                    type="month"
                    value={reporteSiigoMes}
                    onChange={(event) => setReporteSiigoMes(event.target.value)}
                    aria-label="Mes del reporte Siigo"
                    className={styles.monthInput}
                  />
                  </label>
                  <button
                    type="button"
                    onClick={() => void consultarReporteSiigo()}
                    disabled={consultandoReporteSiigo}
                    className={`${styles.button} ${styles.graphite}`}
                  >
                    {consultandoReporteSiigo ? "Consultando..." : "Reporte Siigo"}
                  </button>
                  <a
                    href="/api/facturador/siigo/reporte/electrodomesticos"
                    className={styles.button}
                  >
                    <DashboardIcon name="download" className="h-4 w-4" />
                    Electrodomésticos 002
                  </a>
                </div>
              </div>

              {reporteSiigo && (
                <>
                  <div className={styles.reportTotals}>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Facturas
                      </p>
                      <p className="mt-1 font-black text-emerald-700">
                        {reporteSiigo.facturas.cantidad} /{" "}
                        {formatMoney(reporteSiigo.facturas.valor)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        NC
                      </p>
                      <p className="mt-1 font-black text-amber-700">
                        {reporteSiigo.notasCredito.cantidad} /{" "}
                        {formatMoney(reporteSiigo.notasCredito.valor)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Impuestos
                      </p>
                      <p className="mt-1 font-black text-slate-950">
                        {formatMoney(
                          reporteSiigo.totalProductos?.impuestoCargo ?? 0
                        )}
                      </p>
                    </div>
                  </div>

                  {reporteSiigo.notasCreditoDetalle?.length ? (
                    <details className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-slate-700">
                      <summary className="cursor-pointer font-black text-slate-900">
                        Detalle NC del reporte
                      </summary>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left">
                          <thead className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                            <tr>
                              <th className="py-2 pr-3">NC</th>
                              <th className="py-2 pr-3">Fecha</th>
                              <th className="py-2 pr-3">Factura</th>
                              <th className="py-2 pr-3">Estado</th>
                              <th className="py-2 pr-3 text-right">Valor</th>
                              <th className="py-2 text-right">Cuenta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reporteSiigo.notasCreditoDetalle.map((nota) => (
                              <tr
                                key={`${nota.nombre}-${nota.factura}-${nota.valor}`}
                                className="border-t border-amber-100"
                              >
                                <td className="py-2 pr-3 font-bold">
                                  {nota.nombre}
                                </td>
                                <td className="py-2 pr-3">{nota.fecha || "-"}</td>
                                <td className="py-2 pr-3">{nota.factura}</td>
                                <td className="py-2 pr-3">{nota.estado}</td>
                                <td className="py-2 pr-3 text-right font-bold">
                                  {formatMoney(nota.valor)}
                                </td>
                                <td className="py-2 text-right font-bold">
                                  {nota.incluida ? "Si" : "No"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}
                </>
              )}
            </section>
          )}

        <section className={styles.panel} aria-label="Registros comerciales" aria-busy={cargando}>
          <div className={styles.panelHeader}>
            <div>
              <h2>
                {esAdmin ? "Registros para consultar" : "Registros para facturar"}
              </h2>
              <p className={styles.panelCount}>{cargando ? "Cargando registros…" : resumenDisponible ? `${registros.length.toLocaleString("es-CO")} registros disponibles` : "Consulta no disponible"}</p>
            </div>

            <div className={styles.listControls}>
              <label className={styles.search}>
                <span className={styles.srOnly}>Buscar registro</span>
                  <DashboardIcon
                    name="search"
                  />
                  <input
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    type="search"
                    placeholder="Cédula, IMEI, cliente, sede o factura"
                  />
              </label>
              {esAdmin && (
                <button
                  type="button"
                  onClick={() => setModoSoporteSiigo((current) => !current)}
                  className={`${styles.button} ${modoSoporteSiigo ? styles.supportActive : ""}`}
                  aria-pressed={modoSoporteSiigo}
                >
                  <DashboardIcon name="settings" />
                  {modoSoporteSiigo ? "Ocultar soporte Siigo" : "Soporte Siigo"}
                </button>
              )}
            </div>
          </div>

          <div className={styles.filtersBar}>
            <div className={styles.tabs} role="group" aria-label="Filtrar registros por estado">
            {FILTROS_REGISTROS.map((filtro) => {
              const activo = filtroActivo === filtro.value;

              return (
                <button
                  key={filtro.value}
                  type="button"
                  onClick={() => setFiltroActivo(filtro.value)}
                  aria-pressed={activo}
                  className={`${styles.filterTab} ${activo ? styles.filterTabActive : ""}`}
                >
                  {filtro.label}<span>{resumenDisponible ? conteosFiltro[filtro.value].toLocaleString("es-CO") : "—"}</span>
                </button>
              );
            })}
            </div>
            {esAdmin && (
              <button
                type="button"
                onClick={() => void facturarPendientesSiigo()}
                disabled={facturandoPendientes}
                className={`${styles.button} ${styles.primary}`}
              >
                <DashboardIcon name="send" className="h-4 w-4" />
                {facturandoPendientes
                  ? "Facturando..."
                  : "Facturar pendientes Siigo"}
              </button>
            )}
          </div>

          <div className={styles.tableMeta}>
            <span>
              {cargando
                ? "Preparando registros"
                : resumenDisponible ? `${registrosFiltrados.length.toLocaleString("es-CO")} resultado(s)` : "Consulta no disponible"}
            </span>
            <span className="hidden sm:inline">
              Vista compacta de {REGISTROS_POR_PAGINA} por página
            </span>
          </div>

          <div className={styles.tableScroller} role="region" aria-label="Tabla de registros comerciales" tabIndex={0}>
            <table className={`${styles.recordsTable} w-full min-w-[1480px] table-fixed`}>
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="w-[155px] px-5 py-3">Registro</th>
                  <th className="hidden">Punto / sede</th>
                  <th className="hidden">Tipo de identificación</th>
                  <th className="w-[270px] px-5 py-3">Cliente y contacto</th>
                  <th className="hidden">Nombre completo</th>
                  <th className="hidden">Correo electrónico</th>
                  <th className="hidden">WhatsApp</th>
                  <th className="hidden">Dirección</th>
                  <th className="hidden">Barrio</th>
                  <th className="w-[230px] px-5 py-3">Equipo</th>
                  <th className="hidden">IMEI</th>
                  <th className="w-[245px] px-5 py-3">Pago</th>
                  <th className="hidden">Créditos autorizados</th>
                  <th className="w-[220px] px-5 py-3">Facturación</th>
                  <th className="w-[250px] px-5 py-3">Siigo</th>
                  <th className="hidden">Estado</th>
                  <th className="w-[210px] px-5 py-3">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                      <span className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                      Cargando registros...
                    </td>
                  </tr>
                ) : !resumenDisponible ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center"><DashboardIcon name="warning" className="mx-auto mb-3 h-8 w-8 text-red-600" /><p className="font-bold">No se pudieron cargar los registros</p><p className="mt-1 text-sm text-slate-500">Actualiza para volver a consultar.</p><button type="button" className={`${styles.button} mt-4`} onClick={() => void cargarRegistros()}><DashboardIcon name="refresh" />Reintentar</button></td></tr>
                ) : registrosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">
                      <DashboardIcon
                        name="search"
                        className="mx-auto mb-3 h-8 w-8 text-slate-300"
                      />
                      {busqueda.trim()
                        ? "No hay registros que coincidan con la cédula, IMEI o dato consultado."
                        : "No hay registros guardados para facturar."}
                    </td>
                  </tr>
                ) : (
                  registrosPaginados.map((registro) => {
                    const estado = resolveEstadoBadge(
                      registro.estadoFacturacion,
                      registro.numeroFactura
                    );
                    const draft = facturasDraft[registro.id] ?? registro.numeroFactura ?? "";
                    const financieras = resolveFinancieras(registro);
                    const totalSiigo = totalFacturableSiigo(registro);
                    const superaTopeSiigo =
                      !esElectrodomestico(registro.tipoProducto) &&
                      totalSiigo > SIIGO_MAX_FACTURA_TOTAL;
                    const esContado = esRegistroContado(registro);
                    const convertido = esRegistroConvertido(registro);
                    const pagosContado = resolvePagosContado(registro);
                    const facturaSiigoEmitida = Boolean(registro.siigoInvoiceId);
                    const facturaManualRegistrada =
                      Boolean(registro.numeroFactura) && !facturaSiigoEmitida;
                    const notaCreditoSiigoEmitida = Boolean(
                      registro.siigoCreditNoteId
                    );
                    const registroCerradoConNotaCredito =
                      notaCreditoSiigoEmitida && !facturaSiigoEmitida;
                    const puedeModificarRegistro =
                      (esAdmin || !convertido) && !registroCerradoConNotaCredito;
                    const puedeEmitirNotaCreditoManual =
                      esAdmin &&
                      modoSoporteSiigo &&
                      facturaSiigoEmitida &&
                      !notaCreditoSiigoEmitida;
                    const puedeQuitarFacturaBorrada =
                      esAdmin &&
                      modoSoporteSiigo &&
                      facturaSiigoEmitida &&
                      !notaCreditoSiigoEmitida;
                    const puedeEmitirSiigo =
                      convertido &&
                      !facturaSiigoEmitida &&
                      !notaCreditoSiigoEmitida &&
                      !superaTopeSiigo &&
                      !registro.numeroFactura;
                    return (
                      <tr
                        key={registro.id}
                        className="align-top transition-colors hover:bg-slate-50/80"
                      >
                        <td className="border-t border-slate-100 px-5 py-5 text-sm">
                          <p className="font-black text-slate-950">#{registro.id}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {formatDate(registro.createdAt)}
                          </p>
                          <span className="mt-2 inline-flex max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                            {registro.puntoVenta || "Sin punto"}
                          </span>
                        </td>
                        <td className="hidden">
                          {registro.puntoVenta || "Sin punto"}
                        </td>
                        <td className="hidden">
                          {registro.tipoDocumento || "Sin tipo"}
                        </td>
                        <td className="border-t border-slate-100 px-5 py-5 text-sm">
                          <p className="font-bold leading-5 text-slate-950">
                            {registro.clienteNombre}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase text-slate-600">
                            {registro.tipoDocumento || "ID"} {registro.documentoNumero}
                          </p>
                          <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
                            <p className="break-all">{registro.correo || "Sin correo"}</p>
                            <p>{registro.whatsapp || "Sin WhatsApp"}</p>
                            <p>
                              {[registro.direccion, registro.barrio]
                                .filter(Boolean)
                                .join(" · ") || "Sin dirección"}
                            </p>
                          </div>
                        </td>
                        <td className="hidden">
                          {registro.clienteNombre}
                        </td>
                        <td className="hidden">
                          {registro.correo || "Sin correo"}
                        </td>
                        <td className="hidden">
                          {registro.whatsapp || "Sin WhatsApp"}
                        </td>
                        <td className="hidden">
                          {registro.direccion || "Sin direccion"}
                        </td>
                        <td className="hidden">
                          {registro.barrio || "Sin barrio"}
                        </td>
                        <td className="border-t border-slate-100 px-5 py-5 text-sm">
                          <p className="font-bold leading-5 text-slate-950">
                            {registro.referenciaEquipo || "Sin referencia"}
                          </p>
                          <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                            {registro.tipoProducto || "TELEFONIA"}
                          </span>
                          <p className="mt-3 break-all font-mono text-xs text-slate-500">
                            IMEI {registro.serialImei || "sin registrar"}
                          </p>
                        </td>
                        <td className="hidden">
                          {registro.serialImei || "Sin IMEI"}
                        </td>
                        <td className="border-t border-slate-100 px-5 py-5 text-sm">
                          {esContado ? (
                            pagosContado.length > 0 ? (
                              <div className="space-y-2">
                                {pagosContado.map((item, index) => (
                                  <div
                                    key={`${registro.id}-contado-${index}`}
                                    className="min-w-40"
                                  >
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                      {item.tipo}
                                    </div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {formatMoney(item.valor)}
                                    </div>
                                  </div>
                                ))}
                                {pagosContado.length > 1 && (
                                  <div className="border-t border-slate-200 pt-2 font-bold text-slate-950">
                                    Total {formatMoney(totalPagosContado(registro))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-500">Sin valor</span>
                            )
                          ) : financieras.length > 0 ? (
                            <div className="space-y-2.5">
                              {financieras.map((item, index) => (
                                <div
                                  key={`${registro.id}-pago-${index}`}
                                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                                >
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                    {item.plataformaCredito || `Financiera ${index + 1}`}
                                  </p>
                                  <p className="mt-1 font-bold text-slate-950">
                                    {formatMoney(item.creditoAutorizado)}
                                  </p>
                                  {financieraRequiereInicial(index) &&
                                    item.cuotaInicial !== null &&
                                    item.cuotaInicial !== undefined &&
                                    item.cuotaInicial !== "" && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        Inicial: {formatMoney(item.cuotaInicial)}
                                      </p>
                                    )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">No aplica</span>
                          )}
                        </td>
                        <td className="hidden">
                          <div className="space-y-2">
                            {financieras.map((item, index) => (
                              <div key={`${registro.id}-credito-${index}`} className="min-w-48">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {item.plataformaCredito || `Financiera ${index + 1}`}
                                </div>
                                <div className="mt-1 font-semibold text-slate-900">
                                  {formatMoney(item.creditoAutorizado)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="border-t border-slate-100 px-5 py-5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${estado.pillClass}`}
                          >
                            {estado.label}
                          </span>
                          <input
                            aria-label={`Número de factura del registro ${registro.id}`}
                            value={draft}
                            disabled={
                              facturaSiigoEmitida ||
                              !convertido ||
                              registroCerradoConNotaCredito
                            }
                            onChange={(event) =>
                              setFacturasDraft((current) => ({
                                ...current,
                                [registro.id]: event.target.value,
                              }))
                            }
                            className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ${estado.inputClass}`}
                            placeholder="Número de factura"
                          />
                          {!registroCerradoConNotaCredito && (
                            <button
                              type="button"
                              onClick={() => void guardarFactura(registro.id)}
                              disabled={
                                guardandoId === registro.id ||
                                facturaSiigoEmitida ||
                                !convertido ||
                                !String(draft).trim()
                              }
                              className={`mt-2 min-h-10 w-full rounded-xl px-3 text-xs font-black uppercase tracking-[0.04em] transition ${estado.buttonClass} disabled:cursor-not-allowed disabled:bg-slate-300`}
                            >
                              {guardandoId === registro.id ? "Guardando..." : "Guardar factura"}
                            </button>
                          )}
                        </td>
                        <td className="border-t border-slate-100 px-5 py-5 text-sm">
                          {facturaSiigoEmitida ? (
                            <div className="min-w-48 space-y-2">
                              <div className="font-bold text-slate-950">
                                {registro.siigoInvoiceName || "Emitida"}
                              </div>
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                {registro.siigoInvoiceStatus || "Siigo"}
                              </div>
                              {registro.siigoInvoiceUrl && (
                                <Link
                                  href={registro.siigoInvoiceUrl}
                                  target="_blank"
                                  className="text-xs font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
                                >
                                  Ver documento
                                </Link>
                              )}
                              {notaCreditoSiigoEmitida && (
                                <div className="border-t border-emerald-100 pt-2">
                                  <div className="font-bold text-amber-800">
                                    NC {registro.siigoCreditNoteName || "Emitida"}
                                  </div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                                    {registro.siigoCreditNoteStatus || "Nota credito"}
                                  </div>
                                  {registro.siigoCreditNoteUrl && (
                                    <Link
                                      href={registro.siigoCreditNoteUrl}
                                      target="_blank"
                                      className="text-xs font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
                                    >
                                      Ver nota credito
                                    </Link>
                                  )}
                                </div>
                              )}
                              {!notaCreditoSiigoEmitida &&
                                registro.siigoCreditNoteError && (
                                  <div className="border-t border-red-100 pt-2 text-xs leading-5 text-red-700">
                                    {registro.siigoCreditNoteError}
                                  </div>
                                )}
                            </div>
                          ) : notaCreditoSiigoEmitida ? (
                            <div className="min-w-48 space-y-2">
                              <div className="font-bold text-amber-800">
                                NC {registro.siigoCreditNoteName || "Emitida"}
                              </div>
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                                {registro.siigoCreditNoteStatus || "Nota credito"}
                              </div>
                              {registro.siigoCreditNoteUrl && (
                                <Link
                                  href={registro.siigoCreditNoteUrl}
                                  target="_blank"
                                  className="text-xs font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
                                >
                                  Ver nota credito
                                </Link>
                              )}
                            </div>
                          ) : facturaManualRegistrada ? (
                            <span className="text-sm text-slate-500">
                              Factura manual
                            </span>
                          ) : superaTopeSiigo ? (
                            <div className="max-w-64 text-xs leading-5 text-amber-700">
                              Supera tope Siigo: {formatMoney(totalSiigo)}. Maximo{" "}
                              {formatMoney(SIIGO_MAX_FACTURA_TOTAL)}.
                            </div>
                          ) : registro.siigoCreditNoteError ? (
                            <div className="max-w-64 text-xs leading-5 text-red-700">
                              {registro.siigoCreditNoteError}
                            </div>
                          ) : registro.siigoInvoiceError ? (
                            <div
                              className={`max-w-64 text-xs leading-5 ${
                                isSiigoTemporaryMessage(registro.siigoInvoiceError)
                                  ? "text-amber-700"
                                  : "text-red-700"
                              }`}
                            >
                              {registro.siigoInvoiceError}
                            </div>
                          ) : !convertido ? (
                            <span className="text-sm text-slate-500">
                              Se emite al convertir
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">Sin emitir</span>
                          )}
                        </td>
                        <td className="hidden">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estado.pillClass}`}
                          >
                            {estado.label}
                          </span>
                        </td>
                        <td className="border-t border-slate-100 px-5 py-5">
                          <div className="flex flex-col gap-2">
                            {!registroCerradoConNotaCredito && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void emitirFacturaSiigo(registro.id)}
                                  disabled={
                                    emitiendoSiigoId === registro.id || !puedeEmitirSiigo
                                  }
                                  className="min-h-10 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black uppercase tracking-[0.04em] text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  {emitiendoSiigoId === registro.id
                                    ? "Enviando..."
                                    : facturaSiigoEmitida
                                      ? "Emitida en Siigo"
                                      : superaTopeSiigo
                                        ? "Supera tope"
                                      : !convertido
                                        ? "Pendiente venta"
                                        : registro.siigoInvoiceError
                                          ? "Reintentar Siigo"
                                      : "Enviar a Siigo"}
                                </button>

                                {facturaSiigoEmitida && !notaCreditoSiigoEmitida && (
                                  <button
                                    type="button"
                                    onClick={() => void reenviarCorreoSiigo(registro.id)}
                                    disabled={reenviandoCorreoId === registro.id}
                                    className="min-h-10 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black uppercase tracking-[0.04em] text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                  >
                                    {reenviandoCorreoId === registro.id
                                      ? "Reenviando..."
                                      : "Reenviar correo"}
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setEditando(createEditDraft(registro))}
                                  disabled={!puedeModificarRegistro}
                                  className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black uppercase tracking-[0.04em] text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  Modificar
                                </button>
                              </>
                            )}

                            {puedeEmitirNotaCreditoManual && (
                              <button
                                type="button"
                                onClick={() => void emitirNotaCreditoSiigo(registro.id)}
                                disabled={emitiendoNcId === registro.id}
                                className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black uppercase tracking-[0.04em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {emitiendoNcId === registro.id
                                  ? "Emitiendo NC..."
                                  : "Emitir NC"}
                              </button>
                            )}

                            {puedeQuitarFacturaBorrada && (
                              <button
                                type="button"
                                onClick={() => void quitarFacturaBorradaSiigo(registro.id)}
                                disabled={limpiandoSiigoId === registro.id}
                                className="min-h-10 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black uppercase tracking-[0.04em] text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {limpiandoSiigoId === registro.id
                                  ? "Quitando..."
                                  : "Quitar factura borrada"}
                              </button>
                            )}

                            {puedeEliminar &&
                              (!convertido || registroCerradoConNotaCredito) && (
                              <button
                                type="button"
                                onClick={() => void eliminarRegistro(registro.id)}
                                disabled={eliminandoId === registro.id}
                                className="min-h-10 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black uppercase tracking-[0.04em] text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {eliminandoId === registro.id
                                  ? "Eliminando..."
                                  : registroCerradoConNotaCredito
                                    ? "Quitar del panel"
                                    : "Eliminar"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!cargando && registrosFiltrados.length > 0 && (
            <div className={styles.pagination}>
              <p className="text-xs text-slate-500">
                Mostrando {primerRegistroVisible.toLocaleString("es-CO")}–
                {ultimoRegistroVisible.toLocaleString("es-CO")} de{" "}
                {registrosFiltrados.length.toLocaleString("es-CO")}
              </p>
              <nav
                className="flex flex-wrap items-center gap-1.5"
                aria-label="Paginación de registros"
              >
                <button
                  type="button"
                  onClick={() => setPaginaActual((pagina) => Math.max(1, pagina - 1))}
                  disabled={paginaActual === 1}
                  className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.04em] text-slate-600 transition hover:border-red-200 hover:text-[#e30613] disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  Anterior
                </button>
                {paginasVisibles.map((pagina, index) => {
                  const paginaAnterior = paginasVisibles[index - 1];

                  return (
                    <span key={pagina} className="contents">
                      {paginaAnterior && pagina - paginaAnterior > 1 ? (
                        <span className="px-1 text-slate-400" aria-hidden="true">
                          …
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setPaginaActual(pagina)}
                        aria-current={pagina === paginaActual ? "page" : undefined}
                        className={`h-10 min-w-10 rounded-xl border px-3 text-xs font-black transition ${
                          pagina === paginaActual
                            ? "border-[#e30613] bg-[#e30613] text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-[#e30613]"
                        }`}
                      >
                        {pagina}
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setPaginaActual((pagina) => Math.min(totalPaginas, pagina + 1))
                  }
                  disabled={paginaActual === totalPaginas}
                  className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.04em] text-slate-600 transition hover:border-red-200 hover:text-[#e30613] disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  Siguiente
                </button>
              </nav>
            </div>
          )}
        </section>
        </main>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_90px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Modificar registro
                </div>
                <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                  Nota credito / ajuste de factura
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {editandoConvertido
                    ? "Este registro ya esta convertido en venta. Como administrador puedes corregir datos basicos del cliente y facturacion."
                    : "Puedes actualizar los datos visibles del registro y corregir la informacion de financieras antes de facturar."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
              >
                Cerrar
              </button>
            </div>

            {editandoConvertido && (
              <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-800">
                Equipo, IMEI y financieras quedan bloqueados porque la venta ya
                existe. Para cambios operativos usa el flujo correspondiente de
                venta o inventario.
              </div>
            )}

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Tipo de identificacion
                <select
                  value={editando.tipoDocumento || "CC"}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            tipoDocumento: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {TIPOS_DOCUMENTO_CLIENTE.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Numero de cedula
                <input
                  value={editando.documentoNumero}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            documentoNumero: onlyDigits(event.target.value),
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Nombre completo
                <input
                  value={editando.clienteNombre}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            clienteNombre: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Correo electronico
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    value={editando.correo}
                    onChange={(event) =>
                      setEditando((current) =>
                      current
                        ? {
                            ...current,
                            correo: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  WhatsApp
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    value={editando.whatsapp}
                    onChange={(event) =>
                      setEditando((current) =>
                        current
                          ? {
                              ...current,
                              whatsapp: onlyDigits(event.target.value, 10),
                            }
                          : current
                      )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Direccion
                <input
                  value={editando.direccion}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            direccion: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Barrio
                <input
                  value={editando.barrio}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            barrio: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Referencia
                <input
                  value={editando.referenciaEquipo}
                  disabled={editandoConvertido}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            referenciaEquipo: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                IMEI
                <input
                  value={editando.serialImei}
                  disabled={editandoConvertido}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            serialImei: onlyDigits(event.target.value, 15),
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>

              <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Numero de factura
                <input
                  value={editando.numeroFactura}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            numeroFactura: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Puedes cambiarlo o dejarlo vacio"
                />
              </label>

              <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Estado
                <select
                  value={editando.estadoFacturacion}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            estadoFacturacion: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {ESTADO_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!editandoConvertido && (
              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Financieras
                </div>

                <div className="mt-5 space-y-4">
                  {editando.financierasDetalle.map((financiera, index) => (
                    <div
                      key={`edicion-financiera-${index}`}
                      className="rounded-[26px] border border-slate-200 bg-white p-4"
                    >
                      <p className="text-sm font-bold text-slate-900">
                        Financiera {index + 1}
                      </p>

                      <div
                        className={`mt-4 grid gap-4 ${
                          financieraRequiereInicial(index)
                            ? "md:grid-cols-3"
                            : "md:grid-cols-2"
                        }`}
                      >
                        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                          Financiera
                          <select
                            value={financiera.plataformaCredito}
                            onChange={(event) =>
                              setEditando((current) =>
                                current
                                  ? {
                                      ...current,
                                      financierasDetalle: current.financierasDetalle.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                plataformaCredito: event.target.value,
                                              }
                                            : item
                                      ),
                                    }
                                  : current
                              )
                            }
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          >
                            <option value="">Selecciona una financiera</option>
                            {financierasCatalogo.map((item) => (
                              <option key={item.id} value={item.nombre}>
                                {item.nombre}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                          Credito autorizado
                          <input
                            value={financiera.creditoAutorizado}
                            onChange={(event) =>
                              setEditando((current) =>
                                current
                                  ? {
                                      ...current,
                                      financierasDetalle: current.financierasDetalle.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                creditoAutorizado: formatearPesoInput(
                                                  event.target.value
                                                ),
                                              }
                                            : item
                                      ),
                                    }
                                  : current
                              )
                            }
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>

                        {financieraRequiereInicial(index) && (
                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Inicial
                            <input
                              value={financiera.cuotaInicial}
                              onChange={(event) =>
                                setEditando((current) =>
                                  current
                                    ? {
                                        ...current,
                                        financierasDetalle: current.financierasDetalle.map(
                                          (item, itemIndex) =>
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  cuotaInicial: formatearPesoInput(
                                                    event.target.value
                                                  ),
                                                }
                                              : item
                                        ),
                                      }
                                    : current
                                )
                              }
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={guardandoEdicion}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
