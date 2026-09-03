"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Decimal } from "decimal.js";
import { Button, Callout, MoneyInput, cn } from "@/components/ui/primitives";
import { ProvenanceChip } from "@/components/ui/provenance";
import { updateAskingCash } from "@/app/actions/seller";
import { minAcceptableCash } from "@/lib/domain/calculators";
import { egp } from "@/lib/format";

/**
 * The no-overprice rule, from the seller's side. The input is capped at the
 * verified amount paid in the browser, and the server rejects anything above it
 * regardless of what the browser sends.
 */
export function AskingCashEditor({
  listingId,
  askingCash,
  flexibilityPct,
  verifiedPaid,
  declaredPaid,
  editable,
  locale,
}: {
  listingId: string;
  askingCash: string;
  flexibilityPct: number;
  verifiedPaid: string | null;
  declaredPaid: string | null;
  editable: boolean;
  locale: string;
}) {
  const t = useTranslations("seller");
  const isAr = locale === "ar";

  const ceiling = verifiedPaid ?? declaredPaid ?? "0";
  const [amount, setAmount] = useState(Number(askingCash));
  const [flex, setFlex] = useState(flexibilityPct);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const over = amount > Number(ceiling);
  const floor = minAcceptableCash(amount, flex);
  const dirty = amount !== Number(askingCash) || flex !== flexibilityPct;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <span className="money text-money-xl font-semibold tracking-tight text-ink">
          {egp(amount, { style: "bare", decimals: 0 })}
        </span>
        <span className="text-lg text-ink-50">EGP</span>
        <ProvenanceChip source={verifiedPaid ? "RECEIPT_VERIFIED" : "SELLER_DECLARED"} />
      </div>

      <p className="mb-5 max-w-lg text-xs leading-relaxed text-ink-70">
        {verifiedPaid
          ? isAr
            ? `هذا هو المبلغ الموثّق الذي دفعته: ${egp(verifiedPaid, { decimals: 0 })}. لا يمكن أن يزيد المبلغ المطلوب عنه.`
            : `This is the verified amount you have paid: ${egp(verifiedPaid, { decimals: 0 })}. Your asking cash can never exceed it.`
          : isAr
            ? "هذا رقمك المُقر به. سيتم تثبيته على الرقم الموثّق بعد مراجعة المحلل."
            : "This is your own declared figure. It is set to the confirmed figure once an analyst signs off your receipts."}
      </p>

      {error ? (
        <div className="mb-4">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}
      {saved ? (
        <div className="mb-4">
          <Callout tone="verified">{isAr ? "تم الحفظ" : "Saved"}</Callout>
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="asking" className="mb-1.5 block text-xs font-medium text-ink-70">
              {isAr ? "المبلغ المطلوب" : "Your asking cash"}
            </label>
            <MoneyInput
              id="asking"
              locale={locale}
              value={amount}
              max={Number(ceiling)}
              onChange={(e) => {
                setSaved(false);
                setAmount(Number(e.currentTarget.value));
              }}
              aria-invalid={over}
            />
            {over ? (
              <p className="mt-1.5 text-xs text-flagged">
                {isAr
                  ? `لا يمكن تجاوز ${egp(ceiling, { decimals: 0 })} — لا يوجد أوفر في أقاري.`
                  : `Cannot exceed ${egp(ceiling, { decimals: 0 })}. Aqary has no overprice.`}
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="flex" className="text-xs font-medium text-ink-70">
                {isAr ? "المرونة للنزول" : "Downward flexibility"}
              </label>
              <span className="money text-xs text-ink">{flex}%</span>
            </div>
            <input
              id="flex"
              type="range"
              min={0}
              max={15}
              value={flex}
              onChange={(e) => {
                setSaved(false);
                setFlex(Number(e.target.value));
              }}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-rule accent-brass"
            />
            <p className="mt-1.5 text-2xs text-ink-50">
              {flex === 0
                ? isAr
                  ? "لن تُعرض أي مرونة على المشترين."
                  : "Buyers are told you are not offering flexibility."
                : isAr
                  ? `أقل مبلغ ستنظر فيه: ${egp(floor, { decimals: 0 })}`
                  : `Lowest figure shown to buyers: ${egp(floor, { decimals: 0 })}`}
            </p>
          </div>

          <Button
            className="self-start"
            disabled={!dirty || over}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await updateAskingCash({
                  listingId,
                  askingCash: new Decimal(amount).toFixed(2),
                  flexibilityPct: flex,
                });
                if (!res.ok) setError(res.error);
                else setSaved(true);
              })
            }
          >
            {isAr ? "حفظ" : "Save"}
          </Button>
        </div>
      ) : (
        <p className={cn("text-xs text-ink-50")}>
          {isAr
            ? "لا يمكن تعديل المبلغ في هذه المرحلة."
            : "The cash figure is locked at this stage of the transaction."}
        </p>
      )}
    </div>
  );
}
