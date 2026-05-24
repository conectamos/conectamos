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
    | "VENDEDOR";
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
      className={`relative overflow-hidden rounded-[1.45rem] border border-white/12 bg-[linear-gradient(145deg,rgba(34,211,238,0.16)_0%,rgba(15,23,42,0.08)_50%,rgba(16,185,129,0.16)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_42px_rgba(15,23,42,0.18)] ${
        compact ? "h-14 w-14" : "h-16 w-16"
      }`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.28),transparent_38%),radial-gradient(circle_at_78%_82%,rgba(45,212,191,0.18),transparent_36%)]" />
      <svg
        viewBox="0 0 64 64"
        className="relative h-full w-full p-2.5"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17 19C17 15.6863 19.6863 13 23 13H37.5C42.1944 13 46 16.8056 46 21.5C46 26.1944 42.1944 30 37.5 30H28.5C24.9101 30 22 32.9101 22 36.5C22 40.0899 24.9101 43 28.5 43H48"
          stroke="rgba(236,254,255,0.94)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18" cy="19" r="5" fill="#67E8F9" />
        <circle cx="46" cy="21.5" r="5" fill="#A7F3D0" />
        <circle cx="47" cy="43" r="5" fill="#E2E8F0" />
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

function ProfileAvatar({ perfil }: { perfil: PerfilAcceso }) {
  const avatarKey = normalizarAvatarPerfil(perfil.avatarKey, perfil.tipo);
  const avatar = AVATAR_PRESENTATIONS[avatarKey];

  return (
    <div
      className={[
        "relative flex h-[16.5rem] w-[15.5rem] items-end justify-center overflow-hidden border transition duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03]",
        avatar.shapeClass,
        avatar.toneClass,
      ].join(" ")}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.24),transparent_48%)]" />
      <Image
        src={avatar.src}
        alt={avatar.alt}
        fill
        sizes="248px"
        className="object-cover object-center"
      />
    </div>
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fbff_0%,#e9eef7_48%,#dde5f0_100%)] text-slate-900">
        <header className="border-b border-white/10 bg-[linear-gradient(135deg,#1f2027_0%,#30313b_62%,#1f2027_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-4">
              <BrandMark />

              <div>
                <p className="text-[1.55rem] font-black tracking-[0.02em] text-white">
                  CONECTAMOS
                </p>
                <p className="text-sm text-white/78">
                  Ingreso por sede:{" "}
                  <span className="font-semibold text-white">
                    {nombreSedeActual}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void volverAlInicio()}
              disabled={cargando}
              className="rounded-2xl border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/16 disabled:opacity-60"
            >
              Cerrar sesion
            </button>
          </div>
        </header>

        <main className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-[2.2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,248,254,0.95)_100%)] p-6 shadow-[0_24px_70px_rgba(71,85,105,0.15)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-[-0.05em] text-slate-950 sm:text-5xl">
                  SELECCIONA EL PERFIL
                </h1>
              </div>

              <div className="w-full max-w-xl">
                <input
                  type="text"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar perfil"
                  className="w-full rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                />
              </div>
            </div>
          </section>

          <section>
            <div
              className={[
                "grid gap-x-8 gap-y-10 justify-items-center",
                perfilesFiltrados.length === 1
                  ? "mx-auto max-w-[18rem]"
                  : "sm:grid-cols-2 xl:grid-cols-3",
              ].join(" ")}
            >
              {perfilesFiltrados.map((perfil) => {
                const seleccionado = String(perfil.id) === perfilId;

                return (
                  <button
                    key={perfil.id}
                    type="button"
                    onClick={() => abrirModalPin(String(perfil.id))}
                    className="group flex w-full max-w-[18rem] flex-col items-center bg-transparent text-center transition"
                  >
                    <div
                      className={[
                        "rounded-[3rem] p-2 transition duration-300",
                        seleccionado
                          ? "bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.1),transparent_70%)] ring-4 ring-slate-200"
                          : "group-hover:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_70%)]",
                      ].join(" ")}
                    >
                      <ProfileAvatar perfil={perfil} />
                    </div>

                    <div className="mt-5">
                      <h2 className="text-[1.85rem] font-black tracking-[-0.04em] text-slate-950">
                        {perfil.nombre}
                      </h2>
                      <p className="mt-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {perfil.tipoLabel}
                      </p>
                      {perfil.debeCambiarPin ? (
                        <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Cambiar PIN
                        </span>
                      ) : (
                        <span className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition group-hover:border-slate-300 group-hover:text-slate-700">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
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
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {perfilesFiltrados.length === 0 && (
                <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-sm text-slate-600 shadow-[0_20px_55px_rgba(71,85,105,0.08)]">
                  No encontramos perfiles con ese texto.
                </div>
              )}
            </div>
          </section>
        </main>

        {hayPerfilSeleccionado && modalModo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.26)] px-4 backdrop-blur-[3px]">
            {modalModo === "pin" && (
              <button
                type="button"
                aria-label="Cerrar modal"
                onClick={cerrarModalPerfil}
                className="absolute inset-0 cursor-default"
              />
            )}

            <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,249,255,0.96)_100%)] p-6 shadow-[0_28px_80px_rgba(15,23,42,0.24)] sm:p-7">
              {modalModo === "pin" && (
                <button
                  type="button"
                  onClick={cerrarModalPerfil}
                  disabled={cargando}
                  className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <span className="text-xl leading-none">x</span>
                </button>
              )}
              {false && modalModo === "pin" && (
                <button
                type="button"
                onClick={cerrarModalPerfil}
                disabled={cargando}
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="text-xl leading-none">×</span>
                </button>
              )}

              <p className="text-[0.68rem] font-bold uppercase tracking-[0.32em] text-slate-500">
                {modalModo === "pin" ? "Acceso al perfil" : "Cambio de PIN"}
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] text-slate-950">
                {modalModo === "pin" ? "Ingresa tu PIN" : "Cambia tu PIN"}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {perfilSeleccionado.nombre} - {perfilSeleccionado.tipoLabel}
              </p>
              {perfilSeleccionado && false && (
                <p className="mt-2 text-sm font-medium text-slate-500">
                {perfilSeleccionado.nombre} · {perfilSeleccionado.tipoLabel}
              </p>
              )}
              <p className="mt-2 text-sm text-slate-500">
                {modalModo === "pin"
                  ? `Sucursal activa: ${nombreSedeActual}`
                  : "Es tu primer ingreso. Define un PIN personal de 4 a 6 digitos para continuar."}
              </p>

              {modalModo === "pin" ? (
                <>
                  <label className="mt-7 block">
                    <span className="sr-only">PIN del perfil</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      value={pin}
                      onChange={(event) =>
                        setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="PIN de 4 a 6 digitos"
                      className="w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4 text-2xl tracking-[0.22em] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:tracking-[0.16em] placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void confirmarPerfil()}
                    disabled={cargando}
                    className="mt-5 w-full rounded-[1.35rem] bg-[linear-gradient(135deg,#1b1f28_0%,#171c24_46%,#2a2d33_100%)] px-6 py-4 text-lg font-bold text-white shadow-[0_20px_40px_rgba(15,23,42,0.22)] transition hover:brightness-110 disabled:opacity-65"
                  >
                    {cargando ? "Confirmando..." : "Confirmar"}
                  </button>
                </>
              ) : (
                <>
                  <label className="mt-7 block">
                    <span className="sr-only">Nuevo PIN</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      value={nuevoPin}
                      onChange={(event) =>
                        setNuevoPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="Nuevo PIN"
                      className="w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4 text-2xl tracking-[0.22em] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:tracking-[0.12em] placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="sr-only">Confirmar PIN</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={confirmarPin}
                      onChange={(event) =>
                        setConfirmarPin(
                          event.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      placeholder="Confirmar PIN"
                      className="w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4 text-2xl tracking-[0.22em] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:tracking-[0.12em] placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void confirmarCambioPin()}
                    disabled={cargando}
                    className="mt-5 w-full rounded-[1.35rem] bg-[linear-gradient(135deg,#1b1f28_0%,#171c24_46%,#2a2d33_100%)] px-6 py-4 text-lg font-bold text-white shadow-[0_20px_40px_rgba(15,23,42,0.22)] transition hover:brightness-110 disabled:opacity-65"
                  >
                    {cargando ? "Actualizando..." : "Guardar PIN"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void volverAlInicio()}
                    disabled={cargando}
                    className="mt-3 w-full rounded-[1.2rem] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cerrar sesion
                  </button>
                </>
              )}

              {mensaje && (
                <p className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {mensaje}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef4fb] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <section
          className="relative flex items-center justify-center overflow-hidden px-4 py-8 sm:px-8 lg:min-h-screen lg:px-14 lg:py-12"
          style={{
            background:
              "linear-gradient(145deg, #111827 0%, #182436 38%, #5f1b25 72%, #9f1118 100%)",
          }}
        >
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/15 lg:block" />

          <div className="relative flex w-full max-w-[620px] justify-center">
            <Image
              src="/branding/conectamos-mascota.png"
              alt="CONECTAMOS"
              width={1024}
              height={1536}
              priority
              className="h-auto max-h-[340px] w-auto max-w-full rounded-[1.75rem] object-contain shadow-[0_34px_90px_rgba(0,0,0,0.34)] sm:max-h-[680px] lg:max-h-[760px]"
            />
          </div>
        </section>

        <section
          className="flex min-w-0 items-center justify-center px-4 py-10 sm:px-6 lg:min-h-screen lg:px-16"
          style={{
            background:
              "linear-gradient(180deg, #f8fbff 0%, #e7f0f8 100%)",
          }}
        >
          <div className="w-full min-w-0 max-w-[460px]">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(30,41,59,0.12)] sm:p-8">
              <p className="text-sm font-bold uppercase text-slate-500">
                Ingreso de sede
              </p>
              <h2 className="mt-4 text-3xl font-black text-slate-950 sm:text-4xl">
                Iniciar sesion
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base">
                Ingresa con el usuario principal. Si tu sede tiene perfiles, el
                sistema solicitara el PIN correspondiente.
              </p>

              <div className="mt-8 space-y-5">
                <label className="block text-sm font-bold text-slate-700">
                  Usuario
                  <input
                    type="text"
                    placeholder="Usuario de la sede"
                    value={usuario}
                    onChange={(event) => setUsuario(event.target.value)}
                    className="mt-2 box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base font-semibold text-slate-950 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block text-sm font-bold text-slate-700">
                  Clave
                  <input
                    type="password"
                    placeholder="Clave de acceso"
                    value={clave}
                    onChange={(event) => setClave(event.target.value)}
                    className="mt-2 box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base font-semibold text-slate-950 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-100"
                  />
                </label>
              </div>

              <button
                onClick={() => void login()}
                disabled={cargando}
                className="mt-8 w-full rounded-2xl bg-[#0b1020] px-6 py-4 text-base font-black text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)] transition hover:bg-[#123f45] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>

              {mensaje && (
                <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  {mensaje}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
