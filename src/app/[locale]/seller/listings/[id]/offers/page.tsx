import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { sellerOffers } from "@/lib/queries/offers";
import { OffersTable } from "@/components/seller/offers-table";

export const dynamic = "force-dynamic";

export default async function ListingOffersPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });

  const listing = await prisma.listing.findUnique({ where: { id }, select: { sellerId: true, reference: true } });
  if (!listing || listing.sellerId !== user.id) notFound();

  const offers = await sellerOffers(user.id, id);

  return (
    <div className="mx-auto max-w-[900px]">
      <nav className="mb-4">
        <Link href={`/seller/listings/${id}`} className="text-xs text-ink-50 hover:text-ink">
          ← {listing.reference}
        </Link>
      </nav>
      <h1 className="mb-6 display-section text-ink">{t("offersTitle")}</h1>
      <OffersTable offers={offers} locale={locale} />
    </div>
  );
}
