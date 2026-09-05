"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ListingStatus, PolicySource, PolicyVerificationState, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, AuthorizationError } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/domain/audit-actions";
import { canTransition, checkPublishReadiness, transitionListing } from "@/lib/services/listings";
import { retryJob } from "@/lib/services/jobs";
import { retryPayment, reconcilePayment, recordPaymentException } from "@/lib/services/payments";

export type AdminResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function fail(err: unknown): AdminResult<never> {
  if (err instanceof AuthorizationError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

// ---------------------------------------------------------------------------
// 1. Listing Overrides & Analyst Reassignment
// ---------------------------------------------------------------------------

export async function adminOverrideListingStatus(input: {
  listingId: string;
  targetStatus: ListingStatus;
  reason: string;
}): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    if (!input.reason || input.reason.trim().length < 10) {
      return { ok: false, error: "An override reason of at least 10 characters is mandatory" };
    }

    const before = await prisma.listing.findUniqueOrThrow({
      where: { id: input.listingId },
      select: { id: true, status: true },
    });

    // An override is a shortcut through the state machine, not a hole in it.
    // Admins may move a file along a legal edge without waiting for the actor
    // who would normally do it — they may not invent an edge.
    if (!canTransition(before.status, input.targetStatus)) {
      return {
        ok: false,
        error: `Cannot move a listing from ${before.status} to ${input.targetStatus}`,
      };
    }

    // Publication is the one transition an override must never grant. The
    // publish gate is re-evaluated inside approveAndPublish precisely so that
    // nothing can talk the server into listing an unverified file; an admin
    // route around it would defeat the entire verification chain.
    if (input.targetStatus === "LISTED" && before.status === "VERIFIED") {
      const readiness = await checkPublishReadiness(input.listingId);
      if (!readiness.ready) {
        return {
          ok: false,
          error: `Publication is blocked by ${readiness.blockers.length} unmet condition(s): ${readiness.blockers
            .map((b) => b.code)
            .join(", ")}. Resolve them in the verification workbench and publish from there.`,
        };
      }
    }

    // transitionListing carries the compare-and-set guard, so two admins acting
    // at once cannot both claim the same transition.
    const updated = await transitionListing({
      listingId: input.listingId,
      to: input.targetStatus,
      actorId: user.id,
      actorRole: "ADMIN",
      reason: input.reason.trim(),
    });

    await audit({
      actorId: user.id,
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.ADMIN_OVERRIDE_LISTING_STATUS,
      entityType: "Listing",
      entityId: input.listingId,
      before: { status: before.status },
      after: { status: updated.status },
      metadata: {
        reason: input.reason.trim(),
        targetStatus: input.targetStatus,
        adminOverride: true,
      },
    });

    revalidatePath("/admin/listings");
    revalidatePath(`/admin/listings/${input.listingId}`);
    revalidatePath(`/analyst/listings/${input.listingId}`);
    revalidatePath("/opportunities");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function adminReassignAnalyst(input: {
  listingId: string;
  newAnalystId: string;
  reason: string;
}): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    if (!input.reason || input.reason.trim().length < 5) {
      return { ok: false, error: "A reassignment reason of at least 5 characters is required" };
    }

    const targetAnalyst = await prisma.user.findUnique({
      where: { id: input.newAnalystId },
      select: { id: true, roles: true },
    });
    if (!targetAnalyst || (!targetAnalyst.roles.includes("ANALYST") && !targetAnalyst.roles.includes("ADMIN"))) {
      return { ok: false, error: "Selected user does not have an Analyst or Admin role" };
    }

    const before = await prisma.listing.findUniqueOrThrow({
      where: { id: input.listingId },
      select: { id: true, assignedAnalystId: true },
    });

    await prisma.listing.update({
      where: { id: input.listingId },
      data: { assignedAnalystId: input.newAnalystId },
    });

    await audit({
      actorId: user.id,
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.ADMIN_REASSIGN_ANALYST,
      entityType: "Listing",
      entityId: input.listingId,
      before: { assignedAnalystId: before.assignedAnalystId },
      after: { assignedAnalystId: input.newAnalystId },
      metadata: {
        reason: input.reason.trim(),
        adminReassign: true,
      },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/analyst");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// 2. Policy Management with Version History
// ---------------------------------------------------------------------------

const adminPolicySchema = z.object({
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
  effectiveDate: z.string().optional(),
  source: z.enum(["OFFICIAL_LETTER", "DEVELOPER_PORTAL", "CONTRACT_ANNEX", "ANALYST_RESEARCH", "SYNTHETIC_BENCHMARK"]).default("ANALYST_RESEARCH"),
  verificationState: z.enum(["VERIFIED", "PENDING_CONFIRMATION", "SYNTHETIC"]).default("PENDING_CONFIRMATION"),
  changeReason: z.string().min(8, "A change reason of at least 8 characters is required for policy versioning"),
});

export async function adminSavePolicyWithHistory(input: unknown): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    const data = adminPolicySchema.parse(input);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.developerAssignmentPolicy.findUnique({
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
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : new Date(),
        source: data.source as PolicySource,
        verificationState: data.verificationState as PolicyVerificationState,
        updatedById: user.id,
      };

      if (existing) {
        // Find highest existing version number
        const lastVersion = await tx.developerPolicyVersion.findFirst({
          where: { policyId: existing.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (lastVersion?.version ?? 0) + 1;

        // Snapshot current state into DeveloperPolicyVersion before updating
        await tx.developerPolicyVersion.create({
          data: {
            developerId: data.developerId,
            policyId: existing.id,
            version: nextVersion,
            effectiveDate: existing.effectiveDate,
            assignmentAllowed: existing.assignmentAllowed,
            feeType: existing.feeType,
            feePercentBps: existing.feePercentBps,
            feeFixedAmount: existing.feeFixedAmount,
            feeBasis: existing.feeBasis,
            minPercentPaidBps: existing.minPercentPaidBps,
            minMonthsElapsed: existing.minMonthsElapsed,
            typicalNocDays: existing.typicalNocDays,
            waitingPeriodDays: existing.waitingPeriodDays,
            requiredDocuments: existing.requiredDocuments,
            conditionsEn: existing.conditionsEn,
            conditionsAr: existing.conditionsAr,
            source: existing.source,
            verificationState: existing.verificationState,
            changeReason: data.changeReason.trim(),
            createdById: user.id,
          },
        });

        // Update active policy
        const updated = await tx.developerAssignmentPolicy.update({
          where: { id: existing.id },
          data: payload,
        });

        await audit({
          actorId: user.id,
          actorRole: "ADMIN",
          action: AUDIT_ACTIONS.POLICY_UPDATED,
          entityType: "DeveloperAssignmentPolicy",
          entityId: updated.id,
          before: {
            feeType: existing.feeType,
            feePercentBps: existing.feePercentBps,
            assignmentAllowed: existing.assignmentAllowed,
            verificationState: existing.verificationState,
          },
          after: {
            feeType: updated.feeType,
            feePercentBps: updated.feePercentBps,
            assignmentAllowed: updated.assignmentAllowed,
            verificationState: updated.verificationState,
          },
          metadata: {
            changeReason: data.changeReason.trim(),
            versionArchived: nextVersion,
          },
        });
      } else {
        // Initial creation
        const created = await tx.developerAssignmentPolicy.create({
          data: { developerId: data.developerId, ...payload },
        });

        // Initial snapshot version 1
        await tx.developerPolicyVersion.create({
          data: {
            developerId: data.developerId,
            policyId: created.id,
            version: 1,
            effectiveDate: created.effectiveDate,
            assignmentAllowed: created.assignmentAllowed,
            feeType: created.feeType,
            feePercentBps: created.feePercentBps,
            feeFixedAmount: created.feeFixedAmount,
            feeBasis: created.feeBasis,
            minPercentPaidBps: created.minPercentPaidBps,
            minMonthsElapsed: created.minMonthsElapsed,
            typicalNocDays: created.typicalNocDays,
            waitingPeriodDays: created.waitingPeriodDays,
            requiredDocuments: created.requiredDocuments,
            conditionsEn: created.conditionsEn,
            conditionsAr: created.conditionsAr,
            source: created.source,
            verificationState: created.verificationState,
            changeReason: data.changeReason.trim(),
            createdById: user.id,
          },
        });

        await audit({
          actorId: user.id,
          actorRole: "ADMIN",
          action: AUDIT_ACTIONS.POLICY_UPDATED,
          entityType: "DeveloperAssignmentPolicy",
          entityId: created.id,
          after: {
            developerId: created.developerId,
            assignmentAllowed: created.assignmentAllowed,
          },
          metadata: {
            changeReason: data.changeReason.trim(),
            initialVersion: 1,
          },
        });
      }
    });

    revalidatePath("/admin/policies");
    revalidatePath("/analyst/policies");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// 3. Payment Operations
// ---------------------------------------------------------------------------

export async function adminRetryPaymentAction(input: {
  paymentId: string;
  dealId: string;
}): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    await retryPayment({
      paymentId: input.paymentId,
      dealId: input.dealId,
      actorId: user.id,
      actorRole: user.activeRole,
    });

    revalidatePath("/admin/payments");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function adminReconcilePaymentAction(paymentId: string): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    await reconcilePayment({
      paymentId,
      actorId: user.id,
      actorRole: user.activeRole,
    });

    revalidatePath("/admin/payments");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function adminRecordPaymentExceptionAction(input: {
  paymentId: string;
  dealId: string;
  reason: string;
  reference: string;
}): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    if (!input.reason || input.reason.trim().length < 10) {
      return { ok: false, error: "An exception justification of at least 10 characters is mandatory" };
    }
    if (!input.reference || input.reference.trim().length < 4) {
      return { ok: false, error: "A valid external bank or transaction reference is required" };
    }

    await recordPaymentException({
      paymentId: input.paymentId,
      dealId: input.dealId,
      reason: input.reason.trim(),
      reference: input.reference.trim(),
      actorId: user.id,
      actorRole: user.activeRole,
    });

    revalidatePath("/admin/payments");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// 3b. Identity disclosure
// ---------------------------------------------------------------------------

/**
 * Returns one user's national ID and phone in the clear.
 *
 * The users table never ships these values to the browser — masking that
 * happens in React is decoration, since the plaintext is sitting in the page
 * payload either way. Unmasking is therefore a server round-trip, and every
 * round-trip is a row in the audit trail naming the admin, the subject and the
 * stated reason.
 */
export async function adminRevealUserIdentity(input: {
  userId: string;
  reason: string;
}): Promise<AdminResult<{ nationalId: string | null; phone: string }>> {
  try {
    const user = await requireRole("ADMIN");
    if (!input.reason || input.reason.trim().length < 8) {
      return { ok: false, error: "A reason of at least 8 characters is required to reveal identity data" };
    }

    const target = await prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, nationalId: true, phone: true },
    });

    await audit({
      actorId: user.id,
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.USER_PII_REVEALED,
      entityType: "User",
      entityId: target.id,
      metadata: {
        reason: input.reason.trim(),
        fields: ["nationalId", "phone"],
      },
    });

    return { ok: true, data: { nationalId: target.nationalId, phone: target.phone } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// 4. Background Jobs Operations
// ---------------------------------------------------------------------------

export async function adminRetryJobAction(jobId: string): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    const job = await retryJob({
      jobId,
      actorId: user.id,
      actorRole: user.activeRole,
    });

    revalidatePath("/admin/jobs");
    // A retry that ran and failed again is not a successful operation. Report
    // the job's real post-run state so the console does not show green on a
    // job that is still broken.
    if (job.status === "DEAD" || job.status === "FAILED") {
      return { ok: false, error: `Retry failed: ${job.lastError ?? "the job did not complete"}` };
    }
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// 5. User Roles & Identity Operations
// ---------------------------------------------------------------------------

export async function adminUpdateUserRoleAction(input: {
  userId: string;
  role: Role;
  action: "ADD" | "REMOVE";
  reason: string;
}): Promise<AdminResult> {
  try {
    const user = await requireRole("ADMIN");
    if (!input.reason || input.reason.trim().length < 8) {
      return { ok: false, error: "A role change justification of at least 8 characters is required" };
    }

    const target = await prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, roles: true, email: true },
    });

    if (target.id === user.id && input.role === "ADMIN" && input.action === "REMOVE") {
      return { ok: false, error: "Cannot remove ADMIN role from yourself" };
    }

    let newRoles: Role[];
    if (input.action === "ADD") {
      newRoles = Array.from(new Set([...target.roles, input.role]));
    } else {
      newRoles = target.roles.filter((r) => r !== input.role);
    }

    if (newRoles.length === 0) {
      return { ok: false, error: "User must retain at least one role" };
    }

    const updated = await prisma.user.update({
      where: { id: input.userId },
      data: { roles: newRoles },
    });

    await audit({
      actorId: user.id,
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      entityType: "User",
      entityId: input.userId,
      before: { roles: target.roles },
      after: { roles: updated.roles },
      metadata: {
        reason: input.reason.trim(),
        roleChanged: input.role,
        operation: input.action,
      },
    });

    revalidatePath("/admin/users");
    revalidatePath("/analyst/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
