import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { config } from "@/lib/config";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { Eyebrow, buttonClass } from "@/components/ui/primitives";

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const tf = await getTranslations({ locale, namespace: "faq" });

  return (
    <div className="shell py-10 md:py-14">
      <div className="grid gap-10 lg:grid-cols-[1fr_300px] lg:gap-14">
        <div className="min-w-0">
          <Eyebrow>{tn("faq")}</Eyebrow>
          <h1 className="mb-6 mt-2 display-hero text-ink">{t("faqTitle")}</h1>
          <FaqAccordion feePct={config.PLATFORM_FEE_BPS / 100} />

          <div className="mt-8 rounded-lg border border-rule bg-paper-sunken p-5">
            <h2 className="mb-2 text-base font-semibold text-ink">{tf("noPromiseTitle")}</h2>
            <p className="text-sm leading-relaxed text-ink-70">{tf("noPromiseBody")}</p>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-rule bg-paper-raised p-5">
            <h2 className="text-base font-semibold text-ink">{t("finalTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-70">{t("finalSub")}</p>
            <Link href="/signup?role=seller" className={buttonClass("inkPrimary", "md", "mt-4 w-full")}>
              {t("heroCtaPrimary")} <span aria-hidden className="arrow-forward">→</span>
            </Link>
            <Link href="/opportunities" className={buttonClass("secondary", "md", "mt-2 w-full")}>
              {t("heroCtaSecondary")}
            </Link>
            <Link href="/fees" className={buttonClass("ghost", "md", "mt-2 w-full")}>
              {tn("fees")}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
