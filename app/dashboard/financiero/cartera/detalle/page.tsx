"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { triggerLiveRefresh, useLiveRefresh } from "@/lib/use-live-refresh";
import {
  carteraColombiaDate, carteraDateRangeError, carteraHistoryExportRows,
  carteraHistoryPageNumbers, carteraHistorySummary, filterCarteraHistory,
  formatCarteraMoney, paginateCarteraHistory, type CarteraHistoryItem,
} from "@/lib/cartera-history-view";
import styles from "./cartera-history.module.css";

type Sede = { id: number; nombre: string };
type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolNombre: string };
type Notice = { text: string; error: boolean } | null;
type NavItem = { href: string; icon: DashboardIconName; label: string };

function HistoryActionIcon({ name }: { name: "plus" | "edit" | "trash" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "plus" ? <path d="M12 5v14M5 12h14" /> : name === "edit" ? <><path d="m15 4 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /></> : <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>}
  </svg>;
}

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta.");
  return data;
}

export default function DetalleCarteraPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [items, setItems] = useState<CarteraHistoryItem[]>([]);
  const [initError, setInitError] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState(10);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [observacionEditando, setObservacionEditando] = useState("");
  const [sedeEditando, setSedeEditando] = useState("");
  const [errorEdicion, setErrorEdicion] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const processingRef = useRef(false);
  const exportRef = useRef(false);
  const loadSequence = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const moreMenu = useRef<HTMLDetailsElement>(null);

  const cargar = useCallback(async (sedeId = "", mostrarCarga = false) => {
    const sequence = ++loadSequence.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    if (mostrarCarga) setCargando(true);
    setErrorCarga("");
    try {
      const query = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : "";
      const data = await readJson(await fetch(`/api/financiero/cartera${query}`, {
        cache: "no-store", signal: controller.signal,
      }));
      if (data.ok !== true || !Array.isArray(data.items)) throw new Error("La respuesta del historial no es válida.");
      if (sequence === loadSequence.current && !controller.signal.aborted) setItems(data.items);
    } catch (error) {
      if (sequence === loadSequence.current && !controller.signal.aborted) {
        setErrorCarga(error instanceof Error ? error.message : "Error cargando los gastos de cartera.");
      }
    } finally {
      if (sequence === loadSequence.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const session = await readJson(await fetch("/api/session", { cache: "no-store" }));
        if (!session.id) throw new Error("No se pudo cargar la sesión.");
        const administrative = ["ADMIN", "AUDITOR"].includes(String(session.rolNombre || "").trim().toUpperCase());
        const locations = administrative ? await readJson(await fetch("/api/sedes", { cache: "no-store" })) : [];
        if (!Array.isArray(locations)) throw new Error("No se pudieron cargar las sedes.");
        if (!active) return;
        setUser(session); setSedes(locations);
        await cargar("", true);
      } catch (error) {
        if (active) { setInitError(error instanceof Error ? error.message : "Error cargando la sesión."); setCargando(false); }
      }
    };
    void init();
    return () => { active = false; loadController.current?.abort(); };
  }, [cargar]);

  useLiveRefresh(async () => {
    try {
      const session = await readJson(await fetch("/api/session", { cache: "no-store" }));
      if (!session.id) throw new Error("La sesión no está disponible.");
      const scopeChanged = Boolean(user && (session.id !== user.id || session.sedeId !== user.sedeId
        || String(session.rolNombre || "").trim().toUpperCase() !== String(user.rolNombre || "").trim().toUpperCase()));
      if (scopeChanged) {
        setItems([]); setCargando(true); setSedeFiltro(""); setPagina(1); setEditandoId(null);
      }
      setUser(session);
      const administrative = ["ADMIN", "AUDITOR"].includes(String(session.rolNombre || "").trim().toUpperCase());
      await cargar(administrative && !scopeChanged ? sedeFiltro : "", scopeChanged);
    } catch (error) {
      setErrorCarga(error instanceof Error ? error.message : "No se pudo verificar la sesión.");
    }
  }, { intervalMs: 10000, enabled: Boolean(user) && !procesando && !initError });

  useEffect(() => {
    if (editandoId === null || !modal.current) return;
    const previous = document.activeElement as HTMLElement | null;
    modal.current.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processingRef.current) { event.preventDefault(); setEditandoId(null); }
      if (event.key !== "Tab") return;
      const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)") || []);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [editandoId]);

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!moreMenu.current?.contains(event.target as Node)) moreMenu.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && moreMenu.current?.open) { moreMenu.current.removeAttribute("open"); moreMenu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);

  const rolActual = String(user?.rolNombre || "").trim().toUpperCase();
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";
  const coberturaActual = esAdmin
    ? sedes.find((sede) => String(sede.id) === sedeFiltro)?.nombre || "Todas las sedes"
    : user?.sedeNombre || "Sede asignada";
  const summary = useMemo(() => carteraHistorySummary(items), [items]);
  const total = summary.total;
  const promedio = summary.average;
  const errorFechas = carteraDateRangeError(desde, hasta);
  const itemsFiltrados = useMemo(() => filterCarteraHistory(items, {
    search: busqueda, sedeId: esAdmin ? sedeFiltro : String(user?.sedeId || ""), from: desde, to: hasta,
  }), [items, busqueda, sedeFiltro, esAdmin, user?.sedeId, desde, hasta]);
  const paginacion = paginateCarteraHistory(itemsFiltrados, pagina, filas);
  const unavailable = cargando || Boolean(initError || errorCarga);
  const navigation: NavItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "Cierre" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
  ];
  const extraNavigation: NavItem[] = [
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings" as const, label: "Configuración" }] : []),
  ];

  const cerrarEdicion = () => { if (!processingRef.current) setEditandoId(null); };
  const abrirEdicion = (item: CarteraHistoryItem) => {
    if (!esAdmin || unavailable || processingRef.current) return;
    setEditandoId(item.id); setValorEditando(String(item.valor));
    setObservacionEditando(item.observacion ?? ""); setSedeEditando(String(item.sedeId)); setErrorEdicion("");
  };

  const guardarEdicion = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!editandoId || !esAdmin || processingRef.current || initError) return;
    const valor = Number(valorEditando);
    if (!valorEditando.trim() || !Number.isFinite(valor) || valor === 0) { setErrorEdicion("El valor debe ser válido y diferente de cero."); return; }
    if (!sedes.some((sede) => sede.id === Number(sedeEditando))) { setErrorEdicion("Selecciona una sede válida."); return; }
    processingRef.current = true; setProcesando(true); setErrorEdicion(""); setNotice(null);
    // An older background read must not replace the result of this mutation.
    loadSequence.current++; loadController.current?.abort();
    try {
      const data = await readJson(await fetch("/api/financiero/cartera", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoId, valor, observacion: observacionEditando, sedeId: Number(sedeEditando) }),
      }));
      if (data.ok !== true || data.item?.id !== editandoId) throw new Error("No se pudo confirmar la actualización. Los datos se conservaron.");
      setEditandoId(null); setNotice({ text: "Gasto de cartera actualizado correctamente.", error: false });
      await cargar(sedeFiltro); triggerLiveRefresh("cartera-editada");
    } catch (error) {
      setErrorEdicion(error instanceof Error ? error.message : "No se pudo actualizar el gasto. Los datos se conservaron.");
    } finally { processingRef.current = false; setProcesando(false); }
  };

  const eliminarGasto = async (id: number) => {
    if (!puedeEliminar || unavailable || processingRef.current) return;
    if (!window.confirm("¿Deseas eliminar este gasto de cartera?")) return;
    processingRef.current = true; setProcesando(true); setNotice(null);
    loadSequence.current++; loadController.current?.abort();
    try {
      const data = await readJson(await fetch("/api/financiero/cartera", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      }));
      if (data.ok !== true) throw new Error("No se pudo confirmar la eliminación.");
      if (editandoId === id) setEditandoId(null);
      setNotice({ text: "Gasto de cartera eliminado correctamente.", error: false });
      await cargar(sedeFiltro); triggerLiveRefresh("cartera-eliminada");
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "No se pudo eliminar el gasto.", error: true }); }
    finally { processingRef.current = false; setProcesando(false); }
  };

  const exportarExcel = async () => {
    if (unavailable || errorFechas || !user || exportRef.current) return;
    exportRef.current = true; setExportando(true); setNotice(null);
    const results = carteraHistoryExportRows(itemsFiltrados);
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(results);
      sheet["!cols"] = [{ wch: 12 }, { wch: 15 }, { wch: 24 }, { wch: 23 }, { wch: 65 }, { wch: 26 }, { wch: 30 }];
      results.forEach((_, index) => { const cell = sheet[`D${index + 2}`]; if (cell) cell.z = '"$" #,##0.00;-"$" #,##0.00'; });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Gastos de cartera");
      const filters = XLSX.utils.json_to_sheet([{ Cobertura: coberturaActual, Desde: desde || "Sin límite", Hasta: hasta || "Sin límite", Búsqueda: busqueda, Resultados: results.length }]);
      XLSX.utils.book_append_sheet(workbook, filters, "Consulta");
      XLSX.writeFile(workbook, `gastos-cartera-${carteraColombiaDate(new Date().toISOString()).key}.xlsx`);
    } catch { setNotice({ text: "No se pudo exportar el historial. Intenta de nuevo.", error: true }); }
    finally { exportRef.current = false; setExportando(false); }
  };

  const limpiarFiltros = () => { setBusqueda(""); setDesde(""); setHasta(""); setPagina(1); if (sedeFiltro) { setSedeFiltro(""); void cargar("", true); } };
  const filtroActivo = Boolean(busqueda || sedeFiltro || desde || hasta);

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">
        {navigation.map((item, index) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${[3, 5, 6].includes(index) ? styles.optionalNav : ""} ${item.href === "/caja" ? styles.navActive : ""}`} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}
        <details ref={moreMenu} className={styles.more}><summary>Más<DashboardIcon name="chevron" /></summary><div className={styles.moreMenu}>
          {navigation.map((item, index) => <Link className={[3, 5, 6].includes(index) ? styles.hiddenOptional : styles.hiddenCore} key={item.href} href={item.href} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}
          {extraNavigation.map((item) => <Link key={item.href} href={item.href}><DashboardIcon name={item.icon} />{item.label}</Link>)}
        </div></details>
      </nav>
      <div className={styles.profile}><SalesProfile name={user?.nombre || user?.usuario || "Usuario"} role={user?.rolNombre || ""} /></div>
    </header>
    <main className={styles.main}>
      <header className={styles.heading}><div><h1>Historial de gastos de cartera</h1><p>Consulta y administra los movimientos del consolidado financiero.</p></div><div className={styles.headingActions}>
        <Link href="/dashboard/financiero" className={styles.button}><DashboardIcon name="arrow" className={styles.backArrow} />Volver al panel</Link>
        <Link href="/dashboard/financiero/cartera" className={`${styles.button} ${styles.primary}`}><HistoryActionIcon name="plus" />Registrar gasto</Link>
      </div></header>
      {notice && <div role={notice.error ? "alert" : "status"} className={notice.error ? styles.error : styles.success}><DashboardIcon name={notice.error ? "warning" : "approvals"} />{notice.text}</div>}
      <section className={styles.metrics} aria-label={`Indicadores de ${coberturaActual}, todo el historial`}>
        {[{ icon: "cash" as const, label: "Total cartera", value: formatCarteraMoney(total), tone: styles.redIcon },
          { icon: "document" as const, label: "Movimientos", value: items.length.toLocaleString("es-CO"), tone: styles.blueIcon },
          { icon: "trend" as const, label: "Promedio por registro", value: formatCarteraMoney(promedio), tone: styles.amberIcon }].map((metric) => <article key={metric.label} className={styles.metric}>
          <span className={`${styles.metricIcon} ${metric.tone}`}><DashboardIcon name={metric.icon} /></span><div><p>{metric.label}</p><strong>{unavailable ? "—" : metric.value}</strong></div>
        </article>)}
      </section>
      <section className={styles.panel} aria-labelledby="cartera-historial-title">
        <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.titleIcon}><DashboardIcon name="document" /></span><div><h2 id="cartera-historial-title">Gastos de cartera</h2><p aria-live="polite">{unavailable ? "Consultando registros…" : `${itemsFiltrados.length.toLocaleString("es-CO")} registros`}</p></div></div>
          <div className={styles.filters}>
            <label className={styles.search}><span className={styles.srOnly}>Buscar observación, valor o ID</span><DashboardIcon name="search" /><input id="cartera-historial-busqueda" value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setPagina(1); }} placeholder="Buscar observación, valor o ID" disabled={procesando} /></label>
            <label className={styles.select}><span className={styles.srOnly}>Filtrar sede</span><select id="cartera-historial-sede" aria-label="Filtrar sede" value={esAdmin ? sedeFiltro : String(user?.sedeId || "")} disabled={!user || procesando || !esAdmin} onChange={(event) => { const value = event.target.value; setSedeFiltro(value); setPagina(1); void cargar(value, true); }}>
              {esAdmin ? <><option value="">Todas las sedes</option>{sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}</> : <option value={user?.sedeId || ""}>{user?.sedeNombre || "Sede asignada"}</option>}
            </select><DashboardIcon name="chevron" /></label>
            <details className={styles.dateFilter}><summary><DashboardIcon name="calendar" />{desde || hasta ? "Periodo seleccionado" : "Seleccionar fechas"}<DashboardIcon name="chevron" /></summary><div className={styles.dateMenu}>
              <label htmlFor="cartera-desde">Desde<input id="cartera-desde" type="date" value={desde} onChange={(event) => { setDesde(event.target.value); setPagina(1); }} disabled={procesando} /></label>
              <label htmlFor="cartera-hasta">Hasta<input id="cartera-hasta" type="date" value={hasta} onChange={(event) => { setHasta(event.target.value); setPagina(1); }} disabled={procesando} /></label>
              <button type="button" className={styles.button} disabled={procesando} onClick={() => { setDesde(""); setHasta(""); setPagina(1); }}>Limpiar periodo</button>
            </div></details>
            <button type="button" className={styles.button} disabled={unavailable || Boolean(errorFechas) || exportando || procesando || !user} onClick={() => void exportarExcel()}><DashboardIcon name="download" />{exportando ? "Exportando…" : "Exportar Excel"}</button>
          </div>
        </div>
        <div className={styles.listScope}><span><DashboardIcon name="menu" />{filtroActivo ? "Resultados filtrados" : "Todos los movimientos"}</span><span className={styles.scopeText}>Indicadores: {coberturaActual} · Todo el historial</span>{filtroActivo && <button type="button" disabled={procesando} onClick={limpiarFiltros}>Limpiar filtros</button>}<button type="button" aria-label="Actualizar historial" title="Actualizar historial" disabled={cargando || procesando} onClick={() => void cargar(sedeFiltro, true)}><DashboardIcon name="refresh" /></button></div>
        {errorFechas && <p className={styles.error} role="alert">{errorFechas}</p>}
        <div className={styles.tableScroll} role="region" aria-label="Tabla de gastos de cartera" tabIndex={0}>
          <table className={styles.table}><thead><tr><th scope="col">ID</th><th scope="col">Fecha / Hora</th><th scope="col">Valor</th><th scope="col">Observación</th><th scope="col">Sede</th><th scope="col">Acciones</th></tr></thead><tbody>
            {cargando ? <tr><td colSpan={6} className={styles.tableState}><DashboardIcon name="refresh" /><p role="status">Cargando gastos de cartera…</p></td></tr>
              : initError || errorCarga ? <tr><td colSpan={6} className={styles.tableState}><DashboardIcon name="warning" /><p role="alert">{initError || errorCarga}</p>{!initError && <button type="button" className={styles.button} onClick={() => void cargar(sedeFiltro, true)}>Reintentar</button>}</td></tr>
                : itemsFiltrados.length === 0 ? <tr><td colSpan={6} className={styles.tableState}><DashboardIcon name="document" /><p>No hay gastos de cartera para los filtros seleccionados.</p>{filtroActivo && <button type="button" className={styles.button} onClick={limpiarFiltros}>Limpiar filtros</button>}</td></tr>
                  : paginacion.items.map((item) => { const date = carteraColombiaDate(item.createdAt); return <tr key={item.id}>
                    <td className={styles.id}>#{item.id}</td><td className={styles.date} title={item.createdAt}><span>{date.date}</span><span>{date.time}</span></td><td className={styles.money}>{formatCarteraMoney(item.valor)}</td><td className={styles.observation}>{item.observacion ?? "Sin observación"}</td><td><span className={styles.sedeBadge}>{item.sede?.nombre ?? `Sede ${item.sedeId}`}</span></td><td><div className={styles.actions}>
                      {esAdmin ? <><button type="button" className={styles.iconButton} disabled={procesando} aria-label={`Editar gasto #${item.id}`} title="Editar gasto" onClick={() => abrirEdicion(item)}><HistoryActionIcon name="edit" /></button>{puedeEliminar && <button type="button" className={`${styles.iconButton} ${styles.delete}`} disabled={procesando} aria-label={`Eliminar gasto #${item.id}`} title="Eliminar gasto" onClick={() => void eliminarGasto(item.id)}><HistoryActionIcon name="trash" /></button>}</> : <span className={styles.readOnly}>Solo consulta</span>}
                    </div></td>
                  </tr>; })}
          </tbody></table>
        </div>
        <footer className={styles.pagination}><div className={styles.resultCount}><label><span className={styles.srOnly}>Filas por página</span><select id="cartera-filas" value={filas} onChange={(event) => { setFilas(Number(event.target.value)); setPagina(1); }}><option value={10}>10 por página</option><option value={5}>5 por página</option></select></label><span aria-live="polite">{unavailable ? "—" : `Mostrando ${paginacion.from}–${paginacion.to} de ${paginacion.total.toLocaleString("es-CO")}`}</span></div>
          <nav className={styles.pageNumbers} aria-label="Paginación de gastos"><button type="button" className={styles.button} disabled={unavailable || paginacion.page === 1} onClick={() => setPagina(paginacion.page - 1)}>Anterior</button>{carteraHistoryPageNumbers(paginacion.page, paginacion.pages).map((page, index) => page === "…" ? <span key={`gap-${index}`} className={styles.ellipsis}>…</span> : <button type="button" key={page} className={`${styles.pageButton} ${page === paginacion.page ? styles.pageActive : ""}`} disabled={unavailable} aria-current={page === paginacion.page ? "page" : undefined} aria-label={`Página ${page}`} onClick={() => setPagina(page)}>{page}</button>)}<button type="button" className={styles.button} disabled={unavailable || paginacion.page === paginacion.pages} onClick={() => setPagina(paginacion.page + 1)}>Siguiente</button></nav>
        </footer>
      </section>
    </main>
    {esAdmin && editandoId !== null && <div className={styles.backdrop}><div ref={modal} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="cartera-edit-title">
      <header className={styles.modalHeader}><div><span>Gastos de cartera</span><h2 id="cartera-edit-title">Editar gasto #{editandoId}</h2></div><button type="button" className={styles.iconButton} aria-label="Cerrar edición" disabled={procesando} onClick={cerrarEdicion}><DashboardIcon name="close" /></button></header>
      <form onSubmit={(event) => void guardarEdicion(event)} aria-busy={procesando}><fieldset className={styles.editFields} disabled={procesando}>
        <label htmlFor="cartera-edit-sede">Sede<select id="cartera-edit-sede" value={sedeEditando} onChange={(event) => setSedeEditando(event.target.value)} required><option value="">Seleccionar sede</option>{sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}</select></label>
        <label htmlFor="cartera-edit-valor">Valor<input id="cartera-edit-valor" type="number" step="any" value={valorEditando} onChange={(event) => setValorEditando(event.target.value)} required /></label>
        <label className={styles.editObservation} htmlFor="cartera-edit-observacion">Observación<textarea id="cartera-edit-observacion" value={observacionEditando} onChange={(event) => setObservacionEditando(event.target.value)} rows={4} /></label>
      </fieldset>{errorEdicion && <p className={styles.error} role="alert">{errorEdicion}</p>}<footer className={styles.modalFooter}><button type="button" className={styles.button} disabled={procesando} onClick={cerrarEdicion}>Cancelar</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={procesando}>{procesando ? "Guardando…" : "Guardar cambios"}</button></footer></form>
    </div></div>}
  </div>;
}
