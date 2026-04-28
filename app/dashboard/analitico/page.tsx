"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  sedeId: number;
  sedeNombre: string;
  rolNombre: string;
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
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoPorcentaje(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) {
    return "Sin base anterior";
  }

  const signo = valor > 0 ? "+" : "";

  return `${signo}${valor.toFixed(1)}%`;
}

function formatTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function metricTone(metric: Metric) {
  if (metric.porcentaje === null) {
    return metric.actual > 0 ? "text-sky-700 bg-sky-50 border-sky-200" : "text-slate-600 bg-slate-50 border-slate-200";
  }

  if (metric.diferencia > 0) {
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  }

  if (metric.diferencia < 0) {
    return "text-rose-700 bg-rose-50 border-rose-200";
  }

  return "text-slate-600 bg-slate-50 border-slate-200";
}

function MetricComparisonCard({
  label,
  metric,
  formatValue,
}: {
  label: string;
  metric: Metric;
  formatValue: (value: number) => string;
}) {
  const tone = metricTone(metric);
  const diferenciaTexto =
    metric.diferencia > 0
      ? `+${formatValue(metric.diferencia)}`
      : formatValue(metric.diferencia);

  return (
    <section className="rounded-[28px] border border-[#e5ded1] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
            {formatValue(metric.actual)}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Mes anterior:{" "}
            <span className="font-semibold text-slate-700">
              {formatValue(metric.anterior)}
            </span>
          </p>
        </div>

        <div className={["rounded-2xl border px-4 py-3 text-right", tone].join(" ")}>
          <p className="text-[11px] font-black uppercase tracking-[0.18em]">
            Comparacion
          </p>
          <p className="mt-2 text-2xl font-black">
            {formatoPorcentaje(metric.porcentaje)}
          </p>
          <p className="mt-1 text-xs font-semibold">
            Diferencia: {diferenciaTexto}
          </p>
        </div>
      </div>
    </section>
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
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(
    null
  );

  const esAdmin = String(user?.rolNombre || "").toUpperCase() === "ADMIN";

  const coberturaActual = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "Tu sede";
    }

    if (sedeFiltroId === "TODAS") {
      return "Todas las sedes";
    }

    return (
      sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre ||
      "Sede filtrada"
    );
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const cargarContexto = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/session", { cache: "no-store" });
      const sessionData = await sessionRes.json();

      if (!sessionRes.ok) {
        setError(sessionData.error || "No se pudo cargar la sesion");
        return;
      }

      setUser(sessionData);

      if (String(sessionData?.rolNombre || "").toUpperCase() === "ADMIN") {
        const sedesRes = await fetch("/api/sedes", { cache: "no-store" });
        const sedesData = await sedesRes.json();

        if (sedesRes.ok) {
          setSedes(Array.isArray(sedesData) ? sedesData : []);
        }
      }
    } catch {
      setError("Error cargando contexto del panel");
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
        setError(data.error || "Error cargando panel analitico");
        return;
      }

      setResumen(data.resumen);
      setUltimaActualizacion(new Date());
    } catch {
      setError("Error interno cargando panel analitico");
    } finally {
      setCargando(false);
    }
  }, [esAdmin, periodo, sedeFiltroId]);

  useEffect(() => {
    void cargarContexto();
  }, [cargarContexto]);

  useLiveRefresh(
    async () => {
      if (!user) {
        return;
      }

      await cargarResumen();
    },
    {
      enabled: Boolean(user),
      intervalMs: 10000,
      runOnMount: true,
    }
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    void cargarResumen();
  }, [cargarResumen, user]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#eef2f7_100%)] px-4 py-8 text-slate-950">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[34px] border border-[#182233] bg-[linear-gradient(135deg,#101827_0%,#12343b_52%,#2f5f57_100%)] px-6 py-7 text-white shadow-[0_26px_85px_rgba(15,23,42,0.22)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(94,234,212,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_24%)]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-100">
                Panel analitico
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                PANEL ANALITICO
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                Comparativo mensual de ventas y utilidad contra el mes anterior,
                actualizado automaticamente para leer la tendencia comercial.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-100">
              <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2">
                Cobertura: {coberturaActual}
              </div>
              <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2">
                Actualizado:{" "}
                {ultimaActualizacion
                  ? formatTimeLabel(ultimaActualizacion)
                  : "Cargando..."}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#e4dccd] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#e5ddd0] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                Busqueda
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                Buscar por mes y año
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                El periodo seleccionado se compara contra el mes inmediatamente
                anterior.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[220px] flex-col gap-2 text-sm font-semibold text-slate-700">
                Mes / año
                <input
                  type="month"
                  value={periodo}
                  onChange={(event) => setPeriodo(event.target.value)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              {esAdmin && (
                <label className="flex min-w-[240px] flex-col gap-2 text-sm font-semibold text-slate-700">
                  Cobertura
                  <select
                    value={sedeFiltroId}
                    onChange={(event) => setSedeFiltroId(event.target.value)}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
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
                disabled={cargando}
                className="min-h-[48px] rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
              >
                {cargando ? "Actualizando..." : "Actualizar"}
              </button>

              <Link
                href="/dashboard"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {resumen && (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              <MetricComparisonCard
                label="Numero de ventas"
                metric={resumen.ventas}
                formatValue={formatoNumero}
              />
              <MetricComparisonCard
                label="Utilidad generada"
                metric={resumen.utilidad}
                formatValue={formatoPesos}
              />
            </section>

            <section className="rounded-[28px] border border-[#e4dccd] bg-[#fcfbf8] p-5 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Periodo actual
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {resumen.periodoActual.label}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Vs mes anterior
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {resumen.periodoAnterior.label}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Refresco
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    Cada 10 segundos
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
