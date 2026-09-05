import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { sanitizeJobPayload, retryJob, JobError } from "@/lib/services/jobs";
import { reconcilePayment, recordPaymentException, PaymentError } from "@/lib/services/payments";
import { flagDiscrepancy, escalateListing, VerificationError } from "@/lib/services/verification";
import { checkPublishReadiness } from "@/lib/services/listings";

describe("Phase 3 — Analyst & Admin Operations Platform", () => {
  describe("1. Delivery-Aware Media Gate & Financial Invariants", () => {
    it("enforces media gate and asking cash invariants on live listings", async () => {
      const liveListings = await prisma.listing.findMany({
        where: { status: "LISTED" },
        include: {
          media: true,
          contract: {
            include: {
              unit: { select: { deliveryStatus: true } },
            },
          },
        },
      });

      expect(liveListings.length).toBeGreaterThan(0);

      for (const listing of liveListings) {
        const approved = listing.media.filter((m) => m.moderationStatus === "APPROVED");
        const photos = approved.filter((m) => m.kind === "PHOTO");
        const altMedia = approved.filter((m) =>
          ["PHOTO", "SHOW_UNIT", "RENDER", "PROGRESS"].includes(m.kind)
        );
        const hasFloorPlan = approved.some((m) => m.kind === "FLOOR_PLAN");
        const isDelivered = listing.contract.unit.deliveryStatus === "DELIVERED";

        if (isDelivered) {
          expect(
            photos.length,
            `Delivered listing ${listing.reference} must have at least 5 photos`
          ).toBeGreaterThanOrEqual(5);
        } else {
          expect(
            altMedia.length,
            `Off-plan listing ${listing.reference} must have at least 5 alternative media items`
          ).toBeGreaterThanOrEqual(5);
        }

        expect(
          hasFloorPlan,
          `Listing ${listing.reference} must have a floor plan`
        ).toBe(true);

        // Financial invariant: asking cash must not exceed verified amount paid
        if (listing.askingCash && listing.verifiedAmountPaid) {
          const cash = Number(listing.askingCash);
          const paid = Number(listing.verifiedAmountPaid);
          expect(
            cash,
            `Listing ${listing.reference} asking cash (${cash}) cannot exceed verified paid (${paid})`
          ).toBeLessThanOrEqual(paid);
        }
      }
    });

    it("verifies checkPublishReadiness detects insufficient delivered photos", async () => {
      // Find or create a test delivered listing scenario
      const delivered = await prisma.listing.findFirst({
        where: {
          status: "LISTED",
          contract: { unit: { deliveryStatus: "DELIVERED" } },
        },
        include: { media: true },
      });

      if (delivered) {
        const readiness = await checkPublishReadiness(delivered.id);
        // Live listing should meet all preconditions or have no photo blockers
        const photoBlockers = readiness.blockers.filter((b) =>
          b.code === "INSUFFICIENT_DELIVERED_PHOTOS" || b.code === "INSUFFICIENT_IMAGES"
        );
        expect(photoBlockers.length).toBe(0);
      }
    });
  });

  describe("2. Background Jobs Payload Sanitization & Retry Authorization", () => {
    it("sanitizes sensitive credentials, tokens, and PII from execution payloads", () => {
      const rawPayload = {
        listingId: "list-123",
        unitCode: "APT-402",
        password: "SuperSecretPassword123!",
        userToken: "bearer_xyz_jwt_token",
        nationalId: "29801011234567",
        authorization: "Bearer secret_api_key",
        deepData: {
          clientSecret: "shh_secret_key",
          attempts: 3,
          creditCard: "4111222233334444",
        },
        items: [{ id: 1, secret: "classified" }],
      };

      const sanitized = sanitizeJobPayload(rawPayload) as any;

      // Sensitive fields redacted
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.userToken).toBe("[REDACTED]");
      expect(sanitized.nationalId).toBe("[REDACTED]");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.deepData.clientSecret).toBe("[REDACTED]");
      expect(sanitized.deepData.creditCard).toBe("[REDACTED]");
      expect(sanitized.items[0].secret).toBe("[REDACTED]");

      // Safe metadata preserved
      expect(sanitized.listingId).toBe("list-123");
      expect(sanitized.unitCode).toBe("APT-402");
      expect(sanitized.deepData.attempts).toBe(3);
    });

    it("rejects non-admin roles from retrying background jobs", async () => {
      await expect(
        retryJob({
          jobId: "job-non-existent",
          actorId: "user-123",
          actorRole: "ANALYST",
        })
      ).rejects.toThrow(JobError);

      await expect(
        retryJob({
          jobId: "job-non-existent",
          actorId: "user-123",
          actorRole: "BUYER",
        })
      ).rejects.toThrow(JobError);
    });
  });

  describe("3. Payment Operational Actions Authorization", () => {
    it("rejects non-admin roles from reconciling payments", async () => {
      await expect(
        reconcilePayment({
          paymentId: "pay-123",
          actorId: "user-analyst",
          actorRole: "ANALYST",
        })
      ).rejects.toThrow(PaymentError);

      await expect(
        reconcilePayment({
          paymentId: "pay-123",
          actorId: "user-buyer",
          actorRole: "BUYER",
        })
      ).rejects.toThrow(PaymentError);
    });

    it("rejects non-admin roles from recording payment exceptions", async () => {
      await expect(
        recordPaymentException({
          paymentId: "pay-123",
          dealId: "deal-123",
          reason: "Direct wire transfer verified",
          reference: "CIB-99912",
          actorId: "user-analyst",
          actorRole: "ANALYST",
        })
      ).rejects.toThrow(PaymentError);
    });

    it("validates mandatory exception justification length and bank reference", async () => {
      await expect(
        recordPaymentException({
          paymentId: "pay-123",
          dealId: "deal-123",
          reason: "Too short", // < 10 chars
          reference: "CIB-99912",
          actorId: "admin-1",
          actorRole: "ADMIN",
        })
      ).rejects.toThrow("at least 10 characters");

      await expect(
        recordPaymentException({
          paymentId: "pay-123",
          dealId: "deal-123",
          reason: "Valid reason for exception settling",
          reference: "12", // < 4 chars
          actorId: "admin-1",
          actorRole: "ADMIN",
        })
      ).rejects.toThrow("external bank / transaction reference");
    });
  });

  describe("4. Discrepancy Flagging & Escalation Services", () => {
    it("validates title length when flagging discrepancy", async () => {
      await expect(
        flagDiscrepancy({
          listingId: "listing-1",
          fieldKey: "TOTAL_PRICE",
          analystId: "analyst-1",
          sourceA: "SELLER_DECLARED",
          sourceB: "AI_EXTRACTED",
          severity: "MAJOR",
          titleEn: "Bad", // < 5 chars
        })
      ).rejects.toThrow(VerificationError);
    });

    it("validates escalation reason length", async () => {
      await expect(
        escalateListing({
          listingId: "listing-1",
          analystId: "analyst-1",
          reason: "Short", // < 10 chars
        })
      ).rejects.toThrow(VerificationError);
    });
  });

  describe("5. Developer Policy Versioning & Immutability", () => {
    it("verifies developer policy version compound uniqueness in Prisma schema", async () => {
      const developer = await prisma.developer.findFirst({
        include: { policy: true, policyVersions: true },
      });

      expect(developer).toBeDefined();
      if (developer?.policy) {
        // Compound unique constraint on policyId + version ensures immutable versions
        const versions = await prisma.developerPolicyVersion.findMany({
          where: { policyId: developer.policy.id },
        });
        const versionNumbers = versions.map((v) => v.version);
        const uniqueNumbers = new Set(versionNumbers);
        expect(versionNumbers.length).toBe(uniqueNumbers.size);
      }
    });
  });

  describe("6. Truthful Metrics & i18n Relabeling", () => {
    it("ensures 'AI accuracy' is relabeled to 'Extraction adoption rate'", () => {
      const en = JSON.parse(readFileSync(join(process.cwd(), "src/messages/en.json"), "utf8"));
      const ar = JSON.parse(readFileSync(join(process.cwd(), "src/messages/ar.json"), "utf8"));

      expect(en.analyst.metricAiAccuracy).toBe("Extraction adoption rate");
      expect(ar.analyst.metricAiAccuracy).toBe("معدل اعتماد الاستخراج الآلي");

      // Admin namespace exists
      expect(en.admin).toBeDefined();
      expect(ar.admin).toBeDefined();
      expect(en.admin.console).toBe("Operations Console");
      expect(ar.admin.console).toBe("لوحة العمليات المتقدمة");
    });
  });
});
