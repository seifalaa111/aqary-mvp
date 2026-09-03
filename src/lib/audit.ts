import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The immutable audit trail. Every money movement, every verification decision,
 * every state transition writes here. Rows are never updated or deleted.
 */

export type AuditAction =
  | "USER_REGISTERED"
  | "USER_ROLE_ADDED"
  | "PHONE_VERIFIED"
  | "CONSENT_RECORDED"
  | "LISTING_CREATED"
  | "LISTING_STEP_SAVED"
  | "LISTING_SUBMITTED"
  | "LISTING_STATUS_CHANGED"
  | "LISTING_PUBLISHED"
  | "LISTING_REJECTED"
  | "LISTING_INFO_REQUESTED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_ACCESSED"
  | "MEDIA_UPLOADED"
  | "MEDIA_MODERATED"
  | "EXTRACTION_STARTED"
  | "EXTRACTION_COMPLETED"
  | "SELLER_CORRECTED_FIELD"
  | "FIELD_VERIFIED"
  | "FIELD_OVERRIDDEN"
  | "DISCREPANCY_CREATED"
  | "DISCREPANCY_RESOLVED"
  | "FRAUD_SIGNAL_RAISED"
  | "FRAUD_SIGNAL_DISPOSITIONED"
  | "RECEIPT_VERIFIED"
  | "RECEIPT_REJECTED"
  | "VALUATION_COMPUTED"
  | "VALUATION_OVERRIDDEN"
  | "VERIFICATION_SCORE_COMPUTED"
  | "OFFER_CREATED"
  | "OFFER_COUNTERED"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "OFFER_WITHDRAWN"
  | "OFFER_EXPIRED"
  | "DEAL_CREATED"
  | "MILESTONE_ADVANCED"
  | "MILESTONE_BLOCKED"
  | "PAYMENT_INITIATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_RETRIED"
  | "DEAL_COMPLETED"
  | "DEAL_CANCELLED"
  | "POLICY_UPDATED"
  | "KYC_REVIEWED"
  | "ACCESS_DENIED";

export interface AuditInput {
  actorId?: string | null;
  actorRole?: Role | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

type Tx = Prisma.TransactionClient | typeof prisma;

export async function audit(input: AuditInput, tx: Tx = prisma) {
  return tx.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      metadata: input.metadata ?? undefined,
      ip: input.ip ?? null,
    },
  });
}

export async function auditTrail(entityType: string, entityId: string, take = 100) {
  return prisma.auditEvent.findMany({
    where: { entityType, entityId },
    orderBy: { at: "desc" },
    take,
    include: { actor: { select: { id: true, fullNameEn: true, roles: true } } },
  });
}
