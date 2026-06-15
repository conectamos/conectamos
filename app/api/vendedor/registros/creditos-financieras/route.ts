import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederPanelVendedor } from "@/lib/access-control";
import {
  AddiConsultaConfigError,
  AddiConsultaLookupError,
  isAddiConsultaConfigured,
  obtenerCreditoAddiPorCedula,
  type AddiCreditoCedula,
} from "@/lib/addiconsulta";
import {
  isEsmioOpcionConsultaConfigured,
  isSumasConsultaConfigured,
  obtenerCreditoEsmioOpcionPorCedula,
  obtenerCreditoSumasPayPorCedula,
  SumasConsultaConfigError,
  SumasConsultaLookupError,
  type EsmioOpcionCreditoCedula,
  type SumasPayCreditoCedula,
} from "@/lib/sumasconsulta";

type CreditoFinancieraCedula =
  | SumasPayCreditoCedula
  | AddiCreditoCedula
  | EsmioOpcionCreditoCedula;

type LookupResult = {
  financiera: CreditoFinancieraCedula["financiera"];
  credito: CreditoFinancieraCedula | null;
  error?: string;
};

async function requireVendor() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo un perfil vendedor o administrador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const };
}

function normalizarDocumento(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function ocultarDocumento(documento: string) {
  if (documento.length <= 4) {
    return "****";
  }

  return `${"*".repeat(documento.length - 4)}${documento.slice(-4)}`;
}

async function lookupSumasPay(documento: string): Promise<LookupResult> {
  try {
    return {
      financiera: "SUMASPAY",
      credito: await obtenerCreditoSumasPayPorCedula(documento),
    };
  } catch (error) {
    if (
      error instanceof SumasConsultaConfigError ||
      error instanceof SumasConsultaLookupError
    ) {
      return {
        financiera: "SUMASPAY",
        credito: null,
        error: error.message,
      };
    }

    console.error("ERROR CONSULTANDO CREDITO SUMASPAY:", error);
    return {
      financiera: "SUMASPAY",
      credito: null,
      error:
        error instanceof Error
          ? error.message
          : "Error consultando el credito SUMASPAY",
    };
  }
}

async function lookupAddi(documento: string): Promise<LookupResult> {
  try {
    return {
      financiera: "ADDI",
      credito: await obtenerCreditoAddiPorCedula(documento),
    };
  } catch (error) {
    if (
      error instanceof AddiConsultaConfigError ||
      error instanceof AddiConsultaLookupError
    ) {
      return {
        financiera: "ADDI",
        credito: null,
        error: error.message,
      };
    }

    console.error("ERROR CONSULTANDO CREDITO ADDI:", error);
    return {
      financiera: "ADDI",
      credito: null,
      error:
        error instanceof Error ? error.message : "Error consultando el credito ADDI",
    };
  }
}

async function lookupEsmioOpcion(documento: string): Promise<LookupResult> {
  try {
    return {
      financiera: "ESMIOPCION",
      credito: await obtenerCreditoEsmioOpcionPorCedula(documento),
    };
  } catch (error) {
    if (
      error instanceof SumasConsultaConfigError ||
      error instanceof SumasConsultaLookupError
    ) {
      return {
        financiera: "ESMIOPCION",
        credito: null,
        error: error.message,
      };
    }

    console.error("ERROR CONSULTANDO CREDITO ESMIOPCION:", error);
    return {
      financiera: "ESMIOPCION",
      credito: null,
      error:
        error instanceof Error
          ? error.message
          : "Error consultando el credito ESMIOPCION",
    };
  }
}

function orderCredito(credito: CreditoFinancieraCedula) {
  if (credito.financiera === "SUMASPAY") return 1;
  if (credito.financiera === "ADDI") return 2;
  if (credito.financiera === "ESMIOPCION") return 3;
  return 99;
}

export async function GET(req: Request) {
  let documento = "";

  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    const requestUrl = new URL(req.url);
    documento = normalizarDocumento(requestUrl.searchParams.get("documento"));

    if (documento.length < 5) {
      return NextResponse.json(
        { error: "La cedula debe tener entre 5 y 15 digitos" },
        { status: 400 }
      );
    }

    const lookups: Array<Promise<LookupResult>> = [];

    if (isSumasConsultaConfigured()) {
      lookups.push(lookupSumasPay(documento));
    }

    if (isAddiConsultaConfigured()) {
      lookups.push(lookupAddi(documento));
    }

    if (isEsmioOpcionConsultaConfigured()) {
      lookups.push(lookupEsmioOpcion(documento));
    }

    if (lookups.length === 0) {
      return NextResponse.json(
        {
          error:
            "Falta configurar las variables de consulta de SUMASPAY, ADDI o ESMIOPCION en el servidor",
        },
        { status: 503 }
      );
    }

    const results = await Promise.all(lookups);
    const creditos = results
      .map((result) => result.credito)
      .filter((credito): credito is CreditoFinancieraCedula => Boolean(credito))
      .sort((a, b) => orderCredito(a) - orderCredito(b));
    const errores = results
      .filter((result) => result.error)
      .map((result) => ({
        financiera: result.financiera,
        error: result.error,
      }));

    if (creditos.length === 0) {
      console.info("Sin creditos financieros para documento", {
        documento: ocultarDocumento(documento),
        errores: errores.map((item) => item.financiera),
      });

      return NextResponse.json(
        {
          creditos: [],
          errores,
          error:
            "No se encontro un credito SUMASPAY, ADDI o ESMIOPCION creado hoy o ayer en tienda CONECTAMOS para esta cedula",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      creditos,
      errores,
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO CREDITOS FINANCIERAS:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando los creditos por cedula",
      },
      { status: 500 }
    );
  }
}
