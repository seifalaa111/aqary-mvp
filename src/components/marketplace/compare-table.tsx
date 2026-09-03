"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { egp, formatQuarter, frequencyLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badges";
import { EmptyState, cn } from "@/components/ui/primitives";
import type { OpportunityCardData } from "./opportunity-card";

/**
 * Side-by-side comparison, up to four. The winning cell in each money row is
 * marked, because the point of a comparison table is to answer the question.
 */
export function CompareTable({ items }: { items: OpportunityCardData[] }) {
  const t = useTranslations("market");
  const to = useTranslations("opportunity");
  const locale = useLocale();
  const isAr = locale === "ar";
  const [selected, setSelected] = useState<string[]>(items.slice(0, 4).map((i) => i.id));

  const shown = items.filter((i) => selected.includes(i.id)).slice(0, 4);

  if (items.length === 0) {
    return <EmptyState title={t("empty")} body={t("emptySub")} />;
  }

  const rows: {
    label: string;
    value: (i: OpportunityCardData) => string;
    best?: "min" | "max";
    raw?: (i: OpportunityCardData) => number;
  }[] = [
    {
      label: t("cashToSeller"),
      value: (i) => egp(i.askingCash),
      best: "min",
      raw: (i) => Number(i.askingCash ?? Infinity),
    },
    {
      label: t("installment"),
      value: (i) => `${egp(i.installmentAmount)} ${frequencyLabel(i.installmentFrequency, locale)}`,
      best: "min",
      raw: (i) => Number(i.installmentAmount ?? Infinity),
    },
    {
      label: t("remaining"),
      value: (i) => `${egp(i.outstandingBalance)} / ${i.remainingInstallments ?? 0}`,
      best: "min",
      raw: (i) => Number(i.outstandingBalance ?? Infinity),
    },
    {
      label: to("costSaving"),
      value: (i) => (i.discountPctBps ? `${(i.discountPctBps / 100).toFixed(1)}%` : "—"),
      best: "max",
      raw: (i) => i.discountPctBps ?? -Infinity,
    },
    { label: t("delivery"), value: (i) => formatQuarter(i.deliveryDate, locale) },
    { label: t("verified"), value: (i) => `${i.verificationScore ?? 0}/100`, best: "max", raw: (i) => i.verificationScore ?? 0 },
    { label: to("unitDetails"), value: (i) => `${i.bedrooms} bed · ${Number(i.buaSqm).toFixed(0)} m²` },
    { label: to("projectDetails"), value: (i) => (isAr ? i.projectNameAr : i.projectNameEn) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 12).map((i) => {
          const on = selected.includes(i.id);
          return (
            <button
              key={i.id}
              type="button"
              onClick={() =>
                setSelected((s) =>
                  on ? s.filter((x) => x !== i.id) : s.length >= 4 ? s : [...s, i.id],
                )
              }
              aria-pressed={on}
              className={cn(
                "rounded-sm border px-2.5 py-1 font-mono text-2xs transition-colors",
                on ? "border-ink bg-ink text-ink-text" : "border-rule-strong text-ink-50 hover:border-ink-50",
              )}
            >
              {i.reference}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[720px] border-collapse bg-paper-raised">
          <thead>
            <tr>
              <th className="rule-b rule-e w-44 bg-paper-sunken p-3 text-start text-xs font-medium text-ink-50">
                {t("compare")}
              </th>
              {shown.map((i) => (
                <th key={i.id} className="rule-b rule-e p-3 text-start align-top last:border-e-0">
                  <Link href={`/opportunities/${i.id}`} className="group block">
                    <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-sm bg-paper-sunken">
                      {i.media[0]?.variants?.thumb ? (
                        <Image
                          src={i.media[0].variants.thumb}
                          alt={(isAr ? i.media[0].altAr : i.media[0].altEn) ?? ""}
                          fill
                          sizes="200px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <span className="block truncate text-sm font-semibold text-ink group-hover:underline">
                      {isAr ? i.projectNameAr : i.projectNameEn}
                    </span>
                    <span className="font-mono text-2xs text-ink-50">{i.reference}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              let bestId: string | null = null;
              if (row.best && row.raw && shown.length > 1) {
                const vals = shown.map((i) => ({ id: i.id, v: row.raw!(i) }));
                const target =
                  row.best === "min"
                    ? vals.reduce((a, b) => (b.v < a.v ? b : a))
                    : vals.reduce((a, b) => (b.v > a.v ? b : a));
                if (Number.isFinite(target.v)) bestId = target.id;
              }
              return (
                <tr key={row.label}>
                  <th scope="row" className="rule-b rule-e bg-paper-sunken p-3 text-start text-xs font-medium text-ink-50">
                    {row.label}
                  </th>
                  {shown.map((i) => (
                    <td
                      key={i.id}
                      className={cn(
                        "rule-b rule-e money p-3 text-sm text-ink last:border-e-0",
                        bestId === i.id && "bg-verified-soft font-semibold text-verified",
                      )}
                    >
                      {row.value(i)}
                      {bestId === i.id ? (
                        <Badge tone="verified" className="ms-2 align-middle">
                          best
                        </Badge>
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
