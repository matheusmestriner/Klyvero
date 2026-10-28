-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "legalDocument" TEXT;

-- CreateTable
CREATE TABLE "public"."SignupInvite" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "createdByUserId" UUID,
    "label" TEXT NOT NULL,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByTenantId" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupInvite_tokenHash_key" ON "public"."SignupInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "SignupInvite_tenantId_createdAt_idx" ON "public"."SignupInvite"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_legalDocument_key" ON "public"."Tenant"("legalDocument");

-- AddForeignKey
ALTER TABLE "public"."SignupInvite" ADD CONSTRAINT "SignupInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

