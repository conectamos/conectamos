import { createHash, randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { decimalProveedorACentavos } from "@/lib/proveedores-pagos";
import { assertInvoicePaymentsAccess } from "@/lib/invoice-payments";
import { getInvoiceReminderConfig, sendInvoiceReminderWhatsApp, InvoiceReminderTransportError } from "@/lib/invoice-reminder-transport";

type Config = ReturnType<typeof getInvoiceReminderConfig>;
type Payload = Parameters<typeof sendInvoiceReminderWhatsApp>[0];
type Db = Pick<typeof prisma, "$queryRaw" | "$executeRaw" | "$transaction">;
type Session = Parameters<typeof assertInvoicePaymentsAccess>[0];
type Delivery = { id: string; invoiceId: number; dueDate: Date; recipientHash: string; recipient: string;
  attempts: number; leaseToken: string; leaseUntil: Date; dispatchClaimedAt: Date | null };
type LiveInvoice = { id: number; number: string; provider: string; dueDate: Date | null; amount: { toString(): string } | string;
  paidAmount: { toString(): string } | string; status: string; deletedAt: Date | null };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const LEASE_MS = 120_000;
const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;
const recipientHash = (recipient: string) => createHash("sha256").update(recipient).digest("hex");
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const colombiaHour = new Intl.DateTimeFormat("en", { timeZone: "America/Bogota", hour: "2-digit", hourCycle: "h23" });
const permittedTime = (now: Date, today: string) => Number(colombiaHour.format(now)) >= 10 && getDateKeyInColombia(now) === today;
const started = (settings: Config, today: string) => !settings.startDate || today >= settings.startDate;
const ready = (config: Config): config is Config & { recipient: string } => config.enabled && config.configured && Boolean(config.recipient);
function balance(invoice: LiveInvoice) {
  const total = decimalProveedorACentavos(invoice.amount);
  const paid = decimalProveedorACentavos(invoice.paidAmount);
  return total !== null && paid !== null && total > paid && paid >= 0 ? (total - paid) / 100 : null;
}
function safeCode(code: unknown) { return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : "TRANSPORT_ERROR"; }
function messageId(value: unknown) { return typeof value === "string" && /^wamid\.[A-Za-z0-9_+/=-]{8,500}$/.test(value) ? value : null; }

export function createInvoiceReminderService(dependencies: {
  db?: Db; now?: () => Date; config?: () => Config; send?: typeof sendInvoiceReminderWhatsApp; token?: () => string;
} = {}) {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now ?? (() => new Date());
  const config = dependencies.config ?? getInvoiceReminderConfig;
  const send = dependencies.send ?? sendInvoiceReminderWhatsApp;
  const token = dependencies.token ?? randomUUID;

  async function recoverAndCancel(today: string, instant: Date, currentRecipientHash: string | null) {
    // An interrupted dispatch cannot be retried safely. Preserve its token so
    // a late, verifiable receipt can resolve UNKNOWN without a second send.
    await db.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "state" = 'UNKNOWN', "errorCode" = 'WORKER_INTERRUPTED',
      "leaseUntil" = NULL, "updatedAt" = ${instant} WHERE "state" = 'PROCESSING' AND "leaseUntil" <= ${instant}`;
    return db.$executeRaw`UPDATE "InvoiceReminderDelivery" d SET "state" = 'CANCELLED', "errorCode" = 'NO_LONGER_ELIGIBLE',
      "leaseToken" = NULL, "leaseUntil" = NULL, "updatedAt" = ${instant}
      WHERE d."state" IN ('PENDING','RETRY') AND (d."dueDate" < CAST(${today} AS DATE)
        OR (${currentRecipientHash}::text IS NOT NULL AND d."recipientHash" <> ${currentRecipientHash})
        OR NOT EXISTS (SELECT 1 FROM "FacturaAdministrativa" f WHERE f."id" = d."invoiceId"
          AND f."deletedAt" IS NULL AND f."status" = 'PENDIENTE' AND f."amount" > f."paidAmount" AND f."dueDate" = d."dueDate"))`;
  }

  async function enqueue(today: string, instant: Date, recipient: string) {
    const hash = recipientHash(recipient);
    const invoices = await db.$queryRaw<Array<{ id: number }>>`SELECT f."id" FROM "FacturaAdministrativa" f
      WHERE f."deletedAt" IS NULL AND f."status" = 'PENDIENTE' AND f."amount" > f."paidAmount"
        AND f."dueDate" = CAST(${today} AS DATE)
        AND NOT EXISTS (SELECT 1 FROM "InvoiceReminderDelivery" d WHERE d."invoiceId" = f."id"
          AND d."dueDate" = f."dueDate" AND d."recipientHash" = ${hash}) ORDER BY f."id" ASC LIMIT 100`;
    let created = 0;
    for (const invoice of invoices) {
      created += await db.$executeRaw`INSERT INTO "InvoiceReminderDelivery"
        ("id","invoiceId","dueDate","recipientHash","recipient","nextAttempt","createdAt","updatedAt")
        VALUES (${token()},${invoice.id},CAST(${today} AS DATE),${hash},${recipient},${instant},${instant},${instant})
        ON CONFLICT ("invoiceId","dueDate","recipientHash") DO NOTHING`;
    }
    return created;
  }

  async function claim(today: string, instant: Date, recipient: string) {
    const leaseToken = token();
    const rows = await db.$queryRaw<Delivery[]>`UPDATE "InvoiceReminderDelivery" d SET "state" = 'PROCESSING',
      "attempts" = d."attempts" + 1, "leaseToken" = ${leaseToken}, "leaseUntil" = ${new Date(instant.getTime() + LEASE_MS)},
      "dispatchClaimedAt" = NULL, "errorCode" = NULL, "updatedAt" = ${instant}
      WHERE d."id" = (SELECT q."id" FROM "InvoiceReminderDelivery" q WHERE q."state" IN ('PENDING','RETRY')
        AND q."dueDate" = CAST(${today} AS DATE) AND q."recipientHash" = ${recipientHash(recipient)}
        AND q."nextAttempt" <= ${instant} AND q."attempts" < ${MAX_ATTEMPTS}
        ORDER BY q."nextAttempt", q."id" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING d.*`;
    return rows[0] ?? null;
  }

  async function prepare(delivery: Delivery): Promise<Payload | null> {
    const settings = config();
    const instant = now();
    const today = getDateKeyInColombia(instant);
    if (!ready(settings) || !started(settings, today) || !permittedTime(instant, today) || dateKey(delivery.dueDate) !== today || recipientHash(settings.recipient) !== delivery.recipientHash) {
      await cancel(delivery, instant); return null;
    }
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LiveInvoice[]>`SELECT "id","number","provider","dueDate","amount","paidAmount","status","deletedAt"
        FROM "FacturaAdministrativa" WHERE "id" = ${delivery.invoiceId} FOR UPDATE`;
      const invoice = rows[0];
      const amount = invoice ? balance(invoice) : null;
      if (!invoice || invoice.deletedAt || invoice.status !== "PENDIENTE" || !invoice.dueDate || dateKey(invoice.dueDate) !== today || amount === null) {
        await tx.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "state" = 'CANCELLED', "errorCode" = 'NO_LONGER_ELIGIBLE',
          "leaseToken" = NULL,"leaseUntil" = NULL,"updatedAt" = ${instant}
          WHERE "id" = ${delivery.id} AND "leaseToken" = ${delivery.leaseToken} AND "state" = 'PROCESSING'`;
        return null;
      }
      const payload: Payload = { invoiceId: invoice.id, number: invoice.number, provider: invoice.provider, dueDate: today,
        balance: amount, recipient: settings.recipient, deliveryId: delivery.id, authorizationToken: delivery.leaseToken };
      const snapshot = { invoiceId: invoice.id, number: invoice.number, provider: invoice.provider, dueDate: today, balance: amount };
      const changed = await tx.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "payloadSnapshot" = ${JSON.stringify(snapshot)}::jsonb,
        "updatedAt" = ${instant} WHERE "id" = ${delivery.id} AND "leaseToken" = ${delivery.leaseToken}
        AND "state" = 'PROCESSING' AND "leaseUntil" > ${instant}`;
      return changed === 1 ? payload : null;
    }, { timeout: 10_000 });
  }

  async function cancel(delivery: Delivery, instant: Date) {
    return db.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "state" = 'CANCELLED', "errorCode" = 'NO_LONGER_ELIGIBLE',
      "leaseToken" = NULL,"leaseUntil" = NULL,"updatedAt" = ${instant}
      WHERE "id" = ${delivery.id} AND "leaseToken" = ${delivery.leaseToken} AND "state" = 'PROCESSING' AND "dispatchClaimedAt" IS NULL`;
  }

  async function authorize(input: { deliveryId: unknown; token: unknown }) {
    const denied = { allowed: false as const, code: "DISPATCH_NOT_ALLOWED" };
    if (typeof input.deliveryId !== "string" || !UUID.test(input.deliveryId) || typeof input.token !== "string" || !UUID.test(input.token)) return denied;
    const settings = config();
    const instant = now();
    const today = getDateKeyInColombia(instant);
    if (!ready(settings) || !started(settings, today) || !permittedTime(instant, today)) return denied;
    return db.$transaction(async (tx) => {
      // The invoice lock matches editing/payment operations. The subsequent
      // compare-and-set consumes this delivery token only once across replicas.
      const candidates = await tx.$queryRaw<LiveInvoice[]>`SELECT f."id",f."number",f."provider",f."dueDate",f."amount",f."paidAmount",f."status",f."deletedAt"
        FROM "FacturaAdministrativa" f JOIN "InvoiceReminderDelivery" d ON d."invoiceId" = f."id"
        WHERE d."id" = ${input.deliveryId} AND d."leaseToken" = ${input.token} AND d."state" = 'PROCESSING'
          AND d."dispatchClaimedAt" IS NULL AND d."leaseUntil" > ${instant} FOR UPDATE OF f`;
      const invoice = candidates[0];
      const amount = invoice ? balance(invoice) : null;
      const checkedAt = now();
      const currentSettings = config();
      if (!invoice || invoice.deletedAt || invoice.status !== "PENDIENTE" || !invoice.dueDate || dateKey(invoice.dueDate) !== today || amount === null
        || !ready(currentSettings) || !started(currentSettings, today) || !permittedTime(checkedAt, today) || currentSettings.recipient !== settings.recipient) {
        await tx.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "state" = 'CANCELLED',"errorCode" = 'NO_LONGER_ELIGIBLE',
          "leaseToken" = NULL,"leaseUntil" = NULL,"updatedAt" = ${checkedAt}
          WHERE "id" = ${input.deliveryId} AND "leaseToken" = ${input.token} AND "state" = 'PROCESSING'
            AND "dispatchClaimedAt" IS NULL AND "leaseUntil" > ${checkedAt}`;
        return denied;
      }
      const snapshot = { invoiceId: invoice.id, number: invoice.number, provider: invoice.provider, dueDate: today, balance: amount };
      const granted = await tx.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "dispatchClaimedAt" = ${checkedAt},
        "payloadSnapshot" = ${JSON.stringify(snapshot)}::jsonb,"updatedAt" = ${checkedAt}
        WHERE "id" = ${input.deliveryId} AND "leaseToken" = ${input.token} AND "state" = 'PROCESSING'
          AND "dispatchClaimedAt" IS NULL AND "leaseUntil" > ${checkedAt} AND "dueDate" = CAST(${today} AS DATE)
          AND "recipientHash" = ${recipientHash(settings.recipient)}`;
      if (granted !== 1) return denied;
      return { allowed: true as const, deliveryId: input.deliveryId, recipient: settings.recipient,
        number: invoice.number, provider: invoice.provider, dueDate: today, balance: amount };
    }, { timeout: 10_000 });
  }

  async function runBatch() {
    const settings = config();
    const instant = now();
    const today = getDateKeyInColombia(instant);
    const result = { enabled: settings.enabled, configured: settings.configured, enqueued: 0, processed: 0, sent: 0, retry: 0, failed: 0, uncertain: 0, cancelled: 0 };
    result.cancelled = await recoverAndCancel(today, instant, settings.recipient ? recipientHash(settings.recipient) : null);
    if (!ready(settings) || !started(settings, today) || !permittedTime(instant, today)) return result;
    result.enqueued = await enqueue(today, instant, settings.recipient);
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      const current = now();
      if (getDateKeyInColombia(current) !== today || !permittedTime(current, today)) break;
      const delivery = await claim(today, current, settings.recipient);
      if (!delivery) break;
      result.processed += 1;
      const payload = await prepare(delivery);
      if (!payload) { result.cancelled += 1; continue; }
      try {
        const receipt = await send(payload);
        const receiptId = messageId(receipt?.messageId);
        if (!receiptId) throw new Error("UNVERIFIABLE_RECEIPT");
        const accepted = await db.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "state" = 'SENT',"providerMessageId" = ${receiptId},
          "sentAt" = ${now()},"errorCode" = NULL,"leaseUntil" = NULL,"updatedAt" = ${now()}
          WHERE "id" = ${delivery.id} AND "leaseToken" = ${delivery.leaseToken} AND "state" IN ('PROCESSING','UNKNOWN')
            AND "dispatchClaimedAt" IS NOT NULL`;
        if (accepted === 1) result.sent += 1;
        else throw new Error("UNVERIFIABLE_DISPATCH");
      } catch (error) {
        const known = error instanceof InvoiceReminderTransportError;
        const uncertain = !known || error.uncertain;
        const canRetry = known && error.retryable && !uncertain && delivery.attempts < MAX_ATTEMPTS;
        const nextAttempt = new Date(now().getTime() + 5 * 60_000 * 2 ** Math.min(delivery.attempts - 1, 4));
        const sameDay = getDateKeyInColombia(nextAttempt) === today;
        const state = uncertain ? "UNKNOWN" : canRetry && sameDay ? "RETRY" : "FAILED";
        const code = uncertain && !known ? "TRANSPORT_UNCERTAIN" : safeCode(known ? error.code : null);
        const saved = await db.$executeRaw`UPDATE "InvoiceReminderDelivery" SET "state" = ${state},"errorCode" = ${code},
          "nextAttempt" = ${nextAttempt},"leaseUntil" = NULL,"updatedAt" = ${now()}
          WHERE "id" = ${delivery.id} AND "leaseToken" = ${delivery.leaseToken}
            AND ("state" = 'PROCESSING' OR ("state" = 'UNKNOWN' AND ${state} = 'UNKNOWN'))`;
        if (saved) { if (state === "UNKNOWN") result.uncertain += 1; else if (state === "RETRY") result.retry += 1; else result.failed += 1; }
      }
    }
    return result;
  }

  async function status(session: Session) {
    assertInvoicePaymentsAccess(session);
    const settings = config();
    const instant = now();
    const rows = await db.$queryRaw<Array<{ lastSentAt: Date | null; pending: bigint; failed: bigint; uncertain: bigint }>>`
      SELECT max("sentAt") FILTER (WHERE "state" = 'SENT') AS "lastSentAt",
        count(*) FILTER (WHERE "state" IN ('PENDING','RETRY') OR ("state" = 'PROCESSING' AND "leaseUntil" > ${instant})) AS pending,
        count(*) FILTER (WHERE "state" = 'FAILED') AS failed,
        count(*) FILTER (WHERE "state" = 'UNKNOWN' OR ("state" = 'PROCESSING' AND "leaseUntil" <= ${instant})) AS uncertain
      FROM "InvoiceReminderDelivery"`;
    const row = rows[0];
    if (!row) throw new Error("Reminder status unavailable");
    return { enabled: settings.enabled, configured: settings.configured, recipient: settings.recipient,
      hour: 10 as const, timeZone: "America/Bogota" as const, lastSentAt: row.lastSentAt?.toISOString() ?? null,
      pending: Number(row.pending), failed: Number(row.failed), uncertain: Number(row.uncertain) };
  }
  return { runBatch, authorize, status };
}

const service = createInvoiceReminderService();
export const runInvoiceReminderBatch = () => service.runBatch();
export const readInvoiceReminderStatus = (session: Session) => service.status(session);
export const authorizeInvoiceReminderDispatch = (input: { deliveryId: unknown; token: unknown }) => service.authorize(input);
