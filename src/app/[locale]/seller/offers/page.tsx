import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { sellerOffers } from "@/lib/queries/offers";
import { OffersTable } from "@/components/seller/offers-table";

export const dynamic = "force-dynamic";

export default async function AllSellerOffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });
  const offers = await sellerOffers(user.id);

  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="mb-6 display-section text-ink">{t("offersTitle")}</h1>
      <OffersTable offers={offers} locale={locale} showListing />
    </div>
  );
}
