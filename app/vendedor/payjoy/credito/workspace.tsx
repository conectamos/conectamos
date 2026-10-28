"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import type { PayJoyCreditCheckView as Check, PayJoyCreditSnapshot as Snapshot, PayJoyCreditWorkspaceData, PayJoyExtensionFollowUp as Extension } from "@/lib/payjoy-credit-types";
import base from "../extensiones/extensions.module.css";
import styles from "./credit.module.css";

const API = "/api/payjoy/credito";
const ROUTE = "/vendedor/payjoy/credito";
const IDENTIFIER = /^(?:D[A-Z0-9]{5,31}|\d{15,16})$/;
const CHECK_LABELS = { CONSULTANDO: "Consulta en curso", LISTA: "Consulta guardada", ERROR: "Consulta con error" };
const OPERATION_LABELS: Record<string, string> = {
  PREPARANDO: "Consultando opciones", LISTA: "Lista para revisar", SIN_OPCIONES: "Sin opciones", EJECUTANDO: "Gestión en curso",
  EXITOSA: "Extensión confirmada", RECHAZADA: "Rechazada por PayJoy", INDETERMINADA: "Requiere revisión en PayJoy", ERROR: "Consulta con error", EXPIRADA: "Consulta vencida",
};
const FOLLOW_UP_LABELS = { SIN_COMPROBAR: "Sin comprobar", CONSULTADO: "Equipo comprobado", ERROR_CONSULTA: "Comprobación con error", NO_APLICA: "Sin extensión confirmada", REQUIERE_REVISION: "Revisión pendiente" };
const SOURCE_LABELS = { RETAIL: "API Retail de PayJoy", PAYMENT: "Consulta de saldo de PayJoy", RETAIL_AND_PAYMENT: "API Retail y consulta de saldo de PayJoy" };
const DEFAULT_NAVIGATION: NavigationItem[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/cierre", icon: "reports", label: "CIERRE" },
  { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
  { href: ROUTE, icon: "document-search", label: "Crédito PayJoy" },
  { href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" },
];
function date(value: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(parsed) : "No informado";
}
function money(value: number | null, currency: string | null) {
  if (value === null || !Number.isFinite(value)) return "No informado";
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try { return new Intl.NumberFormat("es-CO", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(value); } catch { /* Preserve the amount without inventing a currency. */ }
  }
  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })} · moneda no informada`;
}
function terms(value: number | null) { return value === null ? "No informado" : `${value.toLocaleString("es-CO")} meses`; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function extensionLink(tag: string | null) { return `/vendedor/payjoy/extensiones${tag ? `?deviceTag=${encodeURIComponent(tag)}` : ""}`; }
function checkTone(check: Check) { return check.status === "ERROR" ? base.warning : ""; }
function creditState(snapshot: Snapshot) { return snapshot.paidInFull === true ? "Pagado por completo" : snapshot.paidInFull === false ? "No liquidado" : "No informado"; }

function CreditDetails({ check }: { check: Check }) {
  const snapshot = check.snapshot;
  if (!snapshot) return <div className={base.empty}><DashboardIcon name={check.status === "ERROR" ? "warning" : "clock"} /><h3>{CHECK_LABELS[check.status]}</h3><p>{check.errorMessage || "Actualiza el historial para recuperar el resultado de esta consulta."}</p></div>;
  return <>
    <dl className={styles.headline}>
      <div><dt>Saldo informado</dt><dd>{money(snapshot.remainingBalance, snapshot.currency)}</dd><small>Dato de la consulta guardada</small></div>
      <div><dt>Vigencia informada</dt><dd>{date(snapshot.validThrough)}</dd><small>No indica el estado de bloqueo actual</small></div>
      <div><dt>Estado de pago</dt><dd>{creditState(snapshot)}</dd><small>Según la respuesta de PayJoy</small></div>
    </dl>
    <dl className={styles.details}>
      <div><dt>Dispositivo PayJoy</dt><dd>{snapshot.deviceTag || "No informado"}</dd></div>
      <div><dt>IMEI</dt><dd>{snapshot.imei || "No informado"}</dd></div>
      <div><dt>Modelo del equipo</dt><dd>{snapshot.model || "No informado"}</dd></div>
      <div><dt>Número de crédito PayJoy</dt><dd>{snapshot.financeOrderId || "No informado"}</dd></div>
      <div><dt>Monto financiado</dt><dd>{money(snapshot.financeAmount, snapshot.currency)}</dd></div>
      <div><dt>Pago inicial</dt><dd>{money(snapshot.downPayment, snapshot.currency)}</dd></div>
      <div><dt>Valor de compra</dt><dd>{money(snapshot.purchaseAmount, snapshot.currency)}</dd></div>
      <div><dt>Plazo informado</dt><dd>{terms(snapshot.months)}</dd></div>
      <div><dt>Cuota semanal</dt><dd>{money(snapshot.weeklyCost, snapshot.currency)}</dd></div>
      <div><dt>Cuota quincenal</dt><dd>{money(snapshot.fortnightlyCost, snapshot.currency)}</dd></div>
      <div><dt>Cuota mensual</dt><dd>{money(snapshot.monthlyCost, snapshot.currency)}</dd></div>
      <div><dt>Última conexión informada</dt><dd>{date(snapshot.lastSeen)}</dd></div>
      {snapshot.secureStatus && <div><dt>Estado técnico informado por PayJoy</dt><dd>{snapshot.secureStatus}</dd></div>}
    </dl>
    {snapshot.warnings.length > 0 && <ul className={styles.warningList} aria-label="Información pendiente de PayJoy">{snapshot.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
    <section className={styles.section} aria-labelledby="payjoy-payments-title">
      <h3 id="payjoy-payments-title">Pagos informados por PayJoy</h3>
      {snapshot.paymentsAvailability === "NO_DISPONIBLE" ? <p className={styles.hint}>PayJoy no devolvió un historial de pagos verificable. Esto no significa que el cliente no haya pagado.</p>
        : snapshot.payments.length === 0 ? <p className={styles.hint}>La respuesta consultada no contiene pagos. No confirma la ausencia de pagos fuera de esa respuesta.</p>
          : <div className={styles.scroll}><table className={styles.table}><caption className={base.srOnly}>Pagos devueltos en la consulta de PayJoy</caption><thead><tr><th scope="col">Fecha del pago</th><th scope="col">Importe</th></tr></thead><tbody>{snapshot.payments.map((payment, index) => <tr key={`${payment.paidAt}-${payment.amount}-${index}`}><td>{date(payment.paidAt)}</td><td>{money(payment.amount, payment.currency)}</td></tr>)}</tbody></table></div>}
      <p className={styles.source}>Fuente: {SOURCE_LABELS[snapshot.source]}. Consulta del {date(check.completedAt || check.createdAt)}.</p>
    </section>
  </>;
}

export default function PayJoyCreditWorkspace({ session, navigation = DEFAULT_NAVIGATION, initialIdentifier = "", initialTab = "credito" }: {
  session: { nombre: string; sedeNombre: string; roleLabel?: string };
  navigation?: NavigationItem[];
  initialIdentifier?: string;
  initialTab?: "credito" | "seguimiento";
}) {
  const [tab, setTab] = useState<"credito" | "seguimiento">(initialTab);
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [check, setCheck] = useState<Check | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkingDevice, setCheckingDevice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [fieldError, setFieldError] = useState(false);
  const [query, setQuery] = useState(initialTab === "seguimiento" ? initialIdentifier : "");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [checkPage, setCheckPage] = useState(1);
  const lock = useRef(false);
  const attempt = useRef<{ identifier: string; key: string; checkId?: string } | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const version = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const loadHistory = useCallback(async () => {
    historyAbort.current?.abort();
    const controller = new AbortController(); historyAbort.current = controller;
    const currentVersion = version.current;
    setLoading(true); setHistoryError("");
    try {
      const response = await fetch(API, { cache: "no-store", signal: controller.signal });
      const data: PayJoyCreditWorkspaceData = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.checks) || !Array.isArray(data?.extensions)) throw new Error("No se pudo cargar el historial de PayJoy. Intenta nuevamente.");
      if (controller.signal.aborted || currentVersion !== version.current) return;
      if (attempt.current?.checkId && data.checks.some(item => item.id === attempt.current?.checkId && item.status !== "CONSULTANDO")) attempt.current = null;
      setChecks(data.checks); setExtensions(data.extensions);
      setCheck(current => current ? data.checks.find(item => item.id === current.id) || current
        : initialIdentifier ? data.checks.find(item => [item.identifier, item.deviceTag, item.imei].includes(initialIdentifier)) || null : data.checks[0] || null);
    } catch (cause) { if (!controller.signal.aborted) setHistoryError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "No se pudo cargar el historial. Revisa la conexión e intenta nuevamente."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [initialIdentifier]);
  useEffect(() => { void loadHistory(); return () => historyAbort.current?.abort(); }, [loadHistory]);

  function showCheck(item: Check) {
    setCheck(item); setIdentifier(item.deviceTag || item.imei || item.identifier); setError(""); setFieldError(false); setTab("credito");
    setTimeout(() => resultHeading.current?.focus(), 0);
  }
  async function consult(value: string) {
    if (lock.current) return;
    const normalized = value.trim().toUpperCase();
    if (!IDENTIFIER.test(normalized)) { setFieldError(true); setError("Escribe un código PayJoy que comience con D o un IMEI de 15 o 16 dígitos. No uses la cédula ni una URL."); setTab("credito"); return; }
    if (attempt.current?.identifier !== normalized) attempt.current = { identifier: normalized, key: crypto.randomUUID() };
    lock.current = true; version.current += 1; setBusy(true); setCheckingDevice(normalized); setError(""); setFieldError(false); setIdentifier(normalized);
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ identifier: normalized, idempotencyKey: attempt.current.key }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.check?.id) {
        if (response.ok || response.status < 500) attempt.current = null;
        throw new Error(typeof data?.error === "string" ? data.error : "No se pudo completar la consulta. Actualiza el historial o vuelve a intentar con el mismo identificador.");
      }
      const next: Check = data.check;
      attempt.current = next.status === "CONSULTANDO" ? { ...attempt.current, checkId: next.id } : null;
      setChecks(current => [next, ...current.filter(item => item.id !== next.id)].slice(0, 30));
      setCheckPage(1);
      showCheck(next);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "No se recibió la respuesta de la consulta. Revisa la conexión y vuelve a intentar con el mismo identificador para recuperar el resultado."); }
    finally { lock.current = false; setBusy(false); setCheckingDevice(null); }
  }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "credito" : event.key === "End" ? "seguimiento" : tab === "credito" ? "seguimiento" : "credito";
    setTab(next); document.getElementById(`payjoy-${next}-tab`)?.focus();
  }
  const otherNavigation = navigation.filter(item => item.href !== ROUTE);
  const mainNavigation = [...otherNavigation.slice(0, 5), navigation.find(item => item.href === ROUTE) || DEFAULT_NAVIGATION[3]];
  const moreNavigation = otherNavigation.slice(5);
  const filtered = extensions.filter(item => (!statusFilter || item.status === statusFilter) && normalize([item.deviceTag, item.imei, item.asesorNombre, OPERATION_LABELS[item.status], FOLLOW_UP_LABELS[item.followUp.status]].filter(Boolean).join(" ")).includes(normalize(query)));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const checkPages = Math.max(1, Math.ceil(checks.length / 10));
  const currentCheckPage = Math.min(checkPage, checkPages);
  const visibleChecks = checks.slice((currentCheckPage - 1) * 10, currentCheckPage * 10);

  return <div className={base.page}><div className={base.content}>
    <header className={base.topbar}>
      <Link href="/dashboard" className={base.brand}><Image src="/branding/conectamos-logo.png" width={42} height={42} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={base.navigation} aria-label="Navegación principal"><div className={base.navLinks}>{mainNavigation.map(item => <Link key={item.href} href={item.href} className={`${base.navItem} ${item.href === ROUTE ? base.navActive : ""}`} aria-current={item.href === ROUTE ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div>{moreNavigation.length > 0 && <details className={base.moreNavigation}><summary>Más<DashboardIcon name="chevron" /></summary><div className={base.moreMenu}>{moreNavigation.map(item => <Link key={item.href} href={item.href} className={base.navItem}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div></details>}</nav>
      <div className={base.profileWrap}><SalesProfile name={session.nombre} role={session.roleLabel || session.sedeNombre} /></div>
    </header>
    <main className={base.main}>
      <div className={base.heading}><div><nav className={base.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="chevron" /><span>Servicios PayJoy</span></nav><h1>Crédito y seguimiento PayJoy</h1><p>Consulta el crédito del equipo y comprueba el estado posterior de tus extensiones.</p></div><span className={base.context}><DashboardIcon name="store" />{session.sedeNombre}</span></div>
      <div className={styles.tabs}><div className={styles.tabList} role="tablist" aria-label="Consulta de PayJoy">
        <button id="payjoy-credito-tab" type="button" role="tab" aria-selected={tab === "credito"} aria-controls="payjoy-credito-panel" tabIndex={tab === "credito" ? 0 : -1} className={styles.tab} onClick={() => setTab("credito")} onKeyDown={moveTab}><DashboardIcon name="document-search" />Ficha del crédito</button>
        <button id="payjoy-seguimiento-tab" type="button" role="tab" aria-selected={tab === "seguimiento"} aria-controls="payjoy-seguimiento-panel" tabIndex={tab === "seguimiento" ? 0 : -1} className={styles.tab} onClick={() => setTab("seguimiento")} onKeyDown={moveTab}><DashboardIcon name="clock" />Seguimiento de extensiones</button>
        </div><Link href={extensionLink(check?.deviceTag || null)} className={styles.tab}><DashboardIcon name="arrow" />Gestionar extensión</Link>
      </div>
      {error && <div className={base.error} role="alert" id="payjoy-credit-error"><DashboardIcon name="warning" /><p>{error}</p></div>}
      {historyError && <div className={base.error} role="alert"><DashboardIcon name="warning" /><p>{historyError}</p><button className={base.button} disabled={loading || busy} onClick={() => void loadHistory()}>Reintentar historial</button></div>}
      <div id="payjoy-credito-panel" role="tabpanel" aria-labelledby="payjoy-credito-tab" hidden={tab !== "credito"}>
        <div className={styles.layout}>
            <section className={`${base.panel} ${styles.searchPanel}`} aria-labelledby="credit-search-title">
              <div className={base.sectionHeading}><span className={base.sectionIcon}><DashboardIcon name="search" /></span><div><p>Consulta del equipo</p><h2 id="credit-search-title">Buscar crédito</h2></div></div>
              <p className={styles.searchIntro}>Consulta cualquier equipo con su código PayJoy o IMEI. Cada consulta queda registrada con tu perfil.</p>
              <form className={styles.searchForm} onSubmit={event => { event.preventDefault(); void consult(identifier); }}>
                <label htmlFor="payjoy-credit-identifier">Código PayJoy o IMEI</label>
                <input id="payjoy-credit-identifier" value={identifier} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} aria-invalid={fieldError} aria-describedby={fieldError ? "payjoy-credit-error" : "payjoy-credit-help"} onChange={event => { setIdentifier(event.target.value.toUpperCase()); setFieldError(false); }} />
                <small id="payjoy-credit-help">El código empieza con D. El IMEI tiene 15 o 16 dígitos. Son distintos de la cédula del cliente.</small>
                <button type="submit" className={`${base.button} ${base.primary}`} disabled={busy}><DashboardIcon name={busy ? "refresh" : "search"} />{busy ? "Consultando PayJoy…" : "Consultar crédito"}</button>
              </form>
              <p className={styles.hint}>La apertura de esta pantalla muestra consultas guardadas. PayJoy se consulta únicamente al pulsar Consultar crédito o Actualizar datos.</p>
            </section>
          <section className={`${base.panel} ${styles.resultPanel}`} aria-labelledby="credit-result-title" aria-busy={busy}>
            <div className={base.sectionHeading}><span className={base.sectionIcon}><DashboardIcon name="wallet" /></span><div><p>Respuesta de PayJoy</p><h2 id="credit-result-title" tabIndex={-1} ref={resultHeading}>Ficha del crédito</h2></div></div>
            {busy ? <div className={base.empty} role="status"><DashboardIcon name="refresh" /><h3>Consultando el crédito…</h3><p>Estamos consultando los datos disponibles para {checkingDevice}.</p></div> : !check ? <div className={base.empty}><DashboardIcon name="document-search" /><h3>Consulta un equipo para comenzar</h3><p>Aquí aparecerán los datos que PayJoy informe. Los campos ausentes se mostrarán como no informados.</p></div> : <>
              <div className={styles.panelTitle}><div><span className={`${base.status} ${checkTone(check)}`}>{CHECK_LABELS[check.status]}</span><p>{date(check.completedAt || check.createdAt)} · {check.asesorNombre}</p></div><button className={base.button} disabled={busy || check.status === "CONSULTANDO"} onClick={() => void consult(check.deviceTag || check.imei || check.identifier)}><DashboardIcon name="refresh" />Actualizar datos</button></div>
              <CreditDetails check={check} />
              {check.status === "CONSULTANDO" && <button className={base.button} disabled={loading} onClick={() => void loadHistory()}>Recuperar resultado</button>}
              {check.deviceTag && <div className={base.actions}><button className={base.button} onClick={() => { setQuery(check.deviceTag || ""); setStatusFilter(""); setPage(1); setTab("seguimiento"); }}>Ver seguimiento</button><Link className={`${base.button} ${base.primary}`} href={extensionLink(check.deviceTag)}>Consultar extensiones<DashboardIcon name="arrow" /></Link></div>}
            </>}
          </section>
          <section className={`${base.panel} ${styles.historyPanel}`} aria-labelledby="credit-history-title" aria-busy={loading}>
            <div className={base.sectionHeading}><span className={base.sectionIcon}><DashboardIcon name="document" /></span><div><p>Trazabilidad</p><h2 id="credit-history-title">Consultas recientes</h2></div></div>
            <button className={`${base.button} ${base.full}`} disabled={loading || busy} onClick={() => void loadHistory()}><DashboardIcon name="refresh" />{loading ? "Cargando historial…" : "Actualizar historial"}</button>
            <p className={styles.hint}>Últimas 30 consultas de tu perfil y sede. Ver una consulta guardada no vuelve a consultar PayJoy.</p>
            <ul className={styles.savedList}>{visibleChecks.map(item => <li key={item.id}><div className={styles.savedItem}><div><strong>{item.deviceTag || item.imei || item.identifier}</strong><small>{date(item.createdAt)}</small><small>{CHECK_LABELS[item.status]} · {item.asesorNombre}</small></div><button className={base.button} disabled={busy} onClick={() => showCheck(item)} aria-label={`Ver consulta de ${item.deviceTag || item.imei || item.identifier} del ${date(item.createdAt)}`}>Ver consulta</button></div></li>)}</ul>
            {!loading && checks.length === 0 && <p className={styles.hint}>Todavía no hay consultas guardadas.</p>}
            {checkPages > 1 && <nav className={styles.pagination} aria-label="Páginas de consultas guardadas"><span>Página {currentCheckPage} de {checkPages}</span><div><button className={base.button} disabled={busy || currentCheckPage <= 1} onClick={() => setCheckPage(currentCheckPage - 1)} aria-label="Consultas anteriores">Anterior</button><button className={base.button} disabled={busy || currentCheckPage >= checkPages} onClick={() => setCheckPage(currentCheckPage + 1)} aria-label="Más consultas guardadas">Siguiente</button></div></nav>}
          </section>
        </div>
      </div>
      <section id="payjoy-seguimiento-panel" role="tabpanel" aria-labelledby="payjoy-seguimiento-tab" hidden={tab !== "seguimiento"}>
        <div className={base.panel}>
          <div className={base.sectionHeading}><span className={base.sectionIcon}><DashboardIcon name="clock" /></span><div><p>Estado posterior de tus gestiones</p><h2>Seguimiento de extensiones</h2></div></div>
          <p className={styles.trackingIntro}>Últimas 30 operaciones de tu perfil y sede. Una comprobación consulta el crédito del equipo y conserva el resultado original de la extensión. No ejecuta otra extensión ni resuelve automáticamente una gestión indeterminada.</p>
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
                <div><dt>Saldo en la comprobación</dt><dd>{money(item.followUp.remainingBalance, item.followUp.currency)}</dd></div>
                <div><dt>Pago completo en la comprobación</dt><dd>{item.followUp.paidInFull === true ? "Sí, informado por PayJoy" : item.followUp.paidInFull === false ? "No" : "No informado"}</dd></div>
                <div><dt>IMEI</dt><dd>{item.imei || "No informado"}</dd></div>
              </dl>
              <div className={styles.followup}><DashboardIcon name={item.followUp.status === "REQUIERE_REVISION" ? "warning" : "document-search"} /><div><p>{item.followUp.message}</p><small>{item.followUp.checkedAt ? `Comprobación del ${date(item.followUp.checkedAt)}` : "Sin comprobación posterior guardada."}</small>{item.followUp.paymentAfterExtension && <small>Pago posterior informado: {money(item.followUp.paymentAfterExtension.amount, item.followUp.paymentAfterExtension.currency)} · {date(item.followUp.paymentAfterExtension.paidAt)}</small>}</div></div>
              <div className={styles.trackingActions}><small>Consultar el equipo no modifica esta operación.</small>{item.followUp.checkId && checks.some(saved => saved.id === item.followUp.checkId) && <button className={base.button} disabled={busy} onClick={() => { const saved = checks.find(value => value.id === item.followUp.checkId); if (saved) showCheck(saved); }}>Ver comprobación</button>}<button className={base.button} disabled={busy || !(item.deviceTag || item.imei)} onClick={() => void consult(item.deviceTag || item.imei || "")}><DashboardIcon name="refresh" />{busy && checkingDevice === (item.deviceTag || item.imei) ? "Comprobando…" : "Comprobar equipo"}</button><Link className={base.button} href={extensionLink(item.deviceTag)}>Ver módulo de extensiones<DashboardIcon name="arrow" /></Link></div>
            </li>)}</ul>}
          <div className={styles.pagination}><span>{filtered.length} operaciones{filtered.length ? ` · página ${currentPage} de ${pages}` : ""}</span><div><button className={base.button} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button className={base.button} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></div>
        </div>
      </section>
    </main>
  </div></div>;
}
