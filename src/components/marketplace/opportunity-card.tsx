"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/components/ui/primitives";
import { Badge, MatchRing, VerificationScore, type ScoreComponentView } from "@/components/ui/badges";
import { ProvenanceChip, type Provenance } from "@/components/ui/provenance";
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
  /** Cash to seller + Aqary success fee + developer assignment fee. */
  cashRequiredNow: string;
  totalContractPrice: string | null;
  developerPriceToday: string | null;
  installmentAmount: string | null;
  installmentFrequency: string | null;
  remainingInstallments: number | null;
  outstandingBalance: string | null;
  deliveryDate: string | null;
  discountPctBps: number | null;
  verificationScore: number | null;
  verificationBreakdown: { components?: ScoreComponentView[] } | null;
  /** Analyst-adopted source for the paid-amount the asking cash is capped at. */
  paidSource: Provenance | null;
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

/**
 * A contract position, not a property listing.
 *
 * The old card led with a 4:3 photograph, which made the marketplace read as a
 * generic portal. What is actually for sale here is a position in an
 * installment contract, so the card leads with the three numbers that define
 * it — the cash required now, what that buys against the developer's price
 * today, and the installment obligation that comes with it. The photograph is
 * a supporting thumbnail.
 */
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
  const tu = useTranslations("unitType");
  const tc = useTranslations("city");
  const locale = useLocale();
  const isAr = locale === "ar";
  const [index, setIndex] = useState(0);

  const photos = data.media.filter((m) => m.kind !== "FLOOR_PLAN" && m.kind !== "MASTER_PLAN");
  const current = photos[index];
  // What the image actually is, stated plainly: the unit itself, the
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
  const discountPct = data.discountPctBps !== null ? Math.round(data.discountPctBps / 100) : null;
  const cityLabel = tc.has(data.city) ? tc(data.city) : data.city;
  const remainingCount = data.remainingInstallments ?? 0;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-rule bg-paper-raised transition-shadow duration-200 hover:shadow-e3">
      {/* ---- The position ---------------------------------------------- */}
      <div className="flex items-start justify-between gap-3 border-b border-rule px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink">
            {isAr ? data.projectNameAr : data.projectNameEn}
          </h3>
          <p className="truncate text-xs text-ink-50">
            {isAr ? data.developerNameAr : data.developerNameEn} · {cityLabel}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-1.5 font-mono text-2xs uppercase tracking-wider text-ink-50">
            {/* Each fragment is isolated so mixed Latin/Arabic runs do not reorder. */}
            <span>{tu.has(data.unitType) ? tu(data.unitType) : data.unitType}</span>
            <span aria-hidden>·</span>
            <span>{t("bedroomsCount", { count: data.bedrooms })}</span>
            <span aria-hidden>·</span>
            <span dir="ltr" className="unicode-bidi-isolate">
              {Number(data.buaSqm).toFixed(0)} m²
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {data.matchScore !== undefined ? <MatchRing score={data.matchScore} size={36} /> : null}
          {showSave ? <SaveButton listingId={data.id} initialSaved={data.saved ?? false} /> : null}
        </div>
      </div>

      {/* ---- The money -------------------------------------------------- */}
      <div className="px-4 pb-3 pt-3.5">
        <p className="eyebrow mb-1">{t("cashRequiredNow")}</p>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="money figure-lg text-ink">
            {egp(data.cashRequiredNow, { style: "bare", decimals: 0 })}
          </span>
          <span className="text-sm text-ink-50">EGP</span>
        </div>

        {/* The chip belongs to the value its source was read from. `paidSource`
            is the analyst-adopted source for AMOUNT_PAID, which caps the cash
            to the seller — not the derived total above it. */}
        <p className="mt-1.5 flex flex-wrap items-baseline gap-2 text-xs text-ink-70">
          {t("cashToSeller")}
          <span className="money font-medium text-ink">
            {egp(data.askingCash, { style: "bare", decimals: 0 })}
          </span>
          <ProvenanceChip source={data.paidSource} />
        </p>

        {/* What that buys, against what the developer charges for the same unit
            today. `discountPctBps` is a saving on TOTAL effective cost — cash
            now plus every remaining installment — so the card names that basis
            rather than leaving it to be read against the cash figure above,
            which would overstate it. The full breakdown is on the opportunity. */}
        {data.developerPriceToday && discountPct !== null && discountPct > 0 ? (
          <div className="mt-3 rounded-sm bg-verified-soft px-2.5 py-2">
            <p className="money text-xs font-semibold text-verified">
              {t("discountBadge", { pct: `${discountPct}%` })}
            </p>
            <p className="money mt-1 text-2xs leading-snug text-ink-70">
              {t("discountBasis", { price: egp(data.developerPriceToday, { style: "compact" }) })}
            </p>
          </div>
        ) : null}
      </div>

      {/* ---- The obligation --------------------------------------------- */}
      <dl className="border-t border-rule px-4 py-1">
        {/* A schedule with nothing left to run has no next installment. */}
        {remainingCount > 0 ? (
          <Row
            label={t("installment")}
            value={
              <>
                {egp(data.installmentAmount, { style: "bare", decimals: 0 })}
                <span className="ms-1 text-2xs font-normal text-ink-50">
                  {frequencyLabel(data.installmentFrequency, locale)}
                </span>
              </>
            }
          />
        ) : null}
        <Row
          label={t("remainingLabel")}
          value={
            <>
              {egp(data.outstandingBalance, { style: "compact" })}
              <span className="ms-1 text-2xs font-normal text-ink-50 unicode-bidi-isolate">
                {t("remainingPayments", { count: remainingCount })}
              </span>
            </>
          }
        />
        <Row label={t("delivery")} value={formatQuarter(data.deliveryDate, locale)} last />
      </dl>

      {/* ---- Supporting image ------------------------------------------- */}
      <div
        className="relative aspect-[16/7] overflow-hidden border-y border-rule bg-paper-sunken"
        style={{ backgroundColor: current?.dominantColor ?? undefined }}
      >
        {current?.variants?.card ? (
          <Image
            src={current.variants.card}
            alt={(isAr ? current.altAr : current.altEn) ?? current.altEn}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
            className="object-cover"
            placeholder={current.blurhash ? "blur" : undefined}
            blurDataURL={current.blurhash ?? undefined}
            priority={priority}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-xs text-ink-30">{t("noPhotos")}</p>
        )}

        {photos.length > 1 ? (
          <>
            <button
              type="button"
              aria-label={t("photoPrevious")}
              onClick={(e) => {
                e.preventDefault();
                setIndex((i) => (i - 1 + photos.length) % photos.length);
              }}
              className="absolute start-2 top-1/2 z-10 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full bg-paper/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:flex"
            >
              <Chevron dir={isAr ? "end" : "start"} />
            </button>
            <button
              type="button"
              aria-label={t("photoNext")}
              onClick={(e) => {
                e.preventDefault();
                setIndex((i) => (i + 1) % photos.length);
              }}
              className="absolute end-2 top-1/2 z-10 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full bg-paper/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:flex"
            >
              <Chevron dir={isAr ? "start" : "end"} />
            </button>
          </>
        ) : null}

        {photos.length > 0 ? (
          <div className="absolute bottom-2 start-2 z-10">
            <Badge tone="ink" className="backdrop-blur-sm">
              {mediaLabel} · {t("photoCount", { count: photos.length })}
            </Badge>
          </div>
        ) : null}
      </div>

      {/* ---- Verification and next step --------------------------------- */}
      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
        <div className="flex flex-wrap items-center gap-2">
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
          {data.status === "UNDER_OFFER" ? (
            <Badge tone="info">{t("offersCount", { count: data.offers })}</Badge>
          ) : null}
        </div>

        {data.matchHeadlineEn || data.matchHeadlineAr ? (
          <p className="mt-2.5 border-s-2 border-brass ps-2 text-xs leading-snug text-ink-70">
            {isAr ? data.matchHeadlineAr : data.matchHeadlineEn}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <p className="font-mono text-2xs text-ink-50">
            <span dir="ltr" className="unicode-bidi-isolate">
              {data.reference}
            </span>
            <span className="mt-0.5 block unicode-bidi-isolate">
              {t("daysListed", { days: daysListed })}
              {data.watchers > 0 ? ` · ${t("watchers", { count: data.watchers })}` : ""}
            </span>
          </p>
          <span className="text-sm font-medium text-ink group-hover:text-brass">
            {t("viewOpportunity")} <span aria-hidden className="arrow-forward">→</span>
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

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2",
        !last && "border-b border-rule",
      )}
    >
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
