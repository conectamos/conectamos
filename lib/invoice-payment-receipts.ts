import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { esAdministradorCentral } from "@/lib/access-control";
import { validateInvoiceReceiptFile, type InvoiceReceiptFile } from "@/lib/invoice-receipt-files";

export class InvoicePaymentReceiptError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_RECEIPT") { super(message); }
}
type Session = { id: number; perfilId?: number | null; perfilNombre?: string | null; nombre?: string | null;
  usuario?: string; rolNombre?: unknown; perfilTipo?: unknown };
type Actor = { createdById: number; createdByProfileId: number | null; createdBy: string };
export type InvoicePaymentReceiptMetadata = { id: string; filename: string; size: number };
const metadataSelect = { id: true, filename: true, size: true } as const;
const replaySelect = { ...metadataSelect, paymentId: true, requestHash: true } as const;
function access(session: Session | null | undefined): asserts session is Session {
  if (!session) throw new InvoicePaymentReceiptError("No autenticado", 401, "UNAUTHENTICATED");
  if (!esAdministradorCentral(session) || !Number.isSafeInteger(session.id) || session.id <= 0) {
    throw new InvoicePaymentReceiptError("Solo el administrador central puede consultar o adjuntar comprobantes.", 403, "FORBIDDEN");
  }
}
function positiveId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) throw new InvoicePaymentReceiptError("La factura o el pago no son válidos.");
}
function requestKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value)) throw new InvoicePaymentReceiptError("Falta una referencia válida para adjuntar el comprobante.");
  return value;
}
function receiptCopy(value: unknown) {
  const checked = validateInvoiceReceiptFile(value);
  // Keep the exact bytes that were validated even if a caller retains its view.
  return { ...checked, bytes: new Uint8Array(checked.bytes) };
}
function fingerprint(invoiceId: number, paymentId: number, receipt: InvoiceReceiptFile) {
  return createHash("sha256").update(JSON.stringify({ invoiceId, paymentId, sha256: receipt.sha256, filename: receipt.name })).digest("hex");
}
function metadata(row: InvoicePaymentReceiptMetadata): InvoicePaymentReceiptMetadata {
  return { id: row.id, filename: row.filename, size: row.size };
}
function replay(row: InvoicePaymentReceiptMetadata & { paymentId: number; requestHash: string }, paymentId: number, hash: string) {
  if (row.paymentId !== paymentId || row.requestHash !== hash) throw new InvoicePaymentReceiptError("La referencia del intento ya fue usada con otro comprobante o pago.", 409, "IDEMPOTENCY_CONFLICT");
  return { receipt: metadata(row), replayed: true };
}
function uniqueConflict(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"); }

export async function persistInvoicePaymentReceipt(tx: Prisma.TransactionClient, input: {
  invoiceId: number; paymentId: number; requestId: string; receipt: InvoiceReceiptFile; actor: Actor;
}): Promise<InvoicePaymentReceiptMetadata> {
  positiveId(input.invoiceId); positiveId(input.paymentId);
  const requestId = requestKey(input.requestId);
  const receipt = receiptCopy(input.receipt);
  if (!Number.isSafeInteger(input.actor.createdById) || input.actor.createdById <= 0 || typeof input.actor.createdBy !== "string" || !input.actor.createdBy.trim()) {
    throw new InvoicePaymentReceiptError("No fue posible identificar al administrador.", 403, "FORBIDDEN");
  }
  const payment = await tx.pagoFacturaAdministrativa.findFirst({ where: { id: input.paymentId, invoiceId: input.invoiceId }, select: { id: true } });
  if (!payment) throw new InvoicePaymentReceiptError("Pago no encontrado en esta factura.", 404, "PAYMENT_NOT_FOUND");
  return tx.invoicePaymentReceipt.create({ data: {
    id: randomUUID(), paymentId: input.paymentId, requestId,
    requestHash: fingerprint(input.invoiceId, input.paymentId, receipt), filename: receipt.name, size: receipt.size,
    sha256: receipt.sha256, bytes: new Uint8Array(receipt.bytes), createdById: input.actor.createdById,
    createdByProfileId: input.actor.createdByProfileId, createdBy: input.actor.createdBy,
  }, select: metadataSelect });
}

export async function attachStoredInvoicePaymentReceipt(invoiceId: number, paymentId: number,
  input: unknown, session: Session | null) {
  access(session); positiveId(invoiceId); positiveId(paymentId);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "requestId" && key !== "receipt")) {
    throw new InvoicePaymentReceiptError("La solicitud del comprobante contiene campos no permitidos.");
  }
  const body = input as { requestId?: unknown; receipt?: unknown };
  const requestId = requestKey(body.requestId);
  const receipt = receiptCopy(body.receipt);
  const hash = fingerprint(invoiceId, paymentId, receipt);
  const actor: Actor = { createdById: session.id, createdByProfileId: session.perfilId ?? null,
    createdBy: session.perfilNombre || session.nombre || session.usuario || `Administrador ${session.id}` };
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock in the same order as invoice payments and editing, then lock this
      // payment so two attachment attempts cannot overwrite each other.
      const invoiceLock = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "FacturaAdministrativa" WHERE "id" = ${invoiceId} FOR UPDATE`;
      if (!invoiceLock.length) throw new InvoicePaymentReceiptError("Factura no encontrada.", 404, "NOT_FOUND");
      const paymentLock = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "PagoFacturaAdministrativa" WHERE "id" = ${paymentId} AND "invoiceId" = ${invoiceId} FOR UPDATE`;
      if (!paymentLock.length) throw new InvoicePaymentReceiptError("Pago no encontrado en esta factura.", 404, "PAYMENT_NOT_FOUND");
      const previous = await tx.invoicePaymentReceipt.findUnique({ where: { requestId }, select: replaySelect });
      if (previous) return replay(previous, paymentId, hash);
      const invoice = await tx.facturaAdministrativa.findUniqueOrThrow({ where: { id: invoiceId }, select: { deletedAt: true } });
      if (invoice.deletedAt) throw new InvoicePaymentReceiptError("La factura está eliminada. Restáurala antes de adjuntar un comprobante.", 409, "INVOICE_DELETED");
      if (await tx.invoicePaymentReceipt.findUnique({ where: { paymentId }, select: { id: true } })) {
        throw new InvoicePaymentReceiptError("Este pago ya tiene un comprobante. El archivo guardado se conserva.", 409, "RECEIPT_EXISTS");
      }
      return { receipt: await persistInvoicePaymentReceipt(tx, { invoiceId, paymentId, requestId, receipt, actor }), replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.invoicePaymentReceipt.findUnique({ where: { requestId }, select: replaySelect });
    if (previous) return replay(previous, paymentId, hash);
    throw new InvoicePaymentReceiptError("Este pago ya tiene un comprobante. El archivo guardado se conserva.", 409, "RECEIPT_EXISTS");
  }
}

export async function readInvoicePaymentReceipt(invoiceId: number, paymentId: number, session: Session | null) {
  access(session); positiveId(invoiceId); positiveId(paymentId);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.pagoFacturaAdministrativa.findFirst({ where: { id: paymentId, invoiceId }, select: { id: true } });
    if (!payment) throw new InvoicePaymentReceiptError("Pago no encontrado en esta factura.", 404, "PAYMENT_NOT_FOUND");
    const receipt = await tx.invoicePaymentReceipt.findUnique({ where: { paymentId },
      select: { filename: true, size: true, sha256: true, bytes: true } });
    if (!receipt) throw new InvoicePaymentReceiptError("Este pago no tiene comprobante.", 404, "RECEIPT_NOT_FOUND");
    const checked = validateInvoiceReceiptFile({ name: receipt.filename, size: receipt.size, sha256: receipt.sha256, bytes: receipt.bytes });
    return { filename: checked.name, size: checked.size, sha256: checked.sha256, bytes: new Uint8Array(checked.bytes) };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
