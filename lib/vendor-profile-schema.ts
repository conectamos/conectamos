import prisma from "@/lib/prisma";

let ensureSchemaPromise: Promise<void> | null = null;

async function runEnsureVendorProfilesSchema() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      CREATE TYPE "TipoPerfilVendedor" AS ENUM (
        'ADMINISTRADOR',
        'FACTURADOR',
        'SUPERVISOR_TIENDA',
        'VENDEDOR'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TYPE "TipoPerfilVendedor" ADD VALUE IF NOT EXISTS 'VENDEDOR';
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PerfilVendedor" (
      "id" SERIAL NOT NULL,
      "nombre" TEXT NOT NULL,
      "documento" TEXT,
      "telefono" TEXT,
      "correo" TEXT,
      "pinHash" TEXT NOT NULL,
      "activo" BOOLEAN NOT NULL DEFAULT true,
      "tipo" "TipoPerfilVendedor" NOT NULL DEFAULT 'SUPERVISOR_TIENDA',
      "debeCambiarPin" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PerfilVendedor_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PerfilVendedorSede" (
      "id" SERIAL NOT NULL,
      "perfilVendedorId" INTEGER NOT NULL,
      "sedeId" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PerfilVendedorSede_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PerfilVendedor_documento_key"
    ON "PerfilVendedor"("documento");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PerfilVendedor_correo_key"
    ON "PerfilVendedor"("correo");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PerfilVendedorSede_perfilVendedorId_sedeId_key"
    ON "PerfilVendedorSede"("perfilVendedorId", "sedeId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerfilVendedorSede_sedeId_idx"
    ON "PerfilVendedorSede"("sedeId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "PerfilVendedorSede"
        ADD CONSTRAINT "PerfilVendedorSede_perfilVendedorId_fkey"
        FOREIGN KEY ("perfilVendedorId")
        REFERENCES "PerfilVendedor"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "PerfilVendedorSede"
        ADD CONSTRAINT "PerfilVendedorSede_sedeId_fkey"
        FOREIGN KEY ("sedeId")
        REFERENCES "Sede"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `);
}

export async function ensureVendorProfilesSchema() {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = runEnsureVendorProfilesSchema().catch((error) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  await ensureSchemaPromise;
}
