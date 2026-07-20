"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type Metric = {
  actual: number;
  anterior: number;
  diferencia: number;
  porcentaje: number | null;
};

type AnalyticSummary = {
  periodoActual: {
    key: string;
    label: string;
  };
  periodoAnterior: {
    key: string;
    label: string;
  };
  cobertura: string;
  ventas: Metric;
  utilidad: Metric;
};

type SessionUser = {
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolNombre: string;
  perfilTipo?: string | null;
};

type Sede = {
  id: number;
  nombre: string;
};

function currentBogotaMonthInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year =
    parts.find((part) => part.type === "year")?.value ||
    String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value || "01";

  return `${year}-${month}`;
}

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  })}`;
}

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoPorcentaje(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) {
    return "Sin base anterior";
  }

  return `${valor > 0 ? "+" : ""}${valor.toFixed(1)}%`;
}

function formatTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function MetricComparisonCard({
  icon,
  label,
  metric,
  formatValue,
}: {
  icon: DashboardIconName;
  label: string;
  metric: Metric;
  formatValue: (value: number) => string;
}) {
  const maximo = Math.max(Math.abs(metric.actual), Math.abs(metric.anterior), 1);
  const actualWidth = Math.max((Math.abs(metric.actual) / maximo) * 100, 2);
  const anteriorWidth = Math.max((Math.abs(metric.anterior) / maximo) * 100, 2);
  const esPositivo = metric.diferencia > 0;
  const esNegativo = metric.diferencia < 0;
  const tone = esPositivo
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : esNegativo
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  const diferenciaTexto =
    metric.diferencia > 0
      ? `+${formatValue(metric.diferencia)}`
      : formatValue(metric.diferencia);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
            <DashboardIcon name={icon} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 max-w-full break-words text-[clamp(1.65rem,2.4vw,2.5rem)] font-black leading-tight tracking-tight text-slate-950">
              {formatValue(metric.actual)}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Periodo seleccionado
            </p>
          </div>
        </div>

        <div className={`shrink-0 rounded-xl border px-4 py-3 text-left sm:text-right ${tone}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.15em]">
            Comparación
          </p>
          <p className="mt-1 text-xl font-black">
            {formatoPorcentaje(metric.porcentaje)}
          </p>
          <p className="mt-1 text-xs font-bold">Diferencia: {diferenciaTexto}</p>
        </div>
      </div>

      <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
            <span>Periodo actual</span>
            <span>{formatValue(metric.actual)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#e30613] transition-[width] duration-500"
              style={{ width: `${actualWidth}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
            <span>Mes anterior</span>
            <span>{formatValue(metric.anterior)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-400 transition-[width] duration-500"
              style={{ width: `${anteriorWidth}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function PanelAnaliticoPage() {
  const [periodo, setPeriodo] = useState(currentBogotaMonthInput());
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [resumen, setResumen] = useState<AnalyticSummary | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    String(user?.rolNombre || "").toUpperCase()
  );
  const reportHref = esAdmin ? "/dashboard/reportes" : "/dashboard/analitico";
  const coberturaActual = useMemo(() => {
    if (!esAdmin) return user?.sedeNombre || "Tu sede";
    if (sedeFiltroId === "TODAS") return "Todas las sedes";

    return (
      sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre ||
      "Sede filtrada"
    );
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const navigationItems = useMemo<NavigationItem[]>(
    () => [
      { href: "/dashboard", icon: "home", label: "Inicio" },
      { href: "/ventas", icon: "sales", label: "Ventas" },
      { href: "/inventario", icon: "inventory", label: "Inventario" },
      { href: "/prestamos", icon: "loans", label: "Préstamos" },
      { href: "/caja", icon: "cash", label: "Caja" },
      {
        href: "/dashboard/aprobaciones",
        icon: "approvals",
        label: "Aprobaciones",
      },
      { href: reportHref, icon: "reports", label: "Reportes" },
      ...(esAdmin
        ? ([
            {
              href: "/dashboard/sedes",
              icon: "settings",
              label: "Configuración",
            },
          ] satisfies NavigationItem[])
        : []),
    ],
    [esAdmin, reportHref]
  );

  const cargarContexto = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/session", { cache: "no-store" });
      const sessionData = await sessionRes.json();

      if (!sessionRes.ok) {
        setError(sessionData.error || "No se pudo cargar la sesión");
        setCargando(false);
        return;
      }

      setUser(sessionData);

      if (
        ["ADMIN", "AUDITOR"].includes(
          String(sessionData?.rolNombre || "").toUpperCase()
        )
      ) {
        const sedesRes = await fetch("/api/sedes", { cache: "no-store" });
        const sedesData = await sedesRes.json();

        if (sedesRes.ok) {
          setSedes(Array.isArray(sedesData) ? sedesData : []);
        }
      }
    } catch {
      setError("Error cargando contexto del panel");
      setCargando(false);
    }
  }, []);

  const cargarResumen = useCallback(async () => {
    try {
      setError("");
      setCargando(true);

      const params = new URLSearchParams();
      params.set("period", periodo);

      if (esAdmin && sedeFiltroId !== "TODAS") {
        params.set("sedeId", sedeFiltroId);
      }

      const res = await fetch(`/api/dashboard/analitico?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error cargando panel analítico");
        return;
      }

      setResumen(data.resumen);
      setUltimaActualizacion(new Date());
    } catch {
      setError("Error interno cargando panel analítico");
    } finally {
      setCargando(false);
    }
  }, [esAdmin, periodo, sedeFiltroId]);

  useEffect(() => {
    void cargarContexto();
  }, [cargarContexto]);

  useEffect(() => {
    if (!user) return;
    void cargarResumen();
  }, [cargarResumen, user]);

  useLiveRefresh(
    async () => {
      if (user) await cargarResumen();
    },
    {
      enabled: Boolean(user),
      intervalMs: 10000,
    }
  );

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref={reportHref}
        coverageLabel={coberturaActual}
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
                <span className="text-slate-600">Panel analítico</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Panel analítico
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Comparativo mensual de ventas y utilidad frente al mes anterior.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Cobertura: {coberturaActual}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Actualizado: {ultimaActualizacion ? formatTimeLabel(ultimaActualizacion) : "Cargando..."}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">
                    {user?.nombre || user?.usuario || "Cargando usuario"}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user?.rolNombre || "Sesión activa"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="calendar" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Periodo de análisis
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">Selecciona el corte mensual</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    El sistema lo compara automáticamente con el mes inmediatamente anterior.
                  </p>
                </div>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end xl:w-auto">
                <label className="flex min-w-[220px] flex-1 flex-col gap-2 text-sm font-bold text-slate-700">
                  Mes y año
                  <input
                    type="month"
                    value={periodo}
                    onChange={(event) => setPeriodo(event.target.value)}
                    className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  />
                </label>

                {esAdmin && (
                  <label className="flex min-w-[240px] flex-1 flex-col gap-2 text-sm font-bold text-slate-700">
                    Cobertura
                    <select
                      value={sedeFiltroId}
                      onChange={(event) => setSedeFiltroId(event.target.value)}
                      className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    >
                      <option value="TODAS">Todas las sedes</option>
                      {sedes.map((sede) => (
                        <option key={sede.id} value={String(sede.id)}>
                          {sede.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => void cargarResumen()}
                  disabled={cargando || !user}
                  className="min-h-[52px] rounded-xl bg-[#e30613] px-6 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cargando ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>
          </section>

          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {cargando && !resumen ? (
            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              {[0, 1].map((item) => (
                <div key={item} className="h-[320px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
              ))}
            </section>
          ) : resumen ? (
            <>
              <section className="mt-6 grid gap-4 xl:grid-cols-2">
                <MetricComparisonCard
                  icon="sales"
                  label="Número de ventas"
                  metric={resumen.ventas}
                  formatValue={formatoNumero}
                />
                <MetricComparisonCard
                  icon="trend"
                  label="Utilidad generada"
                  metric={resumen.utilidad}
                  formatValue={formatoPesos}
                />
              </section>

              <section className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  {
                    icon: "calendar" as const,
                    label: "Periodo actual",
                    value: resumen.periodoActual.label,
                    detail: "Mes comercial seleccionado.",
                  },
                  {
                    icon: "trend" as const,
                    label: "Comparado con",
                    value: resumen.periodoAnterior.label,
                    detail: "Periodo base de comparación.",
                  },
                  {
                    icon: "store" as const,
                    label: "Cobertura",
                    value: resumen.cobertura,
                    detail: "Datos incluidos en los indicadores.",
                  },
                ].map((item) => (
                  <article
                    key={item.label}
                    className="flex min-h-[130px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <DashboardIcon name={item.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 break-words text-xl font-black capitalize">{item.value}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                    </div>
                  </article>
                ))}
              </section>

              <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                <DashboardIcon name="bell" className="h-5 w-5 shrink-0 text-slate-400" />
                Los indicadores se actualizan automáticamente cada 10 segundos sin modificar el periodo seleccionado.
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
