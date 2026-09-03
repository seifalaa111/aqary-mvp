import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const DEMO_PASSWORD = "aqary2026";

/** One client for the whole run; the tests read seeded state to pick targets. */
export const db = new PrismaClient();

export async function signIn(page: Page, identifier: string) {
  await page.goto("/en/signin");
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/(seller|opportunities|analyst|partner|buyer)/, { timeout: 60_000 });
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

export async function demoUser(role: "SELLER" | "BUYER" | "ANALYST") {
  const user = await db.user.findFirst({
    where: {
      isDemo: true,
      roles: { has: role },
      email: { not: null },
      ...(role === "BUYER" ? { buyerProfile: { tier: { in: ["VERIFIED", "PRIORITY"] } } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!user?.email) throw new Error(`No seeded ${role} with an email. Run: npm run seed`);
  return user;
}
