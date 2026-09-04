-- Developer-partner tenancy and historical policy snapshots for Phase 4.
CREATE TABLE "DeveloperPartnerMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeveloperPartnerMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Deal" ADD COLUMN "developerId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "developerPolicySnapshot" JSONB;

-- Backfill the tenant from the only authoritative relationship: deal → listing
-- → contract → unit → project → developer. Existing seed deals remain valid.
UPDATE "Deal" d
SET "developerId" = p."developerId"
FROM "Listing" l
JOIN "Contract" c ON c."id" = l."contractId"
JOIN "Unit" u ON u."id" = c."unitId"
JOIN "Project" p ON p."id" = u."projectId"
WHERE d."listingId" = l."id";

UPDATE "Deal" d
SET "developerPolicySnapshot" = COALESCE(
  (
    SELECT jsonb_build_object(
      'policyId', ap."id",
      'updatedAt', ap."updatedAt",
      'assignmentAllowed', ap."assignmentAllowed",
      'feeType', ap."feeType",
      'feePercentBps', ap."feePercentBps",
      'feeFixedAmount', ap."feeFixedAmount",
      'feeBasis', ap."feeBasis",
      'minPercentPaidBps', ap."minPercentPaidBps",
      'minMonthsElapsed', ap."minMonthsElapsed",
      'requiredDocuments', ap."requiredDocuments",
      'typicalNocDays', ap."typicalNocDays",
      'waitingPeriodDays', ap."waitingPeriodDays",
      'conditionsEn', ap."conditionsEn",
      'conditionsAr', ap."conditionsAr"
    )
    FROM "DeveloperAssignmentPolicy" ap
    WHERE ap."developerId" = d."developerId"
  ),
  '{}'::jsonb
);

ALTER TABLE "Deal" ALTER COLUMN "developerId" SET NOT NULL;
ALTER TABLE "Deal" ALTER COLUMN "developerPolicySnapshot" SET NOT NULL;

CREATE UNIQUE INDEX "DeveloperPartnerMembership_userId_developerId_key"
  ON "DeveloperPartnerMembership"("userId", "developerId");
CREATE INDEX "DeveloperPartnerMembership_developerId_active_idx"
  ON "DeveloperPartnerMembership"("developerId", "active");
CREATE INDEX "Deal_developerId_status_idx" ON "Deal"("developerId", "status");

ALTER TABLE "DeveloperPartnerMembership"
  ADD CONSTRAINT "DeveloperPartnerMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeveloperPartnerMembership"
  ADD CONSTRAINT "DeveloperPartnerMembership_developerId_fkey"
  FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_developerId_fkey"
  FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
