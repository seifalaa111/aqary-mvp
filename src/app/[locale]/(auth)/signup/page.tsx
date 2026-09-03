import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getSessionUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/guard";
import { redirect } from "@/i18n/routing";
import { SignUpForm } from "@/components/auth/signup-form";
import { Wordmark } from "@/components/chrome/wordmark";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { role } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth" });
  const tn = await getTranslations({ locale, namespace: "nav" });

  const user = await getSessionUser();
  if (user) redirect({ href: homeForRole(user.activeRole), locale });

  const initialRole = role === "seller" ? "SELLER" : role === "buyer" ? "BUYER" : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-5 py-8 md:px-8">
      <header className="mb-12 flex items-center justify-between">
        <Link href="/" className="text-lg">
          <Wordmark />
        </Link>
        <p className="text-sm text-ink-50">
          {t("haveAccount")}{" "}
          <Link href="/signin" className="text-ink underline underline-offset-2">
            {tn("signIn")}
          </Link>
        </p>
      </header>

      <SignUpForm
        initialRole={initialRole}
        copy={{
          chooseRole: t("chooseRole"),
          chooseRoleSub: t("chooseRoleSub"),
          sellerCard: t("sellerCard"),
          sellerCardSub: t("sellerCardSub"),
          sellerBullets: [t("sellerBullet1"), t("sellerBullet2"), t("sellerBullet3")],
          buyerCard: t("buyerCard"),
          buyerCardSub: t("buyerCardSub"),
          buyerBullets: [t("buyerBullet1"), t("buyerBullet2"), t("buyerBullet3")],
          signUpTitle: t("signUpTitle"),
          phone: t("phone"),
          phoneHint: t("phoneHint"),
          fullNameEn: t("fullNameEn"),
          fullNameAr: t("fullNameAr"),
          email: t("emailOptional"),
          password: t("password"),
          continueLabel: t("continue"),
          otpTitle: t("otpTitle"),
          otpSub: t("otpSub", { phone: "" }),
          otpDevNote: t("otpDevNote"),
          otpResend: t("otpResend"),
          verify: t("verify"),
          usePassword: t("signInWithPassword"),
          useOtp: t("signInWithOtp"),
          back: "Back",
        }}
      />
    </div>
  );
}
