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
    take: 60,
    include: {
      buyerProfile: {
        select: {
          tier: true,
          availableCash: true,
          maxInstallment: true,
          verifiedAvailableCash: true,
          verifiedMaxInstallment: true,
          readiness: true,
          proofOfFundsVerifiedAt: true,
        },
      },
      sellerProfile: { select: { relationshipToContract: true } },
      // Capped per user. A reviewer works the most recent submissions; loading
      // every document a long-lived account has ever uploaded, for 60 accounts
      // at once, costs far more than the screen can show.
      documents: {
        select: { id: true, type: true, fileName: true, status: true, rejectionReason: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
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
          verifiedAvailableCash: u.buyerProfile?.verifiedAvailableCash?.toString() ?? null,
          verifiedMaxInstallment: u.buyerProfile?.verifiedMaxInstallment?.toString() ?? null,
          readiness: u.buyerProfile?.readiness ?? null,
          proofOfFunds: Boolean(u.buyerProfile?.proofOfFundsVerifiedAt),
          listingCount: u._count.listings,
          offerCount: u._count.buyerOffers,
          documents: u.documents.map((d) => ({
            id: d.id,
            type: d.type,
            fileName: d.fileName,
            status: d.status,
            rejectionReason: d.rejectionReason,
            createdAt: d.createdAt.toISOString(),
          })),
        }))}
      />
    </>
  );
}
