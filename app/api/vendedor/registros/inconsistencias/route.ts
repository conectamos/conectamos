import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  esPerfilAdministrativo,
  esPerfilRegistroVenta,
  esRolAdministrativo,
  puedeAccederPanelVendedor,
} from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import {
  getBogotaDayRangeFromInput,
  getTodayBogotaDateKey,
} from "@/lib/ventas-utils";
import { normalizeDateKey, shiftDateKey } from "@/lib/credit-date-utils";
import {
  isPayJoyRetailConfigured,
  obtenerCreditoPayJoyPorImei,
} from "@/lib/payjoy-retail";
import {
  isFinserpayConsultaConfigured,
  obtenerCreditoFinserpayPorImei,
} from "@/lib/finserpayconsulta";
import {
  isAloConsultaConfigured,
  obtenerCreditoAloPorImei,
} from "@/lib/aloconsulta";
import {
  isSumasConsultaConfigured,
  obtenerCreditoSumasPayPorCedula,
} from "@/lib/sumasconsulta";
import {
  isEsmioOpcionConsultaConfigured,
  obtenerCreditoEsmioOpcionPorCedula,
} from "@/lib/esmiopcionconsulta";
import {
  isAddiConsultaConfigured,
  obtenerCreditoAddiPorCedula,
} from "@/lib/addiconsulta";

type Proveedor =
  | "PAYJOY"
  | "FINSER"
  | "ALO CREDIT"
  | "SUMASPAY"
  | "ESMIO"
  | "ADDI";

type EstadoRevision = "COINCIDE" | "INCONSISTENTE" | "REVISAR" | "SIN_VERIFICAR";

type DetalleRegistrado = {
  plataformaCredito: string;
  creditoAutorizado: number | null;
  cuotaInicial: number | null;
  valorCuota: number | null;
  numeroCuotas: number | null;
  frecuenciaCuota: string | null;
};

type ItemRevision = DetalleRegistrado & {
  registroId: number;
  createdAt: Date;
  clienteNombre: string;
  documentoNumero: string;
  serialImei: string | null;
  puntoVenta: string | null;
  asesorNombre: string | null;
  proveedor: Proveedor;
};

type CreditoOficial = {
  creditoAutorizado: number | null;
  cuotaInicial: number | null;
  valorCuota: number | null;
  numeroCuotas: number | null;
  frecuenciaCuota: string | null;
  documento: string | null;
  imei: string | null;
  fechaCreacionCredito: string | null;
  ordenId: string | null;
};

type ResultadoConsulta =
  | { ok: true; credito: CreditoOficial | null }
  | { ok: false; error: string };

const PROVEEDORES_POR_CEDULA = new Set<Proveedor>([
  "SUMASPAY",
  "ESMIO",
  "ADDI",
]);
const MAX_REGISTROS_REVISION = 60;
const MAX_CONCURRENCIA = 4;

function soloDigitos(value: unknown, maxLength = 15) {
  return String(value || "").replace(/\D/g, "").slice(0, maxLength);
}

function numero(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function texto(value: unknown) {
  const parsed = String(value || "").trim();
  return parsed || null;
}

function normalizarFrecuencia(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/gi, "")
    .toUpperCase();
}

function identificarProveedor(value: unknown): Proveedor | null {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();

  if (key === "PAYJOY") return "PAYJOY";
  if (key === "FINSER" || key === "FINSERPAY") return "FINSER";
  if (key === "ALOCREDIT" || key === "ALOCREDITO") return "ALO CREDIT";
  if (key === "SUMAS" || key === "SUMASPAY") return "SUMASPAY";
  if (key === "ESMIO" || key === "ESMIOPCION") return "ESMIO";
  if (key === "ADDI") return "ADDI";
  return null;
}

function extraerDetalles(registro: {
  plataformaCredito: string;
  creditoAutorizado: unknown;
  cuotaInicial: unknown;
  valorCuota: unknown;
  numeroCuotas: number | null;
  frecuenciaCuota: string | null;
  financierasDetalle: unknown;
}) {
  const detalles = Array.isArray(registro.financierasDetalle)
    ? registro.financierasDetalle
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const row = item as Record<string, unknown>;

          return {
            plataformaCredito: String(row.plataformaCredito || "").trim(),
            creditoAutorizado: numero(row.creditoAutorizado),
            cuotaInicial: numero(row.cuotaInicial),
            valorCuota: numero(row.valorCuota),
            numeroCuotas: numero(row.numeroCuotas),
            frecuenciaCuota: texto(row.frecuenciaCuota),
          } satisfies DetalleRegistrado;
        })
        .filter((item): item is DetalleRegistrado => Boolean(item))
    : [];

  if (detalles.length > 0) {
    return detalles;
  }

  return [
    {
      plataformaCredito: registro.plataformaCredito,
      creditoAutorizado: numero(registro.creditoAutorizado),
      cuotaInicial: numero(registro.cuotaInicial),
      valorCuota: numero(registro.valorCuota),
      numeroCuotas: numero(registro.numeroCuotas),
      frecuenciaCuota: texto(registro.frecuenciaCuota),
    },
  ];
}

function normalizarCreditoOficial(value: unknown): CreditoOficial | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  return {
    creditoAutorizado: numero(row.creditoAutorizado),
    cuotaInicial: numero(row.enganche),
    valorCuota: numero(row.valorCuota),
    numeroCuotas: numero(row.numeroCuotas),
    frecuenciaCuota: texto(row.frecuenciaCuota),
    documento: soloDigitos(row.documento) || null,
    imei: soloDigitos(row.imei) || null,
    fechaCreacionCredito: texto(row.fechaCreacionCredito),
    ordenId: texto(row.ordenId),
  };
}

function proveedorConfigurado(proveedor: Proveedor) {
  if (proveedor === "PAYJOY") return isPayJoyRetailConfigured();
  if (proveedor === "FINSER") return isFinserpayConsultaConfigured();
  if (proveedor === "ALO CREDIT") return isAloConsultaConfigured();
  if (proveedor === "SUMASPAY") return isSumasConsultaConfigured();
  if (proveedor === "ESMIO") return isEsmioOpcionConsultaConfigured();
  return isAddiConsultaConfigured();
}

async function consultarCredito(item: ItemRevision): Promise<ResultadoConsulta> {
  const identificador = PROVEEDORES_POR_CEDULA.has(item.proveedor)
    ? soloDigitos(item.documentoNumero)
    : soloDigitos(item.serialImei);

  if (!identificador) {
    return {
      ok: false,
      error: PROVEEDORES_POR_CEDULA.has(item.proveedor)
        ? "El registro no tiene una cedula valida para consultar."
        : "El registro no tiene un IMEI valido para consultar.",
    };
  }

  if (!proveedorConfigurado(item.proveedor)) {
    return {
      ok: false,
      error: `La consulta de ${item.proveedor} no esta configurada en el servidor.`,
    };
  }

  try {
    let credito: unknown = null;

    if (item.proveedor === "PAYJOY") {
      credito = await obtenerCreditoPayJoyPorImei(identificador);
    } else if (item.proveedor === "FINSER") {
      credito = await obtenerCreditoFinserpayPorImei(identificador);
    } else if (item.proveedor === "ALO CREDIT") {
      credito = await obtenerCreditoAloPorImei(identificador);
    } else if (item.proveedor === "SUMASPAY") {
      credito = await obtenerCreditoSumasPayPorCedula(identificador);
    } else if (item.proveedor === "ESMIO") {
      credito = await obtenerCreditoEsmioOpcionPorCedula(identificador);
    } else {
      credito = await obtenerCreditoAddiPorCedula(identificador);
    }

    return {
      ok: true,
      credito: normalizarCreditoOficial(credito),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `No se pudo consultar ${item.proveedor}.`,
    };
  }
}

async function mapConcurrencia<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>
) {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;

  const ejecutar = async () => {
    while (siguiente < items.length) {
      const index = siguiente;
      siguiente += 1;
      resultados[index] = await worker(items[index]);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENCIA, items.length) },
      ejecutar
    )
  );

  return resultados;
}

function claveConsulta(item: ItemRevision) {
  const identificador = PROVEEDORES_POR_CEDULA.has(item.proveedor)
    ? soloDigitos(item.documentoNumero)
    : soloDigitos(item.serialImei);

  return `${item.proveedor}:${identificador}`;
}

function compararNumero(
  razones: string[],
  label: string,
  registrado: number | null,
  oficial: number | null
) {
  if (oficial === null) {
    return;
  }

  if (registrado === null || Math.round(registrado) !== Math.round(oficial)) {
    razones.push(
      `${label}: Conectamos ${registrado ?? "sin dato"} / plataforma ${oficial}.`
    );
  }
}

function construirScope(session: {
  perfilId?: number | null;
  perfilTipo?: unknown;
  rolNombre?: string | null;
}) {
  if (
    esRolAdministrativo(session.rolNombre) ||
    esPerfilAdministrativo(session.perfilTipo)
  ) {
    return {};
  }

  return {
    perfilVendedorId: session.perfilId || -1,
  };
}

export async function GET(req: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (
      !puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre) ||
      (esPerfilRegistroVenta(session.perfilTipo) &&
        !esRolAdministrativo(session.rolNombre))
    ) {
      return NextResponse.json(
        { error: "Solo supervisor, auditor o administrador pueden revisar inconsistencias" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const hoy = getTodayBogotaDateKey();
    const fecha = String(url.searchParams.get("fecha") || hoy);
    const ayer = shiftDateKey(hoy, -1);
    const rango = getBogotaDayRangeFromInput(fecha);

    if (!rango || (fecha !== hoy && fecha !== ayer)) {
      return NextResponse.json(
        {
          error:
            "La revision en linea solo esta disponible para hoy o ayer, que es el periodo consultable en las plataformas.",
        },
        { status: 400 }
      );
    }

    await ensureVendorProfilesSchema();

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        ...construirScope(session),
        eliminadoEn: null,
        createdAt: {
          gte: rango.start,
          lt: rango.end,
        },
      },
      select: {
        id: true,
        createdAt: true,
        clienteNombre: true,
        documentoNumero: true,
        serialImei: true,
        puntoVenta: true,
        asesorNombre: true,
        plataformaCredito: true,
        creditoAutorizado: true,
        cuotaInicial: true,
        valorCuota: true,
        numeroCuotas: true,
        frecuenciaCuota: true,
        financierasDetalle: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: MAX_REGISTROS_REVISION + 1,
    });

    const limitado = registros.length > MAX_REGISTROS_REVISION;
    const registrosRevisables = registros.slice(0, MAX_REGISTROS_REVISION);
    const items: ItemRevision[] = registrosRevisables.flatMap((registro) =>
      extraerDetalles(registro)
        .map((detalle) => {
          const proveedor = identificarProveedor(detalle.plataformaCredito);

          if (!proveedor) {
            return null;
          }

          return {
            ...detalle,
            registroId: registro.id,
            createdAt: registro.createdAt,
            clienteNombre: registro.clienteNombre,
            documentoNumero: registro.documentoNumero,
            serialImei: registro.serialImei,
            puntoVenta: registro.puntoVenta,
            asesorNombre: registro.asesorNombre,
            proveedor,
          } satisfies ItemRevision;
        })
        .filter((item): item is ItemRevision => Boolean(item))
    );

    const consultasUnicas = Array.from(
      new Map(items.map((item) => [claveConsulta(item), item])).entries()
    );
    const respuestas = await mapConcurrencia(
      consultasUnicas,
      async ([key, item]) => ({
        key,
        resultado: await consultarCredito(item),
      })
    );
    const consultas = new Map(
      respuestas.map((item) => [item.key, item.resultado])
    );
    const registrosPorClave = new Map<string, Set<number>>();

    for (const item of items) {
      const key = claveConsulta(item);
      const ids = registrosPorClave.get(key) || new Set<number>();
      ids.add(item.registroId);
      registrosPorClave.set(key, ids);
    }

    const resultados = items.map((item) => {
      const respuesta = consultas.get(claveConsulta(item));
      const razones: string[] = [];
      let estado: EstadoRevision = "COINCIDE";
      let creditoPlataforma: CreditoOficial | null = null;

      if (!respuesta || !respuesta.ok) {
        estado = "SIN_VERIFICAR";
        razones.push(
          respuesta && !respuesta.ok
            ? respuesta.error
            : "No se obtuvo respuesta de la plataforma."
        );
      } else if (!respuesta.credito) {
        estado = "INCONSISTENTE";
        razones.push(
          `No se encontro en ${item.proveedor} un credito reciente para este ${
            PROVEEDORES_POR_CEDULA.has(item.proveedor) ? "documento" : "IMEI"
          }.`
        );
      } else {
        creditoPlataforma = respuesta.credito;
        compararNumero(
          razones,
          "Credito autorizado",
          item.creditoAutorizado,
          creditoPlataforma.creditoAutorizado
        );
        compararNumero(
          razones,
          "Inicial",
          item.cuotaInicial,
          creditoPlataforma.cuotaInicial
        );
        compararNumero(
          razones,
          "Valor cuota",
          item.valorCuota,
          creditoPlataforma.valorCuota
        );
        compararNumero(
          razones,
          "Numero de cuotas",
          item.numeroCuotas,
          creditoPlataforma.numeroCuotas
        );

        if (
          creditoPlataforma.frecuenciaCuota &&
          normalizarFrecuencia(item.frecuenciaCuota) !==
            normalizarFrecuencia(creditoPlataforma.frecuenciaCuota)
        ) {
          razones.push(
            `Frecuencia: Conectamos ${item.frecuenciaCuota || "sin dato"} / plataforma ${creditoPlataforma.frecuenciaCuota}.`
          );
        }

        if (
          creditoPlataforma.documento &&
          soloDigitos(item.documentoNumero) !== creditoPlataforma.documento
        ) {
          razones.push(
            `La cedula del registro no coincide con la reportada por ${item.proveedor}.`
          );
        }

        if (
          creditoPlataforma.imei &&
          soloDigitos(item.serialImei) !== creditoPlataforma.imei
        ) {
          razones.push(
            `El IMEI del registro no coincide con el reportado por ${item.proveedor}.`
          );
        }

        const fechaCreditoOficial = normalizeDateKey(
          creditoPlataforma.fechaCreacionCredito
        );

        if (fechaCreditoOficial && fechaCreditoOficial !== fecha) {
          razones.push(
            `Fecha del credito: registro revisado ${fecha} / plataforma ${fechaCreditoOficial}.`
          );
        }

        if (razones.length > 0) {
          estado = "INCONSISTENTE";
        }
      }

      const cantidadRegistrosMismaClave =
        registrosPorClave.get(claveConsulta(item))?.size || 0;

      if (
        PROVEEDORES_POR_CEDULA.has(item.proveedor) &&
        cantidadRegistrosMismaClave > 1
      ) {
        razones.push(
          `Hay ${cantidadRegistrosMismaClave} registros de Conectamos con esta cedula y financiera en la fecha. La plataforma entrega el credito mas reciente; revisa cada venta.`
        );
        if (estado === "COINCIDE") {
          estado = "REVISAR";
        }
      }

      return {
        registroId: item.registroId,
        createdAt: item.createdAt.toISOString(),
        clienteNombre: item.clienteNombre,
        documentoNumero: item.documentoNumero,
        serialImei: item.serialImei,
        puntoVenta: item.puntoVenta,
        asesorNombre: item.asesorNombre,
        proveedor: item.proveedor,
        identificadorTipo: PROVEEDORES_POR_CEDULA.has(item.proveedor)
          ? "CEDULA"
          : "IMEI",
        plataformaCredito: item.plataformaCredito,
        creditoRegistrado: item.creditoAutorizado,
        creditoPlataforma: creditoPlataforma?.creditoAutorizado ?? null,
        fechaCreditoPlataforma:
          creditoPlataforma?.fechaCreacionCredito ?? null,
        ordenId: creditoPlataforma?.ordenId ?? null,
        estado,
        razones,
      };
    });

    return NextResponse.json({
      ok: true,
      fecha,
      limitado,
      maxRegistros: MAX_REGISTROS_REVISION,
      resumen: {
        registrosAnalizados: registrosRevisables.length,
        creditosAnalizados: resultados.length,
        coincidencias: resultados.filter((item) => item.estado === "COINCIDE")
          .length,
        inconsistencias: resultados.filter(
          (item) => item.estado === "INCONSISTENTE"
        ).length,
        revisar: resultados.filter((item) => item.estado === "REVISAR").length,
        sinVerificar: resultados.filter(
          (item) => item.estado === "SIN_VERIFICAR"
        ).length,
      },
      resultados,
    });
  } catch (error) {
    console.error("ERROR REVISANDO INCONSISTENCIAS DE CREDITOS:", error);
    return NextResponse.json(
      { error: "No se pudo completar la revision de inconsistencias" },
      { status: 500 }
    );
  }
}
