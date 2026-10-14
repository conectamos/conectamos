import assert from "node:assert/strict";
import test from "node:test";
import { database, modules, credit, sale } from "./cierre-test-helpers.mjs";

const now = new Date("2026-10-13T12:00:00Z");
const dayKey = (date) => `PERIODO:PAYJOY:${date}`;
const periodJob = (date, changes = {}) => ({ key: dayKey(date), localKey: dayKey(date), financial: "PAYJOY", state: "PENDIENTE", attempts: 0, nextAttempt: new Date(0), ...changes });
const localJob = (id, financial = "PAYJOY", changes = {}) => ({ key: `VENTA:${id}:${financial}`, localKey: `VENTA:${id}:${financial}`, financial, state: "PENDIENTE", attempts: 0, nextAttempt: new Date(0), ...changes });
const batch = (outcome = "EMPTY", credits = []) => ({ outcome, credits, complete: false, limitation: "Cobertura parcial comprobada." });
function setup(t, enabled = "1") {
  const previous = process.env.CIERRE_PROVIDER_SYNC_ENABLED;
  process.env.CIERRE_PROVIDER_SYNC_ENABLED = enabled;
  t.mock.timers.enable({ apis: ["Date"], now });
  t.after(() => { if (previous === undefined) delete process.env.CIERRE_PROVIDER_SYNC_ENABLED; else process.env.CIERRE_PROVIDER_SYNC_ENABLED = previous; });
}

test("seed PAYJOY rellena huecos de hasta 50 días por lote y conserva progreso entre reinicios", async (t) => {
  setup(t);
  const oldest = new Date(now.getTime() - 120 * 86400000);
  const db = database({ cierreCredito: [credit(1, { effectiveAt: oldest })], cierreSyncTrabajo: [periodJob("2026-07-25", {
    state: "REVISADO", lastSuccess: new Date("2026-10-12T12:00:00Z"), nextAttempt: new Date("2026-12-01T00:00:00Z"),
  })] });
  let calls = 0;
  const periodProvider = async () => { calls++; return batch(); };
  for (const expected of [50, 50, 20]) {
    const result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
    assert.equal(result.provider.seeded, expected);
  }
  assert.equal(db.tables.cierreSyncTrabajo.length, 121);
  assert.equal(new Set(db.tables.cierreSyncTrabajo.map((row) => row.key)).size, 121);
  assert.equal(db.tables.cierreSyncTrabajo.find((row) => row.key === dayKey("2026-07-25")).lastSuccess.toISOString(), "2026-10-12T12:00:00.000Z");
  assert.equal(calls, 1, "El gate de tráfico sobrevive a reconstruir el módulo");
});

test("un listado PAYJOY diario actualiza todos los trabajos locales del día en bloques", async (t) => {
  setup(t);
  const credits = Array.from({ length: 501 }, (_, index) => credit(index + 1));
  const db = database({ cierreCredito: [...credits, credit(999, { effectiveAt: new Date("2026-10-11T18:00:00Z") })],
    cierreSyncTrabajo: [periodJob("2026-10-12"), ...credits.map((row) => localJob(row.id)), localJob(999)] });
  const requests = [];
  const periodProvider = async (request) => { requests.push(request); return batch(); };
  const result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.deepEqual(requests, [{ fechaDesde: "2026-10-12", fechaHasta: "2026-10-12" }]);
  assert.equal(result.provider.mode, "PERIODO");
  assert.equal(result.provider.state, "REVISADO");
  assert.ok(credits.every((row) => db.tables.cierreSyncTrabajo.find((job) => job.localKey === row.localKey).state === "REVISADO"));
  assert.equal(db.tables.cierreSyncTrabajo.find((row) => row.key === localJob(999).key).state, "PENDIENTE");
  const updates = db.calls.filter((call) => call.table === "cierreSyncTrabajo" && call.method === "updateMany" && call.args.where.localKey);
  assert.deepEqual(updates.map((call) => call.args.where.localKey.in.length), [500, 1]);
  assert.ok(!JSON.stringify(result.provider).includes("1234567"));
});

test("edición durante el listado no consume el trabajo diario ni confirma referencias nuevas", async (t) => {
  setup(t);
  const db = database({ cierreCredito: [credit(1)], cierreSyncTrabajo: [periodJob("2026-10-12"), localJob(1)] });
  const periodProvider = async () => {
    const job = db.tables.cierreSyncTrabajo.find((row) => row.key === dayKey("2026-10-12"));
    job.updatedAt = new Date(now.getTime() + 1);
    job.nextAttempt = new Date();
    return batch();
  };
  const result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.stale, true);
  assert.equal(result.provider.state, "PENDIENTE");
  assert.equal(db.tables.cierreSyncTrabajo.find((row) => row.key === localJob(1).key).state, "PENDIENTE");
  assert.equal(db.tables.cierreSyncTrabajo.find((row) => row.key === dayKey("2026-10-12")).lastSuccess, undefined);
});

test("conciliación diaria enlaza un crédito una vez y aplica reverso por ID conservando su fecha", async (t) => {
  setup(t);
  const db = database({ cierreCredito: [credit(1)], cierreSyncTrabajo: [periodJob("2026-10-12"), localJob(1)] });
  let status = "EFECTIVO";
  let requests = 0;
  const periodProvider = async () => { requests++; return batch("OBSERVED", [{
    financiera: "PAYJOY", providerId: "p-1", fechaEfectiva: status === "EFECTIVO" ? new Date("2026-10-12T18:00:00Z") : null,
    valor: status === "EFECTIVO" ? 1000000 : null, documento: "1234567", imei: "123456789012345", cliente: "Cliente",
    estado: status, sourceUpdatedAt: new Date(), raw: { estado: status },
  }]); };
  let result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.linked, 1);
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].providerCreditId, "p-1");
  status = "REVERSADO";
  t.mock.timers.tick(60001);
  db.tables.cierreSyncTrabajo.find((row) => row.key === dayKey("2026-10-12")).nextAttempt = new Date(0);
  result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(requests, 2);
  assert.equal(result.provider.linked, 1);
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].status, "REVERSADO");
  assert.equal(db.tables.cierreCredito[0].effectiveAt.toISOString(), "2026-10-12T18:00:00.000Z");
});

test("dos préstamos indistinguibles quedan pendientes y un reintento no duplica observaciones", async (t) => {
  setup(t);
  const db = database({ cierreCredito: [credit(1), credit(2)], cierreSyncTrabajo: [periodJob("2026-10-12"), localJob(1), localJob(2)] });
  const periodProvider = async () => batch("OBSERVED", [1, 2].map((id) => ({ financiera: "PAYJOY", providerId: `p-${id}`,
    fechaEfectiva: new Date("2026-10-12T18:00:00Z"), valor: 1000000, documento: "1234567", imei: "123456789012345", cliente: "Cliente", estado: "EFECTIVO", raw: {} })));
  let result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.pending, 2);
  assert.equal(result.provider.linked, 0);
  assert.equal(db.tables.cierreCredito.filter((row) => row.status === "EFECTIVO").length, 2);
  t.mock.timers.tick(60001);
  db.tables.cierreSyncTrabajo.find((row) => row.key === dayKey("2026-10-12")).nextAttempt = new Date(0);
  result = await modules(db.prisma, { periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.pending, 2);
  assert.equal(db.tables.cierreCredito.length, 4);
  assert.equal(db.tables.cierreEvento.length, 2);
});

test("429 persiste Retry-After y bloquea consultas de otro worker sin filtrar errores privados", async (t) => {
  setup(t);
  const ref = credit(1, { financial: "SUMASPAY", localKey: "VENTA:1:SUMASPAY" });
  const db = database({ venta: [sale(1)], cierreCredito: [ref], cierreSyncTrabajo: [localJob(1, "SUMASPAY")] });
  let calls = 0;
  const provider = async () => { calls++; throw Object.assign(new Error("https://private.example?secret=1234567"), { status: 429, retryAfter: "3600" }); };
  const result = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.code, "RATE_LIMIT");
  assert.equal(calls, 1);
  const rate = db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_RATE");
  assert.equal(rate.lockedUntil.getTime(), now.getTime() + 3600000);
  assert.equal(db.tables.cierreSyncTrabajo[0].nextAttempt.getTime(), rate.lockedUntil.getTime());
  db.tables.cierreSyncTrabajo[0].nextAttempt = new Date(0);
  const second = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(second.provider.rateLimited, true);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(db.tables.cierreSyncTrabajo).includes("secret"));
});

test("resultados no consultables conservan lastSuccess vacío y configuración pausa el tráfico", async (t) => {
  setup(t);
  for (const [outcome, expected] of [["MISSING_REFERENCE", "SIN_REFERENCIA"], ["NOT_CONFIGURED", "ERROR"], ["UNSUPPORTED_RESPONSE", "ERROR"], ["LOCAL_ONLY", "ERROR"], ["EMPTY", "REVISADO"]]) {
    const db = database({ venta: [sale(1)], cierreCredito: [credit(1, { financial: "ADDI", localKey: "VENTA:1:ADDI" })], cierreSyncTrabajo: [localJob(1, "ADDI")] });
    const result = await modules(db.prisma, { provider: async () => batch(outcome) }).load("lib/cierre-sync.ts").runCierreSyncBatch();
    const job = db.tables.cierreSyncTrabajo[0];
    assert.equal(job.state, expected, outcome);
    assert.equal(Boolean(job.lastSuccess), outcome === "EMPTY", outcome);
    assert.equal(result.provider.outcome, outcome);
    if (["NOT_CONFIGURED", "LOCAL_ONLY"].includes(outcome)) assert.ok(db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_RATE").lockedUntil.getTime() >= now.getTime() + 1800000);
  }
});

test("hasta cien referencias inválidas se retiran sin red y una válida espera el siguiente lote", async (t) => {
  setup(t);
  const ids = Array.from({ length: 101 }, (_, index) => index + 1);
  const db = database({ venta: ids.map((id) => sale(id)), cierreCredito: ids.map((id) => credit(id, {
    financial: "SUMASPAY", localKey: `VENTA:${id}:SUMASPAY`, documentNumber: id === 101 ? "1234567" : "12",
  })), cierreSyncTrabajo: ids.map((id) => localJob(id, "SUMASPAY", { key: `0-${String(id).padStart(3, "0")}` })) });
  let calls = 0;
  const provider = async () => { calls++; return batch(); };
  let result = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.skipped, 100);
  assert.equal(calls, 0);
  assert.equal(db.tables.cierreSyncTrabajo.filter((row) => row.state === "SIN_REFERENCIA").length, 100);
  result = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(calls, 1);
  assert.equal(result.provider.financial, "SUMASPAY");
});

test("flag cero y localOnly no crean cola remota ni consumen el gate persistido", async (t) => {
  setup(t, "0");
  const db = database({ cierreCredito: [credit(1)] });
  let result = await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.disabled, true);
  process.env.CIERRE_PROVIDER_SYNC_ENABLED = "1";
  result = await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch({ localOnly: true });
  assert.equal(result.provider.deferred, true);
  assert.equal(db.tables.cierreSyncTrabajo.length, 0);
  assert.equal(db.tables.cierreSyncEstado.some((row) => row.key === "PROVIDER_RATE"), false);
});

test("rotación persistida atiende cada financiera aunque otra tenga un trabajo anterior", async (t) => {
  setup(t);
  const db = database({ venta: [sale(1), sale(2)], cierreCredito: [
    credit(1, { financial: "SUMASPAY", localKey: "VENTA:1:SUMASPAY" }),
    credit(2, { financial: "ADDI", localKey: "VENTA:2:ADDI" }), credit(3),
  ], cierreSyncTrabajo: [localJob(1, "SUMASPAY"), localJob(2, "ADDI"), periodJob("2026-10-12")] });
  const financials = [];
  const provider = async (request) => { financials.push(request.financiera); return batch(); };
  const periodProvider = async () => { financials.push("PAYJOY"); return batch(); };
  for (let index = 0; index < 3; index++) {
    await modules(db.prisma, { provider, periodProvider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
    db.tables.cierreSyncTrabajo.find((row) => row.key === localJob(1, "SUMASPAY").key).nextAttempt = new Date(0);
    t.mock.timers.tick(60001);
  }
  assert.deepEqual(financials, ["SUMASPAY", "ADDI", "PAYJOY"]);
  assert.equal(db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_RATE").lockToken, "PAYJOY");
});

test("autenticación fallida pausa de forma persistida sin registrar credenciales", async (t) => {
  setup(t);
  const db = database({ venta: [sale(1)], cierreCredito: [credit(1, { financial: "ADDI", localKey: "VENTA:1:ADDI" })],
    cierreSyncTrabajo: [localJob(1, "ADDI")] });
  const provider = async () => { throw Object.assign(new Error("secret password"), { status: 401 }); };
  const result = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.code, "AUTH");
  assert.equal(db.tables.cierreSyncTrabajo[0].state, "ERROR");
  assert.equal(db.tables.cierreSyncTrabajo[0].lastSuccess, undefined);
  assert.ok(db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_RATE").lockedUntil.getTime() >= now.getTime() + 1800000);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("prioridad histórica busca todas las financieras antes de otros periodos y antes de reconsultas", async (t) => {
  setup(t);
  const previous = [process.env.CIERRE_PRIORITY_FROM, process.env.CIERRE_PRIORITY_TO];
  process.env.CIERRE_PRIORITY_FROM = "2026-09-01";
  process.env.CIERRE_PRIORITY_TO = "2026-09-30";
  t.after(() => {
    for (const [index, key] of ["CIERRE_PRIORITY_FROM", "CIERRE_PRIORITY_TO"].entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
  });
  const september = new Date("2026-09-15T18:00:00Z");
  const db = database({ venta: [sale(1), sale(2), sale(3)], cierreCredito: [
    credit(1, { financial: "SUMASPAY", localKey: "VENTA:1:SUMASPAY" }),
    credit(2, { financial: "ADDI", localKey: "VENTA:2:ADDI", effectiveAt: september }),
    credit(3, { financial: "SUMASPAY", localKey: "VENTA:3:SUMASPAY", effectiveAt: september }),
  ], cierreSyncTrabajo: [localJob(1, "SUMASPAY"), localJob(2, "ADDI"), localJob(3, "SUMASPAY", { state: "REVISADO", lastSuccess: new Date("2026-09-20T18:00:00Z") })] });
  const requests = [];
  const provider = async (request) => { requests.push(request); return batch(); };
  const result = await modules(db.prisma, { provider }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].financiera, "ADDI", "SUMASPAY fuera del periodo o ya consultada no roba el turno prioritario");
  assert.equal(result.provider.day, "2026-09-15");
  assert.deepEqual(result.provider.priority, { from: "2026-09-01", to: "2026-09-30" });
  const summary = await modules(db.prisma).load("lib/cierre-sync.ts").readCierrePriorityProgress();
  assert.equal(summary.totals.total, 2);
  assert.equal(summary.sources.ADDI.consulted, 1);
  assert.equal(summary.sources.ADDI.linked, 0, "EMPTY exitoso no inventa vínculos");
  assert.ok(!JSON.stringify(summary).includes("1234567"));
  assert.equal(db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_ACTIVITY").lockToken, null);
});

test("prioridad válida encola los días PAYJOY del rango antes del histórico normal", async (t) => {
  setup(t);
  const previous = [process.env.CIERRE_PRIORITY_FROM, process.env.CIERRE_PRIORITY_TO];
  process.env.CIERRE_PRIORITY_FROM = "2026-09-01";
  process.env.CIERRE_PRIORITY_TO = "2026-09-30";
  t.after(() => {
    for (const [index, key] of ["CIERRE_PRIORITY_FROM", "CIERRE_PRIORITY_TO"].entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
  });
  const db = database({ cierreCredito: [credit(1, { effectiveAt: new Date("2026-06-01T18:00:00Z") })] });
  const requests = [];
  const result = await modules(db.prisma, { periodProvider: async (request) => { requests.push(request); return batch(); } }).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.seeded, 50);
  assert.equal(db.tables.cierreSyncTrabajo.filter((job) => job.key.startsWith("PERIODO:PAYJOY:2026-09-")).length, 30);
  assert.ok(requests[0].fechaDesde.startsWith("2026-09-"));
  assert.equal(requests[0].fechaDesde, requests[0].fechaHasta);
  process.env.CIERRE_PRIORITY_FROM = "2026-09-31";
  assert.equal(modules(db.prisma).load("lib/cierre-priority.ts").getCierrePriority(), null, "No aceptar prioridades con fechas inexistentes");
});

test("diagnóstico administrativo muestra lease y gate sin tokens ni mutaciones durante worker ocupado", async (t) => {
  setup(t);
  const previous = [process.env.CIERRE_PRIORITY_FROM, process.env.CIERRE_PRIORITY_TO];
  process.env.CIERRE_PRIORITY_FROM = "2026-09-01";
  process.env.CIERRE_PRIORITY_TO = "2026-09-30";
  t.after(() => {
    for (const [index, key] of ["CIERRE_PRIORITY_FROM", "CIERRE_PRIORITY_TO"].entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
  });
  const leaseUntil = new Date(now.getTime() + 600_000);
  const rateUntil = new Date(now.getTime() + 60_000);
  const db = database({ cierreSyncEstado: [
    { key: "WORKER", updatedAt: now, lockedUntil: leaseUntil, lockToken: "secret-lease" },
    { key: "PROVIDER_RATE", updatedAt: now, lockedUntil: rateUntil, lockToken: "ADDI" },
    { key: "PROVIDER_ACTIVITY", updatedAt: now, lockedUntil: leaseUntil, lockToken: "private-reference-payload" },
  ] });
  const sync = modules(db.prisma).load("lib/cierre-sync.ts");
  const summary = await sync.readCierrePriorityProgress();
  assert.equal(summary.runtime.workerUpdatedAt, now.toISOString());
  assert.equal(summary.runtime.workerLeaseUntil, leaseUntil.toISOString());
  assert.equal(summary.runtime.rateUntil, rateUntil.toISOString());
  assert.equal(summary.runtime.providerActivityUntil, leaseUntil.toISOString());
  assert.equal(summary.runtime.providerEnabled, true);
  assert.ok(!JSON.stringify(summary).includes("secret-lease"));
  assert.ok(!JSON.stringify(summary).includes("private-reference-payload"));
  assert.equal(db.tables.cierreSyncEstado.find((row) => row.key === "WORKER").lockToken, "secret-lease");
  assert.deepEqual(await sync.runCierreSyncBatch(), { busy: true });
});

// Full history replaces the former sale-date crop without increasing traffic.
test("SUMAS recarga el rango prioritario una sola vez, reanuda cursor y conserva errores y gate", async (t) => {
  setup(t);
  const from = process.env.CIERRE_PRIORITY_FROM, to = process.env.CIERRE_PRIORITY_TO;
  process.env.CIERRE_PRIORITY_FROM = "2026-09-01";
  process.env.CIERRE_PRIORITY_TO = "2026-09-30";
  t.after(() => {
    if (from === undefined) delete process.env.CIERRE_PRIORITY_FROM; else process.env.CIERRE_PRIORITY_FROM = from;
    if (to === undefined) delete process.env.CIERRE_PRIORITY_TO; else process.env.CIERRE_PRIORITY_TO = to;
  });
  const date = new Date("2026-09-15T18:00:00Z"), future = new Date("2026-10-30T12:00:00Z");
  const rows = Array.from({ length: 501 }, (_, index) => credit(`s-${String(index).padStart(4, "0")}`, {
    financial: "SUMASPAY", localKey: `VENTA:${index}:SUMASPAY`, effectiveAt: date,
  }));
  const jobs = rows.map((row, index) => localJob(index, "SUMASPAY", {
    state: index === 0 ? "ERROR" : "REVISADO", lastSuccess: now, nextAttempt: future,
  }));
  const db = database({ cierreCredito: [...rows, credit("outside", { financial: "SUMASPAY", localKey: "VENTA:outside:SUMASPAY" })],
    cierreSyncTrabajo: [...jobs, localJob("outside", "SUMASPAY", { state: "REVISADO", nextAttempt: future })],
    venta: rows.map((row) => ({ id: row.ventaId })),
    cierreSyncEstado: [{ key: "LOCAL", initialized: true }, { key: "PROVIDER_RATE", lockedUntil: future, lockToken: "SUMASPAY" }],
  });
  let calls = 0;
  const options = { provider: async () => { calls++; return batch(); }, periodProvider: async () => { calls++; return batch(); } };
  await modules(db.prisma, options).load("lib/cierre-sync.ts").runCierreSyncBatch();
  const marker = db.tables.cierreSyncEstado.find((row) => row.key === "SUMAS_HISTORY_V2:2026-09-01:2026-09-30");
  assert.equal(marker.initialized, false);
  assert.equal(db.tables.cierreSyncTrabajo.filter((job) => job.financial === "SUMASPAY" && job.state === "PENDIENTE").length, 499);
  await modules(db.prisma, options).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(marker.initialized, true);
  assert.equal(db.tables.cierreSyncTrabajo.filter((job) => job.financial === "SUMASPAY" && job.state === "PENDIENTE").length, 500);
  assert.equal(jobs[0].state, "ERROR");
  assert.equal(jobs[0].nextAttempt, future);
  assert.equal(jobs[1].lastSuccess, now, "histórico de consulta previa permanece");
  assert.equal(db.tables.cierreSyncTrabajo.find((job) => job.key === "VENTA:outside:SUMASPAY").state, "REVISADO");
  jobs[1].state = "REVISADO"; jobs[1].nextAttempt = future;
  await modules(db.prisma, options).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(jobs[1].state, "REVISADO", "reiniciar no invalida referencias ya releídas");
  assert.equal(calls, 0, "el backfill sólo encola; nunca salta el límite compartido");
});

function recoveryScope(t) {
  setup(t);
  const from = process.env.CIERRE_PRIORITY_FROM, to = process.env.CIERRE_PRIORITY_TO;
  process.env.CIERRE_PRIORITY_FROM = "2026-09-01";
  process.env.CIERRE_PRIORITY_TO = "2026-09-30";
  t.after(() => {
    if (from === undefined) delete process.env.CIERRE_PRIORITY_FROM; else process.env.CIERRE_PRIORITY_FROM = from;
    if (to === undefined) delete process.env.CIERRE_PRIORITY_TO; else process.env.CIERRE_PRIORITY_TO = to;
  });
  return { date: new Date("2026-09-15T18:00:00Z"), old: new Date(now.getTime() - 2 * 86400000),
    activated: new Date(now.getTime() - 86400000), future: new Date(now.getTime() + 3600000),
    activationKey: "SUMAS_HISTORY_V2:2026-09-01:2026-09-30", markerKey: "SUMAS_UNSUPPORTED_V2:2026-09-01:2026-09-30" };
}

test("SUMAS recupera una vez sólo UNSUPPORTED_RESPONSE viejo del periodo y conserva pausas e intentos", async (t) => {
  const scope = recoveryScope(t);
  const definitions = [
    { id: "eligible", result: { outcome: "UNSUPPORTED_RESPONSE" } },
    { id: "new-result", result: { outcome: "UNSUPPORTED_RESPONSE" }, resultDate: now },
    { id: "new-job", result: { outcome: "UNSUPPORTED_RESPONSE" }, jobDate: now },
    { id: "at-cutoff", result: { outcome: "UNSUPPORTED_RESPONSE" }, resultDate: scope.activated },
    ...["INVALID_RESPONSE", "RATE_LIMIT", "AUTH", "CONFIG", "UNAVAILABLE", "UNKNOWN"].map((code) => ({ id: code, result: { code } })),
    { id: "mixed", result: { outcome: "UNSUPPORTED_RESPONSE", code: "RATE_LIMIT" } },
    { id: "bad-json", result: "not JSON" },
    { id: "no-result" },
    { id: "outside", result: { outcome: "UNSUPPORTED_RESPONSE" }, date: new Date("2026-08-31T18:00:00Z") },
    { id: "addi", result: { outcome: "UNSUPPORTED_RESPONSE" }, financial: "ADDI" },
  ];
  const rows = definitions.map((item) => credit(item.id, { financial: item.financial || "SUMASPAY",
    localKey: localJob(item.id, item.financial || "SUMASPAY").key, effectiveAt: item.date || scope.date }));
  const jobs = definitions.map((item) => localJob(item.id, item.financial || "SUMASPAY", {
    state: "ERROR", attempts: 7, nextAttempt: scope.future, updatedAt: item.jobDate || scope.old,
  }));
  const db = database({ cierreCredito: rows, venta: rows.map((row) => ({ id: row.ventaId })), cierreSyncTrabajo: [...jobs],
    cierreSyncEstado: [
      { key: "LOCAL", initialized: true },
      { key: scope.activationKey, initialized: true, updatedAt: scope.activated },
      { key: "PROVIDER_RATE", lockedUntil: scope.future, lockToken: "ADDI", updatedAt: scope.old },
      ...definitions.filter((item) => item.result).map((item) => ({ key: `RESULT:${localJob(item.id, item.financial || "SUMASPAY").key}`,
        lockToken: typeof item.result === "string" ? item.result : JSON.stringify(item.result), updatedAt: item.resultDate || scope.old })),
    ] });
  const untouched = structuredClone(jobs.slice(1));
  let calls = 0;
  const options = { provider: async () => { calls++; return batch(); }, periodProvider: async () => { calls++; return batch(); } };
  const result = await modules(db.prisma, options).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.recoveredSumas, 1);
  assert.equal(jobs[0].state, "PENDIENTE");
  assert.equal(jobs[0].nextAttempt.getTime(), now.getTime());
  assert.equal(jobs[0].attempts, 7);
  assert.deepEqual(jobs.slice(1), untouched);
  const marker = db.tables.cierreSyncEstado.find((row) => row.key === scope.markerKey);
  assert.equal(marker.initialized, true);
  assert.equal(marker.lastSuccess.getTime(), scope.activated.getTime());
  assert.equal(db.tables.cierreSyncEstado.find((row) => row.key === "PROVIDER_RATE").lockedUntil, scope.future);
  jobs[0].state = "ERROR"; jobs[0].nextAttempt = scope.future; jobs[0].updatedAt = new Date(now.getTime() + 1);
  const again = await modules(db.prisma, options).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(again.provider.recoveredSumas, 0);
  assert.equal(jobs[0].state, "ERROR", "El reinicio no repite la recuperación");
  const anchor = db.tables.cierreSyncEstado.find((row) => row.key === "SUMAS_UNSUPPORTED_V2_SCOPE");
  assert.equal(anchor.lockToken, "2026-09-01:2026-09-30");
  assert.equal(anchor.lastSuccess.getTime(), scope.activated.getTime());
  process.env.CIERRE_PRIORITY_FROM = "2026-08-01";
  process.env.CIERRE_PRIORITY_TO = "2026-08-31";
  db.tables.cierreSyncEstado.push({ key: "SUMAS_HISTORY_V2:2026-08-01:2026-08-31", initialized: true, updatedAt: now });
  const otherPeriod = await modules(db.prisma, options).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(otherPeriod.provider.recoveredSumas, 0);
  assert.equal(jobs.find((job) => job.key === localJob("outside", "SUMASPAY").key).state, "ERROR");
  assert.equal(db.tables.cierreSyncEstado.some((row) => row.key === "SUMAS_UNSUPPORTED_V2:2026-08-01:2026-08-31"), false);
  assert.equal(anchor.lockToken, "2026-09-01:2026-09-30", "Otra prioridad no rearma la recuperación");
  assert.equal(anchor.lastSuccess.getTime(), scope.activated.getTime());
  assert.equal(calls, 0, "La recuperación no elude la pausa compartida ni hace HTTP");
});

test("recuperación SUMAS reanuda lotes de 500 y congela el límite temporal del marcador", async (t) => {
  const scope = recoveryScope(t);
  const rows = Array.from({ length: 501 }, (_, index) => credit(`r-${String(index).padStart(4, "0")}`, {
    financial: "SUMASPAY", localKey: localJob(index, "SUMASPAY").key, effectiveAt: scope.date,
  }));
  const jobs = rows.map((_, index) => localJob(index, "SUMASPAY", {
    state: "ERROR", attempts: 5, nextAttempt: scope.future, updatedAt: scope.old,
  }));
  const db = database({ cierreCredito: rows, venta: rows.map((row) => ({ id: row.ventaId })), cierreSyncTrabajo: [...jobs],
    cierreSyncEstado: [{ key: "LOCAL", initialized: true }, { key: scope.activationKey, initialized: true, updatedAt: scope.activated },
      { key: "PROVIDER_RATE", lockedUntil: scope.future },
      ...jobs.map((job) => ({ key: `RESULT:${job.key}`, lockToken: JSON.stringify({ outcome: "UNSUPPORTED_RESPONSE" }), updatedAt: scope.old }))],
  });
  let result = await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.recoveredSumas, 500);
  const marker = db.tables.cierreSyncEstado.find((row) => row.key === scope.markerKey);
  assert.equal(marker.initialized, false);
  assert.equal(marker.lockToken, rows[499].id);
  db.tables.cierreSyncEstado.find((row) => row.key === scope.activationKey).updatedAt = now;
  result = await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch();
  assert.equal(result.provider.recoveredSumas, 1);
  assert.equal(marker.initialized, true);
  assert.equal(marker.lastSuccess.getTime(), scope.activated.getTime());
  assert.equal(db.tables.cierreSyncEstado.find((row) => row.key === "SUMAS_UNSUPPORTED_V2_SCOPE").lastSuccess.getTime(), scope.activated.getTime());
  assert.ok(jobs.every((job) => job.state === "PENDIENTE" && job.attempts === 5));
  assert.equal((await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch()).provider.recoveredSumas, 0);
});

test("recuperación SUMAS respeta ediciones concurrentes del trabajo y del marcador", async (t) => {
  const scope = recoveryScope(t);
  for (const race of ["job", "marker"]) {
    const job = localJob(race, "SUMASPAY", { state: "ERROR", attempts: 6, nextAttempt: scope.future, updatedAt: scope.old });
    const row = credit(race, { financial: "SUMASPAY", localKey: job.key, effectiveAt: scope.date });
    const db = database({ cierreCredito: [row], venta: [{ id: row.ventaId }], cierreSyncTrabajo: [job],
      cierreSyncEstado: [{ key: "LOCAL", initialized: true }, { key: scope.activationKey, initialized: true, updatedAt: scope.activated },
        { key: "PROVIDER_RATE", lockedUntil: scope.future },
        { key: `RESULT:${job.key}`, lockToken: JSON.stringify({ outcome: "UNSUPPORTED_RESPONSE" }), updatedAt: scope.old }],
    });
    if (race === "job") {
      const update = db.prisma.cierreSyncTrabajo.updateMany;
      db.prisma.cierreSyncTrabajo.updateMany = async (args) => {
        if (args.where.key === job.key && args.data.state === "PENDIENTE") {
          job.updatedAt = new Date(now.getTime() + 1); job.limitation = "Consulta concurrente";
        }
        return update(args);
      };
    } else {
      const update = db.prisma.cierreSyncEstado.updateMany;
      db.prisma.cierreSyncEstado.updateMany = async (args) => {
        if (args.where.key === scope.markerKey) {
          const marker = db.tables.cierreSyncEstado.find((item) => item.key === scope.markerKey);
          marker.updatedAt = new Date(now.getTime() + 1); marker.initialized = true;
        }
        return update(args);
      };
    }
    const result = await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch();
    assert.equal(result.provider.recoveredSumas, 0, race);
    assert.equal(job.state, "ERROR", race);
    assert.equal(job.nextAttempt, scope.future, race);
    assert.equal(job.attempts, 6, race);
  }
});

test("recuperación SUMAS espera el marcador de activación completo", async (t) => {
  const scope = recoveryScope(t);
  for (const initialized of [undefined, false]) {
    const db = database({ cierreSyncEstado: [{ key: "LOCAL", initialized: true }, ...(initialized === undefined ? [] : [{
      key: scope.activationKey, initialized, updatedAt: scope.activated,
    }])] });
    const result = await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch();
    assert.equal(result.provider.recoveredSumas, 0);
    assert.equal(db.tables.cierreSyncEstado.some((row) => row.key === scope.markerKey), false);
    assert.equal(db.tables.cierreSyncEstado.some((row) => row.key === "SUMAS_UNSUPPORTED_V2_SCOPE"), false);
  }
});
