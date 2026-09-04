import "server-only";
import { createHash } from "node:crypto";
import type { PaymentKind, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { payments as provider } from "@/lib/providers";
import { notify } from "./notifications";
import { registerJob, enqueue } from "./jobs";

/** Payment instructions are bound to a deal, a kind, and a legal actor. */
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

function instructionRef(dealId: string, kind: PaymentKind, attempt: number, amount: string) {
  return createHash("sha256")
    .update(`${dealId}:${kind}:${attempt}:${amount}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
}

function amountFor(
  deal: { reservationDeposit: unknown; platformFee: unknown; developerAssignmentFee: unknown; cashToSeller: unknown },
  kind: PaymentKind,
) {
  if (kind === "RESERVATION_DEPOSIT") return money(deal.reservationDeposit as string);
  if (kind === "PLATFORM_FEE") return money(deal.platformFee as string);
  if (kind === "DEVELOPER_ASSIGNMENT_FEE") return money(deal.developerAssignmentFee as string);
  return money(deal.cashToSeller as string);
}

function milestoneFor(kind: PaymentKind) {
  if (kind === "RESERVATION_DEPOSIT") return "RESERVATION_DEPOSIT" as const;
  if (kind === "PLATFORM_FEE") return "PLATFORM_FEE_COLLECTED" as const;
  if (kind === "SELLER_RELEASE") return "CASH_RELEASED_TO_SELLER" as const;
  return null;
}

function complete(milestones: { key: string; status: string }[], key: string) {
  return milestones.some((m) => m.key === key && m.status === "COMPLETED");
}

function assertPaymentActor(args: {
  kind: PaymentKind;
  actorId: string;
  actorRole: Role;
  buyerId: string;
  milestones: { key: string; status: string }[];
}) {
  const isAdmin = args.actorRole === "ADMIN";
  const isBuyer = args.actorRole === "BUYER" && args.actorId === args.buyerId;
  const buyerOnly = () => {
    if (!isBuyer && !isAdmin) throw new PaymentError("Only the buyer may initiate this payment", "PAYMENT_ACTOR_FORBIDDEN");
  };
  switch (args.kind) {
    case "RESERVATION_DEPOSIT":
      buyerOnly();
      return;
    case "DEVELOPER_ASSIGNMENT_FEE":
      buyerOnly();
      if (!complete(args.milestones, "DEVELOPER_NOC_REQUESTED")) {
        throw new PaymentError("The developer assignment fee is not due before the NOC request is complete", "PAYMENT_TOO_EARLY");
      }
      return;
    case "SELLER_RELEASE":
      if (!isAdmin) throw new PaymentError("Only settlement staff may release seller cash", "PAYMENT_ACTOR_FORBIDDEN");
      if (!complete(args.milestones, "ASSIGNMENT_REGISTERED")) {
        throw new PaymentError("Seller cash cannot be released before the assignment is registered", "PAYMENT_TOO_EARLY");
      }
      return;
    case "PLATFORM_FEE":
      buyerOnly();
      // The fee is neither due at offer acceptance nor at reservation. It is
      // collected only at the end, once ownership is registered and cash has
      // actually been released to the seller.
      if (!complete(args.milestones, "ASSIGNMENT_REGISTERED") || !complete(args.milestones, "CASH_RELEASED_TO_SELLER")) {
        throw new PaymentError("The success fee is due only on completion", "PAYMENT_TOO_EARLY");
      }
      return;
  }
}

export async function initiatePayment(args: {
  dealId: string;
  kind: PaymentKind;
  actorId: string;
  actorRole: Role;
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}) {
  const prepared = await prisma.$transaction(
    async (tx) => {
      // Serialise payment creation per deal. A repeated click cannot create two
      // live instructions for the same kind or race its attempt number.
      await tx.$queryRaw`SELECT "id" FROM "Deal" WHERE "id" = ${args.dealId} FOR UPDATE`;
      const deal = await tx.deal.findUniqueOrThrow({
        where: { id: args.dealId },
        include: { payments: true, milestones: true },
      });
      if (deal.status !== "ACTIVE") throw new PaymentError("Deal is not active", "NOT_ACTIVE");
      assertPaymentActor({ ...args, buyerId: deal.buyerId, milestones: deal.milestones });
      const settled = deal.payments.find((p) => p.kind === args.kind && p.status === "SUCCEEDED");
      if (settled) throw new PaymentError(`${KIND_LABELS[args.kind]} has already been paid`, "ALREADY_PAID");
      const inFlight = deal.payments.find(
        (p) => p.kind === args.kind && (p.status === "INITIATED" || p.status === "PROCESSING"),
      );
      if (inFlight) return { payment: inFlight, deal };

      const amount = amountFor(deal, args.kind);
      if (amount.lte(0)) throw new PaymentError("Nothing is due for this instruction", "ZERO_AMOUNT");
      const attempt = deal.payments.filter((p) => p.kind === args.kind).length + 1;
      const ref = instructionRef(args.dealId, args.kind, attempt, amount.toFixed(2));
      const milestoneKey = milestoneFor(args.kind);
      const milestone = milestoneKey ? deal.milestones.find((m) => m.key === milestoneKey) : null;
      const payment = await tx.payment.create({
        data: {
          dealId: args.dealId,
          milestoneId: milestone?.id ?? null,
          kind: args.kind,
          amount: amount.toFixed(2),
          status: "INITIATED",
          provider: provider().name,
          idempotencyKey: `${args.dealId}:${args.kind}:${attempt}`,
          instructionRef: ref,
          initiatedBy: args.actorId,
          attempts: 1,
          events: { create: { type: "instruction.signed", payload: { instructionRef: ref, amount: amount.toFixed(2), kind: args.kind, attempt } } },
        },
      });
      return { payment, deal };
    },
    { isolationLevel: "Serializable" },
  );

  // A concurrent caller can receive the existing in-flight payment. Do not
  // create another PSP intent or a duplicate queue job for it.
  if (prepared.payment.status !== "INITIATED") return prepared.payment;
  await audit({
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "PAYMENT_INITIATED",
    entityType: "Payment",
    entityId: prepared.payment.id,
    after: { kind: args.kind, amount: prepared.payment.amount.toString(), instructionRef: prepared.payment.instructionRef },
    metadata: { dealId: args.dealId, attempt: prepared.payment.attempts },
  });

  try {
    const intent = await provider().createIntent({
      idempotencyKey: prepared.payment.idempotencyKey,
      amount: prepared.payment.amount.toString(),
      currency: "EGP",
      reference: prepared.payment.instructionRef,
      description: `${KIND_LABELS[args.kind]} · ${prepared.deal.reference}`,
      simulate: args.simulate,
    });
    const started = await prisma.payment.updateMany({
      where: { id: prepared.payment.id, status: "INITIATED" },
      data: { status: "PROCESSING", providerRef: intent.providerRef },
    });
    if (started.count === 1) {
      await prisma.paymentEvent.create({
        data: { paymentId: prepared.payment.id, type: "provider.intent_created", payload: { providerRef: intent.providerRef } },
      });
      await enqueue("payment.resolve", { paymentId: prepared.payment.id }, { runAt: new Date(Date.now() + intent.settleAfterMs) });
    }
  } catch (err) {
    await prisma.payment.updateMany({
      where: { id: prepared.payment.id, status: "INITIATED" },
      data: { status: "FAILED", failureCode: "INTENT_CREATION_FAILED", failureReason: err instanceof Error ? err.message : "Provider intent creation failed" },
    });
    throw err;
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: prepared.payment.id } });
}

/** Provider callback: exactly one caller wins the conditional terminal transition. */
export async function handlePaymentCallback(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { deal: true } });
  if (["SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"].includes(payment.status)) return payment;
  if (!payment.providerRef) throw new PaymentError("Payment has no provider reference", "NO_PROVIDER_REF");
  const callback = await provider().resolveIntent(payment.providerRef);
  const won = await prisma.payment.updateMany({
    where: { id: paymentId, status: { in: ["INITIATED", "PROCESSING"] } },
    data: { status: callback.status, settledAt: new Date(), failureCode: callback.failureCode ?? null, failureReason: callback.failureReason ?? null },
  });
  if (won.count !== 1) return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

  await prisma.paymentEvent.create({
    data: { paymentId, type: callback.status === "SUCCEEDED" ? "provider.succeeded" : "provider.failed", payload: callback.raw as object },
  });
  await audit({
    action: callback.status === "SUCCEEDED" ? "PAYMENT_SUCCEEDED" : "PAYMENT_FAILED",
    entityType: "Payment",
    entityId: paymentId,
    before: { status: payment.status },
    after: { status: callback.status, failureCode: callback.failureCode ?? null },
    metadata: { dealId: payment.dealId, amount: payment.amount.toString() },
  });
  if (callback.status === "SUCCEEDED") {
    for (const userId of [payment.deal.buyerId, payment.deal.sellerId]) {
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
    if (payment.milestoneId) {
      await prisma.milestone.updateMany({
        where: { id: payment.milestoneId, status: { in: ["PENDING", "BLOCKED", "AT_RISK"] } },
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
      await prisma.milestone.updateMany({
        where: { id: payment.milestoneId, status: { in: ["PENDING", "IN_PROGRESS", "AT_RISK"] } },
        data: { status: "BLOCKED", blockedReason: callback.failureReason ?? "Payment failed" },
      });
    }
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

/** A retry is a fresh instruction, but it must stay on the exact same deal. */
export async function retryPayment(args: {
  dealId: string;
  paymentId: string;
  actorId: string;
  actorRole: Role;
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}) {
  const failed = await prisma.payment.findUniqueOrThrow({ where: { id: args.paymentId } });
  if (failed.dealId !== args.dealId) throw new PaymentError("Payment does not belong to this deal", "PAYMENT_DEAL_MISMATCH");
  if (failed.status !== "FAILED") throw new PaymentError("Only a failed payment can be retried", "NOT_FAILED");
  await audit({
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "PAYMENT_RETRIED",
    entityType: "Payment",
    entityId: failed.id,
    metadata: { dealId: failed.dealId, kind: failed.kind },
  });
  return initiatePayment({ dealId: failed.dealId, kind: failed.kind, actorId: args.actorId, actorRole: args.actorRole, simulate: args.simulate });
}

registerJob("payment.resolve", async (payload) => {
  const result = await handlePaymentCallback(String(payload.paymentId));
  return { status: result.status };
});
