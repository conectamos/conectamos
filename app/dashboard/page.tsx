import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import DashboardUtilityGate from "./_components/dashboard-utility-gate";
import LogoutButton from "./_components/logout-button";
import { getCurrentBogotaMonthRange } from "@/lib/ventas-utils";
import {
  getMonthlyCommercialSummary,
  type CommercialRankingItem,
} from "@/lib/dashboard-commercial-summary";

type NavItem = {
  href: string;
  label: string;
};

type ActionTone = "primary" | "secondary" | "danger";

type ModuleAction = {
  href: string;
  label: string;
  tone?: ActionTone;
};

type ModuleCard = {
  accent: string;
  badge: string;
  eyebrow: string;
  title: string;
  description: string;
  actions: ModuleAction[];
};

type SessionItem = {
  label: string;
  value: string;
  detail: string;
  dot: string;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function DashboardLogoBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-[#d9c7ab]/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,241,230,0.78)_100%)] shadow-[0_16px_34px_rgba(15,23,42,0.10)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(199,154,87,0.24),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-[12px] rounded-full border-[3px] border-[#b98746]/70" />
        <div className="pointer-events-none absolute inset-y-[12px] left-[12px] w-4 rounded-l-full bg-[linear-gradient(180deg,#fffaf1_0%,#f6ecdb_100%)]" />
        <div className="pointer-events-none absolute right-2.5 top-3 flex flex-col gap-1">
          <span className="h-1.5 w-5 rounded-full bg-[#b98746]/80" />
          <span className="h-1.5 w-4 rounded-full bg-[#b98746]/65" />
          <span className="h-1.5 w-3 rounded-full bg-[#b98746]/50" />
        </div>
        <span className="relative text-[32px] font-black tracking-tight text-[#191d24]">
          C
        </span>
      </div>

      {!compact && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f5b24]">
            Suite Conectamos
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Identidad adaptada al dashboard
          </p>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition",
        active
          ? "bg-[#17191d] text-white shadow-[0_14px_32px_rgba(15,23,42,0.18)]"
          : "text-slate-600 hover:bg-white/70 hover:text-slate-950",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "h-2.5 w-2.5 rounded-full transition",
          active ? "bg-[#c79a57]" : "bg-slate-300",
        ].join(" ")}
      />
    </Link>
  );
}

function SessionDetail({
  label,
  value,
  detail,
  dot,
}: SessionItem) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/60 px-4 py-4 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-lg font-black leading-tight text-slate-950">
            {value}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p>
        </div>

        <span className={["mt-1 h-2.5 w-2.5 rounded-full", dot].join(" ")} />
      </div>
    </div>
  );
}

function CommercialRankingPanel({
  title,
  accent,
  items,
  countLabel,
  showAmount = false,
}: {
  title: string;
  accent: string;
  items: CommercialRankingItem[];
  countLabel: string;
  showAmount?: boolean;
}) {
  const countText = (total: number) => {
    if (countLabel === "uso") {
      return total === 1 ? "uso" : "usos";
    }

    return total === 1 ? "venta" : "ventas";
  };

  return (
    <div className="rounded-[24px] border border-[#ebe2d4] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f2_100%)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black tracking-tight text-slate-950">
          {title}
        </p>
        <span className={["h-2.5 w-2.5 rounded-full", accent].join(" ")} />
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e5dccd] bg-[#fcfaf6] px-4 py-4 text-sm text-slate-500">
            Sin movimientos registrados en este periodo.
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={`${title}-${item.nombre}`}
              className="flex items-start justify-between gap-4 rounded-2xl border border-[#eee5d7] bg-white/90 px-4 py-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">
                    {item.nombre}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.total} {countText(item.total)}
                  </p>
                </div>
              </div>

              {showAmount && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Monto
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatoPesos(item.monto)}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommercialRankingSidebar({
  periodLabel,
  coverageLabel,
  topJaladores,
  topCerradores,
  topFinancieras,
}: {
  periodLabel: string;
  coverageLabel: string;
  topJaladores: CommercialRankingItem[];
  topCerradores: CommercialRankingItem[];
  topFinancieras: CommercialRankingItem[];
}) {
  return (
    <aside className="rounded-[32px] border border-[#e7ddcd] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f2_100%)] p-5 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
      <div className="sticky top-6">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-[#e7dccb] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Periodo: {periodLabel}
          </div>
          <div className="rounded-full border border-[#e7dccb] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Cobertura: {coverageLabel}
          </div>
        </div>

        <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
          Corte comercial
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ranking mensual de los participantes y financieras con mayor traccion comercial.
        </p>

        <div className="mt-5 space-y-3">
          <CommercialRankingPanel
            title="Top 5 jalador"
            accent="bg-sky-500"
            items={topJaladores}
            countLabel="venta"
          />

          <CommercialRankingPanel
            title="Top 5 cerrador"
            accent="bg-rose-500"
            items={topCerradores}
            countLabel="venta"
          />

          <CommercialRankingPanel
            title="Top 5 financieras mas usadas"
            accent="bg-amber-500"
            items={topFinancieras}
            countLabel="uso"
            showAmount
          />
        </div>
      </div>
    </aside>
  );
}

function ActionLink({
  href,
  label,
  tone = "secondary",
}: ModuleAction) {
  const tones: Record<ActionTone, string> = {
    primary:
      "border border-[#111318] bg-[#111318] text-white hover:bg-[#1b1f27] hover:border-[#1b1f27]",
    secondary:
      "border border-[#d7cfbf] bg-[#fcfaf5] text-slate-700 hover:bg-white hover:border-[#c6b99f]",
    danger:
      "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300",
  };

  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition",
        tones[tone],
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ModulePanel({
  accent,
  badge,
  eyebrow,
  title,
  description,
  actions,
}: ModuleCard) {
  return (
    <section className="group relative overflow-hidden rounded-[30px] border border-[#e8e0d1] bg-[linear-gradient(180deg,#ffffff_0%,#fbf9f4_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,154,87,0.10),transparent_32%)]" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div
            className={[
              "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]",
              badge,
            ].join(" ")}
          >
            {eyebrow}
          </div>

          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
            {title}
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        <span
          className={[
            "mt-1 h-12 w-1.5 rounded-full shadow-sm",
            accent,
          ].join(" ")}
        />
      </div>

      <div className="relative mt-6 flex flex-wrap gap-2.5">
        {actions.map((action) => (
          <ActionLink
            key={`${title}-${action.href}`}
            href={action.href}
            label={action.label}
            tone={action.tone}
          />
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const session = await getSessionUser();

  if (!session) {
    return <div className="p-10">No autenticado</div>;
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.id },
    include: {
      rol: true,
      sede: true,
    },
  });

  const esAdmin = usuario?.rol?.nombre === "ADMIN";
  const nombreUsuario = usuario?.nombre ?? "Usuario";
  const rolUsuario = usuario?.rol?.nombre ?? "USUARIO";
  const sedeLabel = esAdmin
    ? "TODAS LAS SEDES"
    : usuario?.sede?.nombre ?? "SIN SEDE";
  const saludo = esAdmin
    ? `Bienvenido, ${nombreUsuario}. Vista general del sistema.`
    : `Bienvenido, ${nombreUsuario}. Vista operativa de ${sedeLabel}.`;
  const mesActual = getCurrentBogotaMonthRange();

  const resumenComercialMensual = await getMonthlyCommercialSummary({
    sedeId: esAdmin ? null : usuario?.sede?.id ?? null,
  });

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Panel de control" },
    ...(esAdmin
      ? ([{ href: "/dashboard/sedes", label: "Gestion sedes" }] as NavItem[])
      : []),
    { href: "/inventario", label: "Inventario" },
    ...(esAdmin
      ? ([{ href: "/inventario-principal", label: "Bodega principal" }] as NavItem[])
      : []),
    { href: "/dashboard/nuovopay", label: "Nuovo dispositivos" },
    { href: "/dashboard/nuovopay/cartera", label: "Nuovo cartera" },
    { href: "/ventas", label: "Ventas" },
    { href: "/caja", label: "Caja" },
    { href: "/prestamos", label: "Prestamos" },
    { href: "/dashboard/financiero", label: "Panel financiero" },
    { href: "/dashboard/deuda-sedes", label: "Deuda entre sedes" },
    { href: "/alertas/prestamos", label: "Alertas" },
    { href: "/inventario/historial", label: "IMEI historico" },
  ];

  const sessionItems: SessionItem[] = [
    {
      label: "Usuario",
      value: nombreUsuario,
      detail: "Sesion activa",
      dot: "bg-blue-500",
    },
    {
      label: "Rol",
      value: rolUsuario,
      detail: esAdmin ? "Permisos globales" : "Permisos operativos",
      dot: "bg-red-500",
    },
    {
      label: "Cobertura",
      value: sedeLabel,
      detail: esAdmin ? "Vision consolidada" : "Trabajo por sede",
      dot: "bg-amber-500",
    },
    {
      label: "Estado",
      value: "Activo",
      detail: "Sistema disponible",
      dot: "bg-emerald-500",
    },
  ];

  const modules: ModuleCard[] = [
    {
      accent: "bg-sky-500",
      badge: "border-sky-200 bg-sky-50 text-sky-700",
      eyebrow: "Inventario / Gestion",
      title: "Inventario",
      description:
        esAdmin
          ? "Controla equipos, movimientos y trazabilidad desde inventario, bodega principal e historial de IMEI."
          : "Controla equipos, movimientos y trazabilidad desde inventario e historial de IMEI.",
      actions: [
        { href: "/inventario", label: "Ver inventario", tone: "primary" },
        { href: "/inventario/nuevo", label: "Nuevo inventario" },
        ...(esAdmin
          ? ([{ href: "/dashboard/sedes", label: "Gestion sedes" }] as ModuleAction[])
          : []),
        ...(esAdmin
          ? ([{ href: "/inventario-principal", label: "Bodega principal" }] as ModuleAction[])
          : []),
        { href: "/inventario/historial", label: "IMEI historico" },
      ],
    },
    {
      accent: "bg-amber-500",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      eyebrow: "Nuovo / Dispositivos",
      title: "Nuovo Dispositivos",
      description:
        "Consulta por IMEI o DEVICE, valida el estado del enrolamiento y ejecuta bloqueo o desbloqueo del equipo desde Conectamos.",
      actions: [
        {
          href: "/dashboard/nuovopay",
          label: "Abrir dispositivos",
          tone: "primary",
        },
      ],
    },
    {
      accent: "bg-orange-500",
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      eyebrow: "Nuovo / Cartera",
      title: "Nuovo Cartera",
      description:
        "Carga el TXT de cartera, detecta mora por cedula, genera bloqueos masivos y revisa rankings comerciales para seguimiento.",
      actions: [
        {
          href: "/dashboard/nuovopay/cartera",
          label: "Abrir cartera",
          tone: "primary",
        },
      ],
    },
    {
      accent: "bg-indigo-500",
      badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
      eyebrow: "Ventas / Gestion",
      title: "Ventas",
      description:
        "Consulta ventas registradas y agrega nuevas operaciones desde una vista mas directa.",
      actions: [
        { href: "/ventas", label: "Ver ventas", tone: "primary" },
        { href: "/ventas/nuevo", label: "Nueva venta" },
      ],
    },
    {
      accent: "bg-rose-500",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      eyebrow: "Caja / Gestion",
      title: "Caja",
      description:
        "Revisa ingresos, egresos, resumen financiero y cartera sin salir del bloque operativo.",
      actions: [
        { href: "/caja", label: "Ver caja", tone: "primary" },
        { href: "/caja/gestion", label: "Ingresos / Gastos" },
        { href: "/caja/arqueo", label: "Arqueo" },
        { href: "/dashboard/financiero", label: "Panel financiero" },
        {
          href: esAdmin ? "/dashboard/financiero/cartera" : "/caja/cartera",
          label: "Cartera",
          tone: "danger",
        },
      ],
    },
    {
      accent: "bg-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      eyebrow: "Prestamos / Gestion",
      title: "Prestamos",
      description:
        "Da seguimiento a traslados, pagos pendientes y alertas entre sedes desde una sola vista.",
      actions: [
        { href: "/prestamos", label: "Ver prestamos", tone: "primary" },
        { href: "/prestamos/nuevo", label: "Nuevo prestamo" },
        { href: "/dashboard/deuda-sedes", label: "Deuda entre sedes" },
        { href: "/alertas/prestamos", label: "Alertas" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#f2f5f9_100%)] text-slate-950">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-[320px] shrink-0 border-r border-[#e4dccd] bg-[linear-gradient(180deg,#f7f3ea_0%,#efe9dc_100%)] xl:flex xl:flex-col">
          <div className="px-6 py-7">
            <div className="rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0.62)_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <DashboardLogoBadge />

              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8f5b24]">
                Conectamos
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Dashboard
              </h1>
              <div className="mt-4 h-[3px] w-14 rounded-full bg-[#c79a57]" />
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Navegacion principal del sistema con una vista clara del estado
                actual.
              </p>
            </div>
          </div>

          <div className="px-6">
            <div className="overflow-hidden rounded-[30px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0.54)_100%)] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Sesion actual
                  </p>
                  <p className="mt-2 text-lg font-black text-slate-950">
                    {nombreUsuario}
                  </p>
                </div>

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Activo
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                {sessionItems.map((item) => (
                  <SessionDetail key={item.label} {...item} />
                ))}
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-4 py-6">
            {navItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={item.href === "/dashboard"}
              />
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="xl:hidden">
            <div className="rounded-[30px] border border-[#e6dece] bg-[linear-gradient(180deg,#ffffff_0%,#fbf7f1_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <DashboardLogoBadge compact />

              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8f5b24]">
                Conectamos
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                Dashboard
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{saludo}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {sessionItems.map((item) => (
                  <SessionDetail key={item.label} {...item} />
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition",
                    item.href === "/dashboard"
                      ? "border-[#c79a57] bg-[#17191d] text-white"
                      : "border-[#ded6c7] bg-white/80 text-slate-700 hover:bg-white",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <section className="relative overflow-hidden rounded-[36px] border border-[#2a2d33] bg-[linear-gradient(135deg,#0d0f13_0%,#171a21_55%,#202631_100%)] px-6 py-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] sm:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,154,87,0.28),transparent_24%),radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.08),transparent_20%)]" />
            <div className="pointer-events-none absolute right-8 top-1/2 hidden h-44 w-44 -translate-y-1/2 lg:block">
              <div className="absolute inset-0 rounded-full border border-[#d8b47a]/15" />
              <div className="absolute inset-[18px] rounded-full border-[4px] border-[#d8b47a]/18" />
              <div className="absolute inset-0 flex items-center justify-center text-[8rem] font-black tracking-tight text-[#d8b47a]/10">
                C
              </div>
              <div className="absolute right-6 top-10 flex flex-col gap-2 opacity-60">
                <span className="h-2 w-12 rounded-full bg-[#d8b47a]/30" />
                <span className="h-2 w-9 rounded-full bg-[#d8b47a]/22" />
                <span className="h-2 w-6 rounded-full bg-[#d8b47a]/16" />
              </div>
            </div>

            <div className="relative flex justify-end">
              <LogoutButton className="min-w-[150px]" />
            </div>

            <div className="relative max-w-3xl">
              <div className="inline-flex rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#f1d19c]">
                Panel de control
              </div>

              <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                CONECTAMOS
              </h2>

              <div className="mt-4 h-[3px] w-16 rounded-full bg-[#c79a57]" />

              <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                {saludo}
              </p>
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              {esAdmin ? (
                <section className="overflow-hidden rounded-[32px] border border-[#e7ddcd] bg-[linear-gradient(135deg,#fffdf8_0%,#f8f2e8_42%,#f3f6fb_100%)] shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
                  <div className="px-6 py-6 sm:px-8">
                    <div className="inline-flex rounded-full border border-[#dfcfb3] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f5b24]">
                      Resumen mensual
                    </div>

                    <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                      Utilidad del mes
                    </h3>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Acumulado de {mesActual.label} para todas las sedes. Este
                      valor se reinicia automaticamente al comenzar un nuevo mes.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <div className="rounded-2xl border border-[#dfcfb3] bg-white/90 px-5 py-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          UTILIDAD DEL MES
                        </p>
                        <p className="mt-2 text-3xl font-black text-emerald-600">
                          {formatoPesos(Number(resumenComercialMensual.utilidad || 0))}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[#e6dece] bg-white/75 px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          VENTAS DEL MES
                        </p>
                        <p className="mt-2 text-2xl font-black text-slate-950">
                          {resumenComercialMensual.ventas || 0}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[#e6dece] bg-white/75 px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          CAJA DEL MES
                        </p>
                        <p className="mt-2 text-2xl font-black text-slate-950">
                          {formatoPesos(Number(resumenComercialMensual.caja || 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <DashboardUtilityGate coverageLabel={sedeLabel} />
              )}

              <section className="mt-8 grid gap-6 xl:grid-cols-2">
                {modules.map((module) => (
                  <ModulePanel key={module.title} {...module} />
                ))}
              </section>
            </div>

            <CommercialRankingSidebar
              periodLabel={mesActual.label}
              coverageLabel={esAdmin ? "Todas las sedes" : sedeLabel}
              topJaladores={resumenComercialMensual.topJaladores}
              topCerradores={resumenComercialMensual.topCerradores}
              topFinancieras={resumenComercialMensual.topFinancieras}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

