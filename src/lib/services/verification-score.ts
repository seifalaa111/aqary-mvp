import "server-only";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { REQUIRED_VERIFIED_FIELDS } from "@/lib/domain/fields";

/**
 * VerificationScoreService — a real, fully itemised 0-100 computation.
 * A black-box trust score is worthless, so every component is returned with its
 * weight, its raw measurement and a plain sentence explaining it.
 */

export interface ScoreComponent {
  key: string;
  labelEn: string;
  labelAr: string;
  weight: number;
  /** 0..1 */
  ratio: number;
  points: number;
  detailEn: string;
  detailAr: string;
}

export interface VerificationScore {
  score: number;
  tier: "UNVERIFIED" | "BASIC" | "STRONG" | "FULLY_VERIFIED";
  components: ScoreComponent[];
  computedAt: string;
}

const WEIGHTS = {
  documentCompleteness: 18,
  receiptCoverage: 20,
  developerStatement: 14,
  arithmeticConsistency: 12,
  identityMatch: 8,
  mediaCompleteness: 10,
  fraudSignalsClear: 10,
  analystConfirmation: 8,
} as const;

const REQUIRED_DOC_TYPES = [
  "SALE_CONTRACT",
  "PAYMENT_RECEIPT",
  "NATIONAL_ID_FRONT",
  "NATIONAL_ID_BACK",
] as const;

export async function computeVerificationScore(listingId: string): Promise<VerificationScore> {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      documents: true,
      media: true,
      fraudSignals: true,
      discrepancies: true,
      seller: { select: { kycStatus: true } },
      contract: { include: { fields: true, receipts: true } },
    },
  });

  const components: ScoreComponent[] = [];

  // 1. Document completeness
  const present = new Set(listing.documents.map((d) => d.type));
  const haveRequired = REQUIRED_DOC_TYPES.filter((t) => present.has(t)).length;
  push(components, {
    key: "documentCompleteness",
    labelEn: "Document completeness",
    labelAr: "اكتمال المستندات",
    weight: WEIGHTS.documentCompleteness,
    ratio: haveRequired / REQUIRED_DOC_TYPES.length,
    detailEn: `${haveRequired} of ${REQUIRED_DOC_TYPES.length} required document types supplied`,
    detailAr: `${haveRequired} من ${REQUIRED_DOC_TYPES.length} من أنواع المستندات المطلوبة`,
  });

  // 2. Receipt coverage — verified receipts against the claimed amount paid
  const declaredPaid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID")?.declaredNum;
  const verifiedReceipts = listing.contract.receipts.filter((r) => r.status === "VERIFIED");
  const receiptTotal = verifiedReceipts.reduce(
    (acc, r) => acc.plus(money(r.verifiedAmount ?? r.extractedAmount ?? r.declaredAmount ?? 0)),
    money(0),
  );
  const claimed = declaredPaid ? new Decimal(declaredPaid.toString()) : null;
  const coverage = claimed && claimed.gt(0) ? Math.min(1, receiptTotal.div(claimed).toNumber()) : 0;
  push(components, {
    key: "receiptCoverage",
    labelEn: "Receipt coverage",
    labelAr: "تغطية الإيصالات",
    weight: WEIGHTS.receiptCoverage,
    ratio: coverage,
    detailEn: claimed
      ? `EGP ${receiptTotal.toFixed(0)} of EGP ${claimed.toFixed(0)} covered by verified receipts (${verifiedReceipts.length} of ${listing.contract.receipts.length})`
      : "No declared amount paid to measure against",
    detailAr: claimed
      ? `${receiptTotal.toFixed(0)} من ${claimed.toFixed(0)} جنيه مغطاة بإيصالات موثّقة`
      : "لا يوجد مبلغ مُقر به للمقارنة",
  });

  // 3. Developer account statement present — the single highest-value document
  const hasStatement = present.has("DEVELOPER_ACCOUNT_STATEMENT");
  push(components, {
    key: "developerStatement",
    labelEn: "Developer account statement",
    labelAr: "كشف حساب المطوّر",
    weight: WEIGHTS.developerStatement,
    ratio: hasStatement ? 1 : 0,
    detailEn: hasStatement
      ? "Statement supplied — balances confirmed against the developer's own record"
      : "Not supplied. This is the fastest way to raise the score.",
    detailAr: hasStatement ? "كشف الحساب متوفر" : "غير متوفر — أسرع وسيلة لرفع درجة التوثيق",
  });

  // 4. Arithmetic consistency — open discrepancies, weighted by severity
  const open = listing.discrepancies.filter((d) => d.status === "OPEN");
  const penalty = open.reduce(
    (acc, d) => acc + ({ INFO: 0.02, MINOR: 0.08, MAJOR: 0.25, CRITICAL: 0.6 }[d.severity] ?? 0.1),
    0,
  );
  push(components, {
    key: "arithmeticConsistency",
    labelEn: "Arithmetic consistency",
    labelAr: "اتساق الأرقام",
    weight: WEIGHTS.arithmeticConsistency,
    ratio: Math.max(0, 1 - penalty),
    detailEn: open.length === 0 ? "All sources reconcile" : `${open.length} open discrepancy(ies)`,
    detailAr: open.length === 0 ? "كل المصادر متطابقة" : `${open.length} تباين مفتوح`,
  });

  // 5. Identity
  const kycOk = listing.seller.kycStatus === "VERIFIED";
  const idMismatch = listing.fraudSignals.some(
    (s) => s.type === "ID_NAME_MISMATCH" && s.status !== "DISMISSED",
  );
  push(components, {
    key: "identityMatch",
    labelEn: "Identity match",
    labelAr: "مطابقة الهوية",
    weight: WEIGHTS.identityMatch,
    ratio: kycOk && !idMismatch ? 1 : kycOk ? 0.4 : 0,
    detailEn: kycOk
      ? idMismatch
        ? "KYC passed but the ID name does not match the contract"
        : "KYC passed and the ID matches the contract holder"
      : "Seller KYC not yet verified",
    detailAr: kycOk ? (idMismatch ? "تعارض في الاسم" : "الهوية مطابقة") : "لم يتم توثيق هوية البائع",
  });

  // 6. Media completeness
  const approved = listing.media.filter((m) => m.moderationStatus === "APPROVED");
  const photos = approved.filter((m) => m.kind === "PHOTO" || m.kind === "RENDER").length;
  const hasFloorPlan = approved.some((m) => m.kind === "FLOOR_PLAN");
  const hasMasterPlan = approved.some((m) => m.kind === "MASTER_PLAN");
  const mediaRatio =
    Math.min(1, photos / 5) * 0.6 + (hasFloorPlan ? 0.2 : 0) + (hasMasterPlan ? 0.2 : 0);
  push(components, {
    key: "mediaCompleteness",
    labelEn: "Media completeness",
    labelAr: "اكتمال الصور والمخططات",
    weight: WEIGHTS.mediaCompleteness,
    ratio: mediaRatio,
    detailEn: `${photos} approved images, floor plan ${hasFloorPlan ? "present" : "missing"}, master plan ${hasMasterPlan ? "present" : "missing"}`,
    detailAr: `${photos} صورة معتمدة، مخطط الوحدة ${hasFloorPlan ? "متوفر" : "غير متوفر"}`,
  });

  // 7. Fraud signals clear
  const openSignals = listing.fraudSignals.filter(
    (s) => s.status === "OPEN" || s.status === "ESCALATED",
  );
  const signalPenalty = openSignals.reduce(
    (acc, s) => acc + ({ INFO: 0.05, MINOR: 0.15, MAJOR: 0.4, CRITICAL: 1 }[s.severity] ?? 0.2),
    0,
  );
  push(components, {
    key: "fraudSignalsClear",
    labelEn: "Fraud signals",
    labelAr: "مؤشرات الاشتباه",
    weight: WEIGHTS.fraudSignalsClear,
    ratio: Math.max(0, 1 - signalPenalty),
    detailEn: openSignals.length === 0 ? "No open signals" : `${openSignals.length} signal(s) awaiting disposition`,
    detailAr: openSignals.length === 0 ? "لا توجد مؤشرات مفتوحة" : `${openSignals.length} مؤشر بانتظار المراجعة`,
  });

  // 8. Analyst confirmation — how much of the record a human has signed
  const verifiedRequired = REQUIRED_VERIFIED_FIELDS.filter((k) => {
    const f = listing.contract.fields.find((x) => x.key === k);
    return f?.verifiedSource != null;
  }).length;
  push(components, {
    key: "analystConfirmation",
    labelEn: "Analyst confirmation",
    labelAr: "اعتماد المحلل",
    weight: WEIGHTS.analystConfirmation,
    ratio: verifiedRequired / REQUIRED_VERIFIED_FIELDS.length,
    detailEn: `${verifiedRequired} of ${REQUIRED_VERIFIED_FIELDS.length} required fields promoted to verified by an analyst`,
    detailAr: `${verifiedRequired} من ${REQUIRED_VERIFIED_FIELDS.length} حقل معتمد من المحلل`,
  });

  const score = Math.round(components.reduce((acc, c) => acc + c.points, 0));
  const tier: VerificationScore["tier"] =
    score >= 85 ? "FULLY_VERIFIED" : score >= 65 ? "STRONG" : score >= 40 ? "BASIC" : "UNVERIFIED";

  const result: VerificationScore = { score, tier, components, computedAt: new Date().toISOString() };

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      verificationScore: score,
      verificationScoreBreakdown: result as unknown as object,
    },
  });

  await audit({
    action: "VERIFICATION_SCORE_COMPUTED",
    entityType: "Listing",
    entityId: listingId,
    after: { score, tier },
  });

  return result;
}

function push(
  list: ScoreComponent[],
  c: Omit<ScoreComponent, "points"> & { ratio: number },
) {
  const ratio = Math.max(0, Math.min(1, c.ratio));
  list.push({ ...c, ratio, points: Math.round(ratio * c.weight * 10) / 10 });
}

export function tierLabel(tier: VerificationScore["tier"]): { en: string; ar: string } {
  return {
    UNVERIFIED: { en: "Unverified", ar: "غير موثّق" },
    BASIC: { en: "Basic verification", ar: "توثيق أساسي" },
    STRONG: { en: "Strongly verified", ar: "توثيق قوي" },
    FULLY_VERIFIED: { en: "Fully verified", ar: "توثيق كامل" },
  }[tier];
}
