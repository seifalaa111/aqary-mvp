import "server-only";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { notify } from "./notifications";
import { transitionListing } from "./listings";
import { createDealFromOffer } from "./deals";

/**
 * Offers and counter-offers. The no-overprice invariant is enforced here on the
 * server for every direction of the negotiation.
 */

export class OfferError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "OfferError";
  }
}

export async function createOffer(args: {
  listingId: string;
  buyerId: string;
  amount: string;
  message?: string;
  proposedCompletionDays?: number;
  proofOfFundsDocumentId?: string | null;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: args.listingId },
    include: { contract: { include: { fields: true } } },
  });

  if (listing.status !== "LISTED" && listing.status !== "UNDER_OFFER") {
    throw new OfferError("This listing is not open for offers", "NOT_OPEN");
  }
  if (listing.sellerId === args.buyerId) {
    throw new OfferError("You cannot make an offer on your own listing", "SELF_OFFER");
  }

  const amount = money(args.amount);
  if (amount.lte(0)) throw new OfferError("Offer must be a positive amount", "INVALID_AMOUNT");

  // INVARIANT: no offer may exceed the asking cash, and the asking cash can
  // never exceed the verified amount paid (enforced at publish time too).
  const asking = money(listing.askingCash ?? 0);
  if (amount.gt(asking)) {
    throw new OfferError(
      `Offers above the asking cash of EGP ${asking.toFixed(0)} are not accepted — Aqary has no overprice`,
      "ABOVE_ASKING",
    );
  }
  const verifiedPaid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID");
  if (verifiedPaid?.verifiedNum && amount.gt(new Decimal(verifiedPaid.verifiedNum.toString()))) {
    throw new OfferError("Offer exceeds the verified amount paid", "ABOVE_VERIFIED_PAID");
  }

  const existing = await prisma.offer.findFirst({
    where: { listingId: args.listingId, buyerId: args.buyerId, status: { in: ["PENDING", "COUNTERED"] } },
  });
  if (existing) {
    throw new OfferError("You already have an open offer on this listing", "DUPLICATE_OFFER");
  }

  const offer = await prisma.offer.create({
    data: {
      listingId: args.listingId,
      buyerId: args.buyerId,
      sellerId: listing.sellerId,
      direction: "BUYER_TO_SELLER",
      amount: amount.toFixed(2),
      message: args.message ?? null,
      proposedCompletionDays: args.proposedCompletionDays ?? 45,
      proofOfFundsDocumentId: args.proofOfFundsDocumentId ?? null,
      expiresAt: new Date(Date.now() + config.OFFER_EXPIRY_HOURS * 3600 * 1000),
    },
  });

  if (listing.status === "LISTED") {
    await transitionListing({
      listingId: args.listingId,
      to: "UNDER_OFFER",
      actorId: args.buyerId,
      actorRole: "BUYER",
    });
  }

  await audit({
    actorId: args.buyerId,
    actorRole: "BUYER",
    action: "OFFER_CREATED",
    entityType: "Offer",
    entityId: offer.id,
    after: { amount: offer.amount.toString(), listingId: args.listingId },
  });

  await notify({
    userId: listing.sellerId,
    type: "OFFER_RECEIVED",
    titleEn: `New offer on ${listing.reference}`,
    titleAr: `عرض جديد على ${listing.reference}`,
    bodyEn: `EGP ${amount.toFixed(0)} — expires in ${config.OFFER_EXPIRY_HOURS} hours.`,
    bodyAr: `${amount.toFixed(0)} جنيه — ينتهي خلال ${config.OFFER_EXPIRY_HOURS} ساعة.`,
    linkHref: `/seller/listings/${args.listingId}/offers`,
  });

  return offer;
}

export async function counterOffer(args: {
  offerId: string;
  actorId: string;
  actorRole: "SELLER" | "BUYER";
  amount: string;
  message?: string;
}) {
  const parent = await prisma.offer.findUniqueOrThrow({
    where: { id: args.offerId },
    include: { listing: { include: { contract: { include: { fields: true } } } } },
  });

  await expireIfDue(parent.id);
  const fresh = await prisma.offer.findUniqueOrThrow({ where: { id: args.offerId } });
  if (fresh.status !== "PENDING") {
    throw new OfferError(`This offer is ${fresh.status.toLowerCase()} and cannot be countered`, "NOT_PENDING");
  }

  const isSeller = args.actorRole === "SELLER";
  if (isSeller && parent.sellerId !== args.actorId) throw new OfferError("Not your listing", "NOT_OWNER");
  if (!isSeller && parent.buyerId !== args.actorId) throw new OfferError("Not your offer", "NOT_OWNER");

  const amount = money(args.amount);
  const asking = money(parent.listing.askingCash ?? 0);
  if (amount.gt(asking)) {
    throw new OfferError(
      `A counter above the asking cash of EGP ${asking.toFixed(0)} is not permitted`,
      "ABOVE_ASKING",
    );
  }
  if (amount.lte(0)) throw new OfferError("Counter must be a positive amount", "INVALID_AMOUNT");

  const counter = await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: parent.id },
      data: { status: "COUNTERED", respondedAt: new Date() },
    });
    return tx.offer.create({
      data: {
        listingId: parent.listingId,
        buyerId: parent.buyerId,
        sellerId: parent.sellerId,
        parentOfferId: parent.id,
        direction: isSeller ? "SELLER_TO_BUYER" : "BUYER_TO_SELLER",
        amount: amount.toFixed(2),
        message: args.message ?? null,
        proposedCompletionDays: parent.proposedCompletionDays,
        proofOfFundsDocumentId: parent.proofOfFundsDocumentId,
        expiresAt: new Date(Date.now() + config.OFFER_EXPIRY_HOURS * 3600 * 1000),
      },
    });
  });

  await audit({
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "OFFER_COUNTERED",
    entityType: "Offer",
    entityId: counter.id,
    before: { amount: parent.amount.toString() },
    after: { amount: counter.amount.toString() },
    metadata: { parentOfferId: parent.id, listingId: parent.listingId },
  });

  await notify({
    userId: isSeller ? parent.buyerId : parent.sellerId,
    type: "OFFER_COUNTERED",
    titleEn: `Counter-offer on ${parent.listing.reference}`,
    titleAr: `عرض مقابل على ${parent.listing.reference}`,
    bodyEn: `EGP ${amount.toFixed(0)} — expires in ${config.OFFER_EXPIRY_HOURS} hours.`,
    bodyAr: `${amount.toFixed(0)} جنيه — ينتهي خلال ${config.OFFER_EXPIRY_HOURS} ساعة.`,
    linkHref: isSeller ? `/opportunities/${parent.listingId}` : `/seller/listings/${parent.listingId}/offers`,
  });

  return counter;
}

export async function acceptOffer(args: { offerId: string; actorId: string }) {
  await expireIfDue(args.offerId);
  const offer = await prisma.offer.findUniqueOrThrow({
    where: { id: args.offerId },
    include: { listing: true },
  });

  if (offer.status !== "PENDING") {
    throw new OfferError(`This offer is ${offer.status.toLowerCase()}`, "NOT_PENDING");
  }

  // The party who did NOT make the offer is the one who may accept it.
  const acceptor = offer.direction === "BUYER_TO_SELLER" ? offer.sellerId : offer.buyerId;
  if (acceptor !== args.actorId) throw new OfferError("You cannot accept this offer", "NOT_COUNTERPARTY");

  const accepted = await prisma.$transaction(async (tx) => {
    const a = await tx.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    // Every other open offer on this listing is now dead.
    await tx.offer.updateMany({
      where: { listingId: offer.listingId, id: { not: offer.id }, status: { in: ["PENDING", "COUNTERED"] } },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    return a;
  });

  await audit({
    actorId: args.actorId,
    actorRole: offer.direction === "BUYER_TO_SELLER" ? "SELLER" : "BUYER",
    action: "OFFER_ACCEPTED",
    entityType: "Offer",
    entityId: offer.id,
    after: { amount: offer.amount.toString(), listingId: offer.listingId },
  });

  const deal = await createDealFromOffer(accepted.id, args.actorId);

  await notify({
    userId: offer.direction === "BUYER_TO_SELLER" ? offer.buyerId : offer.sellerId,
    type: "OFFER_ACCEPTED",
    titleEn: "Your offer was accepted",
    titleAr: "تم قبول عرضك",
    bodyEn: `A deal room has been opened for ${offer.listing.reference}.`,
    bodyAr: `تم فتح غرفة الصفقة لـ ${offer.listing.reference}.`,
    linkHref: `/deals/${deal.id}`,
  });

  return { offer: accepted, deal };
}

export async function declineOffer(args: { offerId: string; actorId: string; reason?: string }) {
  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: args.offerId } });
  if (offer.status !== "PENDING") {
    throw new OfferError(`This offer is ${offer.status.toLowerCase()}`, "NOT_PENDING");
  }
  const decliner = offer.direction === "BUYER_TO_SELLER" ? offer.sellerId : offer.buyerId;
  if (decliner !== args.actorId) throw new OfferError("You cannot decline this offer", "NOT_COUNTERPARTY");

  const updated = await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  await audit({
    actorId: args.actorId,
    action: "OFFER_DECLINED",
    entityType: "Offer",
    entityId: offer.id,
    after: { reason: args.reason ?? null },
  });

  await notify({
    userId: offer.direction === "BUYER_TO_SELLER" ? offer.buyerId : offer.sellerId,
    type: "OFFER_DECLINED",
    titleEn: "Your offer was declined",
    titleAr: "تم رفض عرضك",
    bodyEn: args.reason ?? "The other party declined this offer.",
    bodyAr: args.reason ?? "تم رفض العرض من الطرف الآخر.",
    linkHref: `/opportunities/${offer.listingId}`,
  });

  await maybeReopenListing(offer.listingId);
  return updated;
}

export async function withdrawOffer(args: { offerId: string; actorId: string }) {
  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: args.offerId } });
  const owner = offer.direction === "BUYER_TO_SELLER" ? offer.buyerId : offer.sellerId;
  if (owner !== args.actorId) throw new OfferError("Not your offer", "NOT_OWNER");
  if (offer.status !== "PENDING") throw new OfferError("Only a pending offer can be withdrawn", "NOT_PENDING");

  const updated = await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "WITHDRAWN", respondedAt: new Date() },
  });
  await audit({
    actorId: args.actorId,
    action: "OFFER_WITHDRAWN",
    entityType: "Offer",
    entityId: offer.id,
  });
  await maybeReopenListing(offer.listingId);
  return updated;
}

/** Expires a single offer if its timer has run out. Called on every read path. */
export async function expireIfDue(offerId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "PENDING" || offer.expiresAt > new Date()) return offer;

  const updated = await prisma.offer.update({ where: { id: offerId }, data: { status: "EXPIRED" } });
  await audit({ action: "OFFER_EXPIRED", entityType: "Offer", entityId: offerId });
  await notify({
    userId: offer.buyerId,
    type: "OFFER_EXPIRED",
    titleEn: "Your offer expired",
    titleAr: "انتهت صلاحية عرضك",
    bodyEn: "The offer window closed without a response.",
    bodyAr: "انتهت مهلة الرد على العرض.",
    linkHref: `/opportunities/${offer.listingId}`,
  });
  await maybeReopenListing(offer.listingId);
  return updated;
}

/** Sweeps every overdue offer. Runs from the worker and on marketplace reads. */
export async function expireDueOffers(): Promise<number> {
  const due = await prisma.offer.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 200,
  });
  for (const o of due) await expireIfDue(o.id);
  return due.length;
}

async function maybeReopenListing(listingId: string) {
  const open = await prisma.offer.count({
    where: { listingId, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
  });
  if (open > 0) return;
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (listing?.status === "UNDER_OFFER") {
    await transitionListing({ listingId, to: "LISTED", reason: "All offers closed" });
  }
}
