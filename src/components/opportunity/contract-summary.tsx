"use client";

import { useTranslations } from "next-intl";
import { ProvenanceChip } from "@/components/ui/provenance";
import { Card, CardBody, Eyebrow } from "@/components/ui/primitives";
import { egp, formatDate, frequencyLabel } from "@/lib/format";
import type { ProvenancedField } from "@/lib/queries/opportunity";

/**
 * The verified contract summary. Every row shows where the figure came from,
 * and a field with no analyst signature renders as pending rather than falling
 * back to the seller's claim.
 */
export function ContractSummary({
  fields,
  locale,
  title,
  subtitle,
  pendingLabel,
}: {
  fields: ProvenancedField[];
  locale: string;
  title: string;
  subtitle: string;
  pendingLabel: string;
}) {
  const tl = useTranslations("fieldLabel");
  const isAr = locale === "ar";

  const render = (f: ProvenancedField) => {
    if (f.pending) return null;
    if (f.kind === "MONEY") return egp(f.num, { decimals: 0 });
    if (f.kind === "DATE") return formatDate(f.date, locale);
    if (f.kind === "PERCENT") return `${Number(f.num ?? 0).toFixed(2)}%`;
    if (f.key === "INSTALLMENT_FREQUENCY") return frequencyLabel(f.text, locale);
    if (f.kind === "COUNT") return Number(f.num ?? 0).toFixed(0);
    return f.text ?? f.num;
  };

  const headline = fields.filter((f) =>
    ["TOTAL_PRICE", "AMOUNT_PAID", "OUTSTANDING_BALANCE"].includes(f.key),
  );
  const rest = fields.filter((f) => !headline.includes(f));

  return (
    <section>
      <Eyebrow>{title}</Eyebrow>
      <h2 className="mb-2 mt-1 font-display text-xl text-ink">{title}</h2>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-50">{subtitle}</p>

      <Card>
        <CardBody className="p-0">
          {/* The three figures that decide the deal, at their own scale. */}
          <div className="grid gap-px bg-rule sm:grid-cols-3">
            {headline.map((f) => (
              <div key={f.key} className="bg-paper-raised p-5">
                <p className="eyebrow mb-2">{tl(f.key)}</p>
                {f.pending ? (
                  <p className="font-sans text-money-md text-ink-30">{pendingLabel}</p>
                ) : (
                  <p className="money text-money-md font-semibold tracking-tight text-ink">
                    {render(f)}
                  </p>
                )}
                <div className="mt-2">
                  <ProvenanceChip source={f.pending ? "PENDING" : f.source} />
                </div>
              </div>
            ))}
          </div>

          <dl className="rule-t px-5">
            {rest.map((f) => (
              <div
                key={f.key}
                className="rule-b grid grid-cols-[1fr_auto] items-baseline gap-4 py-3"
              >
                <dt className="text-sm text-ink-70">{tl(f.key)}</dt>
                <dd className="flex items-baseline gap-2">
                  {f.pending ? (
                    <span className="text-sm text-ink-30">{pendingLabel}</span>
                  ) : (
                    <span className="money text-sm font-medium text-ink">{render(f)}</span>
                  )}
                  <ProvenanceChip source={f.pending ? "PENDING" : f.source} size="xs" />
                </dd>
              </div>
            ))}
          </dl>

          <p className="px-5 py-4 text-2xs leading-relaxed text-ink-50">
            {isAr
              ? "كل قيمة أعلاه اعتمدها محلل بشري من المصدر الموضّح. البنود التي لم تُعتمد بعد تظهر كـ«بانتظار التوثيق» ولا تُخمّن."
              : "Every value above was promoted to verified by a human analyst from the source shown. Anything not yet signed off is shown as pending, never guessed."}
          </p>
        </CardBody>
      </Card>
    </section>
  );
}
