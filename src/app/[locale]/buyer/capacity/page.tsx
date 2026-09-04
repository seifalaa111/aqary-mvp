import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { egp } from "@/lib/format";
import { Badge } from "@/components/ui/badges";
import { Button, Card, CardBody, CardHeader, CardTitle, Eyebrow } from "@/components/ui/primitives";
import { CapacityForm } from "@/components/buyer/capacity-form";

export const dynamic = "force-dynamic";

export default async function BuyerCapacityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "capacity" });

  const profile = await prisma.buyerProfile.findUnique({
    where: { userId: user.id },
  });

  const declaredCash = profile?.availableCash ? Number(profile.availableCash) : 0;
  const declaredInstallment = profile?.maxInstallment ? Number(profile.maxInstallment) : 0;
  const verifiedCash = profile?.verifiedAvailableCash ? Number(profile.verifiedAvailableCash) : null;
  const verifiedInstallment = profile?.verifiedMaxInstallment
    ? Number(profile.verifiedMaxInstallment)
    : null;
  const isPriority = profile?.tier === "PRIORITY";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>{t("title")}</Eyebrow>
            <h1 className="mt-1 font-display text-2xl text-ink md:text-3xl">Financial Capacity</h1>
            <p className="mt-1 text-sm text-ink-50">{t("sub")}</p>
          </div>
          <Badge tone={isPriority ? "brass" : profile?.tier === "VERIFIED" ? "info" : "neutral"}>
            {profile?.tier ?? "BROWSER"} Tier
          </Badge>
        </div>
      </header>

      {/* Verified Capacity Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("verified")}</CardTitle>
            <Badge tone={verifiedCash ? "verified" : "neutral"}>
              {verifiedCash ? "Compliance Verified" : "Not Verified"}
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-xs text-ink-60">{t("verifiedNotice")}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-sm border border-rule-subtle bg-paper-subtle p-3">
              <span className="text-2xs text-ink-50">Verified Available Cash:</span>
              <div className="money mt-1 text-lg font-semibold text-ink">
                {verifiedCash ? egp(verifiedCash) : "None on file"}
              </div>
            </div>
            <div className="rounded-sm border border-rule-subtle bg-paper-subtle p-3">
              <span className="text-2xs text-ink-50">Verified Max Installment:</span>
              <div className="money mt-1 text-lg font-semibold text-ink">
                {verifiedInstallment ? egp(verifiedInstallment) : "None on file"}
              </div>
            </div>
          </div>

          {!verifiedCash ? (
            <div className="flex items-center justify-between rounded-sm border border-brass/30 bg-brass/5 p-3">
              <div className="text-xs text-ink-70">
                Want to unlock <strong>Priority Buyer</strong> status? Submit a recent bank statement or proof of funds.
              </div>
              <Link href="/buyer/verification">
                <Button size="sm" variant="secondary">
                  Upload Proof of Funds
                </Button>
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Declared Capacity Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("updateCapacity")}</CardTitle>
        </CardHeader>
        <CardBody>
          <CapacityForm
            initialCash={declaredCash}
            initialInstallment={declaredInstallment}
          />
        </CardBody>
      </Card>
    </div>
  );
}
