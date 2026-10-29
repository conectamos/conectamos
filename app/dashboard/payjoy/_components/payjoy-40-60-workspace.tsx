"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { FortySixtyAutosave, normalizeFortySixtyPayload, type FortySixtyAutosaveState, type FortySixtyPayload, type FortySixtyRecord, type StorageLike } from "@/lib/payjoy-40-60-autosave";
import { colombiaCalendarDate, calendarDayNumber, effectiveLoanAge } from "@/lib/payjoy-40-60-age";
import styles from "../payjoy-40-60.module.css";

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
  ageReferenceDate: string | null;
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
  revision: number;
  ageReferenceDate: string | null;
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


function formatWeekLabel(value: string) {
  const text = String(value || "").trim();
  // WEEK is a calendar label, not a timestamp. Keep its date when displaying it.
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text) && !/^[A-Za-z]{3} [A-Za-z]{3} \d/.test(text)) return text || "—";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" }).format(parsed);
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

function normalizeWeekKey(value: string) {
  const text = value.trim();
  const calendarDate = text.match(/^\d{4}-\d{2}-\d{2}(?=$|[T\s])/);
  return calendarDate ? calendarDate[0] : text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^WEEK\s*/g, "").replace(/[^A-Z0-9]+/g, "");
}

export default function PayJoyFortySixtyWorkspace({
  puedeEliminar,
  user,
}: {
  puedeEliminar: boolean;
  user: {
    id: number;
    perfilId: number | null;
    nombre: string;
    usuario: string;
    rolNombre: string;
    sedeNombre: string;
  };
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceDateInputRef = useRef<HTMLInputElement | null>(null);
  const operationRef = useRef(false);
  const historyRequestRef = useRef(0);
  const autosaveRef = useRef<FortySixtyAutosave | null>(null);
  const workingRef = useRef<FortySixtyPayload | null>(null);
  const [rulesExpanded, setRulesExpanded] = useState(false);
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
  const [autosave, setAutosave] = useState<FortySixtyAutosaveState>({ phase: "idle", dirty: false, backedUp: false, backupError: false, error: "", recordId: null, revision: null, savedAt: null });
  const [today, setToday] = useState(() => colombiaCalendarDate());
  const [pendingReferenceDate, setPendingReferenceDate] = useState("");
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
  const hasUnsavedChanges = autosave.dirty;
  const savingRecord = autosave.phase === "saving";
  const hasPendingFile = Boolean(file && processedSourceKey !== buildProcessingSourceKey(file, week));
  const savedRecordsCount = savedRecords.length;
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const paginatedRows = visibleRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
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
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const refreshDate = () => setToday(colombiaCalendarDate());
    const timer = window.setInterval(refreshDate, 60000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshDate); document.removeEventListener("visibilitychange", refreshDate); };
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const editCurrent = (changes: Partial<FortySixtyPayload>) => {
    if (!workingRef.current) return;
    const payload = normalizeFortySixtyPayload({ ...workingRef.current, ...changes });
    if (!payload) return;
    workingRef.current = payload;
    if (changes.rows) setRows(payload.rows);
    if (changes.recordName !== undefined) setSaveName(changes.recordName);
    if (changes.ageReferenceDate !== undefined) {
      setData(current => current ? { ...current, ageReferenceDate: payload.ageReferenceDate } : current);
      setPendingReferenceDate(payload.ageReferenceDate || "");
    }
    autosaveRef.current?.edit(payload);
  };
  const updateCedula = (id: string, value: string) => editCurrent({ rows: (workingRef.current?.rows || rows).map(row => row.id === id ? { ...row, cedula: value } : row) });
  const updateStatus = (id: string, value: FortySixtyStatus) => editCurrent({ rows: (workingRef.current?.rows || rows).map(row => row.id === id ? { ...row, status: value } : row) });
  const updateReferenceDate = (value: string) => {
    if (!value || calendarDayNumber(value) === null || value > today) { setMessage("Selecciona una fecha del archivo válida, igual o anterior a hoy."); return; }
    const previous = workingRef.current?.ageReferenceDate;
    if (previous === value) return;
    if (previous && previous !== value && !window.confirm("Cambiar la fecha del archivo ajustará la edad mostrada de todos los créditos. Los resultados manuales no cambiarán. ¿Deseas continuar?")) return;
    editCurrent({ ageReferenceDate: value });
    setMessage("Fecha del archivo actualizada. La edad avanza por días calendario de Colombia; los resultados manuales se conservan.");
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
    const requestId = ++historyRequestRef.current;
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

      if (requestId !== historyRequestRef.current) return;

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
      if (requestId === historyRequestRef.current) setSavedRecordsError(
        "No fue posible cargar el historial de semanas guardadas."
      );
    } finally {
      if (requestId === historyRequestRef.current) setSavedRecordsLoading(false);
    }
  };

  useEffect(() => {
    void loadSavedRecords();
  }, []);

  const hydrateWorking = (payload: FortySixtyPayload, recordId: number | null, _revision: number | null, restored: boolean) => {
    workingRef.current = payload;
    setData({ ok: true, ...payload });
    setRows(payload.rows);
    setSaveName(payload.recordName);
    setPendingReferenceDate(payload.ageReferenceDate || "");
    setActiveSavedRecordId(recordId);
    setWeek(payload.week);
    setWeekOptions(payload.week ? [payload.week] : []);
    setSelectedStatus("TODOS");
    setCurrentPage(1);
    setProcessedSourceKey(null);
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (restored) setMessage("Se recuperó el avance de este perfil. Revisa el estado de guardado antes de continuar.");
  };

  useEffect(() => {
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || !["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase())) return;
    let storage: StorageLike | null = null; let session: StorageLike | null = null;
    try { storage = window.localStorage; } catch { /* The editor remains usable without a browser backup. */ }
    try { session = window.sessionStorage; } catch { /* Owner-scoped recovery still works through local storage. */ }
    const engine = new FortySixtyAutosave({ owner: `${user.id}:${user.perfilId ?? "usuario"}`, storage, session, request: (url, init) => fetch(url, init),
      onState: state => { setAutosave(state); setActiveSavedRecordId(state.recordId); },
      onHydrate: hydrateWorking,
      onSaved: record => { setSavedRecords(current => [record, ...current.filter(item => item.id !== record.id)]); setSavedRecordsExpanded(true); },
    });
    autosaveRef.current = engine;
    const reconnect = () => { if (engine.getPayload()) void engine.retry(); else void engine.restore(); };
    window.addEventListener("online", reconnect);
    void engine.restore();
    return () => { window.removeEventListener("online", reconnect); engine.dispose(); if (autosaveRef.current === engine) autosaveRef.current = null; };
    // Hydration uses stable React setters; the controller must survive table edits.
  }, [user.id, user.perfilId, user.rolNombre]);

  const applyStoredRecord = (record: FortySixtyStoredDetail) => autosaveRef.current?.open(record as FortySixtyRecord) === true;

  const loadWeeksFromFile = async (selectedFile: File) => {
    if (operationRef.current) return;
    operationRef.current = true;
    try {
      setLoadingWeeks(true);
      setMessage("");
      setProcessedSourceKey(null);

      setWeek("");
      setWeekOptions([]);

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
      const currentWeek = String(activeSavedRecordId && data ? data.week : week || "").trim();
      const matchingWeek = payload.weeks.find(
        (option) => normalizeWeekKey(option) === normalizeWeekKey(currentWeek)
      );

      setWeek(
        matchingWeek || (payload.weeks.length === 1 ? payload.weeks[0] : "")
      );
      setMessage(
        payload.weeks.length
          ? activeSavedRecordId
            ? `Se detectaron ${payload.weeks.length} WEEK(s). Selecciona la misma semana del corte abierto y pulsa Recargar. Guardar conserva el avance actual y no importa este archivo pendiente.`
            : `Se detectaron ${payload.weeks.length} week(s) en el archivo. Selecciona la que quieres consultar.`
          : "El archivo no trae weeks disponibles para consultar."
      );
    } catch {
      setMessage("No fue posible leer las weeks del archivo 40/60.");
    } finally {
      setLoadingWeeks(false);
      operationRef.current = false;
    }
  };

  const handleFileChange = async (nextFile: File | null) => {
    if (operationRef.current) return;
    setFile(nextFile);

    if (!nextFile) {
      setProcessedSourceKey(null);

      if (data) {
        setWeek(data.week);
        setWeekOptions(data.week ? [data.week] : []);
      } else {
        setWeek("");
        setWeekOptions([]);
      }
      return;
    }

    await loadWeeksFromFile(nextFile);
  };

  const processFile = async () => {
    if (operationRef.current || autosaveRef.current?.getState().phase === "saving") return;
    if (!file) {
      setMessage("Debes subir un archivo Excel para procesar el 40/60.");
      return;
    }

    if (!String(week || "").trim()) {
      setMessage("Debes seleccionar la WEEK que quieres consultar.");
      return;
    }

    if (activeSavedRecordId && data && normalizeWeekKey(week) !== normalizeWeekKey(data.week)) {
      setMessage(`Selecciona la misma WEEK del corte abierto (${formatWeekLabel(data.week)}) para recargarlo. Para otra semana, inicia un Nuevo corte.`);
      return;
    }

    if (hasUnsavedChanges && typeof window !== "undefined" && !window.confirm("Hay cambios pendientes. Recargar el archivo reemplazará las filas y ediciones en pantalla. Guarda primero si deseas conservarlas. ¿Deseas continuar?")) return;

    autosaveRef.current?.pause();
    operationRef.current = true;
    try {
      setLoading(true);
      setMessage("");
      const payload = await fetchProcessedWeek(file, week);
      if (!payload.rows.length) {
        setMessage("El archivo no contiene filas para la WEEK seleccionada. Se conservaron los datos en pantalla.");
        return;
      }
      if (activeSavedRecordId && data && (normalizeWeekKey(payload.week) !== normalizeWeekKey(data.week) || payload.rows.some(row => normalizeWeekKey(row.week) !== normalizeWeekKey(data.week)))) {
        setMessage(`La respuesta no corresponde a la WEEK del corte abierto (${formatWeekLabel(data.week)}). Se conservaron los datos en pantalla. Selecciona la misma semana para recargar.`);
        return;
      }
      const nextSourceKey = buildProcessingSourceKey(file, week);
      const shouldKeepActiveRecord = Boolean(activeSavedRecordId);
      const currentPayload = normalizeFortySixtyPayload({ ...payload, recordName: shouldKeepActiveRecord ? saveName : buildDefaultSaveName(payload.week) });
      if (!currentPayload || !autosaveRef.current?.import(currentPayload)) { setMessage("Espera a que finalice el guardado antes de recargar el archivo."); return; }
      workingRef.current = currentPayload;

      setData({ ...payload, ageReferenceDate: currentPayload.ageReferenceDate });
      setPendingReferenceDate(currentPayload.ageReferenceDate || "");
      setRows(payload.rows);
      setProcessedSourceKey(nextSourceKey);
      setSelectedStatus("TODOS");
      setCurrentPage(1);

      if (shouldKeepActiveRecord) {
        setMessage(
          payload.rows.length
            ? `Archivo recargado: ${payload.filteredRows} registro(s). Revisa los resultados. El avance se guardará al editar o pulsar Guardar; el estado del respaldo se muestra junto al registro.`
            : `No se encontraron registros para la WEEK ${payload.week} en el archivo nuevo.`
        );
      } else {
        setActiveSavedRecordId(null);
        setSaveName(buildDefaultSaveName(payload.week));
        setMessage(
          payload.rows.length
            ? `Se procesaron ${payload.filteredRows} registro(s) para la WEEK ${payload.week}. Revisa los resultados; se guardarán al editar o pulsar Guardar.`
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
      operationRef.current = false;
      autosaveRef.current?.resume();
    }
  };

  const reloadCurrentRecord = async () => {
    if (operationRef.current) return;
    if (!file) {
      setMessage("Selecciona el archivo nuevo y la misma WEEK del corte abierto. Después pulsa Recargar; el avance en pantalla se conserva hasta completar la recarga.");
      fileInputRef.current?.click();
      return;
    }
    await processFile();
  };

  const startNewRecord = () => {
    if (operationRef.current) return;
    if (hasUnsavedChanges && typeof window !== "undefined" && !window.confirm("Hay cambios pendientes. Iniciar un Nuevo corte descartará el avance que no has guardado. ¿Deseas continuar?")) return;
    if (!autosaveRef.current?.discard()) return;
    workingRef.current = null;
    setActiveSavedRecordId(null);
    setData(null);
    setRows([]);
    setSaveName("");
    setPendingReferenceDate("");
    setProcessedSourceKey(null);
    setSelectedStatus("TODOS");
    setCurrentPage(1);
    if (!file) { setWeek(""); setWeekOptions([]); }
    setMessage(file ? "Nuevo corte. Selecciona la WEEK del archivo y pulsa Procesar antes de guardar." : "Nuevo corte. Selecciona un archivo y su WEEK para comenzar.");
  };

  const saveCurrentRecord = async () => {
    if (operationRef.current) return;
    if (!workingRef.current || !autosaveRef.current) {
      setMessage("Primero debes procesar una semana antes de guardarla.");
      return;
    }
    setMessage(hasPendingFile ? "El archivo seleccionado sigue pendiente de recargar; Guardar conserva el avance actual." : "");
    await autosaveRef.current.flush();
  };

  const loadStoredRecord = async (recordId: number) => {
    if (operationRef.current || autosaveRef.current?.getState().phase === "saving") return;
    if (hasUnsavedChanges && typeof window !== "undefined" && !window.confirm("Hay cambios pendientes. Consultar esta semana descartará el avance que no has guardado. ¿Deseas continuar?")) return;
    autosaveRef.current?.pause();
    operationRef.current = true;
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

      if (!applyStoredRecord(payload.registro)) { setMessage("No se pudo abrir el corte. Espera a que termine el guardado y consulta nuevamente."); return; }
      setSavedRecordsExpanded(true);
      setMessage(
        `Consultando la semana guardada "${payload.registro.recordName}" con ${payload.registro.filteredRows} registro(s).`
      );
    } catch {
      setMessage("No fue posible consultar la semana guardada.");
    } finally {
      setConsultingRecordId(null);
      operationRef.current = false;
      autosaveRef.current?.resume();
    }
  };

  const deleteStoredRecord = async (recordId: number, recordName: string) => {
    if (!puedeEliminar || operationRef.current || autosaveRef.current?.getState().phase === "saving") return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Vas a eliminar la semana guardada "${recordName}". Esta accion no se puede deshacer.`
          );

    if (!confirmed) {
      return;
    }

    if (recordId === activeSavedRecordId) autosaveRef.current?.pause();
    operationRef.current = true;
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
        autosaveRef.current?.discard();
        workingRef.current = null;
        setData(null); setRows([]); setSaveName(""); setPendingReferenceDate("");
        setActiveSavedRecordId(null);
      }

      setMessage(payload.mensaje || "Semana guardada eliminada correctamente.");
      await loadSavedRecords();
    } catch {
      setMessage("No fue posible eliminar la semana guardada.");
    } finally {
      setDeletingRecordId(null);
      operationRef.current = false;
      autosaveRef.current?.resume();
    }
  };

  const editingBusy = loading || loadingWeeks || consultingRecordId !== null || deletingRecordId !== null || autosave.phase === "restoring";
  const workspaceBusy = editingBusy || savingRecord;
  const saveStateLabel = autosave.phase === "saving" ? "Guardando…" : autosave.phase === "offline" ? "Sin conexión…" : autosave.phase === "conflict" ? "Revisión necesaria" : autosave.phase === "error" ? "No se pudo guardar" : autosave.phase === "restoring" ? "Recuperando avance…" : hasUnsavedChanges ? "Cambios pendientes" : "Guardado";
  const latestSavedRecord = savedRecords[0];
  const currentStep = data && !file ? 3 : file && week ? 3 : file ? 2 : 1;
  const primaryNavigation = navigationItems.filter(item => !["/dashboard/aprobaciones", "/dashboard/sedes"].includes(item.href));
  const moreNavigation = navigationItems.filter(item => ["/dashboard/aprobaciones", "/dashboard/sedes"].includes(item.href));

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{primaryNavigation.map(item => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/caja" ? styles.activeNav : ""}`} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}<details className={styles.more}><summary>Más<DashboardIcon name="chevron" /></summary><div>{moreNavigation.map(item => <Link key={item.href} href={item.href}><DashboardIcon name={item.icon} />{item.label}</Link>)}</div></details></nav>
      <details className={styles.mobileMenu}><summary aria-label="Abrir menú de módulos"><DashboardIcon name="menu" /></summary><nav aria-label="Módulos autorizados">{navigationItems.map(item => <Link key={item.href} href={item.href} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</nav></details>
      <SalesProfile name={user.nombre || user.usuario} role={`${user.rolNombre} · ${user.sedeNombre || "Todas las sedes"}`} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard">Inicio</Link><DashboardIcon name="arrow" /><Link href="/dashboard/payjoy">Cartera PayJoy</Link><DashboardIcon name="arrow" /><span>40/60</span></nav><h1>Validación PayJoy 40/60</h1><p>Carga una semana, revisa los resultados y guarda la validación.</p></div><Link href="/dashboard/payjoy" className={styles.button}><DashboardIcon name="arrow" className={styles.backArrow} />Cartera PayJoy</Link></div>
      <section className={styles.metrics} aria-label="Indicadores PayJoy 40/60">{[
        {icon: "document" as const, value: file ? "1" : "0", label: "Archivo seleccionado"},
        {icon: "calendar" as const, value: loadingWeeks ? "…" : formatNumber(weekOptions.length), label: "WEEKs detectadas"},
        {icon: "sales" as const, value: formatNumber(rows.length), label: "Filas procesadas"},
        {icon: "catalog" as const, value: savedRecordsLoading ? "…" : savedRecordsError && !savedRecords.length ? "—" : formatNumber(savedRecordsCount), label: "Semanas guardadas"},
      ].map(metric => <article key={metric.label}><span className={styles.metricIcon}><DashboardIcon name={metric.icon} /></span><div><strong>{metric.value}</strong><p>{metric.label}</p></div></article>)}</section>
      {message && <div className={styles.message} role="status"><DashboardIcon name="document" /><span>{message}</span></div>}
      <section className={styles.panel} aria-labelledby="payjoy-upload-title" aria-busy={loading || loadingWeeks}>
        <header className={styles.panelHeading}><div className={styles.panelTitle}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><div><h2 id="payjoy-upload-title">Consultar semana 40/60</h2><p>Selecciona un archivo para iniciar la validación.</p></div></div><button type="button" className={styles.textButton} onClick={() => setRulesExpanded(value => !value)} aria-expanded={rulesExpanded} aria-controls="payjoy-rules"><DashboardIcon name="shield" />Ver reglas</button></header>
        <ol className={styles.steps} aria-label="Pasos de validación">{["Seleccionar archivo", "Elegir WEEK", "Procesar y revisar"].map((label,index) => <li key={label} className={currentStep === index+1 ? styles.stepActive : currentStep > index+1 ? styles.stepReady : ""} aria-current={currentStep === index+1 ? "step" : undefined}><span>{index+1}</span>{label}</li>)}</ol>
        <div className={styles.uploadArea}><div className={styles.uploadMessage}><span className={styles.uploadIcon}><DashboardIcon name="document-add" /></span><div><strong>{file ? file.name : "Selecciona tu archivo de PayJoy"}</strong><p>{file ? loadingWeeks ? "Leyendo las WEEKs del archivo…" : `${formatNumber(weekOptions.length)} WEEKs detectadas` : "Excel o CSV · XLSX, XLS y CSV"}</p></div></div><button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => fileInputRef.current?.click()} disabled={workspaceBusy}><DashboardIcon name="document-add" />{file ? "Cambiar archivo" : "Seleccionar archivo"}</button><input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className={styles.hiddenInput} aria-label="Archivo Excel o CSV de PayJoy" disabled={workspaceBusy} onChange={event => void handleFileChange(event.target.files?.[0] || null)} /></div>
        <div className={styles.processRow}><div className={styles.fileStatus}><DashboardIcon name="document" /><span>{file ? file.name : data ? `Semana consultada: ${formatWeekLabel(data.week)}` : "Ningún archivo seleccionado"}</span>{file && <button type="button" className={styles.removeFile} aria-label="Retirar archivo seleccionado" disabled={workspaceBusy} onClick={() => { if(fileInputRef.current) fileInputRef.current.value = ""; void handleFileChange(null); }}><DashboardIcon name="close" /></button>}</div><label className={styles.field}>Semana (WEEK)<select value={week} onChange={event => setWeek(event.target.value)} disabled={!weekOptions.length || workspaceBusy}><option value="">{loadingWeeks ? "Leyendo WEEKs…" : weekOptions.length ? "Selecciona una WEEK" : "Primero selecciona el archivo"}</option>{weekOptions.map(option => <option key={option} value={option}>{formatWeekLabel(option)}</option>)}</select></label><div className={styles.fileAction}><button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void (activeSavedRecordId ? reloadCurrentRecord() : processFile())} disabled={workspaceBusy || (!activeSavedRecordId && (!file || !week))}><DashboardIcon name={activeSavedRecordId ? "refresh" : "search"} />{loading ? activeSavedRecordId ? "Recargando…" : "Procesando…" : loadingWeeks ? "Leyendo…" : activeSavedRecordId ? "Recargar" : "Procesar"}</button>{activeSavedRecordId && <small>Si tienes un archivo nuevo</small>}</div></div>
        {rulesExpanded && <div id="payjoy-rules" className={styles.rules}><p><strong>Archivo:</strong> debe incluir WEEK, DEVICE_TAG y los campos de comportamiento del crédito.</p><p><strong>PAY_40_AT_60:</strong> 1 = aprobado; 0 = no aprobado.</p><p>Con el indicador vacío, la edad debe ser de 60 días o menos y cumplirse una de estas condiciones: al menos 3 pagos o crédito totalmente pagado verificado en PayJoy.</p><p>La cédula se cruza con la cartera guardada. Procesar no guarda la semana.</p><span>Acceso: ADMIN / AUDITOR</span></div>}
      </section>
      <section className={`${styles.panel} ${styles.savePanel}`} aria-labelledby="payjoy-save-title">
        <div className={styles.saveHeading}><div className={styles.panelTitle}><span className={styles.sectionIcon}><DashboardIcon name="database" /></span><div><h2 id="payjoy-save-title">Guardar semana</h2><p>{data ? `${formatNumber(rows.length)} filas listas para guardar · ${formatWeekLabel(data.week)}` : "Disponible después de procesar y revisar los resultados."}</p></div></div><div className={styles.saveToolbar}>{canSaveRecord && <span className={`${styles.progressState} ${hasUnsavedChanges ? styles.pendingState : styles.savedState}`} role="status"><DashboardIcon name={hasUnsavedChanges ? "clock" : "shield"} />{saveStateLabel}</span>}{data && <button type="button" className={styles.button} disabled={workspaceBusy} onClick={startNewRecord}>Nuevo corte</button>}{!canSaveRecord && <button type="button" className={styles.button} disabled><DashboardIcon name="database" />Guardar</button>}</div></div>
        {canSaveRecord && <div className={styles.saveBody}><label className={styles.field}>Nombre del registro<input value={saveName} onChange={event => editCurrent({ recordName: event.target.value })} placeholder="Ej.: 40/60 - Semana 02" disabled={editingBusy} /></label><div className={styles.saveActions}><div className={styles.fileAction}><button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void saveCurrentRecord()} disabled={workspaceBusy}><DashboardIcon name="database" />{savingRecord ? "Guardando…" : "Guardar"}</button><small>Avance del archivo actual</small></div></div><p className={styles.saveHelp}>{activeSavedRecordId ? "Guardar actualiza este mismo corte con todas las filas y ediciones en pantalla." : "Guardar crea un corte con todas las filas y ediciones en pantalla."} Al editar se guarda automáticamente. Guardar envía el avance de inmediato. Un archivo recién procesado o recargado espera tu revisión antes de editar o guardar.</p>{hasPendingFile && <p className={styles.warning}><DashboardIcon name="warning" /><span>Archivo pendiente: <strong>{file?.name}</strong>. Guardar conserva el avance en pantalla y no importa este archivo. Pulsa {activeSavedRecordId ? "Recargar" : "Procesar"} para revisarlo; esta acción reemplazará las filas en pantalla.</span></p>}</div>}
      </section>
      {canSaveRecord && <section className={`${styles.panel} ${styles.recoveryPanel}`} aria-label="Respaldo y fecha del archivo">
        <div className={styles.backupInfo}><DashboardIcon name={autosave.backupError ? "warning" : "database"} /><div><strong>{autosave.backupError ? "No se pudo crear respaldo en este equipo" : autosave.backedUp ? "Respaldo en este equipo" : autosave.dirty ? "Avance pendiente de guardar" : "Guardado en CONECTAMOS"}</strong><p>{autosave.backupError ? "El almacenamiento del navegador no está disponible. Mantén abierta esta página hasta que se confirme el guardado." : autosave.backedUp ? "Respaldo local de este perfil durante 7 días. Se elimina al confirmar el guardado." : autosave.savedAt ? `Último guardado: ${formatDateTime(autosave.savedAt)}` : "Al editar se guarda automáticamente; puedes usar Guardar en cualquier momento."}</p></div></div>
        <div className={styles.referenceDateField}><label className={styles.field}>Fecha del archivo<input ref={referenceDateInputRef} type="date" value={pendingReferenceDate} max={today} disabled={editingBusy} onChange={event => setPendingReferenceDate(event.target.value)} onBlur={event => setPendingReferenceDate(event.target.value)} aria-describedby="payjoy-age-help" /></label><button type="button" className={styles.button} disabled={editingBusy || pendingReferenceDate === (data?.ageReferenceDate || "")} onClick={() => updateReferenceDate(referenceDateInputRef.current?.value ?? pendingReferenceDate)}>Aplicar fecha</button></div>
        <p id="payjoy-age-help" className={styles.ageHelp}>{data?.ageReferenceDate ? `Edad calculada al ${formatWeekLabel(today)} con días calendario de Colombia. Guardar avances no cambia la fecha del archivo.` : "Este corte no tiene fecha base. Indica la fecha a la que correspondían las edades del archivo y pulsa Aplicar fecha para que avancen cada día."} Los resultados aprobados o no aprobados se conservan.</p>
        {autosave.error && <div className={styles.autosaveError} role="alert"><p>{autosave.error}</p>{autosave.phase === "conflict" && activeSavedRecordId ? <button type="button" className={styles.button} disabled={workspaceBusy} onClick={() => void loadStoredRecord(activeSavedRecordId)}>Cargar versión guardada</button> : <button type="button" className={styles.button} disabled={workspaceBusy} onClick={() => void autosaveRef.current?.retry()}>Reintentar guardado</button>}</div>}
      </section>}
      {!canSaveRecord && autosave.error && <div className={styles.message} role="alert"><DashboardIcon name="warning" /><span>{autosave.error}</span><button type="button" className={styles.button} onClick={() => void autosaveRef.current?.restore()}>Recuperar último corte</button></div>}
      <section className={styles.panel} aria-labelledby="payjoy-history-title" aria-busy={savedRecordsLoading}>
        <header className={`${styles.panelHeading} ${styles.historyHeading}`}><div className={styles.panelTitle}><span className={`${styles.sectionIcon} ${styles.mutedIcon}`}><DashboardIcon name="catalog" /></span><div><h2 id="payjoy-history-title">Semanas guardadas <span className={styles.count}>{savedRecordsLoading ? "…" : formatNumber(savedRecordsCount)}</span></h2><p>{latestSavedRecord ? <>Último guardado: <strong>{latestSavedRecord.recordName}</strong></> : savedRecordsLoading ? "Cargando historial…" : savedRecordsError ? "No fue posible cargar el historial." : "Aún no hay semanas guardadas."}</p></div></div><div className={styles.headerActions}><button type="button" className={styles.button} onClick={() => void loadSavedRecords()} disabled={savedRecordsLoading}><DashboardIcon name="refresh" />{savedRecordsLoading ? "Actualizando…" : "Actualizar"}</button><button type="button" className={`${styles.button} ${styles.graphite}`} onClick={() => setSavedRecordsExpanded(value => !value)} aria-expanded={savedRecordsExpanded} aria-controls="payjoy-saved-history" disabled={!savedRecordsCount}>{savedRecordsExpanded ? "Ocultar historial" : "Ver historial"}<DashboardIcon name="chevron" /></button></div></header>
        {savedRecordsError && <div className={styles.historyError} role="alert"><DashboardIcon name="warning" /><span>{savedRecordsError}</span><button type="button" onClick={() => void loadSavedRecords()} disabled={savedRecordsLoading}>Reintentar</button></div>}
        {savedRecordsExpanded && <div id="payjoy-saved-history" className={styles.historyContent}><div className={styles.tableScroll}><table className={styles.historyTable}><thead><tr><th>Semana / Registro</th><th className={styles.numeric}>Registros</th><th>Resultado 40/60</th><th>Actualizado</th><th>Guardado por</th><th>Acciones</th></tr></thead><tbody>{savedRecords.map(record => {
          const evaluated = record.summary.aprobados + record.summary.noAprobados;
          const rate = evaluated > 0 ? record.summary.aprobados/evaluated*100 : 0;
          return <tr key={record.id} className={activeSavedRecordId === record.id ? styles.selectedRecord : undefined}><td><strong>{record.recordName}</strong><span>{formatWeekLabel(record.week)}</span>{activeSavedRecordId === record.id && <><b className={styles.currentBadge}>En pantalla</b><small className={hasUnsavedChanges ? styles.pendingText : styles.savedText}>{saveStateLabel}</small></>}<details className={styles.recordDetails}><summary>Detalle del archivo</summary><dl><div><dt>Archivo</dt><dd>{record.fileName}</dd></div><div><dt>Hoja</dt><dd>{record.sheetName}</dd></div><div><dt>Filas originales</dt><dd>{formatNumber(record.totalRows)}</dd></div><div><dt>Cédulas encontradas / pendientes</dt><dd>{formatNumber(record.summary.cedulasEncontradas)} / {formatNumber(record.summary.cedulasPendientes)}</dd></div><div><dt>Guardado</dt><dd>{formatDateTime(record.savedAt)}</dd></div></dl></details></td><td className={styles.numeric}><strong>{formatNumber(record.filteredRows)}</strong></td><td><span className={styles.positive}>{formatNumber(record.summary.aprobados)} aprobados</span><span className={styles.negative}>{formatNumber(record.summary.noAprobados)} no aprobados</span><small>{formatPercent(rate)} de aprobación</small></td><td><span>{formatDateTime(record.updatedAt)}</span></td><td><strong>{record.savedByName || record.savedByUser || "Admin"}</strong>{record.savedByUser && <span>{record.savedByUser}</span>}</td><td><div className={styles.rowActions}><button type="button" className={styles.button} onClick={() => void loadStoredRecord(record.id)} disabled={workspaceBusy}>{consultingRecordId === record.id ? "Abriendo…" : "Consultar"}<DashboardIcon name="arrow" /></button>{activeSavedRecordId === record.id && <><button type="button" className={styles.button} onClick={() => void reloadCurrentRecord()} disabled={workspaceBusy}>{loading ? "Recargando…" : "Recargar"}</button><button type="button" className={styles.button} onClick={() => void saveCurrentRecord()} disabled={workspaceBusy}>{savingRecord ? "Guardando…" : "Guardar"}</button></>}{puedeEliminar && (<button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => void deleteStoredRecord(record.id, record.recordName)} disabled={workspaceBusy} aria-label={`Eliminar ${record.recordName}`}><DashboardIcon name="close" />{deletingRecordId === record.id ? "Eliminando…" : "Borrar"}</button>)}</div></td></tr>;
        })}</tbody></table></div><footer className={styles.historyFooter}>{formatNumber(savedRecordsCount)} semanas guardadas<span><DashboardIcon name="lock" />Eliminar: solo ADMIN</span></footer></div>}
      </section>
      {data && <>
        <section className={styles.resultsMetrics} aria-label="Resultados de la semana"><article><span>WEEK consultada</span><strong>{formatWeekLabel(data.week)}</strong><small>{formatNumber(rows.length)} filas procesadas</small></article><article><span>Aprobados</span><strong className={styles.positive}>{formatNumber(liveSummary.aprobados)}</strong></article><article><span>No aprobados</span><strong className={styles.negative}>{formatNumber(liveSummary.noAprobados)}</strong></article><article><span>Cédulas encontradas</span><strong>{formatNumber(liveSummary.cedulasEncontradas)}</strong><small>{formatNumber(liveSummary.cedulasPendientes)} pendientes</small></article><article><span>Tasa 40/60</span><strong>{formatPercent(approvalRate)}</strong></article></section>
        <section className={styles.panel} aria-labelledby="payjoy-results-title"><header className={styles.panelHeading}><div className={styles.panelTitle}><span className={styles.sectionIcon}><DashboardIcon name="sales" /></span><div><h2 id="payjoy-results-title">Registros procesados</h2><p>Archivo: {data.fileName} · Hoja: {data.sheetName}</p></div></div><span className={styles.resultsCount}>{formatNumber(visibleRows.length)} de {formatNumber(rows.length)} registros</span></header><div className={styles.statusFilters} aria-label="Filtrar resultados">{[{value:"TODOS" as const,label:"Todos"},{value:"40/60 APROBADO" as const,label:"Aprobados"},{value:"40/60 NO APROBADO" as const,label:"No aprobados"}].map(option => <button key={option.value} type="button" className={`${styles.button} ${selectedStatus === option.value ? styles.filterActive : ""}`} aria-pressed={selectedStatus === option.value} onClick={() => setSelectedStatus(option.value)}>{option.label}</button>)}</div>
        <div className={styles.tableScroll}><table className={styles.resultsTable}><thead><tr><th>WEEK</th><th>Comercio</th><th>DEVICE TAG</th><th className={styles.numeric}>Edad del crédito</th><th className={styles.numeric}>Pagos</th><th className={styles.numeric}>Cuota quincenal</th><th>Cédula</th><th>Resultado</th></tr></thead><tbody>{visibleRows.length === 0 ? <tr><td colSpan={8} className={styles.empty}>No se encontraron registros para este filtro.</td></tr> : paginatedRows.map(row => <tr key={row.id} className={row.status === "40/60 APROBADO" ? styles.approvedRow : styles.rejectedRow}><td>{formatWeekLabel(row.week)}</td><td>{row.merchantName || "—"}</td><td><strong>{row.deviceTag || "—"}</strong></td><td className={styles.numeric}>{formatNumber(effectiveLoanAge(row.loanAgeDays, data.ageReferenceDate, today))}</td><td className={styles.numeric}>{formatNumber(row.numberOfPayments)}</td><td className={styles.numeric}>{row.loanRepaymentBiweek === null ? "—" : `$ ${formatNumber(row.loanRepaymentBiweek)}`}</td><td><input className={styles.cedulaInput} aria-label={`Cédula de ${row.deviceTag}`} value={row.cedula} disabled={editingBusy} onChange={event => updateCedula(row.id,event.target.value)} placeholder="Escribe la cédula" /></td><td><select aria-label={`Resultado de ${row.deviceTag}`} className={`${styles.statusSelect} ${row.status === "40/60 APROBADO" ? styles.statusApproved : styles.statusRejected}`} value={row.status} disabled={editingBusy} onChange={event => updateStatus(row.id,event.target.value as FortySixtyStatus)}><option value="40/60 APROBADO">40/60 APROBADO</option><option value="40/60 NO APROBADO">40/60 NO APROBADO</option></select></td></tr>)}</tbody></table></div>
        <footer className={styles.pagination}><p>Mostrando {visibleRows.length ? (currentPage-1)*pageSize+1 : 0}–{Math.min(currentPage*pageSize,visibleRows.length)} de {formatNumber(visibleRows.length)} registros</p><div><button type="button" className={styles.button} onClick={() => setCurrentPage(page => Math.max(1,page-1))} disabled={currentPage<=1}>Anterior</button><span>Página {currentPage} de {totalPages}</span><button type="button" className={styles.button} onClick={() => setCurrentPage(page => Math.min(totalPages,page+1))} disabled={currentPage>=totalPages}>Siguiente</button></div></footer></section>
      </>}
    </main>
  </div>;
}
