import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getSessionUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/guard";
import { Wordmark } from "./wordmark";
import { LocaleToggle } from "./locale-toggle";
import { MobileNav } from "./mobile-nav";

/**
 * Public navigation.
 *
 * The three things a visitor can be here to do — buy, sell, or understand the
 * product — are named as such and separated by a rule. The commercial action
 * ("Sell my contract") is the only accented control in the bar; Dashboard is a
 * quiet link, because a signed-in seller returning to the marketing site is a
 * rarer path than a first-time visitor deciding to list.
 */
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const user = await getSessionUser();

  const groups: { label: string; links: { href: string; label: string }[] }[] = [
    { label: t("buy"), links: [{ href: "/opportunities", label: t("marketplace") }] },
    { label: t("sell"), links: [{ href: "/signup?role=seller", label: t("forSellers") }] },
    {
      label: t("learn"),
      links: [
        { href: "/how-it-works", label: t("howItWorks") },
        { href: "/fees", label: t("fees") },
        { href: "/for-developers", label: t("forDevelopers") },
        { href: "/faq", label: t("faq") },
      ],
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur-md">
      <div className="shell-wide flex h-16 items-center gap-5">
        <Link href="/" className="shrink-0 text-lg" aria-label="Aqary" >
          <Wordmark />
        </Link>

        <nav className="hidden flex-1 items-center gap-5 md:flex" aria-label={t("primary")}>
          {groups.map((g, i) => (
            <div key={g.label} className="flex items-center gap-5">
              {i > 0 ? <span className="h-4 w-px bg-rule" aria-hidden /> : null}
              <span className="eyebrow shrink-0" aria-hidden>
                {g.label}
              </span>
              {g.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="whitespace-nowrap text-sm text-ink-70 transition-colors hover:text-ink"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <LocaleToggle locale={locale} label={t("language")} />

          {user ? (
            <Link
              href={homeForRole(user.activeRole)}
              className="hidden h-9 items-center rounded-sm px-3 text-sm text-ink-70 transition-colors hover:text-ink md:inline-flex"
            >
              {t("dashboard")}
            </Link>
          ) : (
            <Link
              href="/signin"
              className="hidden h-9 items-center rounded-sm px-3 text-sm text-ink-70 transition-colors hover:text-ink md:inline-flex"
            >
              {t("signIn")}
            </Link>
          )}

          {/* The one accented control in the chrome. */}
          <Link
            href="/signup?role=seller"
            className="hidden h-9 items-center rounded-sm bg-brass px-4 text-sm font-semibold text-ink transition-colors hover:bg-brass-hover md:inline-flex"
          >
            {t("sellCta")} <span aria-hidden className="arrow-forward ms-1.5">→</span>
          </Link>

          <MobileNav
            groups={groups}
            signedIn={Boolean(user)}
            dashboardHref={user ? homeForRole(user.activeRole) : "/signin"}
            labels={{
              open: t("openMenu"),
              close: t("closeMenu"),
              signIn: t("signIn"),
              dashboard: t("dashboard"),
              sellCta: t("sellCta"),
              browseCta: t("browseCta"),
              account: t("account"),
            }}
          />
        </div>
      </div>
    </header>
  );
}
