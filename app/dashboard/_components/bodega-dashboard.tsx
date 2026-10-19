"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import LoanDialog from "@/app/prestamos/_components/loan-dialog";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";
import { getBodegaNavigation } from "@/lib/bodega-navigation";
import type { BodegaDashboardData } from "@/lib/bodega-dashboard";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./bodega-dashboard.module.css";

const PAGE_SIZE = 10;
const money = (value: number) => `$ ${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(parsed);
}
function pages(current: number, total: number) {
  return [...new Set([1, current - 1, current, current + 1, total])].filter(page => page > 0 && page <= total).sort((a, b) => a - b);
}

function Metric({ icon, label, value, red = false }: { icon: DashboardIconName; label: string; value: string; red?: boolean }) {
  return <article className={styles.metric} style={{ "--mobile-metric-size": `${Math.max(17, Math.min(29, 380 / value.length))}px` } as CSSProperties}><span className={styles.metricIcon}><DashboardIcon name={icon} /></span><div><p>{label}</p><strong className={red ? styles.highlight : undefined}>{value}</strong></div></article>;
}
function Pagination({ page, total, onChange, label }: { page: number; total: number; onChange: (page: number) => void; label: string }) {
  const visible = pages(page, total);
  return <nav className={styles.pagination} aria-label={label}>
    <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Anterior</button>
    {visible.map((value, index) => <span key={value}>{index > 0 && value - visible[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${value}`} aria-current={value === page ? "page" : undefined} className={value === page ? styles.currentPage : undefined} onClick={() => onChange(value)}>{value}</button></span>)}
    <button type="button" disabled={page === total} onClick={() => onChange(page + 1)}>Siguiente</button>
  </nav>;
}

export default function BodegaDashboard({ initialData, initialError = "", nombre }: { initialData: BodegaDashboardData | null; initialError?: string; nombre: string }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const busy = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/dashboard/bodega", { cache: "no-store", signal: controller.current.signal });
      if (!response.ok) {
        if (alive.current && (response.status === 401 || response.status === 403)) { setData(null); setSelected(null); }
        let message = "No se pudo actualizar el dashboard de bodega";
        try { message = (await response.json()).error || message; } catch {}
        throw new Error(message);
      }
      const result = await response.json();
      const metricKeys = ["equiposEnBodega", "valorEnBodega", "enviadosASede", "totalPorCobrar", "equiposPorCobrar", "sedesDeudoras"];
      if (result.ok !== true || !result.metrics || !metricKeys.every(key => typeof result.metrics[key] === "number" && Number.isFinite(result.metrics[key])) || !Array.isArray(result.deudores) || !Array.isArray(result.equiposConDeuda)) throw new Error("La respuesta de bodega está incompleta");
      if (alive.current) { setData(result); setSelected(current => result.deudores.some((group: { key: string }) => group.key === current) ? current : null); setError(""); }
    } catch (cause) {
      if (alive.current && !(cause instanceof Error && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "No se pudo actualizar el dashboard de bodega");
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);
  useLiveRefresh(refresh, { intervalMs: 30000 });

  const groups = useMemo(() => {
    const term = normalize(search);
    return (data?.deudores || []).filter(group => !term || normalize(`${group.nombre} ${group.sedeId ?? ""}`).includes(term));
  }, [data, search]);
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleGroups = groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalFiltered = groups.reduce((sum, group) => sum + Math.round(group.totalPendiente * 100), 0) / 100;
  const currentGroup = data?.deudores.find(group => group.key === selected);
  const detailItems = useMemo(() => {
    if (!currentGroup) return [];
    const term = normalize(detailSearch);
    return (data?.equiposConDeuda || []).filter(item => (item.sedeDestinoId ?? null) === currentGroup.sedeId && (!term || normalize(`${item.imei} ${item.referencia} ${item.id}`).includes(term)));
  }, [data, currentGroup, detailSearch]);
  const detailPages = Math.max(1, Math.ceil(detailItems.length / PAGE_SIZE));
  const currentDetailPage = Math.min(detailPage, detailPages);
  const visibleDetails = detailItems.slice((currentDetailPage - 1) * PAGE_SIZE, currentDetailPage * PAGE_SIZE);
  const open = (key: string, button: HTMLButtonElement) => { opener.current = button; setSelected(key); setDetailSearch(""); setDetailPage(1); };
  const close = () => { setSelected(null); opener.current?.focus(); };
  const metrics = data?.metrics;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, dashboard de bodega"><Image src="/branding/conectamos-logo.png" alt="" width={42} height={42} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación de bodega">{getBodegaNavigation().map(item => <Link key={item.href} href={item.href} aria-current={item.href === "/dashboard" ? "page" : undefined} className={item.href === "/dashboard" ? styles.active : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <SalesProfile name={nombre} role="BODEGA" />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>BODEGA PRINCIPAL</p><h1>Dashboard de bodega</h1><p>Inventario, despachos y cobros pendientes por sede.</p></div><div className={styles.actions}><Link href="/inventario-principal" className={styles.button}><DashboardIcon name="inventory" />Ver inventario</Link><Link href="/inventario/nuevo" className={`${styles.button} ${styles.primary}`}><span aria-hidden="true">＋</span>Ingresar equipos</Link></div></div>
      {error && <div role="alert" className={styles.error}><div>{error}{data && <p>Se muestran los datos de la última actualización correcta.</p>}</div><button type="button" onClick={() => void refresh()} disabled={loading}>Reintentar</button></div>}
      <section className={styles.metrics} aria-label="Resumen de bodega principal" aria-busy={loading}>
        <Metric icon="inventory" label="Equipos en bodega" value={metrics ? metrics.equiposEnBodega.toLocaleString("es-CO") : "—"} />
        <Metric icon="wallet" label="Valor en bodega" value={metrics ? money(metrics.valorEnBodega) : "—"} />
        <Metric icon="send" label="Enviados a sede" value={metrics ? metrics.enviadosASede.toLocaleString("es-CO") : "—"} />
        <Metric icon="receivable" label="Total por cobrar" value={metrics ? money(metrics.totalPorCobrar) : "—"} red />
      </section>
      <div className={styles.shortcuts}>
        <Link href="/dashboard/radar"><span className={styles.shortcutIcon}><DashboardIcon name="reports" /></span><div><strong>Radar de inventario</strong><p>Disponibilidad por referencia y sede</p></div><DashboardIcon name="arrow" /></Link>
        <Link href="/prestamos"><span className={styles.shortcutIcon}><DashboardIcon name="loans" /></span><div><strong>Préstamos de bodega</strong><p>Despachos y devoluciones de la bodega principal</p></div><DashboardIcon name="arrow" /></Link>
      </div>
      <section id="quien-me-debe" className={styles.panel} aria-labelledby="bodega-debt-title">
        <div className={styles.panelHeading}><div><h2 id="bodega-debt-title">Quién le debe a bodega</h2><p>{metrics ? <>{metrics.sedesDeudoras.toLocaleString("es-CO")} sedes o grupos deudores · {metrics.equiposPorCobrar.toLocaleString("es-CO")} equipos con cobro pendiente</> : "Cargando saldos de bodega principal"}</p></div><button type="button" className={styles.button} disabled={loading} onClick={() => void refresh()}><DashboardIcon name="refresh" />{loading ? "Actualizando…" : "Actualizar"}</button></div>
        <div className={styles.debtTools}><div><span>Totalidad de la deuda</span><strong>{metrics ? money(metrics.totalPorCobrar) : "—"}</strong></div><label className={styles.search}><DashboardIcon name="search" /><span className={styles.srOnly}>Buscar sede deudora</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar sede deudora…" type="search" maxLength={120} /></label></div>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Deuda de bodega agrupada por sede"><table className={styles.table}>
          <thead><tr><th>Sede deudora</th><th className={styles.numeric}>Equipos con deuda</th><th className={styles.numeric}>Total pendiente</th><th>Detalle</th></tr></thead>
          <tbody>{!data ? <tr><td colSpan={4} className={styles.empty}>{loading ? "Cargando saldos…" : "No se pudieron cargar los saldos."}</td></tr> : visibleGroups.length === 0 ? <tr><td colSpan={4} className={styles.empty}>{data.deudores.length ? "No hay sedes que coincidan con la búsqueda." : "No hay cobros pendientes de bodega principal."}</td></tr> : visibleGroups.map(group => <tr key={group.key}><td><strong>{group.nombre}</strong>{group.sedeId === null && <p className={styles.unidentified}>Destino pendiente de identificar</p>}</td><td className={styles.numeric}>{group.equipos.toLocaleString("es-CO")}</td><td className={`${styles.numeric} ${styles.amount}`}>{money(group.totalPendiente)}</td><td><button type="button" className={styles.detailButton} onClick={event => open(group.key, event.currentTarget)} aria-label={`Ver equipos de ${group.nombre}`}>Ver detalle<DashboardIcon name="chevron" /></button></td></tr>)}</tbody>
        </table></div>
        <div className={styles.panelFooter}><p>{data ? groups.length.toLocaleString("es-CO") : "—"} resultados · Total de la consulta <strong>{data ? money(totalFiltered) : "—"}</strong></p><Pagination label="Paginación de sedes deudoras" page={currentPage} total={totalPages} onChange={setPage} /></div>
        <p className={styles.updated}>{data?.updatedAt ? `Actualizado ${date(data.updatedAt)} · Cobertura: bodega principal y sus envíos a sedes.` : ""}</p>
      </section>
    </main>
    {currentGroup && <LoanDialog title={`Deuda de ${currentGroup.nombre}`} open={Boolean(currentGroup)} busy={false} onClose={close} footer={<button type="button" className={styles.button} onClick={close}>Cerrar detalle</button>}>
      <div className={styles.detailSummary}><div><span>Equipos con deuda</span><strong>{currentGroup.equipos.toLocaleString("es-CO")}</strong></div><div><span>Total pendiente de esta sede</span><strong>{money(currentGroup.totalPendiente)}</strong></div></div>
      <label className={`${styles.search} ${styles.detailSearch}`}><DashboardIcon name="search" /><span className={styles.srOnly}>Buscar equipo de la sede</span><input value={detailSearch} onChange={event => { setDetailSearch(event.target.value); setDetailPage(1); }} placeholder="Buscar IMEI, referencia o ID…" type="search" /></label>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`Equipos adeudados por ${currentGroup.nombre}`}><table className={`${styles.table} ${styles.detailTable}`}><thead><tr><th>Equipo / IMEI</th><th className={styles.numeric}>Pendiente</th><th>Estado</th><th>Envío</th><th>Historial</th></tr></thead><tbody>{visibleDetails.length === 0 ? <tr><td colSpan={5} className={styles.empty}>No hay equipos que coincidan con la búsqueda.</td></tr> : visibleDetails.map(item => <tr key={item.id}><td><strong>{item.referencia}</strong><p>{item.color || "Sin color"} · ID {item.id}</p><p className={styles.imei}>IMEI: {item.imei}</p></td><td className={`${styles.numeric} ${styles.amount}`}>{money(item.costo)}</td><td><span className={styles.badge}>{item.estado}</span><p>Cobro pendiente</p></td><td>{date(item.fechaEnvio)}</td><td><Link className={styles.detailButton} href={`/inventario/historial?imei=${encodeURIComponent(item.imei)}`}>Ver historial<DashboardIcon name="arrow" /></Link></td></tr>)}</tbody></table></div>
      <div className={styles.panelFooter}><p>{detailItems.length.toLocaleString("es-CO")} equipos encontrados</p><Pagination label="Paginación de equipos de la sede" page={currentDetailPage} total={detailPages} onChange={setDetailPage} /></div>
    </LoanDialog>}
  </div>;
}
