"use client";

import { ChangeEvent, useMemo, useState } from "react";

type ResultadoConsulta = {
  documento: string;
  clienteNombre: string | null;
  valorCuota: number | null;
  estado: "ENCONTRADO" | "NO_ENCONTRADO" | "ERROR";
  mensaje: string | null;
};

type ApiResponse = {
  ok?: boolean;
  total?: number;
  encontrados?: number;
  sinCredito?: number;
  errores?: number;
  resultados?: ResultadoConsulta[];
  error?: string;
};

const MAX_DOCUMENTOS = 100;

function formatoPesos(valor: number | null) {
  if (valor === null || !Number.isFinite(Number(valor))) {
    return "-";
  }

  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  })}`;
}

function estadoLabel(estado: ResultadoConsulta["estado"]) {
  if (estado === "ENCONTRADO") return "Encontrado";
  if (estado === "NO_ENCONTRADO") return "Sin credito";
  return "Error";
}

function estadoClassName(estado: ResultadoConsulta["estado"]) {
  if (estado === "ENCONTRADO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (estado === "NO_ENCONTRADO") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function extraerDocumentos(texto: string) {
  const vistos = new Set<string>();
  const documentos: string[] = [];

  for (const token of texto.split(/[\s,;|]+/)) {
    const documento = token.replace(/\D/g, "").slice(0, 15);

    if (documento.length < 5 || documento.length > 15 || vistos.has(documento)) {
      continue;
    }

    vistos.add(documento);
    documentos.push(documento);

    if (documentos.length >= MAX_DOCUMENTOS) {
      break;
    }
  }

  return documentos;
}

function descargarCsv(resultados: ResultadoConsulta[]) {
  const encabezados = ["Cedula", "Nombre", "Valor cuota", "Estado", "Mensaje"];
  const filas = resultados.map((item) => [
    item.documento,
    item.clienteNombre ?? "",
    item.valorCuota === null ? "" : String(item.valorCuota),
    estadoLabel(item.estado),
    item.mensaje ?? "",
  ]);
  const contenido = [encabezados, ...filas]
    .map((fila) =>
      fila
        .map((valor) => `"${String(valor).replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "consulta-sumaspay.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const toneClasses = {
    neutral: "border-[#e7e3da] bg-white text-slate-950",
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div
      className={[
        "rounded-[26px] border px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]",
        toneClasses,
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

export default function SumasPayBatchWorkspace() {
  const [fileName, setFileName] = useState("");
  const [documentos, setDocumentos] = useState<string[]>([]);
  const [resultados, setResultados] = useState<ResultadoConsulta[]>([]);
  const [error, setError] = useState("");
  const [consultando, setConsultando] = useState(false);

  const resumen = useMemo(() => {
    const encontrados = resultados.filter(
      (item) => item.estado === "ENCONTRADO"
    ).length;
    const errores = resultados.filter((item) => item.estado === "ERROR").length;

    return {
      total: resultados.length,
      encontrados,
      sinCredito: resultados.length - encontrados - errores,
      errores,
    };
  }, [resultados]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setResultados([]);

    if (!file) {
      setFileName("");
      setDocumentos([]);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setFileName(file.name);
      setDocumentos([]);
      setError("Solo se permite archivo TXT.");
      return;
    }

    const texto = await file.text();
    const nextDocumentos = extraerDocumentos(texto);
    setFileName(file.name);
    setDocumentos(nextDocumentos);

    if (nextDocumentos.length === 0) {
      setError("No se encontraron cedulas validas en el archivo.");
    }
  }

  async function consultar() {
    if (documentos.length === 0 || consultando) {
      return;
    }

    setConsultando(true);
    setError("");
    setResultados([]);

    try {
      const response = await fetch("/api/dashboard/sumaspay-lote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentos }),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "No se pudo consultar el lote SUMASPAY.");
        return;
      }

      setResultados(data.resultados || []);
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "No se pudo consultar el lote SUMASPAY."
      );
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Archivo TXT
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              Cedulas a consultar
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Se procesan hasta {MAX_DOCUMENTOS} cedulas por archivo.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border border-[#e4ddd2] bg-[#fcfbf8] px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-800 transition hover:bg-white">
              Subir TXT
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={consultar}
              disabled={documentos.length === 0 || consultando}
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {consultando ? "Consultando" : "Consultar"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Archivo
            </p>
            <p className="mt-2 truncate text-sm font-bold text-slate-900">
              {fileName || "Sin archivo"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Cedulas
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {documentos.length}
            </p>
          </div>
          <div className="rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Estado
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {consultando ? "Consulta en proceso" : "Listo"}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Consultadas"
          value={String(resumen.total)}
          detail="Cedulas procesadas."
        />
        <MetricCard
          label="Encontradas"
          value={String(resumen.encontrados)}
          detail="Con credito SUMASPAY."
          tone="positive"
        />
        <MetricCard
          label="Sin credito"
          value={String(resumen.sinCredito)}
          detail="Sin coincidencia vigente."
          tone="warning"
        />
        <MetricCard
          label="Errores"
          value={String(resumen.errores)}
          detail="Consultas no completadas."
          tone="danger"
        />
      </section>

      <section className="overflow-hidden rounded-[30px] border border-[#e9e3d8] bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 border-b border-[#eee6da] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Resultados
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Nombre y valor de cuota
            </h2>
          </div>

          <button
            type="button"
            onClick={() => descargarCsv(resultados)}
            disabled={resultados.length === 0}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-[#e4ddd2] bg-[#fcfbf8] px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Descargar CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#eee6da]">
            <thead className="bg-[#fcfbf8]">
              <tr>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Cedula
                </th>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Nombre
                </th>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Valor cuota
                </th>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e9dd] bg-white">
              {resultados.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-sm font-semibold text-slate-500"
                  >
                    Sin resultados.
                  </td>
                </tr>
              ) : (
                resultados.map((item) => (
                  <tr key={item.documento}>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-black text-slate-950">
                      {item.documento}
                    </td>
                    <td className="min-w-[260px] px-5 py-4 text-sm font-semibold text-slate-700">
                      {item.clienteNombre || "-"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-black text-slate-950">
                      {formatoPesos(item.valorCuota)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={[
                            "w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]",
                            estadoClassName(item.estado),
                          ].join(" ")}
                        >
                          {estadoLabel(item.estado)}
                        </span>
                        {item.mensaje && (
                          <span className="max-w-sm text-xs font-semibold text-slate-500">
                            {item.mensaje}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
