import { formatMoney } from "@/lib/money";
import { buyerPlatformFee } from "@/lib/domain/calculators";
import { config } from "@/lib/config";
import type { CancellationComparison } from "@/lib/domain/calculators";

/**
 * The hero visual is the product's own artefact: a term sheet, hairline-ruled,
 * money right-aligned in tabular figures. Figures are the brief's own worked
 * example and are labelled as illustrative, not scraped from a live listing.
 */
export function HeroTermSheet({
  locale,
  comparison,
}: {
  locale: string;
  comparison: CancellationComparison;
}) {
  const isAr = locale === "ar";
  const total = "10000000";
  const paid = "2000000";
  const fee = buyerPlatformFee(total);

  const L = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <aside className="relative self-start" aria-label={L("Worked example", "مثال توضيحي")}>
      <div className="rounded-lg border border-rule bg-paper-raised shadow-e2">
        <header className="rule-b flex items-baseline justify-between px-5 py-3.5">
          <p className="eyebrow">{L("Worked example", "مثال توضيحي")}</p>
          <p className="font-mono text-2xs uppercase tracking-wider text-ink-30">
            {L("illustrative", "توضيحي")}
          </p>
        </header>

        <div className="px-5 py-4">
          <dl className="rule-t">
            <Row
              label={L("Total contract price", "إجمالي سعر التعاقد")}
              value={formatMoney(total, { style: "bare" })}
            />
            <Row
              label={L("Paid by the seller so far", "المسدّد من البائع حتى الآن")}
              value={formatMoney(paid, { style: "bare" })}
              chip={L("VERIFIED", "موثّق")}
            />
            <Row
              label={L("Cash the seller receives", "المبلغ الذي يستلمه البائع")}
              value={formatMoney(paid, { style: "bare" })}
              emphasis
            />
            <Row label={L("Seller commission", "عمولة البائع")} value="0" muted />
            <Row
              label={L(`Buyer success fee (${config.PLATFORM_FEE_BPS / 100}%)`, `رسوم نجاح المشتري (${config.PLATFORM_FEE_BPS / 100}%)`)}
              value={formatMoney(fee, { style: "bare" })}
              muted
            />
          </dl>

          <div className="mt-5 rounded-md bg-paper-sunken p-4">
            <p className="eyebrow mb-2">{L("If they cancelled instead", "لو اختار الإلغاء بدلًا من ذلك")}</p>
            <div className="flex items-baseline justify-between gap-4">
              <span className="money text-money-md font-semibold text-flagged">
                {formatMoney(comparison.refundIfCancelled, { style: "bare" })}
              </span>
              <span className="text-2xs text-ink-50">
                {L(
                  `after a 15% deduction, over ${comparison.refundWaitMonths / 12} years`,
                  `بعد خصم 15%، على مدى ${comparison.refundWaitMonths / 12} سنوات`,
                )}
              </span>
            </div>
          </div>
        </div>

        <footer className="rule-t px-5 py-3">
          <p className="text-2xs leading-relaxed text-ink-50">
            {L(
              "The seller never asks for more than they have verifiably paid. The system rejects any offer above it.",
              "لا يطلب البائع أكثر مما دفعه فعليًا وتم توثيقه. والنظام يرفض أي عرض أعلى من ذلك.",
            )}
          </p>
        </footer>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  chip,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  chip?: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "rule-b grid grid-cols-[1fr_auto] items-baseline gap-4 py-3",
        emphasis ? "-mx-2 bg-brass-soft px-2" : "",
      ].join(" ")}
    >
      <dt className={emphasis ? "text-sm font-semibold text-ink" : muted ? "text-sm text-ink-50" : "text-sm text-ink-70"}>
        {label}
        {chip ? (
          <span className="ms-2 inline-flex rounded-xs border border-verified/35 bg-verified-soft px-1 py-px font-mono text-[9px] uppercase tracking-wider text-verified">
            {chip}
          </span>
        ) : null}
      </dt>
      <dd
        className={[
          "money text-end tabular-nums",
          emphasis ? "text-money-md font-semibold text-ink" : muted ? "text-sm text-ink-50" : "text-sm text-ink",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
