import { NextResponse } from "next/server";
import { esRolAdministrativo } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import {
  isSumasConsultaConfigured,
  obtenerCreditoSumasPayPorCedula,
  SumasConsultaConfigError,
  SumasConsultaLookupError,
} from "@/lib/sumasconsulta";

const MAX_DOCUMENTOS = 100;
const CONCURRENCIA_CONSULTA = 1;

type ResultadoConsultaSumasPay = {
  documento: string;
  clienteNombre: string | null;
  valorCuota: number | null;
  estado: "ENCONTRADO" | "NO_ENCONTRADO" | "ERROR";
  mensaje: string | null;
};

function normalizarDocumento(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function ocultarDocumento(documento: string) {
  if (documento.length <= 4) {
    return "****";
  }

  return `${"*".repeat(documento.length - 4)}${documento.slice(-4)}`;
}

function normalizarDocumentos(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  const vistos = new Set<string>();
  const documentos: string[] = [];

  for (const item of items) {
    const documento = normalizarDocumento(item);

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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let currentIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (currentIndex < items.length) {
        const index = currentIndex;
        currentIndex += 1;
        results[index] = await task(items[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

async function consultarDocumento(
  documento: string
): Promise<ResultadoConsultaSumasPay> {
  try {
    const credito = await obtenerCreditoSumasPayPorCedula(documento, {
      maxCreditAgeMonths: 2,
      requireConectamosPoint: false,
    });

    if (!credito) {
      return {
        documento,
        clienteNombre: null,
        valorCuota: null,
        estado: "NO_ENCONTRADO",
        mensaje: "Sin credito SUMASPAY vigente en los ultimos 2 meses",
      };
    }

    return {
      documento,
      clienteNombre: credito.clienteNombre,
      valorCuota: credito.valorCuota,
      estado: "ENCONTRADO",
      mensaje: null,
    };
  } catch (error) {
    if (
      error instanceof SumasConsultaConfigError ||
      error instanceof SumasConsultaLookupError
    ) {
      return {
        documento,
        clienteNombre: null,
        valorCuota: null,
        estado: "ERROR",
        mensaje: error.message,
      };
    }

    console.error("ERROR CONSULTANDO SUMASPAY EN LOTE:", {
      documento: ocultarDocumento(documento),
      error,
    });

    return {
      documento,
      clienteNombre: null,
      valorCuota: null,
      estado: "ERROR",
      mensaje:
        error instanceof Error
          ? error.message
          : "Error consultando credito SUMASPAY",
    };
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!esRolAdministrativo(session.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede consultar lotes SUMASPAY" },
        { status: 403 }
      );
    }

    if (!isSumasConsultaConfigured()) {
      return NextResponse.json(
        {
          error:
            "Falta configurar las variables SUMASCONSULTA_URL, SUMASCONSULTA_USUARIO y SUMASCONSULTA_CLAVE.",
        },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    const documentos = normalizarDocumentos(body?.documentos);

    if (documentos.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene cedulas validas." },
        { status: 400 }
      );
    }

    const resultados = await mapWithConcurrency(
      documentos,
      CONCURRENCIA_CONSULTA,
      consultarDocumento
    );

    const encontrados = resultados.filter(
      (item) => item.estado === "ENCONTRADO"
    ).length;
    const errores = resultados.filter((item) => item.estado === "ERROR").length;

    return NextResponse.json({
      ok: true,
      limite: MAX_DOCUMENTOS,
      total: resultados.length,
      encontrados,
      sinCredito: resultados.length - encontrados - errores,
      errores,
      resultados,
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO LOTE SUMASPAY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando el lote SUMASPAY",
      },
      { status: 500 }
    );
  }
}
