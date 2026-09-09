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

CREATE TABLE IF NOT EXISTS "AbonoFacturaProveedor" (
  "id" SERIAL NOT NULL,
  "facturaId" INTEGER NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "saldoAnterior" DECIMAL(14,2) NOT NULL,
  "saldoPosterior" DECIMAL(14,2) NOT NULL,
  "aliadoSnapshot" TEXT NOT NULL,
  "numeroFacturaSnapshot" TEXT NOT NULL,
  "valorFacturaSnapshot" DECIMAL(14,2) NOT NULL,
  "claveIdempotencia" TEXT NOT NULL,
  "referencia" TEXT,
  "observacion" TEXT,
  "aprobadoPorId" INTEGER,
  "aprobadoPorNombre" TEXT NOT NULL,
  "aprobadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbonoFacturaProveedor_pkey" PRIMARY KEY ("id")
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

CREATE UNIQUE INDEX IF NOT EXISTS "AbonoFacturaProveedor_claveIdempotencia_key"
  ON "AbonoFacturaProveedor"("claveIdempotencia");
CREATE INDEX IF NOT EXISTS "AbonoFacturaProveedor_facturaId_aprobadoEn_idx"
  ON "AbonoFacturaProveedor"("facturaId", "aprobadoEn");
CREATE INDEX IF NOT EXISTS "AbonoFacturaProveedor_aprobadoEn_idx"
  ON "AbonoFacturaProveedor"("aprobadoEn");

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
  ALTER TABLE "AbonoFacturaProveedor"
    ADD CONSTRAINT "AbonoFacturaProveedor_facturaId_fkey"
    FOREIGN KEY ("facturaId") REFERENCES "FacturaProveedor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "AbonoFacturaProveedor"
    ADD CONSTRAINT "AbonoFacturaProveedor_aprobadoPorId_fkey"
    FOREIGN KEY ("aprobadoPorId") REFERENCES "Usuario"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "AbonoFacturaProveedor"
    ADD CONSTRAINT "AbonoFacturaProveedor_valor_check"
    CHECK ("valor" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

DO $proveedores$
BEGIN
  ALTER TABLE "AbonoFacturaProveedor"
    ADD CONSTRAINT "AbonoFacturaProveedor_saldos_check"
    CHECK (
      "saldoAnterior" >= 0
      AND "saldoPosterior" >= 0
      AND "saldoAnterior" - "saldoPosterior" = "valor"
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$proveedores$;

LOCK TABLE "FacturaProveedor", "AbonoFacturaProveedor"
  IN SHARE ROW EXCLUSIVE MODE;

WITH "FacturasPagadasConSaldo" AS (
  SELECT
    factura.*,
    COALESCE(
      (
        SELECT SUM(abono."valor")
        FROM "AbonoFacturaProveedor" AS abono
        WHERE abono."facturaId" = factura."id"
      ),
      0::DECIMAL
    ) AS "valorAbonado"
  FROM "FacturaProveedor" AS factura
  WHERE factura."estado" = 'PAGADO'
)
INSERT INTO "AbonoFacturaProveedor" (
  "facturaId",
  "valor",
  "saldoAnterior",
  "saldoPosterior",
  "aliadoSnapshot",
  "numeroFacturaSnapshot",
  "valorFacturaSnapshot",
  "claveIdempotencia",
  "referencia",
  "observacion",
  "aprobadoPorId",
  "aprobadoPorNombre",
  "aprobadoEn",
  "createdAt",
  "updatedAt"
)
SELECT
  factura."id",
  factura."valorPagar" - factura."valorAbonado",
  factura."valorPagar" - factura."valorAbonado",
  0,
  factura."aliado",
  factura."numeroFactura",
  factura."valorPagar",
  'LEGACY-FACTURA-' || factura."id"::TEXT,
  'Pago historico',
  'Registro reconstruido desde la aprobacion de pago de la factura.',
  factura."pagoAprobadoPorId",
  COALESCE(factura."pagoAprobadoPorNombre", 'Registro historico'),
  COALESCE(factura."pagoAprobadoEn", factura."updatedAt", factura."createdAt"),
  COALESCE(factura."pagoAprobadoEn", factura."updatedAt", factura."createdAt"),
  COALESCE(factura."pagoAprobadoEn", factura."updatedAt", factura."createdAt")
FROM "FacturasPagadasConSaldo" AS factura
WHERE factura."valorAbonado" < factura."valorPagar"
ON CONFLICT ("claveIdempotencia") DO NOTHING;

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
