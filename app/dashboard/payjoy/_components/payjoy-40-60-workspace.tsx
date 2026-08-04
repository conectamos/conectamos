"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";

type FortySixtyStatus = "40/60 APROBADO" | "40/60 NO APROBADO";

type FortySixtyRow = {
  id: string;
  week: string;
  merchantName: string;
  deviceTag: string;
  loanAgeDays: number | null;
  numberOfPayments: number | null;
  loanRepaymentBiweek: number | null;
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
    ? "bg-white hover:bg-emerald-50/40 [&>td:first-child]:shadow-[inset_4px_0_0_#10b981]"
    : "bg-white hover:bg-red-50/50 [&>td:first-child]:shadow-[inset_4px_0_0_#e30613]";
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

function buildProcessingSourceKey(selectedFile: File, selectedWeek: string) {
  return [
    selectedFile.name,
    selectedFile.size,
    selectedFile.lastModified,
    String(selectedWeek || "").trim().toUpperCase(),
  ].join("::");
}

export default function PayJoyFortySixtyWorkspace({
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
  const [processedSourceKey, setProcessedSourceKey] = useState<string | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(1);

  const liveSummary = summarizeRows(rows);
  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        selectedStatus === "TODOS" ? true : row.status === selectedStatus
      ),
    [rows, selectedStatus]
  );
  const totalEvaluated = liveSummary.aprobados + liveSummary.noAprobados;
  const approvalRate =
    totalEvaluated > 0 ? (liveSummary.aprobados / totalEvaluated) * 100 : 0;
  const canSaveRecord = Boolean(data && rows.length);
  const savedRecordsCount = savedRecords.length;
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const paginatedRows = visibleRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const inicialesUsuario = String(user.nombre || user.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
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

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, rows.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  const fetchProcessedWeek = async (
    selectedFile: File,
    selectedWeek: string
  ) => {
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("week", selectedWeek);

    const response = await fetch("/api/payjoy/40-60", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as FortySixtyResponse & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        payload.error || "No fue posible procesar el archivo 40/60."
      );
    }

    return payload;
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
    setCurrentPage(1);
    setProcessedSourceKey(null);
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const loadWeeksFromFile = async (selectedFile: File) => {
    try {
      setLoadingWeeks(true);
      setMessage("");
      setProcessedSourceKey(null);

      if (!activeSavedRecordId) {
        setWeek("");
        setWeekOptions([]);
        setData(null);
        setRows([]);
        setSaveName("");
      }

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
      const currentWeek = String(week || "").trim();
      const matchingWeek = payload.weeks.find(
        (option) => option.trim() === currentWeek
      );

      setWeek(
        matchingWeek || (payload.weeks.length === 1 ? payload.weeks[0] : "")
      );
      setMessage(
        payload.weeks.length
          ? activeSavedRecordId
            ? `Se detectaron ${payload.weeks.length} week(s) en el archivo. Selecciona la week y usa Actualizar guardado para recargar este registro con el archivo nuevo.`
            : `Se detectaron ${payload.weeks.length} week(s) en el archivo. Selecciona la que quieres consultar.`
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
      setProcessedSourceKey(null);

      if (activeSavedRecordId && data) {
        setWeek(data.week);
        setWeekOptions(data.week ? [data.week] : []);
      } else {
        setWeek("");
        setWeekOptions([]);
        setData(null);
        setRows([]);
        setSaveName("");
        setActiveSavedRecordId(null);
      }
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
      const payload = await fetchProcessedWeek(file, week);
      const nextSourceKey = buildProcessingSourceKey(file, week);
      const shouldKeepActiveRecord = Boolean(activeSavedRecordId);

      setData(payload);
      setRows(payload.rows);
      setProcessedSourceKey(nextSourceKey);
      setSelectedStatus("TODOS");
      setCurrentPage(1);

      if (shouldKeepActiveRecord) {
        setMessage(
          payload.rows.length
            ? `Se recargaron ${payload.filteredRows} registro(s) para la WEEK ${payload.week} desde el archivo nuevo. Ahora puedes usar Actualizar guardado.`
            : `No se encontraron registros para la WEEK ${payload.week} en el archivo nuevo.`
        );
      } else {
        setActiveSavedRecordId(null);
        setSaveName(buildDefaultSaveName(payload.week));
        setMessage(
          payload.rows.length
            ? `Se procesaron ${payload.filteredRows} registro(s) para la WEEK ${payload.week}.`
            : `No se encontraron registros para la WEEK ${payload.week}.`
        );
      }

    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible procesar el archivo 40/60."
      );
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
    try {
      setUpdatingRecord(true);
      setMessage("");

      let nextData = data;
      let nextRows = rows;

      if (file && !String(week || "").trim()) {
        setMessage(
          "Debes seleccionar la WEEK del archivo nuevo antes de actualizar este guardado."
        );
        return;
      }

      if (file && String(week || "").trim()) {
        const nextSourceKey = buildProcessingSourceKey(file, week);

        if (processedSourceKey !== nextSourceKey) {
          const refreshedPayload = await fetchProcessedWeek(file, week);
          nextData = refreshedPayload;
          nextRows = refreshedPayload.rows;

          setData(refreshedPayload);
          setRows(refreshedPayload.rows);
          setSelectedStatus("TODOS");
          setCurrentPage(1);
          setProcessedSourceKey(nextSourceKey);
        }
      }

      if (!nextData || !nextRows.length) {
        setMessage(
          "Primero debes procesar o consultar una semana antes de actualizarla."
        );
        return;
      }

      const currentPayload = {
        recordName: saveName.trim() || buildDefaultSaveName(nextData.week),
        week: nextData.week,
        fileName: nextData.fileName,
        sheetName: nextData.sheetName,
        totalRows: nextData.totalRows,
        filteredRows: nextRows.length,
        summary: summarizeRows(nextRows),
        rows: nextRows,
      };

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
        file && String(week || "").trim()
          ? `Semana actualizada correctamente como "${payload.registro.recordName}" usando el archivo nuevo.`
          : payload.mensaje ||
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
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950 [&_button]:uppercase">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel={user.sedeNombre || "Todas las sedes"}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/dashboard" className="transition hover:text-[#e30613]">
                  Inicio
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <Link href="/dashboard/payjoy" className="transition hover:text-[#e30613]">
                  Cartera PayJoy
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-[#e30613]">40/60</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Validación PayJoy 40/60
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Procesa una WEEK, cruza el DEVICE_TAG con la cartera PayJoy y revisa el resultado antes de guardarlo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Acceso: ADMIN / AUDITOR
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Formatos: XLSX, XLS y CSV
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/dashboard/payjoy"
                className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
              >
                Cartera PayJoy
              </Link>
              <div className="flex min-h-[52px] min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm sm:min-w-[205px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || <DashboardIcon name="user" className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {user.nombre || user.usuario}
                  </p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user.rolNombre}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] rounded-xl uppercase" />
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                icon: "document" as const,
                label: "Archivo seleccionado",
                value: file ? "1" : "0",
                detail: file ? file.name : "Selecciona el Excel que deseas validar.",
                tone: "bg-blue-50 text-blue-600",
              },
              {
                icon: "calendar" as const,
                label: "Weeks detectadas",
                value: loadingWeeks ? "..." : String(weekOptions.length),
                detail: week ? `Seleccionada: ${week}` : "Se habilitan al leer el archivo.",
                tone: "bg-violet-50 text-violet-600",
              },
              {
                icon: "sales" as const,
                label: "Filas procesadas",
                value: String(rows.length),
                detail: data ? `Hoja: ${data.sheetName}` : "Sin una WEEK procesada todavía.",
                tone: "bg-red-50 text-[#e30613]",
              },
              {
                icon: "catalog" as const,
                label: "Semanas guardadas",
                value: savedRecordsLoading ? "..." : String(savedRecordsCount),
                detail: "Historial disponible para consulta y actualización.",
                tone: "bg-slate-100 text-slate-700",
              },
            ].map((item) => (
              <article
                key={item.label}
                className="min-h-[132px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
              >
                <div className="flex items-start gap-4">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                    <DashboardIcon name={item.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-600">{item.label}</p>
                    <p className="mt-1 text-[27px] font-black leading-tight">{item.value}</p>
                    <p className="mt-2 line-clamp-2 break-all text-xs leading-5 text-slate-500">
                      {item.detail}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {message && (
            <div
              role="status"
              className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-700 shadow-sm"
            >
              <DashboardIcon name="document" className="mt-0.5 h-5 w-5 shrink-0 text-[#e30613]" />
              <span>{message}</span>
            </div>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                    <DashboardIcon name="document" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e30613]">
                      Proceso de validación
                    </p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight">
                      Consultar semana 40/60
                    </h2>
                  </div>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                  Selecciona el archivo, elige la WEEK detectada y procesa. El resultado no se guarda hasta que uses la acción de guardado.
                </p>

                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px_auto] lg:items-end">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      1. Archivo Excel
                    </label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      <DashboardIcon name="document" className="h-5 w-5 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate normal-case">
                        {file
                          ? loadingWeeks
                            ? `Leyendo WEEKs de ${file.name}...`
                            : file.name
                          : "Seleccionar archivo"}
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(event) =>
                        void handleFileChange(event.target.files?.[0] || null)
                      }
                    />
                  </div>

                  <label>
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      2. WEEK
                    </span>
                    <select
                      value={week}
                      onChange={(event) => setWeek(event.target.value)}
                      disabled={!weekOptions.length || loadingWeeks}
                      className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">
                        {loadingWeeks
                          ? "Leyendo WEEKs..."
                          : weekOptions.length
                            ? "Selecciona una WEEK"
                            : "Primero carga el archivo"}
                      </option>
                      {weekOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => void processFile()}
                    disabled={loading || loadingWeeks || !file || !week}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-xs font-black tracking-[0.06em] text-white transition hover:bg-[#c90511] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <DashboardIcon name="search" className="h-4 w-4" />
                    {loading ? "Procesando..." : loadingWeeks ? "Leyendo..." : "Procesar"}
                  </button>
                </div>
              </div>

              <aside className="border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6 xl:border-l xl:border-t-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Requisitos y reglas
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  El archivo debe incluir WEEK, DEVICE_TAG y los campos de comportamiento del crédito.
                </p>
                <details className="group mt-4 rounded-xl border border-slate-200 bg-white">
                  <summary className="flex min-h-[46px] cursor-pointer list-none items-center justify-between px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 [&::-webkit-details-marker]:hidden">
                    Ver regla aplicada
                    <DashboardIcon name="arrow" className="h-4 w-4 rotate-90 transition group-open:-rotate-90" />
                  </summary>
                  <div className="space-y-3 border-t border-slate-200 px-4 py-4 text-xs leading-5 text-slate-600">
                    <p><strong className="text-slate-900">PAY_40_AT_60 = 1:</strong> aprobado.</p>
                    <p><strong className="text-slate-900">PAY_40_AT_60 = 0:</strong> no aprobado.</p>
                    <p>Con el indicador vacío y LOAN_AGE_DAYS de 60 o menos, se aprueba con 3 o más pagos.</p>
                    <p>En ese mismo rango, también se aprueba cuando el equipo ya quedó pagado en PayJoy.</p>
                  </div>
                </details>
              </aside>
            </div>
          </section>

          {!data && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Historial disponible
                  </p>
                  <h2 className="mt-1 text-xl font-black">Semanas guardadas</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Puedes abrir una semana anterior sin cargar un archivo nuevo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSavedRecords()}
                  disabled={savedRecordsLoading}
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {savedRecordsLoading ? "Actualizando..." : "Actualizar historial"}
                </button>
              </div>

              {savedRecordsError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {savedRecordsError}
                </div>
              ) : savedRecordsLoading ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Cargando semanas guardadas...
                </div>
              ) : savedRecords.length ? (
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {savedRecords.slice(0, 6).map((record) => (
                    <article key={record.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-900">{record.recordName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.week} · {record.filteredRows} registros · {formatDateTime(record.updatedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void loadStoredRecord(record.id)}
                          disabled={consultingRecordId === record.id}
                          className="min-h-[40px] rounded-lg bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {consultingRecordId === record.id ? "Abriendo..." : "Consultar"}
                        </button>
                        {puedeEliminar && (
                          <button
                            type="button"
                            onClick={() => void deleteStoredRecord(record.id, record.recordName)}
                            disabled={deletingRecordId === record.id}
                            className="min-h-[40px] rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingRecordId === record.id ? "..." : "Borrar"}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Aún no hay semanas guardadas. Procesa una WEEK para crear el primer registro.
                </div>
              )}
            </section>
          )}

          {data && (
            <>
              <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    icon: "calendar" as const,
                    label: "WEEK consultada",
                    value: data.week,
                    detail: `${rows.length} filas procesadas`,
                    card: "border-slate-200 bg-white",
                    iconTone: "bg-slate-100 text-slate-700",
                    valueTone: "text-slate-950",
                  },
                  {
                    icon: "approvals" as const,
                    label: "Aprobados",
                    value: String(liveSummary.aprobados),
                    detail: "Cumplen la validación 40/60",
                    card: "border-emerald-200 bg-emerald-50/60",
                    iconTone: "bg-emerald-100 text-emerald-700",
                    valueTone: "text-emerald-700",
                  },
                  {
                    icon: "warning" as const,
                    label: "No aprobados",
                    value: String(liveSummary.noAprobados),
                    detail: "Requieren revisión operativa",
                    card: "border-red-200 bg-red-50/60",
                    iconTone: "bg-red-100 text-red-700",
                    valueTone: "text-red-700",
                  },
                  {
                    icon: "user" as const,
                    label: "Cédulas encontradas",
                    value: String(liveSummary.cedulasEncontradas),
                    detail: `${liveSummary.cedulasPendientes} pendientes`,
                    card: "border-slate-200 bg-white",
                    iconTone: "bg-blue-50 text-blue-600",
                    valueTone: "text-slate-950",
                  },
                  {
                    icon: "trend" as const,
                    label: "Tasa 40/60",
                    value: formatPercent(approvalRate),
                    detail: `${liveSummary.aprobados} de ${totalEvaluated} aprobados`,
                    card: "border-slate-200 bg-white",
                    iconTone: "bg-violet-50 text-violet-600",
                    valueTone: "text-slate-950",
                  },
                ].map((item) => (
                  <article
                    key={item.label}
                    className={`min-h-[138px] rounded-2xl border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)] ${item.card}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconTone}`}>
                        <DashboardIcon name={item.icon} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-600">{item.label}</p>
                        <p className={`mt-1 break-words text-[26px] font-black leading-tight ${item.valueTone}`}>
                          {item.value}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </section>

              <section className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
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
                {activeSavedRecordId && file && String(week || "").trim() && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    Al usar <span className="font-semibold">Actualizar guardado</span>,
                    primero recargaremos la informacion con el archivo nuevo y
                    luego sobrescribiremos la semana guardada.
                  </div>
                )}

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
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                      />
                    </label>

                    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
                        className="min-h-[46px] rounded-xl bg-[#e30613] px-5 py-3 text-xs font-black text-white shadow-sm transition hover:bg-[#c90511] disabled:opacity-70"
                      >
                        {savingRecord ? "Guardando..." : "Guardar semana"}
                      </button>
                      {activeSavedRecordId && (
                        <button
                          onClick={() =>
                            void updateCurrentStoredRecord(activeSavedRecordId)
                          }
                          disabled={updatingRecord}
                          className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
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
                  <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                    Procesa una semana primero y luego podras guardarla en el
                    historial.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
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
                  <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    Cargando historial de semanas guardadas...
                  </div>
                ) : !savedRecords.length ? (
                  <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                    Aun no hay semanas guardadas. Cuando uses{" "}
                    <span className="font-semibold">Guardar semana</span>, te
                    quedaran listadas aqui para futuras consultas.
                  </div>
                ) : !savedRecordsExpanded ? (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
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
                            "rounded-xl border px-4 py-4 transition",
                            activeSavedRecordId === record.id
                              ? "border-red-200 bg-red-50/50 shadow-sm"
                              : "border-slate-200 bg-white",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-black tracking-tight text-slate-950">
                                  {record.recordName}
                                </h3>
                                {activeSavedRecordId === record.id && (
                                  <span className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e30613]">
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
                                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
                                    >
                                      {updatingRecord
                                        ? "Guardando..."
                                        : "Actualizar"}
                                    </button>
                                  )}
                                  {puedeEliminar && (
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
                                  )}
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
                              <p className="mt-1 text-lg font-black text-slate-950">
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

            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
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
                <table className="w-full min-w-[1220px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-4">WEEK</th>
                      <th className="px-4 py-4">Comercio</th>
                      <th className="px-4 py-4">DEVICE TAG</th>
                      <th className="px-4 py-4">Edad del crédito</th>
                      <th className="px-4 py-4">Pagos</th>
                      <th className="px-4 py-4">Cuota quincenal</th>
                      <th className="px-4 py-4">Cédula</th>
                      <th className="px-4 py-4">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No se encontraron registros para este filtro.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row) => (
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
                          <td className="px-4 py-4 text-sm font-medium text-slate-700">
                            {formatNumber(row.loanRepaymentBiweek)}
                          </td>
                          <td className="px-4 py-4">
                            <input
                              value={row.cedula}
                              onChange={(event) =>
                                updateCedula(row.id, event.target.value)
                              }
                              placeholder="Escribe la cédula"
                              className="w-[170px] rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
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
                                "rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] outline-none transition focus:ring-2",
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

              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Mostrando {visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visibleRows.length)} de {visibleRows.length} registros
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="min-w-[92px] text-center text-xs font-bold text-slate-600">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
        </main>
      </div>
    </div>
  );
}
