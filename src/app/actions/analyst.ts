"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContractFieldKey, ValueSource } from "@prisma/client";
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

export async function promoteBuyerTier(input: {
  userId: string;
  tier: "BROWSER" | "VERIFIED" | "PRIORITY";
  note?: string;
}): Promise<AnalystResult> {
  try {
    const analyst = await requireRole("ANALYST", "ADMIN");
    const before = await prisma.buyerProfile.findUnique({ where: { userId: input.userId } });
    await prisma.buyerProfile.update({
      where: { userId: input.userId },
      data: {
        tier: input.tier,
        proofOfFundsVerifiedAt: input.tier === "PRIORITY" ? new Date() : null,
        proofOfFundsVerifiedBy: input.tier === "PRIORITY" ? analyst.id : null,
      },
    });
    await audit({
      actorId: analyst.id,
      actorRole: "ANALYST",
      action: "KYC_REVIEWED",
      entityType: "BuyerProfile",
      entityId: input.userId,
      before: { tier: before?.tier },
      after: { tier: input.tier },
      metadata: { note: input.note },
    });
    revalidatePath("/analyst/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
