"use client";

import { useTransition } from "react";
import { cn, Spinner } from "@/components/ui/primitives";
import { useUrlFilters } from "./url-filters";

export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const { set } = useUrlFilters();
  const [pending, startTransition] = useTransition();
  if (pageCount <= 1) return null;

  const go = (p: number) =>
    startTransition(() => {
      set({ page: p === 1 ? "" : String(p) }, { resetPage: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1,
  );

  return (
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="Pagination">
      <button
        type="button"
        disabled={page === 1 || pending}
        onClick={() => go(page - 1)}
        className="h-9 rounded-sm border border-rule-strong px-3 text-xs text-ink-70 disabled:opacity-40"
      >
        ←
      </button>
      {pending ? <Spinner className="mx-2 size-3.5 text-ink-50" /> : null}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - pages[i - 1]! > 1 ? <span className="px-1 text-ink-30">…</span> : null}
          <button
            type="button"
            aria-current={p === page ? "page" : undefined}
            onClick={() => go(p)}
            className={cn(
              "money size-9 rounded-sm border text-xs transition-colors",
              p === page
                ? "border-ink bg-ink text-ink-text"
                : "border-rule-strong text-ink-70 hover:border-ink-50",
            )}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={page === pageCount || pending}
        onClick={() => go(page + 1)}
        className="h-9 rounded-sm border border-rule-strong px-3 text-xs text-ink-70 disabled:opacity-40"
      >
        →
      </button>
    </nav>
  );
}
