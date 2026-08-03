CREATE TYPE "DashboardVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

CREATE TABLE "dashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "DashboardVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ownerId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dashboardWidget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "spec" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 6,
    "height" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dashboardWidget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboard_ownerId_archivedAt_updatedAt_idx" ON "dashboard"("ownerId", "archivedAt", "updatedAt");
CREATE INDEX "dashboard_visibility_archivedAt_updatedAt_idx" ON "dashboard"("visibility", "archivedAt", "updatedAt");
CREATE INDEX "dashboardWidget_dashboardId_position_idx" ON "dashboardWidget"("dashboardId", "position");

ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dashboardWidget" ADD CONSTRAINT "dashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
