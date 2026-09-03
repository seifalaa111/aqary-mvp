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

/** Express interest: records confidentiality consent and unlocks the vault. */
export async function expressInterest(listingId: string): Promise<ActionResult> {
  try {
    const user = await requireRole("BUYER");
    await prisma.consent.create({
      data: {
        userId: user.id,
        type: "BUYER_CONFIDENTIALITY",
        granted: true,
        textVersion: "buyer-confidentiality-v1",
      },
    });
    await audit({
      actorId: user.id,
      actorRole: "BUYER",
      action: "CONSENT_RECORDED",
      entityType: "Listing",
      entityId: listingId,
      after: { type: "BUYER_CONFIDENTIALITY" },
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
  const consent = await prisma.consent.findFirst({
    where: { userId: user.id, type: "BUYER_CONFIDENTIALITY", granted: true },
  });
  void listingId;
  return Boolean(consent);
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
