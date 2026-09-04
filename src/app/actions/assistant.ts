"use server";

import { prisma } from "@/lib/db";
import { ai } from "@/lib/providers";
import { dealCorpus } from "@/lib/queries/opportunity";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { AssistantAnswer } from "@/lib/providers/types";

export type AssistantResult =
  | { ok: true; data: AssistantAnswer }
  | { ok: false; error: string };

/**
 * Deal Q&A. Retrieval is scoped to one listing's own verified documents — there
 * is no path here that can read another deal's file.
 */
export async function askAboutDeal(input: {
  listingId: string;
  question: string;
  locale: string;
}): Promise<AssistantResult> {
  const question = input.question.trim().slice(0, 500);
  if (question.length < 3) return { ok: false, error: "Ask a longer question" };

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, status: true, sellerId: true },
  });
  if (!listing) return { ok: false, error: "Listing not found" };

  const user = await getSessionUser();
  const publiclyVisible = ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"].includes(
    listing.status,
  );
  const privileged =
    user && (user.id === listing.sellerId || user.roles.includes("ANALYST") || user.roles.includes("ADMIN"));
  if (!publiclyVisible && !privileged) return { ok: false, error: "Not available" };

  const corpus = await dealCorpus(input.listingId, user);
  const answer = await ai().answerDealQuestion({
    listingId: input.listingId,
    question,
    corpus,
    locale: input.locale === "ar" ? "ar" : "en",
  });

  await audit({
    actorId: user?.id ?? null,
    action: "DOCUMENT_ACCESSED",
    entityType: "Listing",
    entityId: input.listingId,
    metadata: {
      channel: "deal-assistant",
      notStated: answer.notStated,
      citations: answer.citations.length,
    },
  });

  return { ok: true, data: answer };
}
