import type { ReactNode } from "react";

/**
 * The verification panel, shown on the public site as a specimen of what a
 * buyer actually sees on an opportunity: a figure, an explicit verified mark,
 * and the document and page the figure was read from.
 *
 * The figures passed in are the worked example, and the caller labels them as
 * such. This component never invents a value and never renders a verified mark
 * for a row it was not given a source for.
 */
export function VerificationPanel({
  rows,
  sourceLabel,
  verifiedLabel,
  illustrativeLabel,
}: {
  rows: { label: string; value: ReactNode; unit?: string; source: string }[];
  sourceLabel: string;
  verifiedLabel: string;
  illustrativeLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-paper-raised">
      {/* The citations below are specimen text, not database provenance. The
          marker carries the same weight as the one on the hero panel so the
          verified ticks cannot be read as evidence about a real listing. */}
      <p className="border-b border-rule bg-paper-sunken px-5 py-2 font-mono text-2xs uppercase tracking-wider text-ink-50">
        {illustrativeLabel}
      </p>
      <dl className="grid gap-px bg-rule sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="bg-paper-raised p-5">
            <dt className="eyebrow mb-2">{r.label}</dt>
            <dd>
              <p className="money flex flex-wrap items-baseline gap-1.5">
                <span className="figure-md text-ink">{r.value}</span>
                {r.unit ? <span className="text-xs text-ink-50">{r.unit}</span> : null}
              </p>

              <p className="mt-2 inline-flex items-center gap-1 rounded-xs border border-verified/35 bg-verified-soft px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-verified">
                <CheckMark />
                {verifiedLabel}
              </p>

              {/* Provenance is the product, so it is a visible artefact rather
                  than a tooltip: the document, and the page inside it. */}
              <div className="mt-3 border-t border-rule pt-3">
                <p className="eyebrow mb-1">{sourceLabel}</p>
                <p className="flex items-start gap-1.5 text-xs leading-snug text-ink-70">
                  <PageMark />
                  <span>{r.source}</span>
                </p>
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden fill="none">
      <path d="M1.5 5.2 3.8 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" />
    </svg>
  );
}

function PageMark() {
  return (
    <svg viewBox="0 0 12 14" className="mt-0.5 size-3 shrink-0 text-ink-30" aria-hidden fill="none">
      <path d="M1.5 1h5l4 4v8h-9z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6.5 1v4h4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
