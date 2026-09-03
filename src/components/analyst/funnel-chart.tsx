"use client";

import { cn } from "@/components/ui/primitives";

/**
 * A funnel drawn to scale from real counts. No library, no decoration —
 * width encodes the number, colour encodes nothing.
 */
export function FunnelChart({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const pct = (s.value / max) * 100;
        const prev = i > 0 ? steps[i - 1]!.value : null;
        const conversion = prev && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-70">{s.label}</span>
              <span className="money text-sm font-semibold text-ink">
                {s.value}
                {conversion !== null ? (
                  <span className="ms-2 text-2xs font-normal text-ink-30">{conversion.toFixed(0)}%</span>
                ) : null}
              </span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-xs bg-paper-sunken">
              <div
                className={cn("h-full rounded-xs transition-[width]", i === steps.length - 1 ? "bg-verified" : "bg-ink")}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
