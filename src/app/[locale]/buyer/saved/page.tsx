import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { CARD_SELECT } from "@/lib/queries/marketplace";
import { toCardData } from "@/components/marketplace/to-card-data";
import { OpportunityCard } from "@/components/marketplace/opportunity-card";
import { Button, EmptyState, Eyebrow, Card, CardBody, buttonClass } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyer" });

  const [saved, searches] = await Promise.all([
    prisma.savedListing.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { listing: { select: CARD_SELECT } },
    }),
    prisma.savedSearch.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-6 display-section text-ink">{t("savedListings")}</h1>
        {saved.length === 0 ? (
          <EmptyState
            title={t("savedListings")}
            body="Nothing saved yet."
            action={
              <Link href="/opportunities" className={buttonClass("primary", "md")}>
            Browse opportunities
          </Link>
            }
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {saved.map((s) => (
              <OpportunityCard key={s.id} data={toCardData(s.listing, { locale, saved: true })} />
            ))}
          </div>
        )}
      </section>

      <section>
        <Eyebrow>{t("savedSearches")}</Eyebrow>
        <h2 className="mb-4 mt-1 font-display text-xl text-ink">{t("savedSearches")}</h2>
        {searches.length === 0 ? (
          <p className="text-sm text-ink-50">No saved searches.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {searches.map((s) => (
              <Card key={s.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{s.name}</p>
                    <p className="text-2xs text-ink-30">
                      {s.lastResultCount} matches · last run {relativeTime(s.lastRunAt, locale)} ·{" "}
                      alerts {s.alertsEnabled ? "on" : "off"}
                    </p>
                  </div>
                  <Link href={`/opportunities?${new URLSearchParams(
                    Object.entries(s.filters as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
                      if (Array.isArray(v)) acc[k] = v.join(",");
                      else if (v !== undefined && v !== null) acc[k] = String(v);
                      return acc;
                    }, {}),
                  ).toString()}`}>
                    <Button size="sm" variant="secondary">Run this search</Button>
                  </Link>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
