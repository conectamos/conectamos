import Link from "next/link";
import type { VendorEarningsSummary } from "@/lib/vendor-earnings";
import type { SalesRoleActivitySummary } from "@/lib/dashboard-sales-role-summary";
import { DashboardSidebar, type NavigationItem } from "./operations-dashboard";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";
import LogoutButton from "./logout-button";

type SalesRole = "VENDEDOR" | "APOYO_OPERATIVO";

type QuickAction = {
  description: string;
  href: string;
  icon: DashboardIconName;
  label: string;
  primary?: boolean;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  })}`;
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function RoleKpiCard({
  detail,
  icon,
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  detail: string;
  icon: DashboardIconName;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <article className="min-h-[142px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p
            className={[
              "mt-2 break-words text-[28px] font-black leading-tight tracking-tight",
              valueClassName,
            ].join(" ")}
          >
            {value}
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div>
        <h2 className="text-xl font-black tracking-tight text-slate-950">
          Accesos rápidos
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Sólo las herramientas habilitadas para tu perfil.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={[
              "flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition",
              action.primary
                ? "border-[#e30613] bg-[#e30613] text-white shadow-[0_10px_26px_rgba(227,6,19,0.18)] hover:bg-[#c9000c]"
                : "border-slate-200 bg-white text-slate-800 hover:border-[#e30613]/35 hover:text-[#e30613]",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                action.primary
                  ? "bg-white/15 text-white"
                  : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              <DashboardIcon name={action.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{action.label}</span>
              <span
                className={[
                  "mt-0.5 block text-xs font-medium",
                  action.primary ? "text-white/75" : "text-slate-500",
                ].join(" ")}
              >
                {action.description}
              </span>
            </span>
            <DashboardIcon name="arrow" className="h-4 w-4 shrink-0" />
          </Link>
        ))}
      </div>
    </article>
  );
}

function EarningsPanel({
  earnings,
  className = "",
}: {
  earnings: VendorEarningsSummary;
  className?: string;
}) {
  const estadoLabel = earnings.bolsaHabilitada ? "TOP 5" : "FUERA DEL TOP 5";

  return (
    <article
      className={[
        "overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]",
        earnings.bolsaHabilitada ? "border-emerald-200" : "border-rose-200",
        className,
      ].join(" ")}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span
              className={[
                "inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
                earnings.bolsaHabilitada
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              Bolsa de ganancias
            </span>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              {estadoLabel}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {earnings.bolsaHabilitada
                ? "Tu bolsa está habilitada. Mantén tu posición para continuar acumulando recompensas."
                : "Sigue registrando ventas para subir de posición e ingresar al Top 5."}
            </p>
          </div>

          <div
            className={[
              "flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-[12px] bg-white text-center",
              earnings.bolsaHabilitada
                ? "border-emerald-100 border-t-emerald-500"
                : "border-rose-100 border-t-[#e30613]",
            ].join(" ")}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Puesto
            </span>
            <span className="mt-1 text-2xl font-black text-slate-950">
              {earnings.puestoActual ? `#${earnings.puestoActual}` : "—"}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">Ventas del mes</p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {earnings.ventasMes}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Bono por venta</p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatoPesos(earnings.valorBonoPorVenta)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Total acumulado</p>
            <p
              className={[
                "mt-1 text-xl font-black",
                earnings.totalGanado > 0 ? "text-emerald-600" : "text-slate-950",
              ].join(" ")}
            >
              {formatoPesos(earnings.totalGanado)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function SupportWorkflow({
  activity,
}: {
  activity: SalesRoleActivitySummary;
}) {
  const steps: Array<QuickAction & { value: string }> = [
    {
      description: "Completa el trámite comercial desde el módulo autorizado.",
      href: "/vendedor/registros",
      icon: "sales",
      label: "Registrar ventas",
      value: `${activity.registrosPeriodo} en el periodo`,
    },
    {
      description: "Consulta disponibilidad por referencia y sede.",
      href: "/dashboard/radar",
      icon: "reports",
      label: "Radar de inventario",
      value: "Consulta en tiempo real",
    },
    {
      description: "Valida al cliente antes de continuar el registro.",
      href: "/vendedor/lista-negra",
      icon: "warning",
      label: "Lista negra",
      value: "Validación comercial",
    },
  ];

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
      <div>
        <h2 className="text-xl font-black tracking-tight text-slate-950">
          Flujo operativo
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Registro comercial y disponibilidad desde un solo lugar.
        </p>
      </div>

      <div className="mt-5 divide-y divide-slate-100">
        {steps.map((step) => (
          <div
            key={step.href}
            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
              <DashboardIcon name={step.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-slate-900">{step.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {step.description}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-700">{step.value}</p>
            </div>
            <Link
              href={step.href}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-[#e30613]/35 hover:text-[#e30613]"
            >
              Abrir
              <DashboardIcon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function SalesRoleDashboard({
  activity,
  coverageLabel,
  earnings,
  perfilNombre,
  role,
  roleLabel,
  usuario,
}: {
  activity: SalesRoleActivitySummary;
  coverageLabel: string;
  earnings: VendorEarningsSummary;
  perfilNombre?: string | null;
  role: SalesRole;
  roleLabel: string;
  usuario: string;
}) {
  const esApoyo = role === "APOYO_OPERATIVO";
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    {
      href: "/vendedor/registros",
      icon: "sales",
      label: esApoyo ? "Registrar ventas" : "Registrar venta",
    },
    ...(esApoyo
      ? ([
          {
            href: "/dashboard/radar",
            icon: "reports",
            label: "Radar",
          },
        ] satisfies NavigationItem[])
      : []),
    {
      href: "/vendedor/lista-negra",
      icon: "warning",
      label: "Lista negra",
    },
    {
      href: "/vendedor/lista-precios",
      icon: "inventory",
      label: "Lista de precios",
    },
  ];
  const quickActions: QuickAction[] = [
    {
      description: esApoyo ? "Iniciar un registro comercial" : "Registrar una venta nueva",
      href: "/vendedor/registros",
      icon: "sales",
      label: esApoyo ? "Registrar venta" : "Nueva venta",
      primary: true,
    },
    ...(esApoyo
      ? ([
          {
            description: "Consultar disponibilidad",
            href: "/dashboard/radar",
            icon: "reports",
            label: "Abrir radar",
          },
        ] satisfies QuickAction[])
      : []),
    {
      description: "Validar información del cliente",
      href: "/vendedor/lista-negra",
      icon: "warning",
      label: "Consultar lista negra",
    },
    {
      description: "Consultar referencias y precios",
      href: "/vendedor/lista-precios",
      icon: "inventory",
      label: "Lista de precios",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar coverageLabel={coverageLabel} items={navigationItems} />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[27px] font-black tracking-tight text-slate-950 sm:text-[31px]">
                {esApoyo ? "Panel operativo" : "Panel de ventas"}
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                {esApoyo
                  ? "Registro comercial y consulta de disponibilidad"
                  : "Tu rendimiento y accesos comerciales"}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm">
                  <DashboardIcon name="calendar" className="h-5 w-5 text-slate-500" />
                  {earnings.periodoLabel}
                </div>
                <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[230px]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                    {iniciales(usuario) || <DashboardIcon name="user" className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{usuario}</p>
                    <p className="truncate text-xs text-slate-500">
                      {roleLabel} · {coverageLabel}
                    </p>
                  </div>
                </div>
                <LogoutButton variant="light" className="min-h-12 shrink-0 px-4" />
              </div>
              {perfilNombre && (
                <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Perfil: {perfilNombre}
                </span>
              )}
            </div>
          </header>

          <section
            className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Indicadores del perfil"
          >
            {esApoyo ? (
              <>
                <RoleKpiCard
                  label="Registros del periodo"
                  value={String(activity.registrosPeriodo)}
                  detail="Registros creados por tu perfil durante el mes."
                  icon="reports"
                />
                <RoleKpiCard
                  label="Por completar"
                  value={String(activity.pendientes)}
                  detail="Registros que continúan abiertos."
                  icon="warning"
                  valueClassName={activity.pendientes > 0 ? "text-orange-600" : "text-slate-950"}
                />
                <RoleKpiCard
                  label="Convertidos en venta"
                  value={String(activity.convertidos)}
                  detail="Registros convertidos en ventas durante el periodo."
                  icon="trend"
                  valueClassName={activity.convertidos > 0 ? "text-emerald-600" : "text-slate-950"}
                />
                <RoleKpiCard
                  label="Cobertura"
                  value={coverageLabel}
                  detail="Tu perfil sólo opera con la sede asignada."
                  icon="store"
                />
              </>
            ) : (
              <>
                <RoleKpiCard
                  label="Ventas del mes"
                  value={String(earnings.ventasMes)}
                  detail="Ventas válidas registradas en el periodo."
                  icon="sales"
                />
                <RoleKpiCard
                  label="Puesto actual"
                  value={earnings.puestoActual ? `#${earnings.puestoActual}` : "Sin puesto"}
                  detail="Posición vigente en el ranking comercial."
                  icon="reports"
                />
                <RoleKpiCard
                  label="Ganancia acumulada"
                  value={formatoPesos(earnings.totalGanado)}
                  detail="Valor acumulado en la Bolsa de Ganancias."
                  icon="cash"
                  valueClassName={earnings.totalGanado > 0 ? "text-emerald-600" : "text-slate-950"}
                />
                <RoleKpiCard
                  label="Con recompensa"
                  value={String(earnings.totalVentasConComision)}
                  detail="Ventas del periodo que activaron recompensa."
                  icon="trend"
                />
              </>
            )}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
            {esApoyo ? (
              <SupportWorkflow activity={activity} />
            ) : (
              <EarningsPanel earnings={earnings} />
            )}
            <QuickActions actions={quickActions} />
          </section>

          {esApoyo && (
            <div className="mt-5">
              <EarningsPanel earnings={earnings} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
