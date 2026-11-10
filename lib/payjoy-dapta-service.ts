import "server-only";
import { createHash, randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import type { PayJoyDaptaBatch, PayJoyDaptaItem } from "@/app/generated/prisma/client";
import type { getSessionUser } from "@/lib/auth";
import { puedePrepararBorradoresPayJoyDapta } from "@/lib/payjoy-dapta-access";
import { readPayJoyDaptaPhone } from "@/lib/payjoy-dapta-phone-provider";
import { PAYJOY_DAPTA_AGREEMENT, PAYJOY_DAPTA_DEVICE_LIMIT } from "@/lib/payjoy-dapta-types";
import type { PayJoyDaptaBatchResponse, PayJoyDaptaBatchView, PayJoyDaptaHistoryResponse, PayJoyDaptaItemView } from "@/lib/payjoy-dapta-types";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type BatchWithItems = PayJoyDaptaBatch & { items: PayJoyDaptaItem[] };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TAG = /^D[A-Z\d]{5,31}$/;
const HISTORY_LIMIT = 20;
const LOOKUP_LIMIT = 3;
const LEASE_MS = 120_000;
const MESSAGE = "Hola, te contactamos de CONECTAMOS por tu crédito PayJoy. Puedes pagar en Efecty, convenio 112090 — Adelantos Colombia, con la cédula del titular como referencia. Consulta el valor a pagar en PayJoy antes de realizar el pago. Si ya pagaste, puedes omitir este recordatorio.";
const messages: Record<string, string> = {
  UNAUTHENTICATED: "Inicia sesión para preparar borradores de PayJoy.",
  FORBIDDEN: "Solo los perfiles Administrador y Auditor pueden preparar estos borradores.",
  INVALID_INPUT: "Revisa los códigos PayJoy y los datos de la solicitud.",
  IDEMPOTENCY_CONFLICT: "Esta solicitud ya corresponde a otro borrador. Inicia una solicitud nueva.",
  NOT_FOUND: "No se encontró la información solicitada.",
  RATE_LIMIT: "Se alcanzó el límite de consultas. Espera un minuto antes de continuar.",
  RETRY_LIMIT: "Este borrador alcanzó el límite de reintentos. Revisa los errores antes de crear otro.",
  CONFIG: "La consulta de celulares PayJoy no está configurada en el servidor.",
  AUTH: "PayJoy no autorizó la consulta del dispositivo.",
  INVALID_RESPONSE: "No se pudo verificar el celular en la respuesta de PayJoy.",
  PHONE_CONFLICT: "PayJoy devolvió celulares contradictorios. Revisa el contacto del titular antes de continuar.",
  DEVICE_MISMATCH: "La respuesta de PayJoy corresponde a otro dispositivo. El celular no se guardó.",
  UNSUPPORTED_COUNTRY: "El dispositivo no corresponde a una consulta de Colombia. El celular no se guardó.",
  TIMEOUT: "PayJoy no respondió a tiempo. Puedes reintentar esta consulta de forma explícita.",
  UNAVAILABLE: "PayJoy no está disponible. Puedes reintentar la consulta más tarde.",
  LOOKUP_INTERRUPTED: "La consulta quedó interrumpida. Reintenta para volver a consultar PayJoy.",
  INTERNAL: "No se pudo completar la consulta. El registro sigue guardado para revisión.",
};

export class PayJoyDaptaError extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(messages[code] || messages.INTERNAL);
  }
}
function authorize(session: Session) {
  if (!puedePrepararBorradoresPayJoyDapta(session) || session.activo !== true
    || !Number.isSafeInteger(session.id) || session.id < 1 || !Number.isSafeInteger(session.sedeId) || session.sedeId < 1) {
    throw new PayJoyDaptaError("FORBIDDEN", 403);
  }
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new PayJoyDaptaError("INVALID_INPUT");
  return value.toLowerCase();
}
function devices(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new PayJoyDaptaError("INVALID_INPUT");
  const tags = value.map(item => typeof item === "string" ? item.trim().toUpperCase() : "");
  if (tags.some(tag => !TAG.test(tag))) throw new PayJoyDaptaError("INVALID_INPUT");
  const unique = [...new Set(tags)].sort();
  if (unique.length > PAYJOY_DAPTA_DEVICE_LIMIT) throw new PayJoyDaptaError("INVALID_INPUT");
  return unique;
}
function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && Object.hasOwn(messages, code) ? code : "INTERNAL";
}
function isExpired(row: PayJoyDaptaItem, now: number) {
  return row.lookupStatus === "CHECKING" && (!row.claimExpiresAt || row.claimExpiresAt.getTime() <= now);
}
function view(row: BatchWithItems): PayJoyDaptaBatchView {
  const now = Date.now();
  const items: PayJoyDaptaItemView[] = row.items.map(item => {
    const expired = isExpired(item, now);
    const code = expired ? "LOOKUP_INTERRUPTED" : item.errorCode;
    const status = expired ? "ERROR" : item.lookupStatus as PayJoyDaptaItemView["lookupStatus"];
    return {
      id: item.id, deviceTag: item.deviceTag, lookupStatus: status,
      phone: item.phone ? `+${item.phone}` : null, phoneMasked: item.phone ? `+57 *** *** ${item.phone.slice(-4)}` : null,
      phoneSource: item.phoneSource === "PAYJOY_NEQUI_PREFILL" ? item.phoneSource : null,
      // Extraction is never evidence of identity, consent or delivery eligibility.
      ownershipStatus: "PENDING_REVIEW", consentStatus: "PENDING_REVIEW",
      reviewStatus: item.reviewStatus === "DUPLICATE_PHONE" ? "DUPLICATE_PHONE" : "PENDING_REVIEW",
      duplicateOfId: item.duplicateOfId,
      messagePreview: status === "FOUND" && item.reviewStatus !== "DUPLICATE_PHONE" ? row.messageTemplate : null,
      errorCode: code, errorMessage: code ? messages[code] || messages.INTERNAL : null,
      checkedAt: item.checkedAt?.toISOString() ?? null,
    };
  });
  return {
    id: row.id, status: "DRAFT_ONLY", agreement: PAYJOY_DAPTA_AGREEMENT,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), createdBy: row.createdBy,
    counts: {
      total: items.length, pending: items.filter(item => item.lookupStatus === "PENDING").length,
      checking: items.filter(item => item.lookupStatus === "CHECKING").length,
      found: items.filter(item => item.lookupStatus === "FOUND").length,
      missing: items.filter(item => item.lookupStatus === "MISSING").length,
      error: items.filter(item => item.lookupStatus === "ERROR").length,
      duplicatePhones: items.filter(item => item.reviewStatus === "DUPLICATE_PHONE").length,
    }, items,
  };
}
async function batchRow(id: string): Promise<BatchWithItems> {
  const row = await prisma.payJoyDaptaBatch.findUnique({ where: { id }, include: { items: { orderBy: { deviceTag: "asc" } } } });
  if (!row) throw new PayJoyDaptaError("NOT_FOUND", 404);
  return row;
}
async function response(id: string, processedCount = 0): Promise<PayJoyDaptaBatchResponse> {
  const batch = view(await batchRow(id));
  return { batch, hasMore: batch.counts.pending > 0, processedCount, sendingEnabled: false };
}

/** No provider reads on GET, even for interrupted or unfinished drafts. */
export async function getPayJoyDaptaBatch(session: Session, batchId: unknown) {
  authorize(session);
  return response(uuid(batchId));
}
export async function listPayJoyDaptaBatches(session: Session): Promise<PayJoyDaptaHistoryResponse> {
  authorize(session);
  const rows = await prisma.payJoyDaptaBatch.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_LIMIT,
    include: { items: { orderBy: { deviceTag: "asc" } } },
  });
  const batches = rows.map(row => {
    const { items, ...summary } = view(row);
    void items;
    return summary;
  });
  return { batches, limit: HISTORY_LIMIT, sendingEnabled: false };
}

/** Persist first; a lost HTTP response can safely replay this exact request. */
export async function createPayJoyDaptaBatch(session: Session, input: Record<string, unknown>) {
  authorize(session);
  const requestId = uuid(input.requestId), tags = devices(input.devices);
  const inputHash = createHash("sha256").update(JSON.stringify({
    usuarioId: session.id, perfilId: session.perfilId ?? null, sedeId: session.sedeId, tags,
  })).digest("hex");
  const previous = await prisma.payJoyDaptaBatch.findUnique({ where: { requestId } });
  if (previous) {
    if (previous.inputHash !== inputHash) throw new PayJoyDaptaError("IDEMPOTENCY_CONFLICT", 409);
    return response(previous.id);
  }
  const recent = await prisma.payJoyDaptaBatch.count({ where: {
    usuarioId: session.id, perfilId: session.perfilId ?? null, sedeId: session.sedeId,
    createdAt: { gt: new Date(Date.now() - 60_000) },
  } });
  if (recent >= 5) throw new PayJoyDaptaError("RATE_LIMIT", 429);
  let id: string;
  try {
    const row = await prisma.payJoyDaptaBatch.create({ data: {
      id: randomUUID(), requestId, inputHash, usuarioId: session.id, perfilId: session.perfilId ?? null, sedeId: session.sedeId,
      createdBy: (session.perfilNombre || session.nombre).trim().slice(0, 100),
      status: "DRAFT_ONLY", agreement: PAYJOY_DAPTA_AGREEMENT, messageTemplate: MESSAGE,
      items: { create: tags.map(deviceTag => ({ id: randomUUID(), deviceTag })) },
    } });
    id = row.id;
  } catch (error) {
    if ((error as { code?: unknown })?.code !== "P2002") throw error;
    const existing = await prisma.payJoyDaptaBatch.findUnique({ where: { requestId } });
    if (!existing || existing.inputHash !== inputHash) throw new PayJoyDaptaError("IDEMPOTENCY_CONFLICT", 409);
    id = existing.id;
  }
  return response(id);
}

async function closeInterruptedLookups(batchId: string) {
  await prisma.payJoyDaptaItem.updateMany({ where: {
    batchId, lookupStatus: "CHECKING", OR: [{ claimExpiresAt: { lte: new Date() } }, { claimExpiresAt: null }],
  }, data: { lookupStatus: "ERROR", errorCode: "LOOKUP_INTERRUPTED", claimToken: null, claimExpiresAt: null, checkedAt: new Date() } });
}

async function lookupOne(item: PayJoyDaptaItem): Promise<boolean> {
  const claimToken = randomUUID();
  const claimed = await prisma.payJoyDaptaItem.updateMany({ where: { id: item.id, lookupStatus: "PENDING" }, data: {
    lookupStatus: "CHECKING", claimToken, claimExpiresAt: new Date(Date.now() + LEASE_MS),
    attempts: { increment: 1 }, errorCode: null,
  } });
  if (claimed.count !== 1) return false;
  let phone: string | null = null;
  let code: string | null = null;
  try {
    const result = await readPayJoyDaptaPhone(item.deviceTag);
    if (!result || (result.phone !== null && typeof result.phone !== "string")) throw new PayJoyDaptaError("INVALID_RESPONSE");
    if (result.phone !== null) {
      // The adapter must identify its exact observed source. No contact is inferred
      // from Nequi input names, unknown JSON fields or browser-supplied values.
      const normalized = result.phone.replace(/^\+/, "");
      if (result.source !== "PAYJOY_NEQUI_PREFILL" || !/^573\d{9}$/.test(normalized)) throw new PayJoyDaptaError("INVALID_RESPONSE");
      phone = normalized;
    }
  } catch (error) { code = safeErrorCode(error); }

  await prisma.$transaction(async tx => {
    // Serialize deduplication within the draft, including concurrent validators.
    // The external read is already finished; no network call holds this lock.
    await tx.$queryRaw`SELECT "id" FROM "PayJoyDaptaBatch" WHERE "id" = ${item.batchId} FOR UPDATE`;
    const saved = await tx.payJoyDaptaItem.updateMany({ where: { id: item.id, lookupStatus: "CHECKING", claimToken }, data: {
      lookupStatus: code ? "ERROR" : phone ? "FOUND" : "MISSING", phone,
      phoneSource: phone ? "PAYJOY_NEQUI_PREFILL" : null, errorCode: code,
      claimToken: null, claimExpiresAt: null, checkedAt: new Date(),
    } });
    if (!saved.count) return; // A late response cannot overwrite a newer explicit lookup.
    if (phone) {
      const shared = await tx.payJoyDaptaItem.findMany({ where: { batchId: item.batchId, phone }, orderBy: { deviceTag: "asc" } });
      if (shared.length > 1) {
        // A shared phone is not proof that devices belong to the same person.
        // Keep every affected row for review, but do not prepare duplicate text.
        await tx.payJoyDaptaItem.updateMany({ where: { batchId: item.batchId, phone }, data: { reviewStatus: "DUPLICATE_PHONE", duplicateOfId: shared[0].id } });
        await tx.payJoyDaptaItem.update({ where: { id: shared[0].id }, data: { duplicateOfId: null } });
      }
    }
    await tx.payJoyDaptaBatch.update({ where: { id: item.batchId }, data: { updatedAt: new Date() } });
  });
  return true;
}

/** Explicit read-only validation, bounded per request. No Dapta transport exists. */
export async function validatePayJoyDaptaBatch(session: Session, batchId: unknown) {
  authorize(session);
  const id = uuid(batchId);
  await batchRow(id);
  await closeInterruptedLookups(id);
  const pending = await prisma.payJoyDaptaItem.findMany({ where: { batchId: id, lookupStatus: "PENDING" }, orderBy: { deviceTag: "asc" }, take: LOOKUP_LIMIT });
  const results = await Promise.allSettled(pending.map(lookupOne));
  // Let completed siblings settle before surfacing a DB failure. Persisted claims
  // retain interrupted work for an explicit retry instead of silently repeating it.
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return response(id, results.filter(result => result.status === "fulfilled" && result.value).length);
}

export async function retryPayJoyDaptaBatch(session: Session, input: Record<string, unknown>) {
  authorize(session);
  const id = uuid(input.batchId), requestId = uuid(input.requestId);
  await batchRow(id);
  await closeInterruptedLookups(id);
  const fresh = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "PayJoyDaptaBatch" WHERE "id" = ${id} FOR UPDATE`;
    const batch = await tx.payJoyDaptaBatch.findUniqueOrThrow({ where: { id } });
    if (batch.retryRequestIds.includes(requestId)) return false;
    if (batch.retryRequestIds.length >= 30) throw new PayJoyDaptaError("RETRY_LIMIT", 429);
    await tx.payJoyDaptaItem.updateMany({ where: { batchId: id, lookupStatus: "ERROR" }, data: { lookupStatus: "PENDING", errorCode: null, checkedAt: null } });
    await tx.payJoyDaptaBatch.update({ where: { id }, data: { retryRequestIds: { push: requestId } } });
    return true;
  });
  return fresh ? validatePayJoyDaptaBatch(session, id) : response(id);
}
