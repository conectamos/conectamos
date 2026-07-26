"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type EstadoRevision = "COINCIDE" | "INCONSISTENTE" | "REVISAR" | "SIN_VERIFICAR";

type ResultadoRevision = {
  registroId: number;
  createdAt: string;
  clienteNombre: string;
  documentoNumero: string;
  serialImei: string | null;
  puntoVenta: string | null;
  asesorNombre: string | null;
  proveedor: string;
  identificadorTipo: "CEDULA" | "IMEI";
  plataformaCredito: string;
  creditoRegistrado: number | null;
  creditoPlataforma: number | null;
  fechaCreditoPlataforma: string | null;
  ordenId: string | null;
  estado: EstadoRevision;
  razones: string[];
};

type ReporteRevision = {
  fecha: string;
  limitado: boolean;
  maxRegistros: number;
  resumen: {
    registrosAnalizados: number;
    creditosAnalizados: number;
    coincidencias: number;
    inconsistencias: number;
    revisar: number;
    sinVerificar: number;
  };
  resultados: ResultadoRevision[];
};

type FiltroEstado = "REVISION" | "TODOS" | EstadoRevision;

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Sin dato";
  }

  return `$ ${value.toLocaleString("es-CO")}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function etiquetaEstado(estado: EstadoRevision) {
  if (estado === "INCONSISTENTE") return "Inconsistente";
  if (estado === "REVISAR") return "Revisar";
  if (estado === "SIN_VERIFICAR") return "Sin verificar";
  return "Coincide";
}

function claseEstado(estado: EstadoRevision) {
  if (estado === "INCONSISTENTE") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (estado === "REVISAR") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (estado === "SIN_VERIFICAR") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function InconsistenciasCreditosWorkspace({
  fechaAyer,
  fechaHoy,
  session,
}: {
  fechaAyer: string;
  fechaHoy: string;
  session: SessionProps;
}) {
  const [fecha, setFecha] = useState(fechaHoy);
  const [reporte, setReporte] = useState<ReporteRevision | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("REVISION");

  const esAdministrador = ["ADMIN", "AUDITOR"].includes(
    String(session.rolNombre || "").trim().toUpperCase()
  );
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Prestamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    {
      href: "/dashboard/aprobaciones",
      icon: "approvals",
      label: "Aprobaciones",
    },
    {
      href: esAdministrador ? "/dashboard/reportes" : "/dashboard/analitico",
      icon: "reports",
      label: "Reportes",
    },
  ];

  if (esAdministrador) {
    navigationItems.push({
      href: "/dashboard/sedes",
      icon: "settings",
      label: "Configuracion",
    });
  }

  const resultadosVisibles = useMemo(() => {
    if (!reporte) {
      return [];
    }

    if (filtro === "TODOS") {
      return reporte.resultados;
    }

    if (filtro === "REVISION") {
      return reporte.resultados.filter((item) => item.estado !== "COINCIDE");
    }

    return reporte.resultados.filter((item) => item.estado === filtro);
  }, [filtro, reporte]);

  const analizar = async () => {
    try {
      setCargando(true);
      setError("");
      setReporte(null);

      const params = new URLSearchParams({ fecha });
      const response = await fetch(
        `/api/vendedor/registros/inconsistencias?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No se pudo completar la revision.");
        return;
      }

      setReporte(data as ReporteRevision);
      setFiltro("REVISION");
    } catch {
      setError("Error consultando las plataformas de credito.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/ventas"
        coverageLabel={esAdministrador ? "Todas las sedes" : session.sedeNombre}
        items={navigationItems}
      />

      <main className="min-w-0 lg:pl-[252px]">
        <div className="mx-auto w-full max-w-[1700px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <nav
                className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500"
                aria-label="Ruta de navegacion"
              >
                <Link href="/vendedor/registros" className="hover:text-[#e30613]">
                  Registrar venta
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-[#e30613]">Inconsistencias</span>
              </nav>
              <h1 className="text-3xl font-black tracking-tight sm:text-[34px]">
                Inconsistencias de creditos
              </h1>
              <p className="mt-2 max-w-3xl text-[15px] leading-6 text-slate-500">
                Compara lo registrado en Conectamos contra PAYJOY, FINSER, ALO
                CREDIT, SUMASPAY, ESMIO y ADDI.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/vendedor/registros"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                <DashboardIcon name="arrow" className="h-4 w-4 rotate-180" />
                Volver al registro
              </Link>
              <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <DashboardIcon name="user" className="h-5 w-5" />
                </span>
                <span className="hidden sm:block">
                  <span className="block max-w-52 truncate text-sm font-bold">
                    {session.perfilNombre || session.nombre}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {session.perfilTipoLabel}
                  </span>
                </span>
              </div>
              <LogoutButton variant="light" className="min-h-12 rounded-xl" />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#e30613]">
                  Revision en linea
                </p>
                <h2 className="mt-2 text-xl font-black">
                  Selecciona el dia que deseas revisar
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Solo se habilitan hoy y ayer porque las plataformas entregan
                  creditos recientes. La revision no modifica ninguna venta.
                </p>
              </div>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Fecha de registros
                <input
                  type="date"
                  value={fecha}
                  min={fechaAyer}
                  max={fechaHoy}
                  onChange={(event) => setFecha(event.target.value)}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
              </label>

              <button
                type="button"
                onClick={() => void analizar()}
                disabled={cargando || !fecha}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-sm font-black uppercase tracking-[0.06em] text-white shadow-sm transition hover:bg-[#c90511] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DashboardIcon
                  name={cargando ? "reports" : "search"}
                  className={`h-5 w-5 ${cargando ? "animate-pulse" : ""}`}
                />
                {cargando ? "Consultando..." : "Analizar creditos"}
              </button>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {cargando && (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#e30613]" />
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Comparando registros con las plataformas
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    El tiempo depende de la respuesta de cada financiera.
                  </p>
                </div>
              </div>
            </div>
          )}

          {reporte && !cargando && (
            <>
              <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    label: "Creditos revisados",
                    value: reporte.resumen.creditosAnalizados,
                    className: "text-slate-950",
                  },
                  {
                    label: "Coinciden",
                    value: reporte.resumen.coincidencias,
                    className: "text-emerald-600",
                  },
                  {
                    label: "Inconsistentes",
                    value: reporte.resumen.inconsistencias,
                    className: "text-[#e30613]",
                  },
                  {
                    label: "Revisar duplicidad",
                    value: reporte.resumen.revisar,
                    className: "text-amber-700",
                  },
                  {
                    label: "Sin verificar",
                    value: reporte.resumen.sinVerificar,
                    className: "text-slate-600",
                  },
                ].map((item) => (
                  <article
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                      {item.label}
                    </p>
                    <p className={`mt-2 text-3xl font-black ${item.className}`}>
                      {item.value}
                    </p>
                  </article>
                ))}
              </section>

              {reporte.limitado && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  La revision se limito a los {reporte.maxRegistros} registros
                  mas recientes del dia.
                </div>
              )}

              <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Listado de revision</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {resultadosVisibles.length} resultados visibles
                    </p>
                  </div>
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    Mostrar
                    <select
                      value={filtro}
                      onChange={(event) =>
                        setFiltro(event.target.value as FiltroEstado)
                      }
                      className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                    >
                      <option value="REVISION">Necesitan revision</option>
                      <option value="INCONSISTENTE">Inconsistentes</option>
                      <option value="REVISAR">Duplicidad por revisar</option>
                      <option value="SIN_VERIFICAR">Sin verificar</option>
                      <option value="COINCIDE">Coinciden</option>
                      <option value="TODOS">Todos</option>
                    </select>
                  </label>
                </div>

                {resultadosVisibles.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      <DashboardIcon name="approvals" className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-lg font-black">
                      No hay resultados en este filtro
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Si revisaste las alertas, puedes cambiar el filtro para ver
                      las coincidencias.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1180px] w-full text-left">
                      <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                        <tr>
                          <th className="px-5 py-3.5">Registro</th>
                          <th className="px-5 py-3.5">Cliente e identificador</th>
                          <th className="px-5 py-3.5">Financiera</th>
                          <th className="px-5 py-3.5 text-right">Conectamos</th>
                          <th className="px-5 py-3.5 text-right">Plataforma</th>
                          <th className="px-5 py-3.5">Resultado</th>
                          <th className="px-5 py-3.5 text-right">Accion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resultadosVisibles.map((item, index) => (
                          <tr
                            key={`${item.registroId}-${item.proveedor}-${index}`}
                            className="align-top transition hover:bg-slate-50/70"
                          >
                            <td className="px-5 py-4">
                              <p className="font-black text-slate-900">
                                #{item.registroId}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDate(item.createdAt)}
                              </p>
                              <p className="mt-1 max-w-40 text-xs text-slate-500">
                                {item.puntoVenta || "Sin punto"}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <p className="max-w-56 font-bold text-slate-900">
                                {item.clienteNombre}
                              </p>
                              <p className="mt-1 font-mono text-xs text-slate-600">
                                CC {item.documentoNumero}
                              </p>
                              <p className="mt-1 font-mono text-xs text-slate-500">
                                IMEI {item.serialImei || "Sin dato"}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-800">
                                {item.proveedor}
                              </span>
                              <p className="mt-2 text-xs text-slate-500">
                                Consulta por {item.identificadorTipo.toLowerCase()}
                              </p>
                              {item.ordenId && (
                                <p className="mt-1 max-w-44 truncate text-xs text-slate-500">
                                  Orden {item.ordenId}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right font-black text-slate-900">
                              {formatMoney(item.creditoRegistrado)}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <p className="font-black text-slate-900">
                                {formatMoney(item.creditoPlataforma)}
                              </p>
                              {item.fechaCreditoPlataforma && (
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.fechaCreditoPlataforma}
                                </p>
                              )}
                            </td>
                            <td className="max-w-sm px-5 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${claseEstado(item.estado)}`}
                              >
                                {etiquetaEstado(item.estado)}
                              </span>
                              {item.razones.length > 0 && (
                                <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                                  {item.razones.map((razon) => (
                                    <li key={razon}>• {razon}</li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <Link
                                href={`/vendedor/registros?editar=${item.registroId}`}
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                              >
                                Ver registro
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
