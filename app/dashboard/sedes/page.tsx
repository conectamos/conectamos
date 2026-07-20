"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

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
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardandoNueva, setGuardandoNueva] = useState(false);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [cargandoCatalogosSiigo, setCargandoCatalogosSiigo] = useState(false);
  const [guardandoSiigoMasivo, setGuardandoSiigoMasivo] = useState(false);
  const [catalogosSiigo, setCatalogosSiigo] = useState<CatalogosSiigo | null>(
    null,
  );
  const [catalogosSiigoError, setCatalogosSiigoError] = useState("");

  const [nuevaSedeNombre, setNuevaSedeNombre] = useState("");
  const [nuevaSedeCodigo, setNuevaSedeCodigo] = useState("");
  const [nuevoUsuario, setNuevoUsuario] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevaSoloInventarioPorCobrar, setNuevaSoloInventarioPorCobrar] =
    useState(false);

  const [ediciones, setEdiciones] = useState<Record<number, SedeEdicion>>({});

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    user?.rolNombre?.toUpperCase() || "",
  );
  const documentosSiigo = extraerItemsCatalogo(catalogosSiigo?.documentTypes);
  const notasCreditoSiigo = extraerItemsCatalogo(
    catalogosSiigo?.creditNoteDocumentTypes,
  );
  const usuariosSiigo = extraerItemsCatalogo(catalogosSiigo?.users);
  const pagosSiigo = extraerItemsCatalogo(catalogosSiigo?.paymentTypes);
  const productosSiigo = extraerItemsCatalogo(catalogosSiigo?.products);
  const centrosCostoSiigo = extraerItemsCatalogo(catalogosSiigo?.costCenters);

  const cargarTodo = async () => {
    try {
      const [resSession, resSedes] = await Promise.all([
        fetch("/api/session", { cache: "no-store" }),
        fetch("/api/sedes/admin", { cache: "no-store" }),
      ]);

      const sessionData = await resSession.json();
      const sedesData = await resSedes.json();

      if (resSession.ok) {
        setUser(sessionData);
      }

      if (resSedes.ok) {
        const items = Array.isArray(sedesData?.sedes) ? sedesData.sedes : [];
        setSedes(items);
        setEdiciones(
          items.reduce(
            (acc: Record<number, SedeEdicion>, sede: SedeAdminItem) => {
              acc[sede.id] = crearEdicionDesdeSede(sede);
              return acc;
            },
            {},
          ),
        );
      } else {
        setMensaje(sedesData.error || "No se pudo cargar la gestion de sedes");
      }
    } catch {
      setMensaje("Error cargando la gestion de sedes");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarTodo();
  }, []);

  useEffect(() => {
    if (!nuevoUsuario || nuevoUsuario === slugUsuarioSede(nuevaSedeNombre)) {
      setNuevoUsuario(slugUsuarioSede(nuevaSedeNombre));
    }
  }, [nuevaSedeNombre, nuevoUsuario]);

  const actualizarEdicion = <Campo extends keyof SedeEdicion>(
    sedeId: number,
    campo: Campo,
    valor: SedeEdicion[Campo],
  ) => {
    setEdiciones((actual) => ({
      ...actual,
      [sedeId]: {
        ...actual[sedeId],
        [campo]: valor,
      },
    }));
  };

  const crearSede = async () => {
    try {
      setGuardandoNueva(true);
      setMensaje("");

      const res = await fetch("/api/sedes/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre: nuevaSedeNombre,
          codigo: nuevaSedeCodigo,
          usuario: nuevoUsuario,
          clave: nuevaClave,
          soloInventarioPorCobrar: nuevaSoloInventarioPorCobrar,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo crear la sede");
        return;
      }

      setMensaje(data.mensaje || "Sede creada correctamente");
      setNuevaSedeNombre("");
      setNuevaSedeCodigo("");
      setNuevoUsuario("");
      setNuevaClave("");
      setNuevaSoloInventarioPorCobrar(false);
      await cargarTodo();
    } catch {
      setMensaje("Error creando la sede");
    } finally {
      setGuardandoNueva(false);
    }
  };

  const cargarCatalogosSiigo = async () => {
    try {
      setCargandoCatalogosSiigo(true);
      setCatalogosSiigoError("");

      const res = await fetch("/api/facturador/siigo/catalogos", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setCatalogosSiigoError(
          data.error || "No se pudieron consultar los catalogos de Siigo",
        );
        return;
      }

      setCatalogosSiigo((data.catalogos || null) as CatalogosSiigo | null);
    } catch {
      setCatalogosSiigoError("Error consultando catalogos de Siigo");
    } finally {
      setCargandoCatalogosSiigo(false);
    }
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

        if (!res.ok) {
          throw new Error(data.error || `No se pudo guardar ${sede.nombre}`);
        }
      }

      await cargarTodo();
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
      setMensaje(
        error instanceof Error
          ? error.message
          : "Error guardando la configuracion Siigo",
      );
    } finally {
      setGuardandoSiigoMasivo(false);
    }
  };

  const guardarSede = async (sedeId: number) => {
    try {
      setProcesandoId(sedeId);
      setMensaje("");

      const payload = ediciones[sedeId];

      const res = await fetch("/api/sedes/admin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadSedePatch(sedeId, payload)),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo guardar la sede");
        return;
      }

      setMensaje(data.mensaje || "Sede actualizada correctamente");
      await cargarTodo();
    } catch {
      setMensaje("Error actualizando la sede");
    } finally {
      setProcesandoId(null);
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
        <div className="mx-auto max-w-7xl rounded-[32px] bg-white px-8 py-12 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Sedes
          </p>
          <h1 className="mt-3 text-3xl font-black text-slate-950">
            Cargando gestion de sedes...
          </h1>
        </div>
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-[32px] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
            Acceso restringido
          </div>
          <h1 className="mt-4 text-3xl font-black text-slate-950">
            Solo el administrador puede gestionar sedes
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Esta pantalla permite crear sedes y administrar sus credenciales de
            acceso.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard"
              className="inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Volver al dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    {
      href: "/dashboard/aprobaciones",
      icon: "approvals",
      label: "Aprobaciones",
    },
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
  ];
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Admin")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard/sedes"
        coverageLabel="Todas las sedes"
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Gestión de sedes
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Accesos, configuración operativa e integración Siigo
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {user?.nombre || user?.usuario}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {user?.rolNombre}
                  </p>
                </div>
              </div>
              <LogoutButton
                variant="light"
                className="min-h-12 shrink-0 rounded-xl"
              />
            </div>
          </header>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <DashboardIcon name="store" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Sedes registradas
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {sedes.length}
                </p>
              </div>
            </article>

            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                <DashboardIcon name="user" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Accesos activos
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {sedes.filter((sede) => Boolean(sede.acceso)).length}
                </p>
              </div>
            </article>

            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <DashboardIcon name="document" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Siigo activo
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {sedes.filter((sede) => sede.siigoEnabled).length}
                </p>
              </div>
            </article>

            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <DashboardIcon name="inventory" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Solo por cobrar
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {sedes.filter((sede) => sede.soloInventarioPorCobrar).length}
                </p>
              </div>
            </article>
          </section>

          {mensaje && (
            <div
              role="status"
              className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
            >
              <DashboardIcon
                name="approvals"
                className="mt-0.5 h-5 w-5 shrink-0 text-[#e30613]"
              />
              {mensaje}
            </div>
          )}

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e30613]">
                  Integración Siigo
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  Catálogos para configurar sedes
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Consulta resoluciones, vendedores, formas de pago, productos y
                  centros de costo directamente desde Siigo.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void cargarCatalogosSiigo()}
                  disabled={cargandoCatalogosSiigo}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <DashboardIcon name="reports" className="h-4 w-4" />
                  {cargandoCatalogosSiigo
                    ? "Consultando..."
                    : "Consultar catálogos"}
                </button>
                {catalogosSiigo && (
                  <>
                    <button
                      type="button"
                      onClick={aplicarSiigoSugerido}
                      disabled={guardandoSiigoMasivo}
                      className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Autocompletar
                    </button>
                    <button
                      type="button"
                      onClick={() => void guardarSiigoSugerido()}
                      disabled={guardandoSiigoMasivo}
                      className="min-h-11 rounded-xl bg-[#e30613] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {guardandoSiigoMasivo
                        ? "Guardando..."
                        : "Guardar Siigo sugerido"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {catalogosSiigoError && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {catalogosSiigoError}
              </div>
            )}

            {catalogosSiigo && (
              <div className="mt-5 grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Resoluciones
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    {documentosSiigo.slice(0, 12).map((item, index) => (
                      <div key={`siigo-doc-${index}`}>
                        <p className="font-semibold text-slate-800">
                          {tituloDocumentoSiigo(item)}
                        </p>
                        {detalleDocumentoSiigo(item) && (
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            {detalleDocumentoSiigo(item)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Notas crédito
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    {notasCreditoSiigo.slice(0, 12).map((item, index) => (
                      <div key={`siigo-credit-note-${index}`}>
                        <p className="font-semibold text-slate-800">
                          {tituloDocumentoSiigo(item)}
                        </p>
                        {detalleDocumentoSiigo(item) && (
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            {detalleDocumentoSiigo(item)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Vendedores
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    {usuariosSiigo.slice(0, 12).map((item, index) => (
                      <p
                        key={`siigo-user-${index}`}
                        className="font-semibold text-slate-800"
                      >
                        {textoCatalogo(item, ["id"])} -{" "}
                        {nombreUsuarioSiigo(item)}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Formas de pago
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    {pagosSiigo.slice(0, 12).map((item, index) => (
                      <p
                        key={`siigo-payment-${index}`}
                        className="font-semibold text-slate-800"
                      >
                        {textoCatalogo(item, ["id"])} -{" "}
                        {textoCatalogo(item, ["name"])}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Productos
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    {productosSiigo.slice(0, 12).map((item, index) => (
                      <p
                        key={`siigo-product-${index}`}
                        className="font-semibold text-slate-800"
                      >
                        {textoCatalogo(item, ["code"])} -{" "}
                        {textoCatalogo(item, ["name", "description"])}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Centros de costo
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    {centrosCostoSiigo.slice(0, 12).map((item, index) => (
                      <p
                        key={`siigo-cost-center-${index}`}
                        className="font-semibold text-slate-800"
                      >
                        {tituloCentroCostoSiigo(item)}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e30613]">
                  Nueva sede
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  Crear sede con acceso
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  El usuario de acceso se usa directamente en el login del
                  sistema.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Nombre de sede
                <input
                  value={nuevaSedeNombre}
                  onChange={(event) => setNuevaSedeNombre(event.target.value)}
                  placeholder="Ej: Stand PuntoNet"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Código
                <input
                  value={nuevaSedeCodigo}
                  onChange={(event) => setNuevaSedeCodigo(event.target.value)}
                  placeholder="Opcional"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Usuario de acceso
                <input
                  value={nuevoUsuario}
                  onChange={(event) =>
                    setNuevoUsuario(slugUsuarioSede(event.target.value))
                  }
                  placeholder="sede8"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Clave inicial
                <input
                  type="password"
                  value={nuevaClave}
                  onChange={(event) => setNuevaClave(event.target.value)}
                  placeholder="Asignar clave"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="flex min-h-[76px] items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 md:col-span-1 xl:col-span-3">
                <input
                  type="checkbox"
                  checked={nuevaSoloInventarioPorCobrar}
                  onChange={(event) =>
                    setNuevaSoloInventarioPorCobrar(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-amber-300 text-amber-700"
                />
                <span>
                  Solo inventario por cobrar
                  <span className="mt-1 block text-xs font-medium leading-5 text-amber-700">
                    Al pagar, el equipo se oculta del stand.
                  </span>
                </span>
              </label>

              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => void crearSede()}
                  disabled={guardandoNueva}
                  className="min-h-12 rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {guardandoNueva ? "Creando..." : "Crear sede"}
                </button>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e30613]">
                Accesos existentes
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Sedes registradas
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Puedes cambiar nombre, código, usuario de acceso y asignar una
                nueva clave.
              </p>
            </div>

            <div className="mt-5 grid gap-4 2xl:grid-cols-2">
              {sedes.map((sede) => {
                const edicion =
                  ediciones[sede.id] || crearEdicionDesdeSede(sede);
                const facturaComoOnline =
                  usaResolucionOnline(sede) && !esSedeOnline(sede);

                return (
                  <section
                    key={sede.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Sede #{sede.id}
                        </div>
                        <h3 className="mt-2 text-xl font-black text-slate-950">
                          {sede.nombre}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {sede.acceso
                            ? `Acceso actual: ${sede.acceso.usuario}`
                            : "Esta sede aún no tiene usuario de acceso."}
                        </p>
                      </div>

                      <div className="min-w-[170px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                        <p className="font-semibold text-slate-900">
                          {sede.acceso ? "Acceso activo" : "Sin acceso"}
                        </p>
                        <p className="mt-1 text-slate-500">
                          {sede.codigo
                            ? `Código: ${sede.codigo}`
                            : "Sin código"}
                        </p>
                        {sede.soloInventarioPorCobrar && (
                          <p className="mt-1 font-semibold text-amber-700">
                            Solo inventario por cobrar
                          </p>
                        )}
                        {sede.siigoEnabled && (
                          <p className="mt-1 font-semibold text-emerald-700">
                            Siigo activo
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Nombre de sede
                        <input
                          value={edicion.nombre}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "nombre",
                              event.target.value,
                            )
                          }
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Código
                        <input
                          value={edicion.codigo}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "codigo",
                              event.target.value.toUpperCase(),
                            )
                          }
                          placeholder="Opcional"
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Usuario de acceso
                        <input
                          value={edicion.usuario}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "usuario",
                              slugUsuarioSede(event.target.value),
                            )
                          }
                          placeholder="usuario de login"
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Nueva clave
                        <input
                          type="password"
                          value={edicion.clave}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "clave",
                              event.target.value,
                            )
                          }
                          placeholder={
                            sede.acceso
                              ? "Dejar vacio para conservarla"
                              : "Clave inicial"
                          }
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>
                    </div>

                    <label className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                      <input
                        type="checkbox"
                        checked={Boolean(edicion.soloInventarioPorCobrar)}
                        onChange={(event) =>
                          actualizarEdicion(
                            sede.id,
                            "soloInventarioPorCobrar",
                            event.target.checked,
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-700"
                      />
                      <span>
                        Solo inventario por cobrar
                        <span className="mt-1 block text-xs font-medium leading-5 text-amber-700">
                          Para stands que no operan ventas ni caja propia de
                          inventario. Al aprobar el pago, el IMEI se borra de la
                          vista del stand.
                        </span>
                      </span>
                    </label>

                    <details className="group mt-5 border-t border-slate-200 pt-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-1 py-2 text-sm font-bold text-slate-800 marker:content-none">
                        <span className="flex items-center gap-2">
                          <DashboardIcon
                            name="settings"
                            className="h-5 w-5 text-[#e30613]"
                          />
                          Configuración Siigo
                        </span>
                        <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 group-open:hidden">
                          Mostrar
                        </span>
                        <span className="hidden rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 group-open:inline-flex">
                          Ocultar
                        </span>
                      </summary>

                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">
                              Siigo por sede
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {facturaComoOnline
                                ? "Este stand factura usando la configuración Siigo de ONLINE."
                                : "Estos parámetros determinan la resolución y el comportamiento de facturación de esta sede."}
                            </p>
                          </div>

                          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={Boolean(edicion.siigoEnabled)}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoEnabled",
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                            Activar Siigo
                          </label>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Documento / resolución
                            <input
                              inputMode="numeric"
                              value={edicion.siigoInvoiceDocumentId}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoInvoiceDocumentId",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="ID document-types FV"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Vendedor Siigo
                            <input
                              inputMode="numeric"
                              value={edicion.siigoSellerId}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoSellerId",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="ID users"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Forma de pago
                            <input
                              inputMode="numeric"
                              value={edicion.siigoPaymentTypeId}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoPaymentTypeId",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="ID payment-types"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Código producto telefonía
                            <input
                              value={edicion.siigoItemCode}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoItemCode",
                                  event.target.value,
                                )
                              }
                              placeholder="Opcional"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                            <span className="text-xs font-medium leading-5 text-slate-500">
                              Electrodomestico tambien usa 002, pero con IVA
                              19%.
                            </span>
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Centro de costo
                            <input
                              inputMode="numeric"
                              value={edicion.siigoCostCenterId}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoCostCenterId",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="Opcional"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Días vencimiento
                            <input
                              inputMode="numeric"
                              value={edicion.siigoPaymentDueDays}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoPaymentDueDays",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="0"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Pais
                            <input
                              value={edicion.siigoDefaultCountryCode}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoDefaultCountryCode",
                                  event.target.value.toUpperCase(),
                                )
                              }
                              placeholder="CO"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium uppercase text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Departamento
                            <input
                              value={edicion.siigoDefaultStateCode}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoDefaultStateCode",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="Ej: 73"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Ciudad
                            <input
                              value={edicion.siigoDefaultCityCode}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoDefaultCityCode",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="Ej: 73001"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                            Código postal
                            <input
                              value={edicion.siigoDefaultPostalCode}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoDefaultPostalCode",
                                  soloDigitos(event.target.value),
                                )
                              }
                              placeholder="Opcional"
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={Boolean(edicion.siigoStampSend)}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoStampSend",
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                            Enviar a DIAN al crear
                          </label>

                          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={Boolean(edicion.siigoMailSend)}
                              onChange={(event) =>
                                actualizarEdicion(
                                  sede.id,
                                  "siigoMailSend",
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                            Enviar correo desde Siigo
                          </label>
                        </div>
                      </div>
                    </details>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void guardarSede(sede.id)}
                        disabled={procesandoId === sede.id}
                        className="min-h-11 rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {procesandoId === sede.id
                          ? "Guardando..."
                          : sede.acceso
                            ? "Guardar cambios"
                            : "Crear acceso"}
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
