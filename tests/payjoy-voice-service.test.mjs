import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const requireNative = createRequire(import.meta.url);
const copy = value => structuredClone(value);
const admin = { id: 1, perfilId: 12, perfilTipo: "ADMINISTRADOR", rolNombre: "ADMIN", sedeId: 1, activo: true, nombre: "QA", perfilNombre: "QA" };
const auditor = { ...admin, id: 2, perfilId: 22, perfilTipo: "AUDITOR", rolNombre: "AUDITOR" };
const failUnique = () => { throw Object.assign(new Error("Unique"), { code: "P2002" }); };
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([operator, operand]) => {
      if (operator === "in") return operand.includes(row[key]);
      if (operator === "lte") return row[key] != null && row[key] <= operand;
      if (operator === "gte") return row[key] != null && row[key] >= operand;
      throw new Error(`Unsupported operator ${operator}`);
    });
    return (row[key] ?? null) === value;
  });
}
function setup(options = {}) {
  let current = new Date("2026-11-09T16:00:00Z");
  const allowedDevices = Array.from({ length: 7 }, (_, i) => `DQA000${i + 1}`);
  const settings = { agentId: randomUUID(), fromNumber: "+573124085562", jobSecret: "qa-job-secret-".repeat(4), eventSecret: "qa-event-secret-".repeat(4), schedulerEnabled: true, allowedDevices };
  const source = { id: randomUUID(), items: allowedDevices.slice(0, options.count ?? 2).map((deviceTag, index) => ({ id: randomUUID(), deviceTag, phone: `57300000000${index + 1}`, phoneSource: "PAYJOY_NEQUI_PREFILL", lookupStatus: "FOUND", reviewStatus: "PENDING_REVIEW" })) };
  const tables = { payJoyDaptaBatch: [source], payJoyVoiceBatch: [], payJoyVoiceCall: [], payJoyVoiceEvent: [], payJoyContactSuppression: [] };
  const db = {}, dbCalls = [], providerCalls = [];
  for (const name of Object.keys(tables)) {
    const selected = (args = {}) => {
      const values = tables[name].filter(row => matches(row, args.where));
      if (args.orderBy) {
        const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        values.sort((left, right) => {
          for (const clause of order) for (const [key, direction] of Object.entries(clause)) {
            const delta = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
            if (delta) return delta * (direction === "asc" ? 1 : -1);
          }
          return 0;
        });
      }
      return args.take ? values.slice(0, args.take) : values;
    };
    const value = (row, args = {}) => !row ? null : copy(args.include?.calls ? { ...row, calls: tables.payJoyVoiceCall.filter(call => call.batchId === row.id) } : row);
    const change = (row, data) => { if (!row) throw new Error("Not found"); Object.assign(row, copy(data), { updatedAt: new Date(current) }); return row; };
    const create = data => {
      if (name === "payJoyVoiceBatch" && tables[name].some(row => row.scopeKey === data.scopeKey || row.requestId === data.requestId)) failUnique();
      if (name === "payJoyVoiceEvent" && tables[name].some(row => row.eventKey === data.eventKey)) failUnique();
      const { calls, ...fields } = copy(data);
      const row = { createdAt: new Date(current), updatedAt: new Date(current), ...fields };
      tables[name].push(row);
      if (calls) for (const call of calls.create) {
        if (tables.payJoyVoiceCall.some(row => row.dayKey === call.dayKey && row.phone === call.phone)) failUnique();
        tables.payJoyVoiceCall.push({ batchId: row.id, status: "PENDING", claimToken: null, claimExpiresAt: null,
          preflightAt: null, identityConfirmedAt: null, providerCallId: null, reasonCode: null, dispatchedAt: null,
          dispatchAuthorizedAt: null, acceptedAt: null, completedAt: null, latestOutcome: null, createdAt: new Date(current), updatedAt: new Date(current), ...call });
      }
      return value(row);
    };
    const functions = {
      findUnique: args => value(selected(args)[0], args),
      findUniqueOrThrow: args => { const row = selected(args)[0]; if (!row) throw new Error("Not found"); return value(row, args); },
      findMany: args => selected(args).map(row => value(row, args)),
      count: args => selected(args).length,
      create: args => create(args.data),
      update: args => value(change(selected(args)[0], args.data)),
      updateMany: args => { const rows = selected(args); rows.forEach(row => change(row, args.data)); return { count: rows.length }; },
      upsert: args => { const row = selected(args)[0]; return row ? value(Object.keys(args.update).length ? change(row, args.update) : row) : create(args.create); },
    };
    db[name] = Object.fromEntries(Object.entries(functions).map(([method, fn]) => [method, async args => { dbCalls.push({ name, method }); return fn(args); }]));
  }
  db.$queryRaw = async () => [];
  let queue = Promise.resolve();
  db.$transaction = callback => {
    const execution = queue.then(async () => {
      const snapshot = copy(tables);
      try { return await callback(db); }
      catch (error) { for (const name of Object.keys(tables)) tables[name] = snapshot[name]; throw error; }
    });
    queue = execution.catch(() => {});
    return execution;
  };
  const cache = new Map();
  const mocks = {
    "server-only": {}, "@/lib/prisma": db,
    "@/lib/auth": { getSessionUser: async () => options.session === undefined ? admin : options.session },
    "@/lib/payjoy": { readPayJoyCreditPaymentPayload: async () => { throw new Error("Default network forbidden"); } },
    "@/lib/payjoy-extensions-origin": { payJoyExtensionRequestHasTrustedOrigin: request => request.headers.get("origin") === "http://localhost:3000" },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function("require", "exports", code)(id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith("@/") ? load(id.slice(2) + ".ts") : requireNative(id), exports);
    return exports;
  }
  const voiceModule = load("lib/payjoy-voice-service.ts");
  const service = voiceModule.createPayJoyVoiceService({ db, now: () => new Date(current), config: () => settings, readPayload: async tag => {
    providerCalls.push(tag);
    const payload = { valid: true, remainingBalance: 200000, currency: "COP", deviceDetails: { deviceTag: tag, country: "CO", phoneNumber: source.items.find(row => row.deviceTag === tag)?.phone, validThrough: Math.floor(current.getTime() / 1000) - 3600 } };
    return options.lookup ? options.lookup(tag, payload) : payload;
  } });
  mocks["@/lib/payjoy-voice-service"] = { ...voiceModule, payJoyVoiceService: service };
  return { service, settings, get source() { return tables.payJoyDaptaBatch[0]; }, tables, dbCalls, providerCalls, load,
    at: date => { current = new Date(date); },
    schedule: (input = {}, session = admin) => service.schedule(session, { sourceBatchId: source.id, requestId: randomUUID(), confirmed: true, ...input }),
  };
}
const post = (body, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/payjoy/voz", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

test("one campaign persists attestation and immutable scope; concurrent replay cannot create another", async () => {
  const q = setup({ count: 7 }), key = randomUUID();
  const results = await Promise.all([q.schedule({ requestId: key }), q.schedule({ requestId: key })]);
  assert.equal(results[0].batch.id, results[1].batch.id);
  assert.equal(q.tables.payJoyVoiceBatch.length, 1);
  assert.equal(q.tables.payJoyVoiceCall.length, 7);
  assert.deepEqual(q.providerCalls, []);
  const authorized = q.tables.payJoyVoiceEvent.find(row => row.type === "AUTHORIZED");
  assert.equal(authorized.detail.ownershipAttested, true);
  assert.equal(authorized.detail.voiceConsentAttested, true);
  assert.equal(authorized.actorId, "1:12");
  q.source.items[0].phone = "573000000099";
  await assert.rejects(q.schedule(), error => error.code === "CAMPAIGN_ALREADY_EXISTS");
});

test("schedule requires effective role, explicit confirmation, deployment configuration and verified source", async () => {
  for (const profile of ["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR", "BODEGA"]) {
    const q = setup();
    await assert.rejects(q.schedule({}, { ...admin, perfilTipo: profile }), error => error.code === "FORBIDDEN");
  }
  for (const change of [q => q.settings.schedulerEnabled = false, q => q.settings.agentId = "", q => q.settings.allowedDevices = [], q => q.settings.eventSecret = "short"]) {
    const q = setup(); change(q);
    await assert.rejects(q.schedule(), error => error.code === "CONFIGURATION_PENDING");
  }
  for (const change of [q => q.source.items[0].lookupStatus = "PENDING", q => q.source.items[0].phoneSource = null,
    q => q.source.items[1].phone = q.source.items[0].phone, q => q.source.items[0].deviceTag = "DFOREIGN", q => q.source.items[0].phone = "573000000001#bad"]) {
    const q = setup(); change(q);
    await assert.rejects(q.schedule(), error => error.code === "SOURCE_NOT_READY");
    assert.equal(q.tables.payJoyVoiceBatch.length, 0);
  }
  await assert.rejects(setup().schedule({ confirmed: "true" }), error => error.code === "INVALID_INPUT");
  assert.equal((await setup().schedule({}, auditor)).batch.status, "SCHEDULED");
});

test("claim observes the fixed Bogota window and concurrent workers dispatch each contact at most once", async () => {
  const q = setup({ count: 7 });
  await q.schedule();
  q.at("2026-11-10T14:59:59Z");
  assert.equal((await q.service.claim()).calls.length, 0);
  assert.equal(q.providerCalls.length, 0);
  q.at("2026-11-10T15:00:00Z");
  const responses = await Promise.all([q.service.claim(), q.service.claim()]);
  const calls = responses.flatMap(response => response.calls);
  assert.equal(calls.length, 7);
  assert.equal(new Set(calls.map(call => call.event_id)).size, 7);
  assert.equal(q.providerCalls.length, 7);
  assert.ok(q.tables.payJoyVoiceCall.every(call => call.status === "DISPATCHING" && call.dispatchedAt));
  assert.equal((await q.service.claim()).calls.length, 0);
  q.at("2026-11-10T15:06:00Z");
  assert.equal((await q.service.claim()).calls.length, 0);
  assert.ok(q.tables.payJoyVoiceCall.every(call => call.status === "UNKNOWN"));
  assert.equal(q.providerCalls.length, 7);
});

test("preflight holds changed contacts and foreign/mismatched identities; paid or current credit is skipped", async () => {
  const q = setup({ count: 7, lookup: async (tag, payload) => {
    if (tag === "DQA0001") payload.deviceDetails.phoneNumber = "573000000099";
    if (tag === "DQA0002") payload.deviceDetails.country = "MX";
    if (tag === "DQA0003") payload.deviceDetails.deviceTag = "DWRONG1";
    if (tag === "DQA0004") payload.remainingBalance = 0;
    if (tag === "DQA0005") payload.paidInFull = true;
    if (tag === "DQA0006") payload.deviceDetails.validThrough = Date.parse("2026-11-10T15:00:00Z") / 1000;
    if (tag === "DQA0007") throw Object.assign(new Error("SECRET_UPSTREAM"), { code: "TIMEOUT" });
    return payload;
  } });
  await q.schedule(); q.at("2026-11-10T15:00:00Z");
  assert.deepEqual((await q.service.claim()).calls, []);
  assert.deepEqual(q.tables.payJoyVoiceCall.map(call => call.status), ["HELD", "HELD", "HELD", "SKIPPED", "SKIPPED", "SKIPPED", "HELD"]);
  assert.doesNotMatch(JSON.stringify(q.tables), /SECRET_UPSTREAM/);
});

test("expired and cancelled campaigns never query PayJoy or become future scheduled calls", async () => {
  const q = setup();
  const scheduled = await q.schedule();
  await q.service.cancel(admin, scheduled.batch.id);
  q.at("2026-11-10T15:00:00Z");
  assert.deepEqual((await q.service.claim()).calls, []);
  assert.deepEqual(q.providerCalls, []);
  const late = setup(); await late.schedule(); late.at("2026-11-10T15:30:00Z");
  assert.deepEqual((await late.service.claim()).calls, []);
  assert.equal(late.tables.payJoyVoiceBatch[0].status, "EXPIRED");
  assert.ok(late.tables.payJoyVoiceCall.every(call => call.status === "SKIPPED"));
});

test("identity gating exposes only a conditional reminder; reporting payment does not confirm or collect it", async () => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await q.service.authorizeDispatch({ event_token: call.event_token });
  const refused = await q.service.operation({ event_token: call.event_token, action: "verify_identity", confirmed: false });
  assert.deepEqual(refused, { allowed: false, end_call: true });
  await assert.rejects(q.service.operation({ event_token: call.event_token, action: "outcome", outcome: "PAID_REPORTED" }), error => error.code === "INVALID_STATE");
  const verified = await q.service.operation({ event_token: call.event_token, action: "verify_identity", confirmed: "true" });
  assert.equal(verified.allowed, true);
  assert.equal(verified.agreement, "112090");
  assert.equal(verified.payment_link, "https://pay.payjoy.com/p/device/DQA0001");
  assert.match(verified.reminder, /Si tiene un pago pendiente/);
  assert.doesNotMatch(verified.reminder, /200000|vencid|mora/i);
  const reported = await q.service.operation({ event_token: call.event_token, action: "outcome", outcome: "PAID_REPORTED", note: "Private spoken note" });
  assert.equal(reported.payment_confirmed, false);
  assert.equal(reported.agreement_approved, false);
  assert.doesNotMatch(JSON.stringify(q.tables), /Private spoken note/);
});

test("optout is durable, blocks disclosure, and a suppression inserted during preflight prevents dispatch", async () => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await q.service.authorizeDispatch({ event_token: call.event_token });
  assert.equal((await q.service.operation({ event_token: call.event_token, action: "optout" })).do_not_contact, true);
  await q.service.operation({ event_token: call.event_token, action: "optout" });
  assert.equal(q.tables.payJoyContactSuppression.length, 1);
  assert.equal((await q.service.operation({ event_token: call.event_token, action: "verify_identity", confirmed: true })).allowed, false);
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const racing = setup({ count: 1, lookup: async (_tag, payload) => { started(); await blocked; return payload; } });
  await racing.schedule(); racing.at("2026-11-10T15:00:00Z");
  const running = racing.service.claim(); await entered;
  racing.tables.payJoyContactSuppression.push({ phone: "+573000000001", reason: "NO_CONTACT" });
  release(); assert.equal((await running).calls.length, 0);
  assert.equal(racing.tables.payJoyVoiceCall[0].reasonCode, "OPT_OUT");
});

test("receipt needs a real call id; ambiguous receipts never enable a retry", async () => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await q.service.authorizeDispatch({ event_token: call.event_token });
  await assert.rejects(q.service.receipt({ event_token: call.event_token, accepted: true }), error => error.code === "INVALID_INPUT");
  await q.service.receipt({ event_token: call.event_token, accepted: false, error_code: "NATIVE_CALL_UNKNOWN" });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "UNKNOWN");
  assert.equal((await q.service.claim()).calls.length, 0);
  await q.service.receipt({ event_token: call.event_token, accepted: true, call_id: "call_qa_12345" });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "ACCEPTED");
  await q.service.receipt({ event_token: call.event_token, accepted: false });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "ACCEPTED");
  await assert.rejects(q.service.receipt({ event_token: call.event_token, accepted: true, call_id: "call_other_12345" }), error => error.code === "CALL_MISMATCH");
});

test("callback before receipt survives reordering and replay without enabling disclosure or another call", async () => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await q.service.authorizeDispatch({ event_token: call.event_token });
  const body = { call: { call_id: "call_qa_12345", dynamic_variables: { event_token: call.event_token },
    call_analysis: { custom_analysis_data: { outcome: "PAID_REPORTED", identity_confirmed: "true", optout_requested: "true", note: "SECRET_TRANSCRIPT" } }, disconnection_reason: "user_hangup", transcript: "SECRET_TRANSCRIPT" } };
  await q.service.callback(body); await q.service.callback(body);
  assert.equal(q.tables.payJoyVoiceCall[0].status, "COMPLETED");
  assert.equal(q.tables.payJoyVoiceCall[0].identityConfirmedAt, null);
  assert.equal(q.tables.payJoyVoiceCall[0].latestOutcome, "OPT_OUT");
  assert.equal(q.tables.payJoyContactSuppression.length, 1);
  await q.service.receipt({ event_token: call.event_token, accepted: true, call_id: "call_qa_12345" });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "COMPLETED");
  assert.equal(q.tables.payJoyVoiceEvent.filter(row => row.type === "CALL_COMPLETED").length, 1);
  assert.doesNotMatch(JSON.stringify(q.tables), /SECRET_TRANSCRIPT/);
  assert.equal((await q.service.claim()).calls.length, 0);
  await assert.rejects(q.service.callback({ call: { ...body.call, call_id: "call_wrong_12345" } }), error => error.code === "CALL_MISMATCH");
});

test("dispatch authorization is single-use and rechecks cancellation, suppression, time and configuration", async () => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await assert.rejects(q.service.operation({ event_token: call.event_token, action: "verify_identity", confirmed: true }), error => error.code === "INVALID_STATE");
  const grants = await Promise.all([q.service.authorizeDispatch({ event_token: call.event_token }), q.service.authorizeDispatch({ event_token: call.event_token })]);
  assert.equal(grants.filter(result => result.allowed).length, 1);
  assert.ok(q.tables.payJoyVoiceCall[0].dispatchAuthorizedAt);
  q.at("2026-11-10T15:06:00Z");
  assert.equal((await q.service.claim()).calls.length, 0);
  assert.equal(q.tables.payJoyVoiceCall[0].status, "UNKNOWN");
  assert.equal((await q.service.authorizeDispatch({ event_token: call.event_token })).allowed, false);
  for (const change of [
    async r => r.service.cancel(admin, r.tables.payJoyVoiceBatch[0].id),
    async r => r.tables.payJoyContactSuppression.push({ phone: "+573000000001", reason: "OPT_OUT" }),
    async r => r.at("2026-11-10T15:06:00Z"),
    async r => r.at("2026-11-10T15:30:00Z"),
    async r => { r.settings.agentId = randomUUID(); },
  ]) {
    const r = setup({ count: 1 }); await r.schedule(); r.at("2026-11-10T15:00:00Z");
    const { calls: [pending] } = await r.service.claim();
    await change(r);
    assert.equal((await r.service.authorizeDispatch({ event_token: pending.event_token })).allowed, false);
    assert.equal(r.tables.payJoyVoiceCall[0].dispatchAuthorizedAt, null);
    await assert.rejects(r.service.receipt({ event_token: pending.event_token, accepted: true, call_id: "call_never_12345" }), error => error.code === "INVALID_STATE");
  }
});

test("started callbacks are not completed; no answer is not optout and unverified payment claims are ignored", async () => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await q.service.authorizeDispatch({ event_token: call.event_token });
  const base = { call_id: "call_qa_started", dynamic_variables: { event_token: call.event_token } };
  await q.service.callback({ call: { ...base, call_status: "ongoing", call_analysis: { outcome: "PAID_REPORTED" } } });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "ACCEPTED");
  assert.equal(q.tables.payJoyVoiceCall[0].completedAt, null);
  assert.equal(q.tables.payJoyVoiceCall[0].identityConfirmedAt, null);
  assert.equal(q.tables.payJoyVoiceCall[0].latestOutcome, null);
  await q.service.callback({ call: { ...base, call_status: "ended", call_analysis: { outcome: "NO_CONTACT" } } });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "COMPLETED");
  assert.equal(q.tables.payJoyVoiceCall[0].latestOutcome, "NO_CONTACT");
  assert.equal(q.tables.payJoyContactSuppression.length, 0);
  await q.service.callback({ call: { ...base, call_status: "ongoing" } });
  assert.equal(q.tables.payJoyVoiceCall[0].status, "COMPLETED");
});

test("signed scoped tokens reject forgery and expiry; GET only reads DB without provider or network", async t => {
  const q = setup({ count: 1 }); await q.schedule(); q.at("2026-11-10T15:00:00Z");
  const { calls: [call] } = await q.service.claim();
  await assert.rejects(q.service.operation({ event_token: call.event_token + "x", action: "optout" }), error => error.code === "INVALID_TOKEN");
  q.at("2026-11-10T18:00:00Z");
  await assert.rejects(q.service.operation({ event_token: call.event_token, action: "optout" }), error => error.code === "INVALID_TOKEN");
  const before = copy(q.tables), mark = q.dbCalls.length, calls = q.providerCalls.length;
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network"); });
  const response = await q.load("app/api/payjoy/voz/route.ts").GET(new Request(`http://localhost:3000/api/payjoy/voz?sourceBatchId=${q.source.id}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const view = await response.json();
  assert.equal(view.batch.calls[0].phoneMasked, "+57 *** *** 0001");
  assert.equal(view.batch.calls[0].status, "UNKNOWN");
  assert.doesNotMatch(JSON.stringify(view), /qa-event-secret|event_token|to_number|573000000001/);
  assert.deepEqual(q.tables, before);
  assert.ok(q.dbCalls.slice(mark).every(row => row.method.startsWith("find")));
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(q.providerCalls.length, calls);
});

test("browser API rejects foreign origins, injected destinations and oversized requests", async () => {
  const q = setup(), route = q.load("app/api/payjoy/voz/route.ts");
  const body = { action: "schedule", sourceBatchId: q.source.id, requestId: randomUUID(), confirmed: true };
  assert.equal((await route.POST(post(body, "https://foreign.example"))).status, 403);
  assert.equal((await route.POST(post({ ...body, phone: "+573000000001" }))).status, 400);
  assert.equal((await route.POST(post({ ...body, note: "x".repeat(9000) }))).status, 413);
  assert.equal((await route.POST(post(body))).status, 200);
  assert.equal((await setup({ session: null }).load("app/api/payjoy/voz/route.ts").POST(post(body))).status, 401);
  assert.equal((await setup({ session: { ...admin, perfilTipo: "VENDEDOR" } }).load("app/api/payjoy/voz/route.ts").POST(post(body))).status, 403);
});
