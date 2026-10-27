import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/payjoy-extensions-provider.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", code)((id) => {
  assert.equal(id, "server-only");
  return {};
}, mod, mod.exports);
const provider = mod.exports;
const base = "https://extensions.payjoy.io/api/v1/extensions/";
const token = "server-only-test-token";
const tag = "DABC123";
const key = "conectamos-test-request-001";
// Offline fixtures only; no test reaches a PayJoy service.
const option = {
  extensionType: "customer_voluntary_long", minTime: 24, status: "eligible-from-provider",
  reasonsKey: "", uiReasonKeys: ["payday", "not connected to the internet"],
  uiReasons: "Recibo mi sueldo mañana#Sin conexión", extensionData: {
    extensionsRemaining: 2, extensionsMax: 3, extensionsNextAvailableDate: "2026-11-01T00:00:00Z",
    token: "DO_NOT_EXPOSE", customerEmail: "private@example.test",
  },
};
const response = (value, status = 200) => Response.json(value, { status });

async function withFetch(replies, work) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    if (!replies.length) throw new Error("Unexpected provider call; real network forbidden");
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply() : reply;
  };
  try { await work(calls); }
  finally { globalThis.fetch = previous; }
}

test("uses the observed auth, initiation and options contract and only returns safe fields", async () => {
  await withFetch([
    response({ token, refreshToken: "secret" }),
    response({ id: "request-001", currentValidThrough: "2026-10-28T16:00:00Z", token }),
    response({ options: [option], token }),
  ], async (calls) => {
    const result = await provider.beginPayJoyExtension(" dabc123 ", key);
    assert.equal(result.requestId, "request-001");
    assert.equal(result.currentValidThrough, "2026-10-28T16:00:00.000Z");
    assert.equal(result.options[0].id, "customer_voluntary_long:24");
    assert.equal(result.options[0].available, true);
    assert.deepEqual(result.options[0].reasons, [{ id: "payday", label: "Recibo mi sueldo mañana" }]);
    assert.deepEqual(result.options[0].details, { extensionsRemaining: 2, extensionsMax: 3, extensionsNextAvailableDate: "2026-11-01T00:00:00.000Z" });
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE|private@|server-only-test-token|refreshToken/);
    assert.deepEqual(calls.map(({ url }) => url), [base + "app-www-token/", base, base + "request-001/options/"]);
    assert.deepEqual(calls[0].body, { deviceTag: tag, sub: `${tag}@app.www`, channel: "APP-WWW" });
    assert.deepEqual(calls[1].body, { deviceTag: tag, channel: "APP-WWW", idempotencyKey: key, requesterEmail: `${tag}@app.www` });
    assert.equal(calls[0].init.headers.Authorization, undefined);
    for (const { init } of calls) {
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers["Accept-Language"], "es-CO");
      assert.ok(init.signal instanceof AbortSignal);
    }
    assert.equal(calls[1].init.headers.Authorization, `Bearer ${token}`);
  });
});

test("denied and country-unavailable options cannot be selected, and there are no synthetic offers", async () => {
  await withFetch([response({ token }), response({ options: [
    { ...option, status: "denied" },
    { ...option, extensionType: "align_to_salary_pay_date", reasonsKey: "Not available in this country" },
  ] })], async () => {
    const options = await provider.refreshPayJoyExtensionOptions(tag, "request-002");
    assert.equal(options.length, 2);
    assert.ok(options.every(({ available }) => !available));
  });
  await withFetch([response({ token }), response({ options: [] })], async () => {
    assert.deepEqual(await provider.refreshPayJoyExtensionOptions(tag, "request-002"), []);
  });
});

test("unknown malformed options or unpaired reasons fail closed", async () => {
  for (const bad of [
    { ...option, status: "" }, { ...option, minTime: "24" }, { ...option, minTime: 0 },
    { ...option, extensionType: "../../select" }, { ...option, uiReasons: "Solo una etiqueta" },
    { ...option, uiReasonKeys: ["payday", "payday"], uiReasons: "A#B" },
  ]) {
    await withFetch([response({ token }), ...Array.from({ length: 3 }, () => response({ options: [bad] }))], async (calls) => {
      await assert.rejects(provider.refreshPayJoyExtensionOptions(tag, "request-003"), { code: "INVALID_RESPONSE", ambiguous: false, stage: "options" });
      assert.equal(calls.length, 4);
    });
  }
});

test("duplicate option identities are rejected", async () => {
  await withFetch([response({ token }), ...Array.from({ length: 3 }, () => response({ options: [option, option] }))], async () => {
    await assert.rejects(provider.refreshPayJoyExtensionOptions(tag, "request-004"), { code: "INVALID_RESPONSE", stage: "options" });
  });
});

test("invalid identifiers never issue a network call", async () => {
  await withFetch([], async (calls) => {
    await assert.rejects(provider.beginPayJoyExtension("123456789012345", key), { code: "INVALID_INPUT" });
    await assert.rejects(provider.beginPayJoyExtension(tag, "bad key"), { code: "INVALID_INPUT" });
    await assert.rejects(provider.refreshPayJoyExtensionOptions(tag, "../select/"), { code: "INVALID_RESPONSE" });
    await assert.rejects(provider.selectPayJoyExtension(tag, "request-004", key, {
      extensionTime: 24, reason: "payday",
    }), { code: "INVALID_INPUT" });
    assert.equal(calls.length, 0);
  });
});

test("selection sends exact observed body and requires success plus GRANTED and effective date", async () => {
  await withFetch([response({ token }), response({ success: true, status: "GRANTED", newValidThrough: "2026-10-30T14:00:00Z", token, extra: "private" })], async (calls) => {
    const result = await provider.selectPayJoyExtension(tag, "request-005", key, {
      extensionType: "customer_voluntary_long", extensionTime: 24, reason: "payday",
    });
    assert.deepEqual(result, { success: true, status: "GRANTED", newValidThrough: "2026-10-30T14:00:00.000Z" });
    assert.equal(calls[1].url, base + "request-005/select/");
    assert.deepEqual(calls[1].body, { idempotencyKey: key, extension_reason: "payday", extension_type: "customer_voluntary_long", extension_time: 24 });
    assert.equal(calls.length, 2);
  });
});

test("selection never retries on transport failure, 5xx, or uncertain response", async () => {
  for (const reply of [new Error("URL with credential secret"), response({ message: "secret" }, 500),
    response({ success: true, status: "GRANTED" }), response({ success: false, status: "PENDING" }),
    new Response("broken json"), response({ success: "true", status: "GRANTED", newValidThrough: "2026-10-30T14:00:00Z" })]) {
    await withFetch([response({ token }), reply], async (calls) => {
      await assert.rejects(provider.selectPayJoyExtension(tag, "request-006", key, {
        extensionType: "customer_voluntary_long", extensionTime: 24, reason: "payday",
      }), (error) => {
        assert.equal(error.ambiguous, true);
        assert.equal(error.stage, "select");
        assert.doesNotMatch(error.message, /secret|credential|URL/);
        return true;
      });
      assert.equal(calls.length, 2);
    });
  }
});

test("auth failures before selection are safe and never replay the write", async () => {
  await withFetch([response({ message: "token secret" }, 403)], async (calls) => {
    await assert.rejects(provider.selectPayJoyExtension(tag, "request-007", key, {
      extensionType: "customer_voluntary_long", extensionTime: 24, reason: "payday",
    }), { code: "AUTH", ambiguous: false, stage: "authenticate" });
    assert.equal(calls.length, 1);
  });
});

test("begin recovers from an invalid first options read without repeating authentication or creation", async () => {
  await withFetch([
    response({ token }), response({ id: "request-retry", currentValidThrough: "2026-10-28T16:00:00Z" }),
    response({ options: null }), response({ options: [option] }),
  ], async (calls) => {
    const result = await provider.beginPayJoyExtension(tag, key);
    assert.equal(result.requestId, "request-retry");
    assert.equal(result.options.length, 1);
    assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [
      [base + "app-www-token/", "POST"], [base, "POST"],
      [base + "request-retry/options/", "GET"], [base + "request-retry/options/", "GET"],
    ]);
    assert.equal(calls[2].init.headers.Authorization, calls[3].init.headers.Authorization);
  });
});

test("options reads stop after exactly three transient failures", async () => {
  await withFetch([
    response({ token }), response({ id: "request-retry" }),
    ...Array.from({ length: 3 }, () => response({ options: null })),
  ], async (calls) => {
    await assert.rejects(provider.beginPayJoyExtension(tag, key), { code: "INVALID_RESPONSE", stage: "options", ambiguous: false });
    assert.equal(calls.length, 5);
    assert.equal(calls.filter(({ init }) => init.method === "GET").length, 3);
  });
});

test("refresh retries only the same options GET on invalid, unavailable and timeout responses", async () => {
  for (const transient of [response({ options: null }), response({}, 503), response({}, 408), new Error("network secret")]) {
    await withFetch([response({ token }), transient, response({ options: [option] })], async (calls) => {
      const result = await provider.refreshPayJoyExtensionOptions(tag, "request-refresh");
      assert.equal(result.length, 1);
      assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [
        [base + "app-www-token/", "POST"],
        [base + "request-refresh/options/", "GET"], [base + "request-refresh/options/", "GET"],
      ]);
    });
  }
});

test("options auth, missing, rejected and rate-limit responses are never retried", async () => {
  for (const [status, code] of [[401, "AUTH"], [403, "AUTH"], [404, "NOT_FOUND"], [422, "REJECTED"], [429, "RATE_LIMIT"]]) {
    await withFetch([response({ token }), response({ error: "sensitive" }, status)], async (calls) => {
      await assert.rejects(provider.refreshPayJoyExtensionOptions(tag, "request-stop"), { code, stage: "options", ambiguous: false });
      assert.equal(calls.length, 2);
    });
  }
});

test("authentication failures are diagnosed without retrying the token request", async () => {
  for (const reply of [response({ token: "bad" }), response({}, 503), new Response("bad JSON")]) {
    await withFetch([reply], async (calls) => {
      await assert.rejects(provider.beginPayJoyExtension(tag, key), (error) => {
        assert.equal(error.stage, "authenticate");
        assert.equal(error.ambiguous, false);
        assert.doesNotMatch(JSON.stringify(error), /bad JSON|deviceTag|DABC123|server-only-test-token/);
        return true;
      });
      assert.equal(calls.length, 1);
    });
  }
});

test("creation failures and invalid creation fields are diagnosed without replaying POST", async () => {
  for (const reply of [response({}, 503), response({ id: null }),
    response({ id: "request-created", currentValidThrough: "invalid-date" }), new Response("broken")]) {
    await withFetch([response({ token }), reply], async (calls) => {
      await assert.rejects(provider.beginPayJoyExtension(tag, key), (error) => {
        assert.equal(error.stage, "prepare");
        assert.equal(error.ambiguous, false);
        return true;
      });
      assert.deepEqual(calls.map(({ url }) => url), [base + "app-www-token/", base]);
    });
  }
});

test("explicit HTTP 4xx rejection is distinguished from an ambiguous write", async () => {
  await withFetch([response({ token }), response({ error: "private" }, 422)], async (calls) => {
    await assert.rejects(provider.selectPayJoyExtension(tag, "request-008", key, {
      extensionType: "customer_voluntary_long", extensionTime: 24, reason: "payday",
    }), { code: "REJECTED", ambiguous: false });
    assert.equal(calls.length, 2);
  });
});

test("a rate limited selection is uncertain and is not retried", async () => {
  await withFetch([response({ token }), response({}, 429)], async (calls) => {
    await assert.rejects(provider.selectPayJoyExtension(tag, "request-009", key, {
      extensionType: "customer_voluntary_long", extensionTime: 24, reason: "payday",
    }), { code: "RATE_LIMIT", status: 429, ambiguous: true });
    assert.equal(calls.length, 2);
  });
});

test("an HTTP conflict during selection cannot be mistaken for a safe retry", async () => {
  await withFetch([response({ token }), response({ error: "idempotency conflict" }, 409)], async (calls) => {
    await assert.rejects(provider.selectPayJoyExtension(tag, "request-010", key, {
      extensionType: "customer_voluntary_long", extensionTime: 24, reason: "payday",
    }), { code: "REJECTED", ambiguous: true });
    assert.equal(calls.length, 2);
  });
});
