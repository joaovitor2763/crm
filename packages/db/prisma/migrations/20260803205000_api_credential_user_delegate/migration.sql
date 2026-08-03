CREATE TYPE "ApiCredentialAccessMode" AS ENUM ('SCOPED_ROLE', 'USER_DELEGATE');

ALTER TABLE "apiCredential"
ADD COLUMN "accessMode" "ApiCredentialAccessMode" NOT NULL DEFAULT 'SCOPED_ROLE';

CREATE INDEX "apiCredential_accessMode_status_idx"
ON "apiCredential"("accessMode", "status");
