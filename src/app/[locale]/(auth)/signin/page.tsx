import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/routing";
import { getSessionUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { SignInForm } from "@/components/auth/signin-form";
import { Wordmark } from "@/components/chrome/wordmark";
import { DEMO_PASSWORD_HINT } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });
  const tn = await getTranslations({ locale, namespace: "nav" });

  const user = await getSessionUser();
  if (user) redirect({ href: homeForRole(user.activeRole), locale });

  // Demo accounts are read from the database, so they cannot drift from the seed.
  const demoUsers = await prisma.user.findMany({
    where: { isDemo: true, email: { not: null } },
    select: { email: true, phone: true, roles: true, fullNameEn: true },
    orderBy: { createdAt: "asc" },
  });

  const byRole = new Map<string, (typeof demoUsers)[number]>();
  for (const u of demoUsers) {
    const key = u.roles.join("+");
    if (!byRole.has(key)) byRole.set(key, u);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-5 py-8 md:px-8">
      <header className="mb-12 flex items-center justify-between">
        <Link href="/" className="text-lg">
          <Wordmark />
        </Link>
        <p className="text-sm text-ink-50">
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-ink underline underline-offset-2">
            {tn("signUp")}
          </Link>
        </p>
      </header>

      <div className="grid flex-1 gap-14 lg:grid-cols-[minmax(0,380px)_1fr]">
        <SignInForm
          copy={{
            title: t("signInTitle"),
            phone: t("phone"),
            phoneHint: t("phoneHint"),
            password: t("password"),
            identifier: `${t("email")} / ${t("phone")}`,
            continueLabel: t("continue"),
            otpTitle: t("otpTitle"),
            otpDevNote: t("otpDevNote"),
            otpResend: t("otpResend"),
            verify: t("verify"),
            usePassword: t("signInWithPassword"),
            useOtp: t("signInWithOtp"),
          }}
        />

        <aside className="self-start rounded-lg border border-rule bg-paper-sunken/70 p-6">
          <p className="eyebrow mb-2">{t("demoAccounts")}</p>
          <p className="mb-5 text-sm text-ink-70">
            {t("demoNote")}{" "}
            <code className="money rounded-xs bg-paper-raised px-1.5 py-0.5 font-mono text-ink">
              {DEMO_PASSWORD_HINT}
            </code>
          </p>
          <ul className="rule-t">
            {[...byRole.values()].map((u) => (
              <li key={u.email} className="rule-b flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span className="font-mono text-2xs uppercase tracking-wider text-ink-50">
                  {u.roles.join(" + ")}
                </span>
                <span className="money text-xs text-ink" dir="ltr">
                  {u.email}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-2xs leading-relaxed text-ink-50">
            Phone sign-in works for these accounts too — the one-time code is shown on screen in
            development instead of being sent by SMS.
          </p>
        </aside>
      </div>
    </div>
  );
}
