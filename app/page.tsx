"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PerfilAcceso = {
  id: number;
  nombre: string;
  tipo: "ADMINISTRADOR" | "FACTURADOR" | "SUPERVISOR_TIENDA";
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

function obtenerDescripcionPerfil(tipo: PerfilAcceso["tipo"]) {
  if (tipo === "ADMINISTRADOR") {
    return "Acceso total";
  }

  if (tipo === "SUPERVISOR_TIENDA") {
    return "Supervisa esta sede";
  }

  return "Perfil operativo";
}

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
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/80 bg-[linear-gradient(180deg,#fefefe_0%,#e7f0ff_100%)] shadow-[inset_0_12px_30px_rgba(255,255,255,0.78),0_14px_30px_rgba(148,163,184,0.22)]">
        <svg
          viewBox="0 0 96 96"
          className="h-16 w-16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="39" cy="26" r="11" fill="#F7C8A0" />
          <path
            d="M24 55C24 46.7157 30.7157 40 39 40C47.2843 40 54 46.7157 54 55V63H24V55Z"
            fill="#1E293B"
          />
          <path
            d="M30 52L38.7 58.5L48 52"
            stroke="#E2E8F0"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="57" y="28" width="22" height="15" rx="5" fill="#DBEAFE" />
          <path
            d="M61 35H72"
            stroke="#2563EB"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="68" cy="59" r="11" fill="#D1FAE5" />
          <path
            d="M68 53V59L72 62"
            stroke="#0F766E"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M65 73H83"
            stroke="#94A3B8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (tipo === "FACTURADOR") {
    return (
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/80 bg-[linear-gradient(180deg,#fffdf7_0%,#eef7ff_100%)] shadow-[inset_0_12px_30px_rgba(255,255,255,0.78),0_14px_30px_rgba(148,163,184,0.22)]">
        <svg
          viewBox="0 0 96 96"
          className="h-16 w-16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="33" cy="25" r="10" fill="#F7C8A0" />
          <path
            d="M18 56C18 47.1634 25.1634 40 34 40C42.8366 40 50 47.1634 50 56V63H18V56Z"
            fill="#334155"
          />
          <path
            d="M25 51L34 57L43 51"
            stroke="#E2E8F0"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M54 18H74C76.7614 18 79 20.2386 79 23V58C79 60.7614 76.7614 63 74 63H54C51.2386 63 49 60.7614 49 58V23C49 20.2386 51.2386 18 54 18Z"
            fill="#E0F2FE"
          />
          <path
            d="M55 30H73"
            stroke="#0284C7"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M55 39H73"
            stroke="#0284C7"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M55 48H66"
            stroke="#0284C7"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M61 63V74"
            stroke="#94A3B8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M55 74H67"
            stroke="#94A3B8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/80 bg-[linear-gradient(180deg,#f7fbff_0%,#ebf4ff_100%)] shadow-[inset_0_12px_30px_rgba(255,255,255,0.78),0_14px_30px_rgba(148,163,184,0.22)]">
      <svg
        viewBox="0 0 96 96"
        className="h-16 w-16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="48" cy="25" r="10" fill="#F7C8A0" />
        <path
          d="M31 56C31 46.6112 38.6112 39 48 39C57.3888 39 65 46.6112 65 56V64H31V56Z"
          fill="#0F172A"
        />
        <path
          d="M39 51L48 57L57 51"
          stroke="#E2E8F0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M48 13L52 18H58L53.5 22L55 28L48 24L41 28L42.5 22L38 18H44L48 13Z"
          fill="#FBBF24"
        />
        <path
          d="M26 73H70"
          stroke="#94A3B8"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [pin, setPin] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [perfiles, setPerfiles] = useState<PerfilAcceso[]>([]);
  const [usuarioPendiente, setUsuarioPendiente] = useState<UsuarioPendiente | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [pasoPerfil, setPasoPerfil] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    void (async () => {
      try {
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
      } catch {}
    })();
  }, []);

  const perfilesFiltrados = perfiles.filter((perfil) => {
    const texto = `${perfil.nombre} ${perfil.tipoLabel} ${perfil.tipo}`.toLowerCase();
    return texto.includes(busqueda.trim().toLowerCase());
  });

  const perfilSeleccionado =
    perfiles.find((perfil) => String(perfil.id) === perfilId) ?? null;

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
        setPin("");
        setPerfilId("");
        setBusqueda("");
        setMensaje("Selecciona tu perfil y valida el PIN para entrar.");
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
    setPin("");
    setBusqueda("");
    setMensaje("");
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
                    {usuarioPendiente?.sedeNombre || `SEDE ${usuarioPendiente?.sedeId || ""}`}
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
          <section className="rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,248,254,0.96)_100%)] p-6 shadow-[0_24px_70px_rgba(71,85,105,0.15)] sm:p-8">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.38em] text-slate-500">
              Perfil del asesor
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-5xl">
              Selecciona el perfil de esta sede
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600 sm:text-base">
              Primero entra la sede con usuario y clave. Luego cada vendedor o
              supervisor abre su perfil con PIN propio para que el sistema sepa
              quien gestiona la operacion de esta sede.
            </p>

            <div className="mt-7 max-w-2xl">
              <label className="block text-sm font-semibold text-slate-500">
                Nombre del asesor
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar asesor o supervisor..."
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,2.15fr)_minmax(320px,1fr)]">
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {perfilesFiltrados.map((perfil) => {
                const seleccionado = String(perfil.id) === perfilId;

                return (
                  <button
                    key={perfil.id}
                    type="button"
                    onClick={() => {
                      setPerfilId(String(perfil.id));
                      setMensaje("");
                    }}
                    className={`group rounded-[2rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,244,252,0.9)_100%)] p-6 text-left shadow-[0_22px_55px_rgba(71,85,105,0.12)] transition hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(51,65,85,0.18)] ${
                      seleccionado
                        ? "border-slate-900 ring-4 ring-slate-200"
                        : "border-white/75"
                    }`}
                  >
                    <ProfileAvatar tipo={perfil.tipo} />

                    <div className="mt-6">
                      <h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">
                        {perfil.nombre}
                      </h2>
                      <p className="mt-2 text-base font-semibold text-slate-600">
                        {perfil.tipoLabel}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {obtenerDescripcionPerfil(perfil.tipo)}
                      </p>
                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        Perfil activo
                      </p>
                      {perfil.debeCambiarPin && (
                        <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Debe cambiar PIN
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}

              {perfilesFiltrados.length === 0 && (
                <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-sm text-slate-600 shadow-[0_20px_55px_rgba(71,85,105,0.08)]">
                  No encontramos perfiles con ese texto. Prueba con otro nombre o
                  cambia la busqueda.
                </div>
              )}
            </div>

            <aside className="rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,245,253,0.94)_100%)] p-6 shadow-[0_22px_60px_rgba(71,85,105,0.14)] sm:p-7">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.32em] text-slate-500">
                Acceso con PIN
              </p>

              {perfilSeleccionado ? (
                <>
                  <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-white/85 p-5">
                    <p className="text-sm text-slate-500">Perfil seleccionado</p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">
                      {perfilSeleccionado.nombre}
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      {perfilSeleccionado.tipoLabel}
                    </p>
                    <p className="mt-4 text-sm leading-6 text-slate-500">
                      Ingresa el PIN personal de este perfil para abrir la sesion
                      dentro de la sede.
                    </p>
                  </div>

                  <label className="mt-6 block text-sm font-semibold text-slate-600">
                    PIN del perfil
                    <input
                      type="password"
                      inputMode="numeric"
                      value={pin}
                      onChange={(event) =>
                        setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="4 a 6 digitos"
                      className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xl text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void confirmarPerfil()}
                    disabled={cargando}
                    className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#111827_45%,#1e293b_100%)] px-6 py-4 text-base font-bold text-white shadow-[0_18px_40px_rgba(15,23,42,0.28)] transition hover:brightness-110 disabled:opacity-65"
                  >
                    {cargando ? "Validando perfil..." : "Entrar con este perfil"}
                  </button>
                </>
              ) : (
                <div className="mt-5 rounded-[1.6rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm leading-6 text-slate-600">
                  Selecciona una tarjeta para habilitar el ingreso con PIN del
                  supervisor o vendedor.
                </div>
              )}

              <button
                type="button"
                onClick={() => void volverAlInicio()}
                disabled={cargando}
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-65"
              >
                Cambiar sede
              </button>

              {mensaje && (
                <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {mensaje}
                </p>
              )}
            </aside>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f6f8fb_0%,#e8edf4_42%,#dde5f0_100%)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2.5rem] border border-white/70 bg-[linear-gradient(145deg,rgba(18,23,37,0.98)_0%,rgba(22,35,54,0.92)_45%,rgba(16,71,77,0.88)_100%)] p-8 text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] sm:p-10">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/8 px-4 py-2">
              <BrandMark compact />
              <span className="text-sm font-semibold tracking-[0.16em] text-white/92">
                CONECTAMOS
              </span>
            </div>

            <h1 className="mt-8 max-w-xl text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              Control de acceso por sede y perfil operativo
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/78">
              Primero entra la sede con usuario y clave. Si esta sede tiene
              supervisores o vendedores activos, el sistema pedira un segundo paso
              con perfil y PIN personal.
            </p>
          </section>

          <section className="rounded-[2.3rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(242,246,252,0.94)_100%)] p-8 shadow-[0_24px_70px_rgba(71,85,105,0.15)] sm:p-10">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.32em] text-slate-500">
              Ingreso de sede
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] text-slate-950">
              Accede con tu usuario principal
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Este acceso habilita la sede. Si hay perfiles activos, luego se
              solicitara el PIN del supervisor o vendedor.
            </p>

            <div className="mt-8 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                Usuario
                <input
                  type="text"
                  placeholder="Usuario de la sede"
                  value={usuario}
                  onChange={(event) => setUsuario(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-lg text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-600">
                Clave
                <input
                  type="password"
                  placeholder="Clave de acceso"
                  value={clave}
                  onChange={(event) => setClave(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-lg text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                />
              </label>
            </div>

            <button
              onClick={() => void login()}
              disabled={cargando}
              className="mt-8 w-full rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#111827_45%,#1e293b_100%)] px-6 py-4 text-lg font-bold text-white shadow-[0_18px_40px_rgba(15,23,42,0.26)] transition hover:brightness-110 disabled:opacity-65"
            >
              {cargando ? "Ingresando..." : "Ingresar"}
            </button>

            {mensaje && (
              <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {mensaje}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
