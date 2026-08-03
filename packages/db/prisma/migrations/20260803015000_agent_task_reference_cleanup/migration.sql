UPDATE "agentTask" AS task
SET "contactId" = NULL
WHERE task."contactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "contact" WHERE "contact"."id" = task."contactId"
  );

UPDATE "agentTask" AS task
SET "companyId" = NULL
WHERE task."companyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "company" WHERE "company"."id" = task."companyId"
  );
