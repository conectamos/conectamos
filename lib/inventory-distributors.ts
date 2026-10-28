import prisma from "@/lib/prisma";

export type DistribuidorInventario = { id: number; nombre: string };

const DISTRIBUIDORES_INICIALES = [
  "COMUNICARIBE", "HOLA PLAZA", "CONMOVIL", "CORBETA", "OPORTUNIDADES", "Proveedor Felipe",
] as const;

let schemaPromise: Promise<void> | null = null;

export class InventoryDistributorError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "InventoryDistributorError";
  }
}

export function normalizarDistribuidorInventario(value: unknown) {
  if (typeof value !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    throw new InventoryDistributorError("Escribe un nombre válido para el distribuidor.");
  }
  const nombre = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!nombre || nombre.length > 100) {
    throw new InventoryDistributorError("El nombre del distribuidor debe tener entre 1 y 100 caracteres.");
  }
  return nombre;
}

function claveDistribuidor(nombre: string) {
  return nombre.toLocaleUpperCase("es-CO");
}

export function asegurarCatalogoDistribuidoresInventario() {
  if (!schemaPromise) {
    schemaPromise = prisma.$transaction(async tx => {
      // Serialize first use across instances, including CREATE TABLE and seeding.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended('inventario-distribuidores-schema', 0))::text
      `;
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS "CatalogoDistribuidorInventario" (
          "id" SERIAL PRIMARY KEY,
          "nombre" TEXT NOT NULL,
          "nombreNormalizado" TEXT NOT NULL UNIQUE,
          "activo" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      for (const nombre of DISTRIBUIDORES_INICIALES) {
        const normalizado = claveDistribuidor(nombre);
        // Keep retired rows: repeated startup must never reactivate an option.
        await tx.$executeRaw`
          INSERT INTO "CatalogoDistribuidorInventario" ("nombre", "nombreNormalizado")
          VALUES (${nombre}, ${normalizado}) ON CONFLICT ("nombreNormalizado") DO NOTHING
        `;
      }
    }, { maxWait: 15_000, timeout: 30_000 }).then(() => undefined).catch((error: unknown) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function obtenerDistribuidoresInventario(): Promise<DistribuidorInventario[]> {
  await asegurarCatalogoDistribuidoresInventario();
  return prisma.$queryRaw<DistribuidorInventario[]>`
    SELECT "id", "nombre" FROM "CatalogoDistribuidorInventario"
    WHERE "activo" = true ORDER BY "nombreNormalizado" ASC, "id" ASC
  `;
}

export async function agregarDistribuidorInventario(value: unknown) {
  const nombre = normalizarDistribuidorInventario(value);
  const normalizado = claveDistribuidor(nombre);
  await asegurarCatalogoDistribuidoresInventario();
  // Atomic upsert makes double clicks/retries safe and restores the original ID.
  await prisma.$executeRaw`
    INSERT INTO "CatalogoDistribuidorInventario" ("nombre", "nombreNormalizado")
    VALUES (${nombre}, ${normalizado})
    ON CONFLICT ("nombreNormalizado") DO UPDATE SET
      "activo" = true,
      "updatedAt" = CASE WHEN "CatalogoDistribuidorInventario"."activo"
        THEN "CatalogoDistribuidorInventario"."updatedAt" ELSE CURRENT_TIMESTAMP END
  `;
  return obtenerDistribuidoresInventario();
}

export async function retirarDistribuidorInventario(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new InventoryDistributorError("El distribuidor seleccionado no es válido.");
  }
  await asegurarCatalogoDistribuidoresInventario();
  const updated = await prisma.$executeRaw`
    UPDATE "CatalogoDistribuidorInventario" SET "activo" = false,
      "updatedAt" = CASE WHEN "activo" THEN CURRENT_TIMESTAMP ELSE "updatedAt" END
    WHERE "id" = ${id}
  `;
  if (!updated) throw new InventoryDistributorError("El distribuidor no existe.", 404);
  return obtenerDistribuidoresInventario();
}
