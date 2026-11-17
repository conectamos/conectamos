import { getSessionUser } from "@/lib/auth";
import { assertInvoiceWriteRequest, invoiceErrorResponse, invoiceJson, readInvoiceJson } from "@/lib/invoice-payments";
import { assertInvoiceProviderAccess, createInvoiceProvider, readInvoiceProviders } from "@/lib/invoice-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return invoiceJson(await readInvoiceProviders(await getSessionUser())); }
  catch (error) { return invoiceErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    assertInvoiceProviderAccess(session);
    assertInvoiceWriteRequest(request);
    const result = await createInvoiceProvider(await readInvoiceJson(request), session);
    return invoiceJson({ provider: result.provider }, result.replayed ? 200 : 201);
  } catch (error) { return invoiceErrorResponse(error); }
}
