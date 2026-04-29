"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FinancialAccessGateProps = {
  actionPath?: string;
  badgeLabel?: string;
  claveAsignada: boolean;
  claveLabel?: string;
  missingMessage?: string;
  panelNombre?: string;
  sedeNombre: string;
  submitLabel?: string;
  tone?: "red" | "teal";
};

export default function FinancialAccessGate({
  actionPath = "/api/financiero/acceso",
  badgeLabel = "Financiero",
  claveAsignada,
  claveLabel = "Clave financiera",
  missingMessage,
  panelNombre = "panel financiero",
  sedeNombre,
  submitLabel = "Ingresar al panel financiero",
  tone = "red",
}: FinancialAccessGateProps) {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [validando, setValidando] = useState(false);
  const styles =
    tone === "teal"
      ? {
          badge: "border-teal-200 bg-teal-50 text-teal-700",
          input:
            "focus:border-teal-600 focus:ring-2 focus:ring-teal-200",
          button: "bg-teal-700 hover:bg-teal-800",
        }
      : {
          badge: "border-red-200 bg-red-50 text-red-700",
          input: "focus:border-red-500 focus:ring-2 focus:ring-red-200",
          button: "bg-red-600 hover:bg-red-700",
        };

  const cancelar = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/dashboard");
  };

  const ingresar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setValidando(true);
      setMensaje("");

      const res = await fetch(actionPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clave }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error validando la clave");
        return;
      }

      setClave("");
      router.refresh();
    } catch {
      setMensaje("Error validando la clave");
    } finally {
      setValidando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div
          className={[
            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
            styles.badge,
          ].join(" ")}
        >
          {badgeLabel}
        </div>

        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
          Clave de acceso
        </h1>

        <p className="mt-3 text-sm text-slate-600">
          {claveAsignada
            ? `Ingresa la clave asignada a ${sedeNombre} para continuar en el ${panelNombre}.`
            : missingMessage ||
              `El administrador debe asignar la clave de ${sedeNombre} para habilitar este panel.`}
        </p>

        {claveAsignada ? (
          <form className="mt-6 space-y-4" onSubmit={ingresar}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                {claveLabel}
              </label>
              <input
                type="password"
                value={clave}
                onChange={(event) => setClave(event.target.value)}
                className={[
                  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none",
                  styles.input,
                ].join(" ")}
                placeholder="Ingresa la clave"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={validando}
                className={[
                  "flex-1 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-70",
                  styles.button,
                ].join(" ")}
              >
                {validando ? "Validando..." : submitLabel}
              </button>

              <button
                type="button"
                onClick={cancelar}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                CANCELAR
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              onClick={cancelar}
              className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              CANCELAR
            </button>
          </div>
        )}

        {mensaje && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {mensaje}
          </div>
        )}
      </div>
    </div>
  );
}
