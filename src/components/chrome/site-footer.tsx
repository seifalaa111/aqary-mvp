import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Wordmark } from "./wordmark";
import { config } from "@/lib/config";

export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const th = await getTranslations({ locale, namespace: "home" });

  const columns = [
    {
      title: t("forSellers"),
      links: [
        { href: "/signup?role=seller", label: t("forSellers") },
        { href: "/how-it-works#seller", label: t("howItWorks") },
      ],
    },
    {
      title: t("forBuyers"),
      links: [
        { href: "/opportunities", label: t("marketplace") },
        { href: "/signup?role=buyer", label: t("forBuyers") },
      ],
    },
    {
      title: t("forDevelopers"),
      links: [
        { href: "/for-developers", label: t("forDevelopers") },
        { href: "/faq", label: t("faq") },
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-rule bg-ink-surface text-ink-text">
      <div className="mx-auto max-w-[1400px] px-5 py-14 md:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark tone="paper" className="text-xl" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-text-70">
              {t("skipToContent") ? null : null}
              Transaction infrastructure for installment-contract assignment (التنازل) in Egypt.
            </p>
            <p className="mt-4 font-mono text-2xs uppercase tracking-wider text-ink-text-50">
              0% seller · {config.PLATFORM_FEE_BPS / 100}% buyer, on completion only
            </p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="eyebrow mb-3 text-ink-text-50">{col.title}</p>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-ink-text-70 transition-colors hover:text-ink-text"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink-rule pt-6 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-2xs uppercase tracking-wider text-ink-text-50">
            {th("footerRights")}
          </p>
          <p className="max-w-xl text-2xs leading-relaxed text-ink-text-50">
            Wordmark is a placeholder pending a real identity. Developer names are real; every
            assignment policy, price, contract, receipt and person in this build is synthetic.
          </p>
        </div>
      </div>
    </footer>
  );
}
