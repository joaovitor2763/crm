-- Merge retries use operationId as their durable idempotency key.
DROP INDEX IF EXISTS "revenueAccountMerge_operationId_idx";
CREATE UNIQUE INDEX "revenueAccountMerge_operationId_key"
  ON "revenueAccountMerge"("operationId");
