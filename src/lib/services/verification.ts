import "server-only";
import type { ContractFieldKey, ValueSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FIELD_KINDS } from "@/lib/domain/fields";
import { minAcceptableCash } from "@/lib/domain/calculators";
import { checkPublishReadiness, projectVerifiedReadModel, transitionListing } from "./listings";
import { computeVerificationScore } from "./verification-score";
import { reconcileListing } from "./reconciliation";
import { scanListingForFraudSignals } from "./fraud";
import { recomputeMatchesForListing } from "./matching";
import { notify } from "./notifications";

/**
 * Analyst actions. This module is the ONLY writer of `verified*` columns.
 * AI output never reaches a buyer without passing through here.
 */

export class VerificationError extends Error {
  constructor(message: string, readonly blockers?: unknown) {
    super(message);
    this.name = "VerificationError";
  }
}

/** Promote one source to the verified truth for one field. */
export async function verifyField(args: {
  listingId: string;
  key: ContractFieldKey;
  source: ValueSource;
  analystId: string;
  /** Required when source is ANALYST_OVERRIDE. */
  override?: { num?: string | null; date?: Date | null; text?: string | null; reason: string };
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: args.listingId },
    select: { contractId: true, status: true },
  });

  const field = await prisma.contractField.findUnique({
    where: { contractId_key: { contractId: listing.contractId, key: args.key } },
  });
  if (!field) throw new VerificationError(`No such field on this contract: ${args.key}`);

  let num: string | null = null;
  let date: Date | null = null;
  let text: string | null = null;

  if (args.source === "ANALYST_OVERRIDE") {
    if (!args.override?.reason || args.override.reason.trim().length < 8) {
      throw new VerificationError("An override requires a written reason of at least 8 characters");
    }
    num = args.override.num ?? null;
    date = args.override.date ?? null;
    text = args.override.text ?? null;
  } else {
    const picked = pickSource(field, args.source);
    if (!picked.present) {
      throw new VerificationError(`Source ${args.source} has no value for ${args.key}`);
    }
    num = picked.num;
    date = picked.date;
    text = picked.text;
  }

  const before = {
    verifiedNum: field.verifiedNum?.toString() ?? null,
    verifiedDate: field.verifiedDate?.toISOString() ?? null,
    verifiedText: field.verifiedText,
    verifiedSource: field.verifiedSource,
  };

  const updated = await prisma.contractField.update({
    where: { id: field.id },
    data: {
      verifiedNum: num,
      verifiedDate: date,
      verifiedText: text,
      verifiedSource: args.source,
      verifiedBy: args.analystId,
      verifiedAt: new Date(),
      overrideReason: args.source === "ANALYST_OVERRIDE" ? args.override!.reason : null,
      kind: field.kind ?? FIELD_KINDS[args.key],
    },
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: args.source === "ANALYST_OVERRIDE" ? "FIELD_OVERRIDDEN" : "FIELD_VERIFIED",
    entityType: "ContractField",
    entityId: field.id,
    before,
    after: {
      verifiedNum: updated.verifiedNum?.toString() ?? null,
      verifiedDate: updated.verifiedDate?.toISOString() ?? null,
      verifiedText: updated.verifiedText,
      verifiedSource: updated.verifiedSource,
    },
    metadata: { listingId: args.listingId, key: args.key, reason: args.override?.reason },
  });

  // INVARIANT (§2.1): the cash a seller may ask can never exceed the verified
  // amount paid. The moment that figure is verified, any higher asking cash is
  // brought down to it — the seller is never able to price above what they paid.
  if (args.key === "AMOUNT_PAID" && updated.verifiedNum) {
    const verifiedPaid = updated.verifiedNum.toString();
    const current = await prisma.listing.findUniqueOrThrow({
      where: { id: args.listingId },
      select: { askingCash: true, flexibilityPct: true },
    });
    if (current.askingCash && current.askingCash.gt(verifiedPaid)) {
      await prisma.listing.update({
        where: { id: args.listingId },
        data: {
          askingCash: verifiedPaid,
          minAcceptableCash: minAcceptableCash(verifiedPaid, current.flexibilityPct).toFixed(2),
        },
      });
      await audit({
        actorId: args.analystId,
        actorRole: "ANALYST",
        action: "LISTING_STATUS_CHANGED",
        entityType: "Listing",
        entityId: args.listingId,
        before: { askingCash: current.askingCash.toString() },
        after: { askingCash: verifiedPaid },
        metadata: { reason: "Asking cash capped at the verified amount paid (no-overprice invariant)" },
      });
    } else if (current.askingCash) {
      await prisma.listing.update({
        where: { id: args.listingId },
        data: {
          minAcceptableCash: minAcceptableCash(current.askingCash.toString(), current.flexibilityPct).toFixed(2),
        },
      });
    }
  }

  await computeVerificationScore(args.listingId);
  return updated;
}

/** Un-verify a field — removes the analyst signature without touching sources. */
export async function unverifyField(args: {
  listingId: string;
  key: ContractFieldKey;
  analystId: string;
  reason: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: args.listingId },
    select: { contractId: true },
  });
  const field = await prisma.contractField.findUniqueOrThrow({
    where: { contractId_key: { contractId: listing.contractId, key: args.key } },
  });

  const updated = await prisma.contractField.update({
    where: { id: field.id },
    data: {
      verifiedNum: null,
      verifiedDate: null,
      verifiedText: null,
      verifiedSource: null,
      verifiedBy: null,
      verifiedAt: null,
      overrideReason: null,
    },
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "FIELD_OVERRIDDEN",
    entityType: "ContractField",
    entityId: field.id,
    before: { verifiedSource: field.verifiedSource, verifiedNum: field.verifiedNum?.toString() ?? null },
    after: { verifiedSource: null },
    metadata: { listingId: args.listingId, key: args.key, reason: args.reason, unverified: true },
  });

  await computeVerificationScore(args.listingId);
  return updated;
}

export async function resolveDiscrepancy(args: {
  discrepancyId: string;
  analystId: string;
  resolution: string;
  /** Optional: promote a source at the same time. */
  resolveTo?: ValueSource;
  waive?: boolean;
}) {
  const d = await prisma.discrepancy.findUniqueOrThrow({ where: { id: args.discrepancyId } });
  if (args.resolution.trim().length < 8) {
    throw new VerificationError("A resolution note of at least 8 characters is required");
  }

  if (args.resolveTo) {
    await verifyField({
      listingId: d.listingId,
      key: d.fieldKey,
      source: args.resolveTo,
      analystId: args.analystId,
    });
  }

  const updated = await prisma.discrepancy.update({
    where: { id: d.id },
    data: {
      status: args.waive ? "WAIVED" : "RESOLVED",
      resolution: args.resolution,
      resolvedTo: args.resolveTo ?? null,
      resolvedBy: args.analystId,
      resolvedAt: new Date(),
    },
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "DISCREPANCY_RESOLVED",
    entityType: "Discrepancy",
    entityId: d.id,
    before: { status: d.status },
    after: { status: updated.status, resolvedTo: args.resolveTo ?? null },
    metadata: { listingId: d.listingId, resolution: args.resolution },
  });

  await computeVerificationScore(d.listingId);
  return updated;
}

export async function dispositionFraudSignal(args: {
  signalId: string;
  analystId: string;
  status: "DISMISSED" | "CONFIRMED" | "ESCALATED";
  note: string;
}) {
  if (args.note.trim().length < 8) {
    throw new VerificationError("A disposition note of at least 8 characters is required");
  }
  const signal = await prisma.fraudSignal.findUniqueOrThrow({ where: { id: args.signalId } });
  const updated = await prisma.fraudSignal.update({
    where: { id: args.signalId },
    data: {
      status: args.status,
      disposition: args.note,
      dispositionBy: args.analystId,
      dispositionAt: new Date(),
    },
  });
  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "FRAUD_SIGNAL_DISPOSITIONED",
    entityType: "FraudSignal",
    entityId: args.signalId,
    before: { status: signal.status },
    after: { status: args.status },
    metadata: { listingId: signal.listingId, note: args.note },
  });
  await computeVerificationScore(signal.listingId);
  return updated;
}

export async function reviewReceipt(args: {
  receiptId: string;
  analystId: string;
  decision: "VERIFY" | "REJECT" | "DUPLICATE";
  amount?: string;
  date?: Date;
  note?: string;
}) {
  const receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: args.receiptId } });
  const updated = await prisma.receipt.update({
    where: { id: args.receiptId },
    data:
      args.decision === "VERIFY"
        ? {
            status: "VERIFIED",
            verifiedAmount: args.amount ?? receipt.extractedAmount ?? receipt.declaredAmount,
            verifiedDate: args.date ?? receipt.extractedDate ?? receipt.declaredDate,
            verifiedBy: args.analystId,
            verifiedAt: new Date(),
          }
        : {
            status: args.decision === "DUPLICATE" ? "DUPLICATE" : "REJECTED",
            rejectionNote: args.note ?? null,
            verifiedBy: args.analystId,
            verifiedAt: new Date(),
          },
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: args.decision === "VERIFY" ? "RECEIPT_VERIFIED" : "RECEIPT_REJECTED",
    entityType: "Receipt",
    entityId: args.receiptId,
    before: { status: receipt.status, amount: receipt.verifiedAmount?.toString() ?? null },
    after: { status: updated.status, amount: updated.verifiedAmount?.toString() ?? null },
  });

  // New receipt evidence changes both the reconciliation and the fraud picture.
  const listing = await prisma.listing.findFirst({ where: { contractId: receipt.contractId } });
  if (listing) {
    await reconcileListing(listing.id);
    await scanListingForFraudSignals(listing.id);
    await computeVerificationScore(listing.id);
  }
  return updated;
}

export async function moderateMedia(args: {
  mediaId: string;
  analystId: string;
  status: "APPROVED" | "FLAGGED" | "REJECTED";
  note?: string;
}) {
  const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: args.mediaId } });
  const updated = await prisma.mediaAsset.update({
    where: { id: args.mediaId },
    data: { moderationStatus: args.status, moderationNote: args.note ?? null },
  });
  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "MEDIA_MODERATED",
    entityType: "MediaAsset",
    entityId: args.mediaId,
    before: { moderationStatus: before.moderationStatus },
    after: { moderationStatus: args.status },
    metadata: { listingId: before.listingId, note: args.note },
  });
  await computeVerificationScore(before.listingId);
  return updated;
}

export async function overrideValuation(args: {
  valuationId: string;
  analystId: string;
  low: string;
  mid: string;
  high: string;
  reason: string;
}) {
  if (args.reason.trim().length < 8) {
    throw new VerificationError("A valuation override requires a written reason");
  }
  const before = await prisma.valuation.findUniqueOrThrow({ where: { id: args.valuationId } });
  const updated = await prisma.valuation.update({
    where: { id: args.valuationId },
    data: {
      overrideLow: args.low,
      overrideMid: args.mid,
      overrideHigh: args.high,
      overrideReason: args.reason,
      overrideBy: args.analystId,
      overrideAt: new Date(),
    },
  });
  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "VALUATION_OVERRIDDEN",
    entityType: "Valuation",
    entityId: args.valuationId,
    before: { low: before.low.toString(), mid: before.mid.toString(), high: before.high.toString() },
    after: { low: args.low, mid: args.mid, high: args.high },
    metadata: { listingId: before.listingId, reason: args.reason },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * Approve and publish. Re-checks every publish precondition inside the write —
 * a stale UI can never talk the server into publishing an unverified listing.
 */
export async function approveAndPublish(args: { listingId: string; analystId: string; note?: string }) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: args.listingId } });

  // Sign off first, then re-check: the analyst signature is itself a precondition.
  await prisma.listing.update({
    where: { id: args.listingId },
    data: { humanVerifiedBy: args.analystId, humanVerifiedAt: new Date() },
  });

  const readiness = await checkPublishReadiness(args.listingId);
  if (!readiness.ready) {
    // Roll the signature back — this file is not publishable.
    await prisma.listing.update({
      where: { id: args.listingId },
      data: { humanVerifiedBy: listing.humanVerifiedBy, humanVerifiedAt: listing.humanVerifiedAt },
    });
    throw new VerificationError("Publish preconditions not met", readiness.blockers);
  }

  if (listing.status === "PENDING_REVIEW" || listing.status === "INFO_REQUESTED") {
    await transitionListing({
      listingId: args.listingId,
      to: "VERIFIED",
      actorId: args.analystId,
      actorRole: "ANALYST",
      reason: args.note,
    });
  }

  await projectVerifiedReadModel(args.listingId);

  const published = await transitionListing({
    listingId: args.listingId,
    to: "LISTED",
    actorId: args.analystId,
    actorRole: "ANALYST",
    data: { publishedAt: new Date(), infoRequestItems: undefined },
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "LISTING_PUBLISHED",
    entityType: "Listing",
    entityId: args.listingId,
    after: { publishedAt: published.publishedAt?.toISOString(), askingCash: published.askingCash?.toString() },
  });

  await computeVerificationScore(args.listingId);
  await recomputeMatchesForListing(args.listingId);

  await notify({
    userId: listing.sellerId,
    type: "LISTING_PUBLISHED",
    titleEn: "Your contract is live on the marketplace",
    titleAr: "عقدك متاح الآن في السوق",
    bodyEn: "Verified and published. Matched buyers can now see it and make offers.",
    bodyAr: "تم التوثيق والنشر. يمكن للمشترين المطابقين تقديم عروضهم الآن.",
    linkHref: `/seller/listings/${args.listingId}`,
  });

  // Tell the buyers this listing actually matches.
  const strong = await prisma.match.findMany({
    where: { listingId: args.listingId, score: { gte: 70 } },
    include: { listing: { select: { reference: true } } },
    take: 50,
  });
  for (const m of strong) {
    await notify({
      userId: m.buyerId,
      type: "NEW_MATCH",
      titleEn: "A new contract matches your profile",
      titleAr: "فرصة جديدة تطابق ملفك",
      bodyEn: `${m.listing.reference} scores ${m.score}/100 against your cash and installment capacity.`,
      bodyAr: `${m.listing.reference} بدرجة ${m.score}/100 مقابل قدرتك المالية.`,
      linkHref: `/opportunities/${args.listingId}`,
    });
  }

  return published;
}

export interface InfoRequestItem {
  code: string;
  labelEn: string;
  labelAr: string;
  detail?: string;
}

export async function requestInformation(args: {
  listingId: string;
  analystId: string;
  items: InfoRequestItem[];
  note?: string;
}) {
  if (args.items.length === 0) {
    throw new VerificationError("An information request must itemise exactly what is missing");
  }
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: args.listingId } });

  const updated = await transitionListing({
    listingId: args.listingId,
    to: "INFO_REQUESTED",
    actorId: args.analystId,
    actorRole: "ANALYST",
    data: { infoRequestItems: args.items as unknown as object, infoRequestedAt: new Date() },
    reason: args.note,
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "LISTING_INFO_REQUESTED",
    entityType: "Listing",
    entityId: args.listingId,
    after: { items: args.items } as never,
  });

  await notify({
    userId: listing.sellerId,
    type: "LISTING_INFO_REQUESTED",
    titleEn: `${args.items.length} item(s) needed to finish verifying your file`,
    titleAr: `${args.items.length} بند مطلوب لاستكمال توثيق ملفك`,
    bodyEn: args.items.map((i) => `• ${i.labelEn}`).join("\n"),
    bodyAr: args.items.map((i) => `• ${i.labelAr}`).join("\n"),
    linkHref: `/seller/listings/${args.listingId}`,
  });

  return updated;
}

export async function rejectListing(args: { listingId: string; analystId: string; reason: string }) {
  if (args.reason.trim().length < 12) {
    throw new VerificationError("A rejection requires a written reason of at least 12 characters");
  }
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: args.listingId } });

  const updated = await transitionListing({
    listingId: args.listingId,
    to: "REJECTED",
    actorId: args.analystId,
    actorRole: "ANALYST",
    data: { rejectedAt: new Date(), rejectionReason: args.reason },
  });

  await audit({
    actorId: args.analystId,
    actorRole: "ANALYST",
    action: "LISTING_REJECTED",
    entityType: "Listing",
    entityId: args.listingId,
    after: { reason: args.reason },
  });

  await notify({
    userId: listing.sellerId,
    type: "LISTING_REJECTED",
    titleEn: "We could not verify this contract",
    titleAr: "تعذّر توثيق هذا العقد",
    bodyEn: args.reason,
    bodyAr: args.reason,
    linkHref: `/seller/listings/${args.listingId}`,
  });

  return updated;
}

// ---------------------------------------------------------------------------

function pickSource(
  field: {
    declaredNum: unknown;
    declaredDate: Date | null;
    declaredText: string | null;
    extractedNum: unknown;
    extractedDate: Date | null;
    extractedText: string | null;
    receiptDerivedNum: unknown;
    receiptDerivedDate: Date | null;
    developerStatedNum: unknown;
    developerStatedDate: Date | null;
    developerStatedText: string | null;
  },
  source: ValueSource,
): { num: string | null; date: Date | null; text: string | null; present: boolean } {
  const s = (num: unknown, date: Date | null, text: string | null) => ({
    num: num == null ? null : String(num),
    date,
    text,
    present: num != null || date != null || text != null,
  });

  switch (source) {
    case "SELLER_DECLARED":
      return s(field.declaredNum, field.declaredDate, field.declaredText);
    case "AI_EXTRACTED":
      return s(field.extractedNum, field.extractedDate, field.extractedText);
    case "RECEIPT_VERIFIED":
      return s(field.receiptDerivedNum, field.receiptDerivedDate, null);
    case "DEVELOPER_CONFIRMED":
      return s(field.developerStatedNum, field.developerStatedDate, field.developerStatedText);
    default:
      return { num: null, date: null, text: null, present: false };
  }
}
