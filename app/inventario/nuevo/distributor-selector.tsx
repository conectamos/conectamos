"use client";

import { useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "./distributor-selector.module.css";

type Distributor = { id: number; nombre: string };
const API = "/api/inventario-principal/distribuidores";

async function readCatalog(response: Response): Promise<Distributor[]> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true || !Array.isArray(data.distribuidores) ||
    !data.distribuidores.every((item: Distributor) => Number.isInteger(item?.id) && item.id > 0 && typeof item.nombre === "string")) {
    throw new Error(typeof data?.error === "string" ? data.error : "No se pudo confirmar el catálogo de distribuidores. Intenta nuevamente.");
  }
  return data.distribuidores;
}

export default function DistributorSelector({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const [items, setItems] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<Distributor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const version = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++version.current;
    void fetch(API, { cache: "no-store", signal: controller.signal }).then(readCatalog).then(catalog => {
      if (!controller.signal.aborted && version.current === current) setItems(catalog);
    }).catch(cause => {
      if (!controller.signal.aborted && version.current === current) setError(cause instanceof Error ? cause.message : "No se pudo cargar el catálogo.");
    }).finally(() => {
      if (!controller.signal.aborted && version.current === current) setLoading(false);
    });
    return () => { controller.abort(); version.current += 1; };
  }, []);

  async function reload() {
    if (lock.current || disabled) return;
    lock.current = true; setLoading(true); setError(""); setMessage("");
    const current = ++version.current;
    try {
      const catalog = await readCatalog(await fetch(API, { cache: "no-store" }));
      if (current === version.current) setItems(catalog);
    } catch (cause) {
      if (current === version.current) setError(cause instanceof Error ? cause.message : "No se pudo cargar el catálogo.");
    } finally {
      lock.current = false;
      if (current === version.current) setLoading(false);
    }
  }

  async function add() {
    if (lock.current || disabled || loading) return;
    const nombre = name.trim().replace(/\s+/g, " ");
    if (!nombre || nombre.length > 100) { setError("Escribe un nombre de 1 a 100 caracteres."); nameInput.current?.focus(); return; }
    lock.current = true; setBusy(true); setError(""); setMessage("");
    const current = ++version.current;
    try {
      const catalog = await readCatalog(await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) }));
      if (current !== version.current) return;
      setItems(catalog);
      const added = catalog.find(item => item.nombre.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("es-CO") === nombre.normalize("NFKC").toLocaleUpperCase("es-CO"));
      if (added) onChange(added.nombre);
      setName(""); setQuery(""); setMessage("Distribuidor agregado al catálogo.");
    } catch (cause) {
      if (current === version.current) setError(cause instanceof Error ? cause.message : "No se pudo agregar el distribuidor. Conservamos el nombre.");
    } finally { lock.current = false; if (current === version.current) setBusy(false); }
  }

  async function remove() {
    if (lock.current || disabled || loading || !removing) return;
    const item = removing;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    const current = ++version.current;
    try {
      const catalog = await readCatalog(await fetch(API, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }));
      if (current !== version.current) return;
      setItems(catalog); setRemoving(null);
      if (value === item.nombre) onChange("");
      setMessage(`${item.nombre} ya no aparece en nuevas cargas. Su historial se conserva.`);
    } catch (cause) {
      if (current === version.current) setError(cause instanceof Error ? cause.message : "No se pudo eliminar la opción. Intenta nuevamente.");
    } finally { lock.current = false; if (current === version.current) setBusy(false); }
  }

  const filtered = items.filter(item => item.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").includes(query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-CO")));
  const blocked = disabled || busy || loading;
  return <div className={styles.field}>
    <label htmlFor="ingreso-distribuidor">Distribuidor</label>
    <div className={styles.selectorRow}>
      <select id="ingreso-distribuidor" value={value} required disabled={blocked} onChange={event => onChange(event.target.value)}>
        <option value="">{loading ? "Cargando distribuidores…" : "Seleccionar distribuidor"}</option>
        {value && !items.some(item => item.nombre === value) && <option value={value}>{value}</option>}
        {items.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
      </select>
      <button type="button" ref={toggle} className={styles.manage} disabled={disabled || busy} aria-expanded={open} aria-controls="distribuidores-panel" onClick={() => { setOpen(!open); setRemoving(null); setMessage(""); }}><DashboardIcon name="catalog" />Gestionar</button>
    </div>
    {error && <p className={styles.error} role="alert">{error} <button type="button" disabled={blocked} onClick={() => void reload()}>Actualizar catálogo</button></p>}
    {message && <p className={styles.success} role="status">{message}</p>}
    {open && <section id="distribuidores-panel" className={styles.panel} aria-labelledby="distribuidores-title" aria-busy={busy || loading}>
      <div className={styles.heading}><div><span>Bodega principal</span><h3 id="distribuidores-title">Distribuidores</h3></div><button type="button" className={styles.close} disabled={busy} aria-label="Cerrar gestión de distribuidores" onClick={() => { setOpen(false); setRemoving(null); toggle.current?.focus(); }}><DashboardIcon name="close" /></button></div>
      <div className={styles.add}>
        <label htmlFor="nuevo-distribuidor">Nuevo distribuidor</label>
        <div className={styles.addRow}><input id="nuevo-distribuidor" ref={nameInput} maxLength={100} value={name} disabled={blocked} placeholder="Nombre del distribuidor" autoComplete="off" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} /><button type="button" className={styles.primary} disabled={blocked || !name.trim()} onClick={() => void add()}><DashboardIcon name="document-add" />{busy && !removing ? "Agregando…" : "Agregar"}</button></div>
      </div>
      <div className={styles.listHeading}><span>{items.length.toLocaleString("es-CO")} activos</span><button type="button" disabled={blocked} onClick={() => void reload()} aria-label="Actualizar distribuidores"><DashboardIcon name="refresh" /></button></div>
      <label className={styles.search}><DashboardIcon name="search" /><input type="search" value={query} aria-label="Buscar distribuidor" placeholder="Buscar distribuidor" disabled={blocked} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      {loading ? <p className={styles.empty} role="status">Cargando distribuidores…</p> : <ul className={styles.list}>{filtered.map(item => <li key={item.id}><span>{item.nombre}</span><button type="button" className={styles.remove} disabled={blocked} aria-label={`Eliminar distribuidor ${item.nombre}`} onClick={() => { setRemoving(item); setError(""); setMessage(""); }}><DashboardIcon name="close" /><span>Eliminar</span></button></li>)}{!filtered.length && <li className={styles.empty}>{query.trim() ? "No hay coincidencias." : "No hay distribuidores activos. Agrega el primero."}</li>}</ul>}
      {removing && <div className={styles.confirm} role="group" aria-label="Confirmar eliminación del distribuidor"><strong>¿Eliminar {removing.nombre} del selector?</strong><p>Los equipos registrados conservan este distribuidor.</p><div><button type="button" disabled={busy || disabled} onClick={() => setRemoving(null)}>Cancelar eliminación</button><button type="button" className={styles.danger} disabled={blocked} onClick={() => void remove()}>{busy ? "Eliminando…" : "Eliminar del selector"}</button></div></div>}
    </section>}
  </div>;
}
