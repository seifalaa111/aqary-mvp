"use client";

import { Card, CardBody, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp } from "@/lib/format";

export interface ValuationView {
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

/** Never a single-point valuation: a band, its confidence, and its inputs. */
export function ValuationPanel({
  valuation,
  contractPrice,
  developerToday,
  locale,
  labels,
}: {
  valuation: ValuationView | null;
  contractPrice: string | null;
  developerToday: string | null;
  locale: string;
  labels: {
    title: string;
    sub: string;
    range: string;
    confidence: string;
    drivers: string;
    comparables: string;
  };
}) {
  const isAr = locale === "ar";
  if (!valuation) return null;

  const low = Number(valuation.low);
  const mid = Number(valuation.mid);
  const high = Number(valuation.high);
  const contract = contractPrice ? Number(contractPrice) : null;
  const today = developerToday ? Number(developerToday) : null;

  const scaleMin = Math.min(low, contract ?? low, today ?? low) * 0.92;
  const scaleMax = Math.max(high, contract ?? high, today ?? high) * 1.06;
  const pos = (v: number) => ((v - scaleMin) / (scaleMax - scaleMin)) * 100;

  return (
    <section>
      <Eyebrow>{labels.title}</Eyebrow>
      <h2 className="mb-2 mt-1 font-display text-xl text-ink">{labels.range}</h2>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-50">{labels.sub}</p>

      <Card>
        <CardBody>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <p className="money text-money-lg font-semibold tracking-tight text-ink">
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
              {labels.confidence}: {valuation.confidence.toLowerCase()}
            </Badge>
          </div>

          {/* The band, drawn against the two prices that frame it. */}
          <div className="relative mb-10 mt-8 h-16" aria-hidden>
            <div className="absolute inset-inline-0 top-7 h-px bg-rule" />
            <div
              className="absolute top-5 h-5 rounded-xs bg-brass/25 ring-1 ring-brass/45"
              style={{ insetInlineStart: `${pos(low)}%`, width: `${pos(high) - pos(low)}%` }}
            />
            <div className="absolute top-4 h-7 w-px bg-brass" style={{ insetInlineStart: `${pos(mid)}%` }} />
            <Marker
              pos={pos(mid)}
              label={isAr ? "التقدير الأوسط" : "Mid estimate"}
              value={egp(mid, { style: "compact" })}
              tone="brass"
              above
            />
            {contract ? (
              <Marker
                pos={pos(contract)}
                label={isAr ? "سعر التعاقد" : "Contract price"}
                value={egp(contract, { style: "compact" })}
                tone="ink"
              />
            ) : null}
            {today ? (
              <Marker
                pos={pos(today)}
                label={isAr ? "سعر المطوّر اليوم" : "Developer today"}
                value={egp(today, { style: "compact" })}
                tone="verified"
              />
            ) : null}
          </div>

          <p className="mb-5 text-xs leading-relaxed text-ink-50">{valuation.method}</p>
          {valuation.overrideReason ? (
            <p className="mb-5 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-xs text-ink-70">
              Analyst override: {valuation.overrideReason}
            </p>
          ) : null}

          {valuation.drivers.length > 0 ? (
            <>
              <p className="eyebrow mb-2">{labels.drivers}</p>
              <ul className="rule-t mb-6">
                {valuation.drivers.map((d) => (
                  <li key={d.labelEn} className="rule-b flex items-baseline justify-between gap-4 py-2">
                    <span className="text-sm text-ink-70">
                      {isAr ? d.labelAr : d.labelEn}
                      <span className="ms-2 text-2xs text-ink-30">{d.note}</span>
                    </span>
                    <span
                      className={cn(
                        "money shrink-0 text-sm font-medium",
                        d.effectPct > 0 ? "text-verified" : d.effectPct < 0 ? "text-flagged" : "text-ink-50",
                      )}
                    >
                      {d.effectPct > 0 ? "+" : ""}
                      {d.effectPct.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {valuation.comparables.length > 0 ? (
            <>
              <p className="eyebrow mb-2">{labels.comparables}</p>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="rule-b">
                      <th className="py-2 text-start text-xs font-medium text-ink-50">Unit</th>
                      <th className="py-2 text-end text-xs font-medium text-ink-50">m²</th>
                      <th className="py-2 text-end text-xs font-medium text-ink-50">Price</th>
                      <th className="py-2 text-end text-xs font-medium text-ink-50">EGP / m²</th>
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
              <p className="mt-3 text-2xs leading-relaxed text-ink-50">
                {valuation.comparables[0]!.source}. This is an estimate, not an appraisal.
              </p>
            </>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}

function Marker({
  pos,
  label,
  value,
  tone,
  above,
}: {
  pos: number;
  label: string;
  value: string;
  tone: "brass" | "ink" | "verified";
  above?: boolean;
}) {
  const color = tone === "brass" ? "text-brass" : tone === "verified" ? "text-verified" : "text-ink";
  const dot = tone === "brass" ? "bg-brass" : tone === "verified" ? "bg-verified" : "bg-ink";
  return (
    <div
      className="absolute flex -translate-x-1/2 flex-col items-center"
      style={{ insetInlineStart: `${Math.max(6, Math.min(94, pos))}%`, top: above ? -14 : 32 }}
    >
      {!above ? <span className={cn("mb-1 size-2 rounded-full", dot)} /> : null}
      <span className={cn("money whitespace-nowrap text-2xs font-medium", color)}>{value}</span>
      <span className="whitespace-nowrap text-[9px] uppercase tracking-wider text-ink-30">{label}</span>
      {above ? <span className={cn("mt-1 size-2 rounded-full", dot)} /> : null}
    </div>
  );
}
