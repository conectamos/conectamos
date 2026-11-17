import { authorizeInvoiceReminderDispatch } from "@/lib/invoice-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const denied = (status = 200) => Response.json({ allowed: false, code: "DISPATCH_NOT_ALLOWED" }, {
  status, headers: { "Cache-Control": "private, no-store" },
});

// The random, short-lived delivery token authenticates this server callback.
// No browser session, invoice data, destination or template is accepted here.
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return denied(415);
    const reader = request.body?.getReader();
    if (!reader) return denied(400);
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048) { await reader.cancel(); return denied(413); }
      parts.push(chunk.value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return denied(400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "deliveryId" && key !== "token")) return denied(400);
    const input = body as { deliveryId: unknown; token: unknown };
    return Response.json(await authorizeInvoiceReminderDispatch(input), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return denied(503); }
}
