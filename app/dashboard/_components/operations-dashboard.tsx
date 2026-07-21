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
}: {
  activeHref?: string;
  coverageLabel: string;
  footerMode: "coverage" | "logout";
  items: NavigationItem[];
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
            Panel operativo
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
}: {
  activeHref?: string;
  coverageLabel: string;
  footerMode?: "coverage" | "logout";
  items: NavigationItem[];
}) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] lg:block">
        <SidebarContent
          activeHref={activeHref}
          coverageLabel={coverageLabel}
          footerMode={footerMode}
          items={items}
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

function QuickActions({ reportHref }: { reportHref: string }) {
  const actions: Array<NavigationItem> = [
    { href: "/ventas/nuevo", icon: "sales", label: "Nueva venta" },
    { href: "/inventario/nuevo", icon: "inventory", label: "Nuevo inventario" },
    { href: "/caja/gestion", icon: "cash", label: "Registrar egreso" },
    { href: reportHref, icon: "reports", label: "Ver reportes" },
  ];

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

export default function OperationsDashboard({
  commercial,
  coverageLabel,
  detailedRankings,
  esAdmin,
  esSupervisor,
  financial,
  navigationItems,
  operational,
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
  coverageLabel: string;
  detailedRankings?: ReactNode;
  esAdmin: boolean;
  esSupervisor: boolean;
  financial: FinancialSummary | null;
  navigationItems: NavigationItem[];
  operational: DashboardOperationalSummary;
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
  const reportHref = esAdmin ? "/dashboard/reportes" : "/dashboard/analitico";
  const toolGroups: OperationsToolGroup[] = [
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
            title: "Radar de inventario",
            description: "Disponibilidad por referencia y sede.",
            icon: "reports" as const,
            links: [{ href: "/dashboard/radar", label: "Abrir radar" }],
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
          {
            title: "Análisis",
            description: "Comparativos, consolidados y reportes detallados.",
            icon: "reports" as const,
            links: [
              { href: "/dashboard/analitico", label: "Panel analítico" },
              { href: "/dashboard/reportes", label: "Reportes" },
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

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar coverageLabel={coverageLabel} items={navigationItems} />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[27px] font-black tracking-tight text-slate-950 sm:text-[31px]">Panel administrativo</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">Resumen general de la operación</p>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <DashboardFilters
                  esAdmin={esAdmin}
                  period={period}
                  sedeId={sedeId}
                  sedeLabel={coverageLabel}
                  sedes={sedes}
                />
                <div className="flex items-center gap-2">
                  <Link
                    href="/dashboard/aprobaciones"
                    aria-label={`${operational.pendientesTotal} alertas operativas`}
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:text-[#e30613]"
                  >
                    <DashboardIcon name="bell" className="h-6 w-6" />
                    {operational.pendientesTotal > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#e30613] px-1 text-[10px] font-black text-white">
                        {operational.pendientesTotal > 99 ? "99+" : operational.pendientesTotal}
                      </span>
                    )}
                  </Link>
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

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5" aria-label="Indicadores principales">
            <KpiCard
              label="Ventas del periodo"
              value={String(commercial.ventas)}
              detail={
                modoSupervisorSinMontos
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
                  value={formatoPesos(commercial.utilidad)}
                  detail={`Acumulado de ${periodLabel}`}
                  icon="trend"
                  iconClassName="bg-emerald-50 text-emerald-600"
                  valueClassName="text-emerald-600"
                />
                <KpiCard
                  label="Caja acumulada"
                  value={
                    financial
                      ? formatoPesos(financial.cajaDisponible)
                      : "No disponible"
                  }
                  detail={
                    financial
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
                    financial
                      ? formatoPesos(financial.cajaDisponible)
                      : "No disponible"
                  }
                  detail={
                    financial
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
              value={String(operational.equiposEnBodega)}
              detail="Unidades disponibles actualmente"
              icon="inventory"
              iconClassName="bg-violet-50 text-violet-600"
            />
            <KpiCard
              label="Pendientes o alertas"
              value={String(operational.pendientesTotal)}
              detail={operational.pendientesTotal > 0 ? "Requieren atención operativa" : "Operación sin alertas activas"}
              icon="warning"
              iconClassName="bg-orange-50 text-orange-600"
              valueClassName={operational.pendientesTotal > 0 ? "text-orange-600" : "text-slate-950"}
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
                <SalesUtilityChart
                  data={commercial.tendenciaDiaria}
                  mostrarUtilidad={esAdmin}
                />
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div className="flex items-center justify-between gap-3 px-5 py-5">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">Alertas operativas</h2>
                  <p className="mt-1 text-xs text-slate-500">Estado actual de {coverageLabel.toLowerCase()}</p>
                </div>
                <Link href="/dashboard/aprobaciones" className="text-xs font-black text-[#e30613] hover:underline">Ver todas</Link>
              </div>
              {operational.pendientesTotal === 0 ? (
                <div className="border-t border-slate-100 px-5 py-14 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <DashboardIcon name="approvals" className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-700">Sin alertas activas</p>
                  <p className="mt-1 text-xs text-slate-500">No hay pendientes calculables con los estados actuales.</p>
                </div>
              ) : (
                <div className="border-t border-slate-100">
                  <AlertRow
                    count={operational.aprobacionesPendientes}
                    title="aprobaciones pendientes"
                    detail={`${operational.detalleAprobaciones.prestamos} de préstamos y ${operational.detalleAprobaciones.ventas} de ventas`}
                    href="/dashboard/aprobaciones"
                    icon="approvals"
                    tone="red"
                  />
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
            <PerformancePanel
              items={commercial.rendimientoPorSede}
              mostrarSoloVentas={modoSupervisorSinMontos}
            />
            <LeadingFinancialPanel
              financieras={commercial.topFinancieras}
              ocultarMonto={modoSupervisorSinMontos}
            />
            <QuickActions reportHref={reportHref} />
          </section>

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
        </main>
      </div>
    </div>
  );
}

export type { NavigationItem };
