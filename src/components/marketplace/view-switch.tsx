"use client";

import { useTransition } from "react";
import { cn } from "@/components/ui/primitives";
import { useUrlFilters } from "./url-filters";

export function ViewSwitch({
  current,
  labels,
}: {
  current: string;
  labels: { grid: string; compare: string; map: string };
}) {
  const { set } = useUrlFilters();
  const [, startTransition] = useTransition();

  return (
    <div className="inline-flex rounded-sm border border-rule-strong p-0.5" role="group" aria-label="View">
      {(["grid", "compare", "map"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={current === v}
          onClick={() => startTransition(() => set({ view: v === "grid" ? "" : v }, { resetPage: true }))}
          className={cn(
            "rounded-xs px-3 py-1.5 text-xs transition-colors",
            current === v ? "bg-ink text-ink-text" : "text-ink-50 hover:text-ink",
          )}
        >
          {labels[v]}
        </button>
      ))}
    </div>
  );
}
