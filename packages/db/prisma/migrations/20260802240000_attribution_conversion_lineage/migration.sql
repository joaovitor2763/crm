-- Normalized, append-only attribution touches. Existing Activity and
-- LeadSubmission rows remain source records and are projected by the API.
CREATE TYPE "ConversionEntityType" AS ENUM ('CONTACT', 'COMPANY', 'DEAL', 'REVENUE_ACCOUNT');

CREATE TABLE "conversionAttributionEvent" (
  "id" TEXT NOT NULL,
  "entityType" "ConversionEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "contactId" TEXT,
  "companyId" TEXT,
  "dealId" TEXT,
  "revenueAccountId" TEXT,
  "businessUnitId" TEXT NOT NULL,
  "teamId" TEXT,
  "actorType" "AuditActorType" NOT NULL,
  "actorId" TEXT,
  "operationId" TEXT NOT NULL,
  "channel" TEXT,
  "source" TEXT,
  "conversionType" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmTerm" TEXT,
  "utmContent" TEXT,
  "marketingFormId" TEXT,
  "marketingEventId" TEXT,
  "pipelineId" TEXT,
  "pipelineStageId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversionAttributionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversionAttributionEvent_subject_check" CHECK (
    ("entityType" = 'CONTACT' AND ("contactId" = "entityId" OR "contactId" IS NULL) AND "companyId" IS NULL AND "dealId" IS NULL AND "revenueAccountId" IS NULL)
    OR ("entityType" = 'COMPANY' AND ("companyId" = "entityId" OR "companyId" IS NULL) AND "contactId" IS NULL AND "dealId" IS NULL AND "revenueAccountId" IS NULL)
    OR ("entityType" = 'DEAL' AND ("dealId" = "entityId" OR "dealId" IS NULL) AND "contactId" IS NULL AND "companyId" IS NULL AND "revenueAccountId" IS NULL)
    OR ("entityType" = 'REVENUE_ACCOUNT' AND ("revenueAccountId" = "entityId" OR "revenueAccountId" IS NULL) AND "contactId" IS NULL AND "companyId" IS NULL AND "dealId" IS NULL)
  )
);

CREATE UNIQUE INDEX "conversionAttributionEvent_entityType_entityId_operationId_key"
  ON "conversionAttributionEvent"("entityType", "entityId", "operationId");
CREATE INDEX "conversionAttributionEvent_entityType_entityId_occurredAt_idx"
  ON "conversionAttributionEvent"("entityType", "entityId", "occurredAt");
CREATE INDEX "conversionAttributionEvent_businessUnitId_teamId_occurredAt_idx"
  ON "conversionAttributionEvent"("businessUnitId", "teamId", "occurredAt");
CREATE INDEX "conversionAttributionEvent_conversionType_occurredAt_idx"
  ON "conversionAttributionEvent"("conversionType", "occurredAt");
CREATE INDEX "conversionAttributionEvent_source_occurredAt_idx"
  ON "conversionAttributionEvent"("source", "occurredAt");
CREATE INDEX "conversionAttributionEvent_pipelineId_occurredAt_idx"
  ON "conversionAttributionEvent"("pipelineId", "occurredAt");
CREATE INDEX "conversionAttributionEvent_operationId_idx"
  ON "conversionAttributionEvent"("operationId");

ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_marketingFormId_fkey"
  FOREIGN KEY ("marketingFormId") REFERENCES "marketingForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_marketingEventId_fkey"
  FOREIGN KEY ("marketingEventId") REFERENCES "marketingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_pipelineId_fkey"
  FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversionAttributionEvent"
  ADD CONSTRAINT "conversionAttributionEvent_pipelineStageId_pipelineId_fkey"
  FOREIGN KEY ("pipelineStageId", "pipelineId") REFERENCES "pipelineStage"("id", "pipelineId") ON DELETE SET NULL ON UPDATE CASCADE;
