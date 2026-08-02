-- A default is a singleton database invariant, not an application convention.
-- Keep the oldest default if data from concurrent requests already introduced
-- more than one before this constraint is applied.
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rank
    FROM "pipeline"
    WHERE "isDefault" = true
)
UPDATE "pipeline"
SET "isDefault" = false
WHERE "id" IN (SELECT "id" FROM ranked WHERE rank > 1);

CREATE UNIQUE INDEX "pipeline_single_default_idx"
ON "pipeline" ("isDefault")
WHERE "isDefault" = true;
