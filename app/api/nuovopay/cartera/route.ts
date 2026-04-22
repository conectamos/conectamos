import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isNuovoPayConfigured, lockNuovoPayDevices, searchNuovoPayDevices } from "@/lib/nuovopay";
import { normalizeCedula, parseCarteraTxt } from "@/lib/cartera-import";

export const runtime = "nodejs";

const PREVIEW_ROWS = 10;
const TOP_LIMIT = 10;
const BLOCK_LIMIT = 20;

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

function hasCriticalState(value: string | null | undefined) {
  const normalized = String(value || "").toUpperCase();
  return (
    normalized.includes("PREJURIDICO") ||
    normalized.includes("JURIDICO") ||
    normalized.includes("CASTIGADO") ||
    normalized.includes("MORA") ||
    normalized.includes("VENC")
  );
}

function byMoneyDesc(a: number | null | undefined, b: number | null | undefined) {
  return (b || 0) - (a || 0);
}

function buildAnalytics(rows: Array<Parameters<typeof serializeRegistro>[0]>) {
  const serialized = rows.map(serializeRegistro);

  const blockCandidates = serialized
    .filter((item) => item.diasVencido > 5)
    .sort((a, b) => {
      if (b.diasVencido !== a.diasVencido) {
        return b.diasVencido - a.diasVencido;
      }

      return byMoneyDesc(a.saldoObligacion, b.saldoObligacion);
    })
    .slice(0, BLOCK_LIMIT);

  const topGoodClients = serialized
    .filter(
      (item) =>
        item.diasVencido <= 0 &&
        !hasCriticalState(item.estado) &&
        !hasCriticalState(item.estadoGestion) &&
        !item.abonoInsuficiente &&
        !item.beneficioPerdido &&
        item.cuotasPendientes !== null
    )
    .sort((a, b) => {
      if ((a.cuotasPendientes ?? 999) !== (b.cuotasPendientes ?? 999)) {
        return (a.cuotasPendientes ?? 999) - (b.cuotasPendientes ?? 999);
      }

      const aperturaA = a.fechaApertura ? new Date(a.fechaApertura).getTime() : Number.MAX_SAFE_INTEGER;
      const aperturaB = b.fechaApertura ? new Date(b.fechaApertura).getTime() : Number.MAX_SAFE_INTEGER;
      if (aperturaA !== aperturaB) {
        return aperturaA - aperturaB;
      }

      return byMoneyDesc(a.saldoObligacion, b.saldoObligacion);
    })
    .slice(0, TOP_LIMIT);

  const topNearFinishClients = serialized
    .filter(
      (item) =>
        item.cuotasPendientes !== null &&
        item.cuotasPendientes > 0 &&
        item.cuotasPendientes <= 2
    )
    .sort((a, b) => {
      if ((a.cuotasPendientes ?? 99) !== (b.cuotasPendientes ?? 99)) {
        return (a.cuotasPendientes ?? 99) - (b.cuotasPendientes ?? 99);
      }

      if (a.diasVencido !== b.diasVencido) {
        return a.diasVencido - b.diasVencido;
      }

      return byMoneyDesc(a.saldoObligacion, b.saldoObligacion);
    })
    .slice(0, TOP_LIMIT);

  return {
    totalBloqueables: blockCandidates.length,
    totalBuenosClientes: topGoodClients.length,
    totalPorFinalizar: topNearFinishClients.length,
    blockCandidates,
    topGoodClients,
    topNearFinishClients,
  };
}

function exactCedulaMatch(value: string | null | undefined, cedula: string) {
  return normalizeCedula(value) === cedula;
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

    const totalMoraMayorCinco = rows.filter((item) => item.diasVencido > 5).length;

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
        diasVencido: { gt: 5 },
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
        mensaje: "No hay registros con mora mayor a 5 dias para bloquear.",
        ...responsePayload(latestImport),
      });
    }

    const byCedula = new Map<string, typeof registros>();

    for (const registro of registros) {
      const current = byCedula.get(registro.cedula) ?? [];
      current.push(registro);
      byCedula.set(registro.cedula, current);
    }

    let totalCedulasAnalizadas = 0;
    let totalCoincidenciasNuovo = 0;
    let totalBloqueados = 0;
    let totalYaBloqueados = 0;
    let totalSinCoincidencia = 0;

    for (const [cedula, items] of byCedula) {
      totalCedulasAnalizadas += 1;

      const matches = (await searchNuovoPayDevices(cedula)).filter(
        (device) =>
          exactCedulaMatch(device.name, cedula) ||
          exactCedulaMatch(device.customerName, cedula)
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
            resultadoBloqueo: "Sin coincidencia exacta en Nuovo por cedula.",
          },
        });
        continue;
      }

      totalCoincidenciasNuovo += 1;

      const device = matches[0];
      let blockedNow = false;
      let alreadyLocked = false;

      if (device.locked) {
        alreadyLocked = true;
        totalYaBloqueados += 1;
      } else {
        await lockNuovoPayDevices([device.deviceId]);
        blockedNow = true;
        totalBloqueados += 1;
      }

      const resultMessage = alreadyLocked
        ? "El dispositivo ya estaba bloqueado en Nuovo."
        : blockedNow
          ? "Bloqueo aplicado correctamente en Nuovo."
          : "Coincidencia encontrada en Nuovo.";

      await prisma.registroCarteraNuovo.updateMany({
        where: {
          id: {
            in: items.map((item) => item.id),
          },
        },
        data: {
          deviceId: device.deviceId,
          deviceName: device.name,
          deviceImei: device.imei || device.imei2,
          bloqueoAplicado: true,
          bloqueadoEn: blockedNow ? new Date() : null,
          resultadoBloqueo: resultMessage,
        },
      });
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
      mensaje: `Bloqueo masivo procesado para ${totalCedulasAnalizadas} cedulas.`,
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
