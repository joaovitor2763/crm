-- Compatibility for databases that applied the foundations migration while
-- this branch was still under local development.
CREATE UNIQUE INDEX IF NOT EXISTS "pipelineStage_id_pipelineId_key"
ON "pipelineStage" ("id", "pipelineId");

ALTER TABLE "deal" DROP CONSTRAINT IF EXISTS "deal_stageId_fkey";
ALTER TABLE "deal" DROP CONSTRAINT IF EXISTS "deal_stageId_pipelineId_fkey";
ALTER TABLE "deal" ADD CONSTRAINT "deal_stageId_pipelineId_fkey"
FOREIGN KEY ("stageId", "pipelineId")
REFERENCES "pipelineStage" ("id", "pipelineId")
ON DELETE RESTRICT ON UPDATE CASCADE;
