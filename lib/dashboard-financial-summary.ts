import prisma from "@/lib/prisma";
import {
  NOMBRE_SEDE_BODEGA,
  esDeudaEntreSedes,
  esDeudaProveedor,
  esEstadoDeuda,
  etiquetaSedeAcreedora,
} from "@/lib/prestamos";
import { extraerFinancierasDetalle } from "@/lib/ventas-financieras";

const CONCEPTO_GASTO_CARTERA = "GASTO CARTERA";
const MOVIMIENTOS_PAGO_FINANCIERO = [
  "PAGO_DEUDA_INVENTARIO",
  "PAGO_PRESTAMO_APROBADO",
  "PAGO_PRESTAMO_APROBADO_LOTE",
];

export type FinancialDashboardSummary = {
  cajaGeneralVentas: number;
  saldoCaja: number;
  cajaDisponible: number;
  transferenciasVentas: number;
  abonosTransferencia: number;
  saldoTransferencias: number;
  deudaEquipos: number;
  financieras: Record<string, number>;
  valorPendiente: number;
  valorGarantia: number;
  valorBodega: number;
  totalGastosCartera: number;
  prestamosPorCobrar: number;
};

type FinancialSnapshotRow = {
  periodKey: string;
  sedeId: number | null;
  fechaCorte: Date | string;
  summary: unknown;
  capturedAt: Date | string;
};

type HistoricalFinancialSnapshotSeed = {
  periodKey: string;
  sedeNombre: string;
  fechaCorte: string;
  capturedAt: string;
  expectedTotals: {
    activos: number;
    pasivos: number;
    resultadoNeto: number;
  };
  summary: FinancialDashboardSummary;
};

// Cierres reconstruidos con los respaldos visuales tomados el 31/07/2026.
const HISTORICAL_FINANCIAL_SNAPSHOT_SEEDS: HistoricalFinancialSnapshotSeed[] = [
  {
    periodKey: "2026-07",
    sedeNombre: "SEDE 3",
    fechaCorte: "2026-08-01T05:00:00.000Z",
    capturedAt: "2026-08-01T04:50:31.000Z",
    expectedTotals: {
      activos: 1_146_028_750.4,
      pasivos: 817_976_552,
      resultadoNeto: 328_052_198.4,
    },
    summary: {
      cajaGeneralVentas: 100_182_332,
      saldoCaja: 0,
      cajaDisponible: 100_182_332,
      transferenciasVentas: 66_950_941,
      abonosTransferencia: 0,
      saldoTransferencias: 66_950_941,
      deudaEquipos: 538_660_000,
      financieras: { "TOTAL CIERRE JULIO 2026": 874_310_477.4 },
      valorPendiente: 4_390_000,
      valorGarantia: 1_335_000,
      valorBodega: 71_055_000,
      totalGastosCartera: 273_591_552,
      prestamosPorCobrar: 33_530_000,
    },
  },
  {
    periodKey: "2026-07",
    sedeNombre: "SEDE 6",
    fechaCorte: "2026-08-01T05:00:00.000Z",
    capturedAt: "2026-08-01T04:50:31.000Z",
    expectedTotals: {
      activos: 1_498_975_792.82,
      pasivos: 661_655_383,
      resultadoNeto: 837_320_409.82,
    },
    summary: {
      cajaGeneralVentas: 88_526_098,
      saldoCaja: 0,
      cajaDisponible: 88_526_098,
      transferenciasVentas: 82_123_300,
      abonosTransferencia: 0,
      saldoTransferencias: 82_123_300,
      deudaEquipos: 713_355_000,
      financieras: { "TOTAL CIERRE JULIO 2026": 1_234_296_394.82 },
      valorPendiente: 15_507_000,
      valorGarantia: 2_840_000,
      valorBodega: 64_255_000,
      totalGastosCartera: -70_046_617,
      prestamosPorCobrar: 29_775_000,
    },
  },
  {
    periodKey: "2026-07",
    sedeNombre: "SEDE 7",
    fechaCorte: "2026-08-01T05:00:00.000Z",
    capturedAt: "2026-08-01T04:50:31.000Z",
    expectedTotals: {
      activos: 835_280_661.06,
      pasivos: 366_169_970,
      resultadoNeto: 469_110_691.06,
    },
    summary: {
      cajaGeneralVentas: 73_475_514,
      saldoCaja: 0,
      cajaDisponible: 73_475_514,
      transferenciasVentas: 66_554_500,
      abonosTransferencia: 0,
      saldoTransferencias: 66_554_500,
      deudaEquipos: 358_760_000,
      financieras: { "TOTAL CIERRE JULIO 2026": 571_350_647.06 },
      valorPendiente: 900_000,
      valorGarantia: 330_000,
      valorBodega: 87_160_000,
      totalGastosCartera: 6_179_970,
      prestamosPorCobrar: 36_740_000,
    },
  },
];

let ensureFinancialMonthlySnapshotsPromise: Promise<void> | null = null;

function n(v: unknown) {
  if (!v) return 0;

  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }

  return Number(v || 0);
}

function agregarFinancieraNeta(
  mapa: Record<string, number>,
  nombre: string,
  valor: number
) {
  const valorNumero = n(valor);
  if (!valorNumero) return;

  if (!mapa[nombre]) {
    mapa[nombre] = 0;
  }

  mapa[nombre] += valorNumero;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (!value) {
    return fallback;
  }

  return value as T;
}

function normalizeFinancialSummary(value: unknown): FinancialDashboardSummary {
  const record = parseJsonColumn<Record<string, unknown>>(value, {});
  const financierasRecord = isRecord(record.financieras)
    ? record.financieras
    : {};
  const financieras: Record<string, number> = {};

  for (const [nombre, valor] of Object.entries(financierasRecord)) {
    financieras[nombre] = n(valor);
  }

  return {
    cajaGeneralVentas: n(record.cajaGeneralVentas),
    saldoCaja: n(record.saldoCaja),
    cajaDisponible: n(record.cajaDisponible),
    transferenciasVentas: n(record.transferenciasVentas),
    abonosTransferencia: n(record.abonosTransferencia),
    saldoTransferencias: n(record.saldoTransferencias),
    deudaEquipos: n(record.deudaEquipos),
    financieras,
    valorPendiente: n(record.valorPendiente),
    valorGarantia: n(record.valorGarantia),
    valorBodega: n(record.valorBodega),
    totalGastosCartera: n(record.totalGastosCartera),
    prestamosPorCobrar: n(record.prestamosPorCobrar),
  };
}

export function calcularTotalesFinancieros(summary: FinancialDashboardSummary) {
  const totalFinancieras = Object.values(summary.financieras || {}).reduce(
    (acc, valor) => acc + n(valor),
    0
  );
  const activos =
    summary.cajaDisponible +
    summary.saldoTransferencias +
    summary.prestamosPorCobrar +
    summary.valorBodega +
    totalFinancieras;
  const pasivos =
    summary.deudaEquipos +
    summary.valorPendiente +
    summary.valorGarantia +
    summary.totalGastosCartera;

  return {
    totalFinancieras,
    activos,
    pasivos,
    resultadoNeto: activos - pasivos,
  };
}

function financialAmountsMatch(actual: number, expected: number) {
  return Math.abs(actual - expected) < 0.005;
}

async function restoreHistoricalFinancialMonthlySnapshots() {
  for (const seed of HISTORICAL_FINANCIAL_SNAPSHOT_SEEDS) {
    const totals = calcularTotalesFinancieros(seed.summary);

    if (
      !financialAmountsMatch(totals.activos, seed.expectedTotals.activos) ||
      !financialAmountsMatch(totals.pasivos, seed.expectedTotals.pasivos) ||
      !financialAmountsMatch(
        totals.resultadoNeto,
        seed.expectedTotals.resultadoNeto
      )
    ) {
      throw new Error(
        `El cierre historico ${seed.periodKey} de ${seed.sedeNombre} no cuadra.`
      );
    }

    const affectedRows = await prisma.$executeRawUnsafe(
      `
        INSERT INTO dashboard_financial_monthly_snapshots (
          period_key,
          sede_scope,
          sede_id,
          fecha_corte,
          summary_json,
          activos,
          pasivos,
          resultado_neto,
          captured_at
        )
        SELECT
          $1,
          sede.id,
          sede.id,
          $3::timestamptz,
          $4::jsonb,
          $5,
          $6,
          $7,
          $8::timestamptz
        FROM "Sede" AS sede
        WHERE UPPER(TRIM(sede.nombre)) = UPPER(TRIM($2))
        ON CONFLICT (period_key, sede_scope) DO UPDATE SET
          sede_id = EXCLUDED.sede_id,
          fecha_corte = EXCLUDED.fecha_corte,
          summary_json = EXCLUDED.summary_json,
          activos = EXCLUDED.activos,
          pasivos = EXCLUDED.pasivos,
          resultado_neto = EXCLUDED.resultado_neto,
          captured_at = EXCLUDED.captured_at
      `,
      seed.periodKey,
      seed.sedeNombre,
      seed.fechaCorte,
      JSON.stringify(seed.summary),
      totals.activos,
      totals.pasivos,
      totals.resultadoNeto,
      seed.capturedAt
    );

    if (affectedRows !== 1) {
      throw new Error(
        `No se encontro la sede para restaurar el cierre de ${seed.sedeNombre}.`
      );
    }
  }
}

function getSnapshotScope(sedeId?: number | null) {
  return sedeId && sedeId > 0 ? sedeId : 0;
}

function isClosedFinancialPeriod(fechaCorte: Date | null) {
  return Boolean(fechaCorte && new Date().getTime() >= fechaCorte.getTime());
}

function mapFinancialSnapshotRow(row: FinancialSnapshotRow) {
  return {
    periodKey: row.periodKey,
    sedeId: row.sedeId,
    fechaCorte:
      row.fechaCorte instanceof Date
        ? row.fechaCorte.toISOString()
        : new Date(row.fechaCorte).toISOString(),
    capturedAt:
      row.capturedAt instanceof Date
        ? row.capturedAt.toISOString()
        : new Date(row.capturedAt).toISOString(),
    summary: normalizeFinancialSummary(row.summary),
  };
}

async function ensureFinancialMonthlySnapshotsTable() {
  if (!ensureFinancialMonthlySnapshotsPromise) {
    ensureFinancialMonthlySnapshotsPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS dashboard_financial_monthly_snapshots (
          id SERIAL PRIMARY KEY,
          period_key TEXT NOT NULL,
          sede_scope INTEGER NOT NULL DEFAULT 0,
          sede_id INTEGER,
          fecha_corte TIMESTAMPTZ NOT NULL,
          summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          activos DOUBLE PRECISION NOT NULL DEFAULT 0,
          pasivos DOUBLE PRECISION NOT NULL DEFAULT 0,
          resultado_neto DOUBLE PRECISION NOT NULL DEFAULT 0,
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_financial_monthly_snapshots_period_scope
        ON dashboard_financial_monthly_snapshots (period_key, sede_scope)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_dashboard_financial_monthly_snapshots_captured_at
        ON dashboard_financial_monthly_snapshots (captured_at DESC)
      `);

      await restoreHistoricalFinancialMonthlySnapshots();
    })().catch((error) => {
      ensureFinancialMonthlySnapshotsPromise = null;
      throw error;
    });
  }

  await ensureFinancialMonthlySnapshotsPromise;
}

async function getFinancialMonthlySnapshot(periodKey: string, sedeId?: number | null) {
  await ensureFinancialMonthlySnapshotsTable();

  const rows = await prisma.$queryRawUnsafe<FinancialSnapshotRow[]>(
    `
      SELECT
        period_key AS "periodKey",
        sede_id AS "sedeId",
        fecha_corte AS "fechaCorte",
        summary_json AS "summary",
        captured_at AS "capturedAt"
      FROM dashboard_financial_monthly_snapshots
      WHERE period_key = $1 AND sede_scope = $2
      LIMIT 1
    `,
    periodKey,
    getSnapshotScope(sedeId)
  );

  return rows[0] ? mapFinancialSnapshotRow(rows[0]) : null;
}

async function saveFinancialMonthlySnapshot(input: {
  periodKey: string;
  sedeId?: number | null;
  fechaCorte: Date;
  summary: FinancialDashboardSummary;
}) {
  await ensureFinancialMonthlySnapshotsTable();

  const totals = calcularTotalesFinancieros(input.summary);
  const rows = await prisma.$queryRawUnsafe<FinancialSnapshotRow[]>(
    `
      INSERT INTO dashboard_financial_monthly_snapshots (
        period_key,
        sede_scope,
        sede_id,
        fecha_corte,
        summary_json,
        activos,
        pasivos,
        resultado_neto
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      ON CONFLICT (period_key, sede_scope) DO NOTHING
      RETURNING
        period_key AS "periodKey",
        sede_id AS "sedeId",
        fecha_corte AS "fechaCorte",
        summary_json AS "summary",
        captured_at AS "capturedAt"
    `,
    input.periodKey,
    getSnapshotScope(input.sedeId),
    input.sedeId ?? null,
    input.fechaCorte,
    JSON.stringify(input.summary),
    totals.activos,
    totals.pasivos,
    totals.resultadoNeto
  );

  if (rows[0]) {
    return mapFinancialSnapshotRow(rows[0]);
  }

  return getFinancialMonthlySnapshot(input.periodKey, input.sedeId);
}

function estadoInventarioAlCorte(item: {
  estadoActual?: string | null;
  estadoAnterior?: string | null;
  fechaMovimiento?: Date | null;
}, fechaCorte: Date | null) {
  const cambioDespuesDelCorte =
    fechaCorte &&
    item.fechaMovimiento &&
    item.fechaMovimiento.getTime() >= fechaCorte.getTime();

  return String(
    cambioDespuesDelCorte && item.estadoAnterior
      ? item.estadoAnterior
      : item.estadoActual || ""
  )
    .trim()
    .toUpperCase();
}

function estadoFinancieroAlCorte(
  item: {
    imei?: string | null;
    sedeId?: number | null;
    estadoFinanciero?: string | null;
  },
  pagosDespuesDelCorte: Set<string>
) {
  const estadoActual = String(item.estadoFinanciero || "").trim().toUpperCase();

  if (
    estadoActual === "PAGO" &&
    item.imei &&
    item.sedeId &&
    pagosDespuesDelCorte.has(`${item.imei}:${item.sedeId}`)
  ) {
    return "DEUDA";
  }

  return estadoActual;
}

export async function getDashboardCashSummary(options?: {
  sedeId?: number | null;
  fechaCorte?: Date | null;
}) {
  const fechaCorte = options?.fechaCorte ?? null;
  const whereSede = options?.sedeId ? { sedeId: options.sedeId } : {};
  const whereFechaVenta = fechaCorte
    ? { fecha: { lt: fechaCorte }, createdAt: { lt: fechaCorte } }
    : {};

  const [ventas, movimientosCaja] = await Promise.all([
    prisma.venta.aggregate({
      where: {
        ...whereSede,
        ...whereFechaVenta,
      },
      _sum: {
        cajaOficina: true,
      },
    }),
    prisma.cajaMovimiento.groupBy({
      by: ["tipo"],
      where: {
        ...whereSede,
        ...(fechaCorte ? { createdAt: { lt: fechaCorte } } : {}),
        tipo: {
          in: ["INGRESO", "EGRESO"],
        },
        NOT: {
          concepto: CONCEPTO_GASTO_CARTERA,
        },
      },
      _sum: {
        valor: true,
      },
    }),
  ]);

  const valorMovimiento = (tipo: "INGRESO" | "EGRESO") =>
    n(
      movimientosCaja.find((movimiento) => movimiento.tipo === tipo)?._sum
        .valor
    );
  const cajaGeneralVentas = n(ventas._sum.cajaOficina);
  const saldoCaja =
    valorMovimiento("INGRESO") - valorMovimiento("EGRESO");

  return {
    cajaGeneralVentas,
    saldoCaja,
    cajaDisponible: cajaGeneralVentas + saldoCaja,
  };
}

export async function getFinancialDashboardSummary(options?: {
  sedeId?: number | null;
  fechaCorte?: Date | null;
}): Promise<FinancialDashboardSummary> {
  const fechaCorte = options?.fechaCorte ?? null;
  const whereSede = options?.sedeId ? { sedeId: options.sedeId } : {};
  const whereFechaVenta = fechaCorte
    ? { fecha: { lt: fechaCorte }, createdAt: { lt: fechaCorte } }
    : {};
  const whereFechaCreacion = fechaCorte
    ? { createdAt: { lt: fechaCorte } }
    : {};
  const sedeCoberturaId = options?.sedeId ?? null;
  const sedeBodegaPrincipal = await prisma.sede.findFirst({
    where: {
      nombre: {
        equals: NOMBRE_SEDE_BODEGA,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
  });
  const sedeBodegaId = sedeBodegaPrincipal?.id ?? -1;

  const wherePrestamosPorCobrar = {
    ...(sedeCoberturaId ? { sedeOrigenId: sedeCoberturaId } : {}),
    estado: {
      in: fechaCorte
        ? ["APROBADO", "PAGO_PENDIENTE_APROBACION", "PAGADO"]
        : ["APROBADO", "PAGO_PENDIENTE_APROBACION"],
    },
    ...(fechaCorte
      ? {
          createdAt: { lt: fechaCorte },
          OR: [
            { fechaAprobacionPago: null },
            { fechaAprobacionPago: { gte: fechaCorte } },
          ],
        }
      : {}),
  };

  const [
    ventas,
    movimientosCaja,
    inventarioSede,
    abonos,
    gastosCartera,
    prestamosActivosPorCobrar,
    movimientosPagoDespuesDelCorte,
  ] = await Promise.all([
    prisma.venta.findMany({
      where: {
        ...whereSede,
        ...whereFechaVenta,
      },
      select: {
        cajaOficina: true,
        ingreso1: true,
        ingreso2: true,
        primerValor: true,
        segundoValor: true,
        financierasDetalle: true,
        alcanos: true,
        payjoy: true,
        sistecredito: true,
        addi: true,
        sumaspay: true,
        celya: true,
        bogota: true,
        alocredit: true,
        esmio: true,
        kaiowa: true,
        finser: true,
        gora: true,
      },
    }),
    prisma.cajaMovimiento.findMany({
      where: {
        ...whereSede,
        ...whereFechaCreacion,
        NOT: {
          concepto: CONCEPTO_GASTO_CARTERA,
        },
      },
      select: {
        tipo: true,
        valor: true,
      },
    }),
    prisma.inventarioSede.findMany({
      where: {
        ...whereSede,
        ...whereFechaCreacion,
      },
      select: {
        imei: true,
        sedeId: true,
        costo: true,
        estadoActual: true,
        estadoAnterior: true,
        fechaMovimiento: true,
        estadoFinanciero: true,
      },
    }),
    prisma.abonoFinanciero.findMany({
      where: {
        ...whereSede,
        ...whereFechaCreacion,
      },
      select: {
        tipo: true,
        entidad: true,
        valor: true,
      },
    }),
    prisma.gastoCartera.findMany({
      where: {
        ...whereSede,
        ...whereFechaCreacion,
      },
      select: {
        valor: true,
      },
    }),
    prisma.prestamoSede.findMany({
      where: wherePrestamosPorCobrar,
      select: {
        imei: true,
        costo: true,
        sedeOrigenId: true,
        sedeDestinoId: true,
      },
    }),
    fechaCorte
      ? prisma.movimientoInventario.findMany({
          where: {
            ...(options?.sedeId ? { sedeId: options.sedeId } : {}),
            createdAt: {
              gte: fechaCorte,
            },
            tipoMovimiento: {
              in: MOVIMIENTOS_PAGO_FINANCIERO,
            },
          },
          select: {
            imei: true,
            sedeId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const sedesOrigenPrestamos =
    prestamosActivosPorCobrar.length > 0
      ? await prisma.sede.findMany({
          where: {
            id: {
              in: Array.from(
                new Set(
                  prestamosActivosPorCobrar.map(
                    (prestamo) => prestamo.sedeOrigenId
                  )
                )
              ),
            },
          },
          select: {
            id: true,
            nombre: true,
          },
        })
      : [];

  const inventarioDestinoPrestamos =
    prestamosActivosPorCobrar.length > 0
      ? await prisma.inventarioSede.findMany({
          where: {
            OR: prestamosActivosPorCobrar.map((prestamo) => ({
              imei: prestamo.imei,
              sedeId: prestamo.sedeDestinoId,
            })),
          },
          select: {
            imei: true,
            sedeId: true,
            deboA: true,
            estadoFinanciero: true,
            origen: true,
            inventarioPrincipalId: true,
          },
        })
      : [];

  let cajaGeneralVentas = 0;
  let transferenciasVentas = 0;
  const financieras: Record<string, number> = {};

  for (const venta of ventas) {
    cajaGeneralVentas += n(venta.cajaOficina);

    const ingreso1 = String(venta.ingreso1 || "").trim().toUpperCase();
    const ingreso2 = String(venta.ingreso2 || "").trim().toUpperCase();

    if (ingreso1 === "TRANSFERENCIA") {
      transferenciasVentas += n(venta.primerValor);
    }
    if (ingreso2 === "TRANSFERENCIA") {
      transferenciasVentas += n(venta.segundoValor);
    }

    const detalleFinancieras = extraerFinancierasDetalle(
      venta as Record<string, unknown>
    );

    for (const financiera of detalleFinancieras) {
      agregarFinancieraNeta(
        financieras,
        String(financiera.nombre || "").trim().toUpperCase(),
        n(financiera.valorNeto)
      );
    }
  }

  let abonosTransferencia = 0;
  const abonosFinancieras: Record<string, number> = {};

  for (const abono of abonos) {
    const tipo = String(abono.tipo || "").trim().toUpperCase();

    if (tipo === "TRANSFERENCIA") {
      abonosTransferencia += n(abono.valor);
    } else if (tipo === "FINANCIERA") {
      const entidad = String(abono.entidad || "").trim().toUpperCase();
      if (!abonosFinancieras[entidad]) {
        abonosFinancieras[entidad] = 0;
      }
      abonosFinancieras[entidad] += n(abono.valor);
    }
  }

  for (const [nombre, valorNeto] of Object.entries(financieras)) {
    financieras[nombre] = valorNeto - n(abonosFinancieras[nombre]);
  }

  const ingresosCaja = movimientosCaja
    .filter((m) => String(m.tipo || "").trim().toUpperCase() === "INGRESO")
    .reduce((acc, m) => acc + n(m.valor), 0);

  const egresosCaja = movimientosCaja
    .filter((m) => String(m.tipo || "").trim().toUpperCase() === "EGRESO")
    .reduce((acc, m) => acc + n(m.valor), 0);

  const saldoCaja = ingresosCaja - egresosCaja;
  const pagosDespuesDelCorte = new Set(
    movimientosPagoDespuesDelCorte
      .filter((item) => item.imei && item.sedeId)
      .map((item) => `${item.imei}:${item.sedeId}`)
  );
  const deudaEquipos = inventarioSede
    .filter(
      (i) =>
        estadoFinancieroAlCorte(i, pagosDespuesDelCorte) === "DEUDA"
    )
    .reduce((acc, i) => acc + n(i.costo), 0);
  const valorPendiente = inventarioSede
    .filter((i) => estadoInventarioAlCorte(i, fechaCorte) === "PENDIENTE")
    .reduce((acc, i) => acc + n(i.costo), 0);
  const valorGarantia = inventarioSede
    .filter((i) => estadoInventarioAlCorte(i, fechaCorte) === "GARANTIA")
    .reduce((acc, i) => acc + n(i.costo), 0);
  const valorBodega = inventarioSede
    .filter((i) => estadoInventarioAlCorte(i, fechaCorte) === "BODEGA")
    .reduce((acc, i) => acc + n(i.costo), 0);
  const totalGastosCartera = gastosCartera.reduce(
    (acc, item) => acc + n(item.valor),
    0
  );

  const inventarioPrestadoPorDestino = new Map(
    inventarioDestinoPrestamos.map((item) => [`${item.imei}:${item.sedeId}`, item])
  );
  const sedesOrigenPorId = new Map(
    sedesOrigenPrestamos.map((sede) => [sede.id, sede.nombre])
  );

  const prestamosPorCobrarHistorico = prestamosActivosPorCobrar.reduce(
    (acc, item) => acc + n(item.costo),
    0
  );

  const prestamosPorCobrar = fechaCorte
    ? prestamosPorCobrarHistorico
    : prestamosActivosPorCobrar.reduce((acc, item) => {
        const inventarioDestino = inventarioPrestadoPorDestino.get(
          `${item.imei}:${item.sedeDestinoId}`
        );

        if (
          !inventarioDestino ||
          !esEstadoDeuda(inventarioDestino.estadoFinanciero)
        ) {
          return acc;
        }

        const prestamoDesdePrincipal =
          item.sedeOrigenId === sedeBodegaId &&
          ((String(inventarioDestino.origen || "").trim().toUpperCase() ===
            "PRINCIPAL" ||
            !!inventarioDestino.inventarioPrincipalId) &&
            esDeudaProveedor(inventarioDestino.deboA));

        if (prestamoDesdePrincipal) {
          return esDeudaProveedor(inventarioDestino.deboA)
            ? acc + n(item.costo)
            : acc;
        }

        if (
          esDeudaEntreSedes(inventarioDestino.deboA) &&
          String(inventarioDestino.deboA || "").trim().toUpperCase() ===
            etiquetaSedeAcreedora(
              item.sedeOrigenId,
              sedesOrigenPorId.get(item.sedeOrigenId)
            )
              .trim()
              .toUpperCase()
        ) {
          return acc + n(item.costo);
        }

        return acc;
      }, 0);

  return {
    cajaGeneralVentas,
    saldoCaja,
    cajaDisponible: cajaGeneralVentas + saldoCaja,
    transferenciasVentas,
    abonosTransferencia,
    saldoTransferencias: transferenciasVentas - abonosTransferencia,
    deudaEquipos,
    financieras,
    valorPendiente,
    valorGarantia,
    valorBodega,
    totalGastosCartera,
    prestamosPorCobrar,
  };
}

export async function getFinancialDashboardSummaryForMonthlyReport(options: {
  periodKey: string;
  sedeId?: number | null;
  fechaCorte?: Date | null;
}) {
  const fechaCorte = options.fechaCorte ?? null;

  if (!fechaCorte || !isClosedFinancialPeriod(fechaCorte)) {
    return {
      source: "live" as const,
      snapshot: null,
      summary: await getFinancialDashboardSummary({
        sedeId: options.sedeId,
        fechaCorte,
      }),
    };
  }

  const existingSnapshot = await getFinancialMonthlySnapshot(
    options.periodKey,
    options.sedeId
  );

  if (existingSnapshot) {
    return {
      source: "snapshot" as const,
      snapshot: existingSnapshot,
      summary: existingSnapshot.summary,
    };
  }

  const summary = await getFinancialDashboardSummary({
    sedeId: options.sedeId,
    fechaCorte,
  });
  const snapshot = await saveFinancialMonthlySnapshot({
    periodKey: options.periodKey,
    sedeId: options.sedeId,
    fechaCorte,
    summary,
  });

  return {
    source: "snapshot" as const,
    snapshot,
    summary: snapshot?.summary ?? summary,
  };
}
