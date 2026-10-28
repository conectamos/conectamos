-- Additive migration only: preserves every sede, profile and historical relation.
BEGIN;
ALTER TABLE "Sede"
  ADD COLUMN IF NOT EXISTS "eliminadoEn" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eliminadoPor" TEXT;
ALTER TABLE "PerfilVendedor"
  ADD COLUMN IF NOT EXISTS "eliminadoEn" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eliminadoPor" TEXT;
COMMIT;
