"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import {
  PAYJOY_DAPTA_AGREEMENT,
  PAYJOY_DAPTA_DEVICE_LIMIT,
  type PayJoyDaptaBatchResponse,
  type PayJoyDaptaBatchSummary,
  type PayJoyDaptaBatchView,
  type PayJoyDaptaHistoryResponse,
  type PayJoyDaptaItemView,
} from "@/lib/payjoy-dapta-types";
import styles from "./dapta.module.css";

const API = "/api/payjoy/dapta";
const NAVIGATION = [
  { href: "/dashboard", label: "Inicio", icon: "home" as const },
  { href: "/dashboard/payjoy", label: "Cartera PayJoy", icon: "receivable" as const },
  { href: "/dashboard/payjoy/dapta", label: "Preparación Dapta", icon: "document" as const },
];
const LOOKUP_LABELS = { PENDING: "Consulta pendiente", CHECKING: "Consulta en curso", FOUND: "Móvil encontrado", MISSING: "Sin móvil disponible", ERROR: "Error de consulta" };
type CopyStatus = "copying" | "copied" | "error";
function dateLabel(value: string | null) {
  if (!value) return "Sin consulta";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Fecha no disponible";
}
function parseDevices(value: string) {
  const tokens = value.toUpperCase().trim().split(/[\s,;]+/).filter(Boolean);
  const unique = [...new Set(tokens)];
  return { devices: unique.filter(item => /^D[A-Z0-9]{5,31}$/.test(item)), invalid: unique.filter(item => !/^D[A-Z0-9]{5,31}$/.test(item)), duplicates: tokens.length - unique.length };
}
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo completar la consulta. El borrador guardado se conserva.");
  if (!data || data.sendingEnabled !== false) throw new Error("La respuesta del módulo no se pudo verificar. Actualiza el historial antes de continuar.");
  return data as T;
}
function batchSummary(batch: PayJoyDaptaBatchView): PayJoyDaptaBatchSummary {
  return { id: batch.id, status: batch.status, agreement: batch.agreement, createdAt: batch.createdAt, updatedAt: batch.updatedAt, createdBy: batch.createdBy, counts: batch.counts };
}
function ContactItem({ item, duplicateDevice, copyStatus, copying, onCopy }: {
  item: PayJoyDaptaItemView;
  duplicateDevice?: string;
  copyStatus?: CopyStatus;
  copying: boolean;
  onCopy: () => Promise<void>;
}) {
  const tone = item.lookupStatus === "FOUND" ? styles.found : item.lookupStatus === "ERROR" ? styles.failed : "";
  return <li className={styles.contact}>
    <div className={styles.contactHeading}><h3>{item.deviceTag}</h3><span className={`${styles.status} ${tone}`}>{LOOKUP_LABELS[item.lookupStatus]}</span></div>
    <dl className={styles.contactFields}>
      <div><dt>Celular informado por PayJoy</dt><dd className={item.phone ? styles.phone : undefined}>{item.phone || "No disponible"}</dd></div>
      <div><dt>Origen del dato</dt><dd>{item.phoneSource === "PAYJOY_NEQUI_PREFILL" ? "Dato precargado en Nequi por PayJoy" : "Sin dato de origen"}</dd></div>
      <div><dt>Titularidad del número</dt><dd><span className={`${styles.status} ${styles.warning}`}>Pendiente de verificar</span></dd></div>
      <div><dt>Autorización de contacto</dt><dd><span className={`${styles.status} ${styles.warning}`}>Pendiente de revisar</span></dd></div>
    </dl>
    {item.phone && <p className={styles.contactNote}>Coincide con el dato prellenado en Nequi. Titularidad y autorización de contacto pendientes.</p>}
    {item.errorMessage && <p className={styles.contactError}>{item.errorMessage}</p>}
    {item.lookupStatus === "MISSING" && <p className={styles.contactNote}>PayJoy no devolvió un móvil utilizable para este dispositivo. No se completó con datos de otra fuente.</p>}
    {item.reviewStatus === "DUPLICATE_PHONE" && <p className={styles.duplicate}>El mismo móvil aparece en {duplicateDevice || "otro dispositivo de este lote"}. Se marcó como duplicado para revisar; no se genera un segundo mensaje.</p>}
    {item.messagePreview && item.reviewStatus !== "DUPLICATE_PHONE" && <details className={styles.preview}>
      <summary>Borrador del mensaje · Efecty {PAYJOY_DAPTA_AGREEMENT}<DashboardIcon name="chevron" /></summary>
      <div className={styles.previewLabel}><span className={styles.status}>Vista previa · Sin enviar</span></div>
      <p className={styles.message}>{item.messagePreview}</p>
      <div className={styles.copyActions}>
        <button type="button" className={styles.button} disabled={copying} aria-label={`Copiar mensaje de ${item.deviceTag}`} aria-describedby={`copy-message-${item.id}`} onClick={onCopy}>{copyStatus === "copying" ? "Copiando…" : "Copiar mensaje"}</button>
        <p id={`copy-message-${item.id}`} className={`${styles.copyFeedback} ${copyStatus === "error" ? styles.copyError : ""}`} role="status" aria-live="polite" aria-atomic="true">{copyStatus === "copied" ? "Mensaje copiado." : copyStatus === "error" ? "No se pudo copiar. Selecciona el texto y cópialo manualmente." : ""}</p>
      </div>
      <p className={styles.previewFooter}>Vista previa guardada. No enviada a Dapta ni al cliente.</p>
    </details>}
    <p className={styles.contactNote}>Última consulta: {dateLabel(item.checkedAt)}</p>
  </li>;
}

export default function PayJoyDaptaWorkspace({ user }: { user: { nombre: string; rolNombre: string; sedeNombre: string } }) {
  const [input, setInput] = useState("");
  const [batch, setBatch] = useState<PayJoyDaptaBatchView | null>(null);
  const [batches, setBatches] = useState<PayJoyDaptaBatchSummary[]>([]);
  const [busy, setBusy] = useState<"create" | "validate" | "retry" | "open" | null>(null);
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  const [progress, setProgress] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [copyState, setCopyState] = useState<{ itemId: string; message: string; status: CopyStatus } | null>(null);
  const mutationLock = useRef(false);
  const copyLock = useRef(false);
  const createAttempt = useRef<{ signature: string; requestId: string } | null>(null);
  const retryAttempt = useRef<{ batchId: string; requestId: string } | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const version = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const parsed = parseDevices(input);

  async function copyMessage(item: PayJoyDaptaItemView) {
    if (copyLock.current || !item.messagePreview || item.reviewStatus === "DUPLICATE_PHONE") return;
    const selection = { itemId: item.id, message: item.messagePreview };
    copyLock.current = true;
    setCopyState({ ...selection, status: "copying" });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(selection.message);
      setCopyState({ ...selection, status: "copied" });
    } catch {
      setCopyState({ ...selection, status: "error" });
    } finally { copyLock.current = false; }
  }

  const loadHistory = useCallback(async () => {
    historyAbort.current?.abort();
    const controller = new AbortController(); historyAbort.current = controller;
    const currentVersion = version.current;
    setHistoryLoading(true); setHistoryError("");
    try {
      const data = await readResponse<PayJoyDaptaHistoryResponse>(await fetch(API, { cache: "no-store", signal: controller.signal }));
      if (!Array.isArray(data.batches)) throw new Error("No se pudo verificar el historial de borradores.");
      if (!controller.signal.aborted && currentVersion === version.current) setBatches(data.batches);
    } catch (cause) {
      if (!controller.signal.aborted) setHistoryError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
    } finally { if (!controller.signal.aborted) setHistoryLoading(false); }
  }, []);
  useEffect(() => { void loadHistory(); return () => historyAbort.current?.abort(); }, [loadHistory]);

  function showBatch(value: PayJoyDaptaBatchView) {
    setBatch(value);
    setBatches(current => [batchSummary(value), ...current.filter(item => item.id !== value.id)].slice(0, 20));
  }
  async function post(body: Record<string, unknown>) {
    const data = await readResponse<PayJoyDaptaBatchResponse>(await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) }));
    if (!data.batch?.id || !Array.isArray(data.batch.items) || !data.batch.counts || data.batch.status !== "DRAFT_ONLY") throw new Error("No se pudo verificar el borrador. Revisa el historial antes de continuar.");
    showBatch(data.batch);
    return data;
  }
  async function validateBlocks(batchId: string, retryRequestId?: string) {
    let last: PayJoyDaptaBatchResponse | null = null;
    for (let round = 0; round < PAYJOY_DAPTA_DEVICE_LIMIT; round += 1) {
      const data = await post(round === 0 && retryRequestId
        ? { action: "retry", batchId, requestId: retryRequestId }
        : { action: "validate", batchId });
      last = data;
      const completed = data.batch.counts.total - data.batch.counts.pending - data.batch.counts.checking;
      setProgress(`Borrador guardado · ${completed} de ${data.batch.counts.total} dispositivos consultados. Ningún mensaje enviado.`);
      if (!data.hasMore || data.processedCount === 0) break;
    }
    if (last?.hasMore || last?.batch.counts.checking) setProgress("El borrador está guardado y quedan consultas pendientes. Actualiza el borrador o continúa la consulta cuando corresponda.");
    return last;
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (mutationLock.current) return;
    setInputError(""); setError("");
    if (parsed.invalid.length) { setInputError(`Revisa los códigos: ${parsed.invalid.slice(0, 3).join(", ")}. Usa únicamente identificadores PayJoy que comiencen con D.`); return; }
    if (!parsed.devices.length || parsed.devices.length > PAYJOY_DAPTA_DEVICE_LIMIT) { setInputError(`Ingresa entre 1 y ${PAYJOY_DAPTA_DEVICE_LIMIT} dispositivos distintos.`); return; }
    const signature = JSON.stringify(parsed.devices);
    if (createAttempt.current?.signature !== signature) createAttempt.current = { signature, requestId: crypto.randomUUID() };
    mutationLock.current = true; version.current += 1; setBusy("create"); setProgress("Guardando el borrador antes de consultar PayJoy…");
    try {
      const data = await post({ action: "create", requestId: createAttempt.current.requestId, devices: parsed.devices });
      if (data.hasMore) { setBusy("validate"); setProgress("Consultando móviles sugeridos en PayJoy…"); await validateBlocks(data.batch.id); }
      else setProgress("Borrador guardado. Las consultas registradas se conservaron; ningún mensaje fue enviado.");
      resultHeading.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo recuperar el resultado. Puedes reintentar con los mismos códigos o abrir el borrador desde el historial.");
      setProgress("");
    } finally { mutationLock.current = false; setBusy(null); }
  }
  async function continueBatch(retry = false) {
    if (mutationLock.current || !batch) return;
    mutationLock.current = true; version.current += 1; setBusy(retry ? "retry" : "validate"); setError(""); setProgress("Consultando los dispositivos pendientes en PayJoy…");
    if (retry && retryAttempt.current?.batchId !== batch.id) retryAttempt.current = { batchId: batch.id, requestId: crypto.randomUUID() };
    try {
      await validateBlocks(batch.id, retry ? retryAttempt.current?.requestId : undefined);
      if (retry) retryAttempt.current = null;
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "La consulta se interrumpió. El borrador y los resultados guardados se conservan. Actualiza su estado antes de continuar."); setProgress("");
    } finally { mutationLock.current = false; setBusy(null); }
  }
  async function openBatch(id: string) {
    if (mutationLock.current) return;
    mutationLock.current = true; version.current += 1; setBusy("open"); setError(""); setProgress("");
    try {
      const data = await readResponse<PayJoyDaptaBatchResponse>(await fetch(`${API}?batchId=${encodeURIComponent(id)}`, { cache: "no-store" }));
      if (!data.batch?.id || !Array.isArray(data.batch.items)) throw new Error("No se pudo recuperar el detalle del borrador.");
      showBatch(data.batch); resultHeading.current?.focus();
    } catch (cause) { setError(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo abrir el borrador. Intenta de nuevo."); }
    finally { mutationLock.current = false; setBusy(null); }
  }

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, ir al inicio"><Image src="/branding/conectamos-logo.png" alt="" width={40} height={40} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación PayJoy">{NAVIGATION.map(item => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href.endsWith("/dapta") ? styles.navActive : ""}`} aria-current={item.href.endsWith("/dapta") ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</nav>
      <SalesProfile name={user.nombre} role={user.rolNombre} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>PayJoy · Preparación de contactos</p><h1>Borradores para Dapta</h1><p>Consulta móviles sugeridos y revisa el contenido antes de cualquier gestión de contacto.</p></div><div className={styles.convention}><span>Convenio Efecty</span><strong>{PAYJOY_DAPTA_AGREEMENT}</strong></div></div>
      <div className={styles.notice} role="note"><DashboardIcon name="lock" /><div><strong>Envío deshabilitado</strong><p>Este módulo guarda borradores en CONECTAMOS. No envía mensajes, no carga contactos en Dapta y no confirma la titularidad ni la autorización de contacto.</p></div></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {progress && <div className={styles.progress} role="status" aria-live="polite"><DashboardIcon name={busy ? "refresh" : "document"} /><span>{progress}</span></div>}
      <div className={styles.workspace}>
        <section className={styles.panel} aria-labelledby="devices-title" aria-busy={busy === "create" || busy === "validate"}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="barcode" /></span><div><p>1. Dispositivos</p><h2 id="devices-title">Preparar lote</h2></div></div>
          <p className={styles.description}>Pega los códigos de dispositivo del reporte de PayJoy. Los códigos repetidos se consolidan antes de la consulta.</p>
          <form className={styles.form} onSubmit={create}>
            <label htmlFor="dapta-devices">Identificadores PayJoy</label>
            <textarea id="dapta-devices" value={input} maxLength={5000} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={Boolean(busy)} onChange={event => { setInput(event.target.value); setInputError(""); }} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? "dapta-device-error dapta-device-help" : "dapta-device-help"} />
            <small id="dapta-device-help">Códigos que empiezan con D, separados por saltos de línea, espacios, comas o punto y coma. Máximo {PAYJOY_DAPTA_DEVICE_LIMIT} equipos distintos.</small>
            <div className={styles.inputSummary}><span><strong>{parsed.devices.length}</strong> equipos válidos</span>{parsed.duplicates > 0 && <span>{parsed.duplicates} repetidos omitidos</span>}{parsed.invalid.length > 0 && <span>{parsed.invalid.length} por corregir</span>}</div>
            {inputError && <p className={styles.contactError} id="dapta-device-error" role="alert">{inputError}</p>}
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={Boolean(busy)}><DashboardIcon name="search" />{busy === "create" ? "Guardando borrador…" : busy === "validate" ? "Consultando contactos…" : "Consultar contactos y guardar"}</button>
          </form>
          <div className={styles.scope}><DashboardIcon name="shield" /><p>Consulta administrativa de PayJoy. El móvil puede provenir del dato precargado para Nequi y requiere verificar a quién pertenece.</p></div>
        </section>

        <section className={styles.panel} aria-labelledby="results-title" aria-busy={Boolean(busy)}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="users" /></span><div><p>2. Revisión del borrador</p><h2 id="results-title" ref={resultHeading} tabIndex={-1}>Contactos y mensajes</h2></div></div>
          {!batch ? <div className={styles.empty}><DashboardIcon name="document-search" /><h3>Consulta los equipos para revisar sus contactos</h3><p>Verás el móvil sugerido, su origen y el borrador del mensaje con el convenio Efecty {PAYJOY_DAPTA_AGREEMENT}.</p></div> : <>
            <div className={styles.batchHeading}><span className={styles.status}>Borrador · Sin envío</span><p>Creado el {dateLabel(batch.createdAt)} · {batch.createdBy}</p></div>
            <div className={styles.stats} aria-label="Resumen del lote"><div><strong>{batch.counts.total}</strong><span>Equipos en el lote</span></div><div><strong>{batch.counts.found}</strong><span>Móviles encontrados</span></div><div><strong>{batch.counts.duplicatePhones}</strong><span>Móviles duplicados</span></div></div>
            <div className={styles.batchActions}>
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => void openBatch(batch.id)}><DashboardIcon name="refresh" />Actualizar borrador</button>
              {batch.counts.pending > 0 && <button className={`${styles.button} ${styles.graphite}`} disabled={Boolean(busy)} onClick={() => void continueBatch()}>Continuar consulta ({batch.counts.pending})</button>}
              {(batch.counts.error > 0 || batch.counts.checking > 0) && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void continueBatch(true)}>Reintentar consultas pendientes</button>}
            </div>
            <div className={styles.reviewNotice}><DashboardIcon name="warning" /><p>Encontrar un móvil no acredita su titularidad. Todos los contactos permanecen pendientes de revisión. Este borrador no consulta saldos ni cuotas y no afirma que exista mora.</p></div>
            <ul className={styles.contacts}>{batch.items.map(item => <ContactItem key={item.id} item={item} duplicateDevice={batch.items.find(other => other.id === item.duplicateOfId)?.deviceTag} copyStatus={copyState?.itemId === item.id && copyState.message === item.messagePreview ? copyState.status : undefined} copying={copyState?.status === "copying"} onCopy={() => copyMessage(item)} />)}</ul>
          </>}
        </section>
      </div>

      <section className={`${styles.panel} ${styles.history}`} aria-labelledby="history-title" aria-busy={historyLoading}>
        <div className={styles.historyHeading}><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><div><p>Borradores guardados</p><h2 id="history-title">Historial de lotes</h2></div></div><button className={styles.button} disabled={Boolean(busy) || historyLoading} onClick={() => void loadHistory()}><DashboardIcon name="refresh" />{historyLoading ? "Cargando historial…" : "Actualizar historial"}</button></div>
        <p className={styles.historyHelp}>Los últimos 20 lotes guardados. Abrir o actualizar un borrador solo recupera lo registrado en CONECTAMOS; no vuelve a consultar PayJoy.</p>
        {historyError && <p className={styles.error} role="alert">{historyError}</p>}
        {historyLoading && !batches.length ? <p className={styles.historyEmpty} role="status">Cargando borradores…</p> : !batches.length && !historyError ? <p className={styles.historyEmpty}>Todavía no hay lotes guardados.</p> : <ul className={styles.historyList}>{batches.map(item => <li key={item.id}>
          <div><strong>Borrador del {dateLabel(item.createdAt)}</strong><span>{item.createdBy} · Efecty {item.agreement}</span><span>Sin envío · Actualizado {dateLabel(item.updatedAt)}</span></div>
          <div className={styles.historyNumbers}><strong>{item.counts.total}</strong> equipos · <strong>{item.counts.found}</strong> móviles encontrados<span>{item.counts.pending + item.counts.checking} consultas pendientes · {item.counts.error} con error</span></div>
          <button className={styles.button} disabled={Boolean(busy)} onClick={() => void openBatch(item.id)}>Abrir borrador<span className={styles.srOnly}> del {dateLabel(item.createdAt)}</span><DashboardIcon name="arrow" /></button>
        </li>)}</ul>}
      </section>
    </main>
  </div>;
}
