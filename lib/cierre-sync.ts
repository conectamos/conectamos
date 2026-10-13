import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { getDateKeyInColombia, shiftDateKey } from "@/lib/credit-date-utils";
import { drainCierreLocalQueue } from "@/lib/cierre-store";
import { reconcileCierreCredits } from "@/lib/cierre-reconcile";
import { getCierrePriority } from "@/lib/cierre-priority";
import { aggregateCierreProviderSync, readCierreProviderProgress } from "@/lib/cierre-progress";
import { classifyCierreProviderError, consultarLoteProveedorCierre, consultarPeriodoPayJoyCierre,
  type CierreProvider, type CierreProviderBatch } from "@/lib/cierre-providers";
import type { CierreSyncTrabajo, Prisma } from "@/app/generated/prisma/client";

const DAY_PREFIX = "PERIODO:PAYJOY:";
const MINUTE = 60_000;
const DAY = 86_400_000;
const providerStates = ["PENDIENTE", "ERROR", "REVISADO"];
const backoff = (attempts: number) => Math.min(24 * 60, 5 * 2 ** Math.min(attempts, 8)) * MINUTE;

function dayOfJob(job: CierreSyncTrabajo) {
  if (job.financial !== "PAYJOY" || !job.key.startsWith(DAY_PREFIX)) return null;
  const day = job.key.slice(DAY_PREFIX.length);
  const date = new Date(`${day}T12:00:00-05:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && getDateKeyInColombia(date) === day ? day : null;
}

async function seedPayJoyDays() {
  const oldest = await prisma.cierreCredito.findFirst({
    where: { localKey: { not: null }, effectiveAt: { not: null } }, orderBy: { effectiveAt: "asc" }, select: { effectiveAt: true },
  });
  if (!oldest?.effectiveAt) return 0;
  const first = getDateKeyInColombia(oldest.effectiveAt);
  const today = getDateKeyInColombia();
  const existing = new Set<string>();
  let cursor: string | null = null;
  // Sales can insert isolated days. Enumerate keys in pages to fill gaps rather
  // than mistaking the oldest existing day for a fully seeded historical range.
  for (;;) {
    const jobs: Array<{ key: string }> = await prisma.cierreSyncTrabajo.findMany({
      where: { financial: "PAYJOY", key: { startsWith: DAY_PREFIX, ...(cursor === null ? {} : { gt: cursor }) } },
      orderBy: { key: "asc" }, select: { key: true }, take: 500,
    });
    for (const job of jobs) existing.add(job.key);
    if (jobs.length < 500) break;
    cursor = jobs[jobs.length - 1].key;
  }
  const days: string[] = [];
  const priority = getCierrePriority();
  if (priority) for (let day = priority.to < today ? priority.to : today; day >= priority.from && day >= first && days.length < 50; day = shiftDateKey(day, -1)) {
    if (!existing.has(`${DAY_PREFIX}${day}`)) days.push(day);
  }
  for (let day = today; day >= first && days.length < 50; day = shiftDateKey(day, -1)) {
    if (!existing.has(`${DAY_PREFIX}${day}`) && !days.includes(day)) days.push(day);
  }
  if (days.length) await prisma.$transaction(async (tx) => {
    for (const day of days) {
      const key = `${DAY_PREFIX}${day}`;
      await tx.cierreSyncTrabajo.upsert({ where: { key }, update: {}, create: { key, localKey: key, financial: "PAYJOY" } });
    }
  }, { timeout: 60_000 });
  return days.length;
}

async function acquireProviderRate(financial: string) {
  const now = new Date();
  await prisma.cierreSyncEstado.upsert({ where: { key: "PROVIDER_RATE" }, create: { key: "PROVIDER_RATE" }, update: {} });
  const acquired = await prisma.cierreSyncEstado.updateMany({
    where: { key: "PROVIDER_RATE", OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    data: { lockedUntil: new Date(now.getTime() + MINUTE), lockToken: financial },
  });
  // Never release: all replicas, restarts and cron invocations share this rate.
  return acquired.count === 1;
}

async function extendProviderPause(until: Date) {
  await prisma.cierreSyncEstado.updateMany({
    where: { key: "PROVIDER_RATE", OR: [{ lockedUntil: null }, { lockedUntil: { lt: until } }] },
    data: { lockedUntil: until },
  });
}

async function updatePayJoyLocalJobs(tx: Prisma.TransactionClient, day: string, data: Prisma.CierreSyncTrabajoUpdateManyMutationInput) {
  const start = new Date(`${day}T00:00:00-05:00`);
  let cursor: string | null = null;
  for (;;) {
    const credits: Array<{ id: string; localKey: string | null }> = await tx.cierreCredito.findMany({
      where: { financial: "PAYJOY", localKey: { not: null }, effectiveAt: { gte: start, lt: new Date(start.getTime() + DAY) },
        ...(cursor === null ? {} : { id: { gt: cursor } }) },
      orderBy: { id: "asc" }, select: { id: true, localKey: true }, take: 500,
    });
    if (!credits.length) break;
    await tx.cierreSyncTrabajo.updateMany({
      where: { financial: "PAYJOY", localKey: { in: credits.map((credit) => credit.localKey!) }, state: { not: "RETIRADO" } }, data,
    });
    cursor = credits[credits.length - 1].id;
    if (credits.length < 500) break;
  }
}

async function persistResult(job: CierreSyncTrabajo, attempt: CierreSyncTrabajo, day: string | null, result: CierreProviderBatch) {
  const successful = result.outcome === "OBSERVED" || result.outcome === "EMPTY";
  const state = successful ? "REVISADO" : result.outcome === "MISSING_REFERENCE" ? "SIN_REFERENCIA" : "ERROR";
  const isConfiguration = result.outcome === "NOT_CONFIGURED" || result.outcome === "LOCAL_ONLY";
  const code = isConfiguration ? "CONFIG" : result.outcome === "UNSUPPORTED_RESPONSE" ? "INVALID_RESPONSE" : undefined;
  const delay = successful ? (day && day < shiftDateKey(getDateKeyInColombia(), -1) ? 7 * DAY : DAY)
    : Math.max(backoff(job.attempts), isConfiguration ? 30 * MINUTE : 0);
  const nextAttempt = new Date(Date.now() + delay);
  if (isConfiguration) await extendProviderPause(nextAttempt);
  const data: Prisma.CierreSyncTrabajoUpdateManyMutationInput = {
    state, nextAttempt, limitation: result.limitation || (successful ? "Cobertura parcial; se conservan las referencias revisadas." : "Respuesta pendiente de revisión."),
    ...(successful ? { attempts: 0, lastSuccess: new Date() } : {}),
  };
  const counts = await prisma.$transaction(async (tx) => {
    const saved = await tx.cierreSyncTrabajo.updateMany({ where: { key: job.key, updatedAt: attempt.updatedAt }, data });
    if (saved.count !== 1) return { observed: 0, linked: 0, pending: 0, stale: true };
    const reconciled = successful ? await reconcileCierreCredits(tx, result.credits) : { observed: 0, linked: 0, pending: 0, reasons: {} };
    const summary = JSON.stringify({ reasons: reconciled.reasons || {}, outcome: result.outcome });
    await tx.cierreSyncEstado.upsert({ where: { key: `RESULT:${job.key}` }, create: { key: `RESULT:${job.key}`, lockToken: summary }, update: { lockToken: summary } });
    if (day) await updatePayJoyLocalJobs(tx, day, data);
    return { ...reconciled, stale: false };
  }, { timeout: 60_000 });
  return { processed: 1, financial: job.financial, mode: day ? "PERIODO" : "REFERENCIA", state: counts.stale ? "PENDIENTE" : state,
    outcome: result.outcome, ...counts, ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    ...(code ? { code } : {}), ...(state === "ERROR" ? { failed: true } : {}) };
}

async function persistError(job: CierreSyncTrabajo, attempt: CierreSyncTrabajo, day: string | null, error: unknown) {
  const classified = classifyCierreProviderError(error);
  const nextAttempt = new Date(Date.now() + Math.max(backoff(job.attempts), classified.retryAfterMs || 0,
    ["AUTH", "CONFIG"].includes(classified.code) ? 30 * MINUTE : 0));
  if (["RATE_LIMIT", "AUTH", "CONFIG"].includes(classified.code)) await extendProviderPause(nextAttempt);
  const data = { state: "ERROR", nextAttempt, limitation: `Consulta no completada (${classified.code}); se conservan los créditos confirmados.` };
  const stale = await prisma.$transaction(async (tx) => {
    const saved = await tx.cierreSyncTrabajo.updateMany({ where: { key: job.key, updatedAt: attempt.updatedAt }, data });
    if (saved.count !== 1) return true;
    const summary = JSON.stringify({ code: classified.code });
    await tx.cierreSyncEstado.upsert({ where: { key: `RESULT:${job.key}` }, create: { key: `RESULT:${job.key}`, lockToken: summary }, update: { lockToken: summary } });
    if (day) await updatePayJoyLocalJobs(tx, day, data);
    return false;
  }, { timeout: 60_000 });
  return { processed: 1, financial: job.financial, mode: day ? "PERIODO" : "REFERENCIA", state: stale ? "PENDIENTE" : "ERROR",
    failed: true, code: classified.code, stale };
}

async function syncOneProviderReference() {
  const seeded = await seedPayJoyDays();
  const rate = await prisma.cierreSyncEstado.findUnique({ where: { key: "PROVIDER_RATE" }, select: { lockToken: true } });
  const financials = ["SUMASPAY", "ADDI", "PAYJOY"];
  const start = (financials.indexOf(rate?.lockToken || "") + 1) % financials.length;
  const order = [...financials.slice(start), ...financials.slice(0, start)];
  const priority = getCierrePriority();
  const priorityKeys = new Map<string, string[]>();
  if (priority) {
    let cursor: string | null = null;
    for (;;) {
      const credits: Array<{ id: string; localKey: string | null; financial: string }> = await prisma.cierreCredito.findMany({
        where: { financial: { in: ["SUMASPAY", "ADDI"] }, localKey: { not: null }, effectiveAt: { gte: priority.start, lt: priority.end },
          ...(cursor === null ? {} : { id: { gt: cursor } }) },
        orderBy: { id: "asc" }, take: 500, select: { id: true, localKey: true, financial: true },
      });
      for (const credit of credits) {
        const keys = priorityKeys.get(credit.financial) || [];
        keys.push(credit.localKey!);
        priorityKeys.set(credit.financial, keys);
      }
      if (credits.length < 500) break;
      cursor = credits[credits.length - 1].id;
    }
  }
  let skipped = 0;
  while (skipped < 100) {
    let job: CierreSyncTrabajo | null = null;
    // Persisted rotation prevents a large reference backlog from starving the
    // account-level daily list or the other provider's confirmed local sales.
    // Search every provider inside the priority range before considering any
    // other period. Fresh references precede routine rechecks in each range.
    for (const prioritized of priority ? [true, false] : [false]) {
      for (const unconsulted of [true, false]) {
        for (const financial of order) {
          const keys = priorityKeys.get(financial) || [];
          const chunks = prioritized && financial !== "PAYJOY"
            ? Array.from({ length: Math.ceil(keys.length / 500) }, (_, index) => keys.slice(index * 500, index * 500 + 500)) : [null];
          for (const localKeys of chunks) {
            const candidate = await prisma.cierreSyncTrabajo.findFirst({
              where: { financial, nextAttempt: { lte: new Date() }, state: { in: providerStates },
                ...(unconsulted ? { lastSuccess: null } : {}), ...(localKeys ? { localKey: { in: localKeys } } : {}),
                ...(financial === "PAYJOY" ? { key: { startsWith: DAY_PREFIX,
                  ...(prioritized ? { gte: `${DAY_PREFIX}${priority!.from}`, lte: `${DAY_PREFIX}${priority!.to}` } : {}) } } : {}) },
              orderBy: [{ nextAttempt: "asc" }, { key: "asc" }],
            });
            if (candidate && (!job || candidate.nextAttempt < job.nextAttempt ||
                (candidate.nextAttempt.getTime() === job.nextAttempt.getTime() && candidate.key < job.key))) job = candidate;
          }
          if (job) break;
        }
        if (job) break;
      }
      if (job) break;
    }
    if (!job) return { processed: 0, seeded, skipped };
    const day = dayOfJob(job);
    const local = day ? null : await prisma.cierreCredito.findUnique({ where: { localKey: job.localKey } });
    if (!day && (job.financial === "PAYJOY" || !local?.effectiveAt || !local.ventaId ||
        !(await prisma.venta.findUnique({ where: { id: local.ventaId }, select: { id: true } })))) {
      await prisma.cierreSyncTrabajo.update({ where: { key: job.key }, data: { state: "RETIRADO" } });
      skipped++;
      continue;
    }
    const document = local?.documentNumber?.replace(/\D/g, "") || "";
    if (!day && !/^\d{5,15}$/.test(document)) {
      await prisma.cierreSyncTrabajo.update({ where: { key: job.key }, data: { state: "SIN_REFERENCIA", limitation: "Documento pendiente para consultar el crédito confirmado." } });
      skipped++;
      continue;
    }
    if (!await acquireProviderRate(job.financial)) return { processed: 0, seeded, skipped, rateLimited: true };
    // Persist before I/O; completion cannot consume a concurrently edited job.
    const attempt = await prisma.cierreSyncTrabajo.update({ where: { key: job.key }, data: {
      state: "PENDIENTE", attempts: { increment: 1 }, nextAttempt: new Date(Date.now() + backoff(job.attempts)),
    } });
    const date = day || getDateKeyInColombia(local!.effectiveAt!);
    const activity = JSON.stringify({ financial: job.financial, localKey: day ? null : job.localKey, day: date, startedAt: new Date().toISOString() });
    await prisma.cierreSyncEstado.upsert({ where: { key: "PROVIDER_ACTIVITY" },
      create: { key: "PROVIDER_ACTIVITY", lockToken: activity, lockedUntil: new Date(Date.now() + 10 * MINUTE) },
      update: { lockToken: activity, lockedUntil: new Date(Date.now() + 10 * MINUTE) } });
    const context = { day: date, priority: priority ? { from: priority.from, to: priority.to } : null };
    try {
      const result = day ? await consultarPeriodoPayJoyCierre({ fechaDesde: day, fechaHasta: day })
        : await consultarLoteProveedorCierre({
          financiera: job.financial as CierreProvider, fechaDesde: shiftDateKey(date, -1), fechaHasta: shiftDateKey(date, 1),
          referencias: [{ documento: document, imei: local!.imei || undefined, providerId: local!.providerCreditId || undefined,
            localKey: job.localKey, sedeId: local!.sedeId || undefined, effectiveDate: date, amount: Number(local!.amount) }],
        });
      return { ...await persistResult(job, attempt, day, result), seeded, skipped, ...context };
    } catch (error) {
      return { ...await persistError(job, attempt, day, error), seeded, skipped, ...context };
    } finally {
      await prisma.cierreSyncEstado.updateMany({ where: { key: "PROVIDER_ACTIVITY", lockToken: activity }, data: { lockToken: null, lockedUntil: null } });
    }
  }
  return { processed: 0, seeded, skipped };
}

export async function readCierrePriorityProgress() {
  const priority = getCierrePriority();
  if (!priority) return null;
  return prisma.$transaction(async (tx) => {
    // Administrative diagnostics only. Never expose lease tokens, reference
    // keys or provider activity payloads in logs or the report response.
    const states = await tx.cierreSyncEstado.findMany({
      where: { key: { in: ["WORKER", "PROVIDER_RATE", "PROVIDER_ACTIVITY"] } },
      select: { key: true, updatedAt: true, lockedUntil: true },
    });
    const worker = states.find((state) => state.key === "WORKER");
    const rate = states.find((state) => state.key === "PROVIDER_RATE");
    const activity = states.find((state) => state.key === "PROVIDER_ACTIVITY");
    const runtime = {
      checkedAt: new Date().toISOString(),
      schedulerEnabled: process.env.CIERRE_SYNC_ENABLED === "1",
      providerEnabled: process.env.CIERRE_PROVIDER_SYNC_ENABLED === "1",
      workerUpdatedAt: worker?.updatedAt?.toISOString() ?? null,
      workerLeaseUntil: worker?.lockedUntil?.toISOString() ?? null,
      providerActivityUntil: activity?.lockedUntil?.toISOString() ?? null,
      rateUntil: rate?.lockedUntil?.toISOString() ?? null,
    };
    const sources = await readCierreProviderProgress(tx, { sedeId: null, start: priority.start, end: priority.end, financial: null });
    return { priority: { from: priority.from, to: priority.to }, runtime,
      totals: aggregateCierreProviderSync([...sources.values()]), sources: Object.fromEntries(sources) };
  }, { isolationLevel: "RepeatableRead", timeout: 20_000 });
}

export async function runCierreSyncBatch(options: { localOnly?: boolean } = {}) {
  const token = randomUUID();
  const now = new Date();
  await prisma.cierreSyncEstado.upsert({ where: { key: "WORKER" }, create: { key: "WORKER" }, update: {} });
  const lease = await prisma.cierreSyncEstado.updateMany({ where: { key: "WORKER", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockToken: token, lockedUntil: new Date(now.getTime() + 10 * MINUTE) } });
  if (lease.count !== 1) return { busy: true };
  try {
    const local = await drainCierreLocalQueue(500);
    const provider = process.env.CIERRE_PROVIDER_SYNC_ENABLED !== "1" ? { processed: 0, disabled: true }
      : options.localOnly ? { processed: 0, deferred: true } : await syncOneProviderReference();
    return { busy: false, local, provider };
  } finally {
    await prisma.cierreSyncEstado.updateMany({ where: { key: "WORKER", lockToken: token }, data: { lockedUntil: null, lockToken: null } });
  }
}
