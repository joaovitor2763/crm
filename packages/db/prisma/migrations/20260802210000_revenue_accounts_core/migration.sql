-- Revenue architecture core. `RevenueAccount` is the commercial Conta;
-- Better Auth's `account` table remains the OAuth credential store.

CREATE TYPE "RevenueAccountTargetKind" AS ENUM ('CONTACT', 'COMPANY', 'DEAL');
CREATE TYPE "RevenueAccountMergeFieldPolicy" AS ENUM ('TARGET', 'SOURCE', 'UNION', 'SKIP');
CREATE TYPE "RevenueAccountLineageEventType" AS ENUM (
  'CREATED', 'UPDATED', 'ARCHIVED', 'RELATION_ATTACHED',
  'RELATION_DETACHED', 'MERGED_IN', 'MERGED_OUT'
);

ALTER TABLE "customFieldSearchValue"
  ADD COLUMN "revenueAccountId" TEXT;

CREATE TABLE "revenueAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT,
  "businessUnitId" TEXT NOT NULL DEFAULT 'business-unit-default',
  "teamId" TEXT,
  "ownerId" TEXT,
  "customValues" JSONB NOT NULL DEFAULT '{}',
  "archivedAt" TIMESTAMP(3),
  "mergedAt" TIMESTAMP(3),
  "mergedIntoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenueAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenueAccountConfig" (
  "id" TEXT NOT NULL DEFAULT 'revenue-account-config',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mergePolicy" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenueAccountConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenueAccountRelationPolicy" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "targetKind" "RevenueAccountTargetKind" NOT NULL,
  "cardinality" "RelationCardinality" NOT NULL,
  "attachEnabled" BOOLEAN NOT NULL DEFAULT true,
  "detachEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenueAccountRelationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenueAccountContact" (
  "revenueAccountId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "attachedByType" "AuditActorType" NOT NULL,
  "attachedById" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenueAccountContact_pkey" PRIMARY KEY ("revenueAccountId", "contactId")
);

CREATE TABLE "revenueAccountCompany" (
  "revenueAccountId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "attachedByType" "AuditActorType" NOT NULL,
  "attachedById" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenueAccountCompany_pkey" PRIMARY KEY ("revenueAccountId", "companyId")
);

CREATE TABLE "revenueAccountDeal" (
  "revenueAccountId" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "attachedByType" "AuditActorType" NOT NULL,
  "attachedById" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenueAccountDeal_pkey" PRIMARY KEY ("revenueAccountId", "dealId")
);

CREATE TABLE "revenueAccountAttributeHistory" (
  "id" TEXT NOT NULL,
  "revenueAccountId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "changedByType" "AuditActorType" NOT NULL,
  "changedById" TEXT,
  "source" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revenueAccountAttributeHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenueAccountLineageEvent" (
  "id" TEXT NOT NULL,
  "revenueAccountId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "type" "RevenueAccountLineageEventType" NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "actorType" "AuditActorType" NOT NULL,
  "actorId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revenueAccountLineageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenueAccountMerge" (
  "id" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "targetAccountId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "policy" JSONB NOT NULL,
  "executedByType" "AuditActorType" NOT NULL,
  "executedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revenueAccountMerge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_revenueAccountId_key"
  ON "customFieldSearchValue"("fieldId", "revenueAccountId");
CREATE INDEX "revenueAccount_businessUnitId_teamId_archivedAt_idx"
  ON "revenueAccount"("businessUnitId", "teamId", "archivedAt");
CREATE INDEX "revenueAccount_ownerId_archivedAt_idx"
  ON "revenueAccount"("ownerId", "archivedAt");
CREATE INDEX "revenueAccount_domain_idx" ON "revenueAccount"("domain");
CREATE INDEX "revenueAccount_mergedIntoId_idx" ON "revenueAccount"("mergedIntoId");
CREATE UNIQUE INDEX "revenueAccountRelationPolicy_configId_targetKind_key"
  ON "revenueAccountRelationPolicy"("configId", "targetKind");
CREATE INDEX "revenueAccountContact_contactId_archivedAt_idx"
  ON "revenueAccountContact"("contactId", "archivedAt");
CREATE INDEX "revenueAccountCompany_companyId_archivedAt_idx"
  ON "revenueAccountCompany"("companyId", "archivedAt");
CREATE INDEX "revenueAccountDeal_dealId_archivedAt_idx"
  ON "revenueAccountDeal"("dealId", "archivedAt");
CREATE INDEX "revenueAccountAttributeHistory_revenueAccountId_fieldKey_ch_idx"
  ON "revenueAccountAttributeHistory"("revenueAccountId", "fieldKey", "changedAt");
CREATE INDEX "revenueAccountAttributeHistory_operationId_idx"
  ON "revenueAccountAttributeHistory"("operationId");
CREATE INDEX "revenueAccountLineageEvent_revenueAccountId_createdAt_idx"
  ON "revenueAccountLineageEvent"("revenueAccountId", "createdAt");
CREATE INDEX "revenueAccountLineageEvent_sourceType_sourceId_idx"
  ON "revenueAccountLineageEvent"("sourceType", "sourceId");
CREATE INDEX "revenueAccountLineageEvent_operationId_idx"
  ON "revenueAccountLineageEvent"("operationId");
CREATE INDEX "revenueAccountMerge_sourceAccountId_createdAt_idx"
  ON "revenueAccountMerge"("sourceAccountId", "createdAt");
CREATE INDEX "revenueAccountMerge_targetAccountId_createdAt_idx"
  ON "revenueAccountMerge"("targetAccountId", "createdAt");
CREATE INDEX "revenueAccountMerge_operationId_idx"
  ON "revenueAccountMerge"("operationId");

ALTER TABLE "customFieldSearchValue"
  ADD CONSTRAINT "customFieldSearchValue_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccount"
  ADD CONSTRAINT "revenueAccount_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revenueAccount"
  ADD CONSTRAINT "revenueAccount_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "revenueAccount"
  ADD CONSTRAINT "revenueAccount_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "revenueAccount"
  ADD CONSTRAINT "revenueAccount_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "revenueAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "revenueAccountRelationPolicy"
  ADD CONSTRAINT "revenueAccountRelationPolicy_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "revenueAccountConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountContact"
  ADD CONSTRAINT "revenueAccountContact_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountContact"
  ADD CONSTRAINT "revenueAccountContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountCompany"
  ADD CONSTRAINT "revenueAccountCompany_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountCompany"
  ADD CONSTRAINT "revenueAccountCompany_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountDeal"
  ADD CONSTRAINT "revenueAccountDeal_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountDeal"
  ADD CONSTRAINT "revenueAccountDeal_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountAttributeHistory"
  ADD CONSTRAINT "revenueAccountAttributeHistory_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountLineageEvent"
  ADD CONSTRAINT "revenueAccountLineageEvent_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "revenueAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenueAccountMerge"
  ADD CONSTRAINT "revenueAccountMerge_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "revenueAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revenueAccountMerge"
  ADD CONSTRAINT "revenueAccountMerge_targetAccountId_fkey"
  FOREIGN KEY ("targetAccountId") REFERENCES "revenueAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "objectDefinition" ("id", "key", "name", "pluralName", "kind", "systemModel", "createdAt", "updatedAt")
VALUES ('object-revenue-account', 'revenue-accounts', 'Conta', 'Contas', 'SYSTEM', 'RevenueAccount', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "revenueAccountConfig" ("id", "enabled", "mergePolicy", "createdAt", "updatedAt")
VALUES ('revenue-account-config', false, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rolePermission" ("id", "roleId", "resource", "action", "scope", "createdAt", "updatedAt")
VALUES
  ('perm-bu-admin-revenue-accounts-read', 'role-business-unit-admin', 'revenue-accounts', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-revenue-accounts-create', 'role-business-unit-admin', 'revenue-accounts', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-revenue-accounts-update', 'role-business-unit-admin', 'revenue-accounts', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-revenue-accounts-read', 'role-sales-manager', 'revenue-accounts', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-revenue-accounts-create', 'role-sales-manager', 'revenue-accounts', 'CREATE', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-revenue-accounts-update', 'role-sales-manager', 'revenue-accounts', 'UPDATE', 'MANAGED_TEAMS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-revenue-accounts-read', 'role-sales-representative', 'revenue-accounts', 'READ', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-revenue-accounts-create', 'role-sales-representative', 'revenue-accounts', 'CREATE', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-revenue-accounts-update', 'role-sales-representative', 'revenue-accounts', 'UPDATE', 'OWNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-revenue-accounts-read', 'role-operations', 'revenue-accounts', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-revenue-accounts-update', 'role-operations', 'revenue-accounts', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-read-only-revenue-accounts-read', 'role-read-only', 'revenue-accounts', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("roleId", "resource", "action") DO NOTHING;
