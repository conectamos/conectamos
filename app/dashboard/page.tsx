import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import {
  esPerfilSupervisor,
  esPerfilVendedor,
  esRolAdmin,
} from "@/lib/access-control";
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
        "flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm font-medium transition",
        active
          ? "bg-[#17191d] text-white shadow-[0_14px_32px_rgba(15,23,42,0.14)]"
          : "text-slate-600 hover:bg-white hover:text-slate-950",
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

function SessionMiniStat({
  label,
  value,
  detail,
  dot,
}: SessionItem) {
  return (
    <div className="rounded-2xl border border-[#e9e1d4] bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {label}
          </p>
          <p className="mt-1.5 text-base font-black leading-tight text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>

        <span className={["mt-1 h-2.5 w-2.5 rounded-full", dot].join(" ")} />
      </div>
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
    <div className="rounded-[26px] border border-[#e9e1d4] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
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
    <div className="rounded-[26px] border border-[#ebe2d4] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f2_100%)] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
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

function CommercialRankingSection({
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
    <section className="rounded-[32px] border border-[#e7ddcd] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f2_100%)] p-6 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#e7dccb] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Corte comercial
          </div>

          <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
            Ranking del periodo
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Vista compacta del comportamiento comercial del mes para que no tengas
            una columna larga ocupando media pantalla.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-[#e7dccb] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Periodo: {periodLabel}
          </div>
          <div className="rounded-full border border-[#e7dccb] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Cobertura: {coverageLabel}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
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
    </section>
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
    <section className="group relative overflow-hidden rounded-[28px] border border-[#e8e0d1] bg-[linear-gradient(180deg,#ffffff_0%,#fbf9f4_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,154,87,0.10),transparent_32%)]" />

      <div className="relative flex items-center justify-between gap-4">
        <div>
          <div
            className={[
              "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]",
              badge,
            ].join(" ")}
          >
            {eyebrow}
          </div>

          <h2 className="mt-4 text-[28px] font-black tracking-tight text-slate-950">
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

  const esAdmin = esRolAdmin(session.rolNombre);
  const esVendedor = esPerfilVendedor(session.perfilTipo);
  const esSupervisor =
    esPerfilSupervisor(session.perfilTipo) ||
    String(session.rolNombre || "").toUpperCase() === "SUPERVISOR";
  const puedeVerEquality = !esVendedor && (esAdmin || esSupervisor);
  const nombreUsuario = session.nombre ?? "Usuario";
  const rolUsuario = session.perfilTipoLabel ?? session.rolNombre ?? "USUARIO";
  const sedeLabel = esAdmin
    ? "TODAS LAS SEDES"
    : session.sedeNombre ?? "SIN SEDE";
  const saludo = esVendedor
    ? `Bienvenido, ${nombreUsuario}. Solo tienes acceso al modulo exclusivo de registros tipo venta.`
    : esAdmin
      ? `Bienvenido, ${nombreUsuario}. Vista general del sistema.`
      : `Bienvenido, ${nombreUsuario}. Vista operativa de ${sedeLabel}.`;
  const mesActual = getCurrentBogotaMonthRange();

  const resumenComercialMensual = esVendedor
    ? null
    : await getMonthlyCommercialSummary({
        sedeId: esAdmin ? null : session.sedeId ?? null,
      });
  const financieraDestacada =
    resumenComercialMensual?.topFinancieras[0] ?? null;

  const navItems: NavItem[] = [
    ...(esVendedor
      ? ([
          { href: "/dashboard", label: "Panel vendedor" },
          { href: "/vendedor/registros", label: "Registros tipo venta" },
        ] as NavItem[])
      : ([
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
          ...(puedeVerEquality
            ? ([{ href: "/dashboard/equality", label: "Equality Zero Touch" }] as NavItem[])
            : []),
          ...(esAdmin
            ? ([
                { href: "/dashboard/payjoy", label: "PayJoy cartera" },
                { href: "/dashboard/payjoy/40-60", label: "PayJoy 40/60" },
              ] as NavItem[])
            : []),
          { href: "/ventas", label: "Ventas" },
          ...(esAdmin
            ? ([{ href: "/ventas/perfiles", label: "Perfiles vendedores" }] as NavItem[])
            : []),
          { href: "/caja", label: "Caja" },
          { href: "/prestamos", label: "Prestamos" },
          { href: "/dashboard/financiero", label: "Panel financiero" },
          { href: "/dashboard/deuda-sedes", label: "Deuda entre sedes" },
          { href: "/alertas/prestamos", label: "Alertas" },
          { href: "/inventario/historial", label: "IMEI historico" },
        ] as NavItem[])),
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
      detail: esAdmin
        ? "Permisos globales"
        : session.perfilNombre
          ? "Permisos del perfil activo"
          : "Permisos operativos",
      dot: "bg-red-500",
    },
    {
      label: "Cobertura",
      value: sedeLabel,
      detail: esAdmin ? "Vision consolidada" : "Trabajo por sede",
      dot: "bg-amber-500",
    },
    ...(session.perfilNombre
      ? ([
          {
            label: "Perfil",
            value: session.perfilNombre,
            detail: session.perfilTipoLabel ?? "Perfil activo",
            dot: "bg-violet-500",
          },
        ] as SessionItem[])
      : []),
    {
      label: "Estado",
      value: "Activo",
      detail: "Sistema disponible",
      dot: "bg-emerald-500",
    },
  ];

  const modules: ModuleCard[] = [
    ...(esVendedor
      ? ([
          {
            accent: "bg-emerald-500",
            badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
            eyebrow: "Vendedor / Registros",
            title: "Registros tipo venta",
            description:
              "Modulo exclusivo del vendedor para cargar sus registros sin acceso a inventario, caja, prestamos ni reportes existentes.",
            actions: [
              {
                href: "/vendedor/registros",
                label: "Abrir modulo vendedor",
                tone: "primary",
              },
            ],
          },
        ] as ModuleCard[])
      : ([
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
            accent: "bg-indigo-500",
            badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
            eyebrow: "Ventas / Gestion",
            title: "Ventas",
            description:
              "Consulta ventas registradas y agrega nuevas operaciones desde una vista mas directa.",
            actions: [
              { href: "/ventas", label: "Ver ventas", tone: "primary" },
              { href: "/ventas/nuevo", label: "Nueva venta" },
              ...(esAdmin
                ? ([{ href: "/ventas/perfiles", label: "Perfiles vendedores" }] as ModuleAction[])
                : []),
              ...(esAdmin
                ? ([{ href: "/ventas/equipo-comercial", label: "Catalogos de ventas" }] as ModuleAction[])
                : []),
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
          {
            accent: "bg-amber-500",
            badge: "border-amber-200 bg-amber-50 text-amber-700",
            eyebrow: "Nuovo / Gestion",
            title: "Nuovo Pay",
            description:
              esAdmin
                ? "Administra Nuovo desde un mismo panel y entra por botones separados a Dispositivos o Cartera segun la operacion que necesites."
                : "Consulta Nuovo / Dispositivos desde este panel. Nuovo / Cartera queda reservado solo para el admin.",
            actions: [
              {
                href: "/dashboard/nuovopay",
                label: "Nuovo / Dispositivos",
                tone: "primary",
              },
              ...(esAdmin
                ? ([
                    {
                      href: "/dashboard/nuovopay/cartera",
                      label: "Nuovo / Cartera",
                    },
                  ] as ModuleAction[])
                : []),
            ],
          },
          ...(puedeVerEquality
            ? ([
                {
                  accent: "bg-violet-500",
                  badge: "border-violet-200 bg-violet-50 text-violet-700",
                  eyebrow: "Equality / Zero Touch",
                  title: "Equality Zero Touch",
                  description:
                    esAdmin
                      ? "Modulo independiente de Nuovo para consultar, inscribir, validar estado, bloquear, desbloquear y liberar dispositivos desde HBM Equality."
                      : "Modulo independiente de Nuovo para consultar, inscribir, validar estado, bloquear y desbloquear dispositivos desde HBM Equality.",
                  actions: [
                    {
                      href: "/dashboard/equality",
                      label: "Equality / Zero Touch",
                      tone: "primary",
                    },
                  ],
                },
              ] as ModuleCard[])
            : []),
          ...(esAdmin
            ? ([
                {
                  accent: "bg-emerald-500",
                  badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
                  eyebrow: "PayJoy / Gestion",
                  title: "PayJoy",
                  description:
                    "Consolida cargas de transacciones, agrega la columna CORTE y revisa cartera PayJoy desde un panel reservado para administracion.",
                  actions: [
                    {
                      href: "/dashboard/payjoy",
                      label: "Cartera PayJoy",
                      tone: "primary",
                    },
                    {
                      href: "/dashboard/payjoy/40-60",
                      label: "40/60",
                    },
                  ],
                },
              ] as ModuleCard[])
            : []),
        ] as ModuleCard[])),
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#f2f5f9_100%)] text-slate-950">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-[280px] shrink-0 border-r border-[#e4dccd] bg-[linear-gradient(180deg,#f7f3ea_0%,#efe9dc_100%)] xl:flex xl:flex-col">
          <div className="sticky top-0 flex h-screen flex-col gap-5 px-5 py-6">
            <div className="rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.68)_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <DashboardLogoBadge />

              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#8f5b24]">
                Conectamos
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                Dashboard
              </h1>
              <div className="mt-3 h-[3px] w-12 rounded-full bg-[#c79a57]" />
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Navegacion limpia y acceso rapido a los modulos principales.
              </p>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
              {navItems.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={item.href === "/dashboard"}
                />
              ))}
            </nav>

            <div className="rounded-[28px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.84)_0%,rgba(255,255,255,0.60)_100%)] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Sesion actual
                  </p>
                  <p className="mt-1 text-base font-black text-slate-950">
                    {nombreUsuario}
                  </p>
                </div>

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Activo
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {sessionItems.map((item) => (
                  <SessionMiniStat key={item.label} {...item} />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="xl:hidden">
            <div className="rounded-[30px] border border-[#e6dece] bg-[linear-gradient(180deg,#ffffff_0%,#fbf7f1_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <DashboardLogoBadge compact />

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-[#8f5b24]">
                Conectamos
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Dashboard
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{saludo}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {sessionItems.map((item) => (
                  <SessionMiniStat key={item.label} {...item} />
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

          <section className="relative overflow-hidden rounded-[34px] border border-[#e4dccd] bg-[linear-gradient(135deg,#fffdf8_0%,#f8f1e5_48%,#f3f6fb_100%)] px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,154,87,0.14),transparent_22%),radial-gradient(circle_at_left_center,rgba(59,130,246,0.08),transparent_20%)]" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-4xl">
                <div className="inline-flex rounded-full border border-[#dfcfb3] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f5b24]">
                  Panel de control
                </div>

                <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                  Dashboard
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                  {saludo}
                </p>

                <div className="mt-5 flex flex-wrap gap-2.5">
                  <div className="rounded-full border border-[#e7dccb] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Usuario: {nombreUsuario}
                  </div>
                  <div className="rounded-full border border-[#e7dccb] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Rol: {rolUsuario}
                  </div>
                  <div className="rounded-full border border-[#e7dccb] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Cobertura: {sedeLabel}
                  </div>
                </div>
              </div>

              <div className="relative flex shrink-0 items-start justify-start xl:justify-end">
                <LogoutButton className="min-w-[170px] border-[#111318] bg-[#111318] text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] hover:border-[#1b1f27] hover:bg-[#1b1f27]" />
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
                label="Caja del mes"
                value={formatoPesos(Number(resumenComercialMensual.caja || 0))}
                detail="Movimiento consolidado del periodo."
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
          ) : esVendedor ? (
            <section className="mt-6 rounded-[30px] border border-[#e4dccd] bg-[linear-gradient(180deg,#ffffff_0%,#fbf7f0_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Acceso aislado
              </div>
              <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Perfil vendedor con modulo exclusivo
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                Este perfil no ve inventario, caja, prestamos, reportes ni los
                demas modulos que ya existen. Su trabajo queda concentrado solo en
                la tarjeta de registros tipo venta.
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <DashboardUtilityGate coverageLabel={sedeLabel} />
            </div>
          )}

          <section className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {modules.map((module) => (
              <ModulePanel key={module.title} {...module} />
            ))}
          </section>

          {!esVendedor && resumenComercialMensual && (
            <div className="mt-6">
              <CommercialRankingSection
                periodLabel={mesActual.label}
                coverageLabel={esAdmin ? "Todas las sedes" : sedeLabel}
                topJaladores={resumenComercialMensual.topJaladores}
                topCerradores={resumenComercialMensual.topCerradores}
                topFinancieras={resumenComercialMensual.topFinancieras}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

