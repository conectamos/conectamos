"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  type AvatarPerfilKey,
  obtenerAvatarDefaultPorTipo,
  obtenerOpcionesAvatarPorTipo,
} from "@/lib/profile-avatars";

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type SedeItem = {
  id: number;
  nombre: string;
};

type PerfilItem = {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  correo: string | null;
  avatarKey: AvatarPerfilKey;
  activo: boolean;
  tipo:
    | "ADMINISTRADOR"
    | "AUDITOR"
    | "FACTURADOR"
    | "SUPERVISOR_TIENDA"
    | "VENDEDOR"
    | "APOYO_OPERATIVO";
  tipoLabel: string;
  debeCambiarPin: boolean;
  sedeIds: number[];
  sedes: SedeItem[];
};

type PerfilEdicion = {
  nombre: string;
  documento: string;
  telefono: string;
  correo: string;
  avatarKey: AvatarPerfilKey;
  tipo: PerfilItem["tipo"];
  activo: boolean;
  sedeIds: number[];
  pin: string;
};

const TIPOS_PERFIL: Array<{
  value: PerfilItem["tipo"];
  label: string;
  detail: string;
}> = [
  {
    value: "ADMINISTRADOR",
    label: "Administrador",
    detail: "Acceso total al sistema.",
  },
  {
    value: "AUDITOR",
    label: "Auditor",
    detail: "Acceso total al sistema, sin permisos para eliminar.",
  },
  {
    value: "FACTURADOR",
    label: "Facturador",
    detail: "Perfil reservado para el modulo futuro de facturacion.",
  },
  {
    value: "SUPERVISOR_TIENDA",
    label: "Supervisor de tienda",
    detail: "Ve solo las sedes que tenga asignadas.",
  },
  {
    value: "VENDEDOR",
    label: "Vendedor",
    detail: "Solo ve su modulo de registros tipo venta.",
  },
  {
    value: "APOYO_OPERATIVO",
    label: "Apoyo operativo",
    detail: "Ve registros tipo venta y acceso al radar.",
  },
];

const COLUMNAS_PERFIL: Array<{
  tipo: PerfilItem["tipo"];
  titulo: string;
}> = [
  { tipo: "ADMINISTRADOR", titulo: "Admin" },
  { tipo: "AUDITOR", titulo: "Auditor" },
  { tipo: "SUPERVISOR_TIENDA", titulo: "Supervisor" },
  { tipo: "VENDEDOR", titulo: "Vendedor" },
  { tipo: "APOYO_OPERATIVO", titulo: "Apoyo operativo" },
  { tipo: "FACTURADOR", titulo: "Facturador" },
];

function tipoDescripcion(tipo: PerfilItem["tipo"]) {
  return TIPOS_PERFIL.find((item) => item.value === tipo)?.detail || "";
}

function normalizarDigitos(valor: string) {
  return valor.replace(/\D/g, "").slice(0, 6);
}

export default function PerfilesVendedorPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [perfiles, setPerfiles] = useState<PerfilItem[]>([]);
  const [sedes, setSedes] = useState<SedeItem[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [perfilAbiertoId, setPerfilAbiertoId] = useState<number | null>(null);

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoDocumento, setNuevoDocumento] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoPin, setNuevoPin] = useState("");
  const [nuevoActivo, setNuevoActivo] = useState(true);
  const [nuevoTipo, setNuevoTipo] =
    useState<PerfilItem["tipo"]>("SUPERVISOR_TIENDA");
  const [nuevoAvatarKey, setNuevoAvatarKey] =
    useState<AvatarPerfilKey>(obtenerAvatarDefaultPorTipo("SUPERVISOR_TIENDA"));
  const [nuevaSedeIds, setNuevaSedeIds] = useState<number[]>([]);

  const [ediciones, setEdiciones] = useState<Record<number, PerfilEdicion>>({});

  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user?.rolNombre || "").toUpperCase());

  const aplicarCarga = (data: {
    perfiles?: PerfilItem[];
    sedes?: SedeItem[];
  }) => {
    const perfilesCargados = Array.isArray(data.perfiles) ? data.perfiles : [];
    const sedesCargadas = Array.isArray(data.sedes) ? data.sedes : [];

    setPerfiles(perfilesCargados);
    setSedes(sedesCargadas);
    setEdiciones(
      perfilesCargados.reduce((acc: Record<number, PerfilEdicion>, perfil) => {
        acc[perfil.id] = {
          nombre: perfil.nombre,
          documento: perfil.documento || "",
          telefono: perfil.telefono || "",
          correo: perfil.correo || "",
          avatarKey: perfil.avatarKey,
          tipo: perfil.tipo,
          activo: perfil.activo,
          sedeIds: perfil.sedeIds,
          pin: "",
        };
        return acc;
      }, {})
    );
    setPerfilAbiertoId((actual) =>
      perfilesCargados.some((perfil) => perfil.id === actual) ? actual : null
    );
  };

  useEffect(() => {
    void (async () => {
      try {
        const [resSession, resPerfiles] = await Promise.all([
          fetch("/api/session", { cache: "no-store" }),
          fetch("/api/perfiles-vendedor", { cache: "no-store" }),
        ]);

        const sessionData = await resSession.json();
        const perfilesData = await resPerfiles.json();

        if (resSession.ok) {
          setUser(sessionData);
        }

        if (resPerfiles.ok) {
          aplicarCarga(perfilesData);
        } else {
          setMensaje(perfilesData.error || "No se pudo cargar el modulo de perfiles");
        }
      } catch {
        setMensaje("Error cargando perfiles de vendedor");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const actualizarEdicion = (
    perfilId: number,
    campo: keyof PerfilEdicion,
    valor: string | boolean | number[] | AvatarPerfilKey
  ) => {
    setEdiciones((actual) => ({
      ...actual,
      [perfilId]: {
        ...actual[perfilId],
        [campo]: valor,
      },
    }));
  };

  const actualizarTipoEdicion = (
    perfilId: number,
    tipo: PerfilItem["tipo"]
  ) => {
    setEdiciones((actual) => {
      const previo = actual[perfilId];

      if (!previo) {
        return actual;
      }

      return {
        ...actual,
        [perfilId]: {
          ...previo,
          tipo,
          avatarKey: obtenerAvatarDefaultPorTipo(tipo),
        },
      };
    });
  };

  const alternarSede = (
    sedeId: number,
    seleccionadas: number[],
    onChange: (next: number[]) => void
  ) => {
    if (seleccionadas.includes(sedeId)) {
      onChange(seleccionadas.filter((item) => item !== sedeId));
      return;
    }

    onChange([...seleccionadas, sedeId]);
  };

  const crearPerfil = async () => {
    try {
      setGuardandoNuevo(true);
      setMensaje("");

      const res = await fetch("/api/perfiles-vendedor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre: nuevoNombre,
          documento: nuevoDocumento,
          telefono: nuevoTelefono,
          correo: nuevoCorreo,
          avatarKey: nuevoAvatarKey,
          pin: nuevoPin,
          activo: nuevoActivo,
          tipo: nuevoTipo,
          sedeIds: nuevaSedeIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo crear el perfil");
        return;
      }

      setMensaje(data.mensaje || "Perfil creado correctamente");
      aplicarCarga(data);
      setNuevoNombre("");
      setNuevoDocumento("");
      setNuevoTelefono("");
      setNuevoCorreo("");
      setNuevoPin("");
      setNuevoActivo(true);
      setNuevoTipo("SUPERVISOR_TIENDA");
      setNuevoAvatarKey(obtenerAvatarDefaultPorTipo("SUPERVISOR_TIENDA"));
      setNuevaSedeIds([]);
    } catch {
      setMensaje("Error creando perfil");
    } finally {
      setGuardandoNuevo(false);
    }
  };

  const guardarPerfil = async (perfilId: number) => {
    try {
      setProcesandoId(perfilId);
      setMensaje("");

      const payload = ediciones[perfilId];

      const res = await fetch("/api/perfiles-vendedor", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: perfilId,
          nombre: payload?.nombre,
          documento: payload?.documento,
          telefono: payload?.telefono,
          correo: payload?.correo,
          avatarKey: payload?.avatarKey,
          tipo: payload?.tipo,
          activo: payload?.activo,
          sedeIds: payload?.sedeIds,
          pin: payload?.pin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo guardar el perfil");
        return;
      }

      setMensaje(data.mensaje || "Perfil actualizado correctamente");
      aplicarCarga(data);
    } catch {
      setMensaje("Error actualizando perfil");
    } finally {
      setProcesandoId(null);
    }
  };

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4 py-8">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-[#e30613]" />
          <h1 className="mt-5 text-xl font-black text-slate-950">
            Cargando perfiles de vendedor...
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Consultando perfiles y sedes disponibles.
          </p>
        </div>
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4 py-8">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
          <div className="inline-flex rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-red-700">
            Acceso restringido
          </div>
          <h1 className="mt-4 text-3xl font-black text-slate-950">
            Solo el administrador puede gestionar perfiles
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Este módulo deja listos los perfiles con PIN y sedes asignadas para el flujo de vendedores.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard"
              className="inline-flex rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9000b]"
            >
              Volver al dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const perfilesActivos = perfiles.filter((perfil) => perfil.activo).length;
  const perfilesPorColumna = COLUMNAS_PERFIL.map((columna) => ({
    ...columna,
    perfiles: perfiles.filter((perfil) => perfil.tipo === columna.tipo),
  }));
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

  const renderPerfilEditor = (perfil: PerfilItem, edicion: PerfilEdicion) => (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Nombre
          <input
            value={edicion.nombre}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "nombre", event.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Documento
          <input
            value={edicion.documento}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "documento", event.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Teléfono
          <input
            value={edicion.telefono}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "telefono", event.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Correo
          <input
            value={edicion.correo}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "correo", event.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Tipo de perfil
          <select
            value={edicion.tipo}
            onChange={(event) =>
              actualizarTipoEdicion(
                perfil.id,
                event.target.value as PerfilItem["tipo"]
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          >
            {TIPOS_PERFIL.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-medium text-slate-500">
            {tipoDescripcion(edicion.tipo)}
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Avatar visual
          <select
            value={edicion.avatarKey}
            onChange={(event) =>
              actualizarEdicion(
                perfil.id,
                "avatarKey",
                event.target.value as AvatarPerfilKey
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          >
            {obtenerOpcionesAvatarPorTipo(edicion.tipo).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
          Resetear PIN
          <input
            value={edicion.pin}
            onChange={(event) =>
              actualizarEdicion(
                perfil.id,
                "pin",
                normalizarDigitos(event.target.value)
              )
            }
            placeholder="Dejar vacío para conservarlo"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
          />
        </label>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={edicion.activo}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "activo", event.target.checked)
            }
            className="h-4 w-4 rounded border-slate-300"
          />
          Perfil activo
        </label>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Sedes asignadas
          </h4>
          <p className="text-sm text-slate-500">
            Selecciona las sedes que este perfil podrá consultar.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {sedes.map((sede) => {
            const selected = edicion.sedeIds.includes(sede.id);

            return (
              <button
                key={`${perfil.id}-${sede.id}`}
                type="button"
                onClick={() =>
                  alternarSede(sede.id, edicion.sedeIds, (next) =>
                    actualizarEdicion(perfil.id, "sedeIds", next)
                  )
                }
                className={[
                  "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition",
                  selected
                    ? "border-[#e30613] bg-[#e30613] text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white",
                ].join(" ")}
              >
                {sede.nombre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void guardarPerfil(perfil.id)}
          disabled={procesandoId === perfil.id}
          className="min-h-11 rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {procesandoId === perfil.id ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/ventas"
        coverageLabel="Todas las sedes"
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Perfiles operativos
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Usuarios, alcance por rol y asignación de sedes
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/ventas/equipo-comercial"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <DashboardIcon name="catalog" className="h-5 w-5" />
                Catálogos de ventas
              </Link>
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
                <DashboardIcon name="user" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Total perfiles
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {perfiles.length}
                </p>
              </div>
            </article>

            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <DashboardIcon name="approvals" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Perfiles activos
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {perfilesActivos}
                </p>
              </div>
            </article>

            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                <DashboardIcon name="lock" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Perfiles inactivos
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {perfiles.length - perfilesActivos}
                </p>
              </div>
            </article>

            <article className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <DashboardIcon name="store" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Sedes disponibles
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {sedes.length}
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
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e30613]">
              Nuevo perfil
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Crear perfil con PIN
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              El PIN inicial debe tener entre 4 y 6 dígitos y quedará marcado para cambio futuro.
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Nombre completo
              <input
                value={nuevoNombre}
                onChange={(event) => setNuevoNombre(event.target.value)}
                placeholder="Ej: Juan Gómez"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Documento
              <input
                value={nuevoDocumento}
                onChange={(event) => setNuevoDocumento(event.target.value)}
                placeholder="Cédula del vendedor"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Teléfono
              <input
                value={nuevoTelefono}
                onChange={(event) => setNuevoTelefono(event.target.value)}
                placeholder="+573001112233"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Correo
              <input
                value={nuevoCorreo}
                onChange={(event) => setNuevoCorreo(event.target.value)}
                placeholder="correo@conectamos.com"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Perfil
              <select
                value={nuevoTipo}
                onChange={(event) =>
                  (() => {
                    const tipo = event.target.value as PerfilItem["tipo"];
                    setNuevoTipo(tipo);
                    setNuevoAvatarKey(obtenerAvatarDefaultPorTipo(tipo));
                  })()
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              >
                {TIPOS_PERFIL.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="text-xs font-medium text-slate-500">
                {tipoDescripcion(nuevoTipo)}
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Avatar visual
              <select
                value={nuevoAvatarKey}
                onChange={(event) =>
                  setNuevoAvatarKey(event.target.value as AvatarPerfilKey)
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              >
                {obtenerOpcionesAvatarPorTipo(nuevoTipo).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              PIN inicial
              <input
                value={nuevoPin}
                onChange={(event) =>
                  setNuevoPin(normalizarDigitos(event.target.value))
                }
                placeholder="4 a 6 dígitos"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={nuevoActivo}
                onChange={(event) => setNuevoActivo(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Perfil activo
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                Asignación de sedes
              </h3>
              <p className="text-sm text-slate-500">
                Para administradores y auditores puedes dejarlo sin sedes. Supervisores, facturadores y vendedores deben tener al menos una.
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sedes.map((sede) => {
                const selected = nuevaSedeIds.includes(sede.id);

                return (
                  <button
                    key={sede.id}
                    type="button"
                    onClick={() =>
                      alternarSede(sede.id, nuevaSedeIds, setNuevaSedeIds)
                    }
                    className={[
                      "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition",
                      selected
                        ? "border-[#e30613] bg-[#e30613] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {sede.nombre}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void crearPerfil()}
              disabled={guardandoNuevo}
              className="min-h-11 rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {guardandoNuevo ? "Creando..." : "Crear perfil"}
            </button>
          </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e30613]">
              Perfiles existentes
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Perfiles registrados
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Puedes actualizar datos, reasignar sedes o resetear el PIN dejando un nuevo valor.
            </p>
          </div>

          <div className="mt-5 grid gap-4 2xl:grid-cols-2">
            {perfilesPorColumna.map((columna) => (
              <section
                key={columna.tipo}
                className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                      <DashboardIcon name="user" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-slate-950">
                        {columna.titulo}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {columna.perfiles.length} perfil
                        {columna.perfiles.length === 1 ? "" : "es"}
                      </p>
                    </div>
                  </div>

                  <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-2.5 text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-200">
                    {columna.perfiles.length}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {columna.perfiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm text-slate-500">
                      No hay perfiles en esta columna.
                    </div>
                  ) : (
                    columna.perfiles.map((perfil) => {
                      const edicion = ediciones[perfil.id];

                      if (!edicion) {
                        return null;
                      }

                      const abierto = perfilAbiertoId === perfil.id;

                      return (
                        <div
                          key={perfil.id}
                          className={[
                            "rounded-xl border p-4 transition",
                            perfil.activo
                              ? "border-slate-200 bg-white"
                              : "border-slate-200 bg-slate-100/90 opacity-85",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setPerfilAbiertoId((actual) =>
                                  actual === perfil.id ? null : perfil.id
                                )
                              }
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                                {perfil.nombre
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((parte) => parte[0]?.toUpperCase())
                                  .join("") || "P"}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-base font-black text-slate-950">
                                  {perfil.nombre}
                                </span>
                                <span className="mt-1 block text-xs font-medium text-slate-500">
                                  {perfil.activo ? "Activo" : "Inactivo"} ·{" "}
                                  {perfil.sedes.length
                                    ? `${perfil.sedes.length} sede${perfil.sedes.length === 1 ? "" : "s"}`
                                    : "Sin sedes"}
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setPerfilAbiertoId((actual) =>
                                  actual === perfil.id ? null : perfil.id
                                )
                              }
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
                              aria-label={
                                abierto
                                  ? `Cerrar ${perfil.nombre}`
                                  : `Abrir ${perfil.nombre}`
                              }
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className={`transition ${abierto ? "rotate-90" : ""}`}
                                aria-hidden="true"
                              >
                                <path
                                  d="M9 6L15 12L9 18"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>

                          {abierto && renderPerfilEditor(perfil, edicion)}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
          </section>
        </main>
      </div>
    </div>
  );
}
