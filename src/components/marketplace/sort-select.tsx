"use client";

import { useTransition } from "react";
import { Select, Spinner } from "@/components/ui/primitives";
import { useUrlFilters } from "./url-filters";

const KEYS = ["best-match", "discount", "cash", "installment", "delivery", "newest"] as const;

export function SortSelect({
  current,
  hasProfile,
  labels,
}: {
  current: string;
  hasProfile: boolean;
  labels: Record<string, string>;
}) {
  const { set } = useUrlFilters();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{labels.sortBy}</span>
      {pending ? <Spinner className="size-3.5 text-ink-50" /> : null}
      <Select
        value={current}
        onChange={(e) => startTransition(() => set({ sort: e.currentTarget.value }))}
        className="h-9 w-auto min-w-44 text-xs"
      >
        {KEYS.filter((k) => k !== "best-match" || hasProfile).map((k) => (
          <option key={k} value={k}>
            {labels[k]}
          </option>
        ))}
      </Select>
    </label>
  );
}
