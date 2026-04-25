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
    CREATE TABLE IF NOT EXISTS "RegistroVendedorVenta" (
      "id" SERIAL NOT NULL,
      "perfilVendedorId" INTEGER NOT NULL,
      "sedeId" INTEGER NOT NULL,
      "ciudad" TEXT,
      "puntoVenta" TEXT,
      "clienteNombre" TEXT NOT NULL,
      "tipoDocumento" TEXT NOT NULL,
      "documentoNumero" TEXT NOT NULL,
      "plataformaCredito" TEXT NOT NULL,
      "financierasDetalle" JSONB,
      "aceptaDeclaracionIntermediacion" BOOLEAN NOT NULL DEFAULT false,
      "aceptaPoliticaGarantia" BOOLEAN NOT NULL DEFAULT false,
      "aceptaCondicionesCredito" BOOLEAN NOT NULL DEFAULT false,
      "dobleCredito" BOOLEAN NOT NULL DEFAULT false,
      "observacion" TEXT,
      "referenciaEquipo" TEXT,
      "almacenamiento" TEXT,
      "color" TEXT,
      "serialImei" TEXT,
      "tipoEquipo" TEXT,
      "creditoAutorizado" DECIMAL(12,2),
      "cuotaInicial" DECIMAL(12,2),
      "valorCuota" DECIMAL(12,2),
      "numeroCuotas" INTEGER,
      "frecuenciaCuota" TEXT,
      "correo" TEXT,
      "whatsapp" TEXT,
      "fechaNacimiento" TIMESTAMP(3),
      "fechaExpedicion" TIMESTAMP(3),
      "direccion" TEXT,
      "barrio" TEXT,
      "referenciaContacto" TEXT,
      "referenciaFamiliar1Nombre" TEXT,
      "referenciaFamiliar1Telefono" TEXT,
      "referenciaFamiliar2Nombre" TEXT,
      "referenciaFamiliar2Telefono" TEXT,
      "telefono" TEXT,
      "simCardRegistro1" TEXT,
      "simCardRegistro2" TEXT,
      "medioPago1Tipo" TEXT,
      "medioPago1Valor" DECIMAL(12,2),
      "medioPago2Tipo" TEXT,
      "medioPago2Valor" DECIMAL(12,2),
      "asesorNombre" TEXT,
      "jaladorNombre" TEXT,
      "cerradorNombre" TEXT,
      "numeroFactura" TEXT,
      "estadoFacturacion" TEXT NOT NULL DEFAULT 'PENDIENTE',
      "eliminadoEn" TIMESTAMP(3),
      "eliminadoPor" TEXT,
      "firmaClienteDataUrl" TEXT,
      "fotoEntregaDataUrl" TEXT,
      "confirmacionCliente" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RegistroVendedorVenta_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RegistroVendedorVenta"
      ADD COLUMN IF NOT EXISTS "financierasDetalle" JSONB,
      ADD COLUMN IF NOT EXISTS "referenciaFamiliar1Nombre" TEXT,
      ADD COLUMN IF NOT EXISTS "referenciaFamiliar1Telefono" TEXT,
      ADD COLUMN IF NOT EXISTS "referenciaFamiliar2Nombre" TEXT,
      ADD COLUMN IF NOT EXISTS "referenciaFamiliar2Telefono" TEXT,
      ADD COLUMN IF NOT EXISTS "jaladorNombre" TEXT,
      ADD COLUMN IF NOT EXISTS "numeroFactura" TEXT,
      ADD COLUMN IF NOT EXISTS "estadoFacturacion" TEXT NOT NULL DEFAULT 'PENDIENTE',
      ADD COLUMN IF NOT EXISTS "eliminadoEn" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "eliminadoPor" TEXT,
      ADD COLUMN IF NOT EXISTS "firmaClienteDataUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "fotoEntregaDataUrl" TEXT;
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
    CREATE INDEX IF NOT EXISTS "RegistroVendedorVenta_perfilVendedorId_createdAt_idx"
    ON "RegistroVendedorVenta"("perfilVendedorId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RegistroVendedorVenta_sedeId_createdAt_idx"
    ON "RegistroVendedorVenta"("sedeId", "createdAt");
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

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "RegistroVendedorVenta"
        ADD CONSTRAINT "RegistroVendedorVenta_perfilVendedorId_fkey"
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
      ALTER TABLE "RegistroVendedorVenta"
        ADD CONSTRAINT "RegistroVendedorVenta_sedeId_fkey"
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
