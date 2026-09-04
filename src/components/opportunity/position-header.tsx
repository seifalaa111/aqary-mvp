import type { ReactNode } from "react";
import { egp } from "@/lib/format";
import { ProvenanceChip, type Provenance } from "@/components/ui/provenance";

/**
 * The financial position, above the fold on every opportunity.
 *
 * Previously the first viewport of an opportunity was a name and a photo
 * gallery — a buyer had to scroll past the whole page to find the price. The
 * three questions that decide whether to read further are answered here, in
 * order: how much cash is required now, what that buys against the developer's
 * price today, and what obligation comes with it.
 */
export function PositionHeader({
  cashRequiredNow,
  cashToSeller,
  totalEffectiveCost,
  developerPriceToday,
  discountPctBps,
  hasArrears,
  outstandingBalance,
  remainingCount,
  installmentAmount,
  frequencyLabel,
  paidSource,
  labels,
  action,
}: {
  cashRequiredNow: string;
  cashToSeller: string | null;
  totalEffectiveCost: string;
  developerPriceToday: string | null;
  discountPctBps: number | null;
  hasArrears: boolean;
  outstandingBalance: string | null;
  remainingCount: number;
  installmentAmount: string | null;
  frequencyLabel: string;
  paidSource: Provenance | null;
  labels: {
    cashRequiredNow: string;
    cashRequiredNowHint: string;
    cashRequiredNowHintArrears: string;
    cashToSeller: string;
    totalEffectiveCost: string;
    totalCostHint: string;
    developerPriceToday: string;
    vsDeveloper: string;
    belowDeveloper: string;
    outstandingToDeveloper: string;
    installment: string;
    remainingPayments: string;
  };
  action?: ReactNode;
}) {
  const discountPct = discountPctBps !== null ? Math.round(discountPctBps / 100) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-paper-raised">
      <div className="grid gap-px bg-rule lg:grid-cols-3">
        {/* 1. What it costs to step in. */}
        <div className="bg-paper-raised p-5">
          <p className="eyebrow mb-1.5">{labels.cashRequiredNow}</p>
          <p className="money flex flex-wrap items-baseline gap-2">
            <span className="figure-xl text-ink">{egp(cashRequiredNow, { style: "bare", decimals: 0 })}</span>
            <span className="text-sm text-ink-50">EGP</span>
          </p>
          {/* Names every component of the figure above, including the
              arrears clause only when this contract actually carries them. */}
          <p className="mt-2 text-xs leading-snug text-ink-50">
            {hasArrears ? labels.cashRequiredNowHintArrears : labels.cashRequiredNowHint}
          </p>
          <p className="mt-3 flex flex-wrap items-baseline gap-2 border-t border-rule pt-2.5 text-sm text-ink-70">
            {labels.cashToSeller}
            <span className="money font-medium text-ink">
              {egp(cashToSeller, { style: "bare", decimals: 0 })}
            </span>
            <ProvenanceChip source={paidSource} />
          </p>
        </div>

        {/* 2. What the whole position costs, against the developer's counter
            today. The saving is a saving on this figure, not on the cash
            above — so this tile carries both sides of the comparison. */}
        <div className={discountPct && discountPct > 0 ? "bg-verified-soft p-5" : "bg-paper-raised p-5"}>
          <p className={discountPct && discountPct > 0 ? "eyebrow mb-1.5 text-verified" : "eyebrow mb-1.5"}>
            {labels.totalEffectiveCost}
          </p>
          <p className="money flex flex-wrap items-baseline gap-2">
            <span className="figure-lg text-ink">
              {egp(totalEffectiveCost, { style: "bare", decimals: 0 })}
            </span>
            <span className="text-sm text-ink-50">EGP</span>
          </p>
          <p className="mt-2 text-xs leading-snug text-ink-50">{labels.totalCostHint}</p>

          {developerPriceToday ? (
            <div className="mt-3 border-t border-verified/25 pt-2.5">
              <p className="money text-sm text-ink-70">
                {labels.vsDeveloper.replace(
                  "{price}",
                  egp(developerPriceToday, { style: "bare", decimals: 0 }),
                )}
              </p>
              {discountPct !== null && discountPct > 0 ? (
                <p className="mt-1 text-sm font-semibold leading-snug text-verified">
                  {labels.belowDeveloper.replace("{pct}", `${discountPct}%`)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 3. What comes with it. This is the contract balance owed to the
            developer, which is not the same as installment x count — special
            payments sit outside the regular schedule — so it is labelled for
            what it is rather than as "remaining installments". */}
        <div className="bg-paper-raised p-5">
          <p className="eyebrow mb-1.5">{labels.outstandingToDeveloper}</p>
          <p className="money flex flex-wrap items-baseline gap-2">
            <span className="figure-lg text-ink">
              {egp(outstandingBalance, { style: "bare", decimals: 0 })}
            </span>
            <span className="text-sm text-ink-50">EGP</span>
          </p>
          <p className="mt-2 text-xs text-ink-50 unicode-bidi-isolate">{labels.remainingPayments}</p>
          {/* A schedule that has run to its end has no next installment — showing
              one would advertise a payment the buyer will never be asked for. */}
          {remainingCount > 0 ? (
            <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-rule pt-2.5 text-sm text-ink-70">
              {labels.installment}
              <span className="money font-medium text-ink">
                {egp(installmentAmount, { style: "bare", decimals: 0 })}
                <span className="ms-1 text-2xs font-normal text-ink-50 unicode-bidi-isolate">{frequencyLabel}</span>
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {action ? <div className="border-t border-rule bg-paper-sunken p-4">{action}</div> : null}
    </div>
  );
}
