"use client";

import { ChangeEvent, useMemo, useState } from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";

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
const DOCUMENTOS_POR_CONSULTA = 4;

function formatoPesos(valor: number | null) {
  if (valor === null || !Number.isFinite(Number(valor))) {
    return "-";
  }

  return `$ ${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  })}`;
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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function leerRespuestaApi(response: Response): Promise<ApiResponse> {
  const texto = await response.text();

  if (!texto) {
    return {};
  }

  try {
    return JSON.parse(texto) as ApiResponse;
  } catch {
    const mensaje = texto.toLowerCase().includes("upstream error")
      ? "SUMASPAY tardo demasiado en responder este bloque."
      : texto.slice(0, 180);

    return { error: mensaje || "Respuesta invalida de SUMASPAY." };
  }
}

function getNombreTabla(nombreCompleto: string | null) {
  const partes = String(nombreCompleto || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const nombre1 = partes[0] || "";
  const apellido1 =
    partes.length <= 1
      ? ""
      : partes.length === 2
        ? partes[1]
        : partes.length === 3
          ? partes[2]
          : partes[partes.length - 2];

  return {
    nombre1: nombre1.toLocaleUpperCase("es-CO"),
    apellido1: apellido1.toLocaleUpperCase("es-CO"),
  };
}

async function descargarExcel(resultados: ResultadoConsulta[]) {
  const XLSX = await import("xlsx");
  const filas: Array<Record<string, string | number>> = resultados.map((item) => {
    const { nombre1, apellido1 } = getNombreTabla(item.clienteNombre);

    return {
      Cedula: item.documento,
      "Nombre 1": nombre1,
      "Apellido 1": apellido1,
      "Valor cuota": item.valorCuota ?? "",
    };
  });
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "SUMASPAY");
  XLSX.writeFile(libro, "consulta-sumaspay.xlsx");
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: DashboardIconName;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const toneClasses = {
    neutral: {
      icon: "bg-slate-100 text-slate-600",
      value: "text-slate-950",
    },
    positive: {
      icon: "bg-emerald-50 text-emerald-700",
      value: "text-emerald-700",
    },
    warning: {
      icon: "bg-amber-50 text-amber-700",
      value: "text-amber-700",
    },
    danger: {
      icon: "bg-red-50 text-[#e30613]",
      value: "text-[#e30613]",
    },
  }[tone];

  return (
    <article className="flex min-h-[132px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneClasses.icon}`}
      >
        <DashboardIcon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
          {label}
        </p>
        <p
          className={`mt-1.5 text-[28px] font-black leading-none tracking-tight ${toneClasses.value}`}
        >
          {value}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

export default function SumasPayBatchWorkspace() {
  const [fileName, setFileName] = useState("");
  const [documentos, setDocumentos] = useState<string[]>([]);
  const [resultados, setResultados] = useState<ResultadoConsulta[]>([]);
  const [error, setError] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [leyendoArchivo, setLeyendoArchivo] = useState(false);
  const [procesadas, setProcesadas] = useState(0);

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

    setLeyendoArchivo(true);

    try {
      const texto = await file.text();
      const nextDocumentos = extraerDocumentos(texto);
      setFileName(file.name);
      setDocumentos(nextDocumentos);

      if (nextDocumentos.length === 0) {
        setError("No se encontraron cédulas válidas en el archivo.");
      }
    } catch {
      setFileName(file.name);
      setDocumentos([]);
      setError("No se pudo leer el archivo seleccionado.");
    } finally {
      setLeyendoArchivo(false);
    }
  }

  async function consultar() {
    if (documentos.length === 0 || consultando) {
      return;
    }

    setConsultando(true);
    setError("");
    setResultados([]);
    setProcesadas(0);

    try {
      const acumulados: ResultadoConsulta[] = [];
      const bloques = chunkArray(documentos, DOCUMENTOS_POR_CONSULTA);
      let bloquesConError = 0;

      for (let index = 0; index < bloques.length; index += 1) {
        const bloque = bloques[index];

        try {
          const response = await fetch(
            `/api/dashboard/sumaspay-lote?bloque=${index + 1}&t=${Date.now()}`,
            {
              method: "POST",
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ documentos: bloque }),
            }
          );
          const data = await leerRespuestaApi(response);

          if (!response.ok || !data.ok) {
            throw new Error(
              data.error || "No se pudo consultar este bloque SUMASPAY."
            );
          }

          acumulados.push(...(data.resultados || []));
        } catch (lookupError) {
          bloquesConError += 1;
          const mensaje =
            lookupError instanceof Error
              ? lookupError.message
              : "No se pudo consultar este bloque SUMASPAY.";

          acumulados.push(
            ...bloque.map((documento) => ({
              documento,
              clienteNombre: null,
              valorCuota: null,
              estado: "ERROR" as const,
              mensaje,
            }))
          );
        }

        setProcesadas(acumulados.length);
        setResultados([...acumulados]);
      }

      if (bloquesConError > 0) {
        setError(
          `${bloquesConError} bloque${
            bloquesConError === 1 ? "" : "s"
          } no se pudo consultar. Los demas resultados se conservaron.`
        );
      }
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

  const estadoConsulta = leyendoArchivo
    ? "Leyendo archivo"
    : consultando
      ? `Consultando ${procesadas}/${documentos.length}`
      : resultados.length > 0
        ? "Consulta finalizada"
        : documentos.length > 0
          ? "Archivo preparado"
          : "Sin archivo";
  const progreso = documentos.length
    ? Math.min(100, Math.round((procesadas / documentos.length) * 100))
    : 0;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                <DashboardIcon name="document" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Consulta masiva
                </p>
                <h2 className="mt-1 text-[22px] font-black tracking-tight text-slate-950 sm:text-2xl">
                  Cargar cédulas
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                  Selecciona un TXT con hasta {MAX_DOCUMENTOS} cédulas. La
                  consulta valida créditos creados durante los últimos dos
                  meses.
                </p>
              </div>
            </div>

            <label
              htmlFor="sumaspay-txt"
              className="mt-5 flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center transition hover:border-red-300 hover:bg-red-50/40 focus-within:border-[#e30613] focus-within:ring-4 focus-within:ring-red-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm">
                <DashboardIcon name="download" className="h-5 w-5" />
              </span>
              <span className="mt-3 text-sm font-black uppercase tracking-[0.07em] text-slate-900">
                {fileName ? "Cambiar archivo TXT" : "Seleccionar archivo TXT"}
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Solo archivos .txt · máximo {MAX_DOCUMENTOS} cédulas válidas
              </span>
              <input
                id="sumaspay-txt"
                type="file"
                accept=".txt,text/plain"
                onChange={handleFileChange}
                disabled={consultando || leyendoArchivo}
                className="sr-only"
              />
            </label>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50/80 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
              Estado del lote
            </p>

            <dl className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-xs font-semibold text-slate-500">Archivo</dt>
                <dd
                  className="truncate text-right text-xs font-bold text-slate-900"
                  title={fileName || "Sin archivo"}
                >
                  {fileName || "Sin archivo"}
                </dd>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-xs font-semibold text-slate-500">Cédulas</dt>
                <dd className="text-right text-xs font-bold text-slate-900">
                  {documentos.length} de {MAX_DOCUMENTOS}
                </dd>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-xs font-semibold text-slate-500">Estado</dt>
                <dd className="text-right text-xs font-bold text-slate-900">
                  {estadoConsulta}
                </dd>
              </div>
            </dl>

            {consultando && (
              <div className="mt-4" aria-live="polite">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Procesando</span>
                  <span>{progreso}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#e30613] transition-[width] duration-300"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={consultar}
              disabled={
                documentos.length === 0 || consultando || leyendoArchivo
              }
              className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[#c9000b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <DashboardIcon
                name={consultando ? "reports" : "search"}
                className="h-4.5 w-4.5"
              />
              {consultando ? estadoConsulta : "Consultar cédulas"}
            </button>
          </aside>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 border-t border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 sm:px-6"
          >
            <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumen de la consulta"
      >
        <MetricCard
          icon="reports"
          label="Consultadas"
          value={String(resumen.total)}
          detail="Cédulas procesadas."
        />
        <MetricCard
          icon="approvals"
          label="Encontradas"
          value={String(resumen.encontrados)}
          detail="Con crédito SUMASPAY vigente."
          tone="positive"
        />
        <MetricCard
          icon="warning"
          label="Sin crédito"
          value={String(resumen.sinCredito)}
          detail="Sin coincidencia vigente."
          tone="warning"
        />
        <MetricCard
          icon="close"
          label="Errores"
          value={String(resumen.errores)}
          detail="Consultas no completadas."
          tone="danger"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <DashboardIcon name="catalog" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e30613]">
                Resultados
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-[22px]">
                Créditos consultados
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Nombre, apellido, cuota y estado de cada cédula procesada.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <span className="text-xs font-semibold text-slate-500">
              {resultados.length} resultado
              {resultados.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => void descargarExcel(resultados)}
              disabled={resultados.length === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none"
            >
              <DashboardIcon name="download" className="h-4 w-4" />
              Descargar Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 sm:px-6">
                  Cédula
                </th>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Nombre 1
                </th>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Apellido 1
                </th>
                <th className="px-5 py-4 text-right text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Valor cuota
                </th>
                <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 sm:pr-6">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {resultados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <DashboardIcon name="document" className="h-6 w-6" />
                    </span>
                    <p className="mt-4 text-sm font-bold text-slate-700">
                      Aún no hay resultados
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
                      Selecciona un archivo TXT y ejecuta la consulta para ver
                      aquí el detalle de las cédulas.
                    </p>
                  </td>
                </tr>
              ) : (
                resultados.map((item) => {
                  const { nombre1, apellido1 } = getNombreTabla(
                    item.clienteNombre
                  );
                  const encontrado = item.estado === "ENCONTRADO";
                  const errorConsulta = item.estado === "ERROR";
                  const estadoLabel = encontrado
                    ? "Encontrado"
                    : errorConsulta
                      ? "Error"
                      : "Sin crédito";
                  const estadoClass = encontrado
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : errorConsulta
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-amber-50 text-amber-700";

                  return (
                    <tr
                      key={item.documento}
                      className="transition hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-black text-slate-950 sm:px-6">
                        {item.documento}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-800">
                        {nombre1 || "-"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-800">
                        {apellido1 || "-"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-black text-slate-950">
                        {formatoPesos(item.valorCuota)}
                      </td>
                      <td className="px-5 py-4 sm:pr-6">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${estadoClass}`}
                        >
                          {estadoLabel}
                        </span>
                        {item.mensaje && !encontrado && (
                          <p
                            className="mt-1.5 max-w-[260px] truncate text-xs text-slate-500"
                            title={item.mensaje}
                          >
                            {item.mensaje}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
