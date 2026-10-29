import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const actor = { id: 1, perfilId: 11, perfilTipo: "VENDEDOR", rolNombre: "SEDE", sedeId: 2, nombre: "Cuenta", perfilNombre: "Asesor" };
const tag = "DTEST123";
const imei = "359999999999991";
const now = Date.now();
const snapshot = {
  deviceTag: tag, imei, model: null, financeOrderId: null, remainingBalance: 50000, currency: "COP",
  validThrough: new Date(now + 86400000).toISOString(), paidInFull: null, financeAmount: null, downPayment: null,
  purchaseAmount: null, months: null, weeklyCost: null, fortnightlyCost: null, monthlyCost: null,
  lastSeen: null, secureStatus: null, payments: [], paymentsAvailability: "NO_DISPONIBLE", source: "PAYMENT", warnings: [],
};
const identity = { usuarioId: actor.id, perfilId: actor.perfilId, sedeId: actor.sedeId, asesorNombre: "Asesor" };
const extension = changes => ({ id: randomUUID(), ...identity, deviceTag: tag, imei, status: "EXITOSA",
  createdAt: new Date(now - 120000), completedAt: new Date(now - 90000),
  selectedOption: { extensionTime: 24 }, response: { success: true, status: "GRANTED", newValidThrough: snapshot.validThrough }, ...changes });
const check = changes => ({ id: randomUUID(), ...identity, idempotencyKey: randomUUID(), inputHash: "hash", identifier: tag,
  deviceTag: tag, imei, status: "LISTA", snapshot: structuredClone(snapshot), errorCode: null, activeLookupKey: null,
  createdAt: new Date(now - 60000), updatedAt: new Date(now - 50000), completedAt: new Date(now - 50000), ...changes });
const input = changes => ({ identifier: tag, idempotencyKey: randomUUID(), ...changes });
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(condition => matches(row, condition));
    if (key === "AND") return value.every(condition => matches(row, condition));
    const actual = row[key] ?? null;
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === "gt") return actual != null && actual > expected;
      if (op === "lt") return actual != null && actual < expected;
      throw new Error(`Unsupported ${op}`);
    });
    return actual === value;
  });
}
function setup(options = {}) {
  const rows = { payJoyCreditCheck: structuredClone(options.checks || []), payJoyExtensionOperation: structuredClone(options.extensions || []) };
  const calls = []; const providerCalls = [];
  const prisma = {};
  for (const [table, data] of Object.entries(rows)) {
    const select = ({ where, orderBy = [], take } = {}) => {
      let result = data.filter(row => matches(row, where));
      const ordering = Array.isArray(orderBy) ? orderBy : [orderBy];
      result.sort((a, b) => {
        for (const order of ordering) for (const [key, direction] of Object.entries(order)) {
          if (a[key] < b[key]) return direction === "asc" ? -1 : 1;
          if (a[key] > b[key]) return direction === "asc" ? 1 : -1;
        }
        return 0;
      });
      return take ? result.slice(0, take) : result;
    };
    const methods = {
      findMany: select, findFirst: args => select(args)[0] || null, findUnique: args => select(args)[0] || null,
      findUniqueOrThrow: args => { const found = select(args)[0]; if (!found) throw new Error("Missing row"); return found; },
      count: args => select(args).length,
      create: ({ data: value }) => {
        for (const key of ["id", "idempotencyKey", "activeLookupKey"]) if (value[key] != null && data.some(row => row[key] === value[key])) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = check({ snapshot: null, completedAt: null, createdAt: new Date(), ...value }); data.push(row); return row;
      },
      updateMany: args => { const selected = select(args); selected.forEach(row => Object.assign(row, structuredClone(args.data))); return { count: selected.length }; },
    };
    prisma[table] = Object.fromEntries(Object.entries(methods).map(([method, run]) => [method, async args => {
      calls.push({ table, method, args: structuredClone(args) });
      if (options.beforeDb) await options.beforeDb(table, method, args);
      return structuredClone(run(args));
    }]));
  }
  const mocks = {
    "server-only": {}, "@/lib/prisma": prisma,
    "@/lib/auth": { getSessionUser: async () => options.session === undefined ? actor : options.session },
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/payjoy-credit-provider": { readPayJoyCreditSnapshot: async identifier => {
      providerCalls.push(identifier);
      if (options.provider) return options.provider(identifier);
      return structuredClone(options.snapshot || snapshot);
    } },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loaded = { exports: {} }; cache.set(file, loaded.exports);
    const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", "process", code)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("node:")) return nativeRequire(id);
      if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`);
      throw new Error(`Unexpected import ${id}`);
    }, loaded, loaded.exports, { env: { NODE_ENV: "production", APP_URL: "https://conectamos.test" } });
    return loaded.exports;
  }
  return { ...load("lib/payjoy-credit-service.ts"), route: load("app/api/payjoy/credito/route.ts"), rows, calls, providerCalls };
}
const post = (body, headers = {}) => new Request("https://conectamos.test/api/payjoy/credito", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://conectamos.test", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

test("ficha guarda identidad de sesión y snapshot, no campos falsificados, antes de consultar", async () => {
  let f;
  f = setup({ provider: async () => { assert.equal(f.rows.payJoyCreditCheck[0].status, "CONSULTANDO"); return snapshot; } });
  const result = await f.consultarFichaPayJoy(actor, input({ identifier: ` ${tag.toLowerCase()} `, usuarioId: 99, perfilId: 99, sedeId: 99, snapshot: { secret: "x" } }));
  assert.equal(result.status, "LISTA"); assert.equal(result.identifier, tag);
  assert.equal(result.snapshot.paidInFull, null);
  assert.deepEqual(f.providerCalls, [tag]);
  const row = f.rows.payJoyCreditCheck[0];
  assert.equal(row.usuarioId, actor.id); assert.equal(row.perfilId, actor.perfilId); assert.equal(row.sedeId, actor.sedeId);
  assert.equal(row.activeLookupKey, null); assert.ok(row.completedAt);
  assert.equal(f.calls.some(call => call.table === "payJoyExtensionOperation"), false);
});

test("reenvíos y consultas concurrentes del mismo identificador hacen una sola lectura", async () => {
  for (const sameKey of [true, false]) {
    const f = setup(); const request = input();
    const results = await Promise.all([f.consultarFichaPayJoy(actor, request), f.consultarFichaPayJoy(actor, sameKey ? request : input())]);
    assert.equal(results[0].id, results[1].id); assert.equal(f.providerCalls.length, 1);
    assert.equal(f.rows.payJoyCreditCheck.length, 1);
    assert.equal((await f.consultarFichaPayJoy(actor, request)).id, results[0].id);
    assert.equal(f.providerCalls.length, 1);
  }
});

test("la misma clave no permite cruzar usuario, perfil, sede ni identificador", async () => {
  const f = setup(); const request = input(); await f.consultarFichaPayJoy(actor, request);
  for (const other of [{ ...actor, id: 2 }, { ...actor, perfilId: 22 }, { ...actor, sedeId: 3 }]) {
    await assert.rejects(f.consultarFichaPayJoy(other, request), { code: "IDEMPOTENCY_CONFLICT" });
    const history = await f.historialFichaPayJoy(other); assert.deepEqual(history.checks, []); assert.deepEqual(history.extensions, []);
  }
  await assert.rejects(f.consultarFichaPayJoy(actor, { ...request, identifier: "DOTHER99" }), { code: "IDEMPOTENCY_CONFLICT" });
  assert.equal(f.providerCalls.length, 1);
});

test("rechaza formato, roles no autorizados y límites antes de consultar PayJoy", async () => {
  const f = setup();
  for (const identifier of ["", "123456789", "https://pay.payjoy.com/device/DTEST123", "DABC", {}, null]) {
    await assert.rejects(f.consultarFichaPayJoy(actor, input({ identifier })), { code: "INVALID_INPUT" });
  }
  for (const perfilTipo of ["FACTURADOR", "BODEGA", "DESCONOCIDO"]) await assert.rejects(f.consultarFichaPayJoy({ ...actor, perfilTipo, rolNombre: "ADMIN" }, input()), { code: "FORBIDDEN" });
  assert.equal(f.providerCalls.length, 0);
  const flooded = setup({ checks: Array.from({ length: 10 }, () => check({ createdAt: new Date() })) });
  await assert.rejects(flooded.consultarFichaPayJoy(actor, input()), { code: "RATE_LIMIT" });
  assert.equal(flooded.providerCalls.length, 0);
});

test("errores seguros e identidades contradictorias quedan auditados sin reintentos", async () => {
  for (const options of [{ provider: async () => { throw Object.assign(new Error("secret-key-url"), { code: "AUTH" }); } },
    { snapshot: { ...snapshot, deviceTag: "DOTHER99" } }]) {
    const f = setup(options); const request = input(); const result = await f.consultarFichaPayJoy(actor, request);
    assert.equal(result.status, "ERROR"); assert.equal(result.snapshot, null);
    assert.doesNotMatch(JSON.stringify(result), /secret-key-url/);
    await f.consultarFichaPayJoy(actor, request); assert.equal(f.providerCalls.length, 1);
    assert.equal(f.rows.payJoyCreditCheck[0].activeLookupKey, null);
  }
});

test("GET lee auditoría sin proveedor ni escritura, incluyendo errores de lecturas interrumpidas", async () => {
  const f = setup({ checks: [check({ status: "CONSULTANDO", createdAt: new Date(now - 240000), snapshot: null, completedAt: null })] });
  const history = await f.historialFichaPayJoy(actor);
  assert.equal(history.checks[0].status, "ERROR"); assert.equal(history.checks[0].errorCode, "TIMEOUT");
  assert.equal(f.providerCalls.length, 0); assert.ok(f.calls.every(call => call.method.startsWith("find")));
});

test("seguimiento cruza la última consulta posterior aunque no esté en las 30 visibles", async () => {
  const observed = check();
  const f = setup({ checks: [observed, ...Array.from({ length: 35 }, (_, index) => check({ identifier: `DOTHER${index}`, deviceTag: `DOTHER${index}`, imei: null, createdAt: new Date(now - 1000 + index) }))], extensions: [extension()] });
  const history = await f.historialFichaPayJoy(actor);
  assert.equal(history.checks.length, 30); assert.equal(history.checks.some(row => row.id === observed.id), false);
  assert.equal(history.extensions[0].followUp.checkId, observed.id);
  assert.equal(history.extensions[0].followUp.status, "CONSULTADO");
  assert.equal(history.extensions[0].followUp.paymentAfterExtension, null);
  assert.match(history.extensions[0].followUp.message, /no entregó historial/);
});

test("no usa lecturas solapadas, identidades contradictorias o consultas ajenas como seguimiento", async () => {
  for (const changes of [{ createdAt: new Date(now - 100000), completedAt: new Date(now - 50000) },
    { deviceTag: "DOTHER99" }, { imei: "359999999999992" }, { usuarioId: 2 }, { perfilId: 99 }, { sedeId: 99 }]) {
    const f = setup({ checks: [check(changes)], extensions: [extension()] });
    assert.equal((await f.historialFichaPayJoy(actor)).extensions[0].followUp.status, "SIN_COMPROBAR");
  }
});

test("solo pagos fechados posteriores y recibidos por PayJoy son evidencia, nunca el saldo", async () => {
  const payment = { amount: 15000, currency: "COP", paidAt: new Date(now - 70000).toISOString() };
  const f = setup({ checks: [check({ snapshot: { ...snapshot, paymentsAvailability: "INFORMADO", payments: [payment,
    { ...payment, amount: 0, paidAt: new Date(now - 55000).toISOString() },
    { ...payment, paidAt: new Date(now + 86400000).toISOString() }] } })], extensions: [extension()] });
  assert.deepEqual((await f.historialFichaPayJoy(actor)).extensions[0].followUp.paymentAfterExtension, payment);
  for (const paymentsAvailability of ["INFORMADO", "NO_DISPONIBLE"]) {
    const noEvidence = setup({ checks: [check({ snapshot: { ...snapshot, remainingBalance: 0, paidInFull: null, paymentsAvailability } })], extensions: [extension()] });
    const result = (await noEvidence.historialFichaPayJoy(actor)).extensions[0];
    assert.equal(result.followUp.paymentAfterExtension, null); assert.equal(result.followUp.paidInFull, null);
  }
});

test("una comprobación no resuelve extensiones indeterminadas ni convierte una consulta en aplicación", async () => {
  for (const status of ["INDETERMINADA", "EJECUTANDO", "LISTA", "EXPIRADA", "ERROR", "RECHAZADA"]) {
    const operation = extension({ status, activeDeviceKey: tag });
    const f = setup({ checks: [check()], extensions: [operation] });
    const before = structuredClone(f.rows.payJoyExtensionOperation);
    const result = (await f.historialFichaPayJoy(actor)).extensions[0];
    assert.equal(result.followUp.status, ["INDETERMINADA", "EJECUTANDO"].includes(status) ? "REQUIERE_REVISION" : "NO_APLICA");
    assert.deepEqual(f.rows.payJoyExtensionOperation, before); assert.equal(f.providerCalls.length, 0);
  }
});

test("el último fallo posterior no se oculta detrás de una comprobación anterior exitosa", async () => {
  const f = setup({ checks: [check(), check({ status: "ERROR", snapshot: null, errorCode: "TIMEOUT", createdAt: new Date(now - 10000) })], extensions: [extension()] });
  assert.equal((await f.historialFichaPayJoy(actor)).extensions[0].followUp.status, "ERROR_CONSULTA");
});

test("API exige sesión, permiso, origen, JSON y tamaño; no expone errores internos", async () => {
  for (const [session, status] of [[null, 401], [{ ...actor, perfilTipo: "FACTURADOR" }, 403]]) {
    const f = setup({ session }); assert.equal((await f.route.GET()).status, status);
    assert.equal((await f.route.POST(post(input()))).status, status); assert.equal(f.calls.length, 0);
  }
  const f = setup();
  for (const [request, status] of [[post(input(), { origin: "https://evil.test" }), 403],
    [post(input(), { "content-type": "text/plain" }), 415], [post("{"), 400], [post("[]"), 400],
    [post("x".repeat(2049)), 413]]) assert.equal((await f.route.POST(request)).status, status);
  assert.equal(f.providerCalls.length, 0);
  const failed = setup({ beforeDb: () => { throw Object.assign(new Error("postgres://secret@host"), { code: "P2021" }); } });
  const result = await failed.route.GET(); assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { code: "SCHEMA_REQUIRED", error: "El seguimiento requiere actualizar su base de datos. Contacta al administrador." });
  const ok = await setup().route.GET(); assert.equal(ok.headers.get("cache-control"), "private, no-store");
});
