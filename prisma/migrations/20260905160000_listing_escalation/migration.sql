-- Escalation state on a listing. Additive and nullable: no backfill required,
-- existing rows read as "not escalated".
ALTER TABLE "public"."Listing" ADD COLUMN "escalatedAt" TIMESTAMP(3);
ALTER TABLE "public"."Listing" ADD COLUMN "escalationReason" TEXT;
ALTER TABLE "public"."Listing" ADD COLUMN "escalatedById" TEXT;

CREATE INDEX "Listing_escalatedAt_idx" ON "public"."Listing"("escalatedAt");
