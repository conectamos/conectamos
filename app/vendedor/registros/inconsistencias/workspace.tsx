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

type EstadoRevision =
  | "COINCIDE"
  | "INCONSISTENTE"
  | "REVISAR"
  | "SIN_VERIFICAR"
  | "REVISADO";

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

type TipoPeriodo = "DIA" | "RANGO" | "MES";
type ProveedorMensual = "PAYJOY" | "SUMASPAY" | "ESMIO" | "ADDI";

type ReporteRevision = {
  modo: "RANGO";
  desde: string;
  hasta: string;
  proveedores: ProveedorMensual[];
  limitado: boolean;
  maxRegistros: number;
  resumen: {
    registrosAnalizados: number;
    creditosAnalizados: number;
    coincidencias: number;
    inconsistencias: number;
    revisar: number;
    sinVerificar: number;
    revisados: number;
  };
  resultados: ResultadoRevision[];
};

type RespuestaRango = {
  modo: "RANGO";
  desde: string;
  hasta: string;
  proveedor: ProveedorMensual;
  resultados: ResultadoRevision[];
  paginacion: {
    snapshot: string;
    cursor: number;
    cursorSiguiente: number | null;
    completo: boolean;
    gruposProcesados: number;
    gruposTotales: number;
    creditosTotales: number;
  };
};

type FiltroEstado = "REVISION" | "TODOS" | EstadoRevision;
const PROVEEDORES_MENSUALES = ["PAYJOY", "SUMASPAY", "ESMIO", "ADDI"] as const;
const ETIQUETAS_PROVEEDOR: Record<ProveedorMensual, string> = {
  PAYJOY: "PAYJOY",
  SUMASPAY: "SUMASPAY",
  ESMIO: "ESMIOPCION",
  ADDI: "ADDI",
};

function rangoDelMes(mes: string, fechaHoy: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(mes);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hastaMes = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  return {
    desde: `${mes}-01`,
    hasta: hastaMes > fechaHoy ? fechaHoy : hastaMes,
  };
}

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

function formatDateKey(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function etiquetaEstado(estado: EstadoRevision) {
  if (estado === "INCONSISTENTE") return "Inconsistente";
  if (estado === "REVISAR") return "Revisar";
  if (estado === "SIN_VERIFICAR") return "Sin verificar";
  if (estado === "REVISADO") return "Revisado";
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

function resumirResultados(resultados: ResultadoRevision[]) {
  return {
    registrosAnalizados: new Set(
      resultados.map((resultado) => resultado.registroId)
    ).size,
    creditosAnalizados: resultados.length,
    coincidencias: resultados.filter(
      (resultado) => resultado.estado === "COINCIDE"
    ).length,
    inconsistencias: resultados.filter(
      (resultado) => resultado.estado === "INCONSISTENTE"
    ).length,
    revisar: resultados.filter((resultado) => resultado.estado === "REVISAR")
      .length,
    sinVerificar: resultados.filter(
      (resultado) => resultado.estado === "SIN_VERIFICAR"
    ).length,
    revisados: resultados.filter(
      (resultado) => resultado.estado === "REVISADO"
    ).length,
  };
}

export default function InconsistenciasCreditosWorkspace({
  fechaHoy,
  mesActual,
  session,
}: {
  fechaHoy: string;
  mesActual: string;
  session: SessionProps;
}) {
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>("MES");
  const [fechaDia, setFechaDia] = useState(fechaHoy);
  const [fechaDesde, setFechaDesde] = useState(`${mesActual}-01`);
  const [fechaHasta, setFechaHasta] = useState(fechaHoy);
  const [mes, setMes] = useState(mesActual);
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState<
    ProveedorMensual[]
  >([...PROVEEDORES_MENSUALES]);
  const [reporte, setReporte] = useState<ReporteRevision | null>(null);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("REVISION");
  const [marcandoRevision, setMarcandoRevision] = useState("");

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
      return reporte.resultados.filter(
        (item) => item.estado !== "COINCIDE" && item.estado !== "REVISADO"
      );
    }

    return reporte.resultados.filter((item) => item.estado === filtro);
  }, [filtro, reporte]);

  const analizar = async () => {
    try {
      setCargando(true);
      setError("");
      setReporte(null);
      setProgreso("");

      if (proveedoresSeleccionados.length === 0) {
        throw new Error("Selecciona al menos una financiera para continuar.");
      }

      const rangoConsulta =
        tipoPeriodo === "DIA"
          ? { desde: fechaDia, hasta: fechaDia }
          : tipoPeriodo === "RANGO"
            ? { desde: fechaDesde, hasta: fechaHasta }
            : rangoDelMes(mes, fechaHoy);

      if (
        !rangoConsulta ||
        !/^\d{4}-\d{2}-\d{2}$/.test(rangoConsulta.desde) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(rangoConsulta.hasta) ||
        rangoConsulta.desde > rangoConsulta.hasta ||
        rangoConsulta.hasta > fechaHoy
      ) {
        throw new Error(
          "Selecciona un periodo valido, sin fechas futuras y con la fecha inicial antes de la final."
        );
      }

      const { desde, hasta } = rangoConsulta;
      const resultadosCompletos: ResultadoRevision[] = [];
      let snapshotRevision = "";

      for (const proveedor of proveedoresSeleccionados) {
        let cursor: number | null = 0;
        const cursoresProcesados = new Set<number>();
        const indiceProveedor =
          proveedoresSeleccionados.indexOf(proveedor) + 1;

        while (cursor !== null) {
          if (cursoresProcesados.has(cursor)) {
            throw new Error(
              `La consulta de ${proveedor} no pudo avanzar al siguiente bloque.`
            );
          }

          cursoresProcesados.add(cursor);
          setProgreso(
            `Consultando ${ETIQUETAS_PROVEEDOR[proveedor]} · financiera ${indiceProveedor} de ${proveedoresSeleccionados.length}${
              cursor > 0 ? ` · bloque ${cursoresProcesados.size}` : ""
            }`
          );

          const params = new URLSearchParams({
            desde,
            hasta,
            proveedor,
            cursor: String(cursor),
          });

          if (snapshotRevision) {
            params.set("snapshot", snapshotRevision);
          }

          const response = await fetch(
            `/api/vendedor/registros/inconsistencias?${params.toString()}`,
            { cache: "no-store" }
          );
          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                `No se pudo completar la revision de ${ETIQUETAS_PROVEEDOR[proveedor]}.`
            );
          }

          const pagina = data as RespuestaRango;
          snapshotRevision =
            snapshotRevision || pagina.paginacion.snapshot;
          resultadosCompletos.push(...pagina.resultados);
          cursor = pagina.paginacion.cursorSiguiente;
        }
      }

      resultadosCompletos.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.registroId - a.registroId
      );

      setReporte({
        modo: "RANGO",
        desde,
        hasta,
        proveedores: [...proveedoresSeleccionados],
        limitado: false,
        maxRegistros: 0,
        resumen: resumirResultados(resultadosCompletos),
        resultados: resultadosCompletos,
      });
      setFiltro("REVISION");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error consultando las plataformas de credito."
      );
    } finally {
      setCargando(false);
      setProgreso("");
    }
  };

  const marcarComoRevisado = async (item: ResultadoRevision) => {
    const key = `${item.registroId}:${item.proveedor}`;

    try {
      setMarcandoRevision(key);
      setError("");

      const response = await fetch(
        "/api/vendedor/registros/inconsistencias",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            registroId: item.registroId,
            proveedor: item.proveedor,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No se pudo guardar la revision.");
        return;
      }

      setReporte((current) => {
        if (!current) {
          return current;
        }

        const resultados = current.resultados.map((resultado) =>
          resultado.registroId === item.registroId &&
          resultado.proveedor === item.proveedor
            ? {
                ...resultado,
                estado: "REVISADO" as const,
                razones: [
                  `Marcado como revisado por ${
                    data.revision?.revisadoPor || "el usuario actual"
                  }.`,
                  ...resultado.razones,
                ],
              }
            : resultado
        );

        return {
          ...current,
          resumen: {
            ...current.resumen,
            inconsistencias:
              current.resumen.inconsistencias -
              (item.estado === "INCONSISTENTE" ? 1 : 0),
            revisar:
              current.resumen.revisar - (item.estado === "REVISAR" ? 1 : 0),
            sinVerificar:
              current.resumen.sinVerificar -
              (item.estado === "SIN_VERIFICAR" ? 1 : 0),
            revisados: current.resumen.revisados + 1,
          },
          resultados,
        };
      });
    } catch {
      setError("No se pudo guardar la revision.");
    } finally {
      setMarcandoRevision("");
    }
  };

  const limpiarInforme = () => {
    setReporte(null);
    setError("");
  };

  const alternarProveedor = (proveedor: ProveedorMensual) => {
    setProveedoresSeleccionados((actuales) =>
      actuales.includes(proveedor)
        ? actuales.filter((item) => item !== proveedor)
        : PROVEEDORES_MENSUALES.filter(
            (item) => item === proveedor || actuales.includes(item)
          )
    );
    limpiarInforme();
  };

  const periodoIncompleto =
    (tipoPeriodo === "DIA" && !fechaDia) ||
    (tipoPeriodo === "RANGO" && (!fechaDesde || !fechaHasta)) ||
    (tipoPeriodo === "MES" && !mes);

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
                Elige cualquier dia, rango o mes y las financieras que deseas
                comparar.
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
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_190px_minmax(320px,1fr)_auto] xl:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#e30613]">
                  Revision en linea
                </p>
                <h2 className="mt-2 text-xl font-black">
                  Selecciona el periodo y las financieras
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Solo se valida el valor del credito; no se comparan cuota, plazo, inicial ni frecuencia.
                  Este informe no modifica las ventas.
                </p>
              </div>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Tipo de periodo
                <select
                  value={tipoPeriodo}
                  disabled={cargando}
                  onChange={(event) => {
                    setTipoPeriodo(event.target.value as TipoPeriodo);
                    limpiarInforme();
                  }}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                >
                  <option value="DIA">Dia</option>
                  <option value="RANGO">Rango</option>
                  <option value="MES">Mes</option>
                </select>
              </label>

              {tipoPeriodo === "MES" ? (
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Mes de registros
                  <input
                    type="month"
                    value={mes}
                    max={mesActual}
                    disabled={cargando}
                    onChange={(event) => {
                      setMes(event.target.value);
                      limpiarInforme();
                    }}
                    className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                  />
                </label>
              ) : tipoPeriodo === "DIA" ? (
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Fecha de registros
                  <input
                    type="date"
                    value={fechaDia}
                    max={fechaHoy}
                    disabled={cargando}
                    onChange={(event) => {
                      setFechaDia(event.target.value);
                      limpiarInforme();
                    }}
                    className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                  />
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Desde
                    <input
                      type="date"
                      value={fechaDesde}
                      max={fechaHoy}
                      disabled={cargando}
                      onChange={(event) => {
                        setFechaDesde(event.target.value);
                        limpiarInforme();
                      }}
                      className="min-h-12 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                    Hasta
                    <input
                      type="date"
                      value={fechaHasta}
                      max={fechaHoy}
                      disabled={cargando}
                      onChange={(event) => {
                        setFechaHasta(event.target.value);
                        limpiarInforme();
                      }}
                      className="min-h-12 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                onClick={() => void analizar()}
                disabled={
                  cargando ||
                  periodoIncompleto ||
                  proveedoresSeleccionados.length === 0
                }
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-sm font-black uppercase tracking-[0.06em] text-white shadow-sm transition hover:bg-[#c90511] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DashboardIcon
                  name={cargando ? "reports" : "search"}
                  className={`h-5 w-5 ${cargando ? "animate-pulse" : ""}`}
                />
                {cargando ? "Consultando..." : "Analizar creditos"}
              </button>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Financieras
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Puedes elegir una, varias o las cuatro.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <button
                    type="button"
                    disabled={cargando}
                    onClick={() => {
                      setProveedoresSeleccionados([
                        ...PROVEEDORES_MENSUALES,
                      ]);
                      limpiarInforme();
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 transition hover:border-red-200 hover:text-[#e30613] disabled:opacity-50"
                  >
                    Seleccionar todas
                  </button>
                  <button
                    type="button"
                    disabled={cargando}
                    onClick={() => {
                      setProveedoresSeleccionados([]);
                      limpiarInforme();
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 transition hover:border-red-200 hover:text-[#e30613] disabled:opacity-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PROVEEDORES_MENSUALES.map((proveedor) => {
                  const seleccionado =
                    proveedoresSeleccionados.includes(proveedor);

                  return (
                    <label
                      key={proveedor}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-black transition ${
                        seleccionado
                          ? "border-red-200 bg-red-50 text-[#c90511]"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                      } ${cargando ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={seleccionado}
                        disabled={cargando}
                        onChange={() => alternarProveedor(proveedor)}
                        className="h-4 w-4 rounded border-slate-300 accent-[#e30613]"
                      />
                      {ETIQUETAS_PROVEEDOR[proveedor]}
                    </label>
                  );
                })}
              </div>
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
                    {progreso || "Comparando registros con las plataformas"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Se recorreran todos los bloques del periodo. El tiempo
                    depende del rango y de la respuesta de cada financiera.
                  </p>
                </div>
              </div>
            </div>
          )}

          {reporte && !cargando && (
            <>
              <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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
                  {
                    label: "Revisados",
                    value: reporte.resumen.revisados,
                    className: "text-emerald-600",
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

              <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <span className="font-black text-slate-900">
                  Consulta ejecutada:
                </span>{" "}
                {formatDateKey(reporte.desde)}
                {reporte.desde !== reporte.hasta
                  ? ` al ${formatDateKey(reporte.hasta)}`
                  : ""}{" "}
                ·{" "}
                {reporte.proveedores
                  .map((proveedor) => ETIQUETAS_PROVEEDOR[proveedor])
                  .join(", ")}
                <div className="mt-1 text-xs text-slate-500">
                  Comparacion exclusiva del valor del credito autorizado.
                </div>
              </div>

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
                      <option value="REVISADO">Revisados</option>
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
                    <table className="min-w-[1240px] w-full text-left">
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
                              <div className="flex items-center justify-end gap-2">
                                {item.estado !== "COINCIDE" &&
                                  item.estado !== "REVISADO" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void marcarComoRevisado(item)
                                      }
                                      disabled={
                                        marcandoRevision ===
                                        `${item.registroId}:${item.proveedor}`
                                      }
                                      aria-label={`Marcar como revisada la alerta de ${item.proveedor} del registro ${item.registroId}`}
                                      title="Marcar como revisado"
                                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {marcandoRevision ===
                                      `${item.registroId}:${item.proveedor}` ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" />
                                      ) : (
                                        <DashboardIcon
                                          name="approvals"
                                          className="h-5 w-5"
                                        />
                                      )}
                                    </button>
                                  )}
                                <Link
                                  href={`/vendedor/registros?editar=${item.registroId}`}
                                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                                >
                                  Ver registro
                                </Link>
                              </div>
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
