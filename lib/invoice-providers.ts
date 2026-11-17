import { createHash } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { esAdministradorCentral } from "@/lib/access-control";

export class InvoiceProviderError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_INPUT") { super(message); }
}
type Session = { id: number; perfilId?: number | null; perfilNombre?: string | null; nombre?: string | null;
  usuario?: string; rolNombre?: unknown; perfilTipo?: unknown };
type ProviderRow = { id: number; name: string; active: boolean; version: number };
export type InvoiceProvider = ProviderRow;
const dto = ({ id, name, active, version }: ProviderRow): InvoiceProvider => ({ id, name, active, version });
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("es-CO");
const uniqueConflict = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");

export function assertInvoiceProviderAccess(session: Session | null | undefined): asserts session is Session {
  if (!session) throw new InvoiceProviderError("No autenticado", 401, "UNAUTHENTICATED");
  if (!esAdministradorCentral(session)) throw new InvoiceProviderError("Solo el administrador central puede gestionar proveedores.", 403, "FORBIDDEN");
}
function actor(session: Session) {
  if (!Number.isSafeInteger(session.id) || session.id <= 0) throw new InvoiceProviderError("No fue posible identificar al administrador.", 403, "FORBIDDEN");
  return { createdById: session.id, createdByProfileId: session.perfilId ?? null,
    createdBy: session.perfilNombre || session.nombre || session.usuario || `Administrador ${session.id}` };
}
function nameInput(value: unknown) {
  if (typeof value !== "string") throw new InvoiceProviderError("Indica el nombre del proveedor.");
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > 160 || /[\x00-\x08\x0e-\x1f]/.test(name)) throw new InvoiceProviderError("El proveedor debe tener entre 1 y 160 caracteres.");
  return name;
}
export function administrativeProviderId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") throw new InvoiceProviderError("Selecciona un proveedor válido.");
  if (!/^\d+$/.test(String(value))) throw new InvoiceProviderError("Selecciona un proveedor válido.");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) throw new InvoiceProviderError("Selecciona un proveedor válido.");
  return id;
}
function parse(value: unknown, action: "CREATE" | "RENAME" | "DEACTIVATE", id?: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvoiceProviderError("Los datos enviados no son válidos.");
  const body = value as Record<string, unknown>;
  const allowed = action === "CREATE" ? ["requestId", "name"] : action === "RENAME" ? ["requestId", "version", "name"] : ["requestId", "version"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new InvoiceProviderError("La solicitud contiene campos no permitidos.");
  if (typeof body.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(body.requestId)) throw new InvoiceProviderError("Actualiza la página antes de guardar el proveedor.");
  const version = action === "CREATE" ? null : body.version;
  if (action !== "CREATE" && (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)) throw new InvoiceProviderError("Actualiza el proveedor antes de modificarlo.");
  const name = action === "DEACTIVATE" ? null : nameInput(body.name);
  const hash = createHash("sha256").update(JSON.stringify({ action, id: id ?? null, version, name })).digest("hex");
  return { requestId: body.requestId, version, name, hash };
}
function replay(previous: { requestHash: string; responseSnapshot: unknown }, hash: string) {
  if (previous.requestHash !== hash) throw new InvoiceProviderError("La referencia del intento ya fue usada con otros datos.", 409, "IDEMPOTENCY_CONFLICT");
  const response = previous.responseSnapshot as { provider?: InvoiceProvider } | null;
  if (!response?.provider?.id) throw new InvoiceProviderError("No fue posible verificar el intento anterior.", 503, "INCOMPLETE_REQUEST");
  return { provider: response.provider, replayed: true };
}
async function lockProvider(tx: Prisma.TransactionClient, id: number) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "ProveedorAdministrativo" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new InvoiceProviderError("Proveedor no encontrado.", 404, "PROVIDER_NOT_FOUND");
  return tx.proveedorAdministrativo.findUniqueOrThrow({ where: { id } });
}
async function byAlias(tx: Prisma.TransactionClient, name: string) {
  return tx.proveedorAdministrativoAlias.findUnique({ where: { nameNormalized: normalized(name) } });
}
function duplicate(): never { throw new InvoiceProviderError("Ya existe un proveedor con ese nombre o un nombre anterior reservado.", 409, "DUPLICATE_PROVIDER"); }

export async function readInvoiceProviders(session: Session | null) {
  assertInvoiceProviderAccess(session);
  const rows = await prisma.proveedorAdministrativo.findMany({ where: { active: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return { items: rows.map(dto) };
}

export async function createInvoiceProvider(value: unknown, session: Session | null) {
  assertInvoiceProviderAccess(session);
  const input = parse(value, "CREATE");
  const creator = actor(session);
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.proveedorAdministrativoEvento.findUnique({ where: { requestId: input.requestId } });
      if (previous) return replay(previous, input.hash);
      const alias = await byAlias(tx, input.name!);
      let before: InvoiceProvider | null = null;
      let row;
      if (alias) {
        const current = await lockProvider(tx, alias.providerId);
        // A same-key concurrent request may have completed while this waited.
        const completed = await tx.proveedorAdministrativoEvento.findUnique({ where: { requestId: input.requestId } });
        if (completed) return replay(completed, input.hash);
        if (current.active) duplicate();
        before = dto(current);
        row = await tx.proveedorAdministrativo.update({ where: { id: current.id }, data: { active: true, version: { increment: 1 } } });
      } else {
        row = await tx.proveedorAdministrativo.create({ data: { name: input.name!, nameNormalized: normalized(input.name!), ...creator } });
        await tx.proveedorAdministrativoAlias.create({ data: { nameNormalized: normalized(input.name!), providerId: row.id } });
      }
      const provider = dto(row);
      const response = { provider };
      await tx.proveedorAdministrativoEvento.create({ data: { providerId: row.id, action: before ? "REACTIVATE" : "CREATE",
        requestId: input.requestId, requestHash: input.hash, snapshot: { before, after: provider }, responseSnapshot: response, ...creator } });
      return { ...response, replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.proveedorAdministrativoEvento.findUnique({ where: { requestId: input.requestId } });
    if (previous) return replay(previous, input.hash);
    return duplicate();
  }
}

async function changeProvider(id: number, value: unknown, action: "RENAME" | "DEACTIVATE", session: Session | null) {
  assertInvoiceProviderAccess(session);
  const input = parse(value, action, id);
  const creator = actor(session);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await lockProvider(tx, id);
      const previous = await tx.proveedorAdministrativoEvento.findUnique({ where: { requestId: input.requestId } });
      if (previous) return replay(previous, input.hash);
      if (row.version !== input.version) throw new InvoiceProviderError("El proveedor cambió. Actualiza y revisa los datos.", 409, "STALE_VERSION");
      if (!row.active) throw new InvoiceProviderError("El proveedor está desactivado. Agrégalo nuevamente para reactivarlo.", 409, "PROVIDER_INACTIVE");
      if (action === "RENAME") {
        const alias = await byAlias(tx, input.name!);
        if (alias && alias.providerId !== id) duplicate();
        if (!alias) await tx.proveedorAdministrativoAlias.create({ data: { nameNormalized: normalized(input.name!), providerId: id } });
      }
      const updated = await tx.proveedorAdministrativo.update({ where: { id }, data: { version: { increment: 1 },
        ...(action === "RENAME" ? { name: input.name!, nameNormalized: normalized(input.name!) } : { active: false }) } });
      const provider = dto(updated);
      const response = { provider };
      await tx.proveedorAdministrativoEvento.create({ data: { providerId: id, action, requestId: input.requestId,
        requestHash: input.hash, snapshot: { before: dto(row), after: provider }, responseSnapshot: response, ...creator } });
      return { ...response, replayed: false };
    }, { timeout: 15_000 });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const previous = await prisma.proveedorAdministrativoEvento.findUnique({ where: { requestId: input.requestId } });
    if (previous) return replay(previous, input.hash);
    return duplicate();
  }
}
export function renameInvoiceProvider(id: number, value: unknown, session: Session | null) { return changeProvider(id, value, "RENAME", session); }
export function deactivateInvoiceProvider(id: number, value: unknown, session: Session | null) { return changeProvider(id, value, "DEACTIVATE", session); }

// Called inside the invoice transaction. A row lock makes active selection
// consistent with concurrent renames/deactivation; no invoice snapshot is edited.
export async function resolveInvoiceProvider(tx: Prisma.TransactionClient, input: {
  providerId?: unknown; provider?: unknown; existing?: { providerId: number | null; provider: string; providerNormalized?: string };
}): Promise<{ id: number; name: string }> {
  let id: number;
  if (input.providerId !== undefined && input.providerId !== null) id = administrativeProviderId(input.providerId);
  else {
    const name = nameInput(input.provider);
    if (input.existing?.providerId && normalized(name) === normalized(input.existing.provider)) {
      id = input.existing.providerId;
    } else {
      const alias = await byAlias(tx, name);
      if (alias) id = alias.providerId;
      else {
        // Native unique upserts keep concurrent legacy forms on one identity.
        const created = await tx.proveedorAdministrativo.upsert({ where: { nameNormalized: normalized(name) },
          create: { name, nameNormalized: normalized(name) }, update: {} });
        const identity = await tx.proveedorAdministrativoAlias.upsert({ where: { nameNormalized: normalized(name) },
          create: { nameNormalized: normalized(name), providerId: created.id }, update: {} });
        id = identity.providerId;
      }
    }
  }
  const provider = await lockProvider(tx, id);
  if (input.existing?.providerId === id) return { id, name: input.existing.provider };
  if (!provider.active) throw new InvoiceProviderError("El proveedor está desactivado. Selecciona un proveedor activo.", 409, "PROVIDER_INACTIVE");
  return { id, name: provider.name };
}
