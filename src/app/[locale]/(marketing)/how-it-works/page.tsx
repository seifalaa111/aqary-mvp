import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { cancellationComparison } from "@/lib/domain/calculators";
import { formatMoney } from "@/lib/money";
import { HowItWorksTabs } from "@/components/marketing/how-it-works-tabs";
import { ContractAnatomy } from "@/components/marketing/contract-anatomy";
import { VerificationPipeline } from "@/components/marketing/verification-pipeline";
import { Eyebrow, buttonClass } from "@/components/ui/primitives";
import { Section, SectionHead, LineItem } from "@/components/ui/section";

export const dynamic = "force-dynamic";

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tw = await getTranslations({ locale, namespace: "howItWorks" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const feePct = config.PLATFORM_FEE_BPS / 100;

  const medianNoc = await prisma.developerAssignmentPolicy
    .findMany({ select: { typicalNocDays: true }, where: { typicalNocDays: { not: null } } })
    .then((r) => {
      // True median, not the upper of the two middle values on an even count.
      const v = r.map((x) => x.typicalNocDays!).sort((a, b) => a - b);
      if (v.length === 0) return 0;
      const mid = Math.floor(v.length / 2);
      return v.length % 2 === 0 ? Math.round((v[mid - 1]! + v[mid]!) / 2) : v[mid]!;
    });

  const comparison = cancellationComparison({
    totalContractPrice: "10000000",
    amountPaid: "2000000",
    penaltyPctBps: 1500,
    cashViaAqary: "2000000",
  });

  return (
    <div>
      {/* ---- Process ---- */}
      <Section>
        <div className="max-w-3xl">
          <Eyebrow>{t("howEyebrow")}</Eyebrow>
          <h1 className="mb-3 mt-2 display-hero text-ink">{tw("title")}</h1>
          <p className="text-md leading-relaxed text-ink-70">{tw("sub")}</p>
        </div>
        <div id="seller" className="mt-8 scroll-mt-24">
          <HowItWorksTabs />
        </div>
      </Section>

      {/* ---- Contract anatomy ---- */}
      <Section tone="sunken">
        <SectionHead
          eyebrow={tw("anatomyEyebrow")}
          title={tw("anatomyTitle")}
          body={tw("anatomySub")}
        />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <ContractAnatomy
              totalContractPrice="10000000"
              amountPaid="2000000"
              locale={locale}
              labels={{
                total: tw("anatomyTotal"),
                paid: tw("anatomyPaid"),
                paidNote: tw("anatomyPaidNote"),
                remaining: tw("anatomyRemaining"),
                remainingNote: tw("anatomyRemainingNote"),
                buyerPays: tw("anatomyBuyerPays"),
                buyerContinues: tw("anatomyBuyerContinues"),
              }}
            />
            <p className="mt-3 text-2xs leading-relaxed text-ink-50">{tw("anatomyIllustrative")}</p>
          </div>

          {/* What each side actually pays, as a term sheet rather than two cards. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <dl className="rounded-lg border border-rule bg-paper-raised p-5">
              <p className="eyebrow mb-2">{tw("sellerSide")}</p>
              <LineItem label={tw("sellerCommission")} value={`${config.SELLER_FEE_BPS / 100}%`} />
              <LineItem label={tw("sellerAssessment")} value={tw("sellerAssessmentValue")} />
              <LineItem label={tw("sellerReceives")} value={tw("sellerReceivesValue")} />
              <LineItem label={tw("sellerIfIncomplete")} value={tw("sellerIfIncompleteValue")} />
            </dl>
            <dl className="rounded-lg border border-rule bg-paper-raised p-5">
              <p className="eyebrow mb-2">{tw("buyerSide")}</p>
              <LineItem label={tw("buyerFee")} value={`${feePct}%`} />
              <LineItem label={tw("buyerWhen")} value={tw("buyerWhenValue")} />
              <LineItem label={tw("buyerDeveloperFee")} value={tw("buyerDeveloperFeeValue")} />
              <LineItem label={tw("buyerOverprice")} value={tw("buyerOverpriceValue")} />
            </dl>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-rule bg-paper-raised p-5">
          <p className="text-sm leading-relaxed text-ink-70">
            {tw("workedExample", {
              refund: formatMoney(comparison.refundIfCancelled, { style: "compact" }),
              cash: formatMoney(comparison.cashViaAqary, { style: "compact" }),
            })}
          </p>
          <p className="mt-2 text-2xs text-ink-50">{t("econIllustrative")}</p>
        </div>
      </Section>

      {/* ---- Verification pipeline ---- */}
      <Section tone="ink">
        <SectionHead
          eyebrow={t("pipelineEyebrow")}
          title={t("pipelineTitle")}
          body={t("pipelineSub")}
          onInk
        />
        <VerificationPipeline
          humanGateLabel={tw("humanGate")}
          steps={[1, 2, 3, 4, 5].map((n) => ({
            title: t(`pipeline${n}` as "pipeline1"),
            sub: t(`pipeline${n}Sub` as "pipeline1Sub"),
          }))}
        />
      </Section>

      {/* ---- Developer step ---- */}
      <Section bordered={false}>
        <SectionHead
          title={tw("policyTitle")}
          body={tw("policyBody", { days: medianNoc })}
          action={
            <Link href="/fees" className={buttonClass("secondary", "md")}>
              {tn("fees")} <span aria-hidden className="arrow-forward">→</span>
            </Link>
          }
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup?role=seller" className={buttonClass("inkPrimary", "lg")}>
            {t("heroCtaPrimary")} <span aria-hidden className="arrow-forward">→</span>
          </Link>
          <Link href="/opportunities" className={buttonClass("secondary", "lg")}>
            {t("heroCtaSecondary")}
          </Link>
        </div>
      </Section>
    </div>
  );
}
