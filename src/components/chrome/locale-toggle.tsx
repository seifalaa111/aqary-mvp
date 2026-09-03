"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/routing";
import { useParams, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/primitives";

/**
 * Switches locale on the current route, preserving the path and query so a
 * filtered marketplace view survives the switch. `dir` flips on the server via
 * the locale layout, so the whole page mirrors, not just the labels.
 */
export function LocaleToggle({ locale, label }: { locale: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const next = locale === "ar" ? "en" : "ar";
  const query = search.toString();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          // Keep the path and the query so a filtered marketplace view survives.
          router.replace(
            { pathname, params: params as never, query: Object.fromEntries(new URLSearchParams(query)) } as never,
            { locale: next },
          );
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-rule-strong px-2.5 font-mono text-2xs uppercase tracking-wider text-ink-70 transition-colors hover:border-ink-50 hover:text-ink"
      aria-label={`Switch language to ${next === "ar" ? "Arabic" : "English"}`}
    >
      {pending ? <Spinner className="size-3" /> : <GlobeMark />}
      {label}
    </button>
  );
}

function GlobeMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="6" cy="6" rx="2.2" ry="4.6" stroke="currentColor" strokeWidth="1" />
      <path d="M1.6 4.6h8.8M1.6 7.4h8.8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
