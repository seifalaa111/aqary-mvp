"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Callout, Input, Textarea } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp } from "@/lib/format";

export interface ValuationRow {
  id: string;
  low: string;
  mid: string;
  high: string;
  confidence: string;
  method: string;
  overrideReason: string | null;
  drivers: { labelEn: string; labelAr: string; effectPct: number; note: string }[];
  comparables: {
    label: string;
    projectName: string;
    unitType: string;
    buaSqm: string;
    price: string;
    pricePerSqm: string;
    source: string;
  }[];
}

export function ValuationReview({
  valuation,
  developerToday,
  locale,
  onOverride,
  pending,
}: {
  valuation: ValuationRow | null;
  developerToday: string | null;
  locale: string;
  onOverride: (low: string, mid: string, high: string, reason: string) => void;
  pending: boolean;
}) {
  const isAr = locale === "ar";
  const tk = useTranslations("consoleUi");
  const [editing, setEditing] = useState(false);
  const [low, setLow] = useState(valuation?.low ?? "");
  const [mid, setMid] = useState(valuation?.mid ?? "");
  const [high, setHigh] = useState(valuation?.high ?? "");
  const [reason, setReason] = useState("");

  if (!valuation) return <p className="text-sm text-ink-50">{tk("noValuation")}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-rule bg-paper-raised p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="money text-money-md font-semibold text-ink">
            {egp(valuation.low, { style: "compact" })} – {egp(valuation.high, { style: "compact" })}
          </p>
          <Badge
            tone={
              valuation.confidence === "HIGH"
                ? "verified"
                : valuation.confidence === "MEDIUM"
                  ? "info"
                  : "pending"
            }
          >
            {valuation.confidence.toLowerCase()} confidence
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-ink-50">{valuation.method}</p>
        {developerToday ? (
          <p className="money mt-2 text-xs text-ink-70">
            Developer list price today: {egp(developerToday, { decimals: 0 })}
          </p>
        ) : null}
        {valuation.overrideReason ? (
          <div className="mt-3">
            <Callout tone="info" title={tk("analystOverrideOnRecord")}>
              {valuation.overrideReason}
            </Callout>
          </div>
        ) : null}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">{tk("whatMovesThisNumber")}</h3>
        <ul className="rule-t">
          {valuation.drivers.map((d) => (
            <li key={d.labelEn} className="rule-b flex items-baseline justify-between gap-3 py-2">
              <span className="text-xs text-ink-70">
                {isAr ? d.labelAr : d.labelEn}
                <span className="ms-2 text-[10px] text-ink-30">{d.note}</span>
              </span>
              <span className="money shrink-0 text-xs text-ink">
                {d.effectPct > 0 ? "+" : ""}
                {d.effectPct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">{tk("comparables")}</h3>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[460px] border-collapse text-xs">
            <thead>
              <tr className="rule-b">
                <th className="py-2 text-start font-medium text-ink-50">Unit</th>
                <th className="py-2 text-end font-medium text-ink-50">m²</th>
                <th className="py-2 text-end font-medium text-ink-50">Price</th>
                <th className="py-2 text-end font-medium text-ink-50">EGP/m²</th>
              </tr>
            </thead>
            <tbody>
              {valuation.comparables.map((c) => (
                <tr key={c.label} className="rule-b">
                  <td className="py-2 text-ink">{c.label}</td>
                  <td className="money py-2 text-end text-ink-70">{Number(c.buaSqm).toFixed(0)}</td>
                  <td className="money py-2 text-end text-ink">{egp(c.price, { style: "compact" })}</td>
                  <td className="money py-2 text-end text-ink-70">
                    {Number(c.pricePerSqm).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {valuation.comparables[0] ? (
          <p className="mt-2 text-2xs text-ink-30">{valuation.comparables[0].source}</p>
        ) : null}
      </section>

      {editing ? (
        <div className="flex flex-col gap-2 rounded-md bg-paper-sunken p-3">
          <div className="grid grid-cols-3 gap-2">
            <Input className="money" value={low} onChange={(e) => setLow(e.target.value)} placeholder="Low" />
            <Input className="money" value={mid} onChange={(e) => setMid(e.target.value)} placeholder="Mid" />
            <Input className="money" value={high} onChange={(e) => setHigh(e.target.value)} placeholder={tk("high")} />
          </div>
          <Textarea
            rows={2}
            placeholder={tk("reasonOnRecord")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              disabled={reason.trim().length < 8}
              onClick={() => {
                onOverride(low, mid, high, reason);
                setEditing(false);
              }}
            >{tk("saveOverride")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="self-start" onClick={() => setEditing(true)}>{tk("overrideValuation")}</Button>
      )}
    </div>
  );
}
