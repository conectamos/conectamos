import { getSessionUser } from "@/lib/auth";
import { invoiceErrorResponse, invoiceJson } from "@/lib/invoice-payments";
import { readInvoiceReminderStatus } from "@/lib/invoice-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return invoiceJson(await readInvoiceReminderStatus(await getSessionUser())); }
  catch (error) { return invoiceErrorResponse(error); }
}
