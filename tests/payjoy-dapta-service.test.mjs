import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const admin = { id: 1, perfilId: 12, perfilTipo: "ADMINISTRADOR", rolNombre: "ADMIN", sedeId: 1, activo: true, nombre: "QA Admin", perfilNombre: "QA Admin" };
const auditor = { ...admin, id: 2, perfilId: 22, perfilTipo: "AUDITOR", rolNombre: "AUDITOR", sedeId: 2, perfilNombre: "QA Auditor" };
const copy = value => structuredClone(value);
const uniqueError = () => Object.assign(new Error("Unique constraint"), { code: "P2002" });

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return expected.some(part => matches(row, part));
    if (key === "AND") return expected.every(part => matches(row, part));
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, value]) => {
        if (op === "gt") return row[key] != null && row[key] > value;
        if (op === "lte") return row[key] != null && row[key] <= value;
        throw new Error(`Unexpected mock operator ${op}`);
      });
    }
    return (row[key] ?? null) === expected;
  });
}

function setup(options = {}) {
  const batches = [], items = [], providerCalls = [], dbCalls = [];
  const db = {};
  for (const [name, data] of [["payJoyDaptaBatch", batches], ["payJoyDaptaItem", items]]) {
    const selected = (args = {}) => {
      let rows = data.filter(row => matches(row, args.where));
      const orders = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
      rows = [...rows].sort((a, b) => {
        for (const order of orders) for (const [field, direction] of Object.entries(order)) {
          const difference = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          if (difference) return difference * (direction === "asc" ? 1 : -1);
        }
        return 0;
      });
      return args.take ? rows.slice(0, args.take) : rows;
    };
    const result = (row, args = {}) => row && args.include?.items
      ? { ...copy(row), items: copy(items.filter(item => item.batchId === row.id).sort((a, b) => a.deviceTag.localeCompare(b.deviceTag))) }
      : copy(row ?? null);
    const change = (row, values) => {
      if (!row) throw new Error("Missing mock row");
      for (const [key, value] of Object.entries(values)) {
        row[key] = value && typeof value === "object" && !(value instanceof Date) && "increment" in value
          ? row[key] + value.increment : value && typeof value === "object" && "push" in value
            ? [...row[key], value.push] : copy(value);
      }
      row.updatedAt = new Date();
      return row;
    };
    const methods = {
      findUnique: args => result(selected(args)[0], args),
      findUniqueOrThrow: args => { const row = selected(args)[0]; if (!row) throw new Error("Missing mock row"); return result(row, args); },
      findMany: args => selected(args).map(row => result(row, args)),
      count: args => selected(args).length,
      update: args => result(change(selected(args)[0], args.data)),
      updateMany: args => { const rows = selected(args); rows.forEach(row => change(row, args.data)); return { count: rows.length }; },
      create: ({ data: values }) => {
        if (name !== "payJoyDaptaBatch") throw new Error("Unexpected create");
        if (batches.some(row => row.requestId === values.requestId)) throw uniqueError();
        const { items: nested, ...fields } = values;
        const row = { createdAt: new Date(), updatedAt: new Date(), retryRequestIds: [], ...copy(fields) };
        batches.push(row);
        for (const value of nested.create) items.push({
          batchId: row.id, lookupStatus: "PENDING", phone: null, phoneSource: null,
          ownershipStatus: "PENDING_REVIEW", consentStatus: "PENDING_REVIEW", reviewStatus: "PENDING_REVIEW",
          duplicateOfId: null, claimToken: null, claimExpiresAt: null, attempts: 0, errorCode: null,
          checkedAt: null, createdAt: new Date(), updatedAt: new Date(), ...copy(value),
        });
        return result(row);
      },
    };
    db[name] = Object.fromEntries(Object.entries(methods).map(([method, run]) => [method, async args => {
      dbCalls.push({ name, method, args: copy(args) });
      return run(args);
    }]));
  }
  db.$queryRaw = async () => [];
  let transaction = Promise.resolve();
  db.$transaction = callback => {
    const execution = transaction.then(() => callback(db));
    transaction = execution.catch(() => {});
    return execution;
  };
  const mocks = {
    "server-only": {},
    "@/lib/prisma": db,
    "@/lib/auth": { getSessionUser: async () => options.session === undefined ? admin : options.session },
    "@/lib/payjoy-extensions-origin": { payJoyExtensionRequestHasTrustedOrigin: request => request.headers.get("origin") === "http://localhost:3000" },
    "@/lib/payjoy-dapta-phone-provider": { readPayJoyDaptaPhone: async tag => {
      providerCalls.push(tag);
      return options.lookup ? options.lookup(tag, providerCalls.length) : { phone: `+57300000000${tag.slice(-1)}`, source: "PAYJOY_NEQUI_PREFILL" };
    } },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "exports", code)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(id.slice(2) + ".ts");
      return nativeRequire(id);
    }, exports);
    return exports;
  }
  return { service: load("lib/payjoy-dapta-service.ts"), route: load("app/api/payjoy/dapta/route.ts"),
    access: load("lib/payjoy-dapta-access.ts"), batches, items, providerCalls, dbCalls,
    create: (devices = ["DQA0001"], requestId = randomUUID(), session = admin) => load("lib/payjoy-dapta-service.ts").createPayJoyDaptaBatch(session, { requestId, devices }) };
}
const post = body => new Request("http://localhost:3000/api/payjoy/dapta", {
  method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body),
});

test("effective administrative profiles only; API never inherits a base administrator role", async () => {
  const q = setup();
  for (const perfilTipo of ["VENDEDOR", "SUPERVISOR_TIENDA", "FACTURADOR", "BODEGA", "APOYO_OPERATIVO", "UNKNOWN"]) {
    const session = { ...admin, perfilTipo };
    assert.equal(q.access.puedePrepararBorradoresPayJoyDapta(session), false);
    await assert.rejects(q.create(undefined, undefined, session), error => error.code === "FORBIDDEN");
  }
  assert.equal(q.access.puedePrepararBorradoresPayJoyDapta({ ...admin, perfilId: null }), false);
  assert.equal(q.access.puedePrepararBorradoresPayJoyDapta({ rolNombre: "AUDITOR", perfilId: 9 }), false);
  assert.equal(q.access.puedePrepararBorradoresPayJoyDapta({ rolNombre: "ADMIN", perfilId: null }), true);
  assert.equal(q.access.puedePrepararBorradoresPayJoyDapta(auditor), true);
  await assert.rejects(q.create(undefined, undefined, { ...admin, activo: false }), error => error.code === "FORBIDDEN");
  assert.equal((await setup({ session: null }).route.GET(new Request("http://localhost:3000/api/payjoy/dapta"))).status, 401);
  assert.equal((await setup({ session: { ...admin, perfilTipo: "VENDEDOR" } }).route.POST(post({ action: "create", requestId: randomUUID(), devices: ["DQA0001"] }))).status, 403);
  assert.equal(q.batches.length, 0);
});

test("creation/replays are durable, device-deduplicated and never query a provider", async () => {
  const q = setup(), key = randomUUID();
  const first = await q.create([" dqa0002 ", "DQA0001", "DQA0002"], key);
  const second = await q.create(["DQA0001", "DQA0002"], key.toUpperCase());
  assert.equal(first.batch.id, second.batch.id);
  assert.equal(q.batches.length, 1);
  assert.equal(q.items.length, 2);
  assert.equal(first.batch.status, "DRAFT_ONLY");
  assert.equal(first.batch.agreement, "112090");
  assert.equal(first.sendingEnabled, false);
  await assert.rejects(q.create(["DQA0003"], key), error => error.code === "IDEMPOTENCY_CONFLICT");
  await assert.rejects(q.create(["DQA0001", "DQA0002"], key, auditor), error => error.code === "IDEMPOTENCY_CONFLICT");
  await q.service.getPayJoyDaptaBatch(auditor, first.batch.id); // Deliberately shared administrative history.
  const history = await q.service.listPayJoyDaptaBatches(auditor);
  assert.equal(history.batches.length, 1);
  assert.equal("items" in history.batches[0], false);
  assert.deepEqual(q.providerCalls, []);
});

test("concurrent creation with the same key commits one batch and the same item set", async () => {
  const q = setup(), key = randomUUID();
  const results = await Promise.all([q.create(["DQA0001", "DQA0002"], key), q.create(["DQA0002", "DQA0001"], key)]);
  assert.equal(results[0].batch.id, results[1].batch.id);
  assert.equal(q.batches.length, 1);
  assert.equal(q.items.length, 2);
  assert.equal(q.providerCalls.length, 0);
});

test("invalid device lists cannot reach persistence or lookup", async () => {
  const q = setup();
  for (const input of [[], ["123456789"], ["https://example.com"], [null], Array.from({ length: 26 }, (_, i) => `DQA${String(i).padStart(4, "0")}`)]) {
    await assert.rejects(q.create(input), error => error.code === "INVALID_INPUT");
  }
  assert.equal(q.batches.length, 0);
  assert.equal(q.providerCalls.length, 0);
});

test("explicit validation reads at most three; concurrent validators cannot repeat claims", async () => {
  const q = setup();
  const { batch } = await q.create(["DQA0001", "DQA0002", "DQA0003", "DQA0004"]);
  await Promise.all([q.service.validatePayJoyDaptaBatch(admin, batch.id), q.service.validatePayJoyDaptaBatch(auditor, batch.id)]);
  assert.equal(q.providerCalls.length, 3);
  assert.equal(new Set(q.providerCalls).size, 3);
  let current = await q.service.getPayJoyDaptaBatch(admin, batch.id);
  assert.equal(current.hasMore, true);
  assert.equal(current.batch.counts.pending, 1);
  current = await q.service.validatePayJoyDaptaBatch(admin, batch.id);
  assert.equal(current.batch.counts.found, 4);
  assert.equal(current.hasMore, false);
  assert.equal(current.sendingEnabled, false);
  for (const item of current.batch.items) {
    assert.match(item.phone, /^\+573\d{9}$/);
    assert.equal(item.ownershipStatus, "PENDING_REVIEW");
    assert.equal(item.consentStatus, "PENDING_REVIEW");
    assert.match(item.messagePreview, /CONECTAMOS.*PayJoy.*112090 — Adelantos Colombia.*cédula del titular/);
    assert.doesNotMatch(item.messagePreview, /113950/);
  }
  await q.service.validatePayJoyDaptaBatch(admin, batch.id);
  assert.equal(q.providerCalls.length, 4);
});

test("same phone across devices remains explicit duplicate review with no duplicate messages", async () => {
  const q = setup({ lookup: async () => ({ phone: "+573000000001", source: "PAYJOY_NEQUI_PREFILL" }) });
  const { batch } = await q.create(["DQA0001", "DQA0002"]);
  const result = await q.service.validatePayJoyDaptaBatch(admin, batch.id);
  assert.equal(result.batch.counts.duplicatePhones, 2);
  assert.ok(result.batch.items.every(item => item.reviewStatus === "DUPLICATE_PHONE" && item.messagePreview === null));
  assert.equal(result.batch.items[1].duplicateOfId, result.batch.items[0].id);
  assert.equal(result.batch.items[0].duplicateOfId, null);
});

test("missing and malformed contacts are retained; safe errors never persist payloads", async () => {
  const q = setup({ lookup: async tag => {
    if (tag === "DQA0001") return { phone: null, source: null };
    if (tag === "DQA0002") return { phone: "+573000000001", source: "UNVERIFIED_INPUT" };
    throw Object.assign(new Error("SECRET_PRIVATE_RESPONSE"), { code: "PHONE_CONFLICT", token: "SECRET_PRIVATE_TOKEN" });
  } });
  const { batch } = await q.create(["DQA0001", "DQA0002", "DQA0003"]);
  const result = await q.service.validatePayJoyDaptaBatch(admin, batch.id);
  assert.equal(result.batch.items[0].lookupStatus, "MISSING");
  assert.equal(result.batch.items[1].errorCode, "INVALID_RESPONSE");
  assert.equal(result.batch.items[2].errorCode, "PHONE_CONFLICT");
  assert.ok(result.batch.items.every(item => item.phone === null && item.messagePreview === null));
  assert.doesNotMatch(JSON.stringify([result, q.batches, q.items]), /SECRET_PRIVATE/);
  await q.service.validatePayJoyDaptaBatch(admin, batch.id);
  assert.equal(q.providerCalls.length, 3); // ERROR and MISSING are not retried by validation.
});

test("explicit retries are idempotent even if the repeated lookup fails again", async () => {
  const q = setup({ lookup: async () => { throw Object.assign(new Error("Private upstream detail"), { code: "TIMEOUT" }); } });
  const { batch } = await q.create();
  await q.service.validatePayJoyDaptaBatch(admin, batch.id);
  const input = { batchId: batch.id, requestId: randomUUID() };
  await q.service.retryPayJoyDaptaBatch(admin, input);
  await q.service.retryPayJoyDaptaBatch(admin, input);
  assert.equal(q.providerCalls.length, 2);
  assert.equal(q.items[0].lookupStatus, "ERROR");
  assert.equal(q.items[0].attempts, 2);
  assert.equal(q.batches[0].retryRequestIds.length, 1);
});

test("GET exposes an expired lease without writes; explicit retry fences a late response", async () => {
  let resolveFirst;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const q = setup({ lookup: async (_tag, n) => n === 1 ? first : { phone: "+573000000002", source: "PAYJOY_NEQUI_PREFILL" } });
  const { batch } = await q.create();
  const running = q.service.validatePayJoyDaptaBatch(admin, batch.id);
  while (!q.providerCalls.length) await new Promise(resolve => setImmediate(resolve));
  q.items[0].claimExpiresAt = new Date(Date.now() - 1);
  const before = q.dbCalls.length;
  const interrupted = await q.service.getPayJoyDaptaBatch(admin, batch.id);
  assert.equal(interrupted.batch.items[0].errorCode, "LOOKUP_INTERRUPTED");
  assert.ok(q.dbCalls.slice(before).every(call => call.method === "findUnique"));
  await q.service.retryPayJoyDaptaBatch(admin, { batchId: batch.id, requestId: randomUUID() });
  resolveFirst({ phone: "+573000000001", source: "PAYJOY_NEQUI_PREFILL" });
  await running;
  const final = await q.service.getPayJoyDaptaBatch(admin, batch.id);
  assert.equal(final.batch.items[0].phone, "+573000000002");
  assert.equal(q.providerCalls.length, 2);
});

test("API rejects injected contacts, delivery actions, foreign origins and oversized requests", async () => {
  const q = setup();
  for (const body of [
    { action: "send", batchId: randomUUID() },
    { action: "create", requestId: randomUUID(), devices: ["DQA0001"], phone: "+573000000001" },
    { action: "create", requestId: randomUUID(), devices: ["DQA0001"], agreement: "113950" },
    { action: "validate", batchId: randomUUID(), message: "Override" },
  ]) assert.equal((await q.route.POST(post(body))).status, 400);
  const cross = new Request("http://localhost:3000/api/payjoy/dapta", { method: "POST", headers: { origin: "https://foreign.example", "content-type": "application/json" }, body: "{}" });
  assert.equal((await q.route.POST(cross)).status, 403);
  assert.equal((await q.route.POST(post({ action: "create", value: "x".repeat(9000) }))).status, 413);
  const valid = await q.route.POST(post({ action: "create", requestId: randomUUID(), devices: ["DQA0001"] }));
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "private, no-store");
  assert.equal((await valid.json()).sendingEnabled, false);
  assert.equal(q.providerCalls.length, 0);
});
