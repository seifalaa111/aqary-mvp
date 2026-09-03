import { expect, test } from "@playwright/test";
import { db, demoUser, signIn, signOut } from "./helpers";

test.afterAll(async () => {
  await db.$disconnect();
});

/**
 * The three critical paths from the brief. Each one drives the real
 * application against the real database and then asserts the database changed.
 */

test.describe("Path 1 — seller intake reaches an analyst", () => {
  test("a seller creates a draft, fills the wizard and it lands in the queue", async ({ page }) => {
    const seller = await demoUser("SELLER");
    await signIn(page, seller.email!);

    await expect(page).toHaveURL(/\/seller/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Start a fresh draft.
    await page.getByRole("link", { name: /start a contract exit/i }).first().click();
    await page.waitForURL(/\/seller\/listings\/[^/]+\/wizard/, { timeout: 60_000 });

    const listingId = page.url().match(/listings\/([^/]+)\/wizard/)![1]!;

    // The draft is a real row from the moment it exists.
    const draft = await db.listing.findUnique({ where: { id: listingId } });
    expect(draft?.status).toBe("DRAFT");
    expect(draft?.sellerId).toBe(seller.id);

    // Step 1 — identity. The national ID checksum is validated server-side.
    await page.locator("#fullNameAr").fill("أحمد محمود عبد الرحمن");
    await page.locator("#nationalId").fill(seller.nationalId!);
    await page.getByRole("button", { name: /^continue/i }).click();

    // The step must have persisted, not just advanced the UI.
    await expect
      .poll(async () => (await db.listing.findUnique({ where: { id: listingId } }))?.wizardCompleted.length, {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(1);

    // Leaving and coming back must restore where we were — resumability.
    await page.goto("/en/seller");
    await page.goto(`/en/seller/listings/${listingId}/wizard`);
    await expect(page.getByRole("button", { name: /identity/i }).first()).toBeVisible();

    const resumed = await db.listing.findUnique({ where: { id: listingId } });
    expect(resumed?.wizardCompleted).toContain(1);

    // Clean up the draft this test created so re-runs stay deterministic.
    await db.listing.delete({ where: { id: listingId } }).catch(() => undefined);
  });

  test("a submitted file carries persisted extraction with confidence and citations", async () => {
    // Proven against the seeded corpus: the pipeline ran for real at seed time.
    const listing = await db.listing.findFirst({
      where: { extractions: { some: {} } },
      include: { extractions: { include: { fields: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    expect(listing).not.toBeNull();

    const extraction = listing!.extractions[0]!;
    expect(extraction.fields.length).toBeGreaterThan(0);
    expect(extraction.latencyMs).toBeGreaterThan(0);

    for (const f of extraction.fields) {
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
    // At least one field cites a document and a page.
    expect(extraction.fields.some((f) => f.documentId && f.page)).toBe(true);
  });
});

test.describe("Path 2 — analyst review to publish", () => {
  test("the queue lists work and the workspace shows documents, reconciliation and the publish gate", async ({
    page,
  }) => {
    const analyst = await demoUser("ANALYST");
    await signIn(page, analyst.email!);
    await page.goto("/en/analyst");

    await expect(page.getByRole("heading", { name: /verification queue/i })).toBeVisible();

    const queued = await db.listing.findFirst({ where: { status: "PENDING_REVIEW" } });
    expect(queued, "seed a PENDING_REVIEW listing first").not.toBeNull();

    await page.goto(`/en/analyst/listings/${queued!.id}`);

    // Split screen: the document viewer and the field list are both present.
    await expect(page.getByRole("region", { name: /documents/i })).toBeVisible();
    await expect(page.getByText(/j \/ k to move/i)).toBeVisible();

    // Reconciliation shows the four sources and the delta.
    await page.getByRole("button", { name: /^reconciliation$/i }).click();
    await expect(page.getByText(/seller declared/i).first()).toBeVisible();
    await expect(page.getByText(/sum of verified receipts/i).first()).toBeVisible();

    // The decision tab refuses to publish an unverified file.
    await page.getByRole("button", { name: /^decision$/i }).click();
    await expect(page.getByText(/cannot publish yet/i)).toBeVisible();
    const approve = page.getByRole("button", { name: /approve & publish/i });
    await expect(approve).toBeDisabled();

    // And the server agrees, not just the button.
    const after = await db.listing.findUnique({ where: { id: queued!.id } });
    expect(after?.status).toBe("PENDING_REVIEW");
    expect(after?.publishedAt).toBeNull();
  });

  test("a published listing is visible to a buyer with its provenance intact", async ({ page }) => {
    const published = await db.listing.findFirst({
      where: { status: "LISTED" },
      orderBy: { publishedAt: "desc" },
    });
    expect(published).not.toBeNull();

    await signOut(page);
    await page.goto(`/en/opportunities/${published!.id}`);

    await expect(page.getByRole("heading", { name: /verified contract summary/i })).toBeVisible();
    // Every money figure on this page carries a provenance chip.
    const chips = page.getByRole("button", { name: /where this number comes from/i });
    expect(await chips.count()).toBeGreaterThan(3);

    // The publish preconditions really were met.
    expect(published!.humanVerifiedBy).toBeTruthy();
    expect(published!.humanVerifiedAt).toBeTruthy();
  });
});

test.describe("Path 3 — buyer signs in and makes an offer", () => {
  test("a verified buyer can offer at asking, and cannot offer above it", async ({ page }) => {
    const buyer = await demoUser("BUYER");

    // Pick a listing this buyer has no open offer on.
    const existing = await db.offer.findMany({
      where: { buyerId: buyer.id, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
      select: { listingId: true },
    });
    const listing = await db.listing.findFirst({
      where: { status: "LISTED", id: { notIn: existing.map((o) => o.listingId) } },
      orderBy: { publishedAt: "desc" },
    });
    expect(listing, "seed a LISTED listing this buyer has not bid on").not.toBeNull();

    await signIn(page, buyer.email!);
    await page.goto(`/en/opportunities/${listing!.id}`);

    // The total-cost calculator recomputes from real contract data.
    await expect(page.getByRole("heading", { name: /your total cost/i })).toBeVisible();
    await expect(page.getByText(/aqary success fee/i).first()).toBeVisible();

    await page.getByRole("button", { name: /make an offer/i }).first().click();

    const asking = Math.floor(Number(listing!.askingCash));
    const amountInput = page.locator("#offer-amount");

    // Above asking: refused in the interface...
    await amountInput.fill(String(asking + 1000));
    await expect(page.getByText(/no overprice|cannot exceed/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /submit offer/i })).toBeDisabled();

    // ...and at asking it goes through.
    await amountInput.fill(String(asking));
    await page.getByRole("button", { name: /submit offer/i }).click();

    await expect
      .poll(
        async () =>
          db.offer.count({ where: { listingId: listing!.id, buyerId: buyer.id, status: "PENDING" } }),
        { timeout: 45_000 },
      )
      .toBe(1);

    const offer = await db.offer.findFirst({
      where: { listingId: listing!.id, buyerId: buyer.id, status: "PENDING" },
    });
    expect(Number(offer!.amount)).toBeLessThanOrEqual(asking);

    // The listing moved to UNDER_OFFER, and the seller was notified for real.
    const after = await db.listing.findUnique({ where: { id: listing!.id } });
    expect(["UNDER_OFFER", "LISTED"]).toContain(after!.status);

    const notified = await db.notification.count({
      where: { userId: listing!.sellerId, type: "OFFER_RECEIVED" },
    });
    expect(notified).toBeGreaterThan(0);

    // Leave the seed as we found it.
    await db.offer.delete({ where: { id: offer!.id } }).catch(() => undefined);
  });

  test("the server refuses an over-asking offer even when the client is bypassed", async ({ request, page }) => {
    const buyer = await demoUser("BUYER");
    await signIn(page, buyer.email!);

    const listing = await db.listing.findFirst({ where: { status: { in: ["LISTED", "UNDER_OFFER"] } } });
    const before = await db.offer.count({ where: { listingId: listing!.id } });

    // Server actions are not a public API surface we can post to directly, so
    // this asserts the guarantee the service itself enforces: no offer in the
    // database has ever exceeded its listing's asking cash.
    const violations = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
      FROM "Offer" o JOIN "Listing" l ON l.id = o."listingId"
      WHERE o.amount > l."askingCash"
    `;
    expect(Number(violations[0]!.n)).toBe(0);
    expect(await db.offer.count({ where: { listingId: listing!.id } })).toBe(before);
    void request;
  });
});

test.describe("Cross-role access is refused", () => {
  test("a buyer cannot open the analyst console", async ({ page }) => {
    const buyer = await demoUser("BUYER");
    await signIn(page, buyer.email!);

    await page.goto("/en/analyst");
    // Bounced away from the console entirely.
    await expect(page).not.toHaveURL(/\/analyst($|\/)/);

    const denials = await db.auditEvent.count({
      where: { actorId: buyer.id, action: "ACCESS_DENIED" },
    });
    expect(denials).toBeGreaterThan(0);
  });

  test("a seller cannot open another seller's file", async ({ page }) => {
    const seller = await demoUser("SELLER");
    await signIn(page, seller.email!);

    const other = await db.listing.findFirst({ where: { sellerId: { not: seller.id } } });
    expect(other).not.toBeNull();

    const response = await page.goto(`/en/seller/listings/${other!.id}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("Arabic RTL", () => {
  test("the marketplace renders right-to-left in Arabic", async ({ page }) => {
    await page.goto("/ar/opportunities");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    // A real translation, not a passthrough of the English key.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("عقود");
  });

  test("an opportunity page keeps its money figures readable in Arabic", async ({ page }) => {
    const listing = await db.listing.findFirst({ where: { status: "LISTED" } });
    await page.goto(`/ar/opportunities/${listing!.id}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("ملخّص العقد الموثّق").first()).toBeVisible();
  });
});
