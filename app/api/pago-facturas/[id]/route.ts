import { getSessionUser } from "@/lib/auth";
import { administrativeInvoiceId, assertInvoicePaymentsAccess, assertInvoiceWriteRequest, deleteAdministrativeInvoice,
  editAdministrativeInvoice, invoiceErrorResponse, invoiceJson, readAdministrativeInvoice, readInvoiceJson } from "@/lib/invoice-payments";

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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    assertInvoiceWriteRequest(request);
    const id = administrativeInvoiceId((await context.params).id);
    const result = await editAdministrativeInvoice(id, await readInvoiceJson(request), session);
    return invoiceJson({ invoice: result.invoice });
  } catch (error) { return invoiceErrorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    assertInvoiceWriteRequest(request);
    const id = administrativeInvoiceId((await context.params).id);
    const result = await deleteAdministrativeInvoice(id, await readInvoiceJson(request), session);
    return invoiceJson({ invoice: result.invoice });
  } catch (error) { return invoiceErrorResponse(error); }
}
