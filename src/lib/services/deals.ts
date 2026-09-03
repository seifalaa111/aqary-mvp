import "server-only";
import type { MilestoneKey, MilestoneStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit";
import { bps, money } from "@/lib/money";
import { buyerPlatformFee } from "@/lib/domain/calculators";
import { notify } from "./notifications";
import { transitionListing } from "./listings";

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
    ownerRole: "ANALYST",
    titleEn: "Developer NOC requested",
    titleAr: "طلب موافقة المطوّر",
    descriptionEn: "Aqary files the assignment request with the developer on the seller's behalf.",
    requiredDocuments: ["Assignment request form", "Buyer national ID", "Seller national ID"],
    slaDays: 7,
  },
  {
    key: "ASSIGNMENT_APPOINTMENT",
    order: 4,
    ownerRole: "ANALYST",
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
    ownerRole: "ANALYST",
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
  const offer = await prisma.offer.findUniqueOrThrow({
    where: { id: offerId },
    include: { listing: true },
  });

  const existing = await prisma.deal.findUnique({ where: { offerId } });
  if (existing) return existing;

  const listing = offer.listing;
  const platformFee = buyerPlatformFee(listing.totalContractPrice ?? 0);
  const assignFee = money(listing.developerAssignmentFee ?? 0);
  const cash = money(offer.amount);
  const deposit = bps(cash, config.RESERVATION_DEPOSIT_BPS);

  // Round-robin the least loaded analyst as coordinator.
  const analysts = await prisma.user.findMany({
    where: { roles: { has: "ANALYST" }, deletedAt: null },
    select: { id: true, _count: { select: { coordinatedDeals: true } } },
  });
  const coordinator = analysts.sort((a, b) => a._count.coordinatedDeals - b._count.coordinatedDeals)[0];

  const reference = `AQD-${listing.reference.replace(/^AQ-/, "")}`;

  const deal = await prisma.$transaction(async (tx) => {
    const d = await tx.deal.create({
      data: {
        reference,
        listingId: listing.id,
        offerId: offer.id,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        coordinatorId: coordinator?.id ?? null,
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
        body: `Deal room opened for ${listing.reference}. Cash to seller EGP ${cash.toFixed(0)}; Aqary success fee EGP ${platformFee.toFixed(0)} payable by the buyer on completion. Contact details stay masked until the reservation deposit clears.`,
      },
    });

    return d;
  });

  await transitionListing({
    listingId: listing.id,
    to: "RESERVED",
    actorId,
    reason: `Offer ${offer.id} accepted`,
  });

  await audit({
    actorId,
    action: "DEAL_CREATED",
    entityType: "Deal",
    entityId: deal.id,
    after: {
      reference,
      cashToSeller: cash.toFixed(2),
      platformFee: platformFee.toFixed(2),
      reservationDeposit: deposit.toFixed(2),
    },
    metadata: { listingId: listing.id, offerId },
  });

  for (const userId of [offer.buyerId, offer.sellerId]) {
    await notify({
      userId,
      type: "DEAL_CREATED",
      titleEn: `Deal room ${reference} is open`,
      titleAr: `غرفة الصفقة ${reference} مفتوحة`,
      bodyEn: "Milestones, documents and messaging for this assignment are now in one place.",
      bodyAr: "المراحل والمستندات والمراسلات في مكان واحد.",
      linkHref: `/deals/${deal.id}`,
    });
  }

  return deal;
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
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: args.dealId },
    include: { milestones: { orderBy: { order: "asc" } }, payments: true, listing: true },
  });
  if (deal.status !== "ACTIVE") throw new DealError("This deal is not active", "NOT_ACTIVE");

  const milestone = deal.milestones.find((m) => m.key === args.key);
  if (!milestone) throw new DealError("Unknown milestone", "NOT_FOUND");
  if (milestone.status === "COMPLETED") return milestone;

  const earlierOpen = deal.milestones.filter((m) => m.order < milestone.order && m.status !== "COMPLETED");
  if (earlierOpen.length > 0) {
    throw new DealError(
      `"${MILESTONES.find((s) => s.key === earlierOpen[0]!.key)?.titleEn}" must complete first`,
      "OUT_OF_ORDER",
    );
  }

  const spec = MILESTONES.find((s) => s.key === args.key)!;
  if (spec.requiresPayment) {
    const settled = deal.payments.find((p) => p.kind === spec.requiresPayment && p.status === "SUCCEEDED");
    if (!settled) {
      throw new DealError(
        `This milestone needs a settled ${spec.requiresPayment.replace(/_/g, " ").toLowerCase()} payment`,
        "PAYMENT_REQUIRED",
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.milestone.update({
      where: { id: milestone.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: args.actorId,
        notes: args.note ?? milestone.notes,
        blockedReason: null,
      },
    });

    const next = deal.milestones.find((x) => x.order === milestone.order + 1);
    if (next && next.status === "PENDING") {
      await tx.milestone.update({
        where: { id: next.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    if (args.key === "RESERVATION_DEPOSIT") {
      await tx.deal.update({ where: { id: deal.id }, data: { contactUnmasked: true } });
      await tx.message.create({
        data: {
          dealId: deal.id,
          isSystem: true,
          body: "Reservation deposit cleared. Contact details are now visible to both parties.",
        },
      });
    }

    return m;
  });

  await audit({
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "MILESTONE_ADVANCED",
    entityType: "Milestone",
    entityId: milestone.id,
    before: { status: milestone.status },
    after: { status: "COMPLETED" },
    metadata: { dealId: deal.id, key: args.key },
  });

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

  if (args.key === "ASSIGNMENT_REGISTERED") {
    await transitionListing({
      listingId: deal.listingId,
      to: "ASSIGNMENT_IN_PROGRESS",
      actorId: args.actorId,
    }).catch(() => undefined);
  }

  if (args.key === "COMPLETED") await completeDeal(deal.id, args.actorId);

  return updated;
}

export async function blockMilestone(args: {
  dealId: string;
  key: MilestoneKey;
  actorId: string;
  reason: string;
}) {
  const milestone = await prisma.milestone.findFirstOrThrow({
    where: { dealId: args.dealId, key: args.key },
  });
  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: { status: "BLOCKED", blockedReason: args.reason },
  });
  await audit({
    actorId: args.actorId,
    action: "MILESTONE_BLOCKED",
    entityType: "Milestone",
    entityId: milestone.id,
    after: { reason: args.reason },
    metadata: { dealId: args.dealId },
  });
  return updated;
}

async function completeDeal(dealId: string, actorId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  await prisma.deal.update({
    where: { id: dealId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await transitionListing({ listingId: deal.listingId, to: "COMPLETED", actorId }).catch(() => undefined);

  await audit({
    actorId,
    action: "DEAL_COMPLETED",
    entityType: "Deal",
    entityId: dealId,
    after: {
      cashToSeller: deal.cashToSeller.toString(),
      platformFee: deal.platformFee.toString(),
      completedAt: new Date().toISOString(),
    },
  });

  for (const userId of [deal.buyerId, deal.sellerId]) {
    await notify({
      userId,
      type: "DEAL_COMPLETED",
      titleEn: "Assignment complete",
      titleAr: "اكتمل التنازل",
      bodyEn: `${deal.reference} closed. Please rate your experience.`,
      bodyAr: `تمت الصفقة ${deal.reference}. من فضلك قيّم تجربتك.`,
      linkHref: `/deals/${dealId}`,
    });
  }
}

export async function postDealMessage(args: {
  dealId: string;
  senderId: string;
  body: string;
}) {
  const message = await prisma.message.create({
    data: { dealId: args.dealId, senderId: args.senderId, body: args.body },
  });
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: args.dealId } });
  const other = deal.buyerId === args.senderId ? deal.sellerId : deal.buyerId;
  await notify({
    userId: other,
    type: "MESSAGE_RECEIVED",
    titleEn: `New message in ${deal.reference}`,
    titleAr: `رسالة جديدة في ${deal.reference}`,
    bodyEn: args.body.slice(0, 120),
    bodyAr: args.body.slice(0, 120),
    linkHref: `/deals/${args.dealId}`,
  });
  return message;
}

export async function rateDeal(args: {
  dealId: string;
  actorId: string;
  rating: number;
  notes?: string;
}) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: args.dealId } });
  const isBuyer = deal.buyerId === args.actorId;
  return prisma.deal.update({
    where: { id: args.dealId },
    data: {
      ...(isBuyer ? { buyerRating: args.rating } : { sellerRating: args.rating }),
      outcomeNotes: args.notes ?? deal.outcomeNotes,
    },
  });
}
