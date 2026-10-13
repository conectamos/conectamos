// Optional in-process scheduler for the existing standalone Node deployment.
// Multi-replica safety and progress live in PostgreSQL, not in this timer.
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CIERRE_SYNC_ENABLED !== "1") return;
  const state = globalThis as typeof globalThis & { cierreTimer?: ReturnType<typeof setInterval>; cierreRunning?: boolean };
  if (state.cierreTimer) return;
  const { runCierreSyncBatch } = await import("@/lib/cierre-sync");
  let firstRun = true;
  const run = async () => {
    if (state.cierreRunning) return;
    state.cierreRunning = true;
    try {
      const result = await runCierreSyncBatch();
      if (!result.busy && (firstRun || (result.local?.processed ?? 0) > 0)) {
        console.info("CIERRE_SYNC", JSON.stringify(result));
        firstRun = false;
      }
    }
    catch { console.error("CIERRE: sincronización pendiente; verificar migración y conexión."); }
    finally { state.cierreRunning = false; }
  };
  state.cierreTimer = setInterval(() => { void run(); }, 60_000);
  state.cierreTimer.unref();
  void run();
}
