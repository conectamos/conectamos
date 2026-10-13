import type { Prisma } from "@/app/generated/prisma/client";

type CoveragePoint = { sedeId: unknown; date: unknown };
type CoverageScope = { sedeId: number | null; start: Date; end: Date };

function validTimestamp(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  // PostgreSQL to_jsonb(timestamp) has no offset: Prisma's timestamp columns
  // contain UTC instants. Never let the server's local timezone reinterpret it.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return null;
  const date = new Date(match[5] ? value : `${value}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function classify(point: CoveragePoint, scope: CoverageScope): "outside" | "pending" | "unknown" {
  const sedeId = typeof point.sedeId === "number" && Number.isSafeInteger(point.sedeId) && point.sedeId > 0 ? point.sedeId : null;
  if (scope.sedeId !== null && sedeId !== null && sedeId !== scope.sedeId) return "outside";
  const date = validTimestamp(point.date);
  if (date && (date < scope.start || date >= scope.end)) return "outside";
  // A missing/invalid date cannot prove that this sale is outside the period.
  // An unknown branch blocks completion without exposing its count to a branch.
  return scope.sedeId !== null && sedeId === null ? "unknown" : "pending";
}

export async function readCierreLocalCoverage(tx: Prisma.TransactionClient, scope: CoverageScope) {
  let pending = 0;
  let unresolved = false;
  let cursor: number | null = null;
  const pageSize = 500;
  // Scan durable pending work in bounded pages, without copying the complete
  // historical queue into memory. This becomes one small read after backfill.
  for (;;) {
    const queue: Array<{ ventaId: number; snapshot: Prisma.JsonValue | null }> = await tx.cierreVentaPendiente.findMany({
      ...(cursor === null ? {} : { where: { ventaId: { gt: cursor } } }),
      orderBy: { ventaId: "asc" }, take: pageSize, select: { ventaId: true, snapshot: true },
    });
    if (!queue.length) break;
    const ids = queue.map((row) => row.ventaId);
    const [sales, previous] = await Promise.all([
      tx.venta.findMany({ where: { id: { in: ids } }, select: { id: true, sedeId: true, fecha: true } }),
      tx.cierreCredito.findMany({ where: { ventaId: { in: ids } }, select: { ventaId: true, sedeId: true, effectiveAt: true } }),
    ]);
    const points = new Map<number, CoveragePoint[]>();
    const add = (id: number, point: CoveragePoint) => {
      const existing = points.get(id) || [];
      existing.push(point);
      points.set(id, existing);
    };
    for (const sale of sales) add(sale.id, { sedeId: sale.sedeId, date: sale.fecha });
    for (const credit of previous) if (credit.ventaId !== null) add(credit.ventaId, { sedeId: credit.sedeId, date: credit.effectiveAt });
    for (const row of queue) {
      if (row.snapshot !== null && row.snapshot !== undefined) {
        const snapshot = typeof row.snapshot === "object" && !Array.isArray(row.snapshot) ? row.snapshot : {};
        add(row.ventaId, { sedeId: snapshot.sedeId, date: snapshot.fecha });
      }
      const candidates = points.get(row.ventaId) || [{ sedeId: null, date: null }];
      const statuses = candidates.map((point) => classify(point, scope));
      // Inspect all three images: a changed branch/date can affect both the old
      // ledger and the current sale; deletion may leave only the outbox snapshot.
      if (statuses.includes("pending")) pending++;
      if (statuses.includes("unknown")) unresolved = true;
    }
    cursor = queue[queue.length - 1].ventaId;
    if (queue.length < pageSize) break;
  }
  return { pending, unresolved };
}
