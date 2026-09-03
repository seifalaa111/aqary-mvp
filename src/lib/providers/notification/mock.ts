import "server-only";
import { randomUUID } from "node:crypto";
import type { NotificationProvider } from "../types";

/**
 * MockNotificationProvider. In-app `Notification` rows are always real; this
 * only simulates the outbound leg (WhatsApp / SMS / email). Delivery outcomes
 * are recorded so the ops console can show what would have been sent.
 */
export class MockNotificationProvider implements NotificationProvider {
  readonly name = "mock-delivery";

  async send(req: { channel: "SMS" | "WHATSAPP" | "EMAIL"; to: string; subject?: string; body: string }) {
    // Never log message bodies or recipient identifiers in full — they are PII.
    const masked = req.to.replace(/.(?=.{3})/g, "•");
    if (process.env.NODE_ENV !== "production") {
      console.info(`[notify:mock] ${req.channel} -> ${masked} (${req.body.length} chars)`);
    }
    await new Promise((r) => setTimeout(r, 120));
    return {
      delivered: true,
      providerRef: `MOCKMSG_${randomUUID().slice(0, 8).toUpperCase()}`,
      note: "Simulated delivery — no gateway connected",
    };
  }
}
