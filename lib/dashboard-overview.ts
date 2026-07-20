import prisma from "@/lib/prisma";

const ESTADOS_APROBACION_PRESTAMO = [
  "PENDIENTE",
  "PAGO_PENDIENTE_APROBACION",
  "DEVOLUCION_PENDIENTE",
];

const ESTADOS_PRESTAMO_ACTIVO = ["APROBADO"];
const ESTADOS_INVENTARIO_ATENCION = ["PENDIENTE", "GARANTIA"];

type DashboardOperationalSummaryOptions = {
  sedeId?: number | null;
  incluirBodegaPrincipal?: boolean;
  puedeVerAprobacionesVenta?: boolean;
  puedeVerFacturacion?: boolean;
  fechaCorte?: Date | null;
};

function alcancePrestamos(sedeId?: number | null) {
  return sedeId
    ? {
        OR: [{ sedeOrigenId: sedeId }, { sedeDestinoId: sedeId }],
      }
    : {};
}

function esVentaAbierta(estado: string | null | undefined) {
  const normalizado = String(estado || "").trim().toUpperCase();
  return normalizado !== "CONVERTIDO_EN_VENTA" && normalizado !== "CANCELADO";
}

export async function getDashboardOperationalSummary(
  options: DashboardOperationalSummaryOptions = {}
) {
  const sedeId = options.sedeId ?? null;
  const scopeInventario = sedeId ? { sedeId } : {};
  const scopeRegistros = sedeId ? { sedeId } : {};
  const scopePrestamos = alcancePrestamos(sedeId);
  const scopeFecha = options.fechaCorte
    ? { createdAt: { lt: options.fechaCorte } }
    : {};

  const [
    inventarioSede,
    inventarioPrincipal,
    prestamosPorAprobar,
    prestamosActivos,
    inventarioAtencion,
    registrosVenta,
    facturasPendientes,
  ] = await Promise.all([
    prisma.inventarioSede.count({
      where: {
        estadoActual: "BODEGA",
        ...scopeInventario,
        ...scopeFecha,
      },
    }),
    options.incluirBodegaPrincipal
      ? prisma.inventarioPrincipal.count({
          where: {
            estado: "BODEGA",
            ...scopeFecha,
          },
        })
      : Promise.resolve(0),
    prisma.prestamoSede.count({
      where: {
        estado: {
          in: ESTADOS_APROBACION_PRESTAMO,
        },
        ...scopePrestamos,
        ...scopeFecha,
      },
    }),
    prisma.prestamoSede.count({
      where: {
        estado: {
          in: ESTADOS_PRESTAMO_ACTIVO,
        },
        ...scopePrestamos,
        ...scopeFecha,
      },
    }),
    prisma.inventarioSede.count({
      where: {
        estadoActual: {
          in: ESTADOS_INVENTARIO_ATENCION,
        },
        ...scopeInventario,
        ...scopeFecha,
      },
    }),
    options.puedeVerAprobacionesVenta
      ? prisma.registroVendedorVenta.findMany({
          where: {
            eliminadoEn: null,
            ventaIdRelacionada: null,
            ...scopeRegistros,
            ...scopeFecha,
          },
          select: {
            estadoVentaRegistro: true,
          },
        })
      : Promise.resolve([]),
    options.puedeVerFacturacion
      ? prisma.registroVendedorVenta.count({
          where: {
            eliminadoEn: null,
            estadoFacturacion: "PENDIENTE",
            ...scopeRegistros,
            ...scopeFecha,
          },
        })
      : Promise.resolve(0),
  ]);

  const ventasPendientes = registrosVenta.filter((registro) =>
    esVentaAbierta(registro.estadoVentaRegistro)
  ).length;
  const aprobacionesPendientes =
    prestamosPorAprobar + ventasPendientes + facturasPendientes;
  const pendientesTotal =
    aprobacionesPendientes + prestamosActivos + inventarioAtencion;

  return {
    equiposEnBodega: inventarioSede + inventarioPrincipal,
    aprobacionesPendientes,
    prestamosActivos,
    inventarioAtencion,
    pendientesTotal,
    detalleAprobaciones: {
      prestamos: prestamosPorAprobar,
      ventas: ventasPendientes,
      facturacion: facturasPendientes,
    },
  };
}

export type DashboardOperationalSummary = Awaited<
  ReturnType<typeof getDashboardOperationalSummary>
>;
