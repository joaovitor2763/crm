-- Provider-neutral, versioned dashboard definitions.
CREATE TYPE "DashboardDefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "dashboardDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "DashboardDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
  "spec" JSONB NOT NULL,
  "businessUnitId" TEXT,
  "createdByType" "AuditActorType" NOT NULL,
  "createdById" TEXT,
  "updatedByType" "AuditActorType",
  "updatedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboardDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboardDefinition_key_version_key"
  ON "dashboardDefinition"("key", "version");
CREATE INDEX "dashboardDefinition_businessUnitId_status_updatedAt_idx"
  ON "dashboardDefinition"("businessUnitId", "status", "updatedAt");
CREATE INDEX "dashboardDefinition_key_status_idx"
  ON "dashboardDefinition"("key", "status");

ALTER TABLE "dashboardDefinition"
  ADD CONSTRAINT "dashboardDefinition_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "rolePermission" ("id", "roleId", "resource", "action", "scope", "createdAt", "updatedAt")
VALUES
  ('perm-bu-admin-dashboards-read', 'role-business-unit-admin', 'dashboards', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-dashboards-manage', 'role-business-unit-admin', 'dashboards', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-dashboards-read', 'role-operations', 'dashboards', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-dashboards-manage', 'role-operations', 'dashboards', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-dashboards-read', 'role-sales-manager', 'dashboards', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-dashboards-manage', 'role-sales-manager', 'dashboards', 'MANAGE', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-dashboards-read', 'role-sales-representative', 'dashboards', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-read-only-dashboards-read', 'role-read-only', 'dashboards', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("roleId", "resource", "action") DO UPDATE SET
  "scope" = EXCLUDED."scope",
  "updatedAt" = CURRENT_TIMESTAMP;
