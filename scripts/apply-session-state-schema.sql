BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "Usuario"
  ADD COLUMN IF NOT EXISTS "activeSessionKey" TEXT,
  ADD COLUMN IF NOT EXISTS "activeSessionLastSeenAt" TIMESTAMP(3);

ALTER TABLE "PerfilVendedor"
  ADD COLUMN IF NOT EXISTS "activeSessionKey" TEXT,
  ADD COLUMN IF NOT EXISTS "activeSessionLastSeenAt" TIMESTAMP(3);

COMMIT;
