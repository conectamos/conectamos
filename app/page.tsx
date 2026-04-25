"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PerfilAcceso = {
  id: number;
  nombre: string;
  tipo: "ADMINISTRADOR" | "FACTURADOR" | "SUPERVISOR_TIENDA" | "VENDEDOR";
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

function ProfileAvatar({ tipo }: { tipo: PerfilAcceso["tipo"] }) {
  if (tipo === "SUPERVISOR_TIENDA") {
    return (
      <div className="relative flex h-48 w-full items-end justify-center overflow-hidden rounded-[2.8rem] border border-white/75 bg-[linear-gradient(180deg,#f9fcff_0%,#ebf3ff_54%,#f5f9ff_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_20px_48px_rgba(148,163,184,0.18)] transition-transform duration-500 group-hover:scale-[1.02]">
        <div className="absolute -left-6 top-5 h-28 w-28 rounded-full bg-sky-100/80 blur-2xl" />
        <div className="absolute right-3 top-6 h-20 w-20 rounded-full bg-emerald-100/70 blur-2xl" />
        <svg
          viewBox="0 0 180 150"
          className="relative h-full w-full px-4 pb-3 pt-2"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <ellipse cx="92" cy="134" rx="52" ry="10" fill="#D8E5F5" />
          <rect x="112" y="24" width="44" height="54" rx="14" fill="#E0ECFF" />
          <rect x="122" y="37" width="24" height="5" rx="2.5" fill="#2563EB" />
          <rect x="122" y="48" width="18" height="5" rx="2.5" fill="#93C5FD" />
          <rect x="122" y="59" width="28" height="5" rx="2.5" fill="#93C5FD" />
          <circle cx="68" cy="50" r="16" fill="#F4C59A" />
          <path
            d="M46 118C46 94.804 56.2975 76 69 76C81.7025 76 92 94.804 92 118H46Z"
            fill="#172554"
          />
          <path
            d="M55 94L68.5 103L83 94"
            stroke="#E2E8F0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M91 86L106 72"
            stroke="#94A3B8"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="116" cy="71" r="12" fill="#D1FAE5" />
          <path
            d="M116 64V71L121 75"
            stroke="#0F766E"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M50 42C55 34 63 30 73 30C82 30 88 33 92 39"
            stroke="#334155"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (tipo === "FACTURADOR") {
    return (
      <div className="relative flex h-48 w-full items-end justify-center overflow-hidden rounded-[2.8rem] border border-white/75 bg-[linear-gradient(180deg,#fffdf8_0%,#eef5ff_58%,#f7fbff_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_20px_48px_rgba(148,163,184,0.18)] transition-transform duration-500 group-hover:scale-[1.02]">
        <div className="absolute left-2 top-6 h-24 w-24 rounded-full bg-amber-100/75 blur-2xl" />
        <div className="absolute right-4 top-8 h-24 w-24 rounded-full bg-sky-100/70 blur-2xl" />
        <svg
          viewBox="0 0 180 150"
          className="relative h-full w-full px-4 pb-3 pt-2"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <ellipse cx="92" cy="135" rx="58" ry="10" fill="#E2E8F0" />
          <rect x="44" y="100" width="92" height="18" rx="9" fill="#CBD5E1" />
          <rect x="53" y="72" width="78" height="30" rx="14" fill="#E5EEF9" />
          <circle cx="82" cy="48" r="15" fill="#F4C59A" />
          <path
            d="M61 112V86C61 71.0883 70.1782 59 82 59C93.8218 59 103 71.0883 103 86V112H61Z"
            fill="#334155"
          />
          <path
            d="M71 79L81.5 87L93 79"
            stroke="#E2E8F0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="101" y="57" width="30" height="22" rx="6" fill="#DBEAFE" />
          <path d="M107 66H124" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
          <path d="M107 73H119" stroke="#93C5FD" strokeWidth="4" strokeLinecap="round" />
          <rect x="118" y="40" width="26" height="38" rx="8" fill="#F8FAFC" />
          <path d="M124 50H138" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
          <path d="M124 58H138" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
          <path d="M124 66H134" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (tipo === "VENDEDOR") {
    return (
      <div className="relative flex h-48 w-full items-end justify-center overflow-hidden rounded-[2.8rem] border border-white/75 bg-[linear-gradient(180deg,#fbfffd_0%,#ecfaf3_56%,#f8fcfb_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_20px_48px_rgba(148,163,184,0.18)] transition-transform duration-500 group-hover:scale-[1.02]">
        <div className="absolute left-2 top-6 h-20 w-20 rounded-full bg-emerald-100/80 blur-2xl" />
        <div className="absolute right-4 top-7 h-24 w-24 rounded-full bg-cyan-100/65 blur-2xl" />
        <svg
          viewBox="0 0 180 150"
          className="relative h-full w-full px-4 pb-3 pt-2"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <ellipse cx="92" cy="135" rx="60" ry="10" fill="#DAF0E7" />
          <circle cx="60" cy="50" r="14" fill="#F4C59A" />
          <circle cx="119" cy="54" r="13" fill="#F4C59A" />
          <path
            d="M41 113C41 92.5655 49.2827 76 60 76C70.7173 76 79 92.5655 79 113H41Z"
            fill="#1F2937"
          />
          <path
            d="M102 115C102 96.3269 109.163 81 119 81C128.837 81 136 96.3269 136 115H102Z"
            fill="#0F766E"
          />
          <path
            d="M49 95L59.5 103L70 95"
            stroke="#E2E8F0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M111 98L119 104L128 98"
            stroke="#ECFEFF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="74" y="56" width="31" height="45" rx="9" fill="#DBEAFE" />
          <path d="M82 70H97" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
          <path d="M82 79H97" stroke="#60A5FA" strokeWidth="4" strokeLinecap="round" />
          <circle cx="94" cy="93" r="3" fill="#2563EB" />
          <circle cx="75" cy="100" r="6" fill="#F4C59A" />
          <circle cx="105" cy="104" r="6" fill="#F4C59A" />
          <path
            d="M80 103L89 98"
            stroke="#F4C59A"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M100 104L92 99"
            stroke="#F4C59A"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative flex h-48 w-full items-end justify-center overflow-hidden rounded-[2.8rem] border border-[#f6e7b8] bg-[linear-gradient(180deg,#fff9e7_0%,#fff2c9_50%,#fff8e6_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_22px_52px_rgba(180,138,40,0.18)] transition-transform duration-500 group-hover:scale-[1.02]">
      <div className="absolute left-0 top-4 h-24 w-24 rounded-full bg-yellow-200/75 blur-2xl" />
      <div className="absolute right-6 top-5 h-20 w-20 rounded-full bg-amber-100/80 blur-2xl" />
      <svg
        viewBox="0 0 180 150"
        className="relative h-full w-full px-4 pb-3 pt-2"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <ellipse cx="92" cy="135" rx="58" ry="10" fill="#F4E1A5" />
        <circle cx="91" cy="34" r="22" fill="#FDE68A" opacity="0.75" />
        <circle cx="90" cy="50" r="15" fill="#F4C59A" />
        <path
          d="M61 117C61 93.2518 74.4315 74 91 74C107.569 74 121 93.2518 121 117H61Z"
          fill="#0F172A"
        />
        <path
          d="M74 95L90.5 106L107 95"
          stroke="#E2E8F0"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M90 16L95 24H104L97 30L100 39L90 33L80 39L83 30L76 24H85L90 16Z"
          fill="#D4A414"
        />
        <path d="M60 44H74" stroke="#D4A414" strokeWidth="4" strokeLinecap="round" />
        <path d="M107 44H121" stroke="#D4A414" strokeWidth="4" strokeLinecap="round" />
      </svg>
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

  const perfilSeleccionado =
    perfiles.find((perfil) => String(perfil.id) === perfilId) ?? null;
  const nombreSedeActual =
    usuarioPendiente?.sedeNombre || `SEDE ${usuarioPendiente?.sedeId || ""}`;

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
    if (!perfilSeleccionado || modalModo !== "pin") {
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
  }, [perfilSeleccionado, cargando, modalModo]);

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
                "grid gap-6",
                perfilesFiltrados.length === 1
                  ? "mx-auto max-w-[22rem]"
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
                    className={`group relative overflow-hidden rounded-[2.4rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(243,247,253,0.93)_100%)] p-5 text-left shadow-[0_24px_60px_rgba(71,85,105,0.12)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_34px_80px_rgba(51,65,85,0.18)] ${
                      seleccionado
                        ? "border-slate-900 ring-4 ring-slate-200"
                        : "border-white/75"
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_70%)]" />
                    <ProfileAvatar tipo={perfil.tipo} />

                    <div className="mt-5">
                      <div className="inline-flex rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.28em] text-slate-500">
                        {perfil.tipoLabel}
                      </div>
                      <h2 className="mt-4 text-[1.85rem] font-black tracking-[-0.04em] text-slate-950">
                        {perfil.nombre}
                      </h2>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-500">
                          Abrir con PIN
                        </span>
                        {perfil.debeCambiarPin ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            Cambiar PIN
                          </span>
                        ) : (
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition group-hover:border-slate-300 group-hover:text-slate-700">
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

        {perfilSeleccionado && modalModo && (
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
                {perfilSeleccionado.nombre} · {perfilSeleccionado.tipoLabel}
              </p>
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
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef3fa_0%,#e7edf7_48%,#dde5f1_100%)] px-4 py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_70%)]" />
      <div className="pointer-events-none absolute -left-12 top-14 h-64 w-64 rounded-full bg-cyan-200/28 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-200/22 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="relative overflow-hidden rounded-[2.5rem] border border-white/50 bg-[linear-gradient(145deg,#162235_0%,#1b2a41_52%,#18444f_100%)] p-8 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] sm:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(125,211,252,0.14),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(52,211,153,0.12),transparent_40%)]" />

            <div className="relative">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/8 px-4 py-2.5 backdrop-blur-sm">
                <BrandMark compact />
                <div>
                  <p className="text-sm font-bold tracking-[0.2em] text-white/95">
                    CONECTAMOS
                  </p>
                  <p className="text-xs text-white/58">Acceso por sede</p>
                </div>
              </div>

              <div className="mt-12 max-w-xl">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-cyan-100/72">
                  Ingreso principal
                </p>
                <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-[-0.055em] text-white sm:text-6xl">
                  Acceso de sede
                </h1>
                <p className="mt-6 text-base leading-8 text-slate-200/80 sm:text-lg">
                  Usa el usuario principal de la sede. Si existen perfiles
                  activos, luego se solicitara el PIN del perfil asignado.
                </p>
              </div>

              <div className="mt-12 space-y-3">
                <div className="flex items-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-200" />
                  <span className="text-sm font-medium text-white/90">
                    Usuario principal de la sede
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-200" />
                  <span className="text-sm font-medium text-white/90">
                    Perfil asignado para operar
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="text-sm font-medium text-white/90">
                    PIN individual cuando aplique
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[2.35rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(246,250,255,0.95)_100%)] p-8 shadow-[0_28px_70px_rgba(71,85,105,0.16)] sm:p-9">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.12),transparent_72%)]" />

            <div className="relative">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.32em] text-slate-500">
                Ingreso de sede
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] text-slate-950">
                Ingresar
              </h2>

              <div className="mt-8 space-y-4">
                <label className="block text-sm font-semibold text-slate-600">
                  Usuario
                  <div className="relative mt-3">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M4 21C4 17.6863 7.58172 15 12 15C16.4183 15 20 17.6863 20 21"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Usuario de la sede"
                      value={usuario}
                      onChange={(event) => setUsuario(event.target.value)}
                      className="w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] py-4 pl-12 pr-5 text-lg text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-cyan-100/70"
                    />
                  </div>
                </label>

                <label className="block text-sm font-semibold text-slate-600">
                  Clave
                  <div className="relative mt-3">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect
                          x="5"
                          y="11"
                          width="14"
                          height="10"
                          rx="2.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M8 11V8.5C8 6.01472 10.0147 4 12.5 4C14.9853 4 17 6.01472 17 8.5V11"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <input
                      type="password"
                      placeholder="Clave de acceso"
                      value={clave}
                      onChange={(event) => setClave(event.target.value)}
                      className="w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] py-4 pl-12 pr-5 text-lg text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-cyan-100/70"
                    />
                  </div>
                </label>
              </div>

              <button
                onClick={() => void login()}
                disabled={cargando}
                className="mt-8 w-full rounded-[1.45rem] bg-[linear-gradient(135deg,#0f172a_0%,#16213a_46%,#143f4b_100%)] px-6 py-4 text-lg font-bold text-white shadow-[0_20px_42px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-65"
              >
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>

              {mensaje && (
                <p className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  {mensaje}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
