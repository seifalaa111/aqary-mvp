"use server";

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit";
import { createSession, destroySession, getSessionUser, switchActiveRole } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/guard";
import { normalizeEgyptianPhone } from "@/lib/domain/national-id";
import { notifications } from "@/lib/providers";
import { recomputeMatchesForBuyer } from "@/lib/services/matching";

/**
 * Phone-OTP-first auth, which is how Egypt actually signs in, plus an email +
 * password path for returning users and for the demo accounts. OTP delivery is
 * mocked; the verification state, the session and the rate limits are real.
 */

export type AuthResult =
  | { ok: true; redirectTo?: string; devCode?: string }
  | { ok: false; error: string; field?: string };

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_WINDOW_MS = 60 * 1000;
const OTP_MAX_PER_WINDOW = 3;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

// ---------------------------------------------------------------------------

const requestOtpSchema = z.object({
  phone: z.string().min(6),
  purpose: z.enum(["SIGNUP", "LOGIN"]).default("LOGIN"),
});

export async function requestOtp(input: unknown): Promise<AuthResult> {
  const parsed = requestOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid Egyptian mobile number", field: "phone" };

  const phone = normalizeEgyptianPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter a valid Egyptian mobile number", field: "phone" };

  // Rate limit: at most three codes a minute for one number.
  const recent = await prisma.otpCode.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - OTP_RESEND_WINDOW_MS) } },
  });
  if (recent >= OTP_MAX_PER_WINDOW) {
    return { ok: false, error: "Too many codes requested. Wait a minute and try again." };
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (parsed.data.purpose === "LOGIN" && !existing) {
    return { ok: false, error: "No account found for that number", field: "phone" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.otpCode.create({
    data: {
      phone,
      code,
      purpose: parsed.data.purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  // Mocked delivery. The provider is real; the gateway behind it is not.
  await notifications().send({
    channel: "SMS",
    to: phone,
    body: `Aqary verification code: ${code}. Valid for 10 minutes.`,
  });

  return {
    ok: true,
    devCode: config.SURFACE_OTP_IN_DEV && process.env.NODE_ENV !== "production" ? code : undefined,
  };
}

const verifyOtpSchema = z.object({
  phone: z.string().min(6),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  purpose: z.enum(["SIGNUP", "LOGIN"]).default("LOGIN"),
  role: z.enum(["SELLER", "BUYER"]).optional(),
  fullNameEn: z.string().min(2).optional(),
  fullNameAr: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function verifyOtp(input: unknown): Promise<AuthResult> {
  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", field: "code" };
  }
  const phone = normalizeEgyptianPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Invalid phone", field: "phone" };

  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose: parsed.data.purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { ok: false, error: "Request a new code", field: "code" };
  if (otp.expiresAt < new Date()) return { ok: false, error: "That code has expired", field: "code" };

  // Spend the attempt before comparing, with the cap in the WHERE clause. Read
  // the counter, compare, then write and two concurrent guesses each see
  // `attempts < MAX` and both get a free try — the cap leaks under exactly the
  // load an attacker would generate. A conditional update makes the database
  // the arbiter: whoever loses the race gets count 0 and is refused.
  const spent = await prisma.otpCode.updateMany({
    where: { id: otp.id, usedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (spent.count !== 1) {
    return { ok: false, error: "Too many attempts. Request a new code.", field: "code" };
  }

  if (otp.code !== parsed.data.code) {
    return { ok: false, error: "That code is not right", field: "code" };
  }

  // Claim the code. A second request carrying the same correct code finds
  // usedAt already set and is refused, so one code opens exactly one session.
  const claimed = await prisma.otpCode.updateMany({
    where: { id: otp.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return { ok: false, error: "Request a new code", field: "code" };
  }

  let user = await prisma.user.findUnique({ where: { phone } });
  const ip = await clientIp();

  if (!user) {
    if (parsed.data.purpose !== "SIGNUP" || !parsed.data.role || !parsed.data.fullNameEn) {
      return { ok: false, error: "No account found for that number", field: "phone" };
    }
    user = await createAccount({
      phone,
      role: parsed.data.role,
      fullNameEn: parsed.data.fullNameEn,
      fullNameAr: parsed.data.fullNameAr,
      email: parsed.data.email || undefined,
      ip,
    });
  } else if (parsed.data.role && !user.roles.includes(parsed.data.role)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { roles: { push: parsed.data.role } },
    });
    await audit({
      actorId: user.id,
      action: "USER_ROLE_ADDED",
      entityType: "User",
      entityId: user.id,
      after: { role: parsed.data.role },
      ip,
    });
  }

  await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
  await audit({ actorId: user.id, action: "PHONE_VERIFIED", entityType: "User", entityId: user.id, ip });

  const active = parsed.data.role ?? user.roles[0] ?? "BUYER";
  await createSession(user.id, active);
  return { ok: true, redirectTo: nextStepFor(active, user.id) };
}

const passwordSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

export async function signInWithPassword(input: unknown): Promise<AuthResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter your email or phone and password" };

  const phone = normalizeEgyptianPhone(parsed.data.identifier);
  const user = await prisma.user.findFirst({
    where: phone
      ? { phone }
      : { email: parsed.data.identifier.trim().toLowerCase() },
  });

  // Constant-ish work whether or not the account exists.
  const hash = user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
  const valid = await bcrypt.compare(parsed.data.password, hash);
  if (!user || !valid || user.deletedAt) {
    return { ok: false, error: "Those details do not match an account" };
  }

  const active = user.roles[0] ?? "BUYER";
  await createSession(user.id, active);
  return { ok: true, redirectTo: homeForRole(active) };
}

const signUpSchema = z.object({
  role: z.enum(["SELLER", "BUYER"]),
  fullNameEn: z.string().min(3, "Enter your full name"),
  fullNameAr: z.string().optional(),
  phone: z.string().min(6),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters"),
});

/** Email + password signup, for people who would rather not wait for an SMS. */
export async function signUpWithPassword(input: unknown): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form", field: issue?.path.join(".") };
  }
  const phone = normalizeEgyptianPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter a valid Egyptian mobile number", field: "phone" };

  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone }, ...(parsed.data.email ? [{ email: parsed.data.email }] : [])] },
  });
  if (clash) return { ok: false, error: "An account already exists for those details", field: "phone" };

  const user = await createAccount({
    phone,
    role: parsed.data.role,
    fullNameEn: parsed.data.fullNameEn,
    fullNameAr: parsed.data.fullNameAr,
    email: parsed.data.email || undefined,
    passwordHash: await bcrypt.hash(parsed.data.password, 10),
    ip: await clientIp(),
  });

  await createSession(user.id, parsed.data.role);
  return { ok: true, redirectTo: nextStepFor(parsed.data.role, user.id) };
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

export async function switchWorkspace(role: Role) {
  const user = await getSessionUser();
  if (!user || !user.roles.includes(role)) return;
  await switchActiveRole(role);
  redirect(homeForRole(role));
}

// ---------------------------------------------------------------------------

async function createAccount(args: {
  phone: string;
  role: "SELLER" | "BUYER";
  fullNameEn: string;
  fullNameAr?: string;
  email?: string;
  passwordHash?: string;
  ip?: string | null;
}) {
  const user = await prisma.user.create({
    data: {
      phone: args.phone,
      email: args.email?.toLowerCase(),
      fullNameEn: args.fullNameEn,
      fullNameAr: args.fullNameAr || null,
      passwordHash: args.passwordHash,
      roles: [args.role],
      avatarColor: ["#1F4B43", "#B4833C", "#26685C", "#5C6B66", "#8C5A38"][
        args.fullNameEn.length % 5
      ]!,
    },
  });

  if (args.role === "SELLER") {
    await prisma.sellerProfile.create({ data: { userId: user.id } });
  } else {
    await prisma.buyerProfile.create({ data: { userId: user.id, tier: "BROWSER" } });
    await recomputeMatchesForBuyer(user.id);
  }

  // Terms and privacy are separate, individually logged consents.
  await prisma.consent.createMany({
    data: (["TERMS_OF_SERVICE", "PRIVACY_AND_DATA_PROCESSING"] as const).map((type) => ({
      userId: user.id,
      type,
      granted: true,
      textVersion: `${type.toLowerCase()}-v1`,
      ip: args.ip ?? null,
    })),
  });

  await audit({
    actorId: user.id,
    action: "USER_REGISTERED",
    entityType: "User",
    entityId: user.id,
    after: { role: args.role },
    ip: args.ip ?? null,
  });

  return user;
}

function nextStepFor(role: Role, _userId: string): string {
  // Onboarding never dead-ends: a seller goes straight into the intake wizard,
  // a buyer into the financial profile that produces their first matches.
  if (role === "SELLER") return "/seller/new";
  if (role === "BUYER") return "/buyer/onboarding";
  return homeForRole(role);
}
