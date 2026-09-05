import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { Eyebrow } from "@/components/ui/primitives";
import { DocumentVault, VaultDoc } from "@/components/buyer/document-vault";

export const dynamic = "force-dynamic";

export default async function BuyerDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");
  const t = await getTranslations({ locale, namespace: "buyerDocuments" });
  const tu = await getTranslations({ locale, namespace: "buyerUi" });

  const docs = await prisma.document.findMany({
    where: { ownerId: user.id, listingId: null },
    orderBy: { createdAt: "desc" },
  });

  const serializedDocs: VaultDoc[] = docs.map((d) => ({
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    sizeBytes: d.sizeBytes,
    mimeType: d.mimeType,
    status: d.status,
    rejectionReason: d.rejectionReason,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <Eyebrow>{t("title")}</Eyebrow>
        <h1 className="mt-1 font-display text-2xl text-ink md:text-3xl">{tu("personalDocumentsVault")}</h1>
        <p className="mt-1 text-sm text-ink-50">{t("sub")}</p>
      </header>

      <DocumentVault initialDocs={serializedDocs} locale={locale} />
    </div>
  );
}
