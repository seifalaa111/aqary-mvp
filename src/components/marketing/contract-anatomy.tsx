import { formatMoney } from "@/lib/money";
import { money } from "@/lib/money";

/**
 * What a transfer actually moves.
 *
 * One bar drawn to scale against the total contract value, split at the point
 * the seller has paid to. The left of the split is what the buyer settles in
 * cash; the right is the obligation they inherit unchanged. Drawn once, at
 * scale, rather than explained in three paragraphs.
 */
export function ContractAnatomy({
  totalContractPrice,
  amountPaid,
  labels,
  locale,
}: {
  totalContractPrice: string;
  amountPaid: string;
  locale: string;
  labels: {
    total: string;
    paid: string;
    paidNote: string;
    remaining: string;
    remainingNote: string;
    buyerPays: string;
    buyerContinues: string;
  };
}) {
  const total = money(totalContractPrice);
  const paid = money(amountPaid);
  const remaining = total.minus(paid);
  const paidPct = total.isZero() ? 0 : paid.div(total).mul(100).toNumber();
  const isAr = locale === "ar";
  const bare = (v: Parameters<typeof formatMoney>[0]) =>
    formatMoney(v, { style: "bare", locale: isAr ? "ar" : "en" });

  return (
    <div className="rounded-lg border border-rule bg-paper-raised p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="eyebrow">{labels.total}</p>
        <p className="money text-money-sm font-semibold text-ink">{bare(total)} EGP</p>
      </div>

      {/* The split, at scale. */}
      <div className="mt-4 flex h-10 w-full overflow-hidden rounded-sm border border-rule" aria-hidden>
        <div
          className="flex items-center justify-center bg-verified px-2 text-2xs font-medium text-white"
          style={{ inlineSize: `${paidPct}%` }}
        >
          {Math.round(paidPct)}%
        </div>
        <div
          className="flex items-center justify-center bg-paper-sunken px-2 text-2xs text-ink-70"
          style={{ inlineSize: `${100 - paidPct}%` }}
        >
          {Math.round(100 - paidPct)}%
        </div>
      </div>

      <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-2">
        <div className="bg-verified-soft p-4">
          <p className="eyebrow mb-1.5 text-verified">{labels.paid}</p>
          <p className="money figure-md text-verified">{bare(paid)}</p>
          <p className="mt-1.5 text-xs leading-snug text-ink-70">{labels.paidNote}</p>
          <p className="mt-3 border-t border-verified/25 pt-2 text-xs font-medium text-ink">
            <span className="arrow-forward inline-block">→</span> {labels.buyerPays}
          </p>
        </div>
        <div className="bg-paper-raised p-4">
          <p className="eyebrow mb-1.5">{labels.remaining}</p>
          <p className="money figure-md text-ink">{bare(remaining)}</p>
          <p className="mt-1.5 text-xs leading-snug text-ink-70">{labels.remainingNote}</p>
          <p className="mt-3 border-t border-rule pt-2 text-xs font-medium text-ink">
            <span className="arrow-forward inline-block">→</span> {labels.buyerContinues}
          </p>
        </div>
      </div>
    </div>
  );
}
