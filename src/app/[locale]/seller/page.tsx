import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp, formatDate, relativeTime } from "@/lib/format";
import { Button, Card, CardBody, EmptyState, Eyebrow, buttonClass } from "@/components/ui/primitives";
import { Badge, StatusPill, VerificationScore } from "@/components/ui/badges";
import { StatusTracker } from "@/components/seller/status-tracker";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function SellerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });
  const tm = await getTranslations({ locale, namespace: "market" });
  const isAr = locale === "ar";

  const listings = await prisma.listing.findMany({
    where: { sellerId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      media: {
        where: { moderationStatus: { in: ["APPROVED", "PENDING"] } },
        orderBy: [{ isCover: "desc" }, { order: "asc" }],
        take: 1,
      },
      contract: {
        select: {
          unit: { select: { unitCode: true, bedrooms: true, buaSqm: true, project: { select: { nameEn: true, nameAr: true, city: true } } } },
        },
      },
      _count: { select: { offers: true, documents: true } },
    },
  });

  const totals = listings.reduce(
    (acc, l) => ({
      cash: acc.cash + Number(l.askingCash ?? 0),
      live: acc.live + (["LISTED", "UNDER_OFFER"].includes(l.status) ? 1 : 0),
      offers: acc.offers + l._count.offers,
    }),
    { cash: 0, live: 0, offers: 0 },
  );

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{t("dashboard")}</Eyebrow>
          <h1 className="mt-1 display-section text-ink">
            {t("welcome", { name: (isAr ? user.fullNameAr : user.fullNameEn)?.split(" ")[0] ?? "" })}
          </h1>
        </div>
        <Link href="/seller/new" className={buttonClass("primary", "lg")}>
            {t("newListing")}
          </Link>
      </header>

      {listings.length > 0 ? (
        <dl className="mb-8 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
          <Stat label={t("cashYouReceive")} value={egp(totals.cash, { style: "compact" })} />
          <Stat label={tm("verified")} value={String(totals.live)} />
          <Stat label={t("offersTitle")} value={String(totals.offers)} />
        </dl>
      ) : null}

      {listings.length === 0 ? (
        <EmptyState
          title={t("noListings")}
          body={t("noListingsSub")}
          action={
            <Link href="/seller/new" className={buttonClass("primary", "md")}>
            {t("newListing")}
          </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {listings.map((l) => {
            const cover = l.media[0];
            const variants = cover?.variants as { thumb?: string; card?: string } | null;
            const project = l.contract.unit.project;
            const progress = Math.round((l.wizardCompleted.length / 5) * 100);

            return (
              <Card key={l.id}>
                <CardBody className="p-0">
                  <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                    <div className="relative aspect-[4/3] bg-paper-sunken md:aspect-auto md:min-h-[190px]">
                      {variants?.card ? (
                        <Image
                          src={variants.card}
                          alt={cover?.altEn ?? ""}
                          fill
                          sizes="220px"
                          className="object-cover md:rounded-s-lg"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-4 text-center font-mono text-2xs uppercase tracking-wider text-ink-30">
                          no photographs yet
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-2xs uppercase tracking-wider text-ink-50">
                          {l.reference}
                        </span>
                        <StatusPill status={l.status} />
                        {l.verificationScore !== null ? (
                          <VerificationScore
                            score={l.verificationScore}
                            breakdown={l.verificationScoreBreakdown as never}
                            locale={locale}
                            size="sm"
                          />
                        ) : null}
                        {l._count.offers > 0 ? (
                          <Badge tone="info">{t("offersCount", { count: l._count.offers })}</Badge>
                        ) : null}
                      </div>

                      <h2 className="font-display text-xl text-ink">
                        {l.status === "DRAFT" && l.contract.unit.unitCode.startsWith("DRAFT-")
                          ? isAr
                            ? "مسودة بدون بيانات وحدة بعد"
                            : "Draft — unit details not entered yet"
                          : `${isAr ? project.nameAr : project.nameEn} · ${l.contract.unit.unitCode}`}
                      </h2>
                      <p className="mt-1 text-xs text-ink-50">
                        {project.city} · {l.contract.unit.bedrooms} bed ·{" "}
                        {Number(l.contract.unit.buaSqm).toFixed(0)} m² · updated{" "}
                        {relativeTime(l.updatedAt, locale)}
                      </p>

                      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div>
                          <p className="eyebrow mb-1">{t("cashYouReceive")}</p>
                          <p className="money text-money-md font-semibold text-ink">
                            {l.askingCash ? egp(l.askingCash, { decimals: 0 }) : "—"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {l.status === "DRAFT" ? (
                            <Link href={`/seller/listings/${l.id}/wizard`}>
                              <Button size="sm">
                                {t("resume")} · {t("step", { n: l.wizardStep })}
                              </Button>
                            </Link>
                          ) : (
                            <>
                              <Link href={`/seller/listings/${l.id}`}>
                                <Button size="sm" variant="secondary">
                                  Open file
                                </Button>
                              </Link>
                              {l._count.offers > 0 ? (
                                <Link href={`/seller/listings/${l.id}/offers`}>
                                  <Button size="sm">{t("offersTitle")}</Button>
                                </Link>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>

                      {l.status === "DRAFT" ? (
                        <div className="mt-4">
                          <div className="mb-1 flex justify-between text-2xs text-ink-50">
                            <span>{t("progress")}</span>
                            <span className="money">{progress}%</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-paper-sunken">
                            <div className="h-full rounded-full bg-brass" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-5">
                          <StatusTracker status={l.status} locale={locale} compact />
                        </div>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-raised p-5">
      <dt className="eyebrow mb-2">{label}</dt>
      <dd className="money text-money-md font-semibold tracking-tight text-ink">{value}</dd>
    </div>
  );
}
