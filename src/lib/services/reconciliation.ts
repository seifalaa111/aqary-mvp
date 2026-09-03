import "server-only";
import { Decimal } from "decimal.js";
import type { ContractFieldKey, Prisma, Severity, ValueSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { FIELD_LABELS } from "@/lib/domain/fields";
import { buildInstallmentSchedule, expectedPaidToDate, type Frequency } from "@/lib/domain/calculators";

/**
 * ReconciliationService — real calculation, never mocked.
 *
 * Cross-checks what the seller declared against the sum of verified receipts,
 * against the developer's account statement, and against the schedule rebuilt
 * from the contract's own terms. It does NOT pick a winner: where two present
 * sources disagree beyond tolerance it writes a `Discrepancy` with the evidence
 * and leaves the decision to an analyst.
 */

export interface ReconciliationSummary {
  declaredPaid: Decimal | null;
  receiptsPaid: Decimal;
  receiptCount: number;
  verifiedReceiptCount: number;
  developerStatedPaid: Decimal | null;
  scheduleExpectedPaid: Decimal | null;
  extractedPaid: Decimal | null;
  /** The largest gap between any two present sources for AMOUNT_PAID. */
  worstDelta: Decimal;
  worstDeltaPct: number;
  outstandingFromReceipts: Decimal | null;
  totalPrice: Decimal | null;
  receiptCoveragePct: number;
  openDiscrepancies: number;
  criticalDiscrepancies: number;
}

interface SourcePoint {
  source: ValueSource;
  value: Decimal;
  evidence: Prisma.InputJsonValue;
}

export async function reconcileListing(listingId: string): Promise<ReconciliationSummary> {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      contract: {
        include: {
          fields: true,
          receipts: { include: { document: { select: { id: true, fileName: true } } } },
          installments: true,
        },
      },
    },
  });

  const contract = listing.contract;
  const fields = contract.fields;
  const get = (k: ContractFieldKey) => fields.find((f) => f.key === k);

  // --- Source 1: what the seller declared -------------------------------
  const declaredPaid = num(get("AMOUNT_PAID")?.declaredNum);
  const declaredTotal = num(get("TOTAL_PRICE")?.declaredNum);

  // --- Source 2: what the AI read ---------------------------------------
  const extractedPaid = num(get("AMOUNT_PAID")?.extractedNum);

  // --- Source 3: the receipts -------------------------------------------
  // Only VERIFIED receipts count toward receipt-derived truth. Pending receipts
  // are evidence, not proof.
  const verifiedReceipts = contract.receipts.filter((r) => r.status === "VERIFIED");
  const receiptsPaid = verifiedReceipts.reduce(
    (acc, r) => acc.plus(money(r.verifiedAmount ?? r.extractedAmount ?? r.declaredAmount ?? 0)),
    money(0),
  );

  // --- Source 4: the developer's account statement -----------------------
  const developerStatedPaid = num(get("AMOUNT_PAID")?.developerStatedNum);

  // --- Source 5: the schedule rebuilt from the contract's own terms -------
  const scheduleExpectedPaid = rebuildExpectedPaid(fields);

  const totalPrice =
    num(get("TOTAL_PRICE")?.verifiedNum) ??
    num(get("TOTAL_PRICE")?.developerStatedNum) ??
    num(get("TOTAL_PRICE")?.extractedNum) ??
    declaredTotal;

  // Write the receipt-derived source onto the field record. This never touches
  // any other source's columns.
  const paidField = get("AMOUNT_PAID");
  if (paidField) {
    await prisma.contractField.update({
      where: { id: paidField.id },
      data: {
        receiptDerivedNum: receiptsPaid.toFixed(2),
        receiptDerivedNote: `Sum of ${verifiedReceipts.length} verified receipt(s) of ${contract.receipts.length} uploaded`,
      },
    });
  }

  const outstandingField = get("OUTSTANDING_BALANCE");
  const outstandingFromReceipts = totalPrice ? totalPrice.minus(receiptsPaid) : null;
  if (outstandingField && outstandingFromReceipts) {
    await prisma.contractField.update({
      where: { id: outstandingField.id },
      data: {
        receiptDerivedNum: outstandingFromReceipts.toFixed(2),
        receiptDerivedNote: "Total price less the sum of verified receipts",
      },
    });
  }

  // --- Build the comparison set for AMOUNT_PAID --------------------------
  const points: SourcePoint[] = [];
  if (declaredPaid) {
    points.push({
      source: "SELLER_DECLARED",
      value: declaredPaid,
      evidence: { origin: "Seller intake, step 3" },
    });
  }
  if (extractedPaid) {
    points.push({
      source: "AI_EXTRACTED",
      value: extractedPaid,
      evidence: {
        origin: "Document intelligence",
        confidence: get("AMOUNT_PAID")?.extractedConfidence ?? null,
        documentId: get("AMOUNT_PAID")?.extractedDocumentId ?? null,
        page: get("AMOUNT_PAID")?.extractedPage ?? null,
      },
    });
  }
  if (verifiedReceipts.length > 0) {
    points.push({
      source: "RECEIPT_VERIFIED",
      value: receiptsPaid,
      evidence: {
        origin: "Sum of verified receipts",
        receiptCount: verifiedReceipts.length,
        receipts: verifiedReceipts.slice(0, 40).map((r) => ({
          id: r.id,
          amount: (r.verifiedAmount ?? r.extractedAmount ?? r.declaredAmount ?? 0).toString(),
          date: (r.verifiedDate ?? r.extractedDate ?? r.declaredDate)?.toISOString() ?? null,
          document: r.document?.fileName ?? null,
        })),
      },
    });
  }
  if (developerStatedPaid) {
    points.push({
      source: "DEVELOPER_CONFIRMED",
      value: developerStatedPaid,
      evidence: {
        origin: "Developer account statement",
        documentId: get("AMOUNT_PAID")?.developerStatedDocumentId ?? null,
      },
    });
  }

  await raiseDiscrepancies(listingId, "AMOUNT_PAID", points);

  // --- Total price: declared vs extracted vs developer -------------------
  const pricePoints: SourcePoint[] = [];
  if (declaredTotal) pricePoints.push({ source: "SELLER_DECLARED", value: declaredTotal, evidence: {} });
  const extractedTotal = num(get("TOTAL_PRICE")?.extractedNum);
  if (extractedTotal) {
    pricePoints.push({
      source: "AI_EXTRACTED",
      value: extractedTotal,
      evidence: {
        confidence: get("TOTAL_PRICE")?.extractedConfidence ?? null,
        documentId: get("TOTAL_PRICE")?.extractedDocumentId ?? null,
        page: get("TOTAL_PRICE")?.extractedPage ?? null,
      },
    });
  }
  const devTotal = num(get("TOTAL_PRICE")?.developerStatedNum);
  if (devTotal) pricePoints.push({ source: "DEVELOPER_CONFIRMED", value: devTotal, evidence: {} });
  await raiseDiscrepancies(listingId, "TOTAL_PRICE", pricePoints);

  // --- Arithmetic impossibility: paid > total ----------------------------
  if (totalPrice && receiptsPaid.gt(totalPrice)) {
    await upsertFraudSignal(listingId, {
      type: "ARITHMETIC_IMPOSSIBILITY",
      severity: "CRITICAL",
      titleEn: "Receipts exceed the total contract price",
      titleAr: "مجموع الإيصالات يتجاوز إجمالي سعر التعاقد",
      description: `Verified receipts total EGP ${receiptsPaid.toFixed(0)} against a contract price of EGP ${totalPrice.toFixed(0)}.`,
      evidence: { receiptsPaid: receiptsPaid.toFixed(2), totalPrice: totalPrice.toFixed(2) },
    });
  }

  // --- Schedule sanity ---------------------------------------------------
  if (scheduleExpectedPaid && declaredPaid) {
    await raiseDiscrepancies(listingId, "AMOUNT_PAID", [
      { source: "SELLER_DECLARED", value: declaredPaid, evidence: {} },
      {
        source: "AI_EXTRACTED",
        value: scheduleExpectedPaid,
        evidence: { origin: "Schedule rebuilt from contract terms (due to date)" },
      },
    ], "SCHEDULE");
  }

  const deltas = allDeltas(points);
  const worst = deltas.length ? deltas.reduce((a, b) => (a.delta.gt(b.delta) ? a : b)) : null;

  const [openDiscrepancies, criticalDiscrepancies] = await Promise.all([
    prisma.discrepancy.count({ where: { listingId, status: "OPEN" } }),
    prisma.discrepancy.count({ where: { listingId, status: "OPEN", severity: "CRITICAL" } }),
  ]);

  return {
    declaredPaid,
    receiptsPaid,
    receiptCount: contract.receipts.length,
    verifiedReceiptCount: verifiedReceipts.length,
    developerStatedPaid,
    scheduleExpectedPaid,
    extractedPaid,
    worstDelta: worst?.delta ?? money(0),
    worstDeltaPct: worst?.pct ?? 0,
    outstandingFromReceipts,
    totalPrice,
    receiptCoveragePct:
      declaredPaid && declaredPaid.gt(0)
        ? Math.min(100, Math.round(receiptsPaid.div(declaredPaid).mul(100).toNumber()))
        : 0,
    openDiscrepancies,
    criticalDiscrepancies,
  };
}

// ---------------------------------------------------------------------------

function allDeltas(points: SourcePoint[]) {
  const out: { a: SourcePoint; b: SourcePoint; delta: Decimal; pct: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const delta = a.value.minus(b.value).abs();
      const larger = Decimal.max(a.value.abs(), b.value.abs());
      const pct = larger.isZero() ? 0 : delta.div(larger).mul(100).toNumber();
      out.push({ a, b, delta, pct });
    }
  }
  return out;
}

export function severityFor(deltaPct: number): Severity | null {
  const bpsDelta = deltaPct * 100;
  if (bpsDelta >= config.SEVERITY_CRITICAL_BPS) return "CRITICAL";
  if (bpsDelta >= config.SEVERITY_MAJOR_BPS) return "MAJOR";
  if (bpsDelta >= config.SEVERITY_MINOR_BPS) return "MINOR";
  return null;
}

async function raiseDiscrepancies(
  listingId: string,
  fieldKey: ContractFieldKey,
  points: SourcePoint[],
  tag = "PAIRWISE",
) {
  for (const { a, b, delta, pct } of allDeltas(points)) {
    const larger = Decimal.max(a.value.abs(), b.value.abs());
    const withinTolerance =
      delta.lte(money(config.RECONCILIATION_TOLERANCE_ABS)) ||
      delta.div(larger.isZero() ? 1 : larger).mul(10_000).lte(config.RECONCILIATION_TOLERANCE_BPS);

    const existing = await prisma.discrepancy.findFirst({
      where: { listingId, fieldKey, sourceA: a.source, sourceB: b.source, status: "OPEN" },
    });

    if (withinTolerance) {
      // Sources agree now — an open discrepancy for this pair is stale.
      if (existing) {
        await prisma.discrepancy.update({
          where: { id: existing.id },
          data: {
            status: "RESOLVED",
            resolution: "Sources came back into tolerance after new evidence",
            resolvedAt: new Date(),
          },
        });
      }
      continue;
    }

    const severity = severityFor(pct);
    if (!severity) continue;

    const label = FIELD_LABELS[fieldKey];
    const data = {
      listingId,
      fieldKey,
      sourceA: a.source,
      valueA: a.value.toFixed(2),
      sourceB: b.source,
      valueB: b.value.toFixed(2),
      delta: delta.toFixed(2),
      deltaPct: Math.round(pct * 100) / 100,
      severity,
      titleEn: `${label.en}: ${sourceName(a.source)} and ${sourceName(b.source)} disagree by EGP ${delta.toFixed(0)}`,
      titleAr: `${label.ar}: فرق ${delta.toFixed(0)} جنيه بين المصدرين`,
      evidence: { tag, a: a.evidence, b: b.evidence } as Prisma.InputJsonValue,
    };

    if (existing) {
      await prisma.discrepancy.update({ where: { id: existing.id }, data });
    } else {
      const created = await prisma.discrepancy.create({ data });
      await audit({
        action: "DISCREPANCY_CREATED",
        entityType: "Discrepancy",
        entityId: created.id,
        after: { fieldKey, severity, delta: delta.toFixed(2) },
        metadata: { listingId },
      });
    }
  }
}

function sourceName(s: ValueSource): string {
  return {
    SELLER_DECLARED: "the seller's declaration",
    AI_EXTRACTED: "the extracted contract",
    RECEIPT_VERIFIED: "the verified receipts",
    DEVELOPER_CONFIRMED: "the developer statement",
    ANALYST_OVERRIDE: "the analyst override",
  }[s];
}

function rebuildExpectedPaid(
  fields: { key: ContractFieldKey; declaredNum: unknown; declaredDate: Date | null; declaredText: string | null }[],
): Decimal | null {
  const get = (k: ContractFieldKey) => fields.find((f) => f.key === k);
  const total = num(get("TOTAL_PRICE")?.declaredNum);
  const down = num(get("DOWN_PAYMENT")?.declaredNum);
  const inst = num(get("INSTALLMENT_AMOUNT")?.declaredNum);
  const count = num(get("NUMBER_OF_INSTALLMENTS")?.declaredNum);
  const start = get("PLAN_START_DATE")?.declaredDate;
  const freq = get("INSTALLMENT_FREQUENCY")?.declaredText as Frequency | undefined;

  if (!total || !start || !freq || !count) return null;

  const rows = buildInstallmentSchedule({
    totalPrice: total,
    downPayment: down ?? 0,
    planStart: start,
    frequency: freq,
    numberOfInstallments: count.toNumber(),
    installmentAmount: inst ?? undefined,
  });
  return expectedPaidToDate(rows, new Date());
}

export async function upsertFraudSignal(
  listingId: string,
  input: {
    type: Parameters<typeof prisma.fraudSignal.create>[0]["data"]["type"];
    severity: Severity;
    titleEn: string;
    titleAr: string;
    description: string;
    evidence: Prisma.InputJsonValue;
  },
) {
  const existing = await prisma.fraudSignal.findFirst({
    where: { listingId, type: input.type, status: "OPEN" },
  });
  if (existing) {
    return prisma.fraudSignal.update({ where: { id: existing.id }, data: { ...input, listingId } });
  }
  const created = await prisma.fraudSignal.create({ data: { ...input, listingId } });
  await audit({
    action: "FRAUD_SIGNAL_RAISED",
    entityType: "FraudSignal",
    entityId: created.id,
    after: { type: input.type, severity: input.severity },
    metadata: { listingId },
  });
  return created;
}

function num(v: unknown): Decimal | null {
  if (v === null || v === undefined) return null;
  const d = new Decimal(String(v));
  return d.isNaN() ? null : d;
}
