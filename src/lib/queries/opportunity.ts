import "server-only";
import { Decimal } from "decimal.js";
import type { ContractFieldKey, ValueSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import { FIELD_LABELS } from "@/lib/domain/fields";
import { totalEffectiveCost, remainingTotal, buildInstallmentSchedule, type Frequency } from "@/lib/domain/calculators";

/**
 * Everything the opportunity page renders, assembled server-side. Buyer-facing
 * money reads `verified*` only: a field with no analyst signature comes back as
 * `pending`, never as the seller's unverified claim.
 */

export interface ProvenancedField {
  key: ContractFieldKey;
  labelEn: string;
  labelAr: string;
  kind: string;
  num: string | null;
  date: string | null;
  text: string | null;
  source: ValueSource | null;
  verifiedAt: string | null;
  pending: boolean;
}

export async function getOpportunity(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: { select: { id: true, fullNameEn: true } },
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
      documents: {
        select: { id: true, type: true, fileName: true, pageCount: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      valuations: { orderBy: { createdAt: "desc" }, take: 1, include: { comparables: true } },
      offers: { where: { status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } }, select: { id: true } },
      _count: { select: { savedBy: true, offers: true } },
      contract: {
        include: {
          fields: true,
          receipts: {
            where: { status: "VERIFIED" },
            orderBy: { verifiedDate: "asc" },
            select: { id: true, verifiedAmount: true, verifiedDate: true, documentId: true, method: true },
          },
          installments: { where: { source: "ANALYST_VERIFIED" }, orderBy: { sequence: "asc" } },
          unit: {
            include: {
              project: {
                include: { developer: { include: { policy: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!listing) return null;

  const fields: ProvenancedField[] = listing.contract.fields
    .map((f) => {
      const verified = f.verifiedSource !== null;
      return {
        key: f.key,
        labelEn: FIELD_LABELS[f.key].en,
        labelAr: FIELD_LABELS[f.key].ar,
        kind: f.kind,
        num: verified ? (f.verifiedNum?.toString() ?? null) : null,
        date: verified ? (f.verifiedDate?.toISOString() ?? null) : null,
        text: verified ? f.verifiedText : null,
        source: f.verifiedSource,
        verifiedAt: f.verifiedAt?.toISOString() ?? null,
        pending: !verified,
      };
    })
    .sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key));

  const unit = listing.contract.unit;
  const policy = unit.project.developer.policy;

  // Remaining schedule, computed from the verified installments the analyst
  // signed off — never typed, never taken from the seller's declaration.
  const now = new Date();
  const schedule = listing.contract.installments;
  const paidRows = schedule.filter((r) => r.dueDate <= now);
  const upcoming = schedule.filter((r) => r.dueDate > now);
  const remainingSum = upcoming.reduce((a, r) => a.plus(money(r.amount.toString())), money(0));

  const maintenanceAndClub = money(numOf(fields, "MAINTENANCE_DEPOSIT")).plus(
    money(numOf(fields, "CLUB_FEE")),
  );

  const cost = totalEffectiveCost({
    cashToSeller: listing.askingCash?.toString() ?? 0,
    totalContractPrice: listing.totalContractPrice?.toString() ?? 0,
    developerAssignmentFee: listing.developerAssignmentFee?.toString() ?? 0,
    maintenanceAndClubDues: 0, // dues are shown separately; they are not part of the transfer price
    remainingInstallmentsTotal: remainingSum,
    arrears: listing.contract.hasArrears ? listing.contract.arrearsAmount?.toString() ?? 0 : 0,
    currentDeveloperPrice: unit.currentDeveloperPrice?.toString() ?? undefined,
  });

  const valuation = listing.valuations[0] ?? null;

  return {
    listing,
    unit,
    project: unit.project,
    developer: unit.project.developer,
    policy,
    fields,
    schedule,
    paidRows,
    upcoming,
    remainingSum,
    maintenanceAndClub,
    cost,
    valuation,
    receipts: listing.contract.receipts,
    watchers: listing._count.savedBy,
    offerCount: listing._count.offers,
  };
}

export type Opportunity = NonNullable<Awaited<ReturnType<typeof getOpportunity>>>;

const FIELD_ORDER: ContractFieldKey[] = [
  "TOTAL_PRICE",
  "AMOUNT_PAID",
  "OUTSTANDING_BALANCE",
  "INSTALLMENT_AMOUNT",
  "INSTALLMENT_FREQUENCY",
  "NUMBER_OF_INSTALLMENTS",
  "NEXT_DUE_DATE",
  "DELIVERY_DATE",
  "DOWN_PAYMENT",
  "MAINTENANCE_DEPOSIT",
  "CLUB_FEE",
  "ASSIGNMENT_FEE",
  "CANCELLATION_PENALTY_PCT",
  "CONTRACT_SIGNING_DATE",
  "PLAN_START_DATE",
];

export function numOf(fields: ProvenancedField[], key: ContractFieldKey): string {
  return fields.find((f) => f.key === key)?.num ?? "0";
}

/** Listings that are genuinely similar: same city, comparable size and cash. */
export async function similarOpportunities(listingId: string, take = 3) {
  const base = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      askingCash: true,
      contract: { select: { unit: { select: { unitType: true, buaSqm: true, project: { select: { city: true } } } } } },
    },
  });
  if (!base) return [];

  const cash = base.askingCash ? new Decimal(base.askingCash.toString()) : null;
  const bua = new Decimal(base.contract.unit.buaSqm.toString());

  const { CARD_SELECT } = await import("./marketplace");
  return prisma.listing.findMany({
    where: {
      id: { not: listingId },
      status: { in: ["LISTED", "UNDER_OFFER"] },
      isPrivate: false,
      contract: {
        unit: {
          project: { city: base.contract.unit.project.city },
          buaSqm: { gte: bua.mul(0.7).toFixed(2), lte: bua.mul(1.4).toFixed(2) },
        },
      },
      ...(cash
        ? { askingCash: { gte: cash.mul(0.5).toFixed(2), lte: cash.mul(1.8).toFixed(2) } }
        : {}),
    },
    select: CARD_SELECT,
    orderBy: { discountPctBps: "desc" },
    take,
  });
}

/** The corpus the deal assistant is allowed to read: this deal's documents only. */
export async function dealCorpus(listingId: string) {
  const pages = await prisma.documentPage.findMany({
    where: { document: { listingId } },
    select: {
      documentId: true,
      pageNumber: true,
      textSnippet: true,
      document: { select: { type: true, fileName: true } },
    },
  });

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      contract: {
        include: {
          fields: true,
          unit: { include: { project: { include: { developer: { include: { policy: true } } } } } },
        },
      },
    },
  });
  if (!listing) return [];

  // The verified record itself is part of the corpus, expressed as sentences the
  // retrieval step can match against. Nothing unverified is included.
  const facts: string[] = [];
  for (const f of listing.contract.fields) {
    if (!f.verifiedSource) continue;
    const label = FIELD_LABELS[f.key].en;
    const value =
      f.verifiedNum?.toString() ??
      f.verifiedDate?.toISOString().slice(0, 10) ??
      f.verifiedText ??
      "";
    facts.push(`${label}: EGP ${value} (verified from ${f.verifiedSource}).`);
  }
  if (listing.contract.assignmentConditionsNote) {
    facts.push(`Assignment clause: ${listing.contract.assignmentConditionsNote}`);
  }
  if (listing.contract.cancellationPenaltyNote) {
    facts.push(`Cancellation clause: ${listing.contract.cancellationPenaltyNote}`);
  }
  const policy = listing.contract.unit.project.developer.policy;
  if (policy) {
    facts.push(
      `Developer assignment policy: ${policy.conditionsEn ?? ""} Required documents: ${policy.requiredDocuments.join("; ")}. Typical NOC turnaround: ${policy.typicalNocDays ?? "unknown"} days.`,
    );
  }

  const corpus = pages
    .filter((p) => p.textSnippet)
    .map((p) => ({ documentId: p.documentId, page: p.pageNumber, text: p.textSnippet! }));

  const contractDoc = pages.find((p) => p.document.type === "SALE_CONTRACT");
  if (facts.length > 0) {
    corpus.push({
      documentId: contractDoc?.documentId ?? "verified-record",
      page: contractDoc?.pageNumber ?? 1,
      text: facts.join("\n"),
    });
  }
  return corpus;
}

export function rebuildScheduleFor(args: {
  totalPrice: string;
  downPayment: string;
  planStart: Date;
  frequency: Frequency;
  count: number;
  installmentAmount?: string;
}) {
  const rows = buildInstallmentSchedule({
    totalPrice: args.totalPrice,
    downPayment: args.downPayment,
    planStart: args.planStart,
    frequency: args.frequency,
    numberOfInstallments: args.count,
    installmentAmount: args.installmentAmount,
  });
  return { rows, remaining: remainingTotal(rows, new Date()) };
}
