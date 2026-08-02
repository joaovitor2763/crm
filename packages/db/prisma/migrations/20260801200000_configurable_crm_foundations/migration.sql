-- Pipeline stages used to be a PostgreSQL enum. Create the configurable
-- records first and backfill every deal before removing the legacy column.
CREATE TYPE "PipelineStageType" AS ENUM ('OPEN', 'WON', 'LOST', 'UNQUALIFIED');

ALTER TYPE "ActivityType" ADD VALUE 'MESSAGE';
ALTER TYPE "ActivityType" ADD VALUE 'FORM_CONVERSION';
ALTER TYPE "ActivityType" ADD VALUE 'EVENT_ATTENDANCE';

CREATE TABLE "pipeline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "PipelineStageType" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipelineStage_pkey" PRIMARY KEY ("id")
);

INSERT INTO "pipeline" ("id", "name", "isDefault", "updatedAt")
VALUES ('default-pipeline', 'Sales pipeline', true, CURRENT_TIMESTAMP);

INSERT INTO "pipelineStage" ("id", "pipelineId", "name", "position", "type", "updatedAt")
VALUES
    ('default-stage-demo-booked', 'default-pipeline', 'Demo booked', 0, 'OPEN', CURRENT_TIMESTAMP),
    ('default-stage-qualified', 'default-pipeline', 'Qualified to buy', 1, 'OPEN', CURRENT_TIMESTAMP),
    ('default-stage-decision-maker', 'default-pipeline', 'Decision maker in', 2, 'OPEN', CURRENT_TIMESTAMP),
    ('default-stage-contract-sent', 'default-pipeline', 'Contract sent', 3, 'OPEN', CURRENT_TIMESTAMP),
    ('default-stage-closed-won', 'default-pipeline', 'Closed won', 4, 'WON', CURRENT_TIMESTAMP),
    ('default-stage-closed-lost', 'default-pipeline', 'Closed lost', 5, 'LOST', CURRENT_TIMESTAMP),
    ('default-stage-unqualified', 'default-pipeline', 'Unqualified', 6, 'UNQUALIFIED', CURRENT_TIMESTAMP);

ALTER TABLE "deal"
    ADD COLUMN "archivedAt" TIMESTAMP(3),
    ADD COLUMN "pipelineId" TEXT,
    ADD COLUMN "stageId" TEXT;

UPDATE "deal"
SET
    "pipelineId" = 'default-pipeline',
    "stageId" = CASE "stage"::text
        WHEN 'DEMO_BOOKED' THEN 'default-stage-demo-booked'
        WHEN 'QUALIFIED_TO_BUY' THEN 'default-stage-qualified'
        WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'default-stage-decision-maker'
        WHEN 'CONTRACT_SENT' THEN 'default-stage-contract-sent'
        WHEN 'CLOSED_WON' THEN 'default-stage-closed-won'
        WHEN 'CLOSED_LOST' THEN 'default-stage-closed-lost'
        WHEN 'UNQUALIFIED_TO_BUY' THEN 'default-stage-unqualified'
    END;

DROP INDEX "deal_stage_idx";

ALTER TABLE "deal"
    ALTER COLUMN "pipelineId" SET NOT NULL,
    ALTER COLUMN "stageId" SET NOT NULL,
    DROP COLUMN "stage";

DROP TYPE "DealStage";

ALTER TABLE "activity"
    ADD COLUMN "marketingEventId" TEXT,
    ADD COLUMN "marketingFormId" TEXT;

ALTER TABLE "company" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "contact"
    ADD COLUMN "archivedAt" TIMESTAMP(3),
    ADD COLUMN "utmCampaign" TEXT,
    ADD COLUMN "utmContent" TEXT,
    ADD COLUMN "utmMedium" TEXT,
    ADD COLUMN "utmSource" TEXT,
    ADD COLUMN "utmTerm" TEXT;

CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dealLineItem" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dealLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketingForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketingForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketingEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pipeline_archivedAt_name_idx" ON "pipeline"("archivedAt", "name");
CREATE INDEX "pipelineStage_pipelineId_type_idx" ON "pipelineStage"("pipelineId", "type");
CREATE UNIQUE INDEX "pipelineStage_pipelineId_position_key" ON "pipelineStage"("pipelineId", "position");
CREATE UNIQUE INDEX "pipelineStage_id_pipelineId_key" ON "pipelineStage"("id", "pipelineId");
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");
CREATE INDEX "product_archivedAt_name_idx" ON "product"("archivedAt", "name");
CREATE INDEX "dealLineItem_dealId_idx" ON "dealLineItem"("dealId");
CREATE INDEX "dealLineItem_productId_idx" ON "dealLineItem"("productId");
CREATE UNIQUE INDEX "marketingForm_externalId_key" ON "marketingForm"("externalId");
CREATE INDEX "marketingForm_archivedAt_name_idx" ON "marketingForm"("archivedAt", "name");
CREATE INDEX "marketingEvent_archivedAt_startsAt_idx" ON "marketingEvent"("archivedAt", "startsAt");
CREATE INDEX "activity_marketingFormId_createdAt_idx" ON "activity"("marketingFormId", "createdAt");
CREATE INDEX "activity_marketingEventId_createdAt_idx" ON "activity"("marketingEventId", "createdAt");
CREATE INDEX "company_archivedAt_idx" ON "company"("archivedAt");
CREATE INDEX "contact_archivedAt_idx" ON "contact"("archivedAt");
CREATE INDEX "deal_pipelineId_idx" ON "deal"("pipelineId");
CREATE INDEX "deal_stageId_idx" ON "deal"("stageId");
CREATE INDEX "deal_archivedAt_idx" ON "deal"("archivedAt");

ALTER TABLE "deal" ADD CONSTRAINT "deal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_stageId_pipelineId_fkey" FOREIGN KEY ("stageId", "pipelineId") REFERENCES "pipelineStage"("id", "pipelineId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pipelineStage" ADD CONSTRAINT "pipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dealLineItem" ADD CONSTRAINT "dealLineItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dealLineItem" ADD CONSTRAINT "dealLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity" ADD CONSTRAINT "activity_marketingFormId_fkey" FOREIGN KEY ("marketingFormId") REFERENCES "marketingForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity" ADD CONSTRAINT "activity_marketingEventId_fkey" FOREIGN KEY ("marketingEventId") REFERENCES "marketingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
