-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('LEAD', 'MQL', 'SQL', 'OPPORTUNITY', 'CUSTOMER', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "UserAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE', 'DESTROY', 'TRANSFER', 'MANAGE', 'EXPORT');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('NONE', 'OWNED', 'TEAM', 'MANAGED_TEAMS', 'BUSINESS_UNIT', 'BUSINESS_UNIT_TREE', 'ALL');

-- CreateEnum
CREATE TYPE "BusinessUnitMembershipType" AS ENUM ('MEMBER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ObjectDefinitionKind" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'DATE', 'DATE_TIME', 'EMAIL', 'PHONE', 'URL', 'CURRENCY', 'RELATION');

-- CreateEnum
CREATE TYPE "CustomFieldIndexMode" AS ENUM ('BASIC', 'INDEXED', 'UNIQUE');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "RelationCardinality" AS ENUM ('ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY');

-- CreateEnum
CREATE TYPE "LeadSubmissionStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'DUPLICATE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'API_KEY', 'AUTOMATION', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ApiCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'LEASED', 'SUCCEEDED', 'FAILED', 'DEAD');

-- AlterTable
ALTER TABLE "activity" ADD COLUMN     "businessUnitId" TEXT NOT NULL DEFAULT 'business-unit-default',
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "globalLifecycleStage" "LifecycleStage" NOT NULL DEFAULT 'LEAD',
ADD COLUMN     "globalMarketingScore" DECIMAL(12,4),
ADD COLUMN     "globallyMarketingQualifiedAt" TIMESTAMP(3),
ADD COLUMN     "globallyMarketingQualifiedById" TEXT,
ADD COLUMN     "globallyMarketingQualifiedReason" TEXT;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "businessUnitId" TEXT NOT NULL DEFAULT 'business-unit-default',
ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "marketingEvent" ADD COLUMN     "businessUnitId" TEXT;

-- AlterTable
ALTER TABLE "marketingForm" ADD COLUMN     "businessUnitId" TEXT;

-- AlterTable
ALTER TABLE "pipeline" ADD COLUMN     "businessUnitId" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "businessUnitId" TEXT;

-- CreateTable
CREATE TABLE "businessUnit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "leaderId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businessUnitClosure" (
    "ancestorId" TEXT NOT NULL,
    "descendantId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "businessUnitClosure_pkey" PRIMARY KEY ("ancestorId","descendantId")
);

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businessUnitMembership" (
    "userId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "type" "BusinessUnitMembershipType" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businessUnitMembership_pkey" PRIMARY KEY ("userId","businessUnitId")
);

-- CreateTable
CREATE TABLE "teamMembership" (
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teamMembership_pkey" PRIMARY KEY ("userId","teamId")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userAccess" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryBusinessUnitId" TEXT,
    "primaryTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userAccess_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "rolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "scope" "AccessScope" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pluralName" TEXT NOT NULL,
    "kind" "ObjectDefinitionKind" NOT NULL DEFAULT 'SYSTEM',
    "systemModel" TEXT,
    "businessUnitId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customFieldDefinition" (
    "id" TEXT NOT NULL,
    "objectDefinitionId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "CustomFieldType" NOT NULL,
    "indexMode" "CustomFieldIndexMode" NOT NULL DEFAULT 'BASIC',
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "agentReadable" BOOLEAN NOT NULL DEFAULT false,
    "agentWritable" BOOLEAN NOT NULL DEFAULT false,
    "apiReadable" BOOLEAN NOT NULL DEFAULT true,
    "apiWritable" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customFieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldPermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canUpdate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fieldPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customFieldSearchValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "companyBusinessUnitStateId" TEXT,
    "contactBusinessUnitStateId" TEXT,
    "dealId" TEXT,
    "customObjectRecordId" TEXT,
    "textValue" TEXT,
    "normalizedTextValue" TEXT,
    "numberValue" DECIMAL(30,10),
    "booleanValue" BOOLEAN,
    "dateValue" TIMESTAMP(3),
    "jsonValue" JSONB,
    "optionId" TEXT,
    "uniqueNormalizedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customFieldSearchValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectRelationDefinition" (
    "id" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "targetObjectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inverseName" TEXT NOT NULL,
    "cardinality" "RelationCardinality" NOT NULL DEFAULT 'MANY_TO_MANY',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectRelationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordRelation" (
    "id" TEXT NOT NULL,
    "relationDefinitionId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "targetRecordId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "createdByType" "AuditActorType" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customObjectRecord" (
    "id" TEXT NOT NULL,
    "objectDefinitionId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "teamId" TEXT,
    "ownerId" TEXT,
    "displayName" TEXT NOT NULL,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customObjectRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactBusinessUnitState" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "teamId" TEXT,
    "ownerId" TEXT,
    "lifecycleStage" "LifecycleStage" NOT NULL DEFAULT 'LEAD',
    "marketingScore" DECIMAL(12,4),
    "marketingQualifiedAt" TIMESTAMP(3),
    "marketingQualifiedReason" TEXT,
    "marketingQualifiedById" TEXT,
    "leadSource" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactBusinessUnitState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companyBusinessUnitState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "teamId" TEXT,
    "ownerId" TEXT,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companyBusinessUnitState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leadSubmission" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "status" "LeadSubmissionStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "normalizedPayload" JSONB,
    "reasons" JSONB,
    "businessUnitId" TEXT NOT NULL DEFAULT 'business-unit-default',
    "teamId" TEXT,
    "contactId" TEXT,
    "receivedByType" "AuditActorType" NOT NULL,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "leadSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditEvent" (
    "id" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "recordId" TEXT,
    "businessUnitId" TEXT,
    "teamId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "status" "ApiCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "roleId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiCredentialBusinessUnit" (
    "credentialId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,

    CONSTRAINT "apiCredentialBusinessUnit_pkey" PRIMARY KEY ("credentialId","businessUnitId")
);

-- CreateTable
CREATE TABLE "apiCredentialTeam" (
    "credentialId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "apiCredentialTeam_pkey" PRIMARY KEY ("credentialId","teamId")
);

-- CreateTable
CREATE TABLE "automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "roleId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "teamId" TEXT,
    "trigger" JSONB NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domainEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "recordId" TEXT,
    "businessUnitId" TEXT,
    "teamId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "causationId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhookEndpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventTypes" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "secretVersion" INTEGER NOT NULL DEFAULT 1,
    "secretLastFour" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "teamId" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhookDelivery_pkey" PRIMARY KEY ("id")
);

-- Bootstrap governance without changing what existing users can see. The
-- installation remains one tenant; this is its root business unit and the
-- system role catalogue. New identities are assigned explicitly by the API.
INSERT INTO "businessUnit" ("id", "key", "name", "createdAt", "updatedAt")
VALUES ('business-unit-default', 'default', 'Default business unit', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "businessUnitClosure" ("ancestorId", "descendantId", "depth")
VALUES ('business-unit-default', 'business-unit-default', 0);

INSERT INTO "team" ("id", "businessUnitId", "key", "name", "createdAt", "updatedAt")
VALUES ('team-default', 'business-unit-default', 'default', 'Default team', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "role" ("id", "key", "name", "description", "isSystem", "isAdmin", "createdAt", "updatedAt")
VALUES
  ('role-global-admin', 'global-admin', 'Global Admin', 'Full governance and data access.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-business-unit-admin', 'business-unit-admin', 'Business Unit Admin', 'Administers one unit and its descendants.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-sales-manager', 'sales-manager', 'Sales Manager', 'Manages sales records in the assigned unit.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-sales-representative', 'sales-representative', 'Sales Representative', 'Works owned and team sales records.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-marketing-manager', 'marketing-manager', 'Marketing Manager', 'Manages marketing qualification in the assigned unit.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-marketing-analyst', 'marketing-analyst', 'Marketing Analyst', 'Reads and qualifies marketing records.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-operations', 'operations', 'Operations', 'Operates data, fields and automations in assigned units.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-read-only', 'read-only', 'Read Only', 'Reads permitted records without modifying them.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "objectDefinition" ("id", "key", "name", "pluralName", "kind", "systemModel", "createdAt", "updatedAt")
VALUES
  ('object-contact', 'contacts', 'Contact', 'Contacts', 'SYSTEM', 'Contact', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('object-company', 'companies', 'Company', 'Companies', 'SYSTEM', 'Company', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('object-deal', 'deals', 'Deal', 'Deals', 'SYSTEM', 'Deal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('object-product', 'products', 'Product', 'Products', 'SYSTEM', 'Product', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('object-marketing-form', 'marketing-forms', 'Marketing form', 'Marketing forms', 'SYSTEM', 'MarketingForm', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('object-marketing-event', 'marketing-events', 'Marketing event', 'Marketing events', 'SYSTEM', 'MarketingEvent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Preserve the old all-signed-in access during migration. Administrators can
-- narrow each user after the governance UI is available.
INSERT INTO "userAccess" ("userId", "roleId", "status", "primaryBusinessUnitId", "primaryTeamId", "createdAt", "updatedAt")
SELECT "id", 'role-global-admin', 'ACTIVE', 'business-unit-default', 'team-default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "user";

INSERT INTO "businessUnitMembership" ("userId", "businessUnitId", "type", "createdAt", "updatedAt")
SELECT "id", 'business-unit-default', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "user";

INSERT INTO "teamMembership" ("userId", "teamId", "isLead", "createdAt", "updatedAt")
SELECT "id", 'team-default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "user";

INSERT INTO "contactBusinessUnitState" (
  "id", "contactId", "businessUnitId", "teamId", "ownerId", "leadSource",
  "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "createdAt", "updatedAt"
)
SELECT
  'contact-unit-' || "id", "id", 'business-unit-default', 'team-default', "ownerId", "source"::text,
  "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "contact";

INSERT INTO "companyBusinessUnitState" (
  "id", "companyId", "businessUnitId", "teamId", "ownerId", "createdAt", "updatedAt"
)
SELECT
  'company-unit-' || "id", "id", 'business-unit-default', 'team-default', "ownerId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "company";

-- Useful non-admin templates. A role row not listed here is deny-by-default.
INSERT INTO "rolePermission" ("id", "roleId", "resource", "action", "scope", "createdAt", "updatedAt")
VALUES
  ('perm-bu-admin-units-manage', 'role-business-unit-admin', 'business-units', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-teams-manage', 'role-business-unit-admin', 'teams', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-users-manage', 'role-business-unit-admin', 'users', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-contacts-read', 'role-business-unit-admin', 'contacts', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-contacts-create', 'role-business-unit-admin', 'contacts', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-contacts-update', 'role-business-unit-admin', 'contacts', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-companies-read', 'role-business-unit-admin', 'companies', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-companies-create', 'role-business-unit-admin', 'companies', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-companies-update', 'role-business-unit-admin', 'companies', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-deals-read', 'role-business-unit-admin', 'deals', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-deals-create', 'role-business-unit-admin', 'deals', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-deals-update', 'role-business-unit-admin', 'deals', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-automations', 'role-business-unit-admin', 'automations', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-bu-admin-webhooks', 'role-business-unit-admin', 'webhooks', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-sales-manager-contacts-read', 'role-sales-manager', 'contacts', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-contacts-create', 'role-sales-manager', 'contacts', 'CREATE', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-contacts-update', 'role-sales-manager', 'contacts', 'UPDATE', 'MANAGED_TEAMS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-companies-read', 'role-sales-manager', 'companies', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-companies-update', 'role-sales-manager', 'companies', 'UPDATE', 'MANAGED_TEAMS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-deals-read', 'role-sales-manager', 'deals', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-deals-create', 'role-sales-manager', 'deals', 'CREATE', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-manager-deals-update', 'role-sales-manager', 'deals', 'UPDATE', 'MANAGED_TEAMS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-sales-rep-contacts-read', 'role-sales-representative', 'contacts', 'READ', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-contacts-create', 'role-sales-representative', 'contacts', 'CREATE', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-contacts-update', 'role-sales-representative', 'contacts', 'UPDATE', 'OWNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-companies-read', 'role-sales-representative', 'companies', 'READ', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-companies-create', 'role-sales-representative', 'companies', 'CREATE', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-companies-update', 'role-sales-representative', 'companies', 'UPDATE', 'OWNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-deals-read', 'role-sales-representative', 'deals', 'READ', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-deals-create', 'role-sales-representative', 'deals', 'CREATE', 'TEAM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-sales-rep-deals-update', 'role-sales-representative', 'deals', 'UPDATE', 'OWNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-marketing-manager-contacts-read', 'role-marketing-manager', 'contacts', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-contacts-create', 'role-marketing-manager', 'contacts', 'CREATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-contacts-update', 'role-marketing-manager', 'contacts', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-fields', 'role-marketing-manager', 'fields', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-automations', 'role-marketing-manager', 'automations', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-manager-webhooks', 'role-marketing-manager', 'webhooks', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-marketing-analyst-contacts-read', 'role-marketing-analyst', 'contacts', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-marketing-analyst-contacts-update', 'role-marketing-analyst', 'contacts', 'UPDATE', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-operations-contacts-read', 'role-operations', 'contacts', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-contacts-update', 'role-operations', 'contacts', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-companies-read', 'role-operations', 'companies', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-companies-update', 'role-operations', 'companies', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-deals-read', 'role-operations', 'deals', 'READ', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-deals-update', 'role-operations', 'deals', 'UPDATE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-fields', 'role-operations', 'fields', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-operations-automations', 'role-operations', 'automations', 'MANAGE', 'BUSINESS_UNIT_TREE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('perm-read-only-contacts', 'role-read-only', 'contacts', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-read-only-companies', 'role-read-only', 'companies', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-read-only-deals', 'role-read-only', 'deals', 'READ', 'BUSINESS_UNIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE UNIQUE INDEX "businessUnit_key_key" ON "businessUnit"("key");

-- CreateIndex
CREATE INDEX "businessUnit_parentId_idx" ON "businessUnit"("parentId");

-- CreateIndex
CREATE INDEX "businessUnit_leaderId_idx" ON "businessUnit"("leaderId");

-- CreateIndex
CREATE INDEX "businessUnit_archivedAt_name_idx" ON "businessUnit"("archivedAt", "name");

-- CreateIndex
CREATE INDEX "businessUnitClosure_descendantId_depth_idx" ON "businessUnitClosure"("descendantId", "depth");

-- CreateIndex
CREATE INDEX "team_leaderId_idx" ON "team"("leaderId");

-- CreateIndex
CREATE INDEX "team_archivedAt_name_idx" ON "team"("archivedAt", "name");

-- CreateIndex
CREATE UNIQUE INDEX "team_businessUnitId_key_key" ON "team"("businessUnitId", "key");

-- CreateIndex
CREATE INDEX "businessUnitMembership_businessUnitId_type_idx" ON "businessUnitMembership"("businessUnitId", "type");

-- CreateIndex
CREATE INDEX "teamMembership_teamId_isLead_idx" ON "teamMembership"("teamId", "isLead");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE INDEX "role_archivedAt_name_idx" ON "role"("archivedAt", "name");

-- CreateIndex
CREATE INDEX "userAccess_roleId_status_idx" ON "userAccess"("roleId", "status");

-- CreateIndex
CREATE INDEX "userAccess_primaryBusinessUnitId_idx" ON "userAccess"("primaryBusinessUnitId");

-- CreateIndex
CREATE INDEX "userAccess_primaryTeamId_idx" ON "userAccess"("primaryTeamId");

-- CreateIndex
CREATE INDEX "rolePermission_resource_action_idx" ON "rolePermission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "rolePermission_roleId_resource_action_key" ON "rolePermission"("roleId", "resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "objectDefinition_key_key" ON "objectDefinition"("key");

-- CreateIndex
CREATE INDEX "objectDefinition_businessUnitId_archivedAt_idx" ON "objectDefinition"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "customFieldDefinition_objectDefinitionId_position_idx" ON "customFieldDefinition"("objectDefinitionId", "position");

-- CreateIndex
CREATE INDEX "customFieldDefinition_businessUnitId_archivedAt_idx" ON "customFieldDefinition"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldDefinition_objectDefinitionId_businessUnitId_key_key" ON "customFieldDefinition"("objectDefinitionId", "businessUnitId", "key");

-- CreateIndex
CREATE INDEX "customFieldOption_fieldId_position_idx" ON "customFieldOption"("fieldId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldOption_fieldId_key_key" ON "customFieldOption"("fieldId", "key");

-- CreateIndex
CREATE INDEX "fieldPermission_fieldId_idx" ON "fieldPermission"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldPermission_roleId_fieldId_key" ON "fieldPermission"("roleId", "fieldId");

-- CreateIndex
CREATE INDEX "customFieldSearchValue_fieldId_normalizedTextValue_idx" ON "customFieldSearchValue"("fieldId", "normalizedTextValue");

-- CreateIndex
CREATE INDEX "customFieldSearchValue_fieldId_numberValue_idx" ON "customFieldSearchValue"("fieldId", "numberValue");

-- CreateIndex
CREATE INDEX "customFieldSearchValue_fieldId_booleanValue_idx" ON "customFieldSearchValue"("fieldId", "booleanValue");

-- CreateIndex
CREATE INDEX "customFieldSearchValue_fieldId_dateValue_idx" ON "customFieldSearchValue"("fieldId", "dateValue");

-- CreateIndex
CREATE INDEX "customFieldSearchValue_fieldId_optionId_idx" ON "customFieldSearchValue"("fieldId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_companyId_key" ON "customFieldSearchValue"("fieldId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_contactId_key" ON "customFieldSearchValue"("fieldId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_companyBusinessUnitStateId_key" ON "customFieldSearchValue"("fieldId", "companyBusinessUnitStateId");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_contactBusinessUnitStateId_key" ON "customFieldSearchValue"("fieldId", "contactBusinessUnitStateId");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_dealId_key" ON "customFieldSearchValue"("fieldId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "customFieldSearchValue_fieldId_customObjectRecordId_key" ON "customFieldSearchValue"("fieldId", "customObjectRecordId");

-- CreateIndex
CREATE INDEX "objectRelationDefinition_targetObjectId_idx" ON "objectRelationDefinition"("targetObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "objectRelationDefinition_sourceObjectId_key_key" ON "objectRelationDefinition"("sourceObjectId", "key");

-- CreateIndex
CREATE INDEX "recordRelation_relationDefinitionId_targetRecordId_idx" ON "recordRelation"("relationDefinitionId", "targetRecordId");

-- CreateIndex
CREATE INDEX "recordRelation_businessUnitId_idx" ON "recordRelation"("businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "recordRelation_relationDefinitionId_sourceRecordId_targetRe_key" ON "recordRelation"("relationDefinitionId", "sourceRecordId", "targetRecordId");

-- CreateIndex
CREATE INDEX "customObjectRecord_objectDefinitionId_businessUnitId_archiv_idx" ON "customObjectRecord"("objectDefinitionId", "businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "customObjectRecord_teamId_ownerId_idx" ON "customObjectRecord"("teamId", "ownerId");

-- CreateIndex
CREATE INDEX "contactBusinessUnitState_businessUnitId_lifecycleStage_mark_idx" ON "contactBusinessUnitState"("businessUnitId", "lifecycleStage", "marketingQualifiedAt");

-- CreateIndex
CREATE INDEX "contactBusinessUnitState_teamId_ownerId_idx" ON "contactBusinessUnitState"("teamId", "ownerId");

-- CreateIndex
CREATE INDEX "contactBusinessUnitState_marketingQualifiedById_idx" ON "contactBusinessUnitState"("marketingQualifiedById");

-- CreateIndex
CREATE INDEX "contactBusinessUnitState_archivedAt_idx" ON "contactBusinessUnitState"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "contactBusinessUnitState_contactId_businessUnitId_key" ON "contactBusinessUnitState"("contactId", "businessUnitId");

-- CreateIndex
CREATE INDEX "companyBusinessUnitState_businessUnitId_archivedAt_idx" ON "companyBusinessUnitState"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "companyBusinessUnitState_teamId_ownerId_idx" ON "companyBusinessUnitState"("teamId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "companyBusinessUnitState_companyId_businessUnitId_key" ON "companyBusinessUnitState"("companyId", "businessUnitId");

-- CreateIndex
CREATE INDEX "leadSubmission_businessUnitId_status_receivedAt_idx" ON "leadSubmission"("businessUnitId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "leadSubmission_teamId_status_receivedAt_idx" ON "leadSubmission"("teamId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "leadSubmission_contactId_idx" ON "leadSubmission"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "leadSubmission_source_externalId_key" ON "leadSubmission"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "leadSubmission_source_idempotencyKey_key" ON "leadSubmission"("source", "idempotencyKey");

-- CreateIndex
CREATE INDEX "auditEvent_resource_recordId_createdAt_idx" ON "auditEvent"("resource", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "auditEvent_actorType_actorId_createdAt_idx" ON "auditEvent"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "auditEvent_businessUnitId_teamId_createdAt_idx" ON "auditEvent"("businessUnitId", "teamId", "createdAt");

-- CreateIndex
CREATE INDEX "auditEvent_createdAt_idx" ON "auditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "apiCredential_prefix_key" ON "apiCredential"("prefix");

-- CreateIndex
CREATE INDEX "apiCredential_roleId_status_idx" ON "apiCredential"("roleId", "status");

-- CreateIndex
CREATE INDEX "apiCredential_expiresAt_idx" ON "apiCredential"("expiresAt");

-- CreateIndex
CREATE INDEX "apiCredentialBusinessUnit_businessUnitId_idx" ON "apiCredentialBusinessUnit"("businessUnitId");

-- CreateIndex
CREATE INDEX "apiCredentialTeam_teamId_idx" ON "apiCredentialTeam"("teamId");

-- CreateIndex
CREATE INDEX "automation_status_archivedAt_idx" ON "automation"("status", "archivedAt");

-- CreateIndex
CREATE INDEX "automation_businessUnitId_teamId_status_idx" ON "automation"("businessUnitId", "teamId", "status");

-- CreateIndex
CREATE INDEX "automation_roleId_idx" ON "automation"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "domainEvent_eventKey_key" ON "domainEvent"("eventKey");

-- CreateIndex
CREATE INDEX "domainEvent_availableAt_leasedUntil_idx" ON "domainEvent"("availableAt", "leasedUntil");

-- CreateIndex
CREATE INDEX "domainEvent_type_occurredAt_idx" ON "domainEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "domainEvent_businessUnitId_teamId_occurredAt_idx" ON "domainEvent"("businessUnitId", "teamId", "occurredAt");

-- CreateIndex
CREATE INDEX "domainEvent_causationId_idx" ON "domainEvent"("causationId");

-- CreateIndex
CREATE INDEX "automationRun_status_availableAt_leasedUntil_idx" ON "automationRun"("status", "availableAt", "leasedUntil");

-- CreateIndex
CREATE INDEX "automationRun_eventId_idx" ON "automationRun"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "automationRun_automationId_eventId_version_key" ON "automationRun"("automationId", "eventId", "version");

-- CreateIndex
CREATE INDEX "webhookEndpoint_businessUnitId_teamId_isActive_idx" ON "webhookEndpoint"("businessUnitId", "teamId", "isActive");

-- CreateIndex
CREATE INDEX "webhookEndpoint_archivedAt_idx" ON "webhookEndpoint"("archivedAt");

-- CreateIndex
CREATE INDEX "webhookDelivery_status_availableAt_leasedUntil_idx" ON "webhookDelivery"("status", "availableAt", "leasedUntil");

-- CreateIndex
CREATE INDEX "webhookDelivery_eventType_createdAt_idx" ON "webhookDelivery"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhookDelivery_endpointId_eventId_key" ON "webhookDelivery"("endpointId", "eventId");

-- CreateIndex
CREATE INDEX "activity_businessUnitId_teamId_createdAt_idx" ON "activity"("businessUnitId", "teamId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_globalLifecycleStage_globallyMarketingQualifiedAt_idx" ON "contact"("globalLifecycleStage", "globallyMarketingQualifiedAt");

-- CreateIndex
CREATE INDEX "contact_globallyMarketingQualifiedById_idx" ON "contact"("globallyMarketingQualifiedById");

-- CreateIndex
CREATE INDEX "deal_businessUnitId_teamId_idx" ON "deal"("businessUnitId", "teamId");

-- CreateIndex
CREATE INDEX "marketingEvent_businessUnitId_archivedAt_idx" ON "marketingEvent"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "marketingForm_businessUnitId_archivedAt_idx" ON "marketingForm"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "pipeline_businessUnitId_archivedAt_idx" ON "pipeline"("businessUnitId", "archivedAt");

-- CreateIndex
CREATE INDEX "product_businessUnitId_archivedAt_idx" ON "product"("businessUnitId", "archivedAt");

-- Prisma's nullable compound unique does not protect global field definitions.
CREATE UNIQUE INDEX "customFieldDefinition_global_key_unique"
ON "customFieldDefinition" ("objectDefinitionId", "key")
WHERE "businessUnitId" IS NULL;

-- Only UNIQUE definitions populate this column. NULL keeps all other projected
-- values out of the uniqueness constraint.
CREATE UNIQUE INDEX "customFieldSearchValue_unique_normalized_value"
ON "customFieldSearchValue" ("fieldId", "uniqueNormalizedValue")
WHERE "uniqueNormalizedValue" IS NOT NULL;

ALTER TABLE "customFieldSearchValue"
ADD CONSTRAINT "customFieldSearchValue_one_record_check" CHECK (
  num_nonnulls(
    "companyId", "contactId", "companyBusinessUnitStateId",
    "contactBusinessUnitStateId", "dealId", "customObjectRecordId"
  ) = 1
),
ADD CONSTRAINT "customFieldSearchValue_one_value_check" CHECK (
  num_nonnulls(
    "textValue", "numberValue", "booleanValue", "dateValue", "jsonValue", "optionId"
  ) = 1
);

-- BASIC fields use JSONB containment; INDEXED and UNIQUE fields use the sparse
-- typed projection above. These GIN indexes keep basic filters bounded.
CREATE INDEX "company_customValues_gin" ON "company" USING GIN ("customValues" jsonb_path_ops);
CREATE INDEX "contact_customValues_gin" ON "contact" USING GIN ("customValues" jsonb_path_ops);
CREATE INDEX "deal_customValues_gin" ON "deal" USING GIN ("customValues" jsonb_path_ops);
CREATE INDEX "companyBusinessUnitState_customValues_gin" ON "companyBusinessUnitState" USING GIN ("customValues" jsonb_path_ops);
CREATE INDEX "contactBusinessUnitState_customValues_gin" ON "contactBusinessUnitState" USING GIN ("customValues" jsonb_path_ops);
CREATE INDEX "customObjectRecord_customValues_gin" ON "customObjectRecord" USING GIN ("customValues" jsonb_path_ops);

-- Append-only operational tables grow faster than the CRM objects. BRIN keeps
-- time-range scans cheap without a large secondary btree per event.
CREATE INDEX "leadSubmission_receivedAt_brin" ON "leadSubmission" USING BRIN ("receivedAt");
CREATE INDEX "auditEvent_createdAt_brin" ON "auditEvent" USING BRIN ("createdAt");
CREATE INDEX "domainEvent_occurredAt_brin" ON "domainEvent" USING BRIN ("occurredAt");
CREATE INDEX "webhookDelivery_createdAt_brin" ON "webhookDelivery" USING BRIN ("createdAt");

-- AddForeignKey
ALTER TABLE "businessUnit" ADD CONSTRAINT "businessUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessUnit" ADD CONSTRAINT "businessUnit_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessUnitClosure" ADD CONSTRAINT "businessUnitClosure_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessUnitClosure" ADD CONSTRAINT "businessUnitClosure_descendantId_fkey" FOREIGN KEY ("descendantId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessUnitMembership" ADD CONSTRAINT "businessUnitMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businessUnitMembership" ADD CONSTRAINT "businessUnitMembership_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamMembership" ADD CONSTRAINT "teamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamMembership" ADD CONSTRAINT "teamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userAccess" ADD CONSTRAINT "userAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userAccess" ADD CONSTRAINT "userAccess_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userAccess" ADD CONSTRAINT "userAccess_primaryBusinessUnitId_fkey" FOREIGN KEY ("primaryBusinessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userAccess" ADD CONSTRAINT "userAccess_primaryTeamId_fkey" FOREIGN KEY ("primaryTeamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rolePermission" ADD CONSTRAINT "rolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectDefinition" ADD CONSTRAINT "objectDefinition_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldDefinition" ADD CONSTRAINT "customFieldDefinition_objectDefinitionId_fkey" FOREIGN KEY ("objectDefinitionId") REFERENCES "objectDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldDefinition" ADD CONSTRAINT "customFieldDefinition_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldOption" ADD CONSTRAINT "customFieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "customFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldPermission" ADD CONSTRAINT "fieldPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldPermission" ADD CONSTRAINT "fieldPermission_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "customFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "customFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_companyBusinessUnitStateId_fkey" FOREIGN KEY ("companyBusinessUnitStateId") REFERENCES "companyBusinessUnitState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_contactBusinessUnitStateId_fkey" FOREIGN KEY ("contactBusinessUnitStateId") REFERENCES "contactBusinessUnitState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_customObjectRecordId_fkey" FOREIGN KEY ("customObjectRecordId") REFERENCES "customObjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldSearchValue" ADD CONSTRAINT "customFieldSearchValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "customFieldOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectRelationDefinition" ADD CONSTRAINT "objectRelationDefinition_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES "objectDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectRelationDefinition" ADD CONSTRAINT "objectRelationDefinition_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "objectDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordRelation" ADD CONSTRAINT "recordRelation_relationDefinitionId_fkey" FOREIGN KEY ("relationDefinitionId") REFERENCES "objectRelationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordRelation" ADD CONSTRAINT "recordRelation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customObjectRecord" ADD CONSTRAINT "customObjectRecord_objectDefinitionId_fkey" FOREIGN KEY ("objectDefinitionId") REFERENCES "objectDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customObjectRecord" ADD CONSTRAINT "customObjectRecord_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customObjectRecord" ADD CONSTRAINT "customObjectRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customObjectRecord" ADD CONSTRAINT "customObjectRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_globallyMarketingQualifiedById_fkey" FOREIGN KEY ("globallyMarketingQualifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusinessUnitState" ADD CONSTRAINT "contactBusinessUnitState_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusinessUnitState" ADD CONSTRAINT "contactBusinessUnitState_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusinessUnitState" ADD CONSTRAINT "contactBusinessUnitState_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusinessUnitState" ADD CONSTRAINT "contactBusinessUnitState_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBusinessUnitState" ADD CONSTRAINT "contactBusinessUnitState_marketingQualifiedById_fkey" FOREIGN KEY ("marketingQualifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusinessUnitState" ADD CONSTRAINT "companyBusinessUnitState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusinessUnitState" ADD CONSTRAINT "companyBusinessUnitState_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusinessUnitState" ADD CONSTRAINT "companyBusinessUnitState_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyBusinessUnitState" ADD CONSTRAINT "companyBusinessUnitState_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingForm" ADD CONSTRAINT "marketingForm_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingEvent" ADD CONSTRAINT "marketingEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadSubmission" ADD CONSTRAINT "leadSubmission_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadSubmission" ADD CONSTRAINT "leadSubmission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadSubmission" ADD CONSTRAINT "leadSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditEvent" ADD CONSTRAINT "auditEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditEvent" ADD CONSTRAINT "auditEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiCredential" ADD CONSTRAINT "apiCredential_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiCredential" ADD CONSTRAINT "apiCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiCredentialBusinessUnit" ADD CONSTRAINT "apiCredentialBusinessUnit_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "apiCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiCredentialBusinessUnit" ADD CONSTRAINT "apiCredentialBusinessUnit_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiCredentialTeam" ADD CONSTRAINT "apiCredentialTeam_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "apiCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiCredentialTeam" ADD CONSTRAINT "apiCredentialTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domainEvent" ADD CONSTRAINT "domainEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domainEvent" ADD CONSTRAINT "domainEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automationRun" ADD CONSTRAINT "automationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automationRun" ADD CONSTRAINT "automationRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "domainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhookEndpoint" ADD CONSTRAINT "webhookEndpoint_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhookEndpoint" ADD CONSTRAINT "webhookEndpoint_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhookEndpoint" ADD CONSTRAINT "webhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhookDelivery" ADD CONSTRAINT "webhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhookDelivery" ADD CONSTRAINT "webhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "domainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
