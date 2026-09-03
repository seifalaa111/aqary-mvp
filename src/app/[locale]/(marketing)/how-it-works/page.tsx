import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { cancellationComparison } from "@/lib/domain/calculators";
import { formatMoney } from "@/lib/money";
import { HowItWorksTabs } from "@/components/marketing/how-it-works-tabs";
import { VerificationPipeline } from "@/components/marketing/verification-pipeline";
import { Button, Card, CardBody, Eyebrow, buttonClass } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const isAr = locale === "ar";

  const [policies, medianNoc] = await Promise.all([
    prisma.developerAssignmentPolicy.findMany({
      include: { developer: { select: { nameEn: true, nameAr: true } } },
      orderBy: { developer: { nameEn: "asc" } },
    }),
    prisma.developerAssignmentPolicy
      .findMany({ select: { typicalNocDays: true }, where: { typicalNocDays: { not: null } } })
      .then((r) => {
        const v = r.map((x) => x.typicalNocDays!).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)]! : 0;
      }),
  ]);

  const comparison = cancellationComparison({
    totalContractPrice: "10000000",
    amountPaid: "2000000",
    penaltyPctBps: 1500,
    cashViaAqary: "2000000",
  });

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-12 md:px-8 md:py-20">
      <Eyebrow>{t("howEyebrow")}</Eyebrow>
      <h1 className="mb-4 mt-2 display-hero text-ink">{t("howTitle")}</h1>
      <p className="mb-14 max-w-2xl text-md leading-relaxed text-ink-70">{t("sub")}</p>

      <section id="seller" className="mb-20">
        <HowItWorksTabs />
      </section>

      <section className="mb-20">
        <Eyebrow>{t("pipelineEyebrow")}</Eyebrow>
        <h2 className="mb-4 mt-2 display-section text-ink">{t("pipelineTitle")}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-50">{t("pipelineSub")}</p>
        <div className="mt-10 rounded-lg bg-ink-surface p-8 text-ink-text">
          <VerificationPipeline
            steps={[1, 2, 3, 4, 5].map((n) => ({
              title: t(`pipeline${n}` as "pipeline1"),
              sub: t(`pipeline${n}Sub` as "pipeline1Sub"),
            }))}
          />
        </div>
      </section>

      <section className="mb-20">
        <Eyebrow>{isAr ? "الأرقام" : "The money"}</Eyebrow>
        <h2 className="mb-8 mt-2 display-section text-ink">
          {isAr ? "ماذا يدفع كل طرف؟" : "What each side actually pays."}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardBody>
              <p className="eyebrow mb-3">{isAr ? "البائع" : "The seller"}</p>
              <dl className="rule-t">
                <Row label={isAr ? "عمولة أقاري" : "Aqary commission"} value="0" />
                <Row label={isAr ? "تقييم العقد" : "Contract assessment"} value={isAr ? "مجاني" : "free"} />
                <Row
                  label={isAr ? "ما يستلمه" : "What they receive"}
                  value={isAr ? "المبلغ الموثّق المدفوع" : "the verified amount paid"}
                />
                <Row
                  label={isAr ? "لو لم يتم النقل" : "If the transfer does not complete"}
                  value={isAr ? "لا رسوم" : "nothing"}
                />
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="eyebrow mb-3">{isAr ? "المشتري" : "The buyer"}</p>
              <dl className="rule-t">
                <Row
                  label={isAr ? "رسوم نجاح أقاري" : "Aqary success fee"}
                  value={`${config.PLATFORM_FEE_BPS / 100}%`}
                />
                <Row label={isAr ? "متى تُحصّل" : "When it is charged"} value={isAr ? "عند الإتمام فقط" : "on completion only"} />
                <Row
                  label={isAr ? "رسوم التنازل لدى المطوّر" : "Developer assignment fee"}
                  value={isAr ? "حسب المطوّر" : "set by the developer"}
                />
                <Row
                  label={isAr ? "أوفر برايس" : "Overprice"}
                  value={isAr ? "لا يوجد" : "none — structurally impossible"}
                />
              </dl>
            </CardBody>
          </Card>
        </div>

        <div className="mt-6 rounded-lg border border-rule bg-paper-sunken/60 p-6">
          <p className="text-sm leading-relaxed text-ink-70">
            {isAr
              ? `على وحدة بـ 10 مليون جنيه دفع صاحبها 2 مليون: الإلغاء يعيد له ${formatMoney(comparison.refundIfCancelled, { style: "compact" })} على ثلاث سنوات. النقل عبر أقاري يعيد له ${formatMoney(comparison.cashViaAqary, { style: "compact" })} نقدًا عند الإتمام.`
              : `On a EGP 10m unit where the holder has paid EGP 2m: cancelling returns ${formatMoney(comparison.refundIfCancelled, { style: "compact" })} over three years. Assigning through Aqary returns ${formatMoney(comparison.cashViaAqary, { style: "compact" })} in cash on completion.`}
          </p>
          <p className="mt-2 text-2xs text-ink-30">
            {isAr
              ? "أرقام توضيحية. نسب الخصم تختلف من عقد لآخر."
              : "Illustrative. Deduction percentages and refund terms differ from contract to contract."}
          </p>
        </div>
      </section>

      <section className="mb-16">
        <Eyebrow>{isAr ? "مكتبة السياسات" : "The policy library"}</Eyebrow>
        <h2 className="mb-3 mt-2 display-section text-ink">
          {isAr ? "شروط التنازل تختلف من مطوّر لآخر." : "Assignment terms differ by developer."}
        </h2>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-50">
          {isAr
            ? `نحتفظ بشروط كل مطوّر ونعرضها على كل فرصة. متوسط مدة إصدار الموافقة في هذه المكتبة ${medianNoc} يومًا.`
            : `We keep each developer's terms and show them on every opportunity. The median NOC turnaround across this library is ${medianNoc} days.`}
        </p>

        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[720px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="rule-b bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">Developer</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Assignment</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Fee</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Min % paid</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Min months</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">NOC days</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="rule-b">
                  <td className="p-3 text-ink">{isAr ? p.developer.nameAr : p.developer.nameEn}</td>
                  <td className="p-3 text-xs text-ink-70">
                    {p.assignmentAllowed.replace(/_/g, " ").toLowerCase()}
                  </td>
                  <td className="money p-3 text-end text-xs text-ink">
                    {p.feeType === "PERCENT"
                      ? `${((p.feePercentBps ?? 0) / 100).toFixed(2)}%`
                      : p.feeType === "FIXED"
                        ? formatMoney(p.feeFixedAmount?.toString() ?? 0, { style: "compact" })
                        : "—"}
                  </td>
                  <td className="money p-3 text-end text-xs text-ink-70">
                    {p.minPercentPaidBps ? `${p.minPercentPaidBps / 100}%` : "—"}
                  </td>
                  <td className="money p-3 text-end text-xs text-ink-70">{p.minMonthsElapsed ?? "—"}</td>
                  <td className="money p-3 text-end text-xs text-ink-70">{p.typicalNocDays ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-2xs text-ink-30">
          {isAr
            ? "أسماء المطوّرين حقيقية؛ كل الشروط أعلاه بيانات تجريبية في هذه النسخة."
            : "Developer names are real. Every policy above is synthetic in this build and must be confirmed with the developer — see ASSUMPTIONS.md."}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/signup?role=seller" className={buttonClass("primary", "lg")}>
            {t("ctaSeller")}
          </Link>
        <Link href="/opportunities" className={buttonClass("secondary", "lg")}>
            {t("liveCta")}
          </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-sm text-ink-70">{label}</dt>
      <dd className="money text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
