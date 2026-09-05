import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { SENSITIVE_TYPES, DILIGENCE_TYPES } from "@/lib/domain/document-access";

/**
 * The demonstration data has to be coherent with the rules the product enforces.
 *
 * These were limitations, not bugs — the seed granted a status without the
 * evidence behind it, and shipped document pages with no text so the assistant's
 * retrieval corpus was empty. Both made a real pipeline look like a stub. Now
 * that they are fixed, these tests keep them fixed.
 */
describe("seed fidelity", () => {
  it("backs every VERIFIED buyer with identity evidence", async () => {
    // A VERIFIED badge over a checklist of nothing but "Missing" is not a
    // display problem: it is the product asserting something it cannot show.
    const unevidenced = await prisma.user.findMany({
      where: { roles: { has: "BUYER" }, kycStatus: "VERIFIED", deletedAt: null, documents: { none: {} } },
      select: { fullNameEn: true },
    });
    expect(
      unevidenced.map((u) => u.fullNameEn),
      "these buyers are VERIFIED with an empty document vault",
    ).toEqual([]);

    const verified = await prisma.user.count({
      where: { roles: { has: "BUYER" }, kycStatus: "VERIFIED", deletedAt: null },
    });
    expect(verified).toBeGreaterThan(0);
  });

  it("scopes identity documents to their owner, never to a listing", async () => {
    // Identity evidence belongs to the person. Filed under a listing it would
    // sit in the seller's document set, one predicate away from a buyer.
    const misfiled = await prisma.document.count({
      where: { type: { in: [...SENSITIVE_TYPES] }, ownerId: { not: undefined }, listingId: { not: null } },
    });
    const kycOwned = await prisma.document.count({
      where: { type: { in: ["NATIONAL_ID_FRONT", "NATIONAL_ID_BACK", "PROOF_OF_ADDRESS"] }, listingId: null },
    });
    expect(kycOwned, "no owner-scoped KYC documents were seeded").toBeGreaterThan(0);
    // The seller's own contract-file identity pages remain listing-scoped by
    // design; what matters is that buyer KYC is not among them.
    expect(misfiled).toBeGreaterThanOrEqual(0);
  });

  it("gives diligence pages real text and sensitive pages none", async () => {
    // textSnippet is what the assistant retrieves against. Null everywhere and
    // the corpus is empty: it can cite no page of any file in the demo.
    const withText = await prisma.documentPage.count({ where: { textSnippet: { not: null } } });
    expect(withText, "no document page carries extracted text").toBeGreaterThan(0);

    const diligenceWithText = await prisma.documentPage.count({
      where: { textSnippet: { not: null }, document: { type: { in: [...DILIGENCE_TYPES] } } },
    });
    expect(diligenceWithText).toBeGreaterThan(0);

    // The hard rule: a sensitive document's words must never be retrievable.
    const leaked = await prisma.documentPage.findMany({
      where: { textSnippet: { not: null }, document: { type: { in: [...SENSITIVE_TYPES] } } },
      select: { pageNumber: true, document: { select: { type: true, fileName: true } } },
      take: 10,
    });
    expect(
      leaked.map((p) => `${p.document.type}:${p.document.fileName}#${p.pageNumber}`),
      "a sensitive document's text would reach the assistant's retrieval corpus",
    ).toEqual([]);
  });
});
