"use client";

import Link from "next/link";
import { useState } from "react";
import type { VendorWelcomeMessage } from "@/lib/vendor-welcome-message";

type Props = {
  mensajeInicial: VendorWelcomeMessage;
};

function inputClass() {
  return "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
}

function textareaBody(message: VendorWelcomeMessage) {
  return message.body.join("\n\n");
}

export default function MensajeVendedorWorkspace({ mensajeInicial }: Props) {
  const [eyebrow, setEyebrow] = useState(mensajeInicial.eyebrow);
  const [title, setTitle] = useState(mensajeInicial.title);
  const [body, setBody] = useState(textareaBody(mensajeInicial));
  const [buttonLabel, setButtonLabel] = useState(mensajeInicial.buttonLabel);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/admin/mensaje-vendedor", {
        body: JSON.stringify({
          body,
          buttonLabel,
          eyebrow,
          title,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo guardar el mensaje");
        return;
      }

      const actualizado = data.mensaje as VendorWelcomeMessage | undefined;

      if (actualizado) {
        setEyebrow(actualizado.eyebrow);
        setTitle(actualizado.title);
        setBody(textareaBody(actualizado));
        setButtonLabel(actualizado.buttonLabel);
      }

      setMensajeTipo("success");
      setMensaje("Mensaje de vendedores actualizado.");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error guardando el mensaje");
    } finally {
      setGuardando(false);
    }
  };

  const previewParagraphs = body
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Mensaje vendedores
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Bienvenida del vendedor
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                Actualiza el texto que aparece cuando un vendedor entra al
                dashboard.
              </p>
            </div>

            <Link
              href="/dashboard/seguridad"
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

        <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Edicion
            </div>

            <div className="mt-6 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Etiqueta
                <input
                  value={eyebrow}
                  onChange={(event) => setEyebrow(event.target.value)}
                  className={inputClass()}
                  maxLength={40}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Titulo
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={inputClass()}
                  maxLength={140}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Mensaje
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className={`${inputClass()} min-h-72 resize-y leading-7`}
                  placeholder="Escribe el mensaje. Separa los parrafos con una linea en blanco."
                />
                <span className="text-xs font-medium text-slate-500">
                  Separa los parrafos con una linea en blanco.
                </span>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Texto del boton
                <input
                  value={buttonLabel}
                  onChange={(event) => setButtonLabel(event.target.value)}
                  className={inputClass()}
                  maxLength={40}
                />
              </label>

              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando}
                className="rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando ? "Guardando..." : "Guardar mensaje"}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Vista previa
            </div>

            <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="h-2 bg-[linear-gradient(90deg,#0f172a_0%,#0f766e_55%,#f59e0b_100%)]" />
              <div className="p-6">
                <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
                  {eyebrow || "CONECTAMOS"}
                </div>

                <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
                  {title || "Titulo del mensaje"}
                </h2>

                <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                  {(previewParagraphs.length ? previewParagraphs : ["Mensaje pendiente."]).map(
                    (paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    )
                  )}
                </div>

                <div className="mt-7 flex justify-end">
                  <span className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white">
                    {buttonLabel || "Entendido"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
