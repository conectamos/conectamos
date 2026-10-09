import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  esPerfilApoyoOperativo,
  esPerfilSupervisor,
  esRolAdministrativo,
} from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { getAdminInventorySummary } from "@/lib/dashboard-inventory-summary";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./radar.module.css";
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
  const activeHref = esApoyoOperativo ? "/dashboard/radar" : "/inventario";

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, ir al inicio">
          <Image src="/branding/conectamos-logo.png" alt="" width={42} height={42} priority />
          <strong>CONECTAMOS</strong>
        </Link>
        <nav className={styles.navigation} aria-label="Navegación principal">
          {navigationItems.map((item) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === activeHref ? styles.navActive : ""}`} aria-current={item.href === activeHref ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}
        </nav>
        <SalesProfile name={usuario} role={rolUsuario} />
      </header>
      <main className={styles.main}>
        <div className={styles.heading}>
          <div><h1>Radar de inventario</h1><p>Disponibilidad por referencia y sede.</p></div>
          <div className={styles.headingActions}>
            {esAdmin && <Link href="/inventario-principal" className={styles.button}><DashboardIcon name="store" />Bodega principal</Link>}
            {(esAdmin || esSupervisor) && <Link href="/inventario" className={`${styles.button} ${styles.primary}`}><DashboardIcon name="inventory" />Ver inventario</Link>}
          </div>
        </div>
        <DashboardRadarWorkspace summary={summary} puedeVerBodegaPrincipal={esAdmin} puedeVerInventario={esAdmin || esSupervisor} />
      </main>
    </div>
  );
}
