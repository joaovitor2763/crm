CREATE TABLE "workspaceConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspaceConfiguration_pkey" PRIMARY KEY ("id")
);

INSERT INTO "workspaceConfiguration" ("id", "currency", "updatedAt")
VALUES ('default', 'USD', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
