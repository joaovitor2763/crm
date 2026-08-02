-- A deleted team sets LeadSubmission.teamId to NULL. Preserve its historical
-- `team:<id>` namespace so that the FK action cannot collide with `none`.
-- New rows without a team still receive `none`; reassignment to a team derives
-- the new team's namespace. This remains compatible with old clients because
-- the database, rather than the application, derives the key.
CREATE OR REPLACE FUNCTION crm_lead_submission_idempotency_scope_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."teamId" IS NOT NULL THEN
    NEW."idempotencyScopeKey" := 'team:' || NEW."teamId";
  ELSIF TG_OP = 'INSERT' THEN
    NEW."idempotencyScopeKey" := 'none';
  ELSE
    NEW."idempotencyScopeKey" := OLD."idempotencyScopeKey";
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE "leadSubmission"
DROP CONSTRAINT "leadSubmission_idempotencyScopeKey_matches_teamId_check";

ALTER TABLE "leadSubmission"
ADD CONSTRAINT "leadSubmission_idempotencyScopeKey_matches_teamId_check"
CHECK (
  ("teamId" IS NOT NULL AND "idempotencyScopeKey" = 'team:' || "teamId")
  OR (
    "teamId" IS NULL
    AND (
      "idempotencyScopeKey" = 'none'
      OR "idempotencyScopeKey" ~ '^team:.+$'
    )
  )
);
