"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Decimal } from "decimal.js";
import { Callout, Field, Select, Input } from "@/components/ui/primitives";
import { minAcceptableCash } from "@/lib/domain/calculators";
import { egp } from "@/lib/format";

type V = Record<string, unknown>;

const CONSENTS = [
  {
    key: "DEVELOPER_VERIFICATION_AUTHORIZATION",
    en: "I authorise Aqary to verify my contract, balances and assignment eligibility directly with the developer.",
    ar: "أفوّض أقاري في التحقق من عقدي وأرصدتي وأهلية التنازل مباشرة مع المطوّر.",
  },
  {
    key: "LISTING_AGREEMENT",
    en: "I agree to the listing agreement: Aqary charges me no commission, and the cash I receive equals what I have verifiably paid.",
    ar: "أوافق على اتفاقية الإدراج: لا تتقاضى أقاري أي عمولة مني، والمبلغ الذي أستلمه يساوي ما دفعته وتم توثيقه.",
  },
  {
    key: "DISPLAY_REDACTED_CONTRACT",
    en: "I consent to Aqary showing redacted, watermarked pages of my contract and receipts to verified buyers.",
    ar: "أوافق على عرض صفحات محجوبة البيانات وبعلامة مائية من عقدي وإيصالاتي على المشترين الموثّقين.",
  },
  {
    key: "TERMS_OF_SERVICE",
    en: "I accept the terms of service.",
    ar: "أوافق على شروط الخدمة.",
  },
  {
    key: "PRIVACY_AND_DATA_PROCESSING",
    en: "I accept the privacy notice and consent to the processing of my identity and financial data for verification.",
    ar: "أوافق على إشعار الخصوصية ومعالجة بياناتي الشخصية والمالية لأغراض التوثيق.",
  },
] as const;

const EXIT_REASONS = [
  ["JOB_CHANGE", "Job or income change", "تغيّر الوظيفة أو الدخل"],
  ["BUSINESS_DIFFICULTY", "Business difficulty", "تعثّر في العمل"],
  ["INCREASED_OBLIGATIONS", "Increased financial obligations", "زيادة الالتزامات المالية"],
  ["FAMILY_CIRCUMSTANCES", "Family or personal circumstances", "ظروف عائلية أو شخصية"],
  ["LIQUIDITY_NEED", "I need the cash", "أحتاج السيولة"],
  ["STRATEGY_CHANGE", "My investment plan changed", "تغيّرت خطتي الاستثمارية"],
  ["CANNOT_CONTINUE_INSTALLMENTS", "I cannot continue the installments", "لا أستطيع إكمال الأقساط"],
  ["OTHER", "Something else", "سبب آخر"],
] as const;

export function StepExitTerms({
  value,
  onChange,
  errors,
  declaredPaid,
  maxFlexibility,
  locale,
}: {
  value: V;
  onChange: (v: V) => void;
  errors: Record<string, string>;
  declaredPaid: string;
  maxFlexibility: number;
  locale: string;
}) {
  const t = useTranslations("seller");
  const isAr = locale === "ar";
  const set = (k: string) => (v: unknown) => onChange({ ...value, [k]: v });
  const consents = (value.consents as Record<string, boolean>) ?? {};
  const flexibility = Number(value.flexibilityPct ?? 0);

  const paid = new Decimal(declaredPaid || 0);
  const floor = useMemo(() => minAcceptableCash(paid, flexibility), [paid, flexibility]);

  const allConsented = CONSENTS.every((c) => consents[c.key]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl text-ink">{t("step5")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-50">
          {isAr
            ? "المبلغ الذي تستلمه يساوي ما دفعته وتم توثيقه. لا يمكنك طلب أكثر منه — وهذا هو سبب وجود أقاري."
            : "The cash you receive equals what you have verifiably paid. You cannot ask for more — that is the whole reason Aqary exists."}
        </p>
      </div>

      {/* ---- The cash figure, read-only ---- */}
      <div className="rounded-lg border border-brass/30 bg-brass-soft p-5">
        <p className="eyebrow mb-2 text-brass">{t("cashYouReceive")}</p>
        <p className="money text-money-xl font-semibold tracking-tight text-ink">
          {egp(paid, { style: "bare", decimals: 0 })}
          <span className="ms-2 text-lg font-normal text-ink-50">EGP</span>
        </p>
        <p className="mt-2 max-w-lg text-xs leading-relaxed text-ink-70">
          {isAr
            ? "هذا الرقم مبني على ما أدخلته في الخطوة الثالثة، وسيتم تعديله إلى الرقم الموثّق بعد مراجعة المحلل. لا يمكن أن يزيد عنه أبدًا."
            : "This figure comes from what you entered in step 3. After verification it is set to the confirmed figure — it can be revised down to match your documents, never up."}
        </p>

        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="flexibility" className="text-xs font-medium text-ink-70">
              {isAr
                ? "استعدادي للنزول عن هذا المبلغ للإسراع بالبيع"
                : "How far below this I would go to close faster"}
            </label>
            <span className="money text-sm font-semibold text-ink">{flexibility}%</span>
          </div>
          <input
            id="flexibility"
            type="range"
            min={0}
            max={maxFlexibility}
            step={1}
            value={flexibility}
            onChange={(e) => set("flexibilityPct")(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-rule accent-brass"
          />
          <p className="mt-2 text-xs text-ink-70">
            {flexibility === 0
              ? isAr
                ? "لن أقبل أقل من المبلغ الكامل."
                : "You will only consider the full figure."
              : isAr
                ? `أقل مبلغ ستنظر فيه: ${egp(floor, { decimals: 0 })}`
                : `Lowest figure you would consider: ${egp(floor, { decimals: 0 })}`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isAr ? "ما مدى إلحاح الأمر؟" : "How soon do you need this?"} htmlFor="urgency" required>
          <Select id="urgency" value={String(value.urgency ?? "ONE_TO_THREE_MONTHS")} onChange={(e) => set("urgency")(e.target.value)}>
            <option value="IMMEDIATE">{isAr ? "فورًا" : "As soon as possible"}</option>
            <option value="ONE_TO_THREE_MONTHS">{isAr ? "خلال 1–3 أشهر" : "Within 1–3 months"}</option>
            <option value="FLEXIBLE">{isAr ? "مرن" : "I am flexible"}</option>
          </Select>
        </Field>

        <Field
          label={isAr ? "سبب الخروج" : "Why are you exiting?"}
          htmlFor="exitReason"
          required
          hint={isAr ? "يبقى سريًا ولا يُعرض للمشترين" : "Kept private — never shown to buyers"}
        >
          <Select id="exitReason" value={String(value.exitReason ?? "LIQUIDITY_NEED")} onChange={(e) => set("exitReason")(e.target.value)}>
            {EXIT_REASONS.map(([k, en, ar]) => (
              <option key={k} value={k}>
                {isAr ? ar : en}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-rule bg-paper-sunken/50 p-4">
          <input
            type="checkbox"
            checked={Boolean(value.isPrivate)}
            onChange={(e) => set("isPrivate")(e.target.checked)}
            className="mt-0.5 size-4 accent-ink"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              {isAr ? "إدراج خاص" : "Private listing"}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-50">
              {isAr
                ? "لا تظهر الوحدة في أي إعلان عام — يراها فقط المشترون الموثّقون المطابقون لها."
                : "Your unit never appears in any public advertisement. Only verified buyers matched to it can see it."}
            </span>
          </span>
        </label>

        <Field
          label={isAr ? "فترة حصرية (أيام)" : "Exclusivity period (days)"}
          htmlFor="exclusivityDays"
          hint={isAr ? "اختياري" : "Optional"}
        >
          <Input
            id="exclusivityDays"
            type="number"
            min={0}
            max={180}
            className="money"
            value={String(value.exclusivityDays ?? 0)}
            onChange={(e) => set("exclusivityDays")(Number(e.target.value))}
          />
        </Field>
      </div>

      {/* ---- Consents, each one separate and individually logged ---- */}
      <div>
        <p className="eyebrow mb-3">{isAr ? "الموافقات" : "Consents"}</p>
        {errors.consents ? (
          <div className="mb-3">
            <Callout tone="flagged">
              {isAr ? "جميع الموافقات مطلوبة" : "All consents are required before we can verify your file"}
            </Callout>
          </div>
        ) : null}
        <ul className="flex flex-col gap-2">
          {CONSENTS.map((c) => (
            <li key={c.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-rule bg-paper-raised p-3.5 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(consents[c.key])}
                  onChange={(e) => set("consents")({ ...consents, [c.key]: e.target.checked })}
                  className="mt-0.5 size-4 shrink-0 accent-ink"
                />
                <span className="leading-relaxed text-ink-70">{isAr ? c.ar : c.en}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-2xs leading-relaxed text-ink-50">
          {isAr
            ? "كل موافقة تُسجَّل بشكل منفصل مع التاريخ وعنوان الـ IP."
            : "Each consent is recorded separately, with a timestamp and the IP address it was given from."}
        </p>
        {allConsented ? null : (
          <p className="mt-2 text-2xs text-pending">
            {isAr ? "لم تكتمل الموافقات بعد." : "Not all consents given yet."}
          </p>
        )}
      </div>
    </div>
  );
}
