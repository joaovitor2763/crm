-- Governed ontology snapshots. Runtime Fields tables remain the source of
-- current values; these rows are immutable schema review and publication
-- history.
CREATE TYPE "OntologySchemaVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "ontologySchemaDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ontologySchemaDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ontologySchemaVersion" (
  "id" TEXT NOT NULL,
  "schemaDefinitionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "OntologySchemaVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "snapshot" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdByType" "AuditActorType" NOT NULL,
  "createdById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ontologySchemaVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ontologySchemaDefinition_key_key"
  ON "ontologySchemaDefinition" ("key");
CREATE UNIQUE INDEX "ontologySchemaVersion_schemaDefinitionId_version_key"
  ON "ontologySchemaVersion" ("schemaDefinitionId", "version");
CREATE INDEX "ontologySchemaVersion_schemaDefinitionId_status_idx"
  ON "ontologySchemaVersion" ("schemaDefinitionId", "status");
CREATE INDEX "ontologySchemaVersion_status_createdAt_idx"
  ON "ontologySchemaVersion" ("status", "createdAt");
CREATE UNIQUE INDEX "ontologySchemaVersion_one_published_per_schema_key"
  ON "ontologySchemaVersion" ("schemaDefinitionId")
  WHERE "status" = 'PUBLISHED';

ALTER TABLE "ontologySchemaVersion"
  ADD CONSTRAINT "ontologySchemaVersion_schemaDefinitionId_fkey"
  FOREIGN KEY ("schemaDefinitionId") REFERENCES "ontologySchemaDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
