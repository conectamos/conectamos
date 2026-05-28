"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  users?: unknown;
  paymentTypes?: unknown;
  products?: unknown;
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
    String(sede.codigo || "").trim().toUpperCase() === "ONLINE"
  );
}

function usaResolucionOnline(sede: SedeAdminItem) {
  const nombre = sede.nombre.trim().toUpperCase();
  const codigo = String(sede.codigo || "").trim().toUpperCase();

  return esSedeOnline(sede) || nombre.startsWith("STAND ") || codigo.startsWith("STAND-");
}

function extraerItemsCatalogo(valor: unknown) {
  if (Array.isArray(valor)) {
    return valor.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
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
          Boolean(item) && typeof item === "object"
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
  const direct = textoCatalogo(item, ["name", "full_name", "username", "email"]);

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
  keys: string[]
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

function buscarIdPorCodigo(
  items: Record<string, unknown>[],
  codigo: string
) {
  const item = items.find(
    (catalogo) => textoCatalogo(catalogo, ["code"]) === codigo
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
      ].join(" ")
    ).includes("ANDRES03BK@GMAIL.COM")
  );

  return item ? textoCatalogo(item, ["id"]) : "103";
}

function buscarPagoEfectivo(items: Record<string, unknown>[]) {
  const item = items.find((catalogo) =>
    normalizarTexto(textoCatalogo(catalogo, ["name"])).includes("EFECTIVO")
  );

  return item ? textoCatalogo(item, ["id"]) : "910";
}

function buscarProductoExento(items: Record<string, unknown>[]) {
  const porCodigo = items.find(
    (catalogo) => textoCatalogo(catalogo, ["code"]) === "002"
  );
  const porNombre = items.find((catalogo) =>
    normalizarTexto(textoCatalogo(catalogo, ["name", "description"])).includes(
      "EXENT"
    )
  );

  return textoCatalogo(porCodigo || porNombre || {}, ["code"]) || "002";
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
    null
  );
  const [catalogosSiigoError, setCatalogosSiigoError] = useState("");

  const [nuevaSedeNombre, setNuevaSedeNombre] = useState("");
  const [nuevaSedeCodigo, setNuevaSedeCodigo] = useState("");
  const [nuevoUsuario, setNuevoUsuario] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevaSoloInventarioPorCobrar, setNuevaSoloInventarioPorCobrar] =
    useState(false);

  const [ediciones, setEdiciones] = useState<Record<number, SedeEdicion>>({});

  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const documentosSiigo = extraerItemsCatalogo(catalogosSiigo?.documentTypes);
  const usuariosSiigo = extraerItemsCatalogo(catalogosSiigo?.users);
  const pagosSiigo = extraerItemsCatalogo(catalogosSiigo?.paymentTypes);
  const productosSiigo = extraerItemsCatalogo(catalogosSiigo?.products);

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
            {}
          )
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
    valor: SedeEdicion[Campo]
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
        setCatalogosSiigoError(data.error || "No se pudieron consultar los catalogos de Siigo");
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
        siigoDefaultCountryCode: "CO",
        siigoDefaultStateCode: "73",
        siigoDefaultCityCode: "73001",
        siigoStampSend: false,
        siigoMailSend: false,
        siigoPaymentDueDays: "0",
      };
      configuradas.push(sede);
    }

    return { configuradas, faltantes, siguientes };
  };

  const aplicarSiigoSugerido = () => {
    const { configuradas, faltantes, siguientes } = crearEdicionesSiigoSugeridas();

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
        .join(" ")
    );
  };

  const guardarSiigoSugerido = async () => {
    try {
      setGuardandoSiigoMasivo(true);
      setMensaje("");

      const { configuradas, faltantes, siguientes } = crearEdicionesSiigoSugeridas();

      if (configuradas.length === 0) {
        setMensaje("No encontre sedes para configurar con los catalogos actuales.");
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
          .join(" ")
      );
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "Error guardando la configuracion Siigo"
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
            Esta pantalla permite crear sedes y administrar sus credenciales de acceso.
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

  return (
    <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0f172a_0%,#111827_48%,#7f1d1d_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Administracion
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Gestion de sedes
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Crea sedes nuevas, asigna su usuario de acceso y cambia la clave de las sedes existentes.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver al dashboard
              </Link>
            </div>
          </div>
        </section>

        {mensaje && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        <section className="mt-6 rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Siigo
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Catalogos para configurar sedes
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Consulta resoluciones, vendedores, formas de pago y productos directamente desde Siigo.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void cargarCatalogosSiigo()}
                disabled={cargandoCatalogosSiigo}
                className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {cargandoCatalogosSiigo ? "Consultando..." : "Consultar catalogos"}
              </button>
              {catalogosSiigo && (
                <>
                  <button
                    type="button"
                    onClick={aplicarSiigoSugerido}
                    disabled={guardandoSiigoMasivo}
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Autocompletar
                  </button>
                  <button
                    type="button"
                    onClick={() => void guardarSiigoSugerido()}
                    disabled={guardandoSiigoMasivo}
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {guardandoSiigoMasivo ? "Guardando..." : "Guardar Siigo sugerido"}
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
            <div className="mt-5 grid gap-4 lg:grid-cols-4">
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
                  Vendedores
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  {usuariosSiigo.slice(0, 12).map((item, index) => (
                    <p key={`siigo-user-${index}`} className="font-semibold text-slate-800">
                      {textoCatalogo(item, ["id"])} - {nombreUsuarioSiigo(item)}
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
                    <p key={`siigo-payment-${index}`} className="font-semibold text-slate-800">
                      {textoCatalogo(item, ["id"])} - {textoCatalogo(item, ["name"])}
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
                    <p key={`siigo-product-${index}`} className="font-semibold text-slate-800">
                      {textoCatalogo(item, ["code"])} - {textoCatalogo(item, ["name", "description"])}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Nueva sede
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Crear sede con acceso
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                El usuario de acceso se usa directamente en el login del sistema.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.6fr_0.9fr_0.9fr_1fr_180px]">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Nombre de sede
              <input
                value={nuevaSedeNombre}
                onChange={(event) => setNuevaSedeNombre(event.target.value)}
                placeholder="Ej: Stand PuntoNet"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Codigo
              <input
                value={nuevaSedeCodigo}
                onChange={(event) => setNuevaSedeCodigo(event.target.value)}
                placeholder="Opcional"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Usuario de acceso
              <input
                value={nuevoUsuario}
                onChange={(event) => setNuevoUsuario(slugUsuarioSede(event.target.value))}
                placeholder="sede8"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Clave inicial
              <input
                type="password"
                value={nuevaClave}
                onChange={(event) => setNuevaClave(event.target.value)}
                placeholder="Asignar clave"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
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
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {guardandoNueva ? "Creando..." : "Crear sede"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Accesos existentes
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Sedes registradas
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Puedes cambiar nombre, codigo, usuario de acceso y asignar una nueva clave.
            </p>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {sedes.map((sede) => {
              const edicion = ediciones[sede.id] || crearEdicionDesdeSede(sede);
              const facturaComoOnline = usaResolucionOnline(sede) && !esSedeOnline(sede);

              return (
                <section
                  key={sede.id}
                  className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Sede #{sede.id}
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-slate-950">
                        {sede.nombre}
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {sede.acceso
                          ? `Acceso actual: ${sede.acceso.usuario}`
                          : "Esta sede aun no tiene usuario de acceso."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                      <p className="font-semibold text-slate-900">
                        {sede.acceso ? "Acceso activo" : "Sin acceso"}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {sede.codigo ? `Codigo: ${sede.codigo}` : "Sin codigo"}
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
                          actualizarEdicion(sede.id, "nombre", event.target.value)
                        }
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                      Codigo
                      <input
                        value={edicion.codigo}
                        onChange={(event) =>
                          actualizarEdicion(sede.id, "codigo", event.target.value.toUpperCase())
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
                            slugUsuarioSede(event.target.value)
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
                          actualizarEdicion(sede.id, "clave", event.target.value)
                        }
                        placeholder={
                          sede.acceso ? "Dejar vacio para conservarla" : "Clave inicial"
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
                          event.target.checked
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-700"
                    />
                    <span>
                      Solo inventario por cobrar
                      <span className="mt-1 block text-xs font-medium leading-5 text-amber-700">
                        Para stands que no operan ventas ni caja propia de inventario. Al aprobar el pago, el IMEI se borra de la vista del stand.
                      </span>
                    </span>
                  </label>

                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">
                          Siigo por sede
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {facturaComoOnline
                            ? "Este stand factura usando la configuracion Siigo de ONLINE."
                            : "Estos parametros determinan la resolucion y el comportamiento de facturacion de esta sede."}
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
                              event.target.checked
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        />
                        Activar Siigo
                      </label>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Documento / resolucion
                        <input
                          inputMode="numeric"
                          value={edicion.siigoInvoiceDocumentId}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "siigoInvoiceDocumentId",
                              soloDigitos(event.target.value)
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
                              soloDigitos(event.target.value)
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
                              soloDigitos(event.target.value)
                            )
                          }
                          placeholder="ID payment-types"
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Codigo producto
                        <input
                          value={edicion.siigoItemCode}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "siigoItemCode",
                              event.target.value
                            )
                          }
                          placeholder="Opcional"
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
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
                              soloDigitos(event.target.value)
                            )
                          }
                          placeholder="Opcional"
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Dias vencimiento
                        <input
                          inputMode="numeric"
                          value={edicion.siigoPaymentDueDays}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "siigoPaymentDueDays",
                              soloDigitos(event.target.value)
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
                              event.target.value.toUpperCase()
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
                              soloDigitos(event.target.value)
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
                              soloDigitos(event.target.value)
                            )
                          }
                          placeholder="Ej: 73001"
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Codigo postal
                        <input
                          value={edicion.siigoDefaultPostalCode}
                          onChange={(event) =>
                            actualizarEdicion(
                              sede.id,
                              "siigoDefaultPostalCode",
                              soloDigitos(event.target.value)
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
                              event.target.checked
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
                              event.target.checked
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        />
                        Enviar correo desde Siigo
                      </label>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void guardarSede(sede.id)}
                      disabled={procesandoId === sede.id}
                      className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
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
      </div>
    </div>
  );
}
