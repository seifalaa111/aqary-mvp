import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { egp } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Eyebrow, buttonClass } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { Section, SectionHead, StatStrip, LineItem } from "@/components/ui/section";

export const dynamic = "force-dynamic";

/**
 * The developer-facing page.
 *
 * B2B, not consumer: the hero states the operational outcome rather than a
 * value proposition, the page leads with portfolio figures, and the primary
 * action is a partnership conversation — not "browse the marketplace", which
 * is the wrong ask for this audience. Nothing here describes unreleased
 * internal work.
 */
export default async function ForDevelopersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "developers" });
  const tr = await getTranslations({ locale, namespace: "exitReason" });

  const [live, exposureAgg, completed, reasons, medianNoc] = await Promise.all([
    // Same predicate as the public marketplace — a private listing must not
    // inflate a figure presented as what is publicly on offer.
    prisma.listing.count({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
    }),
    prisma.listing.aggregate({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] }, isPrivate: false },
      _sum: { outstandingBalance: true },
    }),
    prisma.deal.count({ where: { status: "COMPLETED" } }),
    prisma.listing.groupBy({ by: ["exitReason"], _count: true, where: { exitReason: { not: null } } }),
    prisma.developerAssignmentPolicy
      .findMany({ select: { typicalNocDays: true }, where: { typicalNocDays: { not: null } } })
      .then((r) => {
        // True median: the mean of the two middle values on an even count,
        // not the upper one.
        const v = r.map((x) => x.typicalNocDays!).sort((a, b) => a - b);
        if (v.length === 0) return 0;
        const mid = Math.floor(v.length / 2);
        return v.length % 2 === 0 ? Math.round((v[mid - 1]! + v[mid]!) / 2) : v[mid]!;
      }),
  ]);

  const topReason = reasons.slice().sort((a, b) => b._count - a._count)[0];
  // A raw database enum was rendering as Latin text on the Arabic page.
  const topReasonLabel = topReason?.exitReason
    ? tr.has(topReason.exitReason)
      ? tr(topReason.exitReason)
      : topReason.exitReason.replace(/_/g, " ").toLowerCase()
    : "—";

  const mailto = `mailto:${config.PARTNERSHIPS_EMAIL}?subject=${encodeURIComponent(t("mailSubject"))}`;

  const outcomes = [
    { title: t("outcome1Title"), body: t("outcome1Body") },
    { title: t("outcome2Title"), body: t("outcome2Body") },
    { title: t("outcome3Title"), body: t("outcome3Body") },
  ];

  const workflow = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`workflow${n}` as "workflow1"),
    sub: t(`workflow${n}Sub` as "workflow1Sub"),
    /** Step 4 is the developer's own decision — marked as theirs, not ours. */
    theirs: n === 4,
  }));

  return (
    <div>
      {/* ---- Hero: outcome first, figures immediately under it ---- */}
      <Section tone="ink">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <Eyebrow className="text-ink-text-50">{t("eyebrow")}</Eyebrow>
            <h1 className="mb-3 mt-2 display-hero text-ink-text">{t("heroTitle")}</h1>
            <p className="max-w-xl text-sm leading-relaxed text-ink-text-70">{t("heroSub")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={mailto} className={buttonClass("inkPrimary", "lg")}>
                {t("ctaPrimary")} <span aria-hidden className="arrow-forward">→</span>
              </a>
              <Link
                href="/how-it-works"
                className="inline-flex h-12 items-center rounded-md border border-ink-rule px-6 text-base font-medium text-ink-text transition-colors hover:border-ink-text-50"
              >
                {t("ctaSecondary")}
              </Link>
            </div>
          </div>

          <StatStrip
            onInk
            className="md:grid-cols-2"
            items={[
              { value: live, label: t("statContracts") },
              {
                value: egp(exposureAgg._sum.outstandingBalance ?? 0, { style: "compact" }),
                label: t("statOutstanding"),
              },
              { value: completed, label: t("statCompleted") },
              {
                value: topReasonLabel,
                label: t("statTopReason"),
                note: topReason ? t("topReasonNote", { count: topReason._count }) : undefined,
              },
            ]}
          />
        </div>
        <p className="mt-4 max-w-3xl text-2xs leading-relaxed text-ink-text-50">{t("dataNote")}</p>
      </Section>

      {/* ---- Outcomes ---- */}
      <Section>
        <SectionHead eyebrow={t("outcomesEyebrow")} title={t("outcomesTitle")} />
        <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-3">
          {outcomes.map((o, i) => (
            <div key={o.title} className="bg-paper-raised p-5">
              <span className="money mb-3 block font-mono text-2xs tracking-widest text-brass">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="mb-2 text-sm font-semibold text-ink">{o.title}</h2>
              <p className="text-xs leading-relaxed text-ink-70">{o.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Workflow ---- */}
      <Section tone="sunken">
        <SectionHead eyebrow={t("workflowEyebrow")} title={t("workflowTitle")} />
        <ol className="mt-6 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-5">
          {workflow.map((s, i) => (
            <li
              key={s.title}
              className={s.theirs ? "bg-brass-soft p-4 md:p-5" : "bg-paper-raised p-4 md:p-5"}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={
                    s.theirs
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-brass font-mono text-2xs text-ink"
                      : "flex size-6 shrink-0 items-center justify-center rounded-full border border-rule-strong bg-paper font-mono text-2xs text-ink-50"
                  }
                >
                  {i + 1}
                </span>
                <span className="h-px flex-1 bg-rule" aria-hidden />
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-ink">{s.title}</h3>
              <p className="text-xs leading-relaxed text-ink-70">{s.sub}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 font-mono text-2xs uppercase tracking-wider text-ink-50">
          {t("medianNoc", { days: medianNoc })}
        </p>
      </Section>

      {/* ---- Control + product example, side by side ---- */}
      <Section bordered={false}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow={t("controlEyebrow")} title={t("controlTitle")} body={t("controlSub")} />
            <ul className="mt-5 rounded-lg border border-rule bg-paper-raised p-5">
              {[t("control1"), t("control2"), t("control3"), t("control4")].map((line, i, arr) => (
                <li
                  key={line}
                  className={
                    i < arr.length - 1
                      ? "flex gap-2.5 border-b border-rule py-2.5 text-sm leading-relaxed text-ink-70"
                      : "flex gap-2.5 pt-2.5 text-sm leading-relaxed text-ink-70"
                  }
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brass" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionHead eyebrow={t("exampleEyebrow")} title={t("exampleTitle")} body={t("exampleSub")} />
            <div className="mt-5 rounded-lg border border-rule bg-paper-raised p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-flagged/25 bg-flagged-soft p-3">
                  <p className="eyebrow mb-1">{t("exampleHolder")}</p>
                  <p className="text-sm font-medium text-flagged">{t("exampleStatusFrom")}</p>
                </div>
                <div className="rounded-md border border-verified/25 bg-verified-soft p-3">
                  <p className="eyebrow mb-1 text-verified">{t("exampleIncoming")}</p>
                  <p className="text-sm font-medium text-verified">{t("exampleStatusTo")}</p>
                </div>
              </div>

              <dl className="mt-4">
                <LineItem
                  label={t("exampleContractPrice")}
                  value={formatMoney("10000000", { style: "bare", locale: locale === "ar" ? "ar" : "en" })}
                />
                <LineItem
                  label={t("examplePaid")}
                  value={formatMoney("2000000", { style: "bare", locale: locale === "ar" ? "ar" : "en" })}
                />
                <LineItem
                  label={t("exampleOutstanding")}
                  value={formatMoney("8000000", { style: "bare", locale: locale === "ar" ? "ar" : "en" })}
                  emphasis
                />
                <LineItem label={t("exampleSchedule")} value={<Badge tone="verified">{t("exampleScheduleValue")}</Badge>} />
              </dl>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-lg border border-rule bg-paper-sunken p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-ink">{t("closingTitle")}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-70">{t("closingBody")}</p>
            </div>
            <a href={mailto} className={buttonClass("inkPrimary", "lg")}>
              {t("ctaPrimary")} <span aria-hidden className="arrow-forward">→</span>
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}
