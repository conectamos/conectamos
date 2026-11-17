import { getSessionUser } from "@/lib/auth";
import { invoiceErrorResponse, invoiceJson, readInvoiceAlerts } from "@/lib/invoice-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return invoiceJson(await readInvoiceAlerts(await getSessionUser()));
  } catch (error) { return invoiceErrorResponse(error); }
}
