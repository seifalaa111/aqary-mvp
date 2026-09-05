import { redirect } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { startOrResumeDraft } from "@/app/actions/seller";
import { requireRolePage } from "@/lib/auth/guard";
import { ErrorState } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/** Creating a draft is a real write, so this route does it and redirects in. */
export default async function NewListingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tu = await getTranslations({ locale, namespace: "sellerUi" });
  await requireRolePage("SELLER");

  const result = await startOrResumeDraft();
  if (!result.ok) {
    return <ErrorState title={tu("couldNotStartFile")} body={result.error} />;
  }
  redirect({ href: `/seller/listings/${result.data!.listingId}/wizard`, locale });
}
