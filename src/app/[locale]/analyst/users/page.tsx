import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { UserReview } from "@/components/analyst/user-review";

export const dynamic = "force-dynamic";

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      buyerProfile: { select: { tier: true, availableCash: true, maxInstallment: true, readiness: true, proofOfFundsVerifiedAt: true } },
      sellerProfile: { select: { relationshipToContract: true } },
      _count: { select: { listings: true, buyerOffers: true } },
    },
  });

  return (
    <>
      <Eyebrow>{t("console")}</Eyebrow>
      <h1 className="mb-6 mt-1 display-section text-ink">{t("users")}</h1>
      <UserReview
        locale={locale}
        users={users.map((u) => ({
          id: u.id,
          name: u.fullNameEn,
          nameAr: u.fullNameAr,
          phone: u.phone,
          email: u.email,
          roles: u.roles,
          kycStatus: u.kycStatus,
          nationalId: u.nationalId,
          createdAt: u.createdAt.toISOString(),
          tier: u.buyerProfile?.tier ?? null,
          availableCash: u.buyerProfile?.availableCash?.toString() ?? null,
          maxInstallment: u.buyerProfile?.maxInstallment?.toString() ?? null,
          readiness: u.buyerProfile?.readiness ?? null,
          proofOfFunds: Boolean(u.buyerProfile?.proofOfFundsVerifiedAt),
          listingCount: u._count.listings,
          offerCount: u._count.buyerOffers,
        }))}
      />
    </>
  );
}
