"use client";

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
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import {
  triggerLiveRefresh,
  useLiveRefresh,
} from "@/lib/use-live-refresh";

type WorkspaceSession = {
  nombre: string;
  rol: string;
  rolNombre: string;
  sedeNombre: string;
  usuario: string;
};

type FacturaProveedor = {
  aliado: string;
  diasParaVencer: number | null;
  estado: string;
  estadoVencimiento: string | null;
  fechaVencimiento: string;
  id: number;
  numeroFactura: string;
  pagoAprobadoEn: string | null;
  pagoAprobadoPor: string | null;
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

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  currency: "COP",
  maximumFractionDigits: 0,
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
    day: "numeric",
    month: "short",
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

function normalizeInvoice(value: unknown): FacturaProveedor | null {
  if (!isRecord(value)) return null;

  const id = Number(value.id || 0);

  if (!Number.isInteger(id) || id <= 0) return null;

  const rawDays = Number(
    value.diasParaVencer ?? value.diasParaVencimiento,
  );
  const rawDueStatus = value.estadoVencimiento ?? value.situacion;

  return {
    aliado: String(value.aliado || "Sin aliado").trim(),
    diasParaVencer: Number.isFinite(rawDays) ? rawDays : null,
    estado: String(value.estado || "PENDIENTE").trim().toUpperCase(),
    estadoVencimiento: rawDueStatus
      ? String(rawDueStatus).trim().toUpperCase()
      : null,
    fechaVencimiento: String(value.fechaVencimiento || "").trim(),
    id,
    numeroFactura: String(value.numeroFactura ?? value.factura ?? "Sin número").trim(),
    pagoAprobadoEn: value.pagoAprobadoEn
      ? String(value.pagoAprobadoEn)
      : null,
    pagoAprobadoPor: actorName(
      value.pagoAprobadoPor ?? value.pagoAprobadoPorNombre,
    ),
    valorPagar: Number(value.valorPagar ?? value.valor ?? 0),
  };
}

function isPaid(invoice: FacturaProveedor) {
  return (
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
  detail: string;
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <article className="min-h-[142px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
        >
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p
            className={`mt-1.5 break-words text-[27px] font-black leading-tight tracking-tight ${valueClassName}`}
          >
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ invoice }: { invoice: FacturaVista }) {
  const styles: Record<CategoriaFactura, string> = {
    PAGADA: "border-emerald-200 bg-emerald-50 text-emerald-700",
    PENDIENTE: "border-slate-200 bg-slate-50 text-slate-700",
    POR_VENCER: "border-amber-200 bg-amber-50 text-amber-700",
    VENCIDA: "border-red-200 bg-red-50 text-red-700",
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
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${styles[invoice.categoria]}`}
    >
      {label}
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
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FiltroEstado>("TODAS");
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
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState<
    "activate" | "deactivate" | "test" | null
  >(null);
  const [pushError, setPushError] = useState("");
  const allyInputRef = useRef<HTMLInputElement>(null);
  const approvalButtonRef = useRef<HTMLButtonElement>(null);

  const isAdmin = ["ADMIN", "AUDITOR"].includes(
    session.rolNombre.toUpperCase(),
  );
  const initials = session.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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
        (total, invoice) => total + Number(invoice.valorPagar || 0),
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
  }, [query, statusFilter, visibleInvoices]);

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

  const approvePayment = async () => {
    if (!approvalInvoice) return;

    try {
      setApprovingId(approvalInvoice.id);
      const response = await fetch(
        `/api/proveedores/${approvalInvoice.id}/aprobar-pago`,
        { method: "POST" },
      );
      const payload = await readJson(response);

      if (!response.ok) {
        setFlash({
          text: responseError(payload, "No se pudo aprobar el pago."),
          tone: "error",
        });
        return;
      }

      const updated = normalizeInvoice(payload.item ?? payload.factura);

      if (updated) {
        setInvoices((current) =>
          current.map((invoice) =>
            invoice.id === updated.id ? updated : invoice,
          ),
        );
      }

      setApprovalInvoice(null);
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
      setFlash({
        text: "Error de conexión al aprobar el pago.",
        tone: "error",
      });
    } finally {
      setApprovingId(null);
    }
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

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard"
        coverageLabel={session.sedeNombre}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav
                aria-label="Ruta de navegación"
                className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"
              >
                <Link
                  href="/dashboard"
                  className="transition hover:text-[#e30613]"
                >
                  Inicio
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Proveedores</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight text-slate-950 sm:text-[34px]">
                Control de proveedores
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Registra facturas de aliados, controla sus vencimientos y deja
                trazabilidad de cada pago aprobado.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Corte: {formatDate(today)}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Aviso anticipado: {notificationDays} días
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={openNewInvoice}
                className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e30613] focus-visible:ring-offset-2"
              >
                <DashboardIcon name="document" className="h-5 w-5" />
                Nueva factura
              </button>
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {initials || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">
                    {session.nombre}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {session.rol}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          {flash && (
            <div
              role={flash.tone === "error" ? "alert" : "status"}
              className={[
                "mt-5 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm",
                flash.tone === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : flash.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700",
              ].join(" ")}
            >
              <span className="flex items-start gap-2">
                <DashboardIcon
                  name={flash.tone === "error" ? "warning" : "approvals"}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                {flash.text}
              </span>
              <button
                type="button"
                onClick={() => setFlash(null)}
                aria-label="Cerrar mensaje"
                className="rounded-lg p-1 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                <DashboardIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          )}

          <section
            className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"
            aria-label="Resumen de proveedores"
          >
            <MetricCard
              icon="cash"
              iconClassName="bg-slate-100 text-slate-700"
              label="Total por pagar"
              value={loading ? "—" : formatMoney(summary.pendingTotal)}
              detail="Suma de facturas que aún no tienen pago aprobado."
            />
            <MetricCard
              icon="warning"
              iconClassName="bg-red-50 text-[#e30613]"
              label="Facturas vencidas"
              value={loading ? "—" : String(summary.overdue)}
              detail="Requieren atención inmediata."
              valueClassName={summary.overdue > 0 ? "text-[#e30613]" : undefined}
            />
            <MetricCard
              icon="calendar"
              iconClassName="bg-amber-50 text-amber-600"
              label="Próximas a vencer"
              value={loading ? "—" : String(summary.dueSoon)}
              detail={`Vencen en los próximos ${notificationDays} días.`}
              valueClassName={summary.dueSoon > 0 ? "text-amber-600" : undefined}
            />
            <MetricCard
              icon="approvals"
              iconClassName="bg-emerald-50 text-emerald-600"
              label="Pagos aprobados"
              value={loading ? "—" : String(summary.approved)}
              detail="Facturas conservadas como historial."
              valueClassName="text-emerald-600"
            />
          </section>

          <section
            aria-labelledby="supplier-notifications-title"
            className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6"
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <DashboardIcon name="bell" className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="supplier-notifications-title"
                      className="text-xl font-black tracking-tight"
                    >
                      Notificaciones de vencimiento
                    </h2>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]",
                        pushStatus === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : pushStatus === "denied" || pushStatus === "error"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-200 bg-slate-50 text-slate-600",
                      ].join(" ")}
                    >
                      {pushCopy.label}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    {pushCopy.text} Si el envío push no está disponible, el
                    sistema intentará mostrar un recordatorio local una vez al día
                    mientras uses la aplicación.
                  </p>
                  {pushError && (
                    <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
                      {pushError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {pushStatus === "active" ? (
                  <button
                    type="button"
                    onClick={() => void deactivatePush()}
                    disabled={Boolean(pushBusy)}
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pushBusy === "deactivate" ? "Desactivando..." : "Desactivar"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void activatePush()}
                    disabled={
                      Boolean(pushBusy) ||
                      pushStatus === "checking" ||
                      pushStatus === "denied" ||
                      pushStatus === "unsupported"
                    }
                    className="min-h-11 rounded-xl bg-[#11161d] px-4 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#242c35] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pushBusy === "activate"
                      ? "Activando..."
                      : "Activar notificaciones"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void testNotification()}
                  disabled={
                    Boolean(pushBusy) ||
                    pushStatus !== "active" ||
                    typeof Notification === "undefined" ||
                    Notification.permission !== "granted"
                  }
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pushBusy === "test" ? "Probando..." : "Probar notificación"}
                </button>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Cuentas por pagar
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">
                  Facturas de proveedores
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {filteredInvoices.length} de {visibleInvoices.length} factura
                  {visibleInvoices.length === 1 ? "" : "s"} visible
                  {visibleInvoices.length === 1 ? "" : "s"}.
                </p>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_210px_auto] xl:max-w-3xl">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                  Buscar
                  <span className="relative block">
                    <DashboardIcon
                      name="search"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Aliado o número de factura"
                      className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    />
                  </span>
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                  Estado
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as FiltroEstado)
                    }
                    className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  >
                    <option value="TODAS">Todas</option>
                    <option value="PENDIENTE">Pendientes</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="VENCIDA">Vencidas</option>
                    <option value="PAGADA">Pago aprobado</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void loadInvoices(false)}
                  disabled={refreshing || loading}
                  className="min-h-[48px] self-end rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>

            <div className="mt-5" aria-busy={loading}>
              {loading ? (
                <div className="space-y-3" aria-label="Cargando facturas">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50"
                    />
                  ))}
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
                  <DashboardIcon
                    name={visibleInvoices.length === 0 ? "document" : "search"}
                    className="mx-auto h-8 w-8 text-slate-400"
                  />
                  <p className="mt-3 text-base font-black text-slate-800">
                    {visibleInvoices.length === 0
                      ? "Aún no hay facturas registradas"
                      : "No encontramos facturas"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {visibleInvoices.length === 0
                      ? "Registra la primera factura para comenzar el seguimiento."
                      : "Prueba otra búsqueda o selecciona todos los estados."}
                  </p>
                  {visibleInvoices.length === 0 ? (
                    <button
                      type="button"
                      onClick={openNewInvoice}
                      className="mt-4 min-h-11 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b]"
                    >
                      Nueva factura
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setStatusFilter("TODAS");
                      }}
                      className="mt-4 min-h-11 rounded-xl bg-[#11161d] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#242c35]"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
                    <table className="w-full min-w-[930px] text-sm">
                      <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <th className="px-4 py-3.5">Aliado / factura</th>
                          <th className="px-4 py-3.5">Vencimiento</th>
                          <th className="px-4 py-3.5 text-right">Valor a pagar</th>
                          <th className="px-4 py-3.5">Estado</th>
                          <th className="px-4 py-3.5 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredInvoices.map((invoice) => (
                          <tr
                            key={invoice.id}
                            className={
                              invoice.categoria === "VENCIDA"
                                ? "bg-red-50/35"
                                : "hover:bg-slate-50/70"
                            }
                          >
                            <td className="px-4 py-4">
                              <p className="font-black text-slate-950">
                                {invoice.aliado}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                Factura {invoice.numeroFactura}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-bold text-slate-800">
                                {formatDate(invoice.fechaVencimiento)}
                              </p>
                              {invoice.categoria !== "PAGADA" && (
                                <p
                                  className={`mt-1 text-xs font-semibold ${
                                    invoice.diasCalculados < 0
                                      ? "text-red-600"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {invoice.diasCalculados < 0
                                    ? `${Math.abs(invoice.diasCalculados)} día${
                                        Math.abs(invoice.diasCalculados) === 1 ? "" : "s"
                                      } de mora`
                                    : `${invoice.diasCalculados} día${
                                        invoice.diasCalculados === 1 ? "" : "s"
                                      } restante${invoice.diasCalculados === 1 ? "" : "s"}`}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right text-base font-black text-slate-950">
                              {formatMoney(invoice.valorPagar)}
                            </td>
                            <td className="px-4 py-4">
                              <StatusBadge invoice={invoice} />
                              {invoice.categoria === "PAGADA" && (
                                <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-500">
                                  {formatDateTime(invoice.pagoAprobadoEn) ||
                                    "Pago registrado"}
                                  {invoice.pagoAprobadoPor
                                    ? ` · ${invoice.pagoAprobadoPor}`
                                    : ""}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right">
                              {invoice.categoria === "PAGADA" ? (
                                <span className="inline-flex min-h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black uppercase tracking-[0.05em] text-emerald-700">
                                  Aprobado
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setApprovalInvoice(invoice)}
                                  disabled={approvingId !== null}
                                  className="min-h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase tracking-[0.05em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  APROBADO PAGO
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 lg:hidden">
                    {filteredInvoices.map((invoice) => (
                      <article
                        key={invoice.id}
                        className={[
                          "rounded-2xl border p-4",
                          invoice.categoria === "VENCIDA"
                            ? "border-red-200 bg-red-50/45"
                            : "border-slate-200 bg-white",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-black text-slate-950">
                              {invoice.aliado}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Factura {invoice.numeroFactura}
                            </p>
                          </div>
                          <StatusBadge invoice={invoice} />
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Vencimiento
                            </dt>
                            <dd className="mt-1 text-sm font-black text-slate-900">
                              {formatDate(invoice.fechaVencimiento)}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-right">
                            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Valor
                            </dt>
                            <dd className="mt-1 break-words text-sm font-black text-slate-900">
                              {formatMoney(invoice.valorPagar)}
                            </dd>
                          </div>
                        </dl>

                        {invoice.categoria === "PAGADA" ? (
                          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-5 text-emerald-700">
                            Pago aprobado
                            {formatDateTime(invoice.pagoAprobadoEn)
                              ? ` el ${formatDateTime(invoice.pagoAprobadoEn)}`
                              : ""}
                            {invoice.pagoAprobadoPor
                              ? ` por ${invoice.pagoAprobadoPor}`
                              : ""}
                            .
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setApprovalInvoice(invoice)}
                            disabled={approvingId !== null}
                            className="mt-4 min-h-11 w-full rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            APROBADO PAGO
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>

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
          title="Confirmar pago"
          description="Esta acción marcará la factura como pagada y la conservará en el historial."
          titleId="approve-supplier-payment-title"
          initialFocusRef={approvalButtonRef}
          maxWidthClass="max-w-lg"
          onClose={() => {
            if (approvingId === null) setApprovalInvoice(null);
          }}
        >
          <div className="px-5 py-6 sm:px-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  Aliado / factura
                </dt>
                <dd className="mt-1 text-base font-black text-slate-950">
                  {approvalInvoice.aliado} · {approvalInvoice.numeroFactura}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  Vencimiento
                </dt>
                <dd className="mt-1 text-sm font-black text-slate-950">
                  {formatDate(approvalInvoice.fechaVencimiento)}
                </dd>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.13em] text-emerald-700">
                  Valor pagado
                </dt>
                <dd className="mt-1 break-words text-xl font-black text-emerald-700">
                  {formatMoney(approvalInvoice.valorPagar)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
              Verifica que el pago se haya realizado antes de aprobarlo. La factura
              dejará de generar recordatorios de vencimiento.
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => setApprovalInvoice(null)}
              disabled={approvingId !== null}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              ref={approvalButtonRef}
              type="button"
              onClick={() => void approvePayment()}
              disabled={approvingId !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DashboardIcon name="approvals" className="h-4.5 w-4.5" />
              {approvingId !== null ? "Aprobando..." : "APROBADO PAGO"}
            </button>
          </footer>
        </AccessibleDialog>
      )}
    </div>
  );
}
