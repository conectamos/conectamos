BEGIN;
SELECT pg_advisory_xact_lock(hashtext('conectamos.payjoy.voice.schema'));
CREATE TABLE IF NOT EXISTS "PayJoyVoiceBatch" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE, "scopeKey" TEXT NOT NULL UNIQUE,
  "inputHash" TEXT NOT NULL, "sourceBatchId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK ("status" IN ('SCHEDULED','CANCELLED','COMPLETED','EXPIRED')),
  "scheduledAt" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'America/Bogota' CHECK ("timeZone" = 'America/Bogota'),
  "agentId" TEXT NOT NULL, "fromNumber" TEXT NOT NULL,
  "agreement" TEXT NOT NULL DEFAULT '112090' CHECK ("agreement" = '112090'),
  "usuarioId" INTEGER NOT NULL, "perfilId" INTEGER, "sedeId" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL, "authorizedAt" TIMESTAMPTZ(3) NOT NULL, "scriptVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayJoyVoiceBatch_window_check" CHECK (
    "scheduledAt" = TIMESTAMPTZ '2026-11-10 15:00:00+00'
    AND "expiresAt" = TIMESTAMPTZ '2026-11-10 15:30:00+00'
  ),
  CONSTRAINT "PayJoyVoiceBatch_scope_check" CHECK ("scopeKey" = 'PAYJOY_VOICE_2026_11_10')
);
CREATE TABLE IF NOT EXISTS "PayJoyVoiceCall" (
  "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "PayJoyVoiceBatch"("id") ON DELETE RESTRICT,
  "sourceItemId" TEXT NOT NULL, "deviceTag" TEXT NOT NULL,
  "phone" TEXT NOT NULL CHECK ("phone" ~ '^\+573[0-9]{9}$'),
  "dayKey" TEXT NOT NULL CHECK ("dayKey" = '2026-11-10'),
  "phoneSource" TEXT NOT NULL DEFAULT 'PAYJOY_NEQUI_PREFILL' CHECK ("phoneSource" = 'PAYJOY_NEQUI_PREFILL'),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN
    ('PENDING','CHECKING','DISPATCHING','ACCEPTED','IN_PROGRESS','COMPLETED','SKIPPED','HELD','UNKNOWN','CANCELLED')),
  "claimToken" TEXT, "claimExpiresAt" TIMESTAMPTZ(3), "preflightAt" TIMESTAMPTZ(3),
  "identityConfirmedAt" TIMESTAMPTZ(3), "providerCallId" TEXT UNIQUE,
  "reasonCode" TEXT, "dispatchedAt" TIMESTAMPTZ(3), "dispatchAuthorizedAt" TIMESTAMPTZ(3), "acceptedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3), "latestOutcome" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("batchId", "deviceTag"), UNIQUE ("dayKey", "phone")
);
CREATE TABLE IF NOT EXISTS "PayJoyVoiceEvent" (
  "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "PayJoyVoiceBatch"("id") ON DELETE RESTRICT,
  "callId" TEXT REFERENCES "PayJoyVoiceCall"("id") ON DELETE RESTRICT,
  "eventKey" TEXT NOT NULL UNIQUE, "type" TEXT NOT NULL, "actorType" TEXT NOT NULL,
  "actorId" TEXT, "detail" JSONB, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "PayJoyContactSuppression" (
  "phone" TEXT PRIMARY KEY CHECK ("phone" ~ '^\+573[0-9]{9}$'),
  "reason" TEXT NOT NULL, "source" TEXT NOT NULL, "sourceCallId" TEXT, "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PayJoyVoiceBatch_status_scheduledAt_idx" ON "PayJoyVoiceBatch"("status","scheduledAt");
CREATE INDEX IF NOT EXISTS "PayJoyVoiceBatch_sourceBatchId_createdAt_idx" ON "PayJoyVoiceBatch"("sourceBatchId","createdAt");
CREATE INDEX IF NOT EXISTS "PayJoyVoiceCall_batchId_status_idx" ON "PayJoyVoiceCall"("batchId","status");
CREATE INDEX IF NOT EXISTS "PayJoyVoiceEvent_batchId_createdAt_idx" ON "PayJoyVoiceEvent"("batchId","createdAt");
CREATE INDEX IF NOT EXISTS "PayJoyVoiceEvent_callId_createdAt_idx" ON "PayJoyVoiceEvent"("callId","createdAt");
COMMIT;
