import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/invoice-reminder-transport.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const credential = "synthetic-secret-key-for-transport-tests";
const endpoint = `https://api.dapta.ai/api/qa/invoice-reminders?x-api-key=${credential}`;
const recipient = "573000000000";
const deliveryId = "92eb027f-70e9-45d7-8965-9dc0be84572b";
const authorizationToken = "6d4b5b6c-22ef-40db-a6b7-f48fcc6c6cc2";
const messageId = "wamid.U0lOVEVUSUNPX1FBX09OTFk=";
const environment = (extra = {}) => ({ INVOICE_REMINDERS_ENABLED: "1", INVOICE_REMINDER_TEMPLATE_APPROVED: "1", INVOICE_REMINDER_DAPTA_URL: endpoint, INVOICE_REMINDER_WHATSAPP_TO: recipient, ...extra });
const payload = (extra = {}) => ({ invoiceId: 123, number: "FACTURA-SINTETICA", provider: "Proveedor reservado QA", dueDate: "2026-11-16", balance: 1250000.25, recipient, deliveryId, authorizationToken, ...extra });
const receipt = (extra = {}, status = 200) => new Response(JSON.stringify({ accepted: true, deliveryId, messageId, ...extra }), { status, headers: { "Content-Type": "application/json" } });

function adapter({ env = {}, fetcher = async () => { throw Error("Unexpected default network access"); } } = {}) {
  const mod = { exports: {} }, timers = new Map(); let nextTimer = 0;
  const setTimeout = (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  new Function("require", "module", "exports", "process", "fetch", "setTimeout", "clearTimeout", code)(
    (name) => { throw Error(`Unexpected transport dependency: ${name}`); }, mod, mod.exports, { env }, fetcher, setTimeout, clearTimeout,
  );
  return { ...mod.exports, timers, expire: () => [...timers.values()].forEach((timer) => timer.callback()) };
}

function assertFailure(error, mod, code, uncertain) {
  assert.ok(error instanceof mod.InvoiceReminderTransportError);
  assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.retryable, false); assert.equal(error.uncertain, uncertain);
  const rendered = `${String(error)} ${error.stack} ${JSON.stringify(error)}`;
  assert.doesNotMatch(rendered, /synthetic-secret-key|x-api-key|Proveedor reservado|FACTURA-SINTETICA/);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
}

test("configuration requires an approved template, Dapta URL and a Colombian mobile destination; enable flag stays independent", () => {
  const mod = adapter();
  assert.deepEqual(mod.getInvoiceReminderConfig(environment()), { enabled: true, configured: true, recipient, sendHour: 10, timeZone: "America/Bogota" });
  for (const local of ["3000000000", "573000000000", "+573000000000", "  +573000000000  "]) assert.equal(mod.getInvoiceReminderConfig(environment({ INVOICE_REMINDER_WHATSAPP_TO: local })).recipient, recipient);
  for (const invalid of [undefined, "", "+14150000000", "5710000000", "57300000000", "5730000000000", "300 000 0000", "recipient@example.test", "++573000000000"]) {
    const config = mod.getInvoiceReminderConfig(environment({ INVOICE_REMINDER_WHATSAPP_TO: invalid })); assert.equal(config.configured, false); assert.equal(config.recipient, null);
  }
  for (const unapproved of [undefined, "", "0", "true", "approved"]) assert.equal(mod.getInvoiceReminderConfig(environment({ INVOICE_REMINDER_TEMPLATE_APPROVED: unapproved })).configured, false);
  for (const disabled of [undefined, "", "0", "true"]) assert.equal(mod.getInvoiceReminderConfig(environment({ INVOICE_REMINDERS_ENABLED: disabled })).enabled, false);
  assert.doesNotMatch(JSON.stringify(mod.getInvoiceReminderConfig(environment())), /x-api-key|synthetic-secret-key|api\.dapta/);
});

test("only the HTTPS Dapta host and a single credential query are configurable", () => {
  const mod = adapter();
  const invalid = [
    "", "not-a-url", `http://api.dapta.ai/api/flow?x-api-key=${credential}`,
    `https://api.dapta.ai.evil.test/api/flow?x-api-key=${credential}`, `https://evil.test/api/flow?x-api-key=${credential}`,
    `https://127.0.0.1/api/flow?x-api-key=${credential}`, `https://169.254.169.254/api/flow?x-api-key=${credential}`,
    `https://[::1]/api/flow?x-api-key=${credential}`, `https://api.dapta.ai@evil.test/api/flow?x-api-key=${credential}`,
    `https://user:password@api.dapta.ai/api/flow?x-api-key=${credential}`, `https://api.dapta.ai:8443/api/flow?x-api-key=${credential}`,
    `https://api.dapta.ai/flow?x-api-key=${credential}`, `https://api.dapta.ai/api/flow#x-api-key=${credential}`,
    `https://api.dapta.ai/api/flow?x-api-key=${credential}#fragment`, `https://api.dapta.ai/api/flow?x-api-key=${credential}&redirect=https://evil.test`,
    `https://api.dapta.ai/api/flow?x-api-key=${credential}&x-api-key=${credential}`, "https://api.dapta.ai/api/flow?x-api-key=short",
    `https://api.dapta.ai/api/flow?api_key=${credential}`, `https://api.dapta.ai/api/%2e%2e/secret?x-api-key=${credential}`,
    `file:///api/flow?x-api-key=${credential}`, `https://api.dapta.ai./api/flow?x-api-key=${credential}`,
  ];
  for (const url of invalid) assert.equal(mod.getInvoiceReminderConfig(environment({ INVOICE_REMINDER_DAPTA_URL: url })).configured, false, `Rejected URL ${url.split("?")[0]}`);
});

test("unconfigured transports never dispatch or fall back to SMTP or email", async () => {
  const mod = adapter(); let calls = 0;
  const fetcher = async () => { calls++; return receipt(); };
  const mailEnvironment = { SMTP_HOST: "smtp.example.test", SMTP_USER: "qa", SMTP_PASS: "mail-secret", EMAIL_TO: "qa@example.test" };
  for (const extra of [{ INVOICE_REMINDERS_ENABLED: "0" }, { INVOICE_REMINDER_TEMPLATE_APPROVED: "0" }, { INVOICE_REMINDER_DAPTA_URL: "https://evil.test/" }, { INVOICE_REMINDER_WHATSAPP_TO: "invalid" }]) {
    await assert.rejects(mod.createInvoiceReminderSender({ env: environment({ ...mailEnvironment, ...extra }), fetcher })(payload()), (error) => assertFailure(error, mod, "NOT_CONFIGURED", false));
  }
  assert.equal(calls, 0);
});

test("dispatch posts only delivery and authorization IDs with redirects disabled and accepts a matching WhatsApp receipt", async () => {
  const mod = adapter(), calls = [];
  const send = mod.createInvoiceReminderSender({ env: environment(), fetcher: async (...args) => { calls.push(args); return receipt(); } });
  assert.deepEqual(await send(payload({ unexpected: "must-not-be-forwarded" })), { messageId });
  assert.equal(calls.length, 1); const [url, request] = calls[0];
  assert.equal(url, endpoint); assert.equal(request.method, "POST"); assert.equal(request.redirect, "error"); assert.equal(request.cache, "no-store"); assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(request.headers, { "Content-Type": "application/json", Accept: "application/json" });
  assert.deepEqual(JSON.parse(request.body), { delivery_id: deliveryId, authorization_token: authorizationToken });
  assert.doesNotMatch(request.body, /recipient|573000|balance|1250000|FACTURA|Proveedor|unexpected|dueDate|invoiceId/);
  assert.equal(mod.timers.size, 0);
});

test("mismatched recipient and invalid version-four UUIDs are rejected before any fetch", async () => {
  const mod = adapter(); let calls = 0;
  const send = mod.createInvoiceReminderSender({ env: environment(), fetcher: async () => { calls++; return receipt(); } });
  for (const other of ["573000000001", "+573000000000", "3000000000", "qa@example.test", ""]) await assert.rejects(send(payload({ recipient: other })), (error) => assertFailure(error, mod, "NOT_CONFIGURED", false));
  for (const key of ["deliveryId", "authorizationToken"]) for (const value of ["", "not-a-uuid", "92eb027f-70e9-15d7-8965-9dc0be84572b", "92eb027f-70e9-45d7-0965-9dc0be84572b", `${deliveryId}extra`, null]) {
    await assert.rejects(send(payload({ [key]: value })), (error) => assertFailure(error, mod, "INVALID_AUTHORIZATION", false));
  }
  assert.equal(calls, 0); assert.equal(mod.timers.size, 0);
});

test("HTTP success without accepted=true, the delivery ID and a WhatsApp message ID stays uncertain and is never retried", async () => {
  const invalid = [null, {}, { accepted: false, deliveryId, messageId }, { accepted: "true", deliveryId, messageId }, { accepted: true, deliveryId: authorizationToken, messageId }, { accepted: true, messageId }, { accepted: true, deliveryId }, { accepted: true, deliveryId, messageId: "sent" }, { accepted: true, deliveryId, messageId: "wamid.short" }, { accepted: true, deliveryId, messageId: `wamid.${"A".repeat(501)}` }, { accepted: true, deliveryId, messageId: "wamid.BAD ID HERE" }, { status: "ok", success: true, deliveryId, messageId }];
  for (const body of invalid) {
    const mod = adapter(); let calls = 0;
    const send = mod.createInvoiceReminderSender({ env: environment(), fetcher: async () => { calls++; return new Response(JSON.stringify(body), { status: 200 }); } });
    await assert.rejects(send(payload()), (error) => assertFailure(error, mod, "INVALID_RECEIPT", true)); assert.equal(calls, 1); assert.equal(mod.timers.size, 0);
  }
});

test("gateway errors, redirects and raw network failures are uncertain without retry or credential disclosure", async () => {
  for (const outcome of [301, 302, 400, 401, 403, 408, 429, 500, 502, "network", "redirect"]) {
    const mod = adapter(); let calls = 0;
    const send = mod.createInvoiceReminderSender({ env: environment(), fetcher: async () => {
      calls++;
      if (typeof outcome === "string") throw Error(`${outcome}: ${endpoint} ${payload().provider}`);
      return new Response(`HTTP body with ${credential}`, { status: outcome, headers: { Location: "https://evil.test" } });
    } });
    await assert.rejects(send(payload()), (error) => assertFailure(error, mod, "PROVIDER_RESPONSE_UNCERTAIN", true)); assert.equal(calls, 1); assert.equal(mod.timers.size, 0);
  }
});

test("empty, non-JSON and missing-body receipts are uncertain without a second dispatch", async () => {
  for (const response of [new Response(""), new Response("not-json"), { ok: true, body: null }]) {
    const mod = adapter(); let calls = 0;
    await assert.rejects(mod.createInvoiceReminderSender({ env: environment(), fetcher: async () => { calls++; return response; } })(payload()), (error) => {
      assert.ok(["INVALID_RECEIPT", "PROVIDER_RESPONSE_UNCERTAIN"].includes(error.code)); return assertFailure(error, mod, error.code, true);
    }); assert.equal(calls, 1); assert.equal(mod.timers.size, 0);
  }
});

test("response size is capped across chunks, cancels oversized input and accepts a receipt within the cap", async () => {
  for (const sizes of [[16385], [8192, 8193]]) {
    const mod = adapter(); let cancelled = false, released = false, calls = 0, index = 0;
    const response = { ok: true, body: { getReader: () => ({ read: async () => index < sizes.length ? { done: false, value: new Uint8Array(sizes[index++]) } : { done: true }, cancel: async () => { cancelled = true; }, releaseLock: () => { released = true; } }) } };
    await assert.rejects(mod.createInvoiceReminderSender({ env: environment(), fetcher: async () => { calls++; return response; } })(payload()), (error) => assertFailure(error, mod, "INVALID_RECEIPT", true));
    assert.equal(calls, 1); assert.equal(cancelled, true); assert.equal(released, true); assert.equal(mod.timers.size, 0);
  }
  const mod = adapter();
  const text = JSON.stringify({ accepted: true, deliveryId, messageId }).padEnd(16384, " ");
  assert.deepEqual(await mod.createInvoiceReminderSender({ env: environment(), fetcher: async () => new Response(text) })(payload()), { messageId });
});

test("dispatch timeout aborts the request and stays uncertain without an automatic retry", async () => {
  const mod = adapter(); let calls = 0, signal;
  const send = mod.createInvoiceReminderSender({ env: environment(), fetcher: async (_url, options) => {
    calls++; signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Error(`Timeout calling ${endpoint}`)), { once: true }));
  } });
  const work = send(payload());
  const deadline = [...mod.timers.values()][0].ms;
  assert.ok(deadline >= 45000 && deadline <= 60000, "El cliente espera el límite de 45 segundos del flujo sin quedar bloqueado indefinidamente");
  mod.expire();
  await assert.rejects(work, (error) => assertFailure(error, mod, "PROVIDER_RESPONSE_UNCERTAIN", true));
  assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(mod.timers.size, 0);
});
