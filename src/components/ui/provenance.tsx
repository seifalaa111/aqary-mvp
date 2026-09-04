"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "./primitives";

/**
 * The provenance chip — the repeated motif that ties the product together.
 * Every buyer-facing money figure carries one. A figure with no analyst-verified
 * source renders as PENDING rather than being quietly shown as fact.
 */

export type Provenance =
  | "SELLER_DECLARED"
  | "AI_EXTRACTED"
  | "RECEIPT_VERIFIED"
  | "DEVELOPER_CONFIRMED"
  | "ANALYST_OVERRIDE"
  | "PENDING";

const CHIP_STYLES: Record<Provenance, string> = {
  RECEIPT_VERIFIED: "border-verified/35 bg-verified-soft text-verified",
  DEVELOPER_CONFIRMED: "border-verified/35 bg-verified-soft text-verified",
  ANALYST_OVERRIDE: "border-info/35 bg-info-soft text-info",
  AI_EXTRACTED: "border-info/30 bg-info-soft text-info",
  SELLER_DECLARED: "border-pending/40 bg-pending-soft text-pending",
  PENDING: "border-rule-strong bg-paper-sunken text-ink-50",
};

export function ProvenanceChip({
  source,
  size = "sm",
  className,
}: {
  source: Provenance | null | undefined;
  size?: "xs" | "sm";
  className?: string;
}) {
  const t = useTranslations("provenance");
  const key = source ?? "PENDING";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-xs border font-mono uppercase tracking-wider transition-opacity hover:opacity-80",
            CHIP_STYLES[key],
            size === "xs" ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-2xs",
            className,
          )}
          aria-label={`${t("explainTitle")}: ${t(key)}`}
        >
          {key === "RECEIPT_VERIFIED" || key === "DEVELOPER_CONFIRMED" ? <CheckMark /> : null}
          {t(`${key}_short`)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-72 rounded-md border border-rule bg-paper-raised p-3 shadow-e3 animate-fade"
        >
          <p className="eyebrow mb-1">{t("explainTitle")}</p>
          <p className="mb-1 text-sm font-semibold text-ink">{t(key)}</p>
          <p className="text-xs leading-relaxed text-ink-70">{t(`${key}_explain`)}</p>
          <Popover.Arrow className="fill-[var(--color-rule)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden fill="none">
      <path d="M1.5 5.2 3.8 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

/**
 * A money figure with its provenance. The one component every buyer-facing
 * financial value should go through.
 */
export function ProvenancedValue({
  value,
  source,
  size = "md",
  label,
  pendingLabel,
  className,
}: {
  value: ReactNode | null;
  source: Provenance | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  pendingLabel?: string;
  className?: string;
}) {
  const t = useTranslations("opportunity");
  const locale = useLocale();
  const sizes = {
    sm: "text-money-sm",
    md: "text-money-md",
    lg: "text-money-lg",
    xl: "text-money-xl",
  };
  const isPending = value === null || value === undefined || !source;

  return (
    <div className={cn("flex flex-col gap-1", className)} dir={locale === "ar" ? "rtl" : "ltr"}>
      {label ? <span className="eyebrow">{label}</span> : null}
      <div className="flex flex-wrap items-baseline gap-2">
        {isPending ? (
          <span className={cn("font-sans text-ink-30", sizes[size])}>
            {pendingLabel ?? t("pendingField")}
          </span>
        ) : (
          <span className={cn("money font-semibold tracking-tight text-ink", sizes[size])}>{value}</span>
        )}
        <ProvenanceChip source={isPending ? "PENDING" : source} />
      </div>
    </div>
  );
}
