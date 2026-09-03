import { cn } from "@/components/ui/primitives";

/**
 * PLACEHOLDER IDENTITY.
 *
 * Aqary has no brand identity yet. This is a considered typographic treatment
 * standing in for one — a contract's corner fold cut into the counter of the A,
 * because the contract is the asset. It is flagged as a placeholder in
 * ASSUMPTIONS.md and ASSETS.md and must be replaced by real brand work.
 */
export function Wordmark({
  className,
  tone = "ink",
  showMark = true,
}: {
  className?: string;
  tone?: "ink" | "paper";
  showMark?: boolean;
}) {
  const color = tone === "paper" ? "var(--color-ink-text)" : "var(--color-ink)";
  const accent = "var(--color-brass)";

  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      {showMark ? (
        <svg viewBox="0 0 22 22" className="size-[1.05em] translate-y-[0.08em]" aria-hidden>
          <path d="M2 20 L11 2 L20 20 Z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="miter" />
          <path d="M7.4 14.2 H14.6" stroke={color} strokeWidth="1.6" />
          {/* the folded corner — a contract, not a mountain */}
          <path d="M20 20 L20 14.6 L14.6 20 Z" fill={accent} />
        </svg>
      ) : null}
      <span
        className="font-display text-[1.35em] leading-none tracking-[-0.045em]"
        style={{ color }}
      >
        aqary
      </span>
    </span>
  );
}
