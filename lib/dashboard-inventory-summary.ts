import prisma from "@/lib/prisma";

export type InventoryReferenceSummary = {
  referencia: string;
  total: number;
  bodegaPrincipal: number;
  sedes: number;
  deuda: number;
  pendiente: number;
  garantia: number;
  prestamo: number;
};

export type InventoryStaleItem = {
  imei: string;
  referencia: string;
  ubicacion: string;
  diasQuieto: number;
  ultimoMovimiento: Date;
};

export type InventoryAdminSummary = {
  totalEquipos: number;
  totalBodegaPrincipal: number;
  totalSedes: number;
  referenciasActivas: number;
  umbralStockBajo: number;
  umbralDiasQuieto: number;
  referencias: InventoryReferenceSummary[];
  referenciasBajoStock: InventoryReferenceSummary[];
  quietosEnBodega: InventoryStaleItem[];
};

const UMBRAL_STOCK_BAJO = 2;
const UMBRAL_DIAS_QUIETO = 45;

function normalizeReference(value: string | null | undefined) {
  return String(value || "SIN REFERENCIA")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function ensureReference(
  map: Map<string, InventoryReferenceSummary>,
  rawReference: string | null | undefined
) {
  const referencia = normalizeReference(rawReference);
  const existing = map.get(referencia);

  if (existing) {
    return existing;
  }

  const next: InventoryReferenceSummary = {
    referencia,
    total: 0,
    bodegaPrincipal: 0,
    sedes: 0,
    deuda: 0,
    pendiente: 0,
    garantia: 0,
    prestamo: 0,
  };

  map.set(referencia, next);
  return next;
}

function daysBetween(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / msPerDay));
}

function sortReferences(items: InventoryReferenceSummary[]) {
  return [...items].sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }

    return a.referencia.localeCompare(b.referencia, "es");
  });
}

export async function getAdminInventorySummary(): Promise<InventoryAdminSummary> {
  const now = new Date();

  const [principalRows, sedeRows, catalogoRows, sedes] = await Promise.all([
    prisma.inventarioPrincipal.findMany({
      select: {
        imei: true,
        referencia: true,
        estado: true,
        createdAt: true,
        fechaEnvio: true,
      },
    }),
    prisma.inventarioSede.findMany({
      select: {
        imei: true,
        referencia: true,
        sedeId: true,
        estadoActual: true,
        estadoFinanciero: true,
        fechaMovimiento: true,
        createdAt: true,
      },
    }),
    prisma.catalogoReferenciaInventario.findMany({
      where: {
        activo: true,
        eliminado: false,
      },
      select: {
        nombre: true,
      },
    }),
    prisma.sede.findMany({
      select: {
        id: true,
        nombre: true,
      },
    }),
  ]);

  const sedeNombreById = new Map(sedes.map((sede) => [sede.id, sede.nombre]));
  const principalActivo = principalRows.filter(
    (item) => String(item.estado || "BODEGA").trim().toUpperCase() === "BODEGA"
  );
  const sedesActivas = sedeRows.filter(
    (item) => String(item.estadoActual || "").trim().toUpperCase() !== "VENDIDO"
  );
  const referencias = new Map<string, InventoryReferenceSummary>();

  for (const item of catalogoRows) {
    ensureReference(referencias, item.nombre);
  }

  for (const item of principalActivo) {
    const ref = ensureReference(referencias, item.referencia);
    ref.total += 1;
    ref.bodegaPrincipal += 1;
  }

  for (const item of sedesActivas) {
    const ref = ensureReference(referencias, item.referencia);
    const estadoActual = String(item.estadoActual || "").trim().toUpperCase();
    const estadoFinanciero = String(item.estadoFinanciero || "").trim().toUpperCase();

    ref.total += 1;
    ref.sedes += 1;

    if (estadoFinanciero === "DEUDA") {
      ref.deuda += 1;
    }

    if (estadoActual === "PENDIENTE") {
      ref.pendiente += 1;
    } else if (estadoActual === "GARANTIA") {
      ref.garantia += 1;
    } else if (estadoActual === "PRESTAMO" || estadoActual === "PRESTAMO_POR_ACEPTAR") {
      ref.prestamo += 1;
    }
  }

  const bodegaItems = [
    ...principalActivo.map((item) => ({
      imei: item.imei,
      referencia: normalizeReference(item.referencia),
      ubicacion: "BODEGA PRINCIPAL",
      fallbackDate: item.fechaEnvio || item.createdAt,
    })),
    ...sedesActivas
      .filter(
        (item) =>
          String(item.estadoActual || "").trim().toUpperCase() === "BODEGA"
      )
      .map((item) => ({
        imei: item.imei,
        referencia: normalizeReference(item.referencia),
        ubicacion: sedeNombreById.get(item.sedeId) || "Sede sin configurar",
        fallbackDate: item.fechaMovimiento || item.createdAt,
      })),
  ];

  const imeisBodega = Array.from(new Set(bodegaItems.map((item) => item.imei)));
  const movimientos = imeisBodega.length
    ? await prisma.movimientoInventario.findMany({
        where: {
          imei: {
            in: imeisBodega,
          },
        },
        select: {
          imei: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    : [];
  const ultimoMovimientoByImei = new Map<string, Date>();

  for (const movimiento of movimientos) {
    if (!ultimoMovimientoByImei.has(movimiento.imei)) {
      ultimoMovimientoByImei.set(movimiento.imei, movimiento.createdAt);
    }
  }

  const quietosEnBodega = bodegaItems
    .map((item) => {
      const ultimoMovimiento =
        ultimoMovimientoByImei.get(item.imei) || item.fallbackDate;

      return {
        imei: item.imei,
        referencia: item.referencia,
        ubicacion: item.ubicacion,
        ultimoMovimiento,
        diasQuieto: daysBetween(ultimoMovimiento, now),
      };
    })
    .filter((item) => item.diasQuieto >= UMBRAL_DIAS_QUIETO)
    .sort((a, b) => {
      if (b.diasQuieto !== a.diasQuieto) {
        return b.diasQuieto - a.diasQuieto;
      }

      return a.referencia.localeCompare(b.referencia, "es");
    })
    .slice(0, 8);

  const referenciasOrdenadas = sortReferences(
    Array.from(referencias.values()).filter((item) => item.total > 0)
  );
  const referenciasBajoStock = Array.from(referencias.values())
    .filter((item) => item.total <= UMBRAL_STOCK_BAJO)
    .sort((a, b) => {
      if (a.total !== b.total) {
        return a.total - b.total;
      }

      return a.referencia.localeCompare(b.referencia, "es");
    })
    .slice(0, 8);

  return {
    totalEquipos: principalActivo.length + sedesActivas.length,
    totalBodegaPrincipal: principalActivo.length,
    totalSedes: sedesActivas.length,
    referenciasActivas: referenciasOrdenadas.length,
    umbralStockBajo: UMBRAL_STOCK_BAJO,
    umbralDiasQuieto: UMBRAL_DIAS_QUIETO,
    referencias: referenciasOrdenadas.slice(0, 8),
    referenciasBajoStock,
    quietosEnBodega,
  };
}
