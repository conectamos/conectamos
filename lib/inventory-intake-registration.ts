import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { esImeiValido, revisarEntradasImeis } from "@/lib/inventory-imeis";

let schemaPromise: Promise<void> | null = null;

export class InventoryIntakeError extends Error {
  constructor(message: string, public status = 400, public codigo = "CARGA_INVALIDA") {
    super(message);
    this.name = "InventoryIntakeError";
  }
}

export function leerClaveCarga(req: Request, body: Record<string, unknown>) {
  const header = req.headers.get("Idempotency-Key")?.trim() || "";
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (header && key && header !== key) {
    throw new InventoryIntakeError("La clave del intento no coincide. Reintenta con los mismos datos.", 409, "IDEMPOTENCIA_CONFLICTO");
  }
  const result = header || key;
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(result)) {
    throw new InventoryIntakeError("Falta una clave válida para este intento de carga. Actualiza la página.");
  }
  return result;
}

export function leerImeisCarga(body: Record<string, unknown>) {
  const values: unknown[] = Array.isArray(body.imeis) ? body.imeis : body.imei !== undefined ? [body.imei] : [];
  const revision = revisarEntradasImeis(values);
  if (!revision.detectados) throw new InventoryIntakeError("Debes ingresar al menos un IMEI.");
  if (revision.incorrectos) throw new InventoryIntakeError("Todos los IMEI deben ser texto con exactamente 15 dígitos. Revisa la lista.");
  if (revision.repetidos) throw new InventoryIntakeError("La carga contiene IMEI repetidos. Revisa la lista antes de guardar.");
  return revision.imeisValidos;
}

async function ensureSchema() {
  if (!schemaPromise) {
    // Durable retry journal; inventory and accounting schemas stay unchanged.
    schemaPromise = prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "InventarioCargaSolicitud" (
        "usuarioId" INTEGER NOT NULL,
        "destino" TEXT COLLATE "C" NOT NULL,
        "clave" TEXT COLLATE "C" NOT NULL,
        "solicitud" TEXT NOT NULL,
        "resultado" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InventarioCargaSolicitud_pkey" PRIMARY KEY ("usuarioId", "destino", "clave")
      )
    `.then(() => undefined).catch((error: unknown) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

export async function obtenerImeisExistentes(
  db: Pick<Prisma.TransactionClient, "inventarioPrincipal" | "inventarioSede">,
  imeis: readonly string[],
) {
  if (!imeis.length) return new Set<string>();
  const [principal, sedes] = await Promise.all([
    db.inventarioPrincipal.findMany({ where: { imei: { in: [...imeis] } }, select: { imei: true } }),
    db.inventarioSede.findMany({ where: { imei: { in: [...imeis] } }, select: { imei: true } }),
  ]);
  return new Set([...principal, ...sedes].map((item) => item.imei));
}

export async function registrarCargaInventarioUnaVez<T extends object>(input: {
  usuarioId: number;
  destino: "PRINCIPAL" | "SEDE";
  clave: string;
  solicitud: object;
  imeis: string[];
  registrar: (tx: Prisma.TransactionClient) => Promise<T>;
}) {
  await ensureSchema();
  const { usuarioId, destino, clave, imeis, registrar } = input;
  const solicitud = JSON.stringify(input.solicitud);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "InventarioCargaSolicitud" ("usuarioId", "destino", "clave", "solicitud")
      VALUES (${usuarioId}, ${destino}, ${clave}, ${solicitud})
      ON CONFLICT ("usuarioId", "destino", "clave") DO NOTHING
    `;
    const requests = await tx.$queryRaw<Array<{ solicitud: string; resultado: T | null }>>`
      SELECT "solicitud", "resultado" FROM "InventarioCargaSolicitud"
      WHERE "usuarioId" = ${usuarioId} AND "destino" = ${destino} AND "clave" = ${clave}
      FOR UPDATE
    `;
    const request = requests[0];
    if (!request) throw new Error("No se pudo reservar el intento de carga.");
    if (request.solicitud !== solicitud) {
      throw new InventoryIntakeError("Este intento ya corresponde a otros datos. Inicia una carga diferente.", 409, "IDEMPOTENCIA_CONFLICTO");
    }
    if (request.resultado) return { ...request.resultado, replayed: true };

    // Both manual intake paths use the same locks. Sort to avoid deadlocks in overlapping batches.
    for (const imei of [...imeis].sort()) {
      if (!esImeiValido(imei)) throw new InventoryIntakeError("IMEI inválido en la carga.");
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`inventario-imei:${imei}`}, 0))::text
      `;
    }
    const existentes = await obtenerImeisExistentes(tx, imeis);
    if (existentes.size) {
      throw new InventoryIntakeError(`No se guardó ningún equipo. Estos IMEI ya existen: ${[...existentes].join(", ")}. Revisa nuevamente la lista.`, 409, "INVENTARIO_MODIFICADO");
    }
    const resultado = await registrar(tx);
    const encoded = JSON.stringify(resultado);
    await tx.$executeRaw`
      UPDATE "InventarioCargaSolicitud" SET "resultado" = ${encoded}::jsonb
      WHERE "usuarioId" = ${usuarioId} AND "destino" = ${destino} AND "clave" = ${clave}
    `;
    return { ...JSON.parse(encoded) as T, replayed: false };
  }, { maxWait: 15_000, timeout: 60_000 });
}
