import { getSessionUser } from "@/lib/auth";
import { assertInvoicePaymentsAccess, assertInvoiceWriteRequest, createAdministrativeInvoice, invoiceErrorResponse,
  invoiceJson, readInvoiceJson, readInvoicePayments } from "@/lib/invoice-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    return invoiceJson(await readInvoicePayments(new URL(request.url).searchParams, session));
  } catch (error) { return invoiceErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    assertInvoicePaymentsAccess(session);
    assertInvoiceWriteRequest(request);
    const result = await createAdministrativeInvoice(await readInvoiceJson(request), session);
    return invoiceJson({ invoice: result.invoice }, result.replayed ? 200 : 201);
  } catch (error) { return invoiceErrorResponse(error); }
}
