"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MilestoneKey, PaymentKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AuthorizationError, requireDealAccess } from "@/lib/auth/guard";
import { completeMilestone, DealError, postDealMessage, rateDeal, blockMilestone } from "@/lib/services/deals";
import { handlePaymentCallback, initiatePayment, PaymentError, retryPayment } from "@/lib/services/payments";
import { runDueJobs } from "@/lib/services/jobs";

export type DealResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(err: unknown): DealResult<never> {
  if (err instanceof DealError || err instanceof PaymentError) return { ok: false, error: err.message };
  if (err instanceof AuthorizationError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

export async function advanceMilestone(input: {
  dealId: string;
  key: MilestoneKey;
  note?: string;
}): Promise<DealResult> {
  try {
    const { user, party } = await requireDealAccess(input.dealId);
    await completeMilestone({
      dealId: input.dealId,
      key: input.key,
      actorId: user.id,
      actorRole: party === "BUYER" ? "BUYER" : party === "SELLER" ? "SELLER" : "ANALYST",
      note: input.note,
    });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function flagMilestone(input: {
  dealId: string;
  key: MilestoneKey;
  reason: string;
}): Promise<DealResult> {
  try {
    const { user } = await requireDealAccess(input.dealId);
    if (input.reason.trim().length < 5) return { ok: false, error: "Say what is blocking it" };
    await blockMilestone({ dealId: input.dealId, key: input.key, actorId: user.id, reason: input.reason });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Starts a payment. The provider decides the outcome; the application does the
 * rest for real. `simulate` exists so the demo can drive both paths on purpose.
 */
export async function payNow(input: {
  dealId: string;
  kind: PaymentKind;
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}): Promise<DealResult<{ paymentId: string; status: string }>> {
  try {
    const { user } = await requireDealAccess(input.dealId);
    const payment = await initiatePayment({
      dealId: input.dealId,
      kind: input.kind,
      actorId: user.id,
      simulate: input.simulate,
    });

    // The PSP callback is a queued job. Run whatever is due so the deal room
    // reflects the settled state rather than spinning.
    await new Promise((r) => setTimeout(r, 1300));
    await runDueJobs(5);

    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true, data: { paymentId: after.id, status: after.status } };
  } catch (err) {
    return fail(err) as DealResult<{ paymentId: string; status: string }>;
  }
}

export async function retryFailedPayment(input: {
  dealId: string;
  paymentId: string;
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}): Promise<DealResult<{ status: string }>> {
  try {
    const { user } = await requireDealAccess(input.dealId);
    const retried = await retryPayment({
      paymentId: input.paymentId,
      actorId: user.id,
      simulate: input.simulate,
    });
    await new Promise((r) => setTimeout(r, 1300));
    await runDueJobs(5);
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: retried.id } });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true, data: { status: after.status } };
  } catch (err) {
    return fail(err) as DealResult<{ status: string }>;
  }
}

/** Forces the pending callback through, for a payment left in PROCESSING. */
export async function settlePayment(input: { dealId: string; paymentId: string }): Promise<DealResult> {
  try {
    await requireDealAccess(input.dealId);
    await handlePaymentCallback(input.paymentId);
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function sendDealMessage(input: { dealId: string; body: string }): Promise<DealResult> {
  try {
    const { user } = await requireDealAccess(input.dealId);
    const body = input.body.trim().slice(0, 4000);
    if (body.length === 0) return { ok: false, error: "Write something first" };
    await postDealMessage({ dealId: input.dealId, senderId: user.id, body });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rate(input: {
  dealId: string;
  rating: number;
  notes?: string;
}): Promise<DealResult> {
  try {
    const { user } = await requireDealAccess(input.dealId);
    await rateDeal({ dealId: input.dealId, actorId: user.id, rating: input.rating, notes: input.notes });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
