"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AuthorizationError, requireBuyerTier, requireRole, requireUser } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { recomputeMatchesForBuyer } from "@/lib/services/matching";
import { createOffer, OfferError } from "@/lib/services/offers";
import { money } from "@/lib/money";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

function fail(err: unknown): ActionResult {
  if (err instanceof OfferError) return { ok: false, error: err.message, code: err.code };
  if (err instanceof AuthorizationError) return { ok: false, error: err.message, code: err.code };
  if (err instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, error: "Please check the highlighted fields", fieldErrors };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

// ---------------------------------------------------------------------------

export async function toggleSaveListing(listingId: string): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const user = await requireUser();
    const existing = await prisma.savedListing.findUnique({
      where: { buyerId_listingId: { buyerId: user.id, listingId } },
    });
    if (existing) {
      await prisma.savedListing.delete({ where: { id: existing.id } });
      revalidatePath("/opportunities");
      return { ok: true, data: { saved: false } };
    }
    await prisma.savedListing.create({ data: { buyerId: user.id, listingId } });
    revalidatePath("/opportunities");
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return fail(err) as ActionResult<{ saved: boolean }>;
  }
}

const profileSchema = z.object({
  availableCash: z.coerce.number().positive("Enter the cash you have available"),
  maxInstallment: z.coerce.number().positive("Enter an installment you can carry"),
  installmentFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
  incomeRange: z.string().min(1),
  employmentType: z.string().min(1),
  purchasePurpose: z.string().min(1),
  readiness: z.string().min(1),
  prefCities: z.array(z.string()).default([]),
  prefUnitTypes: z.array(z.string()).default([]),
  prefDeveloperIds: z.array(z.string()).default([]),
  prefBedroomsMin: z.coerce.number().int().min(0).max(10).optional(),
  prefBuaMin: z.coerce.number().int().min(0).max(2000).optional(),
  prefDeliveryByYear: z.coerce.number().int().min(2025).max(2040).optional(),
  freeTextPriorities: z.string().max(1000).optional(),
});

export async function saveBuyerProfile(input: unknown): Promise<ActionResult<{ matchCount: number }>> {
  try {
    const user = await requireRole("BUYER");
    const data = profileSchema.parse(input);

    await prisma.buyerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...data,
        prefUnitTypes: data.prefUnitTypes as never[],
        availableCash: data.availableCash.toString(),
        maxInstallment: data.maxInstallment.toString(),
        onboardingCompletedAt: new Date(),
      },
      update: {
        ...data,
        prefUnitTypes: data.prefUnitTypes as never[],
        availableCash: data.availableCash.toString(),
        maxInstallment: data.maxInstallment.toString(),
        onboardingCompletedAt: new Date(),
      },
    });

    const matchCount = await recomputeMatchesForBuyer(user.id);
    await audit({
      actorId: user.id,
      actorRole: "BUYER",
      action: "USER_ROLE_ADDED",
      entityType: "BuyerProfile",
      entityId: user.id,
      after: { availableCash: data.availableCash, maxInstallment: data.maxInstallment },
      metadata: { note: "Financial profile saved; matches recomputed" },
    });

    revalidatePath("/opportunities");
    return { ok: true, data: { matchCount } };
  } catch (err) {
    return fail(err) as ActionResult<{ matchCount: number }>;
  }
}

const offerSchema = z.object({
  listingId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an offer amount"),
  message: z.string().max(2000).optional(),
  proposedCompletionDays: z.coerce.number().int().min(7).max(180).default(45),
});

export async function submitOffer(input: unknown): Promise<ActionResult<{ offerId: string }>> {
  try {
    const { user } = await requireBuyerTier("VERIFIED");
    const data = offerSchema.parse(input);

    const offer = await createOffer({
      listingId: data.listingId,
      buyerId: user.id,
      amount: money(data.amount).toFixed(2),
      message: data.message,
      proposedCompletionDays: data.proposedCompletionDays,
    });

    revalidatePath(`/opportunities/${data.listingId}`);
    revalidatePath("/buyer/offers");
    return { ok: true, data: { offerId: offer.id } };
  } catch (err) {
    return fail(err) as ActionResult<{ offerId: string }>;
  }
}

/** Express interest: records confidentiality consent bound to this specific listing. */
export async function expressInterest(listingId: string): Promise<ActionResult> {
  try {
    const user = await requireRole("BUYER");
    await prisma.consent.upsert({
      where: {
        userId_listingId_type: {
          userId: user.id,
          listingId,
          type: "BUYER_CONFIDENTIALITY",
        },
      },
      create: {
        userId: user.id,
        listingId,
        type: "BUYER_CONFIDENTIALITY",
        granted: true,
        textVersion: "buyer-confidentiality-v1",
      },
      update: {
        granted: true,
      },
    });
    await audit({
      actorId: user.id,
      actorRole: "BUYER",
      action: "CONSENT_RECORDED",
      entityType: "Listing",
      entityId: listingId,
      after: { type: "BUYER_CONFIDENTIALITY", listingId },
    });
    revalidatePath(`/opportunities/${listingId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function hasExpressedInterest(listingId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const consent = await prisma.consent.findUnique({
    where: {
      userId_listingId_type: {
        userId: user.id,
        listingId,
        type: "BUYER_CONFIDENTIALITY",
      },
    },
  });
  return Boolean(consent && consent.granted);
}

export async function deleteKycDocumentAction(documentId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });
    if (doc.ownerId !== user.id) {
      throw new AuthorizationError("Not your document", "NOT_OWNER");
    }
    if (doc.status === "APPROVED") {
      throw new Error("Approved documents cannot be deleted. Contact support or compliance.");
    }
    await prisma.document.delete({ where: { id: documentId } });
    await audit({
      actorId: user.id,
      actorRole: user.activeRole,
      action: "DOCUMENT_DELETED",
      entityType: "Document",
      entityId: documentId,
      before: { type: doc.type, fileName: doc.fileName },
    });
    revalidatePath("/buyer/verification");
    revalidatePath("/buyer/documents");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCapacityAction(input: {
  availableCash: number;
  maxInstallment: number;
}): Promise<ActionResult> {
  try {
    const user = await requireRole("BUYER");
    if (input.availableCash <= 0 || input.maxInstallment <= 0) {
      throw new Error("Amounts must be greater than zero");
    }
    await prisma.buyerProfile.update({
      where: { userId: user.id },
      data: {
        availableCash: input.availableCash.toString(),
        maxInstallment: input.maxInstallment.toString(),
      },
    });
    await recomputeMatchesForBuyer(user.id);
    await audit({
      actorId: user.id,
      actorRole: "BUYER",
      action: "PROFILE_UPDATED",
      entityType: "BuyerProfile",
      entityId: user.id,
      after: { availableCash: input.availableCash, maxInstallment: input.maxInstallment },
    });
    revalidatePath("/buyer/capacity");
    revalidatePath("/buyer/matches");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveSearch(input: {
  name: string;
  filters: Record<string, unknown>;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireRole("BUYER");
    const created = await prisma.savedSearch.create({
      data: { buyerId: user.id, name: input.name.slice(0, 80), filters: input.filters as never },
    });
    revalidatePath("/buyer/searches");
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    return fail(err) as ActionResult<{ id: string }>;
  }
}

export async function deleteSavedSearch(id: string): Promise<ActionResult> {
  try {
    const user = await requireRole("BUYER");
    await prisma.savedSearch.deleteMany({ where: { id, buyerId: user.id } });
    revalidatePath("/buyer/searches");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Increments a listing's view counter.
 *
 * Deliberately unauthenticated and deliberately not a render side effect: it is
 * called once from the client after the opportunity page mounts. Only
 * publicly-visible listings are countable, so the counter cannot be used to
 * probe whether a private or unpublished listing id exists.
 */
export async function recordListingView(listingId: string): Promise<void> {
  await prisma.listing.updateMany({
    where: {
      id: listingId,
      isPrivate: false,
      status: { in: ["LISTED", "UNDER_OFFER"] },
    },
    data: { viewCount: { increment: 1 } },
  });
}
