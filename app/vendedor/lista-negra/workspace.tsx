"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./blacklist.module.css";

type SessionProps = { perfilNombre: string; sedeNombre: string };
type ListaNegraItem = {
  createdAt: string; documentoNumero: string; financieraDeuda: string | null; id: number;
  motivo: string | null; reportadoPorNombre: string | null; sedeNombre: string | null;
  tipoObservacion: "PRESTA_NOMBRE"; updatedAt: string;
};
type PageMetadata = { page: number; pageSize: number; total: number; totalPages: number };
type SummaryMetadata = { totalRegistros: number; sedesAfectadas: number };
type NavigationItem = { href: string; label: string; icon: DashboardIconName };
const PAGE_SIZE = 10;
function onlyDigits(value: string, maxLength = 15) { return value.replace(/\D/g, "").slice(0, maxLength); }
function documentoValido(value: string) { return /^\d{5,15}$/.test(value); }
function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value || "Sin fecha"; }
}
function paginasVisibles(page: number, total: number) { return [...new Set([1, page - 1, page, page + 1, total])].filter(value => value >= 1 && value <= total).sort((a, b) => a - b); }
function SummaryMetric({ icon, label, value }: { icon: DashboardIconName; label: string; value: string }) {
  return <article className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name={icon} /></span><div style={{ "--value-length": value.length } as CSSProperties}><p>{label}</p><strong>{value}</strong></div></article>;
}

export default function ListaNegraWorkspace({ puedeAdministrar, session }: { puedeAdministrar: boolean; session: SessionProps }) {
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [registros, setRegistros] = useState<ListaNegraItem[]>([]);
  const [pagination, setPagination] = useState<PageMetadata>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<SummaryMetadata>({ totalRegistros: 0, sedesAfectadas: 0 });
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editDocumentoNumero, setEditDocumentoNumero] = useState("");
  const [editMotivo, setEditMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [errorCarga, setErrorCarga] = useState("");
  const [consultaCargada, setConsultaCargada] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const requestId = useRef(0);
  const readAbort = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);
  const consultaScope = `${pagina}:${busqueda}`;
  const disponible = consultaCargada === consultaScope && !errorCarga;
  const operando = guardando || actualizandoId !== null || eliminandoId !== null;

  const cargarLista = useCallback(async () => {
    const currentRequest = ++requestId.current;
    readAbort.current?.abort();
    const controller = new AbortController(); readAbort.current = controller;
    setCargando(true); setErrorCarga("");
    try {
      const params = new URLSearchParams({ paginated: "1", page: String(pagina), pageSize: String(PAGE_SIZE), search: busqueda });
      const res = await fetch(`/api/vendedor/lista-negra?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (currentRequest !== requestId.current || controller.signal.aborted) return;
      const validCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
      if (!res.ok || !Array.isArray(data?.registros) || data.registros.length > PAGE_SIZE || data.pagination?.pageSize !== PAGE_SIZE || !validCount(data.pagination?.total) || !validCount(data.pagination?.totalPages) || data.pagination.totalPages < 1 || !validCount(data.pagination?.page) || data.pagination.page < 1 || !validCount(data.summary?.totalRegistros) || !validCount(data.summary?.sedesAfectadas)) throw new Error(data?.error || "No se pudo cargar la lista negra.");
      setRegistros(data.registros); setPagination(data.pagination); setSummary(data.summary); setConsultaCargada(consultaScope);
    } catch (cause) {
      if (currentRequest === requestId.current && !controller.signal.aborted) { setConsultaCargada(""); setErrorCarga(cause instanceof Error && cause.name === "Error" ? cause.message : "Error cargando la lista negra."); }
    } finally { if (currentRequest === requestId.current) setCargando(false); }
  }, [busqueda, consultaScope, pagina]);
  useEffect(() => { void cargarLista(); return () => { requestId.current += 1; readAbort.current?.abort(); }; }, [cargarLista]);

  const guardar = async () => {
    if (mutationLock.current) return;
    if (!documentoValido(documentoNumero)) { setMensajeTipo("error"); setMensaje("Escribe una cédula de 5 a 15 dígitos."); return; }
    mutationLock.current = true;
    setGuardando(true); setMensaje("");
    try {
      const res = await fetch("/api/vendedor/lista-negra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentoNumero, motivo }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || "No se pudo guardar la cédula.");
      setMensajeTipo("success"); setMensaje(data.mensaje || "Cédula agregada a lista negra"); setDocumentoNumero(""); setMotivo("");
      await cargarLista();
    } catch (cause) { setMensajeTipo("error"); setMensaje(cause instanceof Error && cause.name === "Error" ? cause.message : "Error guardando la cédula."); }
    finally { mutationLock.current = false; setGuardando(false); }
  };
  const iniciarEdicion = (item: ListaNegraItem) => {
    if (!puedeAdministrar || mutationLock.current) return;
    setEditandoId(item.id); setEditDocumentoNumero(item.documentoNumero); setEditMotivo(item.motivo ?? ""); setMensaje("");
  };
  const guardarEdicion = async (id: number) => {
    if (!puedeAdministrar || mutationLock.current || id !== editandoId) return;
    if (!documentoValido(editDocumentoNumero)) { setMensajeTipo("error"); setMensaje("Escribe una cédula de 5 a 15 dígitos."); return; }
    mutationLock.current = true; setActualizandoId(id); setMensaje("");
    try {
      const res = await fetch("/api/vendedor/lista-negra", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, documentoNumero: editDocumentoNumero, motivo: editMotivo }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || "No se pudo actualizar el registro.");
      setMensajeTipo("success"); setMensaje(data.mensaje || "Registro actualizado"); setEditandoId(null); await cargarLista();
    } catch (cause) { setMensajeTipo("error"); setMensaje(cause instanceof Error && cause.name === "Error" ? cause.message : "Error actualizando el registro."); }
    finally { mutationLock.current = false; setActualizandoId(null); }
  };
  const eliminarRegistro = async (id: number) => {
    if (!puedeAdministrar || mutationLock.current) return;
    if (!window.confirm("Este registro se ocultara de la lista negra activa. El historial interno se conserva.")) return;
    mutationLock.current = true; setEliminandoId(id); setMensaje("");
    try {
      const res = await fetch(`/api/vendedor/lista-negra?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || "No se pudo eliminar el registro.");
      setMensajeTipo("success"); setMensaje(data.mensaje || "Registro eliminado de lista negra"); setEditandoId(current => current === id ? null : current); await cargarLista();
    } catch (cause) { setMensajeTipo("error"); setMensaje(cause instanceof Error && cause.name === "Error" ? cause.message : "Error eliminando el registro."); }
    finally { mutationLock.current = false; setEliminandoId(null); }
  };

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
    { href: "/vendedor/registros/buscar", icon: "search", label: "Buscar registro" },
    { href: "/vendedor/lista-negra", icon: "warning", label: "Lista negra" },
    { href: "/vendedor/lista-precios", icon: "reports", label: "Lista de precios" },
    { href: "/dashboard/radar", icon: "inventory", label: "Radar" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
  ];
  const secundarios = navigationItems.filter(item => ["/vendedor/lista-precios", "/dashboard/radar", "/cierre"].includes(item.href));
  const principales = navigationItems.filter(item => !secundarios.includes(item));
  const enlace = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/vendedor/lista-negra" ? styles.navActive : ""}`} aria-current={item.href === "/vendedor/lista-negra" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;
  const paginas = paginasVisibles(pagination.page, pagination.totalPages);

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{principales.map(enlace)}<div className={styles.extraNavigation}>{secundarios.map(enlace)}</div><details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secundarios.map(enlace)}</div></details></nav>
      <SalesProfile name={session.perfilNombre} role={session.sedeNombre} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="arrow" /><span>Control comercial</span></nav><h1>Lista negra</h1><p>Consulta y registra reportes activos de todas las sedes.</p></div><Link href="/vendedor/registros" className={`${styles.button} ${styles.primary}`}><DashboardIcon name="sales" />Registrar venta</Link></div>
      <section className={styles.summary} aria-label="Resumen de lista negra" aria-busy={cargando}>
        <SummaryMetric icon="warning" label="Reportes activos" value={disponible ? summary.totalRegistros.toLocaleString("es-CO") : "—"} />
        <SummaryMetric icon="store" label="Sedes con reportes" value={disponible ? summary.sedesAfectadas.toLocaleString("es-CO") : "—"} />
        <SummaryMetric icon="search" label="Resultados visibles" value={disponible ? pagination.total.toLocaleString("es-CO") : "—"} />
      </section>
      {mensaje && <div className={styles.notice} data-tone={mensajeTipo} role={mensajeTipo === "error" ? "alert" : "status"}><DashboardIcon name={mensajeTipo === "error" ? "warning" : "approvals"} /><span>{mensaje}</span></div>}
      <div className={styles.workspace}>
        <section className={styles.formPanel} aria-labelledby="blacklist-create-title">
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="document-add" /></span><div><p>Nuevo reporte</p><h2 id="blacklist-create-title">Bloquear cédula</h2></div></div>
          <p className={styles.formDescription}>El reporte se aplica en todas las sedes.</p>
          <form onSubmit={event => { event.preventDefault(); void guardar(); }}>
            <label>Cédula<input type="text" inputMode="numeric" required minLength={5} maxLength={15} value={documentoNumero} disabled={operando} onChange={event => setDocumentoNumero(onlyDigits(event.target.value))} placeholder="Número de cédula" aria-describedby="blacklist-document-help" /><small id="blacklist-document-help">De 5 a 15 dígitos, sin puntos.</small></label>
            <label>Observación<span className={styles.reportType}>PRESTA NOMBRE</span><textarea value={motivo} disabled={operando} onChange={event => setMotivo(event.target.value)} placeholder="Motivo o detalle del reporte…" /></label>
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={operando || !documentoValido(documentoNumero)}><DashboardIcon name="shield" />{guardando ? "Guardando…" : "Guardar en lista negra"}</button>
          </form>
          <div className={styles.profileScope}><DashboardIcon name="store" /><span>Sede activa<strong>{session.sedeNombre}</strong></span></div>
        </section>
        <section className={styles.listPanel} aria-labelledby="blacklist-list-title" aria-busy={cargando}>
          <div className={styles.listHeader}><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="warning" /></span><div><h2 id="blacklist-list-title">Cédulas bloqueadas</h2><p>{puedeAdministrar ? "Edición administrativa habilitada" : "Reportes activos de todas las sedes"}</p></div></div><span className={styles.recordCount}>{disponible ? `${pagination.total.toLocaleString("es-CO")} registro${pagination.total === 1 ? "" : "s"}` : cargando ? "Cargando…" : "Sin datos cargados"}</span></div>
          <div className={styles.filters}><label>Buscar reporte<div><DashboardIcon name="search" /><input type="search" value={busqueda} disabled={operando} onChange={event => { setBusqueda(event.target.value); setPagina(1); }} placeholder="Cédula, sede, observación o asesor" /></div></label><button type="button" className={styles.button} disabled={cargando || operando} onClick={() => void cargarLista()}><DashboardIcon name="refresh" />{cargando ? "Actualizando…" : "Actualizar"}</button></div>
          {errorCarga && <div className={styles.loadError} role="alert"><span>{errorCarga}</span><button type="button" disabled={cargando || operando} onClick={() => void cargarLista()}>Reintentar</button></div>}
          <div className={styles.tableScroll} tabIndex={0} aria-label="Listado de cédulas bloqueadas">
            <table className={`${styles.table} ${!disponible || registros.length === 0 ? styles.tableEmpty : ""}`}><thead><tr><th scope="col">Cédula</th><th scope="col">Observación</th><th scope="col">Sede</th><th scope="col">Fecha</th>{puedeAdministrar && <th scope="col">Acciones</th>}</tr></thead>
              {!disponible || registros.length === 0 ? <tbody><tr><td colSpan={puedeAdministrar ? 5 : 4}><div className={styles.empty} role="status"><DashboardIcon name={cargando ? "refresh" : errorCarga ? "warning" : "search"} /><strong>{cargando ? "Cargando lista negra…" : errorCarga ? "No se pudo cargar la lista negra" : "No hay cédulas para esta búsqueda"}</strong><p>{errorCarga ? "Reintenta para consultar los registros actuales." : busqueda ? "Prueba con otra cédula, sede u observación." : "Los reportes activos aparecerán aquí."}</p></div></td></tr></tbody> : registros.map(item => <tbody key={item.id}>
                <tr><td className={styles.document}>{item.documentoNumero}</td><td><span className={styles.reportType}>PRESTA NOMBRE</span>{item.motivo && <p className={styles.observation}>{item.motivo}</p>}{item.reportadoPorNombre && <p className={styles.reporter}>Reportado por {item.reportadoPorNombre}</p>}</td><td><span className={styles.sedeBadge}>{item.sedeNombre || "Sin sede"}</span></td><td className={styles.date}>{formatDate(item.updatedAt)}</td>{puedeAdministrar && <td><div className={styles.rowActions}><button type="button" className={styles.rowButton} disabled={operando} onClick={() => iniciarEdicion(item)} aria-label={`Editar reporte de ${item.documentoNumero}`}><DashboardIcon name="document" />Editar</button><button type="button" className={`${styles.rowButton} ${styles.danger}`} disabled={operando} onClick={() => void eliminarRegistro(item.id)} aria-label={`Eliminar reporte de ${item.documentoNumero}`}><DashboardIcon name="close" />{eliminandoId === item.id ? "Eliminando…" : "Eliminar"}</button></div></td>}</tr>
                {puedeAdministrar && editandoId === item.id && <tr><td colSpan={5} className={styles.editRow}><form className={styles.editForm} aria-label={`Editar reporte de ${item.documentoNumero}`} onSubmit={event => { event.preventDefault(); void guardarEdicion(item.id); }}><label>Cédula a editar<input type="text" inputMode="numeric" required minLength={5} maxLength={15} value={editDocumentoNumero} disabled={operando} onChange={event => setEditDocumentoNumero(onlyDigits(event.target.value))} /></label><label>Observación a editar<textarea value={editMotivo} disabled={operando} onChange={event => setEditMotivo(event.target.value)} /></label><div><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={operando || !documentoValido(editDocumentoNumero)}>{actualizandoId === item.id ? "Guardando…" : "Guardar"}</button><button type="button" className={styles.button} disabled={operando} onClick={() => setEditandoId(null)}>Cancelar</button></div></form></td></tr>}
              </tbody>)}
            </table>
          </div>
          <div className={styles.pagination}><span>{disponible ? pagination.total ? `Mostrando ${(pagination.page - 1) * PAGE_SIZE + 1}–${Math.min(pagination.page * PAGE_SIZE, pagination.total)} de ${pagination.total.toLocaleString("es-CO")}` : "0 resultados" : "—"}</span><nav aria-label="Paginación de lista negra"><button type="button" aria-label="Anterior" disabled={!disponible || operando || pagination.page <= 1} onClick={() => setPagina(pagination.page - 1)}><DashboardIcon name="chevron" className={styles.previous} /><span>Anterior</span></button>{paginas.map((page, index) => <span key={page} className={styles.pageSlot}>{index > 0 && page - paginas[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${page}`} aria-current={page === pagination.page ? "page" : undefined} disabled={!disponible || operando} onClick={() => setPagina(page)}>{page}</button></span>)}<button type="button" aria-label="Siguiente" disabled={!disponible || operando || pagination.page >= pagination.totalPages} onClick={() => setPagina(pagination.page + 1)}><span>Siguiente</span><DashboardIcon name="chevron" className={styles.next} /></button></nav></div>
        </section>
      </div>
    </main>
  </div>;
}
