-- AlterEnum
ALTER TYPE "public"."DocumentType" ADD VALUE 'PROOF_OF_ADDRESS';
ALTER TYPE "public"."DocumentType" ADD VALUE 'EMPLOYMENT_PROOF';

-- AlterEnum
ALTER TYPE "public"."DocumentStatus" ADD VALUE 'APPROVED';
ALTER TYPE "public"."DocumentStatus" ADD VALUE 'NEEDS_REPLACEMENT';
ALTER TYPE "public"."DocumentStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "public"."InstallmentStatus" ADD VALUE 'UNVERIFIED';

-- AlterTable Document
ALTER TABLE "public"."Document" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "public"."Document" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "public"."Document" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "public"."Document" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AlterTable Consent
ALTER TABLE "public"."Consent" ADD COLUMN "listingId" TEXT;
CREATE UNIQUE INDEX "Consent_userId_listingId_type_key" ON "public"."Consent"("userId", "listingId", "type");
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable MediaAsset with safe backfill
ALTER TABLE "public"."MediaAsset" ADD COLUMN "claimedKind" "public"."MediaKind";
UPDATE "public"."MediaAsset" SET "claimedKind" = "kind" WHERE "claimedKind" IS NULL;

-- AlterTable BuyerProfile
ALTER TABLE "public"."BuyerProfile" ADD COLUMN "verifiedAvailableCash" DECIMAL(18, 2);
ALTER TABLE "public"."BuyerProfile" ADD COLUMN "verifiedMaxInstallment" DECIMAL(18, 2);
