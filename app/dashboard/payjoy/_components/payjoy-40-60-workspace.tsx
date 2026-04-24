"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type FortySixtyStatus = "40/60 APROBADO" | "40/60 NO APROBADO";

type FortySixtyRow = {
  id: string;
  week: string;
  merchantName: string;
  deviceTag: string;
  loanAgeDays: number | null;
  numberOfPayments: number | null;
  cedula: string;
  status: FortySixtyStatus;
  pay40At60: 0 | 1 | null;
  paidInFull: boolean;
};

type FortySixtySummary = {
  aprobados: number;
  noAprobados: number;
  cedulasEncontradas: number;
  cedulasPendientes: number;
};

type FortySixtyResponse = {
  ok: boolean;
  fileName: string;
  sheetName: string;
  week: string;
  totalRows: number;
  filteredRows: number;
  summary: FortySixtySummary;
  rows: FortySixtyRow[];
};

type FortySixtyWeeksResponse = {
  ok: boolean;
  fileName: string;
  sheetName: string;
  weeks: string[];
};

type FortySixtyStoredListItem = {
  id: number;
  recordName: string;
  week: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  filteredRows: number;
  summary: FortySixtySummary;
  savedById: number | null;
  savedByName: string;
  savedByUser: string;
  savedAt: string;
  updatedAt: string;
};

type FortySixtyStoredDetail = FortySixtyStoredListItem & {
  rows: FortySixtyRow[];
};

function formatNumber(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return Number(value).toLocaleString("es-CO");
}

function formatPercent(value: number) {
  return `${value.toLocaleString("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function statusRowClass(status: FortySixtyStatus) {
  return status === "40/60 APROBADO"
    ? "bg-emerald-50/80"
    : "bg-red-50/80";
}

function summarizeRows(rows: FortySixtyRow[]): FortySixtySummary {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "40/60 APROBADO") {
        summary.aprobados += 1;
      } else {
        summary.noAprobados += 1;
      }

      if (String(row.cedula || "").trim()) {
        summary.cedulasEncontradas += 1;
      } else {
        summary.cedulasPendientes += 1;
      }

      return summary;
    },
    {
      aprobados: 0,
      noAprobados: 0,
      cedulasEncontradas: 0,
      cedulasPendientes: 0,
    }
  );
}

function buildDefaultSaveName(week: string) {
  return `40/60 - ${String(week || "").trim() || "Semana"}`;
}

export default function PayJoyFortySixtyWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [week, setWeek] = useState("");
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<
    "TODOS" | FortySixtyStatus
  >("TODOS");
  const [loading, setLoading] = useState(false);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<FortySixtyResponse | null>(null);
  const [rows, setRows] = useState<FortySixtyRow[]>([]);
  const [saveName, setSaveName] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);
  const [updatingRecord, setUpdatingRecord] = useState(false);
  const [savedRecords, setSavedRecords] = useState<FortySixtyStoredListItem[]>([]);
  const [savedRecordsLoading, setSavedRecordsLoading] = useState(true);
  const [savedRecordsError, setSavedRecordsError] = useState("");
  const [savedRecordsExpanded, setSavedRecordsExpanded] = useState(false);
  const [consultingRecordId, setConsultingRecordId] = useState<number | null>(
    null
  );
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
  const [activeSavedRecordId, setActiveSavedRecordId] = useState<number | null>(
    null
  );

  const liveSummary = summarizeRows(rows);
  const visibleRows = rows.filter((row) =>
    selectedStatus === "TODOS" ? true : row.status === selectedStatus
  );
  const totalEvaluated = liveSummary.aprobados + liveSummary.noAprobados;
  const approvalRate =
    totalEvaluated > 0 ? (liveSummary.aprobados / totalEvaluated) * 100 : 0;
  const canSaveRecord = Boolean(data && rows.length);
  const savedRecordsCount = savedRecords.length;

  const updateCedula = (id: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, cedula: value } : row))
    );
  };

  const updateStatus = (id: string, value: FortySixtyStatus) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, status: value } : row))
    );
  };

  const buildCurrentRecordPayload = () => {
    if (!data || !rows.length) {
      return null;
    }

    return {
      recordName: saveName.trim() || buildDefaultSaveName(data.week),
      week: data.week,
      fileName: data.fileName,
      sheetName: data.sheetName,
      totalRows: data.totalRows,
      filteredRows: rows.length,
      summary: liveSummary,
      rows,
    };
  };

  const loadSavedRecords = async () => {
    try {
      setSavedRecordsLoading(true);
      setSavedRecordsError("");

      const response = await fetch("/api/payjoy/40-60/registros", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        registros?: FortySixtyStoredListItem[];
        error?: string;
      };

      if (!response.ok) {
        setSavedRecordsError(
          payload.error ||
            "No fue posible cargar el historial de semanas guardadas."
        );
        return;
      }

      const loadedRecords = Array.isArray(payload.registros) ? payload.registros : [];
      setSavedRecords(loadedRecords);

      if (!loadedRecords.length) {
        setSavedRecordsExpanded(false);
      }
    } catch {
      setSavedRecordsError(
        "No fue posible cargar el historial de semanas guardadas."
      );
    } finally {
      setSavedRecordsLoading(false);
    }
  };

  useEffect(() => {
    void loadSavedRecords();
  }, []);

  const applyStoredRecord = (record: FortySixtyStoredDetail) => {
    setData({
      ok: true,
      fileName: record.fileName,
      sheetName: record.sheetName,
      week: record.week,
      totalRows: record.totalRows,
      filteredRows: record.filteredRows,
      summary: record.summary,
      rows: record.rows,
    });
    setRows(record.rows);
    setSaveName(record.recordName);
    setActiveSavedRecordId(record.id);
    setWeek(record.week);
    setWeekOptions(record.week ? [record.week] : []);
    setSelectedStatus("TODOS");
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const loadWeeksFromFile = async (selectedFile: File) => {
    try {
      setLoadingWeeks(true);
      setMessage("");
      setWeek("");
      setWeekOptions([]);
      setData(null);
      setRows([]);
      setSaveName("");
      setActiveSavedRecordId(null);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/payjoy/40-60/weeks", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as FortySixtyWeeksResponse & {
        error?: string;
      };

      if (!response.ok) {
        setMessage(
          payload.error || "No fue posible leer las weeks del archivo 40/60."
        );
        return;
      }

      setWeekOptions(payload.weeks);
      setWeek(payload.weeks.length === 1 ? payload.weeks[0] : "");
      setMessage(
        payload.weeks.length
          ? `Se detectaron ${payload.weeks.length} week(s) en el archivo. Selecciona la que quieres consultar.`
          : "El archivo no trae weeks disponibles para consultar."
      );
    } catch {
      setMessage("No fue posible leer las weeks del archivo 40/60.");
    } finally {
      setLoadingWeeks(false);
    }
  };

  const handleFileChange = async (nextFile: File | null) => {
    setFile(nextFile);

    if (!nextFile) {
      setWeek("");
      setWeekOptions([]);
      setData(null);
      setRows([]);
      setSaveName("");
      setActiveSavedRecordId(null);
      return;
    }

    await loadWeeksFromFile(nextFile);
  };

  const processFile = async () => {
    if (!file) {
      setMessage("Debes subir un archivo Excel para procesar el 40/60.");
      return;
    }

    if (!String(week || "").trim()) {
      setMessage("Debes seleccionar la WEEK que quieres consultar.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("week", week);

      const response = await fetch("/api/payjoy/40-60", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as FortySixtyResponse & {
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error || "No fue posible procesar el archivo 40/60.");
        return;
      }

      setData(payload);
      setRows(payload.rows);
      setActiveSavedRecordId(null);
      setSaveName(buildDefaultSaveName(payload.week));
      setSelectedStatus("TODOS");
      setMessage(
        payload.rows.length
          ? `Se procesaron ${payload.filteredRows} registro(s) para la WEEK ${payload.week}.`
          : `No se encontraron registros para la WEEK ${payload.week}.`
      );
    } catch {
      setMessage("No fue posible procesar el archivo 40/60.");
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentRecord = async () => {
    const currentPayload = buildCurrentRecordPayload();

    if (!currentPayload) {
      setMessage("Primero debes procesar una semana antes de guardarla.");
      return;
    }

    try {
      setSavingRecord(true);
      setMessage("");

      const response = await fetch("/api/payjoy/40-60/registros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentPayload),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        registro?: FortySixtyStoredListItem;
        mensaje?: string;
        error?: string;
      };

      if (!response.ok || !payload.registro) {
        setMessage(payload.error || "No fue posible guardar la semana.");
        return;
      }

      setSaveName(payload.registro.recordName);
      setActiveSavedRecordId(payload.registro.id);
      setSavedRecordsExpanded(true);
      setMessage(
        payload.mensaje ||
          `Semana guardada correctamente como "${payload.registro.recordName}".`
      );
      await loadSavedRecords();
    } catch {
      setMessage("No fue posible guardar la semana.");
    } finally {
      setSavingRecord(false);
    }
  };

  const updateCurrentStoredRecord = async (recordId: number) => {
    const currentPayload = buildCurrentRecordPayload();

    if (!currentPayload) {
      setMessage("Primero debes procesar o consultar una semana antes de actualizarla.");
      return;
    }

    try {
      setUpdatingRecord(true);
      setMessage("");

      const response = await fetch("/api/payjoy/40-60/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: recordId,
          ...currentPayload,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        registro?: FortySixtyStoredListItem;
        mensaje?: string;
        error?: string;
      };

      if (!response.ok || !payload.registro) {
        setMessage(
          payload.error || "No fue posible actualizar la semana guardada."
        );
        return;
      }

      setSaveName(payload.registro.recordName);
      setActiveSavedRecordId(payload.registro.id);
      setSavedRecordsExpanded(true);
      setMessage(
        payload.mensaje ||
          `Semana actualizada correctamente como "${payload.registro.recordName}".`
      );
      await loadSavedRecords();
    } catch {
      setMessage("No fue posible actualizar la semana guardada.");
    } finally {
      setUpdatingRecord(false);
    }
  };

  const loadStoredRecord = async (recordId: number) => {
    try {
      setConsultingRecordId(recordId);
      setMessage("");

      const response = await fetch(`/api/payjoy/40-60/registros?id=${recordId}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        registro?: FortySixtyStoredDetail;
        error?: string;
      };

      if (!response.ok || !payload.registro) {
        setMessage(
          payload.error || "No fue posible consultar la semana guardada."
        );
        return;
      }

      applyStoredRecord(payload.registro);
      setSavedRecordsExpanded(true);
      setMessage(
        `Consultando la semana guardada "${payload.registro.recordName}" con ${payload.registro.filteredRows} registro(s).`
      );
    } catch {
      setMessage("No fue posible consultar la semana guardada.");
    } finally {
      setConsultingRecordId(null);
    }
  };

  const deleteStoredRecord = async (recordId: number, recordName: string) => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Vas a eliminar la semana guardada "${recordName}". Esta accion no se puede deshacer.`
          );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingRecordId(recordId);
      setMessage("");

      const response = await fetch(`/api/payjoy/40-60/registros?id=${recordId}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        mensaje?: string;
        error?: string;
      };

      if (!response.ok) {
        setMessage(
          payload.error || "No fue posible eliminar la semana guardada."
        );
        return;
      }

      if (activeSavedRecordId === recordId) {
        setActiveSavedRecordId(null);
      }

      setMessage(payload.mensaje || "Semana guardada eliminada correctamente.");
      await loadSavedRecords();
    } catch {
      setMessage("No fue posible eliminar la semana guardada.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f4ef] px-4 py-6 md:px-6">
      <div className="mx-auto max-w-[1680px]">
        <section className="overflow-hidden rounded-[34px] border border-[#e5dccd] bg-[linear-gradient(135deg,#17191d_0%,#20242c_55%,#2b313b_100%)] p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#b98746]/40 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3d7a8]">
                  PayJoy 40/60
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Solo admin
                </span>
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                40/60
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/85 md:text-base">
                Carga el Excel, selecciona la WEEK exactamente como viene en el
                archivo y el modulo cruza el DEVICE_TAG contra Cartera PayJoy
                para autollenar la cedula cuando exista coincidencia.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/payjoy"
                className="rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-slate-100"
              >
                Cartera PayJoy
              </Link>
              <Link
                href="/dashboard/payjoy/40-60"
                className="rounded-2xl border border-[#b98746]/40 bg-[#b98746] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a9793c]"
              >
                40/60
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-5 rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[30px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffdf9_0%,#fbf6ee_100%)] p-6 shadow-sm">
            <div className="inline-flex rounded-full border border-[#eadbc2] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b26b19]">
              Cargue
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              Consultar semana 40/60
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              El archivo debe traer como minimo: <span className="font-semibold">WEEK</span>,{" "}
              <span className="font-semibold">MERCHANTNAME</span>,{" "}
              <span className="font-semibold">DEVICE_TAG</span>,{" "}
              <span className="font-semibold">LOAN_AGE_DAYS</span>,{" "}
              <span className="font-semibold">NUMBER_OF_PAYMENTS</span> y{" "}
              <span className="font-semibold">PAY_40_AT_60</span>.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_260px_auto] lg:items-end">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Archivo Excel
                </label>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border border-slate-950 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Seleccionar archivo
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    {file
                      ? loadingWeeks
                        ? `Leyendo weeks de ${file.name}...`
                        : file.name
                      : "Aun no has seleccionado archivo"}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) =>
                    void handleFileChange(
                      event.target.files?.[0] ? event.target.files[0] : null
                    )
                  }
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Buscar week
                </label>
                <select
                  value={week}
                  onChange={(event) => setWeek(event.target.value)}
                  disabled={!weekOptions.length || loadingWeeks}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">
                    {loadingWeeks
                      ? "Leyendo weeks..."
                      : weekOptions.length
                        ? "Selecciona una week del archivo"
                        : "Primero sube el archivo"}
                  </option>
                  {weekOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => void processFile()}
                disabled={loading || loadingWeeks}
                className="rounded-2xl border border-[#b98746]/30 bg-[#b98746] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a9793c] disabled:opacity-70"
              >
                {loading ? "Procesando..." : loadingWeeks ? "Leyendo..." : "Procesar"}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Regla aplicada
            </div>
            <div className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
              <p>
                <span className="font-semibold text-slate-950">PAY_40_AT_60 = 1</span>{" "}
                marca <span className="font-semibold text-emerald-700">40/60 APROBADO</span>.
              </p>
              <p>
                <span className="font-semibold text-slate-950">PAY_40_AT_60 = 0</span>{" "}
                marca <span className="font-semibold text-red-700">40/60 NO APROBADO</span>.
              </p>
              <p>
                Si viene en blanco y <span className="font-semibold text-slate-950">LOAN_AGE_DAYS</span>{" "}
                es 60 o menos, se aprueba cuando{" "}
                <span className="font-semibold text-slate-950">NUMBER_OF_PAYMENTS</span>{" "}
                es 3 o mas.
              </p>
              <p>
                Si viene en blanco y el equipo ya no debe pagos en PayJoy, tambien
                queda <span className="font-semibold text-emerald-700">40/60 APROBADO</span>.
              </p>
            </div>
          </div>
        </section>

        {data && (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-5">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Week consultada
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">{data.week}</p>
              </div>
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Aprobados
                </p>
                <p className="mt-2 text-3xl font-black text-emerald-700">
                  {liveSummary.aprobados}
                </p>
              </div>
              <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
                  No aprobados
                </p>
                <p className="mt-2 text-3xl font-black text-red-700">
                  {liveSummary.noAprobados}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cedulas encontradas
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {liveSummary.cedulasEncontradas}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Pendientes: {liveSummary.cedulasPendientes}
                </p>
              </div>
              <div className="rounded-[24px] border border-[#d8b476] bg-[linear-gradient(180deg,#fff9ef_0%,#fff4de_100%)] p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f5b24]">
                  % 40/60
                </p>
                <p className="mt-2 text-3xl font-black text-[#8f5b24]">
                  {formatPercent(approvalRate)}
                </p>
                <p className="mt-2 text-sm text-[#8f5b24]/80">
                  {liveSummary.aprobados} de {totalEvaluated} aprobados
                </p>
              </div>
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Guardar semana
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                  Registro persistente
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Guarda la semana procesada y las cedulas editadas para volver a
                  consultarla despues desde este mismo modulo.
                </p>

                {canSaveRecord ? (
                  <>
                    <label className="mt-5 block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">
                        Nombre del registro
                      </span>
                      <input
                        value={saveName}
                        onChange={(event) => setSaveName(event.target.value)}
                        placeholder="Ej: 40/60 - Week 02"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#c79a57] focus:ring-2 focus:ring-[#f4dfbc]"
                      />
                    </label>

                    <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Semana activa
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {data.week}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {data.fileName}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => void saveCurrentRecord()}
                        disabled={savingRecord}
                        className="rounded-2xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b1f27] disabled:opacity-70"
                      >
                        {savingRecord ? "Guardando..." : "Guardar semana"}
                      </button>
                      {activeSavedRecordId && (
                        <button
                          onClick={() =>
                            void updateCurrentStoredRecord(activeSavedRecordId)
                          }
                          disabled={updatingRecord}
                          className="rounded-2xl border border-[#d8b476] bg-[#fff9ef] px-5 py-3 text-sm font-semibold text-[#8f5b24] transition hover:bg-[#fff2db] disabled:opacity-70"
                        >
                          {updatingRecord
                            ? "Actualizando..."
                            : "Actualizar guardado"}
                        </button>
                      )}
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {rows.length} fila(s) listas para guardar
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                    Procesa una semana primero y luego podras guardarla en el
                    historial.
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Historial de semanas
                    </div>
                    <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                      Semanas guardadas
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      Mantenlo oculto mientras trabajas la semana actual y abrelo
                      solo cuando necesites consultar, actualizar o borrar una
                      guardada.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {savedRecordsCount} registro(s)
                    </div>
                    <button
                      onClick={() =>
                        setSavedRecordsExpanded((current) => !current)
                      }
                      disabled={!savedRecordsCount}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savedRecordsExpanded
                        ? "Ocultar guardados"
                        : "Visualizar guardados"}
                    </button>
                    <button
                      onClick={() => void loadSavedRecords()}
                      disabled={savedRecordsLoading}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
                    >
                      {savedRecordsLoading ? "Actualizando..." : "Actualizar"}
                    </button>
                  </div>
                </div>

                {savedRecordsError && (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {savedRecordsError}
                  </div>
                )}

                {savedRecordsLoading && !savedRecords.length ? (
                  <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    Cargando historial de semanas guardadas...
                  </div>
                ) : !savedRecords.length ? (
                  <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                    Aun no hay semanas guardadas. Cuando uses{" "}
                    <span className="font-semibold">Guardar semana</span>, te
                    quedaran listadas aqui para futuras consultas.
                  </div>
                ) : !savedRecordsExpanded ? (
                  <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          Historial oculto para mantener el panel liviano
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Tienes {savedRecordsCount} registro(s) guardado(s). Pulsa{" "}
                          <span className="font-semibold">
                            Visualizar guardados
                          </span>{" "}
                          cuando necesites consultarlos.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        Ultimo guardado:{" "}
                        <span className="font-semibold text-slate-950">
                          {savedRecords[0]?.recordName || "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                    {savedRecords.map((record) => {
                      const totalRecordEvaluated =
                        record.summary.aprobados + record.summary.noAprobados;
                      const recordRate =
                        totalRecordEvaluated > 0
                          ? (record.summary.aprobados / totalRecordEvaluated) * 100
                          : 0;

                      return (
                        <article
                          key={record.id}
                          className={[
                            "rounded-[24px] border px-4 py-4 transition",
                            activeSavedRecordId === record.id
                              ? "border-[#d8b476] bg-[#fff9ef] shadow-sm"
                              : "border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-black tracking-tight text-slate-950">
                                  {record.recordName}
                                </h3>
                                {activeSavedRecordId === record.id && (
                                  <span className="rounded-full border border-[#e1c38d] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f5b24]">
                                    En pantalla
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-sm text-slate-500">
                                Guardado el {formatDateTime(record.savedAt)} por{" "}
                                <span className="font-semibold text-slate-700">
                                  {record.savedByName || record.savedByUser || "Admin"}
                                </span>
                              </p>
                              {record.updatedAt !== record.savedAt && (
                                <p className="mt-1 text-sm text-slate-500">
                                  Actualizado el {formatDateTime(record.updatedAt)}
                                </p>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                                  {record.week}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                                  {record.fileName}
                                </span>
                              </div>
                            </div>

                            <div className="w-full xl:w-[320px]">
                              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Acciones de la semana
                                </p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  <button
                                    onClick={() => void loadStoredRecord(record.id)}
                                    disabled={consultingRecordId === record.id}
                                    className="rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
                                  >
                                    {consultingRecordId === record.id
                                      ? "Abriendo..."
                                      : "Consultar"}
                                  </button>
                                  {activeSavedRecordId === record.id && (
                                    <button
                                      onClick={() =>
                                        void updateCurrentStoredRecord(record.id)
                                      }
                                      disabled={updatingRecord}
                                      className="rounded-2xl border border-[#d8b476] bg-[#fff9ef] px-4 py-3 text-sm font-semibold text-[#8f5b24] transition hover:bg-[#fff2db] disabled:opacity-70"
                                    >
                                      {updatingRecord
                                        ? "Guardando..."
                                        : "Actualizar"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      void deleteStoredRecord(
                                        record.id,
                                        record.recordName
                                      )
                                    }
                                    disabled={deletingRecordId === record.id}
                                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-70"
                                  >
                                    {deletingRecordId === record.id
                                      ? "Eliminando..."
                                      : "Borrar"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Registros
                              </p>
                              <p className="mt-1 text-lg font-black text-slate-950">
                                {record.filteredRows}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Aprobados
                              </p>
                              <p className="mt-1 text-lg font-black text-emerald-700">
                                {record.summary.aprobados}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                No aprobados
                              </p>
                              <p className="mt-1 text-lg font-black text-red-700">
                                {record.summary.noAprobados}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                % 40/60
                              </p>
                              <p className="mt-1 text-lg font-black text-[#8f5b24]">
                                {formatPercent(recordRate)}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-[30px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Tabla 40/60
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                    Registros procesados
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    La cedula se autocompleta cuando el DEVICE_TAG existe en tus
                    cortes guardados de Cartera PayJoy.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Archivo:{" "}
                    <span className="font-semibold text-slate-950">{data.fileName}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Mostrando:{" "}
                    <span className="font-semibold text-slate-950">
                      {visibleRows.length}
                    </span>{" "}
                    de{" "}
                    <span className="font-semibold text-slate-950">
                      {rows.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-4">
                {[
                  { value: "TODOS" as const, label: "Todos" },
                  {
                    value: "40/60 APROBADO" as const,
                    label: "Aprobados",
                  },
                  {
                    value: "40/60 NO APROBADO" as const,
                    label: "No aprobados",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedStatus(option.value)}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      selectedStatus === option.value
                        ? option.value === "40/60 NO APROBADO"
                          ? "border border-red-200 bg-red-100 text-red-700"
                          : option.value === "40/60 APROBADO"
                            ? "border border-emerald-200 bg-emerald-100 text-emerald-700"
                            : "border border-slate-300 bg-slate-950 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1220px] w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-4">Week</th>
                      <th className="px-4 py-4">Merchant name</th>
                      <th className="px-4 py-4">Device tag</th>
                      <th className="px-4 py-4">Loan age days</th>
                      <th className="px-4 py-4">Number of payments</th>
                      <th className="px-4 py-4">Cedula</th>
                      <th className="px-4 py-4">40/60</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No se encontraron registros para este filtro.
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((row) => (
                        <tr
                          key={row.id}
                          className={[
                            "border-b border-slate-200 align-top transition",
                            statusRowClass(row.status),
                          ].join(" ")}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-slate-950">
                            {row.week || "-"}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-950">
                            {row.merchantName || "-"}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-950">
                            {row.deviceTag || "-"}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-700">
                            {formatNumber(row.loanAgeDays)}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-700">
                            {formatNumber(row.numberOfPayments)}
                          </td>
                          <td className="px-4 py-4">
                            <input
                              value={row.cedula}
                              onChange={(event) =>
                                updateCedula(row.id, event.target.value)
                              }
                              placeholder="Escribe la cedula"
                              className="w-[180px] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={row.status}
                              onChange={(event) =>
                                updateStatus(
                                  row.id,
                                  event.target.value as FortySixtyStatus
                                )
                              }
                              className={[
                                "rounded-2xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] outline-none transition focus:ring-2",
                                row.status === "40/60 APROBADO"
                                  ? "border-emerald-200 bg-emerald-100 text-emerald-700 focus:ring-emerald-200"
                                  : "border-red-200 bg-red-100 text-red-700 focus:ring-red-200",
                              ].join(" ")}
                            >
                              <option value="40/60 APROBADO">
                                40/60 APROBADO
                              </option>
                              <option value="40/60 NO APROBADO">
                                40/60 NO APROBADO
                              </option>
                            </select>
                          </td>
                        </tr>
                      ))
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
