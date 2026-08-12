import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";
import type { getDashboardCashSummary } from "@/lib/dashboard-financial-summary";
import type { DashboardOperationalSummary } from "@/lib/dashboard-overview";
import DashboardFilters from "./dashboard-filters";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";
import DashboardUtilityGate from "./dashboard-utility-gate";
import LogoutButton from "./logout-button";
import OperationsToolCenter, { type OperationsToolGroup } from "./operations-tool-center";

type CommercialSummary = Awaited<ReturnType<typeof getMonthlyCommercialSummary>>;
type FinancialSummary = Awaited<ReturnType<typeof getDashboardCashSummary>>;

type NavigationItem = {
  href: string;
  icon: DashboardIconName;
  label: string;
};

type SedeOption = {
  id: number;
  nombre: string;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  })}`;
}

function formatoCompacto(valor: number) {
  const absoluto = Math.abs(valor);
  const signo = valor < 0 ? "-" : "";

  if (absoluto >= 1_000_000_000) {
    return `${signo}$${(absoluto / 1_000_000_000).toFixed(1)} mil M`;
  }

  if (absoluto >= 1_000_000) {
    return `${signo}$${(absoluto / 1_000_000).toFixed(1)} M`;
  }

  if (absoluto >= 1_000) {
    return `${signo}$${(absoluto / 1_000).toFixed(0)} mil`;
  }

  return `${signo}$${absoluto.toFixed(0)}`;
}

function initials(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function SidebarContent({
  activeHref,
  coverageLabel,
  footerMode,
  items,
  panelLabel,
}: {
  activeHref?: string;
  coverageLabel: string;
  footerMode: "coverage" | "logout";
  items: NavigationItem[];
  panelLabel: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#11161d] text-white">
      <div className="flex h-[104px] shrink-0 items-center gap-3 border-b border-white/5 px-5">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/15 bg-[#e30613]">
          <Image
            src="/branding/conectamos-logo.png"
            alt="Logo CONECTAMOS"
            fill
            sizes="44px"
            className="object-cover"
            priority
          />
        </div>
        <div>
          <p className="text-[17px] font-black tracking-[0.035em]">CONECTAMOS</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.19em] text-white/45">
            {panelLabel}
          </p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-5" aria-label="Navegación principal">
        {items.map((item, index) => {
          const activo = activeHref ? item.href === activeHref : index === 0;

          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              aria-current={activo ? "page" : undefined}
              className={[
                "relative flex min-h-12 items-center gap-4 px-6 text-[15px] font-semibold transition",
                activo
                  ? "bg-white/[0.075] text-white"
                  : "text-slate-300 hover:bg-white/[0.045] hover:text-white",
              ].join(" ")}
            >
              {activo && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-[#e30613]" />}
              <DashboardIcon
                name={item.icon}
                className={[
                  "h-[22px] w-[22px] shrink-0",
                  activo ? "text-[#ff1f2d]" : "text-slate-400",
                ].join(" ")}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-5">
        {footerMode === "logout" ? (
          <LogoutButton className="w-full justify-start rounded-xl border-0 bg-transparent px-2 text-slate-200 shadow-none hover:bg-white/[0.06]" />
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.045] px-3 py-3">
            <DashboardIcon name="store" className="h-6 w-6 shrink-0 text-slate-300" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{coverageLabel}</p>
              <p className="mt-0.5 text-xs text-slate-400">Cobertura activa</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardSidebar({
  activeHref,
  coverageLabel,
  footerMode = "coverage",
  items,
  panelLabel = "Panel operativo",
}: {
  activeHref?: string;
  coverageLabel: string;
  footerMode?: "coverage" | "logout";
  items: NavigationItem[];
  panelLabel?: string;
}) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] lg:block">
        <SidebarContent
          activeHref={activeHref}
          coverageLabel={coverageLabel}
          footerMode={footerMode}
          items={items}
          panelLabel={panelLabel}
        />
      </aside>

      <div className="sticky top-0 z-50 border-b border-slate-200 bg-[#11161d] lg:hidden">
        <details className="group relative">
          <summary className="flex h-[70px] cursor-pointer list-none items-center justify-between px-4 text-white [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-full bg-[#e30613]">
                <Image
                  src="/branding/conectamos-logo.png"
                  alt="Logo CONECTAMOS"
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              </div>
              <span className="text-base font-black tracking-wide">CONECTAMOS</span>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 group-open:hidden">
              <DashboardIcon name="menu" className="h-6 w-6" />
            </span>
            <span className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 group-open:flex">
              <DashboardIcon name="close" className="h-6 w-6" />
            </span>
          </summary>
          <div className="absolute inset-x-0 top-full max-h-[calc(100vh-70px)] overflow-y-auto shadow-2xl">
            <SidebarContent
              activeHref={activeHref}
              coverageLabel={coverageLabel}
              footerMode={footerMode}
              items={items}
              panelLabel={panelLabel}
            />
          </div>
        </details>
      </div>
    </>
  );
}

function KpiCard({
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
    <article className="min-h-[144px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
          <DashboardIcon name={icon} className="h-6 w-6" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className={`mt-1.5 break-words text-[27px] font-black leading-tight tracking-tight ${valueClassName}`}>
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function SalesUtilityChart({
  data,
  mostrarUtilidad,
}: {
  data: CommercialSummary["tendenciaDiaria"];
  mostrarUtilidad: boolean;
}) {
  const width = 860;
  const height = 285;
  const padding = { top: 28, right: 84, bottom: 42, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const rawSalesMax = Math.max(0, ...data.map((item) => item.ventas));
  const salesMax = Math.max(4, Math.ceil(rawSalesMax / 4) * 4);
  const utilityMax = Math.max(0, ...data.map((item) => item.utilidad));
  const utilityMin = Math.min(0, ...data.map((item) => item.utilidad));
  const utilityRange = utilityMax - utilityMin || 1;
  const hasData = data.some((item) => item.ventas > 0 || (mostrarUtilidad && item.utilidad !== 0));
  const xAt = (index: number) =>
    padding.left + (index / Math.max(1, data.length - 1)) * innerWidth;
  const salesPoint = (value: number, index: number) => {
    const x = xAt(index);
    const y = padding.top + ((salesMax - value) / salesMax) * innerHeight;
    return { x, y };
  };
  const utilityPoint = (value: number, index: number) => {
    const x = padding.left + (index / Math.max(1, data.length - 1)) * innerWidth;
    const y = padding.top + ((utilityMax - value) / utilityRange) * innerHeight;
    return { x, y };
  };
  const ventasPoints = data.map((item, index) => salesPoint(item.ventas, index));
  const utilidadPoints = data.map((item, index) => utilityPoint(item.utilidad, index));

  if (!hasData) {
    return (
      <div className="flex min-h-[285px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
        <DashboardIcon name="trend" className="h-9 w-9 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-700">Sin ventas en este periodo</p>
        <p className="mt-1 text-sm text-slate-500">La gráfica aparecerá cuando existan registros comerciales.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-h-[285px] min-w-[700px] w-full"
        role="img"
        aria-label={mostrarUtilidad ? "Número de ventas y utilidad por día" : "Número de ventas por día"}
      >
        <text x={padding.left} y="13" fill="#e30613" fontSize="9" fontWeight="700" letterSpacing="0.08em">
          VENTAS
        </text>
        {mostrarUtilidad && (
          <text
            x={width - padding.right}
            y="13"
            textAnchor="end"
            fill="#159455"
            fontSize="9"
            fontWeight="700"
            letterSpacing="0.08em"
          >
            UTILIDAD ($)
          </text>
        )}

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * innerHeight;
          const salesValue = Math.round(salesMax * (1 - ratio));
          const utilityValue = utilityMax - ratio * utilityRange;
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">
                {salesValue}
              </text>
              {mostrarUtilidad && (
                <text x={width - padding.right + 10} y={y + 4} textAnchor="start" fill="#64748b" fontSize="10">
                  {formatoCompacto(utilityValue)}
                </text>
              )}
            </g>
          );
        })}

        {data.map((item, index) => {
          const shouldLabel = index === 0 || index === data.length - 1 || index % 5 === 4;
          if (!shouldLabel) return null;
          const x = xAt(index);
          return (
            <text key={item.fecha} x={x} y={height - 13} textAnchor="middle" fill="#64748b" fontSize="11">
              {item.etiqueta}
            </text>
          );
        })}

        <polyline
          points={ventasPoints.map(({ x, y }) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="#e30613"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {mostrarUtilidad && (
          <polyline
            points={utilidadPoints.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#159455"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {ventasPoints.map(({ x, y }, index) => (
          <circle key={`venta-${data[index].fecha}`} cx={x} cy={y} r="3.4" fill="#e30613">
            <title>{`${data[index].fecha}: ${data[index].ventas} ${data[index].ventas === 1 ? "venta" : "ventas"}`}</title>
          </circle>
        ))}
        {mostrarUtilidad &&
          utilidadPoints.map(({ x, y }, index) => (
            <circle key={`utilidad-${data[index].fecha}`} cx={x} cy={y} r="2.8" fill="#159455">
              <title>{`${data[index].fecha}: utilidad ${formatoPesos(data[index].utilidad)}`}</title>
            </circle>
          ))}
      </svg>
    </div>
  );
}

function AlertRow({
  count,
  detail,
  href,
  icon,
  tone,
  title,
}: {
  count: number;
  detail: string;
  href: string;
  icon: DashboardIconName;
  tone: "red" | "orange" | "amber";
  title: string;
}) {
  const tones = {
    red: "border-red-100 bg-red-50 text-red-600",
    orange: "border-orange-100 bg-orange-50 text-orange-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
  };

  return (
    <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-4 first:border-t-0">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tones[tone]}`}>
        <DashboardIcon name={icon} className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">
          <span className="mr-1.5 text-lg font-black">{count}</span>
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
      <Link
        href={href}
        className="hidden rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#e30613]/30 hover:text-[#e30613] sm:inline-flex"
      >
        Revisar
      </Link>
    </div>
  );
}

function PerformancePanel({
  items,
  mostrarSoloVentas,
}: {
  items: CommercialSummary["rendimientoPorSede"];
  mostrarSoloVentas: boolean;
}) {
  const visibles = (mostrarSoloVentas
    ? [...items].sort(
        (a, b) =>
          b.ventas - a.ventas || a.nombre.localeCompare(b.nombre, "es")
      )
    : items
  ).slice(0, 5);
  const max = Math.max(
    1,
    ...visibles.map((item) =>
      mostrarSoloVentas ? item.ventas : item.ingresos
    )
  );

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-black tracking-tight text-slate-950">Rendimiento por sede</h2>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600">
          Ventas del periodo
        </span>
      </div>
      {visibles.length === 0 ? (
        <div className="mt-5 flex min-h-[190px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 text-center text-sm text-slate-500">
          Sin rendimiento por sede para mostrar.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visibles.map((item) => (
            <div key={item.sedeId} className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
              <p className="truncate text-xs font-bold text-slate-600" title={item.nombre}>
                {item.nombre}
              </p>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 min-w-[5px] rounded-r bg-[#e30613]"
                    style={{
                      width: `${Math.max(
                        3,
                        ((mostrarSoloVentas ? item.ventas : item.ingresos) /
                          max) *
                          100
                      )}%`,
                    }}
                  />
                  <span className="shrink-0 text-xs font-bold text-slate-700">
                    {mostrarSoloVentas
                      ? `${item.ventas} ${item.ventas === 1 ? "venta" : "ventas"}`
                      : formatoPesos(item.ingresos)}
                  </span>
                </div>
                {!mostrarSoloVentas && (
                  <p className="mt-1 text-[11px] text-slate-400">{item.ventas} {item.ventas === 1 ? "venta" : "ventas"}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LeadingFinancialPanel({
  financieras,
  ocultarMonto,
}: {
  financieras: CommercialSummary["topFinancieras"];
  ocultarMonto: boolean;
}) {
  const lider = financieras[0] ?? null;
  const montoTotal = financieras.reduce((total, item) => total + item.monto, 0);
  const usosTotales = financieras.reduce((total, item) => total + item.total, 0);
  const participacion = lider
    ? !ocultarMonto && montoTotal > 0
      ? (lider.monto / montoTotal) * 100
      : usosTotales > 0
        ? (lider.total / usosTotales) * 100
        : 0
    : 0;

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <h2 className="text-xl font-black tracking-tight text-slate-950">Financiera líder</h2>
      {!lider ? (
        <div className="mt-5 flex min-h-[190px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 text-center text-sm text-slate-500">
          Sin usos de financieras en el periodo.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_120px] items-center gap-4">
          <div className="min-w-0">
            <p className="truncate text-[25px] font-black tracking-tight text-slate-950" title={lider.nombre}>
              {lider.nombre}
            </p>
            <div className={ocultarMonto ? "mt-5" : "mt-5 grid grid-cols-2 gap-4"}>
              <div>
                <p className="text-xl font-black text-slate-950">{lider.total}</p>
                <p className="mt-1 text-xs text-slate-500">Usos totales</p>
              </div>
              {!ocultarMonto && (
                <div>
                  <p className="text-base font-black text-slate-950">{formatoPesos(lider.monto)}</p>
                  <p className="mt-1 text-xs text-slate-500">Monto financiado</p>
                </div>
              )}
            </div>
          </div>
          <div
            className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#e30613 ${Math.min(100, Math.max(0, participacion))}%, #e8eaee 0)` }}
            aria-label={`${participacion.toFixed(1)}% de participación`}
          >
            <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-white">
              <span className="text-lg font-black text-slate-950">{participacion.toFixed(0)}%</span>
              <span className="text-[10px] text-slate-500">Participación</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PayJoyAdvisorsPanel({
  asesores,
}: {
  asesores: CommercialSummary["topAsesoresPayJoy"];
}) {
  const ranking = asesores.slice(0, 10);
  const lider = ranking[0];
  const podioSecundario = ranking.slice(1, 3);
  const clasificacion = ranking.slice(3);
  const inicialesAsesor = (nombre: string) =>
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join("") || "--";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
            <DashboardIcon name="sales" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Top asesores PAYJOY</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ventas registradas del periodo seleccionado.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
            {ranking.length} {ranking.length === 1 ? "clasificado" : "clasificados"}
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#e30613]">
            Top 10
          </span>
        </div>
      </header>

      {ranking.length === 0 ? (
        <div className="m-5 flex min-h-[190px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 text-center text-sm text-slate-500 sm:m-6">
          No hay ventas PAYJOY con asesor en el periodo.
        </div>
      ) : (
        <div
          className={`grid items-start gap-5 p-5 sm:p-6 ${
            clasificacion.length > 0
              ? "xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]"
              : ""
          }`}
        >
          <div className="min-w-0">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Podio del periodo
            </p>

            {lider ? (
              <article
                className="relative overflow-hidden rounded-2xl border border-red-200 bg-red-50/60 p-4 sm:p-5"
                aria-label={`Puesto 1, ${lider.nombre}, ${lider.total} ${lider.total === 1 ? "venta" : "ventas"}`}
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-[#e30613]" />
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="relative shrink-0 self-start sm:self-auto">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e30613] text-base font-black text-white shadow-sm">
                      {inicialesAsesor(lider.nombre)}
                    </span>
                    <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-red-50 bg-[#11161d] text-[10px] font-black text-white">
                      1
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e30613]">
                      {"L\u00edder del per\u00edodo"}
                    </p>
                    <h3 className="mt-1 truncate text-lg font-black text-slate-950 sm:text-xl" title={lider.nombre}>
                      {lider.nombre}
                    </h3>
                  </div>
                  <div className="w-fit shrink-0 rounded-xl border border-red-100 bg-white px-4 py-2.5 sm:text-right">
                    <strong className="block text-2xl font-black leading-none text-slate-950">{lider.total}</strong>
                    <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      {lider.total === 1 ? "venta" : "ventas"}
                    </span>
                  </div>
                </div>
              </article>
            ) : null}

            {podioSecundario.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {podioSecundario.map((asesor, index) => {
                  const puesto = index + 2;
                  return (
                    <article
                      key={`${puesto}-${asesor.nombre}`}
                      className="min-h-[82px] min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.035)]"
                      aria-label={`Puesto ${puesto}, ${asesor.nombre}, ${asesor.total} ${asesor.total === 1 ? "venta" : "ventas"}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-700">
                            {inicialesAsesor(asesor.nombre)}
                          </span>
                          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#11161d] text-[9px] font-black text-white">
                            {puesto}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-900" title={asesor.nombre}>
                            {asesor.nombre}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {asesor.total} {asesor.total === 1 ? "venta" : "ventas"}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>

          {clasificacion.length > 0 ? (
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {"Clasificaci\u00f3n general"}
                </p>
                <span className="text-[10px] font-bold text-slate-400">Puestos 4-10</span>
              </div>
              <ol start={4} className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {clasificacion.map((asesor, index) => {
                  const puesto = index + 4;
                  return (
                    <li
                      key={`${puesto}-${asesor.nombre}`}
                      className="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 sm:px-4"
                      aria-label={`Puesto ${puesto}, ${asesor.nombre}, ${asesor.total} ${asesor.total === 1 ? "venta" : "ventas"}`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-700">
                        {puesto}
                      </span>
                      <span className="min-w-0 truncate text-xs font-bold text-slate-800" title={asesor.nombre}>
                        {asesor.nombre}
                      </span>
                      <span className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-black text-slate-950">
                        {asesor.total} {asesor.total === 1 ? "venta" : "ventas"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
function QuickActions({
  actions = [
    { href: "/ventas/nuevo", icon: "sales", label: "Nueva venta" },
    { href: "/inventario/nuevo", icon: "inventory", label: "Nuevo inventario" },
    { href: "/caja/gestion", icon: "cash", label: "Registrar egreso" },
    { href: "/dashboard/analitico", icon: "reports", label: "Ver reportes" },
  ],
}: {
  actions?: NavigationItem[];
}) {

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <h2 className="text-xl font-black tracking-tight text-slate-950">Accesos rápidos</h2>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {actions.map((action, index) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex min-h-[72px] items-center gap-3 rounded-xl border border-slate-200 px-3.5 transition hover:border-[#e30613]/35 hover:bg-red-50/40"
          >
            <span className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              index === 0 ? "bg-red-50 text-[#e30613]" : index === 1 ? "bg-blue-50 text-blue-600" : index === 2 ? "bg-orange-50 text-orange-600" : "bg-violet-50 text-violet-600",
            ].join(" ")}>
              <DashboardIcon name={action.icon} className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-slate-700 group-hover:text-slate-950">{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StandInventoryContent({
  coverageLabel,
  operational,
  operationalAvailable,
  quickActions,
  toolGroups,
  usuario,
}: {
  coverageLabel: string;
  operational: DashboardOperationalSummary;
  operationalAvailable: boolean;
  quickActions: NavigationItem[];
  toolGroups: OperationsToolGroup[];
  usuario: string;
}) {
  return (
    <>
      <section
        className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Indicadores del stand"
      >
        <KpiCard
          label="Equipos en bodega"
          value={
            operationalAvailable
              ? String(operational.equiposEnBodega)
              : "No disponible"
          }
          detail={
            operationalAvailable
              ? "Unidades disponibles en el stand"
              : "No se pudo actualizar este indicador"
          }
          icon="inventory"
          iconClassName="bg-slate-100 text-slate-700"
        />
        <KpiCard
          label="Préstamos activos"
          value={
            operationalAvailable
              ? String(operational.prestamosActivos)
              : "No disponible"
          }
          detail={
            operationalAvailable
              ? "Equipos pendientes de cierre o devolución"
              : "No se pudo actualizar este indicador"
          }
          icon="loans"
          iconClassName="bg-orange-50 text-orange-600"
        />
        <KpiCard
          label="Equipos por revisar"
          value={
            operationalAvailable
              ? String(operational.inventarioAtencion)
              : "No disponible"
          }
          detail={
            operationalAvailable
              ? "Inventario en estado pendiente o garantía"
              : "No se pudo actualizar este indicador"
          }
          icon="warning"
          iconClassName="bg-red-50 text-[#e30613]"
          valueClassName={
            operationalAvailable && operational.inventarioAtencion > 0
              ? "text-[#e30613]"
              : "text-slate-950"
          }
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
              <DashboardIcon name="store" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#e30613]">
                Operación activa
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                Gestión de {coverageLabel}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Accede al inventario y controla los préstamos asignados a este
                stand.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/inventario"
              className="group flex min-h-[112px] items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 transition hover:border-[#e30613]/30 hover:bg-red-50/40"
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.13em] text-slate-500">
                  Control
                </p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  Inventario
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Existencias y trazabilidad
                </p>
              </div>
              <DashboardIcon
                name="inventory"
                className="h-7 w-7 text-slate-500 transition group-hover:text-[#e30613]"
              />
            </Link>
            <Link
              href="/prestamos"
              className="group flex min-h-[112px] items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 transition hover:border-[#e30613]/30 hover:bg-red-50/40"
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.13em] text-slate-500">
                  Seguimiento
                </p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  Préstamos
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Entregas, pagos y devoluciones
                </p>
              </div>
              <DashboardIcon
                name="loans"
                className="h-7 w-7 text-slate-500 transition group-hover:text-[#e30613]"
              />
            </Link>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex items-center justify-between gap-3 px-5 py-5">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                Alertas operativas
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Pendientes de {coverageLabel.toLowerCase()}
              </p>
            </div>
            <Link
              href="/alertas/prestamos"
              className="text-xs font-black text-[#e30613] hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {!operationalAvailable ? (
            <div className="border-t border-slate-100 px-5 py-14 text-center">
              <p className="text-sm font-bold text-slate-700">
                Alertas no disponibles
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Reintenta la actualización para consultar el estado.
              </p>
            </div>
          ) : operational.prestamosActivos === 0 &&
            operational.inventarioAtencion === 0 ? (
            <div className="border-t border-slate-100 px-5 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <DashboardIcon name="approvals" className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-700">
                Sin alertas activas
              </p>
              <p className="mt-1 text-xs text-slate-500">
                No hay préstamos o equipos pendientes de revisión.
              </p>
            </div>
          ) : (
            <div className="border-t border-slate-100">
              <AlertRow
                count={operational.prestamosActivos}
                title="préstamos sin cierre"
                detail="Préstamos aprobados que continúan activos"
                href="/prestamos"
                icon="loans"
                tone="orange"
              />
              <AlertRow
                count={operational.inventarioAtencion}
                title="equipos requieren revisión"
                detail="Inventario en estado PENDIENTE o GARANTÍA"
                href="/inventario"
                icon="warning"
                tone="amber"
              />
            </div>
          )}
        </article>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
        <QuickActions actions={quickActions} />
        <OperationsToolCenter groups={toolGroups} storageUserKey={usuario} />
      </section>
    </>
  );
}

export default function OperationsDashboard({
  commercial,
  commercialAvailable = true,
  coverageLabel,
  detailedRankings,
  esAdmin,
  esStand = false,
  esStandSoloInventario = false,
  esSupervisor,
  financial,
  financialAvailable = true,
  navigationItems,
  operational,
  operationalAvailable = true,
  period,
  periodLabel,
  puedeVerEquality,
  puedeVerFacturacion,
  puedeVerReporteSiigo,
  rolUsuario,
  sedeId,
  sedes,
  usuario,
}: {
  commercial: CommercialSummary;
  commercialAvailable?: boolean;
  coverageLabel: string;
  detailedRankings?: ReactNode;
  esAdmin: boolean;
  esStand?: boolean;
  esStandSoloInventario?: boolean;
  esSupervisor: boolean;
  financial: FinancialSummary | null;
  financialAvailable?: boolean;
  navigationItems: NavigationItem[];
  operational: DashboardOperationalSummary;
  operationalAvailable?: boolean;
  period: string;
  periodLabel: string;
  puedeVerEquality: boolean;
  puedeVerFacturacion: boolean;
  puedeVerReporteSiigo: boolean;
  rolUsuario: string;
  sedeId: number | null;
  sedes: SedeOption[];
  usuario: string;
}) {
  const modoSupervisorSinMontos = esSupervisor && !esAdmin;
  const datosParciales =
    esStandSoloInventario
      ? !operationalAvailable
      : !commercialAvailable || !financialAvailable || !operationalAvailable;
  const reportHref = esAdmin ? "/dashboard/reportes" : "/dashboard/analitico";
  const defaultToolGroups: OperationsToolGroup[] = [
    {
      title: "Inventario y préstamos",
      description: "Bodega, historial y movimientos entre sedes.",
      icon: "inventory",
      links: [
        ...(esAdmin ? [{ href: "/inventario-principal", label: "Bodega principal" }] : []),
        { href: "/inventario/historial", label: "Historial IMEI" },
        { href: "/prestamos/nuevo", label: "Nuevo préstamo" },
        { href: "/dashboard/deuda-sedes", label: "Deuda entre sedes" },
        { href: "/alertas/prestamos", label: "Alertas" },
      ],
    },
    {
      title: "Caja y finanzas",
      description: "Cierres, arqueo, cartera y control financiero.",
      icon: "cash",
      links: [
        { href: "/caja/cierre-dia", label: "Cierre del día" },
        { href: "/caja/gestion", label: "Ingresos / gastos" },
        { href: "/caja/arqueo", label: "Arqueo" },
        { href: "/dashboard/financiero", label: "Panel financiero" },
        { href: esAdmin ? "/dashboard/financiero/cartera" : "/caja/cartera", label: "Cartera" },
      ],
    },
    {
      title: "Registro comercial",
      description: "Flujo de vendedores, validaciones y consulta.",
      icon: "sales",
      links: [
        { href: "/vendedor/registros", label: "Registrar venta" },
        { href: "/vendedor/lista-negra", label: "Lista negra" },
        { href: "/vendedor/registros/buscar", label: "Buscar registro" },
        { href: "/ventas/aprobaciones", label: "Aprobar ventas" },
        ...(!esAdmin ? [{ href: "/vendedor/lista-precios", label: "Lista de precios" }] : []),
      ],
    },
    ...(esAdmin || esSupervisor
      ? [
          {
            title: "Funciones",
            description: "Consultas y revisiones operativas.",
            icon: "reports" as const,
            links: [
              { href: "/dashboard/radar", label: "Abrir radar" },
              {
                href: "/vendedor/registros/inconsistencias",
                label: "Inconsistencias de créditos",
              },
            ],
          },
        ]
      : []),
    ...(esAdmin || esSupervisor
      ? [
          {
            title: "Análisis",
            description: "Indicadores, comparativos y reportes de la operación.",
            icon: "reports" as const,
            links: [
              { href: "/dashboard/analitico", label: "Panel analítico" },
              ...(esAdmin
                ? [{ href: "/dashboard/reportes", label: "Reportes" }]
                : []),
            ],
          },
        ]
      : []),
    ...(puedeVerFacturacion
      ? [
          {
            title: "Facturación",
            description: "Registros pendientes y consulta Siigo.",
            icon: "approvals" as const,
            links: [
              { href: esAdmin ? "/dashboard/registros" : "/facturador/registros", label: "Abrir facturación" },
              ...(puedeVerReporteSiigo
                ? [{ href: esAdmin ? "/dashboard/registros#reporte-siigo" : "/facturador/registros#reporte-siigo", label: "Reporte Siigo" }]
                : []),
              ...(esAdmin ? [{ href: "/dashboard/facturacion/base-datos", label: "Base de datos" }] : []),
            ],
          },
        ]
      : []),
    ...(esAdmin
      ? [
          {
            title: "Administración",
            description: "Sedes, perfiles, catálogos, auditoría y seguridad.",
            icon: "settings" as const,
            links: [
              { href: "/dashboard/sedes", label: "Sedes" },
              { href: "/ventas/perfiles", label: "Perfiles" },
              { href: "/ventas/equipo-comercial", label: "Catálogos" },
              { href: "/dashboard/lista-precios", label: "Lista de precios" },
              { href: "/dashboard/top-marcas-vendidas", label: "Top marcas" },
              { href: "/dashboard/auditoria", label: "Auditoría" },
              { href: "/dashboard/seguridad/mensaje-vendedor", label: "Mensajes" },
              { href: "/dashboard/seguridad", label: "Seguridad" },
            ],
          },
          {
            title: "Plataformas financieras",
            description: "Consultas y carteras externas activas.",
            icon: "loans" as const,
            links: [
              { href: "/dashboard/sumaspay", label: "SUMASPAY" },
              { href: "/dashboard/payjoy", label: "PayJoy" },
              { href: "/dashboard/payjoy/40-60", label: "PayJoy 40/60" },
              { href: "/dashboard/nuovopay", label: "NUOVO" },
              { href: "/dashboard/nuovopay/cartera", label: "Cartera NUOVO" },
              ...(puedeVerEquality ? [{ href: "/dashboard/equality", label: "Trustonic" }] : []),
            ],
          },
        ]
      : puedeVerEquality
        ? [
            {
              title: "Plataformas",
              description: "Herramientas habilitadas para seguimiento operativo.",
              icon: "settings" as const,
              links: [
                { href: "/dashboard/nuovopay", label: "NUOVO" },
                { href: "/dashboard/equality", label: "Trustonic" },
              ],
            },
          ]
        : []),
  ];
  const standToolGroups: OperationsToolGroup[] = [
    {
      title: "Inventario",
      description: "Existencias, cargas y trazabilidad del stand.",
      icon: "inventory",
      links: [
        { href: "/inventario", label: "Ver inventario" },
        { href: "/inventario/nuevo", label: "Nuevo inventario" },
        { href: "/inventario/historial", label: "Historial IMEI" },
      ],
    },
    {
      title: "Ventas",
      description: "Registro y seguimiento comercial del stand.",
      icon: "sales",
      links: [
        { href: "/ventas", label: "Ver ventas" },
        { href: "/ventas/nuevo", label: "Nueva venta" },
      ],
    },
    {
      title: "Caja",
      description: "Movimientos, cierre y control diario del stand.",
      icon: "cash",
      links: [
        { href: "/caja", label: "Ver caja" },
        { href: "/caja/cierre-dia", label: "Cierre del día" },
        { href: "/caja/gestion", label: "Ingresos / gastos" },
        { href: "/caja/arqueo", label: "Arqueo" },
        { href: "/dashboard/financiero", label: "Panel financiero" },
        { href: "/caja/cartera", label: "Cartera" },
      ],
    },
    {
      title: "Análisis",
      description: "Indicadores y comparativos de la operación.",
      icon: "reports",
      links: [{ href: "/dashboard/analitico", label: "Panel analítico" }],
    },
  ];
  const standInventoryToolGroups: OperationsToolGroup[] = [
    {
      title: "Inventario",
      description: "Existencias y trazabilidad de equipos del stand.",
      icon: "inventory",
      links: [
        { href: "/inventario", label: "Ver inventario" },
        { href: "/inventario/nuevo", label: "Nuevo inventario" },
        { href: "/inventario/historial", label: "Historial IMEI" },
      ],
    },
    {
      title: "Préstamos",
      description: "Traslados, pagos, devoluciones y alertas pendientes.",
      icon: "loans",
      links: [
        { href: "/prestamos", label: "Ver préstamos" },
        { href: "/prestamos/nuevo", label: "Nuevo préstamo" },
        { href: "/dashboard/deuda-sedes", label: "Deuda entre sedes" },
        { href: "/alertas/prestamos", label: "Alertas" },
      ],
    },
  ];
  const toolGroups = esStandSoloInventario
    ? standInventoryToolGroups
    : esStand
      ? standToolGroups
      : defaultToolGroups;
  const quickActions: NavigationItem[] = esStandSoloInventario
    ? [
        { href: "/inventario", icon: "inventory", label: "Ver inventario" },
        {
          href: "/inventario/nuevo",
          icon: "inventory",
          label: "Nuevo inventario",
        },
        { href: "/prestamos", icon: "loans", label: "Ver préstamos" },
        { href: "/prestamos/nuevo", icon: "loans", label: "Nuevo préstamo" },
      ]
    : esStand
    ? [
        { href: "/ventas/nuevo", icon: "sales", label: "Nueva venta" },
        { href: "/inventario/nuevo", icon: "inventory", label: "Nuevo inventario" },
        { href: "/caja/gestion", icon: "cash", label: "Registrar movimiento" },
        { href: "/caja/cierre-dia", icon: "reports", label: "Cierre del día" },
      ]
    : [
        { href: "/ventas/nuevo", icon: "sales", label: "Nueva venta" },
        { href: "/inventario/nuevo", icon: "inventory", label: "Nuevo inventario" },
        { href: "/caja/gestion", icon: "cash", label: "Registrar egreso" },
        {
          href: reportHref,
          icon: "reports",
          label: esAdmin ? "Ver reportes" : "Panel analítico",
        },
      ];

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        coverageLabel={coverageLabel}
        items={navigationItems}
        panelLabel={esStand ? "Panel del stand" : "Panel operativo"}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[27px] font-black tracking-tight text-slate-950 sm:text-[31px]">
                {esStand ? "Panel del stand" : "Panel administrativo"}
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                {esStand
                  ? `Resumen operativo de ${coverageLabel}`
                  : "Resumen general de la operación"}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                {esStandSoloInventario ? (
                  <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
                    <DashboardIcon
                      name="store"
                      className="h-5 w-5 text-slate-500"
                    />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Cobertura
                      </p>
                      <p className="text-sm font-bold text-slate-800">
                        {coverageLabel}
                      </p>
                    </div>
                  </div>
                ) : (
                  <DashboardFilters
                    esAdmin={esAdmin}
                    period={period}
                    sedeId={sedeId}
                    sedeLabel={coverageLabel}
                    sedes={sedes}
                  />
                )}
                <div className="flex items-center gap-2">
                  {!esStand && (
                    <Link
                      href="/dashboard/aprobaciones"
                      aria-label={
                        operationalAvailable
                          ? `${operational.pendientesTotal} alertas operativas`
                          : "Alertas operativas no disponibles"
                      }
                      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:text-[#e30613]"
                    >
                      <DashboardIcon name="bell" className="h-6 w-6" />
                      {operationalAvailable && operational.pendientesTotal > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#e30613] px-1 text-[10px] font-black text-white">
                          {operational.pendientesTotal > 99 ? "99+" : operational.pendientesTotal}
                        </span>
                      )}
                    </Link>
                  )}
                  <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[190px]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                      {initials(usuario) || <DashboardIcon name="user" className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{usuario}</p>
                      <p className="truncate text-xs text-slate-500">{rolUsuario}</p>
                    </div>
                  </div>
                  <LogoutButton variant="light" className="min-h-12 shrink-0 px-4" />
                </div>
              </div>
            </div>
          </header>

          {datosParciales && (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black">Actualización parcial del dashboard</p>
                <p className="mt-0.5 text-xs leading-5 text-amber-800">
                  Algunos indicadores no se pudieron actualizar. El resto del panel sigue disponible y ningún dato fue modificado.
                </p>
              </div>
              <Link
                href={`/dashboard?period=${encodeURIComponent(period)}${
                  sedeId ? `&sedeId=${sedeId}` : ""
                }`}
                className="w-fit shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-amber-900 transition hover:bg-amber-100"
              >
                Reintentar datos
              </Link>
            </div>
          )}

          {esStandSoloInventario ? (
            <StandInventoryContent
              coverageLabel={coverageLabel}
              operational={operational}
              operationalAvailable={operationalAvailable}
              quickActions={quickActions}
              toolGroups={toolGroups}
              usuario={usuario}
            />
          ) : (
            <>
          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5" aria-label="Indicadores principales">
            <KpiCard
              label="Ventas del periodo"
              value={commercialAvailable ? String(commercial.ventas) : "No disponible"}
              detail={
                !commercialAvailable
                  ? "No se pudo actualizar este indicador"
                  : modoSupervisorSinMontos
                  ? "Registros comerciales del periodo"
                  : `${formatoPesos(commercial.ingresos)} en ingresos comerciales`
              }
              icon="sales"
              iconClassName="bg-red-50 text-[#e30613]"
            />
            {esAdmin ? (
              <>
                <KpiCard
                  label="Utilidad del periodo"
                  value={commercialAvailable ? formatoPesos(commercial.utilidad) : "No disponible"}
                  detail={commercialAvailable ? `Acumulado de ${periodLabel}` : "No se pudo actualizar este indicador"}
                  icon="trend"
                  iconClassName="bg-emerald-50 text-emerald-600"
                  valueClassName="text-emerald-600"
                />
                <KpiCard
                  label="Caja acumulada"
                  value={
                    financialAvailable && financial
                      ? formatoPesos(financial.cajaDisponible)
                      : "No disponible"
                  }
                  detail={
                    financialAvailable && financial
                      ? `Disponible al cierre de ${periodLabel}`
                      : "No se pudo actualizar este indicador"
                  }
                  icon="cash"
                  iconClassName="bg-blue-50 text-blue-600"
                />
              </>
            ) : modoSupervisorSinMontos ? (
              <>
                <DashboardUtilityGate
                  coverageLabel={coverageLabel}
                  requiereClave
                  period={period}
                  periodLabel={periodLabel}
                  variant="cards"
                  showCashCard={false}
                />
                <KpiCard
                  label="Caja acumulada"
                  value={
                    financialAvailable && financial
                      ? formatoPesos(financial.cajaDisponible)
                      : "No disponible"
                  }
                  detail={
                    financialAvailable && financial
                      ? `Disponible al cierre de ${periodLabel}`
                      : "No se pudo actualizar este indicador"
                  }
                  icon="cash"
                  iconClassName="bg-blue-50 text-blue-600"
                />
              </>
            ) : (
              <DashboardUtilityGate
                coverageLabel={coverageLabel}
                requiereClave
                period={period}
                periodLabel={periodLabel}
                variant="cards"
              />
            )}
            <KpiCard
              label="Equipos en bodega"
              value={operationalAvailable ? String(operational.equiposEnBodega) : "No disponible"}
              detail={operationalAvailable ? "Unidades disponibles actualmente" : "No se pudo actualizar este indicador"}
              icon="inventory"
              iconClassName="bg-violet-50 text-violet-600"
            />
            <KpiCard
              label="Pendientes o alertas"
              value={operationalAvailable ? String(operational.pendientesTotal) : "No disponible"}
              detail={
                !operationalAvailable
                  ? "No se pudo actualizar este indicador"
                  : operational.pendientesTotal > 0
                    ? "Requieren atención operativa"
                    : "Operación sin alertas activas"
              }
              icon="warning"
              iconClassName="bg-orange-50 text-orange-600"
              valueClassName={operationalAvailable && operational.pendientesTotal > 0 ? "text-orange-600" : "text-slate-950"}
            />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.9fr)]">
            <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">
                    {esAdmin ? "Ventas y utilidad" : "Ventas por día"}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-2">
                      <span className="h-0.5 w-6 bg-[#e30613]" />
                      Número de ventas
                    </span>
                    {esAdmin ? (
                      <span className="flex items-center gap-2"><span className="h-0.5 w-6 bg-emerald-600" />Utilidad ($)</span>
                    ) : (
                      <span className="flex items-center gap-2 text-slate-400"><DashboardIcon name="lock" className="h-3.5 w-3.5" />Utilidad protegida</span>
                    )}
                  </div>
                </div>
                <span className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold capitalize text-slate-600">{periodLabel}</span>
              </div>
              <div className="mt-4">
                {commercialAvailable ? (
                  <SalesUtilityChart
                    data={commercial.tendenciaDiaria}
                    mostrarUtilidad={esAdmin}
                  />
                ) : (
                  <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm font-semibold text-slate-500">
                    La tendencia comercial no está disponible en este momento.
                  </div>
                )}
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div className="flex items-center justify-between gap-3 px-5 py-5">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">Alertas operativas</h2>
                  <p className="mt-1 text-xs text-slate-500">Estado actual de {coverageLabel.toLowerCase()}</p>
                </div>
                <Link
                  href={esStand ? "/alertas/prestamos" : "/dashboard/aprobaciones"}
                  className="text-xs font-black text-[#e30613] hover:underline"
                >
                  Ver todas
                </Link>
              </div>
              {!operationalAvailable ? (
                <div className="border-t border-slate-100 px-5 py-14 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <DashboardIcon name="warning" className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-700">Alertas no disponibles</p>
                  <p className="mt-1 text-xs text-slate-500">Reintenta la actualización para consultar el estado operativo.</p>
                </div>
              ) : operational.pendientesTotal === 0 ? (
                <div className="border-t border-slate-100 px-5 py-14 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <DashboardIcon name="approvals" className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-700">Sin alertas activas</p>
                  <p className="mt-1 text-xs text-slate-500">No hay pendientes calculables con los estados actuales.</p>
                </div>
              ) : (
                <div className="border-t border-slate-100">
                  {!esStand && (
                    <AlertRow
                      count={operational.aprobacionesPendientes}
                      title="aprobaciones pendientes"
                      detail={`${operational.detalleAprobaciones.prestamos} de préstamos y ${operational.detalleAprobaciones.ventas} de ventas`}
                      href="/dashboard/aprobaciones"
                      icon="approvals"
                      tone="red"
                    />
                  )}
                  <AlertRow
                    count={operational.prestamosActivos}
                    title="préstamos sin cierre"
                    detail="Préstamos aprobados que continúan activos"
                    href="/prestamos"
                    icon="loans"
                    tone="orange"
                  />
                  <AlertRow
                    count={operational.inventarioAtencion}
                    title="equipos requieren revisión"
                    detail="Inventario en estado PENDIENTE o GARANTIA"
                    href="/inventario"
                    icon="warning"
                    tone="amber"
                  />
                </div>
              )}
            </article>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1fr_0.95fr]">
            {commercialAvailable ? (
              <PerformancePanel
                items={commercial.rendimientoPorSede}
                mostrarSoloVentas={modoSupervisorSinMontos}
              />
            ) : (
              <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <h2 className="text-xl font-black tracking-tight text-slate-950">Rendimiento por sede</h2>
                <p className="mt-8 text-sm font-semibold text-slate-500">Datos no disponibles temporalmente.</p>
              </article>
            )}
            {commercialAvailable ? (
              <LeadingFinancialPanel
                financieras={commercial.topFinancieras}
                ocultarMonto={modoSupervisorSinMontos}
              />
            ) : (
              <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <h2 className="text-xl font-black tracking-tight text-slate-950">Financiera líder</h2>
                <p className="mt-8 text-sm font-semibold text-slate-500">Datos no disponibles temporalmente.</p>
              </article>
            )}
            <QuickActions actions={quickActions} />
          </section>

          <div className="mt-5">
            {commercialAvailable ? (
              <PayJoyAdvisorsPanel asesores={commercial.topAsesoresPayJoy} />
            ) : (
              <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <h2 className="text-xl font-black tracking-tight text-slate-950">Top asesores PAYJOY</h2>
                <p className="mt-8 text-sm font-semibold text-slate-500">Datos no disponibles temporalmente.</p>
              </article>
            )}
          </div>
          <div className="mt-5">
            <OperationsToolCenter groups={toolGroups} storageUserKey={usuario} />
          </div>

          {detailedRankings && (
            <details className="group mt-5 rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-black text-slate-800 [&::-webkit-details-marker]:hidden">
                Ver rankings comerciales detallados
                <span className="text-xl text-[#e30613] transition group-open:rotate-45">+</span>
              </summary>
              <div className="border-t border-slate-100 p-4 sm:p-5">{detailedRankings}</div>
            </details>
          )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export type { NavigationItem };
