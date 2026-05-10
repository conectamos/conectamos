"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type {
  VendorWelcomeBlock,
  VendorWelcomeFontFamily,
  VendorWelcomeMessage,
} from "@/lib/vendor-welcome-message";
import VendorMessageBody from "../../_components/vendor-message-body";

type Props = {
  mensajeInicial: VendorWelcomeMessage;
};

function inputClass() {
  return "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
}

function formatButtonClass(active: boolean) {
  return [
    "rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition",
    active
      ? "border-slate-950 bg-slate-950 text-white"
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
  ].join(" ");
}

function normalizeBlocks(blocks: VendorWelcomeBlock[]) {
  return blocks.length
    ? blocks
    : [{ align: "left" as const, size: "normal" as const, text: "" }];
}

export default function MensajeVendedorWorkspace({ mensajeInicial }: Props) {
  const textareaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [eyebrow, setEyebrow] = useState(mensajeInicial.eyebrow);
  const [title, setTitle] = useState(mensajeInicial.title);
  const [bodyBlocks, setBodyBlocks] = useState(
    normalizeBlocks(mensajeInicial.bodyBlocks)
  );
  const [fontFamily, setFontFamily] = useState<VendorWelcomeFontFamily>(
    mensajeInicial.fontFamily
  );
  const [buttonLabel, setButtonLabel] = useState(mensajeInicial.buttonLabel);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [guardando, setGuardando] = useState(false);

  const actualizarBloque = (
    index: number,
    changes: Partial<VendorWelcomeBlock>
  ) => {
    setBodyBlocks((current) =>
      current.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...changes } : block
      )
    );
  };

  const agregarParrafo = () => {
    setBodyBlocks((current) => [
      ...current,
      { align: "left", size: "normal", text: "" },
    ]);
  };

  const quitarParrafo = (index: number) => {
    setBodyBlocks((current) =>
      normalizeBlocks(current.filter((_, blockIndex) => blockIndex !== index))
    );
  };

  const aplicarNegrita = (index: number) => {
    const input = textareaRefs.current[index];
    const block = bodyBlocks[index];

    if (!block) {
      return;
    }

    const start = input?.selectionStart ?? block.text.length;
    const end = input?.selectionEnd ?? block.text.length;
    const selected = block.text.slice(start, end) || "texto en negrita";
    const updatedText = `${block.text.slice(0, start)}**${selected}**${block.text.slice(end)}`;

    actualizarBloque(index, { text: updatedText });

    window.setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(start + 2, start + 2 + selected.length);
    }, 0);
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/admin/mensaje-vendedor", {
        body: JSON.stringify({
          bodyBlocks,
          buttonLabel,
          eyebrow,
          fontFamily,
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
        setBodyBlocks(normalizeBlocks(actualizado.bodyBlocks));
        setFontFamily(actualizado.fontFamily);
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

  const previewBlocks = bodyBlocks
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text);

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

              <div className="grid gap-3">
                <div className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Fuente del mensaje
                  <select
                    value={fontFamily}
                    onChange={(event) =>
                      setFontFamily(event.target.value as VendorWelcomeFontFamily)
                    }
                    className={inputClass()}
                  >
                    <option value="system">Moderna</option>
                    <option value="serif">Elegante</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Mensaje</p>
                  <button
                    type="button"
                    onClick={agregarParrafo}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Agregar parrafo
                  </button>
                </div>

                <div className="grid gap-3">
                  {bodyBlocks.map((block, index) => (
                    <div
                      key={`bloque-${index}`}
                      className="rounded-3xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => aplicarNegrita(index)}
                          className={formatButtonClass(false)}
                        >
                          B
                        </button>
                        <button
                          type="button"
                          onClick={() => actualizarBloque(index, { align: "left" })}
                          className={formatButtonClass(block.align === "left")}
                        >
                          Izquierda
                        </button>
                        <button
                          type="button"
                          onClick={() => actualizarBloque(index, { align: "center" })}
                          className={formatButtonClass(block.align === "center")}
                        >
                          Centro
                        </button>
                        <button
                          type="button"
                          onClick={() => actualizarBloque(index, { align: "right" })}
                          className={formatButtonClass(block.align === "right")}
                        >
                          Derecha
                        </button>
                        <select
                          value={block.size}
                          onChange={(event) =>
                            actualizarBloque(index, {
                              size: event.target.value as VendorWelcomeBlock["size"],
                            })
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        >
                          <option value="normal">Normal</option>
                          <option value="large">Grande</option>
                        </select>
                        {bodyBlocks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => quitarParrafo(index)}
                            className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-100"
                          >
                            Quitar
                          </button>
                        )}
                      </div>

                      <textarea
                        ref={(element) => {
                          textareaRefs.current[index] = element;
                        }}
                        value={block.text}
                        onChange={(event) =>
                          actualizarBloque(index, { text: event.target.value })
                        }
                        className={`${inputClass()} min-h-32 resize-y leading-7`}
                        placeholder="Escribe este parrafo..."
                      />
                    </div>
                  ))}
                </div>
              </div>

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

                <VendorMessageBody
                  blocks={
                    previewBlocks.length
                      ? previewBlocks
                      : [{ align: "left", size: "normal", text: "Mensaje pendiente." }]
                  }
                  className="mt-5"
                  fontFamily={fontFamily}
                />

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
