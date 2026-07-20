import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { esRolAdministrativo } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import {
  getMonthlyCommercialSummary,
  type CommercialRankingItem,
} from "@/lib/dashboard-commercial-summary";
import { getFinancialDashboardSummary } from "@/lib/dashboard-financial-summary";
import {
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthInput,
} from "@/lib/ventas-utils";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  })}`;
}

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function MetricCard({
  icon,
  iconClassName,
  label,
  value,
  detail,
  valueClassName = "text-slate-950",
}: {
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-h-[148px] min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={[
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            iconClassName,
          ].join(" ")}
        >
          <DashboardIcon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p
            className={[
              "mt-2 max-w-full text-[clamp(1.3rem,1.55vw,1.9rem)] font-black leading-tight tracking-tight [overflow-wrap:anywhere]",
              valueClassName,
            ].join(" ")}
          >
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function FinancialMetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "negative" | "warning" | "principal";
}) {
  const toneClasses = {
    neutral: {
      wrapper: "border-[#e7e3da] bg-white text-slate-950",
      label: "text-slate-400",
      detail: "text-slate-600",
    },
    positive: {
      wrapper: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "text-emerald-500",
      detail: "text-slate-600",
    },
    negative: {
      wrapper: "border-rose-200 bg-rose-50 text-rose-700",
      label: "text-rose-400",
      detail: "text-slate-600",
    },
    warning: {
      wrapper: "border-amber-200 bg-amber-50 text-amber-700",
      label: "text-amber-500",
      detail: "text-slate-600",
    },
    principal: {
      wrapper: "border-slate-900 bg-[#11161d] text-white",
      label: "text-slate-300",
      detail: "text-slate-100",
    },
  }[tone];
  const valorExtenso = value.length >= 15;

  return (
    <div
      className={[
        "min-w-0 rounded-2xl border px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]",
        toneClasses.wrapper,
      ].join(" ")}
    >
      <p
        className={[
          "text-[11px] font-semibold uppercase tracking-[0.22em]",
          toneClasses.label,
        ].join(" ")}
      >
        {label}
      </p>
      <p
        className={[
          "mt-3 max-w-full font-black leading-tight tabular-nums",
          valorExtenso
            ? "text-[clamp(0.95rem,1vw,1.2rem)] tracking-[-0.035em] [overflow-wrap:anywhere]"
            : "text-2xl tracking-tight [overflow-wrap:anywhere]",
        ].join(" ")}
      >
        {value}
      </p>
      <p className={["mt-2 text-sm leading-6", toneClasses.detail].join(" ")}>
        {detail}
      </p>
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
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          Sin movimientos registrados en este periodo.
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={`${title}-${item.nombre}-${index}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
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
              <div className="absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
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
                        className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
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
        <summary className="flex w-max cursor-pointer list-none items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] [&::-webkit-details-marker]:hidden">
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
  searchParams?: Promise<{ period?: string; sedeId?: string }>;
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
  const periodoCorte = getBogotaMonthRangeFromInput(periodoSeleccionado);
  const sedes = await prisma.sede.findMany({
    select: {
      id: true,
      nombre: true,
    },
    orderBy: {
      id: "asc",
    },
  });
  const sedeIdSolicitada = Number(params?.sedeId || 0);
  const sedeSeleccionada =
    Number.isInteger(sedeIdSolicitada) && sedeIdSolicitada > 0
      ? sedes.find((sede) => sede.id === sedeIdSolicitada) || null
      : null;
  const sedeSeleccionadaId = sedeSeleccionada?.id ?? null;
  const coberturaLabel = sedeSeleccionada?.nombre || "Todas las sedes";
  const [resumen, financiero] = await Promise.all([
    getMonthlyCommercialSummary({
      period: periodoSeleccionado,
      sedeId: sedeSeleccionadaId,
    }),
    getFinancialDashboardSummary({
      sedeId: sedeSeleccionadaId,
      fechaCorte: periodoCorte?.end ?? null,
    }),
  ]);
  const financieraLider = resumen.topFinancieras[0] ?? null;
  const totalFinancieras = Object.values(financiero.financieras || {}).reduce(
    (acc, valor) => acc + Number(valor || 0),
    0
  );
  const activos =
    financiero.cajaDisponible +
    financiero.saldoTransferencias +
    financiero.prestamosPorCobrar +
    financiero.valorBodega +
    totalFinancieras;
  const pasivos =
    financiero.deudaEquipos +
    financiero.valorPendiente +
    financiero.valorGarantia +
    financiero.totalGastosCartera;
  const resultadoNeto = activos - pasivos;
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
    { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
  ];
  const inicialesUsuario = String(session.nombre || session.usuario || "Admin")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard/reportes"
        coverageLabel={coberturaLabel}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Reportes
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Consolidado mensual comercial y financiero por cobertura
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {session.nombre || session.usuario}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {session.rolNombre}
                  </p>
                </div>
              </div>
              <LogoutButton
                variant="light"
                className="min-h-12 shrink-0 rounded-xl"
              />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <form className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Consulta mensual
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  Selecciona el corte del reporte
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Periodo actual: {resumen.periodo.label} · Cobertura: {coberturaLabel}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[190px] flex-col gap-2 text-sm font-semibold text-slate-700">
                Mes comercial
                <input
                  type="month"
                  name="period"
                  defaultValue={resumen.periodo.key}
                  className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
              </label>
              <label className="flex min-w-[220px] flex-col gap-2 text-sm font-semibold text-slate-700">
                Cobertura
                <select
                  name="sedeId"
                  defaultValue={sedeSeleccionadaId ? String(sedeSeleccionadaId) : ""}
                  className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                >
                  <option value="">Todas las sedes</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button className="min-h-[46px] rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#bd0711]">
                Consultar
              </button>
              <Link
                href="/dashboard"
                className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
              >
                Volver
              </Link>
              </div>
            </form>
          </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            icon="trend"
            iconClassName="bg-emerald-50 text-emerald-600"
            label="Utilidad del mes"
            value={formatoPesos(resumen.utilidad)}
            detail={`Acumulado de ${resumen.periodo.label}.`}
            valueClassName="text-emerald-600"
          />
          <MetricCard
            icon="sales"
            iconClassName="bg-red-50 text-[#e30613]"
            label="Ventas del mes"
            value={formatoNumero(resumen.ventas)}
            detail="Registros comerciales del periodo."
          />
          <MetricCard
            icon="cash"
            iconClassName="bg-blue-50 text-blue-600"
            label="Caja acumulada"
            value={formatoPesos(financiero.cajaDisponible)}
            detail={`Caja disponible al cierre de ${resumen.periodo.label}.`}
          />
          <MetricCard
            icon="loans"
            iconClassName="bg-violet-50 text-violet-600"
            label="Financiera lider"
            value={financieraLider?.nombre ?? "Sin datos"}
            detail={
              financieraLider
                ? `${financieraLider.total} usos | ${formatoPesos(financieraLider.monto)}`
                : "Sin movimientos registrados."
            }
          />
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Centro financiero
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                Lectura financiera {sedeSeleccionada ? "por sede" : "consolidada"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Lectura ejecutiva acumulada al cierre de{" "}
                <span className="font-bold text-slate-700">
                  {resumen.periodo.label}
                </span>
                , incluida en el reporte para consultar caja, activos, pasivos
                y riesgos de{" "}
                <span className="font-bold text-slate-700">{coberturaLabel}</span>.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[580px]">
              <FinancialMetricCard
                label="Resultado neto"
                value={formatoPesos(resultadoNeto)}
                detail="Activos menos pasivos."
                tone="principal"
              />
              <FinancialMetricCard
                label="Activos"
                value={formatoPesos(activos)}
                detail="Caja, cartera, bodega y prestamos por cobrar."
                tone="positive"
              />
              <FinancialMetricCard
                label="Pasivos"
                value={formatoPesos(pasivos)}
                detail="Deudas, pendientes, garantias y cartera."
                tone="negative"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FinancialMetricCard
              label="Caja disponible"
              value={formatoPesos(financiero.cajaDisponible)}
              detail="Ventas mas movimientos de caja."
              tone="positive"
            />
            <FinancialMetricCard
              label="Transferencias saldo"
              value={formatoPesos(financiero.saldoTransferencias)}
              detail="Transferencias menos abonos registrados."
              tone="positive"
            />
            <FinancialMetricCard
              label="Financieras saldo"
              value={formatoPesos(totalFinancieras)}
              detail="Pendiente neto por recaudar en financieras."
              tone="positive"
            />
            <FinancialMetricCard
              label="Prestamos por cobrar"
              value={formatoPesos(financiero.prestamosPorCobrar)}
              detail="Prestamos activos salientes pendientes de cierre o pago."
              tone="positive"
            />
            <FinancialMetricCard
              label="Deuda equipos"
              value={formatoPesos(financiero.deudaEquipos)}
              detail="Equipos con deuda financiera activa."
              tone="negative"
            />
            <FinancialMetricCard
              label="Pendiente"
              value={formatoPesos(financiero.valorPendiente)}
              detail="Inventario inmovilizado por estado pendiente."
              tone="negative"
            />
            <FinancialMetricCard
              label="Garantia"
              value={formatoPesos(financiero.valorGarantia)}
              detail="Valor comprometido en garantias."
              tone="negative"
            />
            <FinancialMetricCard
              label="Bodega"
              value={formatoPesos(financiero.valorBodega)}
              detail="Inventario disponible en estado bodega."
              tone="positive"
            />
            <FinancialMetricCard
              label="Gasto cartera"
              value={formatoPesos(financiero.totalGastosCartera)}
              detail="Salidas registradas en cartera."
              tone={financiero.totalGastosCartera <= 0 ? "positive" : "negative"}
            />
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Corte comercial
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                Ranking del periodo
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Resumen compacto del comportamiento comercial del mes.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                Periodo: {resumen.periodo.label}
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                Cobertura: {coberturaLabel}
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
    </div>
  );
}
