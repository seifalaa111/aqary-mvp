import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { cache } from "react";
import type { Role, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

export const SESSION_COOKIE = "aqary_session";
export const ROLE_COOKIE = "aqary_role";

export interface SessionUser {
  id: string;
  phone: string;
  email: string | null;
  fullNameEn: string;
  fullNameAr: string | null;
  roles: Role[];
  activeRole: Role;
  kycStatus: User["kycStatus"];
  phoneVerified: boolean;
  locale: string;
  avatarColor: string;
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw + config.AUTH_SECRET).digest("hex");
}

export async function createSession(userId: string, activeRole: Role): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { token: hashToken(raw), userId, activeRole, expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return raw;
}

export async function destroySession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    await prisma.session.deleteMany({ where: { token: hashToken(raw) } });
    store.delete(SESSION_COOKIE);
  }
}

export async function switchActiveRole(role: Role) {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return;
  await prisma.session.updateMany({ where: { token: hashToken(raw) }, data: { activeRole: role } });
}

/**
 * The single source of truth for "who is asking". Cached per request.
 * Never trust a role from the client — it is read from the session row.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(raw) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || session.user.deletedAt) return null;

  const u = session.user;
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    fullNameEn: u.fullNameEn,
    fullNameAr: u.fullNameAr,
    roles: u.roles,
    activeRole: session.activeRole,
    kycStatus: u.kycStatus,
    phoneVerified: u.phoneVerified,
    locale: u.locale,
    avatarColor: u.avatarColor,
  };
});
