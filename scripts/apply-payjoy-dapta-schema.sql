-- Only persistent drafts and read-only lookup evidence. This creates no send queue.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS "PayJoyDaptaBatch" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "perfilId" INTEGER,
  "sedeId" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT_ONLY' CHECK ("status" = 'DRAFT_ONLY'),
  "agreement" TEXT NOT NULL DEFAULT '112090' CHECK ("agreement" = '112090'),
  "messageTemplate" TEXT NOT NULL,
  "retryRequestIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyDaptaBatch_requestId_key" ON "PayJoyDaptaBatch"("requestId");
CREATE INDEX IF NOT EXISTS "PayJoyDaptaBatch_createdAt_idx" ON "PayJoyDaptaBatch"("createdAt");
CREATE INDEX IF NOT EXISTS "PayJoyDaptaBatch_usuarioId_perfilId_sedeId_createdAt_idx" ON "PayJoyDaptaBatch"("usuarioId", "perfilId", "sedeId", "createdAt");

CREATE TABLE IF NOT EXISTS "PayJoyDaptaItem" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "PayJoyDaptaBatch"("id") ON DELETE CASCADE,
  "deviceTag" TEXT NOT NULL CHECK ("deviceTag" ~ '^D[A-Z0-9]{5,31}$'),
  "lookupStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("lookupStatus" IN ('PENDING','CHECKING','FOUND','MISSING','ERROR')),
  "phone" TEXT CHECK ("phone" IS NULL OR "phone" ~ '^573[0-9]{9}$'),
  "phoneSource" TEXT CHECK ("phoneSource" IS NULL OR "phoneSource" = 'PAYJOY_NEQUI_PREFILL'),
  "ownershipStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK ("ownershipStatus" = 'PENDING_REVIEW'),
  "consentStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK ("consentStatus" = 'PENDING_REVIEW'),
  "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK ("reviewStatus" IN ('PENDING_REVIEW','DUPLICATE_PHONE')),
  "duplicateOfId" TEXT,
  "claimToken" TEXT,
  "claimExpiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "errorCode" TEXT,
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayJoyDaptaItem_phone_source_check" CHECK (("phone" IS NULL) = ("phoneSource" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayJoyDaptaItem_batchId_deviceTag_key" ON "PayJoyDaptaItem"("batchId", "deviceTag");
CREATE INDEX IF NOT EXISTS "PayJoyDaptaItem_batchId_lookupStatus_idx" ON "PayJoyDaptaItem"("batchId", "lookupStatus");
CREATE INDEX IF NOT EXISTS "PayJoyDaptaItem_batchId_phone_idx" ON "PayJoyDaptaItem"("batchId", "phone");
COMMIT;
