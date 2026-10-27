import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../lib/payjoy-extensions-device-store.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const association = { imei: "035999999999991", documentoNumero: "001234567", deviceTag: "DABC123" };
const pair = { imei: association.imei, documentoNumero: association.documentoNumero };

function store(results = []) {
  const calls = [];
  const imports = {
    "server-only": {},
    "@/lib/prisma": { $queryRawUnsafe: async (sql, ...parameters) => {
      calls.push({ sql, parameters });
      const result = results[calls.length - 1] ?? [];
      if (result instanceof Error) throw result;
      return structuredClone(result);
    } },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return { ...loaded.exports, calls };
}

test("resuelve pareja exacta y verifica que el tag no corresponde a otra pareja", async () => {
  const reader = store([[association], [association]]);
  const result = await reader.findStoredPayJoyExtensionDevice({ imei: ` ${pair.imei} `, documentoNumero: ` ${pair.documentoNumero} ` });
  assert.deepEqual(result, association);
  assert.deepEqual(reader.calls.map((call) => call.parameters), [[pair.imei, pair.documentoNumero], [association.deviceTag]]);
  assert.deepEqual(Object.keys(result).sort(), ["deviceTag", "documentoNumero", "imei"]);
});

test("consulta por tag normalizado y conserva ceros iniciales en los identificadores", async () => {
  const reader = store([[association], [association]]);
  assert.deepEqual(await reader.findStoredPayJoyExtensionDevice({ deviceTag: " dabc123 " }), association);
  assert.deepEqual(reader.calls.map((call) => call.parameters), [[association.deviceTag], [pair.imei, pair.documentoNumero]]);
  assert.equal(reader.calls.length, 2);
});

test("SQL parametrizado limita 120 cortes y 3 asociaciones distintas sin DDL ni campos adicionales", async () => {
  const reader = store([[association], [association]]);
  await reader.findStoredPayJoyExtensionDevice(pair);
  for (const { sql, parameters } of reader.calls) {
    assert.match(sql, /ORDER BY updated_at DESC, id DESC\s+LIMIT 120/);
    assert.match(sql, /SELECT DISTINCT/);
    assert.match(sql, /btrim\(item\.value->>'imei'\)/);
    assert.match(sql, /btrim\(item\.value->>'nationalId'\)/);
    assert.match(sql, /upper\(btrim\(item\.value->>'device'\)\)/);
    assert.match(sql, /LIMIT 3/);
    assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|UPDATE|INSERT|DELETE)\b/i);
    for (const parameter of parameters) assert.ok(!sql.includes(parameter));
  }
  assert.match(reader.calls[0].sql, /WHERE btrim\(item\.value->>'imei'\) = \$1 AND btrim\(item\.value->>'nationalId'\) = \$2/);
  assert.match(reader.calls[1].sql, /WHERE upper\(btrim\(item\.value->>'device'\)\) = \$1/);
});

test("una pareja o un tag sin asociación devuelve null sin consultas adicionales", async () => {
  for (const input of [pair, { deviceTag: association.deviceTag }]) {
    const reader = store([[]]);
    assert.equal(await reader.findStoredPayJoyExtensionDevice(input), null);
    assert.equal(reader.calls.length, 1);
  }
});

test("rechaza entradas inválidas o ambiguas antes de consultar SQL", async () => {
  const reader = store();
  for (const input of [null, [], {}, { deviceTag: "DABC123'; DROP TABLE x;--" }, { deviceTag: "D123" },
    { imei: Number(pair.imei), documentoNumero: pair.documentoNumero }, { ...pair, documentoNumero: "12345 OR 1=1" },
    { ...pair, imei: "12345" }, { ...pair, deviceTag: association.deviceTag }]) {
    assert.equal(await reader.findStoredPayJoyExtensionDevice(input), null);
  }
  assert.equal(reader.calls.length, 0);
});

test("no elige entre varios tags de una pareja ni entre varias parejas de un tag", async () => {
  const otherTag = { ...association, deviceTag: "DOTHER99" };
  const otherPair = { ...association, documentoNumero: "999999999" };
  for (const [input, results] of [
    [pair, [[association, otherTag]]],
    [{ deviceTag: association.deviceTag }, [[association, otherPair]]],
    [pair, [[association], [association, otherPair]]],
    [pair, [[association], [otherPair]]],
    [pair, [[association], []]],
  ]) {
    const reader = store(results);
    await assert.rejects(reader.findStoredPayJoyExtensionDevice(input), (error) => {
      assert.equal(error.code, "DEVICE_ASSOCIATION_CONFLICT");
      assert.doesNotMatch(error.message, /999999999|DOTHER99|035999999999991|001234567/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("dos tags históricos para una misma pareja se rechazan también al consultar cada tag manual", async () => {
  const otherTag = { ...association, deviceTag: "DOTHER99" };
  for (const candidate of [association, otherTag]) {
    const reader = store([[candidate], [association, otherTag]]);
    await assert.rejects(reader.findStoredPayJoyExtensionDevice({ deviceTag: candidate.deviceTag }), { code: "DEVICE_ASSOCIATION_CONFLICT" });
    assert.deepEqual(reader.calls.map((call) => call.parameters), [[candidate.deviceTag], [pair.imei, pair.documentoNumero]]);
  }
  for (const inverseResult of [[], [otherTag], [{ ...association, documentoNumero: "999999999" }]]) {
    const reader = store([[association], inverseResult]);
    await assert.rejects(reader.findStoredPayJoyExtensionDevice({ deviceTag: association.deviceTag }), { code: "DEVICE_ASSOCIATION_CONFLICT" });
  }
});

test("asociaciones malformadas o discordantes nunca devuelven una identidad verificada", async () => {
  for (const invalid of [{ ...association, imei: "035999999999992" }, { ...association, imei: Number(pair.imei) },
    { ...association, documentoNumero: null }, { ...association, documentoNumero: "00000" },
    { ...association, deviceTag: "invalid" }, null]) {
    const reader = store([[invalid]]);
    await assert.rejects(reader.findStoredPayJoyExtensionDevice(pair), { code: "DEVICE_ASSOCIATION_CONFLICT" });
  }
  const byTag = store([[{ ...association, deviceTag: "DOTHER99" }]]);
  await assert.rejects(byTag.findStoredPayJoyExtensionDevice({ deviceTag: association.deviceTag }), { code: "DEVICE_ASSOCIATION_CONFLICT" });
});

test("tabla ausente devuelve null para errores PostgreSQL y Prisma sin inicializar esquema", async () => {
  const failures = [
    { code: "42P01" }, { code: "P2021" }, { code: "P2010", meta: { code: "42P01" } },
    { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "42P01" } } } },
  ];
  for (const failure of failures) {
    const error = Object.assign(new Error("private database details"), failure);
    const reader = store([error]);
    assert.equal(await reader.findStoredPayJoyExtensionDevice(pair), null);
    assert.equal(reader.calls.length, 1);
  }
});

test("otros errores SQL se propagan sin convertirse en una asociación ausente", async () => {
  for (const code of ["P2022", "P2010", "ECONNRESET", "57014", "42501"]) {
    const failure = Object.assign(new Error("database failure"), { code });
    const reader = store([failure]);
    await assert.rejects(reader.findStoredPayJoyExtensionDevice(pair), (error) => error === failure);
  }
});
