"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useLocale } from "next-intl";
import { cn } from "@/components/ui/primitives";

/**
 * The two journeys, told as the same five contractual steps seen from each side.
 * Copy comes from the founder's own material (see aqary_source_data).
 */
const JOURNEYS = {
  seller: {
    labelEn: "I hold the contract",
    labelAr: "أنا صاحب التعاقد",
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
        en: ["Contract transfer", "Guided through the developer's assignment process, in your name and with your attendance, until you receive your cash."],
        ar: ["نقل التعاقد", "مرافقتك في إجراءات التنازل لدى المطوّر، باسمك وبحضورك، حتى استلام مبلغك."],
      },
    ],
  },
  buyer: {
    labelEn: "I want to take one over",
    labelAr: "أريد استلام تعاقد",
    steps: [
      {
        en: ["Tell us your budget", "The cash you have now and the installment you can carry. That is what we match on first."],
        ar: ["حدّد ميزانيتك", "النقد المتاح لديك والقسط الذي تتحمله. هذا أساس المطابقة."],
      },
      {
        en: ["See matching opportunities", "Verified contracts with complete figures — every number marked as confirmed by documents or still estimated."],
        ar: ["اطّلع على الفرص المناسبة", "عقود موثّقة بأرقام كاملة، وكل رقم موضّح إن كان مؤكّدًا بالمستندات أم تقديريًا."],
      },
      {
        en: ["Submit your offer", "A formal offer with clear terms. You can never be asked for an overprice — offers above the asking cash are rejected by the system."],
        ar: ["قدّم عرضك", "عرض رسمي بشروط واضحة. لا يمكن مطالبتك بأوفر — النظام يرفض أي عرض أعلى من المطلوب."],
      },
      {
        en: ["Confirm the reservation", "Every step documented in a shared deal room, with a coordinator on both sides."],
        ar: ["أكّد الحجز", "كل خطوة موثّقة في غرفة صفقة مشتركة، مع منسّق للطرفين."],
      },
      {
        en: ["Receive your contract", "An official transfer approved by the developer, with the complete file in your name."],
        ar: ["استلم تعاقدك", "نقل رسمي معتمد من المطوّر، مع ملف كامل باسمك."],
      },
    ],
  },
} as const;

export function HowItWorksTabs() {
  const locale = useLocale();
  const isAr = locale === "ar";

  return (
    <Tabs.Root defaultValue="seller">
      <Tabs.List className="mb-10 inline-flex rounded-sm border border-rule-strong p-1" aria-label="Journeys">
        {(["seller", "buyer"] as const).map((key) => (
          <Tabs.Trigger
            key={key}
            value={key}
            className={cn(
              "rounded-xs px-4 py-2 text-sm transition-colors",
              "data-[state=active]:bg-ink data-[state=active]:text-ink-text",
              "data-[state=inactive]:text-ink-50 data-[state=inactive]:hover:text-ink",
            )}
          >
            {isAr ? JOURNEYS[key].labelAr : JOURNEYS[key].labelEn}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {(["seller", "buyer"] as const).map((key) => (
        <Tabs.Content key={key} value={key} className="animate-fade">
          <ol className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-5">
            {JOURNEYS[key].steps.map((step, i) => {
              const [title, body] = isAr ? step.ar : step.en;
              return (
                <li key={title} className="flex flex-col bg-paper-raised p-5">
                  <span className="money mb-4 font-mono text-2xs tracking-widest text-brass">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mb-2 font-sans text-sm font-semibold text-ink">{title}</h3>
                  <p className="text-xs leading-relaxed text-ink-50">{body}</p>
                </li>
              );
            })}
          </ol>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
