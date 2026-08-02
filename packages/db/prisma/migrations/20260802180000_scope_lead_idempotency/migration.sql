-- External identifiers and idempotency keys belong to one business unit. A
-- scoped credential must not learn or consume another unit's intake result.
DROP INDEX IF EXISTS "leadSubmission_source_externalId_key";
DROP INDEX IF EXISTS "leadSubmission_source_idempotencyKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "leadSubmission_source_businessUnitId_externalId_key"
ON "leadSubmission"("source", "businessUnitId", "externalId");

CREATE UNIQUE INDEX IF NOT EXISTS "leadSubmission_source_businessUnitId_idempotencyKey_key"
ON "leadSubmission"("source", "businessUnitId", "idempotencyKey");
