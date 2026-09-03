import type { ContractFieldKey, DocumentType } from "@prisma/client";

/**
 * Provider interfaces. Everything external to Aqary sits behind one of these.
 * The application never knows whether an implementation is mock or live —
 * same signatures, same latency shape, same failure cases, swapped by config.
 */

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface StoredObject {
  key: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Signed, expiring URL. Access is logged by the caller, not here. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  publicPath(key: string): string;
}

// ---------------------------------------------------------------------------
// AI — document intelligence
// ---------------------------------------------------------------------------

export interface ExtractionRequestDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  storageKey: string;
  pageCount: number;
  sha256: string;
  /** Page image keys, so a live provider can send real page images. */
  pageKeys: string[];
}

export interface ExtractionRequest {
  listingId: string;
  documents: ExtractionRequestDocument[];
  /** What the seller typed. A live provider is told NOT to copy these. */
  declaredHints?: Partial<Record<ContractFieldKey, string>>;
  locale: "ar" | "en";
}

export interface ExtractedFieldResult {
  key: ContractFieldKey;
  valueNum?: string | null;
  valueDate?: string | null;
  valueText?: string | null;
  confidence: number;
  documentId: string | null;
  page: number | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
  clauseText?: string | null;
}

export interface ExtractedReceiptResult {
  documentId: string;
  amount: string;
  date: string;
  method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "UNKNOWN";
  reference: string | null;
  confidence: number;
  page: number;
}

export interface ExtractionResult {
  model: string;
  version: string;
  mode: "MOCK" | "LIVE";
  latencyMs: number;
  costUsd: string;
  promptHash: string;
  fields: ExtractedFieldResult[];
  receipts: ExtractedReceiptResult[];
  clauses: { kind: "ASSIGNMENT" | "CANCELLATION" | "DELIVERY"; text: string; documentId: string; page: number }[];
  raw: unknown;
}

export interface AssistantCitation {
  documentId: string;
  page: number;
  quote: string;
}

export interface AssistantAnswer {
  answer: string;
  citations: AssistantCitation[];
  /** True when the documents genuinely do not contain the answer. */
  notStated: boolean;
  routeToHuman: boolean;
}

export interface AiProvider {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  extractContract(req: ExtractionRequest): Promise<ExtractionResult>;
  answerDealQuestion(req: {
    listingId: string;
    question: string;
    corpus: { documentId: string; page: number; text: string }[];
    locale: "ar" | "en";
  }): Promise<AssistantAnswer>;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentIntentRequest {
  idempotencyKey: string;
  amount: string;
  currency: "EGP";
  reference: string;
  description: string;
  /** Lets the demo drive success/failure deterministically. */
  simulate?: "SUCCESS" | "FAILURE" | "DEFAULT";
}

export interface PaymentIntentResult {
  providerRef: string;
  status: "PROCESSING";
  /** Milliseconds until the provider will call back. */
  settleAfterMs: number;
}

export interface PaymentCallback {
  providerRef: string;
  status: "SUCCEEDED" | "FAILED";
  failureCode?: string;
  failureReason?: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(req: PaymentIntentRequest): Promise<PaymentIntentResult>;
  /** Simulates the PSP's webhook. The application handles the state change. */
  resolveIntent(providerRef: string): Promise<PaymentCallback>;
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export interface KycProvider {
  readonly name: string;
  verifyIdentity(req: {
    userId: string;
    nationalId: string;
    fullNameAr: string;
    frontDocumentId?: string;
    backDocumentId?: string;
  }): Promise<{
    status: "VERIFIED" | "PENDING" | "REJECTED";
    checks: { name: string; passed: boolean; note?: string }[];
    reference: string;
  }>;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationProvider {
  readonly name: string;
  send(req: {
    channel: "SMS" | "WHATSAPP" | "EMAIL";
    to: string;
    subject?: string;
    body: string;
  }): Promise<{ delivered: boolean; providerRef: string; note?: string }>;
}
