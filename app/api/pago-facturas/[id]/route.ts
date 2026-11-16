import { getSessionUser } from "@/lib/auth";
import { administrativeInvoiceId, assertInvoicePaymentsAccess, invoiceErrorResponse, invoiceJson, readAdministrativeInvoice } from "@/lib/invoice-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    const id = administrativeInvoiceId((await context.params).id);
    return invoiceJson(await readAdministrativeInvoice(id, session));
  } catch (error) { return invoiceErrorResponse(error); }
}
