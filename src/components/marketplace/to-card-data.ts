import type { ListingCard } from "@/lib/queries/marketplace";
import { costFor } from "@/lib/queries/marketplace";
import type { OpportunityCardData } from "./opportunity-card";
import type { Provenance } from "@/components/ui/provenance";

/**
 * Maps a Prisma listing row to the shape the card renders. Every field here is
 * a database value or a computation over one — there is no place to slip a
 * literal in, which is the point. In particular `paidSource` is the analyst's
 * adopted source for the paid amount, not an assumption that it was a receipt.
 */
export function toCardData(
  l: ListingCard,
  opts: {
    locale?: string;
    match?: { score: number; headlineEn: string; headlineAr: string };
    affordability?: "WITHIN" | "STRETCH" | "ABOVE" | null;
    saved?: boolean;
  } = {},
): OpportunityCardData {
  const unit = l.contract.unit;
  const paidField = l.contract.fields.find((f) => f.key === "AMOUNT_PAID");
  const cost = costFor(l);
  return {
    id: l.id,
    reference: l.reference,
    status: l.status,
    askingCash: l.askingCash?.toString() ?? null,
    cashRequiredNow: cost.cashRequiredNow.toString(),
    totalContractPrice: l.totalContractPrice?.toString() ?? null,
    developerPriceToday: unit.currentDeveloperPrice?.toString() ?? null,
    installmentAmount: l.installmentAmount?.toString() ?? null,
    installmentFrequency: l.installmentFrequency,
    remainingInstallments: l.remainingInstallments,
    outstandingBalance: l.outstandingBalance?.toString() ?? null,
    deliveryDate: l.deliveryDate?.toISOString() ?? null,
    // Derived from the very cash figure this card shows, so the card, the
    // opportunity header and the cost breakdown state one discount.
    discountPctBps: cost.savingPctBps,
    verificationScore: l.verificationScore,
    verificationBreakdown: l.verificationScoreBreakdown as OpportunityCardData["verificationBreakdown"],
    paidSource: (paidField?.verifiedSource as Provenance | null) ?? null,
    publishedAt: l.publishedAt?.toISOString() ?? null,
    watchers: l._count.savedBy,
    offers: l._count.offers,
    projectNameEn: unit.project.nameEn,
    projectNameAr: unit.project.nameAr,
    developerNameEn: unit.project.developer.nameEn,
    developerNameAr: unit.project.developer.nameAr,
    city: unit.project.city,
    area: unit.project.area,
    unitType: unit.unitType,
    bedrooms: unit.bedrooms,
    buaSqm: unit.buaSqm.toString(),
    media: l.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      altEn: m.altEn,
      altAr: m.altAr,
      variants: m.variants as OpportunityCardData["media"][number]["variants"],
      blurhash: m.blurhash,
      dominantColor: m.dominantColor,
    })),
    matchScore: opts.match?.score,
    matchHeadlineEn: opts.match?.headlineEn,
    matchHeadlineAr: opts.match?.headlineAr,
    affordability: opts.affordability ?? null,
    saved: opts.saved ?? false,
  };
}
