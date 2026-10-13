import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function scheduler(runBatch, env = {}, readProgress) {
  const state = {}, timers = [], calls = [], logs = [], progressCalls = [];
  let now = 1_000_000;
  const mod = { exports: {} };
  new Function("require", "exports", "module", "process", "globalThis", "setTimeout", "Date", "console", code)(
    () => ({ runCierreSyncBatch: async (options) => { calls.push(options); return runBatch(options); },
      readCierrePriorityProgress: readProgress ? async () => { progressCalls.push(now); return readProgress(); } : undefined }),
    mod.exports, mod, { env: { NEXT_RUNTIME: "nodejs", CIERRE_SYNC_ENABLED: "1", ...env } }, state,
    (fn, delay) => { const timer = { fn, delay, unref() {} }; timers.push(timer); return timer; },
    { now: () => now }, { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  );
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { register: mod.exports.register, calls, timers, logs, progressCalls, settle,
    async tick() { const timer = timers.shift(); assert.ok(timer); now += timer.delay; timer.fn(); await settle(); },
    advance(ms) { now += ms; },
  };
}

test("histórico continúa sin esperar un minuto; las consultas de proveedores conservan su intervalo", async () => {
  const remaining = [1000, 500, 0, 0];
  const app = scheduler(async () => ({ busy: false, local: { processed: 500, remaining: remaining.shift() }, provider: { processed: 0 } }));
  await app.register(); await app.settle();
  assert.equal(app.timers[0].delay, 1500);
  assert.equal(app.calls[0].localOnly, false);
  await app.tick();
  assert.equal(app.calls[1].localOnly, true);
  assert.equal(app.timers[0].delay, 1500);
  await app.tick();
  assert.equal(app.calls[2].localOnly, true);
  assert.equal(app.timers[0].delay, 60000);
  await app.tick();
  assert.equal(app.calls[3].localOnly, false);
});

test("no solapa lotes ni duplica trabajador al registrar dos veces", async () => {
  let release;
  const app = scheduler(() => new Promise((resolve) => { release = resolve; }));
  await app.register(); await app.settle();
  await app.register();
  assert.equal(app.calls.length, 1);
  assert.equal(app.timers.length, 0, "El siguiente lote se programa al finalizar el actual");
  release({ busy: false, local: { processed: 100, remaining: 100 } }); await app.settle();
  await app.register();
  assert.equal(app.calls.length, 1);
  assert.equal(app.timers.length, 1);
});

test("cola diferida, lease ocupado y errores esperan un minuto, sin bucle de reintentos", async () => {
  for (const result of [{ busy: true }, { busy: false, local: { processed: 0, remaining: 5 } }, new Error("private")]) {
    const app = scheduler(async () => { if (result instanceof Error) throw result; return result; });
    await app.register(); await app.settle();
    assert.equal(app.timers[0].delay, 60000);
    assert.ok(!JSON.stringify(app.logs).includes("private"));
  }
});

test("build, Edge y trabajador desactivado nunca ejecutan sincronización", async () => {
  for (const env of [{ NEXT_PHASE: "phase-production-build" }, { NEXT_RUNTIME: "edge" }, { CIERRE_SYNC_ENABLED: "0" }]) {
    const app = scheduler(() => { throw new Error("Unexpected sync"); }, env);
    await app.register(); await app.settle();
    assert.equal(app.calls.length, 0);
    assert.equal(app.timers.length, 0);
  }
});

test("heartbeat informa lease ocupado, espera de rate y fallos aunque ningún proveedor sea consultado", async () => {
  const outcomes = [{ busy: true }, { busy: false, local: { processed: 0 }, provider: { processed: 0, rateLimited: true } }, new Error("private")];
  const app = scheduler(async () => {
    const result = outcomes.shift();
    if (result instanceof Error) throw result;
    return result;
  }, {}, async () => ({ runtime: { workerLeaseUntil: "2026-10-13T18:10:00.000Z" } }));
  await app.register(); await app.settle();
  await app.tick(); await app.tick();
  assert.equal(app.progressCalls.length, 3);
  const sync = app.logs.filter(([name]) => name === "CIERRE_SYNC").map(([, value]) => JSON.parse(value));
  assert.equal(sync[0].busy, true);
  assert.equal(sync[1].provider.rateLimited, true);
  assert.equal(app.logs.filter(([name]) => name === "CIERRE_PRIORITY_PROGRESS").length, 3);
  assert.ok(!JSON.stringify(app.logs).includes("private"));
  assert.equal(app.timers[0].delay, 60_000);
});

test("heartbeat durante carga local sólo lee progreso una vez por minuto sin acelerar proveedores", async () => {
  const app = scheduler(async () => ({ busy: false, local: { processed: 500, remaining: 1000 }, provider: { processed: 0 } }), {}, async () => ({}));
  await app.register(); await app.settle();
  for (let index = 0; index < 40; index++) await app.tick();
  assert.equal(app.progressCalls.length, 2);
  assert.equal(app.progressCalls[1] - app.progressCalls[0], 60_000);
  assert.equal(app.calls.filter((call) => !call.localOnly).length, 2);
});
