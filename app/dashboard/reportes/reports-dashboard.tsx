"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { DashboardSidebar, type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import { formatoFechaHora, formatoNumero, formatoPesos, type MonthlyReportsView } from "@/lib/monthly-reports-view";
import ReportsRankingPanel from "./reports-ranking-panel";
import styles from "./reports.module.css";

const navigationItems: NavigationItem[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" },
  { href: "/ventas", icon: "sales", label: "Ventas" },
  { href: "/inventario", icon: "inventory", label: "Inventario" },
  { href: "/prestamos", icon: "loans", label: "Préstamos" },
  { href: "/caja", icon: "cash", label: "Caja" },
  { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
  { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
  { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
];

function Money({ value, className = "" }: { value: number; className?: string }) {
  const formatted = formatoPesos(value);
  const width = [...formatted].reduce((total, character) => total + (/\d|\$/.test(character) ? .58 : .3), .1) * 1.12;
  return <span style={{ "--money-width": width } as CSSProperties} className={`${className} ${styles.money} ${value < 0 ? styles.negative : ""} ${formatted.length >= 17 ? styles.longMoney : ""}`}>{formatted}</span>;
}

function Metric({ icon, label, children }: { icon: DashboardIconName; label: string; children: ReactNode }) {
  return <div className={styles.metric}>
    <DashboardIcon name={icon} className={styles.metricIcon} />
    <div className={styles.metricContent}><h2>{label}</h2>{children}</div>
  </div>;
}

function BalanceRows({ title, icon, rows }: { title: string; icon: DashboardIconName; rows: { label: string; value: number }[] }) {
  return <section className={styles.balancePanel}>
    <h2><DashboardIcon name={icon} className={styles.panelIcon} />{title}</h2>
    <dl className={styles.balanceRows}>
      {rows.map((row) => <div className={styles.balanceRow} key={row.label}><dt>{row.label}</dt><dd><Money value={row.value} /></dd></div>)}
    </dl>
  </section>;
}

export default function ReportsDashboard({ view }: { view: MonthlyReportsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const userMenu = useRef<HTMLDetailsElement>(null);
  const { usuario, consulta, sedes, mensual, financiero, totales, cierre, rankings } = view;
  const cutoffLabel = cierre.fechaCorte ? new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(new Date(cierre.fechaCorte).getTime() - 1)) : null;

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (event.target instanceof Node && !userMenu.current?.contains(event.target)) userMenu.current?.removeAttribute("open");
    }
    function escapeMenu(event: KeyboardEvent) {
      if (event.key === "Escape" && userMenu.current?.open) {
        userMenu.current.removeAttribute("open");
        userMenu.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", escapeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", escapeMenu);
    };
  }, []);

  function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const params = new URLSearchParams({ period: String(fields.get("period") || consulta.period) });
    const sedeId = String(fields.get("sedeId") || "");
    if (sedeId) params.set("sedeId", sedeId);
    startTransition(() => router.push(`/dashboard/reportes?${params.toString()}`));
  }

  return <div className={styles.page}>
    <DashboardSidebar activeHref="/dashboard/reportes" items={navigationItems} coverageLabel={consulta.cobertura} />
    <div className={styles.workspace}>
      <header className={styles.utilityBar}>
        <details className={styles.userMenu} ref={userMenu}>
          <summary aria-label={`Usuario: ${usuario.nombre}. Rol: ${usuario.rolNombre}`}>
            <span className={styles.avatar}><DashboardIcon name="user" className={styles.avatarIcon} /></span>
            <span className={styles.userIdentity}><strong>{usuario.nombre}</strong><span>{usuario.rolNombre}</span></span>
            <DashboardIcon name="chevron" className={styles.userChevron} />
          </summary>
          <div className={styles.userDropdown}><LogoutButton variant="light" className={styles.logoutButton} /></div>
        </details>
      </header>

      <main className={styles.main} aria-busy={pending}>
        <header className={styles.pageHeader}>
          <div className={styles.heading}><h1>Reportes</h1><p>Resumen mensual de tu operación</p></div>
          <form className={styles.filters} onSubmit={consultar}>
            <label className={styles.filterField}><span>Mes comercial</span><div className={styles.fieldControl}>
              <DashboardIcon name="calendar" className={styles.fieldIcon} />
              <input type="month" name="period" aria-label="Mes comercial" defaultValue={consulta.period} disabled={pending} required />
            </div></label>
            <label className={styles.filterField}><span>Cobertura</span><div className={styles.fieldControl}>
              <DashboardIcon name="pin" className={styles.fieldIcon} />
              <select name="sedeId" aria-label="Cobertura" defaultValue={consulta.sedeId} disabled={pending}>
                <option value="">Todas las sedes</option>
                {sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}
              </select>
              <DashboardIcon name="chevron" className={styles.selectChevron} />
            </div></label>
            <button className={styles.consultButton} type="submit" disabled={pending}>{pending ? "Consultando…" : "Consultar"}</button>
            <Link className={styles.backButton} href="/dashboard">Volver</Link>
          </form>
        </header>
        <span className={styles.srOnly} role="status">{pending ? "Consultando reportes…" : `Consulta aplicada: ${consulta.periodLabel}. ${consulta.cobertura}.`}</span>

        <section className={styles.summary} aria-label="Resumen del mes">
          <Metric icon="trend" label="Utilidad del mes"><p className={`${styles.metricValue} ${mensual.utilidad >= 0 ? styles.positive : ""}`}><Money value={mensual.utilidad} /></p></Metric>
          <Metric icon="sales" label="Ventas del mes"><p className={styles.metricValue}>{formatoNumero(mensual.ventas)}</p></Metric>
          <Metric icon="wallet" label="Caja acumulada"><p className={styles.metricValue}><Money value={financiero.cajaDisponible} /></p></Metric>
          <Metric icon="users" label="Financiera líder">
            {mensual.financieraLider ? <><p className={`${styles.leaderName} ${mensual.financieraLider.nombre.length > 24 ? styles.longLeader : ""}`}>{mensual.financieraLider.nombre}</p><p className={styles.leaderDetail}>{formatoNumero(mensual.financieraLider.total)} usos · <Money value={mensual.financieraLider.monto} /></p></> : <p className={styles.noLeader}>Sin movimientos</p>}
          </Metric>
        </section>

        <section className={styles.balance} aria-labelledby="balance-title">
          <div className={styles.balanceHeading}>
            <h2 id="balance-title">Balance financiero</h2>
            <p>{cutoffLabel ? `Acumulado al ${cutoffLabel}.` : "Acumulado al corte consultado."}</p>
            {cierre.source === "snapshot" && <span className={styles.snapshot}>Cierre financiero congelado{cierre.capturedAt ? ` desde ${formatoFechaHora(cierre.capturedAt)}` : ""}.</span>}
          </div>
          <div className={styles.netResult}>
            <DashboardIcon name="coins" className={styles.balanceIcon} />
            <div><h3>Resultado neto</h3><p><Money value={totales.resultadoNeto} /></p></div>
          </div>
          <div className={styles.balanceTotal}>
            <DashboardIcon name="pie" className={styles.balanceIcon} />
            <div><h3>Activos</h3><p><Money value={totales.activos} /></p></div>
          </div>
          <div className={styles.balanceTotal}>
            <DashboardIcon name="pie" className={styles.balanceIcon} />
            <div><h3>Pasivos</h3><p><Money value={totales.pasivos} /></p></div>
          </div>
        </section>

        <div className={styles.detailPanels}>
          <BalanceRows title="Activos y disponibilidad" icon="wallet" rows={[
            { label: "Caja disponible", value: financiero.cajaDisponible },
            { label: "Transferencias", value: financiero.saldoTransferencias },
            { label: "Financieras por cobrar", value: totales.totalFinancieras },
            { label: "Préstamos por cobrar", value: financiero.prestamosPorCobrar },
            { label: "Equipos en bodega", value: financiero.valorBodega },
          ]} />
          <BalanceRows title="Pasivos y compromisos" icon="document" rows={[
            { label: "Deuda de equipos", value: financiero.deudaEquipos },
            { label: "Equipos pendientes", value: financiero.valorPendiente },
            { label: "Garantías", value: financiero.valorGarantia },
            { label: "Gasto de cartera", value: financiero.totalGastosCartera },
          ]} />
        </div>

        <ReportsRankingPanel key={`${consulta.period}:${consulta.sedeId}`} periodLabel={consulta.periodLabel} cobertura={consulta.cobertura} rankings={rankings} />
      </main>
    </div>
  </div>;
}
