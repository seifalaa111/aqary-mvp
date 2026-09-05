import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp } from "@/lib/format";
import { Card, CardBody, Eyebrow } from "@/components/ui/primitives";
import { FunnelChart } from "@/components/analyst/funnel-chart";

export const dynamic = "force-dynamic";

export default async function AdminMetricsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const [
    verifiedListings,
    analystCount,
    submittedCount,
    listedCount,
    withOffers,
    completedDeals,
    allDeals,
    fieldStats,
  ] = await Promise.all([
    prisma.listing.findMany({
      where: { humanVerifiedAt: { not: null }, submittedAt: { not: null } },
      select: { submittedAt: true, humanVerifiedAt: true, humanVerifiedBy: true },
    }),
    prisma.user.count({ where: { roles: { has: "ANALYST" } } }),
    prisma.listing.count({ where: { status: { not: "DRAFT" } } }),
    prisma.listing.count({
      where: { status: { in: ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"] } },
    }),
    prisma.listing.count({ where: { offers: { some: {} } } }),
    prisma.deal.findMany({
      where: { status: "COMPLETED" },
      select: { cashToSeller: true, platformFee: true, createdAt: true, completedAt: true },
    }),
    prisma.deal.count(),
    prisma.contractField.findMany({
      where: { verifiedSource: { not: null } },
      select: { extractedNum: true, verifiedNum: true, verifiedSource: true },
    }),
  ]);

  // Median verification turnaround
  const durations = verifiedListings
    .map((l) => (l.humanVerifiedAt!.getTime() - l.submittedAt!.getTime()) / 3600000)
    .sort((a, b) => a - b);
  const medianHours = durations.length ? durations[Math.floor(durations.length / 2)]! : 0;

  // Throughput: files per analyst per day
  const spanDays =
    verifiedListings.length > 0
      ? Math.max(
          1,
          Math.ceil(
            (Date.now() - Math.min(...verifiedListings.map((l) => l.submittedAt!.getTime()))) / 86400000
          )
        )
      : 1;
  const filesPerDay = analystCount > 0 ? verifiedListings.length / analystCount / spanDays : 0;

  // Truthful extraction metrics: Adoption rate & Correction rate
  const totalVerifiedFields = fieldStats.length;
  const aiAdoptedCount = fieldStats.filter((f) => f.verifiedSource === "AI_EXTRACTED").length;
  const extractionAdoptionRate = totalVerifiedFields > 0 ? (aiAdoptedCount / totalVerifiedFields) * 100 : 0;

  const analystOverriddenCount = fieldStats.filter((f) => f.verifiedSource === "ANALYST_OVERRIDE").length;
  const correctionRate = totalVerifiedFields > 0 ? (analystOverriddenCount / totalVerifiedFields) * 100 : 0;

  // GMV & Revenue (Buyer success fee: 2% on completed deals, seller commission: 0%)
  const gmv = completedDeals.reduce((sum, d) => sum + Number(d.cashToSeller), 0);
  const revenue = completedDeals.reduce((sum, d) => sum + Number(d.platformFee), 0);

  const isAr = locale === "ar";

  return (
    <div className="space-y-8">
      <header>
        <Eyebrow>{isAr ? "ذكاء الأعمال والتشغيل" : "Business Intelligence"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "مؤشرات العمليات والأداء الحقيقي" : "Operational Metrics & Performance"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "بيانات تشغيلية دقيقة ومحسوبة مباشرة من السجلات الفعلية دون افتراضات أو تزييف."
            : "Transparent transactional metrics derived strictly from verified database records."}
        </p>
      </header>

      {/* Synthetic Benchmark Notice */}
      <div className="rounded-lg border border-brass/40 bg-brass-soft/30 p-4 text-xs text-ink-70 space-y-1">
        <p className="font-semibold text-ink flex items-center gap-1.5">
          <span>ℹ️</span>
          <span>{isAr ? "تنويه البيانات التجريبية" : "Demonstration Environment Notice"}</span>
        </p>
        <p>
          {isAr
            ? "المؤشرات الخاصة بأسعار المطور المقارنة وأسعار المتر التاريخية تمثل بيانات اختبارية (Synthetic Seed Data). جميع المؤشرات التشغيلية والمالية أدناه محسوبة من المعاملات المسجلة."
            : "Valuation comparables and historical developer pricing benchmarks represent synthetic seed models. All operational throughput, extraction adoption, and completion figures below are calculated from active database rows."}
        </p>
      </div>

      {/* Core KPIs */}
      <dl className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={isAr ? "معدل الإنجاز اليومي لكل محلل" : "Files per analyst / day"}
          value={filesPerDay.toFixed(1)}
        />
        <KpiCard
          label={isAr ? "وسيط زمن التوثيق" : "Median time to verify"}
          value={`${medianHours.toFixed(1)} hrs`}
        />
        <KpiCard
          label={isAr ? "معدل اعتماد الاستخراج الآلي" : "Extraction adoption rate"}
          value={`${extractionAdoptionRate.toFixed(1)}%`}
          hint={isAr ? "نسبة الحقول المعتمدة مباشرة من المحرك" : "Fields promoted directly from extraction without manual override"}
        />
        <KpiCard
          label={isAr ? "معدل التصحيح اليدوي" : "Extraction correction rate"}
          value={`${correctionRate.toFixed(1)}%`}
          hint={isAr ? "نسبة الحقول المعدلة يدويًا بواسطة المحلل" : "Fields requiring manual analyst correction"}
        />
      </dl>

      {/* Financials & Funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funnel Chart */}
        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-display text-base text-ink">
              {isAr ? "مسار التحويل: من العرض حتى الإتمام" : "Transaction Conversion Funnel"}
            </h2>
            <FunnelChart
              steps={[
                { label: isAr ? "عقود مسجلة" : "Submitted", value: submittedCount },
                { label: isAr ? "موثقة ومعروضة" : "Listed", value: listedCount },
                { label: isAr ? "تلقت عروضًا" : "With Offers", value: withOffers },
                { label: isAr ? "غرف صفقات مفتوحة" : "Active Deals", value: allDeals },
                { label: isAr ? "صفقات مكتملة" : "Completed", value: completedDeals.length },
              ]}
            />
          </CardBody>
        </Card>

        {/* Financial Economics */}
        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-display text-base text-ink">
              {isAr ? "الاقتصاديات والتحصيل المالي" : "Marketplace Economics & Revenue"}
            </h2>
            <p className="text-xs text-ink-50">
              {isAr
                ? "عمولة البائع 0%. رسوم نجاح المشتري 2% تُحصّل فقط عند إتمام نقل العقد رسميًا."
                : "Seller commission is strictly 0%. Buyer platform fee is 2% collected exclusively upon successful completion."}
            </p>

            <dl className="divide-y divide-rule text-sm">
              <div className="flex justify-between py-2.5">
                <dt className="text-ink-50">{isAr ? "إجمالي قيمة العقود المنقولة (GMV)" : "Completed GMV"}</dt>
                <dd className="money font-bold text-ink">{egp(gmv)}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-ink-50">{isAr ? "إيراد رسوم النجاح المحصلة (2%)" : "Success fee revenue (2%)"}</dt>
                <dd className="money font-bold text-verified">{egp(revenue)}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-ink-50">{isAr ? "الصفقات المنجزة بنجاح" : "Completed transactions"}</dt>
                <dd className="font-mono font-semibold text-ink">{completedDeals.length}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-ink-50">{isAr ? "متوسط قيمة الصفقة" : "Average deal size"}</dt>
                <dd className="money font-semibold text-ink">
                  {completedDeals.length > 0 ? egp(gmv / completedDeals.length) : "—"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-paper-raised p-5 space-y-1">
      <dt className="eyebrow text-2xs text-ink-50">{label}</dt>
      <dd className="money text-money-lg font-bold text-ink">{value}</dd>
      {hint && <p className="text-[11px] text-ink-50">{hint}</p>}
    </div>
  );
}
