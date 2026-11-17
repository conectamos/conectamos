import { getSessionUser } from "@/lib/auth";
import { administrativeInvoiceId, assertInvoicePaymentsAccess, assertInvoiceWriteRequest,
  attachInvoicePaymentReceipt, invoiceErrorResponse, invoiceJson } from "@/lib/invoice-payments";
import { readInvoicePaymentReceipt } from "@/lib/invoice-payment-receipts";
import { InvoiceReceiptFileError, readInvoicePaymentRequest } from "@/lib/invoice-receipt-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; paymentId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    assertInvoiceWriteRequest(request, { allowMultipart: true });
    const params = await context.params;
    const invoiceId = administrativeInvoiceId(params.id);
    const paymentId = administrativeInvoiceId(params.paymentId);
    const input = await readInvoicePaymentRequest(request, { requireReceipt: true });
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload) ||
      Object.keys(input.payload).length !== 1 || !Object.hasOwn(input.payload, "requestId")) {
      throw new InvoiceReceiptFileError("La solicitud del comprobante contiene datos no permitidos.");
    }
    const result = await attachInvoicePaymentReceipt(invoiceId, paymentId, {
      requestId: (input.payload as { requestId: unknown }).requestId, receipt: input.receipt,
    }, session);
    return invoiceJson({ invoice: result.invoice }, result.replayed ? 200 : 201);
  } catch (error) { return invoiceErrorResponse(error); }
}

export async function GET(_request: Request, context: Context) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    const params = await context.params;
    const file = await readInvoicePaymentReceipt(administrativeInvoiceId(params.id), administrativeInvoiceId(params.paymentId), session);
    const asciiName = file.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    const encodedName = encodeURIComponent(file.filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(Uint8Array.from(file.bytes), { headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    } });
  } catch (error) { return invoiceErrorResponse(error); }
}
