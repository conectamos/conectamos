"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "conectamos:vendedor-bienvenida-cerrada";

export default function VendorWelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        return;
      }

      setVisible(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const cerrar = () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
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
            CONECTAMOS
          </div>

          <h2 className="mt-5 pr-12 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            &iexcl;Bienvenido/a al software de CONECTAMOS!
          </h2>

          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 sm:text-base">
            <p>
              En CONECTAMOS, creemos que la calidad del servicio comienza con
              una excelente actitud. Por eso, una de nuestras reglas principales
              es atender a cada cliente con respeto, amabilidad, disposici&oacute;n y
              compromiso.
            </p>
            <p>
              Este software ha sido dise&ntilde;ado para facilitar tu trabajo, mejorar
              la comunicaci&oacute;n y brindar una experiencia m&aacute;s &aacute;gil, clara y
              eficiente. Te invitamos a usarlo con responsabilidad, entusiasmo y
              siempre con la mejor actitud de servicio.
            </p>
            <p>
              Recuerda: cada interacci&oacute;n es una oportunidad para conectar,
              ayudar y dejar una impresi&oacute;n positiva.
            </p>
            <p className="font-black text-slate-950">
              &iexcl;Gracias por ser parte de CONECTAMOS!
            </p>
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              onClick={cerrar}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800"
            >
              Entendido
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
