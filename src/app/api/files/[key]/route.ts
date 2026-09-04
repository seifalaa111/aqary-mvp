import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { storage, verifyKeySignature } from "@/lib/providers/storage";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

/**
 * Documents are never served from a static path. Every read requires either a
 * valid short-lived signature or a server-side authorization check, and every
 * read is logged against the document.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key: encoded } = await ctx.params;
  const key = decodeURIComponent(encoded);

  const expires = Number(req.nextUrl.searchParams.get("expires") ?? "0");
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  const signed = verifyKeySignature(key, expires, sig);

  // The truth sidecars are extraction-engine input, never user-facing.
  if (key.endsWith(".truth.json")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getSessionUser();

  // Find the document this key belongs to so we can authorise and log.
  const baseKey = key.replace(/\.page-\d+\.webp$/, "");
  const document = await prisma.document.findFirst({
    where: { storageKey: baseKey },
    select: {
      id: true,
      ownerId: true,
      listingId: true,
      mimeType: true,
      listing: { select: { id: true, status: true, sellerId: true } },
    },
  });

  if (!signed) {
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    if (!document) return new NextResponse("Not found", { status: 404 });

    const isStaff = user.roles.includes("ANALYST") || user.roles.includes("ADMIN");
    const isOwner = document.ownerId === user.id;
    let allowed = isStaff || isOwner;

    if (!allowed && document.listingId) {
      // Confidentiality consent is necessary but never sufficient. A buyer
      // must be a concrete offer/deal participant; otherwise a single consent
      // row would unlock every seller contract on the marketplace.
      const [consent, involved, developerDeal] = await Promise.all([
        prisma.consent.findFirst({
          where: { userId: user.id, type: "BUYER_CONFIDENTIALITY", granted: true },
        }),
        prisma.offer.count({
          where: { listingId: document.listingId, buyerId: user.id },
        }),
        user.roles.includes("DEVELOPER_PARTNER")
          ? prisma.deal.findFirst({
              where: {
                listingId: document.listingId,
                developer: { partnerMembers: { some: { userId: user.id, active: true } } },
              },
              select: { id: true },
            })
          : null,
      ]);
      allowed =
        (Boolean(consent) && involved > 0) || Boolean(developerDeal);
    }

    if (!allowed) {
      await audit({
        actorId: user.id,
        actorRole: user.activeRole,
        action: "ACCESS_DENIED",
        entityType: "Document",
        entityId: document.id,
      });
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let buffer: Buffer;
  try {
    buffer = await storage().get(key);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  if (document) {
    await prisma.documentAccessLog.create({
      data: {
        documentId: document.id,
        userId: user?.id ?? null,
        action: signed ? "SIGNED_URL_READ" : "AUTHENTICATED_READ",
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      },
    });
  }

  const contentType = key.endsWith(".webp")
    ? "image/webp"
    : key.endsWith(".png")
      ? "image/png"
      : key.endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
