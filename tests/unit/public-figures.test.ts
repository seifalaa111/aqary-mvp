import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { CARD_SELECT, costFor, cashRequiredNow, duesFor } from "@/lib/queries/marketplace";
import { getOpportunity } from "@/lib/queries/opportunity";
import { config } from "@/lib/config";
import { money } from "@/lib/money";

/**
 * Requires a migrated, seeded database — like `invariants.test.ts`.
 *
 * The public product states the same three numbers in four places: the
 * marketplace card, the opportunity position header, the mobile CTA bar and the
 * cost breakdown. They were computed by two different code paths that disagreed
 * over maintenance/club dues and arrears, so a buyer comparing the grid with a
 * detail page — or the top of a detail page with its own cost panel — saw two
 * different answers on every listing. These tests hold the surfaces together.
 */
describe("public financial figures agree across surfaces", () => {
  it("card, opportunity page and stored discount state the same position", async () => {
    const listings = await prisma.listing.findMany({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
      select: CARD_SELECT,
      orderBy: { reference: "asc" },
    });

    expect(listings.length).toBeGreaterThan(0);

    for (const l of listings) {
      const card = costFor(l);
      const detail = await getOpportunity(l.id);
      expect(detail, `${l.reference} has no opportunity read model`).not.toBeNull();

      // The card and the opportunity page must not disagree about the cash a
      // buyer has to produce, nor about what the position costs in total.
      expect(card.cashRequiredNow.toString(), `${l.reference} cashRequiredNow`).toBe(
        detail!.cost.cashRequiredNow.toString(),
      );
      expect(card.totalEffectiveCost.toString(), `${l.reference} totalEffectiveCost`).toBe(
        detail!.cost.totalEffectiveCost.toString(),
      );

      // The discount a buyer sees on the grid is the one they see on the page,
      // and the one the marketplace sorts and filters on.
      expect(card.savingPctBps, `${l.reference} savingPctBps`).toBe(detail!.cost.savingPctBps);
      expect(card.savingPctBps, `${l.reference} vs stored discountPctBps`).toBe(l.discountPctBps);
    }
  });

  it("counts the buyer success fee, the developer fee, dues and arrears in the cash required", async () => {
    const l = await prisma.listing.findFirst({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
      select: CARD_SELECT,
      orderBy: { reference: "asc" },
    });
    expect(l).not.toBeNull();

    const cost = costFor(l!);
    const expected = money(l!.askingCash?.toString())
      .plus(money(l!.totalContractPrice?.toString()).mul(config.PLATFORM_FEE_BPS).div(10_000))
      .plus(money(l!.developerAssignmentFee?.toString()))
      .plus(duesFor(l!))
      .plus(l!.contract.hasArrears ? money(l!.contract.arrearsAmount?.toString()) : money(0));

    expect(cost.cashRequiredNow.toString()).toBe(expected.toString());
    // `cashRequiredNow` must remain a delegation, not a second implementation.
    expect(cashRequiredNow(l!).toString()).toBe(cost.cashRequiredNow.toString());
  });

  it("never treats an unverified dues field as a real charge", async () => {
    const listings = await prisma.listing.findMany({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
      select: CARD_SELECT,
    });

    for (const l of listings) {
      const unverified = l.contract.fields.filter(
        (f) =>
          (f.key === "MAINTENANCE_DEPOSIT" || f.key === "CLUB_FEE") && f.verifiedSource === null,
      );
      // An analyst has not adopted these, so they must contribute nothing —
      // a pending figure is never quietly charged to the buyer.
      const withoutThem = l.contract.fields
        .filter((f) => f.verifiedSource !== null)
        .filter((f) => f.key === "MAINTENANCE_DEPOSIT" || f.key === "CLUB_FEE")
        .reduce((acc, f) => acc.plus(money(f.verifiedNum?.toString())), money(0));

      expect(duesFor(l).toString(), `${l.reference} dues (${unverified.length} unverified)`).toBe(
        withoutThem.toString(),
      );
    }
  });
});
