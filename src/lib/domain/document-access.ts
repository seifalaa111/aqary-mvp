import type { DocumentType } from "@prisma/client";

/**
 * Documents readable by a buyer holding valid listing-scoped confidentiality consent.
 * These are required for diligence on the contract, schedule, and assignment terms.
 */
export const DILIGENCE_TYPES: readonly DocumentType[] = [
  "SALE_CONTRACT",
  "CONTRACT_ANNEX",
  "PAYMENT_SCHEDULE_ANNEX",
  "RESERVATION_FORM",
  "PAYMENT_RECEIPT",
  "DEVELOPER_ACCOUNT_STATEMENT",
  "DELIVERY_CERTIFICATE",
  "MAINTENANCE_RECEIPT",
  "DEVELOPER_NOC",
] as const;

/**
 * Highly sensitive identity, banking, and private legal documents.
 * Readable ONLY by the document owner, assigned compliance analyst, and admin.
 * NEVER exposed to counterparty buyers, anonymous visitors, or the AI assistant.
 */
export const SENSITIVE_TYPES: readonly DocumentType[] = [
  "NATIONAL_ID_FRONT",
  "NATIONAL_ID_BACK",
  "PASSPORT",
  "BANK_TRANSFER_STATEMENT",
  "PROOF_OF_FUNDS",
  "PROOF_OF_ADDRESS",
  "EMPLOYMENT_PROOF",
  "POWER_OF_ATTORNEY",
  "CHEQUE_COPY",
  "CO_OWNER_CONSENT",
] as const;

export function isSensitive(type: DocumentType): boolean {
  return (SENSITIVE_TYPES as readonly string[]).includes(type);
}

export function canReadWithConsent(type: DocumentType): boolean {
  return (DILIGENCE_TYPES as readonly string[]).includes(type);
}
