import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { egp } from "@/lib/format";
import { Badge } from "@/components/ui/badges";
import { Button, Card, CardBody, CardHeader, CardTitle, Eyebrow } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function BuyerOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyerOverview" });
  const tk = await getTranslations({ locale, namespace: "kycState" });
  const tu = await getTranslations({ locale, namespace: "buyerUi" });

  const [profile, docs, matchCount, offerCount] = await Promise.all([
    prisma.buyerProfile.findUnique({ where: { userId: user.id } }),
    prisma.document.findMany({
      where: { ownerId: user.id, listingId: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.match.count({ where: { buyerId: user.id } }),
    prisma.offer.count({
      where: { buyerId: user.id, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
    }),
  ]);

  const hasIdDoc = docs.some(
    (d) =>
      (d.type === "NATIONAL_ID_FRONT" || d.type === "PASSPORT") &&
      (d.status === "APPROVED" || d.status === "UPLOADED"),
  );
  const hasAddressDoc = docs.some(
    (d) => d.type === "PROOF_OF_ADDRESS" && (d.status === "APPROVED" || d.status === "UPLOADED"),
  );
  const isKycVerified = user.kycStatus === "VERIFIED";
  const tier = profile?.tier ?? "BROWSER";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <Eyebrow>{t("tierStatus")}: {tier}</Eyebrow>
        <h1 className="mt-1 font-display text-2xl text-ink md:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-50">{t("sub")}</p>
      </header>

      {/* Next Best Action Banner */}
      {!isKycVerified ? (
        <div className="rounded-lg border border-brass/30 bg-brass/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="eyebrow text-brass">{t("actionNeeded")}</span>
              <h2 className="mt-0.5 font-display text-lg text-ink">{t("completeVerification")}</h2>
              <p className="mt-1 text-xs text-ink-70">
                {!hasIdDoc
                  ? "Please upload a photo of your Egyptian National ID or valid Passport to activate your account."
                  : !hasAddressDoc
                    ? "Upload utility bill or bank statement proving address to complete verification."
                    : "Your documents are currently under review by compliance analysts."}
              </p>
            </div>
            <Link href="/buyer/verification">
              <Button size="sm">{tk("uploadDocument")}</Button>
            </Link>
          </div>
        </div>
      ) : tier !== "PRIORITY" ? (
        <div className="rounded-lg border border-rule bg-paper-raised p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="eyebrow text-ink-50">{tu("upgradeTier")}</span>
              <h2 className="mt-0.5 font-display text-lg text-ink">{t("uploadPof")}</h2>
              <p className="mt-1 text-xs text-ink-50">{tu("priorityTierExplainer")}</p>
            </div>
            <Link href="/buyer/capacity">
              <Button variant="secondary" size="sm">{tu("verifyCapacity")}</Button>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Status & Capacity Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("kycStatus")}</CardTitle>
              <Badge
                tone={
                  user.kycStatus === "VERIFIED"
                    ? "verified"
                    : user.kycStatus === "REJECTED"
                      ? "flagged"
                      : "pending"
                }
              >
                {user.kycStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <div className="flex justify-between text-xs rule-b pb-2">
              <span className="text-ink-50">{tu("identityDocument")}</span>
              <span className="font-medium text-ink">
                {hasIdDoc ? "On file" : "Missing"}
              </span>
            </div>
            <div className="flex justify-between text-xs rule-b pb-2">
              <span className="text-ink-50">{tu("proofOfAddress")}</span>
              <span className="font-medium text-ink">
                {hasAddressDoc ? "On file" : "Missing"}
              </span>
            </div>
            <div className="flex justify-between text-xs rule-b pb-2">
              <span className="text-ink-50">{tu("uploadedDocuments")}</span>
              <span className="font-medium text-ink">{docs.length}</span>
            </div>
            <div className="pt-2">
              <Link href="/buyer/verification">
                <Button variant="ghost" size="sm" className="w-full">
                  {tu("manageKycDocuments")} <span aria-hidden className="arrow-forward">→</span>
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{tu("financialCapacity")}</CardTitle>
              <Badge tone={tier === "PRIORITY" ? "brass" : tier === "VERIFIED" ? "info" : "neutral"}>
                {tier} Tier
              </Badge>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <div className="flex justify-between text-xs rule-b pb-2">
              <span className="text-ink-50">{t("declaredCash")}:</span>
              <span className="money font-medium text-ink">
                {egp(profile?.availableCash?.toString() ?? 0)}
              </span>
            </div>
            <div className="flex justify-between text-xs rule-b pb-2">
              <span className="text-ink-50">{t("declaredInstallment")}:</span>
              <span className="money font-medium text-ink">
                {egp(profile?.maxInstallment?.toString() ?? 0)}
              </span>
            </div>
            {profile?.verifiedAvailableCash ? (
              <div className="flex justify-between text-xs rule-b pb-2 text-brass font-medium">
                <span>{t("verifiedCash")}:</span>
                <span className="money">{egp(profile.verifiedAvailableCash.toString())}</span>
              </div>
            ) : null}
            <div className="pt-2">
              <Link href="/buyer/capacity">
                <Button variant="ghost" size="sm" className="w-full">
                  {tu("updateCapacity")} <span aria-hidden className="arrow-forward">→</span>
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/buyer/matches" className="group block">
          <Card className="transition-colors group-hover:border-ink-50">
            <CardBody className="flex flex-col gap-1">
              <span className="money font-display text-2xl text-ink">{matchCount}</span>
              <span className="text-xs text-ink-50">{t("viewMatches")}</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/buyer/offers" className="group block">
          <Card className="transition-colors group-hover:border-ink-50">
            <CardBody className="flex flex-col gap-1">
              <span className="money font-display text-2xl text-ink">{offerCount}</span>
              <span className="text-xs text-ink-50">{t("viewOffers")}</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/opportunities" className="group block">
          <Card className="transition-colors group-hover:border-ink-50">
            <CardBody className="flex flex-col gap-1">
              <span className="font-display text-2xl text-ink">?</span>
              <span className="text-xs text-ink-50">{t("viewOpportunities")}</span>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}
