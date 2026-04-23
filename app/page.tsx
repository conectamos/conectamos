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
    setMensaje("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="mb-3 text-center text-4xl font-bold text-slate-800">
          Login CONECTAMOS
        </h1>

        {!pasoPerfil ? (
          <>
            <p className="mb-8 text-center text-sm text-slate-500">
              Accede con el usuario de la sede. Si la sede tiene perfiles activos,
              luego se pedira el PIN personal.
            </p>

            <input
              type="text"
              placeholder="Usuario"
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
              className="mb-4 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
            />

            <input
              type="password"
              placeholder="Clave"
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              className="mb-5 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
            />

            <button
              onClick={() => void login()}
              disabled={cargando}
              className="w-full rounded-2xl bg-red-600 py-4 text-2xl font-semibold text-white transition hover:bg-red-700 disabled:opacity-70"
            >
              {cargando ? "Ingresando..." : "Ingresar"}
            </button>
          </>
        ) : (
          <>
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Acceso por perfil
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {usuarioPendiente?.sedeNombre || `Sede ${usuarioPendiente?.sedeId || ""}`}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Usuario base: {usuarioPendiente?.usuario || "-"}
              </p>
            </div>

            <label className="mb-4 block text-sm font-semibold text-slate-700">
              Perfil
              <select
                value={perfilId}
                onChange={(event) => setPerfilId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-lg text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
              >
                <option value="">Seleccionar perfil</option>
                {perfiles.map((perfil) => (
                  <option key={perfil.id} value={String(perfil.id)}>
                    {perfil.nombre} - {perfil.tipoLabel}
                  </option>
                ))}
              </select>
            </label>

            <input
              type="password"
              inputMode="numeric"
              placeholder="PIN del perfil"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mb-5 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
            />

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => void confirmarPerfil()}
                disabled={cargando}
                className="flex-1 rounded-2xl bg-red-600 py-4 text-xl font-semibold text-white transition hover:bg-red-700 disabled:opacity-70"
              >
                {cargando ? "Validando..." : "Entrar al perfil"}
              </button>

              <button
                type="button"
                onClick={() => void volverAlInicio()}
                disabled={cargando}
                className="rounded-2xl border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
              >
                Cambiar sede
              </button>
            </div>
          </>
        )}

        {mensaje && (
          <p className="mt-6 text-center text-lg text-slate-700">{mensaje}</p>
        )}
      </div>
    </div>
  );
}
