"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./proveedores.module.css";
import {
  triggerLiveRefresh,
  useLiveRefresh,
} from "@/lib/use-live-refresh";
import {
  formatPaymentAmountInput,
  moneyValueToCents,
  moneyValueToPaymentInput,
  normalizePaymentAmountInput,
  paymentAmountToCents,
} from "@/lib/proveedores-pagos";
import { resumirFacturasSeleccionadas } from "@/lib/proveedores-seleccion";

type WorkspaceSession = {
  nombre: string;
  rol: string;
  rolNombre: string;
  sedeNombre: string;
  usuario: string;
};

type AbonoProveedor = {
  aprobadoEn: string;
  aprobadoPor: string | null;
  id: number;
  numeroRecibo: string;
  observacion: string | null;
  reciboUrl: string;
  referencia: string | null;
  saldoAnterior: number;
  saldoPosterior: number;
  valor: number;
};

type FacturaProveedor = {
  abonos: AbonoProveedor[];
  aliado: string;
  cantidadAbonos: number;
  diasParaVencer: number | null;
  estado: string;
  estadoVencimiento: string | null;
  fechaVencimiento: string;
  id: number;
  numeroFactura: string;
  pagoAprobadoEn: string | null;
  pagoAprobadoPor: string | null;
  saldoPendiente: number;
  valorAbonado: number;
  valorFactura: number;
  valorPagar: number;
};

type CategoriaFactura = "PAGADA" | "PENDIENTE" | "POR_VENCER" | "VENCIDA";

type FacturaVista = FacturaProveedor & {
  categoria: CategoriaFactura;
  diasCalculados: number;
};

type FiltroEstado = "TODAS" | CategoriaFactura;

type FormularioFactura = {
  aliado: string;
  fechaVencimiento: string;
  numeroFactura: string;
  valorPagar: string;
};

type FormularioPago = {
  observacion: string;
  referencia: string;
  valorAbono: string;
};

type IntentoPago = {
  idempotencyKey: string;
  observacion?: string;
  referencia?: string;
  valorAbono: string;
};

type ReciboSeleccionado = {
  abono: AbonoProveedor;
  factura: FacturaProveedor;
};

type FlashMessage = {
  text: string;
  tone: "error" | "info" | "success";
};

type PushStatus =
  | "active"
  | "checking"
  | "denied"
  | "error"
  | "inactive"
  | "unsupported";

const DEFAULT_NOTIFICATION_DAYS = 3;

const EMPTY_FORM: FormularioFactura = {
  aliado: "",
  fechaVencimiento: "",
  numeroFactura: "",
  valorPagar: "",
};

const EMPTY_PAYMENT_FORM: FormularioPago = {
  observacion: "",
  referencia: "",
  valorAbono: "",
};

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  currency: "COP",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  style: "currency",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();
}

function formatMoney(value: number) {
  return moneyFormatter.format(Number(value || 0)).replace("COP", "$").trim();
}

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

function todayInBogota() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Bogota",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function parseDateKey(value: string) {
  const match = dateKey(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function daysBetween(dateValue: string, todayValue: string) {
  const dueDate = parseDateKey(dateValue);
  const todayDate = parseDateKey(todayValue);

  if (!dueDate || !todayDate) return 0;

  return Math.round((dueDate.getTime() - todayDate.getTime()) / 86_400_000);
}

function formatDate(value: string) {
  const parsed = parseDateKey(value);

  if (!parsed) return "Sin fecha";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function actorName(value: unknown) {
  if (typeof value === "string") return value.trim() || null;

  if (isRecord(value)) {
    const candidate = value.nombre ?? value.usuario ?? value.name;
    return typeof candidate === "string" ? candidate.trim() || null : null;
  }

  return null;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function numericValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePayment(
  value: unknown,
  fallbackInvoiceId?: number,
): AbonoProveedor | null {
  if (!isRecord(value)) return null;

  const id = Number(value.id || 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rawInvoiceId = Number(value.facturaId ?? fallbackInvoiceId ?? 0);
  const invoiceId =
    Number.isInteger(rawInvoiceId) && rawInvoiceId > 0 ? rawInvoiceId : null;

  return {
    aprobadoEn: String(value.aprobadoEn ?? value.createdAt ?? ""),
    aprobadoPor: actorName(
      value.aprobadoPor ?? value.aprobadoPorNombre ?? value.usuario,
    ),
    id,
    numeroRecibo:
      optionalText(value.numeroRecibo ?? value.recibo) ?? `REC-${id}`,
    observacion: optionalText(value.observacion),
    reciboUrl:
      optionalText(value.reciboUrl) ??
      (invoiceId
        ? `/api/proveedores/${invoiceId}/abonos/${id}/recibo`
        : ""),
    referencia: optionalText(value.referencia),
    saldoAnterior: Math.max(0, numericValue(value.saldoAnterior)),
    saldoPosterior: Math.max(0, numericValue(value.saldoPosterior)),
    valor: Math.max(0, numericValue(value.valor ?? value.valorAbono)),
  };
}

function normalizeInvoice(value: unknown): FacturaProveedor | null {
  if (!isRecord(value)) return null;

  const id = Number(value.id || 0);

  if (!Number.isInteger(id) || id <= 0) return null;

  const estado = String(value.estado || "PENDIENTE").trim().toUpperCase();
  const pagoAprobadoEn = value.pagoAprobadoEn
    ? String(value.pagoAprobadoEn)
    : null;
  const abonos = (Array.isArray(value.abonos) ? value.abonos : [])
    .map((abono) => normalizePayment(abono, id))
    .filter((abono): abono is AbonoProveedor => Boolean(abono));
  const valorFactura = Math.max(
    0,
    numericValue(value.valorFactura ?? value.valorPagar ?? value.valor),
  );
  const valorAbonadoDesdeAbonos = abonos.reduce(
    (total, abono) => total + abono.valor,
    0,
  );
  const pagoTotalAnterior =
    Boolean(pagoAprobadoEn) ||
    ["APROBADO", "PAGADO", "PAGO_APROBADO"].includes(estado);
  const valorAbonado = Math.max(
    0,
    value.valorAbonado === undefined || value.valorAbonado === null
      ? valorAbonadoDesdeAbonos || (pagoTotalAnterior ? valorFactura : 0)
      : numericValue(value.valorAbonado),
  );
  const saldoPendiente = Math.max(
    0,
    value.saldoPendiente === undefined || value.saldoPendiente === null
      ? valorFactura - valorAbonado
      : numericValue(value.saldoPendiente),
  );
  const rawPaymentCount = Number(value.cantidadAbonos);
  const rawDays = Number(
    value.diasParaVencer ?? value.diasParaVencimiento,
  );
  const rawDueStatus = value.estadoVencimiento ?? value.situacion;

  return {
    abonos,
    aliado: String(value.aliado || "Sin aliado").trim(),
    cantidadAbonos:
      Number.isInteger(rawPaymentCount) && rawPaymentCount >= 0
        ? rawPaymentCount
        : abonos.length,
    diasParaVencer: Number.isFinite(rawDays) ? rawDays : null,
    estado,
    estadoVencimiento: rawDueStatus
      ? String(rawDueStatus).trim().toUpperCase()
      : null,
    fechaVencimiento: String(value.fechaVencimiento || "").trim(),
    id,
    numeroFactura: String(value.numeroFactura ?? value.factura ?? "Sin número").trim(),
    pagoAprobadoEn,
    pagoAprobadoPor: actorName(
      value.pagoAprobadoPor ?? value.pagoAprobadoPorNombre,
    ),
    saldoPendiente,
    valorAbonado,
    valorFactura,
    valorPagar: numericValue(
      value.valorPagar ?? value.valorFactura ?? value.valor,
    ),
  };
}

function isPaid(invoice: FacturaProveedor) {
  return (
    (invoice.valorFactura > 0 && invoice.saldoPendiente <= 0) ||
    Boolean(invoice.pagoAprobadoEn) ||
    ["APROBADO", "PAGADO", "PAGO_APROBADO"].includes(invoice.estado)
  );
}

function invoiceView(
  invoice: FacturaProveedor,
  today: string,
  notificationDays: number,
): FacturaVista {
  const calculatedDays =
    invoice.diasParaVencer ?? daysBetween(invoice.fechaVencimiento, today);

  if (isPaid(invoice)) {
    return { ...invoice, categoria: "PAGADA", diasCalculados: calculatedDays };
  }

  if (
    invoice.estadoVencimiento === "VENCIDA" ||
    invoice.estadoVencimiento === "VENCIDO" ||
    calculatedDays < 0
  ) {
    return { ...invoice, categoria: "VENCIDA", diasCalculados: calculatedDays };
  }

  if (
    ["POR_VENCER", "VENCE_HOY", "PROXIMA"].includes(
      invoice.estadoVencimiento || "",
    ) ||
    calculatedDays <= notificationDays
  ) {
    return {
      ...invoice,
      categoria: "POR_VENCER",
      diasCalculados: calculatedDays,
    };
  }

  return { ...invoice, categoria: "PENDIENTE", diasCalculados: calculatedDays };
}

function cleanNumericValue(value: string) {
  return value.replace(/\D/g, "");
}

function formatInputValue(value: string) {
  if (!value) return "";
  return Number(value).toLocaleString("es-CO");
}

function createPaymentIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `proveedores-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson(response: Response) {
  try {
    const value = (await response.json()) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function responseError(payload: Record<string, unknown>, fallback: string) {
  const candidate = payload.error ?? payload.mensaje ?? payload.message;
  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : fallback;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function browserSupportsNotifications() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

function browserSupportsPush() {
  return browserSupportsNotifications() && "PushManager" in window;
}

async function registerSupplierServiceWorker() {
  if (!browserSupportsNotifications()) {
    throw new Error("Este navegador no admite notificaciones seguras.");
  }

  return navigator.serviceWorker.register("/proveedores-sw.js", { scope: "/" });
}

async function showDailyLocalReminder(
  invoices: FacturaProveedor[],
  today: string,
  notificationDays: number,
  userKey: string,
) {
  if (
    !browserSupportsNotifications() ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const storageKey = `conectamos:proveedores:recordatorio-local:${normalizeText(
    userKey,
  )}:${today}`;

  try {
    if (window.localStorage.getItem(storageKey)) return;

    const urgent = invoices
      .map((invoice) => invoiceView(invoice, today, notificationDays))
      .filter(
        (invoice) =>
          invoice.categoria === "VENCIDA" ||
          invoice.categoria === "POR_VENCER",
      );

    if (urgent.length === 0) return;

    const overdue = urgent.filter(
      (invoice) => invoice.categoria === "VENCIDA",
    ).length;
    const registration = await registerSupplierServiceWorker();

    if (
      "PushManager" in window &&
      (await registration.pushManager.getSubscription())
    ) {
      return;
    }

    const upcoming = urgent.length - overdue;
    const body =
      overdue > 0 && upcoming > 0
        ? `${overdue} factura${overdue === 1 ? " está" : "s están"} vencida${
            overdue === 1 ? "" : "s"
          } y ${upcoming} próxima${upcoming === 1 ? "" : "s"} a vencer.`
        : overdue > 0
          ? `${overdue} factura${overdue === 1 ? " está vencida" : "s están vencidas"}.`
          : `${upcoming} factura${upcoming === 1 ? " está" : "s están"} próxima${
              upcoming === 1 ? "" : "s"
            } a vencer.`;

    await registration.showNotification("Vencimientos de proveedores", {
      badge: "/branding/conectamos-logo.png",
      body,
      data: { url: "/dashboard/proveedores" },
      icon: "/branding/conectamos-logo.png",
      tag: `proveedores-vencimientos-${today}`,
    });
    window.localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // El recordatorio local es un respaldo y nunca debe bloquear la pantalla.
  }
}

function AccessibleDialog({
  children,
  description,
  initialFocusRef,
  maxWidthClass = "max-w-2xl",
  onClose,
  title,
  titleId,
}: {
  children: ReactNode;
  description: string;
  initialFocusRef?: { current: HTMLElement | null };
  maxWidthClass?: string;
  onClose: () => void;
  title: string;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusDialog = window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (initialFocusRef?.current || firstFocusable || dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [initialFocusRef]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-description`}
        tabIndex={-1}
        className={`max-h-[calc(100vh-3rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.3)] ${maxWidthClass}`}
      >
        <div className="h-1 bg-[#e30613]" />
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e30613]">
              Proveedores
            </p>
            <h2
              id={titleId}
              className="mt-1 text-2xl font-black tracking-tight text-slate-950"
            >
              {title}
            </h2>
            <p
              id={`${titleId}-description`}
              className="mt-1 max-w-xl text-sm leading-6 text-slate-500"
            >
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label={`Cerrar ${title.toLocaleLowerCase("es-CO")}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e30613] focus-visible:ring-offset-2"
          >
            <DashboardIcon name="close" className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MetricCard({
  detail,
  icon,
  iconClassName,
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  detail?: string;
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <article className={styles.metric}>
        <span
          className={`${styles.metricIcon} ${iconClassName}`}
        >
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
        <div>
          <p>{label}</p>
          <p
            className={`${styles.metricValue} ${valueClassName}`}
          >
            {value}
          </p>
          {detail && <span className={styles.metricDetail}>{detail}</span>}
        </div>
    </article>
  );
}

function InvoiceSelectionCheckbox({
  checked,
  disabled = false,
  label,
  mixed = false,
  onChange,
  showLabel = false,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  onChange: () => void;
  showLabel?: boolean;
}) {
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={mixed ? "mixed" : checked}
        ref={(input) => {
          if (input) input.indeterminate = mixed;
        }}
        onChange={onChange}
      />
      <span className={showLabel ? undefined : styles.srOnly}>{label}</span>
    </label>
  );
}

function StatusBadge({ invoice }: { invoice: FacturaVista }) {
  const badgeStyles: Record<CategoriaFactura, string> = {
    PAGADA: styles.statusPaid,
    PENDIENTE: "",
    POR_VENCER: styles.statusUpcoming,
    VENCIDA: styles.statusOverdue,
  };
  let label = "PENDIENTE";

  if (invoice.categoria === "PAGADA") label = "PAGO APROBADO";
  if (invoice.categoria === "VENCIDA") label = "VENCIDA";
  if (invoice.categoria === "POR_VENCER") {
    label =
      invoice.diasCalculados === 0
        ? "VENCE HOY"
        : invoice.diasCalculados === 1
          ? "VENCE MAÑANA"
          : "POR VENCER";
  }

  return (
    <span className={styles.statusBadges}>
      <span
        className={`${styles.statusBadge} ${badgeStyles[invoice.categoria]}`}
      >
        {label}
      </span>
      {invoice.categoria !== "PAGADA" && invoice.valorAbonado > 0 && (
        <span className={`${styles.statusBadge} ${styles.statusUpcoming}`}>
          Abono parcial
        </span>
      )}
    </span>
  );
}

export default function ProveedoresWorkspace({
  session,
}: {
  session: WorkspaceSession;
}) {
  const [invoices, setInvoices] = useState<FacturaProveedor[]>([]);
  const [today, setToday] = useState(() => todayInBogota());
  const [notificationDays, setNotificationDays] = useState(
    DEFAULT_NOTIFICATION_DAYS,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [query, setQuery] = useState("");
  const [allyFilter, setAllyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<FiltroEstado>("TODAS");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [form, setForm] = useState<FormularioFactura>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormularioFactura, string>>
  >({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [approvalInvoice, setApprovalInvoice] =
    useState<FacturaVista | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] =
    useState<FormularioPago>(EMPTY_PAYMENT_FORM);
  const [paymentAmountFocused, setPaymentAmountFocused] = useState(false);
  const [paymentAmountError, setPaymentAmountError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState("");
  const [paymentAttempt, setPaymentAttempt] = useState<IntentoPago | null>(
    null,
  );
  const [receiptPayment, setReceiptPayment] =
    useState<ReciboSeleccionado | null>(null);
  const [receiptHistoryInvoice, setReceiptHistoryInvoice] =
    useState<FacturaVista | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState<
    "activate" | "deactivate" | "test" | null
  >(null);
  const [pushError, setPushError] = useState("");
  const allyInputRef = useRef<HTMLInputElement>(null);
  const paymentAmountInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = ["ADMIN", "AUDITOR"].includes(
    session.rolNombre.toUpperCase(),
  );
  const navigationItems = useMemo<NavigationItem[]>(
    () => [
      { href: "/dashboard", icon: "home", label: "Inicio" },
      { href: "/ventas", icon: "sales", label: "Ventas" },
      { href: "/inventario", icon: "inventory", label: "Inventario" },
      { href: "/prestamos", icon: "loans", label: "Préstamos" },
      { href: "/caja", icon: "cash", label: "Caja" },
      {
        href: "/dashboard/aprobaciones",
        icon: "approvals",
        label: "Aprobaciones",
      },
      {
        href: isAdmin ? "/dashboard/reportes" : "/dashboard/analitico",
        icon: "reports",
        label: isAdmin ? "Reportes" : "Panel analítico",
      },
      ...(isAdmin
        ? ([
            {
              href: "/dashboard/sedes",
              icon: "settings",
              label: "Configuración",
            },
          ] satisfies NavigationItem[])
        : []),
    ],
    [isAdmin],
  );

  const loadInvoices = useCallback(
    async (showInitialLoader = false, silent = false) => {
      if (showInitialLoader) setLoading(true);
      if (!showInitialLoader && !silent) setRefreshing(true);

      try {
        const response = await fetch("/api/proveedores", { cache: "no-store" });
        const payload = await readJson(response);

        if (!response.ok) {
          throw new Error(
            responseError(payload, "No se pudieron cargar las facturas."),
          );
        }

        const rawInvoices = Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.facturas)
            ? payload.facturas
            : [];
        const nextInvoices = rawInvoices
          .map(normalizeInvoice)
          .filter((invoice): invoice is FacturaProveedor => Boolean(invoice));
        const nextToday =
          typeof payload.hoy === "string" && parseDateKey(payload.hoy)
            ? dateKey(payload.hoy)
            : todayInBogota();
        const rawNotificationDays = Number(payload.diasAnticipacion);
        const nextNotificationDays =
          Number.isInteger(rawNotificationDays) && rawNotificationDays >= 0
            ? rawNotificationDays
            : DEFAULT_NOTIFICATION_DAYS;

        setInvoices(nextInvoices);
        setLoadError("");
        setToday(nextToday);
        setNotificationDays(nextNotificationDays);
        void showDailyLocalReminder(
          nextInvoices,
          nextToday,
          nextNotificationDays,
          session.usuario,
        );
      } catch (error) {
        if (!silent) {
          setLoadError(error instanceof Error ? error.message : "No se pudieron cargar las facturas.");
          setFlash({
            text:
              error instanceof Error
                ? error.message
                : "No se pudieron cargar las facturas.",
            tone: "error",
          });
        }
      } finally {
        if (showInitialLoader) setLoading(false);
        if (!showInitialLoader && !silent) setRefreshing(false);
      }
    },
    [session.usuario],
  );

  useEffect(() => {
    void loadInvoices(true);
  }, [loadInvoices]);

  useLiveRefresh(() => loadInvoices(false, true), {
    intervalMs: 30_000,
  });

  useEffect(() => {
    let cancelled = false;

    const checkPush = async () => {
      if (!browserSupportsPush()) {
        if (!cancelled) setPushStatus("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setPushStatus("denied");
        return;
      }

      try {
        const registration = await registerSupplierServiceWorker();
        const subscription = await registration.pushManager.getSubscription();

        if (!cancelled) setPushStatus(subscription ? "active" : "inactive");
      } catch (error) {
        if (!cancelled) {
          setPushStatus("error");
          setPushError(
            error instanceof Error
              ? error.message
              : "No se pudo preparar el servicio de notificaciones.",
          );
        }
      }
    };

    void checkPush();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleInvoices = useMemo<FacturaVista[]>(
    () =>
      invoices.map((invoice) => invoiceView(invoice, today, notificationDays)),
    [invoices, notificationDays, today],
  );

  const summary = useMemo(() => {
    const pendingInvoices = visibleInvoices.filter(
      (invoice) => invoice.categoria !== "PAGADA",
    );

    return {
      approved: visibleInvoices.filter((invoice) => invoice.categoria === "PAGADA")
        .length,
      dueSoon: visibleInvoices.filter(
        (invoice) => invoice.categoria === "POR_VENCER",
      ).length,
      overdue: visibleInvoices.filter((invoice) => invoice.categoria === "VENCIDA")
        .length,
      pendingTotal: pendingInvoices.reduce(
        (total, invoice) => total + Number(invoice.saldoPendiente || 0),
        0,
      ),
    };
  }, [visibleInvoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const order: Record<CategoriaFactura, number> = {
      VENCIDA: 0,
      POR_VENCER: 1,
      PENDIENTE: 2,
      PAGADA: 3,
    };

    return visibleInvoices
      .filter((invoice) => !allyFilter || invoice.aliado === allyFilter)
      .filter(
        (invoice) =>
          statusFilter === "TODAS" || invoice.categoria === statusFilter,
      )
      .filter((invoice) => {
        if (!normalizedQuery) return true;

        return normalizeText(
          `${invoice.aliado} ${invoice.numeroFactura} ${invoice.estado}`,
        ).includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          order[left.categoria] - order[right.categoria] ||
          dateKey(left.fechaVencimiento).localeCompare(
            dateKey(right.fechaVencimiento),
          ) ||
          left.aliado.localeCompare(right.aliado, "es-CO"),
      );
  }, [allyFilter, query, statusFilter, visibleInvoices]);

  const selectionSummary = useMemo(
    () => resumirFacturasSeleccionadas(filteredInvoices, selectedInvoiceIds),
    [filteredInvoices, selectedInvoiceIds],
  );
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageInvoices = filteredInvoices.slice(start, start + pageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (number) => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1,
  );
  const allVisibleSelected =
    pageInvoices.length > 0 &&
    pageInvoices.every((invoice) => selectedInvoiceIds.has(invoice.id));
  const someVisibleSelected = pageInvoices.some((invoice) => selectedInvoiceIds.has(invoice.id)) && !allVisibleSelected;

  const toggleInvoiceSelection = (invoiceId: number) => {
    setSelectedInvoiceIds((current) => {
      const next = new Set(
        filteredInvoices.filter((invoice) => current.has(invoice.id)).map((invoice) => invoice.id),
      );
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedInvoiceIds((current) => {
      const next = new Set(filteredInvoices.filter((invoice) => current.has(invoice.id)).map((invoice) => invoice.id));
      for (const invoice of pageInvoices) {
        if (allVisibleSelected) next.delete(invoice.id);
        else next.add(invoice.id);
      }
      return next;
    });
  };

  const knownAllies = useMemo(
    () =>
      Array.from(
        new Set(invoices.map((invoice) => invoice.aliado).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right, "es-CO")),
    [invoices],
  );

  const closeNewInvoice = useCallback(() => {
    if (!saving) setNewInvoiceOpen(false);
  }, [saving]);

  const openNewInvoice = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setNewInvoiceOpen(true);
  };

  const submitInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof FormularioFactura, string>> = {};

    if (!form.aliado.trim()) errors.aliado = "Ingresa el nombre del aliado.";
    if (!form.numeroFactura.trim()) {
      errors.numeroFactura = "Ingresa el número de la factura.";
    }
    if (!parseDateKey(form.fechaVencimiento)) {
      errors.fechaVencimiento = "Selecciona una fecha de vencimiento válida.";
    }
    if (Number(form.valorPagar || 0) <= 0) {
      errors.valorPagar = "El valor debe ser mayor a cero.";
    }

    setFieldErrors(errors);
    setFormError("");

    if (Object.keys(errors).length > 0) return;

    try {
      setSaving(true);
      const response = await fetch("/api/proveedores", {
        body: JSON.stringify({
          aliado: form.aliado.trim(),
          fechaVencimiento: form.fechaVencimiento,
          numeroFactura: form.numeroFactura.trim(),
          valorPagar: Number(form.valorPagar),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(
          responseError(payload, "No se pudo registrar la factura."),
        );
        return;
      }

      const created = normalizeInvoice(payload.item ?? payload.factura);

      if (created) {
        setInvoices((current) => [
          created,
          ...current.filter((invoice) => invoice.id !== created.id),
        ]);
      }

      setNewInvoiceOpen(false);
      setForm(EMPTY_FORM);
      setFlash({
        text:
          typeof payload.mensaje === "string"
            ? payload.mensaje
            : "Factura registrada correctamente.",
        tone: "success",
      });
      triggerLiveRefresh("factura-proveedor-creada");
      await loadInvoices(false, true);
    } catch {
      setFormError("Error de conexión al registrar la factura.");
    } finally {
      setSaving(false);
    }
  };

  const openPaymentDialog = (invoice: FacturaVista) => {
    setApprovalInvoice(invoice);
    setPaymentForm({
      ...EMPTY_PAYMENT_FORM,
      valorAbono: moneyValueToPaymentInput(invoice.saldoPendiente),
    });
    setPaymentAmountError("");
    setPaymentAmountFocused(false);
    setPaymentError("");
    setPaymentIdempotencyKey(createPaymentIdempotencyKey());
    setPaymentAttempt(null);
  };

  const closePaymentDialog = () => {
    if (approvingId !== null || paymentAttempt) return;

    setApprovalInvoice(null);
    setPaymentForm(EMPTY_PAYMENT_FORM);
    setPaymentAmountFocused(false);
    setPaymentAmountError("");
    setPaymentError("");
    setPaymentIdempotencyKey("");
    setPaymentAttempt(null);
  };

  const approvePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!approvalInvoice) return;

    const valorAbono = paymentForm.valorAbono;
    const valorAbonoCentavos = paymentAmountToCents(
      paymentForm.valorAbono,
    );
    const saldoActualCentavos = moneyValueToCents(
      approvalInvoice.saldoPendiente,
    );

    setPaymentAmountError("");
    setPaymentError("");

    if (
      !paymentAttempt &&
      (valorAbonoCentavos === null ||
        valorAbonoCentavos <= 0)
    ) {
      setPaymentAmountError("El valor del abono debe ser mayor a cero.");
      return;
    }

    if (
      !paymentAttempt &&
      valorAbonoCentavos !== null &&
      valorAbonoCentavos > saldoActualCentavos
    ) {
      setPaymentAmountError(
        `El abono no puede superar el saldo de ${formatMoney(
          approvalInvoice.saldoPendiente,
        )}.`,
      );
      return;
    }

    const idempotencyKey =
      paymentAttempt?.idempotencyKey ||
      paymentIdempotencyKey ||
      createPaymentIdempotencyKey();
    if (!paymentIdempotencyKey) setPaymentIdempotencyKey(idempotencyKey);
    const referencia = paymentForm.referencia.trim();
    const observacion = paymentForm.observacion.trim();
    const attempt: IntentoPago =
      paymentAttempt ?? {
        idempotencyKey,
        ...(observacion ? { observacion } : {}),
        ...(referencia ? { referencia } : {}),
        valorAbono,
      };

    if (!paymentAttempt) setPaymentAttempt(attempt);

    try {
      setApprovingId(approvalInvoice.id);
      const response = await fetch(
        `/api/proveedores/${approvalInvoice.id}/aprobar-pago`,
        {
          body: JSON.stringify({
            idempotencyKey,
            ...(attempt.observacion
              ? { observacion: attempt.observacion }
              : {}),
            ...(attempt.referencia
              ? { referencia: attempt.referencia }
              : {}),
            valorAbono: attempt.valorAbono,
          }),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          method: "POST",
        },
      );
      const payload = await readJson(response);

      if (!response.ok) {
        const authoritativeInvoice = normalizeInvoice(payload.item);
        const respuestaAmbigua =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;

        if (!respuestaAmbigua) {
          setPaymentAttempt(null);
          setPaymentIdempotencyKey(createPaymentIdempotencyKey());
        }

        if (!respuestaAmbigua && authoritativeInvoice) {
          const authoritativeView = invoiceView(
            authoritativeInvoice,
            today,
            notificationDays,
          );
          const authoritativeBalanceCents = moneyValueToCents(
            authoritativeInvoice.saldoPendiente,
          );

          setInvoices((current) =>
            current.map((invoice) =>
              invoice.id === authoritativeInvoice.id
                ? authoritativeInvoice
                : invoice,
            ),
          );
          setApprovalInvoice(authoritativeView);
          setPaymentForm((current) => ({
            ...current,
            valorAbono: moneyValueToPaymentInput(
              authoritativeInvoice.saldoPendiente,
            ),
          }));

          if (authoritativeBalanceCents <= 0) {
            setPaymentAmountError(
              "Esta factura ya no tiene saldo pendiente.",
            );
          } else if (
            (paymentAmountToCents(attempt.valorAbono) || 0) >
            authoritativeBalanceCents
          ) {
            setPaymentAmountError(
              `El saldo cambió. El valor máximo ahora es ${formatMoney(
                authoritativeInvoice.saldoPendiente,
              )}.`,
            );
          }
        }

        setPaymentError(
          respuestaAmbigua
            ? `${responseError(
                payload,
                "No se pudo confirmar la respuesta del servidor.",
              )} Usa REINTENTAR PAGO para consultar y repetir exactamente el mismo intento, sin riesgo de duplicarlo.`
            : authoritativeInvoice
            ? `${responseError(
                payload,
                "No se pudo aprobar el pago.",
              )} Saldo actual: ${formatMoney(
                authoritativeInvoice.saldoPendiente,
              )}.`
            : responseError(payload, "No se pudo aprobar el pago."),
        );
        return;
      }

      const updated = normalizeInvoice(payload.item ?? payload.factura);
      const receipt =
        normalizePayment(
          payload.recibo ?? payload.abono,
          approvalInvoice.id,
        );

      if (!updated || !receipt) {
        setPaymentError(
          "El servidor respondió, pero no fue posible confirmar todos los datos del pago. Usa REINTENTAR PAGO para verificar el mismo intento sin duplicarlo.",
        );
        return;
      }
      const receiptInvoice = updated;

      setInvoices((current) =>
        current.map((invoice) =>
          invoice.id === updated.id ? updated : invoice,
        ),
      );

      setApprovalInvoice(null);
      setPaymentForm(EMPTY_PAYMENT_FORM);
      setPaymentAmountFocused(false);
      setPaymentAmountError("");
      setPaymentError("");
      setPaymentIdempotencyKey("");
      setPaymentAttempt(null);
      if (receipt) {
        setReceiptPayment({ abono: receipt, factura: receiptInvoice });
      }
      setFlash({
        text:
          typeof payload.mensaje === "string"
            ? payload.mensaje
            : "Pago aprobado correctamente.",
        tone: "success",
      });
      triggerLiveRefresh("pago-proveedor-aprobado");
      await loadInvoices(false, true);
    } catch {
      setPaymentError(
        "No se pudo confirmar la respuesta del servidor. Los datos quedaron bloqueados para reintentar exactamente el mismo pago.",
      );
    } finally {
      setApprovingId(null);
    }
  };

  const openReceipt = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const activatePush = async () => {
    if (!browserSupportsPush()) {
      setPushStatus("unsupported");
      return;
    }

    try {
      setPushBusy("activate");
      setPushError("");
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "inactive");
        setPushError(
          permission === "denied"
            ? "El navegador bloqueó las notificaciones. Habilítalas en la configuración del sitio."
            : "Debes permitir las notificaciones para activar los avisos.",
        );
        return;
      }

      const keyResponse = await fetch("/api/proveedores/push", {
        cache: "no-store",
      });
      const keyPayload = await readJson(keyResponse);

      if (!keyResponse.ok) {
        throw new Error(
          responseError(
            keyPayload,
            "No se pudo obtener la configuración de notificaciones.",
          ),
        );
      }

      const publicKey = String(
        keyPayload.publicKey ?? keyPayload.vapidPublicKey ?? "",
      ).trim();

      if (!publicKey) {
        throw new Error("La clave pública de notificaciones no está configurada.");
      }

      const registration = await registerSupplierServiceWorker();
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(publicKey),
          userVisibleOnly: true,
        });
      }

      const saveResponse = await fetch("/api/proveedores/push", {
        body: JSON.stringify(subscription.toJSON()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const savePayload = await readJson(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(
          responseError(savePayload, "No se pudo guardar la suscripción push."),
        );
      }

      setPushStatus("active");
      setFlash({
        text: "Notificaciones de vencimiento activadas en este navegador.",
        tone: "success",
      });
      void showDailyLocalReminder(
        invoices,
        today,
        notificationDays,
        session.usuario,
      );
    } catch (error) {
      setPushStatus("error");
      setPushError(
        error instanceof Error
          ? error.message
          : "No se pudieron activar las notificaciones.",
      );
    } finally {
      setPushBusy(null);
    }
  };

  const deactivatePush = async () => {
    try {
      setPushBusy("deactivate");
      setPushError("");
      const registration = await registerSupplierServiceWorker();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const response = await fetch("/api/proveedores/push", {
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          headers: { "Content-Type": "application/json" },
          method: "DELETE",
        });
        const payload = await readJson(response);

        if (!response.ok) {
          throw new Error(
            responseError(payload, "No se pudo desactivar la suscripción."),
          );
        }

        await subscription.unsubscribe();
      }

      setPushStatus("inactive");
      setFlash({
        text: "Notificaciones desactivadas en este navegador.",
        tone: "info",
      });
    } catch (error) {
      setPushError(
        error instanceof Error
          ? error.message
          : "No se pudieron desactivar las notificaciones.",
      );
    } finally {
      setPushBusy(null);
    }
  };

  const testNotification = async () => {
    if (!browserSupportsPush() || Notification.permission !== "granted") {
      setPushError("Activa las notificaciones antes de realizar una prueba.");
      return;
    }

    try {
      setPushBusy("test");
      setPushError("");
      const registration = await registerSupplierServiceWorker();

      await registration.showNotification("Notificaciones activas", {
        badge: "/branding/conectamos-logo.png",
        body: "Recibirás aquí los próximos vencimientos de proveedores.",
        data: { url: "/dashboard/proveedores" },
        icon: "/branding/conectamos-logo.png",
        tag: "proveedores-prueba",
      });
    } catch (error) {
      setPushError(
        error instanceof Error
          ? error.message
          : "No se pudo mostrar la notificación de prueba.",
      );
    } finally {
      setPushBusy(null);
    }
  };

  const pushCopy = {
    active: {
      label: "Activas",
      text: "Este navegador recibirá avisos aunque no tengas esta pantalla abierta.",
    },
    checking: {
      label: "Verificando",
      text: "Estamos comprobando la configuración de este navegador.",
    },
    denied: {
      label: "Bloqueadas",
      text: "Habilita las notificaciones en la configuración del navegador para continuar.",
    },
    error: {
      label: "Requiere revisión",
      text: "No fue posible comprobar la suscripción push en este momento.",
    },
    inactive: {
      label: "Inactivas",
      text: "Actívalas para recibir recordatorios de facturas próximas a vencer.",
    },
    unsupported: {
      label: "No disponibles",
      text: "Este navegador o la conexión actual no admite notificaciones push seguras.",
    },
  }[pushStatus];
  const paymentAmountCents = paymentAmountToCents(
    paymentForm.valorAbono,
  );
  const approvalBalanceCents = moneyValueToCents(
    approvalInvoice?.saldoPendiente ?? 0,
  );
  const paymentHasAmount =
    paymentAmountCents !== null && paymentAmountCents > 0;
  const paymentExceedsBalance =
    paymentHasAmount && paymentAmountCents > approvalBalanceCents;
  const paymentWillSettle =
    paymentHasAmount &&
    !paymentExceedsBalance &&
    paymentAmountCents === approvalBalanceCents;
  const paymentBalanceAfter = paymentExceedsBalance
    ? null
    : paymentHasAmount
      ? (approvalBalanceCents - paymentAmountCents) / 100
      : approvalInvoice?.saldoPendiente ?? 0;
  const activeReceiptHistory = receiptHistoryInvoice
    ? visibleInvoices.find(
        (invoice) => invoice.id === receiptHistoryInvoice.id,
      ) ?? receiptHistoryInvoice
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, inicio">
          <Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority />
          <strong>CONECTAMOS</strong>
        </Link>
        <nav className={styles.navigation} aria-label="Navegación principal">
          {navigationItems.map((item) => (
            <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/dashboard" ? styles.navActive : ""}`} aria-current={item.href === "/dashboard" ? "page" : undefined}>
              <DashboardIcon name={item.icon} /><span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <SalesProfile name={session.nombre} role={session.rol} />
      </header>

      <main className={styles.main}>
        <nav aria-label="Ruta de navegación" className={styles.breadcrumb}>
          <Link href="/dashboard">Inicio</Link><DashboardIcon name="chevron" /><span>Proveedores</span>
        </nav>
        <header className={styles.heading}>
          <div>
            <h1>Control de proveedores</h1>
            <p>Facturas, vencimientos y pagos.</p>
            <span className={styles.cutDate}>Corte: {formatDate(today)}</span>
          </div>
          <button type="button" onClick={openNewInvoice} className={`${styles.button} ${styles.primary}`}>
            <DashboardIcon name="document-add" />Nueva factura
          </button>
        </header>

        {flash && (
          <div role={flash.tone === "error" ? "alert" : "status"} className={`${styles.flash} ${flash.tone === "error" ? styles.flashError : flash.tone === "success" ? styles.flashSuccess : ""}`}>
            <DashboardIcon name={flash.tone === "error" ? "warning" : "approvals"} />
            <span>{flash.text}</span>
            <button type="button" onClick={() => setFlash(null)} aria-label="Cerrar mensaje"><DashboardIcon name="close" /></button>
          </div>
        )}

        <section className={styles.summary} aria-label="Resumen de proveedores" aria-busy={loading}>
          <MetricCard icon="cash" iconClassName={styles.neutralIcon} label="Total por pagar" value={loading || (loadError && !invoices.length) ? "—" : formatMoney(summary.pendingTotal)} />
          <MetricCard icon="warning" iconClassName={styles.overdueIcon} label="Facturas vencidas" value={loading || (loadError && !invoices.length) ? "—" : summary.overdue.toLocaleString("es-CO")} />
          <MetricCard icon="calendar" iconClassName={styles.upcomingIcon} label="Próximas a vencer" value={loading || (loadError && !invoices.length) ? "—" : summary.dueSoon.toLocaleString("es-CO")} detail={`Próximos ${notificationDays} días`} />
          <MetricCard icon="approvals" iconClassName={styles.approvedIcon} label="Pagos aprobados" value={loading || (loadError && !invoices.length) ? "—" : summary.approved.toLocaleString("es-CO")} />
        </section>

        <section aria-labelledby="supplier-notifications-title" className={styles.notifications}>
          <span className={styles.bell}><DashboardIcon name="bell" /></span>
          <h2 id="supplier-notifications-title">Notificaciones de vencimiento</h2>
          <span className={`${styles.pushState} ${pushStatus === "active" ? styles.pushActive : pushStatus === "error" || pushStatus === "denied" ? styles.pushError : ""}`}><i />{pushCopy.label}</span>
          <details className={styles.notificationHelp}>
            <summary aria-label="Ayuda de notificaciones">?</summary>
            <div><p>{pushCopy.text}</p><p>Aviso anticipado: {notificationDays} días. Si el envío push no está disponible, el sistema intentará mostrar un recordatorio local una vez al día mientras uses la aplicación.</p></div>
          </details>
          <div className={styles.notificationActions}>
            {pushStatus === "active" ? (
              <button type="button" onClick={() => void deactivatePush()} disabled={Boolean(pushBusy)} className={styles.button}>
                {pushBusy === "deactivate" ? "Desactivando..." : "Desactivar"}
              </button>
            ) : (
              <button type="button" onClick={() => void activatePush()} disabled={Boolean(pushBusy) || pushStatus === "checking" || pushStatus === "denied" || pushStatus === "unsupported"} className={styles.button}>
                {pushBusy === "activate" ? "Activando..." : "Activar notificaciones"}
              </button>
            )}
            <button type="button" onClick={() => void testNotification()} disabled={Boolean(pushBusy) || pushStatus !== "active" || typeof Notification === "undefined" || Notification.permission !== "granted"} className={styles.button}>
              {pushBusy === "test" ? "Probando..." : "Probar notificación"}
            </button>
          </div>
          {pushError && <p role="alert" className={styles.notificationError}>{pushError}</p>}
        </section>

        <section className={styles.panel} aria-labelledby="supplier-invoices-title" aria-busy={loading || refreshing}>
          <div className={styles.listHeading}>
            <h2 id="supplier-invoices-title">Facturas de proveedores</h2>
            <span aria-live="polite" aria-atomic="true">{loading ? "Cargando..." : `${filteredInvoices.length.toLocaleString("es-CO")} factura${filteredInvoices.length === 1 ? "" : "s"}`}</span>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <span className={styles.srOnly}>Buscar</span><DashboardIcon name="search" />
              <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedInvoiceIds(new Set()); setPage(1); }} placeholder="Aliado o número de factura" />
            </label>
            <label className={styles.filterSelect}>
              <span className={styles.srOnly}>Aliado</span>
              <select value={allyFilter} onChange={(event) => { setAllyFilter(event.target.value); setSelectedInvoiceIds(new Set()); setPage(1); }}>
                <option value="">Todos los aliados</option>
                {knownAllies.map((ally) => (<option key={ally} value={ally}>{ally}</option>))}
              </select><DashboardIcon name="chevron" />
            </label>
            <label className={styles.filterSelect}>
              <span className={styles.srOnly}>Estado</span>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as FiltroEstado); setSelectedInvoiceIds(new Set()); setPage(1); }}>
                <option value="TODAS">Todos los estados</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="POR_VENCER">Por vencer</option>
                <option value="VENCIDA">Vencidas</option>
                <option value="PAGADA">Pago aprobado</option>
              </select><DashboardIcon name="chevron" />
            </label>
            <button type="button" onClick={() => void loadInvoices(false)} disabled={refreshing || loading} className={styles.button}>
              <DashboardIcon name="refresh" />{refreshing ? "Actualizando..." : "Actualizar"}
            </button>
          </div>

          {loading ? (
            <div role="status" className={styles.emptyState}><DashboardIcon name="refresh" /><h3>Cargando facturas...</h3></div>
          ) : loadError && !invoices.length ? (
            <div className={styles.emptyState}><DashboardIcon name="warning" /><h3>No se pudieron cargar las facturas</h3><button type="button" onClick={() => void loadInvoices(false)} disabled={refreshing} className={styles.button}>Reintentar</button></div>
          ) : filteredInvoices.length === 0 ? (
            <div className={styles.emptyState}>
              <DashboardIcon name={visibleInvoices.length === 0 ? "document" : "search"} />
              <h3>{visibleInvoices.length === 0 ? "Aún no hay facturas registradas" : "No encontramos facturas"}</h3>
              <p>{visibleInvoices.length === 0 ? "Registra la primera factura para comenzar el seguimiento." : "Prueba otra búsqueda o selecciona todos los aliados y estados."}</p>
              {visibleInvoices.length === 0 ? (
                <button type="button" onClick={openNewInvoice} className={`${styles.button} ${styles.primary}`}>Nueva factura</button>
              ) : (
                <button type="button" onClick={() => { setQuery(""); setAllyFilter(""); setStatusFilter("TODAS"); setSelectedInvoiceIds(new Set()); setPage(1); }} className={styles.button}>Limpiar filtros</button>
              )}
            </div>
          ) : (
            <div className={styles.tableScroll} role="region" aria-label="Facturas de proveedores, tabla desplazable" tabIndex={0}>
              <table className={styles.table}>
                <colgroup><col className={styles.checkColumn} /><col className={styles.allyColumn} /><col className={styles.dueColumn} /><col className={styles.moneyColumn} /><col className={styles.paidColumn} /><col className={styles.moneyColumn} /><col className={styles.stateColumn} /><col className={styles.actionsColumn} /></colgroup>
                <thead><tr>
                  <th scope="col"><InvoiceSelectionCheckbox checked={allVisibleSelected} mixed={someVisibleSelected} label="Seleccionar todas las facturas visibles" onChange={toggleVisibleSelection} /></th>
                  <th scope="col">Aliado / factura</th><th scope="col">Vencimiento</th><th scope="col" className={styles.amount}>Total factura</th><th scope="col" className={styles.amount}>Abonado</th><th scope="col" className={styles.amount}>Saldo pendiente</th><th scope="col">Estado</th><th scope="col" className={styles.actionHeading}>Acción</th>
                </tr></thead>
                <tbody>
                  {pageInvoices.map((invoice) => (
                    <tr key={invoice.id} className={selectedInvoiceIds.has(invoice.id) ? styles.selectedRow : undefined}>
                      <td><InvoiceSelectionCheckbox checked={selectedInvoiceIds.has(invoice.id)} label={`Seleccionar factura ${invoice.numeroFactura} de ${invoice.aliado}`} onChange={() => toggleInvoiceSelection(invoice.id)} /></td>
                      <td><strong>{invoice.aliado}</strong><p>Factura {invoice.numeroFactura}</p></td>
                      <td><div className={styles.dueDate}><span>{formatDate(invoice.fechaVencimiento)}</span>
                        {invoice.categoria !== "PAGADA" && <span className={`${styles.dueTag} ${invoice.diasCalculados < 0 ? styles.overdueTag : invoice.diasCalculados <= notificationDays ? styles.upcomingTag : ""}`}>
                          {invoice.diasCalculados < 0 ? `${Math.abs(invoice.diasCalculados)} día${Math.abs(invoice.diasCalculados) === 1 ? "" : "s"} de mora` : invoice.diasCalculados === 0 ? "Hoy" : invoice.diasCalculados === 1 ? "Mañana" : `En ${invoice.diasCalculados} días`}
                        </span>}
                      </div></td>
                      <td className={styles.amount}>{formatMoney(invoice.valorFactura)}</td>
                      <td className={`${styles.amount} ${styles.paidAmount}`}>{formatMoney(invoice.valorAbonado)}</td>
                      <td className={`${styles.amount} ${styles.balance} ${invoice.categoria === "VENCIDA" ? styles.overdueAmount : ""}`}>{formatMoney(invoice.saldoPendiente)}</td>
                      <td><StatusBadge invoice={invoice} />
                        {invoice.categoria === "PAGADA" && <p className={styles.approvalInfo}>{formatDateTime(invoice.pagoAprobadoEn) || "Pago registrado"}{invoice.pagoAprobadoPor ? ` · ${invoice.pagoAprobadoPor}` : ""}</p>}
                      </td>
                      <td><div className={styles.invoiceActions}>
                        {invoice.saldoPendiente > 0 && <button type="button" onClick={() => openPaymentDialog(invoice)} disabled={approvingId !== null} className={styles.payButton}>Abonar / pagar</button>}
                        {invoice.cantidadAbonos > 0 && <button type="button" onClick={() => setReceiptHistoryInvoice(invoice)} className={styles.receiptsButton}><DashboardIcon name="document" />Recibos ({invoice.cantidadAbonos})</button>}
                        {invoice.categoria === "PAGADA" && invoice.cantidadAbonos === 0 && <span className={styles.paidLabel}>Aprobado</span>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section aria-labelledby="supplier-selection-title" className={styles.selectionBar}>
            <h3 id="supplier-selection-title" className={styles.srOnly}>Resumen de facturas seleccionadas</h3>
            <div className={styles.selectionCount}>
              <InvoiceSelectionCheckbox checked={allVisibleSelected} mixed={someVisibleSelected} disabled={loading || pageInvoices.length === 0} label="Seleccionar todas las visibles" onChange={toggleVisibleSelection} />
              <span aria-live="polite" aria-atomic="true"><strong>{selectionSummary.cantidad}</strong> seleccionada{selectionSummary.cantidad === 1 ? "" : "s"}</span>
            </div>
            <dl className={styles.selectionTotals} aria-live="polite" aria-atomic="true">
              <div><dt>Total facturas</dt><dd>{formatMoney(selectionSummary.totalFacturas)}</dd></div>
              <div><dt>Total abonado</dt><dd>{formatMoney(selectionSummary.totalAbonado)}</dd></div>
              <div><dt>Saldo pendiente</dt><dd>{formatMoney(selectionSummary.totalPendiente)}</dd></div>
            </dl>
            <button type="button" onClick={() => setSelectedInvoiceIds(new Set())} disabled={selectionSummary.cantidad === 0} className={styles.clearSelection}>Limpiar selección</button>
            <details className={styles.selectionHelp}><summary aria-label="Ayuda de selección">?</summary><p>La selección solo suma importes. Cada pago se registra por factura. Seleccionar todas las visibles marca únicamente la página actual; puedes conservar la selección al pasar de página.</p></details>
          </section>

          <footer className={styles.footer}>
            <p>{filteredInvoices.length ? `Mostrando ${start + 1} – ${Math.min(start + pageSize, filteredInvoices.length)} de ${filteredInvoices.length.toLocaleString("es-CO")}` : "0 resultados"}</p>
            <label className={styles.rowsPerPage}>Filas por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
            <nav className={styles.pagination} aria-label="Páginas de facturas">
              <button type="button" aria-label="Página anterior" className={styles.previous} disabled={loading || currentPage === 1} onClick={() => setPage(currentPage - 1)}><DashboardIcon name="chevron" /></button>
              {pageNumbers.map((number, index) => <span key={number} className={styles.pageSlot}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<button type="button" className={number === currentPage ? styles.currentPage : undefined} aria-current={number === currentPage ? "page" : undefined} aria-label={`Página ${number}`} disabled={loading} onClick={() => setPage(number)}>{number}</button></span>)}
              <button type="button" aria-label="Página siguiente" disabled={loading || currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><DashboardIcon name="chevron" /></button>
            </nav>
          </footer>
        </section>
      </main>

      {newInvoiceOpen && (
        <AccessibleDialog
          title="Registrar factura"
          description="Completa los datos del aliado y del compromiso de pago. Todos los campos son obligatorios."
          titleId="new-supplier-invoice-title"
          initialFocusRef={allyInputRef}
          onClose={closeNewInvoice}
        >
          <form onSubmit={submitInvoice} noValidate>
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-6">
              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Aliado
                <input
                  ref={allyInputRef}
                  value={form.aliado}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, aliado: event.target.value }));
                    setFieldErrors((current) => ({ ...current, aliado: undefined }));
                  }}
                  list="supplier-allies"
                  autoComplete="organization"
                  aria-invalid={Boolean(fieldErrors.aliado)}
                  aria-describedby={fieldErrors.aliado ? "supplier-ally-error" : undefined}
                  placeholder="Nombre del proveedor o aliado"
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
                <datalist id="supplier-allies">
                  {knownAllies.map((ally) => (
                    <option key={ally} value={ally} />
                  ))}
                </datalist>
                {fieldErrors.aliado && (
                  <span id="supplier-ally-error" className="text-xs font-semibold text-red-600">
                    {fieldErrors.aliado}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Número de factura
                <input
                  value={form.numeroFactura}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      numeroFactura: event.target.value,
                    }));
                    setFieldErrors((current) => ({
                      ...current,
                      numeroFactura: undefined,
                    }));
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.numeroFactura)}
                  aria-describedby={
                    fieldErrors.numeroFactura ? "supplier-invoice-number-error" : undefined
                  }
                  placeholder="Ej. FC-2048"
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
                {fieldErrors.numeroFactura && (
                  <span
                    id="supplier-invoice-number-error"
                    className="text-xs font-semibold text-red-600"
                  >
                    {fieldErrors.numeroFactura}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Fecha de vencimiento
                <input
                  type="date"
                  value={form.fechaVencimiento}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      fechaVencimiento: event.target.value,
                    }));
                    setFieldErrors((current) => ({
                      ...current,
                      fechaVencimiento: undefined,
                    }));
                  }}
                  aria-invalid={Boolean(fieldErrors.fechaVencimiento)}
                  aria-describedby={
                    fieldErrors.fechaVencimiento ? "supplier-due-date-error" : undefined
                  }
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
                {fieldErrors.fechaVencimiento && (
                  <span
                    id="supplier-due-date-error"
                    className="text-xs font-semibold text-red-600"
                  >
                    {fieldErrors.fechaVencimiento}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Valor a pagar
                <span className="relative block">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                    $
                  </span>
                  <input
                    value={formatInputValue(form.valorPagar)}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        valorPagar: cleanNumericValue(event.target.value),
                      }));
                      setFieldErrors((current) => ({
                        ...current,
                        valorPagar: undefined,
                      }));
                    }}
                    inputMode="numeric"
                    aria-invalid={Boolean(fieldErrors.valorPagar)}
                    aria-describedby={
                      fieldErrors.valorPagar ? "supplier-amount-error" : undefined
                    }
                    placeholder="0"
                    className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  />
                </span>
                {fieldErrors.valorPagar && (
                  <span
                    id="supplier-amount-error"
                    className="text-xs font-semibold text-red-600"
                  >
                    {fieldErrors.valorPagar}
                  </span>
                )}
              </label>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:col-span-2"
                >
                  {formError}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <p className="text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">
                  Resumen
                </p>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold text-slate-900">
                    {form.aliado.trim() || "Aliado por completar"}
                    {form.numeroFactura.trim() ? ` · ${form.numeroFactura.trim()}` : ""}
                  </p>
                  <p className="text-xl font-black text-[#e30613]">
                    {formatMoney(Number(form.valorPagar || 0))}
                  </p>
                </div>
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closeNewInvoice}
                disabled={saving}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DashboardIcon name="document" className="h-4.5 w-4.5" />
                {saving ? "Guardando..." : "Registrar factura"}
              </button>
            </footer>
          </form>
        </AccessibleDialog>
      )}

      {approvalInvoice && (
        <AccessibleDialog
          title="Registrar abono"
          description="Aplica el pago a esta factura. Si cubre todo el saldo, quedará marcada como pagada."
          titleId="approve-supplier-payment-title"
          initialFocusRef={paymentAmountInputRef}
          maxWidthClass="max-w-2xl"
          onClose={closePaymentDialog}
        >
          <form onSubmit={approvePayment} noValidate>
            <div className="grid gap-5 px-5 py-6 sm:px-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  Aliado / factura
                </p>
                <p className="mt-1 text-base font-black text-slate-950">
                  {approvalInvoice.aliado} · {approvalInvoice.numeroFactura}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Vence el {formatDate(approvalInvoice.fechaVencimiento)}
                </p>
              </div>

              <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="min-w-0 border-r border-slate-200 p-3 sm:p-4">
                  <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 sm:text-[10px]">
                    Total
                  </dt>
                  <dd className="mt-1 break-words text-sm font-black text-slate-950">
                    {formatMoney(approvalInvoice.valorFactura)}
                  </dd>
                </div>
                <div className="min-w-0 border-r border-slate-200 p-3 sm:p-4">
                  <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 sm:text-[10px]">
                    Abonado
                  </dt>
                  <dd className="mt-1 break-words text-sm font-black text-emerald-700">
                    {formatMoney(approvalInvoice.valorAbonado)}
                  </dd>
                </div>
                <div className="min-w-0 p-3 sm:p-4">
                  <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 sm:text-[10px]">
                    Saldo
                  </dt>
                  <dd className="mt-1 break-words text-sm font-black text-slate-950">
                    {formatMoney(approvalInvoice.saldoPendiente)}
                  </dd>
                </div>
              </dl>

              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Valor del abono
                <span className="relative block">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                    $
                  </span>
                  <input
                    ref={paymentAmountInputRef}
                    value={
                      paymentAmountFocused
                        ? paymentForm.valorAbono.replace(".", ",")
                        : formatPaymentAmountInput(paymentForm.valorAbono)
                    }
                    onFocus={() => setPaymentAmountFocused(true)}
                    onBlur={() => setPaymentAmountFocused(false)}
                    onChange={(event) => {
                      const inputType =
                        "inputType" in event.nativeEvent
                          ? String(
                              (
                                event.nativeEvent as {
                                  inputType?: unknown;
                                }
                              ).inputType ?? "",
                            )
                          : "";
                      setPaymentForm((current) => ({
                        ...current,
                        valorAbono: normalizePaymentAmountInput(
                          event.target.value,
                          current.valorAbono,
                          inputType === "insertFromPaste" ||
                            inputType === "insertFromDrop",
                        ),
                      }));
                      setPaymentIdempotencyKey(
                        createPaymentIdempotencyKey(),
                      );
                      setPaymentAmountError("");
                      setPaymentError("");
                    }}
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={approvingId !== null || Boolean(paymentAttempt)}
                    aria-invalid={Boolean(paymentAmountError)}
                    aria-describedby={
                      paymentAmountError
                        ? "supplier-payment-amount-error"
                        : "supplier-payment-balance-preview"
                    }
                    className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-base font-black text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </span>
                {paymentAmountError && (
                  <span
                    id="supplier-payment-amount-error"
                    className="text-xs font-semibold text-red-600"
                  >
                    {paymentAmountError}
                  </span>
                )}
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                  Referencia <span className="font-normal text-slate-400">(opcional)</span>
                  <input
                    value={paymentForm.referencia}
                    onChange={(event) => {
                      setPaymentForm((current) => ({
                        ...current,
                        referencia: event.target.value,
                      }));
                      setPaymentIdempotencyKey(
                        createPaymentIdempotencyKey(),
                      );
                      setPaymentError("");
                    }}
                    maxLength={120}
                    autoComplete="off"
                    disabled={approvingId !== null || Boolean(paymentAttempt)}
                    placeholder="Ej. transferencia 8452"
                    className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                  Observación <span className="font-normal text-slate-400">(opcional)</span>
                  <textarea
                    value={paymentForm.observacion}
                    onChange={(event) => {
                      setPaymentForm((current) => ({
                        ...current,
                        observacion: event.target.value,
                      }));
                      setPaymentIdempotencyKey(
                        createPaymentIdempotencyKey(),
                      );
                      setPaymentError("");
                    }}
                    maxLength={500}
                    rows={2}
                    disabled={approvingId !== null || Boolean(paymentAttempt)}
                    placeholder="Detalle útil para la trazabilidad"
                    className="min-h-[52px] resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
              </div>

              <div
                id="supplier-payment-balance-preview"
                aria-live="polite"
                className={[
                  "flex flex-col gap-1 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
                  paymentExceedsBalance
                    ? "border-red-200 bg-red-50"
                    : paymentWillSettle
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50",
                ].join(" ")}
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                    Saldo después de este pago
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {paymentExceedsBalance
                      ? `El valor supera el saldo actual de ${formatMoney(
                          approvalInvoice.saldoPendiente,
                        )}.`
                      : paymentWillSettle
                      ? "La factura quedará pagada."
                      : paymentHasAmount
                        ? "La factura conservará el saldo pendiente."
                        : "Ingresa el valor que deseas aplicar."}
                  </p>
                </div>
                <p
                  className={`break-words text-xl font-black ${
                    paymentExceedsBalance
                      ? "text-red-700"
                      : paymentWillSettle
                        ? "text-emerald-700"
                        : "text-slate-950"
                  }`}
                >
                  {paymentBalanceAfter === null
                    ? "No aplicable"
                    : formatMoney(paymentBalanceAfter)}
                </p>
              </div>

              {paymentError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                >
                  {paymentError}
                </div>
              )}

              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
                Verifica el valor y la factura antes de aprobar. El sistema
                generará un recibo para este abono.
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closePaymentDialog}
                disabled={approvingId !== null || Boolean(paymentAttempt)}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  approvingId !== null ||
                  (!paymentAttempt && approvalInvoice.saldoPendiente <= 0)
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DashboardIcon name="approvals" className="h-4.5 w-4.5" />
                {approvingId !== null
                  ? "Aprobando..."
                  : paymentAttempt
                    ? "REINTENTAR PAGO"
                    : "APROBAR PAGO"}
              </button>
            </footer>
          </form>
        </AccessibleDialog>
      )}

      {receiptPayment && (
        <AccessibleDialog
          title="Recibo de pago"
          description="El abono fue aprobado y quedó guardado en el historial de la factura."
          titleId="supplier-payment-receipt-title"
          maxWidthClass="max-w-xl"
          onClose={() => setReceiptPayment(null)}
        >
          <div className="px-5 py-6 sm:px-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    Recibo
                  </p>
                  <p className="mt-1 text-lg font-black text-slate-950">
                    {receiptPayment.abono.numeroRecibo}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">
                  Pago aprobado
                </span>
              </div>
              <p className="mt-4 text-3xl font-black tracking-tight text-emerald-700">
                {formatMoney(receiptPayment.abono.valor)}
              </p>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Aliado / factura
                </dt>
                <dd className="mt-1 font-black text-slate-950">
                  {receiptPayment.factura.aliado} ·{" "}
                  {receiptPayment.factura.numeroFactura}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Saldo anterior
                </dt>
                <dd className="mt-1 font-black text-slate-950">
                  {formatMoney(receiptPayment.abono.saldoAnterior)}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Nuevo saldo
                </dt>
                <dd className="mt-1 font-black text-slate-950">
                  {formatMoney(receiptPayment.abono.saldoPosterior)}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Aprobado
                </dt>
                <dd className="mt-1 text-sm font-bold text-slate-950">
                  {formatDateTime(receiptPayment.abono.aprobadoEn) ||
                    "Fecha no disponible"}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Aprobado por
                </dt>
                <dd className="mt-1 text-sm font-bold text-slate-950">
                  {receiptPayment.abono.aprobadoPor || "Usuario autorizado"}
                </dd>
              </div>
              {receiptPayment.abono.referencia && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                  <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Referencia
                  </dt>
                  <dd className="mt-1 break-words text-sm font-bold text-slate-950">
                    {receiptPayment.abono.referencia}
                  </dd>
                </div>
              )}
              {receiptPayment.abono.observacion && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                  <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Observación
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                    {receiptPayment.abono.observacion}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => setReceiptPayment(null)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => openReceipt(receiptPayment.abono.reciboUrl)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#11161d] px-6 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2"
            >
              <DashboardIcon name="document" className="h-4.5 w-4.5" />
              ABRIR / IMPRIMIR RECIBO
            </button>
          </footer>
        </AccessibleDialog>
      )}

      {activeReceiptHistory && (
        <AccessibleDialog
          title="Recibos de la factura"
          description={`Consulta y vuelve a imprimir los pagos aprobados de la factura ${activeReceiptHistory.numeroFactura}.`}
          titleId="supplier-receipt-history-title"
          maxWidthClass="max-w-2xl"
          onClose={() => setReceiptHistoryInvoice(null)}
        >
          <div className="px-5 py-6 sm:px-6">
            <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-slate-950">
                  {activeReceiptHistory.aliado}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Factura {activeReceiptHistory.numeroFactura}
                </p>
              </div>
              <div className="mt-2 sm:mt-0 sm:text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Saldo actual
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {formatMoney(activeReceiptHistory.saldoPendiente)}
                </p>
              </div>
            </div>

            {activeReceiptHistory.abonos.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-5 py-8 text-center">
                <DashboardIcon
                  name="document"
                  className="mx-auto h-7 w-7 text-slate-400"
                />
                <p className="mt-2 text-sm font-bold text-slate-700">
                  No se pudieron cargar los recibos.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Actualiza la página e inténtalo nuevamente.
                </p>
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {activeReceiptHistory.abonos.map((abono) => (
                  <li
                    key={abono.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                          {abono.numeroRecibo}
                        </p>
                        <p className="mt-1 text-xl font-black text-emerald-700">
                          {formatMoney(abono.valor)}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          {formatDateTime(abono.aprobadoEn) ||
                            "Fecha no disponible"}
                          {abono.aprobadoPor ? ` · ${abono.aprobadoPor}` : ""}
                          {" · "}Saldo: {formatMoney(abono.saldoPosterior)}
                        </p>
                        {abono.referencia && (
                          <p className="mt-1 break-words text-xs text-slate-500">
                            Referencia: {abono.referencia}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openReceipt(abono.reciboUrl)}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.05em] text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                      >
                        <DashboardIcon name="document" className="h-4 w-4" />
                        ABRIR / IMPRIMIR RECIBO
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <footer className="flex justify-end border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setReceiptHistoryInvoice(null)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50"
            >
              Cerrar
            </button>
          </footer>
        </AccessibleDialog>
      )}
    </div>
  );
}
