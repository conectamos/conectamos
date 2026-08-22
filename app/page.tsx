"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type AvatarPerfilKey,
  normalizarAvatarPerfil,
} from "@/lib/profile-avatars";

type PerfilAcceso = {
  id: number;
  nombre: string;
  tipo:
    | "ADMINISTRADOR"
    | "AUDITOR"
    | "FACTURADOR"
    | "SUPERVISOR_TIENDA"
    | "VENDEDOR"
    | "APOYO_OPERATIVO";
  avatarKey: AvatarPerfilKey;
  tipoLabel: string;
  debeCambiarPin: boolean;
};

type UsuarioPendiente = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre?: string;
};

type ModalModo = "pin" | "cambiar-pin";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 " +
        (compact ? "h-11 w-11" : "h-12 w-12")
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-8 w-8 text-[#ef1018]" fill="none">
        <path
          d="M39 43.5a18 18 0 1 1 0-27"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M39 47h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M45 15a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M45 8a15 15 0 0 1 15 15" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

type AvatarPresentation = {
  alt: string;
  src: string;
  shapeClass: string;
  toneClass: string;
};

const AVATAR_PRESENTATIONS: Record<AvatarPerfilKey, AvatarPresentation> = {
  SUPERVISOR: {
    src: "/profile-avatars/supervisor-3d.png",
    alt: "Avatar de supervisor",
    shapeClass: "rounded-[42%_58%_54%_46%/40%_38%_62%_60%]",
    toneClass:
      "border-white/80 bg-[linear-gradient(180deg,#f9fcff_0%,#ebf3ff_54%,#f5f9ff_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_52px_rgba(148,163,184,0.2)]",
  },
  SUPERVISORA_MUJER: {
    src: "/profile-avatars/supervisora-mujer-3d.png",
    alt: "Avatar de supervisora",
    shapeClass: "rounded-[50%_50%_46%_54%/40%_42%_58%_60%]",
    toneClass:
      "border-white/80 bg-[linear-gradient(180deg,#fffdf8_0%,#eef4ff_52%,#f7fbff_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_52px_rgba(148,163,184,0.2)]",
  },
  FACTURADOR: {
    src: "/profile-avatars/facturador-3d.png",
    alt: "Avatar de facturador",
    shapeClass: "rounded-[48%_52%_44%_56%/38%_42%_58%_62%]",
    toneClass:
      "border-white/80 bg-[linear-gradient(180deg,#fffdf8_0%,#eef5ff_58%,#f7fbff_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_52px_rgba(148,163,184,0.2)]",
  },
  VENDEDOR_HOMBRE: {
    src: "/profile-avatars/vendedor-hombre-3d.png",
    alt: "Avatar de vendedor hombre",
    shapeClass: "rounded-[46%_54%_58%_42%/44%_38%_62%_56%]",
    toneClass:
      "border-white/80 bg-[linear-gradient(180deg,#fbfffd_0%,#ecfaf3_56%,#f8fcfb_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_52px_rgba(148,163,184,0.2)]",
  },
  VENDEDOR_MUJER: {
    src: "/profile-avatars/vendedor-mujer-3d.png",
    alt: "Avatar de vendedora",
    shapeClass: "rounded-[52%_48%_46%_54%/38%_44%_56%_62%]",
    toneClass:
      "border-white/80 bg-[linear-gradient(180deg,#f9fdff_0%,#eef7ff_54%,#f7fbff_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_52px_rgba(148,163,184,0.2)]",
  },
  ADMINISTRADOR_HOMBRE: {
    src: "/profile-avatars/administrador-hombre-3d.png",
    alt: "Avatar de administrador hombre",
    shapeClass: "rounded-[44%_56%_52%_48%/36%_40%_60%_64%]",
    toneClass:
      "border-[#f1e0b0] bg-[linear-gradient(180deg,#fff9e7_0%,#fff2c9_50%,#fff8e6_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_24px_56px_rgba(180,138,40,0.22)]",
  },
  ADMINISTRADOR_MUJER: {
    src: "/profile-avatars/administrador-mujer-3d.png",
    alt: "Avatar de administradora",
    shapeClass: "rounded-[50%_50%_44%_56%/38%_40%_60%_62%]",
    toneClass:
      "border-[#f1e0b0] bg-[linear-gradient(180deg,#fff9e7_0%,#fff1d6_52%,#fff8ed_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_24px_56px_rgba(180,138,40,0.2)]",
  },
  AUDITOR_HOMBRE: {
    src: "/profile-avatars/auditor-hombre-3d.png",
    alt: "Avatar de auditor hombre",
    shapeClass: "rounded-[46%_54%_52%_48%/36%_40%_60%_64%]",
    toneClass:
      "border-[#d5d9e2] bg-[linear-gradient(180deg,#f8fafc_0%,#e8edf5_52%,#f7f8fb_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_24px_56px_rgba(15,23,42,0.18)]",
  },
  AUDITOR_MUJER: {
    src: "/profile-avatars/auditor-mujer-3d.png",
    alt: "Avatar de auditor mujer",
    shapeClass: "rounded-[50%_50%_46%_54%/38%_42%_58%_62%]",
    toneClass:
      "border-[#f4b5b5] bg-[linear-gradient(180deg,#fff6f4_0%,#ffe3de_52%,#fff8f5_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_24px_56px_rgba(185,28,28,0.16)]",
  },
};

function ProfileAvatar({
  perfil,
  compact = false,
}: {
  perfil: PerfilAcceso;
  compact?: boolean;
}) {
  const avatarKey = normalizarAvatarPerfil(perfil.avatarKey, perfil.tipo);
  const avatar = AVATAR_PRESENTATIONS[avatarKey];

  return (
    <div
      className={[
        "relative shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f8fa] transition duration-300 group-hover:border-red-200 group-hover:bg-red-50/40 sm:self-center",
        compact
          ? "h-[4.5rem] w-[4.5rem]"
          : "h-24 w-24 sm:h-32 sm:w-32",
      ].join(" ")}
    >
      <Image
        src={avatar.src}
        alt={avatar.alt}
        fill
        sizes={compact ? "72px" : "(max-width: 639px) 96px, (max-width: 1279px) 40vw, 360px"}
        className="object-contain object-bottom transition duration-300 group-hover:scale-[1.025]"
      />
    </div>
  );
}

function ProfileSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ProfileArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LoginBrandIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-14 w-14 text-[#ef1018]"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M39 43.5a18 18 0 1 1 0-27"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M39 47h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M45 15a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M45 8a15 15 0 0 1 15 15" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function LoginUserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 20c.7-4 3.2-6 7.5-6s6.8 2 7.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LoginLockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LoginEyeIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      {crossed && <path d="M5 4 19 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

export default function Home() {
  const router = useRouter();

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [pin, setPin] = useState("");
  const [nuevoPin, setNuevoPin] = useState("");
  const [confirmarPin, setConfirmarPin] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [perfiles, setPerfiles] = useState<PerfilAcceso[]>([]);
  const [usuarioPendiente, setUsuarioPendiente] = useState<UsuarioPendiente | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);
  const [pasoPerfil, setPasoPerfil] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [modalModo, setModalModo] = useState<ModalModo | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const pendingPinChangeRes = await fetch("/api/login/perfil/cambiar-pin", {
          cache: "no-store",
        });

        if (pendingPinChangeRes.ok) {
          const data = await pendingPinChangeRes.json();

          setPasoPerfil(true);
          setPerfiles(Array.isArray(data.perfiles) ? data.perfiles : []);
          setUsuarioPendiente(data.usuario ?? null);
          setPerfilId(String(data.perfil?.id ?? ""));
          setPin("");
          setNuevoPin("");
          setConfirmarPin("");
          setMensaje("Debes cambiar tu PIN para continuar");
          setModalModo("cambiar-pin");
          return;
        }

        const res = await fetch("/api/login/perfil", {
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        setPasoPerfil(true);
        setPerfiles(Array.isArray(data.perfiles) ? data.perfiles : []);
        setUsuarioPendiente(data.usuario ?? null);

        if (data.pendingPinChange) {
          setPerfilId(String(data.pendingPinChange));
          setMensaje("Debes cambiar tu PIN para continuar");
          setModalModo("cambiar-pin");
        }
      } catch {}
    })();
  }, []);

  const perfilesFiltrados = perfiles.filter((perfil) => {
    const texto = `${perfil.nombre} ${perfil.tipoLabel} ${perfil.tipo}`.toLowerCase();
    return texto.includes(busqueda.trim().toLowerCase());
  });

  const perfilSeleccionadoActual =
    perfiles.find((perfil) => String(perfil.id) === perfilId) ?? null;
  const hayPerfilSeleccionado = perfilSeleccionadoActual !== null;
  const perfilSeleccionado: PerfilAcceso = perfilSeleccionadoActual ?? {
    id: 0,
    nombre: "",
    tipo: "SUPERVISOR_TIENDA",
    avatarKey: "SUPERVISOR",
    tipoLabel: "",
    debeCambiarPin: false,
  };
  const nombreSedeActual =
    usuarioPendiente?.sedeNombre || "Sede sin configurar";

  const limpiarEstadoModal = () => {
    setPin("");
    setNuevoPin("");
    setConfirmarPin("");
    setMensaje("");
  };

  const abrirModalPin = (id: string) => {
    setPerfilId(id);
    setModalModo("pin");
    limpiarEstadoModal();
  };

  const abrirModalCambioPin = (
    id: string,
    texto = "Debes cambiar tu PIN para continuar"
  ) => {
    setPerfilId(id);
    setModalModo("cambiar-pin");
    setPin("");
    setNuevoPin("");
    setConfirmarPin("");
    setMensaje(texto);
  };

  useEffect(() => {
    if (!hayPerfilSeleccionado || modalModo !== "pin") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !cargando) {
        setPerfilId("");
        setModalModo(null);
        limpiarEstadoModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hayPerfilSeleccionado, cargando, modalModo]);

  const login = async () => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ usuario, clave }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error al conectar con el servidor");
        return;
      }

      if (data.requiresProfile) {
        setPasoPerfil(true);
        setPerfiles(Array.isArray(data.perfiles) ? data.perfiles : []);
        setUsuarioPendiente(data.usuario ?? null);
        setClave("");
        setModalModo(null);
        limpiarEstadoModal();
        setPerfilId("");
        setBusqueda("");
        setMensaje("");
        return;
      }

      setMensaje(`Bienvenido ${data.usuario.nombre}`);

      setTimeout(() => {
        router.push("/dashboard");
      }, 700);
    } catch {
      setMensaje("Error al conectar con el servidor");
    } finally {
      setCargando(false);
    }
  };

  const confirmarPerfil = async () => {
    try {
      setCargando(true);
      setMensaje("");

      if (!perfilId) {
        setMensaje("Debes seleccionar un perfil");
        return;
      }

      if (!/^\d{4,6}$/.test(pin)) {
        setMensaje("El PIN debe tener entre 4 y 6 digitos");
        return;
      }

      const res = await fetch("/api/login/perfil", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          perfilId: Number(perfilId),
          pin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo validar el perfil");
        return;
      }

      if (data.requiresPinChange) {
        setPerfiles((actuales) =>
          actuales.map((perfil) =>
            perfil.id === data.perfil?.id
              ? {
                  ...perfil,
                  debeCambiarPin: true,
                }
              : perfil
          )
        );
        abrirModalCambioPin(String(data.perfil?.id ?? perfilId), data.mensaje);
        return;
      }

      setMensaje(data.mensaje || "Acceso correcto");

      setTimeout(() => {
        router.push("/dashboard");
      }, 700);
    } catch {
      setMensaje("Error validando el perfil");
    } finally {
      setCargando(false);
    }
  };

  const confirmarCambioPin = async () => {
    try {
      setCargando(true);
      setMensaje("");

      if (!/^\d{4,6}$/.test(nuevoPin)) {
        setMensaje("El nuevo PIN debe tener entre 4 y 6 digitos");
        return;
      }

      if (nuevoPin !== confirmarPin) {
        setMensaje("La confirmacion del PIN no coincide");
        return;
      }

      const res = await fetch("/api/login/perfil/cambiar-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nuevoPin,
          confirmarPin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo actualizar el PIN");
        return;
      }

      setPerfiles((actuales) =>
        actuales.map((perfil) =>
          perfil.id === Number(perfilId)
            ? {
                ...perfil,
                debeCambiarPin: false,
              }
            : perfil
        )
      );
      setMensaje(data.mensaje || "PIN actualizado correctamente");

      setTimeout(() => {
        router.push("/dashboard");
      }, 700);
    } catch {
      setMensaje("Error actualizando el PIN");
    } finally {
      setCargando(false);
    }
  };

  const volverAlInicio = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
      });
    } catch {}

    setPasoPerfil(false);
    setPerfiles([]);
    setUsuarioPendiente(null);
    setPerfilId("");
    setModalModo(null);
    limpiarEstadoModal();
    setBusqueda("");
    setMensaje("");
  };

  const cerrarModalPerfil = () => {
    if (cargando || modalModo !== "pin") {
      return;
    }

    setPerfilId("");
    setModalModo(null);
    limpiarEstadoModal();
  };

  if (pasoPerfil) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] text-slate-950">
        <header className="border-b border-white/10 bg-[#11161d] text-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <div className="mx-auto flex min-h-[76px] max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark compact />
              <div className="min-w-0">
                <p className="truncate text-lg font-black tracking-[0.01em] text-white sm:text-xl">
                  CONECTAMOS
                </p>
                <p className="truncate text-xs text-slate-400">
                  Acceso por perfiles
                </p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="hidden min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 sm:block">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Sede activa
                </p>
                <p className="max-w-52 truncate text-sm font-semibold text-white">
                  {nombreSedeActual}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void volverAlInicio()}
                disabled={cargando}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-3 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-[1480px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:items-end">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e30613]">
                  Acceso por perfil
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">
                  Selecciona tu perfil
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Elige el perfil con el que vas a operar en {nombreSedeActual}.
                </p>
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="buscar-perfil" className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                    Buscar perfil
                  </label>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                    {perfilesFiltrados.length} {perfilesFiltrados.length === 1 ? "perfil" : "perfiles"}
                  </span>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                    <ProfileSearchIcon />
                  </span>
                  <input
                    id="buscar-perfil"
                    type="search"
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    placeholder="Nombre o tipo de perfil"
                    autoComplete="off"
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="perfiles-disponibles-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="perfiles-disponibles-title" className="text-lg font-black text-slate-950">
                  Perfiles disponibles
                </h2>
                <p className="text-xs text-slate-500 sm:hidden">
                  Sede: {nombreSedeActual}
                </p>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block">
                Selecciona un perfil para ingresar con su PIN.
              </p>
            </div>

            <div
              className={[
                "grid gap-4",
                perfilesFiltrados.length === 1
                  ? "max-w-md"
                  : "md:grid-cols-2 xl:grid-cols-3",
              ].join(" ")}
            >
              {perfilesFiltrados.map((perfil) => {
                const seleccionado = String(perfil.id) === perfilId;

                return (
                  <button
                    key={perfil.id}
                    type="button"
                    onClick={() => abrirModalPin(String(perfil.id))}
                    aria-label={
                      "Ingresar con el perfil " + perfil.nombre + ", " + perfil.tipoLabel
                    }
                    className={[
                      "group relative flex min-w-0 overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-[0_6px_20px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 sm:min-h-[286px] sm:flex-col sm:p-5",
                      seleccionado ? "border-red-300 ring-4 ring-red-50" : "border-slate-200/90",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "absolute inset-x-0 top-0 h-1 origin-left bg-[#e30613] transition-transform duration-200",
                        seleccionado ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                      ].join(" ")}
                    />

                    <ProfileAvatar perfil={perfil} />

                    <span className="flex min-w-0 flex-1 flex-col pl-4 sm:w-full sm:pl-0 sm:pt-4">
                      <span className="line-clamp-2 text-lg font-black leading-tight tracking-[-0.02em] text-slate-950 sm:text-xl">
                        {perfil.nombre}
                      </span>
                      <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {perfil.tipoLabel}
                      </span>

                      <span className="mt-auto flex items-end justify-between gap-3 pt-4 sm:w-full">
                        {perfil.debeCambiarPin ? (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">
                            Cambiar PIN
                          </span>
                        ) : (
                          <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
                            Ingresar
                          </span>
                        )}
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition group-hover:bg-[#e30613]">
                          <ProfileArrowIcon />
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}

              {perfilesFiltrados.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-[0_6px_20px_rgba(15,23,42,0.035)]">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <ProfileSearchIcon />
                  </span>
                  <p className="mt-4 text-base font-black text-slate-900">
                    No encontramos perfiles
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Prueba con otro nombre o tipo de perfil.
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        {hayPerfilSeleccionado && modalModo && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]">
            <div className="flex min-h-full items-center justify-center py-4">
              {modalModo === "pin" && (
                <button
                  type="button"
                  aria-label="Cerrar modal"
                  onClick={cerrarModalPerfil}
                  className="absolute inset-0 cursor-default"
                />
              )}

              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="perfil-modal-title"
                aria-describedby="perfil-modal-description"
                className="relative z-10 w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:p-6"
              >
                {modalModo === "pin" && (
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={cerrarModalPerfil}
                    disabled={cargando}
                    className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-60"
                  >
                    <ProfileCloseIcon />
                  </button>
                )}

                <div className="flex items-center gap-4 pr-12">
                  <ProfileAvatar perfil={perfilSeleccionado} compact />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e30613]">
                      {modalModo === "pin" ? "Acceso al perfil" : "Primer ingreso"}
                    </p>
                    <h2 id="perfil-modal-title" className="mt-1 truncate text-xl font-black tracking-[-0.025em] text-slate-950">
                      {perfilSeleccionado.nombre}
                    </h2>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {perfilSeleccionado.tipoLabel}
                    </p>
                  </div>
                </div>

                <div id="perfil-modal-description" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {modalModo === "pin" ? "Ingresa tu PIN para continuar" : "Crea un PIN personal de 4 a 6 dígitos"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {modalModo === "pin" ? "Sede activa: " + nombreSedeActual : "Este cambio es obligatorio antes de ingresar al dashboard."}
                  </p>
                </div>

                {modalModo === "pin" ? (
                  <form
                    className="mt-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void confirmarPerfil();
                    }}
                  >
                    <label htmlFor="pin-perfil" className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                      PIN del perfil
                    </label>
                    <input
                      id="pin-perfil"
                      type="password"
                      inputMode="numeric"
                      autoComplete="current-password"
                      autoFocus
                      value={pin}
                      onChange={(event) =>
                        setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="4 a 6 dígitos"
                      className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold tracking-[0.28em] text-slate-950 outline-none transition placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
                    />

                    <button
                      type="submit"
                      disabled={cargando}
                      className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#e30613] px-5 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#c9000d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cargando ? "Confirmando..." : "Ingresar"}
                    </button>
                  </form>
                ) : (
                  <form
                    className="mt-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void confirmarCambioPin();
                    }}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                          Nuevo PIN
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="new-password"
                          autoFocus
                          value={nuevoPin}
                          onChange={(event) =>
                            setNuevoPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                          placeholder="4 a 6 dígitos"
                          className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.2em] text-slate-950 outline-none transition placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                          Confirmar PIN
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="new-password"
                          value={confirmarPin}
                          onChange={(event) =>
                            setConfirmarPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                          placeholder="Repite el PIN"
                          className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.2em] text-slate-950 outline-none transition placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={cargando}
                      className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#e30613] px-5 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#c9000d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cargando ? "Actualizando..." : "Guardar PIN"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void volverAlInicio()}
                      disabled={cargando}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-bold uppercase tracking-[0.08em] text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:opacity-60"
                    >
                      Cerrar sesión
                    </button>
                  </form>
                )}

                {mensaje && (
                  <p
                    role={/(correcto|correctamente|bienvenido)/i.test(mensaje) ? "status" : "alert"}
                    className={[
                      "mt-4 rounded-xl border px-4 py-3 text-sm font-medium",
                      /(correcto|correctamente|bienvenido)/i.test(mensaje)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : /debes cambiar tu pin/i.test(mensaje)
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-red-200 bg-red-50 text-red-800",
                    ].join(" ")}
                  >
                    {mensaje}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fafafa] text-[#111827]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <section className="relative hidden min-h-screen overflow-hidden bg-[#05070c] lg:block">
          <Image
            src="/branding/conectamos-login-robot-2026.png"
            alt="Mascota de CONECTAMOS en el centro de operaciones"
            fill
            priority
            sizes="100vw"
            quality={100}
            className="object-cover object-center"
          />
          <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,rgba(5,7,12,0)_0%,rgba(5,7,12,0.96)_32%,#05070c_48%)]" />
          <div className="absolute left-8 top-8 flex items-center sm:left-10 sm:top-10 xl:left-12 xl:top-12">
            <span className="relative text-6xl font-black leading-none text-[#ef1018]">
              C
              <span className="absolute bottom-0 left-[70%] h-0.5 w-7 bg-[#ef1018]" />
            </span>
            <span className="ml-1 text-3xl font-black text-white xl:text-4xl">
              ONECTAMOS
            </span>
            <svg
              viewBox="0 0 36 36"
              className="ml-1 h-9 w-9 self-start text-[#ef1018] xl:h-10 xl:w-10"
              fill="none"
              aria-hidden="true"
            >
              <path d="M5 14a12 12 0 0 1 12 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <path d="M5 6a20 20 0 0 1 20 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
        </section>

        <section className="relative flex min-h-screen min-w-0 items-center justify-center bg-[#fbfbfc] px-5 py-24 sm:px-8 lg:px-12">
          <div className="w-full max-w-[530px] rounded-lg border border-[#d9dadd] bg-white px-6 py-9 shadow-[0_18px_50px_rgba(17,24,39,0.08)] sm:px-12 sm:py-10">
            <div className="flex justify-center">
              <LoginBrandIcon />
            </div>

            <p className="mt-3 text-center text-sm font-extrabold uppercase text-[#ed111b]">
              Acceso al sistema
            </p>
            <h1 className="mt-3 text-center text-4xl font-black text-[#10141d]">
              Bienvenido
            </h1>
            <p className="mt-3 text-center text-base text-[#707783]">
              Ingresa tus credenciales para continuar.
            </p>

            <form
              className="mt-9"
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <div className="space-y-6">
                <label className="block text-sm font-bold text-[#303746]">
                  Usuario
                  <span className="relative mt-2 block">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#7c8490]">
                      <LoginUserIcon />
                    </span>
                    <input
                      type="text"
                      autoComplete="username"
                      placeholder="Usuario de la sede"
                      value={usuario}
                      onChange={(event) => setUsuario(event.target.value)}
                      className="box-border h-14 w-full min-w-0 rounded-lg border border-[#d5d8dd] bg-white pl-14 pr-4 text-base font-medium text-[#111827] outline-none transition placeholder:text-[#9298a2] focus:border-[#ed111b] focus:ring-4 focus:ring-red-100"
                    />
                  </span>
                </label>

                <label className="block text-sm font-bold text-[#303746]">
                  Contraseña
                  <span className="relative mt-2 block">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#7c8490]">
                      <LoginLockIcon />
                    </span>
                    <input
                      type={mostrarClave ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Clave de acceso"
                      value={clave}
                      onChange={(event) => setClave(event.target.value)}
                      className="box-border h-14 w-full min-w-0 rounded-lg border border-[#d5d8dd] bg-white pl-14 pr-14 text-base font-medium text-[#111827] outline-none transition placeholder:text-[#9298a2] focus:border-[#ed111b] focus:ring-4 focus:ring-red-100"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarClave((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-[#737b88] transition hover:text-[#ed111b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ed111b]"
                      aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                      title={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      <LoginEyeIcon crossed={mostrarClave} />
                    </button>
                  </span>
                </label>
              </div>

              {mensaje && (
                <p className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
                  {mensaje}
                </p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="mt-8 h-[60px] w-full rounded-lg border-b-[3px] border-[#ed111b] bg-[#090e18] px-6 text-lg font-extrabold text-white shadow-[0_12px_24px_rgba(9,14,24,0.18)] transition hover:bg-[#151b27] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[#7b828e]">
              <LoginLockIcon />
              <span>Acceso seguro para personal autorizado</span>
            </div>
          </div>

          <p className="absolute inset-x-0 bottom-8 text-center text-sm text-[#737b88]">
            © 2026 CONECTAMOS
          </p>
        </section>
      </div>
    </main>
  );
}
