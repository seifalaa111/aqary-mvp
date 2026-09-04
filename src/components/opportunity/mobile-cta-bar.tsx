"use client";

/**
 * Mobile sticky action bar for an opportunity.
 *
 * On a phone the offer panel sits at the end of a very long page, so the price
 * and the next step are pinned to the bottom of the viewport. It scrolls to the
 * real offer panel rather than duplicating it, so there is exactly one place
 * where an offer is actually made.
 */
export function MobileCtaBar({
  amount,
  label,
  cta,
  targetId,
}: {
  amount: string;
  label: string;
  cta: string;
  targetId: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="money truncate text-money-sm font-semibold text-ink">{amount}</p>
        </div>
        <a
          href={`#${targetId}`}
          className="inline-flex h-11 shrink-0 items-center rounded-md bg-brass px-5 text-sm font-semibold text-ink"
        >
          {cta}
        </a>
      </div>
    </div>
  );
}
