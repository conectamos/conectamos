"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";

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

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
    {
      href: "/vendedor/registros/buscar",
      icon: "search",
      label: "Buscar registro",
    },
    {
      href: "/vendedor/lista-negra",
      icon: "warning",
      label: "Lista negra",
    },
    {
      href: "/vendedor/lista-precios",
      icon: "reports",
      label: "Lista de precios",
    },
    { href: "/dashboard/radar", icon: "inventory", label: "Radar" },
  ];
  const sedesAfectadas = new Set(
    registros.map((item) => item.sedeNombre).filter(Boolean)
  ).size;
  const iniciales = session.perfilNombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950 [&_button]:uppercase">
      <DashboardSidebar
        activeHref="/vendedor/lista-negra"
        coverageLabel={session.sedeNombre}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/dashboard" className="transition hover:text-[#e30613]">
                  Inicio
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Control comercial</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Lista negra
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Bloquea cédulas asociadas a fraude y consulta los reportes activos de todas las sedes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Sede: {session.sedeNombre}
                </span>
                {puedeAdministrar && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
                    Edición administrativa habilitada
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/vendedor/registros"
                className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-red-700"
              >
                Registrar venta
              </Link>
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {iniciales || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">
                    {session.perfilNombre}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {session.sedeNombre}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: "warning" as const,
                label: "Reportes activos",
                value: registros.length,
                detail: "Cédulas bloqueadas actualmente.",
                tone: "bg-red-50 text-red-600",
              },
              {
                icon: "store" as const,
                label: "Sedes con reportes",
                value: sedesAfectadas,
                detail: "Cobertura del historial visible.",
                tone: "bg-amber-50 text-amber-600",
              },
              {
                icon: "search" as const,
                label: "Resultados visibles",
                value: registrosFiltrados.length,
                detail: busqueda ? "Coincidencias del filtro actual." : "Sin filtros aplicados.",
                tone: "bg-slate-100 text-slate-700",
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
              >
                <div className="flex items-start gap-4">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                    <DashboardIcon name={metric.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">{metric.label}</p>
                    <p className="mt-1 text-3xl font-black tracking-tight">{metric.value}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{metric.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </section>

        {mensaje && (
          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold shadow-sm ${
              mensajeTipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6 xl:sticky xl:top-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <DashboardIcon name="warning" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                  Nuevo reporte
                </p>
                <h2 className="mt-1 text-xl font-black">Bloquear cédula</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              El documento quedará bloqueado para nuevos registros en cualquier sede.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-black text-slate-700">
                Cédula
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
                Observación
                <span className="w-fit rounded-md bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700">
                  Presta nombre
                </span>
                <textarea
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  className={`${inputClass()} min-h-36 resize-y leading-6`}
                  placeholder="Motivo o detalle del reporte..."
                />
              </label>

              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando}
                className="rounded-xl bg-[#e30613] px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardando ? "Guardando..." : "Guardar en lista negra"}
              </button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <DashboardIcon name="approvals" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                    Reportes activos
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Cédulas bloqueadas
                  </h2>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-4 sm:px-6">
              <label className="relative block">
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                  placeholder="Buscar cédula, sede, observación o asesor..."
                />
              </label>
            </div>

            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full min-w-[900px] table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    <th className="w-[150px] px-5 py-4">Cédula</th>
                    <th className="px-5 py-4">Observación</th>
                    <th className="w-[150px] px-5 py-4">Sede</th>
                    <th className="w-[180px] px-5 py-4">Fecha</th>
                    {puedeAdministrar && <th className="w-[170px] px-5 py-4">Acciones</th>}
                  </tr>
                </thead>

                {cargando ? (
                  <tbody>
                    <tr>
                      <td colSpan={puedeAdministrar ? 5 : 4} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                        Cargando lista negra...
                      </td>
                    </tr>
                  </tbody>
                ) : registrosFiltrados.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={puedeAdministrar ? 5 : 4} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                        No hay cédulas en lista negra para esta búsqueda.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  registrosFiltrados.map((item) => (
                    <tbody key={item.id} className="border-t border-slate-100 first:border-t-0">
                      <tr className="align-top transition hover:bg-slate-50/80">
                        <td className="px-5 py-5 font-black text-red-700">
                          {item.documentoNumero}
                        </td>
                        <td className="px-5 py-5">
                          <span className="inline-flex rounded-md bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700">
                            {observacionLabel(item.tipoObservacion)}
                          </span>
                          {item.motivo && (
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                              {item.motivo}
                            </p>
                          )}
                          {item.reportadoPorNombre && (
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              Reportado por {item.reportadoPorNombre}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-5 text-sm font-bold text-slate-700">
                          {item.sedeNombre || "Sin sede"}
                        </td>
                        <td className="px-5 py-5 text-xs font-semibold leading-5 text-slate-500">
                          {formatDate(item.updatedAt)}
                        </td>
                        {puedeAdministrar && (
                          <td className="px-5 py-5">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(item)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900 transition hover:bg-slate-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void eliminarRegistro(item.id)}
                                disabled={eliminandoId === item.id}
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {eliminandoId === item.id ? "Eliminando" : "Eliminar"}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {editandoId === item.id && (
                        <tr>
                          <td colSpan={puedeAdministrar ? 5 : 4} className="border-t border-slate-100 bg-slate-50 px-5 py-5">
                            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start">
                              <input
                                value={editDocumentoNumero}
                                onChange={(event) =>
                                  setEditDocumentoNumero(onlyDigits(event.target.value))
                                }
                                className={inputClass()}
                                inputMode="numeric"
                                placeholder="Cédula"
                              />
                              <textarea
                                value={editMotivo}
                                onChange={(event) => setEditMotivo(event.target.value)}
                                className={`${inputClass()} min-h-20 resize-y leading-6`}
                                placeholder="Observación..."
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void guardarEdicion(item.id)}
                                  disabled={actualizandoId === item.id}
                                  className="rounded-lg bg-slate-950 px-4 py-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {actualizandoId === item.id ? "Guardando" : "Guardar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditandoId(null)}
                                  className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))
                )}
              </table>
            </div>
          </div>
        </section>
        </main>
      </div>
    </div>
  );
}
