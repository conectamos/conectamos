import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../lib/payjoy-retail.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const imei = "359999999999991";
const tag = "DABC123";
const secret = "test-server-key-never-returned";

function client(fetchStub, environment = { PAYJOY_RETAIL_API_KEY: secret }) {
  const exported = {};
  const timeouts = [];
  const require = (id) => {
    if (id === "@/lib/payjoy" || id === "@/lib/credit-date-utils") return {};
    throw new Error(`Unexpected dependency ${id}`);
  };
  new Function("require", "exports", "process", "fetch", "AbortSignal", code)(
    require, exported,
    { env: { PAYJOY_RETAIL_API_BASE_URL: "https://payjoy.example.test/v1", ...environment } },
    fetchStub,
    { timeout: (duration) => { timeouts.push(duration); return new AbortController().signal; } },
  );
  return { ...exported, timeouts };
}

function payload(overrides = {}) {
  return {
    valid: true,
    customer: { id: 4000005, name: "Nombre privado", nationalId: "123123123" },
    device: { imei, deviceTag: tag, validThrough: 1560679200, model: { name: "Samsung Galaxy S6" } },
    financeOrder: { id: "4000004", currency: "COP", remainingBalance: "198000.50", time: 1482000000 },
    paymentHistory: [{ amount: 18000 }],
    paymentOptions: [{ amount: 18000, currency: "COP", type: "month" }],
    message: `Never expose ${secret}`,
    ...overrides,
  };
}

test("consulta una sola vez el endpoint existente por IMEI sin restricción hoy/ayer ni inferir extensiones", async () => {
  const calls = [];
  const reader = client(async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json(payload());
  });
  const result = await reader.readPayJoyExtensionDevice(imei);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/v1/lookup-customer.php");
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {
    key: secret, customerLocator: imei, fields: "device.description",
  });
  assert.equal(calls[0].init.cache, "no-store");
  assert.ok(calls[0].init.signal);
  assert.deepEqual(reader.timeouts, [20000]);
  assert.deepEqual(result, {
    imei, deviceTag: tag, customerId: "4000005", financeOrderId: "4000004",
    model: "Samsung Galaxy S6", validThrough: "2019-06-16T10:00:00.000Z",
    remainingBalance: 198000.5, currency: "COP",
  });
  assert.doesNotMatch(JSON.stringify(result), /paymentOptions|paymentHistory|Never expose|Nombre privado|123123123|test-server-key/);
});

test("normaliza el Device Tag y permite usar el solicitado solo si PayJoy retorna IMEI verificable", async () => {
  let sent;
  const reader = client(async (url) => {
    sent = new URL(url).searchParams.get("customerLocator");
    return Response.json(payload({ device: { imei } }));
  });
  const result = await reader.readPayJoyExtensionDevice(` ${tag.toLowerCase()} `);
  assert.equal(sent, tag);
  assert.equal(result.deviceTag, tag);
  assert.equal(result.imei, imei);
});

test("rechaza cédulas, teléfonos, identificadores deformados y tipos incorrectos antes de consultar", async () => {
  let calls = 0;
  const reader = client(async () => { calls++; throw new Error("Network forbidden"); });
  for (const identifier of ["1234567890", "573001234567", "", "D1234", "D" + "A".repeat(32), `${imei}0x`, "https://payjoy.com", null, 359999999999991]) {
    await assert.rejects(reader.readPayJoyExtensionDevice(identifier), { code: "INVALID_INPUT" });
  }
  assert.equal(calls, 0);
});

test("acepta IMEI de 16 dígitos sin convertirlo en número", async () => {
  const value = "0123456789012345";
  const reader = client(async () => Response.json(payload({ device: { imei: value } })));
  const result = await reader.readPayJoyExtensionDevice(value);
  assert.equal(result.imei, value);
  assert.equal(result.deviceTag, null);
});

test("rechaza una identidad distinta, una respuesta ambigua o un tag contradictorio", async () => {
  const cases = [
    [imei, payload({ device: { imei: "359999999999992" } })],
    [tag, payload({ device: { imei, deviceTag: "DOTHER99" } })],
    [tag, payload({ device: { deviceTag: tag } })],
    [imei, payload({ device: { imei, deviceTag: { secret } } })],
    [imei, payload({ deviceTag: "DOTHER99" })],
    [imei, payload({ device: [] })],
    [imei, payload({ device: {} })],
    [imei, payload({ device: "" })],
    [imei, payload({ device: { imei: Number(imei), deviceTag: tag } })],
    [imei, payload({ valid: "true" })],
    [imei, { valid: true, device: null, deviceTag: "DOTHER99" }],
    [imei, { valid: true, device: null, customer: { id: "4000005" } }],
    [imei, { valid: true, message: { secret } }],
    [imei, null],
    [imei, []],
  ];
  for (const [identifier, result] of cases) {
    const reader = client(async () => Response.json(result));
    await assert.rejects(reader.readPayJoyExtensionDevice(identifier), { code: "INVALID_RESPONSE" });
  }
});

test("distingue valid:true sin dispositivo y pide identificación manual sin inventar identidad ni reintentar", async () => {
  for (const identifier of [imei, tag]) {
    for (const result of [{ valid: true }, { valid: true, device: null }, { valid: true, message: `private=${secret}` }]) {
      let calls = 0;
      const reader = client(async () => { calls++; return Response.json(result); });
      await assert.rejects(reader.readPayJoyExtensionDevice(identifier), (error) => {
        assert.equal(error.code, "DEVICE_UNRESOLVED");
        assert.match(error.message, /Consultar por dispositivo.*Device Tag/);
        assert.doesNotMatch(error.message, /private=|test-server-key/);
        assert.equal(error.cause, undefined);
        return true;
      });
      assert.equal(calls, 1);
    }
  }
});

test("los campos opcionales ausentes o malformados quedan nulos sin fabricar deuda ni fechas", async () => {
  const reader = client(async () => Response.json(payload({
    customer: { id: { secret } },
    device: { imei, validThrough: "private" },
    financeOrder: { id: "bad?key=secret", remainingBalance: "", currency: "invalid" },
  })));
  assert.deepEqual(await reader.readPayJoyExtensionDevice(imei), {
    imei, deviceTag: null, customerId: null, financeOrderId: null, model: null,
    validThrough: null, remainingBalance: null, currency: null,
  });
});

test("conserva saldo cero y no expone mensajes remotos cuando PayJoy no encuentra el dispositivo", async () => {
  const paid = client(async () => Response.json(payload({ financeOrder: { remainingBalance: 0, currency: "COP" } })));
  assert.equal((await paid.readPayJoyExtensionDevice(imei)).remainingBalance, 0);
  const missing = client(async () => Response.json({ valid: false, message: `https://host/?key=${secret}` }));
  await assert.rejects(missing.readPayJoyExtensionDevice(imei), (error) => {
    assert.equal(error.code, "NOT_FOUND");
    assert.doesNotMatch(error.message, /https:|key=|test-server-key/);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("clasifica HTTP, JSON inválido y errores de red con mensajes seguros sin reintentos", async () => {
  const cases = [
    [401, "AUTH"], [403, "AUTH"], [404, "NOT_FOUND"], [408, "TIMEOUT"],
    [429, "RATE_LIMIT"], [500, "UNAVAILABLE"], [200, "INVALID_RESPONSE"],
  ];
  for (const [status, code] of cases) {
    let calls = 0;
    const reader = client(async () => {
      calls++;
      return new Response(`secret=${secret}`, { status });
    });
    await assert.rejects(reader.readPayJoyExtensionDevice(imei), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret|test-server-key/);
      return true;
    });
    assert.equal(calls, 1);
  }
  const reader = client(async () => { throw new Error(`fetch failed for https://host?key=${secret}`); });
  await assert.rejects(reader.readPayJoyExtensionDevice(imei), (error) => {
    assert.equal(error.code, "UNAVAILABLE");
    assert.doesNotMatch(error.message, /host|key=|test-server-key/);
    return true;
  });
});

test("un timeout leyendo el cuerpo se clasifica sin filtrar el error original", async () => {
  const reader = client(async () => ({
    ok: true,
    text: async () => { throw new DOMException(secret, "TimeoutError"); },
  }));
  await assert.rejects(reader.readPayJoyExtensionDevice(imei), { code: "TIMEOUT" });
});

test("sin clave configurada no hace llamadas y entrega CONFIG", async () => {
  let calls = 0;
  const reader = client(async () => { calls++; throw new Error("Network forbidden"); }, {});
  await assert.rejects(reader.readPayJoyExtensionDevice(imei), { code: "CONFIG" });
  assert.equal(calls, 0);
});
