import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { Button, Eyebrow, buttonClass } from "@/components/ui/primitives";

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const isAr = locale === "ar";

  return (
    <div className="mx-auto max-w-[880px] px-5 py-12 md:px-8 md:py-20">
      <Eyebrow>{tn("faq")}</Eyebrow>
      <h1 className="mb-10 mt-2 display-hero text-ink">{t("faqTitle")}</h1>
      <FaqAccordion />

      <div className="mt-14 rounded-lg border border-rule bg-paper-sunken/60 p-6">
        <h2 className="mb-2 font-display text-lg text-ink">
          {isAr ? "ما لا نعد به" : "What we do not promise"}
        </h2>
        <p className="text-sm leading-relaxed text-ink-70">
          {isAr
            ? "نقدّم تقديرات مبنية على مستندات حقيقية، لكننا لا نعد بمدة بيع محددة ولا بنسبة استرداد مضمونة. النتيجة تعتمد على العقد وموافقة المطوّر والسوق."
            : "Aqary presents estimates based on real documents, but makes no promise of a specific selling period or a guaranteed recovery percentage. The outcome depends on the contract, the developer's approval and the market."}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup?role=seller" className={buttonClass("primary", "lg")}>
            {t("ctaSeller")}
          </Link>
        <Link href="/how-it-works" className={buttonClass("secondary", "lg")}>
            {tn("howItWorks")}
          </Link>
      </div>
    </div>
  );
}
