import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { config } from "@/lib/config";
import { egp } from "@/lib/format";
import { Card, CardBody, Eyebrow, cn } from "@/components/ui/primitives";
import { FunnelChart } from "@/components/analyst/funnel-chart";

export const dynamic = "force-dynamic";

/**
 * Every figure here is a query or a computation over rows. Nothing is authored.
 */
export default async function MetricsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const [
    verifiedListings,
    analystCount,
    listedCount,
    withOffers,
    completedDeals,
    allDeals,
    fieldStats,
    correctionEvents,
    verificationEvents,
    payments,
  ] = await Promise.all([
    prisma.listing.findMany({
      where: { humanVerifiedAt: { not: null }, submittedAt: { not: null } },
      select: { submittedAt: true, humanVerifiedAt: true, humanVerifiedBy: true },
    }),
    prisma.user.count({ where: { roles: { has: "ANALYST" } } }),
    prisma.listing.count({ where: { status: { in: ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"] } } }),
    prisma.listing.count({ where: { offers: { some: {} } } }),
    prisma.deal.findMany({ where: { status: "COMPLETED" }, select: { cashToSeller: true, platformFee: true, createdAt: true, completedAt: true } }),
    prisma.deal.count(),
    prisma.contractField.findMany({
      where: { verifiedSource: { not: null }, extractedNum: { not: null } },
      select: { extractedNum: true, verifiedNum: true, verifiedSource: true, extractedConfidence: true },
    }),
    prisma.auditEvent.count({ where: { action: "SELLER_CORRECTED_FIELD" } }),
    prisma.auditEvent.count({ where: { action: { in: ["FIELD_VERIFIED", "FIELD_OVERRIDDEN"] } } }),
    prisma.payment.groupBy({ by: ["status"], _count: true, _sum: { amount: true } }),
  ]);

  // Median time to verify, computed from the real timestamps.
  const durations = verifiedListings
    .map((l) => (l.humanVerifiedAt!.getTime() - l.submittedAt!.getTime()) / 3600000)
    .sort((a, b) => a - b);
  const medianHours = durations.length ? durations[Math.floor(durations.length / 2)]! : 0;

  // Files per analyst per day, over the window the data actually spans.
  const spanDays =
    verifiedListings.length > 0
      ? Math.max(
          1,
          (Math.max(...verifiedListings.map((l) => l.humanVerifiedAt!.getTime())) -
            Math.min(...verifiedListings.map((l) => l.submittedAt!.getTime()))) /
            86400000,
        )
      : 1;
  const filesPerAnalystPerDay = verifiedListings.length / Math.max(1, analystCount) / spanDays;

  // Field-level accuracy: how often the analyst adopted the extracted value
  // unchanged, and how far off it was when they did not.
  const adopted = fieldStats.filter((f) => f.verifiedSource === "AI_EXTRACTED").length;
  const accuracy = fieldStats.length > 0 ? (adopted / fieldStats.length) * 100 : 0;
  const deviations = fieldStats
    .filter((f) => f.verifiedNum && f.extractedNum)
    .map((f) => {
      const v = Number(f.verifiedNum);
      const e = Number(f.extractedNum);
      return v === 0 ? 0 : Math.abs(v - e) / v;
    });
  const meanDeviation = deviations.length
    ? (deviations.reduce((a, b) => a + b, 0) / deviations.length) * 100
    : 0;

  const gmv = completedDeals.reduce((a, d) => a + Number(d.cashToSeller), 0);
  const revenue = completedDeals.reduce((a, d) => a + Number(d.platformFee), 0);
  const medianCloseDays = completedDeals.length
    ? completedDeals
        .map((d) => ((d.completedAt ?? new Date()).getTime() - d.createdAt.getTime()) / 86400000)
        .sort((a, b) => a - b)[Math.floor(completedDeals.length / 2)]!
    : 0;

  const paymentTotals = payments.reduce(
    (acc, p) => ({ ...acc, [p.status]: { count: p._count, sum: Number(p._sum.amount ?? 0) } }),
    {} as Record<string, { count: number; sum: number }>,
  );

  return (
    <>
      <Eyebrow>{t("console")}</Eyebrow>
      <h1 className="mb-8 mt-1 display-section text-ink">{t("metrics")}</h1>

      <dl className="mb-8 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={t("metricFilesPerDay")}
          value={filesPerAnalystPerDay.toFixed(1)}
          note={`${verifiedListings.length} files verified by ${analystCount} analysts`}
        />
        <Metric
          label={t("metricMedianVerify")}
          value={medianHours < 24 ? `${medianHours.toFixed(1)}h` : `${(medianHours / 24).toFixed(1)}d`}
          note={`SLA target ${config.VERIFICATION_SLA_HOURS}h`}
          tone={medianHours <= config.VERIFICATION_SLA_HOURS ? "verified" : "flagged"}
        />
        <Metric
          label={t("metricAiAccuracy")}
          value={`${accuracy.toFixed(0)}%`}
          note={`extracted value adopted unchanged on ${adopted} of ${fieldStats.length} fields`}
        />
        <Metric
          label={t("metricCorrectionRate")}
          value={
            verificationEvents > 0
              ? `${((correctionEvents / verificationEvents) * 100).toFixed(1)}%`
              : "—"
          }
          note={`${correctionEvents} seller corrections against ${verificationEvents} verification actions`}
        />
      </dl>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <p className="eyebrow mb-4">{t("metricFunnel")}</p>
            <FunnelChart
              steps={[
                { label: "Published", value: listedCount },
                { label: "Received an offer", value: withOffers },
                { label: "Deal opened", value: allDeals },
                { label: "Completed", value: completedDeals.length },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow mb-4">Money</p>
            <dl className="rule-t">
              <Row label={t("metricGmv")} value={egp(gmv, { style: "compact" })} />
              <Row label={t("metricRevenue")} value={egp(revenue, { style: "compact" })} />
              <Row
                label="Median days to close"
                value={medianCloseDays > 0 ? medianCloseDays.toFixed(0) : "—"}
              />
              <Row label="Buyer fee" value={`${config.PLATFORM_FEE_BPS / 100}%`} />
              <Row label="Seller commission" value={`${config.SELLER_FEE_BPS / 100}%`} />
            </dl>

            <p className="eyebrow mb-2 mt-6">Payments</p>
            <dl className="rule-t">
              {["SUCCEEDED", "FAILED", "PROCESSING", "INITIATED"].map((s) =>
                paymentTotals[s] ? (
                  <Row
                    key={s}
                    label={`${s.toLowerCase()} (${paymentTotals[s]!.count})`}
                    value={egp(paymentTotals[s]!.sum, { style: "compact" })}
                  />
                ) : null,
              )}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <p className="eyebrow mb-3">Extraction quality</p>
          <p className="text-sm leading-relaxed text-ink-70">
            Across {fieldStats.length} fields where the engine produced a value and an analyst then signed
            one off, the analyst adopted the extracted figure unchanged {accuracy.toFixed(0)}% of the time.
            Where they did not, the extracted value sat {meanDeviation.toFixed(2)}% away from what was
            finally verified on average.
          </p>
          <p className="mt-3 text-2xs text-ink-30">
            Computed from ContractField rows, not sampled or estimated.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "verified" | "flagged";
}) {
  return (
    <div className="bg-paper-raised p-5">
      <dt className="eyebrow mb-2">{label}</dt>
      <dd
        className={cn(
          "money text-money-md font-semibold tracking-tight",
          tone === "verified" ? "text-verified" : tone === "flagged" ? "text-flagged" : "text-ink",
        )}
      >
        {value}
      </dd>
      {note ? <p className="mt-1.5 text-2xs leading-snug text-ink-30">{note}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
