import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { esRolAdministrativo } from "@/lib/access-control";
import {
  getMonthlyCommercialSummary,
  type CommercialRankingItem,
} from "@/lib/dashboard-commercial-summary";
import { getCurrentBogotaMonthInput } from "@/lib/ventas-utils";

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  })}`;
}

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
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
      <p
        className={[
          "mt-3 break-words text-3xl font-black tracking-tight",
          valueClassName,
        ].join(" ")}
      >
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function countText(countLabel: "venta" | "uso", total: number) {
  if (countLabel === "uso") {
    return total === 1 ? "uso" : "usos";
  }

  return total === 1 ? "venta" : "ventas";
}

function RankingRows({
  title,
  items,
  countLabel,
}: {
  title: string;
  items: CommercialRankingItem[];
  countLabel: "venta" | "uso";
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e6ddcf] bg-[#fcfaf6] px-4 py-4 text-sm text-slate-500">
          Sin movimientos registrados en este periodo.
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={`${title}-${item.nombre}-${index}`}
            className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {item.nombre}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {item.total} {countText(countLabel, item.total)}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function RankingPanel({
  title,
  accent,
  items,
  countLabel,
  toggleLabel,
}: {
  title: string;
  accent: string;
  items: CommercialRankingItem[];
  countLabel: "venta" | "uso";
  toggleLabel?: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#ebe4d7] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[10rem] text-sm font-black tracking-tight text-slate-950">
          {title}
        </p>
        <div className="flex items-center gap-2">
          {toggleLabel && (
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 transition hover:bg-amber-100 [&::-webkit-details-marker]:hidden">
                {toggleLabel}
              </summary>
              <div className="absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-auto rounded-2xl border border-[#e6ddcf] bg-white p-3 shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Montos
                </p>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                      Sin montos registrados.
                    </p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={`monto-${item.nombre}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-[#fcfbf8] px-3 py-2"
                      >
                        <span className="truncate text-xs font-bold text-slate-800">
                          {item.nombre}
                        </span>
                        <span className="shrink-0 text-xs font-black text-amber-700">
                          {formatoPesos(item.monto)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>
          )}
          <span className={["h-2.5 w-2.5 rounded-full", accent].join(" ")} />
        </div>
      </div>

      <details className="group mt-4">
        <summary className="flex w-max cursor-pointer list-none items-center rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-white [&::-webkit-details-marker]:hidden">
          Todos
        </summary>

        <div className="mt-3 hidden group-open:block">
          <RankingRows title={title} items={items} countLabel={countLabel} />
        </div>

        <div className="mt-3 group-open:hidden">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
            Top 5
          </p>
          <RankingRows
            title={title}
            items={items.slice(0, 5)}
            countLabel={countLabel}
          />
        </div>
      </details>
    </div>
  );
}

export default async function ReportesDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const session = await getSessionUser();

  if (!session) {
    return <div className="p-10">No autenticado</div>;
  }

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const periodoSeleccionado = params?.period || getCurrentBogotaMonthInput();
  const resumen = await getMonthlyCommercialSummary({
    period: periodoSeleccionado,
    sedeId: null,
  });
  const financieraLider = resumen.topFinancieras[0] ?? null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] px-4 py-8 text-slate-950">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[34px] border border-[#182233] bg-[linear-gradient(135deg,#101827_0%,#172033_48%,#7f1d1d_100%)] px-6 py-7 text-white shadow-[0_26px_85px_rgba(15,23,42,0.22)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_24%)]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-100">
                Panel admin
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                REPORTES
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                Consulta mensual consolidada de utilidad, ventas, caja y
                comportamiento comercial por ranking.
              </p>
            </div>

            <form className="flex flex-col gap-3 rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur sm:flex-row sm:items-end">
              <label className="flex flex-col gap-2 text-sm font-semibold text-white">
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

        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            label="Utilidad del mes"
            value={formatoPesos(resumen.utilidad)}
            detail={`Acumulado de ${resumen.periodo.label}.`}
            valueClassName="text-emerald-600"
          />
          <MetricCard
            label="Ventas del mes"
            value={formatoNumero(resumen.ventas)}
            detail="Registros comerciales del periodo."
          />
          <MetricCard
            label="Caja del mes"
            value={formatoPesos(resumen.caja)}
            detail="Movimiento consolidado del periodo."
          />
          <MetricCard
            label="Financiera lider"
            value={financieraLider?.nombre ?? "Sin datos"}
            detail={
              financieraLider
                ? `${financieraLider.total} usos | ${formatoPesos(financieraLider.monto)}`
                : "Sin movimientos registrados."
            }
          />
        </section>

        <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                Corte comercial
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Ranking del periodo
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Resumen compacto del comportamiento comercial del mes.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Periodo: {resumen.periodo.label}
              </div>
              <div className="rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Cobertura: todas las sedes
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
            <RankingPanel
              title="Ventas de Oficina"
              accent="bg-sky-500"
              items={resumen.topSedesJalador}
              countLabel="venta"
            />
            <RankingPanel
              title="Ventas Sede"
              accent="bg-emerald-500"
              items={resumen.topVentasSede}
              countLabel="venta"
            />
            <RankingPanel
              title="Ventas Jalador"
              accent="bg-sky-500"
              items={resumen.topJaladores}
              countLabel="venta"
            />
            <RankingPanel
              title="Ventas Cerrador"
              accent="bg-rose-500"
              items={resumen.topCerradores}
              countLabel="venta"
            />
            <RankingPanel
              title="Ventas Financieras"
              accent="bg-amber-500"
              items={resumen.topFinancieras}
              countLabel="uso"
              toggleLabel="Montos"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
