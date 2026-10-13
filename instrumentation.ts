// Optional in-process scheduler for the existing standalone Node deployment.
// Multi-replica safety and progress live in PostgreSQL, not in this timer.
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CIERRE_SYNC_ENABLED !== "1") return;
  const state = globalThis as typeof globalThis & { cierreTimer?: ReturnType<typeof setTimeout>; cierreRunning?: boolean };
  if (state.cierreTimer || state.cierreRunning) return;
  const { runCierreSyncBatch } = await import("@/lib/cierre-sync");
  let firstRun = true;
  let nextProviderAttempt = 0;
  const run = async () => {
    if (state.cierreRunning) return;
    state.cierreRunning = true;
    let delay = 60_000;
    try {
      const localOnly = Date.now() < nextProviderAttempt;
      if (!localOnly) nextProviderAttempt = Date.now() + 60_000;
      const result = await runCierreSyncBatch({ localOnly });
      // Drain history in bounded transactions with a pause between batches.
      // Provider reads retain the minute interval even during the local backfill.
      if (!result.busy && result.local && result.local.processed > 0 && result.local.remaining > 0) delay = 1_500;
      if (!result.busy && (firstRun || (result.local?.processed ?? 0) > 0 || (result.provider?.processed ?? 0) > 0)) {
        console.info("CIERRE_SYNC", JSON.stringify(result));
        firstRun = false;
      }
    }
    catch { console.error("CIERRE: sincronización pendiente; verificar migración y conexión."); }
    finally {
      state.cierreRunning = false;
      state.cierreTimer = setTimeout(() => { void run(); }, delay);
      state.cierreTimer.unref();
    }
  };
  void run();
}
