import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { VendorEarningsSummary } from "@/lib/vendor-earnings";
import type { SalesRoleActivitySummary } from "@/lib/dashboard-sales-role-summary";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";
import styles from "./sales-role-dashboard.module.css";

type SalesRole = "VENDEDOR" | "APOYO_OPERATIVO";
type QuickAction = { description: string; href: string; icon: DashboardIconName; label: string; primary?: boolean };
type NavigationItem = { href: string; icon: DashboardIconName; label: string };
function formatoPesos(valor: number) { return `$ ${Number(valor || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`; }
function formatoNumero(valor: number) { return valor.toLocaleString("es-CO"); }

function RoleMetric({ icon, label, value, positive = false, textual = false }: { icon: DashboardIconName; label: string; value: string; positive?: boolean; textual?: boolean }) {
  return <article className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name={icon} /></span><div style={{ "--value-length": value.length } as CSSProperties}><p>{label}</p><strong className={`${positive ? styles.positive : ""} ${textual ? styles.metricText : ""}`}>{value}</strong></div></article>;
}
function QuickActions({ actions }: { actions: QuickAction[] }) {
  return <section className={styles.quickPanel} aria-labelledby="sales-role-actions"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="arrow" /></span><div><h2 id="sales-role-actions">Accesos rápidos</h2><p>Tus herramientas de trabajo</p></div></div><nav className={styles.quickActions} aria-label="Accesos comerciales">{actions.map(action => <Link key={action.href} href={action.href} className={`${styles.quickAction} ${action.primary ? styles.primaryAction : ""}`}><span className={styles.actionIcon}><DashboardIcon name={action.icon} /></span><span><strong>{action.label}</strong><small>{action.description}</small></span><DashboardIcon name="arrow" /></Link>)}</nav></section>;
}
function EarningsPanel({ earnings }: { earnings: VendorEarningsSummary }) {
  return <section className={styles.earningsPanel} aria-labelledby="sales-role-earnings">
    <div className={styles.earningsHeading}><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="wallet" /></span><div><p className={styles.eyebrow}>Tu rendimiento comercial</p><h2 id="sales-role-earnings">Bolsa de ganancias</h2></div></div><span className={`${styles.status} ${earnings.bolsaHabilitada ? styles.statusPositive : ""}`}><span />{earnings.bolsaHabilitada ? "Bolsa habilitada" : "Fuera del Top 5"}</span></div>
    <div className={styles.earningsOverview}><div className={styles.earningsValue}><p>Total acumulado</p><strong className={earnings.totalGanado > 0 ? styles.earned : undefined}>{formatoPesos(earnings.totalGanado)}</strong><span>{earnings.periodoLabel}</span></div><div className={styles.rank}><span className={styles.rankIcon}><DashboardIcon name="trophy" /></span><div><span>Puesto actual</span><strong>{earnings.puestoActual ? `#${earnings.puestoActual}` : "Sin puesto"}</strong></div></div></div>
    <dl className={styles.earningsDetails}><div><dt>Ventas del mes</dt><dd>{formatoNumero(earnings.ventasMes)}</dd></div><div><dt>Bono por venta</dt><dd>{formatoPesos(earnings.valorBonoPorVenta)}</dd></div><div><dt>Ventas con recompensa</dt><dd>{formatoNumero(earnings.totalVentasConComision)}</dd></div></dl>
    <div className={styles.earningsFooter}><DashboardIcon name={earnings.bolsaHabilitada ? "shield" : "trend"} /><p>{earnings.bolsaHabilitada ? "Mantén tu posición para continuar acumulando recompensas." : "Sigue registrando ventas para subir de posición e ingresar al Top 5."}</p></div>
  </section>;
}
function SupportWorkflow({ activity }: { activity: SalesRoleActivitySummary }) {
  const steps: Array<QuickAction & { value: string }> = [
    { description: "Completa el trámite comercial.", href: "/vendedor/registros", icon: "sales", label: "Registrar ventas", value: `${formatoNumero(activity.registrosPeriodo)} en el periodo` },
    { description: "Disponibilidad por referencia y sede.", href: "/dashboard/radar", icon: "radar", label: "Radar de inventario", value: "Consulta de disponibilidad" },
    { description: "Valida al cliente antes del registro.", href: "/vendedor/lista-negra", icon: "warning", label: "Lista negra", value: "Validación comercial" },
  ];
  return <section className={styles.workflowPanel} aria-labelledby="sales-role-workflow"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><div><h2 id="sales-role-workflow">Flujo operativo</h2><p>Registro y disponibilidad</p></div></div><div className={styles.workflowRows}>{steps.map(step => <div key={step.href} className={styles.workflowRow}><span className={styles.actionIcon}><DashboardIcon name={step.icon} /></span><div><h3>{step.label}</h3><p>{step.description}</p><span>{step.value}</span></div><Link href={step.href} className={styles.button} aria-label={`Abrir ${step.label}`}>Abrir<DashboardIcon name="arrow" /></Link></div>)}</div></section>;
}
export default function SalesRoleDashboard({ activity, coverageLabel, earnings, perfilNombre, role, roleLabel, usuario, puedeVerExtensionesPayJoy = false }: {
  activity: SalesRoleActivitySummary; coverageLabel: string; earnings: VendorEarningsSummary;
  perfilNombre?: string | null; role: SalesRole; roleLabel: string; usuario: string;
  puedeVerExtensionesPayJoy?: boolean;
}) {
  const esApoyo = role === "APOYO_OPERATIVO";
  // Preserve the former sidebar destinations, including its implicit CIERRE entry.
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
    { href: "/vendedor/registros", icon: "sales", label: esApoyo ? "Registrar ventas" : "Registrar venta" },
    ...(esApoyo ? [{ href: "/dashboard/radar", icon: "radar", label: "Radar" } satisfies NavigationItem] : []),
    { href: "/vendedor/lista-negra", icon: "warning", label: "Lista negra" },
    { href: "/vendedor/lista-precios", icon: "tag", label: "Lista de precios" },
    ...(puedeVerExtensionesPayJoy ? [{ href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" } satisfies NavigationItem] : []),
  ];
  const quickActions: QuickAction[] = [
    { description: esApoyo ? "Iniciar un registro comercial" : "Registrar una venta nueva", href: "/vendedor/registros", icon: "document-add", label: esApoyo ? "Registrar venta" : "Nueva venta", primary: true },
    ...(esApoyo ? [{ description: "Consultar disponibilidad", href: "/dashboard/radar", icon: "radar", label: "Abrir radar" } satisfies QuickAction] : []),
    { description: "Validar información del cliente", href: "/vendedor/lista-negra", icon: "warning", label: "Consultar lista negra" },
    { description: "Consultar referencias y precios", href: "/vendedor/lista-precios", icon: "tag", label: "Lista de precios" },
    ...(puedeVerExtensionesPayJoy ? [{ description: "Consultar opciones y gestionar el dispositivo", href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" } satisfies QuickAction] : []),
  ];
  return <div className={styles.page}>
    <header className={styles.topbar}><Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link><nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map(item => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/dashboard" ? styles.navActive : ""}`} aria-current={item.href === "/dashboard" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</nav><SalesProfile name={usuario} role={`${roleLabel} · ${coverageLabel}`} /></header>
    <main className={styles.main}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>Mi espacio comercial</p><h1>{esApoyo ? "Panel operativo" : "Panel de ventas"}</h1><p>{esApoyo ? "Registro comercial y consulta de disponibilidad" : "Tu rendimiento y accesos comerciales"}</p></div><div className={styles.context}><span><DashboardIcon name="calendar" />{earnings.periodoLabel}</span><span><DashboardIcon name="store" />{coverageLabel}</span>{perfilNombre && <span className={styles.profileName}><DashboardIcon name="user" />Perfil: {perfilNombre}</span>}</div></div>
      <section className={styles.metrics} aria-label="Indicadores del perfil">{esApoyo ? <>
        <RoleMetric label="Registros del periodo" value={formatoNumero(activity.registrosPeriodo)} icon="document" />
        <RoleMetric label="Por completar" value={formatoNumero(activity.pendientes)} icon="clock" />
        <RoleMetric label="Convertidos en venta" value={formatoNumero(activity.convertidos)} icon="sales" positive={activity.convertidos > 0} />
        <RoleMetric label="Cobertura" value={coverageLabel} icon="store" textual />
      </> : <>
        <RoleMetric label="Ventas del mes" value={formatoNumero(earnings.ventasMes)} icon="sales" />
        <RoleMetric label="Puesto actual" value={earnings.puestoActual ? `#${earnings.puestoActual}` : "Sin puesto"} icon="trophy" />
        <RoleMetric label="Ganancia acumulada" value={formatoPesos(earnings.totalGanado)} icon="wallet" positive={earnings.totalGanado > 0} />
        <RoleMetric label="Ventas con recompensa" value={formatoNumero(earnings.totalVentasConComision)} icon="star" />
      </>}</section>
      <div className={styles.workspace}>{esApoyo ? <SupportWorkflow activity={activity} /> : <EarningsPanel earnings={earnings} />}<QuickActions actions={quickActions} /></div>
      {esApoyo && <div className={styles.supportEarnings}><EarningsPanel earnings={earnings} /></div>}
    </main>
  </div>;
}
