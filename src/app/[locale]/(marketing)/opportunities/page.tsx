import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import {
  marketplaceFacets,
  queryMarketplace,
  cashRequiredNow,
  type MarketplaceFilters,
  type SortKey,
} from "@/lib/queries/marketplace";
import { affordability, type Frequency } from "@/lib/domain/calculators";
import { expireDueOffers } from "@/lib/services/offers";
import { toCardData } from "@/components/marketplace/to-card-data";
import { OpportunityCard } from "@/components/marketplace/opportunity-card";
import { FilterRail } from "@/components/marketplace/filter-rail";
import { SortSelect } from "@/components/marketplace/sort-select";
import { Pagination } from "@/components/marketplace/pagination";
import { CompareTable } from "@/components/marketplace/compare-table";
import { MapView } from "@/components/marketplace/map-view";
import { ViewSwitch } from "@/components/marketplace/view-switch";
import { EmptyState, Button, buttonClass } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function str(sp: SP, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}
function num(sp: SP, k: string): number | undefined {
  const v = str(sp, k);
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function list(sp: SP, k: string): string[] | undefined {
  const v = sp[k];
  if (v === undefined) return undefined;
  const arr = (Array.isArray(v) ? v : v.split(",")).filter(Boolean);
  return arr.length ? arr : undefined;
}

export default async function MarketplacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "market" });

  // Offers that have run out of time expire on read, not on a cron guess.
  await expireDueOffers();

  const user = await getSessionUser();
  const buyerProfile = user
    ? await prisma.buyerProfile.findUnique({ where: { userId: user.id } })
    : null;

  const filters: MarketplaceFilters = {
    cashMin: num(sp, "cashMin"),
    cashMax: num(sp, "cashMax"),
    installmentMax: num(sp, "installmentMax"),
    discountMinPct: num(sp, "discountMin"),
    deliveryByYear: num(sp, "deliveryBy"),
    cities: list(sp, "cities"),
    developerIds: list(sp, "developers"),
    unitTypes: list(sp, "unitTypes"),
    bedroomsMin: num(sp, "bedroomsMin"),
    buaMin: num(sp, "buaMin"),
    finishing: list(sp, "finishing"),
    verificationMin: num(sp, "verificationMin"),
    assignmentReady: str(sp, "assignmentReady") === "1",
    deliveredOnly: str(sp, "delivered") === "1",
    q: str(sp, "q"),
  };

  const sort = (str(sp, "sort") ?? (buyerProfile ? "best-match" : "discount")) as SortKey;
  const view = (str(sp, "view") ?? "grid") as "grid" | "compare" | "map";
  const page = Math.max(1, num(sp, "page") ?? 1);

  const [result, facets] = await Promise.all([
    queryMarketplace({
      filters,
      sort,
      page,
      pageSize: view === "grid" ? 12 : 60,
      buyerId: buyerProfile ? user!.id : null,
    }),
    marketplaceFacets(),
  ]);

  const cards = result.items.map((l) => {
    let fit: "WITHIN" | "STRETCH" | "ABOVE" | null = null;
    if (buyerProfile?.availableCash && buyerProfile.maxInstallment) {
      fit = affordability({
        availableCash: buyerProfile.availableCash.toString(),
        maxInstallment: buyerProfile.maxInstallment.toString(),
        buyerFrequency: buyerProfile.installmentFrequency as Frequency,
        cashRequiredNow: cashRequiredNow(l),
        listingInstallmentAmount: l.installmentAmount?.toString() ?? 0,
        listingFrequency: (l.installmentFrequency ?? "QUARTERLY") as Frequency,
      }).verdict;
    }
    return {
      listing: l,
      card: toCardData(l, {
        locale,
        match: result.matches.get(l.id),
        affordability: fit,
        saved: result.savedIds.has(l.id),
      }),
    };
  });

  const hasFilters = Object.entries(sp).some(
    ([k, v]) => !["sort", "view", "page"].includes(k) && v !== undefined && v !== "",
  );

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-8 md:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-section text-ink">{t("title")}</h1>
          <p className="mt-2 text-sm text-ink-50" aria-live="polite">
            {t("resultCount", { count: result.total })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewSwitch
            current={view}
            labels={{ grid: t("viewGrid"), compare: t("viewCompare"), map: t("viewMap") }}
          />
          <SortSelect
            current={sort}
            hasProfile={Boolean(buyerProfile)}
            labels={{
              sortBy: t("sortBy"),
              "best-match": t("sortBestMatch"),
              discount: t("sortBiggestDiscount"),
              cash: t("sortLowestCash"),
              delivery: t("sortSoonestDelivery"),
              newest: t("sortNewest"),
              installment: t("sortLowestInstallment"),
            }}
          />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <FilterRail facets={facets} />

        <div className="min-w-0">
          {result.total === 0 ? (
            <EmptyState
              title={t("empty")}
              body={t("emptySub")}
              action={
                hasFilters ? (
                  <Link href="/opportunities" className={buttonClass("secondary", "md")}>
            {t("emptyAction")}
          </Link>
                ) : null
              }
            />
          ) : view === "compare" ? (
            <CompareTable items={cards.map((c) => c.card).slice(0, 4)} />
          ) : view === "map" ? (
            <MapView
              points={result.items.map((l) => ({
                id: l.id,
                lat: l.contract.unit.project.lat ?? 30.05,
                lng: l.contract.unit.project.lng ?? 31.5,
                label: locale === "ar" ? l.contract.unit.project.nameAr : l.contract.unit.project.nameEn,
                city: l.contract.unit.project.city,
                cash: l.askingCash?.toString() ?? "0",
                reference: l.reference,
                image:
                  (l.media[0]?.variants as { thumb?: string } | null)?.thumb ?? null,
              }))}
            />
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map(({ card }, i) => (
                  <OpportunityCard key={card.id} data={card} priority={i < 3} />
                ))}
              </div>
              <Pagination page={result.page} pageCount={result.pageCount} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
