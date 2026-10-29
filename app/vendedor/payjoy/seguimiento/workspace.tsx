"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import type { PayJoyCreditCheckView as Check, PayJoyCreditWorkspaceData, PayJoyExtensionFollowUp as Extension } from "@/lib/payjoy-credit-types";
import base from "../extensiones/extensions.module.css";
import styles from "./follow-up.module.css";

// The existing server integration also supplies extension follow-up checks.
const API = "/api/payjoy/credito";
const ROUTE = "/vendedor/payjoy/seguimiento";
const IDENTIFIER = /^(?:D[A-Z0-9]{5,31}|\d{15,16})$/;
const OPERATION_LABELS: Record<string, string> = {
  PREPARANDO: "Consultando opciones", LISTA: "Lista para revisar", SIN_OPCIONES: "Sin opciones", EJECUTANDO: "Gestión en curso",
  EXITOSA: "Extensión confirmada", RECHAZADA: "Rechazada por PayJoy", INDETERMINADA: "Requiere revisión en PayJoy", ERROR: "Consulta con error", EXPIRADA: "Consulta vencida",
};
const FOLLOW_UP_LABELS = { SIN_COMPROBAR: "Sin comprobar", CONSULTADO: "Equipo comprobado", ERROR_CONSULTA: "Comprobación con error", NO_APLICA: "Sin extensión confirmada", REQUIERE_REVISION: "Revisión pendiente" };
const DEFAULT_NAVIGATION: NavigationItem[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/cierre", icon: "reports", label: "CIERRE" },
  { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
  { href: ROUTE, icon: "clock", label: "Seguimiento de extensiones" },
  { href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" },
];
function date(value: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(parsed) : "No informado";
}
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function extensionLink(tag: string | null) { return `/vendedor/payjoy/extensiones${tag ? `?deviceTag=${encodeURIComponent(tag)}` : ""}`; }

export default function PayJoyFollowUpWorkspace({ session, navigation = DEFAULT_NAVIGATION, initialIdentifier = "" }: {
  session: { nombre: string; sedeNombre: string; roleLabel?: string };
  navigation?: NavigationItem[];
  initialIdentifier?: string;
}) {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkingDevice, setCheckingDevice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState(initialIdentifier);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const lock = useRef(false);
  const attempt = useRef<{ identifier: string; key: string; checkId?: string } | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const version = useRef(0);

  const loadHistory = useCallback(async () => {
    historyAbort.current?.abort();
    const controller = new AbortController(); historyAbort.current = controller;
    const currentVersion = version.current;
    setLoading(true); setHistoryError("");
    try {
      const response = await fetch(API, { cache: "no-store", signal: controller.signal });
      const data: PayJoyCreditWorkspaceData = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.checks) || !Array.isArray(data?.extensions)) throw new Error("No se pudo cargar el seguimiento de PayJoy. Intenta nuevamente.");
      if (controller.signal.aborted || currentVersion !== version.current) return;
      if (attempt.current?.checkId && data.checks.some(item => item.id === attempt.current?.checkId && item.status !== "CONSULTANDO")) attempt.current = null;
      setExtensions(data.extensions);
    } catch (cause) { if (!controller.signal.aborted) setHistoryError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "No se pudo cargar el seguimiento. Revisa la conexión e intenta nuevamente."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void loadHistory(); return () => historyAbort.current?.abort(); }, [loadHistory]);

  async function consult(operation: Extension) {
    if (lock.current) return;
    const normalized = (operation.deviceTag || operation.imei || "").trim().toUpperCase();
    if (!IDENTIFIER.test(normalized)) { setError("Este registro no tiene un código PayJoy o IMEI válido para comprobar el equipo. Revisa la gestión en Extensiones PayJoy."); return; }
    if (attempt.current?.identifier !== normalized) attempt.current = { identifier: normalized, key: crypto.randomUUID() };
    lock.current = true; version.current += 1; setBusy(true); setCheckingDevice(normalized); setError(""); setNotice("");
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ identifier: normalized, idempotencyKey: attempt.current.key }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.check?.id) {
        if (response.ok || response.status < 500) attempt.current = null;
        throw new Error(typeof data?.error === "string" ? data.error : "No se pudo completar la comprobación. Actualiza el seguimiento o vuelve a intentar con el mismo equipo.");
      }
      const next: Check = data.check;
      attempt.current = next.status === "CONSULTANDO" ? { ...attempt.current, checkId: next.id } : null;
      if (next.status === "ERROR") setError(next.errorMessage || "PayJoy no devolvió una comprobación válida para este equipo.");
      else setNotice(next.status === "CONSULTANDO" ? "La comprobación sigue en curso. Pulsa Actualizar seguimiento para recuperar su resultado." : "Comprobación guardada. El resultado original de la extensión se conserva.");
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "No se recibió la respuesta de la comprobación. Revisa la conexión y vuelve a intentar con el mismo equipo para recuperar el resultado."); }
    finally { lock.current = false; setBusy(false); setCheckingDevice(null); }
  }
  const otherNavigation = navigation.filter(item => item.href !== ROUTE);
  const mainNavigation = [...otherNavigation.slice(0, 5), navigation.find(item => item.href === ROUTE) || DEFAULT_NAVIGATION[3]];
  const moreNavigation = otherNavigation.slice(5);
  const filtered = extensions.filter(item => (!statusFilter || item.status === statusFilter) && normalize([item.deviceTag, item.imei, item.asesorNombre, OPERATION_LABELS[item.status], FOLLOW_UP_LABELS[item.followUp.status]].filter(Boolean).join(" ")).includes(normalize(query)));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);

  return <div className={base.page}><div className={base.content}>
    <header className={base.topbar}>
      <Link href="/dashboard" className={base.brand}><Image src="/branding/conectamos-logo.png" width={42} height={42} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={base.navigation} aria-label="Navegación principal"><div className={base.navLinks}>{mainNavigation.map(item => <Link key={item.href} href={item.href} className={`${base.navItem} ${item.href === ROUTE ? base.navActive : ""}`} aria-current={item.href === ROUTE ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div>{moreNavigation.length > 0 && <details className={base.moreNavigation}><summary>Más<DashboardIcon name="chevron" /></summary><div className={base.moreMenu}>{moreNavigation.map(item => <Link key={item.href} href={item.href} className={base.navItem}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div></details>}</nav>
      <div className={base.profileWrap}><SalesProfile name={session.nombre} role={session.roleLabel || session.sedeNombre} /></div>
    </header>
    <main className={base.main}>
      <div className={base.heading}><div><nav className={base.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="chevron" /><span>Servicios PayJoy</span></nav><h1>Seguimiento de extensiones</h1><p>Revisa tus gestiones y comprueba la vigencia informada por PayJoy para cada equipo.</p></div><span className={base.context}><DashboardIcon name="store" />{session.sedeNombre}</span></div>
      <nav className={styles.actions} aria-label="Servicios PayJoy"><Link href="/vendedor/payjoy/extensiones" className={`${base.button} ${base.primary}`}><DashboardIcon name="arrow" />Gestionar extensión</Link></nav>
      {error && <div className={base.error} role="alert"><DashboardIcon name="warning" /><p>{error}</p></div>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {historyError && <div className={base.error} role="alert"><DashboardIcon name="warning" /><p>{historyError}</p><button className={base.button} disabled={loading || busy} onClick={() => void loadHistory()}>Reintentar seguimiento</button></div>}
      <section className={base.panel} aria-labelledby="payjoy-followup-title" aria-busy={loading}>
        <div className={base.sectionHeading}><span className={base.sectionIcon}><DashboardIcon name="clock" /></span><div><p>Estado posterior de tus gestiones</p><h2 id="payjoy-followup-title">Operaciones de extensiones</h2></div></div>
        <p className={styles.trackingIntro}>Últimas 30 operaciones de tu perfil y sede. Al abrir o actualizar esta pantalla se muestran los registros guardados. Comprobar equipo consulta PayJoy sin ejecutar otra extensión ni resolver automáticamente una gestión indeterminada.</p>
        <div className={styles.filters}>
          <div className={styles.filterField}><label htmlFor="payjoy-followup-query">Buscar en seguimiento</label><input id="payjoy-followup-query" type="search" value={query} placeholder="Código, IMEI o asesor" onChange={event => { setQuery(event.target.value); setPage(1); }} /></div>
          <div className={styles.filterField}><label htmlFor="payjoy-followup-status">Estado de la operación</label><select id="payjoy-followup-status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Todos los estados</option>{Object.entries(OPERATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <button className={base.button} disabled={loading || busy} onClick={() => void loadHistory()}><DashboardIcon name="refresh" />{loading ? "Actualizando…" : "Actualizar seguimiento"}</button>
        </div>
        {loading && !extensions.length ? <div className={base.empty} role="status"><DashboardIcon name="clock" /><p>Cargando las operaciones guardadas…</p></div> : !visible.length ? <div className={base.empty}><DashboardIcon name="document" /><h3>{extensions.length ? "Sin coincidencias" : "Todavía no hay extensiones para revisar"}</h3><p>{extensions.length ? "Cambia los filtros para ver otras operaciones de tu perfil." : "Las consultas y gestiones realizadas desde Extensiones PayJoy aparecerán aquí."}</p></div>
          : <ul className={styles.trackingList}>{visible.map(item => <li className={styles.trackingItem} key={item.id}>
            <div className={styles.trackingHeading}><div><h3>{item.deviceTag || item.imei || "Equipo por identificar"}</h3><p>{date(item.createdAt)} · {item.asesorNombre}</p></div><div className={styles.trackingStates}><span className={`${base.status} ${item.status === "EXITOSA" ? base.positive : ["INDETERMINADA", "ERROR", "RECHAZADA"].includes(item.status) ? base.warning : ""}`}>{OPERATION_LABELS[item.status] || "Estado por revisar"}</span><span className={`${base.status} ${["ERROR_CONSULTA", "REQUIERE_REVISION"].includes(item.followUp.status) ? base.warning : ""}`}>{FOLLOW_UP_LABELS[item.followUp.status]}</span></div></div>
            <dl className={styles.trackingFacts}>
              <div><dt>Duración seleccionada</dt><dd>{item.extensionHours === null ? "Sin selección" : `${item.extensionHours.toLocaleString("es-CO")} horas`}</dd></div>
              <div><dt>Vigencia confirmada de la extensión</dt><dd>{date(item.grantedValidThrough)}</dd></div>
              <div><dt>Última vigencia consultada</dt><dd>{date(item.followUp.currentValidThrough)}</dd></div>
              <div><dt>IMEI</dt><dd>{item.imei || "No informado"}</dd></div>
            </dl>
            <div className={styles.followup}><DashboardIcon name={item.followUp.status === "REQUIERE_REVISION" ? "warning" : "document-search"} /><div><p>{item.followUp.message}</p><small>{item.followUp.checkedAt ? `Comprobación del ${date(item.followUp.checkedAt)}` : "Sin comprobación posterior guardada."}</small></div></div>
            <div className={styles.trackingActions}><small>Comprobar el equipo conserva el resultado original de esta operación.</small><button className={base.button} disabled={busy || !(item.deviceTag || item.imei)} onClick={() => void consult(item)}><DashboardIcon name="refresh" />{busy && checkingDevice === (item.deviceTag || item.imei) ? "Comprobando…" : "Comprobar equipo"}</button><Link className={base.button} href={extensionLink(item.deviceTag)}>Ver módulo de extensiones<DashboardIcon name="arrow" /></Link></div>
          </li>)}</ul>}
        <div className={styles.pagination}><span>{filtered.length} operaciones{filtered.length ? ` · página ${currentPage} de ${pages}` : ""}</span><div><button className={base.button} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button className={base.button} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></div>
      </section>
    </main>
  </div></div>;
}
