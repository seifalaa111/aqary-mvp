"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleSaveListing } from "@/app/actions/buyer";
import { cn } from "@/components/ui/primitives";

export function SaveButton({
  listingId,
  initialSaved,
  variant = "icon",
}: {
  listingId: string;
  initialSaved: boolean;
  variant?: "icon" | "labelled";
}) {
  const t = useTranslations("market");
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const optimistic = !saved;
      setSaved(optimistic);
      const res = await toggleSaveListing(listingId);
      if (!res.ok) {
        setSaved(!optimistic);
        setError(res.code === "UNAUTHENTICATED" ? "Sign in to save" : res.error);
      } else {
        setSaved(res.data!.saved);
      }
    });
  };

  if (variant === "labelled") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm transition-colors",
          saved
            ? "border-brass bg-brass-soft text-brass"
            : "border-rule-strong text-ink-70 hover:border-ink-50 hover:text-ink",
        )}
      >
        <Bookmark filled={saved} />
        {saved ? t("saved") : t("save")}
        {error ? <span className="text-2xs text-flagged">{error}</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? t("saved") : t("save")}
      title={error ?? undefined}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition-colors",
        saved ? "bg-brass text-ink" : "bg-paper/85 text-ink-70 hover:bg-paper hover:text-ink",
        error && "ring-1 ring-flagged",
      )}
    >
      <Bookmark filled={saved} />
    </button>
  );
}

function Bookmark({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
      <path
        d="M3.5 1.5h7v11l-3.5-2.6-3.5 2.6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
