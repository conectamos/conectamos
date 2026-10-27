import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const providerExports = {};
new Function("require", "exports", ts.transpileModule(
  readFileSync(new URL("../lib/payjoy-extensions-provider.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)((id) => { if (id === "server-only") return {}; throw new Error(`Unexpected provider import ${id}`); }, providerExports);
const { PayJoyExtensionsProviderError } = providerExports;
const vendor = { id: 1, perfilId: 11, perfilTipo: "VENDEDOR", rolNombre: "VENDEDOR", sedeId: 101, nombre: "Usuario", perfilNombre: "Asesor" };
const admin = { ...vendor, perfilId: 12, perfilTipo: "ADMINISTRADOR", rolNombre: "ADMIN" };
const auditor = { ...vendor, perfilId: 13, perfilTipo: "AUDITOR", rolNombre: "AUDITOR" };
const imei = "359999999999991";
const tag = "DABC123";
const option = {
  id: "courtesy:24", extensionType: "courtesy", extensionTime: 24,
  status: "available", available: true, reason: null,
  reasons: [{ id: "income_delay", label: "Pago pendiente" }], details: { extensionsRemaining: 1 },
};
const response = { success: true, status: "GRANTED", newValidThrough: "2026-12-01T10:00:00.000Z" };
const snapshot = { imei, deviceTag: tag, customerId: "4000005", financeOrderId: "4000004", model: "Samsung", validThrough: null, remainingBalance: 100000, currency: "COP" };
const local = (changes = {}) => ({
  id: 1, perfilVendedorId: 11, sedeId: 101, documentoNumero: "123456789", serialImei: imei,
  clienteNombre: "Cliente", referenciaEquipo: "Samsung", plataformaCredito: "PAYJOY", financierasDetalle: null,
  eliminadoEn: null, estadoVentaRegistro: "APROBADA", createdAt: new Date(), ...changes,
});
const copy = (value) => structuredClone(value);
const unique = () => Object.assign(new Error("Unique constraint"), { code: "P2002" });

function matches(row, where = {}) {
  return Object.entries(where).every(([key, target]) => {
    if (key === "OR") return target.some((condition) => matches(row, condition));
    if (key === "AND") return target.every((condition) => matches(row, condition));
    const value = row[key] ?? null;
    if (target && typeof target === "object" && !(target instanceof Date)) {
      return Object.entries(target).every(([operator, expected]) => {
        if (operator === "in") return expected.includes(value);
        if (operator === "notIn") return !expected.includes(value);
        if (operator === "not") return value !== expected;
        if (operator === "lt") return value !== null && value < expected;
        if (operator === "gt") return value !== null && value > expected;
        throw new Error(`Unsupported mock operator ${operator}`);
      });
    }
    return value === target;
  });
}

function setup(options = {}) {
  const rows = { registroVendedorVenta: copy(options.records ?? [local()]), payJoyExtensionOperation: copy(options.operations ?? []) };
  const calls = [];
  const providerCalls = [];
  const prisma = {};
  for (const [table, data] of Object.entries(rows)) {
    const select = (args = {}) => {
      let selected = data.filter((row) => matches(row, args.where));
      if (args.orderBy) for (const [field, direction] of Object.entries(args.orderBy)) {
        selected = selected.toSorted((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (direction === "asc" ? 1 : -1));
      }
      if (args.take) selected = selected.slice(0, args.take);
      return selected;
    };
    const checkUnique = (candidate, current) => {
      if (table !== "payJoyExtensionOperation") return;
      for (const key of ["id", "idempotencyKey", "activeDeviceKey", "providerIdempotencyKey"]) {
        if (candidate[key] != null && data.some((row) => row !== current && row[key] === candidate[key])) throw unique();
      }
    };
    const update = (row, change) => {
      if (!row) throw new Error("Mock row not found");
      checkUnique({ ...row, ...change }, row);
      Object.assign(row, copy(change), { updatedAt: new Date() });
      return row;
    };
    const methods = {
      findMany: select,
      findFirst: (args) => select(args)[0] ?? null,
      findUnique: (args) => select(args)[0] ?? null,
      findUniqueOrThrow: (args) => { const found = select(args)[0]; if (!found) throw new Error("Mock row missing"); return found; },
      count: (args) => select(args).length,
      create: ({ data: change }) => {
        const row = { perfilId: null, registroId: null, clienteDocumentoUltimos4: null, clienteIdPayjoy: null,
          deviceTag: null, imei: null, providerRequestId: null, currentValidThrough: null,
          selectedOption: null, selectedReason: null, response: null, errorCode: null, completedAt: null,
          createdAt: new Date(), updatedAt: new Date(), ...copy(change) };
        checkUnique(row);
        data.push(row);
        return row;
      },
      update: ({ where, data: change }) => update(select({ where })[0], change),
      updateMany: ({ where, data: change }) => { const selected = select({ where }); selected.forEach((row) => update(row, change)); return { count: selected.length }; },
    };
    prisma[table] = Object.fromEntries(Object.entries(methods).map(([method, implementation]) => [method, async (args) => {
      calls.push({ table, method, args: copy(args) });
      if (options.beforeDb) await options.beforeDb(table, method, args);
      return copy(implementation(args));
    }]));
  }
  const provider = Object.fromEntries(Object.entries({
    beginPayJoyExtension: async () => ({ requestId: "request1", currentValidThrough: "2026-11-30T10:00:00.000Z", options: [copy(option)] }),
    refreshPayJoyExtensionOptions: async () => [copy(option)],
    selectPayJoyExtension: async () => copy(response),
    ...options.provider,
  }).map(([name, run]) => [name, async (...args) => { providerCalls.push({ name, args: copy(args) }); return run(...args); }]));
  provider.PayJoyExtensionsProviderError = PayJoyExtensionsProviderError;
  const mocks = {
    "server-only": {}, "@/lib/prisma": prisma,
    "@/lib/auth": { getSessionUser: async () => options.session === undefined ? vendor : options.session },
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/payjoy-retail": {
      isPayJoyRetailConfigured: () => options.configured !== false,
      readPayJoyExtensionDevice: async (...args) => { providerCalls.push({ name: "readPayJoyExtensionDevice", args }); if (options.lookupError) throw options.lookupError; return copy(options.snapshot ?? snapshot); },
    },
    "@/lib/payjoy-extensions-device-store": {
      findStoredPayJoyExtensionDevice: async (input) => {
        calls.push({ table: "storedAssociation", method: "find", args: copy(input) });
        if (options.storedError) throw options.storedError;
        return copy(options.storedDevice ?? null);
      },
    },
    "@/lib/payjoy-extensions-provider": provider,
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache.set(file, mod.exports);
    const require = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`);
      if (id.startsWith("node:")) return nativeRequire(id);
      throw new Error(`Unexpected module ${id}`);
    };
    new Function("require", "exports", "module", "process", code)(require, mod.exports, mod, {
      env: { NODE_ENV: "production", APP_URL: "https://conectamos.test" },
    });
    return mod.exports;
  }
  return { ...load("lib/payjoy-extensions-service.ts"), route: load("app/api/payjoy/extensiones/route.ts"), rows, calls, providerCalls };
}

const prepare = (extra = {}) => ({ idempotencyKey: randomUUID(), registroId: 1, ...extra });
const confirm = (operation, extra = {}) => ({ operationId: operation.id, optionId: option.id, reason: "income_delay", confirmed: true, ...extra });
const countProvider = (fixture, name) => fixture.providerCalls.filter((call) => call.name === name).length;
const post = (body, changes = {}) => new Request("https://conectamos.test/api/payjoy/extensiones", {
  method: "POST", headers: { origin: "https://conectamos.test", "content-type": "application/json", ...changes.headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const unresolved = () => Object.assign(new Error("Empty Retail device response"), { code: "DEVICE_UNRESOLVED" });
const storedDevice = { imei, documentoNumero: "123456789", deviceTag: tag };

test("respuesta Retail vacía resuelve solo la pareja autorizada en reportes y consulta opciones reales", async () => {
  const f = setup({ lookupError: unresolved(), storedDevice });
  const result = await f.prepararExtensionPayJoy(vendor, prepare());
  assert.equal(result.status, "LISTA");
  assert.equal(result.deviceTag, tag);
  assert.equal(result.imei, imei);
  assert.equal(result.clienteDocumentoUltimos4, "6789");
  assert.deepEqual(f.calls.filter(call => call.table === "storedAssociation").map(call => call.args), [{ imei, documentoNumero: "123456789" }]);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
  assert.ok(!JSON.stringify(f.providerCalls).includes("123456789"));
});

test("no consulta reportes ni PayJoy para un registro ajeno o eliminado", async () => {
  for (const changes of [{ perfilVendedorId: 22 }, { sedeId: 202 }, { eliminadoEn: new Date() }]) {
    const f = setup({ records: [local(changes)], lookupError: unresolved(), storedDevice });
    await assert.rejects(f.prepararExtensionPayJoy(vendor, prepare()), { code: "FORBIDDEN_DEVICE" });
    assert.equal(f.calls.filter(call => call.table === "storedAssociation").length, 0);
    assert.equal(f.providerCalls.length, 0);
  }
});

test("sin asociación la consulta por IMEI pide código manual y no inicia extensiones", async () => {
  const f = setup({ lookupError: unresolved() });
  const result = await f.prepararExtensionPayJoy(vendor, prepare());
  assert.equal(result.errorCode, "DEVICE_UNRESOLVED");
  assert.match(result.errorMessage, /sin los datos del equipo/);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 0);
});

test("el respaldo importado conserva un solo bloqueo al consultar registro y tag en paralelo", async () => {
  const f = setup({ lookupError: unresolved(), storedDevice });
  await Promise.all([
    f.prepararExtensionPayJoy(vendor, prepare()),
    f.prepararExtensionPayJoy(vendor, { idempotencyKey: randomUUID(), deviceTag: tag }),
  ]);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
  assert.equal(f.rows.payJoyExtensionOperation.filter(row => row.activeDeviceKey === tag).length, 1);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
});

test("un código manual importado requiere un registro autorizado y guarda su vínculo", async () => {
  const f = setup({ lookupError: unresolved(), storedDevice });
  const result = await f.prepararExtensionPayJoy(vendor, { idempotencyKey: randomUUID(), deviceTag: tag });
  assert.equal(result.status, "LISTA");
  assert.equal(f.rows.payJoyExtensionOperation[0].registroId, 1);
  assert.equal(result.clienteDocumentoUltimos4, "6789");
  for (const records of [[], [local({ perfilVendedorId: 22 })], [local({ sedeId: 202 })], [local({ documentoNumero: "999999999" })]]) {
    const denied = setup({ records, lookupError: unresolved(), storedDevice });
    const operation = await denied.prepararExtensionPayJoy(vendor, { idempotencyKey: randomUUID(), deviceTag: tag });
    assert.equal(operation.errorCode, "FORBIDDEN_DEVICE");
    assert.equal(countProvider(denied, "beginPayJoyExtension"), 0);
  }
});

test("solo una identidad global puede consultar código manual sin asociación y no lo adjudica a un cliente", async () => {
  const f = setup({ lookupError: unresolved() });
  const result = await f.prepararExtensionPayJoy(admin, { idempotencyKey: randomUUID(), deviceTag: tag });
  assert.equal(result.status, "LISTA");
  assert.equal(result.imei, null);
  assert.equal(result.clienteDocumentoUltimos4, null);
  assert.equal(f.rows.payJoyExtensionOperation[0].registroId, null);
  const restricted = setup({ lookupError: unresolved() });
  const denied = await restricted.prepararExtensionPayJoy({ ...vendor, rolNombre: "ADMIN" }, { idempotencyKey: randomUUID(), deviceTag: tag });
  assert.equal(denied.errorCode, "DEVICE_UNRESOLVED");
  assert.equal(countProvider(restricted, "beginPayJoyExtension"), 0);
});

test("respuesta contradictoria, auth y transporte no usan reportes para esconder el fallo", async () => {
  for (const code of ["INVALID_RESPONSE", "AUTH", "TIMEOUT", "UNAVAILABLE", "NOT_FOUND"]) {
    const f = setup({ lookupError: Object.assign(new Error("private"), { code }), storedDevice });
    const result = await f.prepararExtensionPayJoy(vendor, prepare());
    assert.equal(result.errorCode, code);
    assert.equal(f.calls.filter(call => call.table === "storedAssociation").length, 0);
    assert.equal(countProvider(f, "beginPayJoyExtension"), 0);
  }
});

test("conflicto en reportes bloquea el equipo sin invocar extensiones y falta de tag admite pareja verificada", async () => {
  const conflict = setup({ lookupError: unresolved(), storedError: Object.assign(new Error("conflict"), { code: "DEVICE_ASSOCIATION_CONFLICT" }) });
  const denied = await conflict.prepararExtensionPayJoy(vendor, prepare());
  assert.equal(denied.errorCode, "DEVICE_ASSOCIATION_CONFLICT");
  assert.equal(countProvider(conflict, "beginPayJoyExtension"), 0);
  const f = setup({ snapshot: { ...snapshot, deviceTag: null }, storedDevice });
  assert.equal((await f.prepararExtensionPayJoy(vendor, prepare())).status, "LISTA");
});

test("búsqueda por cédula devuelve solo equipos PayJoy autorizados, activos y únicos; no envía documento a APIs", async () => {
  const f = setup({ records: [
    local(), local({ id: 2 }), local({ id: 3, perfilVendedorId: 22, serialImei: "359999999999992" }),
    local({ id: 4, sedeId: 202, serialImei: "359999999999993" }),
    local({ id: 5, plataformaCredito: "ADDI", serialImei: "359999999999994" }),
    local({ id: 6, eliminadoEn: new Date(), serialImei: "359999999999995" }),
    local({ id: 7, estadoVentaRegistro: "ANULADA", serialImei: "359999999999996" }),
    local({ id: 8, plataformaCredito: "MULTIPLE", financierasDetalle: [{ plataformaCredito: "PAYJOY" }], serialImei: "359999999999997" }),
  ] });
  const result = await f.buscarDispositivosLocalesPayJoy(vendor, "123456789");
  assert.equal(result.source, "CONECTAMOS");
  assert.deepEqual(result.devices.map((device) => device.imei).sort(), [imei, "359999999999997"]);
  assert.ok(result.devices.every((device) => device.documentoUltimos4 === "6789"));
  assert.equal(f.providerCalls.length, 0);
  await f.prepararExtensionPayJoy(vendor, prepare());
  assert.deepEqual(f.providerCalls[0], { name: "readPayJoyExtensionDevice", args: [imei] });
  assert.ok(!JSON.stringify(f.providerCalls).includes("123456789"));
});

test("dos preparaciones concurrentes con la misma clave crean una operación y una petición remota", async () => {
  const f = setup();
  const input = prepare();
  const results = await Promise.all([f.prepararExtensionPayJoy(vendor, input), f.prepararExtensionPayJoy(vendor, input)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(f.rows.payJoyExtensionOperation.length, 1);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
});

test("claves distintas concurrentes para el mismo equipo comparten el bloqueo persistente", async () => {
  const f = setup();
  const results = await Promise.all([f.prepararExtensionPayJoy(vendor, prepare()), f.prepararExtensionPayJoy(vendor, prepare())]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(f.rows.payJoyExtensionOperation.length, 1);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
});

test("consultar el mismo equipo por registro y tag en paralelo no duplica la preparación remota", async () => {
  const f = setup();
  await Promise.all([f.prepararExtensionPayJoy(vendor, prepare()), f.prepararExtensionPayJoy(vendor, { idempotencyKey: randomUUID(), deviceTag: tag })]);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
  assert.equal(f.rows.payJoyExtensionOperation.filter((row) => row.activeDeviceKey === tag).length, 1);
});

test("otro asesor o sede no recibe historial ni detalles por reutilizar clave, operación o dispositivo", async () => {
  const f = setup();
  const input = prepare();
  const operation = await f.prepararExtensionPayJoy(vendor, input);
  for (const actor of [{ ...vendor, id: 99 }, { ...vendor, perfilId: 99 }, { ...vendor, sedeId: 99 }]) {
    assert.deepEqual((await f.historialExtensionesPayJoy(actor)).operations, []);
    await assert.rejects(f.prepararExtensionPayJoy(actor, input), { code: "IDEMPOTENCY_CONFLICT" });
    await assert.rejects(f.confirmarExtensionPayJoy(actor, confirm(operation)), { code: "NOT_FOUND" });
    await assert.rejects(f.prepararExtensionPayJoy(actor, { idempotencyKey: randomUUID(), deviceTag: tag }), { code: "DEVICE_BUSY" });
  }
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
});

test("entrada manual bloquea equipo conocido de otro perfil o sede antes de consultar extensiones", async () => {
  for (const record of [local({ perfilVendedorId: 22 }), local({ sedeId: 202 })]) {
    const f = setup({ records: [record] });
    const result = await f.prepararExtensionPayJoy(vendor, { idempotencyKey: randomUUID(), deviceTag: tag });
    assert.equal(result.status, "ERROR");
    assert.equal(result.errorCode, "FORBIDDEN_DEVICE");
    assert.equal(countProvider(f, "beginPayJoyExtension"), 0);
    assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
  }
});

test("auditor puede consultar pero no confirmar; perfil restringido no hereda ADMIN", async () => {
  const f = setup();
  const operation = await f.prepararExtensionPayJoy(auditor, prepare());
  assert.equal((await f.historialExtensionesPayJoy(auditor)).canManage, false);
  await assert.rejects(f.confirmarExtensionPayJoy(auditor, confirm(operation)), { code: "FORBIDDEN" });
  for (const perfilTipo of ["BODEGA", "FACTURADOR", "DESCONOCIDO"]) {
    await assert.rejects(f.prepararExtensionPayJoy({ ...admin, perfilTipo }, prepare()), { code: "FORBIDDEN" });
  }
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
});

test("rechaza opción, motivo o confirmación alterados antes de ejecutar", async () => {
  const f = setup();
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  for (const [changes, code] of [
    [{ confirmed: false }, "INVALID_INPUT"], [{ confirmed: "true" }, "INVALID_INPUT"],
    [{ optionId: "other:999" }, "INVALID_OPTION"], [{ reason: "inventado" }, "INVALID_OPTION"],
    [{ reason: "" }, "INVALID_OPTION"], [{ reason: "a".repeat(301) }, "INVALID_INPUT"],
  ]) await assert.rejects(f.confirmarExtensionPayJoy(vendor, confirm(operation, changes)), { code });
  assert.equal(countProvider(f, "refreshPayJoyExtensionOptions"), 0);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
});

test("dos confirmaciones concurrentes ejecutan una sola selección y reenvío posterior devuelve el resultado guardado", async () => {
  const f = setup();
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  await Promise.all([f.confirmarExtensionPayJoy(vendor, confirm(operation)), f.confirmarExtensionPayJoy(vendor, confirm(operation))]);
  const replay = await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  assert.equal(replay.status, "EXITOSA");
  assert.deepEqual(replay.result, response);
  assert.equal(countProvider(f, "refreshPayJoyExtensionOptions"), 1);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 1);
  const call = f.providerCalls.find((entry) => entry.name === "selectPayJoyExtension");
  assert.equal(call.args[2], f.rows.payJoyExtensionOperation[0].providerIdempotencyKey);
  assert.deepEqual(call.args[3], { extensionType: option.extensionType, extensionTime: option.extensionTime, reason: "income_delay" });
  await assert.rejects(f.confirmarExtensionPayJoy(vendor, confirm(operation, { optionId: "altered" })), { code: "IDEMPOTENCY_CONFLICT" });
});

test("confirmaciones concurrentes con opción o motivo distintos devuelven 409 al perder la reclamación", { timeout: 10000 }, async () => {
  const first = { ...copy(option), reasons: [...option.reasons, { id: "other_reason", label: "Otro motivo" }] };
  const second = { ...copy(option), id: "courtesy:48", extensionTime: 48 };
  for (const differentSelection of [{ optionId: second.id }, { reason: "other_reason" }]) {
    let claims = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    const f = setup({
      provider: {
        beginPayJoyExtension: async () => ({ requestId: "request1", currentValidThrough: null, options: [copy(first), copy(second)] }),
        refreshPayJoyExtensionOptions: async () => [copy(first), copy(second)],
      },
      beforeDb: async (table, method, args) => {
        if (table === "payJoyExtensionOperation" && method === "updateMany" && args.where.status === "LISTA" && args.data.status === "EJECUTANDO") {
          claims++;
          if (claims === 2) release();
          await barrier; // Both readers observed LISTA before either atomic claim.
        }
      },
    });
    const operation = await f.prepararExtensionPayJoy(vendor, prepare());
    const results = await Promise.allSettled([
      f.confirmarExtensionPayJoy(vendor, confirm(operation)),
      f.confirmarExtensionPayJoy(vendor, confirm(operation, differentSelection)),
    ]);
    assert.equal(claims, 2);
    const winners = results.filter((result) => result.status === "fulfilled");
    const losers = results.filter((result) => result.status === "rejected");
    assert.equal(winners.length, 1);
    assert.equal(winners[0].value.status, "EXITOSA");
    assert.equal(losers.length, 1);
    assert.equal(losers[0].reason.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(losers[0].reason.status, 409);
    assert.equal(countProvider(f, "refreshPayJoyExtensionOptions"), 1);
    assert.equal(countProvider(f, "selectPayJoyExtension"), 1);
  }
});

test("revalida las opciones actuales y no ejecuta una opción cuyo detalle cambió", async () => {
  const f = setup({ provider: { refreshPayJoyExtensionOptions: async () => [{ ...option, details: { extensionsRemaining: 0 } }] } });
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  const result = await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  assert.equal(result.status, "ERROR");
  assert.equal(result.errorCode, "OPTIONS_CHANGED");
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
  assert.equal(f.rows.payJoyExtensionOperation[0].activeDeviceKey, null);
});

test("revalida pertenencia del registro antes de confirmar y bloquea una venta eliminada o transferida", async () => {
  for (const change of [{ eliminadoEn: new Date() }, { perfilVendedorId: 99 }, { sedeId: 99 }, { serialImei: "359999999999992" }]) {
    const f = setup();
    const operation = await f.prepararExtensionPayJoy(vendor, prepare());
    Object.assign(f.rows.registroVendedorVenta[0], change);
    await assert.rejects(f.confirmarExtensionPayJoy(vendor, confirm(operation)), { code: "FORBIDDEN_DEVICE" });
    assert.equal(countProvider(f, "refreshPayJoyExtensionOptions"), 0);
    assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
  }
});

test("una consulta vencida o sin opciones no ejecuta extensiones", async () => {
  const expired = setup();
  const operation = await expired.prepararExtensionPayJoy(vendor, prepare());
  expired.rows.payJoyExtensionOperation[0].expiresAt = new Date(0);
  assert.equal((await expired.confirmarExtensionPayJoy(vendor, confirm(operation))).status, "EXPIRADA");
  assert.equal(countProvider(expired, "selectPayJoyExtension"), 0);
  const empty = setup({ provider: { beginPayJoyExtension: async () => ({ requestId: "request1", currentValidThrough: null, options: [] }) } });
  const noOptions = await empty.prepararExtensionPayJoy(vendor, prepare());
  assert.equal(noOptions.status, "SIN_OPCIONES");
  assert.equal((await empty.confirmarExtensionPayJoy(vendor, confirm(noOptions))).status, "SIN_OPCIONES");
  assert.equal(countProvider(empty, "selectPayJoyExtension"), 0);
});

test("SIN_OPCIONES libera el equipo para una nueva consulta pero la misma clave reproduce su resultado", async () => {
  let begins = 0;
  const f = setup({ provider: { beginPayJoyExtension: async () => ({
    requestId: `request${++begins}`, currentValidThrough: null, options: begins === 1 ? [] : [copy(option)],
  }) } });
  const input = prepare();
  const empty = await f.prepararExtensionPayJoy(vendor, input);
  assert.equal(empty.status, "SIN_OPCIONES");
  assert.equal(f.rows.payJoyExtensionOperation[0].activeDeviceKey, null);
  assert.equal((await f.prepararExtensionPayJoy(vendor, input)).id, empty.id);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
  const refreshed = await f.prepararExtensionPayJoy(vendor, prepare());
  assert.notEqual(refreshed.id, empty.id);
  assert.equal(refreshed.status, "LISTA");
  assert.equal(countProvider(f, "beginPayJoyExtension"), 2);
  const originalReplay = await f.prepararExtensionPayJoy(vendor, input);
  assert.equal(originalReplay.id, empty.id);
  assert.equal(originalReplay.status, "SIN_OPCIONES");
  assert.equal(countProvider(f, "beginPayJoyExtension"), 2);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 0);
});

test("timeout tras despachar conserva INDETERMINADA y bloqueo indefinido frente a recarga, reenvío y clave nueva", async () => {
  const f = setup({ provider: { selectPayJoyExtension: async () => { throw Object.assign(new Error("private token"), { code: "TIMEOUT" }); } } });
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  const result = await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  assert.equal(result.status, "INDETERMINADA");
  assert.equal(result.errorCode, "INTERRUPTED");
  assert.doesNotMatch(JSON.stringify(result), /private token/);
  const row = f.rows.payJoyExtensionOperation[0];
  row.updatedAt = new Date(0); row.expiresAt = new Date(0);
  await f.historialExtensionesPayJoy(vendor);
  await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  const replay = await f.prepararExtensionPayJoy(vendor, prepare());
  assert.equal(replay.status, "INDETERMINADA");
  assert.equal(row.activeDeviceKey, tag);
  assert.equal(countProvider(f, "selectPayJoyExtension"), 1);
  assert.equal(countProvider(f, "beginPayJoyExtension"), 1);
});

test("fallo de base de datos después de respuesta exitosa conserva estado ambiguo y nunca vuelve a seleccionar", async () => {
  let failOnce = true;
  const f = setup({ beforeDb: (table, method, args) => {
    if (table === "payJoyExtensionOperation" && method === "update" && args.data.status === "EXITOSA" && failOnce) {
      failOnce = false; throw new Error("DB unavailable after provider success");
    }
  } });
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  const result = await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  assert.equal(result.status, "INDETERMINADA");
  await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  assert.equal(countProvider(f, "selectPayJoyExtension"), 1);
  assert.equal(f.rows.payJoyExtensionOperation[0].activeDeviceKey, tag);
});

test("caída persistente de DB después de select conserva la reclamación hasta reconciliar sin repetir la operación", async () => {
  let unavailable = false;
  const f = setup({
    provider: { selectPayJoyExtension: async () => { unavailable = true; return copy(response); } },
    beforeDb: (table, method) => { if (unavailable && table === "payJoyExtensionOperation" && method === "update") throw new Error("DB unavailable"); },
  });
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  await assert.rejects(f.confirmarExtensionPayJoy(vendor, confirm(operation)), /DB unavailable/);
  const row = f.rows.payJoyExtensionOperation[0];
  assert.equal(row.status, "EJECUTANDO");
  assert.equal(row.activeDeviceKey, tag);
  unavailable = false;
  row.updatedAt = new Date(0);
  assert.equal((await f.historialExtensionesPayJoy(vendor)).operations[0].status, "INDETERMINADA");
  await f.confirmarExtensionPayJoy(vendor, confirm(operation));
  assert.equal(countProvider(f, "selectPayJoyExtension"), 1);
});

test("rechazo o autenticación fallida confirmados por el proveedor liberan el bloqueo sin reenvío automático", async () => {
  for (const code of ["REJECTED", "AUTH"]) {
    const f = setup({ provider: { selectPayJoyExtension: async () => { throw new PayJoyExtensionsProviderError(code, 502, false); } } });
    const operation = await f.prepararExtensionPayJoy(vendor, prepare());
    const result = await f.confirmarExtensionPayJoy(vendor, confirm(operation));
    assert.equal(result.status, code === "REJECTED" ? "RECHAZADA" : "ERROR");
    assert.equal(result.errorCode, code);
    assert.equal(f.rows.payJoyExtensionOperation[0].activeDeviceKey, null);
    await f.confirmarExtensionPayJoy(vendor, confirm(operation));
    assert.equal(countProvider(f, "selectPayJoyExtension"), 1);
  }
});

test("GET no llama al proveedor y reconcilia ejecuciones interrumpidas sin quitar el bloqueo", async () => {
  const f = setup();
  const operation = await f.prepararExtensionPayJoy(vendor, prepare());
  const row = f.rows.payJoyExtensionOperation[0];
  row.status = "EJECUTANDO"; row.updatedAt = new Date(0); row.expiresAt = new Date(0);
  const before = f.providerCalls.length;
  const result = await f.route.GET();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  const body = await result.json();
  assert.equal(body.operations[0].id, operation.id);
  assert.equal(body.operations[0].status, "INDETERMINADA");
  assert.equal(row.activeDeviceKey, tag);
  assert.equal(f.providerCalls.length, before);
});

test("ruta exige autenticación y autorización antes de leer datos o llamar a PayJoy", async () => {
  for (const [session, status] of [[null, 401], [{ ...vendor, perfilTipo: "FACTURADOR" }, 403]]) {
    const f = setup({ session });
    assert.equal((await f.route.GET()).status, status);
    assert.equal((await f.route.POST(post({ action: "buscar", cedula: "123456789" }))).status, status);
    assert.equal(f.calls.length, 0);
    assert.equal(f.providerCalls.length, 0);
  }
});

test("ruta rechaza CSRF, JSON malformado, arrays, acciones desconocidas y cuerpos grandes", async () => {
  const f = setup();
  const cases = [
    [post("{}", { headers: { origin: "https://evil.test" } }), 403],
    [post("{}", { headers: { origin: "" } }), 403],
    [post("{}", { headers: { "sec-fetch-site": "cross-site" } }), 403],
    [post("{}", { headers: { "content-type": "text/plain" } }), 415],
    [post("{"), 400], [post("null"), 400], [post("[]"), 400], [post({ action: "unknown" }), 400],
    [post("x".repeat(4097)), 413],
  ];
  for (const [req, status] of cases) assert.equal((await f.route.POST(req)).status, status);
  assert.equal(f.calls.length, 0);
  assert.equal(f.providerCalls.length, 0);
});

test("ruta no filtra errores internos ni credenciales y comunica esquema faltante", async () => {
  for (const [code, expected] of [["P2021", "SCHEMA_REQUIRED"], ["UNKNOWN", "INTERNAL"]]) {
    const f = setup({ beforeDb: () => { throw Object.assign(new Error("postgres://user:secret@host/private"), { code }); } });
    const result = await f.route.GET();
    assert.equal(result.status, 503);
    const body = await result.json();
    assert.equal(body.code, expected);
    assert.doesNotMatch(JSON.stringify(body), /postgres|secret|host\/private/);
  }
});
