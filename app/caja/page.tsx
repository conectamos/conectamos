"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./cash.module.css";

type CajaMovimiento = {
  id: number;
  tipo: string;
  concepto: string;
  valor: number;
  descripcion: string | null;
  sedeId: number;
  createdAt: string;
  editable: boolean;
  sede?: { nombre: string };
};
type CajaResponse = {
  movimientos: CajaMovimiento[];
  resumen: { totalIngresos: number; totalEgresos: number; saldo: number; totalMovimientos: number };
  ultimoMovimiento: CajaMovimiento | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolNombre: string };
type Sede = { id: number; nombre: string };

function formatoPesos(value: number | string) {
  const amount = Number(value || 0);
  return `${amount < 0 ? "-" : ""}$ ${Math.abs(amount).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
}
function formatoFecha(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}
function describirPeriodo(desde: string, hasta: string) {
  const format = (value: string) => value.split("-").reverse().join("/");
  if (desde && hasta) return desde === hasta ? format(desde) : `${format(desde)} al ${format(hasta)}`;
  if (desde) return `Desde ${format(desde)}`;
  if (hasta) return `Hasta ${format(hasta)}`;
  return "Todo el historial";
}
function paginasVisibles(page: number, total: number) {
  return [...new Set([1, page - 1, page, page + 1, total])].filter((item) => item > 0 && item <= total).sort((a, b) => a - b);
}
function EditIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" /></svg>;
}
function DirectionIcon({ down = false }: { down?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={down ? "M6 6 18 18M8 18h10V8" : "M6 18 18 6M8 6h10v10"} /></svg>;
}
function CashAmount({ value, ready, negative = false }: { value: number; ready: boolean; negative?: boolean }) {
  const formatted = formatoPesos(value);
  return <strong className={`${styles.metricMoney} ${negative ? styles.negativeBalance : ""}`} style={{ "--money-length": formatted.length } as CSSProperties}>{ready ? formatted : "—"}</strong>;
}

export default function CajaPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<CajaResponse | null>(null);
  const [cargandoCaja, setCargandoCaja] = useState(true);
  const [errorCaja, setErrorCaja] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [editandoMovimiento, setEditandoMovimiento] = useState<CajaMovimiento | null>(null);
  const [tipoEdicion, setTipoEdicion] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [conceptoEdicion, setConceptoEdicion] = useState("");
  const [valorEdicion, setValorEdicion] = useState("");
  const [descripcionEdicion, setDescripcionEdicion] = useState("");
  const [sedeEdicionId, setSedeEdicionId] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const requestController = useRef<AbortController | null>(null);
  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const periodoInvalido = Boolean(fechaDesde && fechaHasta && fechaDesde > fechaHasta);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/session", { cache: "no-store", signal: controller.signal });
        const session = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok) { setErrorCaja(session.error || "No se pudo cargar la sesión"); setCargandoCaja(false); return; }
        setUser(session);
        const sedesRes = await fetch("/api/sedes", { cache: "no-store", signal: controller.signal });
        const lista = await sedesRes.json();
        if (!controller.signal.aborted && sedesRes.ok) setSedes(Array.isArray(lista) ? lista : []);
      } catch {
        if (!controller.signal.aborted) { setErrorCaja("No se pudo cargar la sesión o las sedes"); setCargandoCaja(false); }
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (busqueda.trim() !== busquedaAplicada) {
        setCargandoCaja(true);
        setBusquedaAplicada(busqueda.trim());
        setPage(1);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [busqueda, busquedaAplicada]);

  const construirParametrosCaja = useCallback(() => {
    const params = new URLSearchParams();
    if (esAdmin && sedeFiltroId !== "TODAS") params.set("sedeId", sedeFiltroId);
    if (fechaDesde) params.set("fechaDesde", fechaDesde);
    if (fechaHasta) params.set("fechaHasta", fechaHasta);
    if (busquedaAplicada) params.set("q", busquedaAplicada);
    return params;
  }, [esAdmin, sedeFiltroId, fechaDesde, fechaHasta, busquedaAplicada]);

  const cargarCaja = useCallback(async () => {
    if (!user) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setCargandoCaja(true);
    setErrorCaja("");
    try {
      if (periodoInvalido) { setData(null); setErrorCaja("La fecha inicial no puede ser mayor que la fecha final"); return; }
      const params = construirParametrosCaja();
      params.set("paginated", "1");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/caja?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const result = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) { setData(null); setErrorCaja(result.error || "Error cargando caja"); return; }
      setData(result);
      if (result.page !== page) setPage(result.page);
    } catch {
      if (!controller.signal.aborted) { setData(null); setErrorCaja("Error cargando caja"); }
    } finally {
      if (!controller.signal.aborted) setCargandoCaja(false);
    }
  }, [user, periodoInvalido, construirParametrosCaja, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => void cargarCaja(), 0);
    return () => { window.clearTimeout(timer); requestController.current?.abort(); };
  }, [cargarCaja]);
  useLiveRefresh(cargarCaja, { enabled: Boolean(user), intervalMs: 30000 });

  const cancelarEdicion = () => {
    setEditandoMovimiento(null); setTipoEdicion("INGRESO"); setConceptoEdicion("");
    setValorEdicion(""); setDescripcionEdicion(""); setSedeEdicionId("");
  };
  const iniciarEdicion = (movimiento: CajaMovimiento) => {
    if (!esAdmin || !movimiento.editable) return;
    setEditandoMovimiento(movimiento);
    setTipoEdicion(movimiento.tipo.toUpperCase() === "EGRESO" ? "EGRESO" : "INGRESO");
    setConceptoEdicion(movimiento.concepto || "");
    setValorEdicion(String(movimiento.valor || 0));
    setDescripcionEdicion(movimiento.descripcion || "");
    setSedeEdicionId(String(movimiento.sedeId || ""));
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const guardarEdicion = async () => {
    if (!editandoMovimiento || !esAdmin) return;
    try {
      setGuardandoEdicion(true); setMensaje("");
      if (!conceptoEdicion.trim()) { setMensaje("Debes ingresar el concepto"); return; }
      if (!valorEdicion || !Number.isFinite(Number(valorEdicion)) || Number(valorEdicion) <= 0) { setMensaje("Debes ingresar un valor mayor a 0"); return; }
      if (!sedeEdicionId || Number(sedeEdicionId) <= 0) { setMensaje("Debes seleccionar la sede"); return; }
      const res = await fetch(`/api/caja?id=${editandoMovimiento.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoEdicion, concepto: conceptoEdicion, valor: Number(valorEdicion), descripcion: descripcionEdicion, sedeId: Number(sedeEdicionId) }),
      });
      const result = await res.json();
      if (!res.ok) { setMensaje(result.error || "No se pudo actualizar el movimiento"); return; }
      setMensaje(result.mensaje || "Movimiento actualizado correctamente");
      cancelarEdicion();
      await cargarCaja();
    } catch { setMensaje("Error actualizando movimiento"); }
    finally { setGuardandoEdicion(false); }
  };
  const exportarExcel = async () => {
    if (periodoInvalido) { setMensaje("La fecha inicial no puede ser mayor que la fecha final"); return; }
    try {
      setExportandoExcel(true); setMensaje("");
      const params = construirParametrosCaja();
      const res = await fetch(`/api/caja/export?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) { const result = await res.json(); setMensaje(result.error || "No se pudo exportar el Excel"); return; }
      const url = window.URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "movimientos-caja.xlsx";
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch { setMensaje("Error exportando el Excel de caja"); }
    finally { setExportandoExcel(false); }
  };

  const cobertura = !esAdmin ? user?.sedeNombre || "Sede actual" : sedeFiltroId === "TODAS" ? "Todas las sedes" : sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre || "Sede seleccionada";
  const listo = !cargandoCaja && !errorCaja && data;
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const ultimo = data?.ultimoMovimiento;
  const navigationItems: { href: string; icon: DashboardIconName; label: string }[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" }, { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" }, { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings" as const, label: "Configuración" }] : []),
  ];
  const resetPage = () => { setCargandoCaja(true); setPage(1); setMensaje(""); };

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS · Inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map((item) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/caja" ? styles.navActive : ""}`} aria-current={item.href === "/caja" ? "page" : undefined}>{item.label}</Link>)}</nav>
      <SalesProfile name={user?.nombre || user?.usuario || "Cargando usuario"} role={user?.rolNombre || "Sesión activa"} />
    </header>
    <main className={styles.main}>
      <header className={styles.heading}>
        <div><h1>{esAdmin ? "Caja consolidada" : "Caja de la sede"}</h1><p>Control de ingresos, egresos y saldo operativo</p></div>
        <div className={styles.headingActions}><Link href="/caja/gestion" className={`${styles.button} ${styles.primary}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>Registrar movimiento</Link><Link href="/caja/arqueo" className={styles.button}><DashboardIcon name="cash" />Arqueo</Link></div>
      </header>

      <section className={styles.summary} aria-label={`Resumen de caja de ${cobertura}`} aria-busy={cargandoCaja}>
        <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.incomeIcon}`}><DirectionIcon /></span><div><p>Ingresos</p><CashAmount value={data?.resumen.totalIngresos ?? 0} ready={Boolean(listo)} /></div></article>
        <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.expenseIcon}`}><DirectionIcon down /></span><div><p>Egresos</p><CashAmount value={data?.resumen.totalEgresos ?? 0} ready={Boolean(listo)} /></div></article>
        <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.balanceIcon}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 8h12M6 15h12" /></svg></span><div><p>Saldo</p><CashAmount value={data?.resumen.saldo ?? 0} ready={Boolean(listo)} negative={(data?.resumen.saldo ?? 0) < 0} /></div></article>
        <article className={`${styles.metric} ${styles.lastMetric}`}><span className={styles.metricIcon}><DashboardIcon name="clock" /></span><div><p>Último movimiento</p><strong>{listo ? ultimo?.concepto || "Sin registros" : "—"}</strong>{listo && ultimo && <time dateTime={ultimo.createdAt}>{formatoFecha(ultimo.createdAt)}</time>}</div></article>
      </section>

      <section className={styles.filtersPanel} aria-label="Filtros de caja">
        <div className={styles.filters}>
          <label>Cobertura{esAdmin ? <select value={sedeFiltroId} onChange={(event) => { resetPage(); setSedeFiltroId(event.target.value); }}><option value="TODAS">Todas las sedes</option>{sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select> : <span className={styles.fixedCoverage}>{cobertura}</span>}</label>
          <label>Desde<input type="date" value={fechaDesde} onInput={(event) => { if (event.currentTarget.value !== fechaDesde) { resetPage(); setFechaDesde(event.currentTarget.value); } }} onChange={(event) => { if (event.target.value !== fechaDesde) { resetPage(); setFechaDesde(event.target.value); } }} /></label>
          <label>Hasta<input type="date" value={fechaHasta} onInput={(event) => { if (event.currentTarget.value !== fechaHasta) { resetPage(); setFechaHasta(event.currentTarget.value); } }} onChange={(event) => { if (event.target.value !== fechaHasta) { resetPage(); setFechaHasta(event.target.value); } }} /></label>
          <button type="button" className={styles.button} onClick={() => { if (!fechaDesde && !fechaHasta) return; resetPage(); setFechaDesde(""); setFechaHasta(""); }}>Limpiar periodo</button>
          <div className={styles.exportAction}><button type="button" className={styles.button} disabled={!user || cargandoCaja || Boolean(errorCaja) || exportandoExcel || busqueda.trim() !== busquedaAplicada} onClick={() => void exportarExcel()}><DashboardIcon name="download" />{exportandoExcel ? "Exportando..." : "Exportar Excel"}</button></div>
        </div>
        <p className={styles.period}><strong>{describirPeriodo(fechaDesde, fechaHasta)}</strong><span> · {listo ? `${total.toLocaleString("es-CO")} movimientos` : cargandoCaja ? "Actualizando movimientos..." : "Consulta no disponible"}</span>{busquedaAplicada && <span> · Búsqueda: {busquedaAplicada}</span>}</p>
      </section>

      {mensaje && <p className={styles.notice} role="status">{mensaje}</p>}
      {esAdmin && editandoMovimiento && <section className={styles.editPanel} aria-label={`Editar movimiento ${editandoMovimiento.id}`}>
        <div className={styles.editHeading}><div><h2>Editar movimiento #{editandoMovimiento.id}</h2><p>Ajusta el ingreso o egreso manual registrado por la sede.</p></div><button type="button" className={styles.button} disabled={guardandoEdicion} onClick={cancelarEdicion}>Cancelar</button></div>
        <form onSubmit={(event) => { event.preventDefault(); void guardarEdicion(); }}>
          <div className={styles.editFields}>
            <label>Tipo<select value={tipoEdicion} onChange={(event) => setTipoEdicion(event.target.value as "INGRESO" | "EGRESO")}><option value="INGRESO">INGRESO</option><option value="EGRESO">EGRESO</option></select></label>
            <label>Sede<select value={sedeEdicionId} onChange={(event) => setSedeEdicionId(event.target.value)}><option value="">Seleccionar sede</option>{sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select></label>
            <label>Concepto<input value={conceptoEdicion} onChange={(event) => setConceptoEdicion(event.target.value)} /></label>
            <label>Valor ($)<input type="number" step="any" inputMode="decimal" value={valorEdicion} onChange={(event) => setValorEdicion(event.target.value)} /></label>
            <label>Descripción<input value={descripcionEdicion} onChange={(event) => setDescripcionEdicion(event.target.value)} placeholder="Detalle opcional" /></label>
          </div><div className={styles.editFooter}><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={guardandoEdicion}>{guardandoEdicion ? "Guardando..." : "Guardar cambios"}</button></div>
        </form>
      </section>}

      <section className={styles.panel} aria-label="Movimientos de caja" aria-busy={cargandoCaja}>
        <header className={styles.panelHeading}><div><h2>Movimientos de caja</h2><p>Historial de ingresos y egresos dentro de la cobertura actual.</p></div><label className={styles.search}><DashboardIcon name="search" /><input aria-label="Buscar movimiento" placeholder="Buscar movimiento" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} />{busqueda && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda("")}><DashboardIcon name="close" /></button>}</label></header>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Tabla de movimientos, desplazamiento horizontal">
          <table className={styles.table}><caption className={styles.srOnly}>Movimientos de caja de {cobertura} · {describirPeriodo(fechaDesde, fechaHasta)}</caption><colgroup><col className={styles.idCol} /><col className={styles.typeCol} /><col className={styles.conceptCol} /><col className={styles.valueCol} /><col className={styles.descriptionCol} /><col className={styles.siteCol} /><col className={styles.dateCol} /><col className={styles.actionsCol} /></colgroup>
            <thead><tr>{["ID", "Tipo", "Concepto", "Valor", "Descripción", "Sede", "Fecha", "Acciones"].map((label) => <th key={label} scope="col" className={label === "Valor" ? styles.moneyCell : undefined}>{label}</th>)}</tr></thead>
            <tbody>{cargandoCaja ? <tr><td colSpan={8} className={styles.state}><span className={styles.spinner} />Cargando movimientos de caja...</td></tr> : errorCaja ? <tr><td colSpan={8} className={styles.state}><div role="alert"><strong>{errorCaja}</strong><button type="button" className={styles.button} onClick={() => void cargarCaja()}>Reintentar</button></div></td></tr> : !data?.movimientos.length ? <tr><td colSpan={8} className={styles.state}><strong>No hay movimientos para esta consulta</strong><p>Revisa la cobertura, el periodo o la búsqueda.</p></td></tr> : data.movimientos.map((item) => {
              const ingreso = item.tipo.toUpperCase() === "INGRESO";
              return <tr key={item.id}><td className={styles.identifier}>#{item.id}</td><td><span className={`${styles.typeBadge} ${ingreso ? styles.incomeBadge : styles.expenseBadge}`}>{item.tipo}</span></td><td className={styles.concept}>{item.concepto}</td><td className={`${styles.moneyCell} ${ingreso ? styles.income : styles.expense}`}>{formatoPesos(item.valor)}</td><td className={styles.description}>{item.descripcion || "—"}</td><td><span className={styles.siteBadge}>{item.sede?.nombre || "Sede sin configurar"}</span></td><td className={styles.date}><time dateTime={item.createdAt}>{formatoFecha(item.createdAt)}</time></td><td>{esAdmin ? item.editable ? <button type="button" className={styles.editButton} onClick={() => iniciarEdicion(item)}><EditIcon />Editar</button> : <span className={styles.protected}>Protegido</span> : <span className={styles.protected}>—</span>}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <footer className={styles.footer}><p role="status">{cargandoCaja ? "Cargando resultados..." : errorCaja ? "Consulta no disponible" : `Mostrando ${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} de ${total.toLocaleString("es-CO")} movimientos`}</p><label className={styles.rowsPerPage}>Filas por página<select value={pageSize} onChange={(event) => { resetPage(); setPageSize(Number(event.target.value)); }}>{[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><nav className={styles.pagination} aria-label="Paginación de movimientos"><button type="button" aria-label="Página anterior" disabled={page <= 1 || !listo} onClick={() => { setCargandoCaja(true); setPage((value) => value - 1); }}><DashboardIcon name="chevron" className={styles.previous} /></button>{paginasVisibles(page, totalPages).map((number, index, pages) => <span className={styles.pageSlot} key={number}>{index > 0 && number > pages[index - 1] + 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${number}`} aria-current={number === page ? "page" : undefined} className={number === page ? styles.currentPage : undefined} disabled={!listo} onClick={() => { if (number === page) return; setCargandoCaja(true); setPage(number); }}>{number}</button></span>)}<button type="button" aria-label="Página siguiente" disabled={page >= totalPages || !listo} onClick={() => { setCargandoCaja(true); setPage((value) => value + 1); }}><DashboardIcon name="chevron" className={styles.next} /></button></nav></footer>
      </section>
    </main>
  </div>;
}
