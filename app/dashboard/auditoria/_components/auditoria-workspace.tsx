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

type SessionSummary = {
  nombre: string;
  usuario: string;
  rolNombre: string;
  sedeNombre: string;
};

const navigationItems: NavigationItem[] = [
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
  { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
  { href: "/dashboard/auditoria", icon: "search", label: "Auditoría" },
  { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
];

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
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: DashboardIconName;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className={["mt-2 text-3xl font-black tracking-tight", tone].join(" ")}>
            {formatNumber(value)}
          </p>
        </div>
      </div>
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
        "rounded-2xl border bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
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

export function AuditoriaWorkspace({ user }: { user: SessionSummary }) {
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
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950 [&_button]:uppercase">
      <DashboardSidebar
        activeHref="/dashboard/auditoria"
        coverageLabel={user.sedeNombre || "Todas las sedes"}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
      <main className="w-full space-y-6 px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/dashboard" className="transition hover:text-[#e30613]">
                  Inicio
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Auditoría</span>
              </nav>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Auditoría de datos
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Inventario, préstamos, ventas, caja y configuración revisados en
                modo solo lectura.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                <DashboardIcon name="lock" className="h-3.5 w-3.5" />
                Sin modificaciones de datos
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void cargarAuditoria()}
                disabled={loading}
                className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-bold uppercase tracking-[0.04em] text-white shadow-sm transition hover:bg-red-700 disabled:opacity-70"
              >
                <DashboardIcon name="trend" className="h-4 w-4" />
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
              <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {(user.nombre || user.usuario || "A").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 pr-2 leading-tight">
                  <p className="max-w-[170px] truncate text-sm font-bold">
                    {user.nombre || user.usuario}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {user.rolNombre}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
        </header>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            <DashboardIcon name="warning" className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Criticos"
            value={data?.resumen.criticos || 0}
            tone="text-red-700"
            icon="warning"
          />
          <MetricCard
            label="Alertas"
            value={data?.resumen.alertas || 0}
            tone="text-amber-700"
            icon="bell"
          />
          <MetricCard
            label="Informativos"
            value={data?.resumen.informativos || 0}
            tone="text-sky-700"
            icon="document"
          />
          <MetricCard
            label="Revisiones OK"
            value={data?.resumen.revisionesOk || 0}
            tone="text-emerald-700"
            icon="approvals"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                <DashboardIcon name="search" className="h-5 w-5" />
              </span>
              <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Estado general
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                {loading ? "Cargando revisiones..." : "Revisiones ejecutadas"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Ultima lectura: {formatGeneratedAt(data?.generatedAt || null)}
              </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={[
                    "min-h-10 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.1em] transition",
                    filter === option.value
                      ? "border-[#e30613] bg-[#e30613] text-white"
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
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <DashboardIcon name="catalog" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Tablas verificadas
                </p>
                <h2 className="mt-1 text-xl font-black">Cobertura de la revisión</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.tablas.map((tabla) => (
                <div
                  key={tabla.tabla}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
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
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-8 text-center text-emerald-800">
              <p className="text-lg font-black">Sin hallazgos en este filtro.</p>
            </div>
          ) : null}

          {checks.map((check) => (
            <CheckCard key={check.id} check={check} />
          ))}
        </section>
      </main>
      </div>
    </div>
  );
}
