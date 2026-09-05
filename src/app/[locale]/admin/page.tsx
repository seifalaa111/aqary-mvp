import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp, formatDate, relativeTime } from "@/lib/format";
import { Badge, SeverityBadge, StatusPill } from "@/components/ui/badges";
import { Eyebrow, cn } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const now = new Date();

  const [
    backlogListings,
    escalatedListings,
    slaBreachedListings,
    criticalDiscrepancies,
    openFraudSignals,
    failedPayments,
    deadJobs,
    recentAudits,
    counts,
  ] = await Promise.all([
    // Backlog
    prisma.listing.count({
      where: { status: { in: ["PENDING_REVIEW", "SUBMITTED", "AI_PROCESSING"] } },
    }),
    // Escalations raised by analysts, oldest first — a supervisor was asked for.
    prisma.listing.findMany({
      where: { escalatedAt: { not: null } },
      select: {
        id: true,
        reference: true,
        escalatedAt: true,
        escalationReason: true,
        escalatedBy: { select: { fullNameEn: true } },
        contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true } } } } } },
      },
      take: 5,
      orderBy: { escalatedAt: "asc" },
    }),
    // SLA Breaches
    prisma.listing.findMany({
      where: {
        slaDueAt: { lt: now },
        status: { in: ["PENDING_REVIEW", "SUBMITTED", "AI_PROCESSING", "INFO_REQUESTED"] },
      },
      include: {
        analyst: { select: { fullNameEn: true } },
        contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true, nameAr: true } } } } } },
      },
      take: 5,
      orderBy: { slaDueAt: "asc" },
    }),
    // Critical Discrepancies
    prisma.discrepancy.findMany({
      where: { severity: "CRITICAL", status: "OPEN" },
      include: {
        listing: {
          select: {
            id: true,
            reference: true,
            contract: { select: { unit: { select: { unitCode: true, project: { select: { nameEn: true } } } } } },
          },
        },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Fraud Alerts
    prisma.fraudSignal.findMany({
      where: { status: { in: ["OPEN", "ESCALATED"] }, severity: { in: ["CRITICAL", "MAJOR"] } },
      include: {
        listing: {
          select: {
            id: true,
            reference: true,
            contract: { select: { unit: { select: { unitCode: true } } } },
          },
        },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Failed Payments
    prisma.payment.findMany({
      where: { status: "FAILED" },
      include: {
        deal: { select: { id: true, listing: { select: { reference: true } } } },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Dead / Failed Jobs
    prisma.job.findMany({
      where: { status: { in: ["FAILED", "DEAD"] } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Recent Admin Audit Events
    prisma.auditEvent.findMany({
      where: {
        action: {
          in: [
            "ADMIN_OVERRIDE",
            "ADMIN_OVERRIDE_LISTING_STATUS",
            "ADMIN_REASSIGN_ANALYST",
            "ROLE_CHANGED",
            "POLICY_UPDATED",
            "PAYMENT_RETRIED",
            "PAYMENT_RECONCILED",
            "PAYMENT_EXCEPTION_RECORDED",
            "JOB_RETRIED",
            "LISTING_ESCALATED",
          ],
        },
      },
      include: {
        actor: { select: { fullNameEn: true } },
      },
      take: 8,
      orderBy: { at: "desc" },
    }),
    // Summary Counts
    Promise.all([
      prisma.user.count(),
      prisma.deal.count({ where: { status: "ACTIVE" } }),
      prisma.offer.count({ where: { status: "ACCEPTED" } }),
    ]),
  ]);

  const [totalUsers, activeDealsCount, acceptedOffersCount] = counts;
  const t = await getTranslations({ locale, namespace: "admin" });
  const isAr = locale === "ar";

  return (
    <div className="space-y-8">
      <header>
        <Eyebrow>{t("operationsManagement")}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {t("operationsOverview")}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {t("liveMarketplaceSupervisionExceptionsIntervention")}
        </p>
      </header>

      {/* Attention / KPI Grid */}
      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="eyebrow mb-3">
          {t("whatNeedsAttentionRightNow")}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <AttentionCard
            label={t("escalations")}
            value={escalatedListings.length}
            href="/analyst"
            tone={escalatedListings.length > 0 ? "flagged" : "neutral"}
          />
          <AttentionCard
            label={t("backlog2")}
            value={backlogListings}
            href="/analyst"
            tone="neutral"
          />
          <AttentionCard
            label={t("slaBreaches2")}
            value={slaBreachedListings.length}
            href="/analyst"
            tone={slaBreachedListings.length > 0 ? "flagged" : "neutral"}
          />
          <AttentionCard
            label={t("criticalDiscrepancies2")}
            value={criticalDiscrepancies.length}
            href="/admin/listings"
            tone={criticalDiscrepancies.length > 0 ? "flagged" : "neutral"}
          />
          <AttentionCard
            label={t("fraudAlerts2")}
            value={openFraudSignals.length}
            href="/admin/listings"
            tone={openFraudSignals.length > 0 ? "flagged" : "neutral"}
          />
          <AttentionCard
            label={t("failedPayments2")}
            value={failedPayments.length}
            href="/admin/payments"
            tone={failedPayments.length > 0 ? "flagged" : "neutral"}
          />
          <AttentionCard
            label={t("deadJobs2")}
            value={deadJobs.length}
            href="/admin/jobs"
            tone={deadJobs.length > 0 ? "flagged" : "neutral"}
          />
        </dl>
      </section>

      {/* Two Column Grid: Critical Operational Issues & Live Work */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Failed Payments & Dead Jobs */}
        <div className="space-y-6">
          {/* Failed Payments */}
          <div className="rounded-lg border border-rule bg-paper-raised p-4">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <h3 className="font-medium text-sm text-ink">
                {t("failedPayments3")}
              </h3>
              <Link href="/admin/payments" className="text-xs text-info hover:underline">
                {t("viewAllPayments")} →
              </Link>
            </div>
            {failedPayments.length === 0 ? (
              <p className="py-4 text-xs text-ink-50 text-center">
                {t("noFailedPaymentsRequiringIntervention")}
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {failedPayments.map((p) => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono text-ink font-semibold">{egp(p.amount.toString())}</span>
                      <span className="text-ink-50 ms-2">
                        {p.deal?.listing.reference ? `Deal ${p.deal.listing.reference}` : p.kind}
                      </span>
                      <p className="text-2xs text-flagged mt-0.5">
                        {p.failureReason || p.failureCode || "Provider rejected instruction"}
                      </p>
                    </div>
                    <Link
                      href={`/admin/payments?id=${p.id}`}
                      className="shrink-0 rounded-sm border border-rule px-2 py-1 text-2xs hover:bg-paper-sunken"
                    >
                      {t("inspectRetry")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Dead Jobs */}
          <div className="rounded-lg border border-rule bg-paper-raised p-4">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <h3 className="font-medium text-sm text-ink">
                {t("failedDeadJobs")}
              </h3>
              <Link href="/admin/jobs" className="text-xs text-info hover:underline">
                {t("openJobsMonitor")} →
              </Link>
            </div>
            {deadJobs.length === 0 ? (
              <p className="py-4 text-xs text-ink-50 text-center">
                {t("allBackgroundQueuesOperatingNormally")}
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {deadJobs.map((j) => (
                  <li key={j.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-ink">{j.type}</span>
                      <span className="text-2xs text-flagged ms-2 font-semibold">({j.status})</span>
                      <p className="text-2xs text-ink-50 truncate mt-0.5 max-w-sm">
                        {j.lastError || "Execution timed out"}
                      </p>
                    </div>
                    <Link
                      href="/admin/jobs"
                      className="shrink-0 rounded-sm border border-rule px-2 py-1 text-2xs hover:bg-paper-sunken"
                    >
                      {t("retry")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: SLA Breaches & Recent Admin Actions */}
        <div className="space-y-6">
          {/* SLA Breaches */}
          <div className="rounded-lg border border-rule bg-paper-raised p-4">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <h3 className="font-medium text-sm text-ink">
                {t("activeSlaBreaches")}
              </h3>
              <Link href="/analyst" className="text-xs text-info hover:underline">
                {t("verificationQueue")} →
              </Link>
            </div>
            {slaBreachedListings.length === 0 ? (
              <p className="py-4 text-xs text-ink-50 text-center">
                {t("allFilesWithinVerificationSla")}
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {slaBreachedListings.map((l) => (
                  <li key={l.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <Link href={`/analyst/listings/${l.id}`} className="font-medium text-ink hover:underline">
                        {isAr ? l.contract.unit.project.nameAr : l.contract.unit.project.nameEn} · {l.contract.unit.unitCode}
                      </Link>
                      <p className="text-2xs text-ink-50">
                        {l.reference} · Analyst: {l.analyst?.fullNameEn ?? "Unassigned"}
                      </p>
                    </div>
                    <span className="money text-2xs text-flagged font-semibold shrink-0">
                      {l.slaDueAt ? `${relativeTime(l.slaDueAt, locale)}` : "Overdue"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Admin Audit Trail */}
          <div className="rounded-lg border border-rule bg-paper-raised p-4">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <h3 className="font-medium text-sm text-ink">
                {t("recentAdministrativeActions")}
              </h3>
              <Link href="/admin/audit" className="text-xs text-info hover:underline">
                {t("auditTrail")} →
              </Link>
            </div>
            {recentAudits.length === 0 ? (
              <p className="py-4 text-xs text-ink-50 text-center">
                {t("noRecentAdministrativeInterventions")}
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {recentAudits.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-mono text-2xs font-semibold text-ink">
                        {a.action}
                      </span>
                      <span className="text-2xs text-ink-50 ms-2">
                        by {a.actor?.fullNameEn ?? "System"} ({a.entityType})
                      </span>
                    </div>
                    <span className="text-2xs text-ink-30 shrink-0">
                      {relativeTime(a.at, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttentionCard({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  tone?: "neutral" | "flagged";
}) {
  return (
    <Link
      href={href as never}
      className={cn(
        "rounded-lg border p-4 transition-colors flex flex-col justify-between",
        tone === "flagged" && value > 0
          ? "border-flagged/40 bg-flagged-soft/20 hover:bg-flagged-soft/40"
          : "border-rule bg-paper-raised hover:bg-paper-sunken/60"
      )}
    >
      <dt className="eyebrow text-2xs text-ink-50">{label}</dt>
      <dd
        className={cn(
          "money text-money-md font-bold mt-2",
          tone === "flagged" && value > 0 ? "text-flagged" : "text-ink"
        )}
      >
        {value}
      </dd>
    </Link>
  );
}
