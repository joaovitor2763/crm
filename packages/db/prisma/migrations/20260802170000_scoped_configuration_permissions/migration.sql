-- Defaults belong to a business unit. A null businessUnitId is the single
-- global catalogue/pipeline shared by the whole tenant.
DROP INDEX IF EXISTS "pipeline_single_default_idx";
CREATE UNIQUE INDEX "pipeline_single_global_default_idx"
ON "pipeline" ("isDefault")
WHERE "isDefault" = true AND "businessUnitId" IS NULL;
CREATE UNIQUE INDEX "pipeline_single_unit_default_idx"
ON "pipeline" ("businessUnitId")
WHERE "isDefault" = true AND "businessUnitId" IS NOT NULL;

-- Configuration and timeline permissions are explicit and deny-by-default.
-- The UI, tRPC, public API and Eve all resolve the same role rows.
INSERT INTO "rolePermission" ("id", "roleId", "resource", "action", "scope", "createdAt", "updatedAt")
VALUES
  ('perm-bu-admin-activities-read', 'role-business-unit-admin', 'activities', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-activities-create', 'role-business-unit-admin', 'activities', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-activities-update', 'role-business-unit-admin', 'activities', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-pipelines-read', 'role-business-unit-admin', 'pipelines', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-pipelines-manage', 'role-business-unit-admin', 'pipelines', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-products-read', 'role-business-unit-admin', 'products', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-products-manage', 'role-business-unit-admin', 'products', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-forms-read', 'role-business-unit-admin', 'marketing-forms', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-forms-manage', 'role-business-unit-admin', 'marketing-forms', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-events-read', 'role-business-unit-admin', 'marketing-events', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-events-manage', 'role-business-unit-admin', 'marketing-events', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-fields', 'role-business-unit-admin', 'fields', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-contacts-archive', 'role-business-unit-admin', 'contacts', 'ARCHIVE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-contacts-restore', 'role-business-unit-admin', 'contacts', 'RESTORE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-companies-archive', 'role-business-unit-admin', 'companies', 'ARCHIVE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-companies-restore', 'role-business-unit-admin', 'companies', 'RESTORE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-deals-archive', 'role-business-unit-admin', 'deals', 'ARCHIVE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-deals-restore', 'role-business-unit-admin', 'deals', 'RESTORE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-sales-manager-activities-read', 'role-sales-manager', 'activities', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-activities-create', 'role-sales-manager', 'activities', 'CREATE', 'MANAGED_TEAMS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-activities-update', 'role-sales-manager', 'activities', 'UPDATE', 'MANAGED_TEAMS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-pipelines-read', 'role-sales-manager', 'pipelines', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-products-read', 'role-sales-manager', 'products', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-companies-create', 'role-sales-manager', 'companies', 'CREATE', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-sales-rep-activities-read', 'role-sales-representative', 'activities', 'READ', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-activities-create', 'role-sales-representative', 'activities', 'CREATE', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-activities-update', 'role-sales-representative', 'activities', 'UPDATE', 'OWNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-pipelines-read', 'role-sales-representative', 'pipelines', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-products-read', 'role-sales-representative', 'products', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-marketing-manager-activities-read', 'role-marketing-manager', 'activities', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-activities-create', 'role-marketing-manager', 'activities', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-activities-update', 'role-marketing-manager', 'activities', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-forms-read', 'role-marketing-manager', 'marketing-forms', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-forms-manage', 'role-marketing-manager', 'marketing-forms', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-events-read', 'role-marketing-manager', 'marketing-events', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-events-manage', 'role-marketing-manager', 'marketing-events', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-marketing-analyst-activities-read', 'role-marketing-analyst', 'activities', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-analyst-forms-read', 'role-marketing-analyst', 'marketing-forms', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-analyst-events-read', 'role-marketing-analyst', 'marketing-events', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-operations-activities-read', 'role-operations', 'activities', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-activities-create', 'role-operations', 'activities', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-activities-update', 'role-operations', 'activities', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-pipelines-read', 'role-operations', 'pipelines', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-pipelines-manage', 'role-operations', 'pipelines', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-products-read', 'role-operations', 'products', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-products-manage', 'role-operations', 'products', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-forms-read', 'role-operations', 'marketing-forms', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-forms-manage', 'role-operations', 'marketing-forms', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-events-read', 'role-operations', 'marketing-events', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-events-manage', 'role-operations', 'marketing-events', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-read-only-activities', 'role-read-only', 'activities', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-read-only-pipelines', 'role-read-only', 'pipelines', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-read-only-products', 'role-read-only', 'products', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("roleId", "resource", "action") DO UPDATE SET
  "scope" = EXCLUDED."scope",
  "updatedAt" = CURRENT_TIMESTAMP;
