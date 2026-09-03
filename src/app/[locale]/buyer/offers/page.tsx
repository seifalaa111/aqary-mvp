import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireRolePage } from "@/lib/auth/guard";
import { buyerOffers } from "@/lib/queries/offers";
import { countdown, egp, relativeTime } from "@/lib/format";
import { Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export const dynamic = "force-dynamic";

export default async function BuyerOffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyer" });
  const to = await getTranslations({ locale, namespace: "offer" });
  const isAr = locale === "ar";

  const offers = await buyerOffers(user.id);

  if (offers.length === 0) {
    return <EmptyState title={t("myOffers")} body="You have not made an offer yet." />;
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="mb-6 display-section text-ink">{t("myOffers")}</h1>
      <div className="flex flex-col gap-4">
        {offers.map((o) => {
          const project = o.listing.contract.unit.project;
          const cover = (o.listing.media[0]?.variants as { thumb?: string } | undefined)?.thumb;
          const live = o.status === "PENDING";
          return (
            <Card key={o.id}>
              <CardBody className="flex flex-wrap items-center gap-4">
                <Link href={`/opportunities/${o.listing.id}`} className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-paper-sunken">
                  {cover ? <Image src={cover} alt={o.listing.media[0]!.altEn} fill sizes="80px" className="object-cover" /> : null}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-2xs text-ink-30">{o.listing.reference}</p>
                  <Link href={`/opportunities/${o.listing.id}`} className="text-sm font-semibold text-ink hover:underline">
                    {isAr ? project.nameAr : project.nameEn} · {o.listing.contract.unit.unitCode}
                  </Link>
                  <p className="text-xs text-ink-50">{project.city}</p>
                  {o.message ? <p className="mt-1 max-w-lg text-xs italic text-ink-50">“{o.message}”</p> : null}
                </div>
                <div className="text-end">
                  <p className="money text-money-sm font-semibold text-ink">{egp(o.amount, { decimals: 0 })}</p>
                  <p className="money text-2xs text-ink-30">
                    {isAr ? "المطلوب" : "asking"} {egp(o.listing.askingCash, { style: "compact" })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                    <Badge tone={o.status === "ACCEPTED" ? "verified" : live ? "info" : "neutral"}>
                      {o.status.toLowerCase()}
                    </Badge>
                    {live ? (
                      <span className="money text-2xs text-ink-50">
                        {to("expiresIn", { time: countdown(o.expiresAt, locale) })}
                      </span>
                    ) : (
                      <span className="text-2xs text-ink-30">{relativeTime(o.respondedAt ?? o.createdAt, locale)}</span>
                    )}
                  </div>
                  {o.deal ? (
                    <Link href={`/deals/${o.deal.id}`} className="mt-1.5 block text-2xs text-info underline">
                      {o.deal.reference} →
                    </Link>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
