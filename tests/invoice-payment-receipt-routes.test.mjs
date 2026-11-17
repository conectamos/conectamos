import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { modules, admin } from "./invoice-payments-test-helpers.mjs";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const payload = { requestId: "payment-route-qa", version: 1, mode: "partial", amount: 100.29, date: "2026-11-17" };
const receiptPayload = { requestId: "receipt-route-qa" };
const context = (id = "1", paymentId = "2") => ({ params: Promise.resolve({ id, paymentId }) });
function setup(options = {}) {
  const payments = {}; const receipts = {}; const calls = [];
  const loader = modules({}, { session: options.session === undefined ? admin : options.session,
    mocks: { "@/lib/invoice-payments": payments, "@/lib/invoice-payment-receipts": receipts } });
  Object.assign(receipts, loader.load("lib/invoice-payment-receipts.ts"));
  Object.assign(payments, loader.load("lib/invoice-payments.ts"));
  const invoice = { id: 1, amount: 1000, paidAmount: 100.29, balance: 899.71, payments: [{ id: 2, receipt: { id: "test-uuid", filename: "Pago.pdf", size: pdf.length } }] };
  payments.recordAdministrativeInvoicePayment = async (...args) => { calls.push({ action: "pay", args }); return { invoice, replayed: options.replayed ?? false }; };
  payments.attachInvoicePaymentReceipt = async (...args) => { calls.push({ action: "attach", args }); return { invoice, replayed: options.replayed ?? false }; };
  receipts.readInvoicePaymentReceipt = async (...args) => { calls.push({ action: "read", args });
    if (options.readError) throw new receipts.InvoicePaymentReceiptError("Comprobante no encontrado", 404, "RECEIPT_NOT_FOUND");
    return { filename: 'Pago "número" (QA).pdf', size: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex"), bytes: Uint8Array.from(pdf) };
  };
  return { calls, invoice, payment: loader.load("app/api/pago-facturas/[id]/payments/route.ts"),
    receipt: loader.load("app/api/pago-facturas/[id]/payments/[paymentId]/receipt/route.ts") };
}
function multipart(data = receiptPayload, { includeReceipt = true, bytes = pdf, origin = "https://conectamos.test" } = {}) {
  const form = new FormData(); form.append("payload", JSON.stringify(data));
  if (includeReceipt) form.append("receipt", new Blob([bytes], { type: "application/pdf" }), "Pago.pdf");
  return new Request("https://conectamos.test/api/pago-facturas/1/payments/2/receipt", { method: "POST", headers: { Origin: origin }, body: form });
}
const json = () => new Request("https://conectamos.test/api/pago-facturas/1/payments", { method: "POST", headers: { Origin: "https://conectamos.test", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
const get = () => new Request("https://conectamos.test/api/pago-facturas/1/payments/2/receipt");

test("pago nuevo conserva JSON anterior y entrega PDF validado como cuarto argumento en multipart", async () => {
  const x = setup();
  const legacy = await x.payment.POST(json(), context()); assert.equal(legacy.status, 201);
  assert.deepEqual(x.calls[0].args, [1, payload, admin, undefined]);
  const uploaded = await x.payment.POST(multipart(payload), context()); assert.equal(uploaded.status, 201);
  assert.deepEqual(x.calls[1].args.slice(0, 3), [1, payload, admin]);
  assert.deepEqual([...x.calls[1].args[3].bytes], [...pdf]);
  assert.deepEqual(await uploaded.json(), { invoice: x.invoice });
  assert.equal(uploaded.headers.get("cache-control"), "private, no-store");
});

test("adjuntar a pago existente exige multipart con archivo y distingue creación de replay", async () => {
  for (const replayed of [false, true]) {
    const x = setup({ replayed }); const result = await x.receipt.POST(multipart(), context());
    assert.equal(result.status, replayed ? 200 : 201);
    assert.equal(x.calls[0].action, "attach"); assert.equal(x.calls[0].args[0], 1); assert.equal(x.calls[0].args[1], 2);
    assert.equal(x.calls[0].args[2].requestId, receiptPayload.requestId);
    assert.deepEqual([...x.calls[0].args[2].receipt.bytes], [...pdf]); assert.equal(x.calls[0].args[3], admin);
    assert.deepEqual(await result.json(), { invoice: x.invoice });
  }
  const x = setup();
  assert.equal((await x.receipt.POST(json(), context())).status, 415);
  assert.equal((await x.receipt.POST(multipart(receiptPayload, { includeReceipt: false }), context())).status, 400);
  assert.equal(x.calls.length, 0);
});

test("sesión y permiso central se verifican antes de leer cuerpos o archivos", async () => {
  for (const session of [null, { ...admin, perfilTipo: "SUPERVISOR", rolNombre: "SUPERVISOR" }]) {
    const x = setup({ session }); const expected = session ? 403 : 401;
    for (const route of [x.payment, x.receipt]) {
      const request = multipart(); Object.defineProperty(request, "body", { get() { throw Error("No debe leer el body sin autorización"); } });
      assert.equal((await route.POST(request, context())).status, expected);
    }
    assert.equal((await x.receipt.GET(get(), context())).status, expected); assert.equal(x.calls.length, 0);
  }
});

test("adjuntar no acepta otro importe, pago, ruta ni campos fuera de requestId", async () => {
  const x = setup();
  for (const data of [null, [], "request", {}, { ...receiptPayload, amount: 999 }, { ...receiptPayload, paymentId: 99 }, { ...receiptPayload, receipt: "otro" }]) {
    const response = await x.receipt.POST(multipart(data), context());
    assert.equal(response.status, 400); assert.equal((await response.json()).code, "INVALID_RECEIPT");
  }
  assert.equal(x.calls.length, 0);
});

test("origen ajeno y referencias inválidas se rechazan sin ejecutar persistencia", async () => {
  const x = setup();
  for (const route of [x.payment, x.receipt]) {
    const request = multipart(receiptPayload, { origin: "https://other.invalid" });
    Object.defineProperty(request, "body", { get() { throw Error("No debe leer un body de otro origen"); } });
    assert.equal((await route.POST(request, context())).status, 403);
    assert.equal((await route.POST(multipart(), context("0"))).status, 400);
  }
  assert.equal((await x.receipt.GET(get(), context("1", "2147483648"))).status, 400);
  assert.equal((await x.receipt.GET(get(), context("1", "otra"))).status, 400);
  assert.equal(x.calls.length, 0);
});

test("GET transmite bytes exactos como descarga privada con nombre UTF8 y protecciones de contenido", async () => {
  const x = setup(); const result = await x.receipt.GET(get(), context());
  assert.equal(result.status, 200); assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [...pdf]);
  assert.deepEqual(x.calls[0], { action: "read", args: [1, 2, admin] });
  assert.equal(result.headers.get("content-type"), "application/pdf"); assert.equal(result.headers.get("content-length"), String(pdf.length));
  assert.equal(result.headers.get("cache-control"), "private, no-store"); assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.headers.get("content-security-policy"), /sandbox/);
  assert.equal(result.headers.get("cross-origin-resource-policy"), "same-origin");
  const disposition = result.headers.get("content-disposition"); assert.match(disposition, /^attachment; filename="Pago _n_mero_ \(QA\)\.pdf";/);
  assert.ok(disposition.includes("filename*=UTF-8''Pago%20%22n%C3%BAmero%22%20%28QA%29.pdf"));
});

test("archivo inválido y comprobante inexistente devuelven errores seguros sin éxito inventado", async () => {
  const x = setup();
  const response = await x.payment.POST(multipart(payload, { bytes: Buffer.from("<html>no pdf</html>") }), context());
  assert.equal(response.status, 400); assert.equal((await response.json()).code, "INVALID_PDF"); assert.equal(x.calls.length, 0);
  const missing = setup({ readError: true }); const result = await missing.receipt.GET(get(), context());
  assert.equal(result.status, 404); assert.equal((await result.json()).code, "RECEIPT_NOT_FOUND");
  assert.equal(result.headers.get("cache-control"), "private, no-store");
});
