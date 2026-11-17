import { getSessionUser } from "@/lib/auth";
import { assertInvoicePaymentsAccess, assertInvoiceWriteRequest, createAdministrativeInvoice, invoiceErrorResponse,
  invoiceJson, readInvoiceJson, readInvoicePayments, readDeletedAdministrativeInvoices } from "@/lib/invoice-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    const params = new URL(request.url).searchParams;
    return invoiceJson(await (params.get("deleted") === "1" ? readDeletedAdministrativeInvoices(params, session) : readInvoicePayments(params, session)));
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
