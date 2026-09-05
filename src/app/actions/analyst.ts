"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContractFieldKey, Severity, ValueSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, AuthorizationError } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import {
  approveAndPublish,
  dispositionFraudSignal,
  moderateMedia,
  overrideValuation,
  rejectListing,
  requestInformation,
  resolveDiscrepancy,
  flagDiscrepancy,
  escalateListing,
  reviewReceipt,
  unverifyField,
  verifyField,
  VerificationError,
} from "@/lib/services/verification";
import { reconcileListing } from "@/lib/services/reconciliation";
import { scanListingForFraudSignals } from "@/lib/services/fraud";
import { computeValuation } from "@/lib/services/valuation";
import { checkPublishReadiness } from "@/lib/services/listings";
import { computeVerificationScore } from "@/lib/services/verification-score";

export type AnalystResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; blockers?: unknown };

function fail(err: unknown): AnalystResult<never> {
  if (err instanceof VerificationError) return { ok: false, error: err.message, blockers: err.blockers };
  if (err instanceof AuthorizationError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

const bump = (listingId: string) => {
  revalidatePath(`/analyst/listings/${listingId}`);
  revalidatePath("/analyst");
};

// ---------------------------------------------------------------------------

export async function claimListing(listingId: string): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await prisma.listing.update({ where: { id: listingId }, data: { assignedAnalystId: user.id } });
    await audit({
      actorId: user.id,
      actorRole: "ANALYST",
      action: "LISTING_STATUS_CHANGED",
      entityType: "Listing",
      entityId: listingId,
      after: { assignedAnalystId: user.id },
      metadata: { note: "Analyst claimed the file" },
    });
    bump(listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Promote one source to verified. The only path that writes a verified value. */
export async function promoteField(input: {
  listingId: string;
  key: ContractFieldKey;
  source: ValueSource;
  override?: { num?: string; date?: string; text?: string; reason: string };
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await verifyField({
      listingId: input.listingId,
      key: input.key,
      source: input.source,
      analystId: user.id,
      override: input.override
        ? {
            num: input.override.num ?? null,
            date: input.override.date ? new Date(input.override.date) : null,
            text: input.override.text ?? null,
            reason: input.override.reason,
          }
        : undefined,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectFieldValue(input: {
  listingId: string;
  key: ContractFieldKey;
  reason: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    if (input.reason.trim().length < 8) {
      return { ok: false, error: "Give a reason of at least 8 characters" };
    }
    await unverifyField({ ...input, analystId: user.id });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}


export async function flagDiscrepancyAction(input: {
  listingId: string;
  fieldKey: ContractFieldKey;
  sourceA: ValueSource;
  valueA?: string;
  valueAText?: string;
  sourceB: ValueSource;
  valueB?: string;
  valueBText?: string;
  severity: Severity;
  titleEn: string;
  titleAr?: string;
  notes?: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await flagDiscrepancy({
      listingId: input.listingId,
      fieldKey: input.fieldKey,
      analystId: user.id,
      sourceA: input.sourceA,
      valueA: input.valueA,
      valueAText: input.valueAText,
      sourceB: input.sourceB,
      valueB: input.valueB,
      valueBText: input.valueBText,
      severity: input.severity,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      notes: input.notes,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function escalateListingAction(input: {
  listingId: string;
  reason: string;
  urgency?: "HIGH" | "MEDIUM" | "LOW";
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await escalateListing({
      listingId: input.listingId,
      analystId: user.id,
      reason: input.reason,
      urgency: input.urgency,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reassignListingAction(input: {
  listingId: string;
  newAnalystId: string;
  reason?: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    const before = await prisma.listing.findUniqueOrThrow({
      where: { id: input.listingId },
      select: { assignedAnalystId: true },
    });
    await prisma.listing.update({
      where: { id: input.listingId },
      data: { assignedAnalystId: input.newAnalystId },
    });
    await audit({
      actorId: user.id,
      actorRole: user.activeRole,
      action: "LISTING_STATUS_CHANGED",
      entityType: "Listing",
      entityId: input.listingId,
      before: { assignedAnalystId: before.assignedAnalystId },
      after: { assignedAnalystId: input.newAnalystId },
      metadata: { reason: input.reason ?? "Reassigned by operational staff" },
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveDiscrepancyAction(input: {
  listingId: string;
  discrepancyId: string;
  resolution: string;
  resolveTo?: ValueSource;
  waive?: boolean;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await resolveDiscrepancy({
      discrepancyId: input.discrepancyId,
      analystId: user.id,
      resolution: input.resolution,
      resolveTo: input.resolveTo,
      waive: input.waive,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function dispositionSignal(input: {
  listingId: string;
  signalId: string;
  status: "DISMISSED" | "CONFIRMED" | "ESCALATED";
  note: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await dispositionFraudSignal({
      signalId: input.signalId,
      analystId: user.id,
      status: input.status,
      note: input.note,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewReceiptAction(input: {
  listingId: string;
  receiptId: string;
  decision: "VERIFY" | "REJECT" | "DUPLICATE";
  amount?: string;
  date?: string;
  note?: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await reviewReceipt({
      receiptId: input.receiptId,
      analystId: user.id,
      decision: input.decision,
      amount: input.amount,
      date: input.date ? new Date(input.date) : undefined,
      note: input.note,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function moderateMediaAction(input: {
  listingId: string;
  mediaId: string;
  status: "APPROVED" | "FLAGGED" | "REJECTED";
  note?: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await moderateMedia({ mediaId: input.mediaId, analystId: user.id, status: input.status, note: input.note });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function overrideValuationAction(input: {
  listingId: string;
  valuationId: string;
  low: string;
  mid: string;
  high: string;
  reason: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await overrideValuation({ ...input, analystId: user.id });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rerunAnalysis(listingId: string): Promise<AnalystResult> {
  try {
    await requireRole("ANALYST", "ADMIN");
    await reconcileListing(listingId);
    await scanListingForFraudSignals(listingId);
    await computeValuation(listingId);
    await computeVerificationScore(listingId);
    bump(listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function publishListing(input: {
  listingId: string;
  note?: string;
}): Promise<AnalystResult<{ status: string }>> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    const published = await approveAndPublish({
      listingId: input.listingId,
      analystId: user.id,
      note: input.note,
    });
    bump(input.listingId);
    revalidatePath("/opportunities");
    return { ok: true, data: { status: published.status } };
  } catch (err) {
    return fail(err);
  }
}

export async function requestInfoAction(input: {
  listingId: string;
  items: { code: string; labelEn: string; labelAr: string; detail?: string }[];
  note?: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await requestInformation({
      listingId: input.listingId,
      analystId: user.id,
      items: input.items,
      note: input.note,
    });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectListingAction(input: {
  listingId: string;
  reason: string;
}): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    await rejectListing({ listingId: input.listingId, analystId: user.id, reason: input.reason });
    bump(input.listingId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function readinessAction(listingId: string) {
  await requireRole("ANALYST", "ADMIN");
  return checkPublishReadiness(listingId);
}

// ---------------------------------------------------------------------------
// Developer policy library — full CRUD
// ---------------------------------------------------------------------------

const policySchema = z.object({
  developerId: z.string().min(1),
  assignmentAllowed: z.enum(["ALLOWED", "NOT_ALLOWED", "CONDITIONAL", "UNKNOWN"]),
  feeType: z.enum(["NONE", "PERCENT", "FIXED"]),
  feePercentBps: z.coerce.number().int().min(0).max(5000).optional(),
  feeFixedAmount: z.string().optional(),
  feeBasis: z.string().default("TOTAL_CONTRACT_PRICE"),
  minPercentPaidBps: z.coerce.number().int().min(0).max(10000).optional(),
  minMonthsElapsed: z.coerce.number().int().min(0).max(240).optional(),
  typicalNocDays: z.coerce.number().int().min(0).max(365).optional(),
  waitingPeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  requiredDocuments: z.array(z.string()).default([]),
  conditionsEn: z.string().optional(),
  conditionsAr: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
});

export async function savePolicy(input: unknown): Promise<AnalystResult> {
  try {
    const user = await requireRole("ANALYST", "ADMIN");
    const data = policySchema.parse(input);

    const before = await prisma.developerAssignmentPolicy.findUnique({
      where: { developerId: data.developerId },
    });

    const payload = {
      assignmentAllowed: data.assignmentAllowed,
      feeType: data.feeType,
      feePercentBps: data.feePercentBps ?? null,
      feeFixedAmount: data.feeFixedAmount || null,
      feeBasis: data.feeBasis,
      minPercentPaidBps: data.minPercentPaidBps ?? null,
      minMonthsElapsed: data.minMonthsElapsed ?? null,
      typicalNocDays: data.typicalNocDays ?? null,
      waitingPeriodDays: data.waitingPeriodDays ?? null,
      requiredDocuments: data.requiredDocuments.filter(Boolean),
      conditionsEn: data.conditionsEn || null,
      conditionsAr: data.conditionsAr || null,
      contactName: data.contactName || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
    };

    const saved = await prisma.developerAssignmentPolicy.upsert({
      where: { developerId: data.developerId },
      create: { developerId: data.developerId, ...payload },
      update: payload,
    });

    await audit({
      actorId: user.id,
      actorRole: "ANALYST",
      action: "POLICY_UPDATED",
      entityType: "DeveloperAssignmentPolicy",
      entityId: saved.id,
      before: before
        ? { feeType: before.feeType, feePercentBps: before.feePercentBps, assignmentAllowed: before.assignmentAllowed }
        : null,
      after: { feeType: saved.feeType, feePercentBps: saved.feePercentBps, assignmentAllowed: saved.assignmentAllowed },
    });

    revalidatePath("/analyst/policies");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewKyc(input: {
  userId: string;
  status: "VERIFIED" | "REJECTED" | "PENDING";
  note?: string;
}): Promise<AnalystResult> {
  try {
    const analyst = await requireRole("ANALYST", "ADMIN");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
    await prisma.user.update({ where: { id: input.userId }, data: { kycStatus: input.status } });

    // A verified buyer moves off the browser tier and can transact.
    if (input.status === "VERIFIED") {
      await prisma.buyerProfile.updateMany({
        where: { userId: input.userId, tier: "BROWSER" },
        data: { tier: "VERIFIED" },
      });
    } else if (input.status === "REJECTED") {
      // Rejection demotes buyer back to browser
      await prisma.buyerProfile.updateMany({
        where: { userId: input.userId },
        data: { tier: "BROWSER" },
      });
    }

    await audit({
      actorId: analyst.id,
      actorRole: "ANALYST",
      action: "KYC_REVIEWED",
      entityType: "User",
      entityId: input.userId,
      before: { kycStatus: before.kycStatus },
      after: { kycStatus: input.status },
      metadata: { note: input.note },
    });

    revalidatePath("/analyst/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewDocumentAction(input: {
  documentId: string;
  status: "APPROVED" | "REJECTED" | "NEEDS_REPLACEMENT";
  reason?: string;
}): Promise<AnalystResult> {
  try {
    const analyst = await requireRole("ANALYST", "ADMIN");
    if ((input.status === "REJECTED" || input.status === "NEEDS_REPLACEMENT") && (!input.reason || input.reason.trim().length < 8)) {
      throw new Error("A reason of at least 8 characters is required for rejection or replacement requests");
    }

    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: input.documentId },
      include: { owner: true },
    });

    const updated = await prisma.document.update({
      where: { id: input.documentId },
      data: {
        status: input.status,
        reviewedBy: analyst.id,
        reviewedAt: new Date(),
        rejectionReason: input.reason?.trim() ?? null,
      },
    });

    // Check if this document affects the user's KYC tier or verification
    const isIdentityDoc = ["NATIONAL_ID_FRONT", "NATIONAL_ID_BACK", "PASSPORT", "PROOF_OF_ADDRESS"].includes(doc.type);
    if (isIdentityDoc) {
      if (input.status === "APPROVED") {
        // Check if user now has both a verified ID and verified address
        const userDocs = await prisma.document.findMany({
          where: { ownerId: doc.ownerId, status: "APPROVED" },
          select: { type: true },
        });
        const hasId = userDocs.some((d) => d.type === "NATIONAL_ID_FRONT" || d.type === "PASSPORT");
        const hasAddress = userDocs.some((d) => d.type === "PROOF_OF_ADDRESS");

        if (hasId && hasAddress) {
          await prisma.user.update({
            where: { id: doc.ownerId },
            data: { kycStatus: "VERIFIED" },
          });
          await prisma.buyerProfile.updateMany({
            where: { userId: doc.ownerId, tier: "BROWSER" },
            data: { tier: "VERIFIED" },
          });
        }
      } else {
        // If an identity document is rejected or needs replacement, demote tier to BROWSER
        await prisma.user.update({
          where: { id: doc.ownerId },
          data: { kycStatus: "PENDING" },
        });
        await prisma.buyerProfile.updateMany({
          where: { userId: doc.ownerId },
          data: { tier: "BROWSER" },
        });
      }
    }

    await audit({
      actorId: analyst.id,
      actorRole: "ANALYST",
      action: "KYC_REVIEWED",
      entityType: "Document",
      entityId: doc.id,
      before: { status: doc.status },
      after: { status: updated.status, reason: input.reason },
      metadata: { ownerId: doc.ownerId, type: doc.type },
    });

    revalidatePath("/analyst/users");
    revalidatePath("/buyer/verification");
    revalidatePath("/buyer/documents");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function verifyProofOfFundsAction(input: {
  userId: string;
  verifiedCash: number;
  verifiedInstallment?: number;
  note?: string;
}): Promise<AnalystResult> {
  try {
    const analyst = await requireRole("ANALYST", "ADMIN");
    if (input.verifiedCash <= 0) {
      throw new Error("Verified cash amount must be greater than zero");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
    if (user.kycStatus !== "VERIFIED") {
      throw new Error("User identity KYC must be verified before granting Priority Tier");
    }

    const before = await prisma.buyerProfile.findUnique({ where: { userId: input.userId } });
    await prisma.buyerProfile.update({
      where: { userId: input.userId },
      data: {
        verifiedAvailableCash: input.verifiedCash.toString(),
        verifiedMaxInstallment: input.verifiedInstallment ? input.verifiedInstallment.toString() : null,
        tier: "PRIORITY",
        proofOfFundsVerifiedAt: new Date(),
        proofOfFundsVerifiedBy: analyst.id,
      },
    });

    // Mark user's proof of funds documents as APPROVED
    await prisma.document.updateMany({
      where: {
        ownerId: input.userId,
        type: { in: ["PROOF_OF_FUNDS", "BANK_TRANSFER_STATEMENT"] },
        status: { in: ["UPLOADED", "NEEDS_REPLACEMENT"] },
      },
      data: {
        status: "APPROVED",
        reviewedBy: analyst.id,
        reviewedAt: new Date(),
      },
    });

    await audit({
      actorId: analyst.id,
      actorRole: "ANALYST",
      action: "KYC_REVIEWED",
      entityType: "BuyerProfile",
      entityId: input.userId,
      before: { tier: before?.tier, cash: before?.verifiedAvailableCash?.toString() },
      after: { tier: "PRIORITY", cash: input.verifiedCash, installment: input.verifiedInstallment },
      metadata: { note: input.note },
    });

    revalidatePath("/analyst/users");
    revalidatePath("/buyer/capacity");
    revalidatePath("/buyer/verification");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function promoteBuyerTier(input: {
  userId: string;
  tier: "BROWSER" | "VERIFIED" | "PRIORITY";
  note?: string;
}): Promise<AnalystResult> {
  try {
    const analyst = await requireRole("ANALYST", "ADMIN");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
    const profile = await prisma.buyerProfile.findUnique({ where: { userId: input.userId } });

    if (input.tier === "VERIFIED" && user.kycStatus !== "VERIFIED") {
      throw new Error("Cannot promote to VERIFIED: User identity KYC must be verified first");
    }

    if (input.tier === "PRIORITY") {
      if (user.kycStatus !== "VERIFIED") {
        throw new Error("Cannot promote to PRIORITY: User identity KYC must be verified first");
      }
      if (!profile?.verifiedAvailableCash && !profile?.proofOfFundsVerifiedAt) {
        throw new Error("Cannot promote to PRIORITY: Verified proof of funds is required");
      }
    }

    const before = profile?.tier;
    await prisma.buyerProfile.update({
      where: { userId: input.userId },
      data: {
        tier: input.tier,
        proofOfFundsVerifiedAt: input.tier === "PRIORITY" ? (profile?.proofOfFundsVerifiedAt ?? new Date()) : null,
        proofOfFundsVerifiedBy: input.tier === "PRIORITY" ? (profile?.proofOfFundsVerifiedBy ?? analyst.id) : null,
      },
    });

    await audit({
      actorId: analyst.id,
      actorRole: "ANALYST",
      action: "KYC_REVIEWED",
      entityType: "BuyerProfile",
      entityId: input.userId,
      before: { tier: before },
      after: { tier: input.tier },
      metadata: { note: input.note },
    });

    revalidatePath("/analyst/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
