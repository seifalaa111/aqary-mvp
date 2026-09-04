import "server-only";
import { Decimal } from "decimal.js";
import type { ListingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { REQUIRED_VERIFIED_FIELDS, FIELD_LABELS } from "@/lib/domain/fields";
import {
  buildInstallmentSchedule,
  checkAskingCash,
  developerAssignmentFee,
  evaluateScheduleStatuses,
  minAcceptableCash,
  remainingInstallments,
  remainingTotal,
  sumReceipts,
  totalEffectiveCost,
  type Frequency,
} from "@/lib/domain/calculators";

/**
 * The listing state machine and the publish gate.
 * Transitions are enumerated, server-enforced and audited.
 */

const TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["AI_PROCESSING", "PENDING_REVIEW", "WITHDRAWN"],
  AI_PROCESSING: ["PENDING_REVIEW", "SUBMITTED"],
  PENDING_REVIEW: ["INFO_REQUESTED", "VERIFIED", "REJECTED"],
  INFO_REQUESTED: ["PENDING_REVIEW", "AI_PROCESSING", "WITHDRAWN", "EXPIRED"],
  VERIFIED: ["LISTED", "REJECTED", "WITHDRAWN"],
  LISTED: ["UNDER_OFFER", "WITHDRAWN", "EXPIRED"],
  UNDER_OFFER: ["LISTED", "RESERVED", "WITHDRAWN"],
  RESERVED: ["ASSIGNMENT_IN_PROGRESS", "LISTED", "WITHDRAWN"],
  ASSIGNMENT_IN_PROGRESS: ["COMPLETED", "LISTED", "WITHDRAWN"],
  COMPLETED: [],
  REJECTED: ["DRAFT"],
  WITHDRAWN: ["DRAFT"],
  EXPIRED: ["DRAFT"],
};

export class TransitionError extends Error {
  constructor(readonly from: ListingStatus, readonly to: ListingStatus) {
    super(`Cannot move a listing from ${from} to ${to}`);
    this.name = "TransitionError";
  }
}

export function canTransition(from: ListingStatus, to: ListingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionListing(args: {
  listingId: string;
  to: ListingStatus;
  actorId?: string | null;
  actorRole?: Prisma.AuditEventCreateInput["actorRole"];
  data?: Prisma.ListingUpdateInput;
  reason?: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: args.listingId } });
  if (listing.status === args.to) return listing;
  if (!canTransition(listing.status, args.to)) throw new TransitionError(listing.status, args.to);

  // Compare-and-set protects every caller (offers, expiry, publication and
  // completion) from overwriting a transition that won in another request.
  const changed = await prisma.listing.updateMany({
    where: { id: args.listingId, status: listing.status },
    data: { status: args.to, ...args.data },
  });
  if (changed.count !== 1) {
    const current = await prisma.listing.findUniqueOrThrow({ where: { id: args.listingId } });
    if (current.status === args.to) return current;
    throw new TransitionError(current.status, args.to);
  }
  const updated = await prisma.listing.findUniqueOrThrow({ where: { id: args.listingId } });

  await audit({
    actorId: args.actorId ?? null,
    actorRole: args.actorRole ?? null,
    action: "LISTING_STATUS_CHANGED",
    entityType: "Listing",
    entityId: args.listingId,
    before: { status: listing.status },
    after: { status: args.to },
    metadata: args.reason ? { reason: args.reason } : undefined,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// The publish gate
// ---------------------------------------------------------------------------

export interface PublishBlocker {
  code:
    | "NO_ANALYST_SIGNATURE"
    | "MISSING_VERIFIED_FIELD"
    | "OPEN_CRITICAL_DISCREPANCY"
    | "OPEN_CRITICAL_FRAUD_SIGNAL"
    | "INSUFFICIENT_IMAGES"
    | "NO_FLOOR_PLAN"
    | "NO_ASKING_CASH"
    | "ASKING_CASH_ABOVE_VERIFIED_PAID";
  messageEn: string;
  messageAr: string;
  detail?: string;
}

export interface PublishReadiness {
  ready: boolean;
  blockers: PublishBlocker[];
  approvedImageCount: number;
}

/**
 * Every precondition in §2.1. This function is the ONLY authority on whether a
 * listing may go live, and `publishListing` calls it again inside the write.
 */
export async function checkPublishReadiness(
  listingId: string,
  db: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<PublishReadiness> {
  const listing = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      media: true,
      discrepancies: { where: { status: "OPEN" } },
      fraudSignals: { where: { status: { in: ["OPEN", "ESCALATED"] } } },
      contract: { include: { fields: true } },
    },
  });

  const blockers: PublishBlocker[] = [];

  if (!listing.humanVerifiedBy || !listing.humanVerifiedAt) {
    blockers.push({
      code: "NO_ANALYST_SIGNATURE",
      messageEn: "No analyst has signed off on this file",
      messageAr: "لم يعتمد أي محلل هذا الملف",
    });
  }

  for (const key of REQUIRED_VERIFIED_FIELDS) {
    const f = listing.contract.fields.find((x) => x.key === key);
    const verified =
      f?.verifiedSource != null &&
      (f.verifiedNum !== null || f.verifiedDate !== null || f.verifiedText !== null);
    if (!verified) {
      blockers.push({
        code: "MISSING_VERIFIED_FIELD",
        messageEn: `${FIELD_LABELS[key].en} has no verified value`,
        messageAr: `${FIELD_LABELS[key].ar} بدون قيمة موثّقة`,
        detail: key,
      });
    }
  }

  const criticalDiscrepancies = listing.discrepancies.filter((d) => d.severity === "CRITICAL");
  for (const d of criticalDiscrepancies) {
    blockers.push({
      code: "OPEN_CRITICAL_DISCREPANCY",
      messageEn: `Unresolved critical discrepancy: ${d.titleEn}`,
      messageAr: `تباين حرج لم يُحل: ${d.titleAr ?? d.titleEn}`,
      detail: d.id,
    });
  }

  const criticalSignals = listing.fraudSignals.filter((s) => s.severity === "CRITICAL");
  for (const s of criticalSignals) {
    blockers.push({
      code: "OPEN_CRITICAL_FRAUD_SIGNAL",
      messageEn: `Critical fraud signal awaiting disposition: ${s.titleEn}`,
      messageAr: `مؤشر اشتباه حرج بانتظار القرار: ${s.titleAr ?? s.titleEn}`,
      detail: s.id,
    });
  }

  // Show-unit photography counts: it is a real photograph, labelled for what it
  // is. Floor plans and master plans do not — they are documents, not a gallery.
  const approvedImages = listing.media.filter(
    (m) =>
      m.moderationStatus === "APPROVED" &&
      (m.kind === "PHOTO" || m.kind === "SHOW_UNIT" || m.kind === "RENDER" || m.kind === "PROGRESS"),
  );
  if (approvedImages.length < config.MIN_APPROVED_IMAGES) {
    blockers.push({
      code: "INSUFFICIENT_IMAGES",
      messageEn: `${approvedImages.length} approved images — ${config.MIN_APPROVED_IMAGES} are required`,
      messageAr: `${approvedImages.length} صورة معتمدة — المطلوب ${config.MIN_APPROVED_IMAGES}`,
    });
  }

  if (!listing.media.some((m) => m.kind === "FLOOR_PLAN" && m.moderationStatus === "APPROVED")) {
    blockers.push({
      code: "NO_FLOOR_PLAN",
      messageEn: "The unit floor plan is required before publishing",
      messageAr: "مخطط الوحدة مطلوب قبل النشر",
    });
  }

  const verifiedPaid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID");
  const verifiedPaidNum =
    verifiedPaid?.verifiedSource != null && verifiedPaid.verifiedNum != null
      ? new Decimal(verifiedPaid.verifiedNum.toString())
      : null;

  if (listing.askingCash == null) {
    blockers.push({
      code: "NO_ASKING_CASH",
      messageEn: "The seller has not set their asking cash",
      messageAr: "لم يحدد البائع المبلغ المطلوب",
    });
  } else if (verifiedPaidNum) {
    const check = checkAskingCash(listing.askingCash.toString(), verifiedPaidNum);
    if (!check.ok) {
      blockers.push({
        code: "ASKING_CASH_ABOVE_VERIFIED_PAID",
        messageEn: `Asking cash EGP ${listing.askingCash.toString()} exceeds the verified amount paid EGP ${verifiedPaidNum.toFixed(0)}`,
        messageAr: "المبلغ المطلوب يتجاوز المبلغ الموثّق المدفوع",
      });
    }
  }

  return { ready: blockers.length === 0, blockers, approvedImageCount: approvedImages.length };
}

/**
 * Projects the verified values onto the listing's buyer-facing read model.
 * Reads ONLY `verified*` columns — a field with no analyst signature stays null
 * and renders as "pending" rather than being guessed.
 */
export async function projectVerifiedReadModel(
  listingId: string,
  db: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const listing = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      contract: {
        include: {
          fields: true,
          unit: { include: { project: { include: { developer: { include: { policy: true } } } } } },
        },
      },
    },
  });

  const fields = listing.contract.fields;

  const num =(key: (typeof REQUIRED_VERIFIED_FIELDS)[number] | "DOWN_PAYMENT" | "NUMBER_OF_INSTALLMENTS" | "ASSIGNMENT_FEE" | "MAINTENANCE_DEPOSIT" | "CLUB_FEE") => {
    const f = fields.find((x) => x.key === key);
    return f?.verifiedSource != null && f.verifiedNum != null ? new Decimal(f.verifiedNum.toString()) : null;
  };
  const date = (key: "DELIVERY_DATE" | "NEXT_DUE_DATE" | "PLAN_START_DATE" | "CONTRACT_SIGNING_DATE") => {
    const f = fields.find((x) => x.key === key);
    return f?.verifiedSource != null ? f.verifiedDate : null;
  };
  const text = (key: "INSTALLMENT_FREQUENCY") => {
    const f = fields.find((x) => x.key === key);
    return f?.verifiedSource != null ? f.verifiedText : null;
  };

  const totalPrice = num("TOTAL_PRICE");
  const amountPaid = num("AMOUNT_PAID");
  const outstandingRaw =
    num("OUTSTANDING_BALANCE") ?? (totalPrice && amountPaid ? totalPrice.minus(amountPaid) : null);
  // A contract cannot owe less than nothing. If the verified figures imply it,
  // the reconciliation has already raised an arithmetic impossibility for an
  // analyst; the buyer-facing read model must not render a negative balance.
  const outstanding = outstandingRaw ? Decimal.max(outstandingRaw, 0) : null;
  const instAmount = num("INSTALLMENT_AMOUNT");
  const freq = (text("INSTALLMENT_FREQUENCY") ?? null) as Frequency | null;
  const delivery = date("DELIVERY_DATE");
  const planStart = date("PLAN_START_DATE") ?? date("CONTRACT_SIGNING_DATE");
  const count = num("NUMBER_OF_INSTALLMENTS");

  const policy = listing.contract.unit.project.developer.policy;
  const assignFee = num("ASSIGNMENT_FEE") ??
    (totalPrice
      ? developerAssignmentFee(
          policy
            ? {
                feeType: policy.feeType,
                feePercentBps: policy.feePercentBps,
                feeFixedAmount: policy.feeFixedAmount?.toString(),
                feeBasis: policy.feeBasis,
              }
            : null,
          { totalContractPrice: totalPrice, outstandingBalance: outstanding ?? 0 },
        )
      : null);

  // Rebuild the verified schedule so remaining installments and next due date
  // are computed, never typed.
  let remainingCount: number | null = null;
  let nextDue: Date | null = date("NEXT_DUE_DATE");
  let remainingSum: Decimal | null = null;

  if (totalPrice && planStart && freq && count) {
    const rows = buildInstallmentSchedule({
      totalPrice,
      downPayment: num("DOWN_PAYMENT") ?? 0,
      planStart,
      frequency: freq,
      numberOfInstallments: count.toNumber(),
      installmentAmount: instAmount ?? undefined,
    });
    const now = new Date();
    const verifiedReceipts = await db.receipt.findMany({
      where: { contractId: listing.contractId, status: "VERIFIED" },
      select: { verifiedAmount: true },
    });
    const receiptsTotal = sumReceipts(verifiedReceipts.map((r) => r.verifiedAmount ?? 0));

    const evaluated = evaluateScheduleStatuses(rows, {
      verifiedAmountPaid: amountPaid,
      verifiedReceiptsTotal: receiptsTotal,
      asOf: now,
    });

    const unpaidRows = evaluated.filter((r) => r.status !== "PAID");
    remainingCount = unpaidRows.length;
    remainingSum = unpaidRows.reduce((acc, r) => acc.plus(r.amount), money(0));
    const nextDueRow = unpaidRows.find((r) => r.status === "DUE" || r.dueDate >= now) ?? unpaidRows[0];
    nextDue = nextDueRow?.dueDate ?? nextDue;

    // Persist the verified schedule so the buyer-facing table is real rows.
    await db.installment.deleteMany({
      where: { contractId: listing.contractId, source: "ANALYST_VERIFIED" },
    });
    await db.installment.createMany({
      data: evaluated.map((r) => ({
        contractId: listing.contractId,
        sequence: r.sequence,
        kind: r.kind,
        dueDate: r.dueDate,
        amount: r.amount.toFixed(2),
        status: r.status,
        paidAmount: r.paidAmount.toFixed(2),
        runningBalance: r.runningBalance.toFixed(2),
        source: "ANALYST_VERIFIED" as const,
        label: r.label ?? null,
      })),
    });
  }

  // Discount vs. buying the same unit from the developer today.
  const devToday = listing.contract.unit.currentDeveloperPrice
    ? new Decimal(listing.contract.unit.currentDeveloperPrice.toString())
    : null;
  let discountBps: number | null = null;
  if (devToday && listing.askingCash && totalPrice && remainingSum) {
    const cost = totalEffectiveCost({
      cashToSeller: listing.askingCash.toString(),
      totalContractPrice: totalPrice,
      developerAssignmentFee: assignFee ?? 0,
      maintenanceAndClubDues: (num("MAINTENANCE_DEPOSIT") ?? money(0)).plus(num("CLUB_FEE") ?? money(0)),
      remainingInstallmentsTotal: remainingSum,
      // Arrears are cash the buyer settles at assignment and every display path
      // counts them, so the stored discount is computed on them too.
      arrears: listing.contract.hasArrears ? listing.contract.arrearsAmount?.toString() ?? 0 : 0,
      currentDeveloperPrice: devToday,
    });
    discountBps = cost.savingPctBps;
  }

  return db.listing.update({
    where: { id: listingId },
    data: {
      totalContractPrice: totalPrice?.toFixed(2) ?? null,
      verifiedAmountPaid: amountPaid?.toFixed(2) ?? null,
      outstandingBalance: outstanding?.toFixed(2) ?? null,
      installmentAmount: instAmount?.toFixed(2) ?? null,
      installmentFrequency: freq,
      remainingInstallments: remainingCount,
      nextDueDate: nextDue,
      deliveryDate: delivery,
      developerAssignmentFee: assignFee?.toFixed(2) ?? null,
      discountPctBps: discountBps,
      minAcceptableCash: listing.askingCash
        ? minAcceptableCash(listing.askingCash.toString(), listing.flexibilityPct).toFixed(2)
        : null,
    },
  });
}
