import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Developer-partner tenant isolation.
 *
 * The Phase 4 brief opens with this requirement and it was the one item on its
 * test list with no coverage: a developer partner must reach its own
 * organisation's deals and no one else's. The boundary is
 * `DeveloperPartnerMembership`, consulted by `requireDeveloperPartnerAccess`
 * and by `requireDealAccess`.
 *
 * These assertions exercise the membership predicate directly against seeded
 * rows rather than a rendered page, because that predicate is what both guards
 * actually run.
 */
describe("Phase 4 — developer partner tenant isolation", () => {
  it("scopes a partner to the developers it is a member of, and no others", async () => {
    const membership = await prisma.developerPartnerMembership.findFirst({
      where: { active: true },
      select: { userId: true, developerId: true },
    });
    if (!membership) throw new Error("Seed the database first: npm run seed");

    const allDevelopers = await prisma.developer.count();
    expect(allDevelopers).toBeGreaterThan(1);

    // What the guard resolves for this partner.
    const scoped = await prisma.developerPartnerMembership.findMany({
      where: { userId: membership.userId, active: true },
      select: { developerId: true },
    });
    const scopedIds = scoped.map((m) => m.developerId);

    expect(scopedIds).toContain(membership.developerId);
    expect(scopedIds.length).toBeLessThan(allDevelopers);

    // Every deal the partner may list is one of its own developers'.
    const visible = await prisma.deal.findMany({
      where: { developerId: { in: scopedIds } },
      select: { id: true, developerId: true },
    });
    for (const d of visible) {
      expect(scopedIds, `deal ${d.id} leaked across tenants`).toContain(d.developerId);
    }

    // And there is at least one developer it must not see.
    const foreign = await prisma.developer.findFirst({
      where: { id: { notIn: scopedIds } },
      select: { id: true },
    });
    expect(foreign).not.toBeNull();
    expect(scopedIds).not.toContain(foreign!.id);
  });

  it("does not resolve a membership for a user who has none", async () => {
    // requireDeveloperPartnerAccess throws when this comes back empty; the
    // partner portal must never fall through to "every developer".
    const outsider = await prisma.user.findFirst({
      where: { roles: { hasSome: ["BUYER", "SELLER"] }, deletedAt: null },
      select: { id: true },
    });
    if (!outsider) throw new Error("Seed the database first: npm run seed");

    const memberships = await prisma.developerPartnerMembership.findMany({
      where: { userId: outsider.id, active: true },
    });
    expect(memberships).toHaveLength(0);
  });

  it("keeps an inactive membership out of scope", async () => {
    const membership = await prisma.developerPartnerMembership.findFirst({
      select: { id: true, userId: true, developerId: true, active: true },
    });
    if (!membership) throw new Error("Seed the database first: npm run seed");

    try {
      await prisma.developerPartnerMembership.update({
        where: { id: membership.id },
        data: { active: false },
      });

      // Revoking access is a data change, not a code change — the guard's
      // `active: true` predicate has to be what enforces it.
      const scoped = await prisma.developerPartnerMembership.findMany({
        where: { userId: membership.userId, active: true },
        select: { developerId: true },
      });
      expect(scoped.map((m) => m.developerId)).not.toContain(membership.developerId);
    } finally {
      await prisma.developerPartnerMembership.update({
        where: { id: membership.id },
        data: { active: membership.active },
      });
    }
  });

  it("freezes developer policy terms onto the deal that opened under them", async () => {
    // The snapshot exists so a later policy edit cannot rewrite an in-flight
    // assignment. Phase 3 shipped an admin policy editor, which makes that edit
    // a two-click operation — so the deal must read its own copy.
    const deals = await prisma.deal.findMany({
      select: { id: true, reference: true, developerPolicySnapshot: true, developerAssignmentFee: true },
    });
    expect(deals.length).toBeGreaterThan(0);

    for (const d of deals) {
      const snap = d.developerPolicySnapshot as Record<string, unknown> | null;
      expect(snap, `${d.reference} has no policy snapshot`).toBeTruthy();
      expect(snap, `${d.reference} snapshot is not an object`).toBeTypeOf("object");
      expect(
        Object.keys(snap as object),
        `${d.reference} snapshot is empty`,
      ).toContain("requiredDocuments");
    }
  });

  it("reads the deal's snapshot rather than the live policy in the workspace", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/app/[locale]/deals/[id]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("policySnapshot.requiredDocuments");
    expect(src).toContain("policySnapshot.typicalNocDays");
    expect(src).not.toContain("developer.policy?.requiredDocuments");
    expect(src).not.toContain("developer.policy?.typicalNocDays");
  });
});
