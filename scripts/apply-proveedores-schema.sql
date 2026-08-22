BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS public;

DO $proveedores$
BEGIN
  IF to_regclass('public."Usuario"') IS NULL THEN
    RAISE EXCEPTION 'No existe public."Usuario"; se cancela la instalacion de Proveedores';
  END IF;
END
$proveedores$;

DO $proveedores$
BEGIN
  CREATE TYPE "EstadoFacturaProveedor" AS ENUM ('PENDIENTE', 'PAGADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  CREATE TYPE "EstadoAvisoFacturaProveedor" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

CREATE TABLE IF NOT EXISTS "FacturaProveedor" (
  "id" SERIAL NOT NULL,
  "aliado" TEXT NOT NULL,
  "aliadoNormalizado" TEXT NOT NULL,
  "numeroFactura" TEXT NOT NULL,
  "numeroFacturaNormalizado" TEXT NOT NULL,
  "fechaVencimiento" DATE NOT NULL,
  "valorPagar" DECIMAL(14,2) NOT NULL,
  "estado" "EstadoFacturaProveedor" NOT NULL DEFAULT 'PENDIENTE',
  "creadoPorId" INTEGER NOT NULL,
  "creadoPorNombre" TEXT NOT NULL,
  "pagoAprobadoPorId" INTEGER,
  "pagoAprobadoPorNombre" TEXT,
  "pagoAprobadoEn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacturaProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscriptionProveedor" (
  "id" SERIAL NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "expirationTime" TIMESTAMP(3),
  "userAgent" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "fallosConsecutivos" INTEGER NOT NULL DEFAULT 0,
  "ultimoExitoEn" TIMESTAMP(3),
  "ultimoErrorEn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscriptionProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AvisoFacturaProveedor" (
  "id" SERIAL NOT NULL,
  "facturaId" INTEGER NOT NULL,
  "pushSubscriptionId" INTEGER NOT NULL,
  "fechaClave" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "estado" "EstadoAvisoFacturaProveedor" NOT NULL DEFAULT 'PENDIENTE',
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "enviadoEn" TIMESTAMP(3),
  "ultimoIntentoEn" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvisoFacturaProveedor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FacturaProveedor_estado_fechaVencimiento_idx"
  ON "FacturaProveedor"("estado", "fechaVencimiento");
CREATE INDEX IF NOT EXISTS "FacturaProveedor_createdAt_idx"
  ON "FacturaProveedor"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "FacturaProveedor_aliadoNormalizado_numeroFacturaNormalizado_key"
  ON "FacturaProveedor"("aliadoNormalizado", "numeroFacturaNormalizado");

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscriptionProveedor_endpoint_key"
  ON "PushSubscriptionProveedor"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscriptionProveedor_usuarioId_activo_idx"
  ON "PushSubscriptionProveedor"("usuarioId", "activo");
CREATE INDEX IF NOT EXISTS "PushSubscriptionProveedor_activo_idx"
  ON "PushSubscriptionProveedor"("activo");

CREATE INDEX IF NOT EXISTS "AvisoFacturaProveedor_fechaClave_estado_idx"
  ON "AvisoFacturaProveedor"("fechaClave", "estado");
CREATE INDEX IF NOT EXISTS "AvisoFacturaProveedor_pushSubscriptionId_createdAt_idx"
  ON "AvisoFacturaProveedor"("pushSubscriptionId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AvisoFacturaProveedor_facturaId_pushSubscriptionId_fechaCla_key"
  ON "AvisoFacturaProveedor"("facturaId", "pushSubscriptionId", "fechaClave");

DO $proveedores$
BEGIN
  ALTER TABLE "FacturaProveedor"
    ADD CONSTRAINT "FacturaProveedor_creadoPorId_fkey"
    FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "FacturaProveedor"
    ADD CONSTRAINT "FacturaProveedor_pagoAprobadoPorId_fkey"
    FOREIGN KEY ("pagoAprobadoPorId") REFERENCES "Usuario"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "PushSubscriptionProveedor"
    ADD CONSTRAINT "PushSubscriptionProveedor_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "AvisoFacturaProveedor"
    ADD CONSTRAINT "AvisoFacturaProveedor_facturaId_fkey"
    FOREIGN KEY ("facturaId") REFERENCES "FacturaProveedor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "AvisoFacturaProveedor"
    ADD CONSTRAINT "AvisoFacturaProveedor_pushSubscriptionId_fkey"
    FOREIGN KEY ("pushSubscriptionId") REFERENCES "PushSubscriptionProveedor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

COMMIT;
