"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./alerts.module.css";

type Prestamo = {
  id: number; imei: string; referencia: string; color: string | null; costo: number;
  sedeOrigenId: number; sedeDestinoId: number; sedeOrigenNombre?: string; sedeDestinoNombre?: string; estado: string;
};
type SessionUser = {
  id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolId: number; rolNombre: string;
};
type Sede = { id: number; nombre: string };
const PAGE_SIZE = 10;

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function MetricCard({ icon, label, value, detail, tone = "neutral" }: {
  icon: DashboardIconName; label: string; value: string; detail: string; tone?: "neutral" | "warning" | "success";
}) {
  return <article className={styles.metric} data-tone={tone}><span className={styles.metricIcon}><DashboardIcon name={icon} /></span><div style={{ "--value-length": value.length } as CSSProperties}><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>;
}

function paginasVisibles(pagina: number, total: number) {
  return [...new Set([1, pagina - 1, pagina, pagina + 1, total])].filter(value => value >= 1 && value <= total).sort((a, b) => a - b);
}

export default function AlertasPrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [errorSesion, setErrorSesion] = useState("");
  const [errorSedes, setErrorSedes] = useState("");
  const [consultaCargada, setConsultaCargada] = useState("");
  const usuarioRequest = useRef(0);
  const sedesRequest = useRef(0);
  const alertasRequest = useRef(0);
  const alertasAbort = useRef<AbortController | null>(null);
  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const consultaScope = !user ? "" : esAdmin ? `admin:${user.id}:${sedeFiltroId}` : `sede:${user.id}:${user.sedeId}`;

  const cargarUsuario = useCallback(async () => {
    const requestId = ++usuarioRequest.current;
    setCargandoSesion(true);
    setErrorSesion("");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (requestId !== usuarioRequest.current) return null;
      if (!response.ok || !data || !Number.isInteger(data.id) || data.id <= 0) throw new Error(data?.error || "No se pudo cargar la sesión.");
      setUser(data);
      return data as SessionUser;
    } catch (error) {
      if (requestId === usuarioRequest.current) {
        setUser(null);
        setErrorSesion(error instanceof Error && error.name === "Error" ? error.message : "No se pudo cargar la sesión.");
      }
      return null;
    } finally {
      if (requestId === usuarioRequest.current) setCargandoSesion(false);
    }
  }, []);

  const cargarSedes = useCallback(async () => {
    const requestId = ++sedesRequest.current;
    setErrorSedes("");
    try {
      const response = await fetch("/api/sedes", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (requestId !== sedesRequest.current) return;
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || "No se pudo cargar el catálogo de sedes.");
      setSedes(data);
    } catch (error) {
      if (requestId === sedesRequest.current) setErrorSedes(error instanceof Error && error.name === "Error" ? error.message : "No se pudo cargar el catálogo de sedes.");
    }
  }, []);

  const iniciar = useCallback(async () => {
    const session = await cargarUsuario();
    if (session && ["ADMIN", "AUDITOR"].includes(session.rolNombre.toUpperCase())) await cargarSedes();
  }, [cargarUsuario, cargarSedes]);

  const cargar = useCallback(async () => {
    if (!user) return;
    const requestId = ++alertasRequest.current;
    alertasAbort.current?.abort();
    const controller = new AbortController();
    alertasAbort.current = controller;
    setCargando(true);
    setMensaje("");
    try {
      const params = new URLSearchParams();
      if (esAdmin && sedeFiltroId !== "TODAS") params.set("sedeId", sedeFiltroId);
      const endpoint = params.size ? `/api/alertas/prestamos?${params.toString()}` : "/api/alertas/prestamos";
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (requestId !== alertasRequest.current) return;
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || "No se pudieron consultar las alertas. Intenta nuevamente.");
      setPrestamos(data);
      setConsultaCargada(consultaScope);
    } catch (error) {
      if (requestId === alertasRequest.current && !controller.signal.aborted) {
        setConsultaCargada("");
        setMensaje(error instanceof Error && error.name === "Error" ? error.message : "Error cargando alertas");
      }
    } finally {
      if (requestId === alertasRequest.current) setCargando(false);
    }
  }, [consultaScope, esAdmin, sedeFiltroId, user]);

  useEffect(() => {
    void iniciar();
    return () => { usuarioRequest.current += 1; sedesRequest.current += 1; };
  }, [iniciar]);

  useEffect(() => {
    if (!user) return;
    void cargar();
    return () => { alertasRequest.current += 1; alertasAbort.current?.abort(); };
  }, [cargar, user]);

  useLiveRefresh(cargar, { enabled: Boolean(user), intervalMs: 12000 });

  const sedeFiltroNombre = useMemo(() => {
    if (!esAdmin) return user?.sedeNombre || "Tu sede";
    if (sedeFiltroId === "TODAS") return "Todas las sedes";
    return sedes.find(sede => String(sede.id) === sedeFiltroId)?.nombre || "Sede seleccionada";
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const prestamosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) {
      return prestamos;
    }

    return prestamos.filter((prestamo) =>
      [
        prestamo.imei,
        prestamo.referencia,
        prestamo.color,
        prestamo.sedeOrigenNombre,
        prestamo.sedeDestinoNombre,
        prestamo.estado,
      ]
        .map((valor) => String(valor || "").toLowerCase())
        .some((valor) => valor.includes(termino))
    );
  }, [busqueda, prestamos]);

  const totalCosto = useMemo(
    () => prestamos.reduce((acc, item) => acc + Number(item.costo || 0), 0),
    [prestamos]
  );
  const disponible = Boolean(user) && consultaCargada === consultaScope && !errorSesion && !mensaje;
  const cargandoVista = cargandoSesion || cargando;
  const resultados = prestamosFiltrados.length;
  const totalPaginas = disponible ? Math.max(1, Math.ceil(resultados / PAGE_SIZE)) : 1;
  const paginaActual = Math.min(pagina, totalPaginas);
  const filas = prestamosFiltrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);
  const paginas = paginasVisibles(paginaActual, totalPaginas);
  const hayFiltros = Boolean(busqueda) || esAdmin && sedeFiltroId !== "TODAS";
  const limpiarFiltros = () => { setBusqueda(""); setSedeFiltroId("TODAS"); setPagina(1); };
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings", label: "Configuración" } satisfies NavigationItem] : []),
  ];
  const secundarios = navigationItems.filter(item => ["/cierre", "/dashboard/reportes", "/dashboard/analitico", "/dashboard/sedes"].includes(item.href));
  const principales = navigationItems.filter(item => !secundarios.includes(item));
  const enlace = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/prestamos" ? styles.navActive : ""}`} aria-current={item.href === "/prestamos" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{principales.map(enlace)}<div className={styles.extraNavigation}>{secundarios.map(enlace)}</div><details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secundarios.map(enlace)}</div></details></nav>
      <SalesProfile name={user?.nombre || user?.usuario || (cargandoSesion ? "Cargando usuario" : "Usuario")} role={user?.rolNombre || "Sesión por verificar"} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}>
        <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/prestamos">Préstamos</Link><DashboardIcon name="arrow" /><span>Alertas</span></nav><h1>Alertas de préstamos</h1><p>Seguimiento de equipos abiertos y pagos entre sedes.</p></div>
        <div className={styles.headingActions}><button type="button" className={styles.button} disabled={cargandoVista} onClick={() => void (user ? cargar() : iniciar())}><DashboardIcon name="refresh" />{cargandoVista ? "Actualizando…" : "Actualizar"}</button><Link href="/prestamos" className={`${styles.button} ${styles.primary}`}><DashboardIcon name="loans" />Ver préstamos</Link></div>
      </div>

      {(errorSesion || mensaje) && <div className={styles.notice} role="alert"><DashboardIcon name="warning" /><span>{errorSesion || mensaje}</span><button type="button" disabled={cargandoVista} onClick={() => void (user ? cargar() : iniciar())}>Reintentar</button></div>}

      <section className={styles.summary} aria-label="Resumen de alertas" aria-busy={cargandoVista}>
        <MetricCard icon="warning" label="Alertas activas" value={disponible ? prestamos.length.toLocaleString("es-CO") : "—"} detail="Préstamos abiertos en la cobertura consultada" />
        <MetricCard icon="cash" label="Valor comprometido" value={disponible ? formatoPesos(totalCosto) : "—"} detail="Costo total de los equipos en seguimiento" tone={disponible && prestamos.length > 0 ? "warning" : "neutral"} />
        <MetricCard icon={disponible && prestamos.length === 0 ? "shield" : "bell"} label="Estado general" value={!disponible ? "—" : prestamos.length > 0 ? "ATENCIÓN" : "ESTABLE"} detail={!disponible ? cargandoVista ? "Consultando alertas…" : "Consulta no disponible" : prestamos.length > 0 ? "Hay seguimiento pendiente en esta cobertura" : "No hay alertas activas en esta cobertura"} tone={!disponible ? "neutral" : prestamos.length > 0 ? "warning" : "success"} />
      </section>

      <section className={styles.panel} aria-labelledby="loan-alerts-title">
        <div className={styles.panelHeader}><div className={styles.sectionTitle}><span className={styles.sectionIcon}><DashboardIcon name="loans" /></span><div><h2 id="loan-alerts-title">Préstamos pendientes</h2><p>{user ? sedeFiltroNombre : cargandoSesion ? "Cargando cobertura…" : "Sin cobertura cargada"}</p></div></div><span className={styles.resultCount} aria-live="polite">{disponible ? `${resultados.toLocaleString("es-CO")} resultado${resultados === 1 ? "" : "s"}` : cargandoVista ? "Cargando…" : "Sin datos cargados"}</span></div>
        <div className={styles.filters}>
          <label className={styles.searchField}>Buscar equipo<div><DashboardIcon name="search" /><input type="search" value={busqueda} placeholder="IMEI, referencia, color, sede o estado" onChange={event => { setBusqueda(event.target.value); setPagina(1); }} /></div></label>
          <label className={styles.sedeField}>Cobertura por sede{esAdmin ? <select value={sedeFiltroId} onChange={event => { setSedeFiltroId(event.target.value); setPagina(1); }}><option value="TODAS">Todas las sedes</option>{sedes.map(sede => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select> : <div className={styles.scope}><DashboardIcon name="store" /><span>{user?.sedeNombre || (cargandoSesion ? "Cargando sede…" : "Sin sede cargada")}</span></div>}</label>
          {hayFiltros && <button type="button" className={styles.clearFilters} onClick={limpiarFiltros}><DashboardIcon name="close" />Limpiar filtros</button>}
        </div>
        {errorSedes && <div className={styles.catalogError} role="alert"><span>{errorSedes}</span><button type="button" onClick={() => void cargarSedes()}>Reintentar sedes</button></div>}
        <div className={styles.listStatus}><span><DashboardIcon name="shield" />Seguimiento por sede de origen o destino</span>{cargando && disponible && <span role="status">Actualizando alertas…</span>}</div>
        <div className={styles.tableScroller} tabIndex={0} aria-label="Listado de préstamos pendientes">
          <table className={`${styles.table} ${!disponible || filas.length === 0 ? styles.tableEmpty : ""}`}>
            <thead><tr><th scope="col">ID</th><th scope="col">Equipo / IMEI</th><th scope="col">Costo</th><th scope="col">Sede origen</th><th scope="col">Sede destino</th><th scope="col">Estado</th></tr></thead>
            <tbody>{!disponible ? <tr><td colSpan={6}><div className={styles.empty} role="status"><DashboardIcon name={cargandoVista ? "refresh" : "warning"} /><strong>{cargandoVista ? "Cargando alertas…" : "No se pudieron cargar las alertas"}</strong><p>{cargandoVista ? "Consultando los préstamos de tu cobertura." : "Actualiza para volver a consultar."}</p></div></td></tr> : filas.length === 0 ? <tr><td colSpan={6}><div className={styles.empty}><DashboardIcon name={hayFiltros ? "search" : "approvals"} /><strong>{hayFiltros ? "Sin resultados para estos filtros" : "No hay alertas activas"}</strong><p>{hayFiltros ? "Prueba otra búsqueda o ajusta la cobertura." : "No se encontraron préstamos abiertos en esta cobertura."}</p></div></td></tr> : filas.map(item => <tr key={item.id}>
              <td className={styles.id}>#{item.id}</td>
              <td><div className={styles.equipment}><span className={styles.deviceIcon}><DashboardIcon name="inventory" /></span><div><strong>{item.referencia}</strong><p className={styles.imei}>IMEI: {item.imei}</p>{item.color && <p className={styles.color}>{item.color}</p>}</div></div></td>
              <td className={styles.money}>{formatoPesos(item.costo)}</td>
              <td><span className={styles.sedeBadge}>{item.sedeOrigenNombre ?? "Sede sin configurar"}</span></td>
              <td><span className={styles.sedeBadge}>{item.sedeDestinoNombre ?? "Sede sin configurar"}</span></td>
              <td><span className={`${styles.state} ${item.estado === "PAGO_PENDIENTE_APROBACION" ? styles.paymentPending : ""}`} title={item.estado}>{item.estado === "APROBADO" ? "Aprobado" : item.estado === "PAGO_PENDIENTE_APROBACION" ? "Pago por aprobar" : item.estado}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className={styles.pagination}><div><span className={styles.pageSize}>10 por página</span><span aria-live="polite">{disponible ? resultados ? `Mostrando ${(paginaActual - 1) * PAGE_SIZE + 1}–${Math.min(paginaActual * PAGE_SIZE, resultados)} de ${resultados.toLocaleString("es-CO")}` : "0 resultados" : "—"}</span></div><nav aria-label="Paginación de alertas"><button type="button" aria-label="Anterior" disabled={!disponible || paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}><DashboardIcon name="chevron" className={styles.previousIcon} /><span>Anterior</span></button>{paginas.map((value, index) => <span key={value} className={styles.pageSlot}>{index > 0 && value - paginas[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${value}`} aria-current={value === paginaActual ? "page" : undefined} disabled={!disponible} onClick={() => setPagina(value)}>{value}</button></span>)}<button type="button" aria-label="Siguiente" disabled={!disponible || paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}><span>Siguiente</span><DashboardIcon name="chevron" className={styles.nextIcon} /></button></nav></div>
      </section>
    </main>
  </div>;
}
