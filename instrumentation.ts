// Optional in-process scheduler for the existing standalone Node deployment.
// Multi-replica safety and progress live in PostgreSQL, not in this timer.
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Next awaits register before serving requests; additive schema precedes Prisma model reads.
  const { ensureVendorProfilesSchema } = await import("@/lib/vendor-profile-schema");
  await ensureVendorProfilesSchema();
  // Invoice reminders run on the server even with no browser open. Their
  // durable delivery claims are independent of the credit-sync scheduler.
  if (process.env.INVOICE_REMINDERS_ENABLED === "1") {
    const reminderState = globalThis as typeof globalThis & { invoiceReminderTimer?: ReturnType<typeof setTimeout>; invoiceReminderRunning?: boolean };
    if (!reminderState.invoiceReminderTimer && !reminderState.invoiceReminderRunning) {
      const { runInvoiceReminderBatch } = await import("@/lib/invoice-reminders");
      const runReminders = async () => {
        if (reminderState.invoiceReminderRunning) return;
        reminderState.invoiceReminderRunning = true;
        try { await runInvoiceReminderBatch(); }
        catch { console.error("INVOICE_REMINDERS: no fue posible verificar los recordatorios pendientes."); }
        finally {
          reminderState.invoiceReminderRunning = false;
          reminderState.invoiceReminderTimer = setTimeout(() => { void runReminders(); }, 60_000);
          reminderState.invoiceReminderTimer.unref();
        }
      };
      // Startup registration must finish before an external flow can call back.
      reminderState.invoiceReminderTimer = setTimeout(() => { void runReminders(); }, 5_000);
      reminderState.invoiceReminderTimer.unref();
    }
  }
  if (process.env.CIERRE_SYNC_ENABLED !== "1") return;
  const state = globalThis as typeof globalThis & { cierreTimer?: ReturnType<typeof setTimeout>; cierreRunning?: boolean };
  if (state.cierreTimer || state.cierreRunning) return;
  const { runCierreSyncBatch, readCierrePriorityProgress } = await import("@/lib/cierre-sync");
  let nextProviderAttempt = 0;
  let nextProgressLog = 0;
  const run = async () => {
    if (state.cierreRunning) return;
    state.cierreRunning = true;
    let delay = 60_000;
    const heartbeatDue = Date.now() >= nextProgressLog;
    if (heartbeatDue) nextProgressLog = Date.now() + 60_000;
    try {
      const localOnly = Date.now() < nextProviderAttempt;
      if (!localOnly) nextProviderAttempt = Date.now() + 60_000;
      const result = await runCierreSyncBatch({ localOnly });
      // Drain history in bounded transactions with a pause between batches.
      // Provider reads retain the minute interval even during the local backfill.
      if (!result.busy && result.local && result.local.processed > 0 && result.local.remaining > 0) delay = 1_500;
      if (heartbeatDue || (!result.busy && ((result.local?.processed ?? 0) > 0 || (result.provider?.processed ?? 0) > 0))) {
        console.info("CIERRE_SYNC", JSON.stringify(result));
      }
    }
    catch { console.error("CIERRE: sincronización pendiente; verificar migración y conexión."); }
    finally {
      // Leases held by an older instance and rate pauses must remain visible.
      // This only reads PostgreSQL, at most once per minute, including failures.
      if (heartbeatDue && typeof readCierrePriorityProgress === "function") {
        try {
          const progress = await readCierrePriorityProgress();
          if (progress) console.info("CIERRE_PRIORITY_PROGRESS", JSON.stringify(progress));
        } catch { console.error("CIERRE_PRIORITY_PROGRESS: resumen temporalmente no disponible."); }
      }
      state.cierreRunning = false;
      state.cierreTimer = setTimeout(() => { void run(); }, delay);
      state.cierreTimer.unref();
    }
  };
  void run();
}
