import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { totalEffectiveCost } from "@/lib/domain/calculators";
import { egp } from "@/lib/format";
import { Eyebrow, buttonClass } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { Section, SectionHead, LineItem } from "@/components/ui/section";

export const dynamic = "force-dynamic";

/**
 * The public fee and policy page.
 *
 * This is an information interface, not an editorial section: a table of who
 * is charged what and when, a worked example computed by the same
 * `totalEffectiveCost` the product uses, and the developer policy library as
 * raw data. Nothing here is a percentage literal — every figure is derived
 * from `config` or from a row.
 */
export default async function FeesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "fees" });
  const th = await getTranslations({ locale, namespace: "home" });
  const ta = await getTranslations({ locale, namespace: "assignmentStatus" });
  const isAr = locale === "ar";

  const feePct = config.PLATFORM_FEE_BPS / 100;
  const sellerPct = config.SELLER_FEE_BPS / 100;

  const policies = await prisma.developerAssignmentPolicy.findMany({
    include: { developer: { select: { nameEn: true, nameAr: true } } },
    orderBy: { developer: { nameEn: "asc" } },
  });

  // Worked example, run through the product's own calculator on the same
  // argument shape `costFor` uses — dues included — so "cash required now"
  // means here exactly what it means on an opportunity.
  const example = totalEffectiveCost({
    cashToSeller: "2000000",
    totalContractPrice: "10000000",
    developerAssignmentFee: "150000",
    maintenanceAndClubDues: "300000",
    remainingInstallmentsTotal: "8000000",
    currentDeveloperPrice: "14000000",
  });

  return (
    <div>
      <Section>
        <div className="max-w-3xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="mb-3 mt-2 display-hero text-ink">{t("title")}</h1>
          <p className="text-md leading-relaxed text-ink-70">{t("sub")}</p>
        </div>

        {/* ---- The three charges, as a table ---- */}
        <div className="mt-8 overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[640px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken">
                <th className="p-3 text-start text-xs font-medium text-ink-50">{t("who")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{t("amount")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{t("when")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{t("setBy")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rule">
                <td className="p-3">
                  <p className="font-medium text-ink">{t("sellerCommission")}</p>
                  <p className="text-xs text-ink-50">{t("seller")}</p>
                </td>
                <td className="money p-3 text-money-sm font-semibold text-verified">{sellerPct}%</td>
                <td className="p-3 text-ink-70">{t("sellerCommissionWhen")}</td>
                <td className="p-3 text-ink-70">{t("aqary")}</td>
              </tr>
              <tr className="border-b border-rule">
                <td className="p-3">
                  <p className="font-medium text-ink">{t("buyerFee")}</p>
                  <p className="text-xs text-ink-50">{t("buyer")}</p>
                </td>
                <td className="p-3">
                  <p className="money text-money-sm font-semibold text-brass">{feePct}%</p>
                  <p className="text-xs text-ink-50">{t("buyerFeeBasis")}</p>
                </td>
                <td className="p-3 text-ink-70">{t("buyerFeeWhen")}</td>
                <td className="p-3 text-ink-70">{t("aqary")}</td>
              </tr>
              <tr>
                <td className="p-3">
                  <p className="font-medium text-ink">{t("developerFee")}</p>
                  <p className="text-xs text-ink-50">{t("buyer")}</p>
                </td>
                <td className="p-3 text-ink">{t("developerFeeAmount")}</td>
                <td className="p-3 text-ink-70">{t("developerFeeWhen")}</td>
                <td className="p-3 text-ink-70">{t("developer")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---- Worked example ---- */}
      <Section tone="sunken">
        <SectionHead title={t("workedTitle")} body={t("workedSub")} />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
          <dl className="rounded-lg border border-rule bg-paper-raised p-5">
            <LineItem label={t("sellerCommission")} value={`${sellerPct}%`} />
            <LineItem
              label={t("cashToSeller")}
              value={egp(example.cashToSeller, { style: "bare", decimals: 0 })}
            />
            <LineItem
              label={`${t("buyerFee")} (${feePct}%)`}
              value={egp(example.platformFee, { style: "bare", decimals: 0 })}
            />
            <LineItem
              label={t("developerFee")}
              value={egp(example.developerAssignmentFee, { style: "bare", decimals: 0 })}
            />
            <LineItem
              label={t("duesLine")}
              value={egp(example.maintenanceAndClubDues, { style: "bare", decimals: 0 })}
            />
            <LineItem
              label={t("cashRequiredNow")}
              value={egp(example.cashRequiredNow, { style: "bare", decimals: 0 })}
              emphasis
            />
            <LineItem
              label={t("remainingInstallments")}
              value={egp(example.remainingInstallmentsTotal, { style: "bare", decimals: 0 })}
            />
            <LineItem
              label={t("totalEffectiveCost")}
              value={egp(example.totalEffectiveCost, { style: "bare", decimals: 0 })}
              emphasis
            />
          </dl>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-verified/25 bg-verified-soft p-5">
              <p className="eyebrow mb-2 text-verified">{t("againstDeveloper")}</p>
              <p className="money figure-lg text-verified">
                {egp(example.developerTodayPrice, { style: "bare", decimals: 0 })}
                <span className="ms-2 text-sm font-normal text-ink-50">EGP</span>
              </p>
              {example.savingVsDeveloperToday && example.savingPctBps !== null ? (
                <p className="mt-2 text-sm text-ink-70">
                  {t("difference", {
                    amount: egp(example.savingVsDeveloperToday, { style: "compact" }),
                    pct: `${(example.savingPctBps / 100).toFixed(1)}%`,
                  })}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-rule bg-paper-raised p-5">
              <h3 className="mb-3 text-base font-semibold text-ink">{t("notChargedTitle")}</h3>
              <ul className="flex flex-col gap-2">
                {[t("notCharged1"), t("notCharged2"), t("notCharged3"), t("notCharged4")].map((line) => (
                  <li key={line} className="flex gap-2 text-sm leading-relaxed text-ink-70">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-verified" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ---- Developer policy library ---- */}
      <Section bordered={false}>
        <SectionHead title={t("libraryTitle")} />
        <div className="mt-6 overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[760px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken">
                <th className="p-3 text-start text-xs font-medium text-ink-50">{t("colDeveloper")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{t("colAssignment")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">{t("colFee")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">{t("colMinPaid")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">{t("colMinMonths")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">{t("colNoc")}</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-rule last:border-b-0">
                  <td className="p-3 text-ink">{isAr ? p.developer.nameAr : p.developer.nameEn}</td>
                  <td className="p-3">
                    <Badge
                      tone={
                        p.assignmentAllowed === "ALLOWED"
                          ? "verified"
                          : p.assignmentAllowed === "NOT_ALLOWED"
                            ? "flagged"
                            : "pending"
                      }
                    >
                      {ta.has(p.assignmentAllowed) ? ta(p.assignmentAllowed) : p.assignmentAllowed}
                    </Badge>
                  </td>
                  <td className="money p-3 text-end text-xs text-ink">
                    {p.feeType === "PERCENT"
                      ? `${((p.feePercentBps ?? 0) / 100).toFixed(2)}%`
                      : p.feeType === "FIXED"
                        ? egp(p.feeFixedAmount, { style: "compact" })
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
        <p className="mt-3 text-2xs leading-relaxed text-ink-50">{t("librarySynthetic")}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup?role=seller" className={buttonClass("inkPrimary", "lg")}>
            {th("heroCtaPrimary")} <span aria-hidden className="arrow-forward">→</span>
          </Link>
          <Link href="/opportunities" className={buttonClass("secondary", "lg")}>
            {th("heroCtaSecondary")}
          </Link>
        </div>
      </Section>
    </div>
  );
}
