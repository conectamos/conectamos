import prisma from "@/lib/prisma";
import { canonicalFinancialName, resolveCierrePeriod, resolveCierreSede, canViewGlobalCierre, CierreInputError } from "@/lib/cierre-domain";
import { readCierreLocalCoverage } from "@/lib/cierre-coverage";

export class CierreRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type Session = { rolNombre: string; perfilTipo: string | null; sedeId: number; sedeNombre: string };
const PROVIDERS = ["SUMASPAY", "PAYJOY", "ADDI", "SISTECREDITO", "ALO CREDIT", "FINSERPAY"];
const API_READERS = new Set(["SUMASPAY", "PAYJOY", "ADDI"]);

export function cierreScope(session: Session, requested: string | null) {
  try { return resolveCierreSede(session, requested === "TODAS" ? null : requested); }
  catch (error) { throw new CierreRequestError(error instanceof Error ? error.message : "Sede inválida", error instanceof CierreInputError ? error.status : 400); }
}

export function cierreFilters(params: URLSearchParams, session: Session) {
  const modes = { day: "dia", week: "semana", month: "mes", range: "rango" } as const;
  const mode = params.get("mode") || "day";
  if (!(mode in modes)) throw new CierreRequestError("Periodo inválido");
  const period = resolveCierrePeriod({
    periodo: modes[mode as keyof typeof modes], fecha: params.get("date") || undefined,
    mes: params.get("month") || undefined, desde: params.get("from") || undefined,
    hasta: params.get("to") || undefined,
  });
  return { period, sedeId: cierreScope(session, params.get("sedeId")) };
}

export async function readCierreReport(params: URLSearchParams, session: Session, detail = false, exporting = false) {
  let filters: ReturnType<typeof cierreFilters>;
  try { filters = cierreFilters(params, session); }
  catch (error) { if (error instanceof CierreRequestError) throw error; throw new CierreRequestError(error instanceof Error ? error.message : "Periodo inválido"); }
  const { period, sedeId } = filters;
  const financier = detail ? canonicalFinancialName(params.get("financier")) : null;
  if (detail && !financier) throw new CierreRequestError("Selecciona una financiera");
  const requestedPage = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new CierreRequestError("Página inválida");
  // RepeatableRead keeps totals, page, coverage and export on the same DB snapshot.
  // This module deliberately imports no provider client or synchronization worker.
  return prisma.$transaction(async (tx) => {
    const sedes = await tx.sede.findMany({ where: canViewGlobalCierre(session) ? {} : { id: sedeId! }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
    if (sedeId !== null && !sedes.some((s) => s.id === sedeId)) throw new CierreRequestError("Sede no encontrada", 404);
    const scopeWhere = sedeId === null ? {} : { sedeId };
    const where = { ...scopeWhere, effectiveAt: { gte: period.start, lt: period.end }, status: "EFECTIVO", amount: { gt: 0 }, ...(financier ? { financial: financier } : {}) };
    const [groups, state, coverage, knownFinancials, sources] = await Promise.all([
      tx.cierreCredito.groupBy({ by: ["financial"], where, _count: { _all: true }, _sum: { amount: true }, _max: { syncedAt: true } }),
      tx.cierreSyncEstado.findUnique({ where: { key: "LOCAL" } }),
      readCierreLocalCoverage(tx, { sedeId, start: period.start, end: period.end }),
      tx.cierreCredito.findMany({ where: scopeWhere, distinct: ["financial"], select: { financial: true } }),
      tx.cierreCredito.findMany({ where, distinct: ["financial", "source"], select: { financial: true, source: true } }),
    ]);
    // LOCAL is inserted atomically with the historical outbox seed. Its presence
    // proves the queue was prepared; other periods need not finish before this one.
    const localComplete = Boolean(state && coverage.pending === 0 && !coverage.unresolved);
    // API readers discover credits only for known local references. Their existing
    // contracts do not establish exhaustive coverage, even when every job succeeds.
    const rows = Array.from(new Set([...PROVIDERS, ...knownFinancials.map((r) => r.financial)]))
      .filter((name) => !financier || name === financier).map((name) => {
        const group = groups.find((g) => g.financial === name);
        const complete = localComplete && !API_READERS.has(name);
        const units = group?._count._all || 0;
        const amount = Number(group?._sum.amount || 0);
        const consulted = sources.some((s) => s.financial === name && s.source.includes("API"));
        return { key: name, name, units: units || (complete ? 0 : null), amount: amount || (complete ? 0 : null), complete,
          source: API_READERS.has(name) && consulted ? "CONECTAMOS + API (cobertura parcial)" : "CONECTAMOS · ventas confirmadas",
          lastUpdatedAt: group?._max.syncedAt?.toISOString() || state?.lastSuccess?.toISOString() || null };
      }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const complete = rows.every((r) => r.complete);
    const units = groups.reduce((n, g) => n + g._count._all, 0);
    const amount = Math.round(groups.reduce((n, g) => n + Number(g._sum.amount || 0), 0) * 100) / 100;
    const base = {
      period: { label: period.label, from: period.desde, to: period.hasta },
      scope: { sedeId, label: sedeId === null ? "Todas las sedes" : sedes.find((s) => s.id === sedeId)!.nombre },
      options: { sedes, canSelectSede: canViewGlobalCierre(session) },
      totals: { units: units || (complete ? 0 : null), amount: amount || (complete ? 0 : null) },
      localSync: { pending: coverage.pending, complete: localComplete, lastUpdatedAt: state?.lastSuccess?.toISOString() || null },
      financiers: rows, complete, lastUpdatedAt: state?.lastSuccess?.toISOString() || null,
    };
    if (!detail && !exporting) return { ...base, items: [], total: units, page: 1, pageSize: 10 as const, units: base.totals.units, amount: base.totals.amount };
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(units / 10)));
    const records = await tx.cierreCredito.findMany({ where, orderBy: [{ effectiveAt: "desc" }, { id: "asc" }], ...(exporting ? {} : { skip: (page - 1) * 10, take: 10 }) });
    const items = records.map((r) => ({
      id: r.id, date: r.effectiveAt!.toISOString(), creditNumber: r.creditNumber || r.providerCreditId || null,
      localReference: r.localReference, customerName: r.customerName, customerDocument: r.documentNumber?.replace(/\D/g, "") || null,
      sedeName: sedes.find((s) => s.id === r.sedeId)?.nombre || "Sede sin vincular", financial: r.financial,
      amount: Number(r.amount), status: r.status, source: r.source,
    }));
    return { ...base, items, total: units, page, pageSize: 10 as const, units: base.totals.units, amount: base.totals.amount };
  }, { isolationLevel: "RepeatableRead", timeout: exporting ? 60_000 : 20_000 });
}
