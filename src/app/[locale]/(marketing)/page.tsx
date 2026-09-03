
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { CARD_SELECT } from "@/lib/queries/marketplace";
import { cancellationComparison } from "@/lib/domain/calculators";
import { formatMoney } from "@/lib/money";
import { toCardData } from "@/components/marketplace/to-card-data";
import { OpportunityCard } from "@/components/marketplace/opportunity-card";
import { CountUp } from "@/components/marketing/count-up";
import { HowItWorksTabs } from "@/components/marketing/how-it-works-tabs";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { VerificationPipeline } from "@/components/marketing/verification-pipeline";
import { HeroTermSheet } from "@/components/marketing/hero-term-sheet";
import { EmptyState } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const isAr = locale === "ar";

  // Live from the database — if a listing is unpublished, it leaves this grid.
  const [preview, stats] = await Promise.all([
    prisma.listing.findMany({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
      select: CARD_SELECT,
      orderBy: [{ discountPctBps: "desc" }],
      take: 3,
    }),
    marketStats(),
  ]);

  const comparison = cancellationComparison({
    totalContractPrice: "10000000",
    amountPaid: "2000000",
    penaltyPctBps: 1500,
    cashViaAqary: "2000000",
    refundWaitMonths: 36,
  });

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden border-b border-rule">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-5 pb-16 pt-14 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div className="max-w-2xl">
            <p className="eyebrow mb-6">{t("eyebrow")}</p>
            <h1 className="display-hero text-ink">
              {t("h1a")} <em className="font-display italic text-brass">{t("h1b")}</em>
              <br />
              {t("h1c")}
              <br />
              <span className="text-ink-50">{t("h1d")}</span>
            </h1>
            <p className="mt-7 max-w-xl text-md leading-relaxed text-ink-70">{t("sub")}</p>

            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              <PathCard
                href="/signup?role=seller"
                title={t("ctaSeller")}
                sub={t("ctaSellerSub")}
                tone="ink"
              />
              <PathCard
                href="/signup?role=buyer"
                title={t("ctaBuyer")}
                sub={t("ctaBuyerSub")}
                tone="paper"
              />
            </div>
          </div>

          {/* The product's own term sheet, as the hero visual. */}
          <HeroTermSheet locale={locale} comparison={comparison} />
        </div>
      </section>

      {/* ================= CANCELLATION VS AQARY ================= */}
      <section className="border-b border-rule bg-paper-sunken/60">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-8 md:py-24">
          <div className="max-w-3xl">
            <h2 className="display-section text-ink">
              {t("compareTitle")}{" "}
              <em className="font-display italic text-brass">{t("compareTitleEm")}</em>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-50">{t("compareSub")}</p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* Money lost, drawn to scale. */}
            <div className="rounded-lg border border-rule bg-paper-raised p-6 md:p-8">
              <p className="eyebrow mb-1">{t("compareCancelTitle")}</p>
              <p className="money mt-5 text-money-xl font-semibold text-flagged">
                {formatMoney(comparison.refundIfCancelled, { style: "bare", locale: isAr ? "ar" : "en" })}
                <span className="ms-2 text-lg font-normal text-ink-50">EGP</span>
              </p>
              <p className="mt-1 text-sm text-ink-50">
                {t("compareCancelRefund")} — {t("compareCancelWait")}
              </p>

              <div className="mt-7" aria-hidden>
                <div className="flex h-9 w-full overflow-hidden rounded-xs border border-rule">
                  <div
                    className="flex items-center justify-center bg-flagged/85 text-2xs font-medium text-white"
                    style={{ inlineSize: "75%" }}
                  >
                    −{formatMoney(comparison.penaltyAmount, { style: "compact" })}
                  </div>
                  <div className="flex items-center justify-center bg-paper-sunken text-2xs text-ink-70" style={{ inlineSize: "25%" }}>
                    {formatMoney(comparison.refundIfCancelled, { style: "compact" })}
                  </div>
                </div>
                <div className="mt-2 flex justify-between font-mono text-2xs uppercase tracking-wider text-ink-50">
                  <span>{t("compareCancelPenalty")}</span>
                  <span>{t("compareCancelRefund")}</span>
                </div>
              </div>

              <p className="mt-6 text-sm text-ink-70">{t("compareCancelLoss")}</p>
            </div>

            <div className="rounded-lg border border-verified/30 bg-verified-soft p-6 md:p-8">
              <p className="eyebrow mb-1 text-verified">{t("compareAqaryTitle")}</p>
              <p className="money mt-5 text-money-xl font-semibold text-verified">
                {formatMoney(comparison.cashViaAqary, { style: "bare", locale: isAr ? "ar" : "en" })}
                <span className="ms-2 text-lg font-normal text-verified/70">EGP</span>
              </p>
              <p className="mt-1 text-sm text-ink-70">{t("compareAqaryCash")}</p>

              <div className="mt-7" aria-hidden>
                <div className="flex h-9 w-full overflow-hidden rounded-xs border border-verified/30">
                  <div
                    className="flex items-center justify-center bg-verified text-2xs font-medium text-white"
                    style={{ inlineSize: "100%" }}
                  >
                    {formatMoney(comparison.cashViaAqary, { style: "compact" })}
                  </div>
                </div>
                <div className="mt-2 flex justify-between font-mono text-2xs uppercase tracking-wider text-verified/80">
                  <span>{t("compareAqaryFee")}: 0%</span>
                  <span>100%</span>
                </div>
              </div>

              <dl className="rule-t mt-6">
                <div className="rule-b flex items-baseline justify-between py-2.5">
                  <dt className="text-sm text-ink-70">{t("compareAqaryAdvantage")}</dt>
                  <dd className="money text-money-sm font-semibold text-verified">
                    +{formatMoney(comparison.advantage, { style: "bare" })} EGP
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="border-b border-rule">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-8 md:py-24">
          <p className="eyebrow mb-4">{t("howEyebrow")}</p>
          <h2 className="display-section mb-10 max-w-2xl text-ink">{t("howTitle")}</h2>
          <HowItWorksTabs />
        </div>
      </section>

      {/* ================= VERIFICATION PIPELINE ================= */}
      <section className="border-b border-rule bg-ink-surface text-ink-text">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-8 md:py-24">
          <p className="eyebrow mb-4 text-ink-text-50">{t("pipelineEyebrow")}</p>
          <h2 className="display-section max-w-2xl text-ink-text">{t("pipelineTitle")}</h2>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-text-70">{t("pipelineSub")}</p>
          <VerificationPipeline
            steps={[1, 2, 3, 4, 5].map((n) => ({
              title: t(`pipeline${n}` as "pipeline1"),
              sub: t(`pipeline${n}Sub` as "pipeline1Sub"),
            }))}
          />
        </div>
      </section>

      {/* ================= LIVE OPPORTUNITIES ================= */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-8 md:py-24">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="eyebrow mb-4">{t("liveEyebrow")}</p>
              <h2 className="display-section text-ink">{t("liveTitle")}</h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-50">{t("liveSub")}</p>
            </div>
            <Link
              href="/opportunities"
              className="inline-flex h-11 items-center rounded-sm border border-ink px-5 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-ink-text"
            >
              {t("liveCta")} →
            </Link>
          </div>

          {preview.length === 0 ? (
            <EmptyState title={t("liveEmpty")} />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {preview.map((l, i) => (
                <OpportunityCard
                  key={l.id}
                  data={toCardData(l, { locale })}
                  showSave={false}
                  priority={i === 0}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================= MARKET SCALE ================= */}
      <section className="border-b border-rule bg-paper-sunken/60">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-8 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="display-section text-ink">{t("marketTitle")}</h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-70">{t("marketSub")}</p>
              <p className="mt-6 max-w-md rounded-md border border-pending/30 bg-pending-soft px-4 py-3 text-xs leading-relaxed text-ink-70">
                {t("marketCaveat")}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule">
              <Stat value={99} suffix="%" label={t("marketStat1")} />
              <Stat value={0.3} suffix="%" decimals={1} label={t("marketStat2")} />
              <Stat value={500} suffix="k" label={t("marketStat3")} />
              <Stat value={3} prefix="EGP " suffix="tn" label={t("marketStat4")} />
            </dl>
          </div>
        </div>
      </section>

      {/* ================= FEES ================= */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-8 md:py-24">
          <p className="eyebrow mb-4">{t("feeEyebrow")}</p>
          <h2 className="display-section mb-12 max-w-3xl text-ink">{t("feeTitle")}</h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-rule bg-paper-raised p-8">
              <p className="eyebrow mb-4">{t("feeSellerLabel")}</p>
              <p className="money text-[5rem] font-semibold leading-none tracking-tighter text-ink">0%</p>
              <p className="mt-6 max-w-sm font-display text-lg italic leading-snug text-ink-70">
                “{t("feeSellerNote")}”
              </p>
            </div>
            <div className="rounded-lg border border-brass/35 bg-brass-soft p-8">
              <p className="eyebrow mb-4 text-brass">{t("feeBuyerLabel")}</p>
              <p className="money text-[5rem] font-semibold leading-none tracking-tighter text-brass">
                {config.PLATFORM_FEE_BPS / 100}%
              </p>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-ink-70">{t("feeBuyerNote")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= DEVELOPERS ================= */}
      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <div>
            <p className="eyebrow mb-4">{t("devEyebrow")}</p>
            <h2 className="display-section text-ink">{t("devTitle")}</h2>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-ink-70">{t("devSub")}</p>
            <Link
              href="/for-developers"
              className="mt-8 inline-flex h-11 items-center rounded-sm bg-ink px-5 text-sm font-medium text-ink-text transition-colors hover:bg-ink-90"
            >
              {t("devCta")} →
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-lg border border-rule bg-rule">
            <Stat value={stats.developers} label={isAr ? "مطوّر في مكتبة السياسات" : "developers in the policy library"} />
            <Stat value={stats.projects} label={isAr ? "مشروع" : "projects covered"} />
            <Stat value={stats.published} label={isAr ? "عقد موثّق منشور" : "verified contracts live"} />
            <Stat value={stats.completed} label={isAr ? "تنازل مكتمل" : "assignments completed"} />
          </dl>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section>
        <div className="mx-auto max-w-[900px] px-5 py-16 md:px-8 md:py-24">
          <h2 className="display-section mb-10 text-ink">{t("faqTitle")}</h2>
          <FaqAccordion />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function PathCard({
  href,
  title,
  sub,
  tone,
}: {
  href: string;
  title: string;
  sub: string;
  tone: "ink" | "paper";
}) {
  return (
    <Link
      href={href}
      className={
        tone === "ink"
          ? "group flex flex-col justify-between rounded-lg bg-ink p-5 text-ink-text transition-transform duration-200 hover:-translate-y-0.5"
          : "group flex flex-col justify-between rounded-lg border border-rule-strong bg-paper-raised p-5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-ink"
      }
    >
      <span
        className={
          tone === "ink"
            ? "font-display text-xl leading-snug"
            : "font-display text-xl leading-snug text-ink"
        }
      >
        {title}
      </span>
      <span
        className={
          tone === "ink"
            ? "mt-6 font-mono text-2xs uppercase tracking-wider text-ink-text-50"
            : "mt-6 font-mono text-2xs uppercase tracking-wider text-ink-50"
        }
      >
        {sub} →
      </span>
    </Link>
  );
}

function Stat({
  value,
  label,
  prefix,
  suffix,
  decimals,
}: {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <div className="bg-paper-raised p-6 md:p-8">
      <dd className="money text-money-lg font-semibold tracking-tight text-ink md:text-money-xl">
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </dd>
      <dt className="mt-2 text-xs leading-snug text-ink-50">{label}</dt>
    </div>
  );
}

async function marketStats() {
  const [developers, projects, published, completed] = await Promise.all([
    prisma.developer.count(),
    prisma.project.count(),
    prisma.listing.count({ where: { status: { in: ["LISTED", "UNDER_OFFER"] } } }),
    prisma.deal.count({ where: { status: "COMPLETED" } }),
  ]);
  return { developers, projects, published, completed };
}
