import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { modules } from "./invoice-payments-test-helpers.mjs";

const helper = modules({}).load("lib/invoice-receipt-files.ts");
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (bytes = pdf, name = "Comprobante de pago.pdf") => ({ name, bytes: Uint8Array.from(bytes), size: bytes.length, sha256: digest(bytes) });
const input = { requestId: "payment-request-qa", mode: "partial", amount: 100.29, version: 1, date: "2026-11-17" };
const rejects = (promise, status) => assert.rejects(promise, (error) => error instanceof helper.InvoiceReceiptFileError && error.status === status);
function multipart({ payload = JSON.stringify(input), bytes = pdf, name = "Comprobante de pago.pdf", type = "application/pdf", file = true, mutate } = {}) {
  const data = new FormData();
  if (payload !== undefined) data.append("payload", payload);
  if (file) data.append("receipt", new Blob([bytes], { type }), name);
  mutate?.(data);
  return new Request("https://conectamos.test/api/pago-facturas/1/payments", { method: "POST", body: data });
}
const json = (value = input, headers = {}) => new Request("https://conectamos.test/api/pago-facturas/1/payments", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value),
});

test("JSON anterior conserva el payload y no inventa un comprobante", async () => {
  const result = await helper.readInvoicePaymentRequest(json());
  assert.deepEqual(result.payload, input); assert.equal(result.receipt, undefined);
  await rejects(helper.readInvoicePaymentRequest(json(), { requireReceipt: true }), 415);
});

test("multipart devuelve PDF íntegro, nombre y digest calculado desde sus bytes", async () => {
  const result = await helper.readInvoicePaymentRequest(multipart());
  assert.deepEqual(result.payload, input); assert.equal(result.receipt.name, "Comprobante de pago.pdf");
  assert.equal(result.receipt.size, pdf.length); assert.equal(result.receipt.sha256, digest(pdf));
  assert.deepEqual([...result.receipt.bytes], [...pdf]);
  assert.deepEqual((await helper.readInvoicePaymentRequest(multipart({ file: false }))).payload, input);
});

test("adjuntar a pago existente exige archivo y mantiene requestId del intento", async () => {
  const payload = JSON.stringify({ requestId: "attach-request-qa" });
  const result = await helper.readInvoicePaymentRequest(multipart({ payload }), { requireReceipt: true });
  assert.deepEqual(result.payload, { requestId: "attach-request-qa" });
  await rejects(helper.readInvoicePaymentRequest(multipart({ payload, file: false }), { requireReceipt: true }), 400);
});

test("rechaza campos adicionales y duplicados para no interpretar dos intenciones o archivos", async () => {
  for (const mutate of [
    (form) => form.append("payload", JSON.stringify(input)),
    (form) => form.append("receipt", new Blob([pdf], { type: "application/pdf" }), "otro.pdf"),
    (form) => form.append("recipient", "no-permitido"),
    (form) => form.set("receipt", "no es archivo"),
    (form) => form.set("payload", new Blob([JSON.stringify(input)]), "payload.json"),
    (form) => form.delete("payload"),
  ]) await rejects(helper.readInvoicePaymentRequest(multipart({ mutate })), 400);
});

test("JSON malformado y multipart sin frontera terminada devuelven un error de entrada", async () => {
  const badJson = new Request("https://conectamos.test/", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  await rejects(helper.readInvoicePaymentRequest(badJson), 400);
  await rejects(helper.readInvoicePaymentRequest(multipart({ payload: "{" })), 400);
  const cut = new Request("https://conectamos.test/", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=qa" }, body: "--qa\r\nContent-Disposition: form-data; name=\"payload\"\r\n\r\n{}" });
  await rejects(helper.readInvoicePaymentRequest(cut), 400);
});

test("tipo de solicitud, extensión y MIME no permiten disfrazar un archivo distinto como PDF", async () => {
  const plain = new Request("https://conectamos.test/", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  await rejects(helper.readInvoicePaymentRequest(plain), 415);
  for (const change of [{ name: "comprobante.html" }, { type: "text/html" }, { type: "image/png" }]) {
    await assert.rejects(helper.readInvoicePaymentRequest(multipart(change)), (error) => error instanceof helper.InvoiceReceiptFileError && [400, 415].includes(error.status));
  }
});

test("firma y cierre PDF obligatorios rechazan vacío, HTML y archivo truncado", async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from("<html>comprobante</html>"), Buffer.from("%PDF-1.7\ntruncado"), Buffer.from("archivo arbitrario\n%%EOF"), Buffer.concat([Buffer.from("MZ"), pdf])]) {
    await rejects(helper.readInvoicePaymentRequest(multipart({ bytes })), 400);
  }
});

test("límite de archivo es cinco MiB completos y no incluye el envoltorio multipart", async () => {
  const size = 5 * 1024 * 1024;
  assert.equal(helper.MAX_INVOICE_RECEIPT_BYTES, size);
  const exact = Buffer.alloc(size, 32); pdf.copy(exact); Buffer.from("\n%%EOF\n").copy(exact, size - 7);
  const result = await helper.readInvoicePaymentRequest(multipart({ bytes: exact }));
  assert.equal(result.receipt.size, size); assert.equal(result.receipt.sha256, digest(exact));
  const excessive = Buffer.concat([exact, Buffer.from("\n")]);
  await rejects(helper.readInvoicePaymentRequest(multipart({ bytes: excessive })), 413);
});

test("body JSON está limitado a ocho KiB aunque falte Content-Length", async () => {
  await rejects(helper.readInvoicePaymentRequest(json({ note: "x".repeat(8192) })), 413);
});

test("no confía en Content-Length corto y cancela streams que exceden el límite bruto", async () => {
  let cancelled = false; let read = 0;
  const body = new ReadableStream({ pull(controller) { read++; controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  const request = new Request("https://conectamos.test/", { method: "POST", duplex: "half", body,
    headers: { "Content-Type": "multipart/form-data; boundary=qa", "Content-Length": "1" } });
  await rejects(helper.readInvoicePaymentRequest(request), 413);
  assert.equal(cancelled, true); assert.ok(read < 10, "El lector debe detenerse sin consumir un stream ilimitado");
});

test("tamaño declarado excesivo se rechaza antes de abrir el stream", async () => {
  let read = false;
  const request = { headers: new Headers({ "Content-Type": "multipart/form-data; boundary=qa", "Content-Length": String(6 * 1024 * 1024) }),
    body: { async cancel() {}, getReader() { read = true; throw Error("No debe leer"); } } };
  await rejects(helper.readInvoicePaymentRequest(request), 413); assert.equal(read, false);
});

test("validación canónica verifica tamaño y hash; no permite persistir metadatos falsos", () => {
  const original = canonical();
  const result = helper.validateInvoiceReceiptFile(original);
  assert.equal(result.sha256, digest(pdf)); assert.equal(result.size, pdf.length);
  for (const value of [{ ...original, size: pdf.length + 1 }, { ...original, sha256: "0".repeat(64) }, { ...original, bytes: [] }, { ...original, name: "invalido.exe" }]) {
    assert.throws(() => helper.validateInvoiceReceiptFile(value), (error) => error instanceof helper.InvoiceReceiptFileError && error.status === 400);
  }
});
