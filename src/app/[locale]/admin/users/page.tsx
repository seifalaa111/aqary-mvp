import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { UsersManager, type AdminUserItem } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";

/** Keeps the country prefix and the last two digits: enough to recognise a
 *  record you already know, not enough to learn one you do not. */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return "•".repeat(phone.length);
  return phone.slice(0, 4) + " •••• " + phone.slice(-2);
}

function maskNationalId(nid: string | null): string | null {
  if (!nid) return null;
  if (nid.length <= 4) return "•".repeat(nid.length);
  return "•••••••••" + nid.slice(-4);
}

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      buyerProfile: { select: { tier: true } },
      sellerProfile: { select: { relationshipToContract: true } },
      _count: { select: { listings: true, buyerOffers: true, buyerDeals: true, sellerDeals: true } },
    },
  });

  const items: AdminUserItem[] = users.map((u) => ({
    id: u.id,
    name: u.fullNameEn,
    nameAr: u.fullNameAr,
    // Masked at the server boundary. The plaintext never enters the page
    // payload; UsersManager asks for it through adminRevealUserIdentity, which
    // audits the disclosure. Masking in the browser would be theatre.
    phone: maskPhone(u.phone),
    email: u.email,
    roles: u.roles,
    kycStatus: u.kycStatus,
    nationalId: maskNationalId(u.nationalId),
    createdAt: u.createdAt.toISOString(),
    buyerTier: u.buyerProfile?.tier ?? null,
    listingCount: u._count.listings,
    offerCount: u._count.buyerOffers,
    dealCount: u._count.buyerDeals + u._count.sellerDeals,
  }));

  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{isAr ? "إدارة الهويات والأذونات" : "Identity & Access"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "المستخدمون والتحقق وإدارة الأدوار" : "Users, KYC & Role Governance"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "التحكم في أدوار المستخدمين، حماية البيانات الحساسة، والإشراف على التوثيق القانوني."
            : "Role management, sensitive PII masking, KYC verification oversight, and buyer financial tiering."}
        </p>
      </header>

      <UsersManager locale={locale} users={items} />
    </div>
  );
}
