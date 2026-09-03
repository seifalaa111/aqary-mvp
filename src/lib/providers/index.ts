import "server-only";
import { config } from "@/lib/config";
import { MockAiProvider } from "./ai/mock";
import { LiveAiProvider } from "./ai/live";
import { MockPaymentProvider } from "./payment/mock";
import { MockKycProvider } from "./kyc/mock";
import { MockNotificationProvider } from "./notification/mock";
import type { AiProvider, KycProvider, NotificationProvider, PaymentProvider } from "./types";

/**
 * Provider registry. Calling code asks for a capability, never an implementation.
 * Swapping a mock for a live integration is a config change, not a code change.
 */

let aiInstance: AiProvider | null = null;
let paymentInstance: PaymentProvider | null = null;
let kycInstance: KycProvider | null = null;
let notificationInstance: NotificationProvider | null = null;

export function ai(): AiProvider {
  if (!aiInstance) {
    aiInstance = config.AI_MODE === "live" ? new LiveAiProvider() : new MockAiProvider();
  }
  return aiInstance;
}

export function payments(): PaymentProvider {
  if (!paymentInstance) {
    // A live PSP (Paymob / Fawry) would be selected here — see ASSUMPTIONS.md.
    paymentInstance = new MockPaymentProvider();
  }
  return paymentInstance;
}

export function kyc(): KycProvider {
  if (!kycInstance) kycInstance = new MockKycProvider();
  return kycInstance;
}

export function notifications(): NotificationProvider {
  if (!notificationInstance) notificationInstance = new MockNotificationProvider();
  return notificationInstance;
}

export * from "./types";
export { storage } from "./storage";
