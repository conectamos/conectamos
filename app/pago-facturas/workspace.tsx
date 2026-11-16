"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { DashboardSidebar, type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { formatoPesos } from "@/lib/monthly-reports-view";
import type { InvoiceDetail, InvoiceItem, InvoicePage, InvoiceReport } from "./types";
import styles from "./pago-facturas.module.css";

const navigation: NavigationItem[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" },
  { href: "/ventas", icon: "sales", label: "Ventas" },
  { href: "/inventario", icon: "inventory", label: "Inventario" },
  { href: "/prestamos", icon: "loans", label: "Préstamos" },
  { href: "/caja", icon: "cash", label: "Caja" },
  { href: "/pago-facturas", icon: "document", label: "Pago de facturas" },
  { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
  { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
];
const count = (value: number) => value.toLocaleString("es-CO");
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
const monthLabel = (value: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00Z`));
const timeLabel = (value: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
function moneyInput(value: string) {
  const compact = value.trim().replace(/[\s$]/g, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(compact)) return null;
  const amount = Number(compact.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 && amount <= 999_999_999_999.99 ? amount : null;
}
function validDate(value: string) {
  if (!/^(?:19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No fue posible consultar las facturas.");
  return body as T;
}
class SaveError extends Error {
  constructor(message: string, public uncertain = false, public code = "") { super(message); }
}
async function postInvoice(url: string, body: Record<string, unknown>) {
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new SaveError("No se pudo confirmar la respuesta. Reintenta el mismo registro para verificarlo sin duplicarlo.", true); }
  let result: { error?: string; code?: string; invoice?: InvoiceItem };
  try { result = await response.json(); }
  catch { throw new SaveError("La respuesta no pudo confirmarse. Reintenta el mismo registro.", true); }
  if (!response.ok) throw new SaveError(result.error || "No fue posible guardar. Intenta de nuevo.", response.status >= 500, result.code);
  if (!result.invoice?.id || !Number.isFinite(result.invoice.balance)) throw new SaveError("No fue posible confirmar los datos guardados. Reintenta el mismo registro.", true);
  return result.invoice;
}

function InvoiceColumn({ paid, page, loading, failed, onPage, onPayment, onHistory }: {
  paid: boolean; page?: InvoicePage; loading: boolean; failed: boolean;
  onPage: (page: number) => void;
  onPayment: (invoice: InvoiceItem, trigger: HTMLButtonElement) => void;
  onHistory: (invoice: InvoiceItem, trigger: HTMLButtonElement) => void;
}) {
  const heading = paid ? "FACTURAS PAGAS" : "FACTURAS PENDIENTES";
  return <section className={styles.column} aria-labelledby={paid ? "paid-title" : "pending-title"} aria-busy={loading}>
    <header className={styles.columnHeader}><div><span className={`${styles.columnIcon} ${paid ? styles.paidIcon : ""}`}><DashboardIcon name={paid ? "approvals" : "document"} /></span><h2 id={paid ? "paid-title" : "pending-title"}>{heading}</h2></div><span className={styles.countBadge}>{loading || !page ? "—" : count(page.total)}</span></header>
    {loading ? <div className={styles.empty} role="status"><DashboardIcon name="refresh" /><p>Cargando facturas…</p></div> : failed && !page ? <div className={styles.empty}><p>No fue posible cargar las facturas.</p></div> : page?.items.length ? <div className={styles.invoiceList}>{page.items.map((invoice) => <article className={styles.invoice} key={invoice.id}>
      <div className={styles.invoiceHeading}><span className={styles.invoiceNumber}>Factura {invoice.number}</span><span className={`${styles.badge} ${paid ? styles.badgePaid : styles.badgePending}`}>{paid ? "Pagada" : invoice.paidAmount > 0 ? "Abono parcial" : "Pendiente"}</span></div>
      <h3>{invoice.provider}</h3><p className={styles.invoiceDate}><DashboardIcon name="calendar" className="h-4 w-4" />{dateLabel(invoice.date)}</p>
      <dl className={styles.invoiceAmounts}><div><dt>Valor factura</dt><dd>{formatoPesos(invoice.amount)}</dd></div><div><dt>Abonado</dt><dd>{formatoPesos(invoice.paidAmount)}</dd></div><div><dt>Saldo</dt><dd className={!paid ? styles.pendingBalance : undefined}>{formatoPesos(invoice.balance)}</dd></div></dl>
      <div className={styles.invoiceActions}>{!paid && <button type="button" className={styles.payButton} onClick={(event) => onPayment(invoice, event.currentTarget)}>Abonar / pagar<DashboardIcon name="arrow" className="h-4 w-4" /></button>}<button type="button" className={styles.historyButton} onClick={(event) => onHistory(invoice, event.currentTarget)} aria-label={`Ver pagos de factura ${invoice.number}`}>Ver pagos ({count(invoice.paymentCount)})</button></div>
    </article>)}</div> : <div className={styles.empty}><DashboardIcon name={paid ? "approvals" : "document"} /><strong>{paid ? "Sin facturas pagas" : "Sin facturas pendientes"}</strong><p>No hay resultados para el mes y la búsqueda seleccionados.</p></div>}
    <footer className={styles.pagination}><span>{loading ? "Consultando…" : page ? `${count(page.total)} facturas · 10 por página` : "Sin datos confirmados"}</span><nav aria-label={`Páginas de ${paid ? "facturas pagas" : "facturas pendientes"}`}><button type="button" aria-label={`Página anterior de ${paid ? "pagas" : "pendientes"}`} disabled={loading || !page || page.page <= 1} onClick={() => onPage((page?.page ?? 1) - 1)}><DashboardIcon name="chevron" className="h-4 w-4 rotate-90" /></button><span>{page ? `Página ${page.page} de ${Math.max(1, page.pages)}` : "Página —"}</span><button type="button" aria-label={`Página siguiente de ${paid ? "pagas" : "pendientes"}`} disabled={loading || !page || page.page >= page.pages} onClick={() => onPage((page?.page ?? 1) + 1)}><DashboardIcon name="chevron" className="h-4 w-4 -rotate-90" /></button></nav></footer>
  </section>;
}

type InvoiceDraft = { number: string; provider: string; date: string; amount: string };
type PaymentDraft = { date: string; mode: "partial" | "full"; amount: string; reference: string };
type Modal = { kind: "create" } | { kind: "payment" | "history"; invoice: InvoiceItem };

export default function InvoicePaymentsWorkspace({ today, userName }: { today: string; userName: string }) {
  const [filters, setFilters] = useState({ month: today.slice(0, 7), search: "" });
  const [applied, setApplied] = useState(filters);
  const [pendingPage, setPendingPage] = useState(1);
  const [paidPage, setPaidPage] = useState(1);
  const [report, setReport] = useState<InvoiceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({ number: "", provider: "", date: today, amount: "" });
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({ date: today, mode: "full", amount: "", reference: "" });
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailReload, setDetailReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [formError, setFormError] = useState("");
  const [formCode, setFormCode] = useState("");
  const requestId = useRef("");
  const savedIntent = useRef<{ url: string; body: Record<string, unknown> } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modalKind = modal?.kind;
  const modalInvoiceId = modal && modal.kind !== "create" ? modal.invoice.id : null;
  const locked = saving || uncertain;
  const query = new URLSearchParams({ month: applied.month, search: applied.search, pendingPage: String(pendingPage), paidPage: String(paidPage) }).toString();
  const unapplied = filters.month !== applied.month || filters.search.trim() !== applied.search;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pago-facturas?${query}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<InvoiceReport>).then((value) => { if (!controller.signal.aborted) { setReport(value); setLoadError(""); } })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "No fue posible cargar las facturas."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, reload]);

  useEffect(() => {
    if (!modalKind) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, [modalKind, modalInvoiceId]);

  useEffect(() => {
    if (!modalInvoiceId) return;
    const controller = new AbortController();
    fetch(`/api/pago-facturas/${modalInvoiceId}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<{ invoice: InvoiceDetail }>).then((value) => { if (!controller.signal.aborted) { setDetail(value.invoice); setDetailError(""); } })
      .catch((error) => { if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "No fue posible consultar la factura."); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [modalInvoiceId, detailReload]);

  function refreshReport() { setLoading(true); setLoadError(""); setReload((value) => value + 1); }
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (!/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(filters.month)) return;
    setApplied({ month: filters.month, search: filters.search.trim() });
    setPendingPage(1); setPaidPage(1); setReport(null); setNotice(""); refreshReport();
  }
  function changePage(kind: "pending" | "paid", page: number) {
    if (kind === "pending") setPendingPage(page); else setPaidPage(page);
    setLoading(true); setLoadError("");
  }
  function resetIntent() { requestId.current = crypto.randomUUID(); savedIntent.current = null; setFormError(""); setFormCode(""); }
  function openCreate(trigger: HTMLButtonElement) {
    triggerRef.current = trigger; resetIntent(); setUncertain(false);
    setInvoiceDraft({ number: "", provider: "", date: applied.month === today.slice(0, 7) ? today : `${applied.month}-01`, amount: "" });
    setModal({ kind: "create" });
  }
  function openInvoice(kind: "payment" | "history", invoice: InvoiceItem, trigger: HTMLButtonElement) {
    triggerRef.current = trigger; resetIntent(); setUncertain(false); setDetail(null); setDetailError(""); setDetailLoading(true);
    setPaymentDraft({ date: today, mode: "full", amount: "", reference: "" }); setModal({ kind, invoice });
  }
  function closeModal() {
    if (locked) return;
    dialogRef.current?.close(); setModal(null); triggerRef.current?.focus({ preventScroll: true });
  }
  function refreshInvoice() {
    if (locked) return;
    resetIntent(); setDetailLoading(true); setDetailError(""); setDetail(null); setDetailReload((value) => value + 1);
  }
  function updateInvoice(patch: Partial<InvoiceDraft>) { if (!locked) { resetIntent(); setInvoiceDraft((value) => ({ ...value, ...patch })); } }
  function updatePayment(patch: Partial<PaymentDraft>) { if (!locked) { resetIntent(); setPaymentDraft((value) => ({ ...value, ...patch })); } }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!modal || modal.kind === "history" || saving) return;
    let intent = uncertain ? savedIntent.current : null;
    if (!intent) {
      if (modal.kind === "create") {
        const amount = moneyInput(invoiceDraft.amount);
        if (!invoiceDraft.number.trim() || !invoiceDraft.provider.trim()) { setFormError("Indica el número de factura y el proveedor."); return; }
        if (!validDate(invoiceDraft.date)) { setFormError("Selecciona una fecha de factura válida."); return; }
        if (amount === null) { setFormError("Escribe un valor mayor que cero, con máximo dos decimales. Ejemplo: 1.250.000,50."); return; }
        intent = { url: "/api/pago-facturas", body: { requestId: requestId.current, number: invoiceDraft.number.trim(), provider: invoiceDraft.provider.trim(), date: invoiceDraft.date, amount } };
      } else {
        if (!detail || detailLoading || detailError || detail.balance <= 0) return;
        if (!validDate(paymentDraft.date)) { setFormError("Selecciona una fecha de pago válida."); return; }
        const amount = moneyInput(paymentDraft.amount);
        if (paymentDraft.mode === "partial" && (amount === null || Math.round(amount * 100) > Math.round(detail.balance * 100))) { setFormError(`El abono debe ser mayor que cero y no superar el saldo de ${formatoPesos(detail.balance)}.`); return; }
        intent = { url: `/api/pago-facturas/${detail.id}/payments`, body: { requestId: requestId.current, version: detail.version, date: paymentDraft.date, mode: paymentDraft.mode, ...(paymentDraft.mode === "partial" ? { amount } : {}), reference: paymentDraft.reference.trim() || null } };
      }
      savedIntent.current = intent;
    }
    setSaving(true); setFormError(""); setFormCode("");
    try {
      const invoice = await postInvoice(intent.url, intent.body);
      setUncertain(false); savedIntent.current = null;
      setNotice(modal.kind === "create" ? `Factura ${invoice.number} registrada para ${monthLabel(invoice.date.slice(0, 7))}.` : `${invoice.status === "PAGADA" ? "Factura pagada" : "Abono registrado"}: ${invoice.number} · saldo ${formatoPesos(invoice.balance)}.`);
      dialogRef.current?.close(); setModal(null); triggerRef.current?.focus({ preventScroll: true }); refreshReport();
    } catch (error) {
      setUncertain(error instanceof SaveError && error.uncertain);
      setFormCode(error instanceof SaveError ? error.code : "");
      setFormError(error instanceof Error ? error.message : "No fue posible guardar el registro.");
    } finally { setSaving(false); }
  }

  const modalInvoice = detail || (modal && modal.kind !== "create" ? modal.invoice : null);
  const partialAmount = moneyInput(paymentDraft.amount);
  const projectedBalance = detail ? paymentDraft.mode === "full" ? 0 : partialAmount === null ? null : (Math.round(detail.balance * 100) - Math.round(partialAmount * 100)) / 100 : null;
  const heading = modal?.kind === "create" ? "Nueva factura" : modal?.kind === "payment" ? "Registrar pago" : "Historial de pagos";

  return <div className={styles.shell}><DashboardSidebar activeHref="/pago-facturas" coverageLabel="Administración central" items={navigation} /><div className={styles.workspace}><main className={styles.main}>
    <header className={styles.header}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><span>/</span><span>Pago de facturas</span></nav><h1>PAGO DE FACTURAS</h1><p>Control mensual de facturas, abonos y pagos.</p></div><div className={styles.headerActions}><span className={styles.identity}><DashboardIcon name="user" />{userName}</span><button type="button" className={styles.primaryButton} onClick={(event) => openCreate(event.currentTarget)}><DashboardIcon name="document-add" />Nueva factura</button></div></header>
    <form className={styles.filters} onSubmit={applyFilters}><label>Mes de la factura<input type="month" value={filters.month} min="1900-01" max="2100-12" required onChange={(event) => setFilters((value) => ({ ...value, month: event.target.value }))} /></label><label className={styles.search}>Buscar factura o proveedor<input type="search" value={filters.search} maxLength={160} placeholder="Número o proveedor" onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} /></label><button type="submit" className={styles.secondaryButton} disabled={loading}><DashboardIcon name="search" />Consultar</button><p className={styles.filterNote}>El mes corresponde a la fecha de la factura. Los pagos conservan su fecha real.{unapplied && <span>Filtros sin aplicar · pulsa Consultar.</span>}</p></form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loadError && <div className={styles.error} role="alert"><p>{loadError}{report && " Se conservan los últimos datos consultados."}</p><button type="button" className={styles.secondaryButton} onClick={refreshReport} disabled={loading}>Reintentar</button></div>}
    <div className={styles.periodHeading}><h2>{monthLabel(applied.month)}</h2><span>Administración central · COP</span></div>
    <section className={styles.metrics} aria-label="Resumen de facturas del mes" aria-busy={loading}><article><span className={styles.metricIcon}><DashboardIcon name="document" /></span><div><h3>Total facturas</h3><strong>{loading || !report ? "—" : formatoPesos(report.summary.totalAmount)}</strong><p>{loading || !report ? "Consultando…" : `${count(report.summary.invoiceCount)} facturas en el periodo`}</p></div></article><article><span className={`${styles.metricIcon} ${styles.paidIcon}`}><DashboardIcon name="wallet" /></span><div><h3>Abonado</h3><strong>{loading || !report ? "—" : formatoPesos(report.summary.paidAmount)}</strong><p>Pagos registrados de estas facturas</p></div></article><article><span className={styles.metricIcon}><DashboardIcon name="clock" /></span><div><h3>Saldo pendiente</h3><strong>{loading || !report ? "—" : formatoPesos(report.summary.balance)}</strong><p>{loading || !report ? "Consultando…" : `${count(report.summary.pendingCount)} facturas por completar`}</p></div></article></section>
    <div className={styles.columns}><InvoiceColumn paid={false} page={report?.pending} loading={loading} failed={Boolean(loadError)} onPage={(page) => changePage("pending", page)} onPayment={(invoice, trigger) => openInvoice("payment", invoice, trigger)} onHistory={(invoice, trigger) => openInvoice("history", invoice, trigger)} /><InvoiceColumn paid page={report?.paid} loading={loading} failed={Boolean(loadError)} onPage={(page) => changePage("paid", page)} onPayment={(invoice, trigger) => openInvoice("payment", invoice, trigger)} onHistory={(invoice, trigger) => openInvoice("history", invoice, trigger)} /></div>
  </main></div>

    {modal && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="invoice-dialog-title" aria-describedby="invoice-dialog-context" onCancel={(event) => { event.preventDefault(); closeModal(); }} onClose={() => { setModal(null); triggerRef.current?.focus({ preventScroll: true }); }}>
      <header className={styles.dialogHeader}><div><p>Pago de facturas</p><h2 id="invoice-dialog-title">{heading}</h2><span id="invoice-dialog-context">{modal.kind === "create" ? `Registro para ${monthLabel(applied.month)}` : `${modalInvoice?.provider} · Factura ${modalInvoice?.number}`}</span></div><button type="button" className={styles.closeButton} disabled={locked} aria-label="Cerrar ventana" onClick={closeModal}><DashboardIcon name="close" /></button></header>
      {modal.kind !== "create" && <><dl className={styles.detailAmounts}><div><dt>Valor factura</dt><dd>{formatoPesos(modalInvoice?.amount ?? 0)}</dd></div><div><dt>Abonado</dt><dd>{formatoPesos(modalInvoice?.paidAmount ?? 0)}</dd></div><div><dt>Saldo</dt><dd>{formatoPesos(modalInvoice?.balance ?? 0)}</dd></div></dl>{detailLoading && <p role="status" className={styles.help}>Consultando el estado actual de la factura…</p>}{detailError && <div className={styles.error} role="alert"><p>{detailError}</p><button type="button" className={styles.secondaryButton} onClick={refreshInvoice} disabled={locked}>Reintentar consulta</button></div>}</>}
      {modal.kind === "history" ? <><section className={styles.paymentHistory} aria-label="Pagos de la factura">{!detailLoading && !detailError && (detail?.payments.length ? <ol>{detail.payments.map((payment) => <li key={payment.id}><div><time dateTime={payment.date}>{dateLabel(payment.date)}</time><strong>{formatoPesos(payment.amount)}</strong></div>{payment.reference && <p>{payment.reference}</p>}<small>Registrado por {payment.createdBy} · {timeLabel(payment.createdAt)}</small></li>)}</ol> : <p className={styles.emptyHistory}>Esta factura todavía no tiene pagos registrados.</p>)}</section><footer className={styles.dialogFooter}><button type="button" className={styles.secondaryButton} onClick={closeModal}>Cerrar</button></footer></> : <form onSubmit={submitForm} noValidate>
        {modal.kind === "create" ? <div className={styles.formGrid}><label className={styles.fullField}>Proveedor<input value={invoiceDraft.provider} maxLength={160} autoComplete="organization" disabled={locked} onChange={(event) => updateInvoice({ provider: event.target.value })} autoFocus /></label><label>Número de factura<input value={invoiceDraft.number} maxLength={160} disabled={locked} onChange={(event) => updateInvoice({ number: event.target.value })} /></label><label>Fecha de la factura<input type="date" value={invoiceDraft.date} min="1900-01-01" max="2100-12-31" disabled={locked} onChange={(event) => updateInvoice({ date: event.target.value })} /></label><label className={styles.fullField}>Valor de la factura (COP)<input type="text" inputMode="decimal" value={invoiceDraft.amount} placeholder="Ej. 1.250.000" disabled={locked} onChange={(event) => updateInvoice({ amount: event.target.value })} /></label></div> : <div className={styles.paymentForm}><fieldset className={styles.paymentMode} disabled={locked || detailLoading || Boolean(detailError)}><legend>Tipo de pago</legend><label><input type="radio" name="payment-mode" checked={paymentDraft.mode === "full"} onChange={() => updatePayment({ mode: "full" })} />Pagar saldo completo</label><label><input type="radio" name="payment-mode" checked={paymentDraft.mode === "partial"} onChange={() => updatePayment({ mode: "partial" })} />Abono parcial</label></fieldset><div className={styles.formGrid}><label>Fecha del pago<input type="date" value={paymentDraft.date} min="1900-01-01" max="2100-12-31" disabled={locked || detailLoading || Boolean(detailError)} onChange={(event) => updatePayment({ date: event.target.value })} autoFocus /></label>{paymentDraft.mode === "partial" ? <label>Valor del abono (COP)<input type="text" inputMode="decimal" value={paymentDraft.amount} placeholder="Valor a registrar" disabled={locked || detailLoading || Boolean(detailError)} onChange={(event) => updatePayment({ amount: event.target.value })} /></label> : <div className={styles.fullPayment}><span>Valor del pago</span><strong>{detailLoading || !detail ? "—" : formatoPesos(detail.balance)}</strong></div>}<label className={styles.fullField}>Referencia o comprobante (opcional)<input value={paymentDraft.reference} maxLength={200} disabled={locked || detailLoading || Boolean(detailError)} onChange={(event) => updatePayment({ reference: event.target.value })} placeholder="Número de transferencia o comprobante" /></label></div><div className={styles.balancePreview}><span>Saldo después del pago</span><strong>{detailLoading || projectedBalance === null || projectedBalance < 0 ? "—" : formatoPesos(projectedBalance)}</strong></div><p className={styles.help}>Este registro no realiza una transferencia bancaria.</p>{!detailLoading && detail?.balance === 0 && <p className={styles.help}>La factura ya está pagada.</p>}</div>}
        {formError && <div className={styles.formError} role="alert"><p>{formError}</p>{formCode === "STALE_VERSION" && modal.kind === "payment" && <button type="button" className={styles.secondaryButton} onClick={refreshInvoice} disabled={locked}>Actualizar factura y revisar</button>}</div>}
        {uncertain && <p className={styles.help}>Los datos se conservan para reintentar exactamente el mismo registro.</p>}
        <footer className={styles.dialogFooter}><button type="button" className={styles.secondaryButton} disabled={locked} onClick={closeModal}>Cancelar</button><button type="submit" className={styles.primaryButton} disabled={saving || (!uncertain && modal.kind === "payment" && (detailLoading || Boolean(detailError) || !detail || detail.balance <= 0))}>{saving ? "Guardando…" : uncertain ? modal.kind === "create" ? "Reintentar registro" : "Reintentar pago" : modal.kind === "create" ? "Registrar factura" : "Registrar pago"}</button></footer>
      </form>}
    </dialog>}
  </div>;
}
