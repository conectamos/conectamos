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

export async function getFinancialDashboardSummary(options?: {
  sedeId?: number | null;
  fechaCorte?: Date | null;
}) {
  const fechaCorte = options?.fechaCorte ?? null;
  const whereSede = options?.sedeId ? { sedeId: options.sedeId } : {};
  const whereFechaVenta = fechaCorte ? { fecha: { lt: fechaCorte } } : {};
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
