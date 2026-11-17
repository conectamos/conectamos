import { getSessionUser } from "@/lib/auth";
import { administrativeInvoiceId, assertInvoicePaymentsAccess, assertInvoiceWriteRequest, invoiceErrorResponse,
  invoiceJson, recordAdministrativeInvoicePayment } from "@/lib/invoice-payments";
import { readInvoicePaymentRequest } from "@/lib/invoice-receipt-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    assertInvoiceWriteRequest(request, { allowMultipart: true });
    const id = administrativeInvoiceId((await context.params).id);
    const input = await readInvoicePaymentRequest(request);
    const result = await recordAdministrativeInvoicePayment(id, input.payload, session, input.receipt);
    return invoiceJson({ invoice: result.invoice }, result.replayed ? 200 : 201);
  } catch (error) { return invoiceErrorResponse(error); }
}
