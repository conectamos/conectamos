import prisma from "@/lib/prisma";
import { esEstadoDeuda } from "@/lib/prestamos";

const ORIGEN_LEGADO = "LEGACY_DEBO_A";
let ensureSchemaPromise: Promise<void> | null = null;

export type IdentidadAcreedorInventario = {
  id: number;
  nombre: string;
};

export function nombreHistoricoAcreedor(deboA: string | null | undefined) {
  // The legacy field has no creditor relationship. Preserve its exact label;
  // normalizing it would silently merge different historical identities.
  return typeof deboA === "string" && deboA.trim() ? deboA : null;
}

export function obtenerSaldoPendienteInventario(item: {
  estadoFinanciero: string | null | undefined;
  costo: number;
}) {
  // Inventory records do not have partial payments. Pending approval remains
  // DEUDA until the existing loan approval flow settles it.
  return esEstadoDeuda(item.estadoFinanciero) ? item.costo : 0;
}

export function ensureInventoryCreditorsSchema() {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "InventarioAcreedorIdentidad" (
        "id" SERIAL NOT NULL,
        "origen" TEXT COLLATE "C" NOT NULL,
        "nombre" TEXT COLLATE "C" NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InventarioAcreedorIdentidad_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "InventarioAcreedorIdentidad_origen_nombre_key"
          UNIQUE ("origen", "nombre")
      )
    `.then(() => undefined).catch((error: unknown) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  return ensureSchemaPromise;
}

export async function resolverIdentidadesAcreedores(
  items: readonly { deboA?: string | null }[]
) {
  const nombres = [...new Set(items.map((item) => nombreHistoricoAcreedor(item.deboA))
    .filter((nombre): nombre is string => nombre !== null))];

  if (nombres.length === 0) {
    return new Map<string, IdentidadAcreedorInventario>();
  }

  await ensureInventoryCreditorsSchema();

  // The unique key makes concurrent requests reuse the same database ID.
  // Ordering overlapping batches avoids taking unique-key locks in reverse order.
  await prisma.$executeRaw`
    INSERT INTO "InventarioAcreedorIdentidad" ("origen", "nombre")
    SELECT ${ORIGEN_LEGADO}, "nombre"
    FROM unnest(${nombres}::text[]) AS etiquetas("nombre")
    ORDER BY "nombre" COLLATE "C"
    ON CONFLICT ("origen", "nombre") DO NOTHING
  `;

  const identidades = await prisma.$queryRaw<IdentidadAcreedorInventario[]>`
    SELECT "id", "nombre" FROM "InventarioAcreedorIdentidad"
    WHERE "origen" = ${ORIGEN_LEGADO} AND "nombre" = ANY(${nombres}::text[])
  `;

  if (identidades.length !== nombres.length) {
    throw new Error("No se pudieron resolver todas las identidades de acreedor");
  }

  return new Map(identidades.map((identidad) => [identidad.nombre, identidad]));
}
