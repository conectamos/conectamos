"use client";

import Image from "next/image";
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

const avatarGradients = [
  "from-sky-100 via-white to-slate-200",
  "from-amber-100 via-white to-orange-200",
  "from-emerald-100 via-white to-teal-200",
  "from-rose-100 via-white to-pink-200",
];

function obtenerIniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

function obtenerDescripcionPerfil(tipo: PerfilAcceso["tipo"]) {
  if (tipo === "ADMINISTRADOR") {
    return "Acceso total";
  }

  if (tipo === "SUPERVISOR_TIENDA") {
    return "Supervisa esta sede";
  }

  return "Perfil operativo";
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
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/8 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                <Image
                  src="/branding/conectamos-logo.png"
                  alt="Logo CONECTAMOS"
                  width={52}
                  height={52}
                  className="h-12 w-12 object-contain"
                  priority
                />
              </div>

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
              {perfilesFiltrados.map((perfil, index) => {
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
                    <div
                      className={`flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/80 bg-gradient-to-br ${avatarGradients[index % avatarGradients.length]} shadow-[inset_0_10px_30px_rgba(255,255,255,0.65),0_12px_30px_rgba(148,163,184,0.2)]`}
                    >
                      <span className="text-3xl font-black tracking-[0.08em] text-slate-700">
                        {obtenerIniciales(perfil.nombre)}
                      </span>
                    </div>

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
              <Image
                src="/branding/conectamos-logo.png"
                alt="Logo CONECTAMOS"
                width={34}
                height={34}
                className="h-8 w-8 object-contain"
                priority
              />
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
