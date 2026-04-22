"use client";

import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";

type RowStatus = "MORA" | "PAGO" | "SIN DATOS";

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
    sinDatos: number;
  };
  rows: PayJoyRow[];
};

type MerchantSummary = {
  merchantName: string;
  records: number;
  activeCredits: number;
  overdueCredits: number;
  paidCredits: number;
  noDataCredits: number;
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
    return "SIN DATOS";
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
    default:
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
        summary.sinDatos += 1;
      }

      return summary;
    },
    {
      mora: 0,
      pago: 0,
      sinDatos: 0,
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
        noDataCredits: 0,
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
      existing.noDataCredits += 1;
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
  const [linksText, setLinksText] = useState("");
  const [data, setData] = useState<PayJoyResponse | null>(null);
  const [rows, setRows] = useState<EditablePayJoyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState("TODOS");
  const [merchantQuery, setMerchantQuery] = useState("");
  const deferredMerchantQuery = useDeferredValue(merchantQuery);
  const normalizedMerchantQuery = normalizeSearchText(deferredMerchantQuery);
  const hasSelectedMerchant = selectedMerchant !== "TODOS";
  const effectiveMerchantQuery = hasSelectedMerchant ? "" : normalizedMerchantQuery;

  const merchantSummaries = buildMerchantSummaries(rows);
  const filteredMerchantSummaries = merchantSummaries.filter((summary) =>
    matchesMerchantFilter(
      summary.merchantName,
      selectedMerchant,
      effectiveMerchantQuery
    )
  );
  const filteredRows = rows.filter((row) =>
    matchesMerchantFilter(
      row.merchantName,
      selectedMerchant,
      effectiveMerchantQuery
    )
  );
  const liveSummary = summarizeRows(rows);
  const visibleSummary = summarizeRows(filteredRows);
  const hasActiveFilter = hasSelectedMerchant || Boolean(normalizedMerchantQuery);
  const summaryCards = hasActiveFilter ? visibleSummary : liveSummary;
  const visibleSourceNames = Array.from(
    new Set(filteredRows.map((row) => row.corteName).filter(Boolean))
  );

  const processSources = async () => {
    if (!files.length && !linksText.trim()) {
      setMessage("Debes subir archivos o pegar links de transacciones.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const formData = new FormData();

      files.forEach((file) => {
        formData.append("files", file);
      });

      formData.append("linksText", linksText);

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
    setMerchantQuery("");
  };

  const handleMerchantSelection = (value: string) => {
    setSelectedMerchant(value);
    setMerchantQuery("");
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto w-full max-w-none">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
              PayJoy cartera
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
              Cartera PayJoy
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
              Mezcla de 5 a 7 cargas, valida la hoja Transacciones, agrega la
              columna CORTE y consolida sin repetir transacciones.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/payjoy"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Cartera PayJoy
            </Link>
            <Link
              href="/dashboard/payjoy/40-60"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              40/60
            </Link>
            <Link
              href="/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver
            </Link>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Archivos
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                Subir multiples transacciones
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Puedes subir varios archivos Excel, CSV o TXT. Cada archivo
                genera su nombre de CORTE a partir del nombre del archivo.
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
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Seleccionar archivos
                </button>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {files.length
                    ? `${files.length} archivo(s) listo(s)`
                    : "Sin archivos seleccionados"}
                </div>
              </div>

              {files.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <span
                      key={`${file.name}-${file.size}`}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {file.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Links
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                Pegar links de transacciones
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Pega un link por linea. Si quieres definir el corte manualmente,
                usa este formato:{" "}
                <span className="font-semibold">Corte abril | URL</span>
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                Si el link es de Google Sheets, el archivo debe ser publico o
                descargable sin iniciar sesion. Si no, subelo como archivo.
              </p>
              <textarea
                value={linksText}
                onChange={(event) => setLinksText(event.target.value)}
                placeholder={
                  "Corte 1 | https://docs.google.com/spreadsheets/d/.../edit\nhttps://docs.google.com/spreadsheets/d/.../edit"
                }
                className="mt-4 h-40 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-500"
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            Si subes Excel o Google Sheets, la hoja debe llamarse{" "}
            <span className="font-semibold">Transacciones</span> o contener
            esas columnas: transaction time, merchant name, device, device
            family, imei y national id. Si subes TXT, puede venir tabulado
            como exportacion de PayJoy. Fecha de pago = +14 dias calendario.
            Pago maximo = +18 dias calendario.
          </div>

          <div className="mt-6">
            <button
              onClick={() => void processSources()}
              disabled={loading}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {loading ? "Procesando..." : "Procesar cargas"}
            </button>
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
                  Sin datos: {summaryCards.sinDatos}
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
                              <option value="SIN DATOS">SIN DATOS</option>
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
