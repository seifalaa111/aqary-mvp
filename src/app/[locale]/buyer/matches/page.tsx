import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { CARD_SELECT, cashRequiredNow } from "@/lib/queries/marketplace";
import { affordability, type Frequency } from "@/lib/domain/calculators";
import { toCardData } from "@/components/marketplace/to-card-data";
import { OpportunityCard } from "@/components/marketplace/opportunity-card";
import { Button, EmptyState, buttonClass } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function MatchesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyer" });

  const profile = await prisma.buyerProfile.findUnique({ where: { userId: user.id } });
  if (!profile?.availableCash) {
    return (
      <EmptyState
        title={t("onboarding")}
        body={t("onboardingSub")}
        action={
          <Link href="/buyer/onboarding" className={buttonClass("primary", "md")}>
            {t("onboarding")}
          </Link>
        }
      />
    );
  }

  const matches = await prisma.match.findMany({
    where: { buyerId: user.id, score: { gt: 0 }, listing: { status: { in: ["LISTED", "UNDER_OFFER"] } } },
    orderBy: { score: "desc" },
    take: 24,
    include: { listing: { select: CARD_SELECT } },
  });

  const savedIds = new Set(
    (await prisma.savedListing.findMany({ where: { buyerId: user.id }, select: { listingId: true } })).map(
      (s) => s.listingId,
    ),
  );

  return (
    <div>
      <h1 className="mb-2 display-section text-ink">{t("matchesTitle", { count: matches.length })}</h1>
      <p className="mb-8 max-w-2xl text-sm text-ink-50">{t("matchesSub")}</p>

      {matches.length === 0 ? (
        <EmptyState
          title="Nothing fits your profile yet"
          body="Widen your cash range or your preferred cities, or check back — new contracts publish as analysts verify them."
          action={
            <Link href="/buyer/onboarding" className={buttonClass("secondary", "md")}>
            Adjust my profile
          </Link>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((m, i) => {
            const reasons = m.reasons as { headlineEn?: string; headlineAr?: string };
            const fit = affordability({
              availableCash: profile.availableCash!.toString(),
              maxInstallment: profile.maxInstallment?.toString() ?? 0,
              buyerFrequency: profile.installmentFrequency as Frequency,
              cashRequiredNow: cashRequiredNow(m.listing),
              listingInstallmentAmount: m.listing.installmentAmount?.toString() ?? 0,
              listingFrequency: (m.listing.installmentFrequency ?? "QUARTERLY") as Frequency,
            }).verdict;

            return (
              <OpportunityCard
                key={m.id}
                priority={i < 3}
                data={toCardData(m.listing, {
                  locale,
                  match: {
                    score: m.score,
                    headlineEn: reasons.headlineEn ?? "",
                    headlineAr: reasons.headlineAr ?? "",
                  },
                  affordability: fit,
                  saved: savedIds.has(m.listingId),
                })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
