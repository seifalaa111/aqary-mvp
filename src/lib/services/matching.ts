import "server-only";
import { Decimal } from "decimal.js";
import type { BuyerProfile, Listing, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import {
  MONTHS_PER_PERIOD,
  buyerPlatformFee,
  type Frequency,
} from "@/lib/domain/calculators";

/**
 * MatchingService — real scoring, never mocked.
 *
 * Financial compatibility dominates: a beautiful unit the buyer cannot fund is
 * not a match. Cash fit and installment fit carry 60 of the 100 points, and a
 * hard cash shortfall is recorded as a blocker rather than being scored away.
 */

export interface MatchReason {
  labelEn: string;
  labelAr: string;
  points: number;
  maxPoints: number;
}

export interface MatchBlocker {
  code: "CASH_SHORTFALL" | "INSTALLMENT_ABOVE_CAPACITY" | "DELIVERY_TOO_LATE" | "NO_FINANCIAL_PROFILE";
  labelEn: string;
  labelAr: string;
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
  blockers: MatchBlocker[];
  /** One computed sentence for the card. */
  headlineEn: string;
  headlineAr: string;
}

type ListingForMatch = Pick<
  Listing,
  | "id"
  | "askingCash"
  | "installmentAmount"
  | "installmentFrequency"
  | "deliveryDate"
  | "totalContractPrice"
  | "developerAssignmentFee"
  | "discountPctBps"
  | "verificationScore"
> & {
  contract: {
    unit: {
      unitType: string;
      bedrooms: number;
      buaSqm: Prisma.Decimal;
      finishing: string;
      project: { id: string; city: string; developerId: string; nameEn: string; nameAr: string };
    };
  };
};

const WEIGHTS = {
  cashFit: 32,
  installmentFit: 28,
  delivery: 10,
  location: 12,
  developerOrProject: 6,
  unitType: 5,
  bedrooms: 4,
  size: 3,
} as const;

export function scoreMatch(profile: BuyerProfile, listing: ListingForMatch): MatchResult {
  const reasons: MatchReason[] = [];
  const blockers: MatchBlocker[] = [];

  if (!profile.availableCash || !profile.maxInstallment) {
    return {
      score: 0,
      reasons: [],
      blockers: [
        {
          code: "NO_FINANCIAL_PROFILE",
          labelEn: "Complete your financial profile to see matches",
          labelAr: "أكمل ملفك المالي لعرض الفرص المناسبة",
        },
      ],
      headlineEn: "Complete your financial profile to see how this fits",
      headlineAr: "أكمل ملفك المالي لمعرفة مدى ملاءمة هذه الفرصة",
    };
  }

  const unit = listing.contract.unit;
  const project = unit.project;

  // --- Cash fit -----------------------------------------------------------
  const cashRequired = money(listing.askingCash ?? 0)
    .plus(buyerPlatformFee(listing.totalContractPrice ?? 0))
    .plus(money(listing.developerAssignmentFee ?? 0));
  const cash = money(profile.availableCash);
  const cashRatio = cashRequired.isZero() ? 1 : cash.div(cashRequired).toNumber();

  const cashPoints =
    cashRatio >= 1.35
      ? WEIGHTS.cashFit * 0.9 // comfortably over — slight penalty, capital sitting idle
      : cashRatio >= 1
        ? WEIGHTS.cashFit
        : cashRatio >= 0.85
          ? WEIGHTS.cashFit * 0.55
          : cashRatio >= 0.7
            ? WEIGHTS.cashFit * 0.2
            : 0;

  reasons.push({
    labelEn:
      cashRatio >= 1
        ? `Cash required is within your EGP ${cash.div(1_000_000).toFixed(2)}m`
        : `Cash required exceeds your available cash by EGP ${cashRequired.minus(cash).toFixed(0)}`,
    labelAr: cashRatio >= 1 ? "المبلغ النقدي في حدود المتاح لديك" : "المبلغ النقدي أعلى من المتاح لديك",
    points: round1(cashPoints),
    maxPoints: WEIGHTS.cashFit,
  });
  if (cashRatio < 0.85) {
    blockers.push({
      code: "CASH_SHORTFALL",
      labelEn: `Needs EGP ${cashRequired.minus(cash).toFixed(0)} more cash than your profile`,
      labelAr: `يحتاج ${cashRequired.minus(cash).toFixed(0)} جنيه إضافية`,
    });
  }

  // --- Installment fit ----------------------------------------------------
  const listingFreq = (listing.installmentFrequency ?? "QUARTERLY") as Frequency;
  const buyerFreq = profile.installmentFrequency as Frequency;
  const listingMonthly = money(listing.installmentAmount ?? 0).div(MONTHS_PER_PERIOD[listingFreq]);
  const buyerMonthly = money(profile.maxInstallment).div(MONTHS_PER_PERIOD[buyerFreq]);
  const instRatio = listingMonthly.isZero() ? 1 : buyerMonthly.div(listingMonthly).toNumber();

  const instPoints =
    instRatio >= 1.2
      ? WEIGHTS.installmentFit
      : instRatio >= 1
        ? WEIGHTS.installmentFit * 0.95
        : instRatio >= 0.9
          ? WEIGHTS.installmentFit * 0.5
          : instRatio >= 0.75
            ? WEIGHTS.installmentFit * 0.2
            : 0;

  reasons.push({
    labelEn:
      instRatio >= 1
        ? `Installment fits your ${describeFreq(buyerFreq)} capacity`
        : `Installment is ${Math.round((1 / Math.max(instRatio, 0.01) - 1) * 100)}% above your capacity`,
    labelAr: instRatio >= 1 ? "القسط في حدود قدرتك" : "القسط أعلى من قدرتك",
    points: round1(instPoints),
    maxPoints: WEIGHTS.installmentFit,
  });
  if (instRatio < 0.9) {
    blockers.push({
      code: "INSTALLMENT_ABOVE_CAPACITY",
      labelEn: "Installment exceeds your stated capacity",
      labelAr: "القسط يتجاوز القدرة المعلنة",
    });
  }

  // --- Delivery -----------------------------------------------------------
  let deliveryPoints = WEIGHTS.delivery * 0.5;
  if (profile.prefDeliveryByYear && listing.deliveryDate) {
    const year = listing.deliveryDate.getUTCFullYear();
    if (year <= profile.prefDeliveryByYear) deliveryPoints = WEIGHTS.delivery;
    else if (year <= profile.prefDeliveryByYear + 1) deliveryPoints = WEIGHTS.delivery * 0.5;
    else {
      deliveryPoints = 0;
      blockers.push({
        code: "DELIVERY_TOO_LATE",
        labelEn: `Delivers in ${year}, after your ${profile.prefDeliveryByYear} target`,
        labelAr: `التسليم ${year} بعد الموعد المفضّل`,
      });
    }
    reasons.push({
      labelEn: `Delivery ${year} against your ${profile.prefDeliveryByYear} target`,
      labelAr: `التسليم ${year} مقابل هدفك ${profile.prefDeliveryByYear}`,
      points: round1(deliveryPoints),
      maxPoints: WEIGHTS.delivery,
    });
  }

  // --- Location -----------------------------------------------------------
  let locationPoints = WEIGHTS.location * 0.35;
  if (profile.prefCities.length > 0) {
    const hit = profile.prefCities.includes(project.city);
    locationPoints = hit ? WEIGHTS.location : 0;
    reasons.push({
      labelEn: hit ? `${project.city} is on your list` : `${project.city} is outside your preferred areas`,
      labelAr: hit ? `${project.city} ضمن مناطقك المفضّلة` : `${project.city} خارج مناطقك المفضّلة`,
      points: round1(locationPoints),
      maxPoints: WEIGHTS.location,
    });
  }

  // --- Developer / project ------------------------------------------------
  let devPoints = WEIGHTS.developerOrProject * 0.4;
  if (profile.prefDeveloperIds.length > 0 || profile.prefProjectIds.length > 0) {
    const hit =
      profile.prefDeveloperIds.includes(project.developerId) || profile.prefProjectIds.includes(project.id);
    devPoints = hit ? WEIGHTS.developerOrProject : 0;
    if (hit) {
      reasons.push({
        labelEn: `${project.nameEn} is one of your preferred projects`,
        labelAr: `${project.nameAr} من مشاريعك المفضّلة`,
        points: round1(devPoints),
        maxPoints: WEIGHTS.developerOrProject,
      });
    }
  }

  // --- Unit type / bedrooms / size ---------------------------------------
  let typePoints = WEIGHTS.unitType * 0.4;
  if (profile.prefUnitTypes.length > 0) {
    typePoints = profile.prefUnitTypes.includes(unit.unitType as never) ? WEIGHTS.unitType : 0;
  }
  let bedPoints = WEIGHTS.bedrooms * 0.5;
  if (profile.prefBedroomsMin != null) {
    bedPoints = unit.bedrooms >= profile.prefBedroomsMin ? WEIGHTS.bedrooms : 0;
  }
  let sizePoints = WEIGHTS.size * 0.5;
  if (profile.prefBuaMin != null) {
    sizePoints = new Decimal(unit.buaSqm.toString()).gte(profile.prefBuaMin) ? WEIGHTS.size : 0;
  }

  const total =
    cashPoints + instPoints + deliveryPoints + locationPoints + devPoints + typePoints + bedPoints + sizePoints;
  const score = Math.max(0, Math.min(100, Math.round(total)));

  const headlineEn = buildHeadline(reasons, blockers, "en");
  const headlineAr = buildHeadline(reasons, blockers, "ar");

  return { score, reasons, blockers, headlineEn, headlineAr };
}

function buildHeadline(reasons: MatchReason[], blockers: MatchBlocker[], locale: "en" | "ar"): string {
  if (blockers.length > 0) {
    return locale === "en" ? blockers[0]!.labelEn : blockers[0]!.labelAr;
  }
  const best = reasons
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points / b.maxPoints - a.points / a.maxPoints)
    .slice(0, 2);
  if (best.length === 0) return locale === "en" ? "Partial fit" : "ملاءمة جزئية";
  return best.map((r) => (locale === "en" ? r.labelEn : r.labelAr)).join(locale === "en" ? " · " : " · ");
}

function describeFreq(f: Frequency): string {
  return { MONTHLY: "monthly", QUARTERLY: "quarterly", SEMI_ANNUAL: "semi-annual", ANNUAL: "annual" }[f];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const MATCH_INCLUDE = {
  contract: {
    select: {
      unit: {
        select: {
          unitType: true,
          bedrooms: true,
          buaSqm: true,
          finishing: true,
          project: { select: { id: true, city: true, developerId: true, nameEn: true, nameAr: true } },
        },
      },
    },
  },
} as const;

/** Recomputes every match for one buyer. Called after onboarding and profile edits. */
export async function recomputeMatchesForBuyer(buyerId: string): Promise<number> {
  const profile = await prisma.buyerProfile.findUnique({ where: { userId: buyerId } });
  if (!profile) return 0;

  const listings = await prisma.listing.findMany({
    where: { status: { in: ["LISTED", "UNDER_OFFER"] } },
    include: MATCH_INCLUDE,
  });

  let written = 0;
  for (const listing of listings) {
    const result = scoreMatch(profile, listing as unknown as ListingForMatch);
    await prisma.match.upsert({
      where: { listingId_buyerId: { listingId: listing.id, buyerId } },
      create: {
        listingId: listing.id,
        buyerId,
        score: result.score,
        reasons: result as unknown as object,
        blockers: result.blockers as unknown as object,
      },
      update: {
        score: result.score,
        reasons: result as unknown as object,
        blockers: result.blockers as unknown as object,
        computedAt: new Date(),
      },
    });
    written++;
  }
  return written;
}

/** Recomputes every buyer's match against one listing. Called when a listing publishes. */
export async function recomputeMatchesForListing(listingId: string): Promise<number> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: MATCH_INCLUDE });
  if (!listing) return 0;

  const profiles = await prisma.buyerProfile.findMany({
    where: { availableCash: { not: null }, maxInstallment: { not: null } },
  });

  let written = 0;
  for (const profile of profiles) {
    const result = scoreMatch(profile, listing as unknown as ListingForMatch);
    await prisma.match.upsert({
      where: { listingId_buyerId: { listingId, buyerId: profile.userId } },
      create: {
        listingId,
        buyerId: profile.userId,
        score: result.score,
        reasons: result as unknown as object,
        blockers: result.blockers as unknown as object,
      },
      update: {
        score: result.score,
        reasons: result as unknown as object,
        blockers: result.blockers as unknown as object,
        computedAt: new Date(),
      },
    });
    written++;
  }
  return written;
}
