import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { db, DEMO_PASSWORD } from "./helpers";

/**
 * Phase 5 rendered-UI audit harness.
 *
 * Not an assertion suite — it drives the real application and captures every
 * surface at desktop and mobile width, in English and Arabic, so the design and
 * mobile audits are done against pixels rather than source. It also asserts the
 * two things a screenshot cannot show: that the page did not error, and that the
 * document never scrolls horizontally.
 */

const SHOTS = "test-results/audit";
mkdirSync(SHOTS, { recursive: true });

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

async function signIn(page: Page, identifier: string) {
  await page.goto("/en/signin");
  // The sign-in inputs have no `name`; a click before hydration submits a bare
  // GET and drops the credentials. Wait for the React fiber, per CLAUDE.md.
  await page.waitForFunction(() => {
    const el = document.querySelector("#identifier");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/(seller|opportunities|analyst|admin|partner|buyer)/, { timeout: 60_000 });
}

async function capture(page: Page, url: string, name: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const res = await page.goto(url, { waitUntil: "networkidle" });
  expect(res?.status(), `${name} HTTP status`).toBeLessThan(400);

  // No page may scroll horizontally — the single most common mobile defect.
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth };
  });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  expect(errors, `${name} runtime errors`).toEqual([]);
  // 2px of tolerance for sub-pixel rounding on scaled layouts.
  expect(
    overflow.scrollW,
    `${name} overflows horizontally (${overflow.scrollW} > ${overflow.clientW})`,
  ).toBeLessThanOrEqual(overflow.clientW + 2);
}

const PUBLIC = [
  ["/en", "public-landing"],
  ["/en/opportunities", "public-opportunities"],
  ["/en/how-it-works", "public-how-it-works"],
  ["/en/fees", "public-fees"],
  ["/en/for-developers", "public-for-developers"],
  ["/en/faq", "public-faq"],
  ["/ar", "public-landing-ar"],
  ["/ar/opportunities", "public-opportunities-ar"],
] as const;

test.describe("Phase 5 audit — public surfaces", () => {
  for (const [url, name] of PUBLIC) {
    test(`desktop ${name}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await capture(page, url, `desktop-${name}`);
    });
    test(`mobile ${name}`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await capture(page, url, `mobile-${name}`);
    });
  }

  test("desktop public-opportunity detail", async ({ page }) => {
    const listing = await db.listing.findFirst({
      where: { status: "LISTED", isPrivate: false },
      orderBy: { publishedAt: "desc" },
    });
    expect(listing).not.toBeNull();
    await page.setViewportSize(DESKTOP);
    await capture(page, `/en/opportunities/${listing!.id}`, "desktop-public-opportunity");
    await page.setViewportSize(MOBILE);
    await capture(page, `/ar/opportunities/${listing!.id}`, "mobile-public-opportunity-ar");
  });
});

test.describe("Phase 5 audit — authenticated surfaces", () => {
  test("analyst console", async ({ page }) => {
    const u = await db.user.findFirst({ where: { isDemo: true, roles: { has: "ANALYST" }, email: { not: null } } });
    expect(u?.email).toBeTruthy();
    await page.setViewportSize(DESKTOP);
    await signIn(page, u!.email!);
    await capture(page, "/en/analyst", "desktop-analyst-queue");
    const listing = await db.listing.findFirst({ where: { status: { in: ["PENDING_REVIEW", "SUBMITTED"] } } });
    if (listing) await capture(page, `/en/analyst/listings/${listing.id}`, "desktop-analyst-workbench");
    await page.setViewportSize(MOBILE);
    await capture(page, "/en/analyst", "mobile-analyst-queue");
  });

  test("admin console", async ({ page }) => {
    const u = await db.user.findFirst({ where: { isDemo: true, roles: { has: "ADMIN" }, email: { not: null } } });
    expect(u?.email).toBeTruthy();
    await page.setViewportSize(DESKTOP);
    await signIn(page, u!.email!);
    for (const path of ["", "/listings", "/users", "/pipeline", "/policies", "/payments", "/jobs", "/metrics", "/audit"]) {
      await capture(page, `/en/admin${path}`, `desktop-admin${path.replace("/", "-") || "-overview"}`);
    }
    await capture(page, "/ar/admin", "desktop-admin-overview-ar");
    await page.setViewportSize(MOBILE);
    await capture(page, "/en/admin", "mobile-admin-overview");
    await capture(page, "/en/admin/payments", "mobile-admin-payments");
  });

  test("seller and buyer", async ({ page }) => {
    const seller = await db.user.findFirst({ where: { isDemo: true, roles: { has: "SELLER" }, email: { not: null } } });
    await page.setViewportSize(DESKTOP);
    await signIn(page, seller!.email!);
    await capture(page, "/en/seller", "desktop-seller-dashboard");
    await page.setViewportSize(MOBILE);
    await capture(page, "/en/seller", "mobile-seller-dashboard");

    await page.context().clearCookies();
    const buyer = await db.user.findFirst({
      where: { isDemo: true, roles: { has: "BUYER" }, email: { not: null }, buyerProfile: { tier: { in: ["VERIFIED", "PRIORITY"] } } },
    });
    await page.setViewportSize(DESKTOP);
    await signIn(page, buyer!.email!);
    await capture(page, "/en/buyer", "desktop-buyer-dashboard");
    await capture(page, "/en/buyer/verification", "desktop-buyer-kyc");
    await capture(page, "/ar/buyer/verification", "desktop-buyer-kyc-ar");
    await capture(page, "/ar/buyer", "desktop-buyer-dashboard-ar");
    await page.setViewportSize(MOBILE);
    await capture(page, "/en/buyer/verification", "mobile-buyer-kyc");
  });

  test("developer partner portal", async ({ page }) => {
    const membership = await db.developerPartnerMembership.findFirst({ where: { active: true } });
    expect(membership).not.toBeNull();
    const u = await db.user.findUniqueOrThrow({ where: { id: membership!.userId } });
    await page.setViewportSize(DESKTOP);
    await signIn(page, u.email!);
    await capture(page, "/en/partner", "desktop-partner-portal");
    await page.setViewportSize(MOBILE);
    await capture(page, "/en/partner", "mobile-partner-portal");
  });

  test("deal workspace", async ({ page }) => {
    const deal = await db.deal.findFirst({ orderBy: { createdAt: "desc" } });
    if (!deal) test.skip();
    const buyer = await db.user.findUniqueOrThrow({ where: { id: deal!.buyerId } });
    await page.setViewportSize(DESKTOP);
    await signIn(page, buyer.email!);
    await capture(page, `/en/deals/${deal!.id}`, "desktop-deal-workspace");
    await page.setViewportSize(MOBILE);
    await capture(page, `/en/deals/${deal!.id}`, "mobile-deal-workspace");
  });
});
