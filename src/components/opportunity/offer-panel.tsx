"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { Button, Callout, Field, MoneyInput, Textarea, Select, cn, buttonClass } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { submitOffer } from "@/app/actions/buyer";
import { egp, countdown } from "@/lib/format";

/**
 * The no-overprice rule made structural: the amount input is capped at the
 * asking cash on the client AND rejected above it on the server. There is no
 * path through this component that can produce an over-asking offer.
 */
export function OfferPanel({
  listingId,
  reference,
  askingCash,
  minAcceptableCash,
  flexibilityPct,
  platformFee,
  feePct,
  status,
  signedIn,
  isBuyer,
  tier,
  hasInterest,
  existingOffer,
  locale,
}: {
  listingId: string;
  reference: string;
  askingCash: string;
  minAcceptableCash: string | null;
  flexibilityPct: number;
  platformFee: string;
  feePct: number;
  status: string;
  signedIn: boolean;
  isBuyer: boolean;
  tier: string | null;
  hasInterest: boolean;
  existingOffer: { id: string; amount: string; status: string; expiresAt: string } | null;
  locale: string;
}) {
  const t = useTranslations("offer");
  const to = useTranslations("opportunity");
  const tb = useTranslations("buyer");
  const router = useRouter();

  // The displayed asking cash is rounded to whole pounds, so the cap the buyer
  // can actually type must be rounded the same way. Otherwise the screen says
  // "EGP 7,381,200" and typing exactly that is rejected against 7,381,199.75.
  const asking = Math.floor(Number(askingCash));
  const [amount, setAmount] = useState(asking);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(45);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const overAsking = amount > asking;
  const belowFloor = minAcceptableCash ? amount < Number(minAcceptableCash) : false;

  const totalOnCompletion = useMemo(() => amount + Number(platformFee), [amount, platformFee]);

  if (existingOffer) {
    return (
      <div className="rounded-md border border-info/25 bg-info-soft p-4">
        <p className="eyebrow mb-1 text-info">{t("status")}</p>
        <p className="money mb-1 text-money-md font-semibold text-ink">
          {egp(existingOffer.amount, { decimals: 0 })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={existingOffer.status === "ACCEPTED" ? "verified" : "info"}>
            {existingOffer.status.toLowerCase()}
          </Badge>
          {existingOffer.status === "PENDING" ? (
            <span className="money text-2xs text-ink-70">
              {t("expiresIn", { time: countdown(existingOffer.expiresAt, locale) })}
            </span>
          ) : null}
        </div>
        <Link
          href="/buyer/offers"
          className="mt-3 inline-block text-xs text-info underline underline-offset-2"
        >
          {tb("myOffers")} <span className="arrow-forward inline-block">→</span>
        </Link>
      </div>
    );
  }

  if (status !== "LISTED" && status !== "UNDER_OFFER") {
    return (
      <div className="rounded-md bg-paper-sunken p-4 text-sm text-ink-50">
        This listing is not currently open for offers.
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-2">
        <Link href={`/signup?role=buyer`} className={buttonClass("primary", "lg", "w-full")}>
            {to("makeOffer")}
          </Link>
        <p className="text-2xs leading-relaxed text-ink-50">
          {to("signUpToOffer", { reference })}
        </p>
      </div>
    );
  }

  if (!isBuyer) {
    return (
      <div className="rounded-md bg-paper-sunken p-4 text-sm text-ink-50">
        You are signed in on a different workspace. Switch to your buyer workspace to make an offer.
      </div>
    );
  }

  if (tier === "BROWSER") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-pending/30 bg-pending-soft p-3 text-xs text-ink-70">
          {tb("tierUpgrade")}
        </div>
        <Link href="/buyer/onboarding" className={buttonClass("primary", "lg", "w-full")}>
            {tb("onboarding")}
          </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        {to("makeOffer")}
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await submitOffer({
            listingId,
            amount,
            message: message || undefined,
            proposedCompletionDays: days,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <p className="eyebrow">{t("title")}</p>

      {error ? <Callout tone="flagged">{error}</Callout> : null}

      <div className="rule-t rule-b flex items-baseline justify-between py-2.5">
        <span className="text-sm text-ink-70">{t("askingCash")}</span>
        <span className="money text-sm font-semibold text-ink">{egp(asking, { decimals: 0 })}</span>
      </div>

      <Field
        label={t("yourOffer")}
        htmlFor="offer-amount"
        required
        error={overAsking ? t("cannotExceed") : undefined}
        hint={
          !overAsking && flexibilityPct > 0
            ? t("flexibilityNote", { pct: `${flexibilityPct}%` })
            : undefined
        }
      >
        <MoneyInput
          id="offer-amount"
          locale={locale}
          value={amount}
          max={asking}
          min={0}
          onChange={(e) => setAmount(Number(e.currentTarget.value))}
          aria-invalid={overAsking}
        />
      </Field>

      <input
        type="range"
        min={Math.round(asking * 0.6)}
        max={asking}
        step={Math.max(1000, Math.round(asking / 400))}
        value={Math.min(amount, asking)}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-rule accent-brass"
        aria-label={t("yourOffer")}
      />
      {belowFloor ? (
        <p className="text-2xs text-pending">
          Below the seller&apos;s stated floor of {egp(minAcceptableCash!, { style: "compact" })}. You can still
          send it; they may counter.
        </p>
      ) : null}

      <Field label={t("completionDays")} htmlFor="offer-days">
        <Select id="offer-days" value={days} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          {[21, 30, 45, 60, 90].map((d) => (
            <option key={d} value={d}>
              {t("days", { count: d })}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("message")} htmlFor="offer-message">
        <Textarea
          id="offer-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>

      <div className="rounded-md bg-paper-sunken p-3">
        <p className="text-2xs leading-relaxed text-ink-70">
          {t("costReminder", { pct: `${feePct}%`, amount: egp(platformFee, { decimals: 0 }) })}
        </p>
        <p className="money mt-2 text-sm font-semibold text-ink">
          {egp(totalOnCompletion, { decimals: 0 })}{" "}
          <span className="text-2xs font-normal text-ink-50">due on completion</span>
        </p>
      </div>

      {!hasInterest ? (
        <p className="text-2xs text-ink-50">
          Submitting an offer also unlocks the document vault for this deal and records your acceptance of
          its confidentiality terms.
        </p>
      ) : null}

      <div className={cn("flex gap-2")}>
        <Button type="submit" size="lg" className="flex-1" loading={pending} disabled={overAsking || amount <= 0}>
          {t("submit")}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
