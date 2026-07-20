import { redirect } from "next/navigation";
import {
  esPerfilApoyoOperativo,
  esPerfilSupervisor,
  esRolAdministrativo,
} from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { getAdminInventorySummary } from "@/lib/dashboard-inventory-summary";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import DashboardRadarWorkspace from "./workspace";

export default async function DashboardRadarPage() {
  const session = await requireSessionPage();
  const esAdmin = esRolAdministrativo(session.rolNombre);
  const esSupervisor =
    esPerfilSupervisor(session.perfilTipo) ||
    String(session.rolNombre || "").toUpperCase() === "SUPERVISOR";
  const esApoyoOperativo = esPerfilApoyoOperativo(session.perfilTipo);

  if (!esAdmin && !esSupervisor && !esApoyoOperativo) {
    redirect("/dashboard");
  }

  const summary = await getAdminInventorySummary({
    ocultarPuntosRetiradosSupervisor: !esAdmin && esSupervisor,
  });
  const navigationItems: NavigationItem[] = esApoyoOperativo
    ? [
        { href: "/dashboard", icon: "home", label: "Inicio" },
        {
          href: "/vendedor/registros",
          icon: "sales",
          label: "Registrar ventas",
        },
        { href: "/dashboard/radar", icon: "reports", label: "Radar" },
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
      ]
    : [
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
  const usuario = session.perfilNombre || session.nombre || session.usuario || "Usuario";
  const rolUsuario =
    session.perfilTipoLabel ||
    (esAdmin ? "Administrador" : esSupervisor ? "Supervisor de tienda" : "Apoyo operativo");
  const inicialesUsuario = usuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref={esApoyoOperativo ? "/dashboard/radar" : "/inventario"}
        coverageLabel="Todas las sedes"
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <span>Inventario</span>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-[#e30613]">Radar</span>
              </div>
              <h1 className="mt-2 text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Radar de inventario
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 sm:text-base">
                Consulta la disponibilidad real por referencia, bodega principal y sede
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <DashboardIcon name="store" className="h-4 w-4 text-slate-500" />
                  Cobertura: Todas las sedes
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Solo equipos disponibles
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[205px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{usuario}</p>
                  <p className="truncate text-xs text-slate-500">{rolUsuario}</p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

          <div className="mt-6">
            <DashboardRadarWorkspace
              summary={summary}
              puedeVerBodegaPrincipal={esAdmin}
              puedeVerInventario={esAdmin || esSupervisor}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
