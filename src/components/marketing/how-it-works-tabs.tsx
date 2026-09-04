"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/components/ui/primitives";

/**
 * The two journeys, told as the same five contractual steps seen from each
 * side. Rendered as a numbered process with a rule running through it rather
 * than five identical cards, so the sequence — and the point at which a human
 * analyst signs off — is legible at a glance.
 */
const JOURNEYS = {
  seller: {
    /** Index of the step gated on a human analyst, if any. */
    humanStep: 2,
    steps: [
      {
        en: ["Assess your contract", "Enter your contract details and see your position. Free, and no obligation to list."],
        ar: ["قيّم تعاقدك", "أدخل بيانات عقدك واعرف موقفك. مجانًا وبدون التزام بالنشر."],
      },
      {
        en: ["Upload your documents", "Contract, all payment receipts, and the developer account statement if you have one."],
        ar: ["ارفع مستنداتك", "العقد وكل إيصالات السداد وكشف حساب المطوّر إن وُجد."],
      },
      {
        en: ["We verify the figures", "AI reads the file; a human analyst confirms every number against the documents before anything is published."],
        ar: ["نوثّق الأرقام", "الذكاء الاصطناعي يقرأ الملف، ومحلل بشري يؤكد كل رقم مقابل المستندات قبل النشر."],
      },
      {
        en: ["We find your buyer", "Matched to buyers who can genuinely carry the remaining installments — not just anyone browsing."],
        ar: ["نجد لك المشتري", "مطابقة مع مشترين قادرين فعلًا على إكمال الأقساط، وليس أي متصفّح."],
      },
      {
        en: ["Developer assignment, then cash", "Guided through the developer's assignment process, in your name and with your attendance, until you receive your cash."],
        ar: ["التنازل لدى المطوّر ثم استلام المبلغ", "مرافقتك في إجراءات التنازل لدى المطوّر، باسمك وبحضورك، حتى استلام مبلغك."],
      },
    ],
  },
  buyer: {
    humanStep: null as number | null,
    steps: [
      {
        en: ["Set your capacity", "The cash you have now and the installment you can carry. That is what we match on first."],
        ar: ["حدّد قدرتك", "النقد المتاح لديك والقسط الذي تتحمله. هذا أساس المطابقة."],
      },
      {
        en: ["Browse verified contracts", "Complete figures on every opportunity — each one marked as confirmed by documents or still pending."],
        ar: ["تصفّح العقود الموثّقة", "أرقام كاملة على كل فرصة، وكل رقم موضّح إن كان مؤكّدًا بالمستندات أم قيد التوثيق."],
      },
      {
        en: ["Review the file", "The full schedule, the documents, and the developer's assignment terms, before you commit to anything."],
        ar: ["راجع الملف", "الجدول كاملًا والمستندات وشروط التنازل لدى المطوّر، قبل أي التزام."],
      },
      {
        en: ["Submit your offer", "A formal offer with clear terms. You can never be asked for an overprice — offers above the asking cash are rejected by the system."],
        ar: ["قدّم عرضك", "عرض رسمي بشروط واضحة. لا يمكن مطالبتك بأوفر — النظام يرفض أي عرض أعلى من المطلوب."],
      },
      {
        en: ["Transfer, then continue the installments", "An official transfer approved by the developer, with the complete file in your name and the schedule unchanged."],
        ar: ["النقل ثم إكمال الأقساط", "نقل رسمي معتمد من المطوّر، مع ملف كامل باسمك وجدول سداد دون تغيير."],
      },
    ],
  },
} as const;

export function HowItWorksTabs() {
  const locale = useLocale();
  const t = useTranslations("howItWorks");
  const isAr = locale === "ar";

  return (
    <Tabs.Root defaultValue="seller">
      <Tabs.List
        className="mb-6 inline-flex rounded-sm border border-rule-strong bg-paper-raised p-1"
        aria-label={t("title")}
      >
        {(["seller", "buyer"] as const).map((key) => (
          <Tabs.Trigger
            key={key}
            value={key}
            className={cn(
              "rounded-xs px-4 py-2 text-sm font-medium transition-colors",
              "data-[state=active]:bg-ink data-[state=active]:text-ink-text",
              "data-[state=inactive]:text-ink-50 data-[state=inactive]:hover:text-ink",
            )}
          >
            {key === "seller" ? t("sellerTab") : t("buyerTab")}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {(["seller", "buyer"] as const).map((key) => (
        <Tabs.Content key={key} value={key} className="animate-fade">
          <ol className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-5">
            {JOURNEYS[key].steps.map((step, i) => {
              const [title, body] = isAr ? step.ar : step.en;
              const isHuman = JOURNEYS[key].humanStep === i;
              return (
                <li key={title} className="relative flex flex-col bg-paper-raised p-4 md:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-2xs",
                        isHuman
                          ? "bg-brass text-ink"
                          : "border border-rule-strong bg-paper text-ink-50",
                      )}
                    >
                      {i + 1}
                    </span>
                    {/* The rule that carries the eye to the next step. */}
                    <span className="h-px flex-1 bg-rule" aria-hidden />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold text-ink">{title}</h3>
                  <p className="text-xs leading-relaxed text-ink-50">{body}</p>
                  {isHuman ? (
                    <span className="mt-3 inline-flex w-fit rounded-xs border border-brass/40 bg-brass-soft px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-brass">
                      {t("humanGate")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
