import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import { esRolAdministrativo } from "@/lib/access-control";
import { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";
import { requireSessionPage } from "@/lib/page-access";
import ReferenceSalesPanel from "./reference-sales-panel";

type PercentageRankingItem = {
  nombre: string;
  total: number;
  porcentaje: number;
};

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoPorcentaje(valor: number) {
  return `${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 1,
  })}%`;
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function MetricCard({
  detail,
  icon,
  iconClassName,
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  detail: string;
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <article className="min-h-[142px] min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
        >
          <DashboardIcon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {label}
          </p>
          <p
            className={`mt-2 break-words text-[clamp(1.3rem,1.55vw,1.85rem)] font-black leading-tight tracking-tight ${valueClassName}`}
          >
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function RankingBar({ item, index }: { item: PercentageRankingItem; index: number }) {
  const barWidth = `${Math.min(
    100,
    Math.max(item.porcentaje, item.total > 0 ? 2 : 0)
  )}%`;

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition hover:border-red-200 hover:shadow-sm sm:grid-cols-[minmax(170px,1fr)_minmax(140px,1.15fr)_76px] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black",
            index === 0
              ? "bg-[#e30613] text-white"
              : "bg-slate-100 text-slate-700",
          ].join(" ")}
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{item.nombre}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatoNumero(item.total)} {item.total === 1 ? "venta" : "ventas"}
          </p>
        </div>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={index === 0 ? "h-full rounded-full bg-[#e30613]" : "h-full rounded-full bg-[#ff6b75]"}
          style={{ width: barWidth }}
        />
      </div>

      <p className="text-left text-sm font-black text-slate-950 sm:text-right">
        {formatoPorcentaje(item.porcentaje)}
      </p>
    </div>
  );
}

function BrandsPanel({ items }: { items: PercentageRankingItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
            <DashboardIcon name="trend" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e30613]">
              Participación por marca
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Marcas vendidas
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Distribución de las ventas del periodo seleccionado.
            </p>
          </div>
        </div>
        <span className="w-max rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
          {items.length} marcas
        </span>
      </div>

      <div className="mt-5 space-y-2.5">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No hay marcas registradas durante este periodo.
          </div>
        ) : (
          items.map((item, index) => (
            <RankingBar key={`marca-${item.nombre}`} item={item} index={index} />
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

  if (!esAdmin) redirect("/dashboard");

  const params = await searchParams;
  const resumen = await getMonthlyCommercialSummary({
    period: params?.period || null,
    sedeId: null,
  });
  const marcaLider = resumen.topMarcasVendidas[0] ?? null;
  const referenciaLider = resumen.topReferenciasVendidas[0] ?? null;
  const nombreUsuario = session.nombre || session.usuario || "Administrador";
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

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard/reportes"
        coverageLabel="Todas las sedes"
        items={navigationItems}
      />

      <div className="min-w-0 lg:pl-[252px]">
        <main className="mx-auto w-full max-w-[1700px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500" aria-label="Ruta de navegación">
                <Link href="/dashboard/reportes" className="transition hover:text-[#e30613]">
                  Reportes
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-800">Top marcas vendidas</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight text-slate-950 sm:text-[34px]">
                Top marcas vendidas
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 sm:text-base">
                Rendimiento mensual de marcas y referencias comercializadas
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm sm:min-w-[190px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {iniciales(nombreUsuario) || "AD"}
                </span>
                <div className="min-w-0">
                  <p className="max-w-40 truncate text-sm font-bold text-slate-900">
                    {nombreUsuario}
                  </p>
                  <p className="text-xs text-slate-500">{session.rolNombre}</p>
                </div>
              </div>
              <LogoutButton
                variant="light"
                className="min-h-12 rounded-xl text-xs font-black uppercase tracking-[0.06em]"
              />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <form className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e30613]">
                  Consulta mensual
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  Selecciona el periodo comercial
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Periodo actual: {resumen.periodo.label} · Cobertura: Todas las sedes
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex min-w-[210px] flex-col gap-2 text-xs font-bold text-slate-700">
                  Mes comercial
                  <span className="relative">
                    <DashboardIcon
                      name="calendar"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="month"
                      name="period"
                      defaultValue={resumen.periodo.key}
                      className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    />
                  </span>
                </label>
                <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#bd0711]">
                  <DashboardIcon name="search" className="h-4 w-4" />
                  Consultar
                </button>
                <Link
                  href="/dashboard/reportes"
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-[0.08em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  <DashboardIcon name="arrow" className="h-4 w-4 rotate-180" />
                  Volver
                </Link>
              </div>
            </form>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <MetricCard
              icon="sales"
              iconClassName="bg-red-50 text-[#e30613]"
              label="Ventas del periodo"
              value={formatoNumero(resumen.ventas)}
              detail={`Registros comerciales de ${resumen.periodo.label}.`}
            />
            <MetricCard
              icon="trend"
              iconClassName="bg-emerald-50 text-emerald-600"
              label="Marca líder"
              value={marcaLider?.nombre ?? "Sin datos"}
              detail={
                marcaLider
                  ? `${formatoNumero(marcaLider.total)} ventas · ${formatoPorcentaje(marcaLider.porcentaje)}`
                  : "Sin ventas registradas."
              }
              valueClassName="text-emerald-700"
            />
            <MetricCard
              icon="catalog"
              iconClassName="bg-slate-100 text-slate-700"
              label="Referencia líder"
              value={referenciaLider?.nombre ?? "Sin datos"}
              detail={
                referenciaLider
                  ? `${formatoNumero(referenciaLider.total)} ventas · ${formatoPorcentaje(referenciaLider.porcentaje)}`
                  : "Sin ventas registradas."
              }
            />
            <MetricCard
              icon="inventory"
              iconClassName="bg-orange-50 text-orange-600"
              label="Referencias con ventas"
              value={formatoNumero(resumen.referenciasVendidas.length)}
              detail="Referencias diferentes registradas en el periodo."
            />
          </section>

          <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <BrandsPanel items={resumen.topMarcasVendidas} />
            <ReferenceSalesPanel
              topItems={resumen.topReferenciasVendidas}
              allItems={resumen.referenciasVendidas}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
