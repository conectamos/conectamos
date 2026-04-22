"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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
  status: "MORA" | "PAGO" | "SIN DATOS";
  maximumPaymentDate: string | null;
  currency: string | null;
  lookupMessage: string | null;
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

function statusClass(status: PayJoyRow["status"]) {
  switch (status) {
    case "PAGO":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "MORA":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

export default function PayJoyCarteraWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [linksText, setLinksText] = useState("");
  const [data, setData] = useState<PayJoyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || "No fue posible procesar las cargas.");
        return;
      }

      setData(payload);
      setMessage(
        `Se procesaron ${payload.totalSources} carga(s) y se consolidaron ${payload.uniqueRows} transaccion(es) sin duplicados.`
      );
    } catch {
      setMessage("No fue posible procesar las cargas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto max-w-7xl">
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
                Puedes subir varios archivos Excel o CSV. Cada archivo genera su
                nombre de CORTE a partir del nombre del archivo.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
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
                usa este formato: <span className="font-semibold">Corte abril | URL</span>
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
            La hoja debe llamarse <span className="font-semibold">Transacciones</span> y
            traer estas columnas: transaction time, merchant name, device,
            device family, imei y national id. Fecha de pago = +14 dias
            calendario. Pago maximo = +18 dias calendario.
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
                  {data.uniqueRows}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Sin duplicados
                </p>
              </div>

              <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
                  Mora
                </p>
                <p className="mt-3 text-3xl font-black text-red-700">
                  {data.summary.mora}
                </p>
              </div>

              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Pago
                </p>
                <p className="mt-3 text-3xl font-black text-emerald-700">
                  {data.summary.pago}
                </p>
                <p className="mt-2 text-sm text-emerald-700/80">
                  Sin datos: {data.summary.sinDatos}
                </p>
              </div>
            </section>

            <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Cortes detectados
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.sourceNames.map((name) => (
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
                  Resultado consolidado
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                  Tabla de cartera PayJoy
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-4">CORTE</th>
                      <th className="px-4 py-4">Transaction time</th>
                      <th className="px-4 py-4">Merchant name</th>
                      <th className="px-4 py-4">Device</th>
                      <th className="px-4 py-4">Device family</th>
                      <th className="px-4 py-4">IMEI</th>
                      <th className="px-4 py-4">National ID</th>
                      <th className="px-4 py-4">Fecha de pago</th>
                      <th className="px-4 py-4">Estado</th>
                      <th className="px-4 py-4">Pago maximo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {data.rows.map((row) => (
                      <tr
                        key={[
                          row.corteName,
                          row.transactionTime,
                          row.device,
                          row.imei,
                        ].join("::")}
                      >
                        <td className="px-4 py-4 text-sm font-semibold text-slate-950">
                          {row.corteName}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {formatDateTime(row.transactionTime)}
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-950">
                          {row.merchantName || "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <div className="font-semibold text-slate-950">
                            {row.device || "-"}
                          </div>
                          {row.lookupMessage && (
                            <div className="mt-1 text-xs text-slate-500">
                              {row.lookupMessage}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {row.deviceFamily || "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {row.imei || "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {row.nationalId || "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <div>{formatDate(row.paymentDueDate)}</div>
                          {row.devicePaymentDate && (
                            <div className="mt-1 text-xs text-slate-500">
                              Device: {formatDate(row.devicePaymentDate)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                              statusClass(row.status),
                            ].join(" ")}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-950">
                          {formatDate(row.maximumPaymentDate)}
                        </td>
                      </tr>
                    ))}
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
