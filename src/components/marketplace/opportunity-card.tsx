"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/components/ui/primitives";
import { Badge, MatchRing, VerificationScore, type ScoreComponentView } from "@/components/ui/badges";
import { ProvenanceChip } from "@/components/ui/provenance";
import { egp, formatQuarter, frequencyLabel } from "@/lib/format";
import { SaveButton } from "./save-button";

export interface CardMedia {
  id: string;
  kind: string;
  altEn: string;
  altAr: string | null;
  variants: { thumb?: string; card?: string; cardJpeg?: string; detail?: string } | null;
  blurhash: string | null;
  dominantColor: string | null;
}

export interface OpportunityCardData {
  id: string;
  reference: string;
  status: string;
  askingCash: string | null;
  installmentAmount: string | null;
  installmentFrequency: string | null;
  remainingInstallments: number | null;
  outstandingBalance: string | null;
  deliveryDate: string | null;
  discountPctBps: number | null;
  verificationScore: number | null;
  verificationBreakdown: { components?: ScoreComponentView[] } | null;
  publishedAt: string | null;
  watchers: number;
  offers: number;
  projectNameEn: string;
  projectNameAr: string;
  developerNameEn: string;
  developerNameAr: string;
  city: string;
  area: string;
  unitType: string;
  bedrooms: number;
  buaSqm: string;
  media: CardMedia[];
  matchScore?: number;
  matchHeadlineEn?: string;
  matchHeadlineAr?: string;
  affordability?: "WITHIN" | "STRETCH" | "ABOVE" | null;
  saved?: boolean;
}

export function OpportunityCard({
  data,
  showSave = true,
  priority = false,
}: {
  data: OpportunityCardData;
  showSave?: boolean;
  priority?: boolean;
}) {
  const t = useTranslations("market");
  const locale = useLocale();
  const isAr = locale === "ar";
  const [index, setIndex] = useState(0);

  const photos = data.media.filter((m) => m.kind !== "FLOOR_PLAN" && m.kind !== "MASTER_PLAN");
  const current = photos[index];
  // What the gallery actually is, stated plainly: the unit itself, the
  // developer's show unit, or a computer-generated render.
  const mediaLabel =
    current?.kind === "RENDER"
      ? t("developerRenders")
      : current?.kind === "SHOW_UNIT"
        ? t("showUnit")
        : t("actualPhotos");
  const daysListed = data.publishedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(data.publishedAt).getTime()) / 86400000))
    : 0;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-rule bg-paper-raised transition-shadow duration-200 hover:shadow-e3">
      {/* ---- Media ---------------------------------------------------- */}
      <div
        className="relative aspect-[4/3] overflow-hidden bg-paper-sunken"
        style={{ backgroundColor: current?.dominantColor ?? undefined }}
      >
        {current?.variants?.card ? (
          <Image
            src={current.variants.card}
            alt={(isAr ? current.altAr : current.altEn) ?? current.altEn}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            placeholder={current.blurhash ? "blur" : undefined}
            blurDataURL={current.blurhash ?? undefined}
            priority={priority}
          />
        ) : null}

        {photos.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.preventDefault();
                setIndex((i) => (i - 1 + photos.length) % photos.length);
              }}
              className="absolute inset-inline-start-2 top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-paper/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:flex"
            >
              <Chevron dir={isAr ? "end" : "start"} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.preventDefault();
                setIndex((i) => (i + 1) % photos.length);
              }}
              className="absolute inset-inline-end-2 top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-paper/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:flex"
            >
              <Chevron dir={isAr ? "start" : "end"} />
            </button>
            <div className="absolute inset-inline-0 bottom-2 z-10 flex justify-center gap-1">
              {photos.slice(0, 8).map((p, i) => (
                <span
                  key={p.id}
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    i === index ? "bg-paper" : "bg-paper/45",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="absolute inset-inline-start-2 top-2 z-10 flex flex-wrap items-center gap-1">
          <Badge tone="ink" className="backdrop-blur-sm">
            {mediaLabel}
          </Badge>
          {photos.length > 0 ? (
            <Badge tone="ink" className="backdrop-blur-sm">
              {photos.length}
            </Badge>
          ) : null}
        </div>

        {showSave ? (
          <div className="absolute inset-inline-end-2 top-2 z-10">
            <SaveButton listingId={data.id} initialSaved={data.saved ?? false} />
          </div>
        ) : null}

        {data.discountPctBps !== null && data.discountPctBps > 0 ? (
          <div className="absolute inset-inline-start-0 bottom-0 z-10 bg-ink/90 px-3 py-1.5 backdrop-blur-sm">
            <span className="money text-sm font-semibold text-ink-text">
              {t("discountBadge", { pct: `${Math.round(data.discountPctBps / 100)}%` })}
            </span>
          </div>
        ) : null}
      </div>

      {/* ---- Body ------------------------------------------------------ */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-sans text-base font-semibold text-ink">
              {isAr ? data.projectNameAr : data.projectNameEn}
            </h3>
            <p className="truncate text-xs text-ink-50">
              {isAr ? data.developerNameAr : data.developerNameEn} · {data.city}
            </p>
          </div>
          {data.matchScore !== undefined ? <MatchRing score={data.matchScore} size={40} /> : null}
        </div>

        <p className="mb-4 flex flex-wrap gap-x-1.5 font-mono text-2xs uppercase tracking-wider text-ink-50">
          {/* Each fragment is isolated so mixed Latin/Arabic runs do not reorder. */}
          <span dir="ltr" className="unicode-bidi-isolate">
            {data.bedrooms} bed
          </span>
          <span aria-hidden>·</span>
          <span dir="ltr" className="unicode-bidi-isolate">
            {Number(data.buaSqm).toFixed(0)} m²
          </span>
          <span aria-hidden>·</span>
          <span>{data.unitType.replace(/_/g, " ").toLowerCase()}</span>
        </p>

        {/* The money is the hero. */}
        <div className="mb-3">
          <p className="eyebrow mb-1">{t("cashToSeller")}</p>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="money text-money-lg font-semibold tracking-tight text-ink">
              {egp(data.askingCash, { style: "bare", decimals: 0 })}
            </span>
            <span className="text-sm text-ink-50">EGP</span>
            <ProvenanceChip source="RECEIPT_VERIFIED" />
          </div>
        </div>

        <dl className="rule-t mb-3 grid gap-0 text-sm">
          <Row
            label={t("installment")}
            value={
              <>
                {egp(data.installmentAmount, { style: "bare", decimals: 0 })}
                <span className="ms-1 text-2xs text-ink-50">
                  {frequencyLabel(data.installmentFrequency, locale)}
                </span>
              </>
            }
          />
          <Row
            label={t("remaining")}
            value={
              <>
                {egp(data.outstandingBalance, { style: "compact" })}
                <span className="ms-1 text-2xs text-ink-50">
                  / {data.remainingInstallments ?? 0}
                </span>
              </>
            }
          />
          <Row label={t("delivery")} value={formatQuarter(data.deliveryDate, locale)} />
        </dl>

        {data.matchHeadlineEn || data.matchHeadlineAr ? (
          <p className="mb-3 border-s-2 border-brass ps-2 text-xs leading-snug text-ink-70">
            {isAr ? data.matchHeadlineAr : data.matchHeadlineEn}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <VerificationScore
            score={data.verificationScore}
            breakdown={data.verificationBreakdown}
            locale={locale}
            size="sm"
          />
          {data.affordability ? (
            <Badge
              tone={
                data.affordability === "WITHIN"
                  ? "verified"
                  : data.affordability === "STRETCH"
                    ? "pending"
                    : "neutral"
              }
            >
              {data.affordability === "WITHIN"
                ? t("withinBudget")
                : data.affordability === "STRETCH"
                  ? t("stretch")
                  : t("aboveProfile")}
            </Badge>
          ) : null}
          {data.status === "UNDER_OFFER" ? <Badge tone="info">{data.offers} offers</Badge> : null}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-rule pt-3 text-2xs text-ink-50">
          <span className="font-mono">{data.reference}</span>
          <span>
            {t("daysListed", { days: daysListed })}
            {data.watchers > 0 ? ` · ${t("watchers", { count: data.watchers })}` : ""}
          </span>
        </div>
      </div>

      {/* Whole card is the link; interactive controls above sit on top of it. */}
      <Link
        href={`/opportunities/${data.id}`}
        className="absolute inset-0 z-[1] rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        aria-label={`${isAr ? data.projectNameAr : data.projectNameEn} — ${data.reference}`}
      >
        <span className="sr-only">
          {isAr ? data.projectNameAr : data.projectNameEn} {data.reference}
        </span>
      </Link>
    </article>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function Chevron({ dir }: { dir: "start" | "end" }) {
  return (
    <svg viewBox="0 0 12 12" className="size-3.5" fill="none" aria-hidden>
      <path
        d={dir === "start" ? "M7.5 2 L3.5 6 L7.5 10" : "M4.5 2 L8.5 6 L4.5 10"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
