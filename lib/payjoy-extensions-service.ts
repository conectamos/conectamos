import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import prisma from "@/lib/prisma";
import type { PayJoyExtensionOperation, Prisma } from "@/app/generated/prisma/client";
import type { getSessionUser } from "@/lib/auth";
import { puedeConsultarExtensionesPayJoy, puedeGestionarExtensionesPayJoy, scopeRegistrosExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import { readPayJoyExtensionDevice, isPayJoyRetailConfigured } from "@/lib/payjoy-retail";
import { findStoredPayJoyExtensionDevice } from "@/lib/payjoy-extensions-device-store";
import { beginPayJoyExtension, refreshPayJoyExtensionOptions, selectPayJoyExtension, PayJoyExtensionsProviderError, type PayJoyExtensionOption } from "@/lib/payjoy-extensions-provider";
import type { PayJoyExtensionOperationView } from "@/lib/payjoy-extensions-types";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
const TTL = 15 * 60_000;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const DEVICE_TAG = /^D[A-Z\d]{5,31}$/;
const errors: Record<string, string> = {
  CONFIG: "Falta configurar la consulta de PayJoy en el servidor. Puedes consultar con el identificador del dispositivo.",
  MISSING_DEVICE_TAG: "PayJoy no devolvió el identificador de extensiones. Usa Consultar por dispositivo con el código de PayJoy del equipo.",
  DEVICE_UNRESOLVED: "PayJoy respondió sin los datos del equipo. Usa Consultar por dispositivo con el código del enlace de PayJoy. Si no podemos comprobar su asociación, solicita la revisión de un administrador.",
  DEVICE_ASSOCIATION_CONFLICT: "Los registros tienen asociaciones distintas para este dispositivo. Un administrador debe verificar el código y el cliente antes de continuar.",
  AUTH: "PayJoy no autorizó la consulta. Revisa la configuración del servidor.",
  NOT_FOUND: "PayJoy no encontró información para este dispositivo.",
  RATE_LIMIT: "PayJoy alcanzó su límite de consultas. Intenta más tarde.",
  TIMEOUT: "PayJoy tardó demasiado en responder.",
  UNAVAILABLE: "PayJoy no está disponible en este momento.",
  INVALID_RESPONSE: "No se pudo verificar la respuesta de PayJoy.",
  SERVICE_UNAVAILABLE: "PayJoy no tiene habilitadas las extensiones para este dispositivo.",
  REJECTED: "PayJoy rechazó la solicitud de extensión.",
  INTERRUPTED: "No se pudo confirmar el resultado. Revisa la gestión en PayJoy antes de realizar otra extensión.",
  OPTIONS_CHANGED: "Las opciones de PayJoy cambiaron. No se envió la extensión. Consulta nuevamente antes de confirmar.",
  EXPIRED: "Esta consulta venció. Consulta las opciones nuevamente.",
  DEVICE_BUSY: "Este dispositivo tiene una gestión en curso o pendiente de verificación.",
  FORBIDDEN_DEVICE: "El dispositivo no está disponible dentro de tus registros autorizados.",
  INTERNAL: "No se pudo completar la consulta. Intenta nuevamente más tarde.",
};

export class PayJoyExtensionsError extends Error {
  constructor(public code: string, public status = 400, message?: string) {
    super(message || errors[code] || errors.INTERNAL);
  }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function errorCode(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && Object.hasOwn(errors, code) ? code : "INTERNAL";
}
function uniqueError(error: unknown) { return (error as { code?: unknown })?.code === "P2002"; }
function logInvalidProviderResponse(error: unknown) {
  if (error instanceof PayJoyExtensionsProviderError && error.code === "INVALID_RESPONSE") {
    // Fixed classification only: never log remote payloads, tokens or customer identifiers.
    console.warn("PAYJOY_EXTENSIONS_INVALID_RESPONSE", { stage: error.stage || "unknown" });
  }
}
function ownScope(session: Session) { return { usuarioId: session.id, perfilId: session.perfilId, sedeId: session.sedeId }; }
function requireAccess(session: Session, manage = false) {
  if (!puedeConsultarExtensionesPayJoy(session) || (manage && !puedeGestionarExtensionesPayJoy(session))) {
    throw new PayJoyExtensionsError("FORBIDDEN", 403, "Tu perfil no puede realizar esta acción.");
  }
}
function isPayJoy(row: { plataformaCredito: string; financierasDetalle: unknown }) {
  const match = (value: unknown) => typeof value === "string" && value.replace(/\s/g, "").toUpperCase() === "PAYJOY";
  return match(row.plataformaCredito) || (Array.isArray(row.financierasDetalle) && row.financierasDetalle.some((item) => item && typeof item === "object" && match(item.plataformaCredito)));
}
const localSelect = {
  id: true, clienteNombre: true, documentoNumero: true, serialImei: true, referenciaEquipo: true,
  plataformaCredito: true, financierasDetalle: true,
} as const;
function localScope(session: Session) {
  return { ...scopeRegistrosExtensionesPayJoy(session), eliminadoEn: null, estadoVentaRegistro: { notIn: ["ANULADA", "ANULADO", "RECHAZADA", "RECHAZADO"] } };
}

export async function buscarDispositivosLocalesPayJoy(session: Session, cedula: unknown) {
  requireAccess(session);
  if (typeof cedula !== "string" || !/^\d{5,15}$/.test(cedula.trim())) throw new PayJoyExtensionsError("INVALID_INPUT", 400, "Escribe una cédula de 5 a 15 dígitos.");
  const records = await prisma.registroVendedorVenta.findMany({
    where: { ...localScope(session), documentoNumero: cedula.trim() }, select: localSelect,
    orderBy: { createdAt: "desc" }, take: 101,
  });
  const seen = new Set<string>();
  const devices = records.slice(0, 100).flatMap((row) => {
    const imei = row.serialImei?.trim() || "";
    if (!isPayJoy(row) || !/^\d{15,16}$/.test(imei) || seen.has(imei)) return [];
    seen.add(imei);
    return [{ registroId: row.id, clienteNombre: row.clienteNombre, documentoUltimos4: row.documentoNumero.slice(-4), imei, modelo: row.referenciaEquipo }];
  });
  return { devices, source: "CONECTAMOS" as const, limited: records.length > 100 };
}

function view(row: PayJoyExtensionOperation): PayJoyExtensionOperationView {
  return {
    id: row.id, status: row.status, deviceTag: row.deviceTag, imei: row.imei,
    clienteDocumentoUltimos4: row.clienteDocumentoUltimos4, asesorNombre: row.asesorNombre,
    createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() || null,
    currentValidThrough: row.currentValidThrough?.toISOString() || null,
    options: row.options as unknown as PayJoyExtensionOption[],
    selectedOption: row.selectedOption as unknown as PayJoyExtensionOption | null,
    result: row.response as unknown as PayJoyExtensionOperationView["result"],
    errorCode: row.errorCode, errorMessage: row.errorCode ? errors[row.errorCode] || errors.INTERNAL : null,
  };
}

// A crashed process must never unlock a possibly executed extension.
async function reconcileStale() {
  const stale = new Date(Date.now() - 2 * 60_000);
  await prisma.payJoyExtensionOperation.updateMany({
    where: { status: "EJECUTANDO", updatedAt: { lt: stale } },
    data: { status: "INDETERMINADA", errorCode: "INTERRUPTED", completedAt: new Date() },
  });
  await prisma.payJoyExtensionOperation.updateMany({
    where: { status: "PREPARANDO", updatedAt: { lt: stale } },
    data: { status: "ERROR", activeDeviceKey: null, errorCode: "TIMEOUT", completedAt: new Date() },
  });
  await prisma.payJoyExtensionOperation.updateMany({
    where: { status: { in: ["LISTA", "SIN_OPCIONES"] }, expiresAt: { lt: new Date() } },
    data: { status: "EXPIRADA", activeDeviceKey: null, errorCode: "EXPIRED" },
  });
  await prisma.payJoyExtensionOperation.updateMany({
    where: { status: { in: ["EXITOSA", "RECHAZADA"] }, expiresAt: { lt: new Date() } },
    data: { activeDeviceKey: null },
  });
}

export async function historialExtensionesPayJoy(session: Session) {
  requireAccess(session);
  await reconcileStale();
  const rows = await prisma.payJoyExtensionOperation.findMany({ where: ownScope(session), orderBy: { createdAt: "desc" }, take: 30 });
  return { operations: rows.map(view), canManage: puedeGestionarExtensionesPayJoy(session) };
}

async function assertLocalDeviceScope(session: Session, imei: string) {
  if (Object.keys(scopeRegistrosExtensionesPayJoy(session)).length === 0) return;
  const known = await prisma.registroVendedorVenta.findFirst({ where: { serialImei: imei, eliminadoEn: null }, select: { id: true } });
  if (!known) return; // Manual codes may belong to clients not registered locally.
  const authorized = await prisma.registroVendedorVenta.findFirst({ where: { ...localScope(session), serialImei: imei }, select: { id: true } });
  if (!authorized) throw new PayJoyExtensionsError("FORBIDDEN_DEVICE", 403);
}

export async function prepararExtensionPayJoy(session: Session, input: Record<string, unknown>) {
  requireAccess(session);
  const key = input.idempotencyKey;
  const registroId = input.registroId;
  const tag = typeof input.deviceTag === "string" ? input.deviceTag.trim().toUpperCase() : null;
  if (typeof key !== "string" || !UUID.test(key) ||
      (registroId !== undefined ? !Number.isSafeInteger(registroId) || Number(registroId) <= 0 || tag !== null : !tag || !DEVICE_TAG.test(tag))) {
    throw new PayJoyExtensionsError("INVALID_INPUT", 400, "Selecciona un equipo o ingresa un identificador PayJoy válido.");
  }
  const inputHash = createHash("sha256").update(JSON.stringify({ ...ownScope(session), registroId: registroId ?? null, tag })).digest("hex");
  await reconcileStale();
  const previous = await prisma.payJoyExtensionOperation.findUnique({ where: { idempotencyKey: key } });
  if (previous) {
    if (previous.inputHash !== inputHash) throw new PayJoyExtensionsError("IDEMPOTENCY_CONFLICT", 409, "La solicitud ya está asociada a otra consulta.");
    return view(previous);
  }
  let record = null;
  if (registroId !== undefined) {
    record = await prisma.registroVendedorVenta.findFirst({ where: { ...localScope(session), id: Number(registroId) }, select: localSelect });
    if (!record || !isPayJoy(record) || !/^\d{15,16}$/.test(record.serialImei?.trim() || "")) throw new PayJoyExtensionsError("FORBIDDEN_DEVICE", 404);
  }
  const imei = record?.serialImei?.trim() || null;
  // Retail lookup is needed to enforce local ownership for manual device tags.
  if (tag && !isPayJoyRetailConfigured() && Object.keys(scopeRegistrosExtensionesPayJoy(session)).length !== 0) {
    throw new PayJoyExtensionsError("CONFIG", 503, "Falta configurar PayJoy en el servidor para validar el dispositivo y tus permisos.");
  }
  const lock = tag || `IMEI:${imei}`;
  const active = await prisma.payJoyExtensionOperation.findFirst({ where: {
    activeDeviceKey: { not: null },
    OR: [{ activeDeviceKey: lock }, ...(imei ? [{ imei }] : [])],
  } });
  if (active) {
    if (active.usuarioId === session.id && active.perfilId === session.perfilId && active.sedeId === session.sedeId) return view(active);
    throw new PayJoyExtensionsError("DEVICE_BUSY", 409);
  }
  // Bound accidental floods; never use in-memory rate limits for a multi-replica deployment.
  const recent = await prisma.payJoyExtensionOperation.count({ where: { ...ownScope(session), createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent >= 10) throw new PayJoyExtensionsError("RATE_LIMIT", 429);
  const id = randomUUID();
  let row: PayJoyExtensionOperation;
  try {
    row = await prisma.payJoyExtensionOperation.create({ data: {
      id, idempotencyKey: key, inputHash, ...ownScope(session), asesorNombre: session.perfilNombre || session.nombre,
      registroId: record?.id || null, clienteDocumentoUltimos4: record?.documentoNumero.slice(-4) || null,
      imei, deviceTag: tag, status: "PREPARANDO", activeDeviceKey: lock,
      providerIdempotencyKey: `conectamos-${id}`, options: [], expiresAt: new Date(Date.now() + TTL),
    } });
  } catch (error) {
    if (!uniqueError(error)) throw error;
    const existing = await prisma.payJoyExtensionOperation.findFirst({ where: { ...ownScope(session), OR: [{ idempotencyKey: key, inputHash }, { activeDeviceKey: lock }] } });
    if (existing) return view(existing);
    throw new PayJoyExtensionsError("DEVICE_BUSY", 409);
  }
  try {
    let deviceTag = tag;
    if (imei || isPayJoyRetailConfigured()) {
      let device: Pick<Awaited<ReturnType<typeof readPayJoyExtensionDevice>>, "imei" | "deviceTag" | "customerId"> | null = null;
      try { device = await readPayJoyExtensionDevice(imei || tag!); }
      catch (error) {
        // Only the observed empty response can use an independently verified association.
        // Transport/authentication errors or contradictory identities never use this fallback.
        if (errorCode(error) !== "DEVICE_UNRESOLVED") throw error;
      }
      if (!device?.deviceTag) {
        // The commercial record was authorized above. Imported reports only resolve that
        // exact IMEI/document pair; they never broaden the cédula search or role/sede scope.
        const stored = await findStoredPayJoyExtensionDevice(record
          ? { imei: record.serialImei!.trim(), documentoNumero: record.documentoNumero }
          : { deviceTag: tag! });
        if (stored) {
          await assertLocalDeviceScope(session, stored.imei);
          if (!record) {
            const owned = await prisma.registroVendedorVenta.findFirst({
              where: { ...localScope(session), serialImei: stored.imei, documentoNumero: stored.documentoNumero }, select: localSelect,
            });
            if (owned && isPayJoy(owned)) record = owned;
            else if (Object.keys(scopeRegistrosExtensionesPayJoy(session)).length !== 0) {
              throw new PayJoyExtensionsError("FORBIDDEN_DEVICE", 403);
            }
          }
          device = { imei: stored.imei, deviceTag: stored.deviceTag, customerId: device?.customerId || null };
        } else if (tag && Object.keys(scopeRegistrosExtensionesPayJoy(session)).length === 0) {
          // Administrative identities already have explicit global device access.
          // A manually supplied tag is not attributed to an unverified customer or IMEI.
          device = { imei: null, deviceTag: tag, customerId: null };
        } else {
          throw new PayJoyExtensionsError(device ? "MISSING_DEVICE_TAG" : "DEVICE_UNRESOLVED", 422);
        }
      }
      if (device.imei) await assertLocalDeviceScope(session, device.imei);
      deviceTag = device.deviceTag;
      if (!deviceTag) throw new PayJoyExtensionsError("MISSING_DEVICE_TAG", 422);
      row = await prisma.payJoyExtensionOperation.update({ where: { id }, data: {
        deviceTag, activeDeviceKey: deviceTag, imei: device.imei, clienteIdPayjoy: device.customerId,
        registroId: record?.id || null, clienteDocumentoUltimos4: record?.documentoNumero.slice(-4) || null,
      } });
    }
    if (!deviceTag) throw new PayJoyExtensionsError("MISSING_DEVICE_TAG", 422);
    const response = await beginPayJoyExtension(deviceTag, row.providerIdempotencyKey);
    const hasOptions = response.options.some((option) => option.available);
    const saved = await prisma.payJoyExtensionOperation.updateMany({ where: { id, status: "PREPARANDO" }, data: {
      providerRequestId: response.requestId, currentValidThrough: response.currentValidThrough ? new Date(response.currentValidThrough) : null,
      options: json(response.options), status: hasOptions ? "LISTA" : "SIN_OPCIONES",
      ...(!hasOptions ? { activeDeviceKey: null } : {}),
    } });
    if (saved.count !== 1) throw new PayJoyExtensionsError("INTERRUPTED", 409);
  } catch (error) {
    // Preparing only creates a provider request; it never grants an extension.
    logInvalidProviderResponse(error);
    await prisma.payJoyExtensionOperation.updateMany({ where: { id, status: "PREPARANDO" }, data: {
      status: "ERROR", activeDeviceKey: null, errorCode: uniqueError(error) ? "DEVICE_BUSY" : errorCode(error), completedAt: new Date(),
    } });
  }
  return view((await prisma.payJoyExtensionOperation.findUniqueOrThrow({ where: { id } })));
}

export async function confirmarExtensionPayJoy(session: Session, input: Record<string, unknown>) {
  requireAccess(session, true);
  if (typeof input.operationId !== "string" || !UUID.test(input.operationId) || input.confirmed !== true ||
      typeof input.optionId !== "string" || input.optionId.length > 160 || typeof input.reason !== "string" || input.reason.length > 300) {
    throw new PayJoyExtensionsError("INVALID_INPUT", 400, "Revisa la opción y confirma la gestión.");
  }
  await reconcileStale();
  let row = await prisma.payJoyExtensionOperation.findFirst({ where: { id: input.operationId, ...ownScope(session) } });
  if (!row) throw new PayJoyExtensionsError("NOT_FOUND", 404, "La gestión no está disponible para tu perfil.");
  if (row.selectedOption) {
    const selected = row.selectedOption as unknown as PayJoyExtensionOption;
    if (selected.id !== input.optionId || row.selectedReason !== input.reason) throw new PayJoyExtensionsError("IDEMPOTENCY_CONFLICT", 409, "Esta gestión ya tiene una selección confirmada.");
  }
  if (row.status !== "LISTA") return view(row);
  if (!row.deviceTag || !row.providerRequestId || !row.expiresAt || row.expiresAt <= new Date()) throw new PayJoyExtensionsError("EXPIRED", 409);
  if (row.registroId) {
    const record = await prisma.registroVendedorVenta.findFirst({ where: { ...localScope(session), id: row.registroId }, select: localSelect });
    if (!record || !isPayJoy(record) || record.serialImei?.trim() !== row.imei) throw new PayJoyExtensionsError("FORBIDDEN_DEVICE", 403);
  }
  if (row.imei) await assertLocalDeviceScope(session, row.imei);
  const option = (row.options as unknown as PayJoyExtensionOption[]).find((item) => item.id === input.optionId);
  if (!option?.available || (option.reasons.length ? !option.reasons.some((reason) => reason.id === input.reason) : input.reason !== "")) {
    throw new PayJoyExtensionsError("INVALID_OPTION", 400, "Selecciona una opción y un motivo disponibles en PayJoy.");
  }
  // Atomically claim before remote I/O. Concurrent sends return the existing state.
  const claimed = await prisma.payJoyExtensionOperation.updateMany({ where: { id: row.id, status: "LISTA", expiresAt: { gt: new Date() } }, data: {
    status: "EJECUTANDO", selectedOption: json(option), selectedReason: input.reason,
  } });
  if (claimed.count !== 1) {
    const winner = await prisma.payJoyExtensionOperation.findUniqueOrThrow({ where: { id: row.id } });
    const selected = winner.selectedOption as unknown as PayJoyExtensionOption | null;
    if (selected && (selected.id !== input.optionId || winner.selectedReason !== input.reason)) {
      throw new PayJoyExtensionsError("IDEMPOTENCY_CONFLICT", 409, "Esta gestión ya tiene una selección confirmada.");
    }
    return view(winner);
  }
  let dispatched = false;
  try {
    const fresh = await refreshPayJoyExtensionOptions(row.deviceTag, row.providerRequestId);
    const current = fresh.find((item) => item.id === option.id);
    // JSONB may reorder object properties. Compare every value without treating
    // that storage detail as a change to the terms reviewed by the advisor.
    if (!current?.available || !isDeepStrictEqual(current, option)) throw new PayJoyExtensionsError("OPTIONS_CHANGED", 409);
    dispatched = true;
    const result = await selectPayJoyExtension(row.deviceTag, row.providerRequestId, row.providerIdempotencyKey, {
      extensionType: option.extensionType, extensionTime: option.extensionTime, reason: input.reason,
    });
    // Only an explicit GRANTED response is a successful extension.
    const success = result.success === true && result.status === "GRANTED";
    row = await prisma.payJoyExtensionOperation.update({ where: { id: row.id }, data: {
      status: success ? "EXITOSA" : "RECHAZADA", response: json(result), completedAt: new Date(), expiresAt: new Date(Date.now() + TTL),
    } });
  } catch (error) {
    // Any error after dispatch may have happened after PayJoy applied the change.
    // Retain the device lock and never resend automatically, including DB failures.
    logInvalidProviderResponse(error);
    const uncertain = dispatched && !(error instanceof PayJoyExtensionsProviderError && !error.ambiguous);
    row = await prisma.payJoyExtensionOperation.update({ where: { id: row.id }, data: {
      status: uncertain ? "INDETERMINADA" : errorCode(error) === "REJECTED" ? "RECHAZADA" : "ERROR",
      errorCode: uncertain ? "INTERRUPTED" : errorCode(error),
      ...(uncertain ? {} : { activeDeviceKey: null }), completedAt: new Date(),
    } });
  }
  return view(row);
}
