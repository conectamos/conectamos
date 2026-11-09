import Link from "next/link";
import { redirect } from "next/navigation";
import { esRolBodega } from "@/lib/access-control";
import { getBodegaNavigation } from "@/lib/bodega-navigation";
import { requireSessionPage } from "@/lib/page-access";
import { DashboardSidebar } from "@/app/dashboard/_components/operations-dashboard";
import styles from "@/app/dashboard/_components/bodega-dashboard.module.css";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import BodegaDeudaWorkspace from "./workspace";

export default async function BodegaDeudaPage() {
  const session = await requireSessionPage();
  if (!esRolBodega(session.rolNombre)) redirect("/dashboard");

  return (
    <div className={styles.page}>
      <DashboardSidebar
        appearance="white"
        activeHref="/dashboard/bodega/deuda"
        coverageLabel={session.sedeNombre}
        includeCierre={false}
        items={getBodegaNavigation()}
        panelLabel="Panel de bodega"
      />
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <nav className={styles.breadcrumb} aria-label="Ubicación">
            <Link href="/dashboard">Inicio</Link>
            <span aria-hidden="true">/</span>
            <strong>Deuda</strong>
          </nav>
          <SalesProfile name={session.perfilNombre || session.nombre || session.usuario} role="BODEGA" />
        </header>
        <main className={styles.main}>
          <BodegaDeudaWorkspace />
        </main>
      </div>
    </div>
  );
}
