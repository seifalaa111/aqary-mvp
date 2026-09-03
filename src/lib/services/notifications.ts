import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notifications as provider } from "@/lib/providers";

/**
 * In-app `Notification` rows are always real records. External delivery
 * (WhatsApp / SMS / email) goes through `NotificationProvider` and is mocked.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  linkHref?: string;
  alsoSend?: { channel: "SMS" | "WHATSAPP" | "EMAIL"; to: string };
}

export async function notify(input: NotifyInput) {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      bodyEn: input.bodyEn,
      bodyAr: input.bodyAr,
      linkHref: input.linkHref ?? null,
      channel: "IN_APP",
      deliveryStatus: "DELIVERED",
    },
  });

  if (input.alsoSend) {
    try {
      const res = await provider().send({
        channel: input.alsoSend.channel,
        to: input.alsoSend.to,
        subject: input.titleEn,
        body: input.bodyEn,
      });
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          titleEn: input.titleEn,
          titleAr: input.titleAr,
          bodyEn: input.bodyEn,
          bodyAr: input.bodyAr,
          linkHref: input.linkHref ?? null,
          channel: input.alsoSend.channel,
          deliveryStatus: res.delivered ? "SIMULATED_DELIVERED" : "FAILED",
        },
      });
    } catch {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          titleEn: input.titleEn,
          titleAr: input.titleAr,
          bodyEn: input.bodyEn,
          bodyAr: input.bodyAr,
          channel: input.alsoSend.channel,
          deliveryStatus: "FAILED",
        },
      });
    }
  }

  return row;
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null, channel: "IN_APP" } });
}

export async function markRead(userId: string, id?: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
}
