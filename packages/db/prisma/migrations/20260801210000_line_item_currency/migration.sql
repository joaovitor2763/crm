-- The catalogue currency is part of the price snapshot too. Backfill any local
-- line items created between the foundation migration and this correction.
ALTER TABLE "dealLineItem"
    ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

UPDATE "dealLineItem" AS item
SET "currency" = product."currency"
FROM "product" AS product
WHERE item."productId" = product."id";

ALTER TABLE "dealLineItem" ALTER COLUMN "currency" DROP DEFAULT;
