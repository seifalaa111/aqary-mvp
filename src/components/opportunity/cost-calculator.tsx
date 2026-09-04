"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Decimal } from "decimal.js";
import { Card, CardBody, Eyebrow, cn } from "@/components/ui/primitives";
import { egp } from "@/lib/format";

export interface CostBase {
  cashToSeller: string;
  minAcceptableCash: string;
  totalContractPrice: string;
  platformFee: string;
  developerAssignmentFee: string;
  dues: string;
  arrears: string;
  remainingInstallments: string;
  remainingCount: number;
  developerToday: string | null;
  feePct: number;
}

/**
 * Total effective cost, recomputed live. The buyer moves the cash figure inside
 * the band the seller has pre-authorised and watches every downstream number
 * move — including the comparison against buying from the developer today.
 */
export function CostCalculator({ base, locale }: { base: CostBase; locale: string }) {
  const t = useTranslations("opportunity");
  const isAr = locale === "ar";

  const asking = new Decimal(base.cashToSeller);
  const floor = new Decimal(base.minAcceptableCash);
  const [cash, setCash] = useState(() => asking.toNumber());

  const result = useMemo(() => {
    const cashToSeller = new Decimal(cash);
    const platformFee = new Decimal(base.totalContractPrice).mul(base.feePct).div(100).toDecimalPlaces(2);
    const assignFee = new Decimal(base.developerAssignmentFee);
    // Not optional: the figure in the page header includes these, and a
    // toggle here would let the two contradict each other.
    const dues = new Decimal(base.dues);
    const arrears = new Decimal(base.arrears);
    const remaining = new Decimal(base.remainingInstallments);

    const cashNow = cashToSeller.plus(platformFee).plus(assignFee).plus(dues).plus(arrears);
    const total = cashNow.plus(remaining);
    const today = base.developerToday ? new Decimal(base.developerToday) : null;
    const saving = today ? today.minus(total) : null;
    const savingPct = today && today.gt(0) ? saving!.div(today).mul(100).toNumber() : null;

    return { cashToSeller, platformFee, assignFee, dues, arrears, remaining, cashNow, total, today, saving, savingPct };
  }, [cash, base]);

  return (
    <section>
      <Eyebrow>{t("yourCost")}</Eyebrow>
      <h2 className="mb-2 mt-1 font-display text-xl text-ink">{t("yourCost")}</h2>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-50">{t("yourCostSub")}</p>

      <Card>
        <CardBody>
          {/* Cash-to-seller is the only input the buyer controls, and it is
              hard-capped at the asking figure. */}
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="cash-slider" className="text-xs font-medium text-ink-70">
                {t("costCashToSeller")}
              </label>
              <span className="money text-money-sm font-semibold text-ink">
                {egp(result.cashToSeller, { decimals: 0 })}
              </span>
            </div>
            <input
              id="cash-slider"
              type="range"
              min={floor.toNumber()}
              max={asking.toNumber()}
              step={Math.max(1000, Math.round(asking.div(500).toNumber()))}
              value={cash}
              onChange={(e) => setCash(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-rule accent-brass"
            />
            <div className="mt-1.5 flex justify-between font-mono text-2xs uppercase tracking-wider text-ink-50">
              <span>{egp(floor, { style: "compact" })} · seller floor</span>
              <span>{egp(asking, { style: "compact" })} · asking</span>
            </div>
            {floor.eq(asking) ? (
              <p className="mt-2 text-2xs text-ink-50">
                {isAr
                  ? "لم يحدد البائع أي مرونة للتفاوض على هذا العقد."
                  : "This seller has not offered any downward flexibility on this contract."}
              </p>
            ) : null}
          </div>

          <dl className="rule-t">
            <Row label={t("costCashToSeller")} value={egp(result.cashToSeller, { decimals: 0 })} />
            <Row
              label={t("costPlatformFee", { pct: `${base.feePct}%` })}
              value={egp(result.platformFee, { decimals: 0 })}
            />
            <Row label={t("costAssignmentFee")} value={egp(result.assignFee, { decimals: 0 })} />
            {/* Itemised, not optional — see the note in the calculation above. */}
            <Row label={t("costDues")} value={egp(result.dues, { decimals: 0 })} />
            {result.arrears.gt(0) ? (
              <Row label={t("costArrears")} value={egp(result.arrears, { decimals: 0 })} tone="flagged" />
            ) : null}
            <Row label={t("costCashNow")} value={egp(result.cashNow, { decimals: 0 })} emphasis />
            <Row
              label={`${t("costRemaining")} (${base.remainingCount})`}
              value={egp(result.remaining, { decimals: 0 })}
            />
            <Row label={t("costTotal")} value={egp(result.total, { decimals: 0 })} emphasis large />
          </dl>

          {result.today ? (
            <div className="mt-6 rounded-md border border-verified/25 bg-verified-soft p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="eyebrow mb-1 text-verified">{t("costCompare")}</p>
                  <p className="money text-money-md font-semibold text-ink">
                    {egp(result.today, { decimals: 0 })}
                  </p>
                </div>
                <div className="text-end">
                  <p className="eyebrow mb-1 text-verified">{t("costSaving")}</p>
                  <p className="money text-money-md font-semibold text-verified">
                    {result.saving && result.saving.gt(0)
                      ? `${egp(result.saving, { decimals: 0 })}`
                      : egp(0)}
                    {result.savingPct !== null ? (
                      <span className="ms-2 text-sm font-normal">({result.savingPct.toFixed(1)}%)</span>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex h-8 overflow-hidden rounded-xs border border-verified/25" aria-hidden>
                <div
                  className="flex items-center justify-center bg-ink text-2xs font-medium text-ink-text"
                  style={{
                    inlineSize: `${Math.max(6, Math.min(100, result.total.div(result.today).mul(100).toNumber()))}%`,
                  }}
                >
                  {egp(result.total, { style: "compact" })}
                </div>
                <div className="flex flex-1 items-center justify-center bg-verified/20 text-2xs text-verified">
                  {result.saving && result.saving.gt(0) ? egp(result.saving, { style: "compact" }) : ""}
                </div>
              </div>
              <p className="mt-3 text-2xs leading-relaxed text-ink-70">
                {isAr
                  ? "سعر المطوّر اليوم بيانات تجريبية في هذه النسخة — راجع ASSETS.md."
                  : "The developer's price today is synthetic seed data in this build — see ASSETS.md."}
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}

function Row({
  label,
  value,
  emphasis,
  large,
  muted,
  tone,
}: {
  label: React.ReactNode;
  value: string;
  emphasis?: boolean;
  large?: boolean;
  muted?: boolean;
  tone?: "flagged";
}) {
  return (
    <div
      className={cn(
        "rule-b grid grid-cols-[1fr_auto] items-baseline gap-4 py-3",
        emphasis && "-mx-2 bg-paper-sunken/70 px-2",
      )}
    >
      <dt className={cn("text-sm", emphasis ? "font-semibold text-ink" : muted ? "text-ink-30" : "text-ink-70")}>
        {label}
      </dt>
      <dd
        className={cn(
          "money text-end tabular-nums",
          large ? "text-money-md font-semibold" : emphasis ? "text-money-sm font-semibold" : "text-sm",
          tone === "flagged" ? "text-flagged" : muted ? "text-ink-30" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
