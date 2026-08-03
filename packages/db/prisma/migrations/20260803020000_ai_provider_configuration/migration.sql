CREATE TABLE "aiProviderConfiguration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiKeyLastFour" TEXT,
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaults" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "aiProviderConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "aiProviderConfiguration_provider_key" ON "aiProviderConfiguration"("provider");

ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
