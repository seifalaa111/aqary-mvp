"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { affordability, MONTHS_PER_PERIOD, type Frequency } from "@/lib/domain/calculators";
import { egp, frequencyLabel } from "@/lib/format";

/**
 * The same `affordability()` function the server uses for match scoring, run
 * live against sliders. Nothing here is a separate approximation of the rule.
 */
export function AffordabilitySimulator({
  listing,
  profile,
  locale,
}: {
  listing: { cashRequiredNow: string; installmentAmount: string; frequency: Frequency };
  profile: { availableCash: string; maxInstallment: string; frequency: Frequency } | null;
  locale: string;
}) {
  const t = useTranslations("opportunity");
  const tm = useTranslations("market");

  const required = Number(listing.cashRequiredNow);
  const listingInst = Number(listing.installmentAmount);

  const [cash, setCash] = useState(() => (profile ? Number(profile.availableCash) : Math.round(required * 0.9)));
  const [inst, setInst] = useState(() =>
    profile ? Number(profile.maxInstallment) : Math.round(listingInst * 0.9),
  );
  const [freq, setFreq] = useState<Frequency>(profile?.frequency ?? listing.frequency);

  const result = useMemo(
    () =>
      affordability({
        availableCash: cash,
        maxInstallment: inst,
        buyerFrequency: freq,
        cashRequiredNow: required,
        listingInstallmentAmount: listingInst,
        listingFrequency: listing.frequency,
      }),
    [cash, inst, freq, required, listingInst, listing.frequency],
  );

  const tone =
    result.verdict === "WITHIN" ? "verified" : result.verdict === "STRETCH" ? "pending" : "neutral";

  return (
    <section>
      <Eyebrow>{t("affordability")}</Eyebrow>
      <h2 className="mb-2 mt-1 font-display text-xl text-ink">{t("affordability")}</h2>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-50">{t("affordabilitySub")}</p>

      <Card>
        <CardBody>
          <div className="grid gap-6 sm:grid-cols-2">
            <Slider
              id="afford-cash"
              label={t("yourCash")}
              value={cash}
              min={0}
              max={Math.max(required * 2, cash * 1.2)}
              step={25000}
              onChange={setCash}
              display={egp(cash, { decimals: 0 })}
              markerLabel={`${t("costCashNow")}: ${egp(required, { style: "compact" })}`}
              markerPct={(required / Math.max(required * 2, cash * 1.2)) * 100}
            />
            <Slider
              id="afford-inst"
              label={t("yourInstallment")}
              value={inst}
              min={0}
              max={Math.max(listingInst * 2.5, inst * 1.2)}
              step={5000}
              onChange={setInst}
              display={`${egp(inst, { decimals: 0 })} ${frequencyLabel(freq, locale)}`}
              markerLabel={`${egp(listingInst, { style: "compact" })} ${frequencyLabel(listing.frequency, locale)}`}
              markerPct={(listingInst / Math.max(listingInst * 2.5, inst * 1.2)) * 100}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-50">{t("yourInstallment")}:</span>
            {(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] as Frequency[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFreq(f)}
                aria-pressed={freq === f}
                className={cn(
                  "rounded-xs border px-2 py-1 text-2xs transition-colors",
                  freq === f
                    ? "border-ink bg-ink text-ink-text"
                    : "border-rule-strong text-ink-50 hover:text-ink",
                )}
              >
                {frequencyLabel(f, locale)}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "mt-6 rounded-md p-4",
              tone === "verified" ? "bg-verified-soft" : tone === "pending" ? "bg-pending-soft" : "bg-paper-sunken",
            )}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Badge tone={tone}>
                {result.verdict === "WITHIN"
                  ? tm("withinBudget")
                  : result.verdict === "STRETCH"
                    ? tm("stretch")
                    : tm("aboveProfile")}
              </Badge>
              <span className="money text-xs text-ink-70">
                EGP {result.buyerMonthlyCapacity.toFixed(0)} / month capacity vs{" "}
                {result.listingMonthlyDemand.toFixed(0)} / month demand
              </span>
            </div>

            <Meter label={t("yourCash")} pct={result.cashCoveragePct} />
            <Meter label={t("yourInstallment")} pct={result.installmentCoveragePct} />

            {result.cashGap.gt(0) ? (
              <p className="mt-3 text-xs text-ink-70">
                You are {egp(result.cashGap, { decimals: 0 })} short on cash at assignment.
              </p>
            ) : null}
            {result.installmentGap.gt(0) ? (
              <p className="mt-1 text-xs text-ink-70">
                The instalment runs {egp(result.installmentGap.mul(MONTHS_PER_PERIOD[freq]), { decimals: 0 })} above
                your stated capacity per {frequencyLabel(freq, locale)} period.
              </p>
            ) : null}
          </div>

          {!profile ? (
            <p className="mt-4 text-2xs text-ink-50">
              These sliders start from sensible defaults. Sign in and complete your buying profile to have
              Aqary match on these figures automatically.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  markerLabel,
  markerPct,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  markerLabel: string;
  markerPct: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium text-ink-70">
          {label}
        </label>
        <span className="money text-money-sm font-semibold text-ink">{display}</span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-rule accent-brass"
        />
        <span
          className="pointer-events-none absolute -top-1 h-3 w-px bg-ink-50"
          style={{ insetInlineStart: `${Math.max(0, Math.min(100, markerPct))}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 font-mono text-2xs uppercase tracking-wider text-ink-50">{markerLabel}</p>
    </div>
  );
}

function Meter({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(140, pct));
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between text-2xs">
        <span className="text-ink-70">{label}</span>
        <span className="money text-ink">{pct.toFixed(0)}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-paper-raised">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            pct >= 100 ? "bg-verified" : pct >= 85 ? "bg-pending" : "bg-flagged",
          )}
          style={{ width: `${(clamped / 140) * 100}%` }}
        />
        <span className="absolute top-0 h-full w-px bg-ink-30" style={{ insetInlineStart: `${(100 / 140) * 100}%` }} />
      </div>
    </div>
  );
}
