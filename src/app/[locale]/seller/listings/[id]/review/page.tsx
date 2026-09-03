import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { storage } from "@/lib/providers/storage";
import { ExtractionReview } from "@/components/seller/extraction-review";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      contract: { include: { fields: true, receipts: true } },
      discrepancies: { where: { status: "OPEN" }, orderBy: { severity: "desc" } },
      extractions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { fields: true },
      },
      documents: { include: { pages: { orderBy: { pageNumber: "asc" } } } },
    },
  });

  if (!listing || listing.sellerId !== user.id) notFound();

  const extraction = listing.extractions[0] ?? null;

  // Signed page URLs so the seller can see the exact region a value came from.
  const pageUrls = new Map<string, { page: number; url: string; width: number; height: number }[]>();
  for (const doc of listing.documents) {
    pageUrls.set(
      doc.id,
      await Promise.all(
        doc.pages.map(async (p) => ({
          page: p.pageNumber,
          url: await storage().signedUrl(p.imageKey, 900),
          width: p.width,
          height: p.height,
        })),
      ),
    );
  }

  const rows = listing.contract.fields
    .filter((f) => f.declaredNum || f.declaredDate || f.declaredText || f.extractedNum || f.extractedDate || f.extractedText)
    .map((f) => ({
      key: f.key,
      kind: f.kind,
      declared: {
        num: f.declaredNum?.toString() ?? null,
        date: f.declaredDate?.toISOString() ?? null,
        text: f.declaredText,
      },
      extracted: {
        num: f.extractedNum?.toString() ?? null,
        date: f.extractedDate?.toISOString() ?? null,
        text: f.extractedText,
        confidence: f.extractedConfidence,
        documentId: f.extractedDocumentId,
        page: f.extractedPage,
        bbox: f.extractedBbox as { x: number; y: number; w: number; h: number } | null,
      },
      receiptDerived: {
        num: f.receiptDerivedNum?.toString() ?? null,
        note: f.receiptDerivedNote,
      },
      developerStated: {
        num: f.developerStatedNum?.toString() ?? null,
      },
    }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <p className="eyebrow mb-1">{listing.reference}</p>
      <h1 className="mb-2 display-section text-ink">{t("reviewTitle")}</h1>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-50">{t("reviewSub")}</p>

      <ExtractionReview
        listingId={id}
        status={listing.status}
        rows={rows}
        discrepancies={listing.discrepancies.map((d) => ({
          id: d.id,
          fieldKey: d.fieldKey,
          severity: d.severity,
          titleEn: d.titleEn,
          titleAr: d.titleAr,
          sourceA: d.sourceA,
          valueA: d.valueA?.toString() ?? null,
          sourceB: d.sourceB,
          valueB: d.valueB?.toString() ?? null,
          delta: d.delta?.toString() ?? null,
        }))}
        documents={listing.documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileName: d.fileName,
          pages: pageUrls.get(d.id) ?? [],
        }))}
        extractionMeta={
          extraction
            ? {
                mode: extraction.mode,
                model: extraction.model,
                latencyMs: extraction.latencyMs,
                fieldCount: extraction.fields.length,
                createdAt: extraction.createdAt.toISOString(),
              }
            : null
        }
        receiptTotal={listing.contract.receipts
          .reduce((a, r) => a + Number(r.extractedAmount ?? r.declaredAmount ?? 0), 0)
          .toString()}
        receiptCount={listing.contract.receipts.length}
        locale={locale}
      />
    </div>
  );
}
