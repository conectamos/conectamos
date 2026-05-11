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
  financieraDeuda: string | null;
  id: number;
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  tipoObservacion: ObservacionFraude;
  updatedAt: string;
};

type ObservacionFraude = "PRESTA_NOMBRE";

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

function observacionLabel(value: ObservacionFraude | string | null | undefined) {
  void value;
  return "PRESTA NOMBRE";
}

export default function ListaNegraWorkspace({
  puedeAdministrar,
  session,
}: {
  puedeAdministrar: boolean;
  session: SessionProps;
}) {
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [registros, setRegistros] = useState<ListaNegraItem[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editDocumentoNumero, setEditDocumentoNumero] = useState("");
  const [editMotivo, setEditMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

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

  const iniciarEdicion = (item: ListaNegraItem) => {
    setEditandoId(item.id);
    setEditDocumentoNumero(item.documentoNumero);
    setEditMotivo(item.motivo ?? "");
    setMensaje("");
  };

  const guardarEdicion = async (id: number) => {
    if (!puedeAdministrar) {
      return;
    }

    try {
      setActualizandoId(id);
      setMensaje("");

      const res = await fetch("/api/vendedor/lista-negra", {
        body: JSON.stringify({
          id,
          documentoNumero: editDocumentoNumero,
          motivo: editMotivo,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo actualizar el registro");
        return;
      }

      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro actualizado");
      setEditandoId(null);
      await cargarLista();
    } catch {
      setMensajeTipo("error");
      setMensaje("Error actualizando el registro");
    } finally {
      setActualizandoId(null);
    }
  };

  const eliminarRegistro = async (id: number) => {
    if (!puedeAdministrar) {
      return;
    }

    const confirmar = window.confirm(
      "Este registro se ocultara de la lista negra activa. El historial interno se conserva."
    );

    if (!confirmar) {
      return;
    }

    try {
      setEliminandoId(id);
      setMensaje("");

      const res = await fetch(`/api/vendedor/lista-negra?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo eliminar el registro");
        return;
      }

      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro eliminado de lista negra");
      setEditandoId((current) => (current === id ? null : current));
      await cargarLista();
    } catch {
      setMensajeTipo("error");
      setMensaje("Error eliminando el registro");
    } finally {
      setEliminandoId(null);
    }
  };

  const registrosFiltrados = useMemo(() => {
    const filtro = normalizeSearch(busqueda.trim());

    if (!filtro) {
      return registros;
    }

    return registros.filter((item) =>
      normalizeSearch(
        `${item.documentoNumero} ${observacionLabel(item.tipoObservacion)} ${item.motivo ?? ""} ${item.sedeNombre ?? ""} ${item.reportadoPorNombre ?? ""}`
      ).includes(filtro)
    );
  }, [busqueda, registros]);

  const rowGridClass = puedeAdministrar
    ? "min-w-[1080px] grid-cols-[150px_1fr_150px_150px_170px]"
    : "min-w-[840px] grid-cols-[150px_1fr_150px_150px]";

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
                {puedeAdministrar && (
                  <span className="rounded-full border border-emerald-200/30 bg-emerald-300/15 px-3 py-1 text-xs font-semibold text-emerald-50">
                    Admin: editar y eliminar
                  </span>
                )}
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
                Observacion: PRESTA NOMBRE
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
              <div
                className={`grid ${rowGridClass} bg-slate-950 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white`}
              >
                <span>Cedula</span>
                <span>Observacion</span>
                <span>Sede</span>
                <span>Fecha</span>
                {puedeAdministrar && <span>Acciones</span>}
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
                      className={puedeAdministrar ? "min-w-[1080px]" : "min-w-[840px]"}
                    >
                      <div className={`grid ${rowGridClass} gap-3 px-4 py-4 text-sm`}>
                        <span className="font-black text-red-700">
                          {item.documentoNumero}
                        </span>
                        <span className="min-w-0 font-semibold text-slate-700">
                          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-red-700">
                            {observacionLabel(item.tipoObservacion)}
                          </span>
                          {item.motivo && (
                            <span className="mt-2 block text-sm font-semibold text-slate-700">
                              {item.motivo}
                            </span>
                          )}
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
                        {puedeAdministrar && (
                          <span className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(item)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900 transition hover:bg-slate-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void eliminarRegistro(item.id)}
                              disabled={eliminandoId === item.id}
                              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {eliminandoId === item.id ? "Eliminando" : "Eliminar"}
                            </button>
                          </span>
                        )}
                      </div>

                      {editandoId === item.id && (
                        <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                          <div className="grid gap-3 md:grid-cols-[170px_1fr_auto] md:items-start">
                            <input
                              value={editDocumentoNumero}
                              onChange={(event) =>
                                setEditDocumentoNumero(
                                  onlyDigits(event.target.value)
                                )
                              }
                              className={inputClass()}
                              inputMode="numeric"
                              placeholder="Cedula"
                            />
                            <textarea
                              value={editMotivo}
                              onChange={(event) => setEditMotivo(event.target.value)}
                              className={`${inputClass()} min-h-20 resize-y leading-6`}
                              placeholder="Observacion..."
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void guardarEdicion(item.id)}
                                disabled={actualizandoId === item.id}
                                className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                {actualizandoId === item.id
                                  ? "Guardando"
                                  : "Guardar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditandoId(null)}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
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
