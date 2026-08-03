ALTER TYPE "AutomationRunStatus" ADD VALUE 'WAITING';

ALTER TABLE "automation"
ADD COLUMN "workflow" JSONB;

ALTER TABLE "automationRun"
ADD COLUMN "workflow" JSONB,
ADD COLUMN "state" JSONB,
ADD COLUMN "trace" JSONB NOT NULL DEFAULT '[]';
