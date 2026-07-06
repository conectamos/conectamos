import { NextResponse } from "next/server";
import { esRolAdministrativo } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import {
  isSumasConsultaConfigured,
  obtenerCreditosSumasPayPorCedulas,
} from "@/lib/sumasconsulta";

const MAX_DOCUMENTOS = 100;

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

function mapearResultadoBatch(
  item: Awaited<ReturnType<typeof obtenerCreditosSumasPayPorCedulas>>[number]
): ResultadoConsultaSumasPay {
  if (item.error) {
    return {
      documento: item.documento,
      clienteNombre: null,
      valorCuota: null,
      estado: "ERROR",
      mensaje: item.error,
    };
  }

  if (!item.credito) {
    return {
      documento: item.documento,
      clienteNombre: null,
      valorCuota: null,
      estado: "NO_ENCONTRADO",
      mensaje: "Sin credito SUMASPAY vigente en los ultimos 2 meses",
    };
  }

  return {
    documento: item.documento,
    clienteNombre: item.credito.clienteNombre,
    valorCuota: item.credito.valorCuota,
    estado: "ENCONTRADO",
    mensaje: null,
  };
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

    const batch = await obtenerCreditosSumasPayPorCedulas(documentos, {
      maxCreditAgeMonths: 2,
      requireConectamosPoint: false,
      allowMissingCreditCreationDate: true,
    });
    const resultados = batch.map(mapearResultadoBatch);

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
