"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { Decimal } from "decimal.js";
import type { ContractFieldKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { AuthorizationError, requireListingAccess, requireRole } from "@/lib/auth/guard";
import { FIELD_KINDS } from "@/lib/domain/fields";
import { buildInstallmentSchedule, checkAskingCash, minAcceptableCash, type Frequency } from "@/lib/domain/calculators";
import { parseNationalId } from "@/lib/domain/national-id";
import { applySellerCorrection } from "@/lib/services/extraction";
import { transitionListing } from "@/lib/services/listings";
import { enqueue, runJobNow } from "@/lib/services/jobs";
import { acceptOffer, counterOffer, declineOffer } from "@/lib/services/offers";
import { notify } from "@/lib/services/notifications";

export type SellerResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(err: unknown): SellerResult<never> {
  if (err instanceof AuthorizationError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) fieldErrors[i.path.join(".")] = i.message;
    return { ok: false, error: "Please check the highlighted fields", fieldErrors };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Draft lifecycle
// ---------------------------------------------------------------------------

/** Creates a resumable draft, or returns the seller's existing one. */
export async function startOrResumeDraft(): Promise<SellerResult<{ listingId: string }>> {
  try {
    const user = await requireRole("SELLER");

    const existing = await prisma.listing.findFirst({
      where: { sellerId: user.id, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) return { ok: true, data: { listingId: existing.id } };

    const count = await prisma.listing.count();
    const reference = `AQ-${String(1000 + count + 1)}`;

    // A draft needs a Unit and Contract to hang off from step one, so the wizard
    // can autosave into real rows rather than holding state in the browser.
    const placeholderProject = await prisma.project.findFirstOrThrow({ orderBy: { nameEn: "asc" } });

    const listing = await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: {
          projectId: placeholderProject.id,
          unitCode: `DRAFT-${reference}-${Date.now()}`,
          unitType: "APARTMENT",
          buaSqm: "0",
          bedrooms: 0,
          bathrooms: 0,
          contractualDeliveryDate: new Date(Date.UTC(new Date().getUTCFullYear() + 3, 11, 31)),
        },
      });
      const contract = await tx.contract.create({ data: { unitId: unit.id, sellerId: user.id } });
      return tx.listing.create({
        data: { reference, contractId: contract.id, sellerId: user.id, status: "DRAFT", wizardStep: 1 },
      });
    });

    await audit({
      actorId: user.id,
      actorRole: "SELLER",
      action: "LISTING_CREATED",
      entityType: "Listing",
      entityId: listing.id,
      after: { reference },
      ip: await ip(),
    });

    return { ok: true, data: { listingId: listing.id } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Step 1 — identity and standing
// ---------------------------------------------------------------------------

const step1 = z.object({
  listingId: z.string().min(1),
  fullNameAr: z.string().min(3, "Enter your name in Arabic, as it appears on the contract"),
  fullNameEn: z.string().min(3, "Enter your full name"),
  nationalId: z.string().min(14, "A national ID is 14 digits"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  relationshipToContract: z.enum(["OWNER", "AUTHORIZED_REPRESENTATIVE", "HEIR"]),
  coOwnerCount: z.coerce.number().int().min(0).max(10).default(0),
  coOwnerNames: z.array(z.string()).default([]),
  preferredContactWindow: z.string().optional(),
  whatsappOptIn: z.boolean().default(false),
});

export async function saveStep1(input: unknown): Promise<SellerResult> {
  try {
    const data = step1.parse(input);
    const { user } = await requireListingAccess(data.listingId, { as: "SELLER" });

    const parsed = parseNationalId(data.nationalId);
    if (!parsed.valid) {
      return { ok: false, error: parsed.error ?? "Invalid national ID", fieldErrors: { nationalId: parsed.error ?? "Invalid" } };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        fullNameAr: data.fullNameAr,
        fullNameEn: data.fullNameEn,
        nationalId: data.nationalId.replace(/\D/g, ""),
        dateOfBirth: parsed.dateOfBirth,
        governorate: parsed.governorate,
        ...(data.email ? { email: data.email.toLowerCase() } : {}),
      },
    });

    await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        relationshipToContract: data.relationshipToContract,
        coOwnerCount: data.coOwnerCount,
        coOwnerNames: data.coOwnerNames.filter(Boolean),
        preferredContactWindow: data.preferredContactWindow,
        whatsappOptIn: data.whatsappOptIn,
      },
      update: {
        relationshipToContract: data.relationshipToContract,
        coOwnerCount: data.coOwnerCount,
        coOwnerNames: data.coOwnerNames.filter(Boolean),
        preferredContactWindow: data.preferredContactWindow,
        whatsappOptIn: data.whatsappOptIn,
      },
    });

    await markStep(data.listingId, 1, user.id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Step 2 — the property
// ---------------------------------------------------------------------------

const step2 = z.object({
  listingId: z.string().min(1),
  projectId: z.string().min(1, "Choose the project"),
  unitCode: z.string().min(1, "Enter the unit code exactly as printed on the contract"),
  phase: z.string().optional(),
  unitType: z.string().min(1),
  buaSqm: z.coerce.number().positive("Enter the built-up area"),
  gardenSqm: z.coerce.number().min(0).optional(),
  roofSqm: z.coerce.number().min(0).optional(),
  terraceSqm: z.coerce.number().min(0).optional(),
  floor: z.coerce.number().int().min(-2).max(60).optional(),
  bedrooms: z.coerce.number().int().min(0).max(12),
  bathrooms: z.coerce.number().int().min(0).max(12),
  view: z.string().optional(),
  finishing: z.string().min(1),
  contractualDeliveryDate: z.string().min(4),
  deliveryStatus: z.enum(["NOT_DELIVERED", "DELIVERED", "DELAYED"]),
});

export async function saveStep2(input: unknown): Promise<SellerResult> {
  try {
    const data = step2.parse(input);
    const { user } = await requireListingAccess(data.listingId, { as: "SELLER" });

    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: data.listingId },
      include: { contract: true },
    });

    await prisma.unit.update({
      where: { id: listing.contract.unitId },
      data: {
        projectId: data.projectId,
        unitCode: data.unitCode,
        phase: data.phase || null,
        unitType: data.unitType as never,
        buaSqm: data.buaSqm.toString(),
        gardenSqm: data.gardenSqm ? data.gardenSqm.toString() : null,
        roofSqm: data.roofSqm ? data.roofSqm.toString() : null,
        terraceSqm: data.terraceSqm ? data.terraceSqm.toString() : null,
        floor: data.floor ?? null,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        view: data.view || null,
        finishing: data.finishing as never,
        contractualDeliveryDate: new Date(data.contractualDeliveryDate),
        deliveryStatus: data.deliveryStatus,
      },
    });

    await upsertDeclared(listing.contractId, "DELIVERY_DATE", { date: new Date(data.contractualDeliveryDate) });
    await markStep(data.listingId, 2, user.id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Step 3 — contract economics. Everything here is a DECLARED value.
// ---------------------------------------------------------------------------

const specialPayment = z.object({
  label: z.string().min(1),
  amount: z.coerce.number().positive(),
  monthOffset: z.coerce.number().int().min(0).max(240),
  kind: z.enum(["BALLOON", "DELIVERY", "MAINTENANCE", "CLUB"]).default("BALLOON"),
});

const step3 = z.object({
  listingId: z.string().min(1),
  contractNumber: z.string().optional(),
  signingDate: z.string().min(4, "Enter the contract signing date"),
  totalPrice: z.coerce.number().positive("Enter the total contract price"),
  downPayment: z.coerce.number().min(0),
  downPaymentDate: z.string().optional(),
  maintenanceDeposit: z.coerce.number().min(0).default(0),
  maintenancePaid: z.boolean().default(false),
  clubFee: z.coerce.number().min(0).default(0),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
  numberOfInstallments: z.coerce.number().int().positive("Enter the number of installments"),
  installmentAmount: z.coerce.number().positive("Enter the installment amount"),
  planStartDate: z.string().min(4),
  nextDueDate: z.string().optional(),
  specialPayments: z.array(specialPayment).default([]),
  totalPaid: z.coerce.number().min(0, "Enter what you have paid so far"),
  outstandingBalance: z.coerce.number().min(0).optional(),
  hasArrears: z.boolean().default(false),
  arrearsAmount: z.coerce.number().min(0).optional(),
  hasBankFinance: z.boolean().default(false),
  lienNote: z.string().optional(),
  assignmentPermitted: z.enum(["ALLOWED", "NOT_ALLOWED", "CONDITIONAL", "UNKNOWN"]).default("UNKNOWN"),
  assignmentFee: z.coerce.number().min(0).optional(),
  assignmentConditionsNote: z.string().optional(),
  cancellationPenaltyPct: z.coerce.number().min(0).max(100).optional(),
  cancellationPenaltyNote: z.string().optional(),
});

export async function saveStep3(input: unknown): Promise<SellerResult<{ scheduleRows: number }>> {
  try {
    const data = step3.parse(input);
    const { user } = await requireListingAccess(data.listingId, { as: "SELLER" });

    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: data.listingId },
      include: { contract: true },
    });
    const contractId = listing.contractId;

    if (data.totalPaid > data.totalPrice) {
      return {
        ok: false,
        error: "You cannot have paid more than the total contract price",
        fieldErrors: { totalPaid: "Higher than the total contract price" },
      };
    }

    await prisma.contract.update({
      where: { id: contractId },
      data: {
        contractNumber: data.contractNumber || null,
        hasArrears: data.hasArrears,
        arrearsAmount: data.hasArrears && data.arrearsAmount ? data.arrearsAmount.toString() : null,
        hasBankFinance: data.hasBankFinance,
        lienNote: data.lienNote || null,
        assignmentPermitted: data.assignmentPermitted,
        assignmentConditionsNote: data.assignmentConditionsNote || null,
        cancellationPenaltyNote: data.cancellationPenaltyNote || null,
      },
    });

    const outstanding =
      data.outstandingBalance !== undefined && data.outstandingBalance > 0
        ? data.outstandingBalance
        : new Decimal(data.totalPrice).minus(data.totalPaid).toNumber();

    const declared: [ContractFieldKey, { num?: number; date?: Date; text?: string }][] = [
      ["TOTAL_PRICE", { num: data.totalPrice }],
      ["DOWN_PAYMENT", { num: data.downPayment }],
      ["AMOUNT_PAID", { num: data.totalPaid }],
      ["OUTSTANDING_BALANCE", { num: outstanding }],
      ["INSTALLMENT_AMOUNT", { num: data.installmentAmount }],
      ["INSTALLMENT_FREQUENCY", { text: data.frequency }],
      ["NUMBER_OF_INSTALLMENTS", { num: data.numberOfInstallments }],
      ["MAINTENANCE_DEPOSIT", { num: data.maintenanceDeposit }],
      ["CLUB_FEE", { num: data.clubFee }],
      ["CONTRACT_SIGNING_DATE", { date: new Date(data.signingDate) }],
      ["PLAN_START_DATE", { date: new Date(data.planStartDate) }],
    ];
    if (data.nextDueDate) declared.push(["NEXT_DUE_DATE", { date: new Date(data.nextDueDate) }]);
    if (data.assignmentFee !== undefined) declared.push(["ASSIGNMENT_FEE", { num: data.assignmentFee }]);
    if (data.cancellationPenaltyPct !== undefined) {
      declared.push(["CANCELLATION_PENALTY_PCT", { num: data.cancellationPenaltyPct }]);
    }

    for (const [key, value] of declared) {
      await upsertDeclared(contractId, key, value);
    }

    // Rebuild the seller's declared schedule from what they just entered, so the
    // wizard shows them their own plan back rather than a list of numbers.
    const rows = buildInstallmentSchedule({
      totalPrice: data.totalPrice,
      downPayment: data.downPayment,
      planStart: new Date(data.planStartDate),
      frequency: data.frequency as Frequency,
      numberOfInstallments: data.numberOfInstallments,
      installmentAmount: data.installmentAmount,
      contractSigningDate: new Date(data.signingDate),
      specialPayments: data.specialPayments.map((s) => ({
        monthOffset: s.monthOffset,
        amount: s.amount,
        kind: s.kind,
        label: s.label,
      })),
    });

    await prisma.installment.deleteMany({ where: { contractId, source: "SELLER_DECLARED" } });
    await prisma.installment.createMany({
      data: rows.map((r) => ({
        contractId,
        sequence: r.sequence,
        kind: r.kind,
        dueDate: r.dueDate,
        amount: r.amount.toFixed(2),
        status: r.dueDate <= new Date() ? ("PAID" as const) : ("UPCOMING" as const),
        runningBalance: r.runningBalance.toFixed(2),
        source: "SELLER_DECLARED" as const,
        label: r.label ?? null,
      })),
    });

    // The seller's asking cash starts at what they say they have paid. It is
    // capped again at the verified figure the moment an analyst signs it off.
    await prisma.listing.update({
      where: { id: data.listingId },
      data: {
        askingCash: data.totalPaid.toString(),
        minAcceptableCash: minAcceptableCash(data.totalPaid, listing.flexibilityPct).toFixed(2),
      },
    });

    await markStep(data.listingId, 3, user.id);
    return { ok: true, data: { scheduleRows: rows.length } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Step 4 — documents and media (uploads go through /api/upload)
// ---------------------------------------------------------------------------

export async function completeStep4(listingId: string): Promise<SellerResult> {
  try {
    const { user } = await requireListingAccess(listingId, { as: "SELLER" });
    await markStep(listingId, 4, user.id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteUpload(args: {
  listingId: string;
  documentId?: string;
  mediaId?: string;
}): Promise<SellerResult> {
  try {
    await requireListingAccess(args.listingId, { as: "SELLER" });
    if (args.documentId) {
      await prisma.receipt.deleteMany({ where: { documentId: args.documentId } });
      await prisma.document.deleteMany({ where: { id: args.documentId, listingId: args.listingId } });
    }
    if (args.mediaId) {
      await prisma.mediaAsset.deleteMany({ where: { id: args.mediaId, listingId: args.listingId } });
    }
    revalidatePath(`/seller/listings/${args.listingId}/wizard`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setCoverImage(listingId: string, mediaId: string): Promise<SellerResult> {
  try {
    await requireListingAccess(listingId, { as: "SELLER" });
    await prisma.$transaction([
      prisma.mediaAsset.updateMany({ where: { listingId }, data: { isCover: false } }),
      prisma.mediaAsset.update({ where: { id: mediaId }, data: { isCover: true, order: 0 } }),
    ]);
    revalidatePath(`/seller/listings/${listingId}/wizard`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reorderMedia(listingId: string, orderedIds: string[]): Promise<SellerResult> {
  try {
    await requireListingAccess(listingId, { as: "SELLER" });
    await prisma.$transaction(
      orderedIds.map((id, i) =>
        prisma.mediaAsset.updateMany({ where: { id, listingId }, data: { order: i } }),
      ),
    );
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Step 5 — exit terms and consents
// ---------------------------------------------------------------------------

const step5 = z.object({
  listingId: z.string().min(1),
  flexibilityPct: z.coerce.number().min(0).max(config.MAX_FLEXIBILITY_PCT).default(0),
  urgency: z.enum(["IMMEDIATE", "ONE_TO_THREE_MONTHS", "FLEXIBLE"]),
  exitReason: z.enum([
    "JOB_CHANGE",
    "BUSINESS_DIFFICULTY",
    "INCREASED_OBLIGATIONS",
    "FAMILY_CIRCUMSTANCES",
    "LIQUIDITY_NEED",
    "STRATEGY_CHANGE",
    "CANNOT_CONTINUE_INSTALLMENTS",
    "OTHER",
  ]),
  isPrivate: z.boolean().default(false),
  exclusivityDays: z.coerce.number().int().min(0).max(180).default(0),
  consents: z.object({
    DEVELOPER_VERIFICATION_AUTHORIZATION: z.boolean(),
    LISTING_AGREEMENT: z.boolean(),
    TERMS_OF_SERVICE: z.boolean(),
    PRIVACY_AND_DATA_PROCESSING: z.boolean(),
    DISPLAY_REDACTED_CONTRACT: z.boolean(),
  }),
});

export async function saveStep5(input: unknown): Promise<SellerResult> {
  try {
    const data = step5.parse(input);
    const { user } = await requireListingAccess(data.listingId, { as: "SELLER" });

    const missing = Object.entries(data.consents)
      .filter(([, granted]) => !granted)
      .map(([type]) => type);
    if (missing.length > 0) {
      return { ok: false, error: "All consents are required before we can verify your file", fieldErrors: { consents: missing.join(",") } };
    }

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: data.listingId } });
    const asking = listing.askingCash ?? new Decimal(0);

    await prisma.listing.update({
      where: { id: data.listingId },
      data: {
        flexibilityPct: data.flexibilityPct,
        minAcceptableCash: minAcceptableCash(asking.toString(), data.flexibilityPct).toFixed(2),
        urgency: data.urgency,
        exitReason: data.exitReason,
        isPrivate: data.isPrivate,
        exclusivityUntil:
          data.exclusivityDays > 0
            ? new Date(Date.now() + data.exclusivityDays * 86400000)
            : null,
      },
    });

    // Each consent is a separate, individually timestamped row with the IP.
    const clientIp = await ip();
    const agent = (await headers()).get("user-agent");
    for (const type of Object.keys(data.consents) as (keyof typeof data.consents)[]) {
      await prisma.consent.create({
        data: {
          userId: user.id,
          type,
          granted: true,
          textVersion: `${type.toLowerCase()}-v1`,
          ip: clientIp,
          userAgent: agent,
        },
      });
      await audit({
        actorId: user.id,
        actorRole: "SELLER",
        action: "CONSENT_RECORDED",
        entityType: "Listing",
        entityId: data.listingId,
        after: { type },
        ip: clientIp,
      });
    }

    await markStep(data.listingId, 5, user.id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Submit — runs the extraction pipeline
// ---------------------------------------------------------------------------

export async function submitForVerification(listingId: string): Promise<SellerResult<{ status: string }>> {
  try {
    const { user } = await requireListingAccess(listingId, { as: "SELLER" });

    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      include: {
        contract: { include: { fields: true } },
        _count: { select: { documents: true, media: true } },
      },
    });

    const missing: string[] = [];
    const totalPrice = listing.contract.fields.find((f) => f.key === "TOTAL_PRICE")?.declaredNum;
    if (!totalPrice) missing.push("Contract economics (step 3)");
    const docs = await prisma.document.groupBy({
      by: ["type"],
      where: { listingId },
      _count: true,
    });
    const has = (t: string) => docs.some((d) => d.type === t);
    if (!has("SALE_CONTRACT")) missing.push("The sale contract");
    if (!has("PAYMENT_RECEIPT")) missing.push("At least one payment receipt");
    if (listing._count.media < 1) missing.push("At least one photograph or plan");

    if (missing.length > 0) {
      return { ok: false, error: `Still needed: ${missing.join(", ")}` };
    }

    await transitionListing({
      listingId,
      to: "SUBMITTED",
      actorId: user.id,
      actorRole: "SELLER",
      data: { submittedAt: new Date(), wizardStep: 6 },
    });

    await audit({
      actorId: user.id,
      actorRole: "SELLER",
      action: "LISTING_SUBMITTED",
      entityType: "Listing",
      entityId: listingId,
      ip: await ip(),
    });

    // The extraction pipeline is a real queued job. We run it inline here so the
    // seller lands on their review screen with results, and it stays a job so a
    // failure retries and is visible in the ops console.
    const job = await enqueue("extraction.run", { listingId });
    // Deliberately swallowed: runJobNow rethrows so ops callers can report a
    // failure, but here the queue is the fallback. A failed inline run is
    // already persisted with its error and retried by the worker, and the
    // seller should still reach their review screen.
    await runJobNow(job.id).catch(() => undefined);

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    revalidatePath(`/seller/listings/${listingId}`);
    return { ok: true, data: { status: after.status } };
  } catch (err) {
    return fail(err);
  }
}

/** Step 6 — the seller corrects an extracted field. Stored as a DECLARED value. */
export async function correctField(input: {
  listingId: string;
  key: ContractFieldKey;
  num?: string;
  date?: string;
  text?: string;
}): Promise<SellerResult> {
  try {
    const { user } = await requireListingAccess(input.listingId, { as: "SELLER" });
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: input.listingId } });

    await applySellerCorrection({
      contractId: listing.contractId,
      key: input.key,
      actorId: user.id,
      num: input.num ?? undefined,
      date: input.date ? new Date(input.date) : undefined,
      text: input.text ?? undefined,
    });

    revalidatePath(`/seller/listings/${input.listingId}/review`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmExtractionReview(listingId: string): Promise<SellerResult> {
  try {
    const { user } = await requireListingAccess(listingId, { as: "SELLER" });
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

    if (listing.status === "INFO_REQUESTED") {
      await transitionListing({
        listingId,
        to: "PENDING_REVIEW",
        actorId: user.id,
        actorRole: "SELLER",
        reason: "Seller supplied the requested information",
        data: { slaDueAt: new Date(Date.now() + config.VERIFICATION_SLA_HOURS * 3600 * 1000) },
      });
      await notifyAnalysts(listingId, listing.reference);
    }

    await prisma.listing.update({ where: { id: listingId }, data: { wizardStep: 6 } });
    revalidatePath(`/seller/listings/${listingId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Offers, from the seller's side
// ---------------------------------------------------------------------------

export async function respondToOffer(input: {
  offerId: string;
  action: "ACCEPT" | "DECLINE" | "COUNTER";
  amount?: string;
  message?: string;
}): Promise<SellerResult<{ dealId?: string }>> {
  try {
    const user = await requireRole("SELLER");
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: input.offerId } });
    if (offer.sellerId !== user.id) {
      return { ok: false, error: "That offer is not on one of your listings" };
    }

    if (input.action === "ACCEPT") {
      const result = await acceptOffer({ offerId: input.offerId, actorId: user.id });
      revalidatePath(`/seller/listings/${offer.listingId}/offers`);
      return { ok: true, data: { dealId: result.deal.id } };
    }
    if (input.action === "DECLINE") {
      await declineOffer({ offerId: input.offerId, actorId: user.id, reason: input.message });
      revalidatePath(`/seller/listings/${offer.listingId}/offers`);
      return { ok: true };
    }

    if (!input.amount) return { ok: false, error: "Enter your counter amount" };
    await counterOffer({
      offerId: input.offerId,
      actorId: user.id,
      actorRole: "SELLER",
      amount: input.amount,
      message: input.message,
    });
    revalidatePath(`/seller/listings/${offer.listingId}/offers`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Seller adjusts their asking cash. Server re-checks the invariant. */
export async function updateAskingCash(input: {
  listingId: string;
  askingCash: string;
  flexibilityPct: number;
}): Promise<SellerResult> {
  try {
    const { user } = await requireListingAccess(input.listingId, { as: "SELLER" });
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: input.listingId },
      include: { contract: { include: { fields: true } } },
    });

    const verifiedPaid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID");
    const baseline =
      verifiedPaid?.verifiedSource && verifiedPaid.verifiedNum
        ? verifiedPaid.verifiedNum.toString()
        : verifiedPaid?.declaredNum?.toString();

    if (!baseline) {
      return { ok: false, error: "We need your amount paid before you can set your asking cash" };
    }

    const check = checkAskingCash(input.askingCash, baseline);
    if (!check.ok) {
      return {
        ok: false,
        error:
          check.reason === "ABOVE_VERIFIED_PAID"
            ? `You can ask at most what you have paid: EGP ${new Decimal(baseline).toFixed(0)}. Aqary has no overprice.`
            : "Enter a valid amount",
        fieldErrors: { askingCash: "Cannot exceed the amount paid" },
      };
    }

    const before = listing.askingCash?.toString() ?? null;
    await prisma.listing.update({
      where: { id: input.listingId },
      data: {
        askingCash: input.askingCash,
        flexibilityPct: input.flexibilityPct,
        minAcceptableCash: minAcceptableCash(input.askingCash, input.flexibilityPct).toFixed(2),
      },
    });

    await audit({
      actorId: user.id,
      actorRole: "SELLER",
      action: "LISTING_STEP_SAVED",
      entityType: "Listing",
      entityId: input.listingId,
      before: { askingCash: before },
      after: { askingCash: input.askingCash, flexibilityPct: input.flexibilityPct },
    });

    revalidatePath(`/seller/listings/${input.listingId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------

async function upsertDeclared(
  contractId: string,
  key: ContractFieldKey,
  value: { num?: number | string; date?: Date; text?: string },
) {
  await prisma.contractField.upsert({
    where: { contractId_key: { contractId, key } },
    create: {
      contractId,
      key,
      kind: FIELD_KINDS[key],
      declaredNum: value.num !== undefined ? value.num.toString() : null,
      declaredDate: value.date ?? null,
      declaredText: value.text ?? null,
    },
    update: {
      declaredNum: value.num !== undefined ? value.num.toString() : undefined,
      declaredDate: value.date ?? undefined,
      declaredText: value.text ?? undefined,
    },
  });
}

async function markStep(listingId: string, step: number, actorId: string) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  const completed = [...new Set([...listing.wizardCompleted, step])].sort((a, b) => a - b);
  await prisma.listing.update({
    where: { id: listingId },
    data: { wizardCompleted: completed, wizardStep: Math.max(listing.wizardStep, Math.min(6, step + 1)) },
  });
  await audit({
    actorId,
    actorRole: "SELLER",
    action: "LISTING_STEP_SAVED",
    entityType: "Listing",
    entityId: listingId,
    after: { step, completed },
  });
  revalidatePath(`/seller/listings/${listingId}/wizard`);
}

async function notifyAnalysts(listingId: string, reference: string) {
  const analysts = await prisma.user.findMany({
    where: { roles: { has: "ANALYST" }, deletedAt: null },
    select: { id: true },
  });
  for (const a of analysts) {
    await notify({
      userId: a.id,
      type: "LISTING_SUBMITTED",
      titleEn: `${reference} is back in the queue`,
      titleAr: `${reference} عاد إلى قائمة المراجعة`,
      bodyEn: "The seller supplied the information you requested.",
      bodyAr: "قدّم البائع المعلومات المطلوبة.",
      linkHref: `/analyst/listings/${listingId}`,
    });
  }
}
