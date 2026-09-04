import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { PrismaClient } from "@prisma/client";
import { buyerPlatformFee } from "@/lib/domain/calculators";
import { acceptOffer } from "@/lib/services/offers";
import { completeMilestone, DealError } from "@/lib/services/deals";
import { handlePaymentCallback, initiatePayment, PaymentError, retryPayment } from "@/lib/services/payments";

const prisma = new PrismaClient();
let activeDealId: string;
let activeBuyerId: string;

beforeAll(async () => {
  const active = await prisma.deal.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, buyerId: true },
  });
  if (!active) throw new Error("Seed the database first: npm run seed");
  activeDealId = active.id;
  activeBuyerId = active.buyerId;
});

afterAll(async () => prisma.$disconnect());

describe("Phase 4 financial and authorization boundaries", () => {
  it("uses a 2% buyer fee and no seller commission in every created deal", async () => {
    const deals = await prisma.deal.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { platformFee: true, listing: { select: { totalContractPrice: true } } },
    });
    expect(deals.length).toBeGreaterThan(0);
    for (const deal of deals) {
      expect(new Decimal(deal.platformFee.toString()).eq(buyerPlatformFee(deal.listing.totalContractPrice ?? 0))).toBe(true);
    }
  });

  it("does not let a buyer complete a developer-owned milestone", async () => {
    await expect(
      completeMilestone({
        dealId: activeDealId,
        key: "DEVELOPER_NOC_REQUESTED",
        actorId: activeBuyerId,
        actorRole: "BUYER",
      }),
    ).rejects.toBeInstanceOf(DealError);
  });

  it("does not let a buyer charge the completion fee before completion", async () => {
    await expect(
      initiatePayment({
        dealId: activeDealId,
        kind: "PLATFORM_FEE",
        actorId: activeBuyerId,
        actorRole: "BUYER",
        simulate: "SUCCESS",
      }),
    ).rejects.toBeInstanceOf(PaymentError);
  });

  it("rejects a retry whose payment ID belongs to a different deal", async () => {
    const payment = await prisma.payment.findFirst({ select: { id: true, dealId: true } });
    const other = await prisma.deal.findFirst({ where: { id: { not: payment!.dealId } }, select: { id: true } });
    expect(payment).toBeTruthy();
    expect(other).toBeTruthy();
    await expect(
      retryPayment({
        dealId: other!.id,
        paymentId: payment!.id,
        actorId: activeBuyerId,
        actorRole: "BUYER",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_DEAL_MISMATCH" });
  });

  it("treats a repeated terminal callback as a no-op", async () => {
    const payment = await prisma.payment.findFirst({
      where: { status: { in: ["SUCCEEDED", "FAILED"] } },
      include: { events: true },
    });
    expect(payment).toBeTruthy();
    const before = payment!.events.length;
    await handlePaymentCallback(payment!.id);
    await handlePaymentCallback(payment!.id);
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment!.id }, include: { events: true } });
    expect(after.events).toHaveLength(before);
  });

  it("allows exactly one concurrent offer acceptance to claim a listing", async () => {
    // Provisioned rather than discovered: the seed does not reliably produce a
    // listing carrying two live buyer offers, and a race test that silently
    // skips because its fixture is absent proves nothing. Built here, torn down
    // in the finally block so the suite stays re-runnable.
    const listing = await prisma.listing.findFirst({
      where: { status: "LISTED", isPrivate: false, askingCash: { not: null } },
      select: { id: true, sellerId: true, askingCash: true, status: true },
    });
    if (!listing) throw new Error("Seed the database first: npm run seed");

    const buyers = await prisma.user.findMany({
      where: { roles: { has: "BUYER" }, deletedAt: null, id: { not: listing.sellerId } },
      select: { id: true },
      take: 2,
    });
    expect(buyers).toHaveLength(2);

    const amount = listing.askingCash!;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const created = await Promise.all(
      buyers.map((b) =>
        prisma.offer.create({
          data: {
            listingId: listing.id,
            buyerId: b.id,
            sellerId: listing.sellerId,
            direction: "BUYER_TO_SELLER",
            amount,
            status: "PENDING",
            expiresAt,
          },
          select: { id: true },
        }),
      ),
    );
    // acceptOfferToDeal claims the listing by moving UNDER_OFFER -> RESERVED,
    // so the listing has to be in that state for either contender to win.
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "UNDER_OFFER" } });

    try {
      const results = await Promise.allSettled(
        created.map((offer) => acceptOffer({ offerId: offer.id, actorId: listing.sellerId })),
      );

      // The whole point: two sellers-side acceptances race, exactly one wins,
      // and the loser does not leave a second deal behind.
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const deals = await prisma.deal.count({ where: { listingId: listing.id } });
      expect(deals).toBe(1);
    } finally {
      const dealIds = (
        await prisma.deal.findMany({ where: { listingId: listing.id }, select: { id: true } })
      ).map((d) => d.id);
      if (dealIds.length > 0) {
        await prisma.message.deleteMany({ where: { dealId: { in: dealIds } } });
        await prisma.payment.deleteMany({ where: { dealId: { in: dealIds } } });
        await prisma.milestone.deleteMany({ where: { dealId: { in: dealIds } } });
        await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
      }
      await prisma.offer.deleteMany({ where: { id: { in: created.map((o) => o.id) } } });
      await prisma.listing.update({ where: { id: listing.id }, data: { status: listing.status } });
    }
  });
});
