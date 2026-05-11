"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SessionProps = {
  perfilNombre: string;
  sedeNombre: string;
};

type ListaNegraItem = {
  createdAt: string;
  documentoNumero: string;
  id: number;
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  updatedAt: string;
};

function onlyDigits(value: string, maxLength = 15) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inputClass() {
  return "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100";
}

export default function ListaNegraWorkspace({ session }: { session: SessionProps }) {
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [registros, setRegistros] = useState<ListaNegraItem[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargarLista = async () => {
    try {
      setCargando(true);
      const res = await fetch("/api/vendedor/lista-negra", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo cargar lista negra");
        return;
      }

      setRegistros(Array.isArray(data.registros) ? data.registros : []);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error cargando lista negra");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarLista();
  }, []);

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/vendedor/lista-negra", {
        body: JSON.stringify({
          documentoNumero,
          motivo,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo guardar la cedula");
        return;
      }

      setMensajeTipo("success");
      setMensaje(data.mensaje || "Cedula agregada a lista negra");
      setDocumentoNumero("");
      setMotivo("");
      await cargarLista();
    } catch {
      setMensajeTipo("error");
      setMensaje("Error guardando la cedula");
    } finally {
      setGuardando(false);
    }
  };

  const registrosFiltrados = useMemo(() => {
    const filtro = normalizeSearch(busqueda.trim());

    if (!filtro) {
      return registros;
    }

    return registros.filter((item) =>
      normalizeSearch(
        `${item.documentoNumero} ${item.motivo ?? ""} ${item.sedeNombre ?? ""} ${item.reportadoPorNombre ?? ""}`
      ).includes(filtro)
    );
  }, [busqueda, registros]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#3f1d28_52%,#b91c1c_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Control comercial
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                LISTA NEGRA
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-100 md:text-base">
                Reporta cedulas asociadas a fraude para bloquear nuevos
                registros en cualquier sede.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                  Sede: {session.sedeNombre}
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                  Reporta: {session.perfilNombre}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/vendedor/registros"
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-slate-100"
              >
                Registrar venta
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {mensaje && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 text-sm font-black shadow-sm ${
              mensajeTipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[30px] border border-red-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-red-700">
              Reporte de fraude
            </div>

            <div className="mt-6 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-black text-slate-700">
                Cedula
                <input
                  value={documentoNumero}
                  onChange={(event) =>
                    setDocumentoNumero(onlyDigits(event.target.value))
                  }
                  className={inputClass()}
                  inputMode="numeric"
                  placeholder="Numero de cedula"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-black text-slate-700">
                Observacion
                <textarea
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  className={`${inputClass()} min-h-32 resize-y leading-6`}
                  placeholder="Motivo o detalle del reporte..."
                />
              </label>

              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando}
                className="rounded-2xl bg-red-700 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando ? "Guardando..." : "Guardar en lista negra"}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Reportes activos
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                  Cedulas bloqueadas
                </h2>
              </div>

              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 md:max-w-xs"
                placeholder="Buscar cedula, sede o asesor..."
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
              <div className="grid min-w-[780px] grid-cols-[150px_1fr_150px_150px] bg-slate-950 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                <span>Cedula</span>
                <span>Observacion</span>
                <span>Sede</span>
                <span>Fecha</span>
              </div>

              {cargando ? (
                <div className="px-4 py-8 text-sm font-semibold text-slate-500">
                  Cargando lista negra...
                </div>
              ) : registrosFiltrados.length === 0 ? (
                <div className="px-4 py-8 text-sm font-semibold text-slate-500">
                  No hay cedulas en lista negra para esta busqueda.
                </div>
              ) : (
                <div className="max-h-[560px] divide-y divide-slate-100 overflow-auto">
                  {registrosFiltrados.map((item) => (
                    <div
                      key={item.id}
                      className="grid min-w-[780px] grid-cols-[150px_1fr_150px_150px] gap-3 px-4 py-4 text-sm"
                    >
                      <span className="font-black text-red-700">
                        {item.documentoNumero}
                      </span>
                      <span className="min-w-0 font-semibold text-slate-700">
                        {item.motivo || "Sin observacion"}
                        {item.reportadoPorNombre && (
                          <span className="mt-1 block text-xs font-bold text-slate-400">
                            Reportado por {item.reportadoPorNombre}
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-slate-700">
                        {item.sedeNombre || "Sin sede"}
                      </span>
                      <span className="text-xs font-semibold leading-5 text-slate-500">
                        {formatDate(item.updatedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
