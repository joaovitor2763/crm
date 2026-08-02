-- Revenue motion persistence. Stage policy columns are the current read model;
-- PipelineBlueprintVersion is the append-only history used by transitions and
-- audit views.
CREATE TYPE "PipelineFunnelType" AS ENUM ('FULL_BOWTIE', 'LEFT_SIDE', 'RIGHT_SIDE', 'CUSTOM');

ALTER TABLE "pipeline"
  ADD COLUMN "funnelType" "PipelineFunnelType" NOT NULL DEFAULT 'FULL_BOWTIE',
  ADD COLUMN "blueprintVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "pipelineStage"
  ADD COLUMN "key" TEXT,
  ADD COLUMN "semanticPhase" TEXT NOT NULL DEFAULT 'conversion',
  ADD COLUMN "allowedRoleKeys" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "responsibleRoleKey" TEXT,
  ADD COLUMN "defaultResponsibleRoleKey" TEXT,
  ADD COLUMN "allowedNextStageIds" JSONB NOT NULL DEFAULT '[]';

UPDATE "pipelineStage" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "pipelineStage" ALTER COLUMN "key" SET NOT NULL;

CREATE UNIQUE INDEX "pipelineStage_pipelineId_key_key"
  ON "pipelineStage" ("pipelineId", "key");

UPDATE "pipeline" AS p
SET "funnelType" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "pipelineStage" s
    WHERE s."pipelineId" = p."id" AND s."type" = 'WON'
  ) AND EXISTS (
    SELECT 1 FROM "pipelineStage" s
    WHERE s."pipelineId" = p."id" AND s."type" = 'LOST'
  ) THEN 'FULL_BOWTIE'::"PipelineFunnelType"
  ELSE 'LEFT_SIDE'::"PipelineFunnelType"
END;

CREATE TABLE "pipelineBlueprintVersion" (
  "id" TEXT NOT NULL,
  "pipelineId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "funnelType" "PipelineFunnelType" NOT NULL,
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipelineBlueprintVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipelineHandoverRule" (
  "id" TEXT NOT NULL,
  "blueprintVersionId" TEXT NOT NULL,
  "fromStageId" TEXT NOT NULL,
  "toStageId" TEXT NOT NULL,
  "fromRoleKey" TEXT NOT NULL,
  "toRoleKey" TEXT NOT NULL,
  "acceptanceRequired" BOOLEAN NOT NULL DEFAULT false,
  "acceptanceSlaMinutes" INTEGER,
  "assignmentStrategy" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipelineHandoverRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pipelineBlueprintVersion_pipelineId_version_key"
  ON "pipelineBlueprintVersion" ("pipelineId", "version");
CREATE INDEX "pipelineBlueprintVersion_pipelineId_createdAt_idx"
  ON "pipelineBlueprintVersion" ("pipelineId", "createdAt");
CREATE UNIQUE INDEX "pipelineHandoverRule_blueprintVersionId_fromStageId_toStage_key"
  ON "pipelineHandoverRule" ("blueprintVersionId", "fromStageId", "toStageId", "fromRoleKey", "toRoleKey");
CREATE INDEX "pipelineHandoverRule_blueprintVersionId_fromStageId_toStage_idx"
  ON "pipelineHandoverRule" ("blueprintVersionId", "fromStageId", "toStageId");

ALTER TABLE "pipelineBlueprintVersion"
  ADD CONSTRAINT "pipelineBlueprintVersion_pipelineId_fkey"
  FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipelineHandoverRule"
  ADD CONSTRAINT "pipelineHandoverRule_blueprintVersionId_fkey"
  FOREIGN KEY ("blueprintVersionId") REFERENCES "pipelineBlueprintVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing pipelines remain permissive: their empty role arrays mean that no
-- role or transition policy is enforced until an administrator publishes one.
INSERT INTO "pipelineBlueprintVersion" ("id", "pipelineId", "version", "funnelType", "snapshot")
SELECT
  'pipeline-blueprint-' || p."id" || '-1',
  p."id",
  1,
  p."funnelType",
  jsonb_build_object(
    'type', CASE p."funnelType"
      WHEN 'FULL_BOWTIE' THEN 'full_bowtie'
      WHEN 'LEFT_SIDE' THEN 'left_side'
      WHEN 'RIGHT_SIDE' THEN 'right_side'
      ELSE 'custom'
    END,
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s."id",
        'key', s."key",
        'position', s."position",
        'type', s."type",
        'semanticPhase', s."semanticPhase",
        'allowedRoles', s."allowedRoleKeys",
        'responsibleRole', s."responsibleRoleKey",
        'defaultResponsibleRole', s."defaultResponsibleRoleKey",
        'allowedNextStages', s."allowedNextStageIds"
      ) ORDER BY s."position")
      FROM "pipelineStage" s WHERE s."pipelineId" = p."id"
    ), '[]'::jsonb),
    'handovers', '[]'::jsonb
  )
FROM "pipeline" p
ON CONFLICT ("pipelineId", "version") DO NOTHING;
