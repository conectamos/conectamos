import { getSessionUser } from "@/lib/auth";
import { assertInvoiceWriteRequest, invoiceErrorResponse, invoiceJson, readInvoiceJson } from "@/lib/invoice-payments";
import { administrativeProviderId, assertInvoiceProviderAccess, deactivateInvoiceProvider, renameInvoiceProvider } from "@/lib/invoice-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function change(request: Request, context: Context, remove: boolean) {
  try {
    const session = await getSessionUser();
    assertInvoiceProviderAccess(session);
    assertInvoiceWriteRequest(request);
    const id = administrativeProviderId((await context.params).id);
    const result = await (remove ? deactivateInvoiceProvider : renameInvoiceProvider)(id, await readInvoiceJson(request), session);
    return invoiceJson({ provider: result.provider });
  } catch (error) { return invoiceErrorResponse(error); }
}
export function PATCH(request: Request, context: Context) { return change(request, context, false); }
export function DELETE(request: Request, context: Context) { return change(request, context, true); }
