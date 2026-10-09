"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { formatPaymentAmountInput, normalizePaymentAmountInput } from "@/lib/proveedores-pagos";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./gestion.module.css";

type Sede = { id: number; nombre: string };
type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolId: number; rolNombre: string };
type CajaMovimiento = {
  id: number; tipo: string; concepto: string; valor: number; descripcion: string | null;
  sedeId: number; createdAt: string; editable: boolean; sede?: { nombre: string };
};
type GestionResumen = { totalMovimientos: number; totalManuales: number; totalAutomaticos: number };
type Notice = { text: string; error: boolean } | null;

function formatoPesos(value: string | number) {
  const numero = Number(value || 0);
  return `$ ${numero.toLocaleString("es-CO", { minimumFractionDigits: numero % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}
function formatoFecha(value: string) {
  return new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota" });
}
function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>;
}
function SummaryMetric({ icon, label, value, mode = false }: { icon: DashboardIconName; label: string; value: string; mode?: boolean }) {
  return <div className={`${styles.metric} ${mode ? styles.modeMetric : ""}`}><DashboardIcon name={icon} /><div>{mode && <span>Modo</span>}<strong>{value}</strong><span>{label}</span></div></div>;
}

export default function GestionCajaPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeError, setSedeError] = useState("");
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([]);
  const [gestion, setGestion] = useState<GestionResumen | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const guardandoRef = useRef(false);
  const eliminandoRef = useRef(false);
  const historyRequest = useRef(0);
  const historyController = useRef<AbortController | null>(null);

  const rolActual = user?.rolNombre?.toUpperCase() || "";
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";
  const ocupado = guardando || eliminandoId !== null;
  const cobertura = sedes.find((sede) => String(sede.id) === sedeId)?.nombre
    || (sedeId === String(user?.sedeId) ? user?.sedeNombre : "")
    || (user ? "Sede seleccionada" : "Cargando sede…");

  const cargarUsuario = useCallback(async () => {
    setSessionError("");
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la sesión.");
      const dataUser = data as SessionUser;
      setUser(dataUser);
      setSedeId((current) => current || String(dataUser.sedeId || ""));
      if (["ADMIN", "AUDITOR"].includes(dataUser.rolNombre?.toUpperCase())) {
        try {
          const resSedes = await fetch("/api/sedes", { cache: "no-store" });
          const dataSedes = await resSedes.json();
          if (!resSedes.ok || !Array.isArray(dataSedes)) throw new Error();
          setSedes(dataSedes); setSedeError("");
        } catch { setSedeError("No se pudo cargar el selector de sedes."); }
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Error cargando la sesión.");
      setCargando(false);
    }
  }, []);

  const cargarMovimientos = useCallback(async () => {
    if (!user || !sedeId) return;
    const request = ++historyRequest.current;
    historyController.current?.abort();
    const controller = new AbortController();
    historyController.current = controller;
    setCargando(true); setHistoryError("");
    try {
      const params = new URLSearchParams({ paginated: "1", resumenGestion: "1", page: String(page), pageSize: "10" });
      if (esAdmin) params.set("sedeId", sedeId);
      const res = await fetch(`/api/caja?${params}`, { cache: "no-store", signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el historial de caja.");
      if (!Array.isArray(data.movimientos) || !data.gestion) throw new Error("No se pudo cargar el resumen de caja.");
      if (request !== historyRequest.current || controller.signal.aborted) return;
      setMovimientos(data.movimientos); setGestion(data.gestion); setTotal(data.total);
      setTotalPages(Math.max(1, data.totalPages)); setPage(data.page);
    } catch (error) {
      if (request !== historyRequest.current || controller.signal.aborted) return;
      setHistoryError(error instanceof Error ? error.message : "Error cargando el historial de caja.");
      setMovimientos([]); setGestion(null); setTotal(0);
    } finally {
      if (request === historyRequest.current && !controller.signal.aborted) setCargando(false);
    }
  }, [user, sedeId, esAdmin, page]);

  useEffect(() => { void cargarUsuario(); }, [cargarUsuario]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void cargarMovimientos(); }, 0);
    return () => { window.clearTimeout(timer); historyController.current?.abort(); };
  }, [cargarMovimientos]);
  useLiveRefresh(cargarMovimientos, { enabled: Boolean(user && sedeId), intervalMs: 30000 });

  const limpiarFormulario = () => {
    setTipo("INGRESO"); setConcepto(""); setValor(""); setDescripcion(""); setEditandoId(null);
  };
  const guardar = async () => {
    if (guardandoRef.current || eliminandoRef.current || !user) return;
    guardandoRef.current = true; setGuardando(true); setNotice(null);
    try {
      if (!tipo) throw new Error("Debes seleccionar el tipo.");
      if (!concepto.trim()) throw new Error("Debes ingresar el concepto.");
      if (!valor || !Number.isFinite(Number(valor)) || Number(valor) <= 0) throw new Error("Debes ingresar un valor mayor a 0.");
      if (!sedeId || Number(sedeId) <= 0) throw new Error("Debes seleccionar la sede.");
      const res = await fetch(editandoId ? `/api/caja?id=${editandoId}` : "/api/caja/registrar", {
        method: editandoId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, concepto, valor: Number(valor), descripcion, sedeId: Number(sedeId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar movimiento.");
      setNotice({ text: data.mensaje || (editandoId ? "Movimiento actualizado correctamente" : "Movimiento registrado correctamente"), error: false });
      limpiarFormulario(); await cargarMovimientos();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Error al guardar movimiento.", error: true });
    } finally { guardandoRef.current = false; setGuardando(false); }
  };
  const iniciarEdicion = (movimiento: CajaMovimiento) => {
    if (!esAdmin || !movimiento.editable || guardandoRef.current || eliminandoRef.current) return;
    setEditandoId(movimiento.id);
    setTipo(movimiento.tipo.toUpperCase() === "EGRESO" ? "EGRESO" : "INGRESO");
    setConcepto(movimiento.concepto || ""); setValor(String(Number(movimiento.valor || 0)));
    setDescripcion(movimiento.descripcion || "");
    if (String(movimiento.sedeId) !== sedeId) setPage(1);
    setSedeId(String(movimiento.sedeId)); setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const eliminar = async (movimiento: CajaMovimiento) => {
    if (!puedeEliminar || !movimiento.editable || guardandoRef.current || eliminandoRef.current) return;
    if (!window.confirm(`Deseas eliminar el movimiento #${movimiento.id}?`)) return;
    eliminandoRef.current = true; setEliminandoId(movimiento.id); setNotice(null);
    try {
      const res = await fetch(`/api/caja?id=${movimiento.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar el movimiento.");
      if (editandoId === movimiento.id) limpiarFormulario();
      setNotice({ text: data.mensaje || "Movimiento eliminado correctamente", error: false });
      await cargarMovimientos();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Error eliminando movimiento.", error: true });
    } finally { eliminandoRef.current = false; setEliminandoId(null); }
  };

  const navigation: { href: string; icon: DashboardIconName; label: string }[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" }, { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" }, { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings" as const, label: "Configuración" }] : []),
  ];
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((item) => item > 0 && item <= totalPages).sort((a, b) => a - b);
  const tipoNombre = tipo === "INGRESO" ? "ingreso" : "egreso";
  const count = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString("es-CO");

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/dashboard" aria-label="CONECTAMOS, inicio"><Image src="/branding/conectamos-logo.png" alt="" width={42} height={42} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigation.map((item) => <Link key={item.href} className={`${styles.navItem} ${item.href === "/caja" ? styles.navActive : ""}`} href={item.href} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</nav>
      <SalesProfile name={user?.nombre || user?.usuario || "Usuario"} role={user?.rolNombre || ""} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><div className={styles.breadcrumb}><Link href="/caja">Caja</Link><span>/</span><span>Gestión</span></div><h1>Gestión de caja</h1><p>Ingresos y egresos</p></div><span className={styles.coverage}><DashboardIcon name="store" />{cobertura}</span></div>
      {sessionError && <div className={styles.error} role="alert">{sessionError}<button type="button" onClick={() => void cargarUsuario()} className={styles.button}>Reintentar</button></div>}
      <section className={styles.summary} aria-label="Resumen de gestión de caja" aria-busy={cargando}>
        <SummaryMetric icon="reports" label="Movimientos visibles" value={count(gestion?.totalMovimientos)} />
        <SummaryMetric icon="document" label="Registros manuales" value={count(gestion?.totalManuales)} />
        <SummaryMetric icon="lock" label="Automáticos protegidos" value={count(gestion?.totalAutomaticos)} />
        <SummaryMetric icon="settings" label={editandoId ? `Movimiento #${editandoId}` : ""} value={editandoId ? "Edición" : "Registro"} mode />
      </section>
      {notice && <div className={notice.error ? styles.error : styles.success} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
      <section className={styles.workspace} aria-label="Registro y vista previa">
        <form className={`${styles.panel} ${styles.form}`} noValidate onSubmit={(event) => { event.preventDefault(); void guardar(); }}>
          <div className={styles.sectionHeading}><span className={`${styles.headingIcon} ${styles.redIcon}`}><DashboardIcon name="document-add" /></span><div><h2>{editandoId ? `Editar movimiento #${editandoId}` : "Nuevo movimiento"}</h2><p>{editandoId ? "Actualiza el movimiento manual seleccionado." : "Registra un ingreso o egreso en la caja."}</p></div></div>
          <fieldset disabled={!user || ocupado} className={styles.formFields}><legend className={styles.srOnly}>Datos del movimiento</legend>
            <div className={styles.typeSelector} role="group" aria-label="Tipo de movimiento">{(["INGRESO", "EGRESO"] as const).map((item) => <button key={item} type="button" aria-pressed={tipo === item} className={tipo === item ? styles.selectedType : ""} onClick={() => setTipo(item)}><DashboardIcon name="arrow" className={item === "INGRESO" ? styles.upArrow : styles.downArrow} />{item === "INGRESO" ? "Ingreso" : "Egreso"}</button>)}</div>
            <div className={styles.twoFields}>
              <label className={styles.field}>Sede{esAdmin ? <span className={styles.select}><select value={sedeId} required onChange={(event) => { setSedeId(event.target.value); setPage(1); setGestion(null); setMovimientos([]); setCargando(true); }}>
                {!sedes.some((sede) => String(sede.id) === sedeId) && <option value={sedeId}>{cobertura}</option>}{sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}
              </select><DashboardIcon name="chevron" /></span> : <input value={user?.sedeNombre || "Cargando…"} readOnly />}</label>
              <label className={styles.field}>Valor<span className={styles.moneyInput}><span aria-hidden="true">$</span><input aria-label="Valor" inputMode="decimal" required value={formatPaymentAmountInput(valor)} placeholder="0" onChange={(event) => setValor(normalizePaymentAmountInput(event.target.value, valor))} onPaste={(event) => { event.preventDefault(); setValor(normalizePaymentAmountInput(event.clipboardData.getData("text"), valor, true)); }} /></span></label>
            </div>
            {sedeError && <div className={styles.fieldError} role="alert">{sedeError}<button type="button" onClick={() => void cargarUsuario()}>Reintentar</button></div>}
            <label className={styles.field}>Concepto<input required value={concepto} onChange={(event) => setConcepto(event.target.value)} placeholder="Escribe el concepto del movimiento…" /></label>
            <label className={styles.field}>Descripción <span className={styles.optional}>(opcional)</span><textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Detalle opcional del movimiento…" rows={2} /></label>
            <div className={styles.formActions}><button type="button" className={styles.button} onClick={() => { limpiarFormulario(); setNotice(null); }}>{editandoId ? "Cancelar edición" : "Limpiar"}</button><button type="submit" className={`${styles.button} ${styles.primary}`}><DashboardIcon name="approvals" />{guardando ? "Guardando…" : editandoId ? "Guardar cambios" : `Registrar ${tipoNombre}`}</button></div>
          </fieldset>
        </form>
        <aside className={`${styles.panel} ${styles.receipt}`} aria-label="Vista previa del movimiento">
          <div className={styles.receiptHeader}><div><h2><DashboardIcon name="document" />Vista previa</h2><span className={`${styles.typeBadge} ${tipo === "INGRESO" ? styles.incomeBadge : styles.expenseBadge}`}>{tipo}</span></div><strong aria-live="polite">{formatoPesos(valor)}</strong></div>
          <div className={styles.receiptBody}><dl><div><dt>Sede</dt><dd>{cobertura}</dd></div><div><dt>Concepto</dt><dd>{concepto.trim() || "Por completar"}</dd></div><div><dt>Descripción</dt><dd>{descripcion.trim() || "—"}</dd></div></dl>
            <details className={styles.protectionHelp}><summary><DashboardIcon name="lock" /><span>Automáticos protegidos</span><InfoIcon /></summary><p>Esta vista previa no registra movimientos. Los registros automáticos no se pueden editar ni eliminar. {esAdmin ? "Solo puedes gestionar movimientos manuales según tu rol." : "Solo puedes registrar movimientos en tu sede."}</p></details>
          </div>
        </aside>
      </section>
      <section className={`${styles.panel} ${styles.history}`} aria-label="Movimientos recientes">
        <div className={styles.historyHeading}><div className={styles.sectionHeading}><span className={styles.headingIcon}><DashboardIcon name="reports" /></span><div><h2>Movimientos recientes</h2><p>Historial de movimientos de caja.</p></div></div><div className={styles.historyActions}><span>{historyError ? "Sin datos" : `${count(gestion?.totalMovimientos)} registros`}</span><button type="button" disabled={!user || cargando || ocupado} onClick={() => void cargarMovimientos()} className={styles.button}><DashboardIcon name="refresh" />Actualizar</button></div></div>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Historial de caja, desplaza horizontalmente para ver todas las columnas" aria-busy={cargando}>
          <table className={styles.table}><thead><tr>{["Fecha", "Sede", "Tipo", "Concepto", "Valor", "Origen", "Acciones"].map((label) => <th key={label} scope="col" className={label === "Valor" ? styles.amount : undefined}>{label}</th>)}</tr></thead><tbody>
            {cargando ? <tr><td colSpan={7} className={styles.tableState}><DashboardIcon name="clock" /><strong role="status">Cargando movimientos…</strong></td></tr>
              : historyError || sessionError ? <tr><td colSpan={7} className={styles.tableState}><DashboardIcon name="warning" /><strong role="alert">{historyError || sessionError}</strong><button type="button" className={styles.button} onClick={() => void (user ? cargarMovimientos() : cargarUsuario())}>Reintentar</button></td></tr>
              : movimientos.length === 0 ? <tr><td colSpan={7} className={styles.tableState}><DashboardIcon name="document" /><strong>No hay movimientos visibles</strong><span>No hay registros para {cobertura}.</span></td></tr>
              : movimientos.map((movimiento) => <tr key={movimiento.id} className={editandoId === movimiento.id ? styles.editingRow : undefined}>
                <td className={styles.date}>{formatoFecha(movimiento.createdAt)}<span>#{movimiento.id}</span></td><td>{movimiento.sede?.nombre || "Sede sin configurar"}</td>
                <td><span className={`${styles.typeBadge} ${movimiento.tipo === "INGRESO" ? styles.incomeBadge : styles.expenseBadge}`}>{movimiento.tipo}</span></td>
                <td className={styles.conceptCell}><strong>{movimiento.concepto}</strong><p>{movimiento.descripcion || "Sin descripción"}</p></td>
                <td className={`${styles.amount} ${movimiento.tipo === "INGRESO" ? styles.income : styles.expense}`}>{formatoPesos(movimiento.valor)}</td>
                <td><span className={styles.origin}><DashboardIcon name={movimiento.editable ? "document" : "lock"} />{movimiento.editable ? "Manual" : "Automático"}</span></td>
                <td>{movimiento.editable ? esAdmin ? <div className={styles.rowActions}><button type="button" disabled={ocupado} className={styles.button} onClick={() => iniciarEdicion(movimiento)}>Editar</button>{puedeEliminar && <button type="button" disabled={ocupado} className={`${styles.button} ${styles.delete}`} onClick={() => void eliminar(movimiento)}>{eliminandoId === movimiento.id ? "Eliminando…" : "Eliminar"}</button>}</div> : <span className={styles.readOnly}>Solo lectura</span> : <span className={styles.origin}><DashboardIcon name="lock" />Protegido</span>}</td>
              </tr>)}
          </tbody></table>
        </div>
        <div className={styles.pagination}><span>10 por página</span><p>{cargando ? "Cargando…" : historyError ? "No se pudo consultar el historial" : total ? `Mostrando ${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} de ${total.toLocaleString("es-CO")} registros` : "0 registros"}</p>
          <nav aria-label="Paginación de movimientos"><button className={styles.button} type="button" disabled={cargando || Boolean(historyError) || page <= 1} onClick={() => setPage((current) => current - 1)}><DashboardIcon name="chevron" className={styles.previousArrow} /><span>Anterior</span></button>{pages.map((item, index) => <span className={styles.pageGroup} key={item}>{index > 0 && item > pages[index - 1] + 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${item}`} aria-current={item === page ? "page" : undefined} disabled={cargando || Boolean(historyError)} className={`${styles.pageButton} ${item === page ? styles.currentPage : ""}`} onClick={() => setPage(item)}>{item}</button></span>)}<button className={styles.button} type="button" disabled={cargando || Boolean(historyError) || page >= totalPages} onClick={() => setPage((current) => current + 1)}><span>Siguiente</span><DashboardIcon name="chevron" className={styles.nextArrow} /></button></nav>
        </div>
      </section>
    </main>
  </div>;
}
