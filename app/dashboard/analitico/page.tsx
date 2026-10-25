"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./analytics.module.css";

type Metric = { actual: number; anterior: number; diferencia: number; porcentaje: number | null };
type AnalyticSummary = {
  periodoActual: { key: string; label: string };
  periodoAnterior: { key: string; label: string };
  cobertura: string; ventas: Metric; utilidad: Metric;
};
type SessionUser = {
  id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolNombre: string; perfilTipo?: string | null;
};
type Sede = { id: number; nombre: string };

function currentBogotaMonthInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value || String(new Date().getFullYear());
  const month = parts.find(part => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}
function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
}
function formatoNumero(valor: number) { return Number(valor || 0).toLocaleString("es-CO"); }
function formatoPorcentaje(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return "Sin base anterior";
  return `${valor > 0 ? "+" : ""}${valor.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function formatTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(date);
}
function esResumenValido(value: unknown): value is AnalyticSummary {
  if (!value || typeof value !== "object") return false;
  const data = value as AnalyticSummary;
  const metricValida = (metric: Metric) => metric && [metric.actual, metric.anterior, metric.diferencia].every(item => typeof item === "number" && Number.isFinite(item)) && (metric.porcentaje === null || typeof metric.porcentaje === "number" && Number.isFinite(metric.porcentaje));
  return typeof data.periodoActual?.key === "string" && typeof data.periodoActual.label === "string" &&
    typeof data.periodoAnterior?.key === "string" && typeof data.periodoAnterior.label === "string" &&
    typeof data.cobertura === "string" && Boolean(metricValida(data.ventas)) && Boolean(metricValida(data.utilidad));
}
function tono(metric: Metric) { return metric.diferencia > 0 ? "positive" : metric.diferencia < 0 ? "negative" : "neutral"; }

function SummaryMetric({ icon, label, metric, formatValue }: {
  icon: DashboardIconName; label: string; metric: Metric | null; formatValue: (value: number) => string;
}) {
  const value = metric ? formatValue(metric.actual) : "—";
  return <article className={styles.metric}>
    <span className={styles.metricIcon}><DashboardIcon name={icon} /></span>
    <div className={styles.metricContent} style={{ "--value-length": value.length } as CSSProperties}>
      <p>{label}</p><strong className={metric && metric.actual < 0 ? styles.negativeValue : undefined}>{value}</strong>
      <div className={styles.metricComparison}>{metric ? <><span className={styles.delta} data-tone={metric.porcentaje === null ? "neutral" : tono(metric)}>{formatoPorcentaje(metric.porcentaje)}</span><span>frente al mes anterior</span></> : <span>Consulta del periodo seleccionado</span>}</div>
    </div>
  </article>;
}
function MetricComparisonCard({ icon, label, metric, formatValue, actualLabel, anteriorLabel, utility = false }: {
  icon: DashboardIconName; label: string; metric: Metric; formatValue: (value: number) => string;
  actualLabel: string; anteriorLabel: string; utility?: boolean;
}) {
  const maximo = Math.max(Math.abs(metric.actual), Math.abs(metric.anterior), 1);
  const diferenciaTexto = metric.diferencia > 0 ? `+${formatValue(metric.diferencia)}` : formatValue(metric.diferencia);
  return <figure className={styles.comparisonCard}>
    <figcaption><span className={styles.cardIcon}><DashboardIcon name={icon} /></span><span>{label}</span></figcaption>
    <div className={styles.series}>
      <div className={styles.seriesLabel}><span>Periodo actual<small>{actualLabel}</small></span><strong className={metric.actual < 0 ? styles.negativeText : undefined}>{formatValue(metric.actual)}</strong></div>
      <div className={styles.track} aria-hidden="true"><div className={`${styles.bar} ${utility && metric.actual >= 0 ? styles.utilityBar : ""}`} style={{ width: `${Math.abs(metric.actual) / maximo * 100}%` }} /></div>
    </div>
    <div className={styles.series}>
      <div className={styles.seriesLabel}><span>Mes anterior<small>{anteriorLabel}</small></span><strong className={metric.anterior < 0 ? styles.negativeText : undefined}>{formatValue(metric.anterior)}</strong></div>
      <div className={styles.track} aria-hidden="true"><div className={`${styles.bar} ${styles.previousBar}`} style={{ width: `${Math.abs(metric.anterior) / maximo * 100}%` }} /></div>
    </div>
    <div className={styles.difference} data-tone={tono(metric)}><span>Diferencia</span><strong>{diferenciaTexto}</strong></div>
  </figure>;
}

export default function PanelAnaliticoPage() {
  const [periodo, setPeriodo] = useState(currentBogotaMonthInput());
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [resumen, setResumen] = useState<AnalyticSummary | null>(null);
  const [error, setError] = useState("");
  const [errorSesion, setErrorSesion] = useState("");
  const [errorSedes, setErrorSedes] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [consultaCargada, setConsultaCargada] = useState("");
  const sessionRequest = useRef(0);
  const sedesRequest = useRef(0);
  const resumenRequest = useRef(0);
  const resumenAbort = useRef<AbortController | null>(null);
  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user?.rolNombre || "").toUpperCase());
  const reportHref = esAdmin ? "/dashboard/reportes" : "/dashboard/analitico";
  const periodoValido = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
  const consultaScope = !user ? "" : `${user.id}:${periodo}:${esAdmin ? sedeFiltroId : user.sedeId}`;
  const disponible = Boolean(user && resumen && periodoValido && consultaCargada === consultaScope && !error && !errorSesion);
  const datos = disponible ? resumen : null;
  const cargandoVista = cargando || cargandoSesion;
  const coberturaActual = useMemo(() => {
    if (!esAdmin) return user?.sedeNombre || "Tu sede";
    if (sedeFiltroId === "TODAS") return "Todas las sedes";
    return sedes.find(sede => String(sede.id) === sedeFiltroId)?.nombre || "Sede filtrada";
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const cargarSedes = useCallback(async () => {
    const requestId = ++sedesRequest.current;
    setErrorSedes("");
    try {
      const response = await fetch("/api/sedes", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (requestId !== sedesRequest.current) return;
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || "No se pudo cargar el catálogo de sedes.");
      setSedes(data);
    } catch (cause) {
      if (requestId === sedesRequest.current) setErrorSedes(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo cargar el catálogo de sedes.");
    }
  }, []);
  const cargarContexto = useCallback(async () => {
    const requestId = ++sessionRequest.current;
    setCargandoSesion(true);
    setErrorSesion("");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (requestId !== sessionRequest.current) return;
      if (!response.ok || !data || !Number.isInteger(data.id) || data.id <= 0) throw new Error(data?.error || "No se pudo cargar la sesión.");
      setUser(data);
      if (["ADMIN", "AUDITOR"].includes(String(data.rolNombre || "").toUpperCase())) void cargarSedes();
    } catch (cause) {
      if (requestId === sessionRequest.current) {
        setUser(null);
        setErrorSesion(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo cargar la sesión.");
      }
    } finally {
      if (requestId === sessionRequest.current) setCargandoSesion(false);
    }
  }, [cargarSedes]);
  const cargarResumen = useCallback(async () => {
    const requestId = ++resumenRequest.current;
    resumenAbort.current?.abort();
    if (!user || !periodoValido) { setCargando(false); return; }
    const controller = new AbortController();
    resumenAbort.current = controller;
    setError("");
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.set("period", periodo);
      if (esAdmin && sedeFiltroId !== "TODAS") params.set("sedeId", sedeFiltroId);
      const response = await fetch(`/api/dashboard/analitico?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (requestId !== resumenRequest.current || controller.signal.aborted) return;
      if (!response.ok || !esResumenValido(data?.resumen)) throw new Error(data?.error || "No se pudo consultar el panel analítico.");
      setResumen(data.resumen);
      setConsultaCargada(consultaScope);
      setUltimaActualizacion(new Date());
    } catch (cause) {
      if (requestId === resumenRequest.current && !controller.signal.aborted) {
        setConsultaCargada("");
        setError(cause instanceof Error && cause.name === "Error" ? cause.message : "Error cargando el panel analítico.");
      }
    } finally {
      if (requestId === resumenRequest.current) setCargando(false);
    }
  }, [consultaScope, esAdmin, periodo, periodoValido, sedeFiltroId, user]);

  useEffect(() => {
    void cargarContexto();
    return () => { sessionRequest.current += 1; sedesRequest.current += 1; };
  }, [cargarContexto]);
  useEffect(() => {
    if (!user) return;
    void cargarResumen();
    return () => { resumenRequest.current += 1; resumenAbort.current?.abort(); };
  }, [cargarResumen, user]);
  useLiveRefresh(cargarResumen, { enabled: Boolean(user) && periodoValido, intervalMs: 10000 });

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: reportHref, icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings", label: "Configuración" } satisfies NavigationItem] : []),
  ];
  const secundarios = navigationItems.filter(item => ["/cierre", "/dashboard/aprobaciones", "/dashboard/sedes"].includes(item.href));
  const principales = navigationItems.filter(item => !secundarios.includes(item));
  const enlace = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === reportHref ? styles.navActive : ""}`} aria-current={item.href === reportHref ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{principales.map(enlace)}<div className={styles.extraNavigation}>{secundarios.map(enlace)}</div><details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secundarios.map(enlace)}</div></details></nav>
      <SalesProfile name={user?.nombre || user?.usuario || (cargandoSesion ? "Cargando usuario" : "Usuario")} role={user?.rolNombre || "Sesión por verificar"} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}>
        <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="arrow" /><span>Panel analítico</span></nav><h1>Panel analítico</h1><p>Comparativo mensual de ventas y utilidad frente al mes anterior.</p></div>
        <div className={styles.updateTime}><DashboardIcon name="clock" /><span>Última actualización<strong>{disponible && ultimaActualizacion ? <time dateTime={ultimaActualizacion.toISOString()}>{formatTimeLabel(ultimaActualizacion)}</time> : cargandoVista ? "Consultando…" : "Sin datos cargados"}</strong></span></div>
      </div>
      <section className={styles.filters} aria-labelledby="analysis-period-title">
        <div className={styles.sectionTitle}><span className={styles.sectionIcon}><DashboardIcon name="calendar" /></span><div><h2 id="analysis-period-title">Periodo de análisis</h2><p>Comparación con el mes inmediatamente anterior</p></div></div>
        <div className={styles.filterControls}>
          <label>Mes y año<input type="month" required value={periodo} aria-invalid={!periodoValido} aria-describedby={!periodoValido ? "period-error" : undefined} onChange={event => setPeriodo(event.target.value)} />{!periodoValido && <span id="period-error" className={styles.fieldError}>Selecciona un mes válido.</span>}</label>
          <label className={styles.coverageField}>Cobertura{esAdmin ? <select value={sedeFiltroId} onChange={event => setSedeFiltroId(event.target.value)}><option value="TODAS">Todas las sedes</option>{sedes.map(sede => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select> : <span className={styles.scope}><DashboardIcon name="store" />{user?.sedeNombre || (cargandoSesion ? "Cargando sede…" : "Sin sede cargada")}</span>}</label>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={cargandoVista || !user || !periodoValido} onClick={() => void cargarResumen()}><DashboardIcon name="refresh" />{cargandoVista ? "Actualizando…" : "Actualizar"}</button>
        </div>
        {errorSedes && <div className={styles.catalogError} role="alert"><span>{errorSedes}</span><button type="button" onClick={() => void cargarSedes()}>Reintentar sedes</button></div>}
      </section>
      {(errorSesion || error) && <div className={styles.notice} role="alert"><DashboardIcon name="warning" /><span>{errorSesion || error}</span><button type="button" disabled={cargandoVista || !periodoValido} onClick={() => void (user ? cargarResumen() : cargarContexto())}>Reintentar</button></div>}
      <section className={styles.summary} aria-label="Resumen del periodo" aria-busy={cargandoVista}>
        <SummaryMetric icon="sales" label="Número de ventas" metric={datos?.ventas || null} formatValue={formatoNumero} />
        <SummaryMetric icon="trend" label="Utilidad generada" metric={datos?.utilidad || null} formatValue={formatoPesos} />
      </section>
      <section className={styles.panel} aria-labelledby="monthly-comparison-title">
        <div className={styles.panelHeader}><div className={styles.sectionTitle}><span className={styles.sectionIcon}><DashboardIcon name="reports" /></span><div><h2 id="monthly-comparison-title">Comparativo mensual</h2><p>{datos ? `${datos.periodoActual.label} frente a ${datos.periodoAnterior.label}` : "Ventas y utilidad del periodo consultado"}</p></div></div><details className={styles.chartHelp}><summary><DashboardIcon name="pie" />Cómo leerlo<DashboardIcon name="chevron" /></summary><p>Cada gráfico usa su propia escala. La longitud de las barras representa el valor absoluto; las etiquetas muestran el valor exacto, incluidos los negativos. Si el mes anterior es cero, no existe una base para calcular el porcentaje.</p></details></div>
        {datos ? <>
          <div className={styles.comparisons}>
            <MetricComparisonCard icon="sales" label="Número de ventas" metric={datos.ventas} formatValue={formatoNumero} actualLabel={datos.periodoActual.label} anteriorLabel={datos.periodoAnterior.label} />
            <MetricComparisonCard icon="trend" label="Utilidad generada" metric={datos.utilidad} formatValue={formatoPesos} actualLabel={datos.periodoActual.label} anteriorLabel={datos.periodoAnterior.label} utility />
          </div>
          <dl className={styles.context}><div><dt><DashboardIcon name="calendar" />Periodo actual</dt><dd>{datos.periodoActual.label}</dd></div><div><dt><DashboardIcon name="trend" />Comparado con</dt><dd>{datos.periodoAnterior.label}</dd></div><div><dt><DashboardIcon name="store" />Cobertura</dt><dd>{datos.cobertura}</dd></div></dl>
          {datos.ventas.actual === 0 && datos.utilidad.actual === 0 && <p className={styles.zeroState}>No se registran ventas ni utilidad en el periodo actual de esta cobertura. Se conserva la comparación con el mes anterior.</p>}
        </> : <div className={styles.empty} role="status"><DashboardIcon name={cargandoVista ? "refresh" : !periodoValido ? "calendar" : "warning"} /><strong>{cargandoVista ? "Cargando indicadores…" : !periodoValido ? "Selecciona un mes para consultar" : "No se pudieron cargar los indicadores"}</strong><p>{cargandoVista ? "Consultando las ventas y la utilidad de tu cobertura." : !periodoValido ? "Elige el mes y año en el filtro de periodo." : "Reintenta la consulta para ver las cifras del periodo."}</p></div>}
      </section>
      <div className={styles.liveStatus} role="status"><DashboardIcon name="refresh" /><span>{cargando && disponible ? "Actualizando indicadores…" : "Actualización automática cada 10 segundos"}</span><span className={styles.liveCoverage}><DashboardIcon name="store" />{user ? coberturaActual : "Cobertura por verificar"}</span></div>
    </main>
  </div>;
}
