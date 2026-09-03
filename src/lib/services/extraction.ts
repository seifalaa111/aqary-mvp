import "server-only";
import { Decimal } from "decimal.js";
import type { ContractFieldKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ai } from "@/lib/providers";
import { FIELD_KINDS } from "@/lib/domain/fields";
import { reconcileListing } from "./reconciliation";
import { scanListingForFraudSignals } from "./fraud";
import { computeValuation } from "./valuation";
import { computeVerificationScore } from "./verification-score";
import { notify } from "./notifications";
import { registerJob } from "./jobs";

/**
 * The extraction pipeline.
 *
 * AI output is written ONLY to `extracted*` columns and to `Extraction` /
 * `ExtractionField` rows. It can never become a verified value here — that
 * requires an analyst action in `verification.ts`.
 */

export async function runExtractionPipeline(listingId: string) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      documents: { include: { pages: true } },
      contract: { include: { fields: true, receipts: true } },
    },
  });

  await prisma.listing.update({ where: { id: listingId }, data: { status: "AI_PROCESSING" } });
  await audit({
    action: "EXTRACTION_STARTED",
    entityType: "Listing",
    entityId: listingId,
    metadata: { documentCount: listing.documents.length },
  });

  const declaredHints: Partial<Record<ContractFieldKey, string>> = {};
  for (const f of listing.contract.fields) {
    if (f.declaredNum != null) declaredHints[f.key] = f.declaredNum.toString();
    else if (f.declaredDate != null) declaredHints[f.key] = f.declaredDate.toISOString().slice(0, 10);
    else if (f.declaredText != null) declaredHints[f.key] = f.declaredText;
  }

  const result = await ai().extractContract({
    listingId,
    locale: "ar",
    declaredHints,
    documents: listing.documents
      .filter((d) =>
        [
          "SALE_CONTRACT",
          "CONTRACT_ANNEX",
          "PAYMENT_SCHEDULE_ANNEX",
          "RESERVATION_FORM",
          "PAYMENT_RECEIPT",
          "DEVELOPER_ACCOUNT_STATEMENT",
          "BANK_TRANSFER_STATEMENT",
        ].includes(d.type),
      )
      .map((d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        storageKey: d.storageKey,
        pageCount: d.pageCount,
        sha256: d.sha256,
        pageKeys: d.pages.sort((a, b) => a.pageNumber - b.pageNumber).map((p) => p.imageKey),
      })),
  });

  const extraction = await prisma.extraction.create({
    data: {
      listingId,
      mode: result.mode,
      model: result.model,
      version: result.version,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd,
      promptHash: result.promptHash,
      rawResponse: result.raw as object,
      fields: {
        create: result.fields.map((f) => ({
          key: f.key,
          valueNum: f.valueNum ?? null,
          valueDate: f.valueDate ? new Date(f.valueDate) : null,
          valueText: f.valueText ?? null,
          confidence: f.confidence,
          documentId: f.documentId,
          page: f.page,
          bbox: (f.bbox ?? undefined) as object | undefined,
          clauseText: f.clauseText ?? null,
        })),
      },
    },
  });

  // Promote the highest-confidence reading per field into ContractField.extracted*.
  // Nothing else on the record is touched.
  const best = new Map<ContractFieldKey, (typeof result.fields)[number]>();
  for (const f of result.fields) {
    const current = best.get(f.key);
    if (!current || f.confidence > current.confidence) best.set(f.key, f);
  }

  for (const [key, f] of best) {
    await prisma.contractField.upsert({
      where: { contractId_key: { contractId: listing.contractId, key } },
      create: {
        contractId: listing.contractId,
        key,
        kind: FIELD_KINDS[key],
        extractedNum: f.valueNum ?? null,
        extractedDate: f.valueDate ? new Date(f.valueDate) : null,
        extractedText: f.valueText ?? null,
        extractedConfidence: f.confidence,
        extractedDocumentId: f.documentId,
        extractedPage: f.page,
        extractedBbox: (f.bbox ?? undefined) as object | undefined,
        extractionId: extraction.id,
      },
      update: {
        extractedNum: f.valueNum ?? null,
        extractedDate: f.valueDate ? new Date(f.valueDate) : null,
        extractedText: f.valueText ?? null,
        extractedConfidence: f.confidence,
        extractedDocumentId: f.documentId,
        extractedPage: f.page,
        extractedBbox: (f.bbox ?? undefined) as object | undefined,
        extractionId: extraction.id,
      },
    });
  }

  // Receipts read out of receipt documents become extracted amounts on the
  // matching Receipt row (created at upload time), never verified amounts.
  for (const r of result.receipts) {
    const receipt = await prisma.receipt.findFirst({
      where: { contractId: listing.contractId, documentId: r.documentId },
    });
    if (receipt) {
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          extractedAmount: r.amount,
          extractedDate: new Date(r.date),
          method: r.method,
          reference: r.reference,
          confidence: r.confidence,
        },
      });
    }
  }

  // Verbatim clause text for the assignment and cancellation terms.
  const assignment = result.clauses.find((c) => c.kind === "ASSIGNMENT");
  const cancellation = result.clauses.find((c) => c.kind === "CANCELLATION");
  if (assignment || cancellation) {
    await prisma.contract.update({
      where: { id: listing.contractId },
      data: {
        ...(assignment ? { assignmentConditionsNote: assignment.text } : {}),
        ...(cancellation ? { cancellationPenaltyNote: cancellation.text } : {}),
      },
    });
  }

  await prisma.document.updateMany({
    where: { listingId, status: { in: ["UPLOADED", "PROCESSING"] } },
    data: { status: "PROCESSED" },
  });

  // Downstream analysis — all real computation.
  await reconcileListing(listingId);
  await scanListingForFraudSignals(listingId);
  await computeValuation(listingId);
  await computeVerificationScore(listingId);

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "PENDING_REVIEW",
      submittedAt: listing.submittedAt ?? new Date(),
      slaDueAt: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });

  await audit({
    action: "EXTRACTION_COMPLETED",
    entityType: "Extraction",
    entityId: extraction.id,
    after: {
      fieldCount: result.fields.length,
      receiptCount: result.receipts.length,
      latencyMs: result.latencyMs,
      mode: result.mode,
    },
    metadata: { listingId },
  });

  await notify({
    userId: listing.sellerId,
    type: "EXTRACTION_READY",
    titleEn: "Your contract summary is ready to confirm",
    titleAr: "ملخّص عقدك جاهز للمراجعة",
    bodyEn: `We read ${best.size} fields from your documents. Review them before an analyst verifies your file.`,
    bodyAr: `تم استخراج ${best.size} بندًا من مستنداتك. راجعها قبل توثيق الملف.`,
    linkHref: `/seller/listings/${listingId}/review`,
  });

  return { extractionId: extraction.id, fieldCount: best.size, listing: updated };
}

registerJob("extraction.run", async (payload) => {
  const listingId = String(payload.listingId);
  const out = await runExtractionPipeline(listingId);
  return { extractionId: out.extractionId, fieldCount: out.fieldCount };
});

/** Seller correction during extraction review. Writes a NEW declared value. */
export async function applySellerCorrection(args: {
  contractId: string;
  key: ContractFieldKey;
  actorId: string;
  num?: string | null;
  date?: Date | null;
  text?: string | null;
}) {
  const existing = await prisma.contractField.findUnique({
    where: { contractId_key: { contractId: args.contractId, key: args.key } },
  });

  const updated = await prisma.contractField.upsert({
    where: { contractId_key: { contractId: args.contractId, key: args.key } },
    create: {
      contractId: args.contractId,
      key: args.key,
      kind: FIELD_KINDS[args.key],
      declaredNum: args.num ?? null,
      declaredDate: args.date ?? null,
      declaredText: args.text ?? null,
    },
    update: {
      declaredNum: args.num !== undefined ? args.num : undefined,
      declaredDate: args.date !== undefined ? args.date : undefined,
      declaredText: args.text !== undefined ? args.text : undefined,
    },
  });

  await audit({
    actorId: args.actorId,
    actorRole: "SELLER",
    action: "SELLER_CORRECTED_FIELD",
    entityType: "ContractField",
    entityId: updated.id,
    before: existing
      ? {
          declaredNum: existing.declaredNum?.toString() ?? null,
          declaredDate: existing.declaredDate?.toISOString() ?? null,
          declaredText: existing.declaredText,
        }
      : null,
    after: {
      declaredNum: updated.declaredNum?.toString() ?? null,
      declaredDate: updated.declaredDate?.toISOString() ?? null,
      declaredText: updated.declaredText,
    },
    metadata: { key: args.key, note: "Correction stored as a declared value, not a verified value" },
  });

  return updated;
}

export function asDecimal(v: unknown): Decimal | null {
  if (v === null || v === undefined) return null;
  const d = new Decimal(String(v));
  return d.isNaN() ? null : d;
}
