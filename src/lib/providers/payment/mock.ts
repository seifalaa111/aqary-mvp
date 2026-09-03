import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { PaymentCallback, PaymentIntentRequest, PaymentIntentResult, PaymentProvider } from "../types";

/**
 * MockPaymentProvider — Paymob/Fawry-shaped.
 *
 * It decides the outcome and nothing else. Every other part of a payment —
 * the Payment record, the idempotency key, the state transitions, the milestone
 * advance, the retry path, the audit events — is done for real by
 * `src/lib/services/payments.ts`. See ASSUMPTIONS.md for the swap plan.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock-psp";

  /** providerRef -> the outcome decided at creation time. */
  private outcomes = new Map<string, PaymentCallback>();

  async createIntent(req: PaymentIntentRequest): Promise<PaymentIntentResult> {
    const providerRef = `MOCKPSP_${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`;

    let willSucceed: boolean;
    if (req.simulate === "SUCCESS") willSucceed = true;
    else if (req.simulate === "FAILURE") willSucceed = false;
    else {
      // Deterministic per idempotency key so retries of the *same* instruction
      // behave consistently, while a fresh attempt gets a fresh roll.
      const h = createHash("sha256").update(req.idempotencyKey).digest()[0]!;
      willSucceed = h % 10 !== 0; // ~90% success, like a real card rail
    }

    const failures = [
      { code: "INSUFFICIENT_FUNDS", reason: "Issuing bank declined: insufficient funds" },
      { code: "3DS_TIMEOUT", reason: "Cardholder did not complete 3-D Secure in time" },
      { code: "BANK_UNAVAILABLE", reason: "Acquiring bank temporarily unavailable" },
    ];
    const pick = failures[createHash("sha256").update(providerRef).digest()[1]! % failures.length]!;

    this.outcomes.set(
      providerRef,
      willSucceed
        ? { providerRef, status: "SUCCEEDED", raw: { provider: "mock-psp", reference: req.reference } }
        : {
            providerRef,
            status: "FAILED",
            failureCode: pick.code,
            failureReason: pick.reason,
            raw: { provider: "mock-psp", reference: req.reference, declined: true },
          },
    );

    // Realistic settlement latency; the caller polls or the worker resolves it.
    return { providerRef, status: "PROCESSING", settleAfterMs: 1200 };
  }

  async resolveIntent(providerRef: string): Promise<PaymentCallback> {
    const outcome = this.outcomes.get(providerRef);
    if (outcome) return outcome;

    // Process restarted between creation and callback: recover deterministically
    // from the reference itself rather than inventing a success.
    const h = createHash("sha256").update(providerRef).digest()[0]!;
    return h % 10 === 0
      ? {
          providerRef,
          status: "FAILED",
          failureCode: "BANK_UNAVAILABLE",
          failureReason: "Acquiring bank temporarily unavailable",
          raw: { provider: "mock-psp", recovered: true },
        }
      : { providerRef, status: "SUCCEEDED", raw: { provider: "mock-psp", recovered: true } };
  }
}
