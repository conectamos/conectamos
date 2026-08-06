"use client";

import { useEffect, useState } from "react";
import type { VendorWelcomeMessage } from "@/lib/vendor-welcome-message";
import VendorMessageBody from "./vendor-message-body";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <section className="relative max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.3)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[#e30613]" />

        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar mensaje de bienvenida"
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
        >
          X
        </button>

        <div className="p-6 sm:p-8">
          <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#e30613]">
            {mensaje.eyebrow}
          </div>

          <h2 className="mt-5 pr-12 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {mensaje.title}
          </h2>

          <VendorMessageBody
            blocks={mensaje.bodyBlocks}
            className="mt-5"
            fontFamily={mensaje.fontFamily}
          />

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              onClick={cerrar}
              className="min-h-12 rounded-xl bg-slate-950 px-6 text-sm font-black uppercase tracking-[0.1em] text-white transition hover:bg-slate-800"
            >
              {mensaje.buttonLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
