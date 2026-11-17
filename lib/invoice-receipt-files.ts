import { createHash } from "node:crypto";

export const MAX_INVOICE_RECEIPT_BYTES = 5 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_MULTIPART_BYTES = MAX_INVOICE_RECEIPT_BYTES + 32 * 1024;

export type InvoiceReceiptFile = { name: string; bytes: Uint8Array; size: number; sha256: string };
export class InvoiceReceiptFileError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_RECEIPT") {
    super(message); this.name = "InvoiceReceiptFileError";
  }
}

function receiptFile(name: unknown, bytes: unknown, mime = ""): InvoiceReceiptFile {
  if (typeof name !== "string") throw new InvoiceReceiptFileError("Selecciona un comprobante PDF.");
  const normalized = name.normalize("NFC").trim();
  if (!normalized || normalized.length > 160 || /[\x00-\x1f\x7f/\\]/.test(normalized) || /[\uD800-\uDFFF]/u.test(normalized) || !/\.pdf$/i.test(normalized)) {
    throw new InvoiceReceiptFileError("El comprobante debe tener un nombre válido terminado en .pdf.");
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new InvoiceReceiptFileError("El comprobante PDF está vacío.");
  if (bytes.byteLength > MAX_INVOICE_RECEIPT_BYTES) throw new InvoiceReceiptFileError("El PDF debe pesar máximo 5 MB.", 413, "RECEIPT_TOO_LARGE");
  if (mime && mime.toLowerCase() !== "application/pdf") throw new InvoiceReceiptFileError("Solo puedes adjuntar archivos PDF.", 415, "INVALID_RECEIPT_TYPE");
  const header = Buffer.from(bytes.subarray(0, 9)).toString("latin1");
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 2048))).toString("latin1");
  if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n|\s)/.test(header) || !/%%EOF[\x00\t\n\f\r ]*$/.test(tail)) {
    throw new InvoiceReceiptFileError("El archivo no tiene un formato PDF completo. Selecciona el comprobante original.", 400, "INVALID_PDF");
  }
  return { name: normalized, bytes, size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function validateInvoiceReceiptFile(value: unknown): InvoiceReceiptFile {
  if (!value || typeof value !== "object") throw new InvoiceReceiptFileError("Selecciona un comprobante PDF.");
  const input = value as Partial<InvoiceReceiptFile>;
  const valid = receiptFile(input.name, input.bytes);
  if (input.size !== valid.size || input.sha256 !== valid.sha256) {
    throw new InvoiceReceiptFileError("No fue posible verificar el comprobante. Selecciona el archivo otra vez.", 400, "RECEIPT_MISMATCH");
  }
  return valid;
}

async function limitedBody(request: Request, maximum: number) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new InvoiceReceiptFileError("El tamaño de la solicitud no es válido.");
  if (declared && Number(declared) > maximum) {
    await request.body?.cancel().catch(() => {});
    throw new InvoiceReceiptFileError("El archivo o la solicitud supera el tamaño permitido.", 413, "REQUEST_TOO_LARGE");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvoiceReceiptFileError("La solicitud está vacía.");
  const parts: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new InvoiceReceiptFileError("El archivo o la solicitud supera el tamaño permitido.", 413, "REQUEST_TOO_LARGE");
      }
      parts.push(part.value);
    }
    if (declared && Number(declared) !== length) throw new InvoiceReceiptFileError("La carga del archivo está incompleta. Intenta de nuevo.", 400, "INCOMPLETE_UPLOAD");
    return Buffer.concat(parts, length);
  } catch (error) {
    if (error instanceof InvoiceReceiptFileError) throw error;
    throw new InvoiceReceiptFileError("No fue posible recibir el archivo completo. Intenta de nuevo.", 400, "INCOMPLETE_UPLOAD");
  } finally { reader.releaseLock(); }
}

function jsonPayload(text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_PAYLOAD_BYTES) throw new InvoiceReceiptFileError("Los datos del pago superan el tamaño permitido.", 413, "PAYLOAD_TOO_LARGE");
  try { return JSON.parse(text) as unknown; }
  catch { throw new InvoiceReceiptFileError("Los datos enviados no son JSON válido.", 400, "INVALID_JSON"); }
}

export async function readInvoicePaymentRequest(request: Request, { requireReceipt = false }: { requireReceipt?: boolean } = {}): Promise<{ payload: unknown; receipt?: InvoiceReceiptFile }> {
  const contentType = request.headers.get("content-type") || "";
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mime === "application/json" && !requireReceipt) {
    const body = await limitedBody(request, MAX_PAYLOAD_BYTES);
    return { payload: jsonPayload(body.toString("utf8")) };
  }
  if (mime !== "multipart/form-data") throw new InvoiceReceiptFileError("Envía los datos del pago y el comprobante en el formato permitido.", 415, "INVALID_CONTENT_TYPE");
  const body = await limitedBody(request, MAX_MULTIPART_BYTES);
  let form: FormData;
  try {
    form = await new Request("http://localhost/invoice-receipt", { method: "POST", headers: { "Content-Type": contentType }, body }).formData();
  } catch { throw new InvoiceReceiptFileError("La carga del comprobante está incompleta o no es válida. Selecciona el archivo e intenta de nuevo.", 400, "INVALID_MULTIPART"); }
  const fields = [...form.keys()];
  if (fields.some(key => key !== "payload" && key !== "receipt") || form.getAll("payload").length !== 1 || form.getAll("receipt").length > 1) {
    throw new InvoiceReceiptFileError("La solicitud del comprobante contiene campos no permitidos o repetidos.");
  }
  const payload = form.get("payload");
  if (typeof payload !== "string") throw new InvoiceReceiptFileError("Faltan los datos del pago.");
  const parsed = jsonPayload(payload);
  const file = form.get("receipt");
  if (file === null && !requireReceipt) return { payload: parsed };
  if (!file || typeof file === "string") throw new InvoiceReceiptFileError("Selecciona un comprobante PDF.");
  if (file.size > MAX_INVOICE_RECEIPT_BYTES) throw new InvoiceReceiptFileError("El PDF debe pesar máximo 5 MB.", 413, "RECEIPT_TOO_LARGE");
  return { payload: parsed, receipt: receiptFile(file.name, new Uint8Array(await file.arrayBuffer()), file.type) };
}
