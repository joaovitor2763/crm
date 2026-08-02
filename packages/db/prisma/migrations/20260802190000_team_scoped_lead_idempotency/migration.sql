-- Keep idempotency namespaces distinct for each team inside a business unit.
-- `none` represents an unassigned submission; `team:<id>` represents a team.
-- A non-null key avoids PostgreSQL's default NULLS DISTINCT behavior.
-- The trigger derives this value so old clients that do not know this column
-- remain compatible during a rolling deployment.
ALTER TABLE "leadSubmission"
ADD COLUMN "idempotencyScopeKey" TEXT NOT NULL DEFAULT 'none';

CREATE OR REPLACE FUNCTION crm_lead_submission_idempotency_scope_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."idempotencyScopeKey" := CASE
    WHEN NEW."teamId" IS NULL THEN 'none'
    ELSE 'team:' || NEW."teamId"
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leadSubmission_idempotencyScopeKey_derive
BEFORE INSERT OR UPDATE OF "teamId", "idempotencyScopeKey"
ON "leadSubmission"
FOR EACH ROW
EXECUTE FUNCTION crm_lead_submission_idempotency_scope_key();

UPDATE "leadSubmission"
SET "idempotencyScopeKey" = CASE
  WHEN "teamId" IS NULL THEN 'none'
  ELSE 'team:' || "teamId"
END;

ALTER TABLE "leadSubmission"
ADD CONSTRAINT "leadSubmission_idempotencyScopeKey_matches_teamId_check"
CHECK (
  ("teamId" IS NULL AND "idempotencyScopeKey" = 'none')
  OR ("teamId" IS NOT NULL AND "idempotencyScopeKey" = 'team:' || "teamId")
);

CREATE UNIQUE INDEX "leadSubmission_source_businessUnitId_idempotencyScopeKey_externalId_key"
ON "leadSubmission"("source", "businessUnitId", "idempotencyScopeKey", "externalId");

CREATE UNIQUE INDEX "leadSubmission_source_businessUnitId_idempotencyScopeKey_idempotencyKey_key"
ON "leadSubmission"("source", "businessUnitId", "idempotencyScopeKey", "idempotencyKey");

DROP INDEX "leadSubmission_source_businessUnitId_externalId_key";
DROP INDEX "leadSubmission_source_businessUnitId_idempotencyKey_key";
