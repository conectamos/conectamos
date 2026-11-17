"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { DashboardSidebar, type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { formatoPesos } from "@/lib/monthly-reports-view";
import { triggerLiveRefresh } from "@/lib/use-live-refresh";
import type { InvoiceDetail, InvoiceItem, InvoicePage, InvoiceProvider, InvoiceReport } from "./types";
import InvoiceReminderStatus from "./reminder-status";
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
type MutationIntent = { url: string; method: "POST" | "PATCH" | "DELETE"; body: Record<string, unknown> };
async function mutateRecord(intent: MutationIntent) {
  let response: Response;
  try { response = await fetch(intent.url, { method: intent.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent.body) }); }
  catch { throw new SaveError("No se pudo confirmar la respuesta. Reintenta el mismo registro para verificarlo sin duplicarlo.", true); }
  let result: { error?: string; code?: string; invoice?: InvoiceItem; provider?: InvoiceProvider };
  try { result = await response.json(); }
  catch { throw new SaveError("La respuesta no pudo confirmarse. Reintenta el mismo registro.", true); }
  if (!response.ok) throw new SaveError(result.error || "No fue posible guardar. Intenta de nuevo.", response.status >= 500, result.code);
  if (intent.url.includes("/providers")) {
    if (!result.provider?.id || !result.provider.name) throw new SaveError("No fue posible confirmar el proveedor guardado. Reintenta el mismo registro.", true);
  } else if (!result.invoice?.id || !Number.isFinite(result.invoice.balance)) throw new SaveError("No fue posible confirmar los datos guardados. Reintenta el mismo registro.", true);
  triggerLiveRefresh("invoice-payments");
  return result;
}

function InvoiceDue({ invoice }: { invoice: InvoiceItem }) {
  const status = invoice.status === "PAGADA" ? "PAGADA" : invoice.dueStatus;
  const label = status === "VENCIDA" ? "Vencida" : status === "HOY" ? "Vence hoy" : status === "PROXIMA" ? "Próxima a vencer" : null;
  return <div className={styles.dueLine}><span>{invoice.dueDate ? `Vencimiento: ${dateLabel(invoice.dueDate)}` : "Vencimiento sin registrar"}</span>{label && <span className={`${styles.dueBadge} ${status === "VENCIDA" ? styles.overdueBadge : styles.upcomingBadge}`}>{label}</span>}</div>;
}

function InvoicePaymentHistory({ invoice }: { invoice: InvoiceDetail }) {
  return <section className={styles.paymentHistory} aria-label="Pagos de la factura">{invoice.payments.length ? <ol>{invoice.payments.map((payment) => <li key={payment.id}><div><time dateTime={payment.date}>{dateLabel(payment.date)}</time><strong>{formatoPesos(payment.amount)}</strong></div>{payment.reference && <p>{payment.reference}</p>}<small>Registrado por {payment.createdBy} · {timeLabel(payment.createdAt)}</small></li>)}</ol> : <p className={styles.emptyHistory}>Esta factura todavía no tiene pagos registrados.</p>}</section>;
}

function InvoiceColumn({ paid, month, page, loading, failed, onPage, onPayment, onHistory, onEdit, onDelete }: {
  paid: boolean; month: string; page?: InvoicePage; loading: boolean; failed: boolean;
  onPage: (page: number) => void;
  onPayment: (invoice: InvoiceItem, trigger: HTMLButtonElement) => void;
  onHistory: (invoice: InvoiceItem, trigger: HTMLButtonElement) => void;
  onEdit: (invoice: InvoiceItem, trigger: HTMLButtonElement) => void;
  onDelete: (invoice: InvoiceItem, trigger: HTMLButtonElement) => void;
}) {
  const heading = paid ? "FACTURAS PAGAS" : "FACTURAS PENDIENTES";
  return <section className={styles.column} aria-labelledby={paid ? "paid-title" : "pending-title"} aria-busy={loading}>
    <header className={styles.columnHeader}><div><span className={`${styles.columnIcon} ${paid ? styles.paidIcon : ""}`}><DashboardIcon name={paid ? "approvals" : "document"} /></span><h2 id={paid ? "paid-title" : "pending-title"}>{heading}</h2></div><span className={styles.countBadge}>{loading || !page ? "—" : count(page.total)}</span></header>
    <p className={styles.columnScope}>{paid ? `Facturas de ${monthLabel(month)}` : "Todas las pendientes, de cualquier mes"}</p>
    {loading ? <div className={styles.empty} role="status"><DashboardIcon name="refresh" /><p>Cargando facturas…</p></div> : failed && !page ? <div className={styles.empty}><p>No fue posible cargar las facturas.</p></div> : page?.items.length ? <div className={styles.invoiceList}>{page.items.map((invoice) => <article className={styles.invoice} key={invoice.id}>
      <div className={styles.invoiceHeading}><span className={styles.invoiceNumber}>Factura {invoice.number}</span><span className={`${styles.badge} ${paid ? styles.badgePaid : styles.badgePending}`}>{paid ? "Pagada" : invoice.paidAmount > 0 ? "Abono parcial" : "Pendiente"}</span></div>
      <h3>{invoice.provider}</h3><p className={styles.invoiceDate}><DashboardIcon name="calendar" className="h-4 w-4" />{dateLabel(invoice.date)}</p>
      <InvoiceDue invoice={invoice} />
      <dl className={styles.invoiceAmounts}><div><dt>Valor factura</dt><dd>{formatoPesos(invoice.amount)}</dd></div><div><dt>Abonado</dt><dd>{formatoPesos(invoice.paidAmount)}</dd></div><div><dt>Saldo</dt><dd className={!paid ? styles.pendingBalance : undefined}>{formatoPesos(invoice.balance)}</dd></div></dl>
      <div className={styles.invoiceActions}>{!paid && <button type="button" className={styles.payButton} onClick={(event) => onPayment(invoice, event.currentTarget)}>Abonar / pagar<DashboardIcon name="arrow" className="h-4 w-4" /></button>}<button type="button" className={styles.historyButton} onClick={(event) => onHistory(invoice, event.currentTarget)} aria-label={`Ver pagos de factura ${invoice.number}`}>Ver pagos ({count(invoice.paymentCount)})</button></div>
      <div className={styles.managementActions}><button type="button" onClick={(event) => onEdit(invoice, event.currentTarget)} aria-label={`Editar factura ${invoice.number}`}>Editar</button><button type="button" className={styles.deleteLink} onClick={(event) => onDelete(invoice, event.currentTarget)} aria-label={`Eliminar factura ${invoice.number}`}>Eliminar</button></div>
    </article>)}</div> : <div className={styles.empty}><DashboardIcon name={paid ? "approvals" : "document"} /><strong>{paid ? "Sin facturas pagas" : "Sin facturas pendientes"}</strong><p>{paid ? "No hay resultados para el mes y la búsqueda seleccionados." : "No hay facturas pendientes que coincidan con la búsqueda."}</p></div>}
    <footer className={styles.pagination}><span>{loading ? "Consultando…" : page ? `${count(page.total)} facturas · 10 por página` : "Sin datos confirmados"}</span><nav aria-label={`Páginas de ${paid ? "facturas pagas" : "facturas pendientes"}`}><button type="button" aria-label={`Página anterior de ${paid ? "pagas" : "pendientes"}`} disabled={loading || !page || page.page <= 1} onClick={() => onPage((page?.page ?? 1) - 1)}><DashboardIcon name="chevron" className="h-4 w-4 rotate-90" /></button><span>{page ? `Página ${page.page} de ${Math.max(1, page.pages)}` : "Página —"}</span><button type="button" aria-label={`Página siguiente de ${paid ? "pagas" : "pendientes"}`} disabled={loading || !page || page.page >= page.pages} onClick={() => onPage((page?.page ?? 1) + 1)}><DashboardIcon name="chevron" className="h-4 w-4 -rotate-90" /></button></nav></footer>
  </section>;
}

type InvoiceDraft = { number: string; providerId: string; date: string; dueDate: string; amount: string };
type PaymentDraft = { date: string; mode: "partial" | "full"; amount: string; reference: string };
type InvoiceModalKind = "payment" | "history" | "edit" | "delete" | "restore";
type Modal = { kind: "create" | "providers" } | { kind: InvoiceModalKind; invoice: InvoiceItem };

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
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({ number: "", providerId: "", date: today, dueDate: "", amount: "" });
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedPage, setDeletedPage] = useState(1);
  const [deletedReport, setDeletedReport] = useState<InvoicePage | null>(null);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState("");
  const [providers, setProviders] = useState<InvoiceProvider[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerReload, setProviderReload] = useState(0);
  const [providerDraft, setProviderDraft] = useState({ name: "", mode: "create" as "create" | "edit" | "delete", provider: null as InvoiceProvider | null });
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
  const savedIntent = useRef<MutationIntent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modalKind = modal?.kind;
  const modalInvoiceId = modal && "invoice" in modal ? modal.invoice.id : null;
  const locked = saving || uncertain;
  const query = new URLSearchParams({ month: applied.month, search: applied.search, pendingPage: String(pendingPage), paidPage: String(paidPage) }).toString();
  const unapplied = filters.month !== applied.month || filters.search.trim() !== applied.search;
  const deletedQuery = new URLSearchParams({ deleted: "1", month: applied.month, search: applied.search, page: String(deletedPage) }).toString();
  const needsProviders = modalKind === "create" || modalKind === "edit" || modalKind === "providers";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pago-facturas?${query}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<InvoiceReport>).then((value) => { if (!controller.signal.aborted) { setReport(value); setLoadError(""); } })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "No fue posible cargar las facturas."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, reload]);

  useEffect(() => {
    if (!showDeleted) return;
    const controller = new AbortController();
    fetch(`/api/pago-facturas?${deletedQuery}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<InvoicePage>).then((value) => { if (!controller.signal.aborted) { setDeletedReport(value); setDeletedError(""); } })
      .catch((error) => { if (!controller.signal.aborted) setDeletedError(error instanceof Error ? error.message : "No fue posible consultar las facturas eliminadas."); })
      .finally(() => { if (!controller.signal.aborted) setDeletedLoading(false); });
    return () => controller.abort();
  }, [showDeleted, deletedQuery, reload]);

  useEffect(() => {
    if (!needsProviders) return;
    const controller = new AbortController();
    fetch("/api/pago-facturas/providers", { cache: "no-store", signal: controller.signal })
      .then(readJson<{ items: InvoiceProvider[] }>).then((value) => { if (!controller.signal.aborted) { setProviders(value.items); setProviderError(""); } })
      .catch((error) => { if (!controller.signal.aborted) setProviderError(error instanceof Error ? error.message : "No fue posible consultar los proveedores."); })
      .finally(() => { if (!controller.signal.aborted) setProviderLoading(false); });
    return () => controller.abort();
  }, [needsProviders, providerReload]);

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
      .then(readJson<{ invoice: InvoiceDetail }>).then((value) => { if (!controller.signal.aborted) { setDetail(value.invoice); setDetailError(""); if (modalKind === "edit") setInvoiceDraft({ number: value.invoice.number, providerId: value.invoice.providerId ? String(value.invoice.providerId) : "legacy", date: value.invoice.date, dueDate: value.invoice.dueDate || "", amount: value.invoice.amount.toLocaleString("es-CO", { maximumFractionDigits: 2 }) }); } })
      .catch((error) => { if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "No fue posible consultar la factura."); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [modalInvoiceId, modalKind, detailReload]);

  function refreshReport() { setLoading(true); setLoadError(""); if (showDeleted) setDeletedLoading(true); setReload((value) => value + 1); }
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (!/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(filters.month)) return;
    setApplied({ month: filters.month, search: filters.search.trim() });
    setPendingPage(1); setPaidPage(1); setDeletedPage(1); setDeletedReport(null); setReport(null); setNotice(""); refreshReport();
  }
  function changePage(kind: "pending" | "paid", page: number) {
    if (kind === "pending") setPendingPage(page); else setPaidPage(page);
    setLoading(true); setLoadError("");
  }
  function resetIntent() { requestId.current = crypto.randomUUID(); savedIntent.current = null; setFormError(""); setFormCode(""); }
  function openCreate(trigger: HTMLButtonElement) {
    triggerRef.current = trigger; resetIntent(); setUncertain(false);
    setInvoiceDraft({ number: "", providerId: "", date: today, dueDate: "", amount: "" });
    setProviderLoading(true); setProviderError("");
    setModal({ kind: "create" });
  }
  function openInvoice(kind: InvoiceModalKind, invoice: InvoiceItem, trigger: HTMLButtonElement) {
    triggerRef.current = trigger; resetIntent(); setUncertain(false); setDetail(null); setDetailError(""); setDetailLoading(true);
    setConfirmedDelete(false); if (kind === "edit") { setProviderLoading(true); setProviderError(""); }
    setPaymentDraft({ date: today, mode: "full", amount: "", reference: "" }); setModal({ kind, invoice });
  }
  function openProviders(trigger: HTMLButtonElement) { triggerRef.current = trigger; resetIntent(); setNotice(""); setUncertain(false); setConfirmedDelete(false); setProviderDraft({ name: "", mode: "create", provider: null }); setProviderLoading(true); setProviderError(""); setModal({ kind: "providers" }); }
  function selectProviderAction(mode: "create" | "edit" | "delete", provider: InvoiceProvider | null = null) { if (locked) return; resetIntent(); setConfirmedDelete(false); setProviderDraft({ mode, provider, name: provider?.name || "" }); }
  function refreshProviders() { if (locked) return; resetIntent(); setConfirmedDelete(false); setProviderDraft({ mode: "create", provider: null, name: "" }); setProviderLoading(true); setProviderError(""); setProviderReload((value) => value + 1); }
  function closeModal() {
    if (locked) return;
    dialogRef.current?.close(); setModal(null); triggerRef.current?.focus({ preventScroll: true });
  }
  function refreshInvoice() {
    if (locked) return;
    resetIntent(); setConfirmedDelete(false); setDetailLoading(true); setDetailError(""); setDetail(null); setDetailReload((value) => value + 1);
  }
  function updateInvoice(patch: Partial<InvoiceDraft>) { if (!locked) { resetIntent(); setInvoiceDraft((value) => ({ ...value, ...patch })); } }
  function updatePayment(patch: Partial<PaymentDraft>) { if (!locked) { resetIntent(); setPaymentDraft((value) => ({ ...value, ...patch })); } }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!modal || modal.kind === "history" || saving) return;
    let intent = uncertain ? savedIntent.current : null;
    if (!intent) {
      if (modal.kind === "providers") {
        if (providerLoading || providerError) return;
        if (providerDraft.mode === "delete" && !confirmedDelete) { setFormError("Confirma la eliminación del proveedor."); return; }
        if (providerDraft.mode !== "delete" && !providerDraft.name.trim()) { setFormError("Indica el nombre del proveedor."); return; }
        const existing = providerDraft.provider;
        intent = { url: `/api/pago-facturas/providers${existing ? `/${existing.id}` : ""}`, method: providerDraft.mode === "delete" ? "DELETE" : existing ? "PATCH" : "POST", body: { requestId: requestId.current, ...(existing ? { version: existing.version } : {}), ...(providerDraft.mode === "delete" ? {} : { name: providerDraft.name.trim() }) } };
      } else if (modal.kind === "create" || modal.kind === "edit") {
        if (providerLoading || providerError || (modal.kind === "edit" && (!detail || detailLoading || detailError || detail.deletedAt))) return;
        const amount = moneyInput(invoiceDraft.amount);
        const selectedProvider = providers.find((item) => item.active && String(item.id) === invoiceDraft.providerId);
        const retainedProvider = modal.kind === "edit" && detail && invoiceDraft.providerId === (detail.providerId ? String(detail.providerId) : "legacy");
        if (!invoiceDraft.number.trim() || (!selectedProvider && !retainedProvider)) { setFormError("Indica el número de factura y el proveedor."); return; }
        if (!validDate(invoiceDraft.date)) { setFormError("Selecciona una fecha de factura válida."); return; }
        if (invoiceDraft.dueDate && (!validDate(invoiceDraft.dueDate) || invoiceDraft.dueDate < invoiceDraft.date)) { setFormError("El vencimiento debe ser una fecha válida igual o posterior a la fecha de la factura."); return; }
        if (amount === null) { setFormError("Escribe un valor mayor que cero, con máximo dos decimales. Ejemplo: 1.250.000,50."); return; }
        if (modal.kind === "edit" && detail && Math.round(amount * 100) < Math.round(detail.paidAmount * 100)) { setFormError(`El valor de la factura no puede ser menor que los ${formatoPesos(detail.paidAmount)} ya abonados.`); return; }
        const providerBody = invoiceDraft.providerId === "legacy" ? { provider: detail?.provider } : { providerId: Number(invoiceDraft.providerId) };
        intent = { url: modal.kind === "edit" ? `/api/pago-facturas/${detail!.id}` : "/api/pago-facturas", method: modal.kind === "edit" ? "PATCH" : "POST", body: { requestId: requestId.current, ...(modal.kind === "edit" ? { version: detail!.version } : {}), number: invoiceDraft.number.trim(), ...providerBody, date: invoiceDraft.date, dueDate: invoiceDraft.dueDate || null, amount } };
      } else if (modal.kind === "payment") {
        if (!detail || detailLoading || detailError || detail.balance <= 0 || detail.deletedAt) return;
        if (!validDate(paymentDraft.date)) { setFormError("Selecciona una fecha de pago válida."); return; }
        const amount = moneyInput(paymentDraft.amount);
        if (paymentDraft.mode === "partial" && (amount === null || Math.round(amount * 100) > Math.round(detail.balance * 100))) { setFormError(`El abono debe ser mayor que cero y no superar el saldo de ${formatoPesos(detail.balance)}.`); return; }
        intent = { url: `/api/pago-facturas/${detail.id}/payments`, method: "POST", body: { requestId: requestId.current, version: detail.version, date: paymentDraft.date, mode: paymentDraft.mode, ...(paymentDraft.mode === "partial" ? { amount } : {}), reference: paymentDraft.reference.trim() || null } };
      } else {
        if (!detail || detailLoading || detailError) return;
        if (modal.kind === "delete" && !confirmedDelete) { setFormError("Confirma la eliminación de la factura."); return; }
        intent = { url: `/api/pago-facturas/${detail.id}${modal.kind === "restore" ? "/restore" : ""}`, method: modal.kind === "delete" ? "DELETE" : "POST", body: { requestId: requestId.current, version: detail.version } };
      }
      savedIntent.current = intent;
    }
    setSaving(true); setFormError(""); setFormCode("");
    try {
      const result = await mutateRecord(intent);
      setUncertain(false); savedIntent.current = null;
      if (modal.kind === "providers") {
        setNotice(`Proveedor ${result.provider!.name} ${providerDraft.mode === "delete" ? "eliminado del catálogo activo" : "guardado"}.`);
        setProviderDraft({ mode: "create", name: "", provider: null }); setConfirmedDelete(false); resetIntent(); setProviderLoading(true); setProviderReload((value) => value + 1); return;
      }
      const invoice = result.invoice!;
      setNotice(modal.kind === "create" ? `Factura ${invoice.number} registrada para ${monthLabel(invoice.date.slice(0, 7))}.` : modal.kind === "edit" ? `Factura ${invoice.number} actualizada. Sus pagos se conservan.` : modal.kind === "delete" ? `Factura ${invoice.number} eliminada del reporte. Puedes restaurarla en Facturas eliminadas.` : modal.kind === "restore" ? `Factura ${invoice.number} restaurada${invoice.status === "PAGADA" ? ` en pagadas de ${monthLabel(invoice.date.slice(0, 7))}` : " en pendientes"}.` : invoice.status === "PAGADA" ? `Factura pagada: ${invoice.number}. Disponible en pagadas de ${monthLabel(invoice.date.slice(0, 7))}.` : `Abono registrado: ${invoice.number} · saldo ${formatoPesos(invoice.balance)}.`);
      dialogRef.current?.close(); setModal(null); triggerRef.current?.focus({ preventScroll: true }); refreshReport();
    } catch (error) {
      setUncertain(error instanceof SaveError && error.uncertain);
      setFormCode(error instanceof SaveError ? error.code : "");
      setFormError(error instanceof Error ? error.message : "No fue posible guardar el registro.");
    } finally { setSaving(false); }
  }

  const modalInvoice = detail || (modal && "invoice" in modal ? modal.invoice : null);
  const partialAmount = moneyInput(paymentDraft.amount);
  const projectedBalance = detail ? paymentDraft.mode === "full" ? 0 : partialAmount === null ? null : (Math.round(detail.balance * 100) - Math.round(partialAmount * 100)) / 100 : null;
  const heading = modal?.kind === "create" ? "Nueva factura" : modal?.kind === "payment" ? "Registrar pago" : modal?.kind === "edit" ? "Editar factura" : modal?.kind === "delete" ? "Eliminar factura" : modal?.kind === "restore" ? "Restaurar factura" : modal?.kind === "providers" ? "Gestionar proveedores" : "Historial de pagos";
  const invoiceFieldsLocked = locked || providerLoading || Boolean(providerError) || (modal?.kind === "edit" && (detailLoading || Boolean(detailError) || !detail));
  const freshDetailUnavailable = detailLoading || Boolean(detailError) || !detail;
  const submitLabel = uncertain ? modal?.kind === "payment" ? "Reintentar pago" : "Reintentar registro" : modal?.kind === "create" ? "Registrar factura" : modal?.kind === "edit" ? "Guardar cambios" : modal?.kind === "delete" ? "Eliminar factura" : modal?.kind === "restore" ? "Restaurar factura" : modal?.kind === "providers" ? providerDraft.mode === "delete" ? "Eliminar proveedor" : providerDraft.mode === "edit" ? "Guardar proveedor" : "Crear proveedor" : "Registrar pago";

  return <div className={styles.shell}><DashboardSidebar activeHref="/pago-facturas" coverageLabel="Administración central" items={navigation} /><div className={styles.workspace}><main className={styles.main}>
    <header className={styles.header}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><span>/</span><span>Pago de facturas</span></nav><h1>PAGO DE FACTURAS</h1><p>Control mensual de facturas, abonos y pagos.</p></div><div className={styles.headerActions}><span className={styles.identity}><DashboardIcon name="user" />{userName}</span><button type="button" className={styles.secondaryButton} onClick={(event) => openProviders(event.currentTarget)}>Gestionar proveedores</button><button type="button" className={styles.primaryButton} onClick={(event) => openCreate(event.currentTarget)}><DashboardIcon name="document-add" />Nueva factura</button></div></header>
    <InvoiceReminderStatus />
    <form className={styles.filters} onSubmit={applyFilters}><label>Mes de pagadas y eliminadas<input type="month" value={filters.month} min="1900-01" max="2100-12" required onChange={(event) => setFilters((value) => ({ ...value, month: event.target.value }))} /></label><label className={styles.search}>Buscar factura o proveedor<input type="search" value={filters.search} maxLength={160} placeholder="Número o proveedor" onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} /></label><button type="submit" className={styles.secondaryButton} disabled={loading}><DashboardIcon name="search" />Consultar</button><p className={styles.filterNote}>Las pendientes incluyen todos los meses. El mes filtra pagadas y eliminadas por fecha de factura.{unapplied && <span>Filtros sin aplicar · pulsa Consultar.</span>}</p></form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loadError && <div className={styles.error} role="alert"><p>{loadError}{report && " Se conservan los últimos datos consultados."}</p><button type="button" className={styles.secondaryButton} onClick={refreshReport} disabled={loading}>Reintentar</button></div>}
    <div className={styles.periodHeading}><h2>Todas las pendientes · pagadas de {monthLabel(applied.month)}</h2><span>Administración central · COP</span></div>
    <section className={styles.metrics} aria-label="Resumen de facturas consultadas" aria-busy={loading}><article><span className={styles.metricIcon}><DashboardIcon name="document" /></span><div><h3>Total facturas</h3><strong>{loading || !report ? "—" : formatoPesos(report.summary.totalAmount)}</strong><p>{loading || !report ? "Consultando…" : `${count(report.summary.invoiceCount)} facturas · pendientes y pagadas consultadas`}</p></div></article><article><span className={`${styles.metricIcon} ${styles.paidIcon}`}><DashboardIcon name="wallet" /></span><div><h3>Abonado</h3><strong>{loading || !report ? "—" : formatoPesos(report.summary.paidAmount)}</strong><p>Pagos registrados de estas facturas</p></div></article><article><span className={styles.metricIcon}><DashboardIcon name="clock" /></span><div><h3>Saldo pendiente</h3><strong>{loading || !report ? "—" : formatoPesos(report.summary.balance)}</strong><p>{loading || !report ? "Consultando…" : `${count(report.summary.pendingCount)} facturas por completar · todos los meses`}</p></div></article></section>
    {!loading && report && typeof report.summary.overdueCount === "number" && typeof report.summary.dueSoonCount === "number" && <div className={styles.dueSummary} aria-label="Resumen de vencimientos"><span className={styles.overdueSummary}><strong>{count(report.summary.overdueCount)}</strong> vencidas</span><span><strong>{count(report.summary.dueSoonCount)}</strong> vencen hoy o en los próximos 7 días</span></div>}
    <p className={styles.orderNote}>Ordenadas por vencimiento · sin fecha al final.</p>
    <div className={styles.columns}>{([false, true] as const).map((paid) => <InvoiceColumn key={String(paid)} paid={paid} month={applied.month} page={paid ? report?.paid : report?.pending} loading={loading} failed={Boolean(loadError)} onPage={(page) => changePage(paid ? "paid" : "pending", page)} onPayment={(invoice, trigger) => openInvoice("payment", invoice, trigger)} onHistory={(invoice, trigger) => openInvoice("history", invoice, trigger)} onEdit={(invoice, trigger) => openInvoice("edit", invoice, trigger)} onDelete={(invoice, trigger) => openInvoice("delete", invoice, trigger)} />)}</div>
    <section className={styles.deletedSection} aria-label="Facturas eliminadas"><button type="button" className={styles.deletedToggle} aria-expanded={showDeleted} onClick={() => { if (!showDeleted) { setDeletedLoading(true); setDeletedError(""); } setShowDeleted((value) => !value); }}>Facturas eliminadas<DashboardIcon name="chevron" className={showDeleted ? "h-4 w-4 rotate-180" : "h-4 w-4"} /></button>{showDeleted && <><p className={styles.deletedHelp}>Facturas retiradas del reporte de {monthLabel(applied.month)}. Sus pagos se conservan y puedes restaurarlas.</p>{deletedError && <div className={styles.error} role="alert"><p>{deletedError}</p><button type="button" className={styles.secondaryButton} onClick={refreshReport} disabled={deletedLoading}>Reintentar consulta de eliminadas</button></div>}{deletedLoading ? <p role="status" className={styles.deletedHelp}>Consultando facturas eliminadas…</p> : deletedReport ? deletedReport.items.length ? <div className={styles.deletedList}>{deletedReport.items.map((invoice) => <article key={invoice.id}><div><strong>Factura {invoice.number}</strong><p>{invoice.provider}</p><small>{dateLabel(invoice.date)} · Valor {formatoPesos(invoice.amount)} · Abonado {formatoPesos(invoice.paidAmount)}</small></div><div className={styles.deletedActions}><button type="button" className={styles.historyButton} aria-label={`Ver pagos de factura eliminada ${invoice.number}`} onClick={(event) => openInvoice("history", invoice, event.currentTarget)}>Ver pagos ({count(invoice.paymentCount)})</button><button type="button" className={styles.secondaryButton} aria-label={`Restaurar factura ${invoice.number}`} onClick={(event) => openInvoice("restore", invoice, event.currentTarget)}>Restaurar</button></div></article>)}</div> : <p className={styles.deletedHelp}>No hay facturas eliminadas con estos filtros.</p> : null}<footer className={styles.pagination}><span>{deletedLoading ? "Consultando…" : deletedReport ? `${count(deletedReport.total)} facturas · 10 por página` : "Sin datos confirmados"}</span><nav aria-label="Páginas de facturas eliminadas"><button type="button" aria-label="Página anterior de eliminadas" disabled={deletedLoading || !deletedReport || deletedReport.page <= 1} onClick={() => { setDeletedPage((deletedReport?.page ?? 1) - 1); setDeletedLoading(true); }}><DashboardIcon name="chevron" className="h-4 w-4 rotate-90" /></button><span>{deletedReport ? `Página ${deletedReport.page} de ${Math.max(1, deletedReport.pages)}` : "Página —"}</span><button type="button" aria-label="Página siguiente de eliminadas" disabled={deletedLoading || !deletedReport || deletedReport.page >= deletedReport.pages} onClick={() => { setDeletedPage((deletedReport?.page ?? 1) + 1); setDeletedLoading(true); }}><DashboardIcon name="chevron" className="h-4 w-4 -rotate-90" /></button></nav></footer></>}</section>
  </main></div>

    {modal && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="invoice-dialog-title" aria-describedby="invoice-dialog-context" onCancel={(event) => { event.preventDefault(); closeModal(); }} onClose={() => { setModal(null); triggerRef.current?.focus({ preventScroll: true }); }}>
      <header className={styles.dialogHeader}><div><p>Pago de facturas</p><h2 id="invoice-dialog-title">{heading}</h2><span id="invoice-dialog-context">{modal.kind === "create" ? "Registra la factura con su fecha real" : modal.kind === "providers" ? "Catálogo de proveedores para tus facturas" : `${modalInvoice?.provider} · Factura ${modalInvoice?.number}`}</span></div><button type="button" className={styles.closeButton} disabled={locked} aria-label="Cerrar ventana" onClick={closeModal}><DashboardIcon name="close" /></button></header>
      {"invoice" in modal && <><dl className={styles.detailAmounts}><div><dt>Valor factura</dt><dd>{formatoPesos(modalInvoice?.amount ?? 0)}</dd></div><div><dt>Abonado</dt><dd>{formatoPesos(modalInvoice?.paidAmount ?? 0)}</dd></div><div><dt>Saldo</dt><dd>{formatoPesos(modalInvoice?.balance ?? 0)}</dd></div></dl>{detailLoading && <p role="status" className={styles.help}>Consultando el estado actual de la factura…</p>}{detailError && <div className={styles.error} role="alert"><p>{detailError}</p><button type="button" className={styles.secondaryButton} onClick={refreshInvoice} disabled={locked}>Reintentar consulta</button></div>}{detail?.deletedAt && modal.kind !== "restore" && <p className={styles.help}>Esta factura está eliminada del reporte. Se conserva su historial.</p>}</>}
      {needsProviders && <>{providerLoading && <p role="status" className={styles.help}>Consultando proveedores…</p>}{providerError && <div className={styles.error} role="alert"><p>{providerError}</p><button type="button" className={styles.secondaryButton} onClick={refreshProviders} disabled={locked}>Reintentar proveedores</button></div>}</>}
      {modal.kind === "history" ? <>{!freshDetailUnavailable && detail && <InvoicePaymentHistory invoice={detail} />}<footer className={styles.dialogFooter}><button type="button" className={styles.secondaryButton} onClick={closeModal}>Cerrar</button></footer></> : <form onSubmit={submitForm} noValidate>
        {modal.kind === "create" || modal.kind === "edit" ? <>
          <div className={styles.formGrid}>
            <label className={styles.fullField}>Proveedor<select value={invoiceDraft.providerId} disabled={invoiceFieldsLocked} onChange={(event) => updateInvoice({ providerId: event.target.value })} autoFocus><option value="">Selecciona un proveedor</option>{modal.kind === "edit" && detail && <option value={detail.providerId ? String(detail.providerId) : "legacy"}>{detail.provider}{!providers.some((provider) => provider.id === detail.providerId && provider.active) ? " (actual · fuera del catálogo activo)" : " (actual)"}</option>}{providers.filter((provider) => provider.active && !(modal.kind === "edit" && provider.id === detail?.providerId)).map((provider) => <option key={provider.id} value={String(provider.id)}>{provider.name}</option>)}</select></label>
            {!providerLoading && !providerError && !providers.some((provider) => provider.active) && <p className={styles.fullField}>Agrega un proveedor desde Gestionar proveedores antes de registrar una factura.</p>}
            <label>Número de factura<input value={invoiceDraft.number} maxLength={160} disabled={invoiceFieldsLocked} onChange={(event) => updateInvoice({ number: event.target.value })} /></label>
            <label>Fecha de la factura<input type="date" value={invoiceDraft.date} min="1900-01-01" max="2100-12-31" disabled={invoiceFieldsLocked} onChange={(event) => updateInvoice({ date: event.target.value })} /></label>
            <label>Vencimiento (opcional)<input type="date" value={invoiceDraft.dueDate} min={invoiceDraft.date || "1900-01-01"} max="2100-12-31" disabled={invoiceFieldsLocked} onChange={(event) => updateInvoice({ dueDate: event.target.value })} /></label>
            <label>Valor de la factura (COP)<input type="text" inputMode="decimal" value={invoiceDraft.amount} placeholder="Ej. 1.250.000" disabled={invoiceFieldsLocked} onChange={(event) => updateInvoice({ amount: event.target.value })} /></label>
          </div>{modal.kind === "edit" && <p className={styles.help}>Los pagos registrados se conservan. El valor no puede ser menor que lo abonado. La fecha define el mes de consulta cuando esté pagada.</p>}
        </> : modal.kind === "providers" ? <>
          {notice && <p className={styles.catalogNotice} role="status">{notice}</p>}
          <section className={styles.providerCatalog} aria-label="Proveedores activos">{!providerLoading && !providerError && (providers.some((provider) => provider.active) ? <ul>{providers.filter((provider) => provider.active).map((provider) => <li key={provider.id}><strong>{provider.name}</strong><div><button type="button" disabled={locked} aria-label={`Editar proveedor ${provider.name}`} onClick={() => selectProviderAction("edit", provider)}>Editar</button><button type="button" className={styles.deleteLink} disabled={locked} aria-label={`Eliminar proveedor ${provider.name}`} onClick={() => selectProviderAction("delete", provider)}>Eliminar</button></div></li>)}</ul> : <p>No hay proveedores activos. Registra el primero.</p>)}</section>
          {providerDraft.mode === "delete" ? <div className={styles.confirmation}><h3>Eliminar {providerDraft.provider?.name}</h3><p>Dejará de estar disponible para nuevas facturas. Las facturas y pagos existentes conservan su proveedor.</p><label><input type="checkbox" checked={confirmedDelete} disabled={locked || providerLoading} onChange={(event) => { resetIntent(); setConfirmedDelete(event.target.checked); }} />Confirmo eliminar este proveedor</label></div> : <div className={styles.formGrid}><label className={styles.fullField}>Nombre del proveedor<input value={providerDraft.name} maxLength={160} disabled={locked || providerLoading || Boolean(providerError)} onChange={(event) => { if (!locked) { resetIntent(); setProviderDraft((value) => ({ ...value, name: event.target.value })); } }} placeholder="Nombre o razón social" autoFocus /></label></div>}
          {providerDraft.mode !== "create" && <div className={styles.catalogReset}><button type="button" className={styles.secondaryButton} disabled={locked} onClick={() => selectProviderAction("create")}>Cancelar selección / nuevo proveedor</button></div>}
        </> : modal.kind === "delete" || modal.kind === "restore" ? <>
          <div className={styles.confirmation}><h3>{modal.kind === "delete" ? "Retirar esta factura del reporte" : "Volver a incluir esta factura"}</h3><p>{modal.kind === "delete" ? "Se retirará de los totales y de las columnas del mes. Sus pagos se conservan y podrás restaurarla en Facturas eliminadas." : "La factura volverá a su mes original, con todos sus pagos y el saldo actual."}</p>{detail && !freshDetailUnavailable && <p><strong>{count(detail.paymentCount)} pagos registrados</strong> · {formatoPesos(detail.paidAmount)} abonados.</p>}{modal.kind === "delete" && <label><input type="checkbox" checked={confirmedDelete} disabled={locked || freshDetailUnavailable} onChange={(event) => { resetIntent(); setConfirmedDelete(event.target.checked); }} />Confirmo eliminar esta factura del reporte</label>}</div>
          {!freshDetailUnavailable && detail && <InvoicePaymentHistory invoice={detail} />}
        </> : <div className={styles.paymentForm}>
          <fieldset className={styles.paymentMode} disabled={locked || freshDetailUnavailable || Boolean(detail?.deletedAt)}><legend>Tipo de pago</legend><label><input type="radio" name="payment-mode" checked={paymentDraft.mode === "full"} onChange={() => updatePayment({ mode: "full" })} />Pagar saldo completo</label><label><input type="radio" name="payment-mode" checked={paymentDraft.mode === "partial"} onChange={() => updatePayment({ mode: "partial" })} />Abono parcial</label></fieldset>
          <div className={styles.formGrid}><label>Fecha del pago<input type="date" value={paymentDraft.date} min="1900-01-01" max="2100-12-31" disabled={locked || freshDetailUnavailable || Boolean(detail?.deletedAt)} onChange={(event) => updatePayment({ date: event.target.value })} autoFocus /></label>{paymentDraft.mode === "partial" ? <label>Valor del abono (COP)<input type="text" inputMode="decimal" value={paymentDraft.amount} placeholder="Valor a registrar" disabled={locked || freshDetailUnavailable || Boolean(detail?.deletedAt)} onChange={(event) => updatePayment({ amount: event.target.value })} /></label> : <div className={styles.fullPayment}><span>Valor del pago</span><strong>{detailLoading || !detail ? "—" : formatoPesos(detail.balance)}</strong></div>}<label className={styles.fullField}>Referencia o comprobante (opcional)<input value={paymentDraft.reference} maxLength={200} disabled={locked || freshDetailUnavailable || Boolean(detail?.deletedAt)} onChange={(event) => updatePayment({ reference: event.target.value })} placeholder="Número de transferencia o comprobante" /></label></div>
          <div className={styles.balancePreview}><span>Saldo después del pago</span><strong>{detailLoading || projectedBalance === null || projectedBalance < 0 ? "—" : formatoPesos(projectedBalance)}</strong></div><p className={styles.help}>Este registro no realiza una transferencia bancaria.</p>{!detailLoading && detail?.balance === 0 && <p className={styles.help}>La factura ya está pagada.</p>}
        </div>}
        {formError && <div className={styles.formError} role="alert"><p>{formError}</p>{formCode === "STALE_VERSION" && modal.kind !== "create" && <button type="button" className={styles.secondaryButton} onClick={modal.kind === "providers" ? refreshProviders : refreshInvoice} disabled={locked}>{modal.kind === "providers" ? "Actualizar proveedores y revisar" : "Actualizar factura y revisar"}</button>}</div>}
        {uncertain && <p className={styles.help}>Los datos se conservan para reintentar exactamente el mismo registro.</p>}
        <footer className={styles.dialogFooter}><button type="button" className={styles.secondaryButton} disabled={locked} onClick={closeModal}>{modal.kind === "providers" ? "Cerrar" : "Cancelar"}</button><button type="submit" className={styles.primaryButton} disabled={saving || (!uncertain && (modal.kind === "create" || modal.kind === "edit" ? invoiceFieldsLocked || (modal.kind === "edit" && Boolean(detail?.deletedAt)) : modal.kind === "providers" ? providerLoading || Boolean(providerError) || (providerDraft.mode === "delete" && !confirmedDelete) : freshDetailUnavailable || (modal.kind === "payment" && (!detail || detail.balance <= 0 || Boolean(detail.deletedAt))) || (modal.kind === "delete" && (!confirmedDelete || Boolean(detail?.deletedAt))) || (modal.kind === "restore" && !detail?.deletedAt)))}>{saving ? "Guardando…" : submitLabel}</button></footer>
      </form>}
    </dialog>}
  </div>;
}
