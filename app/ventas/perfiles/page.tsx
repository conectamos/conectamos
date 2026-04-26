"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  tipo: "ADMINISTRADOR" | "FACTURADOR" | "SUPERVISOR_TIENDA" | "VENDEDOR";
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
];

const COLUMNAS_PERFIL: Array<{
  tipo: PerfilItem["tipo"];
  titulo: string;
}> = [
  { tipo: "ADMINISTRADOR", titulo: "Admin" },
  { tipo: "SUPERVISOR_TIENDA", titulo: "Supervisor" },
  { tipo: "VENDEDOR", titulo: "Vendedor" },
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

  const esAdmin = String(user?.rolNombre || "").toUpperCase() === "ADMIN";

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
      <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
        <div className="mx-auto max-w-7xl rounded-[32px] bg-white px-8 py-12 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Perfiles
          </p>
          <h1 className="mt-3 text-3xl font-black text-slate-950">
            Cargando perfiles de vendedor...
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
            Solo el administrador puede gestionar perfiles
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Este modulo deja listos los perfiles con PIN y sedes asignadas para el flujo de vendedores.
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

  const perfilesActivos = perfiles.filter((perfil) => perfil.activo).length;
  const perfilesPorColumna = COLUMNAS_PERFIL.map((columna) => ({
    ...columna,
    perfiles: perfiles.filter((perfil) => perfil.tipo === columna.tipo),
  }));

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
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Documento
          <input
            value={edicion.documento}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "documento", event.target.value)
            }
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Telefono
          <input
            value={edicion.telefono}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "telefono", event.target.value)
            }
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
          Correo
          <input
            value={edicion.correo}
            onChange={(event) =>
              actualizarEdicion(perfil.id, "correo", event.target.value)
            }
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
            placeholder="Dejar vacio para conservarlo"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
          />
        </label>
      </div>

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
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

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Sedes asignadas
          </h4>
          <p className="text-sm text-slate-500">
            Selecciona las sedes que este perfil podra consultar.
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
                  "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
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
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {procesandoId === perfil.id ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0f172a_0%,#111827_48%,#115e59_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Administracion
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Perfiles operativos
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Crea perfiles con PIN, define su alcance operativo y asigna las sedes
                que podran usar en el acceso por perfil.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/ventas/equipo-comercial"
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Catalogos de ventas
              </Link>
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

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Total perfiles
            </p>
            <p className="mt-3 text-3xl font-black text-slate-950">{perfiles.length}</p>
          </div>
          <div className="rounded-[28px] bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Perfiles activos
            </p>
            <p className="mt-3 text-3xl font-black text-emerald-600">{perfilesActivos}</p>
          </div>
          <div className="rounded-[28px] bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Sedes disponibles
            </p>
            <p className="mt-3 text-3xl font-black text-slate-950">{sedes.length}</p>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Nuevo perfil
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Crear perfil con PIN
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              El PIN inicial debe tener entre 4 y 6 digitos y quedara marcado para cambio futuro.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Nombre completo
              <input
                value={nuevoNombre}
                onChange={(event) => setNuevoNombre(event.target.value)}
                placeholder="Ej: Juan Gomez"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Documento
              <input
                value={nuevoDocumento}
                onChange={(event) => setNuevoDocumento(event.target.value)}
                placeholder="Cedula del vendedor"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Telefono
              <input
                value={nuevoTelefono}
                onChange={(event) => setNuevoTelefono(event.target.value)}
                placeholder="+573001112233"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Correo
              <input
                value={nuevoCorreo}
                onChange={(event) => setNuevoCorreo(event.target.value)}
                placeholder="correo@conectamos.com"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
                placeholder="4 a 6 digitos"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
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

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                Asignacion de sedes
              </h3>
              <p className="text-sm text-slate-500">
                Para administradores puedes dejarlo sin sedes. Supervisores, facturadores y vendedores deben tener al menos una.
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
                      "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
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
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {guardandoNuevo ? "Creando..." : "Crear perfil"}
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Perfiles existentes
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Perfiles registrados
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Puedes actualizar datos, reasignar sedes o resetear el PIN dejando un nuevo valor.
            </p>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-4">
            {perfilesPorColumna.map((columna) => (
              <section
                key={columna.tipo}
                className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">
                      {columna.titulo}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {columna.perfiles.length} perfil
                      {columna.perfiles.length === 1 ? "" : "es"}
                    </p>
                  </div>

                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {columna.titulo}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {columna.perfiles.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm text-slate-500">
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
                            "rounded-[24px] border p-4 transition",
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
                              className="flex-1 text-left"
                            >
                              <p className="text-lg font-black text-slate-950">
                                {perfil.nombre}
                              </p>
                              <p className="mt-1 text-xs font-medium text-slate-500">
                                {perfil.activo ? "Activo" : "Inactivo"} ·{" "}
                                {perfil.sedes.length
                                  ? `${perfil.sedes.length} sede${perfil.sedes.length === 1 ? "" : "s"}`
                                  : "Sin sedes"}
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setPerfilAbiertoId((actual) =>
                                  actual === perfil.id ? null : perfil.id
                                )
                              }
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
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
      </div>
    </div>
  );
}
