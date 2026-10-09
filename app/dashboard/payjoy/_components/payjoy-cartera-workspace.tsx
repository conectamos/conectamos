"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "../payjoy-cartera.module.css";

type RowStatus = "MORA" | "GESTIONAR" | "PAGO" | "PAGO X";

type PayJoyRow = {
  corteName: string;
  transactionTime: string | null;
  merchantName: string;
  device: string;
  deviceFamily: string;
  imei: string;
  nationalId: string;
  installmentAmount: number | null;
  paymentDueDate: string | null;
  devicePaymentDate: string | null;
  paidInFull: boolean;
  status: RowStatus;
  maximumPaymentDate: string | null;
  currency: string | null;
  lookupMessage: string | null;
};

type EditablePayJoyRow = PayJoyRow & {
  localId: string;
  manualStatus: RowStatus | null;
};

type StoredPayJoyRow = PayJoyRow & {
  manualStatus?: RowStatus | null;
};

type PayJoyResponse = {
  ok: boolean;
  totalSources: number;
  sourceNames: string[];
  rawRows: number;
  uniqueRows: number;
  duplicatesRemoved: number;
  summary: {
    mora: number;
    pago: number;
    pagoX: number;
  };
  rows: PayJoyRow[];
};

type PayJoyCutListItem = {
  id: number;
  recordName: string;
  totalSources: number;
  sourceNames: string[];
  rawRows: number;
  uniqueRows: number;
  duplicatesRemoved: number;
  summary: {
    mora: number;
    pago: number;
    pagoX: number;
  };
  savedById: number | null;
  savedByName: string;
  savedByUser: string;
  savedAt: string;
  updatedAt: string;
};

type PayJoyCutDetail = PayJoyCutListItem & {
  rows: StoredPayJoyRow[];
};

type PayJoyReloadSummary = {
  total: number;
  movedToPago: number;
  keptPago: number;
  keptPagoX: number;
  stayedGestionar: number;
  stayedMora: number;
  otherChanges: number;
};

function describeReloadSummary(summary: PayJoyReloadSummary) {
  const parts = [
    `${summary.movedToPago} pasaron a PAGO`,
    `${summary.stayedGestionar} siguen en GESTIONAR`,
    `${summary.stayedMora} siguen en MORA`,
    `${summary.keptPago} se conservaron en PAGO`,
    `${summary.keptPagoX} se conservaron en PAGO X`,
  ];

  if (summary.otherChanges > 0) {
    parts.push(`${summary.otherChanges} tuvieron otros cambios`);
  }

  return parts.join(" · ");
}

type MerchantSummary = {
  merchantName: string;
  records: number;
  activeCredits: number;
  overdueCredits: number;
  paidCredits: number;
  pagoXCredits: number;
  delinquencyRate: number;
};

type EditableField =
  | "corteName"
  | "transactionTime"
  | "merchantName"
  | "device"
  | "deviceFamily"
  | "imei"
  | "nationalId"
  | "devicePaymentDate"
  | "status";

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeMerchantName(value: string | null | undefined) {
  return String(value || "").trim() || "Sin merchant";
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function addCalendarDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getDateKeyInBogota(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function getCalendarDiffInBogota(laterDate: Date, earlierDate: Date) {
  const laterKey = getDateKeyInBogota(laterDate);
  const earlierKey = getDateKeyInBogota(earlierDate);
  const [laterYear, laterMonth, laterDay] = laterKey.split("-").map(Number);
  const [earlierYear, earlierMonth, earlierDay] = earlierKey
    .split("-")
    .map(Number);

  const laterUtc = Date.UTC(laterYear, laterMonth - 1, laterDay);
  const earlierUtc = Date.UTC(earlierYear, earlierMonth - 1, earlierDay);

  return Math.round((laterUtc - earlierUtc) / 86_400_000);
}

function getStatusPolicy(
  transactionTime: string | null,
  devicePaymentDate: string | null,
  paidInFull: boolean
) {
  if (paidInFull) {
    return {
      automaticStatus: "PAGO" as RowStatus,
      lockedByMaxWindow: false,
    };
  }

  const transactionDate = parseIsoDate(transactionTime);
  const deviceDate = parseIsoDate(devicePaymentDate);

  if (!transactionDate || !deviceDate) {
    return {
      automaticStatus: "PAGO X" as RowStatus,
      lockedByMaxWindow: false,
    };
  }

  const paymentDate = addCalendarDays(transactionDate, 14);
  const maximumPaymentDate = addCalendarDays(paymentDate, 4);
  const daysAfterMaximumPayment = getCalendarDiffInBogota(
    deviceDate,
    maximumPaymentDate
  );
  const automaticStatus =
    daysAfterMaximumPayment >= 10 && daysAfterMaximumPayment <= 14
      ? ("PAGO" as RowStatus)
      : ("MORA" as RowStatus);

  return {
    automaticStatus,
    lockedByMaxWindow: daysAfterMaximumPayment > 14,
  };
}

function resolveEffectiveStatus(row: EditablePayJoyRow) {
  if (row.manualStatus) {
    return row.manualStatus;
  }

  return getStatusPolicy(
    row.transactionTime,
    row.devicePaymentDate,
    row.paidInFull
  ).automaticStatus;
}

function recalculateDerivedFields(row: EditablePayJoyRow) {
  const transactionDate = parseIsoDate(row.transactionTime);
  const paymentDueDate = transactionDate
    ? addCalendarDays(transactionDate, 14).toISOString()
    : null;
  const maximumPaymentDate = transactionDate
    ? addCalendarDays(transactionDate, 18).toISOString()
    : null;
  const nextManualStatus: RowStatus | null = row.manualStatus;

  return {
    ...row,
    manualStatus: nextManualStatus,
    paymentDueDate,
    maximumPaymentDate,
    status: resolveEffectiveStatus({
      ...row,
      manualStatus: nextManualStatus,
    }),
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${value.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function buildDefaultSaveName(sourceNames: string[]) {
  if (sourceNames.length === 1) {
    return sourceNames[0];
  }

  return `Corte PayJoy ${new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date())}`;
}

function buildExportFileName(sourceNames: string[]) {
  const sourceLabel =
    sourceNames.length === 1
      ? sourceNames[0]
      : `cartera-payjoy-${sourceNames.length}-cortes`;

  return `${sourceLabel.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;
}

function formatCurrency(value: number | null, currency: string | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency || "COP"} ${value.toLocaleString("es-CO")}`;
  }
}

function statusClass(status: RowStatus) {
  switch (status) {
    case "PAGO":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "GESTIONAR":
      return "border-rose-200 bg-rose-100 text-rose-700";
    case "MORA":
      return "border-red-600 bg-red-600 text-white";
    case "PAGO X":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
}

function getRowAppearance(status: RowStatus) {
  switch (status) {
    case "MORA":
      return {
        row: "bg-white hover:bg-red-50/60 [&>td:first-child]:shadow-[inset_4px_0_0_#ef4444]",
        surface: "text-slate-800",
        input:
          "border-red-200 bg-white text-slate-900 focus:border-red-500 focus:ring-red-100",
        helper: "text-red-700",
      };
    case "GESTIONAR":
      return {
        row: "bg-white hover:bg-amber-50/60 [&>td:first-child]:shadow-[inset_4px_0_0_#f59e0b]",
        surface: "text-slate-800",
        input:
          "border-amber-200 bg-white text-slate-900 focus:border-amber-400 focus:ring-amber-100",
        helper: "text-amber-700",
      };
    case "PAGO":
      return {
        row: "bg-white hover:bg-emerald-50/40 [&>td:first-child]:shadow-[inset_4px_0_0_#34d399]",
        surface: "text-slate-800",
        input:
          "border-emerald-200 bg-white text-slate-900 focus:border-emerald-400 focus:ring-emerald-100",
        helper: "text-emerald-700",
      };
    case "PAGO X":
      return {
        row: "bg-white hover:bg-sky-50/40 [&>td:first-child]:shadow-[inset_4px_0_0_#38bdf8]",
        surface: "text-slate-800",
        input:
          "border-sky-200 bg-white text-slate-900 focus:border-sky-400 focus:ring-sky-100",
        helper: "text-sky-700",
      };
  }
}

function statusFilterClass(
  statusOption: "TODOS" | RowStatus,
  selectedStatus: "TODOS" | RowStatus
) {
  const isActive = selectedStatus === statusOption;

  if (!isActive) {
    return "";
  }

  switch (statusOption) {
    case "MORA":
      return styles.statusMoraActive;
    case "GESTIONAR":
      return styles.statusGestionarActive;
    case "PAGO":
    case "PAGO X":
      return styles.statusPaidActive;
    case "TODOS":
    default:
      return styles.statusAllActive;
  }
}

function buildLocalRowId(row: PayJoyRow, index: number) {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    index,
    row.corteName,
    row.transactionTime,
    row.device,
    row.imei,
  ].join("::");
}

function summarizeRows(rows: Array<{ status: RowStatus }>) {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "MORA" || row.status === "GESTIONAR") {
        summary.mora += 1;
      } else if (row.status === "PAGO") {
        summary.pago += 1;
      } else {
        summary.pagoX += 1;
      }

      return summary;
    },
    {
      mora: 0,
      pago: 0,
      pagoX: 0,
    }
  );
}

function buildMerchantSummaries(rows: EditablePayJoyRow[]) {
  const summaryMap = new Map<string, MerchantSummary>();

  for (const row of rows) {
    const merchantName = normalizeMerchantName(row.merchantName);
    const existing =
      summaryMap.get(merchantName) ||
      ({
        merchantName,
        records: 0,
        activeCredits: 0,
        overdueCredits: 0,
        paidCredits: 0,
        pagoXCredits: 0,
        delinquencyRate: 0,
      } satisfies MerchantSummary);

    existing.records += 1;

    if (row.status === "MORA" || row.status === "GESTIONAR") {
      existing.activeCredits += 1;
      existing.overdueCredits += 1;
    } else if (row.status === "PAGO") {
      existing.activeCredits += 1;
      existing.paidCredits += 1;
    } else {
      existing.pagoXCredits += 1;
    }

    summaryMap.set(merchantName, existing);
  }

  return Array.from(summaryMap.values())
    .map((item) => ({
      ...item,
      delinquencyRate: item.activeCredits
        ? (item.overdueCredits / item.activeCredits) * 100
        : 0,
    }))
    .sort(
      (left, right) =>
        right.records - left.records ||
        left.merchantName.localeCompare(right.merchantName)
    );
}

function buildEditableRows(rows: StoredPayJoyRow[]) {
  return rows.map((row, index) =>
    recalculateDerivedFields({
      ...row,
      localId: buildLocalRowId(row, index),
      manualStatus: row.manualStatus ?? null,
    })
  );
}

function serializeEditableRows(rows: EditablePayJoyRow[]) {
  return rows.map((row) => ({
    corteName: row.corteName,
    transactionTime: row.transactionTime,
    merchantName: row.merchantName,
    device: row.device,
    deviceFamily: row.deviceFamily,
    imei: row.imei,
    nationalId: row.nationalId,
    installmentAmount: row.installmentAmount,
    paymentDueDate: row.paymentDueDate,
    devicePaymentDate: row.devicePaymentDate,
    paidInFull: row.paidInFull,
    status: row.status,
    maximumPaymentDate: row.maximumPaymentDate,
    currency: row.currency,
    lookupMessage: row.lookupMessage,
    manualStatus: row.manualStatus,
  }));
}

function buildPayJoyResponseFromSavedCut(cut: PayJoyCutDetail): PayJoyResponse {
  return {
    ok: true,
    totalSources: cut.totalSources || cut.sourceNames.length,
    sourceNames: cut.sourceNames,
    rawRows: cut.rawRows,
    uniqueRows: cut.uniqueRows || cut.rows.length,
    duplicatesRemoved: cut.duplicatesRemoved,
    summary: cut.summary,
    rows: cut.rows.map((row) => ({
      corteName: row.corteName,
      transactionTime: row.transactionTime,
      merchantName: row.merchantName,
      device: row.device,
      deviceFamily: row.deviceFamily,
      imei: row.imei,
      nationalId: row.nationalId,
      installmentAmount: row.installmentAmount,
      paymentDueDate: row.paymentDueDate,
      devicePaymentDate: row.devicePaymentDate,
      paidInFull: row.paidInFull,
      status: row.status,
      maximumPaymentDate: row.maximumPaymentDate,
      currency: row.currency,
      lookupMessage: row.lookupMessage,
    })),
  };
}

function matchesMerchantFilter(
  merchantName: string,
  selectedMerchant: string,
  merchantQuery: string
) {
  const normalizedMerchant = normalizeMerchantName(merchantName);

  if (selectedMerchant !== "TODOS" && normalizedMerchant !== selectedMerchant) {
    return false;
  }

  if (
    merchantQuery &&
    !normalizedMerchant.toLowerCase().includes(merchantQuery.toLowerCase())
  ) {
    return false;
  }

  return true;
}

function matchesStatusFilter(
  status: RowStatus,
  selectedStatus: "TODOS" | RowStatus
) {
  return selectedStatus === "TODOS" || status === selectedStatus;
}

const cellInputClass =
  "min-h-10 w-full rounded-lg border px-3 py-2 text-xs font-semibold outline-none transition focus:ring-2";

const cellReadonlyClass =
  "text-sm font-semibold leading-5";

const tableColCorteClass = "w-[150px] min-w-[150px] px-4 py-5";
const tableColTransactionClass = "w-[190px] min-w-[190px] px-4 py-5";
const tableColMerchantClass = "w-[240px] min-w-[240px] px-4 py-5";
const tableColDeviceClass = "w-[135px] min-w-[135px] px-4 py-5";
const tableColDeviceFamilyClass = "w-[200px] min-w-[200px] px-4 py-5";
const tableColImeiClass = "w-[185px] min-w-[185px] px-4 py-5";
const tableColNationalIdClass = "w-[150px] min-w-[150px] px-4 py-5";
const tableColInstallmentClass = "w-[140px] min-w-[140px] px-4 py-5";
const tableColDateClass = "w-[150px] min-w-[150px] px-4 py-5";
const tableColStatusClass = "w-[210px] min-w-[210px] px-4 py-5";

export default function PayJoyCarteraWorkspace({
  puedeEliminar,
  user,
}: {
  puedeEliminar: boolean;
  user: {
    nombre: string;
    usuario: string;
    rolNombre: string;
    sedeNombre: string;
  };
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reloadSummaryRef = useRef<HTMLElement | null>(null);
  const operationRef = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [data, setData] = useState<PayJoyResponse | null>(null);
  const [rows, setRows] = useState<EditablePayJoyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadSummary, setReloadSummary] = useState<PayJoyReloadSummary | null>(
    null
  );
  const [selectedMerchant, setSelectedMerchant] = useState("TODOS");
  const [selectedStatus, setSelectedStatus] = useState<"TODOS" | RowStatus>(
    "TODOS"
  );
  const [merchantQuery, setMerchantQuery] = useState("");
  const [saveName, setSaveName] = useState("");
  const [savingCut, setSavingCut] = useState(false);
  const [updatingCut, setUpdatingCut] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [savedCuts, setSavedCuts] = useState<PayJoyCutListItem[]>([]);
  const [savedCutsLoading, setSavedCutsLoading] = useState(true);
  const [savedCutsError, setSavedCutsError] = useState("");
  const [savedCutsExpanded, setSavedCutsExpanded] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [saveExpanded, setSaveExpanded] = useState(false);
  const [merchantSummaryExpanded, setMerchantSummaryExpanded] = useState(false);
  const [consultingCutId, setConsultingCutId] = useState<number | null>(null);
  const [reloadingCutId, setReloadingCutId] = useState<number | null>(null);
  const [deletingCutId, setDeletingCutId] = useState<number | null>(null);
  const [activeSavedCutId, setActiveSavedCutId] = useState<number | null>(null);
  const deferredMerchantQuery = useDeferredValue(merchantQuery);
  const normalizedMerchantQuery = normalizeSearchText(deferredMerchantQuery);
  const hasSelectedMerchant = selectedMerchant !== "TODOS";
  const effectiveMerchantQuery = hasSelectedMerchant ? "" : normalizedMerchantQuery;

  const statusFilteredRows = rows.filter((row) =>
    matchesStatusFilter(row.status, selectedStatus)
  );
  const merchantSummaries = buildMerchantSummaries(statusFilteredRows);
  const filteredMerchantSummaries = merchantSummaries.filter((summary) =>
    matchesMerchantFilter(
      summary.merchantName,
      selectedMerchant,
      effectiveMerchantQuery
    )
  );
  const filteredRows = statusFilteredRows.filter((row) =>
    matchesMerchantFilter(
      row.merchantName,
      selectedMerchant,
      effectiveMerchantQuery
    )
  );
  const liveSummary = summarizeRows(rows);
  const visibleSummary = summarizeRows(filteredRows);
  const hasActiveFilter =
    hasSelectedMerchant ||
    Boolean(normalizedMerchantQuery) ||
    selectedStatus !== "TODOS";
  const summaryCards = hasActiveFilter ? visibleSummary : liveSummary;
  const visibleSourceNames = Array.from(
    new Set(filteredRows.map((row) => row.corteName).filter(Boolean))
  );
  const totalSelectedFiles = files.length;
  const canSaveCut = Boolean(data && rows.length);
  const savedCutsCount = savedCuts.length;
  const operationBusy = loading || savingCut || updatingCut || consultingCutId !== null || reloadingCutId !== null || deletingCutId !== null;
  const latestSavedCut = [...savedCuts].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())[0];
  const analysisCutName = activeSavedCutId !== null
    ? savedCuts.find((cut) => cut.id === activeSavedCutId)?.recordName || saveName
    : data?.sourceNames.length === 1 ? data.sourceNames[0] : "";
  const activeStep = loading ? 2 : data ? 3 : files.length ? 2 : 1;
  const navigationItems: NavigationItem[] = [
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
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    {
      href: "/dashboard/sedes",
      icon: "settings",
      label: "Configuración",
    },
  ];

  const exportVisibleRowsToExcel = async () => {
    if (!filteredRows.length) {
      setMessage("No hay filas visibles para exportar.");
      return;
    }

    try {
      setExportingExcel(true);

      const XLSX = await import("xlsx");
      const exportRows = filteredRows.map((row) => ({
        "FECHA CREDITO": formatDateTime(row.transactionTime),
        IMEI: row.imei || "",
        CEDULA: row.nationalId || "",
        "FECHA DEVICE": formatDate(row.devicePaymentDate),
        "FECHA DE PAGO": formatDate(row.paymentDueDate),
        "PAGO MAXIMO": formatDate(row.maximumPaymentDate),
        DEVICE: row.device || "",
        REFERENCIA: row.deviceFamily || "",
        CORTE: row.corteName || "",
        TIENDA: row.merchantName || "",
        CUOTA: row.installmentAmount ?? null,
        ESTADO: row.status,
        "PAGO COMPLETO": row.paidInFull ? "SI" : "NO",
        "MENSAJE CONSULTA": row.lookupMessage || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      filteredRows.forEach((row, index) => {
        const imeiCellRef = `B${index + 2}`;
        const quotaCellRef = `K${index + 2}`;
        const imeiCell = worksheet[imeiCellRef];
        const quotaCell = worksheet[quotaCellRef];

        if (imeiCell) {
          imeiCell.t = "s";
          imeiCell.z = "@";
          imeiCell.v = row.imei || "";
        }

        if (quotaCell && row.installmentAmount !== null) {
          quotaCell.t = "n";
          quotaCell.v = row.installmentAmount;
          quotaCell.z = '"$"#,##0';
        }
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Cartera PayJoy");
      XLSX.writeFile(
        workbook,
        buildExportFileName(
          hasActiveFilter ? visibleSourceNames : data?.sourceNames || ["cartera-payjoy"]
        )
      );

      setMessage(
        `Exportacion completada: ${filteredRows.length} fila(s) visibles en Excel.`
      );
    } catch {
      setMessage("No fue posible exportar la cartera a Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  const loadSavedCuts = async () => {
    try {
      setSavedCutsLoading(true);
      setSavedCutsError("");

      const response = await fetch("/api/payjoy/cartera/cortes?completo=1", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        cortes?: PayJoyCutListItem[];
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !Array.isArray(payload.cortes)) {
        setSavedCutsError(
          payload.error || "No fue posible cargar el historial de cortes."
        );
        return;
      }

      const loadedCuts = payload.cortes || [];
      setSavedCuts(loadedCuts);

      if (!loadedCuts.length) {
        setSavedCutsExpanded(false);
      }
    } catch {
      setSavedCutsError("No fue posible cargar el historial de cortes.");
    } finally {
      setSavedCutsLoading(false);
    }
  };

  useEffect(() => {
    void loadSavedCuts();
  }, []);

  const applyStoredCut = (cut: PayJoyCutDetail) => {
    setData(buildPayJoyResponseFromSavedCut(cut));
    setRows(buildEditableRows(cut.rows));
    setSelectedMerchant("TODOS");
    setSelectedStatus("TODOS");
    setMerchantQuery("");
    setSaveName(cut.recordName);
    setActiveSavedCutId(cut.id);
    setFiles([]);
    setSaveExpanded(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processSources = async () => {
    if (operationRef.current) return;
    if (!files.length) {
      setMessage("Debes subir al menos un archivo de transacciones.");
      return;
    }

    operationRef.current = true;
    try {
      setLoading(true);
      setMessage("");
      setReloadSummary(null);

      const formData = new FormData();

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/payjoy/cartera", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as PayJoyResponse & {
        error?: string;
      };

      if (!response.ok || !payload.ok || !Array.isArray(payload.rows)) {
        setMessage(payload.error || "No fue posible procesar las cargas.");
        return;
      }

      setData(payload);
      setRows(buildEditableRows(payload.rows));
      setSelectedMerchant("TODOS");
      setSelectedStatus("TODOS");
      setMerchantQuery("");
      setSaveName(buildDefaultSaveName(payload.sourceNames));
      setActiveSavedCutId(null);
      setSaveExpanded(false);
      setMessage(
        `${payload.totalSources} archivo(s) procesado(s) · ${payload.uniqueRows} transacciones · ${payload.duplicatesRemoved} duplicados eliminados.`
      );
    } catch {
      setMessage("No fue posible procesar las cargas.");
    } finally {
      operationRef.current = false;
      setLoading(false);
    }
  };

  const updateRowField = (
    localId: string,
    field: EditableField,
    value: string | RowStatus
  ) => {
    if (operationRef.current) return;
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.localId !== localId) {
          return row;
        }

        if (field === "status") {
          const manualStatus = value === "AUTO" ? null : (value as RowStatus);

          return recalculateDerivedFields({
            ...row,
            manualStatus,
            status: manualStatus || row.status,
          });
        }

        return recalculateDerivedFields({
          ...row,
          [field]: value,
        });
      })
    );
  };

  const buildCurrentCutPayload = () => {
    if (!data || !rows.length) {
      return null;
    }

    return {
      recordName: saveName.trim() || buildDefaultSaveName(data.sourceNames),
      totalSources: data.totalSources,
      sourceNames: data.sourceNames,
      rawRows: data.rawRows,
      uniqueRows: rows.length,
      duplicatesRemoved: data.duplicatesRemoved,
      summary: liveSummary,
      rows: serializeEditableRows(rows),
    };
  };

  const saveCurrentCut = async () => {
    if (operationRef.current) return;
    const currentPayload = buildCurrentCutPayload();

    if (!currentPayload) {
      setMessage("Primero debes procesar una cartera antes de guardarla.");
      return;
    }

    operationRef.current = true;
    try {
      setSavingCut(true);
      setMessage("");
      setReloadSummary(null);

      const response = await fetch("/api/payjoy/cartera/cortes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentPayload),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        corte?: PayJoyCutListItem;
        mensaje?: string;
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !payload.corte) {
        setMessage(payload.error || "No fue posible guardar el corte.");
        return;
      }

      setSaveName(payload.corte.recordName);
      setActiveSavedCutId(payload.corte.id);
      setSaveExpanded(false);
      setMessage(
        payload.mensaje ||
          `Corte guardado correctamente como "${payload.corte.recordName}".`
      );
      await loadSavedCuts();
    } catch {
      setMessage("No fue posible guardar el corte.");
    } finally {
      operationRef.current = false;
      setSavingCut(false);
    }
  };

  const updateCurrentStoredCut = async (cutId: number) => {
    if (operationRef.current) return;
    const currentPayload = buildCurrentCutPayload();

    if (!currentPayload) {
      setMessage("Primero debes procesar o consultar una cartera antes de actualizarla.");
      return;
    }

    operationRef.current = true;
    try {
      setUpdatingCut(true);
      setMessage("");
      setReloadSummary(null);

      const response = await fetch("/api/payjoy/cartera/cortes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: cutId,
          ...currentPayload,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        corte?: PayJoyCutListItem;
        mensaje?: string;
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !payload.corte) {
        setMessage(payload.error || "No fue posible actualizar el corte guardado.");
        return;
      }

      setSaveName(payload.corte.recordName);
      setActiveSavedCutId(payload.corte.id);
      setSaveExpanded(false);
      setMessage(
        payload.mensaje ||
          `Corte actualizado correctamente como "${payload.corte.recordName}".`
      );
      await loadSavedCuts();
    } catch {
      setMessage("No fue posible actualizar el corte guardado.");
    } finally {
      operationRef.current = false;
      setUpdatingCut(false);
    }
  };

  const loadStoredCut = async (cutId: number) => {
    if (operationRef.current) return;
    operationRef.current = true;
    try {
      setConsultingCutId(cutId);
      setMessage("");
      setReloadSummary(null);

      const response = await fetch(`/api/payjoy/cartera/cortes?id=${cutId}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        corte?: PayJoyCutDetail;
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !payload.corte) {
        setMessage(payload.error || "No fue posible consultar el corte guardado.");
        return;
      }

      applyStoredCut(payload.corte);
      setSavedCutsExpanded(true);
      setMessage(
        `Consultando el corte guardado "${payload.corte.recordName}" con ${payload.corte.uniqueRows} transaccion(es).`
      );
    } catch {
      setMessage("No fue posible consultar el corte guardado.");
    } finally {
      operationRef.current = false;
      setConsultingCutId(null);
    }
  };

  const reloadStoredCut = async (cutId: number) => {
    if (operationRef.current) return;
    operationRef.current = true;
    try {
      setReloadingCutId(cutId);
      setMessage("");

      const response = await fetch("/api/payjoy/cartera/cortes", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: cutId }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        corte?: PayJoyCutDetail;
        mensaje?: string;
        resumenRecarga?: PayJoyReloadSummary;
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !payload.corte) {
        setMessage(payload.error || "No fue posible recargar el corte guardado.");
        return;
      }

      applyStoredCut(payload.corte);
      setReloadSummary(payload.resumenRecarga || null);
      setSavedCutsExpanded(true);
      const summaryMessage = payload.resumenRecarga
        ? describeReloadSummary(payload.resumenRecarga)
        : "";
      setMessage(
        [
          payload.mensaje ||
            `Corte "${payload.corte.recordName}" recargado correctamente.`,
          summaryMessage,
        ]
          .filter(Boolean)
          .join(" ")
      );

      window.setTimeout(() => {
        reloadSummaryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    } catch {
      setMessage("No fue posible recargar el corte guardado.");
    } finally {
      operationRef.current = false;
      setReloadingCutId(null);
    }
  };

  const deleteStoredCut = async (cutId: number, recordName: string) => {
    if (!puedeEliminar || operationRef.current) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Vas a eliminar el corte guardado "${recordName}". Esta accion no se puede deshacer.`
          );

    if (!confirmed) {
      return;
    }

    operationRef.current = true;
    try {
      setDeletingCutId(cutId);
      setMessage("");
      setReloadSummary(null);

      const response = await fetch(`/api/payjoy/cartera/cortes?id=${cutId}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        mensaje?: string;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error || "No fue posible eliminar el corte guardado.");
        return;
      }

      if (activeSavedCutId === cutId) {
        setActiveSavedCutId(null);
      }

      setMessage(payload.mensaje || "Corte guardado eliminado correctamente.");
      await loadSavedCuts();
    } catch {
      setMessage("No fue posible eliminar el corte guardado.");
    } finally {
      operationRef.current = false;
      setDeletingCutId(null);
    }
  };

  const clearFilters = () => {
    setSelectedMerchant("TODOS");
    setSelectedStatus("TODOS");
    setMerchantQuery("");
  };

  const handleMerchantSelection = (value: string) => {
    setSelectedMerchant(value);
    setMerchantQuery("");
  };

  const selectFiles = (selectedFiles: File[]) => {
    if (operationRef.current) return;
    setFiles((current) => [...current, ...selectedFiles].filter((file, index, all) =>
      all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index
    ));
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    if (operationRef.current) return;
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, ir al inicio">
          <Image src="/branding/conectamos-logo.png" alt="" width={40} height={40} priority />
          <strong>CONECTAMOS</strong>
        </Link>
        <nav className={styles.navigation} aria-label="Navegación principal">
          {navigationItems.map((item) => <Link key={item.href} href={item.href}
            className={`${styles.navItem} ${item.href === "/caja" ? styles.navActive : ""}`}
            aria-current={item.href === "/caja" ? "page" : undefined}>
            <DashboardIcon name={item.icon} /><span>{item.label}</span>
          </Link>)}
        </nav>
        <SalesProfile name={user.nombre || user.usuario} role={user.rolNombre} />
      </header>
      <div className={styles.content}>
        <main className={styles.main}>
          <div className={styles.heading}>
            <div>
              <nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><span>/</span><span>Cartera PayJoy</span></nav>
              <h1>Cartera PayJoy</h1>
              <p>Carga, consolida y consulta tus cortes.</p>
            </div>
            <div className={styles.headingActions}>
              <Link href="/dashboard/payjoy/40-60" className={`${styles.button} ${styles.outlineRed}`}><DashboardIcon name="transfer" />PayJoy 40/60</Link>
              <span className={styles.coverage}><DashboardIcon name="store" />Todas las sedes</span>
            </div>
          </div>

          <section className={styles.summary} aria-label="Resumen de cartera">
            <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="document" /></span><strong>{totalSelectedFiles.toLocaleString("es-CO")}</strong><span>Archivos seleccionados</span></div>
            <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="sales" /></span><strong>{rows.length.toLocaleString("es-CO")}</strong><span>Transacciones cargadas</span></div>
            <div className={styles.metric}><span className={styles.metricIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z" strokeLinejoin="round" /></svg></span><strong>{savedCutsLoading && !savedCutsCount || savedCutsError ? "—" : savedCutsCount.toLocaleString("es-CO")}</strong><span>Cortes guardados</span></div>
          </section>

          {message && <div className={styles.message} role="status">{message}</div>}

          <section className={`${styles.panel} ${styles.uploadPanel}`} aria-labelledby="upload-title" aria-busy={loading}>
            <div className={styles.panelHeading}>
              <h2 id="upload-title">Cargar transacciones</h2>
              <button type="button" className={styles.textButton} onClick={() => setRulesExpanded((current) => !current)} aria-expanded={rulesExpanded} aria-controls="payjoy-rules"><DashboardIcon name="document" />{rulesExpanded ? "Ocultar reglas" : "Ver reglas"}<DashboardIcon name="chevron" className={rulesExpanded ? styles.chevronUp : styles.chevronRight} /></button>
            </div>
            {rulesExpanded && <div id="payjoy-rules" className={styles.rules}>
              <ul>
                <li><strong>Archivos:</strong> XLSX, XLS, CSV, TSV o TXT. Hoja Transacciones o tabla con columnas válidas.</li>
                <li><strong>Campos base:</strong> transaction time, merchant name, device, device family, imei y national id.</li>
                <li><strong>Cálculo automático:</strong> fecha de pago +14 días; pago máximo +18 días. Un equipo pagado se marca PAGO.</li>
              </ul>
            </div>}
            <ol className={styles.steps} aria-label="Pasos de carga">
              {["Seleccionar", "Procesar", "Guardar corte"].map((label, index) => <li key={label} className={activeStep >= index + 1 ? styles.activeStep : undefined} aria-current={activeStep === index + 1 ? "step" : undefined}><span>{index + 1}</span><strong>{label}</strong></li>)}
            </ol>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" multiple className={styles.hiddenInput} aria-label="Archivos de transacciones PayJoy" disabled={operationBusy} onChange={(event) => selectFiles(Array.from(event.target.files || []))} />
            <div className={styles.dropzone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFiles(Array.from(event.dataTransfer.files)); }}>
              <svg className={styles.uploadIcon} viewBox="0 0 64 68" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M40 5H13a5 5 0 0 0-5 5v49a5 5 0 0 0 5 5h38a5 5 0 0 0 5-5V21L40 5Z" /><path d="M40 5v16h16M32 50V32m-8 8 8-8 8 8" /></svg>
              <h3>Selecciona tus archivos de PayJoy</h3><p>XLSX, CSV o TXT</p>
              <button type="button" className={`${styles.button} ${styles.primary} ${styles.selectButton}`} disabled={operationBusy} onClick={() => fileInputRef.current?.click()}>Seleccionar archivos</button>
            </div>
            <div className={styles.uploadFooter}>
              {files.length ? <ul className={styles.fileList} aria-label="Archivos seleccionados">{files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}><DashboardIcon name="document" /><span>{file.name}<small>{(file.size / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} KB</small></span><button type="button" aria-label={`Retirar ${file.name}`} className={styles.removeFile} disabled={operationBusy} onClick={() => removeFile(index)}><DashboardIcon name="close" /></button></li>)}</ul> : <p className={styles.noFiles}><DashboardIcon name="document" />Ningún archivo seleccionado</p>}
              <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void processSources()} disabled={!files.length || operationBusy}>{loading ? "Procesando..." : "Procesar cargas"}</button>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.compactPanel}`} aria-labelledby="save-title">
            <div className={styles.compactRow}>
              <span className={styles.sectionIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h13l3 3v15H3V3h2Z" /><path d="M7 3v7h10V3M7 21v-7h10v7M14 3v4" /></svg></span>
              <div className={styles.compactTitle}><h2 id="save-title">Guardar corte</h2><p>{canSaveCut ? `${rows.length.toLocaleString("es-CO")} transacciones listas para guardar.` : "Disponible después de procesar la cartera."}</p></div>
              <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!canSaveCut || operationBusy} onClick={() => setSaveExpanded((current) => !current)} aria-expanded={saveExpanded} aria-controls="save-cut-form">{saveExpanded ? "Ocultar formulario" : "Guardar corte"}</button>
            </div>
            {saveExpanded && canSaveCut && <div id="save-cut-form" className={styles.saveForm}>
              <label>Nombre del registro<input value={saveName} disabled={operationBusy} onChange={(event) => setSaveName(event.target.value)} placeholder="Nombre del corte" /></label>
              <div className={styles.sources}><strong>Cortes incluidos</strong><span>{data?.sourceNames.join(" · ")}</span></div>
              <div className={styles.formActions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={operationBusy} onClick={() => void saveCurrentCut()}>{savingCut ? "Guardando..." : "Guardar corte"}</button>{activeSavedCutId && <button type="button" className={styles.button} disabled={operationBusy} onClick={() => void updateCurrentStoredCut(activeSavedCutId)}>{updatingCut ? "Actualizando..." : "Actualizar corte guardado"}</button>}</div>
            </div>}
          </section>

          <section className={`${styles.panel} ${styles.compactPanel}`} aria-labelledby="history-title" aria-busy={savedCutsLoading}>
            <div className={styles.compactRow}>
              <span className={styles.sectionIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z" strokeLinejoin="round" /></svg></span>
              <div className={styles.compactTitle}><h2 id="history-title">Cortes guardados <span className={styles.count}>{savedCutsError || savedCutsLoading && !savedCutsCount ? "—" : savedCutsCount.toLocaleString("es-CO")}</span></h2><p>{savedCutsLoading && !savedCutsCount ? "Cargando cortes guardados..." : savedCutsError ? "No se pudo consultar el historial." : latestSavedCut ? `Último guardado: ${latestSavedCut.recordName}` : "Aún no hay cortes guardados."}</p></div>
              <div className={styles.historyActions}><button type="button" className={styles.button} onClick={() => void loadSavedCuts()} disabled={savedCutsLoading || operationBusy}><DashboardIcon name="refresh" />{savedCutsLoading ? "Actualizando..." : "Actualizar"}</button><button type="button" className={`${styles.button} ${styles.graphite}`} onClick={() => setSavedCutsExpanded((current) => !current)} aria-expanded={savedCutsExpanded} aria-controls="saved-cuts-history">{savedCutsExpanded ? "Ocultar historial" : "Ver historial"}<DashboardIcon name="chevron" className={savedCutsExpanded ? styles.chevronUp : styles.chevronRight} /></button></div>
            </div>
            {savedCutsError && <p className={styles.historyError} role="alert">{savedCutsError}</p>}
            {savedCutsExpanded && <div id="saved-cuts-history" className={styles.history}>
              {!savedCuts.length ? <p className={styles.historyEmpty}>{savedCutsLoading ? "Cargando historial..." : savedCutsError ? "Actualiza para volver a consultar los cortes." : "No hay cortes guardados para consultar."}</p> : savedCuts.map((cut) => <article key={cut.id} className={`${styles.cutRow} ${activeSavedCutId === cut.id ? styles.activeCut : ""}`}>
                <div className={styles.cutInformation}><h3>{cut.recordName}{activeSavedCutId === cut.id && <span className={styles.count}>En pantalla</span>}</h3><p>Guardado el {formatDateTime(cut.savedAt)} por {cut.savedByName || cut.savedByUser || "Admin"}{cut.updatedAt !== cut.savedAt && <> · Actualizado el {formatDateTime(cut.updatedAt)}</>}</p><p>{cut.sourceNames.join(" · ")}</p><dl className={styles.cutMetrics}><div><dt>Transacciones</dt><dd>{cut.uniqueRows.toLocaleString("es-CO")}</dd></div><div><dt>Pago</dt><dd>{cut.summary.pago.toLocaleString("es-CO")}</dd></div><div><dt>Mora / gestionar</dt><dd>{cut.summary.mora.toLocaleString("es-CO")}</dd></div><div><dt>Pago X</dt><dd>{cut.summary.pagoX.toLocaleString("es-CO")}</dd></div></dl></div>
                <div className={styles.cutActions}><button type="button" className={`${styles.button} ${styles.graphite}`} disabled={operationBusy} onClick={() => void loadStoredCut(cut.id)}>{consultingCutId === cut.id ? "Abriendo..." : "Ver corte"}</button><button type="button" className={styles.button} disabled={operationBusy} onClick={() => void reloadStoredCut(cut.id)}>{reloadingCutId === cut.id ? "Recargando..." : "Recargar PayJoy"}</button>{activeSavedCutId === cut.id && <button type="button" className={styles.button} disabled={operationBusy} onClick={() => void updateCurrentStoredCut(cut.id)}>{updatingCut ? "Guardando..." : "Guardar cambios"}</button>}{puedeEliminar && <button type="button" className={`${styles.button} ${styles.outlineRed}`} disabled={operationBusy} onClick={() => void deleteStoredCut(cut.id, cut.recordName)}>{deletingCutId === cut.id ? "Eliminando..." : "Eliminar corte"}</button>}</div>
              </article>)}
            </div>}
          </section>
          <p className={styles.access}><DashboardIcon name="lock" />Acceso: ADMIN / AUDITOR</p>



        {data && (
          <div className={styles.results} id="payjoy-cartera-analysis">
            <header className={styles.analysisHeading}>
              <div><h2>Análisis de cartera</h2>{analysisCutName && <span className={styles.cutBadge}>{analysisCutName}</span>}</div>
              <div className={styles.analysisActions}>
                <button type="button" onClick={() => setMerchantSummaryExpanded((current) => !current)} className={styles.button} aria-expanded={merchantSummaryExpanded} aria-controls="payjoy-merchant-summary">{merchantSummaryExpanded ? "Ocultar tiendas" : "Ver tiendas"}</button>
                <button type="button" onClick={() => void exportVisibleRowsToExcel()} disabled={exportingExcel || operationBusy || !filteredRows.length} className={`${styles.button} ${styles.graphite}`}><DashboardIcon name="download" />{exportingExcel ? "Exportando..." : "Exportar Excel"}</button>
              </div>
            </header>

            <section className={styles.analysisSummary} aria-label="Resultados de cartera">
              <p className={styles.analysisSummaryLabel}>{hasActiveFilter ? "Resultados filtrados" : "Resultados de cartera"}</p>
              <div className={styles.analysisMetrics}>
                <div><strong>{(hasActiveFilter ? filteredRows.length : rows.length).toLocaleString("es-CO")}</strong><span>Registros únicos</span><small>{data.rawRows.toLocaleString("es-CO")} filas originales</small></div>
                <div><strong className={styles.analysisPaid}>{summaryCards.pago.toLocaleString("es-CO")}</strong><span>Pago</span><small>Pago X: {summaryCards.pagoX.toLocaleString("es-CO")}</small></div>
                <div><strong className={styles.analysisOverdue}>{summaryCards.mora.toLocaleString("es-CO")}</strong><span>Mora / Gestionar</span></div>
                <div><strong className={styles.analysisPercent}>{formatPercent(visibleSummary.mora + visibleSummary.pago ? (visibleSummary.mora / (visibleSummary.mora + visibleSummary.pago)) * 100 : 0)}</strong><span>Mora visible</span></div>
              </div>
            </section>

            <section className={styles.analysisFilters} aria-labelledby="payjoy-analysis-filters-title">
              <div className={styles.analysisFilterHeading}><h3 id="payjoy-analysis-filters-title">Filtros de cartera</h3><p>{merchantSummaries.length.toLocaleString("es-CO")} comercios · {filteredRows.length.toLocaleString("es-CO")} resultados</p></div>
              <div className={styles.analysisFields}>
                <label><span>Buscar comercio</span><span className={styles.analysisSearch}><DashboardIcon name="search" /><input value={merchantQuery} onChange={(event) => setMerchantQuery(event.target.value)} placeholder="Nombre del comercio..." /></span></label>
                <label><span>Comercio</span><span className={styles.analysisSelect}><select aria-label="Filtrar por tienda" value={selectedMerchant} onChange={(event) => handleMerchantSelection(event.target.value)}><option value="TODOS">Todos los comercios</option>{hasSelectedMerchant && !merchantSummaries.some((summary) => summary.merchantName === selectedMerchant) && <option value={selectedMerchant}>{selectedMerchant}</option>}{merchantSummaries.map((summary) => <option key={summary.merchantName} value={summary.merchantName}>{summary.merchantName}</option>)}</select><DashboardIcon name="chevron" /></span></label>
                <button type="button" onClick={clearFilters} className={styles.button}>Limpiar filtros</button>
              </div>
              <div className={styles.analysisStatusTabs} role="group" aria-label="Filtrar por estado">
                {(["TODOS", "PAGO", "MORA", "GESTIONAR", "PAGO X"] as const).map((statusOption) => <button type="button" key={statusOption} onClick={() => setSelectedStatus(statusOption)} aria-pressed={selectedStatus === statusOption} className={`${styles.analysisStatusTab} ${statusFilterClass(statusOption, selectedStatus)}`}>{({ TODOS: "Todos", PAGO: "Pago", MORA: "Mora", GESTIONAR: "Gestionar", "PAGO X": "Pago X" })[statusOption]}</button>)}
              </div>
              <div className={styles.analysisFilterFooter}><div className={styles.analysisSources} aria-label="Cortes de los resultados">{(hasActiveFilter ? visibleSourceNames : data.sourceNames).map((name) => <span key={name} className={styles.cutBadge}>{name}</span>)}</div><p>{data.duplicatesRemoved.toLocaleString("es-CO")} duplicados removidos</p></div>
            </section>

            {reloadSummary && <section ref={reloadSummaryRef} className={styles.reloadSummary} aria-label="Resumen de recarga">
              <div className={styles.reloadHeading}><div><h3>Resumen de recarga</h3><span className={styles.cutBadge}>Recarga completa</span></div><p>{reloadSummary.total.toLocaleString("es-CO")} revisados</p></div>
              <div className={styles.reloadMetrics}>
                <div><strong>{reloadSummary.movedToPago.toLocaleString("es-CO")}</strong><span>Pasaron a Pago</span></div>
                <div><strong>{reloadSummary.stayedGestionar.toLocaleString("es-CO")}</strong><span>Siguen en Gestionar</span></div>
                <div><strong className={styles.reloadOverdue}>{reloadSummary.stayedMora.toLocaleString("es-CO")}</strong><span>Siguen en Mora</span></div>
                <div><strong className={styles.reloadPaid}>{reloadSummary.keptPago.toLocaleString("es-CO")}</strong><span>Se conservaron en Pago</span></div>
                <div><strong>{reloadSummary.keptPagoX.toLocaleString("es-CO")}</strong><span>Se conservaron en Pago X</span></div>
              </div>
              {reloadSummary.otherChanges > 0 && <p className={styles.reloadOtherChanges}>{reloadSummary.otherChanges.toLocaleString("es-CO")} registros tuvieron otros cambios.</p>}
            </section>}


            {merchantSummaryExpanded && (
            <section id="payjoy-merchant-summary" className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Resumen por tienda
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-4">Merchant name</th>
                      <th className="px-4 py-4">Registros</th>
                      <th className="px-4 py-4">Creditos activos</th>
                      <th className="px-4 py-4">Creditos en mora</th>
                      <th className="px-4 py-4">% mora</th>
                      <th className="px-4 py-4">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredMerchantSummaries.map((summary) => (
                      <tr key={summary.merchantName}>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-950">
                          {summary.merchantName}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {summary.records}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {summary.activeCredits}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {summary.overdueCredits}
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-950">
                          {formatPercent(summary.delinquencyRate)}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <button
                            onClick={() =>
                              handleMerchantSelection(summary.merchantName)
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Ver registros
                          </button>
                        </td>
                      </tr>
                    ))}

                    {!filteredMerchantSummaries.length && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-sm text-slate-500"
                        >
                          No hay merchant name que coincidan con el filtro
                          actual.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            )}

            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                    <DashboardIcon name="reports" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                      Tabla operativa
                    </p>
                    <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                      Cartera PayJoy
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">
                      Los datos del credito permanecen protegidos. Solo puedes
                      ajustar <span className="font-semibold text-slate-700">Tienda</span> y{" "}
                      <span className="font-semibold text-slate-700">Estado</span>; los indicadores
                      se recalculan en vivo.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="rounded-lg bg-slate-100 px-3 py-2">
                    {filteredRows.length} registros
                  </span>
                  <span className="hidden rounded-lg bg-slate-100 px-3 py-2 sm:inline-flex">
                    Desliza horizontalmente para ver todo
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto overscroll-x-contain">
                <table className="min-w-[2050px] divide-y divide-slate-200">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      <th className={tableColTransactionClass}>
                        Fecha crédito
                      </th>
                      <th className={tableColImeiClass}>IMEI</th>
                      <th className={tableColNationalIdClass}>Cédula</th>
                      <th className={tableColDateClass}>Fecha device</th>
                      <th className={tableColDateClass}>Fecha de pago</th>
                      <th className={tableColDateClass}>Pago máximo</th>
                      <th className={tableColDeviceClass}>Device</th>
                      <th className={tableColDeviceFamilyClass}>Referencia</th>
                      <th className={tableColCorteClass}>CORTE</th>
                      <th className={tableColMerchantClass}>Tienda</th>
                      <th className={tableColInstallmentClass}>Cuota</th>
                      <th className={tableColStatusClass}>Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row) => {
                      const appearance = getRowAppearance(row.status);
                      const policy = getStatusPolicy(
                        row.transactionTime,
                        row.devicePaymentDate,
                        row.paidInFull
                      );
                      const statusSelectValue = row.manualStatus || "AUTO";
                      const statusPolicyMessage = [
                        `Politica: ${policy.automaticStatus}`,
                        policy.lockedByMaxWindow
                          ? "supera 14 dias sobre la fecha maxima"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" | ");

                      return (
                        <tr
                          key={row.localId}
                          className={["align-top transition-colors", appearance.row].join(
                            " "
                          )}
                        >
                          <td className={tableColTransactionClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {formatDateTime(row.transactionTime)}
                            </div>
                          </td>
                          <td className={tableColImeiClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {row.imei || "-"}
                            </div>
                          </td>
                          <td className={tableColNationalIdClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {row.nationalId || "-"}
                            </div>
                          </td>
                          <td className={tableColDateClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {formatDate(row.devicePaymentDate)}
                            </div>
                          </td>
                          <td className={tableColDateClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {formatDate(row.paymentDueDate)}
                            </div>
                          </td>
                          <td className={tableColDateClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {formatDate(row.maximumPaymentDate)}
                            </div>
                          </td>
                          <td className={tableColDeviceClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {row.device || "-"}
                            </div>
                          </td>
                          <td className={tableColDeviceFamilyClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {row.deviceFamily || "-"}
                            </div>
                          </td>
                          <td className={tableColCorteClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {row.corteName || "-"}
                            </div>
                          </td>
                          <td className={tableColMerchantClass}>
                            <input
                              disabled={operationBusy}
                              aria-label={`Tienda de ${row.imei || row.device}`}
                              value={row.merchantName}
                              onChange={(event) =>
                                updateRowField(
                                  row.localId,
                                  "merchantName",
                                  event.target.value
                                )
                              }
                              className={[cellInputClass, appearance.input].join(" ")}
                            />
                          </td>
                          <td className={tableColInstallmentClass}>
                            <div
                              className={[cellReadonlyClass, appearance.surface].join(
                                " "
                              )}
                            >
                              {formatCurrency(
                                row.installmentAmount,
                                row.currency
                              )}
                            </div>
                          </td>
                          <td className={tableColStatusClass}>
                            <div className="flex flex-col gap-2">
                              <select
                                disabled={operationBusy}
                                aria-label={`Estado de ${row.imei || row.device}`}
                                value={statusSelectValue}
                                onChange={(event) =>
                                  updateRowField(
                                    row.localId,
                                    "status",
                                    event.target.value
                                  )
                                }
                                className={[cellInputClass, appearance.input].join(
                                  " "
                                )}
                              >
                                <option value="AUTO">AUTO</option>
                                <option value="PAGO">PAGO</option>
                                <option value="MORA">MORA</option>
                                <option value="GESTIONAR">GESTIONAR</option>
                                <option value="PAGO X">PAGO X</option>
                              </select>
                              <span
                                className={[
                                  "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                                  statusClass(row.status),
                                ].join(" ")}
                              >
                                {row.status}
                              </span>
                              {row.lookupMessage && (
                                <div
                                  className={[
                                    "text-xs leading-5",
                                    appearance.helper,
                                  ].join(" ")}
                                >
                                  {row.lookupMessage}
                                </div>
                              )}
                              {statusPolicyMessage && (
                                <div
                                  className={[
                                    "text-[10px] font-bold uppercase tracking-[0.14em]",
                                    appearance.helper,
                                  ].join(" ")}
                                >
                                  {statusPolicyMessage}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!filteredRows.length && (
                      <tr>
                        <td
                          colSpan={12}
                          className="px-4 py-8 text-center text-sm text-slate-500"
                        >
                          No hay filas para mostrar con el filtro actual.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
