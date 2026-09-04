import { expect, test } from "@playwright/test";
import { db, demoUser, signIn, signOut } from "./helpers";

test.afterAll(async () => {
  await db.$disconnect();
});

test.describe("Phase 2 ? Buyer & Seller KYC, Capacity & Privacy Funnel", () => {
  test("buyer manages identity verification and updates financial capacity", async ({ page }) => {
    const buyer = await demoUser("BUYER");
    await signIn(page, buyer.email!);

    // Navigate to buyer overview
    await page.goto("/en/buyer");
    await expect(page).toHaveURL(/\/buyer/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Verification checklist page
    await page.goto("/en/buyer/verification");
    await expect(page).toHaveURL(/\/buyer\/verification/);
    await expect(page.getByText(/Identity & KYC Verification/i)).toBeVisible();
    await expect(page.getByText(/Required Verification Checklist/i)).toBeVisible();

    // Capacity & affordability page
    await page.goto("/en/buyer/capacity");
    await expect(page).toHaveURL(/\/buyer\/capacity/);
    await expect(page.getByText(/Financial Capacity/i).first()).toBeVisible();

    // Update capacity form
    const cashInput = page.locator("input[type='number']").first();
    await cashInput.fill("3000000");
    await page.getByRole("button", { name: /save changes/i }).click();

    // Wait for success feedback
    await expect(page.getByText(/Financial capacity updated successfully/i)).toBeVisible();

    // Verify DB updated
    const updatedProfile = await db.buyerProfile.findUnique({
      where: { userId: buyer.id },
    });
    expect(updatedProfile?.availableCash?.toString()).toBe("3000000");

    // Documents vault page
    await page.goto("/en/buyer/documents");
    await expect(page).toHaveURL(/\/buyer\/documents/);
    await expect(page.getByText(/Personal Documents Vault/i)).toBeVisible();

    await signOut(page);
  });

  test("seller views listing documents and review statuses", async ({ page }) => {
    page.on("pageerror", (err) => console.log("PAGEERROR:", err));
    page.on("console", (msg) => console.log("PAGECONSOLE:", msg.type(), msg.text()));
    const seller = await demoUser("SELLER");
    await signIn(page, seller.email!);

    const listing = await db.listing.findFirst({
      where: { sellerId: seller.id },
    });
    if (!listing) return;

    await page.goto(`/en/seller/listings/${listing.id}`);
    await expect(page).toHaveURL(new RegExp(`/seller/listings/${listing.id}`));

    // Check that listing verification documents section is present
    await expect(page.getByText(/Listing verification documents/i)).toBeVisible();

    await signOut(page);
  });

  test("confidentiality gate protects contract diligence documents on opportunity page", async ({
    page,
  }) => {
    const buyer = await demoUser("BUYER");
    await signIn(page, buyer.email!);

    const listing = await db.listing.findFirst({
      where: { status: "LISTED", isPrivate: false },
    });
    if (!listing) return;

    await page.goto(`/en/opportunities/${listing.id}`);
    await expect(page).toHaveURL(new RegExp(`/opportunities/${listing.id}`));

    // Ensure sensitive documents like National ID are NEVER visible in the public opportunity document list
    const sensitiveDoc = page.getByText(/National ID ? front/i);
    await expect(sensitiveDoc).not.toBeVisible();

    await signOut(page);
  });
});
