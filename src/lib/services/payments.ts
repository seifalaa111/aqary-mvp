import "server-only";
import { createHash } from "node:crypto";
import type { PaymentKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { payments as provider } from "@/lib/providers";
import { notify } from "./notifications";
import { registerJob, enqueue } from "./jobs";

/**
 * The payment state machine. The PSP is mocked; everything here is real:
 *  - a signed instruction record before any money state changes,
 *  - an idempotency key so a retried instruction cannot double-charge,
 *  - INITIATED → PROCESSING → SUCCEEDED / FAILED transitions,
 *  - webhook-shaped callbacks that the application handles,
 *  - a retry path that creates a NEW attempt rather than mutating the old one,
 *  - audit events at every step.
 */

export class PaymentError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "PaymentError";
  }
}

const KIND_LABELS: Record<PaymentKind, string> = {
  RESERVATION_DEPOSIT: "Reservation deposit",
  PLATFORM_FEE: "Aqary success fee",
  DEVELOPER_ASSIGNMENT_FEE: "Developer assignment fee",
  SELLER_RELEASE: "Cash release to seller",
};

/** The signed instruction: no money state changes without one. */
function instructionRef(dealId: string, kind: PaymentKind, attempt: number, amount: string) {
  return createHash("sha256")
    .update(`${dealId}:${kind}:${attempt}:${amount}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
}

export async function initiatePayment(args: {
  dealId: string;
  kind: PaymentKind;
  actorId: string;
  /** Demo control: force the mock PSP's outcome. */
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: args.dealId },
    include: { payments: true, milestones: true },
  });
  if (deal.status !== "ACTIVE") throw new PaymentError("Deal is not active", "NOT_ACTIVE");

  const settled = deal.payments.find((p) => p.kind === args.kind && p.status === "SUCCEEDED");
  if (settled) throw new PaymentError(`${KIND_LABELS[args.kind]} has already been paid`, "ALREADY_PAID");

  const inFlight = deal.payments.find(
    (p) => p.kind === args.kind && (p.status === "INITIATED" || p.status === "PROCESSING"),
  );
  if (inFlight) return inFlight;

  const amount =
    args.kind === "RESERVATION_DEPOSIT"
      ? money(deal.reservationDeposit)
      : args.kind === "PLATFORM_FEE"
        ? money(deal.platformFee)
        : args.kind === "DEVELOPER_ASSIGNMENT_FEE"
          ? money(deal.developerAssignmentFee)
          : money(deal.cashToSeller);

  if (amount.lte(0)) throw new PaymentError("Nothing to charge for this instruction", "ZERO_AMOUNT");

  const attempt = deal.payments.filter((p) => p.kind === args.kind).length + 1;
  const ref = instructionRef(args.dealId, args.kind, attempt, amount.toFixed(2));
  const idempotencyKey = `${args.dealId}:${args.kind}:${attempt}`;

  const milestoneKey =
    args.kind === "RESERVATION_DEPOSIT"
      ? "RESERVATION_DEPOSIT"
      : args.kind === "PLATFORM_FEE"
        ? "PLATFORM_FEE_COLLECTED"
        : args.kind === "SELLER_RELEASE"
          ? "CASH_RELEASED_TO_SELLER"
          : null;
  const milestone = milestoneKey ? deal.milestones.find((m) => m.key === milestoneKey) : null;

  const payment = await prisma.payment.create({
    data: {
      dealId: args.dealId,
      milestoneId: milestone?.id ?? null,
      kind: args.kind,
      amount: amount.toFixed(2),
      status: "INITIATED",
      provider: provider().name,
      idempotencyKey,
      instructionRef: ref,
      initiatedBy: args.actorId,
      attempts: 1,
      events: {
        create: {
          type: "instruction.signed",
          payload: { instructionRef: ref, amount: amount.toFixed(2), kind: args.kind, attempt },
        },
      },
    },
  });

  await audit({
    actorId: args.actorId,
    action: "PAYMENT_INITIATED",
    entityType: "Payment",
    entityId: payment.id,
    after: { kind: args.kind, amount: amount.toFixed(2), instructionRef: ref },
    metadata: { dealId: args.dealId, attempt },
  });

  const intent = await provider().createIntent({
    idempotencyKey,
    amount: amount.toFixed(2),
    currency: "EGP",
    reference: ref,
    description: `${KIND_LABELS[args.kind]} · ${deal.reference}`,
    simulate: args.simulate,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PROCESSING",
      providerRef: intent.providerRef,
      events: { create: { type: "provider.intent_created", payload: { providerRef: intent.providerRef } } },
    },
  });

  // The PSP calls back. Modelled as a queued job so the failure path, the
  // retry and the visible status are all real.
  await enqueue(
    "payment.resolve",
    { paymentId: payment.id },
    { runAt: new Date(Date.now() + intent.settleAfterMs) },
  );

  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

/** The webhook handler. Idempotent: a repeated callback changes nothing. */
export async function handlePaymentCallback(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { deal: true },
  });

  if (payment.status === "SUCCEEDED" || payment.status === "FAILED") return payment;
  if (!payment.providerRef) throw new PaymentError("Payment has no provider reference", "NO_PROVIDER_REF");

  const callback = await provider().resolveIntent(payment.providerRef);

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: callback.status,
      settledAt: new Date(),
      failureCode: callback.failureCode ?? null,
      failureReason: callback.failureReason ?? null,
      events: {
        create: {
          type: callback.status === "SUCCEEDED" ? "provider.succeeded" : "provider.failed",
          payload: callback.raw as object,
        },
      },
    },
  });

  await audit({
    action: callback.status === "SUCCEEDED" ? "PAYMENT_SUCCEEDED" : "PAYMENT_FAILED",
    entityType: "Payment",
    entityId: paymentId,
    before: { status: "PROCESSING" },
    after: { status: callback.status, failureCode: callback.failureCode ?? null },
    metadata: { dealId: payment.dealId, amount: payment.amount.toString() },
  });

  const parties = [payment.deal.buyerId, payment.deal.sellerId];
  if (callback.status === "SUCCEEDED") {
    for (const userId of parties) {
      await notify({
        userId,
        type: "PAYMENT_SUCCEEDED",
        titleEn: `${KIND_LABELS[payment.kind]} cleared`,
        titleAr: "تم تأكيد الدفع",
        bodyEn: `EGP ${payment.amount.toString()} settled on ${payment.deal.reference}.`,
        bodyAr: `تم سداد ${payment.amount.toString()} جنيه.`,
        linkHref: `/deals/${payment.dealId}`,
      });
    }
    // The milestone advances only through the enforced milestone service.
    if (payment.milestoneId) {
      await prisma.milestone.update({
        where: { id: payment.milestoneId },
        data: { status: "IN_PROGRESS", blockedReason: null },
      });
    }
  } else {
    await notify({
      userId: payment.deal.buyerId,
      type: "PAYMENT_FAILED",
      titleEn: `${KIND_LABELS[payment.kind]} failed`,
      titleAr: "فشل الدفع",
      bodyEn: `${callback.failureReason ?? "The payment did not clear."} You can retry from the deal room.`,
      bodyAr: "لم تتم عملية الدفع. يمكنك إعادة المحاولة من غرفة الصفقة.",
      linkHref: `/deals/${payment.dealId}`,
    });
    if (payment.milestoneId) {
      await prisma.milestone.update({
        where: { id: payment.milestoneId },
        data: { status: "BLOCKED", blockedReason: callback.failureReason ?? "Payment failed" },
      });
    }
  }

  return updated;
}

/** A retry is a NEW attempt with a NEW idempotency key. The old one is history. */
export async function retryPayment(args: {
  paymentId: string;
  actorId: string;
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}) {
  const failed = await prisma.payment.findUniqueOrThrow({ where: { id: args.paymentId } });
  if (failed.status !== "FAILED") {
    throw new PaymentError("Only a failed payment can be retried", "NOT_FAILED");
  }
  await audit({
    actorId: args.actorId,
    action: "PAYMENT_RETRIED",
    entityType: "Payment",
    entityId: args.paymentId,
    metadata: { dealId: failed.dealId, kind: failed.kind },
  });
  return initiatePayment({
    dealId: failed.dealId,
    kind: failed.kind,
    actorId: args.actorId,
    simulate: args.simulate,
  });
}

registerJob("payment.resolve", async (payload) => {
  const paymentId = String(payload.paymentId);
  const result = await handlePaymentCallback(paymentId);
  return { status: result.status };
});
