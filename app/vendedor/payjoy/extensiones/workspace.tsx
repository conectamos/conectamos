"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import type { PayJoyExtensionOperationView as Operation, PayJoyLocalDevice as Device } from "@/lib/payjoy-extensions-types";
import styles from "./extensions.module.css";

const API = "/api/payjoy/extensiones";
const MANUAL_LOOKUP_ERRORS = ["DEVICE_UNRESOLVED", "MISSING_DEVICE_TAG"];
const STATUS_LABELS: Record<string, string> = {
  PREPARANDO: "Consultando PayJoy", LISTA: "Lista para revisar", SIN_OPCIONES: "Sin opciones disponibles",
  EJECUTANDO: "Gestión en curso", EXITOSA: "Extensión confirmada", RECHAZADA: "Rechazada por PayJoy",
  INDETERMINADA: "Requiere revisión en PayJoy", ERROR: "Consulta con error", EXPIRADA: "Consulta vencida",
};
const NAVIGATION: NavigationItem[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" },
  { href: "/cierre", icon: "reports", label: "CIERRE" },
  { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
  { href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" },
];
function formatDate(value: string | null) {
  if (!value) return "No informado";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(date)
    : "No informado";
}
function duration(hours: number) { return `${hours.toLocaleString("es-CO")} ${hours === 1 ? "hora" : "horas"}`; }
function optionTitle(option: Operation["options"][number]) { return `Extensión de ${duration(option.extensionTime)}`; }
function optionCategory(type: string) {
  const categories: Record<string, string> = {
    payment_processor_outage: "Extensión de emergencia",
    local_disruptions: "Extensión de emergencia",
    customer_voluntary_long: "Extensión a solicitud del cliente",
    align_to_salary_pay_date: "Ajuste a la fecha de pago del salario",
  };
  return categories[type] || "Extensión informada por PayJoy";
}
function Status({ value }: { value: string }) {
  const tone = value === "EXITOSA" ? styles.positive : ["INDETERMINADA", "RECHAZADA", "ERROR"].includes(value) ? styles.warning : "";
  return <span className={`${styles.status} ${tone}`}>{STATUS_LABELS[value] || "Estado por revisar"}</span>;
}
function OptionDetails({ option }: { option: Operation["options"][number] }) {
  return <dl className={styles.optionDetails}>
    <div><dt>Tipo de extensión</dt><dd>{optionCategory(option.extensionType)}</dd></div>
    {typeof option.details.extensionsRemaining === "number" && <div><dt>Extensiones restantes</dt><dd>{option.details.extensionsRemaining}</dd></div>}
    {typeof option.details.extensionsMax === "number" && <div><dt>Máximo informado</dt><dd>{option.details.extensionsMax}</dd></div>}
    {typeof option.details.extensionsNextAvailableDate === "string" && <div><dt>Próxima disponibilidad</dt><dd>{formatDate(option.details.extensionsNextAvailableDate)}</dd></div>}
    {!option.available && option.reason && <div><dt>Motivo informado por PayJoy</dt><dd>{option.reason}</dd></div>}
  </dl>;
}

class RequestError extends Error {
  code: string;
  constructor(message: string, code = "") { super(message); this.code = code; }
}
async function post<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new RequestError(typeof data?.error === "string" ? data.error : "No se pudo completar la solicitud. Intenta de nuevo.", typeof data?.code === "string" ? data.code : "");
  return data as T;
}

export default function PayJoyExtensionsWorkspace({ canManage, session, navigation = NAVIGATION, initialDeviceTag = "" }: {
  canManage: boolean;
  session: { nombre: string; sedeNombre: string; roleLabel?: string };
  navigation?: NavigationItem[];
  initialDeviceTag?: string;
}) {
  const [cedula, setCedula] = useState("");
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [limited, setLimited] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [manual, setManual] = useState(Boolean(initialDeviceTag));
  const [deviceTag, setDeviceTag] = useState(initialDeviceTag);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [optionId, setOptionId] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"buscar" | "preparar" | "confirmar" | null>(null);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<"cedula" | "device" | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [allowManage, setAllowManage] = useState(canManage);
  const [uncertainId, setUncertainId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const prepareAttempt = useRef<{ signature: string; key: string } | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const version = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    historyAbort.current?.abort();
    const controller = new AbortController(); historyAbort.current = controller;
    const currentVersion = version.current;
    setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch(API, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.operations)) throw new Error(data?.error || "No se pudo cargar el historial.");
      if (controller.signal.aborted || currentVersion !== version.current) return;
      setOperations(data.operations);
      setAllowManage(canManage && data.canManage === true);
      setOperation(current => current ? data.operations.find((item: Operation) => item.id === current.id) || current : null);
      setUncertainId(current => current && data.operations.some((item: Operation) => item.id === current && !["LISTA", "PREPARANDO"].includes(item.status)) ? null : current);
    } catch (cause) {
      if (!controller.signal.aborted) setHistoryError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
    } finally { if (!controller.signal.aborted) setHistoryLoading(false); }
  }, [canManage]);
  useEffect(() => { void loadHistory(); return () => { historyAbort.current?.abort(); }; }, [loadHistory]);

  const selectedOption = operation?.options.find(item => item.id === optionId);
  const uncertain = Boolean(operation && uncertainId === operation.id);
  const canSelect = operation?.status === "LISTA" && !uncertain && !busy;
  const validReason = Boolean(selectedOption && (selectedOption.reasons.length === 0 || selectedOption.reasons.some(item => item.id === reason)));
  const reviewHelp = !selectedOption?.available ? "Selecciona una opción disponible para revisar la gestión."
    : !validReason ? "Selecciona el motivo de la extensión para continuar." : null;
  const needsManualIdentifier = operation?.status === "ERROR" && MANUAL_LOOKUP_ERRORS.includes(operation.errorCode || "");
  const hasDeviceConflict = operation?.errorCode === "DEVICE_ASSOCIATION_CONFLICT";
  const retryInput = operation?.deviceTag
    ? { deviceTag: operation.deviceTag }
    : operation?.imei && selectedDevice !== null && devices?.some(item => item.registroId === selectedDevice && item.imei === operation.imei)
      ? { registroId: selectedDevice }
      : null;
  const optionsChecked = Boolean(operation?.deviceTag && !["PREPARANDO", "ERROR"].includes(operation.status) && !hasDeviceConflict);
  const activeStep = operation?.status === "EXITOSA" ? 3 : optionsChecked ? 2 : selectedDevice !== null ? 1 : 0;
  const recentOperations = operations.slice(0, 30);
  const historySearch = historyQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const filteredHistory = recentOperations.filter(item => [item.deviceTag, item.imei, item.asesorNombre, item.clienteDocumentoUltimos4, STATUS_LABELS[item.status], formatDate(item.createdAt)]
    .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(historySearch));
  const historyPages = Math.max(1, Math.ceil(filteredHistory.length / 10));
  const currentHistoryPage = Math.min(historyPage, historyPages);
  const visibleHistory = filteredHistory.slice((currentHistoryPage - 1) * 10, currentHistoryPage * 10);
  const otherNavigation = navigation.filter(item => item.href !== "/vendedor/payjoy/extensiones");
  const mainNavigation = [...otherNavigation.slice(0, 5), navigation.find(item => item.href === "/vendedor/payjoy/extensiones") || NAVIGATION[NAVIGATION.length - 1]];
  const moreNavigation = otherNavigation.slice(5);

  function showOperation(item: Operation) {
    setOperation(item); setOptionId(""); setReason(""); setReview(false); setConfirmed(false);
    if (MANUAL_LOOKUP_ERRORS.includes(item.errorCode || "") || item.errorCode === "CONFIG") setManual(true);
    setOperations(current => [item, ...current.filter(previous => previous.id !== item.id)]);
    setTimeout(() => resultHeading.current?.focus(), 0);
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (mutationLock.current) return;
    if (!/^\d{5,15}$/.test(cedula.trim())) { setFieldError("cedula"); setError("Escribe una cédula de 5 a 15 dígitos, sin puntos ni espacios."); return; }
    mutationLock.current = true; version.current += 1;
    setBusy("buscar"); setError(""); setFieldError(null); setOperation(null); setReview(false); setDevices(null); setSelectedDevice(null);
    try {
      const data = await post<{ devices: Device[]; source: string; limited: boolean }>({ action: "buscar", cedula: cedula.trim() });
      if (!Array.isArray(data.devices) || data.source !== "CONECTAMOS") throw new RequestError("La respuesta de búsqueda no se pudo verificar.");
      setDevices(data.devices); setLimited(data.limited); setManual(false); prepareAttempt.current = null;
    } catch (cause) { setError(cause instanceof RequestError ? cause.message : "No se pudo conectar con CONECTAMOS. Conservamos la cédula para reintentar."); }
    finally { mutationLock.current = false; setBusy(null); }
  }
  async function prepare(input: { registroId?: number; deviceTag?: string }, fresh = false) {
    if (mutationLock.current) return;
    if (input.deviceTag !== undefined && !/^D[A-Z0-9]{5,31}$/.test(input.deviceTag)) { setFieldError("device"); setError("Escribe el identificador PayJoy que comienza con D y contiene entre 6 y 32 letras o números."); return; }
    const signature = JSON.stringify(input);
    if (fresh || prepareAttempt.current?.signature !== signature) prepareAttempt.current = { signature, key: crypto.randomUUID() };
    mutationLock.current = true; version.current += 1;
    setBusy("preparar"); setError(""); setFieldError(null); setReview(false); setConfirmed(false);
    try {
      const data = await post<{ operation: Operation }>({ action: "preparar", idempotencyKey: prepareAttempt.current.key, ...input });
      if (!data.operation?.id) throw new RequestError("No se pudo recuperar la consulta. Reintenta con el mismo dispositivo.");
      showOperation(data.operation);
    } catch (cause) {
      if (cause instanceof RequestError && [...MANUAL_LOOKUP_ERRORS, "CONFIG"].includes(cause.code)) setManual(true);
      setError(cause instanceof RequestError ? cause.message : "No se pudo recuperar la consulta. Reintenta con el mismo dispositivo; conservaremos el intento.");
    } finally { mutationLock.current = false; setBusy(null); }
  }
  function openReview() {
    if (!operation || !selectedOption || !selectedOption.available || !canSelect || !validReason || !allowManage) return;
    if (operation.expiresAt && new Date(operation.expiresAt).getTime() <= Date.now()) { setOperation({ ...operation, status: "EXPIRADA" }); return; }
    setConfirmed(false); setReview(true); setError("");
  }
  async function confirm() {
    if (mutationLock.current || !operation || !selectedOption || !selectedOption.available || !canSelect || !validReason || !review || !confirmed || !allowManage) return;
    if (operation.expiresAt && new Date(operation.expiresAt).getTime() <= Date.now()) { setOperation({ ...operation, status: "EXPIRADA" }); setReview(false); return; }
    mutationLock.current = true; version.current += 1;
    setBusy("confirmar"); setError("");
    try {
      const data = await post<{ operation: Operation }>({ action: "confirmar", operationId: operation.id, optionId: selectedOption.id, reason, confirmed: true });
      if (!data.operation?.id) throw new Error("Resultado no verificable");
      showOperation(data.operation); setUncertainId(null);
    } catch (cause) {
      // A lost response does not prove that PayJoy failed to apply the extension.
      setUncertainId(operation.id); setReview(false);
      setError(cause instanceof RequestError ? cause.message : "No se recibió el resultado de la gestión. Actualiza el historial para revisar su estado antes de continuar.");
    } finally { mutationLock.current = false; setBusy(null); }
  }

  return <div className={styles.page}>
    <div className={styles.content}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" width={42} height={42} alt="" priority /><strong>CONECTAMOS</strong></Link>
        <nav className={styles.navigation} aria-label="Navegación principal"><div className={styles.navLinks}>{mainNavigation.map(item => <Link href={item.href} key={item.href} className={`${styles.navItem} ${item.href === "/vendedor/payjoy/extensiones" ? styles.navActive : ""}`} aria-current={item.href === "/vendedor/payjoy/extensiones" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div>{moreNavigation.length > 0 && <details className={styles.moreNavigation}><summary>Más<DashboardIcon name="chevron" /></summary><div className={styles.moreMenu}>{moreNavigation.map(item => <Link href={item.href} key={item.href} className={styles.navItem}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div></details>}</nav>
        <div className={styles.profileWrap}><SalesProfile name={session.nombre} role={session.roleLabel || session.sedeNombre} /></div>
      </header>
      <main className={styles.main}>
        <div className={styles.heading}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="chevron" /><span>Servicios PayJoy</span></nav><h1>Extensiones PayJoy</h1><p>Consulta las opciones del equipo y revisa cada gestión antes de confirmarla.</p></div><span className={styles.context}><DashboardIcon name="shield" />{allowManage ? "Consulta y gestión" : "Solo consulta"}</span></div>
        <nav className={styles.actions} aria-label="Servicios PayJoy" style={{ margin: "0 0 20px" }}><Link className={styles.button} href={`/vendedor/payjoy/seguimiento${operation?.deviceTag ? `?deviceTag=${encodeURIComponent(operation.deviceTag)}` : ""}`}><DashboardIcon name="clock" />Seguimiento de extensiones</Link></nav>
        <section className={styles.metrics} aria-label="Resumen de la gestión">
          <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="store" /></span><div><span>Sede activa</span><strong>{session.sedeNombre}</strong><small>Cobertura de tu sesión</small></div></div>
          <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="clock" /></span><div><span>Estado de la gestión</span><strong>{busy === "buscar" ? "Buscando cliente" : busy === "preparar" ? "Consultando PayJoy" : busy === "confirmar" ? "Gestión en curso" : operation ? STATUS_LABELS[operation.status] || "Estado por revisar" : "Sin consulta"}</strong><small>{operation?.deviceTag || "Selecciona un equipo para comenzar"}</small></div></div>
          <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="document" /></span><div><span>Operaciones recientes</span><strong>{historyLoading && !recentOperations.length ? "…" : historyError && !recentOperations.length ? "No disponible" : recentOperations.length.toLocaleString("es-CO")}</strong><small>Hasta 30 operaciones de tu perfil</small></div></div>
        </section>
        <details className={styles.rules}><summary><DashboardIcon name="document-search" />Cómo funciona la consulta<DashboardIcon name="chevron" /></summary><div className={styles.notice}><p>La búsqueda por cédula revisa los registros de <strong>CONECTAMOS</strong> a los que tienes acceso. No es un listado completo de dispositivos en PayJoy. Las opciones de extensión se consultan en PayJoy para el equipo seleccionado.</p></div></details>
        {!allowManage && <p className={styles.readOnly}><DashboardIcon name="lock" /> Tu perfil puede consultar dispositivos, opciones e historial. La confirmación requiere un perfil autorizado para gestionar.</p>}
        <ol className={styles.steps} aria-label="Pasos de la gestión">{[{ title: "Cliente o dispositivo", detail: "Busca y selecciona el equipo" }, { title: "Opciones de extensión", detail: "Consulta la disponibilidad en PayJoy" }, { title: "Revisar y confirmar", detail: operation?.status === "EXITOSA" ? "Extensión confirmada por PayJoy" : "Verifica la gestión antes de enviarla" }].map((step, index) => <li key={step.title} className={index < activeStep ? styles.stepDone : index === activeStep ? styles.stepActive : undefined} aria-current={index === Math.min(activeStep, 2) ? "step" : undefined}><span>{index < activeStep ? <DashboardIcon name="shield" /> : index + 1}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div></li>)}</ol>
        {error && <div className={styles.error} role="alert" id="payjoy-error"><DashboardIcon name="warning" /><p>{error}</p></div>}
        <div className={styles.workspace}>
          <section className={`${styles.panel} ${styles.lookupPanel}`} aria-labelledby="lookup-title" aria-busy={busy === "buscar" || busy === "preparar"}>
            <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="search" /></span><div><p>Cliente y dispositivo</p><h2 id="lookup-title">Buscar equipo</h2></div></div>
            <form onSubmit={search} className={styles.searchForm}>
              <label htmlFor="payjoy-cedula">Cédula del cliente</label>
              <input id="payjoy-cedula" inputMode="numeric" autoComplete="off" maxLength={15} value={cedula} disabled={Boolean(busy)} onChange={event => setCedula(event.target.value)} aria-invalid={fieldError === "cedula"} aria-describedby={fieldError === "cedula" ? "payjoy-error" : "document-help"} />
              <small id="document-help">Consulta los registros disponibles en CONECTAMOS.</small>
              <button className={`${styles.button} ${styles.graphite}`} disabled={Boolean(busy)} type="submit"><DashboardIcon name="search" />{busy === "buscar" ? "Buscando registros…" : "Buscar por cédula"}</button>
            </form>
            {devices !== null && <div className={styles.searchResults} aria-live="polite">
              <h3>{devices.length ? `${devices.length} ${devices.length === 1 ? "equipo encontrado" : "equipos encontrados"}` : "Sin equipos en tus registros"}</h3>
              <p>{devices.length ? "Selecciona el equipo del cliente. El IMEI proviene del registro comercial." : "No encontramos equipos en los registros de CONECTAMOS a los que tienes acceso. Puedes consultar con el identificador PayJoy del dispositivo."}</p>
              {limited && <p className={styles.limit}>La búsqueda tiene cobertura limitada; no representa todos los equipos del cliente en PayJoy.</p>}
              {devices.length > 0 && <fieldset className={styles.deviceList}><legend>Equipo del cliente</legend>{devices.map(device => <label className={`${styles.device} ${selectedDevice === device.registroId ? styles.selected : ""}`} key={device.registroId}>
                <input type="radio" name="payjoy-device" value={device.registroId} checked={selectedDevice === device.registroId} disabled={Boolean(busy)} onChange={() => { setSelectedDevice(device.registroId); setManual(false); }} />
                <span><strong>{device.modelo || "Equipo registrado"}</strong><span>{device.clienteNombre}</span><span>Cédula terminada en {device.documentoUltimos4}</span><span className={styles.mono}>IMEI {device.imei}</span></span>
              </label>)}</fieldset>}
              {devices.length > 0 && <button className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={selectedDevice === null || Boolean(busy)} onClick={() => { if (selectedDevice !== null) void prepare({ registroId: selectedDevice }); }}>{busy === "preparar" && !manual ? "Consultando PayJoy…" : "Consultar extensiones del equipo"}<DashboardIcon name="arrow" /></button>}
            </div>}
            <div className={styles.manual}><button className={`${styles.button} ${styles.full}`} aria-expanded={manual} aria-controls="payjoy-manual" disabled={Boolean(busy)} onClick={() => { setManual(value => !value); setFieldError(null); }}><DashboardIcon name="barcode" />Consultar por dispositivo</button>
              {manual && <form id="payjoy-manual" className={styles.searchForm} onSubmit={event => { event.preventDefault(); void prepare({ deviceTag: deviceTag.trim().toUpperCase() }); }}>
                <label htmlFor="payjoy-device-tag">Identificador del dispositivo PayJoy</label>
                <input id="payjoy-device-tag" ref={manualInput} value={deviceTag} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={Boolean(busy)} onChange={event => setDeviceTag(event.target.value.toUpperCase())} aria-invalid={fieldError === "device"} aria-describedby={fieldError === "device" ? "payjoy-error" : "device-help"} />
                <small id="device-help">Usa el código que empieza con D en PayJoy, diferente del IMEI y de la cédula. Puedes gestionar equipos de cualquier asesor o sede; las opciones dependen de PayJoy.</small>
                <button className={`${styles.button} ${styles.primary}`} disabled={Boolean(busy)} type="submit">{busy === "preparar" && manual ? "Consultando PayJoy…" : "Consultar opciones"}</button>
              </form>}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.resultPanel}`} aria-labelledby="options-title" aria-busy={busy === "preparar" || busy === "confirmar"}>
            <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="clock" /></span><div><p>Respuesta de PayJoy</p><h2 id="options-title" tabIndex={-1} ref={resultHeading}>Opciones y resultado</h2></div></div>
            {!operation ? <div className={styles.empty}><DashboardIcon name={busy === "preparar" ? "refresh" : "clock"} /><h3>{busy === "preparar" ? "Consultando el dispositivo…" : "Selecciona un equipo para continuar"}</h3><p>{busy === "preparar" ? "Estamos consultando las opciones disponibles en PayJoy." : "Aquí aparecerán las extensiones disponibles, su duración y las condiciones que informe PayJoy."}</p></div> : <>
              <div className={styles.operationHeading}><Status value={operation.status} /><span>Consulta del {formatDate(operation.createdAt)}</span></div>
              <dl className={styles.summary}>
                <div><dt>Dispositivo PayJoy</dt><dd className={styles.mono}>{operation.deviceTag || "Por identificar"}</dd></div>
                {operation.imei && <div><dt>IMEI del dispositivo</dt><dd className={styles.mono}>{operation.imei}</dd></div>}
                {operation.clienteDocumentoUltimos4 && <div><dt>Cédula del registro local</dt><dd>Terminada en {operation.clienteDocumentoUltimos4}</dd></div>}
                {operation.currentValidThrough && <div><dt>Vigencia actual informada</dt><dd>{formatDate(operation.currentValidThrough)}</dd></div>}
              </dl>
              {uncertain || operation.status === "INDETERMINADA" ? <div className={styles.warningBox} role="status"><strong>Resultado pendiente de verificar</strong><p>No repitas la extensión. Revisa el estado en PayJoy y actualiza este historial. Una respuesta interrumpida no confirma que la gestión haya fallado.</p><button className={styles.button} disabled={Boolean(busy) || historyLoading} onClick={() => void loadHistory()}>Actualizar estado</button></div> : null}
              {["PREPARANDO", "EJECUTANDO"].includes(operation.status) && <div className={styles.notice} role="status"><p>La operación está en curso. Actualiza el historial para consultar el resultado; no hace falta volver a enviarla.</p><button className={styles.button} disabled={Boolean(busy) || historyLoading} onClick={() => void loadHistory()}>Actualizar estado</button></div>}
              {operation.errorMessage && <p className={styles.inlineError} role="status">{operation.errorMessage}</p>}
              {needsManualIdentifier && <button className={styles.button} disabled={Boolean(busy)} aria-controls="payjoy-manual" onClick={() => { setManual(true); setFieldError(null); setTimeout(() => manualInput.current?.focus(), 0); }}><DashboardIcon name="barcode" />Ingresar identificador del dispositivo</button>}
              {hasDeviceConflict && <p className={styles.historyHelp} role="status">Solicita al administrador que revise la asociación entre cliente y dispositivo antes de continuar.</p>}
              {operation.status === "SIN_OPCIONES" && <div className={styles.empty}><DashboardIcon name="clock" /><h3>Sin extensiones disponibles</h3><p>PayJoy no ofrece una opción disponible para este equipo en esta consulta.</p></div>}
              {["ERROR", "SIN_OPCIONES", "RECHAZADA"].includes(operation.status) && retryInput && !needsManualIdentifier && !hasDeviceConflict && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void prepare(retryInput, true)}><DashboardIcon name="refresh" />Consultar nuevamente</button>}
              {operation.status === "EXPIRADA" && <div className={styles.warningBox}><strong>Vuelve a consultar las opciones</strong><p>La consulta venció. PayJoy debe confirmar nuevamente la disponibilidad antes de gestionar una extensión.</p>{operation.deviceTag && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void prepare({ deviceTag: operation.deviceTag! }, true)}>Consultar nuevamente</button>}</div>}
              {operation.options.length > 0 && !operation.selectedOption && <fieldset className={styles.optionList} disabled={!canSelect}><legend>Opciones informadas por PayJoy</legend>{operation.options.map(option => <label className={`${styles.option} ${optionId === option.id ? styles.selected : ""} ${!option.available ? styles.unavailable : ""}`} key={option.id}>
                <input type="radio" name="payjoy-option" checked={optionId === option.id} disabled={!canSelect || !option.available} onChange={() => { setOptionId(option.id); setReason(""); setReview(false); setConfirmed(false); }} />
                <span><span className={styles.optionHeading}><strong>{optionTitle(option)}</strong><span className={styles.status}>{option.available ? "Disponible" : "No disponible"}</span></span><OptionDetails option={option} /></span>
              </label>)}</fieldset>}
              {operation.status === "LISTA" && operation.options.length > 0 && !operation.selectedOption && !uncertain && <div className={styles.selection}>
                {selectedOption && selectedOption.reasons.length > 0 && <label className={styles.field} htmlFor="payjoy-reason">Motivo de la extensión<select id="payjoy-reason" value={reason} onChange={event => { setReason(event.target.value); setReview(false); setConfirmed(false); }} disabled={Boolean(busy)}><option value="">Selecciona un motivo</option>{selectedOption.reasons.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
                {!review && allowManage && <>
                  {reviewHelp && <p id="payjoy-review-help" className={styles.historyHelp}>{reviewHelp}</p>}
                  <button className={`${styles.button} ${styles.primary}`} disabled={!selectedOption?.available || !validReason || !canSelect} aria-describedby={reviewHelp ? "payjoy-review-help" : undefined} onClick={openReview}>Revisar gestión<DashboardIcon name="arrow" /></button>
                </>}
              </div>}
              {review && selectedOption && operation.status === "LISTA" && !uncertain && <section className={styles.review} aria-labelledby="review-title"><h3 id="review-title">Revisa antes de confirmar</h3><dl className={styles.summary}><div><dt>Dispositivo</dt><dd className={styles.mono}>{operation.deviceTag}</dd></div><div><dt>Opción seleccionada</dt><dd>{optionTitle(selectedOption)}</dd></div>{reason && <div><dt>Motivo</dt><dd>{selectedOption.reasons.find(item => item.id === reason)?.label}</dd></div>}</dl><p>Al confirmar se solicitará esta extensión a PayJoy. La disponibilidad y el resultado final dependen de PayJoy.</p><label className={styles.confirmCheck}><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={event => setConfirmed(event.target.checked)} /><span>Verifiqué el cliente, el dispositivo y la opción seleccionada.</span></label><div className={styles.actions}><button className={styles.button} disabled={Boolean(busy)} onClick={() => { setReview(false); setConfirmed(false); }}>Volver a opciones</button><button className={`${styles.button} ${styles.primary}`} disabled={!confirmed || Boolean(busy) || !allowManage} onClick={() => void confirm()}>{busy === "confirmar" ? "Gestionando en PayJoy…" : "Confirmar extensión"}</button></div></section>}
              {operation.selectedOption && <div className={styles.selectedResult}><h3>Opción seleccionada</h3><strong>{optionTitle(operation.selectedOption)}</strong><OptionDetails option={operation.selectedOption} /></div>}
              {operation.result && <div className={`${styles.result} ${operation.result.success ? styles.resultSuccess : styles.warningBox}`} role="status"><DashboardIcon name={operation.result.success ? "shield" : "warning"} /><div><h3>{operation.result.success ? "PayJoy confirmó la extensión" : "PayJoy no aprobó la extensión"}</h3><p>Respuesta de PayJoy: <strong>{operation.result.status}</strong></p>{operation.result.newValidThrough && <p>Nueva vigencia: <strong>{formatDate(operation.result.newValidThrough)}</strong></p>}<p>La operación quedó registrada en CONECTAMOS.</p></div></div>}
              {operation.expiresAt && operation.status === "LISTA" && <p className={styles.expiry}>Opciones consultadas válidas hasta {formatDate(operation.expiresAt)}. PayJoy vuelve a validarlas al confirmar.</p>}
            </>}
          </section>
        </div>

        <section className={`${styles.panel} ${styles.history}`} aria-labelledby="history-title" aria-busy={historyLoading}>
          <div className={styles.historyHeading}><div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><div><p>Trazabilidad</p><h2 id="history-title">Historial de operaciones</h2></div></div><button className={styles.button} disabled={Boolean(busy) || historyLoading} onClick={() => void loadHistory()}><DashboardIcon name="refresh" />{historyLoading ? "Actualizando…" : "Actualizar historial"}</button></div>
          <div className={styles.historyControls}><p className={styles.historyCount}>{historyLoading && !operations.length ? "Cargando historial…" : historyError && !operations.length ? "Historial no disponible" : `${filteredHistory.length.toLocaleString("es-CO")} ${filteredHistory.length === 1 ? "operación" : "operaciones"}`}<small>Búsqueda sobre las últimas 30 operaciones de tu perfil</small></p><label className={styles.historySearch}><DashboardIcon name="search" /><input type="search" aria-label="Buscar en historial" placeholder="Dispositivo, IMEI, asesor o estado" value={historyQuery} onChange={event => { setHistoryQuery(event.target.value); setHistoryPage(1); }} /></label></div>
          {historyError && <p className={styles.inlineError} role="alert">{historyError}</p>}
          {historyLoading && !operations.length ? <p className={styles.historyEmpty} role="status"><DashboardIcon name="refresh" />Cargando operaciones…</p> : historyError && !operations.length ? null : <>
            <div className={styles.historyScroller}><table className={styles.historyTable}><caption className={styles.srOnly}>Historial de operaciones PayJoy autorizado para tu perfil</caption><thead><tr><th scope="col">Dispositivo / IMEI</th><th scope="col">Fecha / Asesor</th><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col">Acción</th></tr></thead><tbody>{visibleHistory.length ? visibleHistory.map(item => <tr key={item.id}>
              <td><strong className={styles.mono}>{item.deviceTag || "Dispositivo por identificar"}</strong>{item.imei && <span className={styles.mono}>IMEI {item.imei}</span>}</td><td><strong>{formatDate(item.createdAt)}</strong><span>{item.asesorNombre}</span></td><td>{item.clienteDocumentoUltimos4 ? `Cédula terminada en ${item.clienteDocumentoUltimos4}` : "No informado"}</td><td><Status value={item.status} /></td><td><button className={styles.button} disabled={Boolean(busy)} onClick={() => { if (!mutationLock.current) { showOperation(item); setError(""); } }}>{item.status === "LISTA" ? "Recuperar consulta" : "Ver detalle"}<DashboardIcon name="arrow" /><span className={styles.srOnly}> de {item.deviceTag || item.imei || item.id}</span></button></td>
            </tr>) : <tr><td colSpan={5} className={styles.historyEmpty}>{historyQuery.trim() ? "No hay operaciones que coincidan con tu búsqueda." : "Todavía no hay operaciones para mostrar."}</td></tr>}</tbody></table></div>
            <footer className={styles.historyFooter}><span>{filteredHistory.length ? `Mostrando ${(currentHistoryPage - 1) * 10 + 1}–${Math.min(currentHistoryPage * 10, filteredHistory.length)} de ${filteredHistory.length} ${filteredHistory.length === 1 ? "operación" : "operaciones"}` : "0 operaciones"}</span><nav className={styles.pagination} aria-label="Páginas del historial"><button className={styles.button} disabled={currentHistoryPage <= 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}>Anterior</button>{Array.from({ length: historyPages }, (_, index) => index + 1).map(page => <button key={page} className={styles.button} aria-label={`Página ${page}`} aria-current={currentHistoryPage === page ? "page" : undefined} onClick={() => setHistoryPage(page)}>{page}</button>)}<button className={styles.button} disabled={currentHistoryPage >= historyPages} onClick={() => setHistoryPage(currentHistoryPage + 1)}>Siguiente</button></nav></footer>
          </>}
        </section>
      </main>
    </div>
  </div>;
}
