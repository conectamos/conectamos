import { getSessionUser } from "@/lib/auth";
import { administrativeInvoiceId, assertInvoicePaymentsAccess, assertInvoiceWriteRequest, invoiceErrorResponse,
  invoiceJson, readInvoiceJson, recordAdministrativeInvoicePayment } from "@/lib/invoice-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    assertInvoiceWriteRequest(request);
    const id = administrativeInvoiceId((await context.params).id);
    const result = await recordAdministrativeInvoicePayment(id, await readInvoiceJson(request), session);
    return invoiceJson({ invoice: result.invoice }, result.replayed ? 200 : 201);
  } catch (error) { return invoiceErrorResponse(error); }
}
