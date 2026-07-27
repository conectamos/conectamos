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
  getBogotaDateKey,
  getBogotaMonthRangeFromInput,
  getTodayBogotaDateKey,
} from "@/lib/ventas-utils";
import { normalizeDateKey, shiftDateKey } from "@/lib/credit-date-utils";
import {
  isPayJoyRetailConfigured,
  obtenerCreditoPayJoyPorImei,
  obtenerCreditosPayJoyEnRango,
} from "@/lib/payjoy-retail";
import {
  isFinserpayConsultaConfigured,
  obtenerCreditoFinserpayPorImei,
} from "@/lib/finserpayconsulta";
import {
  isAloConsultaConfigured,
  obtenerCreditoAloParaRegistro,
} from "@/lib/aloconsulta";
import {
  isSumasConsultaConfigured,
  obtenerCreditoSumasPayPorCedula,
  obtenerCreditosSumasPayPorCedulasEnRango,
} from "@/lib/sumasconsulta";
import {
  isEsmioOpcionConsultaConfigured,
  obtenerCreditoEsmioOpcionPorCedula,
  obtenerCreditosEsmioOpcionPorCedulasEnRango,
} from "@/lib/esmiopcionconsulta";
import {
  isAddiConsultaConfigured,
  obtenerCreditoAddiPorCedula,
  obtenerCreditosAddiPorCedulasEnRango,
} from "@/lib/addiconsulta";

type Proveedor =
  | "PAYJOY"
  | "FINSER"
  | "ALO CREDIT"
  | "SUMASPAY"
  | "ESMIO"
  | "ADDI";
type ProveedorMensual = Extract<
  Proveedor,
  "PAYJOY" | "SUMASPAY" | "ESMIO" | "ADDI"
>;

type EstadoRevision =
  | "COINCIDE"
  | "INCONSISTENTE"
  | "REVISAR"
  | "SIN_VERIFICAR"
  | "REVISADO";

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

type CreditoOficialMensual = {
  creditoAutorizado: number;
  fechaCreacionCredito: string;
  ordenId: string | null;
};

type ResultadoConsultaMensual =
  | { ok: true; creditos: CreditoOficialMensual[] }
  | { ok: false; error: string };

const PROVEEDORES_POR_CEDULA = new Set<Proveedor>([
  "ALO CREDIT",
  "SUMASPAY",
  "ESMIO",
  "ADDI",
]);
const PROVEEDORES_MENSUALES = new Set<Proveedor>([
  "PAYJOY",
  "SUMASPAY",
  "ESMIO",
  "ADDI",
]);
const GRUPOS_POR_PAGINA_MENSUAL: Record<
  ProveedorMensual,
  number
> = {
  PAYJOY: Number.MAX_SAFE_INTEGER,
  SUMASPAY: 4,
  ESMIO: 80,
  ADDI: 8,
};
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

function esProveedorMensual(
  proveedor: Proveedor | null
): proveedor is ProveedorMensual {
  return Boolean(proveedor && PROVEEDORES_MENSUALES.has(proveedor));
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
      credito = await obtenerCreditoAloParaRegistro(identificador);
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

function identificadorConsulta(item: ItemRevision) {
  return PROVEEDORES_POR_CEDULA.has(item.proveedor)
    ? soloDigitos(item.documentoNumero)
    : soloDigitos(item.serialImei);
}

function claveGrupoMensual(item: ItemRevision) {
  const identificador = identificadorConsulta(item);

  return identificador
    ? `${item.proveedor}:${identificador}`
    : `${item.proveedor}:REGISTRO:${item.registroId}`;
}

function diferenciaDias(fechaA: string | null, fechaB: string | null) {
  if (!fechaA || !fechaB) {
    return Number.MAX_SAFE_INTEGER;
  }

  const a = Date.parse(`${fechaA}T00:00:00.000Z`);
  const b = Date.parse(`${fechaB}T00:00:00.000Z`);

  return Number.isFinite(a) && Number.isFinite(b)
    ? Math.abs(a - b)
    : Number.MAX_SAFE_INTEGER;
}

function asignarCreditosMensuales(
  items: ItemRevision[],
  creditos: CreditoOficialMensual[]
) {
  const asignaciones = new Map<number, CreditoOficialMensual>();
  const usados = new Set<number>();
  const indicesItems = items
    .map((_, index) => index)
    .sort(
      (a, b) => items[a].createdAt.getTime() - items[b].createdAt.getTime()
    );

  const asignar = (
    itemIndex: number,
    candidatos: Array<{ credito: CreditoOficialMensual; index: number }>
  ) => {
    if (candidatos.length === 0) {
      return false;
    }

    const fechaRegistro = getBogotaDateKey(items[itemIndex].createdAt);
    const elegido = candidatos.sort(
      (a, b) =>
        diferenciaDias(a.credito.fechaCreacionCredito, fechaRegistro) -
        diferenciaDias(b.credito.fechaCreacionCredito, fechaRegistro)
    )[0];

    usados.add(elegido.index);
    asignaciones.set(itemIndex, elegido.credito);
    return true;
  };

  // Primero consume coincidencias exactas de valor. La fecha solo desempata
  // cuál operación corresponde; nunca genera una inconsistencia.
  for (const itemIndex of indicesItems) {
    const registrado = items[itemIndex].creditoAutorizado;

    if (registrado === null) {
      continue;
    }

    asignar(
      itemIndex,
      creditos
        .map((credito, index) => ({ credito, index }))
        .filter(
          ({ credito, index }) =>
            !usados.has(index) &&
            Math.round(credito.creditoAutorizado) === Math.round(registrado)
        )
    );
  }

  // Las operaciones restantes se emparejan por cercanía de fecha únicamente
  // para poder mostrar ambos valores cuando difieren.
  for (const itemIndex of indicesItems) {
    if (asignaciones.has(itemIndex)) {
      continue;
    }

    asignar(
      itemIndex,
      creditos
        .map((credito, index) => ({ credito, index }))
        .filter(({ index }) => !usados.has(index))
    );
  }

  return asignaciones;
}

function resumenResultados(
  resultados: Array<{ registroId: number; estado: EstadoRevision }>
) {
  return {
    registrosAnalizados: new Set(resultados.map((item) => item.registroId)).size,
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
    revisados: resultados.filter((item) => item.estado === "REVISADO").length,
  };
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

async function consultarCreditosMensuales(
  proveedor: ProveedorMensual,
  identificadores: string[],
  fechaInicio: Date,
  fechaFin: Date,
  fechaDesde: string,
  fechaHasta: string
) {
  const consultas = new Map<string, ResultadoConsultaMensual>();
  const diasFallidos = new Map<string, string>();
  const errorConfiguracion = `La consulta de ${proveedor} no esta configurada en el servidor.`;

  if (identificadores.length === 0) {
    return { consultas, diasFallidos };
  }

  if (!proveedorConfigurado(proveedor)) {
    for (const identificador of identificadores) {
      consultas.set(identificador, {
        ok: false,
        error: errorConfiguracion,
      });
    }

    return { consultas, diasFallidos };
  }

  try {
    if (proveedor === "PAYJOY") {
      const respuesta = await obtenerCreditosPayJoyEnRango(
        fechaInicio,
        fechaFin
      );

      for (const identificador of identificadores) {
        consultas.set(identificador, {
          ok: true,
          creditos: respuesta.creditos
            .filter((credito) => credito.imei === identificador)
            .map((credito) => ({
              creditoAutorizado: credito.creditoAutorizado,
              fechaCreacionCredito: credito.fechaCreacionCredito,
              ordenId: credito.ordenId,
            })),
        });
      }

      for (const fallo of respuesta.diasFallidos) {
        diasFallidos.set(fallo.fecha, fallo.error);
      }
    } else if (proveedor === "SUMASPAY") {
      const respuesta = await obtenerCreditosSumasPayPorCedulasEnRango(
        identificadores,
        fechaDesde,
        fechaHasta
      );

      for (const item of respuesta) {
        consultas.set(
          soloDigitos(item.documento),
          item.error
            ? { ok: false, error: item.error }
            : {
                ok: true,
                creditos: item.creditos.map((credito) => ({
                  creditoAutorizado: credito.creditoAutorizado,
                  fechaCreacionCredito: credito.fechaCreacionCredito,
                  ordenId: credito.ordenId,
                })),
              }
        );
      }
    } else if (proveedor === "ESMIO") {
      const respuesta =
        await obtenerCreditosEsmioOpcionPorCedulasEnRango(
          identificadores,
          fechaDesde,
          fechaHasta
        );

      for (const item of respuesta) {
        consultas.set(
          soloDigitos(item.documento),
          item.error
            ? { ok: false, error: item.error }
            : {
                ok: true,
                creditos: item.creditos.map((credito) => ({
                  creditoAutorizado: credito.creditoAutorizado,
                  fechaCreacionCredito: credito.fechaCreacionCredito,
                  ordenId: credito.ordenId,
                })),
              }
        );
      }
    } else {
      const respuesta = await obtenerCreditosAddiPorCedulasEnRango(
        identificadores,
        fechaDesde,
        fechaHasta
      );

      for (const item of respuesta) {
        consultas.set(
          soloDigitos(item.documento),
          item.error
            ? { ok: false, error: item.error }
            : {
                ok: true,
                creditos: item.creditos.map((credito) => ({
                  creditoAutorizado: credito.creditoAutorizado,
                  fechaCreacionCredito: credito.fechaCreacionCredito,
                  ordenId: credito.ordenId,
                })),
              }
        );
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `No se pudo consultar ${proveedor}.`;

    for (const identificador of identificadores) {
      consultas.set(identificador, { ok: false, error: message });
    }
  }

  for (const identificador of identificadores) {
    if (!consultas.has(identificador)) {
      consultas.set(identificador, {
        ok: false,
        error: `${proveedor} no devolvio una respuesta para este identificador.`,
      });
    }
  }

  return { consultas, diasFallidos };
}

async function revisarInconsistenciasPorRango(
  url: URL,
  session: {
    perfilId?: number | null;
    perfilTipo?: unknown;
    rolNombre?: string | null;
  }
) {
  const mes = String(url.searchParams.get("mes") || "").trim();
  let desde = String(url.searchParams.get("desde") || "").trim();
  let hasta = String(url.searchParams.get("hasta") || "").trim();
  const proveedor = identificarProveedor(url.searchParams.get("proveedor"));
  const rangoMes = mes ? getBogotaMonthRangeFromInput(mes) : null;
  const mesActual = getTodayBogotaDateKey().slice(0, 7);
  const hoy = getTodayBogotaDateKey();

  if (rangoMes && !desde && !hasta && mes <= mesActual) {
    desde = `${mes}-01`;
    hasta = getBogotaDateKey(
      new Date(Math.min(rangoMes.end.getTime() - 1, Date.now()))
    );
  }

  const rangoDesde = getBogotaDayRangeFromInput(desde);
  const rangoHasta = getBogotaDayRangeFromInput(hasta);
  const rango =
    rangoDesde && rangoHasta
      ? { start: rangoDesde.start, end: rangoHasta.end }
      : null;
  const cursorRaw = String(url.searchParams.get("cursor") || "0");
  const cursor = Number(cursorRaw);
  const snapshotRaw = String(url.searchParams.get("snapshot") || "").trim();
  const ahora = new Date();
  const snapshotSolicitado = snapshotRaw ? new Date(snapshotRaw) : ahora;
  const snapshot =
    snapshotSolicitado.getTime() > ahora.getTime()
      ? ahora
      : snapshotSolicitado;

  if (
    !rango ||
    getBogotaDateKey(rango.start) !== desde ||
    getBogotaDateKey(new Date(rango.end.getTime() - 1)) !== hasta ||
    desde > hasta ||
    hasta > hoy
  ) {
    return NextResponse.json(
      {
        error:
          "Selecciona un rango valido: la fecha inicial no puede superar la final ni incluir fechas futuras.",
      },
      { status: 400 }
    );
  }

  if (!esProveedorMensual(proveedor)) {
    return NextResponse.json(
      {
        error:
          "La revision por rango esta disponible para PAYJOY, SUMASPAY, ESMIO y ADDI.",
      },
      { status: 400 }
    );
  }

  if (!Number.isInteger(cursor) || cursor < 0) {
    return NextResponse.json(
      { error: "El cursor de la revision por rango no es valido." },
      { status: 400 }
    );
  }

  if (Number.isNaN(snapshot.getTime())) {
    return NextResponse.json(
      { error: "La referencia temporal de la revision por rango no es valida." },
      { status: 400 }
    );
  }

  const registros = await prisma.registroVendedorVenta.findMany({
    where: {
      ...construirScope(session),
      eliminadoEn: null,
      createdAt: {
        gte: rango.start,
        lt: rango.end,
        lte: snapshot,
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const items: ItemRevision[] = registros.flatMap((registro) =>
    extraerDetalles(registro).flatMap((detalle) => {
      const proveedorDetalle = identificarProveedor(
        detalle.plataformaCredito
      );

      if (proveedorDetalle !== proveedor) {
        return [];
      }

      return [
        {
          ...detalle,
          registroId: registro.id,
          createdAt: registro.createdAt,
          clienteNombre: registro.clienteNombre,
          documentoNumero: registro.documentoNumero,
          serialImei: registro.serialImei,
          puntoVenta: registro.puntoVenta,
          asesorNombre: registro.asesorNombre,
          proveedor,
        } satisfies ItemRevision,
      ];
    })
  );
  const gruposMap = new Map<string, ItemRevision[]>();

  for (const item of items) {
    const key = claveGrupoMensual(item);
    const grupo = gruposMap.get(key) || [];
    grupo.push(item);
    gruposMap.set(key, grupo);
  }

  const grupos = Array.from(gruposMap.entries()).sort(
    (a, b) =>
      b[1][0].createdAt.getTime() - a[1][0].createdAt.getTime() ||
      b[1][0].registroId - a[1][0].registroId
  );
  const limite = GRUPOS_POR_PAGINA_MENSUAL[proveedor];
  const gruposPagina = grupos.slice(cursor, cursor + limite);
  const itemsPagina = gruposPagina.flatMap(([, grupo]) => grupo);
  const identificadores = Array.from(
    new Set(
      itemsPagina.map(identificadorConsulta).filter((item) => Boolean(item))
    )
  );
  const plataforma = await consultarCreditosMensuales(
    proveedor,
    identificadores,
    rango.start,
    rango.end,
    desde,
    hasta
  );
  const revisiones = await prisma.revisionInconsistenciaCredito.findMany({
    where: {
      registroId: {
        in: itemsPagina.map((item) => item.registroId),
      },
    },
    select: {
      registroId: true,
      proveedor: true,
      revisadoPor: true,
      updatedAt: true,
    },
  });
  const revisionesPorItem = new Map(
    revisiones.map((revision) => [
      `${revision.registroId}:${revision.proveedor}`,
      revision,
    ])
  );
  const resultados = gruposPagina.flatMap(([, grupo]) => {
    const identificador = identificadorConsulta(grupo[0]);
    const consulta = identificador
      ? plataforma.consultas.get(identificador)
      : {
          ok: false as const,
          error:
            proveedor === "PAYJOY"
              ? "El registro no tiene un IMEI valido para consultar."
              : "El registro no tiene una cedula valida para consultar.",
        };
    const asignaciones =
      consulta?.ok === true
        ? asignarCreditosMensuales(grupo, consulta.creditos)
        : new Map<number, CreditoOficialMensual>();

    return grupo.map((item, itemIndex) => {
      const razones: string[] = [];
      const creditoPlataforma = asignaciones.get(itemIndex) || null;
      let estado: EstadoRevision = "COINCIDE";

      if (!consulta || !consulta.ok) {
        estado = "SIN_VERIFICAR";
        razones.push(
          consulta && !consulta.ok
            ? consulta.error
            : "No se obtuvo respuesta de la plataforma."
        );
      } else if (
        proveedor === "PAYJOY" &&
        plataforma.diasFallidos.size > 0 &&
        (!creditoPlataforma ||
          item.creditoAutorizado === null ||
          Math.round(item.creditoAutorizado) !==
            Math.round(creditoPlataforma.creditoAutorizado))
      ) {
        estado = "SIN_VERIFICAR";
        razones.push(
          `PAYJOY no pudo completar ${plataforma.diasFallidos.size} dia(s) del rango. No se marca una diferencia hasta consultar el periodo completo.`
        );
      } else if (!creditoPlataforma) {
        estado = "INCONSISTENTE";
        razones.push(
          `No se encontro en ${proveedor} un credito disponible dentro del rango para este ${
            proveedor === "PAYJOY" ? "IMEI" : "documento"
          }.`
        );
      } else {
        compararNumero(
          razones,
          "Credito autorizado",
          item.creditoAutorizado,
          creditoPlataforma.creditoAutorizado
        );

        if (razones.length > 0) {
          estado = "INCONSISTENTE";
        }
      }

      const revision = revisionesPorItem.get(
        `${item.registroId}:${item.proveedor}`
      );

      if (revision && estado !== "COINCIDE") {
        estado = "REVISADO";
        razones.unshift(
          `Marcado como revisado por ${revision.revisadoPor} el ${revision.updatedAt.toLocaleString(
            "es-CO",
            {
              timeZone: "America/Bogota",
            }
          )}.`
        );
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
        identificadorTipo: proveedor === "PAYJOY" ? "IMEI" : "CEDULA",
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
  });
  const cursorSiguiente =
    cursor + gruposPagina.length < grupos.length
      ? cursor + gruposPagina.length
      : null;

  return NextResponse.json({
    ok: true,
    modo: "RANGO",
    desde,
    hasta,
    proveedor,
    alcance: "CREDITO_AUTORIZADO",
    limitado: false,
    maxRegistros: 0,
    paginacion: {
      snapshot: snapshot.toISOString(),
      cursor,
      cursorSiguiente,
      completo: cursorSiguiente === null,
      gruposProcesados: gruposPagina.length,
      gruposTotales: grupos.length,
      creditosTotales: items.length,
    },
    resumen: resumenResultados(resultados),
    resultados,
  });
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

    if (
      url.searchParams.has("desde") ||
      url.searchParams.has("hasta") ||
      url.searchParams.has("mes")
    ) {
      await ensureVendorProfilesSchema();
      return revisarInconsistenciasPorRango(url, session);
    }

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
    const revisiones = await prisma.revisionInconsistenciaCredito.findMany({
      where: {
        registroId: {
          in: registrosRevisables.map((registro) => registro.id),
        },
      },
      select: {
        registroId: true,
        proveedor: true,
        revisadoPor: true,
        updatedAt: true,
      },
    });
    const revisionesPorItem = new Map(
      revisiones.map((revision) => [
        `${revision.registroId}:${revision.proveedor}`,
        revision,
      ])
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
          item.proveedor === "ALO CREDIT"
            ? "No se encontro en ALO CREDIT un credito reciente para esta cedula."
            : `No se encontro en ${item.proveedor} un credito reciente para este ${
                PROVEEDORES_POR_CEDULA.has(item.proveedor)
                  ? "documento"
                  : "IMEI"
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

        if (
          creditoPlataforma.documento &&
          soloDigitos(item.documentoNumero) !== creditoPlataforma.documento
        ) {
          razones.push(
            `La cedula del registro no coincide con la reportada por ${item.proveedor}.`
          );
        }

        if (
          !PROVEEDORES_POR_CEDULA.has(item.proveedor) &&
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

      const revision = revisionesPorItem.get(
        `${item.registroId}:${item.proveedor}`
      );

      if (revision && estado !== "COINCIDE") {
        estado = "REVISADO";
        razones.unshift(
          `Marcado como revisado por ${revision.revisadoPor} el ${revision.updatedAt.toLocaleString("es-CO", {
            timeZone: "America/Bogota",
          })}.`
        );
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
        revisados: resultados.filter((item) => item.estado === "REVISADO")
          .length,
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

export async function POST(req: Request) {
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
        {
          error:
            "Solo supervisor, auditor o administrador pueden revisar inconsistencias",
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const registroId = Number(body.registroId);
    const proveedor = identificarProveedor(body.proveedor);

    if (!Number.isInteger(registroId) || registroId <= 0 || !proveedor) {
      return NextResponse.json(
        { error: "Registro o financiera no validos" },
        { status: 400 }
      );
    }

    await ensureVendorProfilesSchema();

    const registro = await prisma.registroVendedorVenta.findFirst({
      where: {
        id: registroId,
        ...construirScope(session),
        eliminadoEn: null,
      },
      select: {
        id: true,
      },
    });

    if (!registro) {
      return NextResponse.json(
        { error: "No se encontro el registro autorizado" },
        { status: 404 }
      );
    }

    const revisadoPor =
      session.perfilNombre || session.nombre || "Usuario desconocido";
    const revision = await prisma.revisionInconsistenciaCredito.upsert({
      where: {
        registroId_proveedor: {
          registroId,
          proveedor,
        },
      },
      create: {
        registroId,
        proveedor,
        revisadoPor,
      },
      update: {
        revisadoPor,
      },
      select: {
        registroId: true,
        proveedor: true,
        revisadoPor: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      revision: {
        ...revision,
        updatedAt: revision.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("ERROR MARCANDO INCONSISTENCIA COMO REVISADA:", error);
    return NextResponse.json(
      { error: "No se pudo guardar la revision" },
      { status: 500 }
    );
  }
}
