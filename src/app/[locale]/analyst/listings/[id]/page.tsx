import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { storage } from "@/lib/providers/storage";
import { checkPublishReadiness } from "@/lib/services/listings";
import { readReconciliation } from "@/lib/services/reconciliation";
import { REQUIRED_VERIFIED_FIELDS } from "@/lib/domain/fields";
import { ReviewWorkspace } from "@/components/analyst/review-workspace";

export const dynamic = "force-dynamic";

export default async function AnalystListingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, fullNameEn: true, fullNameAr: true, nationalId: true, kycStatus: true } },
      analyst: { select: { id: true, fullNameEn: true } },
      contract: {
        include: {
          fields: true,
          receipts: { orderBy: { declaredDate: "asc" }, include: { document: { select: { fileName: true } } } },
          installments: { where: { source: "SELLER_DECLARED" }, orderBy: { sequence: "asc" } },
          unit: { include: { project: { include: { developer: { include: { policy: true } } } } } },
        },
      },
      documents: { include: { pages: { orderBy: { pageNumber: "asc" } } }, orderBy: { createdAt: "asc" } },
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
      discrepancies: { orderBy: [{ status: "asc" }, { severity: "desc" }] },
      fraudSignals: { orderBy: [{ status: "asc" }, { severity: "desc" }] },
      valuations: { orderBy: { createdAt: "desc" }, take: 1, include: { comparables: true } },
      extractions: { orderBy: { createdAt: "desc" }, take: 1, include: { fields: true } },
    },
  });

  if (!listing) notFound();

  // Recomputed on open so the panel is never stale — but read-only. Rendering a
  // page must not open discrepancies or rewrite receiptDerived columns, and a
  // failure here must not be swallowed into a blank panel: an analyst who sees
  // no reconciliation would take that for "nothing disagrees".
  const recon = await readReconciliation(id);
  const readiness = await checkPublishReadiness(id);

  const docs = await Promise.all(
    listing.documents.map(async (d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      status: d.status,
      sha256: d.sha256.slice(0, 12),
      hasExif: d.hasExif,
      softwareTag: d.softwareTag,
      blurScore: d.blurScore,
      pages: await Promise.all(
        d.pages.map(async (p) => ({
          pageNumber: p.pageNumber,
          width: p.width,
          height: p.height,
          url: await storage().signedUrl(p.imageKey, 1800),
        })),
      ),
    })),
  );

  const valuation = listing.valuations[0] ?? null;

  return (
    <div className="-mx-4 -my-6 md:-mx-6 md:-my-8">
      <div className="border-b border-rule px-4 py-3 md:px-6">
        <Link href="/analyst" className="text-xs text-ink-50 hover:text-ink">
          ← {t("queue")}
        </Link>
      </div>

      <ReviewWorkspace
        locale={locale}
        listing={{
          id: listing.id,
          reference: listing.reference,
          status: listing.status,
          askingCash: listing.askingCash?.toString() ?? null,
          flexibilityPct: listing.flexibilityPct,
          verificationScore: listing.verificationScore,
          verificationBreakdown: listing.verificationScoreBreakdown as never,
          humanVerifiedBy: listing.humanVerifiedBy,
          humanVerifiedAt: listing.humanVerifiedAt?.toISOString() ?? null,
          submittedAt: listing.submittedAt?.toISOString() ?? null,
          slaDueAt: listing.slaDueAt?.toISOString() ?? null,
          assignedAnalyst: listing.analyst
            ? { id: listing.analyst.id, name: listing.analyst.fullNameEn }
            : null,
          seller: {
            name: listing.seller.fullNameEn,
            nameAr: listing.seller.fullNameAr,
            nationalId: listing.seller.nationalId,
            kycStatus: listing.seller.kycStatus,
          },
          unit: {
            unitCode: listing.contract.unit.unitCode,
            unitType: listing.contract.unit.unitType,
            buaSqm: listing.contract.unit.buaSqm.toString(),
            bedrooms: listing.contract.unit.bedrooms,
            project: listing.contract.unit.project.nameEn,
            projectAr: listing.contract.unit.project.nameAr,
            city: listing.contract.unit.project.city,
            developer: listing.contract.unit.project.developer.nameEn,
            currentDeveloperPrice: listing.contract.unit.currentDeveloperPrice?.toString() ?? null,
          },
          policy: listing.contract.unit.project.developer.policy
            ? {
                assignmentAllowed: listing.contract.unit.project.developer.policy.assignmentAllowed,
                feeType: listing.contract.unit.project.developer.policy.feeType,
                feePercentBps: listing.contract.unit.project.developer.policy.feePercentBps,
                minPercentPaidBps: listing.contract.unit.project.developer.policy.minPercentPaidBps,
                minMonthsElapsed: listing.contract.unit.project.developer.policy.minMonthsElapsed,
                typicalNocDays: listing.contract.unit.project.developer.policy.typicalNocDays,
                requiredDocuments: listing.contract.unit.project.developer.policy.requiredDocuments,
              }
            : null,
        }}
        fields={listing.contract.fields
          .slice()
          .sort((a, b) => {
            const ra = REQUIRED_VERIFIED_FIELDS.indexOf(a.key);
            const rb = REQUIRED_VERIFIED_FIELDS.indexOf(b.key);
            return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
          })
          .map((f) => ({
            key: f.key,
            kind: f.kind,
            required: REQUIRED_VERIFIED_FIELDS.includes(f.key),
            declared: { num: f.declaredNum?.toString() ?? null, date: f.declaredDate?.toISOString() ?? null, text: f.declaredText },
            extracted: {
              num: f.extractedNum?.toString() ?? null,
              date: f.extractedDate?.toISOString() ?? null,
              text: f.extractedText,
              confidence: f.extractedConfidence,
              documentId: f.extractedDocumentId,
              page: f.extractedPage,
              bbox: f.extractedBbox as { x: number; y: number; w: number; h: number } | null,
            },
            receiptDerived: { num: f.receiptDerivedNum?.toString() ?? null, note: f.receiptDerivedNote },
            developerStated: { num: f.developerStatedNum?.toString() ?? null },
            verified: {
              num: f.verifiedNum?.toString() ?? null,
              date: f.verifiedDate?.toISOString() ?? null,
              text: f.verifiedText,
              source: f.verifiedSource,
              at: f.verifiedAt?.toISOString() ?? null,
              overrideReason: f.overrideReason,
            },
          }))}
        documents={docs}
        receipts={listing.contract.receipts.map((r) => ({
          id: r.id,
          documentId: r.documentId,
          fileName: r.document?.fileName ?? null,
          declaredAmount: r.declaredAmount?.toString() ?? null,
          extractedAmount: r.extractedAmount?.toString() ?? null,
          verifiedAmount: r.verifiedAmount?.toString() ?? null,
          date: (r.verifiedDate ?? r.extractedDate ?? r.declaredDate)?.toISOString() ?? null,
          method: r.method,
          status: r.status,
          confidence: r.confidence,
        }))}
        media={listing.media.map((m) => ({
          id: m.id,
          kind: m.kind,
          roomTag: m.roomTag,
          altEn: m.altEn,
          caption: m.caption,
          moderationStatus: m.moderationStatus,
          thumb: (m.variants as { thumb?: string }).thumb ?? "",
          card: (m.variants as { card?: string }).card ?? "",
        }))}
        discrepancies={listing.discrepancies.map((d) => ({
          id: d.id,
          fieldKey: d.fieldKey,
          severity: d.severity,
          status: d.status,
          titleEn: d.titleEn,
          titleAr: d.titleAr,
          sourceA: d.sourceA,
          valueA: d.valueA?.toString() ?? null,
          sourceB: d.sourceB,
          valueB: d.valueB?.toString() ?? null,
          delta: d.delta?.toString() ?? null,
          deltaPct: d.deltaPct,
          evidence: d.evidence,
          resolution: d.resolution,
        }))}
        signals={listing.fraudSignals.map((s) => ({
          id: s.id,
          type: s.type,
          severity: s.severity,
          status: s.status,
          titleEn: s.titleEn,
          titleAr: s.titleAr,
          description: s.description,
          evidence: s.evidence,
          disposition: s.disposition,
        }))}
        valuation={
          valuation
            ? {
                id: valuation.id,
                low: (valuation.overrideLow ?? valuation.low).toString(),
                mid: (valuation.overrideMid ?? valuation.mid).toString(),
                high: (valuation.overrideHigh ?? valuation.high).toString(),
                confidence: valuation.confidence,
                method: valuation.method,
                overrideReason: valuation.overrideReason,
                drivers: valuation.drivers as never,
                comparables: valuation.comparables.map((c) => ({
                  label: c.label,
                  projectName: c.projectName,
                  unitType: c.unitType,
                  buaSqm: c.buaSqm.toString(),
                  price: c.price.toString(),
                  pricePerSqm: c.pricePerSqm.toString(),
                  source: c.source,
                })),
              }
            : null
        }
        reconciliation={
          recon
            ? {
                declaredPaid: recon.declaredPaid?.toString() ?? null,
                receiptsPaid: recon.receiptsPaid.toString(),
                developerStatedPaid: recon.developerStatedPaid?.toString() ?? null,
                scheduleExpectedPaid: recon.scheduleExpectedPaid?.toString() ?? null,
                extractedPaid: recon.extractedPaid?.toString() ?? null,
                worstDelta: recon.worstDelta.toString(),
                worstDeltaPct: recon.worstDeltaPct,
                receiptCount: recon.receiptCount,
                verifiedReceiptCount: recon.verifiedReceiptCount,
                receiptCoveragePct: recon.receiptCoveragePct,
                totalPrice: recon.totalPrice?.toString() ?? null,
                outstandingFromReceipts: recon.outstandingFromReceipts?.toString() ?? null,
              }
            : null
        }
        readiness={readiness}
        extractionMeta={
          listing.extractions[0]
            ? {
                mode: listing.extractions[0].mode,
                model: listing.extractions[0].model,
                latencyMs: listing.extractions[0].latencyMs,
                costUsd: listing.extractions[0].costUsd.toString(),
                fieldCount: listing.extractions[0].fields.length,
                createdAt: listing.extractions[0].createdAt.toISOString(),
              }
            : null
        }
      />
    </div>
  );
}
