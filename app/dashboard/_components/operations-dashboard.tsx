import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";
import type { getDashboardCashSummary } from "@/lib/dashboard-financial-summary";
import type { DashboardOperationalSummary } from "@/lib/dashboard-overview";
import DashboardFilters from "./dashboard-filters";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";
import DashboardUtilityGate from "./dashboard-utility-gate";
import LogoutButton from "./logout-button";
import { formatoPesos, formatoNumero } from "@/lib/monthly-reports-view";
import { HomeDetailDialog, HomeProfile, OperationsTabs } from "./home-interactions";
import styles from "./home.module.css";
import whiteSidebarStyles from "./sidebar-white.module.css";
import OperationsToolCenter, { type OperationsToolGroup } from "./operations-tool-center";

type CommercialSummary = Awaited<ReturnType<typeof getMonthlyCommercialSummary>>;
type FinancialSummary = Awaited<ReturnType<typeof getDashboardCashSummary>>;

type NavigationItem = {
  href: string;
  icon: DashboardIconName;
  label: string;
};

export type { NavigationItem };

type SedeOption = {
  id: number;
  nombre: string;
};

function SidebarContent({
  activeHref,
  appearance,
  coverageLabel,
  footerMode,
  items,
  panelLabel,
}: {
  activeHref?: string;
  appearance: "default" | "financial" | "white";
  coverageLabel: string;
  footerMode: "coverage" | "logout";
  items: NavigationItem[];
  panelLabel: string;
}) {
  const financial = appearance === "financial";

  if (appearance === "white") {
    return (
      <div className={whiteSidebarStyles.root}>
        <div className={whiteSidebarStyles.brand}>
          <div className={whiteSidebarStyles.logo}>
            <Image
              src="/branding/conectamos-logo.png"
              alt="Logo CONECTAMOS"
              fill
              sizes="40px"
              className="object-cover"
              priority
            />
          </div>
          <p className={whiteSidebarStyles.wordmark}>CONECTAMOS</p>
        </div>

        <nav className={whiteSidebarStyles.navigation} aria-label="Navegación principal">
          {items.map((item, index) => {
            const activo = activeHref ? item.href === activeHref : index === 0;

            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={`${whiteSidebarStyles.navigationLink} ${activo ? whiteSidebarStyles.activeLink : ""}`}
              >
                <DashboardIcon name={item.icon} className={whiteSidebarStyles.navigationIcon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={whiteSidebarStyles.footer}>
          {footerMode === "logout" ? (
            <LogoutButton variant="light" className={whiteSidebarStyles.logout} />
          ) : (
            <div className={whiteSidebarStyles.coverage}>
              <DashboardIcon name="store" className={whiteSidebarStyles.coverageIcon} />
              <div className={whiteSidebarStyles.coverageText}>
                <p className={whiteSidebarStyles.coverageName}>{coverageLabel}</p>
                <p className={whiteSidebarStyles.coverageLabel}>Cobertura activa</p>
              </div>
              <DashboardIcon name="chevron" className={whiteSidebarStyles.coverageChevron} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#11161d] text-white">
      <div className={financial
        ? "flex h-[104px] shrink-0 items-center gap-[11px] px-[26px]"
        : "flex h-[104px] shrink-0 items-center gap-3 border-b border-white/5 px-5"}>
        <div className={financial
          ? "relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#e30613]"
          : "relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/15 bg-[#e30613]"}>
          <Image
            src="/branding/conectamos-logo.png"
            alt="Logo CONECTAMOS"
            fill
            sizes={financial ? "40px" : "44px"}
            className="object-cover"
            priority
          />
        </div>
        <div>
          <p className={financial
            ? "text-[16px] font-extrabold tracking-[0.065em]"
            : "text-[17px] font-black tracking-[0.035em]"}>CONECTAMOS</p>
          {!financial && (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.19em] text-white/45">
              {panelLabel}
            </p>
          )}
        </div>
      </div>

      <nav className={financial
        ? "min-h-0 flex-1 overflow-y-auto py-[6px]"
        : "min-h-0 flex-1 space-y-1 overflow-y-auto py-5"} aria-label="Navegación principal">
        {items.map((item, index) => {
          const activo = activeHref ? item.href === activeHref : index === 0;

          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              aria-current={activo ? "page" : undefined}
              className={[
                financial
                  ? "relative flex min-h-14 items-center gap-[22px] px-[30px] text-[15px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
                  : "relative flex min-h-12 items-center gap-4 px-6 text-[15px] font-semibold transition",
                activo
                  ? "bg-white/[0.075] text-white"
                  : "text-slate-300 hover:bg-white/[0.045] hover:text-white",
              ].join(" ")}
            >
              {activo && <span className={financial
                ? "absolute inset-y-0 left-0 w-[6px] rounded-r bg-[#e30613]"
                : "absolute inset-y-0 left-0 w-1 rounded-r bg-[#e30613]"} />}
              <DashboardIcon
                name={item.icon}
                className={[
                  "h-[22px] w-[22px] shrink-0",
                  activo ? "text-[#ff1f2d]" : "text-slate-400",
                ].join(" ")}
              />
              <span className={financial && activo ? "font-bold" : undefined}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={financial
        ? "flex min-h-[106px] shrink-0 items-center border-t border-white/10 px-[30px] py-6"
        : "shrink-0 border-t border-white/10 p-5"}>
        {footerMode === "logout" ? (
          <LogoutButton className="w-full justify-start rounded-xl border-0 bg-transparent px-2 text-slate-200 shadow-none hover:bg-white/[0.06]" />
        ) : (
          <div className={financial
            ? "flex min-w-0 w-full items-center gap-4"
            : "flex items-center gap-3 rounded-xl bg-white/[0.045] px-3 py-3"}>
            <DashboardIcon name={financial ? "database" : "store"} className={financial
              ? "h-7 w-7 shrink-0 text-slate-400"
              : "h-6 w-6 shrink-0 text-slate-300"} />
            <div className="min-w-0">
              <p className={financial
                ? "break-words text-sm font-medium leading-5 text-white"
                : "truncate text-sm font-bold text-white"}>{coverageLabel}</p>
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
  appearance = "default",
  coverageLabel,
  footerMode = "coverage",
  items,
  panelLabel = "Panel operativo",
}: {
  activeHref?: string;
  appearance?: "default" | "financial" | "white";
  coverageLabel: string;
  footerMode?: "coverage" | "logout";
  items: NavigationItem[];
  panelLabel?: string;
}) {
  if (appearance === "white") {
    return (
      <>
        <aside className={whiteSidebarStyles.desktop}>
          <SidebarContent
            activeHref={activeHref}
            appearance={appearance}
            coverageLabel={coverageLabel}
            footerMode={footerMode}
            items={items}
            panelLabel={panelLabel}
          />
        </aside>

        <div className={whiteSidebarStyles.mobile}>
          <details className={whiteSidebarStyles.mobileDetails}>
            <summary className={whiteSidebarStyles.summary} aria-label="Menú de navegación de CONECTAMOS">
              <div className={whiteSidebarStyles.mobileBrand}>
                <div className={whiteSidebarStyles.logo}>
                  <Image
                    src="/branding/conectamos-logo.png"
                    alt="Logo CONECTAMOS"
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
                <span className={whiteSidebarStyles.wordmark}>CONECTAMOS</span>
              </div>
              <span className={`${whiteSidebarStyles.menuControl} ${whiteSidebarStyles.openControl}`}>
                <DashboardIcon name="menu" className={whiteSidebarStyles.mobileIcon} />
              </span>
              <span className={`${whiteSidebarStyles.menuControl} ${whiteSidebarStyles.closeControl}`}>
                <DashboardIcon name="close" className={whiteSidebarStyles.mobileIcon} />
              </span>
            </summary>
            <div className={whiteSidebarStyles.dropdown}>
              <SidebarContent
                activeHref={activeHref}
                appearance={appearance}
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

  return (
    <>
      <aside className={appearance === "financial"
        ? "fixed inset-y-0 left-0 z-40 hidden w-[230px] lg:block"
        : "fixed inset-y-0 left-0 z-40 hidden w-[252px] lg:block"}>
        <SidebarContent
          activeHref={activeHref}
          appearance={appearance}
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
              appearance={appearance}
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
  const padding = { top: 28, right: 170, bottom: 42, left: 58 };
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
                  {formatoPesos(utilityValue)}
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

function HomeMetric({ label, value, icon, negative = false }: { label: string; value: string; icon: DashboardIconName; negative?: boolean }) {
  return <article className={styles.metric} style={{ "--value-length": value.length } as CSSProperties}><p className={styles.metricLabel}><DashboardIcon name={icon} /><span>{label}</span></p><strong className={`${styles.metricValue} ${negative ? styles.negative : ""}`} title={value}>{value}</strong></article>;
}

function PerformancePanel({ items, mostrarSoloVentas, context, ingresos, detailedRankings }: { items: CommercialSummary["rendimientoPorSede"]; mostrarSoloVentas: boolean; context: string; ingresos: number; detailedRankings?: ReactNode }) {
  const ordenados = [...items].sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre, "es"));
  const visibles = ordenados.slice(0, 5);
  const maxVentas = Math.max(1, ...visibles.map((item) => item.ventas));
  return <>
    {visibles.length === 0 ? <p className={styles.empty}>Sin ventas por sede en este periodo.</p> : <div className={styles.salesRows}>{visibles.map((item) => {
      const share = Math.max(3, (item.ventas / maxVentas) * 88);
      return <div className={styles.salesRow} key={item.sedeId}><span title={item.nombre}>{item.nombre}</span><div className={styles.barTrack} style={{ "--share": `${share}%` } as CSSProperties}><div className={styles.bar} style={{ width: `${share}%` }} /><span className={styles.barCount} data-performance-sales-count>{formatoNumero(item.ventas)}</span></div></div>;
    })}</div>}
    <div className={styles.salesDetail}><HomeDetailDialog title="Detalle de ventas y rankings" context={context} buttonLabel="Ver detalle y rankings">
      {!mostrarSoloVentas && <p className="mb-4 text-sm">Ingresos comerciales <strong>{formatoPesos(ingresos)}</strong></p>}
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Sede</th><th>Ventas</th>{!mostrarSoloVentas && <><th>Ingresos</th><th>Utilidad</th></>}</tr></thead><tbody>{ordenados.map((item) => <tr key={item.sedeId}><td>{item.nombre}</td><td>{formatoNumero(item.ventas)}</td>{!mostrarSoloVentas && <><td className={item.ingresos < 0 ? styles.negative : undefined}>{formatoPesos(item.ingresos)}</td><td className={item.utilidad < 0 ? styles.negative : undefined}>{formatoPesos(item.utilidad)}</td></>}</tr>)}</tbody></table></div>
      {detailedRankings}
    </HomeDetailDialog></div>
  </>;
}

function LeadingFinancialPanel({ financieras, ocultarMonto }: { financieras: CommercialSummary["topFinancieras"]; ocultarMonto: boolean }) {
  const lider = financieras[0] ?? null;
  const montoTotal = financieras.reduce((total, item) => total + item.monto, 0);
  const usosTotales = financieras.reduce((total, item) => total + item.total, 0);
  const participacion = lider ? !ocultarMonto && montoTotal > 0 ? (lider.monto / montoTotal) * 100 : usosTotales > 0 ? (lider.total / usosTotales) * 100 : 0 : 0;
  return <><p className={styles.leaderLabel}>Financiera líder</p>{!lider ? <p className={styles.empty}>Sin usos de financieras en el periodo.</p> : <>
    <h2>{lider.nombre}</h2><div className={styles.leaderStats} style={ocultarMonto ? { gridTemplateColumns: "1fr 1fr" } : undefined}><div><strong>{formatoNumero(lider.total)}</strong><span>usos</span></div>{!ocultarMonto && <div><strong className={`${styles.leaderMoney} ${lider.monto < 0 ? styles.negative : ""}`} style={{ "--value-length": formatoPesos(lider.monto).length } as CSSProperties} title={formatoPesos(lider.monto)}>{formatoPesos(lider.monto)}</strong><span>financiados</span></div>}<div><strong aria-label={`${participacion.toFixed(1)}% de participación`}>{participacion.toFixed(0)}%</strong><span>participación</span></div></div>
  </>}</>;
}

function PayJoyAdvisorsPanel({ asesores, context }: { asesores: CommercialSummary["topAsesoresPayJoy"]; context: string }) {
  const topDiez = asesores.slice(0, 10);
  return <div className={styles.payjoy}><DashboardIcon name="users" /><strong>Top asesores PAYJOY</strong><span>{formatoNumero(topDiez.length)} clasificados</span><HomeDetailDialog title="Top asesores PAYJOY" context={context} buttonLabel="Ver ranking">
    {topDiez.length === 0 ? <p className={styles.empty}>Sin asesores con ventas PAYJOY en este periodo.</p> : <table className={styles.table}><thead><tr><th>Posición</th><th>Asesor</th><th>Ventas</th></tr></thead><tbody>{topDiez.map((asesor, index) => <tr key={`${index}-${asesor.nombre}`}><td>{index + 1}</td><td style={{ textAlign: "left", whiteSpace: "normal" }}>{asesor.nombre}</td><td>{formatoNumero(asesor.total)}</td></tr>)}</tbody></table>}
  </HomeDetailDialog></div>;
}

function FinancialTab({ financieras, ocultarMonto }: { financieras: CommercialSummary["topFinancieras"]; ocultarMonto: boolean }) {
  return financieras.length === 0 ? <p className={styles.empty}>Sin usos de financieras en el periodo.</p> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.financialTable}`}><thead><tr><th>Financiera</th><th>Usos</th>{!ocultarMonto && <th>Monto financiado</th>}</tr></thead><tbody>{financieras.map((item, index) => <tr key={`${index}-${item.nombre}`}><td>{item.nombre}</td><td data-label="Usos">{formatoNumero(item.total)}</td>{!ocultarMonto && <td data-label="Monto financiado" className={item.monto < 0 ? styles.negative : undefined}>{formatoPesos(item.monto)}</td>}</tr>)}</tbody></table></div>;
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
  storageUserKey,
}: {
  coverageLabel: string;
  operational: DashboardOperationalSummary;
  operationalAvailable: boolean;
  quickActions: NavigationItem[];
  toolGroups: OperationsToolGroup[];
  usuario: string;
  storageUserKey?: string;
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
        <OperationsToolCenter groups={toolGroups} storageUserKey={storageUserKey ?? usuario} legacyStorageUserKey={usuario} />
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
  storageUserKey,
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
  storageUserKey?: string;
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
        ...(esAdmin || esSupervisor
          ? [{ href: "/dashboard/radar", label: "Abrir radar" }]
          : []),
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
        ...(esAdmin || esSupervisor
          ? [
              {
                href: "/vendedor/registros/inconsistencias",
                label: "Inconsistencias de créditos",
              },
            ]
          : []),
      ],
    },
    ...(esAdmin || esSupervisor
      ? [
          {
            title: "Proveedores",
            description: "Facturas por pagar, vencimientos y pagos aprobados.",
            icon: "document" as const,
            links: [
              {
                href: "/dashboard/proveedores",
                label: "Gestionar proveedores",
                keywords: ["aliado", "factura", "vencimiento", "pago"],
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

  const context = `${periodLabel} · ${coverageLabel}`;
  const unavailable = <p className={styles.empty}>Datos comerciales no disponibles. Reintenta la actualización.</p>;
  return <div className={styles.shell}>
    <DashboardSidebar coverageLabel={coverageLabel} items={navigationItems} panelLabel={esStand ? "Panel del stand" : "Panel operativo"} />
    <div className={styles.workspace}><main className={styles.main}>
      <header className={styles.header}><h1>Inicio</h1><div className={styles.headerControls}>
        {esStandSoloInventario ? <span>{coverageLabel}</span> : <div className={styles.filters}><DashboardFilters key={`${period}:${sedeId ?? "TODAS"}`} esAdmin={esAdmin} period={period} sedeId={sedeId} sedeLabel={coverageLabel} sedes={sedes} /></div>}
        <HomeProfile usuario={usuario} rolUsuario={rolUsuario} />
      </div></header>
      {datosParciales && <div className={styles.notice} role="status"><div><strong>Actualización parcial del dashboard</strong><p>Algunos indicadores no se pudieron actualizar. Los demás datos siguen disponibles.</p></div><Link className={styles.detailLink} href={`/dashboard?period=${encodeURIComponent(period)}${sedeId ? `&sedeId=${sedeId}` : ""}`}>Reintentar datos</Link></div>}
      {esStandSoloInventario ? <StandInventoryContent coverageLabel={coverageLabel} operational={operational} operationalAvailable={operationalAvailable} quickActions={quickActions} toolGroups={toolGroups} usuario={usuario} storageUserKey={storageUserKey} /> : <>
        <section className={styles.metrics} aria-label="Indicadores principales">
          <HomeMetric label="Ventas" value={commercialAvailable ? formatoNumero(commercial.ventas) : "No disponible"} icon="sales" />
          {esAdmin ? <><HomeMetric label="Utilidad" value={commercialAvailable ? formatoPesos(commercial.utilidad) : "No disponible"} icon="loans" negative={commercialAvailable && commercial.utilidad < 0} /><HomeMetric label="Caja" value={financialAvailable && financial ? formatoPesos(financial.cajaDisponible) : "No disponible"} icon="cash" negative={!!financial && financial.cajaDisponible < 0} /></> : <>
            <DashboardUtilityGate key={context} coverageLabel={coverageLabel} requiereClave period={period} periodLabel={periodLabel} showCashCard={!modoSupervisorSinMontos} variant="home" />
            {modoSupervisorSinMontos && <HomeMetric label="Caja" value={financialAvailable && financial ? formatoPesos(financial.cajaDisponible) : "No disponible"} icon="cash" negative={!!financial && financial.cajaDisponible < 0} />}
          </>}
          <HomeMetric label="En bodega" value={operationalAvailable ? formatoNumero(operational.equiposEnBodega) : "No disponible"} icon="inventory" />
        </section>
        <section className={styles.pending} aria-label="Pendientes operativos">
          <div className={styles.pendingTitle}><span><DashboardIcon name="warning" /></span>Pendientes <strong>{operationalAvailable ? formatoNumero(operational.pendientesTotal) : "No disponibles"}</strong></div>
          {operationalAvailable && <>
            {!esStand && <Link href="/dashboard/aprobaciones" aria-label={`${operational.aprobacionesPendientes} aprobaciones: ${operational.detalleAprobaciones.prestamos} de préstamos y ${operational.detalleAprobaciones.ventas} de ventas`}><strong>{formatoNumero(operational.aprobacionesPendientes)}</strong> aprobaciones</Link>}
            <Link href="/prestamos"><strong>{formatoNumero(operational.prestamosActivos)}</strong> préstamos sin cierre</Link>
            <Link href="/inventario"><strong>{formatoNumero(operational.inventarioAtencion)}</strong> equipos por revisar</Link>
          </>}
          <Link href={esStand ? "/alertas/prestamos" : "/dashboard/aprobaciones"} aria-label="Ver todos los pendientes"><DashboardIcon name="arrow" /></Link>
        </section>
        <section className={styles.analytics} aria-label="Actividad comercial">
          <OperationsTabs sales={commercialAvailable ? <PerformancePanel items={commercial.rendimientoPorSede} mostrarSoloVentas={modoSupervisorSinMontos} context={context} ingresos={commercial.ingresos} detailedRankings={detailedRankings} /> : unavailable}
            evolution={commercialAvailable ? <><p className="mb-3 text-xs text-slate-500">{context} · Ventas{esAdmin ? " y utilidad" : ""} por día</p><SalesUtilityChart data={commercial.tendenciaDiaria} mostrarUtilidad={esAdmin} /></> : unavailable}
            financial={commercialAvailable ? <FinancialTab financieras={commercial.topFinancieras} ocultarMonto={modoSupervisorSinMontos} /> : unavailable} />
          <div className={styles.leader}>{commercialAvailable ? <><LeadingFinancialPanel financieras={commercial.topFinancieras} ocultarMonto={modoSupervisorSinMontos} />{esAdmin && <PayJoyAdvisorsPanel asesores={commercial.topAsesoresPayJoy} context={context} />}</> : <><p className={styles.leaderLabel}>Financiera líder</p>{unavailable}</>}</div>
        </section>
        <OperationsToolCenter groups={toolGroups} storageUserKey={storageUserKey ?? usuario} legacyStorageUserKey={usuario} quickActions={quickActions} />
      </>}
    </main></div>
  </div>;
}
