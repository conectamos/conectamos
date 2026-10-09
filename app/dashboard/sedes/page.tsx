"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./sedes.module.css";

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type SedeAdminItem = {
  id: number;
  nombre: string;
  codigo: string | null;
  activa: boolean;
  soloInventarioPorCobrar: boolean;
  facturacionNombre: string | null;
  facturacionTipoDocumento: string | null;
  facturacionDocumento: string | null;
  facturacionCorreo: string | null;
  facturacionTelefono: string | null;
  facturacionDireccion: string | null;
  siigoEnabled: boolean;
  siigoInvoiceDocumentId: number | null;
  siigoSellerId: number | null;
  siigoPaymentTypeId: number | null;
  siigoItemCode: string | null;
  siigoCostCenterId: number | null;
  siigoDefaultCountryCode: string | null;
  siigoDefaultStateCode: string | null;
  siigoDefaultCityCode: string | null;
  siigoDefaultPostalCode: string | null;
  siigoStampSend: boolean;
  siigoMailSend: boolean;
  siigoPaymentDueDays: number;
  acceso: {
    id: number;
    nombre: string;
    usuario: string;
    activo: boolean;
  } | null;
};

type SedeEdicion = {
  nombre: string;
  codigo: string;
  usuario: string;
  clave: string;
  soloInventarioPorCobrar: boolean;
  facturacionNombre: string;
  facturacionTipoDocumento: string;
  facturacionDocumento: string;
  facturacionCorreo: string;
  facturacionTelefono: string;
  facturacionDireccion: string;
  siigoEnabled: boolean;
  siigoInvoiceDocumentId: string;
  siigoSellerId: string;
  siigoPaymentTypeId: string;
  siigoItemCode: string;
  siigoCostCenterId: string;
  siigoDefaultCountryCode: string;
  siigoDefaultStateCode: string;
  siigoDefaultCityCode: string;
  siigoDefaultPostalCode: string;
  siigoStampSend: boolean;
  siigoMailSend: boolean;
  siigoPaymentDueDays: string;
};

type CatalogosSiigo = {
  documentTypes?: unknown;
  creditNoteDocumentTypes?: unknown;
  users?: unknown;
  paymentTypes?: unknown;
  products?: unknown;
  costCenters?: unknown;
};

function slugUsuarioSede(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function crearEdicionDesdeSede(sede: SedeAdminItem): SedeEdicion {
  return {
    nombre: sede.nombre,
    codigo: sede.codigo || "",
    usuario: sede.acceso?.usuario || "",
    clave: "",
    soloInventarioPorCobrar: Boolean(sede.soloInventarioPorCobrar),
    facturacionNombre: sede.facturacionNombre || "",
    facturacionTipoDocumento: sede.facturacionTipoDocumento || "NIT",
    facturacionDocumento: sede.facturacionDocumento || "",
    facturacionCorreo: sede.facturacionCorreo || "",
    facturacionTelefono: sede.facturacionTelefono || "",
    facturacionDireccion: sede.facturacionDireccion || "",
    siigoEnabled: Boolean(sede.siigoEnabled),
    siigoInvoiceDocumentId: sede.siigoInvoiceDocumentId
      ? String(sede.siigoInvoiceDocumentId)
      : "",
    siigoSellerId: sede.siigoSellerId ? String(sede.siigoSellerId) : "",
    siigoPaymentTypeId: sede.siigoPaymentTypeId
      ? String(sede.siigoPaymentTypeId)
      : "",
    siigoItemCode: sede.siigoItemCode || "",
    siigoCostCenterId: sede.siigoCostCenterId
      ? String(sede.siigoCostCenterId)
      : "",
    siigoDefaultCountryCode: sede.siigoDefaultCountryCode || "CO",
    siigoDefaultStateCode: sede.siigoDefaultStateCode || "",
    siigoDefaultCityCode: sede.siigoDefaultCityCode || "",
    siigoDefaultPostalCode: sede.siigoDefaultPostalCode || "",
    siigoStampSend: Boolean(sede.siigoStampSend),
    siigoMailSend: Boolean(sede.siigoMailSend),
    siigoPaymentDueDays: String(sede.siigoPaymentDueDays ?? 0),
  };
}

function soloDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

function esSedeOnline(sede: SedeAdminItem) {
  return (
    sede.nombre.trim().toUpperCase() === "ONLINE" ||
    String(sede.codigo || "")
      .trim()
      .toUpperCase() === "ONLINE"
  );
}

function usaResolucionOnline(sede: SedeAdminItem) {
  const nombre = sede.nombre.trim().toUpperCase();
  const codigo = String(sede.codigo || "")
    .trim()
    .toUpperCase();

  return (
    esSedeOnline(sede) ||
    nombre.startsWith("STAND ") ||
    codigo.startsWith("STAND-")
  );
}

function extraerItemsCatalogo(valor: unknown) {
  if (Array.isArray(valor)) {
    return valor.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    );
  }

  if (!valor || typeof valor !== "object") {
    return [];
  }

  const record = valor as Record<string, unknown>;

  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(record[key])) {
      return record[key].filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      );
    }
  }

  return [];
}

function textoCatalogo(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];

    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function nombreUsuarioSiigo(item: Record<string, unknown>) {
  const direct = textoCatalogo(item, [
    "name",
    "full_name",
    "username",
    "email",
  ]);

  if (direct) {
    return direct;
  }

  return [item.first_name, item.last_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function valorDetalleCatalogo(
  item: Record<string, unknown>,
  label: string,
  keys: string[],
) {
  const value = textoCatalogo(item, keys);

  return value ? `${label}: ${value}` : "";
}

function tituloDocumentoSiigo(item: Record<string, unknown>) {
  const id = textoCatalogo(item, ["id"]);
  const prefix = textoCatalogo(item, ["prefix"]);
  const code = textoCatalogo(item, ["code"]);
  const name = textoCatalogo(item, ["name"]);
  const mainLabel = prefix || code || name;

  if (mainLabel && name && mainLabel !== name) {
    return `${id} - ${mainLabel} (${name})`;
  }

  return [id, mainLabel].filter(Boolean).join(" - ");
}

function detalleDocumentoSiigo(item: Record<string, unknown>) {
  return [
    valorDetalleCatalogo(item, "Codigo", ["code"]),
    valorDetalleCatalogo(item, "Consecutivo", ["consecutive"]),
    valorDetalleCatalogo(item, "Descripcion", ["description"]),
  ]
    .filter(Boolean)
    .join(" · ");
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function codigoDocumentoParaSede(sede: SedeAdminItem) {
  const nombre = normalizarTexto(sede.nombre);
  const codigo = normalizarTexto(sede.codigo);
  const texto = `${nombre} ${codigo}`;

  if (
    nombre === "ONLINE" ||
    codigo === "ONLINE" ||
    nombre.startsWith("STAND") ||
    codigo.startsWith("STAND-")
  ) {
    return "8";
  }

  if (texto.includes("TROP")) {
    return "9";
  }

  const match = texto.match(/\bSEDE[-\s#]*(\d+)\b/);
  const numero = match ? Number(match[1]) : 0;

  return numero >= 1 && numero <= 7 ? String(numero) : "";
}

function buscarIdPorCodigo(items: Record<string, unknown>[], codigo: string) {
  const item = items.find(
    (catalogo) => textoCatalogo(catalogo, ["code"]) === codigo,
  );

  return item ? textoCatalogo(item, ["id"]) : "";
}

function buscarUsuarioAndres(items: Record<string, unknown>[]) {
  const item = items.find((catalogo) =>
    normalizarTexto(
      [
        textoCatalogo(catalogo, ["name"]),
        textoCatalogo(catalogo, ["full_name"]),
        textoCatalogo(catalogo, ["username"]),
        textoCatalogo(catalogo, ["email"]),
        nombreUsuarioSiigo(catalogo),
      ].join(" "),
    ).includes("ANDRES03BK@GMAIL.COM"),
  );

  return item ? textoCatalogo(item, ["id"]) : "103";
}

function buscarPagoEfectivo(items: Record<string, unknown>[]) {
  const item = items.find((catalogo) =>
    normalizarTexto(textoCatalogo(catalogo, ["name"])).includes("EFECTIVO"),
  );

  return item ? textoCatalogo(item, ["id"]) : "910";
}

function buscarProductoExento(items: Record<string, unknown>[]) {
  const porCodigo = items.find(
    (catalogo) => textoCatalogo(catalogo, ["code"]) === "002",
  );
  const porNombre = items.find((catalogo) =>
    normalizarTexto(textoCatalogo(catalogo, ["name", "description"])).includes(
      "EXENT",
    ),
  );

  return textoCatalogo(porCodigo || porNombre || {}, ["code"]) || "002";
}

function esCatalogoActivo(item: Record<string, unknown>) {
  const active = item.active;

  return (
    active === undefined ||
    active === null ||
    active === true ||
    String(active) === "true"
  );
}

function buscarCentroCostoParaSede(
  items: Record<string, unknown>[],
  sede: SedeAdminItem,
) {
  const codigoSede = codigoDocumentoParaSede(sede);

  if (!codigoSede) {
    return "";
  }

  const disponibles = items.filter(esCatalogoActivo);
  const candidatos = disponibles.length > 0 ? disponibles : items;
  const patrones = [`CC${codigoSede}-`, `SEDE ${codigoSede}`];

  if (codigoSede === "8") {
    patrones.push("ONLINE", "ONE LINE", "ON LINE");
  }

  if (codigoSede === "9") {
    patrones.push("TROP", "TROPAS");
  }

  const item = candidatos.find((catalogo) => {
    const texto = normalizarTexto(
      [
        textoCatalogo(catalogo, ["code"]),
        textoCatalogo(catalogo, ["name", "description"]),
      ].join(" "),
    );

    return patrones.some((patron) => texto.includes(patron));
  });

  return item ? textoCatalogo(item, ["id"]) : "";
}

function tituloCentroCostoSiigo(item: Record<string, unknown>) {
  return [
    textoCatalogo(item, ["id"]),
    textoCatalogo(item, ["code"]),
    textoCatalogo(item, ["name", "description"]),
  ]
    .filter(Boolean)
    .join(" - ");
}

function payloadSedePatch(sedeId: number, payload?: SedeEdicion) {
  return {
    sedeId,
    nombre: payload?.nombre,
    codigo: payload?.codigo,
    usuario: payload?.usuario,
    clave: payload?.clave,
    soloInventarioPorCobrar: Boolean(payload?.soloInventarioPorCobrar),
    facturacionNombre: payload?.facturacionNombre,
    facturacionTipoDocumento: payload?.facturacionTipoDocumento,
    facturacionDocumento: payload?.facturacionDocumento,
    facturacionCorreo: payload?.facturacionCorreo,
    facturacionTelefono: payload?.facturacionTelefono,
    facturacionDireccion: payload?.facturacionDireccion,
    siigoEnabled: Boolean(payload?.siigoEnabled),
    siigoInvoiceDocumentId: payload?.siigoInvoiceDocumentId,
    siigoSellerId: payload?.siigoSellerId,
    siigoPaymentTypeId: payload?.siigoPaymentTypeId,
    siigoItemCode: payload?.siigoItemCode,
    siigoCostCenterId: payload?.siigoCostCenterId,
    siigoDefaultCountryCode: payload?.siigoDefaultCountryCode,
    siigoDefaultStateCode: payload?.siigoDefaultStateCode,
    siigoDefaultCityCode: payload?.siigoDefaultCityCode,
    siigoDefaultPostalCode: payload?.siigoDefaultPostalCode,
    siigoStampSend: Boolean(payload?.siigoStampSend),
    siigoMailSend: Boolean(payload?.siigoMailSend),
    siigoPaymentDueDays: payload?.siigoPaymentDueDays,
  };
}

export default function GestionSedesPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<SedeAdminItem[]>([]);
  const [ediciones, setEdiciones] = useState<Record<number, SedeEdicion>>({});
  const [cargando, setCargando] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardandoNueva, setGuardandoNueva] = useState(false);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [editor, setEditor] = useState<number | "new" | null>(null);
  const [siigoOpen, setSiigoOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [nuevaSedeNombre, setNuevaSedeNombre] = useState("");
  const [nuevaSedeCodigo, setNuevaSedeCodigo] = useState("");
  const [nuevoUsuario, setNuevoUsuario] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevaSoloInventarioPorCobrar, setNuevaSoloInventarioPorCobrar] = useState(false);
  const [cargandoCatalogosSiigo, setCargandoCatalogosSiigo] = useState(false);
  const [guardandoSiigoMasivo, setGuardandoSiigoMasivo] = useState(false);
  const [catalogosSiigo, setCatalogosSiigo] = useState<CatalogosSiigo | null>(null);
  const [catalogosSiigoError, setCatalogosSiigoError] = useState("");
  const [catalogTab, setCatalogTab] = useState("documents");
  const [catalogSearch, setCatalogSearch] = useState("");
  const catalogDialog = useRef<HTMLDialogElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const catalogTriggerRef = useRef<HTMLElement | null>(null);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.trim().toUpperCase() || "");
  const busy = guardandoNueva || procesandoId !== null || guardandoSiigoMasivo;
  const selectedSede = typeof editor === "number" ? sedes.find((sede) => sede.id === editor) : undefined;
  const edicion = selectedSede ? ediciones[selectedSede.id] || crearEdicionDesdeSede(selectedSede) : undefined;
  const documentosSiigo = extraerItemsCatalogo(catalogosSiigo?.documentTypes);
  const notasCreditoSiigo = extraerItemsCatalogo(catalogosSiigo?.creditNoteDocumentTypes);
  const usuariosSiigo = extraerItemsCatalogo(catalogosSiigo?.users);
  const pagosSiigo = extraerItemsCatalogo(catalogosSiigo?.paymentTypes);
  const productosSiigo = extraerItemsCatalogo(catalogosSiigo?.products);
  const centrosCostoSiigo = extraerItemsCatalogo(catalogosSiigo?.costCenters);

  const actualizarSedes = useCallback((items: SedeAdminItem[], savedId?: number) => {
    setSedes(items);
    setEdiciones((previous) => Object.fromEntries(items.map((sede) => [sede.id,
      savedId !== undefined && sede.id !== savedId && previous[sede.id]
        ? previous[sede.id] : crearEdicionDesdeSede(sede),
    ])));
  }, []);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    setLoadError("");
    try {
      const [resSession, resSedes] = await Promise.all([
        fetch("/api/session", { cache: "no-store" }),
        fetch("/api/sedes/admin", { cache: "no-store" }),
      ]);
      const sessionData = await resSession.json();
      const sedesData = await resSedes.json();
      if (!resSession.ok) throw new Error(sessionData.error || "No se pudo verificar tu sesión.");
      setUser(sessionData);
      if (!resSedes.ok || !sedesData.ok || !Array.isArray(sedesData.sedes)) {
        throw new Error(sedesData.error || "No se pudo cargar la gestión de sedes.");
      }
      actualizarSedes(sedesData.sedes);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Error cargando la gestión de sedes.");
    } finally {
      setCargando(false);
    }
  }, [actualizarSedes]);

  useEffect(() => { void cargarTodo(); }, [cargarTodo]);

  useEffect(() => {
    if (editor === null) return;
    const media = window.matchMedia("(max-width: 900px)");
    const previousOverflow = document.body.style.overflow;
    const syncModal = () => {
      document.body.style.overflow = media.matches ? "hidden" : previousOverflow;
      if (media.matches) editorRef.current?.setAttribute("aria-modal", "true");
      else editorRef.current?.removeAttribute("aria-modal");
    };
    syncModal();
    media.addEventListener("change", syncModal);
    editorHeadingRef.current?.focus({ preventScroll: true });
    return () => {
      media.removeEventListener("change", syncModal);
      document.body.style.overflow = previousOverflow;
    };
  }, [editor]);

  const abrirEditor = (value: number | "new", trigger: HTMLElement) => {
    if (busy) return;
    editorTriggerRef.current = trigger;
    setEditor(value);
    setSiigoOpen(false);
    setShowPassword(false);
    setFormError("");
    setMensaje("");
  };

  const cerrarEditor = () => {
    if (busy) return;
    if (typeof editor === "number" && selectedSede) {
      setEdiciones((previous) => ({ ...previous, [selectedSede.id]: crearEdicionDesdeSede(selectedSede) }));
    }
    setEditor(null);
    setFormError("");
    setShowPassword(false);
    editorTriggerRef.current?.focus();
  };

  const actualizarEdicion = <Campo extends keyof SedeEdicion>(sedeId: number, campo: Campo, valor: SedeEdicion[Campo]) => {
    setEdiciones((actual) => ({ ...actual, [sedeId]: { ...actual[sedeId], [campo]: valor } }));
  };

  const crearSede = async () => {
    setGuardandoNueva(true);
    setFormError("");
    setMensaje("");
    try {
      const res = await fetch("/api/sedes/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaSedeNombre, codigo: nuevaSedeCodigo, usuario: nuevoUsuario,
          clave: nuevaClave, soloInventarioPorCobrar: nuevaSoloInventarioPorCobrar }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.sedes)) throw new Error(data.error || "No se pudo crear la sede.");
      actualizarSedes(data.sedes);
      setNuevaSedeNombre(""); setNuevaSedeCodigo(""); setNuevoUsuario(""); setNuevaClave("");
      setNuevaSoloInventarioPorCobrar(false);
      setEditor(null);
      setMensaje(data.mensaje || "Sede creada correctamente.");
      editorTriggerRef.current?.focus();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Error creando la sede.");
    } finally { setGuardandoNueva(false); }
  };

  const cargarCatalogosSiigo = async () => {
    setCargandoCatalogosSiigo(true);
    setCatalogosSiigoError("");
    try {
      const res = await fetch("/api/facturador/siigo/catalogos", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.catalogos) throw new Error(data.error || "No se pudieron consultar los catálogos de Siigo.");
      setCatalogosSiigo(data.catalogos as CatalogosSiigo);
    } catch (error) {
      setCatalogosSiigoError(error instanceof Error ? error.message : "Error consultando catálogos de Siigo.");
    } finally { setCargandoCatalogosSiigo(false); }
  };

  const abrirCatalogos = (trigger: HTMLElement) => {
    catalogTriggerRef.current = trigger;
    catalogDialog.current?.showModal();
    if (!catalogosSiigo) void cargarCatalogosSiigo();
  };

  const cerrarCatalogos = () => {
    if (guardandoSiigoMasivo) return;
    catalogDialog.current?.close();
    catalogTriggerRef.current?.focus();
  };

  const crearEdicionesSiigoSugeridas = () => {
    const vendedorId = buscarUsuarioAndres(usuariosSiigo);
    const pagoId = buscarPagoEfectivo(pagosSiigo);
    const productoCodigo = buscarProductoExento(productosSiigo);
    const siguientes: Record<number, SedeEdicion> = { ...ediciones };
    const configuradas: SedeAdminItem[] = [];
    const faltantes: string[] = [];

    for (const sede of sedes) {
      const codigoDocumento = codigoDocumentoParaSede(sede);

      if (!codigoDocumento) {
        continue;
      }

      const documentId = buscarIdPorCodigo(documentosSiigo, codigoDocumento);
      const centroCostoId = buscarCentroCostoParaSede(centrosCostoSiigo, sede);

      if (!documentId) {
        faltantes.push(sede.nombre);
        continue;
      }

      const base = siguientes[sede.id] || crearEdicionDesdeSede(sede);

      siguientes[sede.id] = {
        ...base,
        siigoEnabled: true,
        siigoInvoiceDocumentId: documentId,
        siigoSellerId: vendedorId,
        siigoPaymentTypeId: pagoId,
        siigoItemCode: productoCodigo,
        siigoCostCenterId: centroCostoId || base.siigoCostCenterId,
        siigoDefaultCountryCode: "CO",
        siigoDefaultStateCode: "73",
        siigoDefaultCityCode: "73001",
        siigoStampSend: true,
        siigoMailSend: true,
        siigoPaymentDueDays: "0",
      };
      configuradas.push(sede);
    }

    return { configuradas, faltantes, siguientes };
  };

  const aplicarSiigoSugerido = () => {
    const { configuradas, faltantes, siguientes } =
      crearEdicionesSiigoSugeridas();

    setEdiciones(siguientes);
    setMensaje(
      [
        `Configuracion Siigo aplicada en pantalla para ${configuradas.length} sedes.`,
        faltantes.length > 0
          ? `No encontre resolucion para: ${faltantes.join(", ")}.`
          : "",
        "Revisa y guarda los cambios.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  };

  const guardarSiigoSugerido = async () => {
    try {
      setGuardandoSiigoMasivo(true);
      setCatalogosSiigoError("");
      setMensaje("");

      const { configuradas, faltantes, siguientes } =
        crearEdicionesSiigoSugeridas();

      if (configuradas.length === 0) {
        setMensaje(
          "No encontre sedes para configurar con los catalogos actuales.",
        );
        return;
      }

      setEdiciones(siguientes);

      for (const sede of configuradas) {
        const res = await fetch("/api/sedes/admin", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadSedePatch(sede.id, siguientes[sede.id])),
        });
        const data = await res.json();

        if (!res.ok || !data.ok || !Array.isArray(data.sedes)) {
          throw new Error(data.error || `No se pudo guardar ${sede.nombre}`);
        }
        actualizarSedes(data.sedes, sede.id);
      }

      setMensaje(
        [
          `Configuracion Siigo guardada para ${configuradas.length} sedes.`,
          "Los stands quedan con la misma resolucion ONLINE.",
          faltantes.length > 0
            ? `No encontre resolucion para: ${faltantes.join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (error) {
      setCatalogosSiigoError(
        error instanceof Error
          ? error.message
          : "Error guardando la configuracion Siigo",
      );
    } finally {
      setGuardandoSiigoMasivo(false);
    }
  };



  const guardarSede = async (sedeId: number) => {
    setProcesandoId(sedeId);
    setFormError(""); setMensaje("");
    try {
      const res = await fetch("/api/sedes/admin", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSedePatch(sedeId, ediciones[sedeId])),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.sedes)) throw new Error(data.error || "No se pudo guardar la sede.");
      actualizarSedes(data.sedes, sedeId);
      setShowPassword(false);
      setMensaje(data.mensaje || "Sede actualizada correctamente.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Error actualizando la sede.");
    } finally { setProcesandoId(null); }
  };

  const navigationItems: { href: string; icon: DashboardIconName; label: string }[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
  ];
  const activos = sedes.filter((sede) => sede.acceso?.activo).length;
  const filteredSedes = sedes.filter((sede) => {
    const matchText = normalizarTexto([sede.nombre, sede.codigo, sede.acceso?.usuario].join(" ")).includes(normalizarTexto(search));
    const matchFilter = filter === "all" || (filter === "active" && Boolean(sede.acceso?.activo))
      || (filter === "inactive" && Boolean(sede.acceso) && !sede.acceso?.activo)
      || (filter === "noaccess" && !sede.acceso) || (filter === "siigo" && sede.siigoEnabled)
      || (filter === "credit" && sede.soloInventarioPorCobrar);
    return matchText && matchFilter;
  });
  const totalPages = Math.max(1, Math.ceil(filteredSedes.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageSedes = filteredSedes.slice(start, start + pageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter((value) =>
    value === 1 || value === totalPages || Math.abs(value - currentPage) <= 1);
  const setQueryFilter = (value: string) => { setFilter(value); setPage(1); };
  const catalogGroups = [
    { id: "documents", label: "Resoluciones", items: documentosSiigo, title: tituloDocumentoSiigo, detail: detalleDocumentoSiigo },
    { id: "credit-notes", label: "Notas crédito", items: notasCreditoSiigo, title: tituloDocumentoSiigo, detail: detalleDocumentoSiigo },
    { id: "users", label: "Vendedores", items: usuariosSiigo, title: (item: Record<string, unknown>) => [textoCatalogo(item, ["id"]), nombreUsuarioSiigo(item)].filter(Boolean).join(" - ") },
    { id: "payments", label: "Formas de pago", items: pagosSiigo, title: (item: Record<string, unknown>) => [textoCatalogo(item, ["id"]), textoCatalogo(item, ["name"])].filter(Boolean).join(" - ") },
    { id: "products", label: "Productos", items: productosSiigo, title: (item: Record<string, unknown>) => [textoCatalogo(item, ["code"]), textoCatalogo(item, ["name", "description"])].filter(Boolean).join(" - ") },
    { id: "cost-centers", label: "Centros de costo", items: centrosCostoSiigo, title: tituloCentroCostoSiigo },
  ];
  const currentCatalog = catalogGroups.find((group) => group.id === catalogTab) || catalogGroups[0];
  const filteredCatalog = currentCatalog.items.filter((item) => normalizarTexto(JSON.stringify(item)).includes(normalizarTexto(catalogSearch)));
  const EditIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15v5Z" /></svg>;
  const EyeIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, Inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map((item) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/dashboard/sedes" ? styles.navActive : ""}`} aria-current={item.href === "/dashboard/sedes" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      {user && <SalesProfile name={user.nombre || user.usuario} role={user.rolNombre} />}
    </header>
    <main className={styles.main}>
      <header className={styles.heading}><div><h1>Gestión de sedes</h1><p>Accesos e integración Siigo.</p></div><div className={styles.headingActions}>
        <button className={styles.button} type="button" onClick={(event) => abrirCatalogos(event.currentTarget)} disabled={!esAdmin || cargando || Boolean(loadError) || busy}><DashboardIcon name="database" />Consultar catálogos</button>
        <button className={`${styles.button} ${styles.primary}`} type="button" onClick={(event) => abrirEditor("new", event.currentTarget)} disabled={!esAdmin || cargando || Boolean(loadError) || busy}><span className={styles.plus} aria-hidden="true">+</span>Nueva sede</button>
      </div></header>
      {cargando ? <div className={`${styles.panel} ${styles.loading}`} role="status"><DashboardIcon name="refresh" /><p>Cargando gestión de sedes…</p></div>
      : loadError ? <div className={`${styles.panel} ${styles.error}`} role="alert"><DashboardIcon name="warning" /><p>{loadError}</p><button type="button" className={styles.button} onClick={() => void cargarTodo()}>Reintentar</button></div>
      : !esAdmin ? <div className={`${styles.panel} ${styles.error}`} role="alert"><p>Solo el administrador o auditor puede gestionar sedes.</p><Link href="/dashboard" className={styles.button}>Volver al inicio</Link></div>
      : <>
        <section className={styles.summary} aria-label="Resumen de sedes">
          <div className={styles.metric}><DashboardIcon name="store" /><div><strong>{sedes.length.toLocaleString("es-CO")}</strong><span>Sedes registradas</span></div></div>
          <div className={styles.metric}><DashboardIcon name="users" /><div><strong>{activos.toLocaleString("es-CO")}</strong><span>Accesos activos</span></div></div>
          <div className={`${styles.metric} ${styles.siigoIcon}`}><DashboardIcon name="document" /><div><strong>{sedes.filter((sede) => sede.siigoEnabled).length.toLocaleString("es-CO")}</strong><span>Siigo activo</span></div></div>
          <div className={`${styles.metric} ${styles.creditIcon}`}><DashboardIcon name="inventory" /><div><strong>{sedes.filter((sede) => sede.soloInventarioPorCobrar).length.toLocaleString("es-CO")}</strong><span>Solo por cobrar</span></div></div>
        </section>
        {mensaje && <div className={styles.notice} role="status">{mensaje}</div>}
        <div className={`${styles.workspace} ${editor !== null ? styles.withEditor : ""}`}>
          <div className={styles.listColumn}>
            <section className={styles.panel} aria-labelledby="sedes-list-title">
              <div className={styles.listHeading}><h2 id="sedes-list-title">Sedes registradas</h2><p>Puedes cambiar nombre, código, usuario de acceso y asignar una nueva clave.</p></div>
              <div className={styles.filters}>
                <label className={styles.search}><DashboardIcon name="search" /><input type="search" aria-label="Buscar sede o usuario" placeholder="Buscar sede o usuario" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
                <div className={styles.filterButtons}><button type="button" className={filter === "all" ? styles.filterActive : undefined} aria-pressed={filter === "all"} onClick={() => setQueryFilter("all")}>Todas <span>{sedes.length}</span></button><button type="button" className={filter === "active" ? styles.filterActive : undefined} aria-pressed={filter === "active"} onClick={() => setQueryFilter("active")}>Activas <span>{activos}</span></button></div>
                <select aria-label="Filtrar sedes" value={filter} onChange={(event) => setQueryFilter(event.target.value)}><option value="all">Todos los estados</option><option value="active">Accesos activos</option><option value="inactive">Accesos inactivos</option><option value="noaccess">Sin acceso</option><option value="siigo">Siigo activo</option><option value="credit">Solo por cobrar</option></select>
              </div>
              <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th scope="col">Sede y código</th><th scope="col">Usuario</th><th scope="col">Acceso</th><th scope="col">Siigo</th><th scope="col">Editar</th></tr></thead><tbody>
                {pageSedes.map((sede) => <tr key={sede.id} className={editor === sede.id ? styles.selectedRow : undefined}>
                  <td><strong>{sede.nombre}</strong><p className={styles.muted}>Código: {sede.codigo || "Sin código"}</p>{sede.soloInventarioPorCobrar && <span className={styles.creditLabel}>Solo por cobrar</span>}{!sede.activa && <span className={styles.siteInactive}>Sede inactiva</span>}</td>
                  <td>{sede.acceso?.usuario || <span className={styles.muted}>Sin usuario</span>}</td>
                  <td><span className={`${styles.state} ${sede.acceso?.activo ? styles.active : styles.inactive}`}><i aria-hidden="true" />{sede.acceso ? sede.acceso.activo ? "Activo" : "Inactivo" : "Sin acceso"}</span></td>
                  <td>{sede.siigoEnabled ? <span className={`${styles.state} ${styles.active}`}><i aria-hidden="true" />Activo</span> : <span className={styles.muted}>—</span>}</td>
                  <td><button type="button" className={`${styles.editButton} ${editor === sede.id ? styles.editSelected : ""}`} aria-label={`Editar ${sede.nombre}`} aria-expanded={editor === sede.id} aria-controls="sede-editor" onClick={(event) => abrirEditor(sede.id, event.currentTarget)} disabled={busy}><EditIcon />Editar</button></td>
                </tr>)}
                {!pageSedes.length && <tr><td colSpan={5}><div className={styles.empty}><DashboardIcon name="search" /><p>{sedes.length ? "No hay sedes que coincidan con los filtros." : "No hay sedes registradas."}</p>{(search || filter !== "all") && <button type="button" className={styles.button} onClick={() => { setSearch(""); setQueryFilter("all"); }}>Limpiar filtros</button>}</div></td></tr>}
              </tbody></table></div>
              <footer className={styles.footer}><p>{filteredSedes.length ? `Mostrando ${start + 1}–${Math.min(start + pageSize, filteredSedes.length)} de ${filteredSedes.length.toLocaleString("es-CO")} sedes` : "0 resultados"}</p><label className={styles.rowsPerPage}>Filas por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><nav className={styles.pagination} aria-label="Páginas de sedes"><button type="button" className={styles.previous} aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><DashboardIcon name="chevron" /></button>{pageNumbers.map((number, index) => <span key={number} className={styles.pageSlot}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<button type="button" className={number === currentPage ? styles.currentPage : undefined} aria-current={number === currentPage ? "page" : undefined} aria-label={`Página ${number}`} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" aria-label="Página siguiente" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><DashboardIcon name="chevron" /></button></nav></footer>
            </section>
            <section className={`${styles.panel} ${styles.catalogCard}`}><span className={styles.catalogIcon}><DashboardIcon name="database" /></span><div><h2>Catálogos Siigo</h2><p>Resoluciones, vendedores, pagos, productos y centros de costo.</p></div><button type="button" className={styles.button} onClick={(event) => abrirCatalogos(event.currentTarget)} disabled={busy}>Consultar <DashboardIcon name="arrow" /></button></section>
          </div>
          {editor !== null && <>
            <button type="button" className={styles.editorBackdrop} aria-label="Cerrar editor de sede" onClick={cerrarEditor} tabIndex={-1} disabled={busy} />
            <aside ref={editorRef} id="sede-editor" className={`${styles.panel} ${styles.editor}`} role="dialog" aria-labelledby="sede-editor-title" onKeyDown={(event) => {
              if (catalogDialog.current?.open) return;
              if (event.key === "Escape") { event.preventDefault(); cerrarEditor(); }
              if (event.key === "Tab" && window.matchMedia("(max-width: 900px)").matches) {
                const controls = Array.from(editorRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0);
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === editorHeadingRef.current)) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
              }
            }}>
              <div className={styles.editorHeading}><div><h2 id="sede-editor-title" ref={editorHeadingRef} tabIndex={-1}>{editor === "new" ? "Nueva sede" : "Editar sede"}</h2>{selectedSede && <span className={styles.siteTag}>{selectedSede.nombre}</span>}</div><button type="button" className={styles.iconButton} aria-label="Cerrar editor" onClick={cerrarEditor} disabled={busy}><DashboardIcon name="close" /></button></div>
              <form className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); if (!busy) { if (editor === "new") void crearSede(); else if (selectedSede) void guardarSede(selectedSede.id); } }}>
                <div className={styles.formBody}>
                  {editor === "new" ? <>
                    <div className={styles.fields}>
                      <label>Nombre de sede<input required value={nuevaSedeNombre} onChange={(event) => { const next = event.target.value; if (!nuevoUsuario || nuevoUsuario === slugUsuarioSede(nuevaSedeNombre)) setNuevoUsuario(slugUsuarioSede(next)); setNuevaSedeNombre(next); }} placeholder="Nombre de sede" autoComplete="off" disabled={busy} /></label>
                      <label>Código<input value={nuevaSedeCodigo} onChange={(event) => setNuevaSedeCodigo(event.target.value.toUpperCase())} placeholder="Opcional" autoComplete="off" disabled={busy} /></label>
                      <label>Usuario de acceso<input required value={nuevoUsuario} onChange={(event) => setNuevoUsuario(slugUsuarioSede(event.target.value))} autoComplete="off" disabled={busy} /></label>
                      <label>Clave inicial<div className={styles.password}><input required type={showPassword ? "text" : "password"} value={nuevaClave} onChange={(event) => setNuevaClave(event.target.value)} autoComplete="new-password" disabled={busy} /><button type="button" aria-label={showPassword ? "Ocultar clave nueva" : "Mostrar clave nueva"} onClick={() => setShowPassword(!showPassword)} disabled={busy}><EyeIcon /></button></div></label>
                    </div>
                    <section className={styles.formSection}><h3>Inventario</h3><label className={styles.checkbox}><input type="checkbox" checked={nuevaSoloInventarioPorCobrar} onChange={(event) => setNuevaSoloInventarioPorCobrar(event.target.checked)} disabled={busy} /><span>Solo inventario por cobrar<small>Al pagar, el equipo se oculta del stand.</small></span></label></section>
                  </> : selectedSede && edicion ? <>
                    {!selectedSede.acceso && <p className={styles.formNotice}>Esta sede no tiene acceso. Define un usuario y su clave inicial.</p>}
                    <div className={styles.fields}>
                      <label>Nombre de sede<input required value={edicion.nombre} onChange={(event) => actualizarEdicion(selectedSede.id, "nombre", event.target.value)} disabled={busy} /></label>
                      <label>Código<input value={edicion.codigo} onChange={(event) => actualizarEdicion(selectedSede.id, "codigo", event.target.value.toUpperCase())} placeholder="Opcional" disabled={busy} /></label>
                      <label>Usuario de acceso<input required={!selectedSede.acceso} value={edicion.usuario} onChange={(event) => actualizarEdicion(selectedSede.id, "usuario", slugUsuarioSede(event.target.value))} autoComplete="off" disabled={busy} /></label>
                      <label>Nueva clave<div className={styles.password}><input required={!selectedSede.acceso} type={showPassword ? "text" : "password"} value={edicion.clave} onChange={(event) => actualizarEdicion(selectedSede.id, "clave", event.target.value)} placeholder={selectedSede.acceso ? "Sin cambios" : "Clave inicial"} autoComplete="new-password" disabled={busy} /><button type="button" aria-label={showPassword ? "Ocultar clave nueva" : "Mostrar clave nueva"} onClick={() => setShowPassword(!showPassword)} disabled={busy}><EyeIcon /></button></div></label>
                    </div>
                    {selectedSede.acceso && <p className={styles.passwordHint}>Deja la nueva clave vacía para conservar la actual.</p>}
                    <section className={styles.formSection}><h3>Inventario</h3><label className={styles.checkbox}><input type="checkbox" checked={edicion.soloInventarioPorCobrar} onChange={(event) => actualizarEdicion(selectedSede.id, "soloInventarioPorCobrar", event.target.checked)} disabled={busy} /><span>Solo inventario por cobrar<small>Al aprobar el pago, el equipo se oculta del stand.</small></span></label></section>
                    {edicion.soloInventarioPorCobrar && <section className={styles.formSection}><h3>Datos fiscales del stand</h3><p className={styles.muted}>Se usan como cliente de la factura electrónica. Obligatorios al facturar.</p><div className={styles.fields}>
                      <label>Nombre o razón social<input value={edicion.facturacionNombre} onChange={(event) => actualizarEdicion(selectedSede.id, "facturacionNombre", event.target.value)} disabled={busy} /></label>
                      <label>Tipo de documento<select value={edicion.facturacionTipoDocumento} onChange={(event) => actualizarEdicion(selectedSede.id, "facturacionTipoDocumento", event.target.value)} disabled={busy}><option>NIT</option><option>CC</option><option>CE</option><option>PPT</option></select></label>
                      <label>Número de documento<input value={edicion.facturacionDocumento} onChange={(event) => actualizarEdicion(selectedSede.id, "facturacionDocumento", event.target.value)} placeholder="NIT con DV: 900123456-7" disabled={busy} /></label>
                      <label>Correo de facturación<input type="email" value={edicion.facturacionCorreo} onChange={(event) => actualizarEdicion(selectedSede.id, "facturacionCorreo", event.target.value)} disabled={busy} /></label>
                      <label>Teléfono<input value={edicion.facturacionTelefono} onChange={(event) => actualizarEdicion(selectedSede.id, "facturacionTelefono", event.target.value)} disabled={busy} /></label>
                      <label>Dirección fiscal<input value={edicion.facturacionDireccion} onChange={(event) => actualizarEdicion(selectedSede.id, "facturacionDireccion", event.target.value)} disabled={busy} /></label>
                    </div></section>}
                    <section className={styles.formSection}><div className={styles.siigoHeading}><h3>Integración Siigo</h3><span className={`${styles.state} ${edicion.siigoEnabled ? styles.active : styles.inactive}`}><i aria-hidden="true" />{edicion.siigoEnabled ? "Activa" : "Inactiva"}</span><button type="button" className={styles.button} aria-expanded={siigoOpen} aria-controls="siigo-settings" onClick={() => setSiigoOpen(!siigoOpen)} disabled={busy}><DashboardIcon name="settings" />{siigoOpen ? "Ocultar configuración" : "Configurar Siigo"}</button></div>
                      {siigoOpen && <div id="siigo-settings" className={styles.siigoFields}>
                        <p className={styles.muted}>{usaResolucionOnline(selectedSede) && !esSedeOnline(selectedSede) ? "Este stand factura usando la configuración Siigo de ONLINE." : "Resolución y parámetros de facturación de esta sede."}</p>
                        <label className={styles.checkbox}><input type="checkbox" checked={edicion.siigoEnabled} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoEnabled", event.target.checked)} disabled={busy} /><span>Activar Siigo</span></label>
                        <div className={styles.fields}>
                          <label>Documento / resolución<input inputMode="numeric" value={edicion.siigoInvoiceDocumentId} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoInvoiceDocumentId", soloDigitos(event.target.value))} placeholder="ID document-types FV" disabled={busy} /></label>
                          <label>Vendedor Siigo<input inputMode="numeric" value={edicion.siigoSellerId} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoSellerId", soloDigitos(event.target.value))} placeholder="ID users" disabled={busy} /></label>
                          <label>Forma de pago<input inputMode="numeric" value={edicion.siigoPaymentTypeId} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoPaymentTypeId", soloDigitos(event.target.value))} placeholder="ID payment-types" disabled={busy} /></label>
                          <label>Código producto telefonía<input value={edicion.siigoItemCode} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoItemCode", event.target.value)} placeholder="Opcional" disabled={busy} /><small>Telefonía usa el código configurado. Electrodomestico siempre usa 001 con IVA 19%.</small></label>
                          <label>Centro de costo<input inputMode="numeric" value={edicion.siigoCostCenterId} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoCostCenterId", soloDigitos(event.target.value))} placeholder="Opcional" disabled={busy} /></label>
                          <label>Días de vencimiento<input inputMode="numeric" value={edicion.siigoPaymentDueDays} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoPaymentDueDays", soloDigitos(event.target.value))} placeholder="0" disabled={busy} /></label>
                          <label>País<input value={edicion.siigoDefaultCountryCode} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoDefaultCountryCode", event.target.value.toUpperCase())} placeholder="CO" disabled={busy} /></label>
                          <label>Departamento<input inputMode="numeric" value={edicion.siigoDefaultStateCode} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoDefaultStateCode", soloDigitos(event.target.value))} disabled={busy} /></label>
                          <label>Ciudad<input inputMode="numeric" value={edicion.siigoDefaultCityCode} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoDefaultCityCode", soloDigitos(event.target.value))} disabled={busy} /></label>
                          <label>Código postal<input inputMode="numeric" value={edicion.siigoDefaultPostalCode} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoDefaultPostalCode", soloDigitos(event.target.value))} placeholder="Opcional" disabled={busy} /></label>
                        </div>
                        <label className={styles.checkbox}><input type="checkbox" checked={edicion.siigoStampSend} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoStampSend", event.target.checked)} disabled={busy} /><span>Enviar a DIAN al crear</span></label>
                        <label className={styles.checkbox}><input type="checkbox" checked={edicion.siigoMailSend} onChange={(event) => actualizarEdicion(selectedSede.id, "siigoMailSend", event.target.checked)} disabled={busy} /><span>Enviar correo desde Siigo</span></label>
                        <button type="button" className={styles.button} onClick={(event) => abrirCatalogos(event.currentTarget)} disabled={busy}><DashboardIcon name="database" />Consultar catálogos</button>
                      </div>}
                    </section>
                  </> : <p className={styles.formError}>La sede seleccionada ya no está disponible.</p>}
                  {formError && <p className={styles.formError} role="alert">{formError}</p>}
                </div>
                <footer className={styles.editorFooter}><button type="button" className={styles.button} onClick={cerrarEditor} disabled={busy}>Cancelar</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || (editor !== "new" && !selectedSede)}>{guardandoNueva ? "Creando…" : procesandoId !== null ? "Guardando…" : editor === "new" ? "Crear sede" : selectedSede?.acceso ? "Guardar cambios" : "Crear acceso"}</button></footer>
              </form>
            </aside>
          </>}
        </div>
      </>}
    </main>
    <dialog ref={catalogDialog} className={styles.catalogDialog} aria-labelledby="catalog-title" onCancel={(event) => { if (guardandoSiigoMasivo) event.preventDefault(); }} onClose={() => catalogTriggerRef.current?.focus()}>
      <header className={styles.dialogHeading}><div><h2 id="catalog-title">Catálogos Siigo</h2><p>Resoluciones, notas crédito, vendedores, formas de pago, productos y centros de costo.</p></div><button type="button" className={styles.iconButton} aria-label="Cerrar catálogos" onClick={cerrarCatalogos} disabled={guardandoSiigoMasivo}><DashboardIcon name="close" /></button></header>
      <div className={styles.catalogActions}><button type="button" className={styles.button} onClick={() => void cargarCatalogosSiigo()} disabled={cargandoCatalogosSiigo || busy}><DashboardIcon name="refresh" />{cargandoCatalogosSiigo ? "Consultando…" : "Actualizar catálogos"}</button>{catalogosSiigo && <><button type="button" className={styles.button} onClick={aplicarSiigoSugerido} disabled={busy}>Autocompletar</button><button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void guardarSiigoSugerido()} disabled={busy}>{guardandoSiigoMasivo ? "Guardando…" : "Guardar Siigo sugerido"}</button></>}</div>
      {catalogosSiigoError && <div role="alert" className={styles.formError}>{catalogosSiigoError}</div>}
      {mensaje && <p className={styles.formNotice} role="status">{mensaje}</p>}
      {cargandoCatalogosSiigo ? <div className={styles.loading} role="status">Consultando catálogos de Siigo…</div> : catalogosSiigo && <>
        <div className={styles.catalogTabs} role="tablist" aria-label="Tipos de catálogo">{catalogGroups.map((group) => <button type="button" key={group.id} id={`catalog-tab-${group.id}`} role="tab" tabIndex={catalogTab === group.id ? 0 : -1} onKeyDown={(event) => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const current = catalogGroups.findIndex((item) => item.id === group.id);
          const index = event.key === "Home" ? 0 : event.key === "End" ? catalogGroups.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + catalogGroups.length) % catalogGroups.length;
          setCatalogTab(catalogGroups[index].id); setCatalogSearch("");
          document.getElementById(`catalog-tab-${catalogGroups[index].id}`)?.focus();
        }} aria-selected={catalogTab === group.id} aria-controls={`catalog-panel-${group.id}`} onClick={() => { setCatalogTab(group.id); setCatalogSearch(""); }} className={catalogTab === group.id ? styles.filterActive : undefined}>{group.label}<span>{group.items.length}</span></button>)}</div>
        <label className={`${styles.search} ${styles.catalogSearch}`}><DashboardIcon name="search" /><input type="search" aria-label="Buscar en catálogo" placeholder="Buscar por nombre, código o ID" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} /></label>
        <section className={styles.catalogContent} id={`catalog-panel-${currentCatalog.id}`} role="tabpanel" aria-labelledby={`catalog-tab-${currentCatalog.id}`}>
          <p className={styles.muted}>{filteredCatalog.length.toLocaleString("es-CO")} resultados</p>
          <ul className={styles.catalogRows}>{filteredCatalog.map((item, index) => <li key={`${currentCatalog.id}-${index}`}><strong>{currentCatalog.title(item) || "Sin nombre"}</strong>{"detail" in currentCatalog && currentCatalog.detail?.(item) && <p>{currentCatalog.detail(item)}</p>}</li>)}</ul>
          {!filteredCatalog.length && <p className={styles.empty}>No hay resultados en este catálogo.</p>}
        </section>
      </>}
    </dialog>
  </div>;
}
