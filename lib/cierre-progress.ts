import type { Prisma } from "@/app/generated/prisma/client";

export const CIERRE_API_READERS = ["SUMASPAY", "PAYJOY", "ADDI"] as const;
export type CierreProviderSyncStatus = "DESACTIVADA" | "EN_COLA" | "REVISADA_LIMITADA" | "ERROR" | "SIN_REFERENCIA";
export type CierreProviderSync = {
  enabled: boolean;
  status: CierreProviderSyncStatus;
  total: number;
  queued: number;
  reviewed: number;
  errors: number;
  withoutReference: number;
  lastSuccessAt: string | null;
  limitation: string;
};

export const CIERRE_SOURCE_LIMITATIONS: Record<string, string> = {
  SUMASPAY: "Consulta créditos de clientes conocidos. La cuenta no acredita un listado exhaustivo del periodo.",
  PAYJOY: "Consulta transacciones del periodo. La respuesta disponible no certifica una paginación completa ni todos los reversos.",
  ADDI: "Consulta transacciones de clientes conocidos. Los listados existentes limitan los resultados y no certifican una cobertura completa.",
  SISTECREDITO: "Se utiliza el histórico confirmado de CONECTAMOS; no existe un lector de créditos de esta financiera en la integración actual.",
  "ALO CREDIT": "Se utiliza el histórico confirmado de CONECTAMOS; la integración actual no entrega identificadores y estados fiables para conciliar créditos.",
  FINSERPAY: "Se utiliza el histórico confirmado de CONECTAMOS; la integración actual no entrega identificadores y estados fiables para conciliar créditos.",
};

function empty(enabled: boolean, limitation: string): CierreProviderSync {
  return { enabled, status: enabled ? "SIN_REFERENCIA" : "DESACTIVADA", total: 0, queued: 0, reviewed: 0,
    errors: 0, withoutReference: 0, lastSuccessAt: null, limitation };
}

function status(result: CierreProviderSync) {
  result.status = !result.enabled ? "DESACTIVADA" : result.errors > 0 ? "ERROR" : result.queued > 0 ? "EN_COLA"
    : result.withoutReference > 0 || result.total === 0 ? "SIN_REFERENCIA" : "REVISADA_LIMITADA";
  return result;
}

export function aggregateCierreProviderSync(rows: Array<CierreProviderSync | null>) {
  const sources = rows.filter((row): row is CierreProviderSync => row !== null);
  if (!sources.length) return null;
  const result = empty(sources.some((row) => row.enabled), "La conciliación de referencias conocidas no demuestra que el proveedor haya entregado todos los créditos del periodo.");
  for (const source of sources) {
    for (const key of ["total", "queued", "reviewed", "errors", "withoutReference"] as const) result[key] += source[key];
    if (source.lastSuccessAt && (!result.lastSuccessAt || source.lastSuccessAt > result.lastSuccessAt)) result.lastSuccessAt = source.lastSuccessAt;
  }
  return status(result);
}

export async function readCierreProviderProgress(tx: Prisma.TransactionClient, scope: {
  sedeId: number | null; start: Date; end: Date; financial: string | null;
}) {
  const enabled = process.env.CIERRE_PROVIDER_SYNC_ENABLED === "1";
  const result = new Map<string, CierreProviderSync>(CIERRE_API_READERS.map((name) => [name, empty(enabled, CIERRE_SOURCE_LIMITATIONS[name])]));
  const financials = CIERRE_API_READERS.filter((name) => !scope.financial || name === scope.financial);
  if (!financials.length) return result;
  let cursor: string | null = null;
  for (;;) {
    // Filter the ledger before reading jobs. Other branches and periods never
    // contribute counts or timestamps to a user's progress or exported sources.
    const credits: Array<{ id: string; financial: string; localKey: string | null; providerCreditId: string | null; documentNumber: string | null; imei: string | null }> = await tx.cierreCredito.findMany({
      where: { financial: { in: financials }, localKey: { not: null },
        effectiveAt: { gte: scope.start, lt: scope.end }, ...(scope.sedeId === null ? {} : { sedeId: scope.sedeId }),
        ...(cursor === null ? {} : { id: { gt: cursor } }) },
      orderBy: { id: "asc" }, take: 500,
      select: { id: true, financial: true, localKey: true, providerCreditId: true, documentNumber: true, imei: true },
    });
    if (!credits.length) break;
    const jobs = await tx.cierreSyncTrabajo.findMany({
      where: { localKey: { in: credits.map((credit) => credit.localKey!) }, financial: { in: financials } },
      orderBy: [{ updatedAt: "desc" }, { key: "asc" }],
      select: { localKey: true, financial: true, state: true, lastSuccess: true },
    });
    const byKey = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      const key = `${job.financial}:${job.localKey}`;
      if (!byKey.has(key)) byKey.set(key, job);
    }
    for (const credit of credits) {
      const job = byKey.get(`${credit.financial}:${credit.localKey}`);
      if (job?.state === "RETIRADO") continue;
      const row = result.get(credit.financial)!;
      row.total++;
      const success = job?.lastSuccess instanceof Date && Number.isFinite(job.lastSuccess.getTime()) ? job.lastSuccess.toISOString() : null;
      if (success && (!row.lastSuccessAt || success > row.lastSuccessAt)) row.lastSuccessAt = success;
      const hasReference = credit.financial === "PAYJOY" || /^\d{5,15}$/.test(credit.documentNumber?.replace(/\D/g, "") || "");
      if (job?.state === "ERROR") row.errors++;
      else if (job?.state === "SIN_REFERENCIA") row.withoutReference++;
      else if (job?.state === "PENDIENTE" && hasReference) row.queued++;
      else if (success) row.reviewed++;
      else if (!hasReference) row.withoutReference++;
      else row.queued++;
    }
    cursor = credits[credits.length - 1].id;
    if (credits.length < 500) break;
  }
  for (const row of result.values()) status(row);
  return result;
}
