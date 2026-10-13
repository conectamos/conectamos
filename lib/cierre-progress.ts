import type { Prisma } from "@/app/generated/prisma/client";
import { getCierrePriority } from "@/lib/cierre-priority";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { CIERRE_RECONCILIATION_REASONS } from "@/lib/cierre-reconciliation-reasons";

export const CIERRE_API_READERS = ["SUMASPAY", "PAYJOY", "ADDI"] as const;
export type CierreProviderSyncStatus = "DESACTIVADA" | "EN_COLA" | "REVISADA_LIMITADA" | "ERROR" | "SIN_REFERENCIA" | "CONSULTANDO" | "PAUSADA" | "DETENIDA";
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
  consulted: number;
  linked: number;
  unconfirmed: number;
  workerEnabled: boolean;
  workerActive: boolean;
  resumeAt: string | null;
  lastActivityAt: string | null;
  active: { financial: string; day: string | null } | null;
  priority: { from: string; to: string; applies: boolean } | null;
  reasons: string[];
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
    errors: 0, withoutReference: 0, lastSuccessAt: null, limitation,
    consulted: 0, linked: 0, unconfirmed: 0, workerEnabled: process.env.CIERRE_SYNC_ENABLED === "1", workerActive: false,
    resumeAt: null, lastActivityAt: null, active: null, priority: null, reasons: [] };
}

function status(result: CierreProviderSync) {
  const pending = result.queued > 0 || result.errors > 0;
  result.unconfirmed = result.total - result.linked;
  result.status = !result.enabled ? "DESACTIVADA" : result.active ? "CONSULTANDO"
    : pending && !result.workerActive ? "DETENIDA" : pending && result.resumeAt ? "PAUSADA"
    : result.errors > 0 ? "ERROR" : result.queued > 0 ? "EN_COLA"
    : result.withoutReference > 0 || result.total === 0 ? "SIN_REFERENCIA" : "REVISADA_LIMITADA";
  return result;
}

export function aggregateCierreProviderSync(rows: Array<CierreProviderSync | null>) {
  const sources = rows.filter((row): row is CierreProviderSync => row !== null);
  if (!sources.length) return null;
  const result = empty(sources.some((row) => row.enabled), "La conciliación de referencias conocidas no demuestra que el proveedor haya entregado todos los créditos del periodo.");
  for (const source of sources) {
    for (const key of ["total", "queued", "reviewed", "errors", "withoutReference", "consulted", "linked"] as const) result[key] += source[key];
    if (source.lastSuccessAt && (!result.lastSuccessAt || source.lastSuccessAt > result.lastSuccessAt)) result.lastSuccessAt = source.lastSuccessAt;
    if (source.lastActivityAt && (!result.lastActivityAt || source.lastActivityAt > result.lastActivityAt)) result.lastActivityAt = source.lastActivityAt;
    result.workerActive ||= source.workerActive;
    result.active ||= source.active;
    result.priority ||= source.priority;
    result.reasons = [...new Set([...result.reasons, ...source.reasons])];
  }
  const pending = sources.filter((row) => row.queued > 0 || row.errors > 0);
  if (pending.length && pending.every((row) => row.resumeAt)) result.resumeAt = pending.map((row) => row.resumeAt!).sort()[0];
  return status(result);
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

export async function readCierreProviderProgress(tx: Prisma.TransactionClient, scope: {
  sedeId: number | null; start: Date; end: Date; financial: string | null;
}) {
  const enabled = process.env.CIERRE_PROVIDER_SYNC_ENABLED === "1";
  const result = new Map<string, CierreProviderSync>(CIERRE_API_READERS.map((name) => [name, empty(enabled, CIERRE_SOURCE_LIMITATIONS[name])]));
  const financials = CIERRE_API_READERS.filter((name) => !scope.financial || name === scope.financial);
  if (!financials.length) return result;
  const now = Date.now();
  const runtime = await tx.cierreSyncEstado.findMany({ where: { key: { in: ["WORKER", "PROVIDER_RATE", "PROVIDER_ACTIVITY"] } } });
  const worker = runtime.find((row) => row.key === "WORKER");
  const rate = runtime.find((row) => row.key === "PROVIDER_RATE");
  const activityState = runtime.find((row) => row.key === "PROVIDER_ACTIVITY");
  const activity = activityState?.lockedUntil && activityState.lockedUntil.getTime() > now ? parseMetadata(activityState.lockToken) : {};
  const workerActive = Boolean(worker && ((worker.updatedAt && now >= worker.updatedAt.getTime() && now - worker.updatedAt.getTime() < 180_000) ||
    (worker.lockToken && worker.lockedUntil && worker.lockedUntil.getTime() > now)));
  const priority = getCierrePriority();
  const nextEligible = new Map<string, number>();
  for (const [name, row] of result) {
    row.workerActive = workerActive;
    row.priority = priority ? { from: priority.from, to: priority.to, applies: priority.start < scope.end && priority.end > scope.start } : null;
    // Account-level work is visible with a global scope. Branch users only see
    // activity after a matching reference in their own filtered ledger is found.
    if (scope.sedeId === null && activity.financial === name && typeof activity.day === "string") {
      const day = new Date(`${activity.day}T12:00:00-05:00`);
      if (day >= scope.start && day < scope.end) {
        row.active = { financial: name, day: activity.day };
        if (typeof activity.startedAt === "string" && Number.isFinite(Date.parse(activity.startedAt))) row.lastActivityAt = activity.startedAt;
      }
    }
  }
  let cursor: string | null = null;
  for (;;) {
    // Filter the ledger before reading jobs. Other branches and periods never
    // contribute counts or timestamps to a user's progress or exported sources.
    const credits: Array<{ id: string; financial: string; localKey: string | null; providerCreditId: string | null; documentNumber: string | null; imei: string | null; source: string; effectiveAt: Date | null }> = await tx.cierreCredito.findMany({
      where: { financial: { in: financials }, localKey: { not: null },
        effectiveAt: { gte: scope.start, lt: scope.end }, ...(scope.sedeId === null ? {} : { sedeId: scope.sedeId }),
        ...(cursor === null ? {} : { id: { gt: cursor } }) },
      orderBy: { id: "asc" }, take: 500,
      select: { id: true, financial: true, localKey: true, providerCreditId: true, documentNumber: true, imei: true, source: true, effectiveAt: true },
    });
    if (!credits.length) break;
    const jobs = await tx.cierreSyncTrabajo.findMany({
      where: { localKey: { in: credits.map((credit) => credit.localKey!) }, financial: { in: financials } },
      orderBy: [{ updatedAt: "desc" }, { key: "asc" }],
      select: { key: true, localKey: true, financial: true, state: true, lastSuccess: true, nextAttempt: true },
    });
    const summaries = await tx.cierreSyncEstado.findMany({ where: { key: { in: jobs.map((job) => `RESULT:${job.key}`) } }, select: { key: true, lockToken: true, updatedAt: true } });
    const summariesByKey = new Map(summaries.map((row) => [row.key, row]));
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
      // A successful response is not a linked credit. A provider ID observed in
      // an approval alone still has a local source and cannot count as linked.
      if (credit.providerCreditId && credit.source.includes("API")) row.linked++;
      const success = job?.lastSuccess instanceof Date && Number.isFinite(job.lastSuccess.getTime()) ? job.lastSuccess.toISOString() : null;
      if (success && (!row.lastSuccessAt || success > row.lastSuccessAt)) row.lastSuccessAt = success;
      // Editing or retrying a reference invalidates its current review. Preserve
      // the historical timestamp, but never inflate current completion with it.
      if (success && job?.state === "REVISADO") row.consulted++;
      const summary = job ? summariesByKey.get(`RESULT:${job.key}`) : undefined;
      const metadata = parseMetadata(summary?.lockToken);
      if (metadata.reasons && typeof metadata.reasons === "object") {
        const reasons = metadata.reasons as Record<string, unknown>;
        row.reasons = [...new Set([...row.reasons, ...CIERRE_RECONCILIATION_REASONS.filter((reason) => typeof reasons[reason] === "number" && (reasons[reason] as number) > 0)])];
      }
      const lastActivity = summary?.updatedAt?.toISOString() || success;
      if (lastActivity && (!row.lastActivityAt || lastActivity > row.lastActivityAt)) row.lastActivityAt = lastActivity;
      if (activity.financial === credit.financial && (activity.localKey === credit.localKey ||
          (activity.localKey === null && credit.effectiveAt && activity.day === getDateKeyInColombia(credit.effectiveAt)))) {
        row.active = { financial: credit.financial, day: typeof activity.day === "string" ? activity.day : null };
      }
      if (row.active && typeof activity.startedAt === "string" && Number.isFinite(Date.parse(activity.startedAt))) row.lastActivityAt = activity.startedAt;
      const hasReference = credit.financial === "PAYJOY" || /^\d{5,15}$/.test(credit.documentNumber?.replace(/\D/g, "") || "");
      if (job?.state === "ERROR") row.errors++;
      else if (job?.state === "SIN_REFERENCIA") row.withoutReference++;
      else if (job?.state === "PENDIENTE" && hasReference) row.queued++;
      else if (success) row.reviewed++;
      else if (!hasReference) row.withoutReference++;
      else row.queued++;
      if (job?.state === "ERROR" || (hasReference && (!job || job.state === "PENDIENTE" || !success))) {
        nextEligible.set(credit.financial, Math.min(nextEligible.get(credit.financial) ?? Infinity, job?.nextAttempt?.getTime() ?? now));
      }
    }
    cursor = credits[credits.length - 1].id;
    if (credits.length < 500) break;
  }
  for (const [name, row] of result) {
    if (row.queued || row.errors) {
      const eligible = Math.max(nextEligible.get(name) ?? now, rate?.lockedUntil?.getTime() || now);
      if (eligible > now) row.resumeAt = new Date(eligible).toISOString();
    }
    status(row);
  }
  return result;
}
