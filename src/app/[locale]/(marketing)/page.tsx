import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { CARD_SELECT } from "@/lib/queries/marketplace";
import { buyerPlatformFee, cancellationComparison } from "@/lib/domain/calculators";
import { formatMoney } from "@/lib/money";
import { toCardData } from "@/components/marketplace/to-card-data";
import { OpportunityCard } from "@/components/marketplace/opportunity-card";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { VerificationPanel } from "@/components/marketing/verification-panel";
import { EmptyState, buttonClass } from "@/components/ui/primitives";
import { Section, SectionHead, StatStrip, Figure, LineItem } from "@/components/ui/section";

export const dynamic = "force-dynamic";

/**
 * The public landing page.
 *
 * Sequence: what this is → proof it is real → which side you are on → the
 * economics → how the figures are verified → what it costs → the ask.
 * Each section uses a different composition on purpose; the previous page
 * repeated one editorial slab eight times.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const isAr = locale === "ar";
  const feePct = config.PLATFORM_FEE_BPS / 100;

  // Live from the database — if a listing is unpublished, it leaves this grid.
  const [preview, liveCount, stats] = await Promise.all([
    prisma.listing.findMany({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
      select: CARD_SELECT,
      orderBy: [{ discountPctBps: "desc" }],
      take: 3,
    }),
    prisma.listing.count({ where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false } }),
    marketStats(),
  ]);

  // The brief's worked example. Explicitly illustrative wherever it appears.
  const EXAMPLE_TOTAL = "10000000";
  const EXAMPLE_PAID = "2000000";
  const comparison = cancellationComparison({
    totalContractPrice: EXAMPLE_TOTAL,
    amountPaid: EXAMPLE_PAID,
    penaltyPctBps: 1500,
    cashViaAqary: EXAMPLE_PAID,
    refundWaitMonths: 36,
  });

  const bare = (v: Parameters<typeof formatMoney>[0]) =>
    formatMoney(v, { style: "bare", locale: isAr ? "ar" : "en" });

  return (
    <>
      {/* ================= 1. HERO ================= */}
      <section className="border-b border-rule bg-paper">
        <div className="shell grid gap-10 pb-12 pt-10 md:pb-16 md:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <p className="eyebrow mb-4">{t("eyebrow")}</p>
            <h1 className="display-hero max-w-xl text-ink">{t("heroTitle")}</h1>
            <p className="mt-4 max-w-lg text-md leading-relaxed text-ink-70">{t("heroSub")}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup?role=seller" className={buttonClass("inkPrimary", "lg")}>
                {t("heroCtaPrimary")} <span aria-hidden className="arrow-forward">→</span>
              </Link>
              <Link href="/opportunities" className={buttonClass("secondary", "lg")}>
                {t("heroCtaSecondary")} <span aria-hidden className="arrow-forward">→</span>
              </Link>
            </div>

            <ul className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-5">
              {[t("trust1"), t("trust2"), t("trust3")].map((line, i) => (
                <li key={line} className="flex items-center gap-2 text-xs text-ink-70">
                  {i > 0 ? <span className="text-ink-30" aria-hidden>·</span> : null}
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* The seller's own position, as the hero visual — the product's
              artefact rather than its argument. The cancellation comparison is
              made once, in the economics section, and not pre-empted here. */}
          <div className="rounded-lg border border-rule bg-paper-raised shadow-e2">
            <div className="flex items-baseline justify-between border-b border-rule px-5 py-3">
              <p className="eyebrow">{t("heroSheetTitle")}</p>
              <p className="font-mono text-2xs uppercase tracking-wider text-ink-30">
                {t("illustrative")}
              </p>
            </div>

            <div className="px-5 py-4">
              <dl>
                <LineItem label={t("heroSheetTotal")} value={bare(EXAMPLE_TOTAL)} />
                <LineItem
                  label={t("heroSheetPaid")}
                  value={
                    <span className="inline-flex items-baseline gap-2">
                      {bare(EXAMPLE_PAID)}
                      <span className="rounded-xs border border-verified/35 bg-verified-soft px-1 py-px font-mono text-[9px] uppercase tracking-wider text-verified">
                        {t("verifiedMark")}
                      </span>
                    </span>
                  }
                />
                <LineItem label={t("heroSheetSellerFee")} value={`${config.SELLER_FEE_BPS / 100}%`} />
                <LineItem
                  label={t("heroSheetBuyerFee", { pct: feePct })}
                  value={bare(buyerPlatformFee(EXAMPLE_TOTAL))}
                />
              </dl>

              <div className="mt-4 rounded-md bg-verified-soft p-4">
                <p className="eyebrow mb-1.5 text-verified">{t("heroSheetReceive")}</p>
                <Figure value={bare(EXAMPLE_PAID)} unit="EGP" tone="verified" />
              </div>
            </div>

            <p className="border-t border-rule px-5 py-3 text-2xs leading-relaxed text-ink-50">
              {t("heroSheetCap")}
            </p>
          </div>
        </div>
      </section>

      {/* ================= 2. MARKETPLACE PROOF ================= */}
      <Section wide>
        <SectionHead
          eyebrow={t("liveEyebrow")}
          title={t("liveTitle")}
          body={t("liveSub")}
          action={
            <Link href="/opportunities" className={buttonClass("secondary", "md")}>
              {t("liveCta")} <span aria-hidden className="arrow-forward">→</span>
            </Link>
          }
        />
        <p className="mt-3 font-mono text-2xs uppercase tracking-wider text-ink-50">
          {t("liveCount", { count: liveCount })}
        </p>

        <div className="mt-6">
          {preview.length === 0 ? (
            <EmptyState title={t("liveEmpty")} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
      </Section>

      {/* ================= 3. THE TWO PATHS ================= */}
      <Section tone="sunken">
        <SectionHead eyebrow={t("pathsEyebrow")} title={t("pathsTitle")} />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <PathCard
            href="/signup?role=seller"
            title={t("pathSellerTitle")}
            body={t("pathSellerBody")}
            cta={t("heroCtaPrimary")}
            accent
          />
          <PathCard
            href="/signup?role=buyer"
            title={t("pathBuyerTitle")}
            body={t("pathBuyerBody")}
            cta={t("heroCtaSecondary")}
          />
        </div>
      </Section>

      {/* ================= 4. ECONOMICS ================= */}
      <Section>
        <SectionHead eyebrow={t("econEyebrow")} title={t("econTitle")} body={t("compareSub")} />

        <div className="mt-7 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule lg:grid-cols-2">
          {/* Loss drawn to scale against the same 100% baseline on both sides. */}
          <div className="bg-paper-raised p-5 md:p-6">
            <p className="eyebrow mb-3">{t("compareCancelTitle")}</p>
            <Figure value={bare(comparison.refundIfCancelled)} unit="EGP" size="xl" tone="flagged" />
            <p className="mt-1.5 text-sm text-ink-50">
              {t("compareCancelRefund")} — {t("compareCancelWait")}
            </p>

            <div className="mt-6" aria-hidden>
              <div className="flex h-8 w-full overflow-hidden rounded-xs border border-rule">
                <div
                  className="flex items-center justify-center bg-flagged/85 text-2xs font-medium text-white"
                  style={{ inlineSize: "75%" }}
                >
                  −{formatMoney(comparison.penaltyAmount, { style: "compact" })}
                </div>
                <div
                  className="flex items-center justify-center bg-paper-sunken text-2xs text-ink-70"
                  style={{ inlineSize: "25%" }}
                >
                  {formatMoney(comparison.refundIfCancelled, { style: "compact" })}
                </div>
              </div>
              <div className="mt-2 flex justify-between font-mono text-2xs uppercase tracking-wider text-ink-50">
                <span>{t("compareCancelPenalty")}</span>
                <span>{t("compareCancelRefund")}</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-70">{t("compareCancelLoss")}</p>
          </div>

          <div className="bg-verified-soft p-5 md:p-6">
            <p className="eyebrow mb-3 text-verified">{t("compareAqaryTitle")}</p>
            <Figure value={bare(comparison.cashViaAqary)} unit="EGP" size="xl" tone="verified" />
            <p className="mt-1.5 text-sm text-ink-70">{t("compareAqaryCash")}</p>

            <div className="mt-6" aria-hidden>
              <div className="flex h-8 w-full overflow-hidden rounded-xs border border-verified/30">
                <div className="flex w-full items-center justify-center bg-verified text-2xs font-medium text-white">
                  {formatMoney(comparison.cashViaAqary, { style: "compact" })}
                </div>
              </div>
              <div className="mt-2 flex justify-between font-mono text-2xs uppercase tracking-wider text-verified/80">
                <span>
                  {t("compareAqaryFee")}: 0%
                </span>
                <span>100%</span>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-verified/25 pt-3">
              <span className="text-sm text-ink-70">{t("compareAqaryAdvantage")}</span>
              <span className="money text-money-sm font-semibold text-verified">
                +{bare(comparison.advantage)} EGP
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-2xs leading-relaxed text-ink-50">{t("econIllustrative")}</p>
      </Section>

      {/* ================= 5. VERIFICATION ================= */}
      <Section tone="ink">
        <SectionHead
          eyebrow={t("verifyEyebrow")}
          title={t("verifyTitle")}
          body={t("verifySub")}
          onInk
        />
        <div className="mt-7">
          <VerificationPanel
            sourceLabel={t("verifySourceLabel")}
            verifiedLabel={t("verifiedMark")}
            illustrativeLabel={t("illustrative")}
            rows={[
              {
                label: t("verifyPaidLabel"),
                value: bare(EXAMPLE_PAID),
                unit: "EGP",
                source: t("verifyPaidSource"),
              },
              {
                label: t("verifyInstallmentLabel"),
                value: bare("210900"),
                unit: t("verifyInstallmentUnit"),
                source: t("verifyInstallmentSource"),
              },
              {
                label: t("verifyRemainingLabel"),
                value: t("verifyRemainingValue"),
                source: t("verifyRemainingSource"),
              },
            ]}
          />
        </div>
        <p className="mt-3 text-2xs leading-relaxed text-ink-text-50">{t("verifySampleNote")}</p>

        <div className="mt-8">
          <StatStrip
            onInk
            items={[
              { value: stats.published, label: t("statContractsLive", { count: stats.published }) },
              { value: stats.developers, label: t("statDevelopers", { count: stats.developers }) },
              { value: stats.projects, label: t("statProjects", { count: stats.projects }) },
              { value: stats.completed, label: t("statCompleted", { count: stats.completed }) },
            ]}
          />
          <p className="mt-3 text-2xs leading-relaxed text-ink-text-50">{t("footerRights")}</p>
        </div>
      </Section>

      {/* ================= 6. FEES ================= */}
      <Section>
        <SectionHead
          eyebrow={t("feeEyebrow")}
          title={t("feeTitle", { pct: feePct })}
          action={
            <Link href="/fees" className={buttonClass("secondary", "md")}>
              {t("feeSeeAll")} <span aria-hidden className="arrow-forward">→</span>
            </Link>
          }
        />

        <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-3">
          <FeeTile label={t("feeSellerLabel")} value="0%" note={t("feeSellerNote")} />
          <FeeTile label={t("feeBuyerLabel")} value={`${feePct}%`} note={t("feeBuyerNote")} accent />
          <FeeTile
            label={t("feeDeveloperLabel")}
            value={t("feeDeveloperValue")}
            note={t("feeDeveloperNote")}
            small
          />
        </div>
      </Section>

      {/* ================= 7. FAQ + FINAL CTA ================= */}
      <Section bordered={false}>
        <div className="grid gap-10 lg:grid-cols-[1fr_320px] lg:gap-14">
          <div>
            <SectionHead title={t("faqTitle")} />
            <div className="mt-5">
              <FaqAccordion feePct={feePct} />
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-rule bg-paper-raised p-5">
              <h2 className="text-lg font-semibold text-ink">{t("finalTitle")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-70">{t("finalSub")}</p>
              <Link
                href="/signup?role=seller"
                className={buttonClass("inkPrimary", "md", "mt-5 w-full")}
              >
                {t("heroCtaPrimary")} <span aria-hidden className="arrow-forward">→</span>
              </Link>
              <Link
                href="/how-it-works"
                className={buttonClass("ghost", "md", "mt-2 w-full")}
              >
                {tn("howItWorks")}
              </Link>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function PathCard({
  href,
  title,
  body,
  cta,
  accent = false,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg border border-rule bg-paper-raised p-5 transition-colors hover:border-ink-50 md:p-6"
    >
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-70">{body}</p>
      <span
        className={
          accent
            ? "mt-5 text-sm font-semibold text-brass"
            : "mt-5 text-sm font-medium text-ink group-hover:text-brass"
        }
      >
        {cta} <span aria-hidden className="arrow-forward">→</span>
      </span>
    </Link>
  );
}

function FeeTile({
  label,
  value,
  note,
  accent = false,
  small = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={accent ? "bg-brass-soft p-5 md:p-6" : "bg-paper-raised p-5 md:p-6"}>
      <p className={accent ? "eyebrow mb-3 text-brass" : "eyebrow mb-3"}>{label}</p>
      <p
        className={
          small
            ? "text-lg font-semibold text-ink"
            : accent
              ? "money figure-xl text-brass"
              : "money figure-xl text-ink"
        }
      >
        {value}
      </p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-70">{note}</p>
    </div>
  );
}

async function marketStats() {
  const [developers, projects, published, completed] = await Promise.all([
    prisma.developer.count(),
    prisma.project.count(),
    prisma.listing.count({
      // Same predicate as `liveCount` and the marketplace grid — a private
      // listing must not inflate the "contracts live" figure beside them.
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
    }),
    prisma.deal.count({ where: { status: "COMPLETED" } }),
  ]);
  return { developers, projects, published, completed };
}
