import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isNuovoPayConfigured, lockNuovoPayDevices, searchNuovoPayDevices } from "@/lib/nuovopay";
import { normalizeCedula, parseCarteraTxt } from "@/lib/cartera-import";

export const runtime = "nodejs";

const PREVIEW_ROWS = 10;
const NEAR_FINISH_LIMIT = 20;
const BLOCKING_MORA_MIN_DAYS = 2;
const MORA_BUCKETS = [
  { id: "al_dia", label: "Al dia", range: "0 dias", minDays: Number.NEGATIVE_INFINITY, maxDays: 0 },
  { id: "mora_leve", label: "Mora leve", range: "1 a 2 dias", minDays: 1, maxDays: 2 },
  { id: "mora_media", label: "Mora media", range: "3 a 7 dias", minDays: 3, maxDays: 7 },
  { id: "mora_alta", label: "Mora alta", range: "8 a 30 dias", minDays: 8, maxDays: 30 },
  { id: "mora_critica", label: "Mora critica", range: "31+ dias", minDays: 31, maxDays: null },
] as const;

type ImportSummary = Awaited<ReturnType<typeof getLatestImportSummary>>;

type RegistroAnalitico = {
  id: number;
  cedula: string;
  numeroCredito: string | null;
  modalidad: string | null;
  sucursal: string | null;
  ubicacion: string | null;
  diasVencido: number;
  cuotasPendientes: number | null;
  valorCuota: number | null;
  saldoObligacion: number | null;
  estadoGestion: string | null;
  estado: string | null;
  abogado: string | null;
  abonoInsuficiente: boolean;
  beneficioPerdido: boolean;
  fechaApertura: string | null;
  fechaProximaCuota: string | null;
  ultimoAbonoEn: string | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceImei: string | null;
  bloqueoAplicado: boolean;
  resultadoBloqueo: string | null;
};

function groupByCedula<T extends { cedula: string }>(items: T[]) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const current = groups.get(item.cedula) ?? [];
    current.push(item);
    groups.set(item.cedula, current);
  }

  return Array.from(groups.values());
}

function countUniqueCedulas<T extends { cedula: string }>(items: T[]) {
  return new Set(items.map((item) => item.cedula)).size;
}

function serializeRegistro(item: {
  id: number;
  cedula: string;
  numeroCredito: string | null;
  modalidad: string | null;
  sucursal: string | null;
  ubicacion: string | null;
  diasVencido: number;
  cuotasPendientes: number | null;
  valorCuota: number | null;
  saldoObligacion: number | null;
  estadoGestion: string | null;
  estado: string | null;
  abogado: string | null;
  abonoInsuficiente: boolean;
  beneficioPerdido: boolean;
  fechaApertura: Date | null;
  fechaProximaCuota: Date | null;
  ultimoAbonoEn: Date | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceImei: string | null;
  bloqueoAplicado: boolean;
  resultadoBloqueo: string | null;
}): RegistroAnalitico {
  return {
    id: item.id,
    cedula: item.cedula,
    numeroCredito: item.numeroCredito,
    modalidad: item.modalidad,
    sucursal: item.sucursal,
    ubicacion: item.ubicacion,
    diasVencido: item.diasVencido,
    cuotasPendientes: item.cuotasPendientes,
    valorCuota: item.valorCuota,
    saldoObligacion: item.saldoObligacion,
    estadoGestion: item.estadoGestion,
    estado: item.estado,
    abogado: item.abogado,
    abonoInsuficiente: item.abonoInsuficiente,
    beneficioPerdido: item.beneficioPerdido,
    fechaApertura: item.fechaApertura?.toISOString() ?? null,
    fechaProximaCuota: item.fechaProximaCuota?.toISOString() ?? null,
    ultimoAbonoEn: item.ultimoAbonoEn?.toISOString() ?? null,
    deviceId: item.deviceId,
    deviceName: item.deviceName,
    deviceImei: item.deviceImei,
    bloqueoAplicado: item.bloqueoAplicado,
    resultadoBloqueo: item.resultadoBloqueo,
  };
}

function byMoneyDesc(a: number | null | undefined, b: number | null | undefined) {
  return (b || 0) - (a || 0);
}

function isAdminUser(rolNombre: string | null | undefined) {
  return String(rolNombre || "").toUpperCase() === "ADMIN";
}

function isWithinMoraRange(
  diasVencido: number,
  bucket: (typeof MORA_BUCKETS)[number]
) {
  return (
    diasVencido >= bucket.minDays &&
    (bucket.maxDays === null || diasVencido <= bucket.maxDays)
  );
}

function sumSaldo(items: RegistroAnalitico[]) {
  return items.reduce((total, item) => total + Number(item.saldoObligacion || 0), 0);
}

function isNearFinishClient(item: RegistroAnalitico) {
  return (
    item.cuotasPendientes !== null &&
    item.cuotasPendientes > 0 &&
    item.cuotasPendientes <= 2
  );
}

function isProcessingError(item: RegistroAnalitico) {
  return String(item.resultadoBloqueo || "")
    .toLowerCase()
    .startsWith("error procesando bloqueo");
}

function compareBlockCandidates(a: RegistroAnalitico, b: RegistroAnalitico) {
  if (b.diasVencido !== a.diasVencido) {
    return b.diasVencido - a.diasVencido;
  }

  return byMoneyDesc(a.saldoObligacion, b.saldoObligacion);
}

function compareNearFinishClients(a: RegistroAnalitico, b: RegistroAnalitico) {
  if ((a.cuotasPendientes ?? 99) !== (b.cuotasPendientes ?? 99)) {
    return (a.cuotasPendientes ?? 99) - (b.cuotasPendientes ?? 99);
  }

  if (a.diasVencido !== b.diasVencido) {
    return a.diasVencido - b.diasVencido;
  }

  return byMoneyDesc(a.saldoObligacion, b.saldoObligacion);
}

function pickBestRecord(
  items: RegistroAnalitico[],
  predicate: (item: RegistroAnalitico) => boolean,
  compare: (a: RegistroAnalitico, b: RegistroAnalitico) => number
) {
  const candidates = items.filter(predicate);

  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort(compare)[0];
}

function buildAnalytics(rows: Array<Parameters<typeof serializeRegistro>[0]>) {
  const serialized = rows.map(serializeRegistro);
  const groupedByCedula = groupByCedula(serialized);
  const creditosEnMora = serialized.filter((item) => item.diasVencido > 0);

  const blockCandidates = groupedByCedula
    .map((items) =>
      pickBestRecord(
        items,
        (item) => item.diasVencido >= BLOCKING_MORA_MIN_DAYS,
        compareBlockCandidates
      )
    )
    .filter((item): item is RegistroAnalitico => item !== null)
    .sort(compareBlockCandidates);

  const errorRows = groupedByCedula
    .map((items) =>
      pickBestRecord(items, isProcessingError, compareBlockCandidates)
    )
    .filter((item): item is RegistroAnalitico => item !== null)
    .sort(compareBlockCandidates);

  const nearFinishCandidates = groupedByCedula
    .map((items) => pickBestRecord(items, isNearFinishClient, compareNearFinishClients))
    .filter((item): item is RegistroAnalitico => item !== null)
    .sort(compareNearFinishClients);

  const topNearFinishClients = nearFinishCandidates.slice(0, NEAR_FINISH_LIMIT);
  const moraBuckets = MORA_BUCKETS.map((bucket) => {
    const items = serialized.filter((item) => isWithinMoraRange(item.diasVencido, bucket));

    return {
      id: bucket.id,
      label: bucket.label,
      range: bucket.range,
      totalCreditos: items.length,
      saldo: sumSaldo(items),
      percentage: serialized.length
        ? Number(((items.length / serialized.length) * 100).toFixed(1))
        : 0,
    };
  });
  const maxBucketCount = moraBuckets.reduce(
    (currentMax, bucket) => Math.max(currentMax, bucket.totalCreditos),
    0
  );

  return {
    totalBloqueables: blockCandidates.length,
    totalErrores: errorRows.length,
    totalPorFinalizar: nearFinishCandidates.length,
    totalCreditos: serialized.length,
    creditosEnMora: creditosEnMora.length,
    porcentajeCreditosEnMora: serialized.length
      ? Number(((creditosEnMora.length / serialized.length) * 100).toFixed(1))
      : 0,
    saldoTotal: sumSaldo(serialized),
    saldoEnMora: sumSaldo(creditosEnMora),
    moraBuckets,
    maxBucketCount,
    blockCandidates,
    errorRows,
    topNearFinishClients,
  };
}

function exactCedulaMatch(value: string | null | undefined, cedula: string) {
  return normalizeCedula(value) === cedula;
}

function uniqueNuovoMatches<
  T extends { deviceId: number; name: string | null; customerName: string | null }
>(devices: T[], cedula: string) {
  const unique = new Map<number, T>();

  for (const device of devices) {
    if (
      !exactCedulaMatch(device.name, cedula) &&
      !exactCedulaMatch(device.customerName, cedula)
    ) {
      continue;
    }

    if (!unique.has(device.deviceId)) {
      unique.set(device.deviceId, device);
    }
  }

  return Array.from(unique.values());
}

function buildBlockingResultMessage(
  totalMatches: number,
  blockedNow: number,
  alreadyLocked: number
) {
  const fragments = [
    totalMatches === 1
      ? "Coincidencia exacta encontrada en Nuovo."
      : `${totalMatches} dispositivos coinciden exactamente en Nuovo.`,
  ];

  if (blockedNow > 0) {
    fragments.push(
      blockedNow === 1
        ? "1 dispositivo fue bloqueado ahora."
        : `${blockedNow} dispositivos fueron bloqueados ahora.`
    );
  }

  if (alreadyLocked > 0) {
    fragments.push(
      alreadyLocked === 1
        ? "1 dispositivo ya estaba bloqueado."
        : `${alreadyLocked} dispositivos ya estaban bloqueados.`
    );
  }

  return fragments.join(" ");
}

async function getLatestImportSummary() {
  const latest = await prisma.cargaCarteraNuovo.findFirst({
    orderBy: { id: "desc" },
    include: {
      subidoPor: {
        select: {
          id: true,
          nombre: true,
          usuario: true,
        },
      },
    },
  });

  if (!latest) {
    return null;
  }

  const registros = await prisma.registroCarteraNuovo.findMany({
    where: {
      cargaId: latest.id,
    },
    orderBy: [{ diasVencido: "desc" }, { id: "asc" }],
    select: {
      id: true,
      cedula: true,
      numeroCredito: true,
      modalidad: true,
      sucursal: true,
      ubicacion: true,
      diasVencido: true,
      cuotasPendientes: true,
      valorCuota: true,
      saldoObligacion: true,
      estadoGestion: true,
      estado: true,
      abogado: true,
      abonoInsuficiente: true,
      beneficioPerdido: true,
      fechaApertura: true,
      fechaProximaCuota: true,
      ultimoAbonoEn: true,
      deviceId: true,
      deviceName: true,
      deviceImei: true,
      bloqueoAplicado: true,
      resultadoBloqueo: true,
    },
  });

  return {
    id: latest.id,
    nombreArchivo: latest.nombreArchivo,
    totalRegistros: latest.totalRegistros,
    totalMoraMayorCinco: latest.totalMoraMayorCinco,
    totalCedulasAnalizadas: latest.totalCedulasAnalizadas,
    totalCoincidenciasNuovo: latest.totalCoincidenciasNuovo,
    totalBloqueados: latest.totalBloqueados,
    totalYaBloqueados: latest.totalYaBloqueados,
    totalSinCoincidencia: latest.totalSinCoincidencia,
    procesadoBloqueoEn: latest.procesadoBloqueoEn?.toISOString() ?? null,
    createdAt: latest.createdAt.toISOString(),
    updatedAt: latest.updatedAt.toISOString(),
    subidoPor: latest.subidoPor,
    previewRows: registros.slice(0, PREVIEW_ROWS).map(serializeRegistro),
    analytics: buildAnalytics(registros),
  };
}

function responsePayload(latestImport: ImportSummary) {
  return {
    configured: isNuovoPayConfigured(),
    latestImport,
  };
}

function getTextFile(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Debes seleccionar un archivo de cartera en formato TXT.");
  }

  return file;
}

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!isAdminUser(user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el admin puede acceder a Nuovo / Cartera." },
        { status: 403 }
      );
    }

    const latestImport = await getLatestImportSummary();

    return NextResponse.json(responsePayload(latestImport));
  } catch (error) {
    console.error("ERROR CONSULTANDO CARTERA NUOVO:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando cartera de Nuovo Pay",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!isAdminUser(user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el admin puede acceder a Nuovo / Cartera." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = getTextFile(formData);
    const content = await file.text();
    const rows = parseCarteraTxt(content);

    if (!rows.length) {
      return NextResponse.json(
        { error: "El archivo no contiene registros validos para importar." },
        { status: 400 }
      );
    }

    const totalMoraMayorCinco = countUniqueCedulas(
      rows.filter((item) => item.diasVencido >= BLOCKING_MORA_MIN_DAYS)
    );

    const carga = await prisma.$transaction(async (tx) => {
      const created = await tx.cargaCarteraNuovo.create({
        data: {
          nombreArchivo: file.name || "cartera.txt",
          totalRegistros: rows.length,
          totalMoraMayorCinco,
          subidoPorId: user.id,
        },
      });

      await tx.registroCarteraNuovo.createMany({
        data: rows.map((item) => ({
          cargaId: created.id,
          cedula: item.cedula,
          numeroCredito: item.numeroCredito,
          modalidad: item.modalidad,
          sucursal: item.sucursal,
          ubicacion: item.ubicacion,
          diasVencido: item.diasVencido,
          cuotasPendientes: item.cuotasPendientes,
          valorCuota: item.valorCuota,
          saldoObligacion: item.saldoObligacion,
          saldoCapital: item.saldoCapital,
          saldoGarantia: item.saldoGarantia,
          estadoGestion: item.estadoGestion,
          estado: item.estado,
          garantia: item.garantia,
          marca: item.marca,
          abogado: item.abogado,
          abonoInsuficiente: item.abonoInsuficiente,
          beneficioPerdido: item.beneficioPerdido,
          fechaApertura: item.fechaApertura,
          fechaConsulta: item.fechaConsulta,
          fechaProximaCuota: item.fechaProximaCuota,
          ultimoAbonoEn: item.ultimoAbonoEn,
        })),
      });

      return created;
    });

    const latestImport = await getLatestImportSummary();

    return NextResponse.json({
      ok: true,
      mensaje: `Archivo cargado correctamente (${rows.length} registros).`,
      cargaId: carga.id,
      ...responsePayload(latestImport),
    });
  } catch (error) {
    console.error("ERROR IMPORTANDO CARTERA NUOVO:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error cargando archivo de cartera",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!isAdminUser(user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el admin puede acceder a Nuovo / Cartera." },
        { status: 403 }
      );
    }

    if (!isNuovoPayConfigured()) {
      return NextResponse.json(
        { error: "NUOVOPAY_API_TOKEN no esta configurado." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedImportId = Number(body?.cargaId || 0);

    const carga = requestedImportId
      ? await prisma.cargaCarteraNuovo.findUnique({
          where: { id: requestedImportId },
        })
      : await prisma.cargaCarteraNuovo.findFirst({
          orderBy: { id: "desc" },
        });

    if (!carga) {
      return NextResponse.json(
        { error: "No hay cargues de cartera disponibles." },
        { status: 404 }
      );
    }

    const registros = await prisma.registroCarteraNuovo.findMany({
      where: {
        cargaId: carga.id,
        diasVencido: { gte: BLOCKING_MORA_MIN_DAYS },
      },
      orderBy: [{ diasVencido: "desc" }, { id: "asc" }],
    });

    if (!registros.length) {
      await prisma.cargaCarteraNuovo.update({
        where: { id: carga.id },
        data: {
          totalCedulasAnalizadas: 0,
          totalCoincidenciasNuovo: 0,
          totalBloqueados: 0,
          totalYaBloqueados: 0,
          totalSinCoincidencia: 0,
          procesadoBloqueoEn: new Date(),
        },
      });

      const latestImport = await getLatestImportSummary();
      return NextResponse.json({
        ok: true,
        mensaje: `No hay registros con mora mayor o igual a ${BLOCKING_MORA_MIN_DAYS} dias para bloquear.`,
        ...responsePayload(latestImport),
      });
    }

    const byCedula = groupByCedula(registros);

    let totalCedulasAnalizadas = 0;
    let totalCoincidenciasNuovo = 0;
    let totalBloqueados = 0;
    let totalYaBloqueados = 0;
    let totalSinCoincidencia = 0;
    let erroresProcesamiento = 0;

    for (const items of byCedula) {
      const cedula = items[0]?.cedula || "";
      totalCedulasAnalizadas += 1;

      try {
        const matches = uniqueNuovoMatches(
          await searchNuovoPayDevices(cedula),
          cedula
        );

        if (!matches.length) {
          totalSinCoincidencia += 1;
          await prisma.registroCarteraNuovo.updateMany({
            where: {
              id: {
                in: items.map((item) => item.id),
              },
            },
            data: {
              bloqueoAplicado: false,
              resultadoBloqueo:
                "Sin coincidencia exacta en Nuovo por Device Name o Customer Name.",
            },
          });
          continue;
        }

        const devicesToLock = matches.filter((device) => !device.locked);
        const alreadyLockedDevices = matches.filter((device) => device.locked);

        if (devicesToLock.length) {
          await lockNuovoPayDevices(devicesToLock.map((device) => device.deviceId));
        }

        totalCoincidenciasNuovo += matches.length;
        totalBloqueados += devicesToLock.length;
        totalYaBloqueados += alreadyLockedDevices.length;

        const primaryDevice = matches[0];
        const previousBlockedAt =
          items.find((item) => item.bloqueadoEn)?.bloqueadoEn ?? null;
        const now = devicesToLock.length ? new Date() : previousBlockedAt;

        await prisma.registroCarteraNuovo.updateMany({
          where: {
            id: {
              in: items.map((item) => item.id),
            },
          },
          data: {
            deviceId: primaryDevice.deviceId,
            deviceName: primaryDevice.customerName || primaryDevice.name,
            deviceImei: primaryDevice.imei || primaryDevice.imei2,
            bloqueoAplicado: true,
            bloqueadoEn: now,
            resultadoBloqueo: buildBlockingResultMessage(
              matches.length,
              devicesToLock.length,
              alreadyLockedDevices.length
            ),
          },
        });
      } catch (error) {
        erroresProcesamiento += 1;
        await prisma.registroCarteraNuovo.updateMany({
          where: {
            id: {
              in: items.map((item) => item.id),
            },
          },
          data: {
            bloqueoAplicado: false,
            resultadoBloqueo:
              error instanceof Error
                ? `Error procesando bloqueo en Nuovo: ${error.message}`
                : "Error procesando bloqueo en Nuovo.",
          },
        });
      }
    }

    await prisma.cargaCarteraNuovo.update({
      where: { id: carga.id },
      data: {
        totalCedulasAnalizadas,
        totalCoincidenciasNuovo,
        totalBloqueados,
        totalYaBloqueados,
        totalSinCoincidencia,
        procesadoBloqueoEn: new Date(),
      },
    });

    const latestImport = await getLatestImportSummary();

    return NextResponse.json({
      ok: true,
      mensaje:
        erroresProcesamiento > 0
          ? `Bloqueo masivo procesado para ${totalCedulasAnalizadas} cedulas. ${erroresProcesamiento} ${erroresProcesamiento === 1 ? "quedo" : "quedaron"} con error y ${erroresProcesamiento === 1 ? "debe" : "deben"} revisarse abajo.`
          : `Bloqueo masivo procesado para ${totalCedulasAnalizadas} cedulas.`,
      ...responsePayload(latestImport),
    });
  } catch (error) {
    console.error("ERROR BLOQUEANDO CARTERA NUOVO:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error procesando bloqueo de cartera",
      },
      { status: 500 }
    );
  }
}
