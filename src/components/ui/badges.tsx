"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useTranslations } from "next-intl";
import { cn } from "./primitives";

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "verified" | "pending" | "flagged" | "info" | "brass" | "ink";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-rule-strong bg-paper-sunken text-ink-70",
    verified: "border-verified/30 bg-verified-soft text-verified",
    pending: "border-pending/35 bg-pending-soft text-pending",
    flagged: "border-flagged/30 bg-flagged-soft text-flagged",
    info: "border-info/30 bg-info-soft text-info",
    brass: "border-brass/35 bg-brass-soft text-brass",
    ink: "border-transparent bg-ink text-ink-text",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-2xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("status");
  const tone =
    status === "LISTED" || status === "VERIFIED" || status === "COMPLETED"
      ? "verified"
      : status === "REJECTED" || status === "EXPIRED"
        ? "flagged"
        : status === "PENDING_REVIEW" || status === "INFO_REQUESTED" || status === "AI_PROCESSING"
          ? "pending"
          : status === "UNDER_OFFER" || status === "RESERVED" || status === "ASSIGNMENT_IN_PROGRESS"
            ? "info"
            : "neutral";
  return (
    <Badge tone={tone} className={className}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "verified" && "bg-verified",
          tone === "pending" && "bg-pending",
          tone === "flagged" && "bg-flagged",
          tone === "info" && "bg-info",
          tone === "neutral" && "bg-ink-30",
        )}
        aria-hidden
      />
      {t(status)}
    </Badge>
  );
}

export interface ScoreComponentView {
  key: string;
  labelEn: string;
  labelAr: string;
  weight: number;
  ratio: number;
  points: number;
  detailEn: string;
  detailAr: string;
}

/**
 * Verification score with a full breakdown popover. A black-box trust score is
 * worthless — every component, its weight and its measurement are shown.
 */
export function VerificationScore({
  score,
  breakdown,
  locale,
  size = "md",
}: {
  score: number | null;
  breakdown?: { components?: ScoreComponentView[]; tier?: string } | null;
  locale: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("market");
  if (score === null) return null;

  const tone = score >= 85 ? "verified" : score >= 65 ? "info" : score >= 40 ? "pending" : "flagged";
  const components = breakdown?.components ?? [];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="shrink-0" aria-label={t("verificationScore", { score })}>
          <Badge tone={tone} className={size === "sm" ? "" : "px-2 py-1"}>
            <ShieldMark />
            {t("verificationScore", { score })}
          </Badge>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-80 rounded-md border border-rule bg-paper-raised p-4 shadow-e3 animate-fade"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">Verification score</p>
            <p className="money text-money-md font-semibold text-ink">{score}</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {components.map((c) => (
              <li key={c.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-ink">
                    {locale === "ar" ? c.labelAr : c.labelEn}
                  </span>
                  <span className="money shrink-0 text-2xs text-ink-50">
                    {c.points} / {c.weight}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-paper-sunken">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      c.ratio >= 0.8 ? "bg-verified" : c.ratio >= 0.4 ? "bg-pending" : "bg-flagged",
                    )}
                    style={{ inlineSize: `${Math.round(c.ratio * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-50">
                  {locale === "ar" ? c.detailAr : c.detailEn}
                </p>
              </li>
            ))}
          </ul>
          <Popover.Arrow className="fill-[var(--color-rule)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ShieldMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
      <path d="M6 1 10 2.6v3.2c0 2.4-1.7 4.2-4 5.2-2.3-1-4-2.8-4-5.2V2.6L6 1Z" stroke="currentColor" strokeWidth="1" />
      <path d="M4.2 6.1 5.5 7.4 8 4.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
  );
}

export function SeverityBadge({ severity }: { severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL" }) {
  const tone = severity === "CRITICAL" ? "flagged" : severity === "MAJOR" ? "pending" : "neutral";
  return <Badge tone={tone}>{severity}</Badge>;
}

export function MatchRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? "var(--color-verified)" : score >= 55 ? "var(--color-brass)" : "var(--color-ink-30)";
  return (
    <div className="relative shrink-0" style={{ inlineSize: size, blockSize: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-rule)" strokeWidth="2.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="2.5"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          strokeLinecap="round"
        />
      </svg>
      <span className="money absolute inset-0 flex items-center justify-center text-xs font-semibold text-ink">
        {score}
      </span>
    </div>
  );
}
