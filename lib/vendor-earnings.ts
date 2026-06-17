import prisma from "@/lib/prisma";
import {
  normalizarClaveReferenciaListaPrecio,
  obtenerListaPrecios,
} from "@/lib/price-list";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import {
  getBogotaDateKey,
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthRange,
} from "@/lib/ventas-utils";

const BOLSA_ESTADO_HABILITADA = "TOP10_HABILITADA";
const BOLSA_ESTADO_FUERA_TOP10 = "FUERA_TOP10";
const BOLSA_ESTADO_SIN_COMISION = "SIN_COMISION";
const BOLSA_PROFILE_TYPES = new Set(["VENDEDOR", "APOYO_OPERATIVO"]);
const UPDATE_CHUNK_SIZE = 50;

type RewardMonthRecord = {
  id: number;
  perfilVendedorId: number;
  referenciaEquipo: string | null;
  clienteNombre: string;
  createdAt: Date;
  bolsaGananciaHabilitada: boolean;
  bolsaGananciaValor: unknown;
  bolsaGananciaEstado: string | null;
  bolsaGananciaEvaluadaEn: Date | null;
  perfilVendedor: {
    nombre: string;
    tipo: string;
  } | null;
};

type RewardSnapshotUpdate = {
  id: number;
  bolsaGananciaHabilitada: boolean;
  bolsaGananciaValor: number;
  bolsaGananciaEstado: string;
  bolsaGananciaEvaluadaEn: Date;
};

type RankingEntry = {
  perfilId: number;
  nombre: string;
  total: number;
};

type CommissionCandidate = {
  claveExacta: string;
  claveBusqueda: string;
  comision: number;
};

type CommissionLookup = {
  exactMap: Map<string, number>;
  candidates: CommissionCandidate[];
};

export type VendorEarningsItem = {
  id: number;
  referencia: string;
  clienteNombre: string;
  valorComision: number;
  createdAt: Date;
};

export type VendorEarningsSummary = {
  bolsaHabilitada: boolean;
  puestoActual: number | null;
  ventasMes: number;
  mensajeEstado: string;
  periodoLabel: string;
  totalGanado: number;
  totalVentasConComision: number;
  totalReferenciasConComision: number;
  recientes: VendorEarningsItem[];
};

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isBolsaProfileType(value: unknown) {
  return BOLSA_PROFILE_TYPES.has(String(value || "").trim().toUpperCase());
}

function getMonthKeyFromDate(value: Date) {
  return getBogotaDateKey(value).slice(0, 7);
}

function sortRankingEntries(a: RankingEntry, b: RankingEntry) {
  if (b.total !== a.total) {
    return b.total - a.total;
  }

  const nameComparison = a.nombre.localeCompare(b.nombre, "es");

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return a.perfilId - b.perfilId;
}

function buildRankingEntries(
  counts: Map<number, number>,
  names: Map<number, string>
) {
  return Array.from(counts.entries())
    .filter(([, total]) => total > 0)
    .map(([perfilId, total]) => ({
      perfilId,
      nombre: names.get(perfilId) || `Perfil ${perfilId}`,
      total,
    }))
    .sort(sortRankingEntries);
}

function normalizarClaveBusquedaReferencia(value: unknown) {
  return normalizarClaveReferenciaListaPrecio(value)
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesReferenceCandidate(
  referenciaVenta: string,
  referenciaConfigurada: string
) {
  if (!referenciaVenta || !referenciaConfigurada) {
    return false;
  }

  return (
    referenciaVenta === referenciaConfigurada ||
    referenciaVenta.startsWith(`${referenciaConfigurada} `) ||
    referenciaVenta.endsWith(` ${referenciaConfigurada}`) ||
    referenciaVenta.includes(` ${referenciaConfigurada} `)
  );
}

function buildCommissionLookup(
  items: Awaited<ReturnType<typeof obtenerListaPrecios>>
) {
  const exactMap = new Map<string, number>();
  const searchMap = new Map<string, CommissionCandidate>();

  for (const item of [...items].sort(
    (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()
  )) {
    const claveExacta = normalizarClaveReferenciaListaPrecio(item.referencia);
    const claveBusqueda = normalizarClaveBusquedaReferencia(item.referencia);

    if (!claveExacta) {
      continue;
    }

    exactMap.set(claveExacta, Number(item.comisionVendedor || 0));

    if (!claveBusqueda) {
      continue;
    }

    searchMap.set(claveBusqueda, {
      claveExacta,
      claveBusqueda,
      comision: Number(item.comisionVendedor || 0),
    });
  }

  return {
    exactMap,
    candidates: Array.from(searchMap.values()).sort((a, b) => {
      if (b.claveBusqueda.length !== a.claveBusqueda.length) {
        return b.claveBusqueda.length - a.claveBusqueda.length;
      }

      return a.claveBusqueda.localeCompare(b.claveBusqueda, "es");
    }),
  };
}

function resolveCommissionForReference(
  referenciaEquipo: string | null | undefined,
  lookup: CommissionLookup
) {
  const claveExacta = normalizarClaveReferenciaListaPrecio(referenciaEquipo);

  if (claveExacta && lookup.exactMap.has(claveExacta)) {
    return Number(lookup.exactMap.get(claveExacta) || 0);
  }

  const claveBusqueda = normalizarClaveBusquedaReferencia(referenciaEquipo);

  if (!claveBusqueda) {
    return 0;
  }

  for (const candidate of lookup.candidates) {
    if (matchesReferenceCandidate(claveBusqueda, candidate.claveBusqueda)) {
      return candidate.comision;
    }
  }

  return 0;
}

function hasSnapshotChanged(
  record: Pick<
    RewardMonthRecord,
    "bolsaGananciaHabilitada" | "bolsaGananciaValor" | "bolsaGananciaEstado"
  >,
  snapshot: Omit<RewardSnapshotUpdate, "id">
) {
  return (
    record.bolsaGananciaHabilitada !== snapshot.bolsaGananciaHabilitada ||
    toNumber(record.bolsaGananciaValor) !== snapshot.bolsaGananciaValor ||
    String(record.bolsaGananciaEstado || "").trim() !== snapshot.bolsaGananciaEstado
  );
}

function evaluateSnapshotForRecord(params: {
  record: Pick<RewardMonthRecord, "id" | "perfilVendedorId" | "referenciaEquipo">;
  ranking: RankingEntry[];
  commissionLookup: CommissionLookup;
}) {
  const puestoActual =
    params.ranking.findIndex((item) => item.perfilId === params.record.perfilVendedorId) +
    1;
  const estaEnTop10 = puestoActual > 0 && puestoActual <= 10;
  const valorComision = resolveCommissionForReference(
    params.record.referenciaEquipo,
    params.commissionLookup
  );

  if (!estaEnTop10) {
    return {
      bolsaGananciaHabilitada: false,
      bolsaGananciaValor: 0,
      bolsaGananciaEstado: BOLSA_ESTADO_FUERA_TOP10,
      bolsaGananciaEvaluadaEn: new Date(),
    };
  }

  if (valorComision <= 0) {
    return {
      bolsaGananciaHabilitada: false,
      bolsaGananciaValor: 0,
      bolsaGananciaEstado: BOLSA_ESTADO_SIN_COMISION,
      bolsaGananciaEvaluadaEn: new Date(),
    };
  }

  return {
    bolsaGananciaHabilitada: true,
    bolsaGananciaValor: valorComision,
    bolsaGananciaEstado: BOLSA_ESTADO_HABILITADA,
    bolsaGananciaEvaluadaEn: new Date(),
  };
}

async function applySnapshotUpdates(updates: RewardSnapshotUpdate[]) {
  if (!updates.length) {
    return;
  }

  for (let index = 0; index < updates.length; index += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(index, index + UPDATE_CHUNK_SIZE);

    await prisma.$transaction(
      chunk.map((item) =>
        prisma.registroVendedorVenta.update({
          where: { id: item.id },
          data: {
            bolsaGananciaHabilitada: item.bolsaGananciaHabilitada,
            bolsaGananciaValor: item.bolsaGananciaValor,
            bolsaGananciaEstado: item.bolsaGananciaEstado,
            bolsaGananciaEvaluadaEn: item.bolsaGananciaEvaluadaEn,
          },
        })
      )
    );
  }
}

async function fetchCurrentMonthRewardRecords() {
  const period = getCurrentBogotaMonthRange();
  const records = await prisma.registroVendedorVenta.findMany({
    where: {
      createdAt: {
        gte: period.start,
        lt: period.end,
      },
      eliminadoEn: null,
      NOT: {
        estadoVentaRegistro: "CANCELADO",
      },
    },
    select: {
      id: true,
      perfilVendedorId: true,
      referenciaEquipo: true,
      clienteNombre: true,
      createdAt: true,
      bolsaGananciaHabilitada: true,
      bolsaGananciaValor: true,
      bolsaGananciaEstado: true,
      bolsaGananciaEvaluadaEn: true,
      perfilVendedor: {
        select: {
          nombre: true,
          tipo: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return {
    period,
    records: records.filter((record) =>
      isBolsaProfileType(record.perfilVendedor?.tipo)
    ) as RewardMonthRecord[],
  };
}

async function ensureCurrentMonthRewardSnapshots() {
  const { period, records } = await fetchCurrentMonthRewardRecords();

  if (!records.length) {
    return { period, records, ranking: [] as RankingEntry[] };
  }

  const commissionLookup = buildCommissionLookup(await obtenerListaPrecios());
  const counts = new Map<number, number>();
  const names = new Map<number, string>();
  const updates: RewardSnapshotUpdate[] = [];

  for (const record of records) {
    const nombrePerfil =
      String(record.perfilVendedor?.nombre || "").trim() ||
      `Perfil ${record.perfilVendedorId}`;

    names.set(record.perfilVendedorId, nombrePerfil);
    counts.set(
      record.perfilVendedorId,
      Number(counts.get(record.perfilVendedorId) || 0) + 1
    );

    const snapshot = evaluateSnapshotForRecord({
      record,
      ranking: buildRankingEntries(counts, names),
      commissionLookup,
    });

    if (!record.bolsaGananciaEvaluadaEn || hasSnapshotChanged(record, snapshot)) {
      updates.push({
        id: record.id,
        ...snapshot,
      });
    }

    record.bolsaGananciaHabilitada = snapshot.bolsaGananciaHabilitada;
    record.bolsaGananciaValor = snapshot.bolsaGananciaValor;
    record.bolsaGananciaEstado = snapshot.bolsaGananciaEstado;
    record.bolsaGananciaEvaluadaEn = snapshot.bolsaGananciaEvaluadaEn;
  }

  await applySnapshotUpdates(updates);

  return {
    period,
    records,
    ranking: buildRankingEntries(counts, names),
  };
}

export async function syncCurrentMonthRewardSnapshots() {
  await ensureVendorProfilesSchema();
  return ensureCurrentMonthRewardSnapshots();
}

export async function syncVendorRewardSnapshotForSale(saleId: number) {
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return null;
  }

  await ensureVendorProfilesSchema();

  const record = await prisma.registroVendedorVenta.findFirst({
    where: {
      id: saleId,
      eliminadoEn: null,
      NOT: {
        estadoVentaRegistro: "CANCELADO",
      },
    },
    select: {
      id: true,
      perfilVendedorId: true,
      referenciaEquipo: true,
      createdAt: true,
      perfilVendedor: {
        select: {
          nombre: true,
          tipo: true,
        },
      },
    },
  });

  if (!record || !isBolsaProfileType(record.perfilVendedor?.tipo)) {
    return null;
  }

  const monthKey = getMonthKeyFromDate(record.createdAt);
  const period = getBogotaMonthRangeFromInput(monthKey);

  if (!period) {
    return null;
  }

  const monthRecords = await prisma.registroVendedorVenta.findMany({
    where: {
      createdAt: {
        gte: period.start,
        lt: period.end,
      },
      eliminadoEn: null,
      NOT: {
        estadoVentaRegistro: "CANCELADO",
      },
    },
    select: {
      id: true,
      perfilVendedorId: true,
      referenciaEquipo: true,
      clienteNombre: true,
      createdAt: true,
      bolsaGananciaHabilitada: true,
      bolsaGananciaValor: true,
      bolsaGananciaEstado: true,
      bolsaGananciaEvaluadaEn: true,
      perfilVendedor: {
        select: {
          nombre: true,
          tipo: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const filteredRecords = monthRecords.filter((item) =>
    isBolsaProfileType(item.perfilVendedor?.tipo)
  ) as RewardMonthRecord[];

  if (!filteredRecords.length) {
    return null;
  }

  const commissionLookup = buildCommissionLookup(await obtenerListaPrecios());
  const counts = new Map<number, number>();
  const names = new Map<number, string>();

  for (const item of filteredRecords) {
    const nombrePerfil =
      String(item.perfilVendedor?.nombre || "").trim() ||
      `Perfil ${item.perfilVendedorId}`;

    names.set(item.perfilVendedorId, nombrePerfil);
    counts.set(item.perfilVendedorId, Number(counts.get(item.perfilVendedorId) || 0) + 1);

    if (item.id !== saleId) {
      continue;
    }

    const snapshot = evaluateSnapshotForRecord({
      record: item,
      ranking: buildRankingEntries(counts, names),
      commissionLookup,
    });

    await prisma.registroVendedorVenta.update({
      where: { id: saleId },
      data: snapshot,
    });

    return snapshot;
  }

  return null;
}

export async function getVendorEarningsSummary(
  perfilVendedorId: number
): Promise<VendorEarningsSummary> {
  await ensureVendorProfilesSchema();

  if (!Number.isInteger(perfilVendedorId) || perfilVendedorId <= 0) {
    return {
      bolsaHabilitada: false,
      puestoActual: null,
      ventasMes: 0,
      mensajeEstado: "FUERA DEL TOP 10, debe esforzarse mas",
      periodoLabel: getCurrentBogotaMonthRange().label,
      totalGanado: 0,
      totalVentasConComision: 0,
      totalReferenciasConComision: 0,
      recientes: [],
    };
  }

  const { period, records, ranking } = await ensureCurrentMonthRewardSnapshots();
  const rankingEntry = ranking.find((item) => item.perfilId === perfilVendedorId) || null;
  const puestoActual = rankingEntry
    ? ranking.findIndex((item) => item.perfilId === perfilVendedorId) + 1
    : null;
  const bolsaHabilitada = puestoActual !== null && puestoActual <= 10;
  const rewardedRecords = records
    .filter(
      (record) =>
        record.perfilVendedorId === perfilVendedorId &&
        record.bolsaGananciaHabilitada &&
        toNumber(record.bolsaGananciaValor) > 0
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const totalGanado = rewardedRecords.reduce(
    (acc, item) => acc + toNumber(item.bolsaGananciaValor),
    0
  );
  const referenciasConComision = new Set<string>();

  for (const item of rewardedRecords) {
    const clave = normalizarClaveReferenciaListaPrecio(item.referenciaEquipo);

    if (clave) {
      referenciasConComision.add(clave);
    }
  }

  return {
    bolsaHabilitada,
    puestoActual,
    ventasMes: rankingEntry?.total || 0,
    mensajeEstado: bolsaHabilitada
      ? "SI ESTAS EN EL TOP 10, tu bolsa sigue habilitada"
      : "FUERA DEL TOP 10, debe esforzarse mas",
    periodoLabel: period.label,
    totalGanado,
    totalVentasConComision: rewardedRecords.length,
    totalReferenciasConComision: referenciasConComision.size,
    recientes: rewardedRecords.slice(0, 5).map((item) => ({
      id: item.id,
      referencia: String(item.referenciaEquipo || "Sin referencia"),
      clienteNombre: item.clienteNombre,
      valorComision: toNumber(item.bolsaGananciaValor),
      createdAt: item.createdAt,
    })),
  };
}
