import type { CierreCredito, Prisma } from "@/app/generated/prisma/client";
import { getEffectiveSumasObservation } from "@/lib/cierre-sumas-audit";

type Metric = { units: number; amount: number };
export type CierreSumasReconciliation = {
  financial: "SUMASPAY"; basis: "SUMASPAY_API";
  api: Metric; local: Metric; unlinkedApi: Metric; unmatchedLocal: Metric; delta: Metric;
  referencesReviewed: number; totalReferences: number;
  daysReviewed: null; totalDays: null;
};
type ReportRecord = Omit<CierreCredito, "amount" | "effectiveAt"> & { amount: number; effectiveAt: Date };
const empty = (): Metric => ({ units: 0, amount: 0 });
const add = (metric: Metric, amount: number) => {
  metric.units++;
  metric.amount = Math.round((metric.amount + amount) * 100) / 100;
};
const inPeriod = (date: Date | null, start: Date, end: Date) => Boolean(date && date >= start && date < end);

/** SUMASPAY's confirmed API facts are the sole source of the subtotal. The
 * customer-reference reader has no daily/exhaustive coverage contract.
 */
export async function readCierreSumasReport(tx: Prisma.TransactionClient, scope: {
  sedeId: number | null; start: Date; end: Date;
}, now = new Date()) {
  const reconciliation: CierreSumasReconciliation = {
    financial: "SUMASPAY", basis: "SUMASPAY_API", api: empty(), local: empty(), unlinkedApi: empty(), unmatchedLocal: empty(), delta: empty(),
    referencesReviewed: 0, totalReferences: 0, daysReviewed: null, totalDays: null,
  };
  const records: ReportRecord[] = [], unmatchedLocalRecords: ReportRecord[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    // Read provider observations before applying their authoritative API date.
    // Restrict branches in SQL, including references with negative states, so
    // neither amounts nor progress can reveal another branch's observations.
    const rows: CierreCredito[] = await tx.cierreCredito.findMany({
      where: { financial: "SUMASPAY", ...(scope.sedeId === null ? {} : { sedeId: scope.sedeId, localKey: { not: null } }),
        OR: [{ providerCreditId: { not: null } }, { localKey: { not: null }, effectiveAt: { gte: scope.start, lt: scope.end } }],
        ...(cursor === null ? {} : { id: { gt: cursor } }) },
      orderBy: { id: "asc" }, take: 500,
    });
    const references = rows.filter((row) => row.localKey && inPeriod(row.effectiveAt, scope.start, scope.end));
    const jobs = references.length ? await tx.cierreSyncTrabajo.findMany({
      where: { financial: "SUMASPAY", localKey: { in: references.map((row) => row.localKey!) } },
      select: { localKey: true, state: true, lastSuccess: true }, orderBy: [{ updatedAt: "desc" }, { key: "asc" }],
    }) : [];
    const byKey = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) if (!byKey.has(job.localKey)) byKey.set(job.localKey, job);
    for (const reference of references) {
      const job = byKey.get(reference.localKey!);
      if (job?.state === "RETIRADO") continue;
      reconciliation.totalReferences++;
      if (job?.state === "REVISADO" && job.lastSuccess instanceof Date && Number.isFinite(job.lastSuccess.getTime()) && job.lastSuccess <= now) reconciliation.referencesReviewed++;
    }
    for (const row of rows) {
      const observation = getEffectiveSumasObservation(row);
      if (observation && inPeriod(observation.effectiveAt, scope.start, scope.end) && !seen.has(row.providerCreditId!)) {
        seen.add(row.providerCreditId!);
        records.push({ ...row, amount: observation.amount, effectiveAt: observation.effectiveAt,
          status: "EFECTIVO", creditNumber: row.providerCreditId, source: "API SUMASPAY" });
        add(reconciliation.api, observation.amount);
        if (!row.localKey) add(reconciliation.unlinkedApi, observation.amount);
      }
      const localAmount = row.amount === null ? 0 : Number(row.amount);
      if (row.localKey && row.status === "EFECTIVO" && Number.isFinite(localAmount) && localAmount > 0 && inPeriod(row.effectiveAt, scope.start, scope.end)) {
        add(reconciliation.local, localAmount);
        // A linked API fact in another period is not another unmatched loan.
        if (!observation) {
          add(reconciliation.unmatchedLocal, localAmount);
          unmatchedLocalRecords.push({ ...row, amount: localAmount, effectiveAt: row.effectiveAt! });
        }
      }
    }
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  reconciliation.delta = { units: reconciliation.api.units - reconciliation.local.units,
    amount: Math.round((reconciliation.api.amount - reconciliation.local.amount) * 100) / 100 };
  records.sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime() || a.id.localeCompare(b.id));
  const lastUpdatedAt = records.reduce<Date | null>((last, row) => !last || row.syncedAt > last ? row.syncedAt : last, null);
  return { reconciliation, records, unmatchedLocalRecords, lastUpdatedAt };
}
