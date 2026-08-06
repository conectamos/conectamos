"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type {
  VendorWelcomeBlock,
  VendorWelcomeFontFamily,
  VendorWelcomeMessage,
} from "@/lib/vendor-welcome-message";
import VendorMessageBody from "../../_components/vendor-message-body";

type Props = {
  mensajeInicial: VendorWelcomeMessage;
};

type EditableMessage = {
  bodyBlocks: VendorWelcomeBlock[];
  buttonLabel: string;
  eyebrow: string;
  fontFamily: VendorWelcomeFontFamily;
  title: string;
};

const MAX_BLOCKS = 8;
const MAX_BLOCK_LENGTH = 900;

function inputClass() {
  return "min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
}

function formatButtonClass(active: boolean) {
  return [
    "inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-slate-950 bg-slate-950 text-white"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
  ].join(" ");
}

function normalizeBlocks(blocks: VendorWelcomeBlock[]) {
  return blocks.length
    ? blocks
    : [{ align: "left" as const, size: "normal" as const, text: "" }];
}

function editableFromMessage(message: VendorWelcomeMessage): EditableMessage {
  return {
    bodyBlocks: normalizeBlocks(message.bodyBlocks),
    buttonLabel: message.buttonLabel,
    eyebrow: message.eyebrow,
    fontFamily: message.fontFamily,
    title: message.title,
  };
}

function snapshot(message: EditableMessage) {
  return JSON.stringify(message);
}

function formatUpdatedAt(version: string) {
  if (!version || version === "default") {
    return "Contenido predeterminado";
  }

  const date = new Date(version);

  if (Number.isNaN(date.getTime())) {
    return "Actualización registrada";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function MensajeVendedorWorkspace({ mensajeInicial }: Props) {
  const initialEditable = editableFromMessage(mensajeInicial);
  const textareaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [eyebrow, setEyebrow] = useState(initialEditable.eyebrow);
  const [title, setTitle] = useState(initialEditable.title);
  const [bodyBlocks, setBodyBlocks] = useState(initialEditable.bodyBlocks);
  const [fontFamily, setFontFamily] = useState<VendorWelcomeFontFamily>(
    initialEditable.fontFamily
  );
  const [buttonLabel, setButtonLabel] = useState(initialEditable.buttonLabel);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot(initialEditable));
  const [version, setVersion] = useState(mensajeInicial.version);
  const [updatedBy, setUpdatedBy] = useState(mensajeInicial.updatedBy || "Sistema");
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [guardando, setGuardando] = useState(false);

  const editableMessage: EditableMessage = {
    bodyBlocks,
    buttonLabel,
    eyebrow,
    fontFamily,
    title,
  };
  const hayCambios = snapshot(editableMessage) !== savedSnapshot;

  useEffect(() => {
    if (!hayCambios) {
      return;
    }

    const confirmarSalida = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", confirmarSalida);
    return () => window.removeEventListener("beforeunload", confirmarSalida);
  }, [hayCambios]);

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
    setBodyBlocks((current) => {
      if (current.length >= MAX_BLOCKS) {
        return current;
      }

      return [...current, { align: "left", size: "normal", text: "" }];
    });
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
    const updatedText = `${block.text.slice(0, start)}**${selected}**${block.text.slice(end)}`.slice(
      0,
      MAX_BLOCK_LENGTH
    );

    actualizarBloque(index, { text: updatedText });

    window.setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(start + 2, start + 2 + selected.length);
    }, 0);
  };

  const restaurarGuardado = () => {
    const guardado = JSON.parse(savedSnapshot) as EditableMessage;
    setEyebrow(guardado.eyebrow);
    setTitle(guardado.title);
    setBodyBlocks(normalizeBlocks(guardado.bodyBlocks));
    setFontFamily(guardado.fontFamily);
    setButtonLabel(guardado.buttonLabel);
    setMensaje("");
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/admin/mensaje-vendedor", {
        body: JSON.stringify(editableMessage),
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
        const nextEditable = editableFromMessage(actualizado);
        setEyebrow(nextEditable.eyebrow);
        setTitle(nextEditable.title);
        setBodyBlocks(nextEditable.bodyBlocks);
        setFontFamily(nextEditable.fontFamily);
        setButtonLabel(nextEditable.buttonLabel);
        setSavedSnapshot(snapshot(nextEditable));
        setVersion(actualizado.version);
        setUpdatedBy(actualizado.updatedBy || updatedBy);
      }

      setMensajeTipo("success");
      setMensaje("Mensaje publicado correctamente para los vendedores.");
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
    <>
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <article className="flex min-h-[112px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <DashboardIcon name="approvals" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              Estado
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">Publicado</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Visible al iniciar el panel comercial.
            </p>
          </div>
        </article>

        <article className="flex min-h-[112px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
            <DashboardIcon name="document" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              Contenido
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {bodyBlocks.length} de {MAX_BLOCKS} párrafos
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Formato y vista previa en tiempo real.
            </p>
          </div>
        </article>

        <article className="flex min-h-[112px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <DashboardIcon name="calendar" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              Última actualización
            </p>
            <p className="mt-1 text-sm font-black leading-5 text-slate-950">
              {formatUpdatedAt(version)}
            </p>
            <p className="mt-1 truncate text-xs leading-5 text-slate-500">
              Por {updatedBy}
            </p>
          </div>
        </article>
      </section>

      {mensaje && (
        <div
          role={mensajeTipo === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${
            mensajeTipo === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <DashboardIcon
            name={mensajeTipo === "success" ? "approvals" : "warning"}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>{mensaje}</span>
        </div>
      )}

      <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="settings" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.13em] text-[#e30613]">
                    Personalización
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Encabezado del mensaje
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Define cómo se presenta el aviso antes de su contenido.
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ${
                  hayCambios
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {hayCambios ? "Cambios sin guardar" : "Contenido guardado"}
              </span>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <label className="flex flex-col gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
                Etiqueta
                <input
                  value={eyebrow}
                  onChange={(event) => setEyebrow(event.target.value)}
                  className={inputClass()}
                  disabled={guardando}
                  maxLength={40}
                  placeholder="Ej. CONECTAMOS"
                />
                <span className="text-right text-[10px] font-semibold tracking-normal text-slate-400">
                  {eyebrow.length}/40
                </span>
              </label>

              <label className="flex flex-col gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
                Tipografía
                <select
                  value={fontFamily}
                  onChange={(event) =>
                    setFontFamily(event.target.value as VendorWelcomeFontFamily)
                  }
                  className={inputClass()}
                  disabled={guardando}
                >
                  <option value="system">Moderna</option>
                  <option value="serif">Elegante</option>
                </select>
                <span className="text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                  Se aplica únicamente al cuerpo del mensaje.
                </span>
              </label>

              <label className="flex flex-col gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600 sm:col-span-2">
                Título
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={inputClass()}
                  disabled={guardando}
                  maxLength={140}
                  placeholder="Título principal del aviso"
                />
                <span className="text-right text-[10px] font-semibold tracking-normal text-slate-400">
                  {title.length}/140
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <DashboardIcon name="document" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.13em] text-[#e30613]">
                    Contenido
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Párrafos del aviso
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Ordena el texto en hasta {MAX_BLOCKS} bloques independientes.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={agregarParrafo}
                disabled={guardando || bodyBlocks.length >= MAX_BLOCKS}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-4 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000c] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <span className="text-base leading-none">+</span>
                {bodyBlocks.length >= MAX_BLOCKS
                  ? "Límite alcanzado"
                  : "Agregar párrafo"}
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              {bodyBlocks.map((block, index) => (
                <article
                  key={`bloque-${index}`}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-[#fafbfc]"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-xs font-black text-white">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.09em] text-slate-700">
                          Párrafo {index + 1}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {block.text.length}/{MAX_BLOCK_LENGTH} caracteres
                        </p>
                      </div>
                    </div>

                    {bodyBlocks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarParrafo(index)}
                        disabled={guardando}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[#e30613] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Eliminar párrafo ${index + 1}`}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>

                  <div className="p-4">
                    <div
                      className="mb-3 flex flex-wrap items-center gap-2"
                      aria-label={`Formato del párrafo ${index + 1}`}
                    >
                      <button
                        type="button"
                        onClick={() => aplicarNegrita(index)}
                        disabled={guardando}
                        className={formatButtonClass(false)}
                        aria-label="Aplicar negrita al texto seleccionado"
                      >
                        <span className="text-sm font-black normal-case">B</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => actualizarBloque(index, { align: "left" })}
                        disabled={guardando}
                        className={formatButtonClass(block.align === "left")}
                        aria-pressed={block.align === "left"}
                      >
                        Izquierda
                      </button>
                      <button
                        type="button"
                        onClick={() => actualizarBloque(index, { align: "center" })}
                        disabled={guardando}
                        className={formatButtonClass(block.align === "center")}
                        aria-pressed={block.align === "center"}
                      >
                        Centro
                      </button>
                      <button
                        type="button"
                        onClick={() => actualizarBloque(index, { align: "right" })}
                        disabled={guardando}
                        className={formatButtonClass(block.align === "right")}
                        aria-pressed={block.align === "right"}
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
                        disabled={guardando}
                        className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black uppercase tracking-[0.08em] text-slate-600 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Tamaño del párrafo ${index + 1}`}
                      >
                        <option value="normal">Normal</option>
                        <option value="large">Grande</option>
                      </select>
                    </div>

                    <textarea
                      ref={(element) => {
                        textareaRefs.current[index] = element;
                      }}
                      value={block.text}
                      onChange={(event) =>
                        actualizarBloque(index, { text: event.target.value })
                      }
                      className={`${inputClass()} min-h-36 resize-y py-3 font-normal leading-7`}
                      disabled={guardando}
                      maxLength={MAX_BLOCK_LENGTH}
                      placeholder="Escribe este párrafo..."
                      aria-label={`Contenido del párrafo ${index + 1}`}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <label className="flex flex-col gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
              Texto del botón de confirmación
              <input
                value={buttonLabel}
                onChange={(event) => setButtonLabel(event.target.value)}
                className={inputClass()}
                disabled={guardando}
                maxLength={40}
                placeholder="Ej. ENTENDIDO"
              />
              <span className="text-right text-[10px] font-semibold tracking-normal text-slate-400">
                {buttonLabel.length}/40
              </span>
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/dashboard/seguridad"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Volver
                </Link>
                <button
                  type="button"
                  onClick={restaurarGuardado}
                  disabled={guardando || !hayCambios}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Descartar cambios
                </button>
              </div>

              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando || !hayCambios}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-xs font-black uppercase tracking-[0.06em] text-white shadow-sm transition hover:bg-[#c9000c] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <DashboardIcon name="send" className="h-[18px] w-[18px]" />
                {guardando ? "Guardando..." : "Guardar y publicar"}
              </button>
            </div>
          </section>
        </div>

        <aside className="min-w-0 self-start xl:sticky xl:top-7">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="user" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#e30613]">
                    Vista previa
                  </p>
                  <h2 className="mt-0.5 text-lg font-black text-slate-950">
                    Así lo verá el vendedor
                  </h2>
                </div>
              </div>
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-slate-500 sm:inline-flex">
                En tiempo real
              </span>
            </div>

            <div className="bg-[#f5f6f8] p-4 sm:p-5">
              <div className="mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.09)]">
                <div className="h-1 bg-[#e30613]" />
                <div className="max-h-[610px] overflow-y-auto p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#e30613]">
                      {eyebrow || "CONECTAMOS"}
                    </div>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e30613]" />
                  </div>

                  <h3 className="mt-5 break-words text-[26px] font-black leading-tight tracking-tight text-slate-950 sm:text-[30px]">
                    {title || "Título del mensaje"}
                  </h3>

                  <VendorMessageBody
                    blocks={
                      previewBlocks.length
                        ? previewBlocks
                        : [
                            {
                              align: "left",
                              size: "normal",
                              text: "El contenido del mensaje aparecerá aquí.",
                            },
                          ]
                    }
                    className="mt-5"
                    fontFamily={fontFamily}
                  />

                  <div className="mt-7 flex justify-end border-t border-slate-100 pt-5">
                    <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-[0.08em] text-white">
                      {buttonLabel || "Entendido"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 border-t border-slate-200 px-5 py-4 text-xs leading-5 text-slate-500">
              <DashboardIcon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                El contenido solo cambia para los vendedores después de usar
                <strong className="font-black text-slate-700"> Guardar y publicar</strong>.
              </p>
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
