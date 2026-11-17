import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { modules, admin } from "./invoice-payments-test-helpers.mjs";

const migration = readFileSync(new URL("../scripts/apply-cierre-schema.sql", import.meta.url), "utf8");
const recipient = "573000000001";
const config = { enabled: true, configured: true, recipient, sendHour: 10, timeZone: "America/Bogota" };
const receipt = { messageId: "wamid.SYNTHETIC_QA_001" };
const hash = (value) => createHash("sha256").update(value).digest("hex");
function adapter(pg, calls = []) {
  const sql = (parts) => parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
  const convert = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value && ["dueDate", "leaseUntil", "dispatchClaimedAt", "deletedAt", "lastSentAt"].includes(key) && !(value instanceof Date) ? new Date(value) : value]));
  return {
    $queryRaw: async (parts, ...values) => { calls.push(sql(parts)); return (await pg.query(sql(parts), values)).rows.map(convert); },
    $executeRaw: async (parts, ...values) => { calls.push(sql(parts)); return (await pg.query(sql(parts), values)).affectedRows; },
    $transaction: (callback) => pg.transaction((tx) => callback(adapter(tx, calls))),
  };
}
async function setup(options = {}) {
  const pg = new PGlite();
  await pg.exec('CREATE TABLE "Venta" (id INTEGER PRIMARY KEY); CREATE TABLE "RegistroVendedorVenta" (id INTEGER PRIMARY KEY, "ventaIdRelacionada" INTEGER);');
  await pg.exec(migration);
  const calls = [];
  const db = adapter(pg, calls);
  const transport = modules({}).load("lib/invoice-reminder-transport.ts");
  let clock = new Date(options.at || "2026-11-16T15:00:00Z");
  let settings = { ...config, ...options.config };
  let sendCount = 0;
  let service;
  const deps = { db, now: () => new Date(clock), config: () => ({ ...settings }), send: async (payload) => {
    sendCount += 1;
    if (options.send) return options.send(payload, service, pg, transport);
    const allowed = await service.authorize({ deliveryId: payload.deliveryId, token: payload.authorizationToken });
    assert.equal(allowed.allowed, true);
    return receipt;
  } };
  const loader = modules(db, { session: options.session === undefined ? admin : options.session,
    mocks: { "@/lib/invoice-reminder-transport": { ...transport, getInvoiceReminderConfig: deps.config, sendInvoiceReminderWhatsApp: deps.send } } });
  service = loader.load("lib/invoice-reminders.ts").createInvoiceReminderService(deps);
  return { pg, db, calls, service, loader, transport, sent: () => sendCount,
    setTime: (value) => { clock = new Date(value); }, setConfig: (value) => { settings = { ...settings, ...value }; } };
}
async function invoice(pg, id, overrides = {}) {
  const data = { dueDate: "2026-11-16", amount: "100.29", paidAmount: "10.10", status: "PENDIENTE", deletedAt: null, ...overrides };
  await pg.query(`INSERT INTO "FacturaAdministrativa" ("id","number","numberNormalized","provider","providerNormalized","date","dueDate","amount","paidAmount","status","deletedAt","createRequestId","createRequestHash","createdById","createdBy")
    VALUES ($1,$2,$2,'Proveedor QA','PROVEEDOR QA','2026-10-01',$3,$4,$5,$6,$7,$8,'qa',7,'Administrador QA')`,
  [id, `QA-${id}`, data.dueDate, data.amount, data.paidAmount, data.status, data.deletedAt, `seed-${id}`]);
}
async function delivery(pg, invoiceId, overrides = {}) {
  const row = { id: randomUUID(), state: "PROCESSING", dueDate: "2026-11-16", recipient,
    token: randomUUID(), leaseUntil: "2026-11-16T15:02:00Z", dispatchClaimedAt: null, attempts: 1, ...overrides };
  await pg.query(`INSERT INTO "InvoiceReminderDelivery" ("id","invoiceId","dueDate","recipientHash","recipient","state","attempts","leaseToken","leaseUntil","dispatchClaimedAt","nextAttempt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2026-11-16T15:00:00Z')`,
  [row.id, invoiceId, row.dueDate, hash(row.recipient), row.recipient, row.state, row.attempts, row.token, row.leaseUntil, row.dispatchClaimedAt]);
  return row;
}
const jobs = async (pg) => (await pg.query('SELECT * FROM "InvoiceReminderDelivery" ORDER BY "invoiceId"')).rows;

test("cola de hoy desde las 10:00 Bogotá envía saldo exacto una vez y conserva snapshot/recibo sin credenciales", async () => {
  const x = await setup();
  try {
    await invoice(x.pg, 1); await invoice(x.pg, 2, { dueDate: "2026-11-15" }); await invoice(x.pg, 3, { dueDate: "2026-11-17" });
    await invoice(x.pg, 4, { dueDate: null }); await invoice(x.pg, 5, { paidAmount: "100.29", status: "PAGADA" }); await invoice(x.pg, 6, { deletedAt: new Date() });
    const first = await x.service.runBatch();
    assert.equal(first.enqueued, 1); assert.equal(first.sent, 1); assert.equal(x.sent(), 1);
    const [row] = await jobs(x.pg); assert.equal(row.state, "SENT"); assert.equal(row.providerMessageId, receipt.messageId);
    assert.equal(row.payloadSnapshot.balance, 90.19); assert.equal(row.payloadSnapshot.dueDate, "2026-11-16");
    assert.equal(row.payloadSnapshot.recipient, undefined); assert.equal(row.payloadSnapshot.authorizationToken, undefined);
    assert.equal((await x.service.runBatch()).processed, 0); assert.equal(x.sent(), 1);
    const status = await x.service.status(admin); assert.equal(status.pending, 0); assert.equal(status.failed, 0); assert.equal(status.uncertain, 0); assert.ok(status.lastSentAt);
    assert.equal(status.hour, 10); assert.equal(status.timeZone, "America/Bogota");
    await x.pg.exec(migration); assert.equal((await jobs(x.pg)).length, 1);
  } finally { await x.pg.close(); }
});

test("horario y configuración bloquean envíos antes de las 10:00, apagado o sin plantilla/flujo configurados", async () => {
  const x = await setup({ at: "2026-11-16T14:59:59Z" });
  try {
    await invoice(x.pg, 1);
    assert.equal((await x.service.runBatch()).enqueued, 0);
    x.setTime("2026-11-16T15:00:00Z"); x.setConfig({ enabled: false }); assert.equal((await x.service.runBatch()).processed, 0);
    x.setConfig({ enabled: true, configured: false }); assert.equal((await x.service.runBatch()).processed, 0);
    x.setConfig({ configured: true }); assert.equal((await x.service.runBatch()).sent, 1); assert.equal(x.sent(), 1);
  } finally { await x.pg.close(); }
});

test("09:59:59 Bogotá no permite dispatch ni consume token; exactamente a las 10:00 autoriza con la misma fecha", async () => {
  const x = await setup({ at: "2026-11-16T14:59:59Z" });
  try {
    await invoice(x.pg, 1); const row = await delivery(x.pg, 1);
    const denied = await x.service.authorize({ deliveryId: row.id, token: row.token });
    assert.equal(denied.allowed, false); assert.equal((await jobs(x.pg))[0].dispatchClaimedAt, null);
    x.setTime("2026-11-16T15:00:00Z");
    const allowed = await x.service.authorize({ deliveryId: row.id, token: row.token });
    assert.equal(allowed.allowed, true); assert.equal(allowed.dueDate, "2026-11-16");
  } finally { await x.pg.close(); }
});

test("fecha de activación futura bloquea cola y dispatch; el día inicial desde las 10:00 sí permite enviar", async () => {
  const x = await setup({ config: { startDate: "2026-11-17" } });
  try {
    await invoice(x.pg, 1); await invoice(x.pg, 2, { dueDate: "2026-11-17" });
    const todayJob = await delivery(x.pg, 1);
    assert.equal((await x.service.authorize({ deliveryId: todayJob.id, token: todayJob.token })).allowed, false);
    assert.equal((await x.service.runBatch()).enqueued, 0); assert.equal(x.sent(), 0);
    x.setTime("2026-11-17T14:59:59Z"); assert.equal((await x.service.runBatch()).sent, 0);
    x.setTime("2026-11-17T15:00:00Z"); assert.equal((await x.service.runBatch()).sent, 1); assert.equal(x.sent(), 1);
    assert.equal((await jobs(x.pg)).find((row) => row.invoiceId === 1).state, "UNKNOWN");
  } finally { await x.pg.close(); }
});

test("dos workers reclaman una sola entrega mediante compare-and-set SQL, sin duplicados", async () => {
  const x = await setup();
  try {
    await invoice(x.pg, 1);
    const result = await Promise.all([x.service.runBatch(), x.service.runBatch()]);
    assert.equal(result.reduce((total, item) => total + item.sent, 0), 1); assert.equal(x.sent(), 1);
    assert.equal((await jobs(x.pg)).length, 1); assert.ok(x.calls.some((sql) => sql.includes("FOR UPDATE SKIP LOCKED")));
  } finally { await x.pg.close(); }
});

test("dispatch es de un solo uso y rechaza token incorrecto, vencido, UNKNOWN, otro destinatario y horario", async () => {
  const x = await setup();
  try {
    await invoice(x.pg, 1); const row = await delivery(x.pg, 1);
    assert.equal((await x.service.authorize({ deliveryId: row.id, token: randomUUID() })).allowed, false);
    const allowed = await x.service.authorize({ deliveryId: row.id, token: row.token });
    assert.equal(allowed.allowed, true); assert.equal(allowed.balance, 90.19); assert.equal(allowed.recipient, recipient);
    assert.deepEqual(await x.service.authorize({ deliveryId: row.id, token: row.token }), { allowed: false, code: "DISPATCH_NOT_ALLOWED" });
    for (const [id, changes] of [[2, { leaseUntil: "2026-11-16T14:59:59Z" }], [3, { state: "UNKNOWN" }], [4, { recipient: "573000000002" }]]) {
      await invoice(x.pg, id); const item = await delivery(x.pg, id, changes);
      assert.equal((await x.service.authorize({ deliveryId: item.id, token: item.token })).allowed, false);
    }
    await invoice(x.pg, 5); const late = await delivery(x.pg, 5, { leaseUntil: "2026-11-17T15:00:00Z" });
    x.setTime("2026-11-17T05:00:00Z"); assert.equal((await x.service.authorize({ deliveryId: late.id, token: late.token })).allowed, false);
    x.setTime("2026-11-16T14:59:59Z"); assert.equal((await x.service.authorize({ deliveryId: late.id, token: late.token })).allowed, false);
  } finally { await x.pg.close(); }
});

test("dos autorizaciones simultáneas sólo entregan datos una vez y el token de un retry no autoriza el intento anterior", async () => {
  const x = await setup();
  try {
    await invoice(x.pg, 1); const row = await delivery(x.pg, 1);
    const results = await Promise.all([x.service.authorize({ deliveryId: row.id, token: row.token }), x.service.authorize({ deliveryId: row.id, token: row.token })]);
    assert.equal(results.filter((result) => result.allowed).length, 1);
    assert.deepEqual(results.find((result) => !result.allowed), { allowed: false, code: "DISPATCH_NOT_ALLOWED" });
    const nextToken = randomUUID();
    await x.pg.query('UPDATE "InvoiceReminderDelivery" SET "leaseToken"=$1,"dispatchClaimedAt"=NULL WHERE "id"=$2', [nextToken, row.id]);
    assert.equal((await x.service.authorize({ deliveryId: row.id, token: row.token })).allowed, false);
    assert.equal((await x.service.authorize({ deliveryId: row.id, token: nextToken })).allowed, true);
  } finally { await x.pg.close(); }
});

test("revalidación dispatch respeta abonos recientes y cancela pagadas, eliminadas o vencimiento editado", async () => {
  const x = await setup();
  try {
    for (let id = 1; id <= 4; id += 1) await invoice(x.pg, id);
    const rows = []; for (let id = 1; id <= 4; id += 1) rows.push(await delivery(x.pg, id));
    await x.pg.exec(`UPDATE "FacturaAdministrativa" SET "paidAmount"=40.20 WHERE id=1;
      UPDATE "FacturaAdministrativa" SET "paidAmount"="amount","status"='PAGADA' WHERE id=2;
      UPDATE "FacturaAdministrativa" SET "deletedAt"=CURRENT_TIMESTAMP WHERE id=3;
      UPDATE "FacturaAdministrativa" SET "dueDate"='2026-11-17' WHERE id=4;`);
    assert.equal((await x.service.authorize({ deliveryId: rows[0].id, token: rows[0].token })).balance, 60.09);
    for (const row of rows.slice(1)) assert.equal((await x.service.authorize({ deliveryId: row.id, token: row.token })).allowed, false);
    assert.deepEqual((await jobs(x.pg)).slice(1).map((row) => row.state), ["CANCELLED", "CANCELLED", "CANCELLED"]);
  } finally { await x.pg.close(); }
});

test("crash con lease vencido queda UNKNOWN sin reenviar, incluso durante siguientes días", async () => {
  const x = await setup();
  try {
    await invoice(x.pg, 1); await delivery(x.pg, 1, { leaseUntil: "2026-11-16T14:59:59Z" });
    assert.equal((await x.service.status(admin)).uncertain, 1);
    await x.service.runBatch(); assert.equal((await jobs(x.pg))[0].state, "UNKNOWN"); assert.equal(x.sent(), 0);
    x.setTime("2026-11-17T15:00:00Z"); await x.service.runBatch(); assert.equal(x.sent(), 0); assert.equal((await jobs(x.pg))[0].state, "UNKNOWN");
  } finally { await x.pg.close(); }
});

test("fallo seguro transitorio reintenta con nuevo token; incierto no reintenta y error permanente queda FAILED", async () => {
  for (const kind of ["retry", "uncertain", "permanent"]) {
    let count = 0;
    const x = await setup({ send: async (payload, service, _pg, transport) => {
      count += 1;
      if (count === 1) throw new transport.InvoiceReminderTransportError("PROVIDER_REJECTED", kind === "retry", kind === "uncertain");
      assert.equal((await service.authorize({ deliveryId: payload.deliveryId, token: payload.authorizationToken })).allowed, true);
      return receipt;
    } });
    try {
      await invoice(x.pg, 1); await x.service.runBatch();
      const first = (await jobs(x.pg))[0]; assert.equal(first.state, kind === "retry" ? "RETRY" : kind === "uncertain" ? "UNKNOWN" : "FAILED");
      x.setTime("2026-11-16T15:05:00Z"); await x.service.runBatch();
      assert.equal(x.sent(), kind === "retry" ? 2 : 1);
      if (kind === "retry") { const last = (await jobs(x.pg))[0]; assert.equal(last.state, "SENT"); assert.notEqual(last.leaseToken, first.leaseToken); }
    } finally { await x.pg.close(); }
  }
});

test("sin autorización de dispatch, sin recibo verificable o excepción cruda nunca se registra SENT", async () => {
  for (const mode of ["no-dispatch", "no-receipt", "raw-error"]) {
    const x = await setup({ send: async (payload, service) => {
      if (mode === "no-dispatch") return receipt;
      await service.authorize({ deliveryId: payload.deliveryId, token: payload.authorizationToken });
      if (mode === "raw-error") throw new Error("sensitive transport URL and credential");
      return { messageId: "not-a-provider-receipt" };
    } });
    try {
      await invoice(x.pg, 1); await x.service.runBatch();
      const [row] = await jobs(x.pg); assert.equal(row.state, "UNKNOWN"); assert.equal(row.sentAt, null);
      assert.equal(row.errorCode, "TRANSPORT_UNCERTAIN"); assert.equal(JSON.stringify(row).includes("credential"), false);
      await x.service.runBatch(); assert.equal(x.sent(), 1);
    } finally { await x.pg.close(); }
  }
});

test("pendientes/reintentos caducan al cambiar día o al pagar; cambio de destinatario cancela intentos previos", async () => {
  const x = await setup();
  try {
    await invoice(x.pg, 1); await invoice(x.pg, 2); await invoice(x.pg, 3);
    await delivery(x.pg, 1, { state: "RETRY", dueDate: "2026-11-15" });
    await delivery(x.pg, 2, { state: "PENDING" }); await delivery(x.pg, 3, { state: "PENDING", recipient: "573000000002" });
    await x.pg.exec('UPDATE "FacturaAdministrativa" SET "paidAmount"="amount","status"=\'PAGADA\' WHERE id=2;');
    await x.service.runBatch();
    const old = (await jobs(x.pg)).filter((row) => row.dueDate === "2026-11-15" || row.invoiceId === 2 || row.recipient !== recipient);
    assert.ok(old.every((row) => row.state === "CANCELLED"));
    assert.equal((await jobs(x.pg)).filter((row) => row.state === "SENT").length, 2);
  } finally { await x.pg.close(); }
});

test("estado solo administrador central consulta BD; endpoint dispatch limita JSON y no acepta datos de destino", async () => {
  const x = await setup();
  try {
    for (const session of [null, { ...admin, perfilTipo: "SUPERVISOR_TIENDA" }, { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }]) {
      const before = x.calls.length; await assert.rejects(x.service.status(session), (error) => error.status === (session ? 403 : 401)); assert.equal(x.calls.length, before);
      const loader = modules(x.db, { session });
      const response = await loader.load("app/api/pago-facturas/reminders/route.ts").GET(); assert.equal(response.status, session ? 403 : 401);
    }
    const loader = modules(x.db, { mocks: { "@/lib/invoice-reminders": { authorizeInvoiceReminderDispatch: x.service.authorize } } });
    const route = loader.load("app/api/pago-facturas/reminders/dispatch/route.ts");
    const request = (body) => new Request("https://conectamos.test/api/pago-facturas/reminders/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await route.POST(request({ deliveryId: randomUUID(), token: randomUUID(), recipient: "other" }))).status, 400);
    assert.equal((await route.POST(request({ deliveryId: "x".repeat(3000) }))).status, 413);
    const response = await route.POST(request({ deliveryId: randomUUID(), token: randomUUID() }));
    assert.deepEqual(await response.json(), { allowed: false, code: "DISPATCH_NOT_ALLOWED" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  } finally { await x.pg.close(); }
});
