import type { ReactNode } from "react";
import { cn } from "./primitives";

/**
 * The public site's layout vocabulary.
 *
 * The previous public pages were a stack of identical slabs — eyebrow, huge
 * serif headline, paragraph, a lot of air, a bordered card — repeated eight
 * times. These pieces exist so a page can vary its composition without every
 * section re-deciding its own padding, width and heading treatment.
 */

type Tone = "paper" | "sunken" | "ink";

const TONES: Record<Tone, string> = {
  paper: "bg-paper text-ink",
  sunken: "bg-paper-sunken text-ink",
  ink: "bg-ink-surface text-ink-text",
};

export function Section({
  tone = "paper",
  wide = false,
  tight = false,
  bordered = true,
  id,
  className,
  innerClassName,
  children,
}: {
  tone?: Tone;
  /** 1440px shell instead of 1280px — for the marketplace grid. */
  wide?: boolean;
  /** Half the vertical rhythm, for sections that continue the one above. */
  tight?: boolean;
  bordered?: boolean;
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        TONES[tone],
        bordered && (tone === "ink" ? "border-b border-ink-rule" : "border-b border-rule"),
        className,
      )}
    >
      <div className={cn(wide ? "shell-wide" : "shell", tight ? "section-y-tight" : "section-y", innerClassName)}>
        {children}
      </div>
    </section>
  );
}

/**
 * Section heading. On wide screens the action sits on the same baseline as the
 * title rather than below a paragraph, which keeps a section header to about
 * three lines instead of a third of a viewport.
 */
export function SectionHead({
  eyebrow,
  title,
  body,
  action,
  onInk = false,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  onInk?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className={cn("eyebrow mb-2", onInk && "text-ink-text-50")}>{eyebrow}</p>
        ) : null}
        <h2 className={cn("display-section", onInk ? "text-ink-text" : "text-ink")}>{title}</h2>
        {body ? (
          <p className={cn("mt-2.5 text-sm leading-relaxed", onInk ? "text-ink-text-70" : "text-ink-70")}>
            {body}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A row of figures separated by hairlines. Used instead of four bordered cards,
 * which is what made every previous section look like the one before it.
 */
export function StatStrip({
  items,
  onInk = false,
  className,
}: {
  items: { value: ReactNode; label: ReactNode; note?: ReactNode }[];
  onInk?: boolean;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px md:grid-cols-4",
        onInk ? "bg-ink-rule" : "bg-rule",
        "overflow-hidden rounded-lg border",
        onInk ? "border-ink-rule" : "border-rule",
        className,
      )}
    >
      {items.map((s, i) => (
        <div key={i} className={cn("p-4 md:p-5", onInk ? "bg-ink-surface" : "bg-paper-raised")}>
          <dd className={cn("figure-md", onInk ? "text-ink-text" : "text-ink")}>{s.value}</dd>
          <dt className={cn("mt-1.5 text-xs leading-snug", onInk ? "text-ink-text-50" : "text-ink-50")}>
            {s.label}
          </dt>
          {s.note ? (
            <p className={cn("mt-1 text-2xs leading-snug", onInk ? "text-ink-text-50" : "text-ink-30")}>
              {s.note}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * A money figure at display size with its unit and an optional qualifier.
 * The largest thing on a public page should be one of these, not a headline.
 */
export function Figure({
  value,
  unit,
  size = "lg",
  tone = "ink",
  className,
}: {
  value: ReactNode;
  unit?: ReactNode;
  size?: "md" | "lg" | "xl";
  tone?: "ink" | "verified" | "flagged" | "brass" | "paper";
  className?: string;
}) {
  const tones = {
    ink: "text-ink",
    verified: "text-verified",
    flagged: "text-flagged",
    brass: "text-brass",
    paper: "text-ink-text",
  };
  const sizes = { md: "figure-md", lg: "figure-lg", xl: "figure-xl" };
  return (
    <p className={cn("money flex flex-wrap items-baseline gap-1.5", className)}>
      <span className={cn(sizes[size], tones[tone])}>{value}</span>
      {unit ? <span className="text-sm font-normal text-ink-50">{unit}</span> : null}
    </p>
  );
}

/** A hairline-ruled label/value row, denser than a card. */
export function LineItem({
  label,
  value,
  sub,
  emphasis = false,
  onInk = false,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  emphasis?: boolean;
  onInk?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b py-2.5",
        onInk ? "border-ink-rule" : "border-rule",
      )}
    >
      <dt className={cn("text-sm", onInk ? "text-ink-text-70" : "text-ink-70")}>
        {label}
        {sub ? (
          <span className={cn("mt-0.5 block text-2xs", onInk ? "text-ink-text-50" : "text-ink-50")}>
            {sub}
          </span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "money shrink-0 text-end",
          emphasis
            ? cn("text-money-sm font-semibold", onInk ? "text-ink-text" : "text-ink")
            : cn("text-sm", onInk ? "text-ink-text" : "text-ink"),
        )}
      >
        {value}
      </dd>
    </div>
  );
}
