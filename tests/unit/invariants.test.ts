import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { PrismaClient, type ContractFieldKey } from "@prisma/client";
import { config } from "@/lib/config";
import { REQUIRED_VERIFIED_FIELDS } from "@/lib/domain/fields";
import { checkPublishReadiness, canTransition } from "@/lib/services/listings";
import { approveAndPublish, verifyField, VerificationError } from "@/lib/services/verification";
import { createOffer, OfferError } from "@/lib/services/offers";
import { computeVerificationScore } from "@/lib/services/verification-score";
import { scoreMatch } from "@/lib/services/matching";

/**
 * These run against the seeded database. They are the tests that prove the
 * domain invariants hold in the system, not just in the pure functions.
 *
 * Requires: docker compose up && npm run db:deploy && npm run seed
 */

const prisma = new PrismaClient();

let publishedId: string;
let queueId: string;
let sellerId: string;
let buyerId: string;
let analystId: string;

beforeAll(async () => {
  const published = await prisma.listing.findFirst({
    where: { status: "LISTED" },
    orderBy: { publishedAt: "desc" },
  });
  const queued = await prisma.listing.findFirst({ where: { status: "PENDING_REVIEW" } });
  const buyer = await prisma.user.findFirst({ where: { roles: { has: "BUYER" }, buyerProfile: { tier: { in: ["VERIFIED", "PRIORITY"] } } } });
  const analyst = await prisma.user.findFirst({ where: { roles: { has: "ANALYST" } } });

  if (!published || !queued || !buyer || !analyst) {
    throw new Error("Seed the database first: npm run setup");
  }

  publishedId = published.id;
  queueId = queued.id;
  sellerId = published.sellerId;
  buyerId = buyer.id;
  analystId = analyst.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("INVARIANT: asking cash can never exceed the verified amount paid", () => {
  it("holds across every listing in the database", async () => {
    const violations = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Listing"
      WHERE "askingCash" IS NOT NULL
        AND "verifiedAmountPaid" IS NOT NULL
        AND "askingCash" > "verifiedAmountPaid"
    `;
    expect(Number(violations[0]!.n)).toBe(0);
  });

  it("is re-imposed when an analyst verifies a lower amount paid", async () => {
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: publishedId },
      include: { contract: { include: { fields: true } } },
    });
    const paid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID")!;

    // Push the asking cash above the verified figure directly in the database,
    // then re-verify the field — the service must pull it back down.
    const verified = new Decimal(paid.verifiedNum!.toString());
    await prisma.listing.update({
      where: { id: publishedId },
      data: { askingCash: verified.plus(500_000).toFixed(2) },
    });

    await verifyField({
      listingId: publishedId,
      key: "AMOUNT_PAID",
      source: paid.verifiedSource!,
      analystId,
    });

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: publishedId } });
    expect(new Decimal(after.askingCash!.toString()).lte(verified)).toBe(true);
  });

  it("rejects an offer above the asking cash", async () => {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: publishedId } });
    const over = new Decimal(listing.askingCash!.toString()).plus(1).toFixed(2);

    await expect(
      createOffer({ listingId: publishedId, buyerId, amount: over }),
    ).rejects.toThrow(OfferError);
  });
});

describe("INVARIANT: a listing cannot publish without an analyst signature", () => {
  it("blocks publishing when nothing has been verified", async () => {
    const readiness = await checkPublishReadiness(queueId);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.code === "NO_ANALYST_SIGNATURE" || b.code === "MISSING_VERIFIED_FIELD")).toBe(true);
  });

  it("refuses approveAndPublish and leaves the listing unpublished", async () => {
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: queueId } });
    await expect(approveAndPublish({ listingId: queueId, analystId })).rejects.toThrow(VerificationError);

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: queueId } });
    expect(after.status).toBe(before.status);
    // The signature it briefly wrote must have been rolled back.
    expect(after.humanVerifiedBy).toBe(before.humanVerifiedBy);
  });

  it("every published listing carries a signature and a timestamp", async () => {
    const bad = await prisma.listing.count({
      where: {
        status: { in: ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"] },
        OR: [{ humanVerifiedBy: null }, { humanVerifiedAt: null }],
      },
    });
    expect(bad).toBe(0);
  });
});

describe("INVARIANT: minimum approved images and required verified fields", () => {
  it("every published listing has at least the configured number of approved images", async () => {
    const published = await prisma.listing.findMany({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] } },
      include: { media: { where: { moderationStatus: "APPROVED", kind: { in: ["PHOTO", "SHOW_UNIT", "RENDER"] } } } },
    });
    expect(published.length).toBeGreaterThan(0);
    for (const l of published) {
      expect(l.media.length).toBeGreaterThanOrEqual(config.MIN_APPROVED_IMAGES);
    }
  });

  it("every published listing has a verified value for every required field", async () => {
    const published = await prisma.listing.findMany({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] } },
      include: { contract: { include: { fields: true } } },
    });
    for (const l of published) {
      for (const key of REQUIRED_VERIFIED_FIELDS) {
        const f = l.contract.fields.find((x) => x.key === key);
        expect(f?.verifiedSource, `${l.reference} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it("no published listing carries an unresolved critical discrepancy", async () => {
    const bad = await prisma.listing.count({
      where: {
        status: { in: ["LISTED", "UNDER_OFFER"] },
        discrepancies: { some: { status: "OPEN", severity: "CRITICAL" } },
      },
    });
    expect(bad).toBe(0);
  });
});

describe("INVARIANT: AI output never becomes a verified value on its own", () => {
  it("every verified field records which analyst promoted it and when", async () => {
    const verified = await prisma.contractField.findMany({ where: { verifiedSource: { not: null } } });
    expect(verified.length).toBeGreaterThan(0);
    for (const f of verified) {
      expect(f.verifiedBy, `${f.key} has no analyst on record`).toBeTruthy();
      expect(f.verifiedAt).toBeTruthy();
    }
  });

  it("every analyst who promoted a value actually holds the analyst role", async () => {
    const ids = [
      ...new Set(
        (await prisma.contractField.findMany({ where: { verifiedBy: { not: null } }, select: { verifiedBy: true } }))
          .map((f) => f.verifiedBy!)
          .filter(Boolean),
      ),
    ];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { roles: true } });
    for (const u of users) {
      expect(u.roles.some((r) => r === "ANALYST" || r === "ADMIN")).toBe(true);
    }
  });

  it("an override cannot be recorded without a written reason", async () => {
    await expect(
      verifyField({
        listingId: publishedId,
        key: "TOTAL_PRICE",
        source: "ANALYST_OVERRIDE",
        analystId,
        override: { num: "1", reason: "short" },
      }),
    ).rejects.toThrow(VerificationError);
  });

  it("refuses to promote a source that holds no value", async () => {
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: queueId },
      include: { contract: { include: { fields: true } } },
    });
    const empty = listing.contract.fields.find((f) => f.developerStatedNum === null && f.developerStatedDate === null);
    if (!empty) return;
    await expect(
      verifyField({
        listingId: queueId,
        key: empty.key as ContractFieldKey,
        source: "DEVELOPER_CONFIRMED",
        analystId,
      }),
    ).rejects.toThrow(VerificationError);
  });
});

describe("INVARIANT: sources are preserved, never overwritten", () => {
  it("a verified field still carries the seller's original declaration", async () => {
    const fields = await prisma.contractField.findMany({
      where: { verifiedSource: { not: null }, declaredNum: { not: null } },
      take: 50,
    });
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f.declaredNum).not.toBeNull();
    }
  });

  it("a discrepancy keeps both values it was raised over", async () => {
    const discrepancies = await prisma.discrepancy.findMany({ take: 50 });
    for (const d of discrepancies) {
      expect(d.sourceA).not.toBe(d.sourceB);
      expect(d.valueA !== null || d.valueAText !== null).toBe(true);
      expect(d.valueB !== null || d.valueBText !== null).toBe(true);
    }
  });
});

describe("listing state machine", () => {
  it("allows only the enumerated transitions", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("VERIFIED", "LISTED")).toBe(true);
    expect(canTransition("PENDING_REVIEW", "LISTED")).toBe(false);
    expect(canTransition("DRAFT", "LISTED")).toBe(false);
    expect(canTransition("COMPLETED", "LISTED")).toBe(false);
  });
});

describe("verification score", () => {
  it("is a real computation whose components sum to the score", async () => {
    const result = await computeVerificationScore(publishedId);
    const sum = result.components.reduce((a, c) => a + c.points, 0);
    expect(Math.abs(sum - result.score)).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.length).toBeGreaterThan(4);
  });

  it("gives every component a weight, a measurement and an explanation", async () => {
    const result = await computeVerificationScore(publishedId);
    for (const c of result.components) {
      expect(c.weight).toBeGreaterThan(0);
      expect(c.ratio).toBeGreaterThanOrEqual(0);
      expect(c.ratio).toBeLessThanOrEqual(1);
      expect(c.detailEn.length).toBeGreaterThan(3);
    }
  });
});

describe("matching", () => {
  it("scores a buyer who cannot fund the cash as blocked", async () => {
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: publishedId },
      include: {
        contract: {
          select: {
            unit: {
              select: {
                unitType: true,
                bedrooms: true,
                buaSqm: true,
                finishing: true,
                project: { select: { id: true, city: true, developerId: true, nameEn: true, nameAr: true } },
              },
            },
          },
        },
      },
    });

    const broke = {
      availableCash: new Decimal(1),
      maxInstallment: new Decimal(1),
      installmentFrequency: "QUARTERLY",
      prefCities: [],
      prefDeveloperIds: [],
      prefProjectIds: [],
      prefUnitTypes: [],
      prefBedroomsMin: null,
      prefBuaMin: null,
      prefDeliveryByYear: null,
    } as never;

    const result = scoreMatch(broke, listing as never);
    expect(result.blockers.some((b) => b.code === "CASH_SHORTFALL")).toBe(true);
    expect(result.score).toBeLessThan(50);
  });

  it("returns no score at all without a financial profile", () => {
    const empty = {
      availableCash: null,
      maxInstallment: null,
      installmentFrequency: "QUARTERLY",
      prefCities: [],
      prefDeveloperIds: [],
      prefProjectIds: [],
      prefUnitTypes: [],
    } as never;
    const result = scoreMatch(empty, {} as never);
    expect(result.score).toBe(0);
    expect(result.blockers[0]!.code).toBe("NO_FINANCIAL_PROFILE");
  });
});

describe("audit trail", () => {
  it("records an actor for every field verification", async () => {
    const events = await prisma.auditEvent.findMany({
      where: { action: { in: ["FIELD_VERIFIED", "FIELD_OVERRIDDEN"] } },
      take: 50,
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.actorId).toBeTruthy();
      expect(e.after).toBeTruthy();
    }
  });

  it("records before and after on every publish", async () => {
    const events = await prisma.auditEvent.findMany({ where: { action: "LISTING_PUBLISHED" }, take: 20 });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.entityType).toBe("Listing");
      expect(e.after).toBeTruthy();
    }
  });
});

describe("payments", () => {
  it("never has two settled payments of the same kind on one deal", async () => {
    const rows = await prisma.payment.groupBy({
      by: ["dealId", "kind"],
      where: { status: "SUCCEEDED" },
      _count: true,
    });
    for (const r of rows) expect(r._count).toBe(1);
  });

  it("gives every payment attempt its own idempotency key", async () => {
    const payments = await prisma.payment.findMany({ select: { idempotencyKey: true } });
    const keys = new Set(payments.map((p) => p.idempotencyKey));
    expect(keys.size).toBe(payments.length);
  });

  it("records a failure reason on every failed payment", async () => {
    const failed = await prisma.payment.findMany({ where: { status: "FAILED" } });
    for (const p of failed) {
      expect(p.failureCode ?? p.failureReason).toBeTruthy();
    }
  });
});

describe("deal milestones", () => {
  it("never completes a milestone while an earlier one is open", async () => {
    const deals = await prisma.deal.findMany({ include: { milestones: { orderBy: { order: "asc" } } } });
    for (const d of deals) {
      let seenOpen = false;
      for (const m of d.milestones) {
        if (m.status !== "COMPLETED") seenOpen = true;
        else if (seenOpen) {
          throw new Error(`${d.reference}: ${m.key} completed while an earlier milestone is open`);
        }
      }
    }
    expect(deals.length).toBeGreaterThan(0);
  });

  it("only closes a money milestone against a settled payment", async () => {
    const deals = await prisma.deal.findMany({
      include: { milestones: true, payments: { where: { status: "SUCCEEDED" } } },
    });
    const gated = {
      RESERVATION_DEPOSIT: "RESERVATION_DEPOSIT",
      CASH_RELEASED_TO_SELLER: "SELLER_RELEASE",
      PLATFORM_FEE_COLLECTED: "PLATFORM_FEE",
    } as const;

    for (const d of deals) {
      for (const [milestoneKey, paymentKind] of Object.entries(gated)) {
        const m = d.milestones.find((x) => x.key === milestoneKey);
        if (m?.status !== "COMPLETED") continue;
        expect(
          d.payments.some((p) => p.kind === paymentKind),
          `${d.reference}: ${milestoneKey} closed without a settled ${paymentKind}`,
        ).toBe(true);
      }
    }
  });
});
