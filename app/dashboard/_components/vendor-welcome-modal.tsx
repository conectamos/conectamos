"use client";

import { useEffect, useState } from "react";
import type { VendorWelcomeMessage } from "@/lib/vendor-welcome-message";

const STORAGE_PREFIX = "conectamos:vendedor-bienvenida-cerrada";

export default function VendorWelcomeModal({
  mensaje,
  sessionKey,
}: {
  mensaje: VendorWelcomeMessage;
  sessionKey: string;
}) {
  const [visible, setVisible] = useState(false);
  const storageKey = `${STORAGE_PREFIX}:${sessionKey}:${mensaje.version}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem(storageKey) === "1") {
        return;
      }

      setVisible(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const cerrar = () => {
    sessionStorage.setItem(storageKey, "1");
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm">
      <section className="relative w-full max-w-3xl overflow-hidden rounded-[34px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="absolute inset-x-0 top-0 h-2 bg-[linear-gradient(90deg,#0f172a_0%,#0f766e_55%,#f59e0b_100%)]" />

        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar mensaje de bienvenida"
          className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          X
        </button>

        <div className="p-6 sm:p-8">
          <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
            {mensaje.eyebrow}
          </div>

          <h2 className="mt-5 pr-12 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {mensaje.title}
          </h2>

          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 sm:text-base">
            {mensaje.body.map((paragraph, index) => (
              <p
                key={`${paragraph}-${index}`}
                className={index === mensaje.body.length - 1 ? "font-black text-slate-950" : ""}
              >
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              onClick={cerrar}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800"
            >
              {mensaje.buttonLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
