import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(env, { failure = false } = {}) {
  const state = {}, timers = [], calls = [], errors = [];
  const imports = {
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => calls.push("schema") },
    "@/lib/invoice-reminders": { runInvoiceReminderBatch: async () => { calls.push("reminder"); if (failure) throw new Error("secret transport detail"); } },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "process", "globalThis", "setTimeout", "console", code)(
    name => { assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name]; },
    loaded, loaded.exports, { env }, state,
    (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; },
    { error: message => errors.push(message) },
  );
  return { register: loaded.exports.register, state, timers, calls, errors };
}

test("build and non-Node runtimes do not register database jobs", async () => {
  for (const env of [{ NEXT_RUNTIME: "edge", INVOICE_REMINDERS_ENABLED: "1" }, { NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", INVOICE_REMINDERS_ENABLED: "1" }]) {
    const app = harness(env); await app.register(); assert.deepEqual(app.calls, []); assert.equal(app.timers.length, 0);
  }
});
test("disabled reminders never start an external dispatch scheduler", async () => {
  const app = harness({ NEXT_RUNTIME: "nodejs", CIERRE_SYNC_ENABLED: "0" }); await app.register();
  assert.deepEqual(app.calls, ["schema"]); assert.equal(app.timers.length, 0);
});
test("reminders run without a browser or credit scheduler and repeat after startup", async () => {
  const app = harness({ NEXT_RUNTIME: "nodejs", INVOICE_REMINDERS_ENABLED: "1", CIERRE_SYNC_ENABLED: "0" });
  await app.register(); assert.deepEqual(app.calls, ["schema"]);
  assert.equal(app.timers.length, 1); assert.ok(app.timers[0].delay > 0);
  await app.timers[0].callback(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(app.calls, ["schema", "reminder"]); assert.equal(app.timers.at(-1).delay, 60_000);
  await app.register(); assert.equal(app.timers.length, 2, "Registering again must not create another timer");
});
test("job failures keep the next check scheduled and never log provider credentials", async () => {
  const app = harness({ NEXT_RUNTIME: "nodejs", INVOICE_REMINDERS_ENABLED: "1" }, { failure: true });
  await app.register(); await app.timers[0].callback(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.timers.at(-1).delay, 60_000); assert.equal(app.state.invoiceReminderRunning, false);
  assert.equal(app.errors.length, 1); assert.doesNotMatch(app.errors[0], /secret transport detail/);
});
