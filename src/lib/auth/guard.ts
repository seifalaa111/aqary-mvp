import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSessionUser, type SessionUser } from "./session";

/**
 * Server-side authorization. Every page, action and route handler that touches
 * private data goes through one of these. Cross-role access is denied here and
 * the denial is audited — the client is never asked what role it has.
 */

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN_ROLE"
      | "NOT_OWNER"
      | "TIER_TOO_LOW"
      | "NOT_FOUND" = "FORBIDDEN_ROLE",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("Sign in required", "UNAUTHENTICATED");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.some((r) => user.roles.includes(r))) {
    await audit({
      actorId: user.id,
      actorRole: user.activeRole,
      action: "ACCESS_DENIED",
      entityType: "Role",
      entityId: roles.join(","),
      metadata: { held: user.roles, required: roles },
    });
    throw new AuthorizationError(`Requires role: ${roles.join(" or ")}`, "FORBIDDEN_ROLE");
  }
  return user;
}

/**
 * The locale to bounce a redirect into. Every route carries a locale prefix, so
 * a redirect target must too — otherwise a signed-out Arabic user lands on a
 * URL that does not exist.
 */
async function redirectLocale(): Promise<string> {
  try {
    const value = (await cookies()).get("AQARY_LOCALE")?.value;
    return value === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

/** Page-level variant: bounces to the right place instead of throwing. */
export async function requireRolePage(...roles: Role[]): Promise<SessionUser> {
  const locale = await redirectLocale();
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/signin`);
  if (!roles.some((r) => user.roles.includes(r))) {
    await audit({
      actorId: user.id,
      actorRole: user.activeRole,
      action: "ACCESS_DENIED",
      entityType: "Role",
      entityId: roles.join(","),
      metadata: { held: user.roles, required: roles },
    });
    redirect(`/${locale}${homeForRole(user.activeRole)}?denied=1`);
  }
  return user;
}

export function homeForRole(role: Role): string {
  switch (role) {
    case "SELLER":
      return "/seller";
    case "BUYER":
      return "/opportunities";
    case "ANALYST":
    case "ADMIN":
      return "/analyst";
    case "DEVELOPER_PARTNER":
      return "/partner";
    default:
      return "/";
  }
}

/** A seller may only touch their own listing. Analysts may touch any. */
export async function requireListingAccess(
  listingId: string,
  opts: { as: "SELLER" } | { as: "ANALYST" } | { as: "PARTICIPANT" },
) {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!listing) throw new AuthorizationError("Listing not found", "NOT_FOUND");

  if (opts.as === "ANALYST") {
    if (!user.roles.includes("ANALYST") && !user.roles.includes("ADMIN")) {
      await denied(user, "Listing", listingId);
      throw new AuthorizationError("Analyst only", "FORBIDDEN_ROLE");
    }
    return { user, listing };
  }

  if (opts.as === "SELLER") {
    if (listing.sellerId !== user.id) {
      await denied(user, "Listing", listingId);
      throw new AuthorizationError("Not your listing", "NOT_OWNER");
    }
    return { user, listing };
  }

  // PARTICIPANT: seller, an analyst, or a buyer with an offer/deal on it.
  if (listing.sellerId === user.id) return { user, listing };
  if (user.roles.includes("ANALYST") || user.roles.includes("ADMIN")) return { user, listing };
  const involved = await prisma.offer.count({ where: { listingId, buyerId: user.id } });
  if (involved > 0) return { user, listing };

  await denied(user, "Listing", listingId);
  throw new AuthorizationError("Not a participant", "NOT_OWNER");
}

export async function requireDealAccess(dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, buyerId: true, sellerId: true, coordinatorId: true, contactUnmasked: true },
  });
  if (!deal) throw new AuthorizationError("Deal not found", "NOT_FOUND");

  const isStaff = user.roles.includes("ANALYST") || user.roles.includes("ADMIN");
  if (deal.buyerId !== user.id && deal.sellerId !== user.id && !isStaff) {
    await denied(user, "Deal", dealId);
    throw new AuthorizationError("Not a party to this deal", "NOT_OWNER");
  }
  const party: "BUYER" | "SELLER" | "COORDINATOR" =
    deal.buyerId === user.id ? "BUYER" : deal.sellerId === user.id ? "SELLER" : "COORDINATOR";
  return { user, deal, party };
}

/** Buyers below `VERIFIED` may browse but not transact, and see masked contract data. */
export async function requireBuyerTier(min: "BROWSER" | "VERIFIED" | "PRIORITY") {
  const user = await requireRole("BUYER");
  const profile = await prisma.buyerProfile.findUnique({ where: { userId: user.id } });
  const order = { BROWSER: 0, VERIFIED: 1, PRIORITY: 2 } as const;
  const tier = profile?.tier ?? "BROWSER";
  if (order[tier] < order[min]) {
    throw new AuthorizationError(`Requires ${min} buyer tier`, "TIER_TOO_LOW");
  }
  return { user, profile, tier };
}

async function denied(user: SessionUser, entityType: string, entityId: string) {
  await audit({
    actorId: user.id,
    actorRole: user.activeRole,
    action: "ACCESS_DENIED",
    entityType,
    entityId,
    metadata: { roles: user.roles },
  });
}
