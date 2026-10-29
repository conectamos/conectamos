"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./equipo-comercial.module.css";

type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolId: number; rolNombre: string };
type OpcionCatalogo = { id: number; nombre: string; aplicaIntermediacion?: boolean; porcentajeIntermediacion?: number };
type CatalogoResponse = { jaladores: OpcionCatalogo[]; cerradores: OpcionCatalogo[]; financieras: OpcionCatalogo[] };
type TipoCatalogo = "JALADOR" | "CERRADOR" | "FINANCIERA";
type DeleteTarget = OpcionCatalogo & { tipo: TipoCatalogo };
const tipos: TipoCatalogo[] = ["JALADOR", "CERRADOR", "FINANCIERA"];
const tipoMeta: Record<TipoCatalogo, { titulo: string; singular: string; key: keyof CatalogoResponse; icon: DashboardIconName }> = {
  JALADOR: { titulo: "Jaladores", singular: "jalador", key: "jaladores", icon: "users" },
  CERRADOR: { titulo: "Cerradores", singular: "cerrador", key: "cerradores", icon: "user" },
  FINANCIERA: { titulo: "Financieras", singular: "financiera", key: "financieras", icon: "cash" },
};
const navigationItems: { href: string; label: string; icon: DashboardIconName }[] = [
  { href: "/dashboard", label: "Inicio", icon: "home" }, { href: "/ventas", label: "Ventas", icon: "sales" },
  { href: "/inventario", label: "Inventario", icon: "inventory" }, { href: "/prestamos", label: "Préstamos", icon: "loans" },
  { href: "/caja", label: "Caja", icon: "cash" }, { href: "/dashboard/aprobaciones", label: "Aprobaciones", icon: "approvals" },
  { href: "/dashboard/reportes", label: "Reportes", icon: "reports" }, { href: "/dashboard/sedes", label: "Configuración", icon: "settings" },
];
const normalizarBusqueda = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
function esCatalogo(value: unknown): value is CatalogoResponse {
  if (!value || typeof value !== "object") return false;
  return ["jaladores", "cerradores", "financieras"].every(key => {
    const items = (value as Record<string, unknown>)[key];
    return Array.isArray(items) && items.every(item => item && Number.isInteger(item.id) && item.id > 0 && typeof item.nombre === "string");
  });
}

function ConfirmarRetiro({ target, busy, error, onCancel, onConfirm }: {
  target: DeleteTarget; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    cancel.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="catalog-delete-title" aria-describedby="catalog-delete-description" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <header className={styles.dialogHeading}><span className={styles.iconBox}><DashboardIcon name="warning" /></span><div><p>Catálogo comercial</p><h2 id="catalog-delete-title">Eliminar {tipoMeta[target.tipo].singular}</h2></div><button type="button" className={styles.iconButton} aria-label="Cerrar confirmación" disabled={busy} onClick={onCancel}><DashboardIcon name="close" /></button></header>
    <div className={styles.dialogBody}><strong className={styles.targetName}>{target.nombre}</strong><p id="catalog-delete-description">Dejará de estar disponible para seleccionar en nuevas ventas y abonos. Los registros anteriores conservan su información.</p>{error && <p className={styles.error} role="alert">{error}</p>}</div>
    <footer className={styles.dialogFooter}><button ref={cancel} type="button" className={styles.button} disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={onConfirm}><DashboardIcon name={busy ? "refresh" : "close"} />{busy ? "Eliminando…" : "Eliminar del catálogo"}</button></footer>
  </dialog>;
}

export default function EquipoComercialPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoResponse>({ jaladores: [], cerradores: [], financieras: [] });
  const [tipo, setTipo] = useState<TipoCatalogo>("JALADOR");
  const [nombre, setNombre] = useState("");
  const [aplicaIntermediacion, setAplicaIntermediacion] = useState(false);
  const [porcentajeIntermediacion, setPorcentajeIntermediacion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loadError, setLoadError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Record<TipoCatalogo, number>>({ JALADOR: 1, CERRADOR: 1, FINANCIERA: 1 });
  const mutationLock = useRef(false);
  const loadSequence = useRef(0);
  const rolActual = user?.rolNombre?.trim().toUpperCase() || "";
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";
  const ocupado = guardando || eliminandoId !== null;

  const cargarTodo = useCallback(async () => {
    if (mutationLock.current) return;
    const sequence = ++loadSequence.current;
    setCargando(true); setLoadError("");
    try {
      const [resSession, resCatalogo] = await Promise.all([
        fetch("/api/session", { cache: "no-store" }), fetch("/api/ventas/catalogo-personal", { cache: "no-store" }),
      ]);
      const [sessionData, catalogoData] = await Promise.all([resSession.json(), resCatalogo.json()]);
      if (sequence !== loadSequence.current) return;
      if (!resSession.ok || typeof sessionData?.rolNombre !== "string") throw new Error("No se pudo validar la sesión. Actualiza la página o inicia sesión nuevamente.");
      setUser(sessionData);
      if (!resCatalogo.ok || !esCatalogo(catalogoData)) throw new Error(catalogoData?.error || "No se pudo cargar el catálogo comercial.");
      setCatalogo(catalogoData);
    } catch (error) {
      if (sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : "Error cargando el catálogo comercial.");
    } finally { if (sequence === loadSequence.current) setCargando(false); }
  }, []);
  useEffect(() => { void cargarTodo(); return () => { loadSequence.current += 1; }; }, [cargarTodo]);
  useEffect(() => { if (tipo !== "FINANCIERA") { setAplicaIntermediacion(false); setPorcentajeIntermediacion(""); } }, [tipo]);

  const agregarRegistro = async () => {
    if (mutationLock.current || !esAdmin || cargando || loadError) return;
    const nombreLimpio = nombre.trim();
    const porcentaje = Number(porcentajeIntermediacion.replace(",", ".") || 0);
    if (!nombreLimpio || (tipo === "FINANCIERA" && aplicaIntermediacion && (!Number.isFinite(porcentaje) || porcentaje <= 0))) {
      setMessageType("error"); setMensaje(!nombreLimpio ? "Debes ingresar un nombre." : "Define un porcentaje válido de intermediación."); return;
    }
    mutationLock.current = true; setGuardando(true); setMensaje("");
    try {
      const res = await fetch("/api/ventas/catalogo-personal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, nombre: nombreLimpio, aplicaIntermediacion: tipo === "FINANCIERA" ? aplicaIntermediacion : false, porcentajeIntermediacion: tipo === "FINANCIERA" && aplicaIntermediacion ? porcentaje : 0 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true || !esCatalogo(data.catalogo)) throw new Error(data?.error || "No se pudo confirmar el guardado. Conservamos los datos para reintentar.");
      setCatalogo(data.catalogo); setNombre(""); setAplicaIntermediacion(false); setPorcentajeIntermediacion("");
      setMessageType("success"); setMensaje(data.mensaje || "Registro agregado correctamente.");
    } catch (error) { setMessageType("error"); setMensaje(error instanceof Error ? error.message : "Error guardando el registro. Intenta nuevamente."); }
    finally { mutationLock.current = false; setGuardando(false); }
  };
  const eliminarRegistro = async (id: number) => {
    if (mutationLock.current || !puedeEliminar || !deleteTarget || deleteTarget.id !== id) return;
    mutationLock.current = true; setEliminandoId(id); setDeleteError(""); setMensaje("");
    try {
      const res = await fetch(`/api/ventas/catalogo-personal?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true || !esCatalogo(data.catalogo) || tipos.some(item => data.catalogo[tipoMeta[item].key].some((entry: OpcionCatalogo) => entry.id === id))) throw new Error(data?.error || "No se pudo confirmar la eliminación. Intenta nuevamente.");
      setCatalogo(data.catalogo); setDeleteTarget(null); setMessageType("success"); setMensaje(data.mensaje || "Registro eliminado del catálogo.");
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Error eliminando el registro. Intenta nuevamente."); }
    finally { mutationLock.current = false; setEliminandoId(null); }
  };

  const query = normalizarBusqueda(search);
  const filtered = Object.fromEntries(tipos.map(item => [tipoMeta[item].key, catalogo[tipoMeta[item].key].filter(entry => normalizarBusqueda(entry.nombre).includes(query))])) as CatalogoResponse;
  const total = tipos.reduce((sum, item) => sum + catalogo[tipoMeta[item].key].length, 0);
  const totalFiltrado = tipos.reduce((sum, item) => sum + filtered[tipoMeta[item].key].length, 0);
  const numero = (value: number) => value.toLocaleString("es-CO");
  const seccionCatalogo = (tipoActual: TipoCatalogo) => {
    const meta = tipoMeta[tipoActual]; const items = filtered[meta.key];
    const totalPages = Math.max(1, Math.ceil(items.length / 10)); const page = Math.min(pages[tipoActual], totalPages); const start = (page - 1) * 10;
    const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(value => value === 1 || value === totalPages || Math.abs(value - page) <= 1);
    return <section className={styles.catalogCard} key={tipoActual} aria-labelledby={`title-${tipoActual}`}>
      <header className={styles.cardHeading}><span className={styles.iconBox}><DashboardIcon name={meta.icon} /></span><div><h3 id={`title-${tipoActual}`}>{meta.titulo}</h3><p>{numero(catalogo[meta.key].length)} en el catálogo</p></div><span className={styles.count}>{numero(items.length)}</span></header>
      <div className={styles.columnHeading}><span>Nombre</span><span>{tipoActual === "FINANCIERA" ? "Intermediación / Acción" : "Acción"}</span></div>
      <ul className={styles.rows}>{items.slice(start, start + 10).map(item => <li key={item.id}>
        <strong>{item.nombre}</strong><div className={styles.rowActions}>{tipoActual === "FINANCIERA" && <span className={`${styles.financeBadge} ${item.aplicaIntermediacion ? styles.withFee : ""}`}>{item.aplicaIntermediacion ? `${Number(item.porcentajeIntermediacion || 0).toLocaleString("es-CO", { maximumFractionDigits: 6 })}%` : "Sin intermediación"}</span>}
          {puedeEliminar ? <button type="button" className={styles.deleteButton} disabled={ocupado} aria-label={`Eliminar ${meta.singular} ${item.nombre}`} onClick={() => { if (!mutationLock.current) { setDeleteTarget({ ...item, tipo: tipoActual }); setDeleteError(""); } }}><DashboardIcon name="close" /><span>Eliminar</span></button> : <span className={styles.readOnly}><DashboardIcon name="lock" /><span>Solo consulta</span></span>}
        </div></li>)}</ul>
      {!items.length && <div className={styles.empty}><DashboardIcon name={search ? "search" : meta.icon} /><strong>{search ? "Sin coincidencias" : "Sin registros"}</strong><p>{search ? "Prueba con otro nombre." : `Agrega un registro al catálogo de ${meta.titulo.toLowerCase()}.`}</p></div>}
      <footer className={styles.cardFooter}><span>{items.length ? `${start + 1}–${Math.min(start + 10, items.length)} de ${numero(items.length)}` : "0 resultados"}</span><nav aria-label={`Páginas de ${meta.titulo}`}><button type="button" aria-label={`Anterior en ${meta.titulo}`} disabled={page === 1} onClick={() => setPages(current => ({ ...current, [tipoActual]: page - 1 }))}><DashboardIcon name="chevron" /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${number} de ${meta.titulo}`} aria-current={number === page ? "page" : undefined} onClick={() => setPages(current => ({ ...current, [tipoActual]: number }))}>{number}</button></span>)}<button type="button" aria-label={`Siguiente en ${meta.titulo}`} disabled={page === totalPages} onClick={() => setPages(current => ({ ...current, [tipoActual]: page + 1 }))}><DashboardIcon name="chevron" /></button></nav></footer>
    </section>;
  };

  return <div className={styles.page}>
    <header className={styles.topbar}><Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, Inicio"><Image src="/branding/conectamos-logo.png" width={42} height={42} alt="" priority /><strong>CONECTAMOS</strong></Link>
      {esAdmin && <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map(item => <Link key={item.href} href={item.href} className={item.href === "/ventas" ? styles.activeNav : ""} aria-current={item.href === "/ventas" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}<Link href="/cierre"><DashboardIcon name="document" /><span>Cierre</span></Link></nav>}
      {user && <div className={styles.profileSlot}><SalesProfile name={user.nombre || user.usuario} role={user.rolNombre} /></div>}
    </header>
    <main className={styles.main}><div className={styles.breadcrumb}><Link href="/ventas">Ventas</Link><DashboardIcon name="chevron" /><span>Equipo comercial</span></div>
      <header className={styles.heading}><div><h1>Equipo comercial</h1><p>Jaladores, cerradores y financieras.</p></div><div className={styles.headingActions}><Link href="/ventas" className={styles.button}><DashboardIcon name="arrow" />Volver a ventas</Link>{esAdmin && <Link href="/ventas/nuevo" className={`${styles.button} ${styles.primary}`}><span aria-hidden="true" className={styles.plus}>+</span>Nueva venta</Link>}</div></header>
      {cargando ? <div className={styles.state} role="status"><DashboardIcon name="refresh" /><h2>Cargando equipo comercial…</h2><p>Consultando los catálogos.</p></div> : loadError ? <div className={styles.state} role="alert"><DashboardIcon name="warning" /><h2>No se pudo cargar el catálogo</h2><p>{loadError}</p><button type="button" className={styles.button} onClick={() => void cargarTodo()}><DashboardIcon name="refresh" />Reintentar</button></div> : !esAdmin ? <div className={styles.state}><DashboardIcon name="lock" /><h2>Acceso restringido</h2><p>Solo ADMIN y AUDITOR pueden gestionar el catálogo comercial.</p><Link href="/ventas" className={styles.button}>Volver a ventas</Link></div> : <>
        <section className={styles.metrics} aria-label="Resumen del catálogo">{[{ label: "Registros del catálogo", value: total, icon: "catalog" as const }, ...tipos.map(item => ({ label: tipoMeta[item].titulo, value: catalogo[tipoMeta[item].key].length, icon: tipoMeta[item].icon }))].map(item => <div key={item.label}><span><DashboardIcon name={item.icon} /></span><div><strong>{numero(item.value)}</strong><p>{item.label}</p></div></div>)}</section>
        {mensaje && <div className={`${styles.notice} ${messageType === "error" ? styles.noticeError : ""}`} role={messageType === "error" ? "alert" : "status"}><DashboardIcon name={messageType === "error" ? "warning" : "approvals"} /><span>{mensaje}</span><button type="button" className={styles.iconButton} aria-label="Cerrar mensaje" onClick={() => setMensaje("")}><DashboardIcon name="close" /></button></div>}
        <section className={styles.formCard} aria-labelledby="new-catalog-title"><header className={styles.formHeading}><span className={styles.iconBox}><DashboardIcon name="document-add" /></span><div><h2 id="new-catalog-title">Nuevo registro</h2><p>Disponible en los formularios de ventas y abonos.</p></div></header>
          <form onSubmit={event => { event.preventDefault(); void agregarRegistro(); }}><fieldset className={styles.formFields} disabled={ocupado}><legend className={styles.srOnly}>Datos del nuevo registro</legend>
            <label>Tipo de registro<select value={tipo} onChange={event => setTipo(event.target.value as TipoCatalogo)}><option value="JALADOR">Jalador</option><option value="CERRADOR">Cerrador</option><option value="FINANCIERA">Financiera</option></select></label>
            <label className={styles.nameField}>Nombre<input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder={`Nombre del ${tipo === "FINANCIERA" ? "registro financiero" : tipoMeta[tipo].singular}`} /></label>
            <button type="submit" className={`${styles.button} ${styles.primary}`}><DashboardIcon name={guardando ? "refresh" : "document-add"} />{guardando ? "Guardando…" : "Agregar registro"}</button>
            {tipo === "FINANCIERA" && <div className={styles.financeFields}><label className={styles.checkbox}><input type="checkbox" checked={aplicaIntermediacion} onChange={event => setAplicaIntermediacion(event.target.checked)} />Aplica intermediación</label><label>Porcentaje de intermediación<span className={styles.percentInput}><input required={aplicaIntermediacion} disabled={!aplicaIntermediacion} inputMode="decimal" value={porcentajeIntermediacion} placeholder="0" onChange={event => setPorcentajeIntermediacion(event.target.value.replace(/[^\d.,]/g, "").replace(/([.,].*?)[.,].*/g, "$1"))} /><span aria-hidden="true">%</span></span></label><p>Se conserva la regla de intermediación de cada financiera.</p></div>}
          </fieldset></form>
        </section>
        <section aria-labelledby="catalogs-title"><header className={styles.catalogsHeading}><div><h2 id="catalogs-title">Catálogos comerciales</h2><p>{numero(totalFiltrado)} {totalFiltrado === 1 ? "registro" : "registros"}{search && ` de ${numero(total)}`}</p></div><div className={styles.searchTools}><label className={styles.search}><DashboardIcon name="search" /><input aria-label="Buscar en los catálogos" value={search} onChange={event => { setSearch(event.target.value); setPages({ JALADOR: 1, CERRADOR: 1, FINANCIERA: 1 }); }} placeholder="Buscar nombre o financiera…" />{search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setSearch(""); setPages({ JALADOR: 1, CERRADOR: 1, FINANCIERA: 1 }); }}><DashboardIcon name="close" /></button>}</label><button type="button" className={styles.button} disabled={ocupado} onClick={() => void cargarTodo()}><DashboardIcon name="refresh" />Actualizar</button></div></header><div className={styles.catalogGrid}>{tipos.map(seccionCatalogo)}</div></section>
        <p className={styles.permissionNote}><DashboardIcon name="shield" />{puedeEliminar ? "Administración del catálogo · ADMIN" : "Puedes agregar registros. La eliminación está reservada a ADMIN."}</p>
      </>}
    </main>
    {deleteTarget && <ConfirmarRetiro key={deleteTarget.id} target={deleteTarget} busy={eliminandoId !== null} error={deleteError} onCancel={() => { if (!mutationLock.current) { setDeleteTarget(null); setDeleteError(""); } }} onConfirm={() => void eliminarRegistro(deleteTarget.id)} />}
  </div>;
}
