"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  usuario: {
    nombre: string;
    usuario: string;
  };
};

function inputClass() {
  return "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
}

export default function SeguridadAdminWorkspace({ usuario }: Props) {
  const [claveActual, setClaveActual] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [guardando, setGuardando] = useState(false);

  const cambiarClave = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/admin/cambiar-clave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claveActual,
          nuevaClave,
          confirmarClave,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo cambiar la clave");
        return;
      }

      setMensajeTipo("success");
      setMensaje(data.mensaje || "Clave actualizada");
      setClaveActual("");
      setNuevaClave("");
      setConfirmarClave("");

      window.setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error cambiando la clave");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#7f1d1d_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Seguridad
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Cambiar clave admin
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                Actualiza la clave principal de acceso y vuelve a iniciar sesion.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-slate-100"
            >
              Volver
            </Link>
          </div>
        </section>

        {mensaje && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 text-sm font-medium shadow-sm ${
              mensajeTipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Cuenta
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nombre
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {usuario.nombre}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Usuario
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {usuario.usuario}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Nueva clave
            </div>

            <div className="mt-6 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Clave actual
                <input
                  type="password"
                  value={claveActual}
                  onChange={(event) => setClaveActual(event.target.value)}
                  className={inputClass()}
                  autoComplete="current-password"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Nueva clave
                <input
                  type="password"
                  value={nuevaClave}
                  onChange={(event) => setNuevaClave(event.target.value)}
                  className={inputClass()}
                  autoComplete="new-password"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Confirmar nueva clave
                <input
                  type="password"
                  value={confirmarClave}
                  onChange={(event) => setConfirmarClave(event.target.value)}
                  className={inputClass()}
                  autoComplete="new-password"
                />
              </label>

              <button
                type="button"
                onClick={() => void cambiarClave()}
                disabled={guardando}
                className="rounded-2xl bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando ? "Guardando..." : "Cambiar clave"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
