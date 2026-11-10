import "server-only";
import { createHash, randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import type { Prisma, PayJoyVoiceCall } from "@/app/generated/prisma/client";
import type { getSessionUser } from "@/lib/auth";
import { puedePrepararBorradoresPayJoyDapta } from "@/lib/payjoy-dapta-access";
import { parsePayJoyDaptaPhone } from "@/lib/payjoy-dapta-phone-provider";
import { readPayJoyCreditPaymentPayload } from "@/lib/payjoy";
import { createPayJoyVoiceEventToken, readPayJoyVoiceEventToken, readPayJoyVoiceConfig, payJoyVoiceConfigured, VOICE_UUID, type PayJoyVoiceConfig } from "@/lib/payjoy-voice-security";
import { PAYJOY_VOICE_SCHEDULED_AT, PAYJOY_VOICE_EXPIRES_AT, PAYJOY_VOICE_TIMEZONE, type PayJoyVoiceViewResponse, type PayJoyVoiceCallStatus } from "@/lib/payjoy-voice-types";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type Dependencies = { db: typeof prisma; readPayload: (tag: string) => Promise<unknown>; now: () => Date; config: () => PayJoyVoiceConfig };
type Json = Record<string, string | number | boolean | null>;
const SCOPE = "PAYJOY_VOICE_2026_11_10";
const VERSION = "PAYJOY_VOICE_V1";
const START = new Date(PAYJOY_VOICE_SCHEDULED_AT), END = new Date(PAYJOY_VOICE_EXPIRES_AT);
const LEASE = 5 * 60_000;
const OUTCOMES = new Set(["PAID_REPORTED", "PAYMENT_INTENT", "WRONG_NUMBER", "THIRD_PARTY", "NO_CONTACT", "DECLINED", "OTHER"]);
const ACTIVE = ["DISPATCHING", "ACCEPTED", "IN_PROGRESS"];
const REMINDER = "Le contactamos de CONECTAMOS por su crédito PayJoy. Le invitamos a revisar hoy el estado de su crédito y el valor a pagar en PayJoy. Si tiene un pago pendiente, puede realizarlo hoy. Puede pagar en Efecty, convenio 112090, Adelantos Colombia, usando la cédula del titular como referencia. Si ya pagó, no le solicitamos volver a pagar; el estado requiere validación.";
const ERRORS: Record<string, string> = {
  FORBIDDEN: "Su perfil no tiene acceso a las llamadas PayJoy.", INVALID_INPUT: "Revise los datos de la solicitud.",
  CONFIGURATION_PENDING: "La programación de llamadas aún no está configurada y verificada.", NOT_FOUND: "No se encontró el lote solicitado.",
  SOURCE_NOT_READY: "El lote debe tener entre uno y siete celulares consultados, autorizados y sin duplicados.",
  CAMPAIGN_ALREADY_EXISTS: "Ya existe la campaña única autorizada para esta fecha.", IDEMPOTENCY_CONFLICT: "La solicitud ya corresponde a otros datos.",
  WINDOW_EXPIRED: "La ventana autorizada para esta campaña terminó.", INVALID_TOKEN: "La autorización de esta operación no es válida o expiró.",
  INVALID_STATE: "Esta llamada no permite la operación solicitada.", CALL_MISMATCH: "El resultado no corresponde a la llamada registrada.",
  INTERNAL: "No fue posible completar la operación. Consulte el estado antes de reintentar.",
};
export class PayJoyVoiceError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(ERRORS[code] || ERRORS.INTERNAL); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const iso = (value: Date | null) => value?.toISOString() ?? null;
function uuid(value: unknown): string {
  if (typeof value !== "string" || !VOICE_UUID.test(value)) throw new PayJoyVoiceError("INVALID_INPUT");
  return value.toLowerCase();
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function authorize(session: Session) {
  if (!session || session.activo !== true || !puedePrepararBorradoresPayJoyDapta(session)
    || !Number.isSafeInteger(session.id) || session.id < 1 || !Number.isSafeInteger(session.sedeId) || session.sedeId < 1) throw new PayJoyVoiceError("FORBIDDEN", 403);
}
function providerCallId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(value) ? value : null;
}
function safeCode(value: unknown): string {
  return typeof value === "string" && ["TIMEOUT", "UNAVAILABLE", "RATE_LIMIT", "AUTH", "NOT_FOUND", "INVALID_RESPONSE", "PHONE_CONFLICT", "DEVICE_MISMATCH", "UNSUPPORTED_COUNTRY"].includes(value) ? value : "PREFLIGHT_FAILED";
}
function paymentSkip(payload: unknown, now: Date): string | null {
  const data = record(payload)!, details = record(data.deviceDetails);
  const balance = data.remainingBalance;
  if (data.paidInFull === true || data.fullyPaid === true || balance === 0 || (typeof balance === "string" && /^0(?:\.0+)?$/.test(balance.trim()))) return "PAID_IN_FULL";
  const value = details?.validThrough;
  const seconds = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (Number.isFinite(seconds) && seconds > 0 && seconds * 1000 >= now.getTime()) return "CURRENT_VALID_THROUGH";
  return null; // A past date or a remaining balance never proves an overdue installment.
}

export function createPayJoyVoiceService(dependencies: Partial<Dependencies> = {}) {
  const { db, readPayload, now, config }: Dependencies = {
    db: prisma, readPayload: readPayJoyCreditPaymentPayload, now: () => new Date(), config: readPayJoyVoiceConfig, ...dependencies,
  };
  const event = (tx: Prisma.TransactionClient, batchId: string, callId: string | null, eventKey: string, type: string, detail: Json = {}, actorType = "WORKER", actorId: string | null = null) =>
    tx.payJoyVoiceEvent.upsert({ where: { eventKey }, create: { id: randomUUID(), batchId, callId, eventKey, type, actorType, actorId, detail, createdAt: now() }, update: {} });
  const lock = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT "id" FROM "PayJoyVoiceBatch" WHERE "id" = ${id} FOR UPDATE`;
  async function source(id: string) {
    const row = await db.payJoyDaptaBatch.findUnique({ where: { id }, include: { items: { orderBy: { deviceTag: "asc" } } } });
    if (!row) throw new PayJoyVoiceError("NOT_FOUND", 404);
    return row;
  }
  function eligibility(row: Awaited<ReturnType<typeof source>>, settings: PayJoyVoiceConfig) {
    const calls = row.items.map(item => ({ sourceItemId: item.id, deviceTag: item.deviceTag, phone: item.phone ? `+${item.phone.replace(/^\+/, "")}` : "" }));
    const blockers: string[] = [];
    if (calls.length < 1 || calls.length > 7 || row.items.some(item => item.lookupStatus !== "FOUND" || item.reviewStatus === "DUPLICATE_PHONE" || item.phoneSource !== "PAYJOY_NEQUI_PREFILL")
      || calls.some(call => !/^\+573\d{9}$/.test(call.phone) || !settings.allowedDevices.includes(call.deviceTag))) blockers.push("SOURCE_NOT_READY");
    if (new Set(calls.map(call => call.phone)).size !== calls.length) blockers.push("DUPLICATE_PHONE");
    return { calls, blockers };
  }
  async function get(session: Session, sourceBatchId: unknown): Promise<PayJoyVoiceViewResponse> {
    authorize(session);
    const id = uuid(sourceBatchId), settings = config(), input = await source(id);
    const row = await db.payJoyVoiceBatch.findUnique({ where: { scopeKey: SCOPE }, include: { calls: { orderBy: { deviceTag: "asc" } } } });
    const { calls, blockers } = eligibility(input, settings);
    if (row && row.sourceBatchId !== id) blockers.push("CAMPAIGN_ALREADY_EXISTS");
    if (now() >= END) blockers.push("WINDOW_EXPIRED");
    return {
      sourceBatchId: id, configuration: { ready: payJoyVoiceConfigured(settings), reasonCode: payJoyVoiceConfigured(settings) ? null : "CONFIGURATION_PENDING" },
      scheduledAt: PAYJOY_VOICE_SCHEDULED_AT, expiresAt: PAYJOY_VOICE_EXPIRES_AT, timezone: PAYJOY_VOICE_TIMEZONE, maxCalls: 7,
      eligibleCount: blockers.length ? 0 : calls.length, blockers,
      batch: row && row.sourceBatchId === id ? {
        id: row.id, status: row.status as "SCHEDULED" | "CANCELLED" | "COMPLETED" | "EXPIRED", scheduledAt: row.scheduledAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
        canCancel: row.status === "SCHEDULED" && row.calls.some(call => ["PENDING", "CHECKING"].includes(call.status) || (call.status === "DISPATCHING" && !call.dispatchAuthorizedAt)), createdBy: row.createdBy, authorizedAt: row.authorizedAt.toISOString(),
        calls: row.calls.map(call => {
          const interrupted = ["CHECKING", "DISPATCHING"].includes(call.status) && call.claimExpiresAt !== null && call.claimExpiresAt <= now();
          return { id: call.id, deviceTag: call.deviceTag, phoneMasked: `+57 *** *** ${call.phone.slice(-4)}`,
            status: interrupted ? "UNKNOWN" : call.status as PayJoyVoiceCallStatus, reasonCode: interrupted ? "INTERRUPTED" : call.reasonCode, latestOutcome: call.latestOutcome,
            identityConfirmedAt: iso(call.identityConfirmedAt), acceptedAt: iso(call.acceptedAt), completedAt: iso(call.completedAt) };
        }),
      } : null,
    };
  }
  async function schedule(session: Session, input: Record<string, unknown>) {
    authorize(session);
    const sourceId = uuid(input.sourceBatchId), requestId = uuid(input.requestId);
    if (input.confirmed !== true) throw new PayJoyVoiceError("INVALID_INPUT");
    const settings = config(), original = await source(sourceId), eligible = eligibility(original, settings);
    const inputHash = hash({ sourceId, calls: eligible.calls, script: REMINDER, agentId: settings.agentId, fromNumber: settings.fromNumber, start: PAYJOY_VOICE_SCHEDULED_AT, end: PAYJOY_VOICE_EXPIRES_AT });
    const existing = await db.payJoyVoiceBatch.findUnique({ where: { scopeKey: SCOPE } });
    if (existing) {
      if (existing.inputHash !== inputHash) throw new PayJoyVoiceError("CAMPAIGN_ALREADY_EXISTS", 409);
      return get(session, sourceId);
    }
    if (!payJoyVoiceConfigured(settings)) throw new PayJoyVoiceError("CONFIGURATION_PENDING", 503);
    if (now() >= END) throw new PayJoyVoiceError("WINDOW_EXPIRED", 409);
    if (eligible.blockers.length) throw new PayJoyVoiceError("SOURCE_NOT_READY", 409);
    const suppressed = await db.payJoyContactSuppression.findMany({ where: { phone: { in: eligible.calls.map(call => call.phone) } } });
    if (suppressed.length) throw new PayJoyVoiceError("SOURCE_NOT_READY", 409);
    try {
      await db.$transaction(async tx => {
        const row = await tx.payJoyVoiceBatch.create({ data: {
          id: randomUUID(), requestId, scopeKey: SCOPE, inputHash, sourceBatchId: sourceId, status: "SCHEDULED", scheduledAt: START, expiresAt: END,
          usuarioId: session.id, perfilId: session.perfilId ?? null, sedeId: session.sedeId, createdBy: (session.perfilNombre || session.nombre).trim().slice(0, 100), authorizedAt: now(), scriptVersion: VERSION,
          agentId: settings.agentId, fromNumber: settings.fromNumber, agreement: "112090", timeZone: PAYJOY_VOICE_TIMEZONE,
          calls: { create: eligible.calls.map(call => ({ id: randomUUID(), ...call, dayKey: "2026-11-10", phoneSource: "PAYJOY_NEQUI_PREFILL", status: "PENDING" })) },
        } });
        await event(tx, row.id, null, `authorized:${row.id}`, "AUTHORIZED", { ownershipAttested: true, voiceConsentAttested: true, count: eligible.calls.length, scriptVersion: VERSION }, "USER", `${session.id}:${session.perfilId ?? "base"}`);
      });
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "P2002") throw error;
      const winner = await db.payJoyVoiceBatch.findUnique({ where: { scopeKey: SCOPE } });
      if (!winner || winner.inputHash !== inputHash) throw new PayJoyVoiceError("IDEMPOTENCY_CONFLICT", 409);
    }
    return get(session, sourceId);
  }
  async function cancel(session: Session, batchId: unknown) {
    authorize(session);
    const id = uuid(batchId), row = await db.payJoyVoiceBatch.findUnique({ where: { id } });
    if (!row) throw new PayJoyVoiceError("NOT_FOUND", 404);
    await db.$transaction(async tx => {
      await lock(tx, id);
      await tx.payJoyVoiceBatch.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
      await tx.payJoyVoiceCall.updateMany({ where: { batchId: id, OR: [{ status: { in: ["PENDING", "CHECKING"] } }, { status: "DISPATCHING", dispatchAuthorizedAt: null }] }, data: { status: "CANCELLED", reasonCode: "CANCELLED_BY_USER", completedAt: now(), claimToken: null, claimExpiresAt: null } });
      await event(tx, id, null, `cancel:${id}`, "CANCELLED", {}, "USER", `${session.id}:${session.perfilId ?? "base"}`);
    });
    return get(session, row.sourceBatchId);
  }
  async function settleBatch(tx: Prisma.TransactionClient, batchId: string) {
    const active = await tx.payJoyVoiceCall.count({ where: { batchId, status: { in: ["PENDING", "CHECKING", ...ACTIVE, "UNKNOWN"] } } });
    if (!active) await tx.payJoyVoiceBatch.updateMany({ where: { id: batchId, status: "SCHEDULED" }, data: { status: "COMPLETED" } });
  }
  async function claimOne(item: PayJoyVoiceCall, settings: PayJoyVoiceConfig) {
    const token = randomUUID();
    const claimed = await db.payJoyVoiceCall.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "CHECKING", claimToken: token, claimExpiresAt: new Date(now().getTime() + LEASE) } });
    if (claimed.count !== 1) return null;
    let reason: string | null = null, skip = false;
    try {
      const payload = await readPayload(item.deviceTag);
      const contact = parsePayJoyDaptaPhone(item.deviceTag, payload);
      if (contact.phone !== item.phone) reason = "PHONE_CHANGED";
      else { reason = paymentSkip(payload, now()); skip = Boolean(reason); }
    } catch (error) { reason = safeCode((error as { code?: unknown })?.code); }
    return db.$transaction(async tx => {
      await lock(tx, item.batchId);
      const batch = await tx.payJoyVoiceBatch.findUniqueOrThrow({ where: { id: item.batchId } });
      const suppression = await tx.payJoyContactSuppression.findUnique({ where: { phone: item.phone } });
      const currentSettings = config();
      if (batch.status !== "SCHEDULED") reason = "CANCELLED_BY_USER";
      else if (now() < START || now() >= END) { reason = "WINDOW_EXPIRED"; skip = true; }
      else if (suppression) { reason = "OPT_OUT"; skip = true; }
      else if (!payJoyVoiceConfigured(currentSettings) || currentSettings.agentId !== batch.agentId || currentSettings.fromNumber !== batch.fromNumber || !currentSettings.allowedDevices.includes(item.deviceTag)) reason = "CONFIGURATION_CHANGED";
      const changed = await tx.payJoyVoiceCall.updateMany({ where: { id: item.id, status: "CHECKING", claimToken: token }, data: {
        status: reason ? skip ? "SKIPPED" : "HELD" : "DISPATCHING", reasonCode: reason, preflightAt: now(),
        claimToken: null, claimExpiresAt: reason ? null : new Date(now().getTime() + LEASE), ...(reason ? { completedAt: now() } : { dispatchedAt: now() }),
      } });
      if (!changed.count) return null;
      await event(tx, item.batchId, item.id, `preflight:${item.id}`, reason ? "BLOCKED" : "DISPATCHING", { reason, scriptVersion: VERSION });
      await settleBatch(tx, item.batchId);
      return reason ? null : { event_id: item.id, event_token: createPayJoyVoiceEventToken(item.id, settings.eventSecret), to_number: item.phone, device_tag: item.deviceTag };
    });
  }
  async function claim() {
    const settings = config();
    if (!payJoyVoiceConfigured(settings)) throw new PayJoyVoiceError("CONFIGURATION_PENDING", 503);
    const row = await db.payJoyVoiceBatch.findUnique({ where: { scopeKey: SCOPE } });
    const result = { batch_id: row?.id ?? null, calls: [] as { event_id: string; event_token: string; to_number: string; device_tag: string }[], agent_id: settings.agentId, from_number: settings.fromNumber };
    if (!row) return result;
    const stale = await db.payJoyVoiceCall.findMany({ where: { batchId: row.id, status: { in: ["CHECKING", "DISPATCHING"] }, claimExpiresAt: { lte: now() } } });
    for (const item of stale) await db.$transaction(async tx => {
      const updated = await tx.payJoyVoiceCall.updateMany({ where: { id: item.id, status: item.status, claimExpiresAt: { lte: now() } }, data: { status: "UNKNOWN", reasonCode: "INTERRUPTED", claimExpiresAt: null, claimToken: null } });
      if (updated.count) await event(tx, row.id, item.id, `unknown:${item.id}`, "UNKNOWN", { reason: "INTERRUPTED" });
    });
    if (now() >= END) {
      await db.$transaction(async tx => {
        await lock(tx, row.id);
        await tx.payJoyVoiceCall.updateMany({ where: { batchId: row.id, status: "PENDING" }, data: { status: "SKIPPED", reasonCode: "WINDOW_EXPIRED", completedAt: now() } });
        await tx.payJoyVoiceBatch.updateMany({ where: { id: row.id, status: "SCHEDULED" }, data: { status: "EXPIRED" } });
      });
      return result;
    }
    if (now() < START || row.status !== "SCHEDULED") return result;
    if (row.agentId !== settings.agentId || row.fromNumber !== settings.fromNumber) {
      await db.$transaction(async tx => {
        await lock(tx, row.id);
        await tx.payJoyVoiceCall.updateMany({ where: { batchId: row.id, status: "PENDING" }, data: { status: "HELD", reasonCode: "CONFIGURATION_CHANGED", completedAt: now() } });
        await event(tx, row.id, null, `configuration-changed:${row.id}`, "CONFIGURATION_CHANGED", {});
        await settleBatch(tx, row.id);
      });
      return result;
    }
    const pending = await db.payJoyVoiceCall.findMany({ where: { batchId: row.id, status: "PENDING" }, orderBy: { deviceTag: "asc" }, take: 7 });
    for (let i = 0; i < pending.length; i += 3) {
      const group = await Promise.allSettled(pending.slice(i, i + 3).map(item => claimOne(item, settings)));
      for (const entry of group) if (entry.status === "fulfilled" && entry.value) result.calls.push(entry.value);
      // A failed DB commit leaves a durable claim, never a silently repeatable call.
      if (group.some(entry => entry.status === "rejected")) throw new PayJoyVoiceError("INTERNAL", 503);
    }
    return result;
  }
  async function tokenCall(value: unknown, requireAuthorized = true) {
    const id = readPayJoyVoiceEventToken(value, config().eventSecret, now());
    if (!id) throw new PayJoyVoiceError("INVALID_TOKEN", 401);
    const call = await db.payJoyVoiceCall.findUnique({ where: { id } });
    if (!call || !call.dispatchedAt || (requireAuthorized && !call.dispatchAuthorizedAt)) throw new PayJoyVoiceError("INVALID_STATE", 409);
    return call;
  }
  async function authorizeDispatch(input: Record<string, unknown>) {
    const call = await tokenCall(input.event_token, false);
    return db.$transaction(async tx => {
      await lock(tx, call.batchId);
      const current = await tx.payJoyVoiceCall.findUniqueOrThrow({ where: { id: call.id } });
      if (current.status !== "DISPATCHING" || current.dispatchAuthorizedAt) return { allowed: false };
      if (!current.claimExpiresAt || current.claimExpiresAt <= now()) {
        await tx.payJoyVoiceCall.updateMany({ where: { id: call.id, status: "DISPATCHING", dispatchAuthorizedAt: null }, data: { status: "UNKNOWN", reasonCode: "INTERRUPTED", claimExpiresAt: null } });
        await event(tx, call.batchId, call.id, `unknown:${call.id}`, "UNKNOWN", { reason: "INTERRUPTED" });
        return { allowed: false };
      }
      const batch = await tx.payJoyVoiceBatch.findUniqueOrThrow({ where: { id: call.batchId } });
      const settings = config(), suppression = await tx.payJoyContactSuppression.findUnique({ where: { phone: call.phone } });
      const reason = batch.status !== "SCHEDULED" ? "CANCELLED_BY_USER"
        : now() < START || now() >= END ? "WINDOW_EXPIRED"
          : suppression ? "OPT_OUT"
            : !payJoyVoiceConfigured(settings) || settings.agentId !== batch.agentId || settings.fromNumber !== batch.fromNumber || !settings.allowedDevices.includes(call.deviceTag) ? "CONFIGURATION_CHANGED" : null;
      if (reason) {
        await tx.payJoyVoiceCall.updateMany({ where: { id: call.id, status: "DISPATCHING", dispatchAuthorizedAt: null }, data: { status: "HELD", reasonCode: reason, claimExpiresAt: null, completedAt: now() } });
        await event(tx, call.batchId, call.id, `dispatch-denied:${call.id}`, "DISPATCH_DENIED", { reason });
        return { allowed: false };
      }
      const granted = await tx.payJoyVoiceCall.updateMany({ where: { id: call.id, status: "DISPATCHING", dispatchAuthorizedAt: null }, data: { dispatchAuthorizedAt: now(), claimExpiresAt: new Date(now().getTime() + LEASE) } });
      if (!granted.count) return { allowed: false };
      await event(tx, call.batchId, call.id, `dispatch-authorized:${call.id}`, "DISPATCH_AUTHORIZED", {});
      return { allowed: true, to_number: call.phone, device_tag: call.deviceTag, event_id: call.id };
    });
  }
  async function receipt(input: Record<string, unknown>) {
    const call = await tokenCall(input.event_token);
    if (typeof input.accepted !== "boolean") throw new PayJoyVoiceError("INVALID_INPUT");
    const callId = providerCallId(input.call_id);
    if (input.accepted && (!callId || (input.error_code !== undefined && input.error_code !== null && input.error_code !== ""))) throw new PayJoyVoiceError("INVALID_INPUT");
    return db.$transaction(async tx => {
      await lock(tx, call.batchId);
      const current = await tx.payJoyVoiceCall.findUniqueOrThrow({ where: { id: call.id } });
      if (["CANCELLED", "SKIPPED", "HELD"].includes(current.status)) throw new PayJoyVoiceError("INVALID_STATE", 409);
      if (current.providerCallId && callId && current.providerCallId !== callId) throw new PayJoyVoiceError("CALL_MISMATCH", 409);
      if (callId) {
        const other = await tx.payJoyVoiceCall.findUnique({ where: { providerCallId: callId } });
        if (other && other.id !== current.id) throw new PayJoyVoiceError("CALL_MISMATCH", 409);
      }
      const accepted = input.accepted === true;
      const values = accepted ? { providerCallId: callId!, acceptedAt: current.acceptedAt ?? now(), ...(current.status === "DISPATCHING" || current.status === "UNKNOWN" ? { status: "ACCEPTED", reasonCode: null } : {}) }
        : current.providerCallId || ["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(current.status) ? {} : { status: "UNKNOWN", reasonCode: "PROVIDER_UNCERTAIN" };
      await tx.payJoyVoiceCall.update({ where: { id: call.id }, data: { ...values, claimExpiresAt: null } });
      await event(tx, call.batchId, call.id, `receipt:${call.id}:${accepted}:${callId ?? "none"}`, accepted ? "ACCEPTED" : "UNKNOWN_RECEIPT", { accepted, providerCallId: callId }, "PROVIDER");
      return { accepted, recorded: true };
    });
  }
  async function operation(input: Record<string, unknown>) {
    const call = await tokenCall(input.event_token);
    const action = input.action;
    if (!["verify_identity", "outcome", "optout"].includes(String(action))) throw new PayJoyVoiceError("INVALID_INPUT");
    const note = input.note;
    if (note !== undefined && (typeof note !== "string" || note.length > 160 || /[\u0000-\u001f\u007f<>]/.test(note))) throw new PayJoyVoiceError("INVALID_INPUT");
    return db.$transaction(async tx => {
      await lock(tx, call.batchId);
      const current = await tx.payJoyVoiceCall.findUniqueOrThrow({ where: { id: call.id } });
      if (action === "optout") {
        await tx.payJoyContactSuppression.upsert({ where: { phone: call.phone }, create: { phone: call.phone, reason: "OPT_OUT", source: "VOICE_OPERATION", sourceCallId: call.id, createdAt: now() }, update: {} });
        await tx.payJoyVoiceCall.updateMany({ where: { phone: call.phone, OR: [{ status: { in: ["PENDING", "CHECKING"] } }, { status: "DISPATCHING", dispatchAuthorizedAt: null }] }, data: { status: "SKIPPED", reasonCode: "OPT_OUT", completedAt: now() } });
        await tx.payJoyVoiceCall.update({ where: { id: call.id }, data: { latestOutcome: "OPT_OUT" } });
        await event(tx, call.batchId, call.id, `optout:${call.id}`, "OPT_OUT", {}, "CALLER");
        return { recorded: true, do_not_contact: true, end_call: true };
      }
      if (action === "verify_identity") {
        if (input.confirmed !== true && input.confirmed !== "true") return { allowed: false, end_call: true };
        if (!ACTIVE.includes(current.status) || await tx.payJoyContactSuppression.findUnique({ where: { phone: call.phone } })) return { allowed: false, end_call: true };
        await tx.payJoyVoiceCall.update({ where: { id: call.id }, data: { status: "IN_PROGRESS", identityConfirmedAt: current.identityConfirmedAt ?? now() } });
        await event(tx, call.batchId, call.id, `identity:${call.id}`, "IDENTITY_CONFIRMED", { confirmed: true }, "CALLER");
        return { allowed: true, reminder: REMINDER, payment_link: `https://pay.payjoy.com/p/device/${call.deviceTag}`, agreement: "112090" };
      }
      if (typeof input.outcome !== "string" || !OUTCOMES.has(input.outcome)) throw new PayJoyVoiceError("INVALID_INPUT");
      if (["PAID_REPORTED", "PAYMENT_INTENT"].includes(input.outcome) && !current.identityConfirmedAt) throw new PayJoyVoiceError("INVALID_STATE", 409);
      await tx.payJoyVoiceCall.update({ where: { id: call.id }, data: { latestOutcome: current.latestOutcome === "OPT_OUT" ? "OPT_OUT" : input.outcome } });
      // Free-form speech is deliberately not stored. An outcome is not a payment or an approved agreement.
      await event(tx, call.batchId, call.id, `outcome:${call.id}:${input.outcome}`, "OUTCOME_REPORTED", { outcome: input.outcome }, "CALLER");
      return { recorded: true, payment_confirmed: false, agreement_approved: false };
    });
  }
  async function callback(input: Record<string, unknown>) {
    const body = record(input.call);
    if (!body) throw new PayJoyVoiceError("INVALID_INPUT");
    const variables = record(body.dynamic_variables) || record(body.llm_dynamic_variables);
    const call = await tokenCall(variables?.event_token);
    const callId = providerCallId(body.call_id);
    if (!callId) throw new PayJoyVoiceError("INVALID_INPUT");
    return db.$transaction(async tx => {
      await lock(tx, call.batchId);
      const current = await tx.payJoyVoiceCall.findUniqueOrThrow({ where: { id: call.id } });
      const other = await tx.payJoyVoiceCall.findUnique({ where: { providerCallId: callId } });
      if ((current.providerCallId && current.providerCallId !== callId) || (other && other.id !== current.id)) throw new PayJoyVoiceError("CALL_MISMATCH", 409);
      const reason = typeof body.disconnection_reason === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(body.disconnection_reason) ? body.disconnection_reason : null;
      const analysisEnvelope = record(body.call_analysis);
      const analysis = record(analysisEnvelope?.custom_analysis_data) || analysisEnvelope;
      let outcome = typeof analysis?.outcome === "string" && OUTCOMES.has(analysis.outcome) ? analysis.outcome : null;
      if (outcome && ["PAID_REPORTED", "PAYMENT_INTENT"].includes(outcome) && !current.identityConfirmedAt) outcome = null;
      const optout = analysis?.optout_requested === true || analysis?.optout_requested === "true";
      const endTimestamp = typeof body.end_timestamp === "number" ? body.end_timestamp : NaN;
      const endedAt = endTimestamp < 10_000_000_000 ? endTimestamp * 1000 : endTimestamp;
      const terminal = typeof body.call_status === "string" ? ["ended", "error"].includes(body.call_status)
        : (Number.isFinite(endedAt) && endedAt >= current.dispatchedAt!.getTime() && endedAt <= now().getTime() + 60_000)
          || Boolean(analysis && Object.keys(analysis).length && reason);
      if (optout) await tx.payJoyContactSuppression.upsert({ where: { phone: call.phone }, create: { phone: call.phone, reason: "OPT_OUT", source: "VOICE_CALLBACK", sourceCallId: call.id, createdAt: now() }, update: {} });
      await tx.payJoyVoiceCall.update({ where: { id: call.id }, data: { providerCallId: callId, acceptedAt: current.acceptedAt ?? now(),
        ...(terminal ? { status: "COMPLETED", completedAt: current.completedAt ?? now(), claimExpiresAt: null } : ["DISPATCHING", "UNKNOWN"].includes(current.status) ? { status: "ACCEPTED" } : {}),
        ...(optout || outcome ? { latestOutcome: optout || current.latestOutcome === "OPT_OUT" ? "OPT_OUT" : current.latestOutcome ?? outcome } : {}) } });
      await event(tx, call.batchId, call.id, `callback:${call.id}:${hash({ callId, reason, outcome, optout, terminal })}`, terminal ? "CALL_COMPLETED" : "CALL_EVENT", { providerCallId: callId, reason, outcome, optout, terminal }, "PROVIDER");
      await settleBatch(tx, call.batchId);
      return { recorded: true };
    });
  }
  return { get, schedule, cancel, claim, authorizeDispatch, receipt, operation, callback };
}

export const payJoyVoiceService = createPayJoyVoiceService();
