"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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

type FortySixtyResponse = {
  ok: boolean;
  fileName: string;
  sheetName: string;
  week: string;
  totalRows: number;
  filteredRows: number;
  summary: {
    aprobados: number;
    noAprobados: number;
    cedulasEncontradas: number;
    cedulasPendientes: number;
  };
  rows: FortySixtyRow[];
};

type FortySixtyWeeksResponse = {
  ok: boolean;
  fileName: string;
  sheetName: string;
  weeks: string[];
};

function formatNumber(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return Number(value).toLocaleString("es-CO");
}

function statusRowClass(status: FortySixtyStatus) {
  return status === "40/60 APROBADO"
    ? "bg-emerald-50/80"
    : "bg-red-50/80";
}

export default function PayJoyFortySixtyWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [week, setWeek] = useState("");
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<FortySixtyResponse | null>(null);
  const [rows, setRows] = useState<FortySixtyRow[]>([]);

  const liveSummary = rows.reduce(
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

  const updateCedula = (id: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, cedula: value } : row))
    );
  };

  const loadWeeksFromFile = async (selectedFile: File) => {
    try {
      setLoadingWeeks(true);
      setMessage("");
      setWeek("");
      setWeekOptions([]);
      setData(null);
      setRows([]);

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
            <section className="mt-6 grid gap-4 md:grid-cols-4">
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

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Archivo: <span className="font-semibold text-slate-950">{data.fileName}</span>
                </div>
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
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No se encontraron registros para esta WEEK.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
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
                            <span
                              className={[
                                "inline-flex rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]",
                                row.status === "40/60 APROBADO"
                                  ? "border border-emerald-200 bg-emerald-100 text-emerald-700"
                                  : "border border-red-200 bg-red-100 text-red-700",
                              ].join(" ")}
                            >
                              {row.status}
                            </span>
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
