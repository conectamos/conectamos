import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  esPerfilApoyoOperativo,
  esPerfilFacturador,
  esPerfilRegistroVenta,
  esPerfilSupervisor,
  puedeConsultarReporteSiigo,
  puedeAccederPanelFacturador,
  puedeAccederModulosOperativos,
  esRolAdministrativo,
} from "@/lib/access-control";
import DashboardUtilityGate from "./_components/dashboard-utility-gate";
import LogoutButton from "./_components/logout-button";
import VendorWelcomeModal from "./_components/vendor-welcome-modal";
import PendingLoanAlertModal from "./_components/pending-loan-alert-modal";
import {
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthRange,
} from "@/lib/ventas-utils";
import { getVendorWelcomeMessage } from "@/lib/vendor-welcome-message";
import {
  getMonthlyCommercialSummary,
  type CommercialRankingItem,
} from "@/lib/dashboard-commercial-summary";
import { getDashboardCashSummary } from "@/lib/dashboard-financial-summary";
import { getVendorEarningsSummary } from "@/lib/vendor-earnings";
import { getDashboardOperationalSummary } from "@/lib/dashboard-overview";
import { getSalesRoleActivitySummary } from "@/lib/dashboard-sales-role-summary";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";
import OperationsDashboard, {
  type NavigationItem,
} from "./_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "./_components/dashboard-icon";
import SalesRoleDashboard from "./_components/sales-role-dashboard";

type MonthlyCommercialSummary = Awaited<
  ReturnType<typeof getMonthlyCommercialSummary>
>;
type OperationalSummary = Awaited<
  ReturnType<typeof getDashboardOperationalSummary>
>;

type ModuleTone = "slate" | "emerald" | "sky" | "amber" | "violet" | "rose";
type ActionTone = "primary" | "secondary" | "danger";

type ModuleAction = {
  href: string;
  label: string;
  tone?: ActionTone;
};

type ModuleKey =
  | "aprobaciones"
  | "inventario"
  | "ventas"
  | "caja"
  | "prestamos"
  | "registrarVenta"
  | "radar"
  | "registrarFacturacion"
  | "administracion"
  | "sumaspay"
  | "payjoy"
  | "nuovo"
  | "equality";

type ModuleCard = {
  key: ModuleKey;
  title: string;
  eyebrow: string;
  description: string;
  actions: ModuleAction[];
  tone: ModuleTone;
};

type ModuleSectionConfig = {
  title: string;
  eyebrow: string;
  description: string;
  modules: ModuleCard[];
};

type SessionBadge = {
  label: string;
  value: string;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function createEmptyCommercialSummary(
  periodo: MonthlyCommercialSummary["periodo"]
): MonthlyCommercialSummary {
  return {
    periodo,
    utilidad: 0,
    caja: 0,
    ingresos: 0,
    ventas: 0,
    cajaVentas: 0,
    cajaOperativa: 0,
    topSedesJalador: [],
    topVentasSede: [],
    topJaladores: [],
    topCerradores: [],
    topFinancieras: [],
    topMarcasVendidas: [],
    topReferenciasVendidas: [],
    referenciasVendidas: [],
    tendenciaDiaria: [],
    rendimientoPorSede: [],
  };
}

function createEmptyOperationalSummary(): OperationalSummary {
  return {
    equiposEnBodega: 0,
    aprobacionesPendientes: 0,
    prestamosActivos: 0,
    inventarioAtencion: 0,
    pendientesTotal: 0,
    detalleAprobaciones: {
      prestamos: 0,
      ventas: 0,
    },
  };
}

function BrandBadge() {
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.06)_100%)] shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.35),transparent_55%)]" />
        <div className="absolute inset-[10px] rounded-full border border-white/20" />
        <span className="relative text-2xl font-black tracking-tight text-white">
          C
        </span>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/70">
          Panel principal
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white md:text-4xl">
          CONECTAMOS
        </h1>
      </div>
    </div>
  );
}

function SessionChip({ label, value }: SessionBadge) {
  return (
    <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-white/90 backdrop-blur">
      <span className="font-semibold text-white">{label}:</span> {value}
    </div>
  );
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

function CommercialRankingPanel({
  title,
  description,
  icon,
  items,
  countLabel,
  participationBase,
  showCommissionToggle = false,
  showAmountToggle = false,
}: {
  title: string;
  description: string;
  icon: DashboardIconName;
  items: CommercialRankingItem[];
  countLabel: string;
  participationBase?: number;
  showCommissionToggle?: boolean;
  showAmountToggle?: boolean;
}) {
  const countText = (total: number) => {
    if (countLabel === "uso") {
      return total === 1 ? "uso" : "usos";
    }

    return total === 1 ? "venta" : "ventas";
  };
  const topItems = items.slice(0, 5);
  const maxTotal = items.reduce(
    (maximo, item) => Math.max(maximo, Number(item.total || 0)),
    1
  );
  const participationText = (total: number) =>
    participationBase && participationBase > 0
      ? `${((Number(total || 0) / participationBase) * 100).toLocaleString(
          "es-CO",
          {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }
        )}% participación`
      : null;
  const renderItems = (rankingItems: CommercialRankingItem[]) =>
    rankingItems.map((item, index) => {
      const participation = participationText(item.total);

      return (
        <div
          key={`${title}-${item.nombre}-${index}`}
          className="group/row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-1 py-3.5 last:border-b-0"
        >
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black",
            index === 0
              ? "bg-[#e30613] text-white"
              : "bg-slate-100 text-slate-700",
          ].join(" ")}
        >
          {index + 1}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">
            {item.nombre}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={[
                "h-full rounded-full transition-all",
                index === 0 ? "bg-[#e30613]" : "bg-slate-300 group-hover/row:bg-slate-400",
              ].join(" ")}
              style={{ width: `${Math.max(5, (Number(item.total || 0) / maxTotal) * 100)}%` }}
            />
          </div>
        </div>

          <div className="shrink-0 text-right">
            <p className="text-base font-black tabular-nums text-slate-950">
              {item.total}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              {countText(item.total)}
            </p>
            {participation && (
              <p className="mt-1 text-xs font-black tabular-nums text-[#e30613]">
                {participation}
              </p>
            )}
          </div>
        </div>
      );
    });

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
            <DashboardIcon name={icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h4 className="text-base font-black tracking-tight text-slate-950">
              {title}
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showCommissionToggle && (
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] [&::-webkit-details-marker]:hidden">
                Comisiones
              </summary>
              <div className="absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Comisiones recibidas
                </p>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                      Sin comisiones registradas.
                    </p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={`comision-${item.nombre}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <span className="truncate text-xs font-bold text-slate-800">
                          {item.nombre}
                        </span>
                        <span className="shrink-0 text-xs font-black text-slate-950">
                          {formatoPesos(item.monto)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>
          )}
          {showAmountToggle && (
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] [&::-webkit-details-marker]:hidden">
                Montos
              </summary>
              <div className="absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Montos por financiera
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
                        className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <span className="truncate text-xs font-bold text-slate-800">
                          {item.nombre}
                        </span>
                        <span className="shrink-0 text-xs font-black text-slate-950">
                          {formatoPesos(item.monto)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>
          )}
        </div>
      </div>

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="group-open:hidden">Top 5</span>
            <span className="hidden group-open:inline">Ranking completo</span>
          </span>
          <span className="flex items-center gap-2 text-[#e30613]">
            <span className="group-open:hidden">Ver todos</span>
            <span className="hidden group-open:inline">Ver menos</span>
            <span className="text-base transition group-open:rotate-45">+</span>
          </span>
        </summary>

        <div className="mt-2 hidden group-open:block">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Sin movimientos registrados en este periodo.
            </div>
          ) : (
            renderItems(items)
          )}
        </div>

        <div className="mt-2 group-open:hidden">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Sin movimientos registrados en este periodo.
            </div>
          ) : (
            renderItems(topItems)
          )}
        </div>
      </details>
    </article>
  );
}

function CommercialRankingSection({
  periodLabel,
  coverageLabel,
  totalVentas,
  topSedesJalador,
  topVentasSede,
  topJaladores,
  topCerradores,
  topFinancieras,
  mostrarAccionesMonetarias = true,
}: {
  periodLabel: string;
  coverageLabel: string;
  totalVentas: number;
  topSedesJalador: CommercialRankingItem[];
  topVentasSede: CommercialRankingItem[];
  topJaladores: CommercialRankingItem[];
  topCerradores: CommercialRankingItem[];
  topFinancieras: CommercialRankingItem[];
  mostrarAccionesMonetarias?: boolean;
}) {
  return (
    <section>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e30613]">
            Corte comercial
          </div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]">
            Ranking comercial
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Compara sedes, equipos comerciales y financieras del periodo seleccionado.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
            Periodo: {periodLabel}
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
            Cobertura: {coverageLabel}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <CommercialRankingPanel
          title="Ventas de Oficina"
          description="Origen comercial de los registros."
          icon="store"
          items={topSedesJalador}
          countLabel="venta"
        />
        <CommercialRankingPanel
          title="Ventas Sede"
          description="Resultado consolidado por sede."
          icon="inventory"
          items={topVentasSede}
          countLabel="venta"
          participationBase={totalVentas}
        />
        <CommercialRankingPanel
          title="Ventas Jalador"
          description="Participación de jaladores en ventas."
          icon="sales"
          items={topJaladores}
          countLabel="venta"
          participationBase={totalVentas}
          showCommissionToggle={mostrarAccionesMonetarias}
        />
        <CommercialRankingPanel
          title="Ventas Cerrador"
          description="Cierres comerciales registrados."
          icon="user"
          items={topCerradores}
          countLabel="venta"
          participationBase={totalVentas}
        />
        <CommercialRankingPanel
          title="Ventas Financieras"
          description="Uso de financieras en el periodo."
          icon="cash"
          items={topFinancieras}
          countLabel="uso"
          showAmountToggle={mostrarAccionesMonetarias}
        />
      </div>
    </section>
  );
}

function ModulePanel({
  title,
  eyebrow,
  description,
  actions,
  tone,
}: ModuleCard) {
  const toneClasses: Record<
    ModuleTone,
    { badge: string; topLine: string; primary: string; secondary: string; danger: string }
  > = {
    slate: {
      badge: "border-[#e8e2d7] bg-[#f8f6f1] text-slate-600",
      topLine: "bg-slate-700",
      primary: "bg-slate-900 text-white hover:bg-slate-800",
      secondary:
        "border border-[#e4ddd2] bg-[#fcfbf8] text-slate-700 hover:border-[#d8cfbf] hover:bg-white hover:text-slate-950",
      danger:
        "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
    },
    emerald: {
      badge: "border-[#e8e2d7] bg-[#f8f6f1] text-slate-600",
      topLine: "bg-emerald-600/75",
      primary: "bg-slate-900 text-white hover:bg-slate-800",
      secondary:
        "border border-[#e4ddd2] bg-[#fcfbf8] text-slate-700 hover:border-[#d8cfbf] hover:bg-white hover:text-slate-950",
      danger:
        "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
    },
    sky: {
      badge: "border-[#e8e2d7] bg-[#f8f6f1] text-slate-600",
      topLine: "bg-sky-600/75",
      primary: "bg-slate-900 text-white hover:bg-slate-800",
      secondary:
        "border border-[#e4ddd2] bg-[#fcfbf8] text-slate-700 hover:border-[#d8cfbf] hover:bg-white hover:text-slate-950",
      danger:
        "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
    },
    amber: {
      badge: "border-[#e8e2d7] bg-[#f8f6f1] text-slate-600",
      topLine: "bg-amber-600/75",
      primary: "bg-slate-900 text-white hover:bg-slate-800",
      secondary:
        "border border-[#e4ddd2] bg-[#fcfbf8] text-slate-700 hover:border-[#d8cfbf] hover:bg-white hover:text-slate-950",
      danger:
        "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
    },
    violet: {
      badge: "border-[#e8e2d7] bg-[#f8f6f1] text-slate-600",
      topLine: "bg-violet-600/75",
      primary: "bg-slate-900 text-white hover:bg-slate-800",
      secondary:
        "border border-[#e4ddd2] bg-[#fcfbf8] text-slate-700 hover:border-[#d8cfbf] hover:bg-white hover:text-slate-950",
      danger:
        "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
    },
    rose: {
      badge: "border-[#e8e2d7] bg-[#f8f6f1] text-slate-600",
      topLine: "bg-rose-600/75",
      primary: "bg-slate-900 text-white hover:bg-slate-800",
      secondary:
        "border border-[#e4ddd2] bg-[#fcfbf8] text-slate-700 hover:border-[#d8cfbf] hover:bg-white hover:text-slate-950",
      danger:
        "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
    },
  };

  const toneStyle = toneClasses[tone];

  return (
    <section className="group relative overflow-hidden rounded-[30px] border border-[#e8e3d9] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.1)]">
      <div className={`absolute inset-x-0 top-0 h-1.5 ${toneStyle.topLine}`} />

      <div className="flex items-start justify-between gap-4">
        <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneStyle.badge}`}>
          {eyebrow}
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#ece5d9] bg-[#faf8f3]">
          <span className={`h-2.5 w-2.5 rounded-full ${toneStyle.topLine}`} />
        </div>
      </div>

      <h2 className="mt-6 text-[28px] font-black tracking-tight text-slate-950">
        {title}
      </h2>

      <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-600">
        {description}
      </p>

      <div
        className={[
          "mt-6 grid gap-2.5",
          actions.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1",
        ].join(" ")}
      >
        {actions.map((action) => {
          const toneClass =
            action.tone === "secondary"
              ? toneStyle.secondary
              : action.tone === "danger"
                ? toneStyle.danger
                : toneStyle.primary;

          return (
            <Link
              key={`${title}-${action.href}-${action.label}`}
              href={action.href}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-2xl px-4 py-3 text-center text-sm font-semibold transition ${toneClass}`}
            >
              {action.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ModuleSectionBlock({
  title,
  eyebrow,
  description,
  modules,
}: ModuleSectionConfig) {
  return (
    <section className="border-t border-[#e4dccf] pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#e5ddd0] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            {eyebrow}
          </div>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            {title}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>

        <div className="w-max rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {modules.length} {modules.length === 1 ? "modulo" : "modulos"}
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(({ key, ...module }) => (
          <ModulePanel key={key} {...module} />
        ))}
      </div>
    </section>
  );
}

function resolveSaludo({
  esAdmin,
  esSupervisor,
  esApoyoOperativo,
  esVendedor,
  esFacturador,
  nombreUsuario,
  sedeLabel,
}: {
  esAdmin: boolean;
  esSupervisor: boolean;
  esApoyoOperativo: boolean;
  esVendedor: boolean;
  esFacturador: boolean;
  nombreUsuario: string;
  sedeLabel: string;
}) {
  if (esApoyoOperativo) {
    return `Bienvenido, ${nombreUsuario}. Desde aqui registras ventas y consultas el radar de disponibilidad por referencia.`;
  }

  if (esVendedor) {
    return `Bienvenido, ${nombreUsuario}. Desde aqui solo registras ventas nuevas.`;
  }

  if (esFacturador) {
    return `Bienvenido, ${nombreUsuario}. Desde aqui registras la facturacion pendiente.`;
  }

  if (esAdmin) {
    return `Bienvenido, ${nombreUsuario}. Controla la operacion completa desde un solo panel.`;
  }

  if (esSupervisor) {
    return `Bienvenido, ${nombreUsuario}. Gestiona la operacion de ${sedeLabel} con acceso directo a tus modulos principales.`;
  }

  return `Bienvenido, ${nombreUsuario}.`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; sedeId?: string }>;
}) {
  const session = await getSessionUser();

  if (!session) {
    return <div className="p-10">No autenticado</div>;
  }

  const esAdmin = esRolAdministrativo(session.rolNombre);
  const esFacturador = esPerfilFacturador(session.perfilTipo);
  const esPerfilVentas = esPerfilRegistroVenta(session.perfilTipo);
  const esApoyoOperativo = esPerfilApoyoOperativo(session.perfilTipo);
  const esVendedor = esPerfilVentas && !esApoyoOperativo;
  const esSupervisor =
    esPerfilSupervisor(session.perfilTipo) ||
    String(session.rolNombre || "").toUpperCase() === "SUPERVISOR";
  const esSedeSoloInventario = !esAdmin && Boolean(session.sedeSoloInventarioPorCobrar);
  const puedeVerEquality = !esSedeSoloInventario && (esAdmin || esSupervisor);
  const puedeVerFacturacion = puedeAccederPanelFacturador(
    session.perfilTipo,
    session.rolNombre
  );
  const puedeVerReporteSiigo = puedeConsultarReporteSiigo(
    session.rolNombre,
    session.perfilTipo,
    session.perfilNombre
  );
  const nombreUsuario = session.nombre ?? "Usuario";
  const rolUsuario = session.perfilTipoLabel ?? session.rolNombre ?? "USUARIO";
  const sedeLabel = esAdmin
    ? "TODAS LAS SEDES"
    : session.sedeNombre ?? "SIN SEDE";
  const saludo = resolveSaludo({
    esAdmin,
    esSupervisor,
    esApoyoOperativo,
    esVendedor,
    esFacturador,
    nombreUsuario,
    sedeLabel,
  });

  const params = await searchParams;
  const periodoSolicitado = String(params?.period || "").trim();
  const mesActual =
    getBogotaMonthRangeFromInput(periodoSolicitado) ??
    getCurrentBogotaMonthRange();
  const sedes = esAdmin
    ? await prisma.sede.findMany({
        where: { activa: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }).catch((error) => {
        console.error("ERROR CARGANDO SEDES DEL DASHBOARD:", error);
        return [];
      })
    : [];
  const sedeSolicitadaId = Number(params?.sedeId || 0);
  const sedeSeleccionada =
    esAdmin && Number.isInteger(sedeSolicitadaId) && sedeSolicitadaId > 0
      ? sedes.find((sede) => sede.id === sedeSolicitadaId) ?? null
      : null;
  const sedeDashboardId = esAdmin
    ? sedeSeleccionada?.id ?? null
    : session.sedeId ?? null;
  const coberturaDashboard = esAdmin
    ? sedeSeleccionada?.nombre ?? "Todas las sedes"
    : session.sedeNombre ?? "Tu sede";
  const mostrarDashboardOperativo =
    !esPerfilVentas &&
    !esFacturador &&
    !esSedeSoloInventario;
  const resultadosDashboard = mostrarDashboardOperativo
    ? await Promise.allSettled([
        getMonthlyCommercialSummary({
          period: mesActual.key,
          sedeId: sedeDashboardId,
        }),
        esAdmin || esSupervisor
          ? getDashboardCashSummary({
              sedeId: sedeDashboardId,
              fechaCorte: mesActual.end,
            })
          : Promise.resolve(null),
        getDashboardOperationalSummary({
          sedeId: sedeDashboardId,
          incluirBodegaPrincipal:
            esAdmin &&
            (!sedeSeleccionada ||
              sedeSeleccionada.nombre.trim().toUpperCase() ===
                NOMBRE_SEDE_BODEGA),
          puedeVerAprobacionesVenta: esAdmin || esSupervisor,
          fechaCorte: mesActual.end,
        }),
      ])
    : null;
  const resultadoComercial = resultadosDashboard?.[0] ?? null;
  const resultadoFinanciero = resultadosDashboard?.[1] ?? null;
  const resultadoOperativo = resultadosDashboard?.[2] ?? null;
  const resumenComercialDisponible = resultadoComercial?.status === "fulfilled";
  const resumenFinancieroDisponible = resultadoFinanciero?.status === "fulfilled";
  const resumenOperativoDisponible = resultadoOperativo?.status === "fulfilled";

  if (resultadoComercial?.status === "rejected") {
    console.error("ERROR CARGANDO RESUMEN COMERCIAL DEL DASHBOARD:", resultadoComercial.reason);
  }
  if (resultadoFinanciero?.status === "rejected") {
    console.error("ERROR CARGANDO CAJA DEL DASHBOARD:", resultadoFinanciero.reason);
  }
  if (resultadoOperativo?.status === "rejected") {
    console.error("ERROR CARGANDO RESUMEN OPERATIVO DEL DASHBOARD:", resultadoOperativo.reason);
  }

  const resumenComercialMensual = mostrarDashboardOperativo
    ? resultadoComercial?.status === "fulfilled"
      ? resultadoComercial.value
      : createEmptyCommercialSummary(mesActual)
    : null;
  const resumenFinanciero = mostrarDashboardOperativo
    ? resultadoFinanciero?.status === "fulfilled"
      ? resultadoFinanciero.value
      : null
    : null;
  const resumenOperativo = mostrarDashboardOperativo
    ? resultadoOperativo?.status === "fulfilled"
      ? resultadoOperativo.value
      : createEmptyOperationalSummary()
    : null;
  const [
    mensajeBienvenidaVendedor,
    resumenGananciasVendedor,
    actividadPerfilVentas,
  ] = esPerfilVentas
    ? await Promise.all([
        getVendorWelcomeMessage(),
        getVendorEarningsSummary(Number(session.perfilId || 0)),
        getSalesRoleActivitySummary(Number(session.perfilId || 0)),
      ])
    : ([null, null, null] as const);
  const financieraDestacada =
    resumenComercialMensual?.topFinancieras[0] ?? null;

  if (
    mostrarDashboardOperativo &&
    resumenComercialMensual &&
    resumenOperativo
  ) {
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
      {
        href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico",
        icon: "reports",
        label: "Reportes",
      },
      ...(esAdmin
        ? ([
            {
              href: "/dashboard/sedes",
              icon: "settings",
              label: "Configuración",
            },
          ] satisfies NavigationItem[])
        : []),
    ];

    return (
      <>
        {puedeAccederModulosOperativos(session.perfilTipo) && session.sedeId && (
          <PendingLoanAlertModal
            sessionKey={session.sessionKey ?? `${session.id}-${session.perfilId ?? "usuario"}`}
          />
        )}
        <OperationsDashboard
          commercial={resumenComercialMensual}
          commercialAvailable={resumenComercialDisponible}
          coverageLabel={coberturaDashboard}
          detailedRankings={
            resumenComercialDisponible ? (
              <CommercialRankingSection
                periodLabel={mesActual.label}
                coverageLabel={coberturaDashboard}
                totalVentas={resumenComercialMensual.ventas}
                topSedesJalador={resumenComercialMensual.topSedesJalador}
                topVentasSede={resumenComercialMensual.topVentasSede}
                topJaladores={resumenComercialMensual.topJaladores}
                topCerradores={resumenComercialMensual.topCerradores}
                topFinancieras={resumenComercialMensual.topFinancieras}
                mostrarAccionesMonetarias={!esSupervisor || esAdmin}
              />
            ) : null
          }
          esAdmin={esAdmin}
          esSupervisor={esSupervisor}
          financial={resumenFinanciero}
          financialAvailable={resumenFinancieroDisponible}
          navigationItems={navigationItems}
          operational={resumenOperativo}
          operationalAvailable={resumenOperativoDisponible}
          period={mesActual.key}
          periodLabel={mesActual.label}
          puedeVerEquality={puedeVerEquality}
          puedeVerFacturacion={puedeVerFacturacion}
          puedeVerReporteSiigo={puedeVerReporteSiigo}
          rolUsuario={rolUsuario}
          sedeId={sedeSeleccionada?.id ?? null}
          sedes={sedes}
          usuario={nombreUsuario}
        />
      </>
    );
  }

  if (
    esPerfilVentas &&
    resumenGananciasVendedor &&
    actividadPerfilVentas
  ) {
    return (
      <>
        {mensajeBienvenidaVendedor && (
          <VendorWelcomeModal
            mensaje={mensajeBienvenidaVendedor}
            sessionKey={
              session.sessionKey ??
              `${session.id}-${session.perfilId ?? "usuario"}`
            }
          />
        )}
        {puedeAccederModulosOperativos(session.perfilTipo) && session.sedeId && (
          <PendingLoanAlertModal
            sessionKey={
              session.sessionKey ??
              `${session.id}-${session.perfilId ?? "usuario"}`
            }
          />
        )}
        <SalesRoleDashboard
          activity={actividadPerfilVentas}
          coverageLabel={session.sedeNombre ?? "Sin sede"}
          earnings={resumenGananciasVendedor}
          perfilNombre={session.perfilNombre}
          role={esApoyoOperativo ? "APOYO_OPERATIVO" : "VENDEDOR"}
          roleLabel={rolUsuario}
          usuario={nombreUsuario}
        />
      </>
    );
  }

  const sessionBadges: SessionBadge[] = [
    { label: "Usuario", value: nombreUsuario },
    { label: "Rol", value: rolUsuario },
    { label: "Cobertura", value: sedeLabel },
    ...(esSedeSoloInventario
      ? ([{ label: "Modo", value: "Solo inventario" }] as SessionBadge[])
      : []),
    ...(session.perfilNombre
      ? ([{ label: "Perfil", value: session.perfilNombre }] as SessionBadge[])
      : []),
  ];

  const moduleCatalog: Record<ModuleKey, ModuleCard> = {
    aprobaciones: {
      key: "aprobaciones",
      title: "APROBACIONES",
      eyebrow: "Bandeja",
      description: puedeVerFacturacion
        ? "Centraliza prestamos, pagos, devoluciones, ventas y facturacion pendiente."
        : "Centraliza prestamos, pagos, devoluciones y ventas pendientes.",
      actions: [
        { href: "/dashboard/aprobaciones", label: "Abrir bandeja", tone: "primary" },
        { href: "/prestamos", label: "Prestamos", tone: "secondary" },
        { href: "/ventas/aprobaciones", label: "Ventas", tone: "secondary" },
      ],
      tone: "amber",
    },
    inventario: {
      key: "inventario",
      title: "INVENTARIO",
      eyebrow: "Control",
      description:
        "Consulta inventario, movimientos y trazabilidad del equipo disponible.",
      actions: [
        { href: "/inventario", label: "Ver inventario", tone: "primary" },
        { href: "/inventario/nuevo", label: "Nuevo inventario", tone: "secondary" },
        ...(esAdmin
          ? ([{ href: "/inventario-principal", label: "Bodega principal", tone: "secondary" }] as ModuleAction[])
          : []),
        { href: "/inventario/historial", label: "IMEI historico", tone: "secondary" },
      ],
      tone: "sky",
    },
    ventas: {
      key: "ventas",
      title: "VENTAS",
      eyebrow: "Operacion",
      description:
        "Consulta ventas registradas y completa nuevas operaciones desde el modulo comercial.",
      actions: [
        { href: "/ventas", label: "Ver ventas", tone: "primary" },
        { href: "/ventas/nuevo", label: "Nueva venta", tone: "secondary" },
        ...(esAdmin || esSupervisor
          ? ([{ href: "/ventas/aprobaciones", label: "Aprobacion de ventas", tone: "secondary" }] as ModuleAction[])
          : []),
      ],
      tone: "violet",
    },
    caja: {
      key: "caja",
      title: "CAJA",
      eyebrow: "Finanzas",
      description:
        "Revisa ingresos, egresos y control diario de caja desde una vista directa.",
      actions: [
        { href: "/caja", label: "Ver caja", tone: "primary" },
        { href: "/caja/cierre-dia", label: "CIERRE DEL DIA", tone: "secondary" },
        { href: "/caja/gestion", label: "Ingresos / Gastos", tone: "secondary" },
        { href: "/caja/arqueo", label: "Arqueo", tone: "secondary" },
        { href: "/dashboard/financiero", label: "Panel financiero", tone: "secondary" },
        {
          href: esAdmin ? "/dashboard/financiero/cartera" : "/caja/cartera",
          label: "Cartera",
          tone: "secondary",
        },
      ],
      tone: "rose",
    },
    prestamos: {
      key: "prestamos",
      title: "PRESTAMOS",
      eyebrow: "Seguimiento",
      description:
        "Administra prestamos, devoluciones y estados pendientes entre sedes.",
      actions: [
        { href: "/prestamos", label: "Ver prestamos", tone: "primary" },
        { href: "/prestamos/nuevo", label: "Nuevo prestamo", tone: "secondary" },
        { href: "/dashboard/deuda-sedes", label: "Deuda entre sedes", tone: "secondary" },
        { href: "/alertas/prestamos", label: "Alertas", tone: "secondary" },
      ],
      tone: "amber",
    },
    registrarVenta: {
      key: "registrarVenta",
      title: esPerfilRegistroVenta(session.perfilTipo)
        ? "REGISTRAR VENTAS"
        : "REGISTRAR VENTA",
      eyebrow: "Vendedor / Registros",
      description: esPerfilRegistroVenta(session.perfilTipo)
        ? "Digitaliza el tramite completo de la venta desde un unico modulo."
        : "Digitaliza la hoja de plataforma y registra el tramite completo desde este modulo.",
      actions: [
        { href: "/vendedor/registros", label: "Registrar venta", tone: "primary" },
        { href: "/vendedor/lista-negra", label: "LISTA NEGRA", tone: "danger" },
        ...(!esAdmin
          ? ([
              {
                href: "/vendedor/lista-precios",
                label: "LISTA DE PRECIOS",
                tone: "secondary",
              },
            ] as ModuleAction[])
          : []),
        ...(!esPerfilRegistroVenta(session.perfilTipo)
          ? ([{ href: "/vendedor/registros/buscar", label: "Buscar registro", tone: "secondary" }] as ModuleAction[])
          : []),
      ],
      tone: "emerald",
    },
    radar: {
      key: "radar",
      title: "RADAR",
      eyebrow: "Disponibilidad",
      description:
        "Consulta referencias en bodega principal y sedes, con detalle por sede al abrir cada resultado.",
      actions: [{ href: "/dashboard/radar", label: "Abrir radar", tone: "primary" }],
      tone: "sky",
    },
    registrarFacturacion: {
      key: "registrarFacturacion",
      title: "FACTURACIÓN",
      eyebrow: "Facturador / Registros",
      description:
        "Consulta los registros pendientes y completa el proceso de facturacion.",
      actions: [
        {
          href: esAdmin ? "/dashboard/registros" : "/facturador/registros",
          label: "Abrir facturacion",
          tone: "primary",
        },
        ...(puedeVerReporteSiigo
          ? ([
              {
                href: esAdmin
                  ? "/dashboard/registros#reporte-siigo"
                  : "/facturador/registros#reporte-siigo",
                label: "Reporte Siigo",
                tone: "secondary",
              },
            ] as ModuleAction[])
          : []),
        ...(esAdmin
          ? ([
              {
                href: "/dashboard/facturacion/base-datos",
                label: "BASE DE DATOS",
                tone: "secondary",
              },
            ] as ModuleAction[])
          : []),
      ],
      tone: "emerald",
    },
    administracion: {
      key: "administracion",
      title: "ADMINISTRACION",
      eyebrow: "Sistema",
      description:
        "Gestiona sedes, perfiles, catalogos y revisiones internas del sistema.",
      actions: [
        { href: "/dashboard/sedes", label: "Gestion sedes", tone: "primary" },
        { href: "/ventas/perfiles", label: "Perfiles vendedores", tone: "secondary" },
        { href: "/ventas/equipo-comercial", label: "Catalogos de ventas", tone: "secondary" },
        { href: "/dashboard/lista-precios", label: "Lista de precios", tone: "secondary" },
        { href: "/dashboard/top-marcas-vendidas", label: "Top marcas vendidas", tone: "secondary" },
        { href: "/dashboard/auditoria", label: "Auditoria", tone: "secondary" },
        { href: "/dashboard/seguridad/mensaje-vendedor", label: "Mensaje vendedores", tone: "secondary" },
        { href: "/dashboard/seguridad", label: "Seguridad", tone: "danger" },
      ],
      tone: "slate",
    },
    payjoy: {
      key: "payjoy",
      title: "PAYJOY",
      eyebrow: "Cartera",
      description:
        "Gestiona cartera y seguimiento operativo de PayJoy desde el panel administrativo.",
      actions: [
        { href: "/dashboard/payjoy", label: "Cartera PayJoy", tone: "primary" },
        { href: "/dashboard/payjoy/40-60", label: "40/60", tone: "secondary" },
      ],
      tone: "slate",
    },
    sumaspay: {
      key: "sumaspay",
      title: "SUMASPAY",
      eyebrow: "Consulta",
      description:
        "Carga cedulas por archivo TXT y consulta nombre y valor de cuota.",
      actions: [
        {
          href: "/dashboard/sumaspay",
          label: "Consultar lote",
          tone: "primary",
        },
      ],
      tone: "emerald",
    },
    nuovo: {
      key: "nuovo",
      title: "NUOVO",
      eyebrow: "Dispositivos",
      description:
        "Consulta dispositivos y gestiona el flujo operativo de NUOVO desde su panel.",
      actions: [
        { href: "/dashboard/nuovopay", label: "Dispositivos", tone: "primary" },
        ...(esAdmin
          ? ([{ href: "/dashboard/nuovopay/cartera", label: "Cartera", tone: "secondary" }] as ModuleAction[])
          : []),
      ],
      tone: "amber",
    },
    equality: {
      key: "equality",
      title: "TRUSTONIC",
      eyebrow: "Zero Touch",
      description:
        "Administra consulta y control de dispositivos desde HBM Equality.",
      actions: [
        { href: "/dashboard/equality", label: "Dispositivos", tone: "primary" },
      ],
      tone: "violet",
    },
  };

  const mapModuleKeys = (keys: ModuleKey[]) =>
    keys
      .filter((key) => (key === "equality" ? puedeVerEquality : true))
      .map((key) => moduleCatalog[key]);

  const adminModuleSections: ModuleSectionConfig[] = esAdmin
    ? [
        {
          eyebrow: "Operacion",
          title: "Control operativo",
          description:
            "Atajos para aprobar movimientos, revisar inventario y controlar prestamos entre sedes.",
          modules: mapModuleKeys(["aprobaciones", "inventario", "prestamos"]),
        },
        {
          eyebrow: "Comercial",
          title: "Gestion comercial",
          description:
            "Ventas, registros del asesor y facturacion quedan reunidos en el mismo bloque.",
          modules: mapModuleKeys(["ventas", "registrarVenta", "registrarFacturacion"]),
        },
        {
          eyebrow: "Finanzas",
          title: "Caja y control financiero",
          description:
            "Movimientos de caja, cierre del dia, arqueos, cartera y panel financiero.",
          modules: mapModuleKeys(["caja"]),
        },
        {
          eyebrow: "Administracion",
          title: "Configuracion y auditoria",
          description:
            "Sedes, perfiles, catalogos, lista de precios y auditoria quedan separados de la operacion diaria.",
          modules: mapModuleKeys(["administracion"]),
        },
        {
          eyebrow: "Plataformas",
          title: "Plataformas externas",
          description:
            "Accesos directos a SUMASPAY, PayJoy, NUOVO y Trustonic para consulta y seguimiento.",
          modules: mapModuleKeys(["sumaspay", "payjoy", "nuovo", "equality"]),
        },
      ]
    : [];

  const moduleOrder: ModuleKey[] = esAdmin
    ? [
        "aprobaciones",
        "inventario",
        "ventas",
        "caja",
        "prestamos",
        "registrarVenta",
        "registrarFacturacion",
        "administracion",
        "sumaspay",
        "payjoy",
        "nuovo",
        "equality",
      ]
    : esSedeSoloInventario
      ? ["inventario", "prestamos"]
    : esSupervisor
      ? [
          "aprobaciones",
          "inventario",
          "ventas",
          "caja",
          "prestamos",
          "registrarVenta",
          "nuovo",
          "equality",
        ]
      : esApoyoOperativo
        ? ["registrarVenta", "radar"]
      : esVendedor
        ? ["registrarVenta"]
        : esFacturador
          ? ["registrarFacturacion"]
          : ["inventario", "ventas", "caja"];

  const modules = mapModuleKeys(moduleOrder);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] text-slate-950">
      {puedeAccederModulosOperativos(session.perfilTipo) && session.sedeId && (
        <PendingLoanAlertModal
          sessionKey={session.sessionKey ?? `${session.id}-${session.perfilId ?? "usuario"}`}
        />
      )}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_48%,#0f766e_100%)] px-6 py-6 shadow-[0_26px_85px_rgba(15,23,42,0.2)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <BrandBadge />

              <p className="mt-6 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
                {saludo}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {sessionBadges.map((item) => (
                  <SessionChip key={`${item.label}-${item.value}`} {...item} />
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:items-start">
              {(esAdmin || (esSupervisor && !esSedeSoloInventario)) && (
                <Link
                  href="/dashboard/radar"
                  className="inline-flex min-w-[130px] items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-emerald-800 shadow-[0_16px_38px_rgba(15,23,42,0.12)] transition hover:bg-white"
                >
                  RADAR
                </Link>
              )}
              {!esSedeSoloInventario &&
                !esPerfilRegistroVenta(session.perfilTipo) &&
                !esFacturador && (
                <>
                  {esAdmin && (
                    <Link
                      href="/dashboard/reportes"
                      className="inline-flex min-w-[140px] items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-amber-800 shadow-[0_16px_38px_rgba(15,23,42,0.12)] transition hover:bg-white"
                    >
                      Reportes
                    </Link>
                  )}
                  <Link
                    href="/dashboard/analitico"
                    className="inline-flex min-w-[170px] items-center justify-center rounded-2xl border border-white/12 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_16px_38px_rgba(15,23,42,0.18)] transition hover:bg-slate-100"
                  >
                    Panel analitico
                  </Link>
                </>
              )}
              <LogoutButton className="min-w-[170px] border-white/12 bg-white/10 text-white shadow-[0_16px_38px_rgba(15,23,42,0.18)] hover:border-white/20 hover:bg-white/16" />
            </div>
          </div>
        </section>

        {esAdmin && resumenComercialMensual ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <MetricCard
              label="Utilidad del mes"
              value={formatoPesos(Number(resumenComercialMensual.utilidad || 0))}
              detail={`Acumulado de ${mesActual.label}.`}
              valueClassName="text-emerald-600"
            />
            <MetricCard
              label="Ventas del mes"
              value={String(resumenComercialMensual.ventas || 0)}
              detail="Registros comerciales del periodo."
            />
            <MetricCard
              label="Caja acumulada"
              value={formatoPesos(Number(resumenFinanciero?.cajaDisponible || 0))}
              detail="Caja disponible acumulada."
            />
            <MetricCard
              label="Financiera lider"
              value={financieraDestacada?.nombre ?? "Sin datos"}
              detail={
                financieraDestacada
                  ? `${financieraDestacada.total} usos | ${formatoPesos(financieraDestacada.monto)}`
                  : "Sin movimientos registrados."
              }
            />
          </section>
        ) : esPerfilRegistroVenta(session.perfilTipo) ||
            esFacturador ||
            esSedeSoloInventario ? null : (
          <div className="mt-6">
            <DashboardUtilityGate coverageLabel={sedeLabel} requiereClave={!esAdmin} />
          </div>
        )}

        <section className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#e5ddd0] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                Modulos disponibles
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                {esAdmin ? "Panel administrativo" : "Accesos por rol"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {esAdmin
                  ? "Vista organizada por areas para encontrar rapido cada control del sistema."
                  : esSedeSoloInventario
                    ? "Vista limitada para consultar inventario y gestionar prestamos pendientes."
                  : "Vista simplificada del dashboard para entrar directo a cada modulo principal."}
              </p>
            </div>
          </div>

          {esAdmin ? (
            <div className="mt-6 space-y-9">
              {adminModuleSections.map((section) => (
                <ModuleSectionBlock key={section.title} {...section} />
              ))}
            </div>
          ) : (
            <div
              className={[
                "mt-6 grid gap-5",
                modules.length === 1
                  ? "max-w-xl"
                  : modules.length === 7
                    ? "md:grid-cols-2 xl:grid-cols-3"
                    : "md:grid-cols-2 xl:grid-cols-3",
              ].join(" ")}
            >
              {modules.map(({ key, ...module }) => (
                <ModulePanel key={key} {...module} />
              ))}
            </div>
          )}
        </section>

        {!esSedeSoloInventario &&
          !esPerfilRegistroVenta(session.perfilTipo) &&
          !esFacturador &&
          resumenComercialMensual && (
          <div className="mt-6">
            <CommercialRankingSection
              periodLabel={mesActual.label}
              coverageLabel={esAdmin ? "Todas las sedes" : sedeLabel}
              totalVentas={resumenComercialMensual.ventas}
              topSedesJalador={resumenComercialMensual.topSedesJalador}
              topVentasSede={resumenComercialMensual.topVentasSede}
              topJaladores={resumenComercialMensual.topJaladores}
              topCerradores={resumenComercialMensual.topCerradores}
              topFinancieras={resumenComercialMensual.topFinancieras}
            />
          </div>
        )}
      </main>
    </div>
  );
}
