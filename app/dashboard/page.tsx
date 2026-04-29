import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import {
  esPerfilFacturador,
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

type ModuleTone = "slate" | "emerald" | "sky" | "amber" | "violet" | "rose";
type ActionTone = "primary" | "secondary" | "danger";

type ModuleAction = {
  href: string;
  label: string;
  tone?: ActionTone;
};

type ModuleKey =
  | "inventario"
  | "ventas"
  | "caja"
  | "prestamos"
  | "registrarVenta"
  | "registrarFacturacion"
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

type SessionBadge = {
  label: string;
  value: string;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
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
    <div className="rounded-[26px] border border-[#ebe4d7] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black tracking-tight text-slate-950">
          {title}
        </p>
        <span className={["h-2.5 w-2.5 rounded-full", accent].join(" ")} />
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e6ddcf] bg-[#fcfaf6] px-4 py-4 text-sm text-slate-500">
            Sin movimientos registrados en este periodo.
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={`${title}-${item.nombre}`}
              className="flex items-start justify-between gap-4 rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3"
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
    <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Corte comercial
          </div>
          <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
            Ranking del periodo
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Resumen compacto del comportamiento comercial del mes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Periodo: {periodLabel}
          </div>
          <div className="rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
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

function resolveSaludo({
  esAdmin,
  esSupervisor,
  esVendedor,
  esFacturador,
  nombreUsuario,
  sedeLabel,
}: {
  esAdmin: boolean;
  esSupervisor: boolean;
  esVendedor: boolean;
  esFacturador: boolean;
  nombreUsuario: string;
  sedeLabel: string;
}) {
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

export default async function DashboardPage() {
  const session = await getSessionUser();

  if (!session) {
    return <div className="p-10">No autenticado</div>;
  }

  const esAdmin = esRolAdmin(session.rolNombre);
  const esFacturador = esPerfilFacturador(session.perfilTipo);
  const esVendedor = esPerfilVendedor(session.perfilTipo);
  const esSupervisor =
    esPerfilSupervisor(session.perfilTipo) ||
    String(session.rolNombre || "").toUpperCase() === "SUPERVISOR";
  const puedeVerEquality = esAdmin || esSupervisor;
  const nombreUsuario = session.nombre ?? "Usuario";
  const rolUsuario = session.perfilTipoLabel ?? session.rolNombre ?? "USUARIO";
  const sedeLabel = esAdmin
    ? "TODAS LAS SEDES"
    : session.sedeNombre ?? "SIN SEDE";
  const saludo = resolveSaludo({
    esAdmin,
    esSupervisor,
    esVendedor,
    esFacturador,
    nombreUsuario,
    sedeLabel,
  });

  const mesActual = getCurrentBogotaMonthRange();
  const resumenComercialMensual =
    esVendedor || esFacturador
      ? null
      : await getMonthlyCommercialSummary({
          sedeId: esAdmin ? null : session.sedeId ?? null,
        });
  const financieraDestacada =
    resumenComercialMensual?.topFinancieras[0] ?? null;

  const sessionBadges: SessionBadge[] = [
    { label: "Usuario", value: nombreUsuario },
    { label: "Rol", value: rolUsuario },
    { label: "Cobertura", value: sedeLabel },
    ...(session.perfilNombre
      ? ([{ label: "Perfil", value: session.perfilNombre }] as SessionBadge[])
      : []),
  ];

  const moduleCatalog: Record<ModuleKey, ModuleCard> = {
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
          ? ([{ href: "/dashboard/sedes", label: "Gestion sedes", tone: "secondary" }] as ModuleAction[])
          : []),
        ...(esAdmin
          ? ([{ href: "/inventario-principal", label: "Bodega principal", tone: "secondary" }] as ModuleAction[])
          : []),
        ...(esAdmin
          ? ([{ href: "/dashboard/auditoria", label: "Auditoria", tone: "secondary" }] as ModuleAction[])
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
        ...(esAdmin
          ? ([{ href: "/ventas/perfiles", label: "Perfiles vendedores", tone: "secondary" }] as ModuleAction[])
          : []),
        ...(esAdmin
          ? ([{ href: "/ventas/equipo-comercial", label: "Catalogos de ventas", tone: "secondary" }] as ModuleAction[])
          : []),
        ...(esAdmin
          ? ([{ href: "/dashboard/lista-precios", label: "Lista de precios", tone: "secondary" }] as ModuleAction[])
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
      title: esVendedor ? "REGISTRAR VENTAS" : "REGISTRAR VENTA",
      eyebrow: "Vendedor / Registros",
      description: esVendedor
        ? "Digitaliza el tramite completo de la venta desde un unico modulo."
        : "Digitaliza la hoja de plataforma y registra el tramite completo desde este modulo.",
      actions: [
        { href: "/vendedor/registros", label: "Registrar venta", tone: "primary" },
        {
          href: esAdmin ? "/dashboard/lista-precios" : "/vendedor/lista-precios",
          label: "LISTA DE PRECIOS",
          tone: "secondary",
        },
        ...(!esVendedor
          ? ([{ href: "/vendedor/registros/buscar", label: "Buscar registro", tone: "secondary" }] as ModuleAction[])
          : []),
      ],
      tone: "emerald",
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
      ],
      tone: "emerald",
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

  const moduleOrder: ModuleKey[] = esAdmin
    ? [
        "inventario",
        "ventas",
        "caja",
        "prestamos",
        "registrarVenta",
        "registrarFacturacion",
        "payjoy",
        "nuovo",
        "equality",
      ]
    : esSupervisor
      ? [
          "inventario",
          "ventas",
          "caja",
          "prestamos",
          "registrarVenta",
          "nuovo",
          "equality",
        ]
      : esVendedor
        ? ["registrarVenta"]
        : esFacturador
          ? ["registrarFacturacion"]
          : ["inventario", "ventas", "caja"];

  const modules = moduleOrder
    .filter((key) => (key === "equality" ? puedeVerEquality : true))
    .map((key) => moduleCatalog[key]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] text-slate-950">
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
              {!esVendedor && !esFacturador && (
                <Link
                  href="/dashboard/analitico"
                  className="inline-flex min-w-[170px] items-center justify-center rounded-2xl border border-white/12 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_16px_38px_rgba(15,23,42,0.18)] transition hover:bg-slate-100"
                >
                  Panel analitico
                </Link>
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
        ) : esVendedor || esFacturador ? null : (
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
                Accesos por rol
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Vista simplificada del dashboard para entrar directo a cada modulo principal.
              </p>
            </div>
          </div>

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
        </section>

        {!esVendedor && !esFacturador && resumenComercialMensual && (
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
  );
}
