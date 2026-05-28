"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DOMINIOS_CORREO_REGISTRO_TEXTO,
  TIPOS_DOCUMENTO_CLIENTE,
  esCorreoRegistroValido,
  esWhatsappRegistroValido,
  financieraRequiereInicial,
  formatearPesoInput,
} from "@/lib/vendor-sale-records";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type CatalogoPersonalResponse = {
  financieras: Array<{ id: number; nombre: string }>;
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
  const puedeEliminar = String(session.rolNombre || "").trim().toUpperCase() === "ADMIN";
  const [registros, setRegistros] = useState<RegistroFacturacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);
  const [emitiendoSiigoId, setEmitiendoSiigoId] = useState<number | null>(null);
  const [emitiendoNcId, setEmitiendoNcId] = useState<number | null>(null);
  const [liberandoSiigoId, setLiberandoSiigoId] = useState<number | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
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

  const pendientes = useMemo(
    () =>
      registros.filter(
        (item) =>
          resolveEstadoBadge(item.estadoFacturacion, item.numeroFactura).label ===
          "Pendiente"
      ).length,
    [registros]
  );

  const facturados = useMemo(
    () =>
      registros.filter(
        (item) =>
          resolveEstadoBadge(item.estadoFacturacion, item.numeroFactura).label ===
          "Facturado"
      ).length,
    [registros]
  );

  const registrosFiltrados = useMemo(() => {
    const criterio = busqueda.trim().toLowerCase();

    if (!criterio) {
      return registros;
    }

    const digits = criterio.replace(/\D/g, "");

    return registros.filter((registro) => {
      const documento = String(registro.documentoNumero || "").replace(/\D/g, "");
      const imei = String(registro.serialImei || "").replace(/\D/g, "");
      const textoBase = [
        registro.clienteNombre,
        registro.puntoVenta,
        registro.referenciaEquipo,
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
  }, [busqueda, registros]);

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

  const liberarFacturaSiigo = async (registroId: number) => {
    const confirmar = window.confirm(
      "Usa esto solo si ya borraste el borrador en Siigo. Conectamos quitara la marca de factura emitida para poder facturar de nuevo. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setLiberandoSiigoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "LIBERAR_SIIGO",
          id: registroId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo liberar la factura Siigo");
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
      setMensaje(data.mensaje || "Factura Siigo liberada en Conectamos");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error liberando factura Siigo");
    } finally {
      setLiberandoSiigoId(null);
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
        `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`
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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto w-full max-w-none">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                {esAdmin ? "Consulta de registros" : "Facturacion"}
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                {esAdmin ? "CONSULTAR REGISTROS" : "REGISTROS GUARDADOS"}
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                {esAdmin
                  ? "Busca por cédula o IMEI, consulta la información del trámite, edita el registro o elimínalo cuando el cliente solicite copia o ajuste."
                  : "Revisa los registros capturados por los asesores en todas las sedes, agrega el numero de factura y deja marcada la fila como facturada."}
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

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Perfil
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {session.perfilNombre}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {esAdmin ? "Administrador" : session.perfilTipoLabel}
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pendientes
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-amber-600">
              {pendientes}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Registros globales sin numero de factura.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Facturados
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
              {facturados}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Filas globales en verde con numero de factura.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Tabla horizontal
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                {esAdmin ? "Registros para consultar" : "Registros para facturar"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {esAdmin
                  ? "Puedes buscar por cédula o IMEI, consultar la información completa, editar el registro o eliminarlo cuando corresponda."
                  : "Puedes revisar los datos, guardar la factura y modificar el registro si necesitas hacer una nota credito."}
              </p>
            </div>

            <div className="w-full max-w-md">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Buscar por IMEI o cedula
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Ej: 3551... o 1110..."
                />
              </label>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            {busqueda.trim()
              ? `${registrosFiltrados.length} registro(s) encontrados para la busqueda actual.`
              : `${registros.length} registro(s) activos disponibles para gestion.`}
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[2700px] border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Punto / sede</th>
                  <th className="px-4 py-2">Tipo de identificacion</th>
                  <th className="px-4 py-2">Numero de cedula</th>
                  <th className="px-4 py-2">Nombre completo</th>
                  <th className="px-4 py-2">Correo electronico</th>
                  <th className="px-4 py-2">WhatsApp</th>
                  <th className="px-4 py-2">Direccion</th>
                  <th className="px-4 py-2">Barrio</th>
                  <th className="px-4 py-2">Referencia</th>
                  <th className="px-4 py-2">IMEI</th>
                  <th className="px-4 py-2">Inicial</th>
                  <th className="px-4 py-2">
                    Creditos autorizados / financiera
                  </th>
                  <th className="px-4 py-2">Numero de factura</th>
                  <th className="px-4 py-2">Siigo</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Accion</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={17} className="px-4 py-8 text-sm text-slate-500">
                      Cargando registros...
                    </td>
                  </tr>
                ) : registrosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-4 py-8 text-sm text-slate-500">
                      {busqueda.trim()
                        ? "No hay registros que coincidan con la cedula o IMEI consultado."
                        : "No hay registros guardados para facturar."}
                    </td>
                  </tr>
                ) : (
                  registrosFiltrados.map((registro) => {
                    const estado = resolveEstadoBadge(
                      registro.estadoFacturacion,
                      registro.numeroFactura
                    );
                    const draft = facturasDraft[registro.id] ?? registro.numeroFactura ?? "";
                    const financieras = resolveFinancieras(registro);
                    const esContado = esRegistroContado(registro);
                    const convertido = esRegistroConvertido(registro);
                    const puedeModificarRegistro = esAdmin || !convertido;
                    const pagosContado = resolvePagosContado(registro);
                    const facturaSiigoEmitida = Boolean(registro.siigoInvoiceId);
                    const facturaManualRegistrada =
                      Boolean(registro.numeroFactura) && !facturaSiigoEmitida;
                    const avisoCorreoSiigo =
                      facturaSiigoEmitida &&
                      String(registro.siigoInvoiceError || "")
                        .toLowerCase()
                        .includes("correo");
                    const notaCreditoSiigoEmitida = Boolean(
                      registro.siigoCreditNoteId
                    );
                    const puedeEmitirNotaCreditoManual =
                      esAdmin && facturaSiigoEmitida && !notaCreditoSiigoEmitida;
                    const puedeLiberarFacturaSiigo =
                      esAdmin && facturaSiigoEmitida && !notaCreditoSiigoEmitida;
                    const puedeEmitirSiigo =
                      convertido && !facturaSiigoEmitida && !registro.numeroFactura;
                    const financierasConInicial = financieras.filter(
                      (item, index) =>
                        financieraRequiereInicial(index) &&
                        item.cuotaInicial !== null &&
                        item.cuotaInicial !== undefined &&
                        item.cuotaInicial !== ""
                    );

                    return (
                      <tr
                        key={registro.id}
                        className={`rounded-[24px] ${estado.rowClass}`}
                      >
                        <td className="rounded-l-[24px] border-y border-l border-slate-200 px-4 py-4 text-sm">
                          {formatDate(registro.createdAt)}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.puntoVenta || "Sin punto"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm font-semibold uppercase">
                          {registro.tipoDocumento || "Sin tipo"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.documentoNumero}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm font-semibold">
                          {registro.clienteNombre}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.correo || "Sin correo"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.whatsapp || "Sin WhatsApp"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.direccion || "Sin direccion"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.barrio || "Sin barrio"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.referenciaEquipo || "Sin referencia"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.serialImei || "Sin IMEI"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
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
                          ) : financierasConInicial.length > 0 ? (
                            <div className="space-y-2">
                              {financierasConInicial.map((item, index) => (
                                <div
                                  key={`${registro.id}-inicial-${index}`}
                                  className="min-w-40"
                                >
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {item.plataformaCredito || `Financiera ${index + 1}`}
                                  </div>
                                  <div className="mt-1 font-semibold text-slate-900">
                                    {formatMoney(item.cuotaInicial)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">No aplica</span>
                          )}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
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
                        <td className="border-y border-slate-200 px-4 py-4">
                          <input
                            value={draft}
                            disabled={facturaSiigoEmitida || !convertido}
                            onChange={(event) =>
                              setFacturasDraft((current) => ({
                                ...current,
                                [registro.id]: event.target.value,
                              }))
                            }
                            className={`w-48 rounded-2xl border px-4 py-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ${estado.inputClass}`}
                            placeholder="Factura"
                          />
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
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
                              {avisoCorreoSiigo && (
                                <div className="border-t border-amber-100 pt-2 text-xs leading-5 text-amber-700">
                                  {registro.siigoInvoiceError}
                                </div>
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
                          ) : registro.siigoCreditNoteError ? (
                            <div className="max-w-64 text-xs leading-5 text-red-700">
                              {registro.siigoCreditNoteError}
                            </div>
                          ) : registro.siigoInvoiceError ? (
                            <div className="max-w-64 text-xs leading-5 text-red-700">
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
                        <td className="border-y border-slate-200 px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estado.pillClass}`}
                          >
                            {estado.label}
                          </span>
                        </td>
                        <td className="rounded-r-[24px] border-y border-r border-slate-200 px-4 py-4">
                          <div className="flex min-w-44 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => void guardarFactura(registro.id)}
                              disabled={
                                guardandoId === registro.id ||
                                facturaSiigoEmitida ||
                                !convertido ||
                                !String(draft).trim()
                              }
                              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${estado.buttonClass} disabled:cursor-not-allowed disabled:bg-slate-300`}
                            >
                              {guardandoId === registro.id ? "Guardando..." : "Guardar"}
                            </button>

                            <button
                              type="button"
                              onClick={() => void emitirFacturaSiigo(registro.id)}
                              disabled={
                                emitiendoSiigoId === registro.id || !puedeEmitirSiigo
                              }
                              className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              {emitiendoSiigoId === registro.id
                                ? "Enviando..."
                                : facturaSiigoEmitida
                                  ? "Emitida en Siigo"
                                  : !convertido
                                    ? "Pendiente venta"
                                  : "Enviar a Siigo"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditando(createEditDraft(registro))}
                              disabled={!puedeModificarRegistro}
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              Modificar
                            </button>

                            {puedeEmitirNotaCreditoManual && (
                              <button
                                type="button"
                                onClick={() => void emitirNotaCreditoSiigo(registro.id)}
                                disabled={emitiendoNcId === registro.id}
                                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {emitiendoNcId === registro.id
                                  ? "Emitiendo NC..."
                                  : "Emitir NC"}
                              </button>
                            )}

                            {puedeLiberarFacturaSiigo && (
                              <button
                                type="button"
                                onClick={() => void liberarFacturaSiigo(registro.id)}
                                disabled={liberandoSiigoId === registro.id}
                                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {liberandoSiigoId === registro.id
                                  ? "Liberando..."
                                  : "Liberar borrador"}
                              </button>
                            )}

                            {puedeEliminar && !convertido && (
                              <button
                                type="button"
                                onClick={() => void eliminarRegistro(registro.id)}
                                disabled={eliminandoId === registro.id}
                                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {eliminandoId === registro.id ? "Eliminando..." : "Eliminar"}
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
        </section>
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
