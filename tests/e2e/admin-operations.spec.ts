import { test, expect } from "@playwright/test";
import { signIn, signOut, demoUser } from "./helpers";

test.describe("Phase 3 — Admin & Analyst Operations Platform", () => {
  test("admin lands on /admin and can navigate full operations suite", async ({ page }) => {
    const admin = await demoUser("ADMIN");
    await signIn(page, admin.email!);

    // 1. Overview
    await expect(page).toHaveURL(/\/en\/admin/);
    await expect(page.getByRole("heading", { name: /operations overview/i })).toBeVisible();

    // 2. Listings
    await page.getByRole("link", { name: /^listings$/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/listings/);
    await expect(page.getByRole("heading", { name: /marketplace listings & overrides/i })).toBeVisible();

    // 3. Users & KYC
    await page.getByRole("link", { name: /users & kyc/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/users/);
    await expect(page.getByRole("heading", { name: /users, kyc & role governance/i })).toBeVisible();

    // 4. Pipeline
    await page.getByRole("link", { name: /^pipeline$/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/pipeline/);
    await expect(page.getByRole("heading", { name: /7-stage deal pipeline/i })).toBeVisible();

    // 5. Policies
    await page.getByRole("link", { name: /^policies$/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/policies/);
    await expect(page.getByRole("heading", { name: /developer assignment policies & versioning/i })).toBeVisible();

    // 6. Payments
    await page.getByRole("link", { name: /^payments/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/payments/);
    await expect(page.getByRole("heading", { name: /payment operations & settlement/i })).toBeVisible();

    // 7. Jobs
    await page.getByRole("link", { name: /^jobs/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/jobs/);
    await expect(page.getByRole("heading", { name: /background jobs & worker queue/i })).toBeVisible();

    // 8. Metrics
    await page.getByRole("link", { name: /^metrics$/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/metrics/);
    await expect(page.getByText(/extraction adoption rate/i)).toBeVisible();

    // 9. Audit
    await page.getByRole("link", { name: /^audit$/i }).click();
    await expect(page).toHaveURL(/\/en\/admin\/audit/);
    await expect(page.getByRole("heading", { name: /immutable audit trail/i })).toBeVisible();

    // 10. Cross-links
    await page.getByRole("link", { name: /verification workbench →/i }).click();
    await expect(page).toHaveURL(/\/en\/analyst/);

    await page.getByRole("link", { name: /← admin console/i }).click();
    await expect(page).toHaveURL(/\/en\/admin/);
  });

  test("every guarded route sends a signed-out visitor to sign-in, not an error", async ({ page }) => {
    // /partner used to 500 here while /admin, /analyst, /seller and /buyer all
    // redirected: it guarded with the throwing variant instead of the page one,
    // so an anonymous caller was told the app had crashed rather than that they
    // needed to sign in. Caught against the deployment, not the source.
    await page.context().clearCookies();
    for (const path of ["/en/admin", "/en/analyst", "/en/seller", "/en/buyer", "/en/partner"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page, `${path} should land on sign-in`).toHaveURL(/\/signin/);
    }
  });

  test("analyst cannot access /admin suite directly", async ({ page }) => {
    // Find an analyst who is not an admin
    const analyst = await demoUser("ANALYST");
    await signIn(page, analyst.email!);

    // Direct navigation to admin is bounced
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/analyst\?denied=1/);
  });
});
