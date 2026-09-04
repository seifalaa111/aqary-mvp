import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Wordmark } from "./wordmark";
import { config } from "@/lib/config";

export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const th = await getTranslations({ locale, namespace: "home" });

  const columns = [
    {
      title: t("sell"),
      links: [
        { href: "/signup?role=seller", label: t("forSellers") },
        { href: "/how-it-works#seller", label: t("howItWorks") },
      ],
    },
    {
      title: t("buy"),
      links: [
        { href: "/opportunities", label: t("marketplace") },
        { href: "/signup?role=buyer", label: t("forBuyers") },
      ],
    },
    {
      title: t("learn"),
      links: [
        { href: "/fees", label: t("fees") },
        { href: "/for-developers", label: t("forDevelopers") },
        { href: "/faq", label: t("faq") },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-rule bg-ink-surface text-ink-text">
      <div className="shell-wide py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark tone="paper" className="text-xl" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-text-70">
              {th("footerTagline")}
            </p>
            <p className="mt-4 font-mono text-2xs uppercase tracking-wider text-ink-text-50">
              {th("footerFeeLine", { pct: config.PLATFORM_FEE_BPS / 100 })}
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

        <div className="mt-10 flex flex-col gap-3 border-t border-ink-rule pt-6 md:flex-row md:items-start md:justify-between">
          <p className="font-mono text-2xs uppercase tracking-wider text-ink-text-50">
            {th("footerRights")}
          </p>
          <p className="max-w-xl text-2xs leading-relaxed text-ink-text-50">
            {th("footerDisclaimer")}
          </p>
        </div>
      </div>
    </footer>
  );
}
