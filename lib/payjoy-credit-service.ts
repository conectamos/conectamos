import "server-only";
import { createHash, randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import type { PayJoyCreditCheck, PayJoyExtensionOperation, Prisma } from "@/app/generated/prisma/client";
import type { getSessionUser } from "@/lib/auth";
import { puedeConsultarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import { readPayJoyCreditSnapshot } from "@/lib/payjoy-credit-provider";
import type { PayJoyCreditCheckView, PayJoyCreditSnapshot, PayJoyCreditWorkspaceData, PayJoyExtensionFollowUp } from "@/lib/payjoy-credit-types";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TAG = /^D[A-Z\d]{5,31}$/;
const IMEI = /^\d{15,16}$/;
const LIMIT = 30;
const STALE_MS = 180_000;
const messages: Record<string, string> = {
  INVALID_INPUT: "Ingresa un código PayJoy o un IMEI de 15 o 16 dígitos.",
  FORBIDDEN: "Tu perfil no tiene acceso a la ficha de PayJoy.",
  IDEMPOTENCY_CONFLICT: "Esta solicitud pertenece a otra consulta. Inicia una nueva consulta.",
  DEVICE_UNRESOLVED: "PayJoy no informó el código de este IMEI. Consulta con el código que empieza con D.",
  DEVICE_ASSOCIATION_CONFLICT: "La asociación del equipo es contradictoria. Solicita la revisión de un administrador.",
  CONFIG: "Falta configurar la consulta de PayJoy en el servidor. Prueba con el código del dispositivo.",
  AUTH: "PayJoy no autorizó la consulta. Contacta al administrador.",
  NOT_FOUND: "PayJoy no encontró información para este equipo.",
  INVALID_RESPONSE: "No se pudo verificar la información recibida de PayJoy.",
  RATE_LIMIT: "Se alcanzó el límite de consultas. Intenta nuevamente en un minuto.",
  TIMEOUT: "La consulta no terminó a tiempo. Puedes iniciar una nueva consulta; no se ejecutó ninguna gestión.",
  UNAVAILABLE: "PayJoy no está disponible en este momento.",
  INTERNAL: "No se pudo completar la consulta de PayJoy. Intenta nuevamente más tarde.",
};

export class PayJoyCreditError extends Error {
  constructor(public code: string, public status = 400) { super(messages[code] || messages.INTERNAL); }
}
function scope(session: Session) { return { usuarioId: session.id, perfilId: session.perfilId ?? null, sedeId: session.sedeId }; }
function authorize(session: Session) {
  if (!puedeConsultarExtensionesPayJoy(session)) throw new PayJoyCreditError("FORBIDDEN", 403);
}
function errorCode(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && Object.hasOwn(messages, code) ? code : "INTERNAL";
}
function uniqueError(error: unknown) { return (error as { code?: unknown })?.code === "P2002"; }
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function date(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
function checkView(row: PayJoyCreditCheck): PayJoyCreditCheckView {
  const stale = row.status === "CONSULTANDO" && row.createdAt.getTime() < Date.now() - STALE_MS;
  const code = stale ? "TIMEOUT" : row.errorCode;
  return {
    id: row.id, identifier: row.identifier, deviceTag: row.deviceTag, imei: row.imei,
    asesorNombre: row.asesorNombre, status: stale ? "ERROR" : row.status as PayJoyCreditCheckView["status"],
    createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() || null,
    snapshot: row.snapshot as unknown as PayJoyCreditSnapshot | null,
    errorCode: code, errorMessage: code ? messages[code] || messages.INTERNAL : null,
  };
}

/** Read-only provider calls; the audit row is saved before starting the lookup. */
export async function consultarFichaPayJoy(session: Session, input: Record<string, unknown>) {
  authorize(session);
  const identifier = typeof input.identifier === "string" ? input.identifier.trim().toUpperCase() : "";
  if ((!TAG.test(identifier) && !IMEI.test(identifier)) || typeof input.idempotencyKey !== "string" || !UUID.test(input.idempotencyKey)) {
    throw new PayJoyCreditError("INVALID_INPUT", 400);
  }
  const inputHash = createHash("sha256").update(JSON.stringify({ ...scope(session), identifier })).digest("hex");
  // Only this identity's interrupted reads are closed; extension locks are never touched.
  await prisma.payJoyCreditCheck.updateMany({
    where: { ...scope(session), status: "CONSULTANDO", createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "ERROR", errorCode: "TIMEOUT", activeLookupKey: null, completedAt: new Date() },
  });
  const previous = await prisma.payJoyCreditCheck.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (previous) {
    if (previous.inputHash !== inputHash) throw new PayJoyCreditError("IDEMPOTENCY_CONFLICT", 409);
    return checkView(previous);
  }
  const active = await prisma.payJoyCreditCheck.findFirst({ where: { ...scope(session), activeLookupKey: inputHash } });
  if (active) return checkView(active);
  const recent = await prisma.payJoyCreditCheck.count({ where: { ...scope(session), createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent >= 10) throw new PayJoyCreditError("RATE_LIMIT", 429);
  let row: PayJoyCreditCheck;
  try {
    row = await prisma.payJoyCreditCheck.create({ data: {
      id: randomUUID(), idempotencyKey: input.idempotencyKey, inputHash, ...scope(session),
      asesorNombre: session.perfilNombre || session.nombre, identifier,
      deviceTag: TAG.test(identifier) ? identifier : null, imei: IMEI.test(identifier) ? identifier : null,
      status: "CONSULTANDO", activeLookupKey: inputHash,
    } });
  } catch (error) {
    if (!uniqueError(error)) throw error;
    const existing = await prisma.payJoyCreditCheck.findFirst({ where: { ...scope(session), OR: [
      { idempotencyKey: input.idempotencyKey, inputHash }, { activeLookupKey: inputHash },
    ] } });
    if (!existing) throw new PayJoyCreditError("IDEMPOTENCY_CONFLICT", 409);
    return checkView(existing);
  }
  try {
    const snapshot = await readPayJoyCreditSnapshot(identifier);
    // Do not accept contradictory identifiers even if an adapter regresses.
    if ((TAG.test(identifier) && snapshot.deviceTag !== identifier)
      || (IMEI.test(identifier) && snapshot.imei !== identifier)) throw new PayJoyCreditError("INVALID_RESPONSE", 502);
    await prisma.payJoyCreditCheck.updateMany({ where: { id: row.id, status: "CONSULTANDO" }, data: {
      status: "LISTA", deviceTag: snapshot.deviceTag, imei: snapshot.imei,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
      activeLookupKey: null, completedAt: new Date(),
    } });
  } catch (error) {
    await prisma.payJoyCreditCheck.updateMany({ where: { id: row.id, status: "CONSULTANDO" }, data: {
      status: "ERROR", errorCode: errorCode(error), activeLookupKey: null, completedAt: new Date(),
    } });
  }
  return checkView(await prisma.payJoyCreditCheck.findUniqueOrThrow({ where: { id: row.id } }));
}

function extensionBase(row: PayJoyExtensionOperation): PayJoyExtensionFollowUp {
  const selected = object(row.selectedOption);
  const result = object(row.response);
  const granted = row.status === "EXITOSA" && result?.success === true && result.status === "GRANTED";
  const needsReview = row.status === "INDETERMINADA" || row.status === "EJECUTANDO";
  return {
    id: row.id, deviceTag: row.deviceTag, imei: row.imei, asesorNombre: row.asesorNombre, status: row.status,
    createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() || null,
    extensionHours: typeof selected?.extensionTime === "number" && selected.extensionTime > 0 ? selected.extensionTime : null,
    grantedValidThrough: granted ? date(result.newValidThrough) : null,
    followUp: {
      status: needsReview ? "REQUIERE_REVISION" : granted ? "SIN_COMPROBAR" : "NO_APLICA",
      checkId: null, checkedAt: null,
      message: needsReview ? "Verifica el resultado de la extensión en PayJoy. Consultar la ficha no confirma su ejecución ni libera el bloqueo."
        : granted ? "Aún no hay una consulta del equipo iniciada después de esta extensión."
          : "Esta operación no tiene una extensión aplicada y confirmada por PayJoy.",
      currentValidThrough: null, remainingBalance: null, currency: null, paidInFull: null, paymentAfterExtension: null,
    },
  };
}

async function extensionFollowUp(session: Session, row: PayJoyExtensionOperation): Promise<PayJoyExtensionFollowUp> {
  const view = extensionBase(row);
  if (view.followUp.status !== "SIN_COMPROBAR" || !row.completedAt || (!row.deviceTag && !row.imei)) return view;
  // Query each relevant device outside the 30-row display limit. An IMEI match
  // must not bridge contradictory tags, nor a tag match contradictory IMEIs.
  const matches: Prisma.PayJoyCreditCheckWhereInput[] = [
    ...(row.deviceTag ? [{ deviceTag: row.deviceTag }] : []),
    ...(row.imei ? [{ imei: row.imei }] : []),
  ];
  const consistency: Prisma.PayJoyCreditCheckWhereInput[] = [
    ...(row.deviceTag ? [{ OR: [{ deviceTag: row.deviceTag }, { deviceTag: null }] }] : []),
    ...(row.imei ? [{ OR: [{ imei: row.imei }, { imei: null }] }] : []),
  ];
  const check = await prisma.payJoyCreditCheck.findFirst({ where: {
    ...scope(session), createdAt: { gt: row.completedAt }, OR: matches, AND: consistency,
  }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!check) return view;
  const observed = checkView(check);
  view.followUp.checkId = check.id;
  view.followUp.checkedAt = observed.completedAt;
  if (observed.status !== "LISTA" || !observed.snapshot || !check.completedAt) {
    view.followUp.status = observed.status === "ERROR" ? "ERROR_CONSULTA" : "SIN_COMPROBAR";
    view.followUp.message = observed.errorMessage || "La consulta del equipo todavía está en curso.";
    return view;
  }
  const snapshot = observed.snapshot;
  const payment = snapshot.payments.filter(item => item.amount > 0
    && Date.parse(item.paidAt) > row.completedAt!.getTime()
    && Date.parse(item.paidAt) <= check.completedAt!.getTime())
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))[0] || null;
  view.followUp = {
    status: "CONSULTADO", checkId: check.id, checkedAt: check.completedAt.toISOString(),
    currentValidThrough: snapshot.validThrough, remainingBalance: snapshot.remainingBalance,
    currency: snapshot.currency, paidInFull: snapshot.paidInFull, paymentAfterExtension: payment,
    message: payment ? "PayJoy informó un pago posterior a la extensión."
      : snapshot.paymentsAvailability === "NO_DISPONIBLE" ? "Estado consultado. PayJoy no entregó historial de pagos para comprobar un pago posterior."
        : "Estado consultado. Los movimientos recibidos no permiten confirmar un pago posterior; el historial puede ser parcial.",
  };
  return view;
}

/** Reads saved observations only. Never executes, retries or reconciles a grant. */
export async function historialFichaPayJoy(session: Session): Promise<PayJoyCreditWorkspaceData> {
  authorize(session);
  const [checks, operations] = await Promise.all([
    prisma.payJoyCreditCheck.findMany({ where: scope(session), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: LIMIT }),
    prisma.payJoyExtensionOperation.findMany({ where: scope(session), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: LIMIT }),
  ]);
  const extensions = await Promise.all(operations.map(row => extensionFollowUp(session, row)));
  return { checks: checks.map(checkView), extensions, limit: LIMIT, serverTime: new Date().toISOString() };
}
