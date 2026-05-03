import Link from "next/link";
import { redirect } from "next/navigation";
import { esRolAdmin } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import {
  getAdminInventorySummary,
  type InventoryAdminSummary,
  type InventoryReferenceSummary,
  type InventoryStaleItem,
} from "@/lib/dashboard-inventory-summary";

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoFechaCorta(fecha: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(fecha);
}

function MetricCard({
  label,
  value,
  detail,
  valueClassName = "text-slate-950",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#e7e3da] bg-white px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className={["mt-3 text-3xl font-black tracking-tight", valueClassName].join(" ")}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function InventoryMiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em]",
        toneClass,
      ].join(" ")}
    >
      {label}: {formatoNumero(value)}
    </span>
  );
}

function InventoryReferenceRow({
  item,
  compact = false,
}: {
  item: InventoryReferenceSummary;
  compact?: boolean;
}) {
  const riskClass =
    item.total === 0
      ? "border-rose-200 bg-rose-50/70"
      : item.total <= 2
        ? "border-amber-200 bg-amber-50/60"
        : "border-[#eee6da] bg-[#fcfbf8]";

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3",
        compact ? "space-y-2" : "space-y-3",
        riskClass,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-sm font-black uppercase leading-5 tracking-tight text-slate-950">
          {item.referencia}
        </p>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Total
          </p>
          <p className="text-lg font-black text-slate-950">
            {formatoNumero(item.total)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <InventoryMiniStat
          label="Bodega"
          value={item.bodegaPrincipal}
          tone="emerald"
        />
        <InventoryMiniStat label="Sedes" value={item.sedes} />
        {item.deuda > 0 && (
          <InventoryMiniStat label="Deuda" value={item.deuda} tone="rose" />
        )}
        {item.pendiente > 0 && (
          <InventoryMiniStat
            label="Pendiente"
            value={item.pendiente}
            tone="amber"
          />
        )}
      </div>
    </div>
  );
}

function InventoryStaleRow({ item }: { item: InventoryStaleItem }) {
  return (
    <div className="rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase leading-5 tracking-tight text-slate-950">
            {item.referencia}
          </p>
          <p className="mt-1 font-mono text-xs font-semibold text-slate-500">
            IMEI {item.imei}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {item.ubicacion} | ultimo movimiento:{" "}
            {formatoFechaCorta(item.ultimoMovimiento)}
          </p>
        </div>
        <div className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
          <p className="text-lg font-black text-amber-700">
            {formatoNumero(item.diasQuieto)}
          </p>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
            dias
          </p>
        </div>
      </div>
    </div>
  );
}

function InventoryEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e6ddcf] bg-[#fcfaf6] px-4 py-5 text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function AdminInventoryRadarSection({
  summary,
}: {
  summary: InventoryAdminSummary;
}) {
  return (
    <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#d7eee5] bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Radar de inventario
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
            Inteligencia de stock
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Lectura general por referencia, bodega principal y sedes para
            detectar faltantes y equipos quietos sin mover registros.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventario-principal"
            className="inline-flex min-h-[42px] items-center justify-center rounded-2xl border border-[#e4ddd2] bg-[#fcfbf8] px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-white hover:text-slate-950"
          >
            Bodega principal
          </Link>
          <Link
            href="/inventario"
            className="inline-flex min-h-[42px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Ver inventario
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Equipos activos"
          value={formatoNumero(summary.totalEquipos)}
          detail="Bodega principal y sedes, sin vendidos."
          valueClassName="text-slate-950"
        />
        <MetricCard
          label="Bodega principal"
          value={formatoNumero(summary.totalBodegaPrincipal)}
          detail="Equipos disponibles fisicamente en bodega."
          valueClassName="text-emerald-600"
        />
        <MetricCard
          label="En sedes"
          value={formatoNumero(summary.totalSedes)}
          detail="Equipos activos ubicados en sedes."
          valueClassName="text-sky-600"
        />
        <MetricCard
          label="Referencias criticas"
          value={formatoNumero(summary.referenciasBajoStock.length)}
          detail={`Con ${summary.umbralStockBajo} equipos o menos.`}
          valueClassName="text-amber-600"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="rounded-[26px] border border-[#ebe4d7] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">
                Stock por referencia
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Top actual por cantidad disponible.
              </p>
            </div>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-black text-white">
              {formatoNumero(summary.referenciasActivas)}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {summary.referencias.length === 0 ? (
              <InventoryEmptyState text="Sin inventario activo registrado." />
            ) : (
              summary.referencias.map((item) => (
                <InventoryReferenceRow key={`stock-${item.referencia}`} item={item} />
              ))
            )}
          </div>
        </div>

        <div className="rounded-[26px] border border-[#ebe4d7] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">
                Se esta acabando
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Referencias del catalogo con stock bajo o en cero.
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">
              0-{summary.umbralStockBajo}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {summary.referenciasBajoStock.length === 0 ? (
              <InventoryEmptyState text="Sin referencias criticas por ahora." />
            ) : (
              summary.referenciasBajoStock.map((item) => (
                <InventoryReferenceRow
                  key={`bajo-stock-${item.referencia}`}
                  item={item}
                  compact
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-[26px] border border-[#ebe4d7] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">
                Quietos en bodega
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Equipos sin movimiento hace {summary.umbralDiasQuieto} dias o mas.
              </p>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">
              Alerta
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {summary.quietosEnBodega.length === 0 ? (
              <InventoryEmptyState text="Sin equipos quietos dentro del umbral." />
            ) : (
              summary.quietosEnBodega.map((item) => (
                <InventoryStaleRow key={`quieto-${item.imei}`} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function DashboardRadarPage() {
  const session = await requireSessionPage();

  if (!esRolAdmin(session.rolNombre)) {
    redirect("/dashboard");
  }

  const summary = await getAdminInventorySummary();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] text-slate-950">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_52%,#0f766e_100%)] px-6 py-6 text-white shadow-[0_26px_85px_rgba(15,23,42,0.2)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">
                Panel admin
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                RADAR
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Control rapido de stock, referencias criticas y equipos quietos.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex min-h-[48px] w-max items-center justify-center rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_16px_38px_rgba(15,23,42,0.18)] transition hover:bg-slate-100"
            >
              Volver
            </Link>
          </div>
        </section>

        <div className="mt-6">
          <AdminInventoryRadarSection summary={summary} />
        </div>
      </main>
    </div>
  );
}
