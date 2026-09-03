import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { relativeTime } from "@/lib/format";
import { Card, CardBody, EmptyState, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export const dynamic = "force-dynamic";

/** The persisted job queue, with retries, backoff and dead letters visible. */
export default async function JobsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const [jobs, counts] = await Promise.all([
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
  ]);

  return (
    <>
      <Eyebrow>{t("console")}</Eyebrow>
      <h1 className="mb-6 mt-1 display-section text-ink">{t("jobs")}</h1>

      <dl className="mb-6 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-5">
        {["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"].map((s) => (
          <div key={s} className="bg-paper-raised p-4">
            <dt className="eyebrow mb-1">{s.toLowerCase()}</dt>
            <dd className={cn("money text-money-sm font-semibold", s === "DEAD" ? "text-flagged" : "text-ink")}>
              {counts.find((c) => c.status === s)?._count ?? 0}
            </dd>
          </div>
        ))}
      </dl>

      {jobs.length === 0 ? (
        <EmptyState title="No jobs have run yet" />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="rule-b bg-paper-sunken/70">
                    <th className="p-3 text-start text-xs font-medium text-ink-50">Type</th>
                    <th className="p-3 text-start text-xs font-medium text-ink-50">Status</th>
                    <th className="p-3 text-center text-xs font-medium text-ink-50">Attempts</th>
                    <th className="p-3 text-start text-xs font-medium text-ink-50">Last error</th>
                    <th className="p-3 text-end text-xs font-medium text-ink-50">When</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={cn("rule-b", j.status === "DEAD" && "bg-flagged-soft/30")}>
                      <td className="p-3 font-mono text-xs text-ink">{j.type}</td>
                      <td className="p-3">
                        <Badge
                          tone={
                            j.status === "SUCCEEDED"
                              ? "verified"
                              : j.status === "DEAD" || j.status === "FAILED"
                                ? "flagged"
                                : j.status === "RUNNING"
                                  ? "info"
                                  : "neutral"
                          }
                        >
                          {j.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="money p-3 text-center text-xs text-ink-70">
                        {j.attempts}/{j.maxAttempts}
                      </td>
                      <td className="max-w-xs truncate p-3 text-xs text-ink-50">{j.lastError ?? "—"}</td>
                      <td className="p-3 text-end text-2xs text-ink-30">
                        {relativeTime(j.finishedAt ?? j.startedAt ?? j.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
