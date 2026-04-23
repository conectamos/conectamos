"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";

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

function computeStatus(
  transactionTime: string | null,
  devicePaymentDate: string | null,
  paidInFull: boolean
): RowStatus {
  return getStatusPolicy(transactionTime, devicePaymentDate, paidInFull)
    .automaticStatus;
}

function getAutomaticStatusForRow(
  row: Pick<PayJoyRow, "transactionTime" | "devicePaymentDate" | "paidInFull">
) {
  return computeStatus(
    row.transactionTime,
    row.devicePaymentDate,
    row.paidInFull
  );
}

function resolveEffectiveStatus(row: EditablePayJoyRow) {
  if (row.status === "PAGO X" || row.manualStatus === "PAGO X") {
    return "PAGO X" as RowStatus;
  }

  const policy = getStatusPolicy(
    row.transactionTime,
    row.devicePaymentDate,
    row.paidInFull
  );
  const automaticStatus = policy.automaticStatus;

  if (automaticStatus === "PAGO X") {
    return "PAGO X" as RowStatus;
  }

  if (automaticStatus === "PAGO") {
    return "PAGO";
  }

  if (row.manualStatus === "GESTIONAR") {
    return "GESTIONAR";
  }

  if (row.manualStatus === "MORA") {
    return "MORA";
  }

  return automaticStatus;
}

function recalculateDerivedFields(row: EditablePayJoyRow) {
  const transactionDate = parseIsoDate(row.transactionTime);
  const paymentDueDate = transactionDate
    ? addCalendarDays(transactionDate, 14).toISOString()
    : null;
  const maximumPaymentDate = transactionDate
    ? addCalendarDays(transactionDate, 18).toISOString()
    : null;
  const policy = getStatusPolicy(
    row.transactionTime,
    row.devicePaymentDate,
    row.paidInFull
  );
  const automaticStatus = policy.automaticStatus;
  const nextManualStatus: RowStatus | null =
    row.status === "PAGO X" || row.manualStatus === "PAGO X"
      ? "PAGO X"
      : automaticStatus === "PAGO X"
        ? "PAGO X"
      : automaticStatus === "PAGO"
        ? "PAGO"
        : row.manualStatus === "GESTIONAR"
          ? "GESTIONAR"
          : row.manualStatus === "MORA"
            ? "MORA"
            : null;

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
  return `${value.toFixed(1)}%`;
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
        row: "bg-[#ffd5d5] hover:bg-[#ffc8c8]",
        surface: "border-red-300/80 bg-white/55 text-slate-900",
        input:
          "border-red-300 bg-white/75 text-slate-900 focus:border-red-500 focus:ring-red-100",
        helper: "text-red-900/80",
      };
    case "GESTIONAR":
      return {
        row: "bg-[#fff1f3] hover:bg-[#ffe7eb]",
        surface: "border-rose-200 bg-white/80 text-slate-900",
        input:
          "border-rose-200 bg-white/90 text-slate-900 focus:border-rose-400 focus:ring-rose-100",
        helper: "text-rose-800/80",
      };
    case "PAGO":
      return {
        row: "bg-[#ecfdf3] hover:bg-[#e2f8eb]",
        surface: "border-emerald-200 bg-white/85 text-slate-900",
        input:
          "border-emerald-200 bg-white/95 text-slate-900 focus:border-emerald-400 focus:ring-emerald-100",
        helper: "text-emerald-800/80",
      };
    case "PAGO X":
      return {
        row: "bg-[#ecfdf3] hover:bg-[#e2f8eb]",
        surface: "border-emerald-200 bg-white/85 text-slate-900",
        input:
          "border-emerald-200 bg-white/95 text-slate-900 focus:border-emerald-400 focus:ring-emerald-100",
        helper: "text-emerald-800/80",
      };
  }
}

function statusFilterClass(
  statusOption: "TODOS" | RowStatus,
  selectedStatus: "TODOS" | RowStatus
) {
  const isActive = selectedStatus === statusOption;

  if (!isActive) {
    return "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  }

  switch (statusOption) {
    case "MORA":
      return "border-red-600 bg-red-600 text-white";
    case "GESTIONAR":
      return "border-rose-200 bg-rose-100 text-rose-700";
    case "PAGO":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "PAGO X":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "TODOS":
    default:
      return "border-slate-950 bg-slate-950 text-white";
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
  "w-full rounded-2xl border px-3 py-2.5 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition focus:ring-2";

const cellReadonlyClass =
  "rounded-2xl border px-3 py-2.5 text-sm font-medium";

const tableColCorteClass = "w-[190px] min-w-[190px] px-4 py-4";
const tableColTransactionClass = "w-[270px] min-w-[270px] px-4 py-4";
const tableColMerchantClass = "w-[300px] min-w-[300px] px-4 py-4";
const tableColDeviceClass = "w-[170px] min-w-[170px] px-4 py-4";
const tableColDeviceFamilyClass = "w-[240px] min-w-[240px] px-4 py-4";
const tableColImeiClass = "w-[210px] min-w-[210px] px-4 py-4";
const tableColNationalIdClass = "w-[190px] min-w-[190px] px-4 py-4";
const tableColInstallmentClass = "w-[190px] min-w-[190px] px-4 py-4";
const tableColDateClass = "w-[190px] min-w-[190px] px-4 py-4";
const tableColStatusClass = "w-[170px] min-w-[170px] px-4 py-4";

export default function PayJoyCarteraWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [data, setData] = useState<PayJoyResponse | null>(null);
  const [rows, setRows] = useState<EditablePayJoyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState("TODOS");
  const [selectedStatus, setSelectedStatus] = useState<"TODOS" | RowStatus>(
    "TODOS"
  );
  const [merchantQuery, setMerchantQuery] = useState("");
  const [saveName, setSaveName] = useState("");
  const [savingCut, setSavingCut] = useState(false);
  const [updatingCut, setUpdatingCut] = useState(false);
  const [savedCuts, setSavedCuts] = useState<PayJoyCutListItem[]>([]);
  const [savedCutsLoading, setSavedCutsLoading] = useState(true);
  const [savedCutsError, setSavedCutsError] = useState("");
  const [savedCutsExpanded, setSavedCutsExpanded] = useState(false);
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

  const loadSavedCuts = async () => {
    try {
      setSavedCutsLoading(true);
      setSavedCutsError("");

      const response = await fetch("/api/payjoy/cartera/cortes", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        cortes?: PayJoyCutListItem[];
        error?: string;
      };

      if (!response.ok) {
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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processSources = async () => {
    if (!files.length) {
      setMessage("Debes subir al menos un archivo de transacciones.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

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

      if (!response.ok) {
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
      setMessage(
        `Se procesaron ${payload.totalSources} carga(s) y se consolidaron ${payload.uniqueRows} transaccion(es) sin duplicados. Ahora puedes filtrar por Merchant name y editar la tabla.`
      );
    } catch {
      setMessage("No fue posible procesar las cargas.");
    } finally {
      setLoading(false);
    }
  };

  const updateRowField = (
    localId: string,
    field: EditableField,
    value: string | RowStatus
  ) => {
    if (field === "status") {
      const currentRow = rows.find((row) => row.localId === localId);

      if (!currentRow) {
        return;
      }

      const policy = getStatusPolicy(
        currentRow.transactionTime,
        currentRow.devicePaymentDate,
        currentRow.paidInFull
      );
      const nextManualStatus = value === "AUTO" ? null : (value as RowStatus);

      if (
        currentRow.status === "PAGO X" ||
        currentRow.manualStatus === "PAGO X" ||
        policy.automaticStatus === "PAGO X"
      ) {
        setMessage("Los registros en PAGO X no se pueden mover manualmente.");
        return;
      }

      if (policy.lockedByMaxWindow) {
        setMessage(
          "Este registro supero 14 dias sobre la fecha maxima de pago y ya no puede modificarse manualmente."
        );
        return;
      }

      if (nextManualStatus === "PAGO" && policy.automaticStatus !== "PAGO") {
        setMessage(
          "Este registro solo puede pasar a PAGO cuando la regla automatica de PayJoy lo permite."
        );
        return;
      }

      if (nextManualStatus === "PAGO X") {
        setMessage("PAGO X solo se asigna automaticamente por la politica.");
        return;
      }
    }

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
    const currentPayload = buildCurrentCutPayload();

    if (!currentPayload) {
      setMessage("Primero debes procesar una cartera antes de guardarla.");
      return;
    }

    try {
      setSavingCut(true);
      setMessage("");

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

      if (!response.ok || !payload.corte) {
        setMessage(payload.error || "No fue posible guardar el corte.");
        return;
      }

      setSaveName(payload.corte.recordName);
      setActiveSavedCutId(payload.corte.id);
      setSavedCutsExpanded(true);
      setMessage(
        payload.mensaje ||
          `Corte guardado correctamente como "${payload.corte.recordName}".`
      );
      await loadSavedCuts();
    } catch {
      setMessage("No fue posible guardar el corte.");
    } finally {
      setSavingCut(false);
    }
  };

  const updateCurrentStoredCut = async (cutId: number) => {
    const currentPayload = buildCurrentCutPayload();

    if (!currentPayload) {
      setMessage("Primero debes procesar o consultar una cartera antes de actualizarla.");
      return;
    }

    try {
      setUpdatingCut(true);
      setMessage("");

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

      if (!response.ok || !payload.corte) {
        setMessage(payload.error || "No fue posible actualizar el corte guardado.");
        return;
      }

      setSaveName(payload.corte.recordName);
      setActiveSavedCutId(payload.corte.id);
      setSavedCutsExpanded(true);
      setMessage(
        payload.mensaje ||
          `Corte actualizado correctamente como "${payload.corte.recordName}".`
      );
      await loadSavedCuts();
    } catch {
      setMessage("No fue posible actualizar el corte guardado.");
    } finally {
      setUpdatingCut(false);
    }
  };

  const loadStoredCut = async (cutId: number) => {
    try {
      setConsultingCutId(cutId);
      setMessage("");

      const response = await fetch(`/api/payjoy/cartera/cortes?id=${cutId}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        corte?: PayJoyCutDetail;
        error?: string;
      };

      if (!response.ok || !payload.corte) {
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
      setConsultingCutId(null);
    }
  };

  const reloadStoredCut = async (cutId: number) => {
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
        error?: string;
      };

      if (!response.ok || !payload.corte) {
        setMessage(payload.error || "No fue posible recargar el corte guardado.");
        return;
      }

      applyStoredCut(payload.corte);
      setSavedCutsExpanded(true);
      setMessage(
        payload.mensaje ||
          `Corte "${payload.corte.recordName}" recargado correctamente.`
      );
    } catch {
      setMessage("No fue posible recargar el corte guardado.");
    } finally {
      setReloadingCutId(null);
    }
  };

  const deleteStoredCut = async (cutId: number, recordName: string) => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Vas a eliminar el corte guardado "${recordName}". Esta accion no se puede deshacer.`
          );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingCutId(cutId);
      setMessage("");

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

  return (
    <div className="min-h-screen bg-[#f4f7fb] px-4 py-6">
      <div className="mx-auto w-full max-w-none">
        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-6 text-slate-950 shadow-[0_16px_50px_rgba(15,23,42,0.07)] sm:px-8">
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-full border border-[#dfcfb3] bg-[#fff8ec] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f5b24]">
                  PayJoy cartera
                </div>
                <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Solo admin
                </div>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-[3.2rem]">
                Cartera PayJoy
              </h1>
              <div className="mt-4 h-[3px] w-18 rounded-full bg-[#c79a57]" />
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                Consolida cortes, revisa cartera por tienda y administra el
                historial desde un panel mas limpio para operacion.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="min-w-[170px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Archivos listos
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {totalSelectedFiles}
                  </p>
                </div>
                <div className="min-w-[170px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Cortes guardados
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {savedCutsCount}
                  </p>
                </div>
                <div className="min-w-[170px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Filas activas
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {rows.length}
                  </p>
                </div>
                <div className="min-w-[200px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Formatos
                  </p>
                  <p className="mt-2 text-base font-black text-slate-950">
                    XLSX, CSV, TXT
                  </p>
                </div>
              </div>
            </div>

            <div className="relative flex flex-wrap gap-3">
              <Link
                href="/dashboard/payjoy"
                className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Cartera PayJoy
              </Link>
              <Link
                href="/dashboard/payjoy/40-60"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                40/60
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {message && (
          <div className="mb-5 mt-5 rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.06)]">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="inline-flex rounded-full border border-[#dfcfb3] bg-[#fff8ec] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f5b24]">
                Operacion actual
              </div>

              <h2 className="mt-4 text-[2rem] font-black tracking-tight text-slate-950">
                Cargar transacciones
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Sube archivos exportados desde PayJoy, consolida sin duplicados
                y deja listo el corte para guardar o analizar.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                multiple
                className="hidden"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files || []))
                }
              />

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b1f27]"
                >
                  Seleccionar archivos
                </button>
                <button
                  onClick={() => void processSources()}
                  disabled={loading}
                  className="rounded-2xl border border-[#d2c4ad] bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-[#fcfaf5] disabled:opacity-70"
                >
                  {loading ? "Procesando..." : "Procesar cargas"}
                </button>
                <div className="rounded-2xl border border-[#e2d8c7] bg-white/90 px-4 py-3 text-sm font-semibold text-slate-700">
                  {files.length
                    ? `${files.length} archivo(s) listo(s)`
                    : "Aun no has seleccionado archivos"}
                </div>
              </div>

              {files.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <span
                      key={`${file.name}-${file.size}`}
                      className="rounded-full border border-[#ddd3c2] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {file.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Checklist rapido
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Validacion
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Hoja <span className="font-semibold">Transacciones</span> o
                    tabla con columnas validas.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Campos base
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    transaction time, merchant name, device, device family,
                    imei y national id.
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Calculo automatico
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    Fecha de pago = +14 dias. Pago maximo = +18 dias. Si el
                    equipo ya esta pagado, se marca como{" "}
                    <span className="font-semibold">PAGO</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Guardar corte
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              Registro persistente
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Guarda la cartera actual para volver a consultarla sin recalcular
              todo el modulo.
            </p>

            {canSaveCut ? (
              <>
                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Nombre del registro
                  </span>
                  <input
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="Ej: Corte abril 4 PayJoy"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#c79a57] focus:ring-2 focus:ring-[#f4dfbc]"
                  />
                </label>

                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Cortes incluidos
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data?.sourceNames.map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void saveCurrentCut()}
                    disabled={savingCut}
                    className="rounded-2xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b1f27] disabled:opacity-70"
                  >
                    {savingCut ? "Guardando..." : "Guardar corte"}
                  </button>
                  {activeSavedCutId && (
                    <button
                      onClick={() => void updateCurrentStoredCut(activeSavedCutId)}
                      disabled={updatingCut}
                      className="rounded-2xl border border-[#d8b476] bg-[#fff9ef] px-5 py-3 text-sm font-semibold text-[#8f5b24] transition hover:bg-[#fff2db] disabled:opacity-70"
                    >
                      {updatingCut
                        ? "Actualizando..."
                        : "Actualizar corte guardado"}
                    </button>
                  )}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {rows.length} fila(s) listas para guardar
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                Procesa una cartera primero y luego podras guardarla en el
                historial.
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Historial de cortes
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                  Cortes guardados
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Mantenlo oculto cuando estes trabajando la cartera actual y
                  expandelo solo cuando necesites consultar o borrar cortes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {savedCutsCount} corte(s)
                </div>
                <button
                  onClick={() => setSavedCutsExpanded((current) => !current)}
                  disabled={!savedCutsCount}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savedCutsExpanded ? "Ocultar cortes" : "Visualizar cortes"}
                </button>
                <button
                  onClick={() => void loadSavedCuts()}
                  disabled={savedCutsLoading}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
                >
                  {savedCutsLoading ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>

            {savedCutsError && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {savedCutsError}
              </div>
            )}

            {savedCutsLoading && !savedCuts.length ? (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                Cargando historial de cortes guardados...
              </div>
            ) : !savedCuts.length ? (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                Aun no hay cortes guardados. Cuando uses{" "}
                <span className="font-semibold">Guardar corte</span>, te
                quedaran listados aqui para futuras consultas.
              </div>
            ) : !savedCutsExpanded ? (
              <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Historial oculto para mantener el panel liviano
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Tienes {savedCutsCount} corte(s) guardado(s). Pulsa{" "}
                      <span className="font-semibold">Visualizar cortes</span>{" "}
                      cuando necesites consultarlos.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    Ultimo guardado:{" "}
                    <span className="font-semibold text-slate-950">
                      {savedCuts[0]?.recordName || "-"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {savedCuts.map((cut) => (
                  <article
                    key={cut.id}
                    className={[
                      "rounded-[24px] border px-4 py-4 transition",
                      activeSavedCutId === cut.id
                        ? "border-[#d8b476] bg-[#fff9ef] shadow-sm"
                        : "border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black tracking-tight text-slate-950">
                            {cut.recordName}
                          </h3>
                          {activeSavedCutId === cut.id && (
                            <span className="rounded-full border border-[#e1c38d] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f5b24]">
                              En pantalla
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          Guardado el {formatDateTime(cut.savedAt)} por{" "}
                          <span className="font-semibold text-slate-700">
                            {cut.savedByName || cut.savedByUser || "Admin"}
                          </span>
                        </p>
                        {cut.updatedAt !== cut.savedAt && (
                          <p className="mt-1 text-sm text-slate-500">
                            Actualizado el {formatDateTime(cut.updatedAt)}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {cut.sourceNames.map((name) => (
                            <span
                              key={`${cut.id}-${name}`}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="w-full xl:w-[340px]">
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Acciones del corte
                          </p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <button
                              onClick={() => void loadStoredCut(cut.id)}
                              disabled={consultingCutId === cut.id}
                              className="rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
                            >
                              {consultingCutId === cut.id
                                ? "Abriendo..."
                                : "Ver corte"}
                            </button>
                            <button
                              onClick={() => void reloadStoredCut(cut.id)}
                              disabled={reloadingCutId === cut.id}
                              className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-70"
                            >
                              {reloadingCutId === cut.id
                                ? "Recargando..."
                                : "Recargar PayJoy"}
                            </button>
                            {activeSavedCutId === cut.id && (
                              <button
                                onClick={() => void updateCurrentStoredCut(cut.id)}
                                disabled={updatingCut}
                                className="rounded-2xl border border-[#d8b476] bg-[#fff9ef] px-4 py-3 text-sm font-semibold text-[#8f5b24] transition hover:bg-[#fff2db] disabled:opacity-70"
                              >
                                {updatingCut
                                  ? "Guardando..."
                                  : "Guardar cambios"}
                              </button>
                            )}
                            <button
                              onClick={() =>
                                void deleteStoredCut(cut.id, cut.recordName)
                              }
                              disabled={deletingCutId === cut.id}
                              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-70"
                            >
                              {deletingCutId === cut.id
                                ? "Eliminando..."
                                : "Eliminar corte"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Transacciones
                        </p>
                        <p className="mt-1 text-lg font-black text-slate-950">
                          {cut.uniqueRows}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Pago
                        </p>
                        <p className="mt-1 text-lg font-black text-emerald-700">
                          {cut.summary.pago}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Mora / gestionar
                        </p>
                        <p className="mt-1 text-lg font-black text-red-700">
                          {cut.summary.mora}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Pago X
                        </p>
                        <p className="mt-1 text-lg font-black text-emerald-700">
                          {cut.summary.pagoX}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {data && (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-5">
              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cargas
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {data.totalSources}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Filas brutas
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {data.rawRows}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Unicas
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {hasActiveFilter ? filteredRows.length : rows.length}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {hasActiveFilter ? "Filtradas" : "Sin duplicados"}
                </p>
              </div>

              <div className="rounded-[24px] border border-red-200 bg-[linear-gradient(180deg,#fff5f5_0%,#fef2f2_100%)] p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
                  Mora / gestionar
                </p>
                <p className="mt-2 text-3xl font-black text-red-700">
                  {summaryCards.mora}
                </p>
              </div>

              <div className="rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,#f0fdf4_0%,#ecfdf5_100%)] p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Pago
                </p>
                <p className="mt-2 text-3xl font-black text-emerald-700">
                  {summaryCards.pago}
                </p>
                <p className="mt-2 text-sm text-emerald-700/80">
                  Pago X: {summaryCards.pagoX}
                </p>
              </div>
            </section>

            <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Analitica
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                    Filtros de cartera
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-500">
                    Filtra por tienda, estado y revisa el comportamiento de la
                    cartera visible sin salir del panel.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Comercios:{" "}
                    <span className="font-semibold text-slate-950">
                      {merchantSummaries.length}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Filas visibles:{" "}
                    <span className="font-semibold text-slate-950">
                      {filteredRows.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px_auto]">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Buscar Merchant name
                  </span>
                  <input
                    value={merchantQuery}
                    onChange={(event) => setMerchantQuery(event.target.value)}
                    placeholder="Ej: CONECTAMOS CLARO 6"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Merchant filtrado
                  </span>
                  <select
                    value={selectedMerchant}
                    onChange={(event) =>
                      handleMerchantSelection(event.target.value)
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                  >
                    <option value="TODOS">Todos los merchant</option>
                    {merchantSummaries.map((summary) => (
                      <option
                        key={summary.merchantName}
                        value={summary.merchantName}
                      >
                        {summary.merchantName}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  Filtrar por estado
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    ["TODOS", "PAGO", "MORA", "GESTIONAR", "PAGO X"] as const
                  ).map(
                    (statusOption) => (
                      <button
                        key={statusOption}
                        onClick={() => setSelectedStatus(statusOption)}
                        className={[
                          "rounded-full border px-4 py-2 text-sm font-semibold transition",
                          statusFilterClass(statusOption, selectedStatus),
                        ].join(" ")}
                      >
                        {statusOption}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cortes detectados
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(hasActiveFilter ? visibleSourceNames : data.sourceNames).map(
                    (name) => (
                      <span
                        key={name}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        {name}
                      </span>
                    )
                  )}
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Duplicados removidos: {data.duplicatesRemoved}
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Registros visibles
                  </p>
                  <p className="mt-3 text-3xl font-black text-slate-950">
                    {filteredRows.length}
                  </p>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Activos visibles
                  </p>
                  <p className="mt-3 text-3xl font-black text-slate-950">
                    {visibleSummary.mora + visibleSummary.pago}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Pago X: {visibleSummary.pagoX}
                  </p>
                </div>

                <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
                    Mora / gestionar
                  </p>
                  <p className="mt-3 text-3xl font-black text-red-700">
                    {visibleSummary.mora}
                  </p>
                </div>

                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    % mora visible
                  </p>
                  <p className="mt-3 text-3xl font-black text-emerald-700">
                    {formatPercent(
                      visibleSummary.mora + visibleSummary.pago
                        ? (visibleSummary.mora /
                            (visibleSummary.mora + visibleSummary.pago)) *
                            100
                        : 0
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
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

            <section className="mt-6 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Tabla operativa
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                  Tabla de cartera PayJoy
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Los campos base del credito quedan bloqueados. Solo puedes
                  ajustar <span className="font-semibold">Tienda</span> y{" "}
                  <span className="font-semibold">Estado</span>; el resumen por
                  comercio se recalcula en vivo.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[2370px] divide-y divide-slate-200">
                  <thead className="sticky top-0 z-10 bg-[#f7f9fc]">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                  <tbody className="divide-y divide-white/60">
                    {filteredRows.map((row) => {
                      const appearance = getRowAppearance(row.status);
                      const policy = getStatusPolicy(
                        row.transactionTime,
                        row.devicePaymentDate,
                        row.paidInFull
                      );
                      const statusLocked =
                        row.status === "PAGO X" ||
                        row.manualStatus === "PAGO X" ||
                        policy.automaticStatus === "PAGO X" ||
                        policy.lockedByMaxWindow;
                      const canMoveToPago =
                        policy.automaticStatus === "PAGO" ||
                        row.status === "PAGO";
                      const statusSelectValue =
                        row.status === "PAGO X" || row.manualStatus === "PAGO X"
                          ? "PAGO X"
                          : row.manualStatus || "AUTO";
                      const statusLockMessage =
                        row.status === "PAGO X" ||
                        row.manualStatus === "PAGO X" ||
                        policy.automaticStatus === "PAGO X"
                          ? "Bloqueado por regla PAGO X"
                          : policy.lockedByMaxWindow
                            ? "Bloqueado por superar 14 dias sobre la fecha maxima"
                            : null;

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
                                value={statusSelectValue}
                                onChange={(event) =>
                                  updateRowField(
                                    row.localId,
                                    "status",
                                    event.target.value
                                  )
                                }
                                disabled={statusLocked}
                                className={[cellInputClass, appearance.input].join(
                                  " "
                                )}
                              >
                                <option value="AUTO">AUTO</option>
                                {canMoveToPago && (
                                  <option value="PAGO">PAGO</option>
                                )}
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
                              {statusLockMessage && (
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800/80">
                                  {statusLockMessage}
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
          </>
        )}
      </div>
    </div>
  );
}
