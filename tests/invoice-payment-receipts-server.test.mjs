import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { modules, admin } from "./invoice-payments-test-helpers.mjs";

const migration = readFileSync(new URL("../scripts/apply-cierre-schema.sql", import.meta.url), "utf8");
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const receipt = (name = "Comprobante QA.pdf", bytes = pdf) => ({ name, bytes: Uint8Array.from(bytes), size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
const fields = new Set(["id", "paymentId", "invoiceId", "requestId", "requestHash", "filename", "size", "sha256", "bytes", "createdById", "createdByProfileId", "createdBy", "createdAt", "deletedAt"]);
function identifier(name) { assert.ok(fields.has(name), `Unexpected field: ${name}`); return `"${name}"`; }
function adapter(pg, calls) {
  const query = async (sql, values = []) => { calls.push(sql); try { return await pg.query(sql, values); } catch (error) {
    if (error.code === "23505") throw Object.assign(new Error("Unique constraint"), { code: "P2002", cause: error });
    throw error;
  } };
  const table = (name) => ({
    async findUnique({ where, select }) {
      const entries = Object.entries(where);
      const result = await query(`SELECT ${select ? Object.keys(select).filter(key => select[key]).map(identifier).join(",") : "*"} FROM "${name}" WHERE ${entries.map(([key], i) => `${identifier(key)}=$${i + 1}`).join(" AND ")}`, entries.map(([, value]) => value));
      return result.rows[0] ?? null;
    },
    async findFirst(args) { return this.findUnique(args); },
    async findUniqueOrThrow(args) { const row = await this.findUnique(args); if (!row) throw Object.assign(new Error("Missing record"), { code: "P2025" }); return row; },
    async create({ data, select }) {
      const entries = Object.entries(data);
      const result = await query(`INSERT INTO "${name}" (${entries.map(([key]) => identifier(key)).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")}) RETURNING ${Object.keys(select).filter(key => select[key]).map(identifier).join(",")}`, entries.map(([, value]) => value));
      return result.rows[0];
    },
  });
  return {
    invoicePaymentReceipt: table("InvoicePaymentReceipt"),
    pagoFacturaAdministrativa: table("PagoFacturaAdministrativa"),
    facturaAdministrativa: table("FacturaAdministrativa"),
    $queryRaw: async (parts, ...values) => (await query(parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""), values)).rows,
    $transaction: (callback) => pg.transaction(tx => callback(adapter(tx, calls))),
  };
}
async function setup() {
  const pg = new PGlite();
  await pg.exec('CREATE TABLE "Venta" (id INTEGER PRIMARY KEY); CREATE TABLE "RegistroVendedorVenta" (id INTEGER PRIMARY KEY, "ventaIdRelacionada" INTEGER);');
  await pg.exec(migration);
  const calls = []; const db = adapter(pg, calls);
  return { pg, db, calls, service: modules(db).load("lib/invoice-payment-receipts.ts") };
}
async function seed(pg, id = 1, paymentId = id) {
  await pg.query(`INSERT INTO "FacturaAdministrativa" ("id","number","numberNormalized","provider","providerNormalized","date","dueDate","amount","paidAmount","status","createRequestId","createRequestHash","createdById","createdBy")
    VALUES ($1,$2,$2,'Proveedor QA','PROVEEDOR QA','2026-11-01','2026-11-20',100.29,40.10,'PENDIENTE',$3,'qa',7,'Administrador QA')`, [id, `QA-${id}`, `invoice-${id}`]);
  await pg.query(`INSERT INTO "PagoFacturaAdministrativa" ("id","invoiceId","requestId","requestHash","responseSnapshot","date","mode","amount","balanceBefore","balanceAfter","invoiceNumberSnapshot","providerSnapshot","invoiceAmountSnapshot","createdById","createdBy")
    VALUES ($1,$2,$3,'qa','{}','2026-11-17','partial',40.10,100.29,60.19,$4,'Proveedor QA',100.29,7,'Administrador QA')`, [paymentId, id, `payment-${paymentId}`, `QA-${id}`]);
}
const stored = async (pg) => (await pg.query('SELECT * FROM "InvoicePaymentReceipt" ORDER BY "paymentId"')).rows;
const rejects = (promise, status, code) => assert.rejects(promise, error => error.status === status && (!code || error.code === code));
const attach = (x, requestId = "attach-qa-0001", file = receipt(), invoiceId = 1, paymentId = invoiceId, session = admin) => x.service.attachStoredInvoicePaymentReceipt(invoiceId, paymentId, { requestId, receipt: file }, session);

test("PDF se conserva byte por byte con autor y metadata; no cambia importes ni saldos", async () => {
  const x = await setup();
  try {
    await seed(x.pg);
    const before = (await x.pg.query('SELECT * FROM "FacturaAdministrativa";')).rows[0];
    const paymentBefore = (await x.pg.query('SELECT * FROM "PagoFacturaAdministrativa";')).rows[0];
    const result = await attach(x);
    assert.equal(result.replayed, false); assert.deepEqual(Object.keys(result.receipt).sort(), ["filename", "id", "size"]);
    const [row] = await stored(x.pg); assert.equal(row.createdById, admin.id); assert.equal(row.createdByProfileId, admin.perfilId);
    assert.equal(row.createdBy, admin.perfilNombre); assert.equal(row.sha256, receipt().sha256);
    assert.deepEqual([...row.bytes], [...pdf]);
    const downloaded = await x.service.readInvoicePaymentReceipt(1, 1, admin);
    assert.deepEqual([...downloaded.bytes], [...pdf]); assert.equal(downloaded.filename, receipt().name);
    assert.deepEqual((await x.pg.query('SELECT * FROM "FacturaAdministrativa"')).rows[0], before);
    assert.deepEqual((await x.pg.query('SELECT * FROM "PagoFacturaAdministrativa"')).rows[0], paymentBefore);
    await x.pg.exec(migration); assert.deepEqual([...((await stored(x.pg))[0].bytes)], [...pdf]);
    assert.ok(x.calls.some(sql => /FacturaAdministrativa.*FOR UPDATE/.test(sql)));
    assert.ok(x.calls.some(sql => /PagoFacturaAdministrativa.*FOR UPDATE/.test(sql)));
  } finally { await x.pg.close(); }
});

test("reintento exacto devuelve mismo archivo; ninguna nueva intención reemplaza un comprobante", async () => {
  const x = await setup();
  try {
    await seed(x.pg); await seed(x.pg, 2);
    const first = await attach(x); const replay = await attach(x);
    assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, first.receipt);
    await rejects(attach(x, "attach-qa-0001", receipt("Nombre distinto.pdf")), 409, "IDEMPOTENCY_CONFLICT");
    await rejects(attach(x, "attach-qa-0001", receipt(), 2), 409, "IDEMPOTENCY_CONFLICT");
    await rejects(attach(x, "attach-qa-0002"), 409, "RECEIPT_EXISTS");
    assert.equal((await stored(x.pg)).length, 1);
  } finally { await x.pg.close(); }
});

test("intentos simultáneos producen un único comprobante y reintentos consistentes", async () => {
  const x = await setup();
  try {
    await seed(x.pg); await seed(x.pg, 2);
    const same = await Promise.all([attach(x), attach(x)]);
    assert.deepEqual(same.map(item => item.replayed).sort(), [false, true]);
    const different = await Promise.allSettled([attach(x, "second-file-0001", receipt(), 2), attach(x, "second-file-0002", receipt("Otro.pdf"), 2)]);
    assert.equal(different.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(different.find(item => item.status === "rejected").reason.code, "RECEIPT_EXISTS");
    assert.equal((await stored(x.pg)).length, 2);
  } finally { await x.pg.close(); }
});

test("autorización central se exige antes de consultar metadatos o bytes", async () => {
  const x = await setup();
  try {
    for (const session of [null, { ...admin, perfilTipo: "SUPERVISOR", rolNombre: "SUPERVISOR" }, { ...admin, perfilTipo: "AUDITOR", rolNombre: "AUDITOR" }]) {
      const status = session ? 403 : 401;
      await rejects(attach(x, "attach-qa-0001", receipt(), 1, 1, session), status);
      await rejects(x.service.readInvoicePaymentReceipt(1, 1, session), status);
    }
    assert.equal(x.calls.length, 0);
  } finally { await x.pg.close(); }
});

test("identificadores factura y pago deben corresponder antes de leer el blob", async () => {
  const x = await setup();
  try {
    await seed(x.pg); await seed(x.pg, 2); await attach(x);
    const before = x.calls.length;
    await rejects(x.service.readInvoicePaymentReceipt(2, 1, admin), 404, "PAYMENT_NOT_FOUND");
    assert.equal(x.calls.slice(before).some(sql => sql.includes('"InvoicePaymentReceipt"')), false);
    await rejects(attach(x, "wrong-pair-0001", receipt(), 2, 1), 404, "PAYMENT_NOT_FOUND");
    await rejects(attach(x, "missing-invoice-0001", receipt(), 99, 1), 404, "NOT_FOUND");
    await rejects(x.service.readInvoicePaymentReceipt(2, 2, admin), 404, "RECEIPT_NOT_FOUND");
  } finally { await x.pg.close(); }
});

test("eliminar factura impide nuevos adjuntos y preserva descarga y replay histórico", async () => {
  const x = await setup();
  try {
    await seed(x.pg); await seed(x.pg, 2); const first = await attach(x);
    await x.pg.exec('UPDATE "FacturaAdministrativa" SET "deletedAt"=CURRENT_TIMESTAMP;');
    assert.equal((await attach(x)).receipt.id, first.receipt.id);
    assert.deepEqual([...(await x.service.readInvoicePaymentReceipt(1, 1, admin)).bytes], [...pdf]);
    await rejects(attach(x, "deleted-new-0001", receipt(), 2), 409, "INVOICE_DELETED");
    assert.equal((await stored(x.pg)).length, 1);
  } finally { await x.pg.close(); }
});

test("fallo posterior en la transacción revierte el PDF completo sin afectar el pago", async () => {
  const x = await setup();
  try {
    await seed(x.pg);
    await assert.rejects(x.db.$transaction(async tx => {
      await x.service.persistInvoicePaymentReceipt(tx, { invoiceId: 1, paymentId: 1, requestId: "rollback-qa-0001", receipt: receipt(),
        actor: { createdById: admin.id, createdByProfileId: admin.perfilId, createdBy: admin.perfilNombre } });
      throw new Error("forced transaction rollback");
    }), /forced transaction rollback/);
    assert.equal((await stored(x.pg)).length, 0);
    assert.equal((await x.pg.query('SELECT "amount" FROM "PagoFacturaAdministrativa"')).rows[0].amount, "40.10");
    assert.equal((await attach(x, "rollback-qa-0001")).replayed, false);
  } finally { await x.pg.close(); }
});

test("bytes o hash alterados se rechazan al adjuntar y nunca se descargan como verificados", async () => {
  const x = await setup();
  try {
    await seed(x.pg);
    await rejects(attach(x, "invalid-file-0001", { ...receipt(), sha256: "0".repeat(64) }), 400, "RECEIPT_MISMATCH");
    assert.equal(x.calls.length, 0); await attach(x);
    await x.pg.query('UPDATE "InvoicePaymentReceipt" SET "sha256"=$1', ["0".repeat(64)]);
    await rejects(x.service.readInvoicePaymentReceipt(1, 1, admin), 400, "RECEIPT_MISMATCH");
  } finally { await x.pg.close(); }
});
