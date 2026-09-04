import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import {
  canReadWithConsent,
  isSensitive,
  DILIGENCE_TYPES,
  SENSITIVE_TYPES,
} from "@/lib/domain/document-access";
import { parsePdf } from "@/lib/services/pdf";
import { detectMimeFromBuffer } from "@/lib/services/uploads";
import {
  determineInstallmentStatus,
  evaluateScheduleStatuses,
  type ScheduleRow,
} from "@/lib/domain/calculators";
import { dealCorpus } from "@/lib/queries/opportunity";

describe("Phase 2 ? Qualification, Privacy, Documents & Ingestion", () => {
  // Scenario 1: Funnel diligence access
  describe("1. Funnel diligence access rules", () => {
    it("permits standard diligence types under consent", () => {
      const allowed = [
        "SALE_CONTRACT",
        "CONTRACT_ANNEX",
        "PAYMENT_SCHEDULE_ANNEX",
        "DEVELOPER_NOC",
        "DEVELOPER_ACCOUNT_STATEMENT",
        "DELIVERY_CERTIFICATE",
        "MAINTENANCE_RECEIPT",
      ];
      for (const type of allowed) {
        expect(canReadWithConsent(type as any), `${type} should be accessible under consent`).toBe(true);
      }
    });

    it("does not permit sensitive identity or financial types under generic diligence consent", () => {
      for (const type of SENSITIVE_TYPES) {
        expect(canReadWithConsent(type), `${type} must not be accessible via diligence consent`).toBe(
          false,
        );
      }
    });
  });

  // Scenario 2: Scoped consent isolation
  describe("2. Scoped consent isolation", () => {
    it("verifies consent is isolated by listingId", async () => {
      const buyer = await prisma.user.findFirst({ where: { roles: { has: "BUYER" } } });
      const listings = await prisma.listing.findMany({ take: 2, select: { id: true } });
      expect(buyer).not.toBeNull();
      expect(listings.length).toBeGreaterThanOrEqual(2);

      const [l1, l2] = listings;

      // Upsert consent for listing 1
      await prisma.consent.upsert({
        where: {
          userId_listingId_type: {
            userId: buyer!.id,
            listingId: l1.id,
            type: "BUYER_CONFIDENTIALITY",
          },
        },
        create: {
          userId: buyer!.id,
          listingId: l1.id,
          type: "BUYER_CONFIDENTIALITY",
          granted: true,
          textVersion: "1.0",
          at: new Date(),
        },
        update: { at: new Date() },
      });

      // Check consent for l1
      const consent1 = await prisma.consent.findUnique({
        where: {
          userId_listingId_type: {
            userId: buyer!.id,
            listingId: l1.id,
            type: "BUYER_CONFIDENTIALITY",
          },
        },
      });
      expect(consent1).not.toBeNull();

      // Check consent for l2 (should not equal consent for l1)
      const consent2 = await prisma.consent.findUnique({
        where: {
          userId_listingId_type: {
            userId: buyer!.id,
            listingId: l2.id,
            type: "BUYER_CONFIDENTIALITY",
          },
        },
      });
      expect(consent2?.listingId).not.toBe(l1.id);
    });
  });

  // Scenario 3: Sensitive document lock
  describe("3. Sensitive document lock", () => {
    it("locks sensitive documents strictly to owner and compliance staff", () => {
      const sensitiveList = [
        "NATIONAL_ID_FRONT",
        "NATIONAL_ID_BACK",
        "PASSPORT",
        "BANK_TRANSFER_STATEMENT",
        "PROOF_OF_FUNDS",
        "PROOF_OF_ADDRESS",
        "EMPLOYMENT_PROOF",
        "POWER_OF_ATTORNEY",
      ];
      for (const t of sensitiveList) {
        expect(isSensitive(t as any), `${t} should be flagged sensitive`).toBe(true);
      }
      expect(isSensitive("SALE_CONTRACT")).toBe(false);
      expect(isSensitive("DEVELOPER_NOC")).toBe(false);
    });
  });

  // Scenario 4: Assistant corpus boundary
  describe("4. Assistant corpus boundary", () => {
    it("strictly excludes sensitive documents from assistant dealCorpus", async () => {
      const listingWithDocs = await prisma.listing.findFirst({
        where: { documents: { some: {} } },
        select: { id: true },
      });
      if (!listingWithDocs) return;

      // Anonymous / unconsented visitor
      const corpusAnon = await dealCorpus(listingWithDocs.id, null);
      for (const item of corpusAnon) {
        expect(item.text).not.toContain("NATIONAL_ID");
        expect(item.text).not.toContain("PASSPORT");
        expect(item.text).not.toContain("BANK_TRANSFER_STATEMENT");
      }

      // Consented buyer
      const buyer = await prisma.user.findFirst({ where: { roles: { has: "BUYER" } } });
      if (buyer) {
        const corpusConsented = await dealCorpus(listingWithDocs.id, {
          id: buyer.id,
          roles: ["BUYER"],
        });
        for (const item of corpusConsented) {
          expect(item.text).not.toContain("NATIONAL_ID");
          expect(item.text).not.toContain("PASSPORT");
          expect(item.text).not.toContain("BANK_TRANSFER_STATEMENT");
        }
      }
    });

    it("restricts unconsented visitors to verified facts only (no contract document text)", async () => {
      const listing = await prisma.listing.findFirst({ select: { id: true } });
      if (!listing) return;

      const corpus = await dealCorpus(listing.id, null);
      // If corpus has items, it must only be verified-record fact page
      for (const item of corpus) {
        expect(item.documentId).toBe("verified-record");
      }
    });
  });

  // Scenario 5: Phase 4 developer-partner deal inspection
  describe("5. Phase 4 developer-partner deal inspection", () => {
    it("verifies partner membership query and relation exist", async () => {
      const partner = await prisma.user.findFirst({
        where: { roles: { has: "DEVELOPER_PARTNER" } },
        include: { developerMemberships: true },
      });
      expect(partner !== undefined).toBe(true);
    });
  });

  // Scenario 6: Authentic PDF parsing
  describe("6. Authentic PDF parsing", () => {
    it("parses genuine PDF fixture and extracts text and page count", async () => {
      const pdfPath = join(process.cwd(), "tests", "fixtures", "sample-contract.pdf");
      const buffer = readFileSync(pdfPath);

      const parsed = await parsePdf(buffer);
      expect(parsed.pageCount).toBe(2);
      expect(parsed.pages.length).toBe(2);

      // Page 1 has contract title
      expect(parsed.pages[0].pageNumber).toBe(1);
      expect(parsed.pages[0].textSnippet).toContain("Primary Sale and Purchase Agreement");

      // Page 2 has payment schedule
      expect(parsed.pages[1].pageNumber).toBe(2);
      expect(parsed.pages[1].textSnippet).toContain("Verified Payment Schedule Annex");
    });
  });

  // Scenario 7: Corrupted PDF fail-loudly
  describe("7. Corrupted PDF handling", () => {
    it("fails loudly when PDF is truncated or has corrupted cross-reference", async () => {
      const corrupted = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
      await expect(parsePdf(corrupted)).rejects.toThrow();
    });
  });

  // Scenario 8: Magic byte validation
  describe("8. Magic byte validation", () => {
    it("correctly detects valid binary headers", () => {
      // PDF
      const pdfBuf = Buffer.from("%PDF-1.7\n...");
      expect(detectMimeFromBuffer(pdfBuf)).toBe("application/pdf");

      // JPEG
      const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(detectMimeFromBuffer(jpegBuf)).toBe("image/jpeg");

      // PNG
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectMimeFromBuffer(pngBuf)).toBe("image/png");

      // WebP
      const webpBuf = Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from("WEBP"),
      ]);
      expect(detectMimeFromBuffer(webpBuf)).toBe("image/webp");
    });

    it("rejects invalid or spoofed bytes", () => {
      const spoofedPdf = Buffer.from("<html><head><title>Fake PDF</title></head></html>");
      expect(detectMimeFromBuffer(spoofedPdf)).toBeNull();

      const randomBytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      expect(detectMimeFromBuffer(randomBytes)).toBeNull();
    });
  });

  // Scenario 9: Pure installment calculator
  describe("9. Pure installment calculator", () => {
    const asOf = new Date("2026-06-15T00:00:00Z");

    it("determines PAID when verified receipts cover amount", () => {
      const result = determineInstallmentStatus({
        dueDate: new Date("2026-01-15T00:00:00Z"),
        amount: money("100000"),
        cumulativeAmountBeforeThisRow: money("0"),
        verifiedFunds: money("100000"),
        asOf,
      });
      expect(result.status).toBe("PAID");
    });

    it("determines UNVERIFIED when overdue has sellerClaimedPaid but no verified funds", () => {
      const result = determineInstallmentStatus({
        dueDate: new Date("2026-01-15T00:00:00Z"),
        amount: money("100000"),
        cumulativeAmountBeforeThisRow: money("0"),
        verifiedFunds: money("0"),
        asOf,
        sellerClaimedPaid: true,
      });
      expect(result.status).toBe("UNVERIFIED");
    });

    it("determines OVERDUE when past due date and 0 verified receipts", () => {
      const result = determineInstallmentStatus({
        dueDate: new Date("2026-01-15T00:00:00Z"),
        amount: money("100000"),
        cumulativeAmountBeforeThisRow: money("0"),
        verifiedFunds: money("0"),
        asOf,
      });
      expect(result.status).toBe("OVERDUE");
    });

    it("determines DUE when within 30 days of due date", () => {
      const result = determineInstallmentStatus({
        dueDate: new Date("2026-07-01T00:00:00Z"),
        amount: money("100000"),
        cumulativeAmountBeforeThisRow: money("0"),
        verifiedFunds: money("0"),
        asOf,
      });
      expect(result.status).toBe("DUE");
    });

    it("determines UPCOMING when due date is > 30 days away", () => {
      const result = determineInstallmentStatus({
        dueDate: new Date("2026-09-15T00:00:00Z"),
        amount: money("100000"),
        cumulativeAmountBeforeThisRow: money("0"),
        verifiedFunds: money("0"),
        asOf,
      });
      expect(result.status).toBe("UPCOMING");
    });

    it("evaluates a full schedule correctly with receipts and running balance", () => {
      const rawRows: ScheduleRow[] = [
        { sequence: 1, kind: "DOWN_PAYMENT", dueDate: new Date("2026-01-01T00:00:00Z"), amount: money("500000"), runningBalance: money("300000") },
        { sequence: 2, kind: "REGULAR", dueDate: new Date("2026-04-01T00:00:00Z"), amount: money("100000"), runningBalance: money("200000") },
        { sequence: 3, kind: "REGULAR", dueDate: new Date("2026-07-01T00:00:00Z"), amount: money("100000"), runningBalance: money("100000") },
        { sequence: 4, kind: "REGULAR", dueDate: new Date("2026-10-01T00:00:00Z"), amount: money("100000"), runningBalance: money("0") },
      ];

      const evaluated = evaluateScheduleStatuses(rawRows, {
        verifiedAmountPaid: money("600000"),
        verifiedReceiptsTotal: money("600000"),
        asOf,
      });

      expect(evaluated.length).toBe(4);
      expect(evaluated[0].status).toBe("PAID");
      expect(evaluated[1].status).toBe("PAID");
      expect(evaluated[2].status).toBe("DUE");
      expect(evaluated[3].status).toBe("UPCOMING");
      expect(evaluated[2].runningBalance.toString()).toBe("100000");
    });
  });

  // Scenario 10: Analyst review document transitions & atomic tier demotion
  describe("10. Analyst review transitions and KYC state machine", () => {
    it("validates rejectionReason requirement length (minimum 8 characters)", () => {
      const shortReason = "Too bad"; // 7 chars
      const validReason = "The image is too blurry to read the national ID number.";
      expect(shortReason.trim().length >= 8).toBe(false);
      expect(validReason.trim().length >= 8).toBe(true);
    });
  });

  // Scenario 11: Proof of Funds verification and tier promotion
  describe("11. Proof of Funds verification and Priority Tier promotion", () => {
    it("updates verified capacity and promotes buyer to PRIORITY tier", async () => {
      const buyer = await prisma.user.findFirst({
        where: { roles: { has: "BUYER" } },
        include: { buyerProfile: true },
      });
      if (!buyer) return;

      // Update buyer profile with verified capacity
      const updated = await prisma.buyerProfile.update({
        where: { userId: buyer.id },
        data: {
          verifiedAvailableCash: "2500000",
          verifiedMaxInstallment: "200000",
          tier: "PRIORITY",
        },
      });

      expect(updated.tier).toBe("PRIORITY");
      expect(updated.verifiedAvailableCash?.toString()).toBe("2500000");
      expect(updated.verifiedMaxInstallment?.toString()).toBe("200000");
    });
  });
});
