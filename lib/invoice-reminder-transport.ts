export type InvoiceReminderConfig = {
  enabled: boolean;
  configured: boolean;
  recipient: string | null;
  startDate?: string | null;
  sendHour: 8;
  timeZone: "America/Bogota";
};
export type InvoiceReminderPayload = {
  invoiceId: number;
  number: string;
  provider: string;
  dueDate: string;
  balance: number;
  recipient: string;
  deliveryId: string;
  authorizationToken: string;
};
export class InvoiceReminderTransportError extends Error {
  constructor(public code: string, public retryable = false, public uncertain = false) {
    // Do not persist raw HTTP errors: the webhook URL contains its credential.
    super(code);
    this.name = "InvoiceReminderTransportError";
  }
}

type ReminderEnvironment = Record<string, string | undefined>;
function recipientNumber(value: string | undefined) {
  const digits = String(value || "").trim().replace(/^\+/, "");
  const normalized = /^3\d{9}$/.test(digits) ? `57${digits}` : digits;
  return /^573\d{9}$/.test(normalized) ? normalized : null;
}
function daptaEndpoint(value: string | undefined) {
  try {
    const url = new URL(String(value || ""));
    const keys = [...url.searchParams.keys()];
    return url.protocol === "https:" && url.hostname === "api.dapta.ai" && !url.port &&
      !url.username && !url.password && !url.hash && /^\/api\/[A-Za-z0-9_/-]+$/.test(url.pathname) &&
      keys.length === 1 && keys[0] === "x-api-key" && (url.searchParams.get("x-api-key")?.length ?? 0) >= 16
      ? url.toString() : null;
  } catch { return null; }
}
export function getInvoiceReminderConfig(env: ReminderEnvironment = process.env): InvoiceReminderConfig {
  const recipient = recipientNumber(env.INVOICE_REMINDER_WHATSAPP_TO);
  const start = String(env.INVOICE_REMINDER_START_DATE || "").trim();
  const validStart = !start || (/^\d{4}-\d{2}-\d{2}$/.test(start) && Number.isFinite(Date.parse(`${start}T12:00:00Z`)) && new Date(`${start}T12:00:00Z`).toISOString().slice(0, 10) === start);
  return {
    enabled: env.INVOICE_REMINDERS_ENABLED === "1",
    configured: Boolean(validStart && recipient && daptaEndpoint(env.INVOICE_REMINDER_DAPTA_URL) && env.INVOICE_REMINDER_TEMPLATE_APPROVED === "1"),
    recipient, ...(start ? { startDate: validStart ? start : null } : {}), sendHour: 8, timeZone: "America/Bogota",
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new InvoiceReminderTransportError("INVALID_RECEIPT", false, true);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16_384) { await reader.cancel(); throw new InvoiceReminderTransportError("INVALID_RECEIPT", false, true); }
      chunks.push(part.value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { body.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } finally { reader.releaseLock(); }
}

export function createInvoiceReminderSender({
  env = process.env, fetcher = fetch,
}: { env?: ReminderEnvironment; fetcher?: typeof fetch } = {}) {
  return async (payload: InvoiceReminderPayload): Promise<{ messageId: string }> => {
    const config = getInvoiceReminderConfig(env);
    const endpoint = daptaEndpoint(env.INVOICE_REMINDER_DAPTA_URL);
    if (!config.enabled || !config.configured || !endpoint || config.recipient !== payload.recipient) {
      throw new InvoiceReminderTransportError("NOT_CONFIGURED");
    }
    if (!UUID.test(payload.deliveryId) || !UUID.test(payload.authorizationToken)) throw new InvoiceReminderTransportError("INVALID_AUTHORIZATION");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);
    try {
      // The flow can only retrieve the current invoice after consuming this
      // short-lived, single-use claim. It cannot choose another recipient.
      const response = await fetcher(endpoint, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ delivery_id: payload.deliveryId, authorization_token: payload.authorizationToken }),
      });
      // A gateway error does not prove that WhatsApp rejected the message.
      if (!response.ok) throw new InvoiceReminderTransportError("PROVIDER_RESPONSE_UNCERTAIN", false, true);
      const body = await boundedJson(response);
      const receipt = body as { accepted?: unknown; deliveryId?: unknown; messageId?: unknown } | null;
      if (receipt?.accepted !== true || receipt.deliveryId !== payload.deliveryId || typeof receipt.messageId !== "string" ||
        !/^wamid\.[A-Za-z0-9_+/=-]{8,500}$/.test(receipt.messageId)) {
        throw new InvoiceReminderTransportError("INVALID_RECEIPT", false, true);
      }
      return { messageId: receipt.messageId };
    } catch (error) {
      if (error instanceof InvoiceReminderTransportError) throw error;
      // Never blindly repeat a timeout or broken connection after dispatch.
      throw new InvoiceReminderTransportError("PROVIDER_RESPONSE_UNCERTAIN", false, true);
    } finally { clearTimeout(timeout); }
  };
}

export const sendInvoiceReminderWhatsApp = createInvoiceReminderSender();
