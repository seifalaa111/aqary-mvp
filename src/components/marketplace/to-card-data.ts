import type { ListingCard } from "@/lib/queries/marketplace";
import type { OpportunityCardData } from "./opportunity-card";

/**
 * Maps a Prisma listing row to the shape the card renders. Every field here is
 * a database value or a computation over one — there is no place to slip a
 * literal in, which is the point.
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
  return {
    id: l.id,
    reference: l.reference,
    status: l.status,
    askingCash: l.askingCash?.toString() ?? null,
    installmentAmount: l.installmentAmount?.toString() ?? null,
    installmentFrequency: l.installmentFrequency,
    remainingInstallments: l.remainingInstallments,
    outstandingBalance: l.outstandingBalance?.toString() ?? null,
    deliveryDate: l.deliveryDate?.toISOString() ?? null,
    discountPctBps: l.discountPctBps,
    verificationScore: l.verificationScore,
    verificationBreakdown: l.verificationScoreBreakdown as OpportunityCardData["verificationBreakdown"],
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
