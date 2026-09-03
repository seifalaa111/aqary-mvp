"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/primitives";

/** The listing state machine, rendered as the seller's live tracker. */
const TRACK = [
  "DRAFT",
  "SUBMITTED",
  "AI_PROCESSING",
  "PENDING_REVIEW",
  "VERIFIED",
  "LISTED",
  "UNDER_OFFER",
  "RESERVED",
  "ASSIGNMENT_IN_PROGRESS",
  "COMPLETED",
] as const;

const TERMINAL = ["REJECTED", "WITHDRAWN", "EXPIRED"];

export function StatusTracker({
  status,
  locale,
  compact = false,
}: {
  status: string;
  locale: string;
  compact?: boolean;
}) {
  const t = useTranslations("status");
  const te = useTranslations("statusExplain");

  if (TERMINAL.includes(status)) {
    return (
      <div className="rounded-md border border-flagged/25 bg-flagged-soft px-3 py-2">
        <p className="text-sm font-medium text-flagged">{t(status)}</p>
        <p className="mt-0.5 text-xs text-ink-70">{te(status)}</p>
      </div>
    );
  }

  // INFO_REQUESTED is a branch off PENDING_REVIEW, not a step backwards.
  const effective = status === "INFO_REQUESTED" ? "PENDING_REVIEW" : status;
  const index = TRACK.indexOf(effective as (typeof TRACK)[number]);
  const current = Math.max(0, index);

  const visible = compact ? TRACK.slice(0, 6) : TRACK;

  return (
    <div>
      <ol className="flex items-center gap-1" role="list">
        {visible.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  done ? "bg-verified" : active ? "bg-brass" : "bg-rule",
                )}
                title={t(s)}
              />
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-live="polite">
        <span
          className={cn(
            "text-sm font-medium",
            status === "INFO_REQUESTED" ? "text-pending" : "text-ink",
          )}
        >
          {t(status)}
        </span>
        {!compact ? <span className="text-xs text-ink-50">{te(status)}</span> : null}
      </div>

      {compact ? <p className="mt-1 text-xs text-ink-50">{te(status)}</p> : null}
    </div>
  );
}
