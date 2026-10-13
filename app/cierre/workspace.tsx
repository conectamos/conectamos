"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { DashboardSidebar, type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import type { CierreDetail, CierreFilters, CierreFinancier, CierreReport, PeriodMode } from "./types";
import styles from "./cierre.module.css";

const count = (value: number | null) => value === null ? "Pendiente" : value.toLocaleString("es-CO");
const pesos = (value: number | null) => value === null ? "Pendiente" : new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 2,
}).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
const timeLabel = (value: string) => new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit",
}).format(new Date(value));
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));

function queryFor(filters: CierreFilters) {
  const params = new URLSearchParams({ mode: filters.mode, sedeId: filters.sedeId });
  if (filters.mode === "range") {
    params.set("from", filters.from);
    params.set("to", filters.to);
  } else if (filters.mode === "month") params.set("month", filters.month);
  else params.set("date", filters.date);
  return params.toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No fue posible consultar el cierre.");
  return body as T;
}

function Completeness({ complete }: { complete: boolean }) {
  return <span className={`${styles.status} ${complete ? styles.complete : styles.pending}`}>
    <DashboardIcon name={complete ? "shield" : "clock"} className="h-4 w-4" />
    {complete ? "Periodo completo" : "Información pendiente"}
  </span>;
}

export default function CierreWorkspace({ today, user }: {
  today: string;
  user: { name: string; sedeId: number; sedeName: string; isAdmin: boolean; operational: boolean };
}) {
  const [filters, setFilters] = useState<CierreFilters>({
    mode: "month", date: today, month: today.slice(0, 7), from: `${today.slice(0, 7)}-01`, to: today,
    sedeId: user.isAdmin ? "TODAS" : String(user.sedeId),
  });
  const [query, setQuery] = useState(() => queryFor(filters));
  const [report, setReport] = useState<CierreReport | null>(null);
  const [options, setOptions] = useState<CierreReport["options"]>({
    sedes: [{ id: user.sedeId, nombre: user.sedeName }], canSelectSede: user.isAdmin,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selected, setSelected] = useState<CierreFinancier | null>(null);
  const [detail, setDetail] = useState<CierreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailReload, setDetailReload] = useState(0);
  const [page, setPage] = useState(1);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [detailSettledKey, setDetailSettledKey] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const invalidRange = filters.mode === "range" && filters.from > filters.to;
  const unapplied = queryFor(filters) !== query;
  const detailRequestKey = `${query}:${selected?.key || ""}:${page}:${detailReload}`;
  const detailRefreshing = Boolean(selected && detail && detailSettledKey !== detailRequestKey);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let continuePolling = false;

    async function requestReport(background = false) {
      try {
        const result = await readJson<CierreReport>(await fetch(`/api/cierre?${query}`, { cache: "no-store", signal: controller.signal }));
        if (controller.signal.aborted) return;
        setReport(result);
        setOptions(result.options);
        setCheckedAt(new Date().toISOString());
        setError("");
        setRefreshError("");
        // Poll the applied report only while its local sales are being loaded.
        // Provider coverage may remain partial after this work has finished.
        continuePolling = Boolean(result.localSync && !result.localSync.complete);
        if (background) setDetailReload((value) => value + 1);
      } catch (reason) {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : "No fue posible cargar el cierre.";
        if (background) setRefreshError(message);
        else setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
          if (continuePolling) timer = setTimeout(() => {
            setRefreshing(true);
            void requestReport(true);
          }, 10_000);
        }
      }
    }

    void requestReport();
    return () => { controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [query, reload]);

  useEffect(() => {
    if (!selected) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    params.set("financier", selected.key);
    params.set("page", String(page));
    fetch(`/api/cierre/detalle?${params}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<CierreDetail>)
      .then((result) => {
        if (!controller.signal.aborted) { setDetail(result); setDetailError(""); }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "No fue posible cargar el detalle.");
      })
      .finally(() => {
        if (!controller.signal.aborted) { setDetailLoading(false); setDetailSettledKey(detailRequestKey); }
      });
    return () => controller.abort();
  }, [selected, query, page, detailReload, detailRequestKey]);

  function loadReport(event?: FormEvent) {
    event?.preventDefault();
    if (invalidRange) return;
    if (selected) closeDetail();
    setLoading(true);
    setError("");
    setRefreshError("");
    setRefreshing(false);
    setCheckedAt(null);
    setExportError("");
    setReport(null);
    setQuery(queryFor(filters));
    setReload((value) => value + 1);
  }

  function openDetail(financier: CierreFinancier, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setPage(1);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    setSelected(financier);
  }

  function closeDetail() {
    dialogRef.current?.close();
    setSelected(null);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function changePage(next: number) {
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setPage(next);
  }

  async function exportExcel() {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(`/api/cierre/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "No fue posible exportar el cierre.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cierre-${report?.period.from.slice(0, 10)}-${report?.period.to.slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "No fue posible exportar el cierre.");
    } finally { setExporting(false); }
  }

  const navigation: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    ...(user.operational ? [
      { href: "/ventas", icon: "sales", label: "Ventas" },
      { href: "/inventario", icon: "inventory", label: "Inventario" },
      { href: "/prestamos", icon: "loans", label: "Préstamos" },
      { href: "/caja", icon: "wallet", label: "Caja" },
    ] as NavigationItem[] : []),
    { href: "/cierre", icon: "reports", label: "CIERRE" },
    ...(user.isAdmin ? [
      { href: "/dashboard/reportes", icon: "pie", label: "Reportes" },
      { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
    ] as NavigationItem[] : []),
  ];
  const pending = !report?.complete;
  const currentPage = detail?.page ?? page;
  const currentFinancier = report?.financiers.find((financier) => financier.key === selected?.key) || selected;
  const loadingSales = Boolean(report?.localSync && !report.localSync.complete);
  const syncMessage = report?.localSync?.pending
    ? `Cargando ventas del periodo: ${count(report.localSync.pending)} pendientes.`
    : "Preparando las ventas del periodo…";
  const noLoadedCredits = report && !report.financiers.some((financier) => (financier.units ?? 0) > 0);

  return <div className={styles.shell}>
    <DashboardSidebar activeHref="/cierre" coverageLabel={report?.scope.label || (user.isAdmin ? "Todas las sedes" : user.sedeName)} items={navigation} />
    <div className={styles.workspace}><main className={styles.main}>
      <header className={styles.header}>
        <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><span aria-hidden="true">/</span><span>CIERRE</span></nav><h1>CIERRE</h1><p>Créditos efectivos por financiera</p></div>
        <div className={styles.identity}><DashboardIcon name="user" /><span>{user.name}</span></div>
      </header>

      <form className={styles.filters} onSubmit={loadReport}>
        <label>Periodo<select value={filters.mode} onChange={(event) => setFilters({ ...filters, mode: event.target.value as PeriodMode })}>
          <option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option><option value="range">Rango personalizado</option>
        </select></label>
        {filters.mode === "month" ? <label>Mes<input type="month" required value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })} /></label> : filters.mode === "range" ? <>
          <label>Desde<input type="date" required value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} aria-invalid={invalidRange} aria-describedby={invalidRange ? "range-error" : undefined} /></label>
          <label>Hasta<input type="date" required value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} aria-invalid={invalidRange} aria-describedby={invalidRange ? "range-error" : undefined} /></label>
        </> : <label>{filters.mode === "week" ? "Un día de la semana" : "Día"}<input type="date" required value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>}
        <label>Sede{options.canSelectSede ? <select value={filters.sedeId} onChange={(event) => setFilters({ ...filters, sedeId: event.target.value })}>
          <option value="TODAS">Todas las sedes</option>{options.sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}
        </select> : <span className={styles.lockedScope}><DashboardIcon name="store" className="h-4 w-4" />{user.sedeName}</span>}</label>
        <button type="submit" className={styles.primaryButton} disabled={loading || invalidRange}><DashboardIcon name="search" className="h-4 w-4" />{loading ? "Consultando…" : "Consultar"}</button>
        <div className={styles.filterNote}><span>Hora de Colombia{filters.mode === "week" ? " · Lunes a domingo" : ""}</span>{unapplied && <span>Aplica los filtros con Consultar.</span>}</div>
        {invalidRange && <p id="range-error" className={styles.formError} role="alert">La fecha inicial debe ser anterior o igual a la fecha final.</p>}
      </form>

      {error ? <div className={styles.error} role="alert"><div><strong>No fue posible cargar el cierre</strong><p>{error}</p></div><button type="button" className={styles.secondaryButton} onClick={() => loadReport()}>Reintentar</button></div> : <div aria-busy={loading}>
        <div className={styles.reportContext}>
          <div><h2>{report?.period.label || "Consultando periodo…"}</h2>{report && <p>{report.scope.label}</p>}</div>
          {report && <Completeness complete={report.complete} />}
        </div>
        <div className={styles.queryFeedback} role="status" aria-live="polite" aria-atomic="true">
          <span className={styles.queryResult}><DashboardIcon name={loading || refreshing ? "refresh" : "search"} className="h-4 w-4" />{loading ? "Consultando el periodo seleccionado…" : refreshing ? "Actualizando los datos del periodo…" : checkedAt ? <>Consulta finalizada · <time dateTime={checkedAt}>{timeLabel(checkedAt)}</time></> : null}</span>
          {loadingSales && <span>{syncMessage} El cierre se actualiza automáticamente.</span>}
          {report?.localSync?.complete && pending && <span>Ventas locales cargadas; conciliación de financieras pendiente.</span>}
          {noLoadedCredits && pending && <span>{loadingSales ? "Todavía no hay créditos cargados; los totales aparecerán a medida que avance la carga." : "Aún no hay créditos confirmados para este periodo; queda información pendiente."}</span>}
        </div>
        {refreshError && <p className={styles.refreshError} role="alert">No se pudo actualizar el cierre. Se conservan los últimos datos y se reintentará automáticamente. <span>{refreshError}</span></p>}
        <section className={styles.metrics} aria-label="Totales del periodo">
          <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="document" className="h-6 w-6" /></span><div><h3>Total de créditos</h3><p className={styles.metricValue}>{loading ? "—" : count(report?.totals.units ?? null)}</p><span>{pending ? "Unidades confirmadas · total parcial" : "Unidades de créditos efectivos"}</span></div></div>
          <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="wallet" className="h-6 w-6" /></span><div><h3>Valor total de los créditos</h3><p className={styles.metricValue}>{loading ? "—" : pesos(report?.totals.amount ?? null)}</p><span>{pending ? "Valor confirmado · total parcial" : "Pesos colombianos"}</span></div></div>
        </section>
        <section className={styles.panel} aria-labelledby="financiers-title">
          <div className={styles.panelHeader}><div><h2 id="financiers-title">Financieras</h2><p>Selecciona una financiera para ver sus créditos.</p></div><button type="button" className={styles.secondaryButton} onClick={exportExcel} disabled={loading || exporting || !report}><DashboardIcon name="download" className="h-4 w-4" />{exporting ? "Exportando…" : "Exportar Excel"}</button></div>
          {exportError && <p className={styles.exportError} role="alert">{exportError}</p>}
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Consolidado por financiera">
            <table className={styles.table}><thead><tr><th scope="col">Financiera</th><th scope="col">Unidades de créditos</th><th scope="col">Valor de los créditos</th></tr></thead><tbody>
              {loading ? <tr><td colSpan={3} className={styles.empty} role="status">Cargando créditos registrados…</td></tr> : report?.financiers.length ? report.financiers.map((financier) => <tr key={financier.key}>
                <th scope="row"><button type="button" className={styles.financierButton} onClick={(event) => openDetail(financier, event.currentTarget)} aria-haspopup="dialog"><span><strong>{financier.name}</strong><span className={styles.source}>{financier.source}</span></span><DashboardIcon name="chevron" className="h-4 w-4 -rotate-90" /></button>{!financier.complete && <span className={styles.rowPending}>Información pendiente</span>}</th>
                <td>{count(financier.units)}{!financier.complete && financier.units !== null && <span className={styles.partial}>Parcial</span>}</td>
                <td>{pesos(financier.amount)}{!financier.complete && financier.amount !== null && <span className={styles.partial}>Parcial</span>}</td>
              </tr>) : <tr><td colSpan={3} className={styles.empty}>No hay créditos efectivos registrados para este periodo.{pending && " Hay información pendiente de sincronizar."}</td></tr>}
            </tbody>{report && <tfoot><tr><th scope="row">Total{pending && <span className={styles.partial}>Información pendiente · totales parciales</span>}</th><td>{count(report.totals.units)}</td><td>{pesos(report.totals.amount)}</td></tr></tfoot>}</table>
          </div>
          <footer className={styles.panelFooter}><span><DashboardIcon name="clock" className="h-4 w-4" />Última actualización: {report?.lastUpdatedAt ? dateTime(report.lastUpdatedAt) : "pendiente"}</span>{report && !report.complete && <span>El periodo aún tiene información pendiente de sincronizar.</span>}</footer>
        </section>
      </div>}
    </main></div>

    {selected && report && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="detail-title" aria-describedby="detail-context" onCancel={(event) => { event.preventDefault(); closeDetail(); }} onClose={() => { setSelected(null); triggerRef.current?.focus({ preventScroll: true }); }}>
      <div className={styles.dialogHeader}><div><p className={styles.eyebrow}>Detalle de créditos</p><h2 id="detail-title">{selected.name}</h2><p id="detail-context">{report.period.label} · {report.scope.label}</p></div><button type="button" className={styles.closeButton} aria-label="Cerrar detalle" onClick={closeDetail} autoFocus><DashboardIcon name="close" /></button></div>
      <div className={styles.detailSummary}><span><strong>{count(detail?.units ?? currentFinancier?.units ?? null)}</strong> créditos</span><span><strong>{pesos(detail?.amount ?? currentFinancier?.amount ?? null)}</strong></span><Completeness complete={detail?.complete ?? currentFinancier?.complete ?? false} /></div>
      {(loadingSales || detailRefreshing) && <p className={styles.detailProgress} role="status">{detailRefreshing ? "Actualizando el listado de créditos…" : `${syncMessage} El listado se actualiza automáticamente.`}</p>}
      {detailError && <div className={styles.error} role="alert"><p>{detail && "No se pudo actualizar el detalle. Se conserva el último listado. "}{detailError}</p><button type="button" className={styles.secondaryButton} onClick={() => { setDetailError(""); if (!detail) setDetailLoading(true); setDetailReload((value) => value + 1); }}>Reintentar</button></div>}
      {(!detailError || detail) && <>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`Créditos de ${selected.name}`} aria-busy={detailLoading || detailRefreshing}>
          <table className={`${styles.table} ${styles.detailTable}`}><thead><tr><th scope="col">Fecha</th><th scope="col">Número del crédito</th><th scope="col">Cliente</th><th scope="col">Cédula</th><th scope="col">Sede</th><th scope="col">Valor del crédito</th><th scope="col">Estado</th><th scope="col">Fuente de la información</th></tr></thead><tbody>
            {detailLoading ? <tr><td colSpan={8} className={styles.empty} role="status">Cargando detalle…</td></tr> : detail?.items.length ? detail.items.slice(0, 10).map((credit) => <tr key={credit.id}><td>{dateLabel(credit.date)}</td><td>{credit.creditNumber || "Sin número registrado"}</td><td>{credit.customerName || "Sin registrar"}</td><td>{credit.customerDocument?.replace(/\./g, "") || "Sin registrar"}</td><td>{credit.sedeName}</td><td>{pesos(credit.amount)}</td><td><span className={styles.creditStatus}>{credit.status}</span></td><td>{credit.source}</td></tr>) : <tr><td colSpan={8} className={styles.empty}>No hay créditos efectivos registrados.{!(detail?.complete ?? currentFinancier?.complete) && " Información pendiente de sincronizar."}</td></tr>}
          </tbody></table>
        </div>
        <div className={styles.pagination}><span>{detail ? `${count(detail.total)} registros · máximo 10 por página` : "Máximo 10 registros por página"}</span><div><button type="button" className={styles.secondaryButton} disabled={detailLoading || currentPage <= 1} onClick={() => changePage(currentPage - 1)}>Anterior</button><span aria-live="polite">Página {currentPage}{detail ? ` de ${Math.max(1, Math.ceil(detail.total / 10))}` : ""}</span><button type="button" className={styles.secondaryButton} disabled={detailLoading || !detail || currentPage * 10 >= detail.total} onClick={() => changePage(currentPage + 1)}>Siguiente</button></div></div>
      </>}
      <footer className={styles.dialogFooter}><span>Última actualización: {currentFinancier?.lastUpdatedAt ? dateTime(currentFinancier.lastUpdatedAt) : "pendiente"}</span><button type="button" className={styles.secondaryButton} onClick={closeDetail}>Cerrar</button></footer>
    </dialog>}
  </div>;
}
