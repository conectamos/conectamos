"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuditSeverity = "CRITICO" | "ALERTA" | "INFO";
type AuditRow = Record<string, unknown>;
type AuditFilter = "hallazgos" | "todos" | AuditSeverity;

type AuditCheck = {
  categoria: string;
  count: number;
  descripcion: string;
  id: string;
  recomendacion: string;
  rows: AuditRow[];
  severity: AuditSeverity;
  titulo: string;
};

type AuditTableCount = {
  registros: number;
  tabla: string;
};

type AuditResponse = {
  checks: AuditCheck[];
  generatedAt: string;
  ok: boolean;
  resumen: {
    alertas: number;
    criticos: number;
    informativos: number;
    revisionesConHallazgos: number;
    revisionesOk: number;
    totalHallazgos: number;
    totalRevisiones: number;
  };
  tablas: AuditTableCount[];
};

const filterOptions: Array<{ label: string; value: AuditFilter }> = [
  { label: "Hallazgos", value: "hallazgos" },
  { label: "Todas", value: "todos" },
  { label: "Criticos", value: "CRITICO" },
  { label: "Alertas", value: "ALERTA" },
  { label: "Info", value: "INFO" },
];

const severityClasses: Record<AuditSeverity, string> = {
  ALERTA: "border-amber-200 bg-amber-50 text-amber-800",
  CRITICO: "border-red-200 bg-red-50 text-red-800",
  INFO: "border-sky-200 bg-sky-50 text-sky-800",
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("es-CO");
}

function formatGeneratedAt(value: string | null) {
  if (!value) return "Sin datos";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatColumnLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.map(formatCellValue).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#e6ded1] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className={["mt-3 text-4xl font-black tracking-tight", tone].join(" ")}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function RowsPreview({ rows }: { rows: AuditRow[] }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.slice(0, 5).forEach((row) => {
      Object.keys(row).forEach((key) => keys.add(key));
    });

    return Array.from(keys).slice(0, 8);
  }, [rows]);

  if (!rows.length || !columns.length) {
    return null;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-4 py-3 font-black uppercase tracking-[0.14em]"
                >
                  {formatColumnLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.slice(0, 5).map((row, index) => (
              <tr key={`row-${index}`}>
                {columns.map((column) => (
                  <td
                    key={`${index}-${column}`}
                    className="max-w-[260px] truncate px-4 py-3 font-medium"
                    title={formatCellValue(row[column])}
                  >
                    {formatCellValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 5 ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
          Mostrando 5 de {formatNumber(rows.length)} filas de muestra.
        </div>
      ) : null}
    </div>
  );
}

function CheckCard({ check }: { check: AuditCheck }) {
  const hasRows = check.count > 0;

  return (
    <section
      className={[
        "rounded-[26px] border bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]",
        hasRows ? "border-slate-200" : "border-emerald-100",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                "rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]",
                severityClasses[check.severity],
              ].join(" ")}
            >
              {check.severity}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">
              {check.categoria}
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            {check.titulo}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {check.descripcion}
          </p>
        </div>

        <div
          className={[
            "rounded-2xl border px-4 py-3 text-center",
            hasRows
              ? "border-red-100 bg-red-50 text-red-800"
              : "border-emerald-100 bg-emerald-50 text-emerald-800",
          ].join(" ")}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.16em]">
            Hallazgos
          </p>
          <p className="mt-1 text-3xl font-black">{formatNumber(check.count)}</p>
        </div>
      </div>

      {hasRows ? (
        <>
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900">
            {check.recomendacion}
          </div>
          <RowsPreview rows={check.rows} />
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Revision sin hallazgos.
        </div>
      )}
    </section>
  );
}

export function AuditoriaWorkspace() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<AuditFilter>("hallazgos");
  const [loading, setLoading] = useState(true);

  const cargarAuditoria = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/auditoria", { cache: "no-store" });
      const payload = await res.json();

      if (!res.ok) {
        setError(payload.error || "No se pudo cargar la auditoria");
        return;
      }

      setData(payload);
    } catch {
      setError("Error cargando la auditoria");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarAuditoria();
  }, [cargarAuditoria]);

  const checks = useMemo(() => {
    const items = data?.checks || [];

    if (filter === "todos") {
      return items;
    }

    if (filter === "hallazgos") {
      return items.filter((item) => item.count > 0);
    }

    return items.filter((item) => item.severity === filter);
  }, [data?.checks, filter]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#eef2f7_100%)] px-4 py-8 text-slate-950">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-slate-900 bg-[linear-gradient(135deg,#111827_0%,#1f2937_54%,#7f1d1d_100%)] px-6 py-7 text-white shadow-[0_26px_85px_rgba(15,23,42,0.22)] sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">
                Control interno
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Auditoria de datos
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Inventario, prestamos, ventas, caja y configuracion revisados en
                modo solo lectura.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void cargarAuditoria()}
                disabled={loading}
                className="rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-70"
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Criticos"
            value={data?.resumen.criticos || 0}
            tone="text-red-700"
          />
          <MetricCard
            label="Alertas"
            value={data?.resumen.alertas || 0}
            tone="text-amber-700"
          />
          <MetricCard
            label="Informativos"
            value={data?.resumen.informativos || 0}
            tone="text-sky-700"
          />
          <MetricCard
            label="Revisiones OK"
            value={data?.resumen.revisionesOk || 0}
            tone="text-emerald-700"
          />
        </section>

        <section className="rounded-[28px] border border-[#e4dccd] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#e5ddd0] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Estado general
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                {loading ? "Cargando revisiones..." : "Revisiones ejecutadas"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Ultima lectura: {formatGeneratedAt(data?.generatedAt || null)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={[
                    "rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition",
                    filter === option.value
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {data?.tablas?.length ? (
          <section className="rounded-[28px] border border-[#e4dccd] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="inline-flex rounded-full border border-[#e5ddd0] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Tablas
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.tablas.map((tabla) => (
                <div
                  key={tabla.tabla}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <p className="truncate text-sm font-black text-slate-950">
                    {tabla.tabla}
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-700">
                    {formatNumber(tabla.registros)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          {!loading && checks.length === 0 ? (
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 px-6 py-8 text-center text-emerald-800">
              <p className="text-lg font-black">Sin hallazgos en este filtro.</p>
            </div>
          ) : null}

          {checks.map((check) => (
            <CheckCard key={check.id} check={check} />
          ))}
        </section>
      </main>
    </div>
  );
}
