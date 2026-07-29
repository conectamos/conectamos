import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import SumasPayBatchWorkspace from "./sumaspay-batch-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SumasPayBatchPage() {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

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
  const usuario =
    session.perfilNombre || session.nombre || session.usuario || "Administrador";
  const rolUsuario = session.perfilTipoLabel || session.rolNombre || "ADMIN";
  const inicialesUsuario = usuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel="Todas las sedes"
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <span>Plataformas financieras</span>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-[#e30613]">SUMASPAY</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight text-slate-950 sm:text-[34px]">
                Consulta SUMASPAY
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Consulta créditos vigentes por cédula y exporta los resultados
                en un archivo listo para trabajar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-h-[52px] min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm sm:min-w-[205px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {usuario}
                  </p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {rolUsuario}
                  </p>
                </div>
              </div>
              <LogoutButton
                variant="light"
                className="min-h-[52px] rounded-xl uppercase"
              />
            </div>
          </header>

          <div className="mt-6">
            <SumasPayBatchWorkspace />
          </div>
        </main>
      </div>
    </div>
  );
}
