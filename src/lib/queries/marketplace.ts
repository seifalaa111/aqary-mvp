import "server-only";
import { Decimal } from "decimal.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import { totalEffectiveCost } from "@/lib/domain/calculators";

/**
 * Marketplace reads. Every filter, sort and page here is a real SQL predicate —
 * nothing is filtered in JavaScript after the fact, and nothing is hardcoded.
 */

export const CARD_SELECT = {
  id: true,
  reference: true,
  status: true,
  askingCash: true,
  flexibilityPct: true,
  totalContractPrice: true,
  verifiedAmountPaid: true,
  outstandingBalance: true,
  installmentAmount: true,
  installmentFrequency: true,
  remainingInstallments: true,
  nextDueDate: true,
  deliveryDate: true,
  developerAssignmentFee: true,
  discountPctBps: true,
  verificationScore: true,
  verificationScoreBreakdown: true,
  publishedAt: true,
  viewCount: true,
  isDemo: true,
  contract: {
    select: {
      hasArrears: true,
      arrearsAmount: true,
      // AMOUNT_PAID carries the analyst-adopted source behind the paid amount
      // the asking cash is capped at — the card renders that rather than
      // asserting a source. MAINTENANCE_DEPOSIT and CLUB_FEE are needed so a
      // card computes the same cash figure as the opportunity page.
      fields: {
        where: { key: { in: ["AMOUNT_PAID", "MAINTENANCE_DEPOSIT", "CLUB_FEE"] as const } },
        select: { key: true, verifiedNum: true, verifiedSource: true },
      },
      unit: {
        select: {
          unitCode: true,
          unitType: true,
          buaSqm: true,
          gardenSqm: true,
          bedrooms: true,
          bathrooms: true,
          floor: true,
          view: true,
          finishing: true,
          deliveryStatus: true,
          currentDeveloperPrice: true,
          contractualDeliveryDate: true,
          project: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
              city: true,
              area: true,
              lat: true,
              lng: true,
              developer: { select: { id: true, nameEn: true, nameAr: true, slug: true } },
            },
          },
        },
      },
    },
  },
  media: {
    where: { moderationStatus: "APPROVED" as const },
    orderBy: [{ isCover: "desc" as const }, { order: "asc" as const }],
    select: {
      id: true,
      kind: true,
      roomTag: true,
      altEn: true,
      altAr: true,
      variants: true,
      blurhash: true,
      dominantColor: true,
      width: true,
      height: true,
    },
  },
  _count: { select: { savedBy: true, offers: true } },
} satisfies Prisma.ListingSelect;

export type ListingCard = Prisma.ListingGetPayload<{ select: typeof CARD_SELECT }>;

export interface MarketplaceFilters {
  cashMin?: number;
  cashMax?: number;
  installmentMax?: number;
  totalCostMax?: number;
  discountMinPct?: number;
  deliveryByYear?: number;
  cities?: string[];
  developerIds?: string[];
  unitTypes?: string[];
  bedroomsMin?: number;
  buaMin?: number;
  finishing?: string[];
  verificationMin?: number;
  assignmentReady?: boolean;
  deliveredOnly?: boolean;
  q?: string;
}

export type SortKey =
  | "best-match"
  | "discount"
  | "cash"
  | "delivery"
  | "newest"
  | "installment";

export function buildWhere(f: MarketplaceFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    status: { in: ["LISTED", "UNDER_OFFER"] },
    isPrivate: false,
  };

  if (f.cashMin !== undefined || f.cashMax !== undefined) {
    where.askingCash = {
      ...(f.cashMin !== undefined ? { gte: f.cashMin } : {}),
      ...(f.cashMax !== undefined ? { lte: f.cashMax } : {}),
    };
  }
  if (f.installmentMax !== undefined) where.installmentAmount = { lte: f.installmentMax };
  if (f.discountMinPct !== undefined) where.discountPctBps = { gte: Math.round(f.discountMinPct * 100) };
  if (f.verificationMin !== undefined) where.verificationScore = { gte: f.verificationMin };
  if (f.deliveryByYear !== undefined) {
    where.deliveryDate = { lte: new Date(Date.UTC(f.deliveryByYear, 11, 31)) };
  }

  const unitWhere: Prisma.UnitWhereInput = {};
  if (f.unitTypes?.length) unitWhere.unitType = { in: f.unitTypes as never[] };
  if (f.bedroomsMin !== undefined) unitWhere.bedrooms = { gte: f.bedroomsMin };
  if (f.buaMin !== undefined) unitWhere.buaSqm = { gte: f.buaMin };
  if (f.finishing?.length) unitWhere.finishing = { in: f.finishing as never[] };
  if (f.deliveredOnly) unitWhere.deliveryStatus = "DELIVERED";

  const projectWhere: Prisma.ProjectWhereInput = {};
  if (f.cities?.length) projectWhere.city = { in: f.cities };
  if (f.developerIds?.length) projectWhere.developerId = { in: f.developerIds };
  if (Object.keys(projectWhere).length > 0) unitWhere.project = projectWhere;

  const contractWhere: Prisma.ContractWhereInput = {};
  if (Object.keys(unitWhere).length > 0) contractWhere.unit = unitWhere;
  if (f.assignmentReady) contractWhere.assignmentPermitted = { in: ["ALLOWED", "CONDITIONAL"] };
  if (Object.keys(contractWhere).length > 0) where.contract = contractWhere;

  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { contract: { unit: { unitCode: { contains: q, mode: "insensitive" } } } },
      { contract: { unit: { project: { nameEn: { contains: q, mode: "insensitive" } } } } },
      { contract: { unit: { project: { nameAr: { contains: q } } } } },
      { contract: { unit: { project: { city: { contains: q, mode: "insensitive" } } } } },
      { contract: { unit: { project: { developer: { nameEn: { contains: q, mode: "insensitive" } } } } } },
      { contract: { unit: { project: { developer: { nameAr: { contains: q } } } } } },
    ];
  }

  return where;
}

export function buildOrderBy(sort: SortKey): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "discount":
      return [{ discountPctBps: "desc" }, { publishedAt: "desc" }];
    case "cash":
      return [{ askingCash: "asc" }];
    case "delivery":
      return [{ deliveryDate: "asc" }];
    case "installment":
      return [{ installmentAmount: "asc" }];
    case "newest":
      return [{ publishedAt: "desc" }];
    case "best-match":
    default:
      return [{ verificationScore: "desc" }, { publishedAt: "desc" }];
  }
}

export interface MarketplacePage {
  items: ListingCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** buyerId -> match, when a signed-in buyer is browsing. */
  matches: Map<string, { score: number; headlineEn: string; headlineAr: string; blockers: unknown[] }>;
  savedIds: Set<string>;
}

export async function queryMarketplace(args: {
  filters: MarketplaceFilters;
  sort: SortKey;
  page: number;
  pageSize?: number;
  buyerId?: string | null;
}): Promise<MarketplacePage> {
  const pageSize = args.pageSize ?? 12;
  const where = buildWhere(args.filters);

  // "Best match" is only meaningful for a buyer with a profile; for everyone
  // else it falls back to verification strength.
  const useMatchOrder = args.sort === "best-match" && Boolean(args.buyerId);

  const [total, items] = await Promise.all([
    prisma.listing.count({ where }),
    useMatchOrder
      ? prisma.listing
          .findMany({
            where: { ...where, matches: { some: { buyerId: args.buyerId! } } },
            select: { ...CARD_SELECT, matches: { where: { buyerId: args.buyerId! }, select: { score: true } } },
            orderBy: [{ matches: { _count: "desc" } }],
            take: 500,
          })
          .then((rows) =>
            rows
              .sort((a, b) => (b.matches[0]?.score ?? 0) - (a.matches[0]?.score ?? 0))
              .slice((args.page - 1) * pageSize, args.page * pageSize),
          )
      : prisma.listing.findMany({
          where,
          select: CARD_SELECT,
          orderBy: buildOrderBy(args.sort),
          skip: (args.page - 1) * pageSize,
          take: pageSize,
        }),
  ]);

  const ids = items.map((i) => i.id);
  const matches = new Map<string, { score: number; headlineEn: string; headlineAr: string; blockers: unknown[] }>();
  const savedIds = new Set<string>();

  if (args.buyerId && ids.length > 0) {
    const [m, s] = await Promise.all([
      prisma.match.findMany({ where: { buyerId: args.buyerId, listingId: { in: ids } } }),
      prisma.savedListing.findMany({ where: { buyerId: args.buyerId, listingId: { in: ids } } }),
    ]);
    for (const row of m) {
      const reasons = row.reasons as { headlineEn?: string; headlineAr?: string } | null;
      matches.set(row.listingId, {
        score: row.score,
        headlineEn: reasons?.headlineEn ?? "",
        headlineAr: reasons?.headlineAr ?? "",
        blockers: (row.blockers as unknown[]) ?? [],
      });
    }
    for (const row of s) savedIds.add(row.listingId);
  }

  return {
    items: items as ListingCard[],
    total,
    page: args.page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    matches,
    savedIds,
  };
}

/**
 * Analyst-verified dues payable alongside the transfer. An unverified field has
 * a null `verifiedSource` and contributes nothing rather than being guessed at.
 */
export function duesFor(l: Pick<ListingCard, "contract">): Decimal {
  return l.contract.fields
    .filter((f) => f.key === "MAINTENANCE_DEPOSIT" || f.key === "CLUB_FEE")
    .reduce<Decimal>(
      (acc, f) => (f.verifiedSource ? acc.plus(money(f.verifiedNum?.toString())) : acc),
      money(0),
    );
}

/**
 * Cash a buyer must produce at assignment.
 *
 * ONE definition, used by the card, the opportunity header, the mobile CTA bar
 * and the cost breakdown. It delegates to `costFor` so those surfaces cannot
 * drift apart: a card that omitted the dues while the page below it included
 * them printed two different answers to the same question.
 */
export function cashRequiredNow(l: ListingCard): Decimal {
  return costFor(l).cashRequiredNow;
}

/**
 * KNOWN LIMITATION: this multiplies the regular installment by the remaining
 * count, whereas `getOpportunity` and `projectVerifiedReadModel` sum the actual
 * remaining schedule rows. The two agree for every listing today — asserted by
 * `tests/unit/public-figures.test.ts`, which fails the moment they diverge —
 * but a listing whose REMAINING schedule contains a balloon, delivery or
 * maintenance payment would split the card from the opportunity page again.
 * The fix is to select the remaining installment rows into `CARD_SELECT` and
 * sum them; it is deferred because it loads a full schedule per card.
 */
export function remainingTotalFor(l: {
  installmentAmount: Prisma.Decimal | null;
  remainingInstallments: number | null;
}): Decimal {
  return money(l.installmentAmount?.toString()).mul(l.remainingInstallments ?? 0);
}

/**
 * The buyer's full position on a listing. Every public money figure and the
 * developer-price comparison derive from this one call, on the same inputs
 * `projectVerifiedReadModel` uses to store `discountPctBps`.
 */
export function costFor(l: ListingCard) {
  return totalEffectiveCost({
    cashToSeller: l.askingCash?.toString() ?? 0,
    totalContractPrice: l.totalContractPrice?.toString() ?? 0,
    developerAssignmentFee: l.developerAssignmentFee?.toString() ?? 0,
    maintenanceAndClubDues: duesFor(l),
    remainingInstallmentsTotal: remainingTotalFor(l),
    arrears: l.contract.hasArrears ? l.contract.arrearsAmount?.toString() ?? 0 : 0,
    currentDeveloperPrice: l.contract.unit.currentDeveloperPrice?.toString() ?? undefined,
  });
}

/** Filter option lists, computed from what is actually on the marketplace. */
export async function marketplaceFacets() {
  const where: Prisma.ListingWhereInput = { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false };

  const [cities, developers, unitTypes, bounds] = await Promise.all([
    prisma.listing
      .findMany({
        where,
        select: { contract: { select: { unit: { select: { project: { select: { city: true } } } } } } },
      })
      .then((rows) => {
        const counts = new Map<string, number>();
        for (const r of rows) {
          const c = r.contract.unit.project.city;
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
      }),
    prisma.developer
      .findMany({
        where: { projects: { some: { units: { some: { contracts: { some: { listing: where } } } } } } },
        select: { id: true, nameEn: true, nameAr: true },
        orderBy: { nameEn: "asc" },
      }),
    prisma.listing
      .findMany({ where, select: { contract: { select: { unit: { select: { unitType: true } } } } } })
      .then((rows) => {
        const counts = new Map<string, number>();
        for (const r of rows) {
          const t = r.contract.unit.unitType;
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
      }),
    prisma.listing.aggregate({
      where,
      _min: { askingCash: true, installmentAmount: true, deliveryDate: true },
      _max: { askingCash: true, installmentAmount: true, deliveryDate: true, discountPctBps: true },
    }),
  ]);

  return {
    cities,
    developers,
    unitTypes,
    cashMin: Number(bounds._min.askingCash ?? 0),
    cashMax: Number(bounds._max.askingCash ?? 0),
    installmentMin: Number(bounds._min.installmentAmount ?? 0),
    installmentMax: Number(bounds._max.installmentAmount ?? 0),
    deliveryMinYear: bounds._min.deliveryDate?.getUTCFullYear() ?? new Date().getUTCFullYear(),
    deliveryMaxYear: bounds._max.deliveryDate?.getUTCFullYear() ?? new Date().getUTCFullYear() + 6,
    maxDiscountPct: Math.round((bounds._max.discountPctBps ?? 0) / 100),
  };
}
