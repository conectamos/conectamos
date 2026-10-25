"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./debt-payments.module.css";

type DeudaItem = {
  id: number; prestamoId: number; imei: string; referencia: string; valor: number;
  sedeOrigenId: number; sedeOrigenNombre: string; sedeDestinoId: number; sedeDestinoNombre: string;
  fechaSolicitudPago: string; estado: string; puedeAprobar: boolean;
};
type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolId: number; rolNombre: string };
type Sede = { id: number; nombre: string };
type PagoPendienteLote = { key: string; origen: string; destino: string; fecha: string; total: number; items: DeudaItem[]; ultimoTiempo: number | null };
const PAGE_SIZE = 10;
function formatoPesos(valor: number) { return `$ ${Number(valor || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`; }
function formatoFecha(valor: string) {
  if (!valor || Number.isNaN(new Date(valor).getTime())) return "—";
  return new Date(valor).toLocaleString("es-CO", { timeZone: "America/Bogota" });
}
function tiempoSolicitudPago(fecha: string | null | undefined) {
  if (!fecha) return null;
  const fechaPago = new Date(fecha);
  return Number.isNaN(fechaPago.getTime()) ? null : fechaPago.getTime();
}
function imeisResumenLote(items: DeudaItem[]) {
  const visibles = items.slice(0, 10).map(item => item.imei);
  return { visibles, restantes: Math.max(items.length - visibles.length, 0) };
}
function paginasVisibles(pagina: number, total: number) {
  return [...new Set([1, pagina - 1, pagina, pagina + 1, total])].filter(value => value >= 1 && value <= total).sort((a, b) => a - b);
}
function MetricCard({ icon, label, value, detail }: { icon: DashboardIconName; label: string; value: string; detail: string }) {
  return <article className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name={icon} /></span><div style={{ "--value-length": value.length } as CSSProperties}><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>;
}
function Pagination({ pagina, total, registros, noun, disabled, onChange }: {
  pagina: number; total: number; registros: number; noun: string; disabled: boolean; onChange: (value: number) => void;
}) {
  const paginas = paginasVisibles(pagina, total);
  return <div className={styles.pagination}><div><span>10 por página</span><span aria-live="polite">{disabled ? "—" : registros ? `Mostrando ${(pagina - 1) * PAGE_SIZE + 1}–${Math.min(pagina * PAGE_SIZE, registros)} de ${registros.toLocaleString("es-CO")} ${noun}` : `0 ${noun}`}</span></div><nav aria-label={`Paginación de ${noun}`}><button type="button" aria-label="Anterior" disabled={disabled || pagina <= 1} onClick={() => onChange(pagina - 1)}><DashboardIcon name="chevron" className={styles.previousIcon} /><span>Anterior</span></button>{paginas.map((value, index) => <span key={value} className={styles.pageSlot}>{index > 0 && value - paginas[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${value}`} aria-current={pagina === value ? "page" : undefined} disabled={disabled} onClick={() => onChange(value)}>{value}</button></span>)}<button type="button" aria-label="Siguiente" disabled={disabled || pagina >= total} onClick={() => onChange(pagina + 1)}><span>Siguiente</span><DashboardIcon name="chevron" className={styles.nextIcon} /></button></nav></div>;
}

export default function DeudaSedesPage() {
  const [items, setItems] = useState<DeudaItem[]>([]);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [lotesDetalleAbiertos, setLotesDetalleAbiertos] = useState<string[]>([]);
  const [cargandoListado, setCargandoListado] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [errorSesion, setErrorSesion] = useState("");
  const [errorSedes, setErrorSedes] = useState("");
  const [consultaCargada, setConsultaCargada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [paginaLotes, setPaginaLotes] = useState(1);
  const [vistaActiva, setVistaActiva] = useState<"solicitudes" | "lotes">("solicitudes");
  const operacionEnCurso = useRef(false);
  const sessionRequest = useRef(0);
  const sedesRequest = useRef(0);
  const cargaRequest = useRef(0);
  const cargaAbort = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const mensajeEsError = mensaje.trim().toUpperCase().startsWith("ERROR");
  const consultaScope = !user ? "" : `${user.id}:${esAdmin ? sedeFiltroId : user.sedeId}`;
  const disponible = Boolean(user) && consultaCargada === consultaScope && !errorCarga && !errorSesion;
  const cargandoVista = cargandoListado || cargandoSesion;

  const cargarUsuario = useCallback(async () => {
    const requestId = ++sessionRequest.current;
    setCargandoSesion(true); setErrorSesion("");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (requestId !== sessionRequest.current) return null;
      if (!response.ok || !data || !Number.isInteger(data.id) || data.id <= 0) throw new Error(data?.error || "No se pudo cargar la sesión.");
      setUser(data);
      return data as SessionUser;
    } catch (cause) {
      if (requestId === sessionRequest.current) { setUser(null); setErrorSesion(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo cargar la sesión."); }
      return null;
    } finally { if (requestId === sessionRequest.current) setCargandoSesion(false); }
  }, []);
  const cargarSedes = useCallback(async () => {
    const requestId = ++sedesRequest.current; setErrorSedes("");
    try {
      const response = await fetch("/api/sedes", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (requestId !== sedesRequest.current) return;
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || "No se pudo cargar el catálogo de sedes.");
      setSedes(data);
    } catch (cause) { if (requestId === sedesRequest.current) setErrorSedes(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo cargar el catálogo de sedes."); }
  }, []);
  const iniciar = useCallback(async () => {
    const session = await cargarUsuario();
    if (session && ["ADMIN", "AUDITOR"].includes(session.rolNombre.toUpperCase())) await cargarSedes();
  }, [cargarSedes, cargarUsuario]);
  const cargar = useCallback(async () => {
    if (!user) return;
    const requestId = ++cargaRequest.current;
    cargaAbort.current?.abort();
    const controller = new AbortController(); cargaAbort.current = controller;
    setCargandoListado(true); setErrorCarga("");
    try {
      const params = new URLSearchParams();
      if (esAdmin && sedeFiltroId !== "TODAS") params.set("sedeId", sedeFiltroId);
      const endpoint = params.size ? `/api/dashboard/deuda-sedes?${params.toString()}` : "/api/dashboard/deuda-sedes";
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (requestId !== cargaRequest.current || controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(data?.items) || typeof data.totalPendiente !== "number" || !Number.isFinite(data.totalPendiente)) throw new Error(data?.error || "No se pudieron consultar los pagos pendientes.");
      setItems(data.items); setTotalPendiente(data.totalPendiente); setConsultaCargada(consultaScope);
    } catch (cause) {
      if (requestId === cargaRequest.current && !controller.signal.aborted) { setConsultaCargada(""); setErrorCarga(cause instanceof Error && cause.name === "Error" ? cause.message : "Error cargando los pagos pendientes."); }
    } finally { if (requestId === cargaRequest.current) setCargandoListado(false); }
  }, [consultaScope, esAdmin, sedeFiltroId, user]);
  useEffect(() => { void iniciar(); return () => { sessionRequest.current += 1; sedesRequest.current += 1; }; }, [iniciar]);
  useEffect(() => { if (!user) return; void cargar(); return () => { cargaRequest.current += 1; cargaAbort.current?.abort(); }; }, [cargar, user]);
  useLiveRefresh(cargar, { enabled: Boolean(user) && !cargando, intervalMs: 10000 });
  const sedeFiltroNombre = useMemo(() => !esAdmin ? user?.sedeNombre || "Tu sede" : sedeFiltroId === "TODAS" ? "Todas las sedes" : sedes.find(sede => String(sede.id) === sedeFiltroId)?.nombre || "Sede seleccionada", [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const aprobarPago = async (item: DeudaItem) => {
    const actual = items.find(candidate => candidate.id === item.id && candidate.prestamoId === item.prestamoId);
    if (cargando || cargandoListado || operacionEnCurso.current || !disponible || !actual?.puedeAprobar) return;
    operacionEnCurso.current = true;
    try {
      const confirmado = window.confirm(`Confirmas aprobar el pago del IMEI ${actual.imei} por ${formatoPesos(actual.valor)}?`);
      if (!confirmado) return;
      setCargando(true); setMensaje("");
      const response = await fetch("/api/prestamos/aprobar-pago", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prestamoId: actual.prestamoId }) });
      const data = await response.json();
      if (!response.ok) { setMensaje(`Error: ${data.error || "Error aprobando pago"}`); return; }
      setMensaje("Pago aprobado correctamente"); await cargar();
    } catch { setMensaje("Error aprobando pago"); }
    finally { operacionEnCurso.current = false; setCargando(false); }
  };
  const aprobarPagoLote = async (lote: PagoPendienteLote) => {
    const actual = lotesPagoPendiente.find(candidate => candidate.key === lote.key);
    if (cargando || cargandoListado || operacionEnCurso.current || !disponible || !actual || !actual.items.length || !actual.items.every(item => item.puedeAprobar)) return;
    operacionEnCurso.current = true;
    try {
      const confirmado = window.confirm(`Confirmas aprobar ${actual.items.length} pago(s) de ${actual.destino} por ${formatoPesos(actual.total)}?`);
      if (!confirmado) return;
      setCargando(true); setMensaje("");
      const response = await fetch("/api/prestamos/aprobar-pago-lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prestamoIds: actual.items.map(item => item.prestamoId) }) });
      const data = await response.json();
      if (!response.ok) { setMensaje(`Error: ${data.error || "Error aprobando lote"}`); return; }
      setMensaje(data.mensaje || "Pago por lote aprobado correctamente"); await cargar();
    } catch { setMensaje("Error aprobando lote"); }
    finally { operacionEnCurso.current = false; setCargando(false); }
  };
  const alternarDetalleLote = (key: string) => { setLotesDetalleAbiertos(actuales => actuales.includes(key) ? actuales.filter(item => item !== key) : [...actuales, key]); };

  const totalSolicitudes = items.length;
  const promedioPendiente = useMemo(() => {
    if (!items.length) {
      return 0;
    }

    return totalPendiente / items.length;
  }, [items, totalPendiente]);

  const lotesPagoPendiente = useMemo(() => {
    const ventanaLoteMs = 5 * 60 * 1000;
    const lotes: PagoPendienteLote[] = [];

    items
      .filter((item) => item.puedeAprobar)
      .sort((a, b) => {
        const tiempoA = tiempoSolicitudPago(a.fechaSolicitudPago) ?? 0;
        const tiempoB = tiempoSolicitudPago(b.fechaSolicitudPago) ?? 0;

        return tiempoA - tiempoB || a.prestamoId - b.prestamoId;
      })
      .forEach((item) => {
        const tiempo = tiempoSolicitudPago(item.fechaSolicitudPago);
        const loteActual = [...lotes].reverse().find((lote) => {
          const primerItem = lote.items[0];

          if (
            !primerItem ||
            primerItem.sedeOrigenId !== item.sedeOrigenId ||
            primerItem.sedeDestinoId !== item.sedeDestinoId
          ) {
            return false;
          }

          if (lote.ultimoTiempo === null || tiempo === null) {
            return lote.ultimoTiempo === tiempo;
          }

          return Math.abs(tiempo - lote.ultimoTiempo) <= ventanaLoteMs;
        });

        if (loteActual) {
          loteActual.items.push(item);
          loteActual.total += Number(item.valor || 0);
          loteActual.ultimoTiempo = tiempo ?? loteActual.ultimoTiempo;
          loteActual.key = loteActual.items
            .map((loteItem) => loteItem.prestamoId)
            .join("-");
          return;
        }

        lotes.push({
          key: String(item.prestamoId),
          origen: item.sedeOrigenNombre,
          destino: item.sedeDestinoNombre,
          fecha: item.fechaSolicitudPago,
          total: Number(item.valor || 0),
          items: [item],
          ultimoTiempo: tiempo,
        });
      });

    return lotes.sort((a, b) => b.total - a.total);
  }, [items]);

  const idsEnLotesMultiples = useMemo(
    () =>
      new Set(
        lotesPagoPendiente
          .filter((lote) => lote.items.length > 1)
          .flatMap((lote) => lote.items.map((item) => item.id))
      ),
    [lotesPagoPendiente]
  );


  const totalPaginas = disponible ? Math.max(1, Math.ceil(items.length / PAGE_SIZE)) : 1;
  const paginaActual = Math.min(pagina, totalPaginas);
  const itemsPaginados = items.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);
  const totalPaginasLotes = disponible ? Math.max(1, Math.ceil(lotesPagoPendiente.length / PAGE_SIZE)) : 1;
  const paginaLotesActual = Math.min(paginaLotes, totalPaginasLotes);
  const lotesPaginados = lotesPagoPendiente.slice((paginaLotesActual - 1) * PAGE_SIZE, paginaLotesActual * PAGE_SIZE);
  const verLote = (item: DeudaItem) => {
    const index = lotesPagoPendiente.findIndex(lote => lote.items.some(candidate => candidate.id === item.id));
    if (index < 0) return;
    const key = lotesPagoPendiente[index].key;
    setVistaActiva("lotes"); setPaginaLotes(Math.floor(index / PAGE_SIZE) + 1);
    setLotesDetalleAbiertos(actuales => actuales.includes(key) ? actuales : [...actuales, key]);
    panelRef.current?.scrollIntoView({ block: "start" });
  };
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" }, { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/dashboard/deuda-sedes", icon: "transfer", label: "Deuda entre sedes" }, { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "CIERRE" }, { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
  ];
  const secundarios = navigationItems.filter(item => ["/cierre", "/dashboard/aprobaciones", "/dashboard/reportes"].includes(item.href));
  const principales = navigationItems.filter(item => !secundarios.includes(item));
  const enlace = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/dashboard/deuda-sedes" ? styles.navActive : ""}`} aria-current={item.href === "/dashboard/deuda-sedes" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{principales.map(enlace)}<div className={styles.extraNavigation}>{secundarios.map(enlace)}</div><details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secundarios.map(enlace)}</div></details></nav>
      <SalesProfile name={user?.nombre || user?.usuario || (cargandoSesion ? "Cargando usuario" : "Usuario")} role={user?.rolNombre || "Sesión por verificar"} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="arrow" /><span>Deuda entre sedes</span></nav><h1>Pagos pendientes por aprobar</h1><p>Solicitudes de pago entre sedes, con su origen, destino e importe.</p></div><button type="button" className={styles.button} disabled={cargandoVista || cargando} onClick={() => void (user ? cargar() : iniciar())}><DashboardIcon name="refresh" />{cargandoVista ? "Actualizando…" : "Actualizar"}</button></div>
      {(errorSesion || errorCarga) && <div className={styles.notice} role="alert"><DashboardIcon name="warning" /><span>{errorSesion || errorCarga}</span><button type="button" disabled={cargandoVista || cargando} onClick={() => void (user ? cargar() : iniciar())}>Reintentar</button></div>}
      {mensaje && <div className={`${styles.notice} ${!mensajeEsError ? styles.success : ""}`} role={mensajeEsError ? "alert" : "status"}><DashboardIcon name={mensajeEsError ? "warning" : "approvals"} /><span>{mensaje}</span></div>}
      <section className={styles.summary} aria-label="Resumen de pagos pendientes" aria-busy={cargandoVista}>
        <MetricCard icon="cash" label="Total pendiente" value={disponible ? formatoPesos(totalPendiente) : "—"} detail="Capital pendiente por aprobar" />
        <MetricCard icon="approvals" label="Solicitudes activas" value={disponible ? totalSolicitudes.toLocaleString("es-CO") : "—"} detail="Movimientos en la cobertura consultada" />
        <MetricCard icon="trend" label="Promedio por solicitud" value={disponible ? formatoPesos(promedioPendiente) : "—"} detail="Total pendiente dividido entre solicitudes" />
      </section>
      <section ref={panelRef} className={styles.panel} aria-labelledby="pending-payments-title">
        <div className={styles.panelHeader}><div className={styles.sectionTitle}><span className={styles.sectionIcon}><DashboardIcon name="approvals" /></span><div><h2 id="pending-payments-title">Movimientos listos para aprobar</h2><p>{user ? sedeFiltroNombre : "Cobertura por verificar"}</p></div></div><span className={styles.resultCount}>{disponible ? `${totalSolicitudes.toLocaleString("es-CO")} registro${totalSolicitudes === 1 ? "" : "s"}` : cargandoVista ? "Cargando…" : "Sin datos cargados"}</span></div>
        <div className={styles.controls}><div className={styles.viewButtons} aria-label="Vista de solicitudes"><button type="button" aria-pressed={vistaActiva === "solicitudes"} onClick={() => setVistaActiva("solicitudes")}>Solicitudes <span>{disponible ? totalSolicitudes.toLocaleString("es-CO") : "—"}</span></button><button type="button" aria-pressed={vistaActiva === "lotes"} onClick={() => setVistaActiva("lotes")}>Lotes para aprobar <span>{disponible ? lotesPagoPendiente.length.toLocaleString("es-CO") : "—"}</span></button></div><label className={styles.coverage}>Cobertura por sede{esAdmin ? <select value={sedeFiltroId} disabled={cargando} onChange={event => { setSedeFiltroId(event.target.value); setPagina(1); setPaginaLotes(1); setLotesDetalleAbiertos([]); }}><option value="TODAS">Todas las sedes</option>{sedes.map(sede => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select> : <span className={styles.scope}><DashboardIcon name="store" />{user?.sedeNombre || (cargandoSesion ? "Cargando sede…" : "Sin sede cargada")}</span>}</label></div>
        {errorSedes && <div className={styles.catalogError} role="alert"><span>{errorSedes}</span><button type="button" onClick={() => void cargarSedes()}>Reintentar sedes</button></div>}
        {!disponible ? <div className={styles.empty} role="status"><DashboardIcon name={cargandoVista ? "refresh" : "warning"} /><strong>{cargandoVista ? "Cargando pagos pendientes…" : "No se pudieron cargar los pagos"}</strong><p>{cargandoVista ? "Consultando solicitudes en tu cobertura." : "Reintenta la consulta para ver los movimientos."}</p></div> : items.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}><DashboardIcon name="approvals" /></span><h3>No hay pagos pendientes por aprobar</h3><p>No se encontraron solicitudes pendientes para {sedeFiltroNombre}.</p><button type="button" className={styles.button} disabled={cargandoVista} onClick={() => void cargar()}><DashboardIcon name="refresh" />Actualizar solicitudes</button></div> : vistaActiva === "solicitudes" ? <>
          <div className={styles.tableScroller} tabIndex={0} aria-label="Solicitudes de pago"><table className={styles.table}><thead><tr><th scope="col">Préstamo</th><th scope="col">IMEI</th><th scope="col">Referencia</th><th scope="col">Valor</th><th scope="col">Sede origen</th><th scope="col">Sede destino</th><th scope="col">Solicitado</th><th scope="col">Acción</th></tr></thead><tbody>{itemsPaginados.map(item => <tr key={item.id}><td className={styles.id}>#{item.prestamoId}</td><td className={styles.imei}>{item.imei}</td><td className={styles.reference}>{item.referencia}</td><td className={styles.money}>{formatoPesos(item.valor)}</td><td><span className={styles.sedeBadge}>{item.sedeOrigenNombre}</span></td><td><span className={styles.sedeBadge}>{item.sedeDestinoNombre}</span></td><td className={styles.date}>{formatoFecha(item.fechaSolicitudPago)}</td><td>{item.puedeAprobar && idsEnLotesMultiples.has(item.id) ? <button type="button" className={styles.rowSecondary} onClick={() => verLote(item)}>Aprobar desde lote<DashboardIcon name="arrow" /></button> : item.puedeAprobar ? <button type="button" className={styles.rowPrimary} disabled={cargando || cargandoListado} onClick={() => void aprobarPago(item)}>{cargando ? "Procesando…" : "Aprobar pago"}</button> : <span className={styles.waiting}>En espera</span>}</td></tr>)}</tbody></table></div>
          <Pagination pagina={paginaActual} total={totalPaginas} registros={items.length} noun="solicitudes" disabled={!disponible || cargando} onChange={setPagina} />
        </> : <>
          <div className={styles.lotSummary}><span>{lotesPagoPendiente.length.toLocaleString("es-CO")} lotes disponibles según tus permisos</span><span>Total en lotes <strong>{formatoPesos(lotesPagoPendiente.reduce((acc, lote) => acc + lote.total, 0))}</strong></span></div>
          {lotesPagoPendiente.length === 0 ? <div className={styles.empty}><DashboardIcon name="lock" /><h3>No tienes lotes disponibles para aprobar</h3><p>Las solicitudes de tu cobertura continúan disponibles en la vista Solicitudes.</p></div> : <div className={styles.lots}>{lotesPaginados.map(lote => { const detalleAbierto = lotesDetalleAbiertos.includes(lote.key); const resumenImeis = imeisResumenLote(lote.items); return <article key={lote.key} className={styles.lot}>
            <div className={styles.lotHeader}><div className={styles.paymentRoute}><div><span>Paga</span><strong>{lote.destino}</strong></div><DashboardIcon name="arrow" /><div><span>Recibe</span><strong>{lote.origen}</strong></div></div><div className={styles.lotValue}><span>Valor a recibir</span><strong>{formatoPesos(lote.total)}</strong></div></div>
            <div className={styles.lotMeta}><span>{lote.items.length} equipo{lote.items.length === 1 ? "" : "s"}</span><span>Solicitado: {formatoFecha(lote.fecha)}</span></div>
            <div className={styles.imeiPreview} aria-label="Resumen de IMEI">{resumenImeis.visibles.map((imei, index) => <span key={`${imei}-${index}`}>{imei}</span>)}{resumenImeis.restantes > 0 && <span className={styles.moreImeis}>+{resumenImeis.restantes} más en el detalle</span>}</div>
            <div className={styles.lotActions}><button type="button" className={styles.button} aria-expanded={detalleAbierto} aria-controls={`debt-lot-${lote.key}`} onClick={() => alternarDetalleLote(lote.key)}><DashboardIcon name="document-search" />{detalleAbierto ? "Ocultar detalle" : "Ver detalle"}</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={cargando || cargandoListado} onClick={() => void aprobarPagoLote(lote)}><DashboardIcon name="approvals" />{cargando ? "Procesando…" : "Aprobar lote"}</button></div>
            {detalleAbierto && <div id={`debt-lot-${lote.key}`} className={styles.lotDetail} tabIndex={0} aria-label={`Detalle del lote ${lote.key}`}><table className={styles.detailTable}><thead><tr><th scope="col">Préstamo</th><th scope="col">IMEI</th><th scope="col">Referencia</th><th scope="col">Valor</th></tr></thead><tbody>{lote.items.map(item => <tr key={item.id}><td>#{item.prestamoId}</td><td className={styles.imei}>{item.imei}</td><td>{item.referencia}</td><td className={styles.money}>{formatoPesos(item.valor)}</td></tr>)}</tbody></table></div>}
          </article>; })}</div>}
          <Pagination pagina={paginaLotesActual} total={totalPaginasLotes} registros={lotesPagoPendiente.length} noun="lotes" disabled={!disponible || cargando} onChange={setPaginaLotes} />
        </>}
        {disponible && items.length === 0 && <div className={styles.zeroFooter}>0 resultados</div>}
      </section>
      <div className={styles.liveStatus} role="status"><DashboardIcon name="refresh" /><span>{cargando ? "Procesando aprobación…" : cargandoListado && disponible ? "Actualizando solicitudes…" : "Actualización automática cada 10 segundos"}</span><span><DashboardIcon name="store" />{user ? sedeFiltroNombre : "Cobertura por verificar"}</span></div>
    </main>
  </div>;
}
