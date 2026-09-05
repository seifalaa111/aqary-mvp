import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { canTransition } from "@/lib/services/listings";
import { escalateListing, clearListingEscalation } from "@/lib/services/verification";
import { runJobNow, registerJob, enqueue } from "@/lib/services/jobs";
import { AUDIT_ACTIONS } from "@/lib/domain/audit-actions";

/**
 * Regressions for the defects found reviewing `phase-3-operations-platform`.
 *
 * Each test names the hole it closes, because a passing assertion whose purpose
 * is forgotten gets deleted the next time it is inconvenient.
 */
describe("Phase 3 review fixes", () => {
  // -------------------------------------------------------------------------
  describe("admin override cannot walk around the state machine", () => {
    it("rejects an edge the transition graph does not contain", () => {
      // The defect: adminOverrideListingStatus wrote `status` directly, so an
      // admin could move a SUBMITTED file straight to LISTED — no verified
      // fields, no analyst signature, no images — bypassing the publish gate
      // that approveAndPublish deliberately re-runs inside its own write.
      expect(canTransition("SUBMITTED", "LISTED")).toBe(false);
      expect(canTransition("DRAFT", "LISTED")).toBe(false);
      expect(canTransition("PENDING_REVIEW", "LISTED")).toBe(false);
      expect(canTransition("COMPLETED", "LISTED")).toBe(false);

      // The one legal route into LISTED, which the override now gates on
      // checkPublishReadiness before allowing.
      expect(canTransition("VERIFIED", "LISTED")).toBe(true);
    });

    it("guards every published listing behind an analyst signature", async () => {
      // The consequence the override would have produced: a LISTED row with no
      // signature. Asserted over real rows so a future bypass shows up here.
      const published = await prisma.listing.findMany({
        where: { status: { in: ["LISTED", "UNDER_OFFER"] } },
        select: { reference: true, humanVerifiedBy: true, humanVerifiedAt: true, publishedAt: true },
      });
      expect(published.length).toBeGreaterThan(0);
      for (const l of published) {
        expect(l.humanVerifiedBy, `${l.reference} signature`).toBeTruthy();
        expect(l.humanVerifiedAt, `${l.reference} signed at`).toBeTruthy();
        expect(l.publishedAt, `${l.reference} published at`).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("identity data never leaves the server unmasked", () => {
    it("masks national ID and phone in the admin users payload", async () => {
      // The defect: the page shipped plaintext nationalId and phone for every
      // user and "masked" them in React, so the values sat in the page payload
      // for anyone with view-source, and no reveal was ever audited.
      const src = readFileSync(
        join(process.cwd(), "src/app/[locale]/admin/users/page.tsx"),
        "utf8",
      );
      expect(src).toContain("maskNationalId(u.nationalId)");
      expect(src).toContain("maskPhone(u.phone)");
      expect(src).not.toMatch(/nationalId:\s*u\.nationalId\s*,/);
      expect(src).not.toMatch(/phone:\s*u\.phone\s*,/);
    });

    it("registers an auditable disclosure action", () => {
      expect(AUDIT_ACTIONS.USER_PII_REVEALED).toBe("USER_PII_REVEALED");
      const actions = readFileSync(join(process.cwd(), "src/app/actions/admin.ts"), "utf8");
      expect(actions).toContain("adminRevealUserIdentity");
      expect(actions).toContain("AUDIT_ACTIONS.USER_PII_REVEALED");
    });
  });

  // -------------------------------------------------------------------------
  describe("a failed job run is reported as a failure", () => {
    it("propagates the handler error instead of swallowing it", async () => {
      // The defect: Phase 3 removed `throw err` from runJobNow's catch, so
      // retryJob always resolved and the admin console showed green on a retry
      // that had failed again.
      const type = `test.always-fails.${Date.now()}`;
      registerJob(type, async () => {
        throw new Error("deliberate handler failure");
      });
      const job = await enqueue(type, {});
      try {
        await expect(runJobNow(job.id)).rejects.toThrow("deliberate handler failure");

        // The failure is still persisted, not only thrown.
        const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(after.lastError).toContain("deliberate handler failure");
        expect(["QUEUED", "DEAD"]).toContain(after.status);
      } finally {
        await prisma.job.delete({ where: { id: job.id } }).catch(() => undefined);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("escalation changes the file, not only the log", () => {
    it("marks the listing and clears it again", async () => {
      // The defect: escalateListing wrote an audit row and returned the listing
      // unchanged, so nothing in any queue or dashboard showed the file as
      // escalated — a button with no effect.
      const listing = await prisma.listing.findFirst({
        where: { status: { in: ["PENDING_REVIEW", "SUBMITTED", "LISTED"] }, escalatedAt: null },
        select: { id: true, assignedAnalystId: true, sellerId: true },
      });
      if (!listing) throw new Error("Seed the database first: npm run seed");

      const analyst = await prisma.user.findFirst({
        where: { roles: { has: "ANALYST" } },
        select: { id: true },
      });
      if (!analyst) throw new Error("No analyst in the seed");

      try {
        const escalated = await escalateListing({
          listingId: listing.id,
          analystId: analyst.id,
          reason: "Receipt totals do not reconcile with the developer statement",
        });
        expect(escalated.escalatedAt).toBeTruthy();
        expect(escalated.escalationReason).toContain("reconcile");
        expect(escalated.escalatedById).toBe(analyst.id);

        const cleared = await clearListingEscalation({
          listingId: listing.id,
          actorId: analyst.id,
          actorRole: "ADMIN",
          note: "test",
        });
        expect(cleared.escalatedAt).toBeNull();
        expect(cleared.escalationReason).toBeNull();
      } finally {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { escalatedAt: null, escalationReason: null, escalatedById: null },
        });
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("audit actions come from one registry", () => {
    it("writes the registry's names, not ad-hoc strings", () => {
      // The defect: audit-actions.ts had zero importers, and admin.ts wrote
      // "ADMIN_OVERRIDE" for both override and reassign — indistinguishable in
      // the trail — plus "ROLE_CHANGED" where the registry said
      // "USER_ROLE_CHANGED", so the audit filter could never match them.
      const src = readFileSync(join(process.cwd(), "src/app/actions/admin.ts"), "utf8");
      expect(src).toContain('from "@/lib/domain/audit-actions"');
      expect(src).toContain("AUDIT_ACTIONS.ADMIN_OVERRIDE_LISTING_STATUS");
      expect(src).toContain("AUDIT_ACTIONS.ADMIN_REASSIGN_ANALYST");
      expect(src).toContain("AUDIT_ACTIONS.USER_ROLE_CHANGED");
      expect(src).not.toMatch(/action:\s*"ADMIN_OVERRIDE"/);
      expect(src).not.toMatch(/action:\s*"ROLE_CHANGED"/);
    });

    it("offers every registry action as an audit filter, not just the loaded page", () => {
      const page = readFileSync(
        join(process.cwd(), "src/app/[locale]/admin/audit/page.tsx"),
        "utf8",
      );
      expect(page).toContain("Object.values(AUDIT_ACTIONS)");
      // Paging, so an operator can reach events older than the newest window.
      expect(page).toContain("cursor");
    });
  });

  // -------------------------------------------------------------------------
  describe("the analyst and admin consoles are actually separate", () => {
    it("has no analyst-side jobs or metrics route left behind", () => {
      // The defect: the split moved jobs and metrics under ADMIN-only /admin
      // but left the old pages in place, so any ANALYST could still reach the
      // same data at /analyst/jobs and /analyst/metrics.
      const analystRoutes = join(process.cwd(), "src/app/[locale]/analyst");
      for (const orphan of ["jobs", "metrics"]) {
        expect(() => readFileSync(join(analystRoutes, orphan, "page.tsx"), "utf8")).toThrow();
      }
    });

    it("does not point the documentation at a route that no longer exists", () => {
      for (const doc of ["CLAUDE.md", "README.md", "ASSUMPTIONS.md"]) {
        const text = readFileSync(join(process.cwd(), doc), "utf8");
        expect(text, `${doc} references a deleted route`).not.toContain("/analyst/jobs");
        expect(text, `${doc} references a deleted route`).not.toContain("/analyst/metrics");
      }
    });
  });
});
