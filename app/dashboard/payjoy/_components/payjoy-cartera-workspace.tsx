"use client";

import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";

type RowStatus = "MORA" | "PAGO" | "PAGO X";

type PayJoyRow = {
  corteName: string;
  transactionTime: string | null;
  merchantName: string;
  device: string;
  deviceFamily: string;
  imei: string;
  nationalId: string;
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

function computeStatus(
  transactionTime: string | null,
  devicePaymentDate: string | null,
  paidInFull: boolean
): RowStatus {
  if (paidInFull) {
    return "PAGO";
  }

  const transactionDate = parseIsoDate(transactionTime);
  const deviceDate = parseIsoDate(devicePaymentDate);

  if (!transactionDate || !deviceDate) {
    return "PAGO X";
  }

  const expectedPaymentDate = addCalendarDays(transactionDate, 14);
  const pagoThresholdDate = addCalendarDays(expectedPaymentDate, 10);
  const expectedKey = getDateKeyInBogota(expectedPaymentDate);
  const deviceKey = getDateKeyInBogota(deviceDate);

  if (deviceKey === expectedKey) {
    return "MORA";
  }

  return deviceDate > pagoThresholdDate ? "PAGO" : "MORA";
}

function recalculateDerivedFields(row: EditablePayJoyRow) {
  const transactionDate = parseIsoDate(row.transactionTime);
  const paymentDueDate = transactionDate
    ? addCalendarDays(transactionDate, 14).toISOString()
    : null;
  const maximumPaymentDate = transactionDate
    ? addCalendarDays(transactionDate, 18).toISOString()
    : null;

  return {
    ...row,
    paymentDueDate,
    maximumPaymentDate,
    status:
      row.manualStatus ||
      computeStatus(row.transactionTime, row.devicePaymentDate, row.paidInFull),
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

function statusClass(status: RowStatus) {
  switch (status) {
    case "PAGO":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "MORA":
      return "border-red-200 bg-red-50 text-red-700";
    case "PAGO X":
      return "border-amber-200 bg-amber-50 text-amber-700";
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
      if (row.status === "MORA") {
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

    if (row.status === "MORA") {
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

function toDateInputValue(value: string | null) {
  const date = parseIsoDate(value);

  if (!date) {
    return "";
  }

  return getDateKeyInBogota(date);
}

function fromDateInputValue(value: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T00:00:00-05:00`).toISOString();
}

function toDateTimeInputValue(value: string | null) {
  const date = parseIsoDate(value);

  if (!date) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeInputValue(value: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}:00-05:00`).toISOString();
}

function buildEditableRows(rows: PayJoyRow[]) {
  return rows.map((row, index) =>
    recalculateDerivedFields({
      ...row,
      localId: buildLocalRowId(row, index),
      manualStatus: null,
    })
  );
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
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white";

const cellReadonlyClass =
  "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700";

const tableColCorteClass = "w-[190px] min-w-[190px] px-4 py-4";
const tableColTransactionClass = "w-[270px] min-w-[270px] px-4 py-4";
const tableColMerchantClass = "w-[300px] min-w-[300px] px-4 py-4";
const tableColDeviceClass = "w-[170px] min-w-[170px] px-4 py-4";
const tableColDeviceFamilyClass = "w-[240px] min-w-[240px] px-4 py-4";
const tableColImeiClass = "w-[210px] min-w-[210px] px-4 py-4";
const tableColNationalIdClass = "w-[190px] min-w-[190px] px-4 py-4";
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f3ec_0%,#eef3f8_100%)] px-4 py-8">
      <div className="mx-auto w-full max-w-none">
        <section className="relative overflow-hidden rounded-[34px] border border-[#20242c] bg-[linear-gradient(135deg,#0d1014_0%,#171c24_58%,#212938_100%)] px-6 py-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.18)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(197,154,87,0.25),transparent_22%),radial-gradient(circle_at_left_center,rgba(255,255,255,0.08),transparent_24%)]" />
          <div className="pointer-events-none absolute -right-10 top-8 hidden h-44 w-44 rounded-full border border-white/10 lg:block" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f1d19c]">
                  PayJoy cartera
                </div>
                <div className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                  Solo admin
                </div>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Cartera PayJoy
              </h1>
              <div className="mt-4 h-[3px] w-18 rounded-full bg-[#c79a57]" />
              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Consolida cortes de transacciones, elimina duplicados y calcula
                el estado de cartera por merchant desde un panel reservado para
                administracion.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Cargas listas
                  </p>
                  <p className="mt-2 text-3xl font-black text-white">
                    {totalSelectedFiles}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Formatos
                  </p>
                  <p className="mt-2 text-lg font-black text-white">
                    XLSX, CSV, TXT
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Flujo
                  </p>
                  <p className="mt-2 text-lg font-black text-white">
                    Solo por archivo
                  </p>
                </div>
              </div>
            </div>

            <div className="relative flex flex-wrap gap-3">
              <Link
                href="/dashboard/payjoy"
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-slate-100"
              >
                Cartera PayJoy
              </Link>
              <Link
                href="/dashboard/payjoy/40-60"
                className="rounded-2xl border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                40/60
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/12 bg-transparent px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/8"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {message && (
          <div className="mb-6 mt-6 rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <section className="mt-6 rounded-[30px] border border-[#e3d9c8] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f2_100%)] p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-[28px] border border-dashed border-[#d8cbb5] bg-[linear-gradient(180deg,#fdfbf6_0%,#f7f1e7_100%)] p-6">
              <div className="inline-flex rounded-full border border-[#dfcfb3] bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f5b24]">
                Cargue de archivos
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Subir multiples transacciones
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Carga archivos Excel, CSV o TXT exportados desde PayJoy. Cada
                archivo genera su nombre de corte a partir del nombre del
                archivo y el modulo consolida la cartera sin repetir
                transacciones.
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
                <div className="rounded-2xl border border-[#e2d8c7] bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700">
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

            <div className="rounded-[28px] border border-[#e6dece] bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Reglas del modulo
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Hoja o contenido valido
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    El archivo debe traer la hoja <span className="font-semibold">Transacciones</span> o una tabla con columnas validas.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Campos base
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    transaction time, merchant name, device, device family,
                    imei y national id.
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Calculo automatico
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    Fecha de pago = +14 dias calendario. Pago maximo = +18 dias calendario. Si PayJoy indica que el equipo esta pagado por completo, se marca como <span className="font-semibold">PAGO</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {data && (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-5">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cargas
                </p>
                <p className="mt-3 text-3xl font-black text-slate-950">
                  {data.totalSources}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Filas brutas
                </p>
                <p className="mt-3 text-3xl font-black text-slate-950">
                  {data.rawRows}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Unicas
                </p>
                <p className="mt-3 text-3xl font-black text-slate-950">
                  {hasActiveFilter ? filteredRows.length : rows.length}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {hasActiveFilter ? "Filtradas" : "Sin duplicados"}
                </p>
              </div>

              <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
                  Mora
                </p>
                <p className="mt-3 text-3xl font-black text-red-700">
                  {summaryCards.mora}
                </p>
              </div>

              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Pago
                </p>
                <p className="mt-3 text-3xl font-black text-emerald-700">
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
                    Filtros y resumen
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                    Merchant name y mora por comercio
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-500">
                    Filtra por Merchant name, revisa cuantos registros tiene
                    cada comercio y edita la tabla para recalcular la mora en
                    vivo.
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
                  {(["TODOS", "PAGO", "MORA", "PAGO X"] as const).map(
                    (statusOption) => (
                      <button
                        key={statusOption}
                        onClick={() => setSelectedStatus(statusOption)}
                        className={[
                          "rounded-full border px-4 py-2 text-sm font-semibold transition",
                          selectedStatus === statusOption
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {statusOption}
                      </button>
                    )
                  )}
                </div>
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
                    Mora visible
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
                Resumen por merchant
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

            <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Cortes detectados
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(hasActiveFilter ? visibleSourceNames : data.sourceNames).map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Duplicados removidos: {data.duplicatesRemoved}
              </p>
            </section>

            <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Tabla editable
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                  Tabla de cartera PayJoy
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Puedes editar Merchant name, device, fecha del device, estado
                  y demas campos. El resumen por comercio se recalcula en vivo.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[2320px] divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className={tableColCorteClass}>CORTE</th>
                      <th className={tableColTransactionClass}>
                        Transaction time
                      </th>
                      <th className={tableColMerchantClass}>Merchant name</th>
                      <th className={tableColDeviceClass}>Device</th>
                      <th className={tableColDeviceFamilyClass}>
                        Device family
                      </th>
                      <th className={tableColImeiClass}>IMEI</th>
                      <th className={tableColNationalIdClass}>National ID</th>
                      <th className={tableColDateClass}>Fecha device</th>
                      <th className={tableColDateClass}>Fecha de pago</th>
                      <th className={tableColStatusClass}>Estado</th>
                      <th className={tableColDateClass}>Pago maximo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row) => (
                      <tr key={row.localId}>
                        <td className={tableColCorteClass}>
                          <input
                            value={row.corteName}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "corteName",
                                event.target.value
                              )
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className={tableColTransactionClass}>
                          <input
                            type="datetime-local"
                            value={toDateTimeInputValue(row.transactionTime)}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "transactionTime",
                                fromDateTimeInputValue(event.target.value) || ""
                              )
                            }
                            className={cellInputClass}
                          />
                          <div className="mt-2 text-xs text-slate-500">
                            {formatDateTime(row.transactionTime)}
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
                            className={cellInputClass}
                          />
                        </td>
                        <td className={tableColDeviceClass}>
                          <input
                            value={row.device}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "device",
                                event.target.value.toUpperCase()
                              )
                            }
                            className={cellInputClass}
                          />
                          {row.lookupMessage && (
                            <div className="mt-2 text-xs text-slate-500">
                              {row.lookupMessage}
                            </div>
                          )}
                        </td>
                        <td className={tableColDeviceFamilyClass}>
                          <input
                            value={row.deviceFamily}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "deviceFamily",
                                event.target.value
                              )
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className={tableColImeiClass}>
                          <input
                            value={row.imei}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "imei",
                                event.target.value
                              )
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className={tableColNationalIdClass}>
                          <input
                            value={row.nationalId}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "nationalId",
                                event.target.value
                              )
                            }
                            className={cellInputClass}
                          />
                        </td>
                        <td className={tableColDateClass}>
                          <input
                            type="date"
                            value={toDateInputValue(row.devicePaymentDate)}
                            onChange={(event) =>
                              updateRowField(
                                row.localId,
                                "devicePaymentDate",
                                fromDateInputValue(event.target.value) || ""
                              )
                            }
                            className={cellInputClass}
                          />
                          <div className="mt-2 text-xs text-slate-500">
                            {formatDate(row.devicePaymentDate)}
                          </div>
                        </td>
                        <td className={tableColDateClass}>
                          <div className={cellReadonlyClass}>
                            {formatDate(row.paymentDueDate)}
                          </div>
                        </td>
                        <td className={tableColStatusClass}>
                          <div className="flex flex-col gap-2">
                            <select
                              value={row.manualStatus || "AUTO"}
                              onChange={(event) =>
                                updateRowField(
                                  row.localId,
                                  "status",
                                  event.target.value
                                )
                              }
                              className={cellInputClass}
                            >
                              <option value="AUTO">AUTO</option>
                              <option value="PAGO">PAGO</option>
                              <option value="MORA">MORA</option>
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
                          </div>
                        </td>
                        <td className={tableColDateClass}>
                          <div className={cellReadonlyClass}>
                            {formatDate(row.maximumPaymentDate)}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!filteredRows.length && (
                      <tr>
                        <td
                          colSpan={11}
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
