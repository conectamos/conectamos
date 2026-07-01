import Link from "next/link";
import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";
import { requireSessionPage } from "@/lib/page-access";
import ReferenceSalesPanel from "./reference-sales-panel";

type PercentageRankingItem = {
  nombre: string;
  total: number;
  porcentaje: number;
};

const BRAND_BAR_COLORS = [
  { marca: "INFINIX", className: "bg-emerald-600" },
  { marca: "XIAOMI", className: "bg-orange-500" },
  { marca: "SAMSUNG", className: "bg-blue-900" },
  { marca: "HONOR", className: "bg-sky-400" },
  { marca: "TECNO", className: "bg-orange-300" },
  { marca: "OPPO", className: "bg-green-600" },
  { marca: "MOTOROLA", className: "bg-slate-950" },
];

function colorMarca(nombre: string) {
  const marcaNormalizada = String(nombre || "").trim().toUpperCase();
  return (
    BRAND_BAR_COLORS.find(({ marca }) => marcaNormalizada.includes(marca))
      ?.className ?? "bg-violet-600"
  );
}

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoPorcentaje(valor: number) {
  return `${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 1,
  })}%`;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#e7e3da] bg-white px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function RankingBar({
  item,
  index,
}: {
  item: PercentageRankingItem;
  index: number;
}) {
  const barWidth = `${Math.min(
    100,
    Math.max(item.porcentaje, item.total > 0 ? 2 : 0)
  )}%`;
  const colorClass = colorMarca(item.nombre);

  return (
    <div className="grid gap-2 rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3 sm:grid-cols-[minmax(150px,220px)_minmax(0,1fr)_84px] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-950">
          {index + 1}. {item.nombre}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {formatoNumero(item.total)} {item.total === 1 ? "venta" : "ventas"}
        </p>
      </div>

      <div className="h-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className={["h-full rounded-full", colorClass].join(" ")}
          style={{ width: barWidth }}
        />
      </div>

      <p className="text-left text-sm font-black text-slate-950 sm:text-right">
        {formatoPorcentaje(item.porcentaje)}
      </p>
    </div>
  );
}

function RankingPanel({
  title,
  eyebrow,
  items,
  emptyText,
}: {
  title: string;
  eyebrow: string;
  items: PercentageRankingItem[];
  emptyText: string;
}) {
  return (
    <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            {eyebrow}
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
            {title}
          </h2>
        </div>
        <div className="w-max rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          {items.length} registros
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e6ddcf] bg-[#fcfaf6] px-4 py-4 text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          items.map((item, index) => (
            <RankingBar key={`${title}-${item.nombre}`} item={item} index={index} />
          ))
        )}
      </div>
    </section>
  );
}

export default async function TopMarcasVendidasPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const session = await requireSessionPage();
  const esAdmin = esRolAdministrativo(session.rolNombre);

  if (!esAdmin) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const resumen = await getMonthlyCommercialSummary({
    period: params?.period || null,
    sedeId: null,
  });
  const marcaLider = resumen.topMarcasVendidas[0] ?? null;
  const referenciaLider = resumen.topReferenciasVendidas[0] ?? null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] text-slate-950">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_52%,#0f766e_100%)] px-6 py-6 text-white shadow-[0_26px_85px_rgba(15,23,42,0.2)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">
                Administracion
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Top marcas vendidas
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Consulta mensual de marcas y referencias mas vendidas.
              </p>
            </div>

            <form className="flex flex-col gap-3 rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur sm:flex-row sm:items-end">
              <label className="flex min-w-[220px] flex-col gap-2 text-sm font-semibold text-white">
                Mes comercial
                <input
                  type="month"
                  name="period"
                  defaultValue={resumen.periodo.key}
                  className="min-h-[46px] rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
                />
              </label>
              <button className="min-h-[46px] rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-slate-100">
                Consultar
              </button>
              <Link
                href="/dashboard"
                className="inline-flex min-h-[46px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
              >
                Volver
              </Link>
            </form>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Periodo"
            value={resumen.periodo.label}
            detail="Corte mensual seleccionado."
          />
          <MetricCard
            label="Marca lider"
            value={marcaLider?.nombre ?? "Sin datos"}
            detail={
              marcaLider
                ? `${formatoNumero(marcaLider.total)} ventas | ${formatoPorcentaje(marcaLider.porcentaje)}`
                : "Sin ventas registradas."
            }
          />
          <MetricCard
            label="Referencia lider"
            value={referenciaLider?.nombre ?? "Sin datos"}
            detail={
              referenciaLider
                ? `${formatoNumero(referenciaLider.total)} ventas | ${formatoPorcentaje(referenciaLider.porcentaje)}`
                : "Sin ventas registradas."
            }
          />
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <RankingPanel
            title="Marcas vendidas"
            eyebrow="Grafica con porcentaje"
            items={resumen.topMarcasVendidas}
            emptyText="Sin marcas registradas en este periodo."
          />
          <ReferenceSalesPanel
            topItems={resumen.topReferenciasVendidas}
            allItems={resumen.referenciasVendidas}
          />
        </div>
      </main>
    </div>
  );
}
