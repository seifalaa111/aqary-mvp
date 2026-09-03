import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getSessionUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/guard";
import { Wordmark } from "./wordmark";
import { LocaleToggle } from "./locale-toggle";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const user = await getSessionUser();

  const links = [
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/opportunities", label: t("marketplace") },
    { href: "/for-developers", label: t("forDevelopers") },
    { href: "/faq", label: t("faq") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-5 md:px-8">
        <Link href="/" className="shrink-0 text-lg" aria-label="Aqary — home">
          <Wordmark />
        </Link>

        <nav className="hidden flex-1 items-center gap-7 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-ink-70 transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <LocaleToggle locale={locale} label={t("language")} />
          {user ? (
            <Link
              href={homeForRole(user.activeRole)}
              className="hidden h-9 items-center rounded-sm bg-ink px-4 text-sm font-medium text-ink-text transition-colors hover:bg-ink-90 md:inline-flex"
            >
              {t("dashboard")}
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="hidden h-9 items-center rounded-sm px-3 text-sm text-ink-70 transition-colors hover:text-ink md:inline-flex"
              >
                {t("signIn")}
              </Link>
              <Link
                href="/signup"
                className="hidden h-9 items-center rounded-sm bg-ink px-4 text-sm font-medium text-ink-text transition-colors hover:bg-ink-90 md:inline-flex"
              >
                {t("signUp")}
              </Link>
            </>
          )}
          <MobileNav
            links={links}
            signedIn={Boolean(user)}
            dashboardHref={user ? homeForRole(user.activeRole) : "/signin"}
            labels={{
              open: t("openMenu"),
              close: t("closeMenu"),
              signIn: t("signIn"),
              signUp: t("signUp"),
              dashboard: t("dashboard"),
            }}
          />
        </div>
      </div>
    </header>
  );
}
