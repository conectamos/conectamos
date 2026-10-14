import type { CierreCredito, Prisma } from "@/app/generated/prisma/client";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { getEffectivePayJoyObservation } from "@/lib/cierre-payjoy-audit";

type Metric = { units: number; amount: number };
export type CierrePayJoyReconciliation = {
  basis: "PAYJOY_API" | "LOCAL";
  api: Metric;
  local: Metric;
  unlinkedApi: Metric;
  unmatchedLocal: Metric;
  daysReviewed: number;
  totalDays: number;
  delta: Metric;
};
export type CierrePayJoyRecord = Omit<CierreCredito, "amount" | "effectiveAt"> & { amount: number; effectiveAt: Date };
const empty = (): Metric => ({ units: 0, amount: 0 });
const add = (metric: Metric, value: number) => {
  metric.units++;
  metric.amount = Math.round((metric.amount + value) * 100) / 100;
};
const inPeriod = (date: Date | null, start: Date, end: Date) => Boolean(date && date >= start && date < end);

/** Read the retained ledger only. PAYJOY totals always use the provider's
 * verified financial facts. Daily reads describe progress, never completeness.
 */
export async function readCierrePayJoyReport(tx: Prisma.TransactionClient, scope: {
  sedeId: number | null; start: Date; end: Date; from: string; to: string;
}, now = new Date()) {
  const prefix = "PERIODO:PAYJOY:";
  const jobs = await tx.cierreSyncTrabajo.findMany({
    where: { financial: "PAYJOY", key: { startsWith: prefix, gte: `${prefix}${scope.from}`, lte: `${prefix}${scope.to}` } },
    select: { key: true, state: true, lastSuccess: true },
  });
  const today = getDateKeyInColombia(now);
  const reviewed = new Set(jobs.filter((job) => {
    const day = job.key.slice(prefix.length);
    const parsedDay = new Date(`${day}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsedDay.getTime()) && parsedDay.toISOString().slice(0, 10) === day &&
      day <= today && job.state === "REVISADO" &&
      job.lastSuccess instanceof Date && Number.isFinite(job.lastSuccess.getTime()) && job.lastSuccess <= now;
  }).map((job) => job.key));
  const totalDays = Math.round((Date.parse(`${scope.to}T00:00:00Z`) - Date.parse(`${scope.from}T00:00:00Z`)) / 86_400_000) + 1;
  const reconciliation: CierrePayJoyReconciliation = {
    basis: "PAYJOY_API",
    api: empty(), local: empty(), unlinkedApi: empty(), unmatchedLocal: empty(),
    daysReviewed: reviewed.size, totalDays, delta: empty(),
  };
  const apiRecords: CierrePayJoyRecord[] = [];
  const unmatchedLocalRecords: CierrePayJoyRecord[] = [];
  const providerIds = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    // API evidence has its own authoritative date. Read provider observations
    // even when a legacy ledger date differs, then apply the period to that fact.
    // Branch scope is enforced in SQL before any identity or evidence is read.
    const records: CierreCredito[] = await tx.cierreCredito.findMany({
      where: { financial: "PAYJOY", ...(scope.sedeId === null ? {} : { sedeId: scope.sedeId, localKey: { not: null } }),
        OR: [{ providerCreditId: { not: null } }, { localKey: { not: null }, effectiveAt: { gte: scope.start, lt: scope.end } }],
        ...(cursor === null ? {} : { id: { gt: cursor } }) },
      orderBy: { id: "asc" }, take: 500,
    });
    for (const row of records) {
      const observation = getEffectivePayJoyObservation(row);
      const reportable = observation && inPeriod(observation.effectiveAt, scope.start, scope.end);
      if (reportable && !providerIds.has(row.providerCreditId!)) {
        providerIds.add(row.providerCreditId!);
        const record = { ...row, amount: observation.amount, effectiveAt: observation.effectiveAt,
          status: "EFECTIVO", creditNumber: row.providerCreditId, source: row.source.includes("API") ? row.source : "API PAYJOY" };
        apiRecords.push(record);
        add(reconciliation.api, observation.amount);
        if (!row.localKey) add(reconciliation.unlinkedApi, observation.amount);
      }
      const localAmount = row.amount === null ? 0 : Number(row.amount);
      if (row.localKey && row.status === "EFECTIVO" && Number.isFinite(localAmount) && localAmount > 0 && inPeriod(row.effectiveAt, scope.start, scope.end)) {
        const local = { ...row, effectiveAt: row.effectiveAt!, amount: localAmount };
        add(reconciliation.local, localAmount);
        // A verified linked API fact outside this period is not a new local loan.
        if (!observation) {
          unmatchedLocalRecords.push(local);
          add(reconciliation.unmatchedLocal, localAmount);
        }
      }
    }
    if (records.length < 500) break;
    cursor = records[records.length - 1].id;
  }
  reconciliation.delta = { units: reconciliation.api.units - reconciliation.local.units,
    amount: Math.round((reconciliation.api.amount - reconciliation.local.amount) * 100) / 100 };
  const records = apiRecords;
  records.sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime() || a.id.localeCompare(b.id));
  const lastUpdatedAt = records.reduce<Date | null>((last, row) => !last || row.syncedAt > last ? row.syncedAt : last, null);
  return { reconciliation, records, unmatchedLocalRecords, lastUpdatedAt };
}
