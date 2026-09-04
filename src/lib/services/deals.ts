import "server-only";
import type { MilestoneKey, MilestoneStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit";
import { bps, money } from "@/lib/money";
import { buyerPlatformFee } from "@/lib/domain/calculators";
import { notify } from "./notifications";

/**
 * Deal room, milestone tracker and completion. Milestones are ordered and
 * server-enforced: a milestone cannot complete while an earlier one is open,
 * and the money milestones cannot complete without a settled payment record.
 */

export interface MilestoneSpec {
  key: MilestoneKey;
  order: number;
  ownerRole: Role;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  requiredDocuments: string[];
  /** Days after the previous milestone completes. */
  slaDays: number;
  /** Completing this milestone requires a SUCCEEDED payment of this kind. */
  requiresPayment?: "RESERVATION_DEPOSIT" | "PLATFORM_FEE" | "SELLER_RELEASE";
}

export const MILESTONES: MilestoneSpec[] = [
  {
    key: "OFFER_ACCEPTED",
    order: 1,
    ownerRole: "ADMIN",
    titleEn: "Offer accepted",
    titleAr: "قبول العرض",
    descriptionEn: "Both parties agreed the cash figure. The deal room is open.",
    requiredDocuments: [],
    slaDays: 0,
  },
  {
    key: "RESERVATION_DEPOSIT",
    order: 2,
    ownerRole: "BUYER",
    titleEn: "Reservation deposit held",
    titleAr: "دفع عربون الحجز",
    descriptionEn:
      "The buyer places a refundable reservation deposit. Contact details unmask once it clears.",
    requiredDocuments: [],
    slaDays: 3,
    requiresPayment: "RESERVATION_DEPOSIT",
  },
  {
    key: "DEVELOPER_NOC_REQUESTED",
    order: 3,
    ownerRole: "DEVELOPER_PARTNER",
    titleEn: "Developer NOC requested",
    titleAr: "طلب موافقة المطوّر",
    descriptionEn: "Aqary files the assignment request with the developer on the seller's behalf.",
    requiredDocuments: ["Assignment request form", "Buyer national ID", "Seller national ID"],
    slaDays: 7,
  },
  {
    key: "ASSIGNMENT_APPOINTMENT",
    order: 4,
    ownerRole: "DEVELOPER_PARTNER",
    titleEn: "Assignment appointment scheduled",
    titleAr: "تحديد موعد التنازل",
    descriptionEn: "The developer sets a signing appointment for both parties.",
    requiredDocuments: ["Developer NOC"],
    slaDays: 10,
  },
  {
    key: "DOCUMENTS_SIGNED",
    order: 5,
    ownerRole: "SELLER",
    titleEn: "Documents signed at the developer",
    titleAr: "توقيع المستندات لدى المطوّر",
    descriptionEn:
      "Seller and buyer attend and sign in their own names. Aqary prepares the file and attends in support.",
    requiredDocuments: ["Signed assignment deed", "Developer acknowledgement"],
    slaDays: 5,
  },
  {
    key: "ASSIGNMENT_REGISTERED",
    order: 6,
    ownerRole: "DEVELOPER_PARTNER",
    titleEn: "Assignment registered",
    titleAr: "تسجيل التنازل",
    descriptionEn: "The developer records the buyer as the contract holder.",
    requiredDocuments: ["Registered contract copy"],
    slaDays: 7,
  },
  {
    key: "CASH_RELEASED_TO_SELLER",
    order: 7,
    ownerRole: "ADMIN",
    titleEn: "Cash released to the seller",
    titleAr: "تحويل المبلغ للبائع",
    descriptionEn: "The agreed cash is released from settlement to the seller.",
    requiredDocuments: [],
    slaDays: 2,
    requiresPayment: "SELLER_RELEASE",
  },
  {
    key: "PLATFORM_FEE_COLLECTED",
    order: 8,
    ownerRole: "BUYER",
    titleEn: "Aqary success fee collected",
    titleAr: "تحصيل رسوم أقاري",
    descriptionEn: `The ${config.PLATFORM_FEE_BPS / 100}% buyer success fee — charged only now, on a completed assignment.`,
    requiredDocuments: [],
    slaDays: 2,
    requiresPayment: "PLATFORM_FEE",
  },
  {
    key: "COMPLETED",
    order: 9,
    ownerRole: "ADMIN",
    titleEn: "Assignment complete",
    titleAr: "اكتمال التنازل",
    descriptionEn: "The contract is in the buyer's name and the seller has their cash.",
    requiredDocuments: [],
    slaDays: 1,
  },
];

export class DealError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "DealError";
  }
}

export async function createDealFromOffer(offerId: string, actorId: string) {
  const coordinatorId = await leastLoadedCoordinator();
  const deal = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.deal.findUnique({ where: { offerId } });
      if (existing) return existing;

      const offer = await tx.offer.findUniqueOrThrow({
        where: { id: offerId },
        select: { id: true, listingId: true, buyerId: true, sellerId: true, status: true, expiresAt: true },
      });
      assertAcceptedOffer(offer, actorId);

      // Claim the listing before the deal exists. This conditional write is the
      // concurrency boundary: another accepted offer cannot open a second deal.
      const claimed = await tx.listing.updateMany({
        where: { id: offer.listingId, status: "UNDER_OFFER" },
        data: { status: "RESERVED" },
      });
      if (claimed.count !== 1) throw new DealError("This listing is no longer available for a deal", "LISTING_UNAVAILABLE");

      return createDealRecord(tx, offerId, actorId, coordinatorId);
    },
    { isolationLevel: "Serializable" },
  );

  await audit({
    actorId,
    action: "DEAL_CREATED",
    entityType: "Deal",
    entityId: deal.id,
    after: {
      reference: deal.reference,
      cashToSeller: deal.cashToSeller.toString(),
      platformFee: deal.platformFee.toString(),
      reservationDeposit: deal.reservationDeposit.toString(),
    },
    metadata: { listingId: deal.listingId, offerId, developerId: deal.developerId },
  });

  for (const userId of [deal.buyerId, deal.sellerId]) {
    await notify({
      userId,
      type: "DEAL_CREATED",
      titleEn: `Deal room ${deal.reference} is open`,
      titleAr: `غرفة الصفقة ${deal.reference} مفتوحة`,
      bodyEn: "Milestones, documents and messaging for this assignment are now in one place.",
      bodyAr: "المراحل والمستندات والمراسلات في مكان واحد.",
      linkHref: `/deals/${deal.id}`,
    });
  }

  return deal;
}

/**
 * Claims a pending offer and its listing, declines competing offers, and opens
 * the deal aggregate in one serializable transaction. Neither a second buyer
 * nor an expiry worker can observe a half-accepted offer.
 */
export async function acceptOfferToDeal(args: { offerId: string; actorId: string }) {
  const coordinatorId = await leastLoadedCoordinator();
  const result = await prisma.$transaction(
    async (tx) => {
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: args.offerId } });
      if (offer.status !== "PENDING") throw new DealError(`This offer is ${offer.status.toLowerCase()}`, "NOT_PENDING");
      if (offer.expiresAt <= new Date()) throw new DealError("This offer has expired", "OFFER_EXPIRED");
      const acceptor = offer.direction === "BUYER_TO_SELLER" ? offer.sellerId : offer.buyerId;
      if (acceptor !== args.actorId) throw new DealError("You cannot accept this offer", "NOT_COUNTERPARTY");

      const accepted = await tx.offer.updateMany({
        where: { id: offer.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      if (accepted.count !== 1) throw new DealError("This offer changed while it was being accepted", "RACE_CONFLICT");
      const claimed = await tx.listing.updateMany({
        where: { id: offer.listingId, status: "UNDER_OFFER" },
        data: { status: "RESERVED" },
      });
      if (claimed.count !== 1) throw new DealError("Another offer already claimed this listing", "LISTING_UNAVAILABLE");
      await tx.offer.updateMany({
        where: { listingId: offer.listingId, id: { not: offer.id }, status: { in: ["PENDING", "COUNTERED"] } },
        data: { status: "DECLINED", respondedAt: new Date() },
      });
      const deal = await createDealRecord(tx, offer.id, args.actorId, coordinatorId);
      const acceptedOffer = await tx.offer.findUniqueOrThrow({ where: { id: offer.id } });
      return { offer: acceptedOffer, deal };
    },
    { isolationLevel: "Serializable" },
  );
  await audit({
    actorId: args.actorId,
    action: "OFFER_ACCEPTED",
    entityType: "Offer",
    entityId: result.offer.id,
    after: { amount: result.offer.amount.toString(), listingId: result.offer.listingId },
  });
  await audit({
    actorId: args.actorId,
    action: "DEAL_CREATED",
    entityType: "Deal",
    entityId: result.deal.id,
    after: { reference: result.deal.reference },
    metadata: { listingId: result.deal.listingId, offerId: result.offer.id, developerId: result.deal.developerId },
  });
  return result;
}

async function leastLoadedCoordinator(): Promise<string | null> {
  const analysts = await prisma.user.findMany({
    where: { roles: { has: "ANALYST" }, deletedAt: null },
    select: { id: true, _count: { select: { coordinatedDeals: true } } },
  });
  return analysts.sort((a, b) => a._count.coordinatedDeals - b._count.coordinatedDeals)[0]?.id ?? null;
}

function assertAcceptedOffer(
  offer: { buyerId: string; sellerId: string; status: string; expiresAt: Date },
  actorId: string,
) {
  if (offer.status !== "ACCEPTED") throw new DealError("Only an accepted offer can open a deal", "OFFER_NOT_ACCEPTED");
  if (offer.expiresAt <= new Date()) throw new DealError("This offer expired before a deal was opened", "OFFER_EXPIRED");
  if (offer.buyerId !== actorId && offer.sellerId !== actorId) {
    throw new DealError("Only an offer party may open its deal", "NOT_OFFER_PARTY");
  }
}

/** Creates the entire deal aggregate only after the offer and listing have won their conditional transition. */
async function createDealRecord(
  tx: Prisma.TransactionClient,
  offerId: string,
  actorId: string,
  coordinatorId: string | null,
) {
  const existing = await tx.deal.findUnique({ where: { offerId } });
  if (existing) return existing;
  const offer = await tx.offer.findUniqueOrThrow({
    where: { id: offerId },
    include: {
      listing: {
        include: {
          contract: {
            include: {
              unit: { include: { project: { include: { developer: { include: { policy: true } } } } } },
            },
          },
        },
      },
    },
  });
  assertAcceptedOffer(offer, actorId);
  const listing = offer.listing;
  if (listing.status !== "RESERVED" || listing.sellerId !== offer.sellerId) {
    throw new DealError("The accepted offer no longer matches a reserved listing", "OFFER_LISTING_MISMATCH");
  }
  const developer = listing.contract.unit.project.developer;
  const policy = developer.policy;
  const platformFee = buyerPlatformFee(listing.totalContractPrice ?? 0);
  const assignFee = money(listing.developerAssignmentFee ?? 0);
  const cash = money(offer.amount);
  const deposit = bps(cash, config.RESERVATION_DEPOSIT_BPS);
  const reference = `AQD-${listing.reference.replace(/^AQ-/, "")}`;
  const policySnapshot = {
    policyId: policy?.id ?? null,
    updatedAt: policy?.updatedAt.toISOString() ?? null,
    assignmentAllowed: policy?.assignmentAllowed ?? "UNKNOWN",
    feeType: policy?.feeType ?? "NONE",
    feePercentBps: policy?.feePercentBps ?? null,
    feeFixedAmount: policy?.feeFixedAmount?.toString() ?? null,
    feeBasis: policy?.feeBasis ?? null,
    minPercentPaidBps: policy?.minPercentPaidBps ?? null,
    minMonthsElapsed: policy?.minMonthsElapsed ?? null,
    requiredDocuments: policy?.requiredDocuments ?? [],
    typicalNocDays: policy?.typicalNocDays ?? null,
    waitingPeriodDays: policy?.waitingPeriodDays ?? null,
    conditionsEn: policy?.conditionsEn ?? null,
    conditionsAr: policy?.conditionsAr ?? null,
  };
  const d = await tx.deal.create({
    data: {
      reference,
      listingId: listing.id,
      offerId: offer.id,
      developerId: developer.id,
      developerPolicySnapshot: policySnapshot,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      coordinatorId,
      cashToSeller: cash.toFixed(2),
      platformFee: platformFee.toFixed(2),
      developerAssignmentFee: assignFee.toFixed(2),
      reservationDeposit: deposit.toFixed(2),
    },
  });
  let cursor = new Date();
  await tx.milestone.createMany({
    data: MILESTONES.map((m) => {
      cursor = new Date(cursor.getTime() + m.slaDays * 86400000);
      return {
        dealId: d.id,
        key: m.key,
        order: m.order,
        ownerRole: m.ownerRole,
        status:
          m.key === "OFFER_ACCEPTED"
            ? ("COMPLETED" as MilestoneStatus)
            : m.order === 2
              ? ("IN_PROGRESS" as MilestoneStatus)
              : ("PENDING" as MilestoneStatus),
        dueDate: cursor,
        completedAt: m.key === "OFFER_ACCEPTED" ? new Date() : null,
        requiredDocuments: m.requiredDocuments,
      };
    }),
  });
  await tx.message.create({
    data: {
      dealId: d.id,
      isSystem: true,
      body: `Deal room opened for ${listing.reference}. Cash to seller EGP ${cash.toFixed(0)}; Aqary success fee EGP ${platformFee.toFixed(0)} is payable by the buyer only after the assignment is registered and seller cash is released. Contact details stay masked until the reservation deposit clears.`,
    },
  });
  return d;
}

/**
 * Advances one milestone. Order is enforced, payment-gated milestones require a
 * settled payment, and every transition is audited.
 */
export async function completeMilestone(args: {
  dealId: string;
  key: MilestoneKey;
  actorId: string;
  actorRole: Role;
  note?: string;
}) {
  const spec = MILESTONES.find((s) => s.key === args.key);
  if (!spec) throw new DealError("Unknown milestone", "NOT_FOUND");
  const outcome = await prisma.$transaction(
    async (tx) => {
      const deal = await tx.deal.findUniqueOrThrow({
        where: { id: args.dealId },
        include: { milestones: { orderBy: { order: "asc" } } },
      });
      if (deal.status !== "ACTIVE") throw new DealError("This deal is not active", "NOT_ACTIVE");
      const milestone = deal.milestones.find((m) => m.key === args.key);
      if (!milestone) throw new DealError("Unknown milestone", "NOT_FOUND");
      if (milestone.status === "COMPLETED") {
        return { milestone, completedDeal: false, listingMoved: false, alreadyCompleted: true };
      }
      assertMilestoneActor(milestone.ownerRole, args.actorRole);
      const earlierOpen = deal.milestones.filter((m) => m.order < milestone.order && m.status !== "COMPLETED");
      if (earlierOpen.length > 0) {
        throw new DealError(
          `"${MILESTONES.find((s) => s.key === earlierOpen[0]!.key)?.titleEn}" must complete first`,
          "OUT_OF_ORDER",
        );
      }
      if (spec.requiresPayment) {
        const settled = await tx.payment.findFirst({
          where: { dealId: deal.id, kind: spec.requiresPayment, status: "SUCCEEDED" },
          select: { id: true },
        });
        if (!settled) {
          throw new DealError(
            `This milestone needs a settled ${spec.requiresPayment.replace(/_/g, " ").toLowerCase()} payment`,
            "PAYMENT_REQUIRED",
          );
        }
      }
      const changed = await tx.milestone.updateMany({
        where: { id: milestone.id, status: { not: "COMPLETED" } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completedBy: args.actorId,
          notes: args.note ?? milestone.notes,
          blockedReason: null,
        },
      });
      if (changed.count !== 1) throw new DealError("This milestone changed while it was being completed", "RACE_CONFLICT");

      const next = deal.milestones.find((x) => x.order === milestone.order + 1);
      if (next?.status === "PENDING") {
        await tx.milestone.updateMany({
          where: { id: next.id, status: "PENDING" },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
      }

      let listingMoved = false;
      if (args.key === "RESERVATION_DEPOSIT") {
        await tx.deal.update({ where: { id: deal.id }, data: { contactUnmasked: true } });
        await tx.message.create({
          data: { dealId: deal.id, isSystem: true, body: "Reservation deposit cleared. Contact details are now visible to both parties." },
        });
      }
      if (args.key === "ASSIGNMENT_REGISTERED") {
        const listing = await tx.listing.updateMany({
          where: { id: deal.listingId, status: "RESERVED" },
          data: { status: "ASSIGNMENT_IN_PROGRESS" },
        });
        if (listing.count !== 1) throw new DealError("The listing cannot enter assignment-in-progress", "LISTING_STATE_CONFLICT");
        listingMoved = true;
      }
      let completedDeal = false;
      if (args.key === "COMPLETED") {
        const listing = await tx.listing.updateMany({
          where: { id: deal.listingId, status: "ASSIGNMENT_IN_PROGRESS" },
          data: { status: "COMPLETED" },
        });
        if (listing.count !== 1) throw new DealError("The deal cannot complete while its listing is not in progress", "LISTING_STATE_CONFLICT");
        const completed = await tx.deal.updateMany({
          where: { id: deal.id, status: "ACTIVE" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        if (completed.count !== 1) throw new DealError("This deal changed while it was being completed", "RACE_CONFLICT");
        listingMoved = true;
        completedDeal = true;
      }
      const updated = await tx.milestone.findUniqueOrThrow({ where: { id: milestone.id } });
      return { milestone: updated, completedDeal, listingMoved, alreadyCompleted: false };
    },
    { isolationLevel: "Serializable" },
  );
  // A duplicate UI submission is harmless and must not duplicate audit rows,
  // notifications, or a deal-completion side effect.
  if (outcome.alreadyCompleted) return outcome.milestone;

  await audit({
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "MILESTONE_ADVANCED",
    entityType: "Milestone",
    entityId: outcome.milestone.id,
    before: { status: "OPEN" },
    after: { status: "COMPLETED" },
    metadata: { dealId: args.dealId, key: args.key },
  });
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: args.dealId } });
  for (const userId of [deal.buyerId, deal.sellerId]) {
    await notify({
      userId,
      type: "MILESTONE_ADVANCED",
      titleEn: `${spec.titleEn} — done`,
      titleAr: `${spec.titleAr} — تم`,
      bodyEn: `${deal.reference} moved forward.`,
      bodyAr: `تقدّمت الصفقة ${deal.reference}.`,
      linkHref: `/deals/${deal.id}`,
    });
  }

  if (outcome.listingMoved) {
    await audit({
      actorId: args.actorId,
      actorRole: args.actorRole,
      action: "LISTING_STATUS_CHANGED",
      entityType: "Listing",
      entityId: deal.listingId,
      after: { status: args.key === "COMPLETED" ? "COMPLETED" : "ASSIGNMENT_IN_PROGRESS" },
      metadata: { dealId: deal.id, milestone: args.key },
    });
  }
  if (outcome.completedDeal) {
    for (const userId of [deal.buyerId, deal.sellerId]) {
      await notify({
        userId,
        type: "DEAL_COMPLETED",
        titleEn: "Assignment complete",
        titleAr: "اكتمل التنازل",
        bodyEn: `${deal.reference} closed. Please rate your experience.`,
        bodyAr: `تمت الصفقة ${deal.reference}. من فضلك قيّم تجربتك.`,
        linkHref: `/deals/${deal.id}`,
      });
    }
    await audit({
      actorId: args.actorId,
      actorRole: args.actorRole,
      action: "DEAL_COMPLETED",
      entityType: "Deal",
      entityId: deal.id,
      after: { cashToSeller: deal.cashToSeller.toString(), platformFee: deal.platformFee.toString() },
    });
  }
  return outcome.milestone;
}

function assertMilestoneActor(ownerRole: Role, actorRole: Role) {
  if (actorRole === "ADMIN" || actorRole === ownerRole) return;
  throw new DealError(`Only the ${ownerRole.toLowerCase().replace(/_/g, " ")} owner may update this milestone`, "WRONG_MILESTONE_OWNER");
}

export async function blockMilestone(args: {
  dealId: string;
  key: MilestoneKey;
  actorId: string;
  actorRole: Role;
  reason: string;
}) {
  if (args.reason.trim().length < 5) throw new DealError("Provide a meaningful blocker", "INVALID_BLOCKER");
  const updated = await prisma.$transaction(async (tx) => {
    const milestone = await tx.milestone.findFirstOrThrow({ where: { dealId: args.dealId, key: args.key } });
    assertMilestoneActor(milestone.ownerRole, args.actorRole);
    if (!["IN_PROGRESS", "AT_RISK", "BLOCKED"].includes(milestone.status)) {
      throw new DealError("Only the active milestone can be blocked", "NOT_ACTIVE_MILESTONE");
    }
    return tx.milestone.update({ where: { id: milestone.id }, data: { status: "BLOCKED", blockedReason: args.reason.trim() } });
  });
  await audit({
    actorId: args.actorId,
    action: "MILESTONE_BLOCKED",
    entityType: "Milestone",
    entityId: updated.id,
    after: { reason: args.reason },
    metadata: { dealId: args.dealId },
  });
  return updated;
}

export async function postDealMessage(args: {
  dealId: string;
  senderId: string;
  actorRole: Role;
  body: string;
}) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: args.dealId } });
  const message = await prisma.message.create({ data: { dealId: args.dealId, senderId: args.senderId, body: args.body } });
  await audit({
    actorId: args.senderId,
    actorRole: args.actorRole,
    action: "DEAL_MESSAGE_POSTED",
    entityType: "Message",
    entityId: message.id,
    metadata: { dealId: deal.id },
  });
  const recipients = [deal.buyerId, deal.sellerId, deal.coordinatorId].filter(
    (id): id is string => Boolean(id) && id !== args.senderId,
  );
  for (const userId of recipients) {
    await notify({
      userId,
      type: "MESSAGE_RECEIVED",
      titleEn: `New message in ${deal.reference}`,
      titleAr: `رسالة جديدة في ${deal.reference}`,
      bodyEn: args.body.slice(0, 120),
      bodyAr: args.body.slice(0, 120),
      linkHref: `/deals/${args.dealId}`,
    });
  }
  return message;
}

export async function rateDeal(args: {
  dealId: string;
  actorId: string;
  rating: number;
  notes?: string;
}) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: args.dealId } });
  if (deal.status !== "COMPLETED") throw new DealError("A deal can be rated only after completion", "NOT_COMPLETED");
  if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
    throw new DealError("Rating must be between 1 and 5", "INVALID_RATING");
  }
  const isBuyer = deal.buyerId === args.actorId;
  const isSeller = deal.sellerId === args.actorId;
  if (!isBuyer && !isSeller) throw new DealError("Only a deal party may submit a rating", "NOT_DEAL_PARTY");
  return prisma.deal.update({
    where: { id: args.dealId },
    data: {
      ...(isBuyer ? { buyerRating: args.rating } : { sellerRating: args.rating }),
      outcomeNotes: args.notes ?? deal.outcomeNotes,
    },
  });
}
