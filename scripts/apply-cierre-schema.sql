-- Additive, re-runnable migration. Run before enabling the background worker.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- Standalone central invoice register. Payments record accounting facts only;
-- these tables have no triggers into inventory, supplier notifications or cash.
CREATE TABLE IF NOT EXISTS "FacturaAdministrativa" (
 "id" SERIAL PRIMARY KEY, "number" TEXT NOT NULL, "numberNormalized" TEXT NOT NULL,
 "provider" TEXT NOT NULL, "providerNormalized" TEXT NOT NULL, "date" DATE NOT NULL,
 "amount" DECIMAL(14,2) NOT NULL, "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "status" TEXT NOT NULL DEFAULT 'PENDIENTE', "version" INTEGER NOT NULL DEFAULT 1,
 "createRequestId" TEXT NOT NULL, "createRequestHash" TEXT NOT NULL, "createResult" JSONB,
 "createdById" INTEGER NOT NULL, "createdByProfileId" INTEGER, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FacturaAdministrativa_amount_check" CHECK ("amount" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount"),
 CONSTRAINT "FacturaAdministrativa_status_check" CHECK (
   ("status" = 'PENDIENTE' AND "paidAmount" < "amount") OR ("status" = 'PAGADA' AND "paidAmount" = "amount")
 ),
 CONSTRAINT "FacturaAdministrativa_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacturaAdministrativa_createRequestId_key" ON "FacturaAdministrativa" ("createRequestId");
CREATE INDEX IF NOT EXISTS "FacturaAdministrativa_date_status_id_idx" ON "FacturaAdministrativa" ("date", "status", "id");
ALTER TABLE "FacturaAdministrativa" ADD COLUMN IF NOT EXISTS "dueDate" DATE;
ALTER TABLE "FacturaAdministrativa" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "FacturaAdministrativa" ADD COLUMN IF NOT EXISTS "deletedById" INTEGER;
ALTER TABLE "FacturaAdministrativa" ADD COLUMN IF NOT EXISTS "deletedByProfileId" INTEGER;
ALTER TABLE "FacturaAdministrativa" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
DO $invoice_due_date$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacturaAdministrativa_dueDate_check'
   AND conrelid = '"FacturaAdministrativa"'::regclass) THEN
   ALTER TABLE "FacturaAdministrativa" ADD CONSTRAINT "FacturaAdministrativa_dueDate_check"
    CHECK ("dueDate" IS NULL OR "dueDate" >= "date");
 END IF;
END $invoice_due_date$;
CREATE INDEX IF NOT EXISTS "FacturaAdministrativa_deletedAt_date_status_id_idx" ON "FacturaAdministrativa" ("deletedAt", "date", "status", "id");
CREATE INDEX IF NOT EXISTS "FacturaAdministrativa_deletedAt_status_dueDate_idx" ON "FacturaAdministrativa" ("deletedAt", "status", "dueDate");
CREATE TABLE IF NOT EXISTS "InvoiceAdminEvent" (
 "id" SERIAL PRIMARY KEY, "invoiceId" INTEGER NOT NULL REFERENCES "FacturaAdministrativa" ("id") ON DELETE RESTRICT,
 "action" TEXT NOT NULL CHECK ("action" IN ('EDIT', 'DELETE', 'RESTORE')),
 "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "responseSnapshot" JSONB NOT NULL,
 "createdById" INTEGER NOT NULL, "createdByProfileId" INTEGER, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceAdminEvent_requestId_key" ON "InvoiceAdminEvent" ("requestId");
CREATE INDEX IF NOT EXISTS "InvoiceAdminEvent_invoiceId_createdAt_id_idx" ON "InvoiceAdminEvent" ("invoiceId", "createdAt", "id");
CREATE TABLE IF NOT EXISTS "PagoFacturaAdministrativa" (
 "id" SERIAL PRIMARY KEY, "invoiceId" INTEGER NOT NULL REFERENCES "FacturaAdministrativa" ("id") ON DELETE RESTRICT,
 "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "responseSnapshot" JSONB NOT NULL,
 "date" DATE NOT NULL, "mode" TEXT NOT NULL, "reference" TEXT, "amount" DECIMAL(14,2) NOT NULL,
 "balanceBefore" DECIMAL(14,2) NOT NULL, "balanceAfter" DECIMAL(14,2) NOT NULL,
 "invoiceNumberSnapshot" TEXT NOT NULL, "providerSnapshot" TEXT NOT NULL, "invoiceAmountSnapshot" DECIMAL(14,2) NOT NULL,
 "createdById" INTEGER NOT NULL, "createdByProfileId" INTEGER, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PagoFacturaAdministrativa_mode_check" CHECK ("mode" IN ('partial', 'full')),
 CONSTRAINT "PagoFacturaAdministrativa_amount_check" CHECK (
   "amount" > 0 AND "balanceBefore" >= "amount" AND "balanceAfter" = "balanceBefore" - "amount"
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS "PagoFacturaAdministrativa_requestId_key" ON "PagoFacturaAdministrativa" ("requestId");
CREATE INDEX IF NOT EXISTS "PagoFacturaAdministrativa_invoiceId_createdAt_id_idx"
 ON "PagoFacturaAdministrativa" ("invoiceId", "createdAt", "id");
-- One immutable private PDF per payment; no file content is copied to JSON.
CREATE TABLE IF NOT EXISTS "InvoicePaymentReceipt" (
 "id" TEXT PRIMARY KEY, "paymentId" INTEGER NOT NULL REFERENCES "PagoFacturaAdministrativa" ("id") ON DELETE RESTRICT,
 "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "filename" TEXT NOT NULL,
 "size" INTEGER NOT NULL, "sha256" TEXT NOT NULL, "bytes" BYTEA NOT NULL,
 "createdById" INTEGER NOT NULL, "createdByProfileId" INTEGER, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("size" > 0 AND "size" <= 5242880 AND octet_length("bytes") = "size"),
 CHECK ("sha256" ~ '^[0-9a-f]{64}$'), CHECK (length("filename") BETWEEN 1 AND 255)
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePaymentReceipt_paymentId_key" ON "InvoicePaymentReceipt" ("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePaymentReceipt_requestId_key" ON "InvoicePaymentReceipt" ("requestId");
-- Administrative accounting overlays, separate from all provider evidence.
CREATE TABLE IF NOT EXISTS "CierreAjuste" (
 "key" TEXT PRIMARY KEY, "financial" TEXT NOT NULL,
 "periodFrom" TEXT NOT NULL, "periodTo" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "sedeId" INTEGER,
 "correctedAmount" DECIMAL(16,2), "collectedAmount" DECIMAL(16,2),
 "hidden" BOOLEAN NOT NULL DEFAULT false, "note" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
 "updatedById" INTEGER NOT NULL, "updatedByProfileId" INTEGER, "updatedBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CierreAjuste_correctedAmount_check" CHECK ("correctedAmount" IS NULL OR "correctedAmount" >= 0),
 CONSTRAINT "CierreAjuste_collectedAmount_check" CHECK ("collectedAmount" IS NULL OR "collectedAmount" >= 0),
 CONSTRAINT "CierreAjuste_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CierreAjuste_periodFrom_periodTo_scopeKey_financial_key"
 ON "CierreAjuste" ("periodFrom", "periodTo", "scopeKey", "financial");
-- Null identifies older aggregate-only receipts and untouched collections.
-- No invented dates or automatic rewrites of historical accounting values.
ALTER TABLE "CierreAjuste" ADD COLUMN IF NOT EXISTS "payments" JSONB;
CREATE TABLE IF NOT EXISTS "CierreAjusteEvento" (
 "id" SERIAL PRIMARY KEY, "adjustmentKey" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "actorId" INTEGER NOT NULL, "actorProfileId" INTEGER, "actorName" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CierreAjusteEvento_adjustmentKey_version_key"
 ON "CierreAjusteEvento" ("adjustmentKey", "version");
CREATE TABLE IF NOT EXISTS "CierreCredito" (
 "id" TEXT PRIMARY KEY, "financial" TEXT NOT NULL, "providerCreditId" TEXT,
 "localKey" TEXT UNIQUE, "ventaId" INTEGER, "registroId" INTEGER,
 "localReference" TEXT, "sedeId" INTEGER, "effectiveAt" TIMESTAMP(3),
 "amount" DECIMAL(16,2), "customerName" TEXT, "documentNumber" TEXT,
 "creditNumber" TEXT, "imei" TEXT, "status" TEXT NOT NULL, "source" TEXT NOT NULL,
 "evidence" JSONB, "providerUpdatedAt" TIMESTAMP(3), "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("financial", "providerCreditId")
);
CREATE INDEX IF NOT EXISTS "CierreCredito_sedeId_effectiveAt_status_idx" ON "CierreCredito" ("sedeId", "effectiveAt", "status");
CREATE INDEX IF NOT EXISTS "CierreCredito_financial_effectiveAt_status_idx" ON "CierreCredito" ("financial", "effectiveAt", "status");
CREATE INDEX IF NOT EXISTS "CierreCredito_ventaId_idx" ON "CierreCredito" ("ventaId");
CREATE TABLE IF NOT EXISTS "CierreEvento" (
 "id" SERIAL PRIMARY KEY, "creditId" TEXT NOT NULL, "eventKey" TEXT NOT NULL UNIQUE,
 "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CierreEvento_creditId_createdAt_idx" ON "CierreEvento" ("creditId", "createdAt");
CREATE TABLE IF NOT EXISTS "CierreVentaPendiente" (
 "ventaId" INTEGER PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 1,
 "snapshot" JSONB, "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastError" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "CierreSyncEstado" (
 "key" TEXT PRIMARY KEY, "initialized" BOOLEAN NOT NULL DEFAULT false,
 "lastSuccess" TIMESTAMP(3), "lockedUntil" TIMESTAMP(3), "lockToken" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "CierreSyncTrabajo" (
 "key" TEXT PRIMARY KEY, "financial" TEXT NOT NULL, "localKey" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDIENTE', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSuccess" TIMESTAMP(3),
 "limitation" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CierreSyncTrabajo_state_nextAttempt_idx" ON "CierreSyncTrabajo" ("state", "nextAttempt");

-- A transactional outbox captures edits, removals and late confirmations,
-- including changes made outside the web application. No provider work in SQL.
CREATE OR REPLACE FUNCTION cierre_enqueue_sale() RETURNS trigger AS $$
DECLARE sale_id INTEGER; old_sale JSONB;
BEGIN
 IF TG_OP = 'DELETE' THEN sale_id := OLD.id; old_sale := to_jsonb(OLD);
 ELSE sale_id := NEW.id; old_sale := to_jsonb(NEW); END IF;
 INSERT INTO "CierreVentaPendiente" ("ventaId", "snapshot") VALUES (sale_id, old_sale)
 ON CONFLICT ("ventaId") DO UPDATE SET "revision" = "CierreVentaPendiente"."revision" + 1,
 "snapshot" = EXCLUDED."snapshot", "nextAttempt" = CURRENT_TIMESTAMP, "attempts" = 0, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP;
 IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cierre_sale_outbox ON "Venta";
CREATE TRIGGER cierre_sale_outbox AFTER INSERT OR UPDATE OR DELETE ON "Venta"
FOR EACH ROW EXECUTE FUNCTION cierre_enqueue_sale();

CREATE OR REPLACE FUNCTION cierre_enqueue_registration() RETURNS trigger AS $$
DECLARE old_id INTEGER; new_id INTEGER;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_id := OLD."ventaIdRelacionada"; END IF;
 IF TG_OP <> 'DELETE' THEN new_id := NEW."ventaIdRelacionada"; END IF;
 INSERT INTO "CierreVentaPendiente" ("ventaId")
 SELECT DISTINCT n FROM unnest(ARRAY[old_id, new_id]) n WHERE n IS NOT NULL
 ON CONFLICT ("ventaId") DO UPDATE SET "revision" = "CierreVentaPendiente"."revision" + 1,
 "nextAttempt" = CURRENT_TIMESTAMP, "attempts" = 0, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP;
 IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cierre_registration_outbox ON "RegistroVendedorVenta";
CREATE TRIGGER cierre_registration_outbox AFTER INSERT OR UPDATE OR DELETE ON "RegistroVendedorVenta"
FOR EACH ROW EXECUTE FUNCTION cierre_enqueue_registration();

-- Seed exactly once, without overwriting progress when the migration is rerun.
WITH first_install AS (
 INSERT INTO "CierreSyncEstado" ("key") VALUES ('LOCAL') ON CONFLICT DO NOTHING RETURNING "key"
)
INSERT INTO "CierreVentaPendiente" ("ventaId", "snapshot")
SELECT v.id, to_jsonb(v) FROM "Venta" v WHERE EXISTS (SELECT 1 FROM first_install)
ON CONFLICT DO NOTHING;
-- Stable provider catalog. Names on invoices/payments remain historical facts.
CREATE TABLE IF NOT EXISTS "ProveedorAdministrativo" (
 "id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL, "nameNormalized" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "createdById" INTEGER, "createdByProfileId" INTEGER, "createdBy" TEXT NOT NULL DEFAULT 'Importado de facturas',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (length("name") > 0 AND length("nameNormalized") > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProveedorAdministrativo_nameNormalized_key" ON "ProveedorAdministrativo" ("nameNormalized");
CREATE TABLE IF NOT EXISTS "ProveedorAdministrativoAlias" (
 "nameNormalized" TEXT PRIMARY KEY,
 "providerId" INTEGER NOT NULL REFERENCES "ProveedorAdministrativo" ("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ProveedorAdministrativoAlias_providerId_idx" ON "ProveedorAdministrativoAlias" ("providerId");
CREATE TABLE IF NOT EXISTS "ProveedorAdministrativoEvento" (
 "id" SERIAL PRIMARY KEY, "providerId" INTEGER NOT NULL REFERENCES "ProveedorAdministrativo" ("id") ON DELETE RESTRICT,
 "action" TEXT NOT NULL CHECK ("action" IN ('CREATE', 'RENAME', 'DEACTIVATE', 'REACTIVATE')),
 "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "responseSnapshot" JSONB NOT NULL,
 "createdById" INTEGER NOT NULL, "createdByProfileId" INTEGER, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProveedorAdministrativoEvento_requestId_key" ON "ProveedorAdministrativoEvento" ("requestId");
CREATE INDEX IF NOT EXISTS "ProveedorAdministrativoEvento_providerId_createdAt_id_idx" ON "ProveedorAdministrativoEvento" ("providerId", "createdAt", "id");
ALTER TABLE "FacturaAdministrativa" ADD COLUMN IF NOT EXISTS "providerId" INTEGER;
DROP TRIGGER IF EXISTS invoice_provider_identity ON "FacturaAdministrativa";
-- Preserve aliases across renames and reruns; never reactivate a catalog entry
-- merely because its old name still occurs in a historical invoice.
INSERT INTO "ProveedorAdministrativoAlias" ("nameNormalized", "providerId")
SELECT "nameNormalized", "id" FROM "ProveedorAdministrativo" ON CONFLICT DO NOTHING;
INSERT INTO "ProveedorAdministrativo" ("name", "nameNormalized")
SELECT min(f."provider"), f."providerNormalized" FROM "FacturaAdministrativa" f
WHERE f."providerId" IS NULL AND NOT EXISTS (
 SELECT 1 FROM "ProveedorAdministrativoAlias" a WHERE a."nameNormalized" = f."providerNormalized"
)
GROUP BY f."providerNormalized" ON CONFLICT ("nameNormalized") DO NOTHING;
INSERT INTO "ProveedorAdministrativoAlias" ("nameNormalized", "providerId")
SELECT "nameNormalized", "id" FROM "ProveedorAdministrativo" ON CONFLICT DO NOTHING;
UPDATE "FacturaAdministrativa" f SET "providerId" = a."providerId"
FROM "ProveedorAdministrativoAlias" a WHERE f."providerId" IS NULL AND a."nameNormalized" = f."providerNormalized";
DO $invoice_provider_fk$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacturaAdministrativa_providerId_fkey'
   AND conrelid = '"FacturaAdministrativa"'::regclass) THEN
  ALTER TABLE "FacturaAdministrativa" ADD CONSTRAINT "FacturaAdministrativa_providerId_fkey"
   FOREIGN KEY ("providerId") REFERENCES "ProveedorAdministrativo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $invoice_provider_fk$;
CREATE UNIQUE INDEX IF NOT EXISTS "FacturaAdministrativa_providerId_numberNormalized_key"
 ON "FacturaAdministrativa" ("providerId", "numberNormalized");
DROP INDEX IF EXISTS "FacturaAdministrativa_providerNormalized_numberNormalized_key";
CREATE UNIQUE INDEX IF NOT EXISTS "FacturaAdministrativa_legacy_provider_number_key"
 ON "FacturaAdministrativa" ("providerNormalized", "numberNormalized") WHERE "providerId" IS NULL;
-- The previous deployed app can still submit text-only invoices while the new
-- image starts. Assign their identity in this same transaction, without changing
-- their snapshots or allowing a deactivated provider to create a new invoice.
CREATE OR REPLACE FUNCTION invoice_assign_provider_identity() RETURNS trigger AS $$
DECLARE resolved_id INTEGER; is_active BOOLEAN;
BEGIN
 IF TG_OP = 'UPDATE' AND NEW."providerId" IS NOT DISTINCT FROM OLD."providerId"
   AND NEW."providerNormalized" IS DISTINCT FROM OLD."providerNormalized" THEN
  NEW."providerId" := NULL;
 END IF;
 IF NEW."providerId" IS NULL THEN
  SELECT a."providerId" INTO resolved_id FROM "ProveedorAdministrativoAlias" a WHERE a."nameNormalized" = NEW."providerNormalized";
  IF resolved_id IS NULL THEN
   INSERT INTO "ProveedorAdministrativo" ("name", "nameNormalized", "createdById", "createdByProfileId", "createdBy")
   VALUES (NEW."provider", NEW."providerNormalized", NEW."createdById", NEW."createdByProfileId", NEW."createdBy")
   ON CONFLICT ("nameNormalized") DO UPDATE SET "nameNormalized" = EXCLUDED."nameNormalized"
   RETURNING "id" INTO resolved_id;
   INSERT INTO "ProveedorAdministrativoAlias" ("nameNormalized", "providerId") VALUES (NEW."providerNormalized", resolved_id)
   ON CONFLICT ("nameNormalized") DO NOTHING;
   SELECT a."providerId" INTO resolved_id FROM "ProveedorAdministrativoAlias" a WHERE a."nameNormalized" = NEW."providerNormalized";
  END IF;
  NEW."providerId" := resolved_id;
 END IF;
 SELECT p."active" INTO is_active FROM "ProveedorAdministrativo" p WHERE p."id" = NEW."providerId" FOR UPDATE;
 IF is_active IS NULL THEN RAISE EXCEPTION 'Provider identity not found' USING ERRCODE = '23503'; END IF;
 IF NOT is_active AND (TG_OP = 'INSERT' OR NEW."providerId" IS DISTINCT FROM OLD."providerId") THEN
  RAISE EXCEPTION 'Provider is inactive' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER invoice_provider_identity BEFORE INSERT OR UPDATE OF "provider", "providerNormalized", "providerId" ON "FacturaAdministrativa"
FOR EACH ROW EXECUTE FUNCTION invoice_assign_provider_identity();
-- External reminders remain disabled until their WhatsApp transport is ready.
-- A delivery is separate from its invoice and never changes accounting totals.
CREATE TABLE IF NOT EXISTS "InvoiceReminderDelivery" (
 "id" TEXT PRIMARY KEY, "invoiceId" INTEGER NOT NULL REFERENCES "FacturaAdministrativa" ("id") ON DELETE RESTRICT,
 "dueDate" DATE NOT NULL, "channel" TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK ("channel" = 'WHATSAPP'),
 "recipientHash" TEXT NOT NULL, "recipient" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING','PROCESSING','RETRY','SENT','FAILED','UNKNOWN','CANCELLED')),
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
 "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "dispatchClaimedAt" TIMESTAMP(3),
 "payloadSnapshot" JSONB, "providerMessageId" TEXT, "sentAt" TIMESTAMP(3), "errorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("state" <> 'SENT' OR ("sentAt" IS NOT NULL AND "providerMessageId" IS NOT NULL)),
 CHECK ("state" <> 'PROCESSING' OR ("leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceReminderDelivery_invoiceId_dueDate_recipientHash_key"
 ON "InvoiceReminderDelivery" ("invoiceId", "dueDate", "recipientHash");
CREATE INDEX IF NOT EXISTS "InvoiceReminderDelivery_state_nextAttempt_dueDate_idx"
 ON "InvoiceReminderDelivery" ("state", "nextAttempt", "dueDate");
CREATE INDEX IF NOT EXISTS "InvoiceReminderDelivery_state_leaseUntil_idx" ON "InvoiceReminderDelivery" ("state", "leaseUntil");
COMMIT;
