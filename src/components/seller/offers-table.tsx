"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, MoneyInput, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { respondToOffer } from "@/app/actions/seller";
import { countdown, egp, formatDate, relativeTime } from "@/lib/format";

export interface OfferRow {
  id: string;
  listingId: string;
  listingReference: string;
  projectName: string;
  amount: string;
  askingCash: string;
  status: string;
  direction: string;
  message: string | null;
  proposedCompletionDays: number;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
  parentOfferId: string | null;
  buyer: {
    name: string;
    tier: string | null;
    readiness: string | null;
    hasProofOfFunds: boolean;
    availableCash: string | null;
  };
  platformFee: string;
}

/**
 * The seller's offer comparison. Counters are threaded, timers are live, and
 * a counter above the asking cash is refused before it is even sent.
 */
export function OffersTable({
  offers,
  locale,
  showListing = false,
}: {
  offers: OfferRow[];
  locale: string;
  showListing?: boolean;
}) {
  const t = useTranslations("seller");
  const to = useTranslations("offer");
  const router = useRouter();
  const isAr = locale === "ar";

  const [countering, setCountering] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (offerId: string, action: "ACCEPT" | "DECLINE" | "COUNTER", amount?: number) =>
    startTransition(async () => {
      setError(null);
      const res = await respondToOffer({
        offerId,
        action,
        amount: amount !== undefined ? String(amount) : undefined,
        message: message || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCountering(null);
      setMessage("");
      if (res.data?.dealId) router.push(`/deals/${res.data.dealId}` as never);
      else router.refresh();
    });

  if (offers.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-50">
            {isAr ? "لا توجد عروض بعد." : "No offers yet. Matched buyers see your listing as soon as it publishes."}
          </p>
        </CardBody>
      </Card>
    );
  }

  // Group counters under the offer they answer.
  const roots = offers.filter((o) => !o.parentOfferId);
  const childrenOf = (id: string) => offers.filter((o) => o.parentOfferId === id);

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="flagged">{error}</Callout> : null}

      {roots.map((o) => {
        const thread = [o, ...childrenOf(o.id)];
        const latest = thread[thread.length - 1]!;
        const live = latest.status === "PENDING";
        const expired = new Date(latest.expiresAt).getTime() < Date.now();
        const asking = Number(latest.askingCash);
        const pct = asking > 0 ? (Number(latest.amount) / asking) * 100 : 0;

        return (
          <Card key={o.id} className={cn(latest.status === "ACCEPTED" && "border-verified/40")}>
            <CardBody>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  {showListing ? (
                    <Link
                      href={`/seller/listings/${o.listingId}`}
                      className="mb-1 block font-mono text-2xs uppercase tracking-wider text-info underline underline-offset-2"
                    >
                      {o.listingReference} · {o.projectName}
                    </Link>
                  ) : null}
                  <p className="text-sm font-semibold text-ink">{latest.buyer.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {latest.buyer.tier ? (
                      <Badge tone={latest.buyer.tier === "PRIORITY" ? "brass" : "verified"}>
                        {latest.buyer.tier.toLowerCase()}
                      </Badge>
                    ) : null}
                    {latest.buyer.readiness ? <Badge tone="neutral">{latest.buyer.readiness}</Badge> : null}
                    <Badge tone={latest.buyer.hasProofOfFunds ? "verified" : "neutral"}>
                      {latest.buyer.hasProofOfFunds ? to("proofOfFundsYes") : to("proofOfFundsNo")}
                    </Badge>
                  </div>
                </div>

                <div className="text-end">
                  <p className="money text-money-md font-semibold text-ink">
                    {egp(latest.amount, { decimals: 0 })}
                  </p>
                  <p className="money text-2xs text-ink-50">
                    {pct.toFixed(1)}% of {egp(asking, { style: "compact" })}
                  </p>
                </div>
              </div>

              {/* Offer vs asking, drawn to scale. */}
              <div className="mb-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-paper-sunken">
                  <div
                    className={cn("h-full rounded-full", pct >= 97 ? "bg-verified" : pct >= 90 ? "bg-brass" : "bg-pending")}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between font-mono text-2xs uppercase tracking-wider text-ink-30">
                  <span>{isAr ? "العرض" : "offer"}</span>
                  <span>{isAr ? "المطلوب" : "asking"}</span>
                </div>
              </div>

              <dl className="rule-t mb-4 text-sm">
                <Row label={to("completionDays")} value={to("days", { count: latest.proposedCompletionDays })} />
                <Row
                  label={isAr ? "رسوم أقاري على المشتري" : "Aqary fee the buyer pays"}
                  value={egp(latest.platformFee, { decimals: 0 })}
                />
                <Row
                  label={isAr ? "ما تستلمه أنت" : "What you receive"}
                  value={egp(latest.amount, { decimals: 0 })}
                />
                <Row
                  label={to("expiresIn", { time: "" })}
                  value={
                    latest.status !== "PENDING"
                      ? latest.status.toLowerCase()
                      : expired
                        ? to("expired")
                        : countdown(latest.expiresAt, locale)
                  }
                />
              </dl>

              {/* Thread */}
              <ol className="rule-t mb-4">
                {thread.map((turn) => (
                  <li key={turn.id} className="rule-b flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-ink">
                        {turn.direction === "BUYER_TO_SELLER"
                          ? isAr
                            ? "المشتري"
                            : "Buyer"
                          : isAr
                            ? "أنت"
                            : "You"}
                      </span>
                      {turn.message ? (
                        <p className="mt-0.5 max-w-md text-xs leading-relaxed text-ink-50">{turn.message}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-baseline gap-3">
                      <span className="money text-sm text-ink">{egp(turn.amount, { decimals: 0 })}</span>
                      <span className="text-2xs text-ink-30">{relativeTime(turn.createdAt, locale)}</span>
                      <Badge
                        tone={
                          turn.status === "ACCEPTED"
                            ? "verified"
                            : turn.status === "PENDING"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {turn.status.toLowerCase()}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ol>

              {latest.status === "ACCEPTED" ? (
                <Callout tone="verified">
                  {isAr ? "تم قبول العرض وفتح غرفة الصفقة." : "Accepted. A deal room is open for this assignment."}
                </Callout>
              ) : live && !expired && latest.direction === "BUYER_TO_SELLER" ? (
                countering === latest.id ? (
                  <div className="flex flex-col gap-3 rounded-md bg-paper-sunken p-4">
                    <p className="text-xs font-medium text-ink-70">{to("counterTitle")}</p>
                    <MoneyInput
                      locale={locale}
                      value={counterAmount}
                      max={asking}
                      onChange={(e) => setCounterAmount(Number(e.currentTarget.value))}
                    />
                    {counterAmount > asking ? (
                      <p className="text-xs text-flagged">{to("cannotExceed")}</p>
                    ) : null}
                    <Textarea
                      rows={2}
                      placeholder={to("message")}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={pending}
                        disabled={counterAmount > asking || counterAmount <= 0}
                        onClick={() => act(latest.id, "COUNTER", counterAmount)}
                      >
                        {t("offerCounter")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCountering(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" loading={pending} onClick={() => act(latest.id, "ACCEPT")}>
                      {t("offerAccept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setCountering(latest.id);
                        setCounterAmount(Math.round(asking));
                      }}
                    >
                      {t("offerCounter")}
                    </Button>
                    <Button size="sm" variant="ghost" loading={pending} onClick={() => act(latest.id, "DECLINE")}>
                      {t("offerDecline")}
                    </Button>
                  </div>
                )
              ) : live && latest.direction === "SELLER_TO_BUYER" ? (
                <Callout tone="info">
                  {isAr
                    ? "عرضك المقابل مع المشتري الآن."
                    : "Your counter is with the buyer. It expires on its own timer."}
                </Callout>
              ) : null}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-xs text-ink">{value}</dd>
    </div>
  );
}
