-- Aditivo e idempotente. Aplicar antes de habilitar el módulo.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS "PayJoyExtensionOperation" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "perfilId" INTEGER,
  "sedeId" INTEGER NOT NULL,
  "asesorNombre" TEXT NOT NULL,
  "registroId" INTEGER,
  "clienteDocumentoUltimos4" TEXT,
  "clienteIdPayjoy" TEXT,
  "deviceTag" TEXT,
  "imei" TEXT,
  "status" TEXT NOT NULL,
  "activeDeviceKey" TEXT,
  "providerRequestId" TEXT,
  "providerIdempotencyKey" TEXT NOT NULL,
  "currentValidThrough" TIMESTAMP(3),
  "options" JSONB NOT NULL,
  "selectedOption" JSONB,
  "selectedReason" TEXT,
  "response" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyExtensionOperation_idempotencyKey_key" ON "PayJoyExtensionOperation"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyExtensionOperation_activeDeviceKey_key" ON "PayJoyExtensionOperation"("activeDeviceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyExtensionOperation_providerIdempotencyKey_key" ON "PayJoyExtensionOperation"("providerIdempotencyKey");
CREATE INDEX IF NOT EXISTS "PayJoyExtensionOperation_usuarioId_perfilId_sedeId_createdAt_idx" ON "PayJoyExtensionOperation"("usuarioId", "perfilId", "sedeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PayJoyExtensionOperation_deviceTag_createdAt_idx" ON "PayJoyExtensionOperation"("deviceTag", "createdAt");

CREATE TABLE IF NOT EXISTS "PayJoyCreditCheck" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "perfilId" INTEGER,
  "sedeId" INTEGER NOT NULL,
  "asesorNombre" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "deviceTag" TEXT,
  "imei" TEXT,
  "status" TEXT NOT NULL,
  "snapshot" JSONB,
  "errorCode" TEXT,
  "activeLookupKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyCreditCheck_idempotencyKey_key" ON "PayJoyCreditCheck"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyCreditCheck_activeLookupKey_key" ON "PayJoyCreditCheck"("activeLookupKey");
CREATE INDEX IF NOT EXISTS "PayJoyCreditCheck_scope_createdAt_idx" ON "PayJoyCreditCheck"("usuarioId", "perfilId", "sedeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PayJoyCreditCheck_scope_deviceTag_createdAt_idx" ON "PayJoyCreditCheck"("usuarioId", "perfilId", "sedeId", "deviceTag", "createdAt");
CREATE INDEX IF NOT EXISTS "PayJoyCreditCheck_scope_imei_createdAt_idx" ON "PayJoyCreditCheck"("usuarioId", "perfilId", "sedeId", "imei", "createdAt");
COMMIT;
