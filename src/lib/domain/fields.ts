import { Decimal } from "decimal.js";
import type { ContractField, ContractFieldKey, ValueKind, ValueSource } from "@prisma/client";

/**
 * Reading the five-source contract record (§2.2). Nothing here ever collapses
 * sources into one value — callers must ask for a specific source, or for the
 * resolved value plus its provenance.
 */

export const FIELD_KINDS: Record<ContractFieldKey, ValueKind> = {
  TOTAL_PRICE: "MONEY",
  DOWN_PAYMENT: "MONEY",
  AMOUNT_PAID: "MONEY",
  OUTSTANDING_BALANCE: "MONEY",
  INSTALLMENT_AMOUNT: "MONEY",
  MAINTENANCE_DEPOSIT: "MONEY",
  CLUB_FEE: "MONEY",
  ASSIGNMENT_FEE: "MONEY",
  CANCELLATION_PENALTY_PCT: "PERCENT",
  NUMBER_OF_INSTALLMENTS: "COUNT",
  INSTALLMENT_FREQUENCY: "ENUM",
  CONTRACT_SIGNING_DATE: "DATE",
  PLAN_START_DATE: "DATE",
  NEXT_DUE_DATE: "DATE",
  DELIVERY_DATE: "DATE",
};

/** Fields a listing cannot be published without a verified value for. */
export const REQUIRED_VERIFIED_FIELDS: ContractFieldKey[] = [
  "TOTAL_PRICE",
  "AMOUNT_PAID",
  "OUTSTANDING_BALANCE",
  "INSTALLMENT_AMOUNT",
  "INSTALLMENT_FREQUENCY",
  "DELIVERY_DATE",
];

export const FIELD_LABELS: Record<ContractFieldKey, { en: string; ar: string }> = {
  TOTAL_PRICE: { en: "Total contract price", ar: "إجمالي سعر التعاقد" },
  DOWN_PAYMENT: { en: "Down payment", ar: "الدفعة المقدمة" },
  AMOUNT_PAID: { en: "Amount paid to date", ar: "المبلغ المدفوع حتى الآن" },
  OUTSTANDING_BALANCE: { en: "Outstanding balance", ar: "الرصيد المتبقي" },
  INSTALLMENT_AMOUNT: { en: "Installment amount", ar: "قيمة القسط" },
  INSTALLMENT_FREQUENCY: { en: "Payment frequency", ar: "دورية السداد" },
  NUMBER_OF_INSTALLMENTS: { en: "Number of installments", ar: "عدد الأقساط" },
  MAINTENANCE_DEPOSIT: { en: "Maintenance deposit", ar: "وديعة الصيانة" },
  CLUB_FEE: { en: "Club / membership fee", ar: "رسوم النادي" },
  ASSIGNMENT_FEE: { en: "Developer assignment fee", ar: "رسوم التنازل لدى المطوّر" },
  CANCELLATION_PENALTY_PCT: { en: "Cancellation penalty", ar: "غرامة الإلغاء" },
  CONTRACT_SIGNING_DATE: { en: "Contract signing date", ar: "تاريخ التعاقد" },
  PLAN_START_DATE: { en: "Plan start date", ar: "بداية خطة السداد" },
  NEXT_DUE_DATE: { en: "Next installment due", ar: "القسط القادم" },
  DELIVERY_DATE: { en: "Contractual delivery date", ar: "تاريخ التسليم التعاقدي" },
};

export const SOURCE_LABELS: Record<ValueSource, { en: string; ar: string; short: string }> = {
  SELLER_DECLARED: { en: "Seller declared", ar: "إقرار البائع", short: "DECLARED" },
  AI_EXTRACTED: { en: "AI extracted", ar: "استخراج آلي", short: "EXTRACTED" },
  RECEIPT_VERIFIED: { en: "Receipt verified", ar: "موثّق بالإيصالات", short: "RECEIPTS" },
  DEVELOPER_CONFIRMED: { en: "Developer confirmed", ar: "مؤكّد من المطوّر", short: "DEVELOPER" },
  ANALYST_OVERRIDE: { en: "Analyst override", ar: "تصحيح المحلل", short: "ANALYST" },
};

export interface SourceValue {
  source: ValueSource;
  num: Decimal | null;
  date: Date | null;
  text: string | null;
  confidence?: number | null;
  documentId?: string | null;
  page?: number | null;
  bbox?: unknown;
  note?: string | null;
  present: boolean;
}

export function sourcesOf(f: ContractField): SourceValue[] {
  return [
    {
      source: "SELLER_DECLARED",
      num: dec(f.declaredNum),
      date: f.declaredDate,
      text: f.declaredText,
      present: f.declaredNum !== null || f.declaredDate !== null || f.declaredText !== null,
    },
    {
      source: "AI_EXTRACTED",
      num: dec(f.extractedNum),
      date: f.extractedDate,
      text: f.extractedText,
      confidence: f.extractedConfidence,
      documentId: f.extractedDocumentId,
      page: f.extractedPage,
      bbox: f.extractedBbox,
      present: f.extractedNum !== null || f.extractedDate !== null || f.extractedText !== null,
    },
    {
      source: "RECEIPT_VERIFIED",
      num: dec(f.receiptDerivedNum),
      date: f.receiptDerivedDate,
      text: null,
      note: f.receiptDerivedNote,
      present: f.receiptDerivedNum !== null || f.receiptDerivedDate !== null,
    },
    {
      source: "DEVELOPER_CONFIRMED",
      num: dec(f.developerStatedNum),
      date: f.developerStatedDate,
      text: f.developerStatedText,
      documentId: f.developerStatedDocumentId,
      present:
        f.developerStatedNum !== null || f.developerStatedDate !== null || f.developerStatedText !== null,
    },
  ];
}

export function presentSources(f: ContractField): SourceValue[] {
  return sourcesOf(f).filter((s) => s.present);
}

export interface ResolvedField {
  key: ContractFieldKey;
  kind: ValueKind;
  /** Null until an analyst promotes a source. Buyer-facing surfaces read this. */
  verifiedNum: Decimal | null;
  verifiedDate: Date | null;
  verifiedText: string | null;
  provenance: ValueSource | null;
  verifiedAt: Date | null;
  isVerified: boolean;
}

export function resolveVerified(f: ContractField): ResolvedField {
  const isVerified =
    f.verifiedSource !== null &&
    (f.verifiedNum !== null || f.verifiedDate !== null || f.verifiedText !== null);
  return {
    key: f.key,
    kind: f.kind,
    verifiedNum: dec(f.verifiedNum),
    verifiedDate: f.verifiedDate,
    verifiedText: f.verifiedText,
    provenance: f.verifiedSource,
    verifiedAt: f.verifiedAt,
    isVerified,
  };
}

/** Convenience map keyed by field. */
export function fieldMap(fields: ContractField[]): Map<ContractFieldKey, ContractField> {
  return new Map(fields.map((f) => [f.key, f]));
}

export function verifiedNum(fields: ContractField[], key: ContractFieldKey): Decimal | null {
  const f = fields.find((x) => x.key === key);
  return f && f.verifiedSource ? dec(f.verifiedNum) : null;
}

export function verifiedDate(fields: ContractField[], key: ContractFieldKey): Date | null {
  const f = fields.find((x) => x.key === key);
  return f && f.verifiedSource ? f.verifiedDate : null;
}

export function declaredNum(fields: ContractField[], key: ContractFieldKey): Decimal | null {
  const f = fields.find((x) => x.key === key);
  return f ? dec(f.declaredNum) : null;
}

function dec(v: Decimal | { toString(): string } | null | undefined): Decimal | null {
  if (v === null || v === undefined) return null;
  return new Decimal(v.toString());
}
