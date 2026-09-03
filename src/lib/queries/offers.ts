import "server-only";
import { prisma } from "@/lib/db";
import { buyerPlatformFee } from "@/lib/domain/calculators";
import { expireDueOffers } from "@/lib/services/offers";
import type { OfferRow } from "@/components/seller/offers-table";

/** Offers on a seller's listings, shaped for the comparison table. */
export async function sellerOffers(sellerId: string, listingId?: string): Promise<OfferRow[]> {
  // Expiry is enforced on read, so a stale timer never shows as live.
  await expireDueOffers();

  const offers = await prisma.offer.findMany({
    where: { sellerId, ...(listingId ? { listingId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true,
          reference: true,
          askingCash: true,
          totalContractPrice: true,
          contract: { select: { unit: { select: { project: { select: { nameEn: true } } } } } },
        },
      },
      buyer: {
        select: {
          fullNameEn: true,
          buyerProfile: {
            select: { tier: true, readiness: true, availableCash: true, proofOfFundsVerifiedAt: true },
          },
        },
      },
    },
  });

  return offers.map((o) => ({
    id: o.id,
    listingId: o.listingId,
    listingReference: o.listing.reference,
    projectName: o.listing.contract.unit.project.nameEn,
    amount: o.amount.toString(),
    askingCash: o.listing.askingCash?.toString() ?? "0",
    status: o.status,
    direction: o.direction,
    message: o.message,
    proposedCompletionDays: o.proposedCompletionDays,
    expiresAt: o.expiresAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
    respondedAt: o.respondedAt?.toISOString() ?? null,
    parentOfferId: o.parentOfferId,
    buyer: {
      // Buyers are identified by first name only until the reservation clears.
      name: o.buyer.fullNameEn.split(" ")[0] ?? "Buyer",
      tier: o.buyer.buyerProfile?.tier ?? null,
      readiness: o.buyer.buyerProfile?.readiness ?? null,
      hasProofOfFunds:
        Boolean(o.proofOfFundsDocumentId) || Boolean(o.buyer.buyerProfile?.proofOfFundsVerifiedAt),
      availableCash: o.buyer.buyerProfile?.availableCash?.toString() ?? null,
    },
    platformFee: buyerPlatformFee(o.listing.totalContractPrice?.toString() ?? 0).toFixed(2),
  }));
}

/** A buyer's own offers, for their offers page. */
export async function buyerOffers(buyerId: string) {
  await expireDueOffers();
  return prisma.offer.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true,
          reference: true,
          status: true,
          askingCash: true,
          contract: {
            select: {
              unit: {
                select: {
                  unitCode: true,
                  project: { select: { nameEn: true, nameAr: true, city: true } },
                },
              },
            },
          },
          media: {
            where: { moderationStatus: "APPROVED" },
            orderBy: [{ isCover: "desc" }, { order: "asc" }],
            take: 1,
            select: { variants: true, altEn: true },
          },
        },
      },
      deal: { select: { id: true, reference: true } },
    },
  });
}
