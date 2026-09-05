-- CreateEnum
CREATE TYPE "public"."PolicySource" AS ENUM ('OFFICIAL_LETTER', 'DEVELOPER_PORTAL', 'CONTRACT_ANNEX', 'ANALYST_RESEARCH', 'SYNTHETIC_BENCHMARK');

-- CreateEnum
CREATE TYPE "public"."PolicyVerificationState" AS ENUM ('VERIFIED', 'PENDING_CONFIRMATION', 'SYNTHETIC');

-- AlterTable DeveloperAssignmentPolicy
ALTER TABLE "public"."DeveloperAssignmentPolicy" ADD COLUMN "effectiveDate" TIMESTAMP(3);
ALTER TABLE "public"."DeveloperAssignmentPolicy" ADD COLUMN "source" "public"."PolicySource";
ALTER TABLE "public"."DeveloperAssignmentPolicy" ADD COLUMN "verificationState" "public"."PolicyVerificationState";
ALTER TABLE "public"."DeveloperAssignmentPolicy" ADD COLUMN "updatedById" TEXT;

-- Backfill DeveloperAssignmentPolicy from isSynthetic
UPDATE "public"."DeveloperAssignmentPolicy"
SET "verificationState" = CASE WHEN "isSynthetic" = true THEN 'SYNTHETIC'::"public"."PolicyVerificationState" ELSE 'PENDING_CONFIRMATION'::"public"."PolicyVerificationState" END,
    "source" = CASE WHEN "isSynthetic" = true THEN 'SYNTHETIC_BENCHMARK'::"public"."PolicySource" ELSE 'DEVELOPER_PORTAL'::"public"."PolicySource" END;

-- CreateTable DeveloperPolicyVersion
CREATE TABLE "public"."DeveloperPolicyVersion" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "assignmentAllowed" "public"."AssignmentPermission" NOT NULL,
    "feeType" "public"."FeeType" NOT NULL,
    "feePercentBps" INTEGER,
    "feeFixedAmount" DECIMAL(18,2),
    "feeBasis" TEXT NOT NULL,
    "minPercentPaidBps" INTEGER,
    "minMonthsElapsed" INTEGER,
    "requiredDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "typicalNocDays" INTEGER,
    "waitingPeriodDays" INTEGER,
    "conditionsEn" TEXT,
    "conditionsAr" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "source" "public"."PolicySource",
    "verificationState" "public"."PolicyVerificationState",
    "changeReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperPolicyVersion_policyId_version_key" ON "public"."DeveloperPolicyVersion"("policyId", "version");

-- CreateIndex
CREATE INDEX "DeveloperPolicyVersion_developerId_createdAt_idx" ON "public"."DeveloperPolicyVersion"("developerId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."DeveloperPolicyVersion" ADD CONSTRAINT "DeveloperPolicyVersion_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "public"."Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
