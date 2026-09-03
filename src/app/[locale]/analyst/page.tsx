import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { config } from "@/lib/config";
import { egp, relativeTime } from "@/lib/format";
import { Card, CardBody, EmptyState, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge, SeverityBadge, StatusPill, VerificationScore } from "@/components/ui/badges";
import { ClaimButton } from "@/components/analyst/claim-button";

export const dynamic = "force-dynamic";

/**
 * The verification queue. Prioritisation is computed, not typed: files with
 * open critical signals come first, then contract value, then age.
 */
export default async function AnalystQueue({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });
  const isAr = locale === "ar";

  const listings = await prisma.listing.findMany({
    where: { status: { in: ["PENDING_REVIEW", "SUBMITTED", "AI_PROCESSING", "INFO_REQUESTED", "VERIFIED"] } },
    include: {
      analyst: { select: { id: true, fullNameEn: true } },
      seller: { select: { fullNameEn: true } },
      contract: {
        select: {
          fields: { where: { key: "TOTAL_PRICE" }, select: { declaredNum: true, verifiedNum: true } },
          unit: { select: { unitCode: true, project: { select: { nameEn: true, nameAr: true, city: true } } } },
        },
      },
      discrepancies: { where: { status: "OPEN" }, select: { severity: true } },
      fraudSignals: { where: { status: { in: ["OPEN", "ESCALATED"] } }, select: { severity: true } },
      _count: { select: { documents: true, media: true } },
    },
  });

  const ranked = listings
    .map((l) => {
      const critical =
        l.discrepancies.filter((d) => d.severity === "CRITICAL").length +
        l.fraudSignals.filter((s) => s.severity === "CRITICAL").length;
      const major =
        l.discrepancies.filter((d) => d.severity === "MAJOR").length +
        l.fraudSignals.filter((s) => s.severity === "MAJOR").length;
      const value = Number(
        l.contract.fields[0]?.verifiedNum ?? l.contract.fields[0]?.declaredNum ?? 0,
      );
      const ageHours = (Date.now() - (l.submittedAt ?? l.createdAt).getTime()) / 3600000;
      const overdue = l.slaDueAt ? l.slaDueAt.getTime() < Date.now() : false;

      // Flagged first, then value, then age — with overdue files pulled up.
      const priority =
        critical * 10_000 + major * 2_000 + (overdue ? 1_500 : 0) + value / 1_000_000 + ageHours / 24;

      return { listing: l, critical, major, value, ageHours, overdue, priority };
    })
    .sort((a, b) => b.priority - a.priority);

  const mine = ranked.filter((r) => r.listing.analyst?.id === user.id);
  const unassigned = ranked.filter((r) => !r.listing.analyst);

  return (
    <>
      <header className="mb-6">
        <Eyebrow>{t("console")}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">{t("queue")}</h1>
        <p className="mt-2 text-sm text-ink-50">{t("queueSub")}</p>
      </header>

      <dl className="mb-8 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4">
        <Stat label={isAr ? "في القائمة" : "In the queue"} value={String(ranked.length)} />
        <Stat label={isAr ? "مُسندة إليّ" : "Assigned to me"} value={String(mine.length)} />
        <Stat label={isAr ? "غير مُسندة" : "Unassigned"} value={String(unassigned.length)} />
        <Stat
          label={isAr ? "متأخرة عن الـ SLA" : "Past SLA"}
          value={String(ranked.filter((r) => r.overdue).length)}
          tone={ranked.some((r) => r.overdue) ? "flagged" : undefined}
        />
      </dl>

      {ranked.length === 0 ? (
        <EmptyState
          title={isAr ? "لا توجد ملفات في الانتظار" : "Nothing waiting"}
          body={isAr ? "كل الملفات المرسلة تمت مراجعتها." : "Every submitted file has been reviewed."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[900px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="rule-b bg-paper-sunken/70">
                <Th>{isAr ? "الملف" : "File"}</Th>
                <Th>{isAr ? "الحالة" : "Status"}</Th>
                <Th align="end">{isAr ? "قيمة العقد" : "Contract value"}</Th>
                <Th align="center">{isAr ? "الإشارات" : "Signals"}</Th>
                <Th align="center">{t("timeOnFile")}</Th>
                <Th align="center">SLA</Th>
                <Th align="end">{isAr ? "الإجراء" : "Action"}</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ listing: l, critical, major, value, ageHours, overdue }) => (
                <tr key={l.id} className={cn("rule-b", critical > 0 && "bg-flagged-soft/40")}>
                  <td className="p-3">
                    <Link
                      href={`/analyst/listings/${l.id}`}
                      className="block font-medium text-ink hover:underline"
                    >
                      {isAr ? l.contract.unit.project.nameAr : l.contract.unit.project.nameEn} ·{" "}
                      {l.contract.unit.unitCode}
                    </Link>
                    <span className="font-mono text-2xs text-ink-30">
                      {l.reference} · {l.seller.fullNameEn.split(" ")[0]} · {l._count.documents} docs ·{" "}
                      {l._count.media} images
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={l.status} />
                      {l.verificationScore !== null ? (
                        <VerificationScore
                          score={l.verificationScore}
                          breakdown={l.verificationScoreBreakdown as never}
                          locale={locale}
                          size="sm"
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="money p-3 text-end font-medium text-ink">
                    {value > 0 ? egp(value, { style: "compact" }) : "—"}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-1">
                      {critical > 0 ? <SeverityBadge severity="CRITICAL" /> : null}
                      {major > 0 ? <SeverityBadge severity="MAJOR" /> : null}
                      {critical === 0 && major === 0 ? <span className="text-2xs text-ink-30">clear</span> : null}
                    </div>
                  </td>
                  <td className="money p-3 text-center text-xs text-ink-70">
                    {ageHours < 24 ? `${Math.round(ageHours)}h` : `${Math.round(ageHours / 24)}d`}
                  </td>
                  <td className="p-3 text-center">
                    {l.slaDueAt ? (
                      <span className={cn("money text-2xs", overdue ? "text-flagged" : "text-ink-50")}>
                        {overdue
                          ? t("slaOverdue", { time: relativeTime(l.slaDueAt, locale).replace(/ ago$/, "") })
                          : t("slaDue", { time: relativeTime(l.slaDueAt, locale) })}
                      </span>
                    ) : (
                      <span className="text-2xs text-ink-30">—</span>
                    )}
                  </td>
                  <td className="p-3 text-end">
                    {l.analyst ? (
                      <Badge tone={l.analyst.id === user.id ? "brass" : "neutral"}>
                        {l.analyst.id === user.id
                          ? isAr
                            ? "لي"
                            : "mine"
                          : t("assigned", { name: l.analyst.fullNameEn.split(" ")[0] })}
                      </Badge>
                    ) : (
                      <ClaimButton listingId={l.id} label={t("assignToMe")} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-2xs text-ink-30">
        SLA target: {config.VERIFICATION_SLA_HOURS} hours from submission.
      </p>
    </>
  );
}

function Th({ children, align = "start" }: { children: React.ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <th
      className={cn(
        "p-3 text-xs font-medium text-ink-50",
        align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start",
      )}
    >
      {children}
    </th>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "flagged" }) {
  return (
    <div className="bg-paper-raised p-4">
      <dt className="eyebrow mb-1.5">{label}</dt>
      <dd className={cn("money text-money-md font-semibold", tone === "flagged" ? "text-flagged" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}
