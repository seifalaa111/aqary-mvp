import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { egp, formatQuarter, relativeTime } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, Callout, EmptyState, Eyebrow } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export const dynamic = "force-dynamic";

/**
 * Phase-2 preview. Real data plumbing, clearly labelled, and it claims nothing
 * it cannot show: there is no predictive model here, only what the transaction
 * record already contains.
 */
export default async function PartnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("DEVELOPER_PARTNER", "ADMIN");
  const t = await getTranslations({ locale, namespace: "partner" });
  const isAr = locale === "ar";

  const [deals, exitReasons, developers, urgency] = await Promise.all([
    prisma.deal.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      include: {
        milestones: {
          where: { key: "DEVELOPER_NOC_REQUESTED" },
          select: { status: true, completedAt: true, dueDate: true },
        },
        listing: {
          select: {
            reference: true,
            totalContractPrice: true,
            outstandingBalance: true,
            deliveryDate: true,
            contract: {
              select: {
                unit: {
                  select: {
                    unitCode: true,
                    project: {
                      select: { nameEn: true, nameAr: true, developer: { select: { nameEn: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.listing.groupBy({ by: ["exitReason"], _count: true, where: { exitReason: { not: null } } }),
    prisma.developer.findMany({
      select: {
        nameEn: true,
        nameAr: true,
        _count: { select: { projects: true } },
        projects: {
          select: {
            units: {
              select: {
                contracts: {
                  select: { listing: { select: { id: true, status: true, outstandingBalance: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.listing.groupBy({ by: ["urgency"], _count: true, where: { urgency: { not: null } } }),
  ]);

  const byDeveloper = developers
    .map((d) => {
      const listings = d.projects
        .flatMap((p) => p.units.flatMap((u) => u.contracts.map((c) => c.listing)))
        .filter((l): l is NonNullable<typeof l> => Boolean(l));
      const live = listings.filter((l) => ["LISTED", "UNDER_OFFER"].includes(l.status)).length;
      const exposure = listings.reduce((a, l) => a + Number(l.outstandingBalance ?? 0), 0);
      return { name: d.nameEn, nameAr: d.nameAr, projects: d._count.projects, live, exposure };
    })
    .filter((d) => d.live > 0)
    .sort((a, b) => b.exposure - a.exposure);

  const totalExposure = byDeveloper.reduce((a, d) => a + d.exposure, 0);
  const maxReason = Math.max(1, ...exitReasons.map((x) => x._count));

  return (
    <WorkspaceShell locale={locale} role="DEVELOPER_PARTNER" nav={[{ href: "/partner", label: t("title") }]}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Eyebrow>{t("title")}</Eyebrow>
        <Badge tone="pending">{t("previewBadge")}</Badge>
      </div>
      <h1 className="mb-4 display-section text-ink">{t("inbox")}</h1>

      <div className="mb-8">
        <Callout tone="info" title={t("previewBadge")}>
          {t("previewNote")}
        </Callout>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 font-display text-xl text-ink">{t("inbox")}</h2>
        {deals.length === 0 ? (
          <EmptyState title={t("inbox")} body="No assignment requests have reached the developer stage yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
            <table className="w-full min-w-[760px] border-collapse bg-paper-raised text-sm">
              <thead>
                <tr className="rule-b bg-paper-sunken/70">
                  <th className="p-3 text-start text-xs font-medium text-ink-50">Contract</th>
                  <th className="p-3 text-start text-xs font-medium text-ink-50">Developer</th>
                  <th className="p-3 text-end text-xs font-medium text-ink-50">Outstanding</th>
                  <th className="p-3 text-start text-xs font-medium text-ink-50">Delivery</th>
                  <th className="p-3 text-center text-xs font-medium text-ink-50">NOC</th>
                  <th className="p-3 text-end text-xs font-medium text-ink-50">Opened</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const noc = d.milestones[0];
                  const project = d.listing.contract.unit.project;
                  return (
                    <tr key={d.id} className="rule-b">
                      <td className="p-3">
                        <Link href={`/deals/${d.id}`} className="font-medium text-ink hover:underline">
                          {isAr ? project.nameAr : project.nameEn} · {d.listing.contract.unit.unitCode}
                        </Link>
                        <span className="block font-mono text-2xs text-ink-30">{d.reference}</span>
                      </td>
                      <td className="p-3 text-xs text-ink-70">{project.developer.nameEn}</td>
                      <td className="money p-3 text-end text-xs text-ink">
                        {egp(d.listing.outstandingBalance, { style: "compact" })}
                      </td>
                      <td className="money p-3 text-xs text-ink-70">
                        {formatQuarter(d.listing.deliveryDate, locale)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          tone={
                            noc?.status === "COMPLETED"
                              ? "verified"
                              : noc?.status === "IN_PROGRESS"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {(noc?.status ?? "PENDING").toLowerCase()}
                        </Badge>
                      </td>
                      <td className="p-3 text-end text-2xs text-ink-30">{relativeTime(d.createdAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("portfolio")}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-xs leading-relaxed text-ink-50">
              Outstanding instalment obligations on contracts that have come to Aqary looking for an exit, by
              developer. This is what the transaction record contains today — nothing here is predicted.
            </p>
            <ul className="rule-t">
              {byDeveloper.map((d) => (
                <li key={d.name} className="rule-b py-2.5">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">{isAr ? d.nameAr : d.name}</span>
                    <span className="money text-sm font-medium text-ink">
                      {egp(d.exposure, { style: "compact" })}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${totalExposure > 0 ? (d.exposure / totalExposure) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-2xs text-ink-30">
                    {d.live} live listings across {d.projects} projects
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why holders are exiting</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-xs leading-relaxed text-ink-50">
              Collected as structured data at intake. Over time this is the dataset a predictive default
              product would be built on — that product does not exist yet, and this panel does not pretend
              otherwise.
            </p>
            <ul className="rule-t">
              {exitReasons
                .slice()
                .sort((a, b) => b._count - a._count)
                .map((r) => (
                  <li key={r.exitReason} className="rule-b py-2">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-xs text-ink-70">
                        {(r.exitReason ?? "").replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="money text-xs text-ink">{r._count}</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-paper-sunken">
                      <div
                        className="h-full rounded-full bg-brass"
                        style={{ width: `${(r._count / maxReason) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>

            <p className="eyebrow mb-2 mt-6">Urgency</p>
            <ul className="rule-t">
              {urgency.map((u) => (
                <li key={u.urgency} className="rule-b flex items-baseline justify-between gap-3 py-2">
                  <span className="text-xs text-ink-70">{(u.urgency ?? "").replace(/_/g, " ").toLowerCase()}</span>
                  <span className="money text-xs text-ink">{u._count}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <p className="mt-8 rounded-md border border-pending/30 bg-pending-soft px-4 py-3 text-2xs leading-relaxed text-ink-70">
        {isAr
          ? "هذه معاينة. لا يوجد نموذج تنبؤ بالتعثر في هذه النسخة، ولا اتفاقيات شراكة قائمة مع أي مطوّر."
          : "This is a preview. No predictive default model exists in this build, and no partnership agreement is in place with any developer named here. See ASSUMPTIONS.md."}
      </p>
    </WorkspaceShell>
  );
}
