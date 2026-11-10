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
import {
  PAYJOY_VOICE_EXPIRES_AT, PAYJOY_VOICE_MAX_CALLS, PAYJOY_VOICE_SCHEDULED_AT,
  type PayJoyVoiceCallStatus, type PayJoyVoiceViewResponse,
} from "@/lib/payjoy-voice-types";
import styles from "./dapta.module.css";

const API = "/api/payjoy/dapta";
const VOICE_API = "/api/payjoy/voz";
const NAVIGATION = [
  { href: "/dashboard", label: "Inicio", icon: "home" as const },
  { href: "/dashboard/payjoy", label: "Cartera PayJoy", icon: "receivable" as const },
  { href: "/dashboard/payjoy/dapta", label: "Gestión Dapta", icon: "document" as const },
];
const LOOKUP_LABELS = { PENDING: "Consulta pendiente", CHECKING: "Consulta en curso", FOUND: "Móvil encontrado", MISSING: "Sin móvil disponible", ERROR: "Error de consulta" };
type CopyStatus = "copying" | "copied" | "error";
const VOICE_CALL_LABELS: Record<PayJoyVoiceCallStatus, string> = {
  PENDING: "Pendiente", CHECKING: "Comprobando datos", DISPATCHING: "Solicitando llamada",
  ACCEPTED: "Aceptada por Dapta · atención no confirmada", IN_PROGRESS: "Llamada en curso",
  COMPLETED: "Llamada finalizada", SKIPPED: "Omitida", HELD: "Retenida para revisión",
  UNKNOWN: "Resultado indeterminado · revisar", CANCELLED: "Cancelada",
};
const VOICE_BATCH_LABELS = { SCHEDULED: "Programada", CANCELLED: "Cancelada", COMPLETED: "Gestión finalizada", EXPIRED: "Ventana finalizada" };
const VOICE_BLOCKERS: Record<string, string> = {
  SOURCE_NOT_READY: "Completa la consulta de todos los móviles del lote antes de programar.",
  DUPLICATE_PHONE: "El lote contiene móviles duplicados. Revisa los contactos antes de programar.",
  CAMPAIGN_ALREADY_EXISTS: "Ya existe una programación para esta fecha. No se creará otra campaña.",
  WINDOW_EXPIRED: "La ventana de programación del 10 de noviembre de 2026 ya terminó.",
};
const VOICE_OUTCOMES: Record<string, string> = {
  PAID_REPORTED: "La persona informó un pago · pendiente de comprobar", PAYMENT_INTENT: "Intención de pago informada",
  WRONG_NUMBER: "Número equivocado", THIRD_PARTY: "Respondió un tercero", NO_CONTACT: "Sin contacto", OPT_OUT: "Solicitó no recibir contactos",
  DECLINED: "Contacto rechazado", OTHER: "Resultado pendiente de revisión",
};
const VOICE_REASONS: Record<string, string> = {
  PHONE_CHANGED: "El móvil cambió en PayJoy. Debe revisarse antes de contactar.",
  PHONE_CONFLICT: "PayJoy devolvió móviles en conflicto. Debe revisarse la identidad.",
  DEVICE_MISMATCH: "El equipo no coincide con la consulta de PayJoy.",
  UNSUPPORTED_COUNTRY: "El país del equipo no coincide con esta programación.",
  CONFIGURATION_CHANGED: "La configuración cambió después de programar. Revisión pendiente.",
  CANCELLED_BY_USER: "Cancelada por un usuario autorizado.", WINDOW_EXPIRED: "La ventana autorizada terminó.",
  NO_CONTACT: "No se logró contacto en esta llamada.", OPT_OUT: "Este móvil quedó excluido por solicitud de no recibir contactos.",
  INTERRUPTED: "La gestión se interrumpió; el resultado requiere revisión.",
  PROVIDER_UNCERTAIN: "Dapta no confirmó el resultado. No se repetirá la llamada automáticamente.",
  TIMEOUT: "La comprobación previa tardó demasiado.", UNAVAILABLE: "PayJoy no estuvo disponible para comprobar el contacto.",
  RATE_LIMIT: "PayJoy limitó la consulta previa.", AUTH: "No se pudo autenticar la consulta previa.",
  NOT_FOUND: "No se encontró el equipo en la comprobación previa.", INVALID_RESPONSE: "No se pudo verificar la respuesta de PayJoy.",
  PREFLIGHT_FAILED: "No se pudo completar la comprobación previa.",
  PAID_IN_FULL: "PayJoy reportó el crédito pagado; la llamada se omitió.",
  CURRENT_VALID_THROUGH: "La vigencia informada por PayJoy cubre esta fecha; la llamada se omitió.",
};
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
async function readVoiceResponse(response: Response, sourceBatchId: string): Promise<PayJoyVoiceViewResponse> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo recuperar el estado de las llamadas. Actualízalo antes de continuar.");
  if (!data || data.sourceBatchId !== sourceBatchId || typeof data.configuration?.ready !== "boolean"
    || data.scheduledAt !== PAYJOY_VOICE_SCHEDULED_AT || data.expiresAt !== PAYJOY_VOICE_EXPIRES_AT
    || data.timezone !== "America/Bogota" || data.maxCalls !== PAYJOY_VOICE_MAX_CALLS
    || !Number.isInteger(data.eligibleCount) || data.eligibleCount < 0 || data.eligibleCount > PAYJOY_DAPTA_DEVICE_LIMIT
    || !Array.isArray(data.blockers) || data.blockers.some((item: unknown) => typeof item !== "string")
    || (data.batch !== null && (!data.batch?.id || !Array.isArray(data.batch.calls)
      || !Object.hasOwn(VOICE_BATCH_LABELS, data.batch.status) || typeof data.batch.canCancel !== "boolean"
      || data.batch.calls.some((call: { id?: unknown; deviceTag?: unknown; phoneMasked?: unknown; status?: string } | null) => !call
        || typeof call.id !== "string" || typeof call.deviceTag !== "string" || typeof call.phoneMasked !== "string"
        || !call.status || !Object.hasOwn(VOICE_CALL_LABELS, call.status))))) {
    throw new Error("No se pudo verificar la programación. Actualiza el estado de llamadas antes de continuar.");
  }
  return data as PayJoyVoiceViewResponse;
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
  const [voiceData, setVoiceData] = useState<PayJoyVoiceViewResponse | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceAction, setVoiceAction] = useState<"schedule" | "cancel" | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [voiceReview, setVoiceReview] = useState(false);
  const [voiceOwnership, setVoiceOwnership] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceCancelReview, setVoiceCancelReview] = useState(false);
  const mutationLock = useRef(false);
  const copyLock = useRef(false);
  const voiceLock = useRef(false);
  const voiceSource = useRef<string | null>(null);
  const voiceVersion = useRef(0);
  const voiceAbort = useRef<AbortController | null>(null);
  const voiceAttempt = useRef<{ sourceBatchId: string; requestId: string } | null>(null);
  const createAttempt = useRef<{ signature: string; requestId: string } | null>(null);
  const retryAttempt = useRef<{ batchId: string; requestId: string } | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const version = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const parsed = parseDevices(input);
  const voice = voiceData?.sourceBatchId === batch?.id ? voiceData : null;
  const voiceSourceReady = Boolean(batch && batch.items.length > 0 && batch.items.length <= PAYJOY_VOICE_MAX_CALLS
    && batch.items.every(item => item.lookupStatus === "FOUND" && item.phone && item.reviewStatus !== "DUPLICATE_PHONE")
    && new Set(batch.items.map(item => item.phone)).size === batch.items.length);
  const voiceCanSchedule = Boolean(voice && voice.configuration.ready && !voice.batch && !voice.blockers.length
    && voiceSourceReady && voice.eligibleCount === batch?.items.length);
  const voiceDisabled = Boolean(busy || voiceLoading || voiceAction);
  const draftDisabled = Boolean(busy || voiceAction);

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
  useEffect(() => { void loadHistory(); return () => { historyAbort.current?.abort(); voiceAbort.current?.abort(); }; }, [loadHistory]);

  async function loadVoice(sourceBatchId: string) {
    if (voiceLock.current) return;
    voiceAbort.current?.abort();
    const controller = new AbortController(); voiceAbort.current = controller;
    const generation = ++voiceVersion.current;
    voiceSource.current = sourceBatchId;
    setVoiceReview(false); setVoiceOwnership(false); setVoiceConsent(false); setVoiceCancelReview(false);
    setVoiceLoading(true); setVoiceError("");
    try {
      const data = await readVoiceResponse(await fetch(`${VOICE_API}?sourceBatchId=${encodeURIComponent(sourceBatchId)}`, { cache: "no-store", signal: controller.signal }), sourceBatchId);
      if (!controller.signal.aborted && generation === voiceVersion.current && voiceSource.current === sourceBatchId) setVoiceData(data);
    } catch (cause) {
      if (!controller.signal.aborted && generation === voiceVersion.current) {
        setVoiceData(null);
        setVoiceError(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo consultar la programación. Actualiza el estado de llamadas.");
      }
    } finally { if (!controller.signal.aborted && generation === voiceVersion.current) setVoiceLoading(false); }
  }

  async function scheduleVoice() {
    if (voiceLock.current || mutationLock.current || voiceDisabled || !batch || !voiceCanSchedule || !voiceReview || !voiceOwnership || !voiceConsent) return;
    if (voiceAttempt.current?.sourceBatchId !== batch.id) voiceAttempt.current = { sourceBatchId: batch.id, requestId: crypto.randomUUID() };
    const sourceBatchId = batch.id;
    voiceLock.current = true; setVoiceAction("schedule"); setVoiceError(""); setVoiceNotice("");
    try {
      const data = await readVoiceResponse(await fetch(VOICE_API, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ action: "schedule", sourceBatchId, requestId: voiceAttempt.current.requestId, confirmed: true }) }), sourceBatchId);
      if (!data.batch) throw new Error("No se pudo confirmar la programación. Actualiza el estado antes de continuar.");
      setVoiceData(data); setVoiceReview(false); setVoiceOwnership(false); setVoiceConsent(false);
      setVoiceNotice(data.batch?.status === "SCHEDULED" ? "Programación guardada para el 10 de noviembre de 2026 a las 10:00 a. m. de Bogotá. No se ha confirmado atención de ninguna llamada." : "Estado recuperado. Revisa el resultado de la programación.");
    } catch (cause) {
      setVoiceError(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo confirmar la programación. Actualiza el estado o reintenta: se conserva el identificador de la solicitud para evitar duplicados.");
    } finally { voiceLock.current = false; setVoiceAction(null); }
  }

  async function cancelVoice() {
    if (voiceLock.current || mutationLock.current || voiceDisabled || !batch || !voice?.batch?.canCancel || !voiceCancelReview) return;
    voiceLock.current = true; setVoiceAction("cancel"); setVoiceError(""); setVoiceNotice("");
    try {
      const data = await readVoiceResponse(await fetch(VOICE_API, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ action: "cancel", batchId: voice.batch.id }) }), batch.id);
      if (!data.batch) throw new Error("No se pudo confirmar la cancelación. Actualiza el estado antes de continuar.");
      setVoiceData(data); setVoiceCancelReview(false);
      setVoiceNotice(data.batch?.status === "CANCELLED" ? "Programación cancelada. No se solicitarán las llamadas pendientes de este lote." : "Estado actualizado. Revisa las llamadas que ya iniciaron su gestión.");
    } catch (cause) {
      setVoiceError(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo confirmar la cancelación. Actualiza el estado antes de continuar.");
    } finally { voiceLock.current = false; setVoiceAction(null); }
  }

  function showBatch(value: PayJoyDaptaBatchView) {
    if (voiceSource.current !== value.id) {
      voiceSource.current = value.id; voiceVersion.current += 1; voiceAbort.current?.abort();
      setVoiceData(null); setVoiceLoading(false); setVoiceError(""); setVoiceNotice("");
      setVoiceReview(false); setVoiceOwnership(false); setVoiceConsent(false); setVoiceCancelReview(false);
    }
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
    if (mutationLock.current || voiceLock.current) return;
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
      void loadVoice(data.batch.id);
      resultHeading.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "No se pudo recuperar el resultado. Puedes reintentar con los mismos códigos o abrir el borrador desde el historial.");
      setProgress("");
    } finally { mutationLock.current = false; setBusy(null); }
  }
  async function continueBatch(retry = false) {
    if (mutationLock.current || voiceLock.current || !batch) return;
    mutationLock.current = true; version.current += 1; setBusy(retry ? "retry" : "validate"); setError(""); setProgress("Consultando los dispositivos pendientes en PayJoy…");
    if (retry && retryAttempt.current?.batchId !== batch.id) retryAttempt.current = { batchId: batch.id, requestId: crypto.randomUUID() };
    try {
      await validateBlocks(batch.id, retry ? retryAttempt.current?.requestId : undefined);
      if (retry) retryAttempt.current = null;
      void loadVoice(batch.id);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "La consulta se interrumpió. El borrador y los resultados guardados se conservan. Actualiza su estado antes de continuar."); setProgress("");
    } finally { mutationLock.current = false; setBusy(null); }
  }
  async function openBatch(id: string) {
    if (mutationLock.current || voiceLock.current) return;
    mutationLock.current = true; version.current += 1; setBusy("open"); setError(""); setProgress("");
    try {
      const data = await readResponse<PayJoyDaptaBatchResponse>(await fetch(`${API}?batchId=${encodeURIComponent(id)}`, { cache: "no-store" }));
      if (!data.batch?.id || !Array.isArray(data.batch.items)) throw new Error("No se pudo recuperar el detalle del borrador.");
      showBatch(data.batch); resultHeading.current?.focus();
      void loadVoice(data.batch.id);
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
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>PayJoy · Gestión de voz</p><h1>Llamadas con Valeria</h1><p>Programa y consulta las llamadas de tus lotes de dispositivos.</p></div>
        <a href="#saved-batches" className={styles.button}><DashboardIcon name="document" />Ver lotes guardados</a>
      </div>
      <dl className={styles.overview} aria-label="Resumen de voz">
        <div className={styles.overviewState}><dt><DashboardIcon name="clock" />Estado de la programación</dt><dd>{voiceLoading ? "Consultando estado…" : voice?.batch ? VOICE_BATCH_LABELS[voice.batch.status] : !batch ? "Selecciona un lote" : voiceCanSchedule ? "Lista para revisar" : voiceError ? "Estado por consultar" : voice && !voice.configuration.ready ? "Configuración pendiente" : "Pendiente de revisión"}</dd><small>{voice?.batch ? `${voice.batch.calls.length} llamadas en el lote` : "Se confirma al abrir el lote"}</small></div>
        <div><dt><DashboardIcon name="calendar" />Fecha programada</dt><dd>10 nov. 2026 · 10:00 a. m.</dd><small>Bogotá · Ventana de 10:00 a 10:30 a. m.</small></div>
        <div><dt><DashboardIcon name="receivable" />Convenio Efecty</dt><dd>{PAYJOY_DAPTA_AGREEMENT}</dd><small>Adelantos Colombia</small></div>
        <div><dt><DashboardIcon name="user" />Línea de voz</dt><dd>312 408 5562</dd><small>Valeria · CONECTAMOS</small></div>
      </dl>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {progress && <div className={styles.progress} role="status" aria-live="polite"><DashboardIcon name={busy ? "refresh" : "document"} /><span>{progress}</span></div>}
      <div className={styles.workspace}>
        <section className={`${styles.panel} ${styles.voicePanel}`} aria-labelledby="voice-title" aria-busy={voiceLoading || Boolean(voiceAction)}>
        <div className={styles.voiceHeading}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="calendar" /></span><div><p>Gestión de voz</p><h2 id="voice-title" ref={resultHeading} tabIndex={-1}>Programación y llamadas</h2></div></div>
          <button type="button" className={styles.button} disabled={voiceDisabled || !batch} onClick={() => { if (batch) void loadVoice(batch.id); }}><DashboardIcon name="refresh" />{voiceLoading ? "Consultando estado…" : "Actualizar llamadas"}</button>
        </div>
        {!batch ? <div className={styles.empty}>
          <span className={styles.voiceAvatar}>V</span>
          <h3>Abre un lote para ver sus llamadas</h3>
          <p>Después de recargar la página, puedes volver al lote guardado y consultar su programación.</p>
          {batches[0] ? <button type="button" className={`${styles.button} ${styles.primary}`} disabled={draftDisabled} onClick={() => void openBatch(batches[0].id)}>Abrir último lote<DashboardIcon name="arrow" /></button> : <a href="#new-batch" className={`${styles.button} ${styles.graphite}`}>Preparar un lote<DashboardIcon name="arrow" /></a>}
        </div> : <>
          <div className={styles.selectedBatch}><DashboardIcon name="users" /><div><strong>{batch.counts.total} equipos en el lote seleccionado</strong><span>{dateLabel(batch.createdAt)} · {batch.createdBy}</span></div><a href="#saved-batches">Cambiar lote</a></div>
          <p className={styles.description}>Valeria se presenta como asistente virtual de CONECTAMOS y confirma la identidad antes de hablar del crédito PayJoy.</p>
        <p className={styles.historyHelp}>Máximo {PAYJOY_VOICE_MAX_CALLS} equipos y una llamada por móvil en esta fecha. El servidor vuelve a comprobar cada contacto antes de solicitar la llamada.</p>
        {voiceLoading && <p className={styles.contactNote} role="status">Recuperando la programación guardada…</p>}
        {voiceError && <p className={styles.error} role="alert">{voiceError}</p>}
        {voiceNotice && <p className={styles.progress} role="status" aria-live="polite">{voiceNotice}</p>}
        {!voice && !voiceLoading && !voiceError && <p className={styles.reviewNotice}>Actualiza el estado de llamadas para revisar la configuración y la programación de este lote.</p>}
        {voice && !voice.configuration.ready && <div className={styles.voiceWarning} role="note"><strong>Configuración pendiente</strong><p>La conexión de voz aún no está lista. La programación está bloqueada hasta que el servidor confirme la configuración.</p></div>}
        {voice && voice.blockers.length > 0 && <ul className={styles.voiceBlockers}>{voice.blockers.map(code => <li key={code}>{VOICE_BLOCKERS[code] || "Este lote requiere revisión antes de poder programar llamadas."}</li>)}</ul>}
        {!voice?.batch && !voiceSourceReady && <p className={styles.voiceWarning}>Revisa el lote: se requieren entre 1 y {PAYJOY_VOICE_MAX_CALLS} equipos, todos con móvil encontrado y sin duplicados.</p>}

        {voice?.batch ? <>
          <div className={styles.batchHeading}><span className={styles.status}>{VOICE_BATCH_LABELS[voice.batch.status]}</span><p>Autorizada por {voice.batch.createdBy} · {dateLabel(voice.batch.authorizedAt)}</p></div>
          <p className={styles.historyHelp}>Aceptada por Dapta significa que recibió la solicitud. La atención y la identidad del interlocutor sólo se confirman con el resultado de la llamada.</p>
          <ul className={styles.voiceTargets} aria-label="Estado de las llamadas">{voice.batch.calls.map(call => <li key={call.id}>
            <div><strong>{call.deviceTag}</strong><span>{call.phoneMasked}</span></div>
            <div><span className={styles.status}>{VOICE_CALL_LABELS[call.status] || "Estado pendiente de revisión"}</span><p>{call.identityConfirmedAt ? `Identidad confirmada durante la llamada · ${dateLabel(call.identityConfirmedAt)}` : "Identidad del interlocutor sin confirmar"}</p>{call.latestOutcome && <p>{VOICE_OUTCOMES[call.latestOutcome] || "Resultado pendiente de revisión"}</p>}{call.reasonCode && <p>{VOICE_REASONS[call.reasonCode] || "La gestión requiere revisión. Motivo registrado por el servidor."}</p>}</div>
          </li>)}</ul>
          {voice.batch.canCancel && <div className={styles.voiceActions}>
            {!voiceCancelReview ? <button type="button" className={styles.button} disabled={voiceDisabled} onClick={() => setVoiceCancelReview(true)}>Cancelar programación</button> : <div className={styles.voiceConfirmation}>
              <h3>Confirmar cancelación</h3><p>Se cancelarán las llamadas que aún no hayan iniciado su gestión. El servidor comprobará el estado antes de aplicar la cancelación.</p>
              <div className={styles.voiceActions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={voiceDisabled} onClick={() => void cancelVoice()}>{voiceAction === "cancel" ? "Cancelando…" : "Confirmar cancelación"}</button><button type="button" className={styles.button} disabled={voiceDisabled} onClick={() => setVoiceCancelReview(false)}>Conservar programación</button></div>
            </div>}
          </div>}
        </> : <>
          <ul className={styles.voiceTargets} aria-label="Contactos a revisar para las llamadas">{batch.items.map(item => <li key={item.id}><div><strong>{item.deviceTag}</strong><span>{item.phone || "Móvil no disponible"}</span></div><span className={styles.status}>{item.lookupStatus === "FOUND" && item.reviewStatus !== "DUPLICATE_PHONE" ? "Pendiente de confirmar autorización" : "Contacto pendiente de revisión"}</span></li>)}</ul>
          {!voiceReview ? <button type="button" className={`${styles.button} ${styles.graphite}`} disabled={voiceDisabled || !voiceCanSchedule} onClick={() => { setVoiceReview(true); setVoiceOwnership(false); setVoiceConsent(false); }}>Revisar programación</button> : <div className={styles.voiceConfirmation} aria-labelledby="voice-confirm-title">
            <h3 id="voice-confirm-title">Revisar antes de programar</h3>
            <p>Se programarán {batch.items.length} llamadas de Valeria de CONECTAMOS a los móviles mostrados, únicamente para el 10 de noviembre de 2026 a las 10:00 a. m. de Bogotá. Convenio Efecty 112090. No se envía WhatsApp.</p>
            <label className={styles.voiceCheck}><input type="checkbox" checked={voiceOwnership} disabled={voiceDisabled} onChange={event => setVoiceOwnership(event.target.checked)} /><span>He comprobado que estos números corresponden a los titulares de los créditos.</span></label>
            <label className={styles.voiceCheck}><input type="checkbox" checked={voiceConsent} disabled={voiceDisabled} onChange={event => setVoiceConsent(event.target.checked)} /><span>Cuento con autorización para contactar a estos titulares por llamada en el horario indicado.</span></label>
            <p className={styles.contactNote}>La confirmación queda registrada con tu usuario. La agente también debe verificar la identidad durante la llamada.</p>
            <div className={styles.voiceActions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={voiceDisabled || !voiceCanSchedule || !voiceOwnership || !voiceConsent} onClick={() => void scheduleVoice()}>{voiceAction === "schedule" ? "Guardando programación…" : "Confirmar programación"}</button><button type="button" className={styles.button} disabled={voiceDisabled} onClick={() => { setVoiceReview(false); setVoiceOwnership(false); setVoiceConsent(false); }}>Volver al lote</button></div>
          </div>}
        </>}
        </>}
      </section>
        <section className={`${styles.panel} ${styles.history}`} id="saved-batches" aria-labelledby="history-title" aria-busy={historyLoading}>
        <div className={styles.historyHeading}><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><div><p>Tu trabajo guardado</p><h2 id="history-title">Lotes guardados</h2></div></div><button className={styles.button} disabled={draftDisabled || historyLoading} onClick={() => void loadHistory()}><DashboardIcon name="refresh" />{historyLoading ? "Cargando historial…" : "Actualizar historial"}</button></div>
        <p className={styles.historyHelp}>Abre uno de los últimos 20 lotes para consultar sus llamadas y borradores.</p>
        {historyError && <p className={styles.error} role="alert">{historyError}</p>}
        {historyLoading && !batches.length ? <p className={styles.historyEmpty} role="status">Cargando lotes…</p> : !batches.length && !historyError ? <p className={styles.historyEmpty}>Todavía no hay lotes guardados.</p> : <ul className={styles.historyList}>{batches.map(item => <li key={item.id} className={batch?.id === item.id ? styles.selectedHistory : undefined}>
          <div><strong>Lote del {dateLabel(item.createdAt)}</strong>{batch?.id === item.id && <span className={styles.currentBatch}>En pantalla</span>}<span>{item.createdBy} · Efecty {item.agreement}</span><span>Actualizado {dateLabel(item.updatedAt)}</span></div>
          <div className={styles.historyNumbers}><strong>{item.counts.total}</strong> equipos · <strong>{item.counts.found}</strong> móviles encontrados<span>{item.counts.pending + item.counts.checking} consultas pendientes · {item.counts.error} con error</span></div>
          <button className={styles.button} disabled={draftDisabled} onClick={() => void openBatch(item.id)}>Abrir lote<span className={styles.srOnly}> del {dateLabel(item.createdAt)}</span><DashboardIcon name="arrow" /></button>
        </li>)}</ul>}
      </section>
        <section className={`${styles.panel} ${styles.preparePanel}`} id="new-batch" aria-labelledby="devices-title" aria-busy={busy === "create" || busy === "validate"}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="barcode" /></span><div><p>Nuevo lote</p><h2 id="devices-title">Consultar otros equipos</h2></div></div>
          <p className={styles.description}>Pega los códigos de dispositivo del reporte de PayJoy. Los códigos repetidos se consolidan antes de la consulta.</p>
          <form className={styles.form} onSubmit={create}>
            <label htmlFor="dapta-devices">Identificadores PayJoy</label>
            <textarea id="dapta-devices" value={input} maxLength={5000} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={draftDisabled} onChange={event => { setInput(event.target.value); setInputError(""); }} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? "dapta-device-error dapta-device-help" : "dapta-device-help"} />
            <small id="dapta-device-help">Códigos que empiezan con D, separados por saltos de línea, espacios, comas o punto y coma. Máximo {PAYJOY_DAPTA_DEVICE_LIMIT} equipos distintos.</small>
            <div className={styles.inputSummary}><span><strong>{parsed.devices.length}</strong> equipos válidos</span>{parsed.duplicates > 0 && <span>{parsed.duplicates} repetidos omitidos</span>}{parsed.invalid.length > 0 && <span>{parsed.invalid.length} por corregir</span>}</div>
            {inputError && <p className={styles.contactError} id="dapta-device-error" role="alert">{inputError}</p>}
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={draftDisabled}><DashboardIcon name="search" />{busy === "create" ? "Guardando borrador…" : busy === "validate" ? "Consultando contactos…" : "Consultar contactos y guardar"}</button>
          </form>
          <div className={styles.scope}><DashboardIcon name="shield" /><p>Consulta administrativa de PayJoy. El móvil puede provenir del dato precargado para Nequi y requiere verificar a quién pertenece.</p></div>
        </section>
        <section className={`${styles.panel} ${styles.draftsPanel}`} aria-labelledby="results-title" aria-busy={Boolean(busy)}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="users" /></span><div><p>Canal WhatsApp</p><h2 id="results-title">Borradores de WhatsApp</h2></div></div>
          <div className={styles.notice} role="note"><DashboardIcon name="lock" /><div><strong>Envío deshabilitado</strong><p>Revisa o copia los mensajes guardados. La programación de voz se gestiona en la sección de Valeria.</p></div></div>
          {!batch ? <div className={styles.empty}><DashboardIcon name="document-search" /><h3>Consulta los equipos para revisar sus contactos</h3><p>Verás el móvil sugerido, su origen y el borrador del mensaje con el convenio Efecty {PAYJOY_DAPTA_AGREEMENT}.</p></div> : <>
            <div className={styles.batchHeading}><span className={styles.status}>Borrador · Sin envío</span><p>Creado el {dateLabel(batch.createdAt)} · {batch.createdBy}</p></div>
            <div className={styles.stats} aria-label="Resumen del lote"><div><strong>{batch.counts.total}</strong><span>Equipos en el lote</span></div><div><strong>{batch.counts.found}</strong><span>Móviles encontrados</span></div><div><strong>{batch.counts.duplicatePhones}</strong><span>Móviles duplicados</span></div></div>
            <div className={styles.batchActions}>
              <button className={styles.button} disabled={draftDisabled} onClick={() => void openBatch(batch.id)}><DashboardIcon name="refresh" />Actualizar borrador</button>
              {batch.counts.pending > 0 && <button className={`${styles.button} ${styles.graphite}`} disabled={draftDisabled} onClick={() => void continueBatch()}>Continuar consulta ({batch.counts.pending})</button>}
              {(batch.counts.error > 0 || batch.counts.checking > 0) && <button className={styles.button} disabled={draftDisabled} onClick={() => void continueBatch(true)}>Reintentar consultas pendientes</button>}
            </div>
            <div className={styles.reviewNotice}><DashboardIcon name="warning" /><p>Encontrar un móvil no acredita su titularidad. Todos los contactos permanecen pendientes de revisión. Este borrador no consulta saldos ni cuotas y no afirma que exista mora.</p></div>
            <ul className={styles.contacts}>{batch.items.map(item => <ContactItem key={item.id} item={item} duplicateDevice={batch.items.find(other => other.id === item.duplicateOfId)?.deviceTag} copyStatus={copyState?.itemId === item.id && copyState.message === item.messagePreview ? copyState.status : undefined} copying={copyState?.status === "copying"} onCopy={() => copyMessage(item)} />)}</ul>
          </>}
        </section>
      </div>
    </main>
  </div>;
}
