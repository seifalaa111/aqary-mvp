import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { AdminListingsTable, type AdminListingRow } from "@/components/admin/listings-table";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const [listings, analysts] = await Promise.all([
    prisma.listing.findMany({
      take: 60,
      orderBy: { updatedAt: "desc" },
      include: {
        analyst: { select: { id: true, fullNameEn: true } },
        seller: { select: { fullNameEn: true } },
        contract: {
          select: {
            fields: { where: { key: "TOTAL_PRICE" }, select: { declaredNum: true, verifiedNum: true } },
            unit: { select: { unitCode: true, project: { select: { nameEn: true, nameAr: true, city: true } } } },
          },
        },
        offers: { select: { id: true } },
        deal: { select: { id: true, status: true } },
      },
    }),
    prisma.user.findMany({
      where: { roles: { hasSome: ["ANALYST", "ADMIN"] } },
      select: { id: true, fullNameEn: true },
      orderBy: { fullNameEn: "asc" },
    }),
  ]);

  const rows: AdminListingRow[] = listings.map((l) => ({
    id: l.id,
    reference: l.reference,
    status: l.status,
    verificationScore: l.verificationScore,
    verificationBreakdown: l.verificationScoreBreakdown,
    unitCode: l.contract.unit.unitCode,
    projectName: l.contract.unit.project.nameEn,
    projectNameAr: l.contract.unit.project.nameAr ?? l.contract.unit.project.nameEn,
    city: l.contract.unit.project.city,
    sellerName: l.seller.fullNameEn.split(" ")[0] ?? "Seller",
    totalPrice: Number(l.contract.fields[0]?.verifiedNum ?? l.contract.fields[0]?.declaredNum ?? 0),
    askingCash: l.askingCash ? Number(l.askingCash) : null,
    assignedAnalyst: l.analyst ? { id: l.analyst.id, name: l.analyst.fullNameEn.split(" ")[0]! } : null,
    offersCount: l.offers.length,
    dealId: l.deal?.id ?? null,
    dealStatus: l.deal?.status ?? null,
    submittedAt: l.submittedAt ? l.submittedAt.toISOString() : null,
    updatedAt: l.updatedAt.toISOString(),
  }));

  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{isAr ? "إدارة العقود" : "Listing Supervision"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "العقود والتدخلات الإدارية" : "Marketplace Listings & Overrides"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "متابعة جميع العقود المعروضة، التدقيق في الحواجز، إعادة الإسناد، والتعديل الإداري المبرر للحالات."
            : "Search, inspect, reassign, and execute authorized state overrides with mandatory audit justifications."}
        </p>
      </header>

      <AdminListingsTable
        locale={locale}
        rows={rows}
        analysts={analysts.map((a) => ({ id: a.id, name: a.fullNameEn }))}
      />
    </div>
  );
}
