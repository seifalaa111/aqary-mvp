import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type {
  ContractFieldKey,
  DocumentType,
  MediaKind,
  PaymentFrequency,
  PrismaClient,
  RoomTag,
  UnitType,
} from "@prisma/client";
import sharp from "sharp";
import { storage } from "../../src/lib/providers/storage.js";
import { FIELD_KINDS } from "../../src/lib/domain/fields.js";
import { buildInstallmentSchedule, MONTHS_PER_PERIOD } from "../../src/lib/domain/calculators.js";
import { floorPlanSvg, masterPlanSvg, renderSvgToWebp } from "../../src/lib/assets/plans.js";
import {
  renderContract,
  renderReceipt,
  renderStatement,
  svgToWebp,
  type PlacedValue,
} from "../../src/lib/docgen/pages.js";
import { pickPhotos, CATALOGUE, type PhotoCategory } from "../../src/lib/assets/catalogue.js";
import { UNIT_ARCHETYPES, type ProjectSeed, type UnitArchetype } from "./data.js";

const PUBLIC_MEDIA = path.resolve(process.cwd(), "public/media");

export type Scenario =
  | "CLEAN_PUBLISHED"
  | "PUBLISHED_WITH_OFFERS"
  | "PUBLISHED_UNDER_NEGOTIATION"
  | "RESERVED_ACTIVE_DEAL"
  | "COMPLETED_DEAL"
  | "QUEUE_CLEAN"
  | "QUEUE_RECEIPT_MISMATCH"
  | "QUEUE_SUSPICIOUS_RECEIPT"
  | "QUEUE_INCOMPLETE_DOCS"
  | "INFO_REQUESTED"
  | "REJECTED"
  | "DRAFT_MID_WIZARD";

export interface ListingPlan {
  index: number;
  scenario: Scenario;
  project: ProjectSeed;
  developer: { id: string; nameEn: string; nameAr: string; assignmentFeePct: number; minMonths: number };
  projectId: string;
  archetype: UnitArchetype;
  sellerId: string;
  sellerNameAr: string;
  sellerNameEn: string;
  sellerNationalId: string;
  signingDate: Date;
  frequency: PaymentFrequency;
  installmentsCount: number;
  downPaymentPct: number;
  cancellationPenaltyPct: number;
  flexibilityPct: number;
  urgency: "IMMEDIATE" | "ONE_TO_THREE_MONTHS" | "FLEXIBLE";
  exitReason: string;
  rng: () => number;
}

export interface BuiltListing {
  listingId: string;
  contractId: string;
  unitId: string;
  scenario: Scenario;
  askingCash: Decimal;
  declaredPaid: Decimal;
  receiptsPaid: Decimal;
  totalPrice: Decimal;
}

/** Developer price per m² for a given year, from the project's benchmark series. */
export function pricePerSqm(project: ProjectSeed, year: number): number {
  const years = year - 2021;
  return Math.round(project.basePricePerSqm2021 * Math.pow(1 + project.annualGrowth, years));
}

export function pickArchetype(rng: () => number): UnitArchetype {
  const total = UNIT_ARCHETYPES.reduce((a, u) => a + u.weight, 0);
  let r = rng() * total;
  for (const u of UNIT_ARCHETYPES) {
    r -= u.weight;
    if (r <= 0) return u;
  }
  return UNIT_ARCHETYPES[0]!;
}

const UNIT_TYPE_AR: Record<UnitType, string> = {
  APARTMENT: "شقة", DUPLEX: "دوبلكس", PENTHOUSE: "بنتهاوس", STUDIO: "استوديو",
  TOWNHOUSE: "تاون هاوس", TWIN_HOUSE: "توين هاوس", STANDALONE_VILLA: "فيلا مستقلة",
  CHALET: "شاليه", OFFICE: "مكتب", CLINIC: "عيادة", RETAIL: "محل تجاري", LAND: "أرض",
};

// ---------------------------------------------------------------------------

export async function buildListing(
  prisma: PrismaClient,
  plan: ListingPlan,
): Promise<BuiltListing> {
  const { rng, archetype, project } = plan;
  const now = new Date();

  // ---- Unit --------------------------------------------------------------
  const unitCode = `${project.slug.slice(0, 3).toUpperCase()}-${String(plan.index + 1).padStart(2, "0")}${String(
    Math.floor(rng() * 900) + 100,
  )}`;
  const deliveryYear = plan.signingDate.getUTCFullYear() + 4 + Math.floor(rng() * 3);
  const deliveryDate = new Date(Date.UTC(deliveryYear, [2, 5, 8, 11][Math.floor(rng() * 4)]!, 30));
  const delivered = deliveryDate < now;

  const unit = await prisma.unit.create({
    data: {
      projectId: plan.projectId,
      unitCode,
      phase: String.fromCharCode(65 + Math.floor(rng() * 6)),
      unitType: archetype.unitType,
      buaSqm: archetype.bua.toFixed(2),
      gardenSqm: archetype.garden ? archetype.garden.toFixed(2) : null,
      roofSqm: archetype.roof ? archetype.roof.toFixed(2) : null,
      terraceSqm: archetype.terrace ? archetype.terrace.toFixed(2) : null,
      floor: archetype.floor,
      bedrooms: archetype.bedrooms,
      bathrooms: archetype.bathrooms,
      view: archetype.view,
      finishing: ["SEMI_FINISHED", "FULLY_FINISHED", "CORE_AND_SHELL", "FINISHED_WITH_AC"][
        Math.floor(rng() * 4)
      ] as never,
      contractualDeliveryDate: deliveryDate,
      deliveryStatus: delivered ? "DELIVERED" : rng() < 0.12 ? "DELAYED" : "NOT_DELIVERED",
      currentDeveloperPrice: new Decimal(pricePerSqm(project, 2026))
        .mul(archetype.bua)
        .plus(new Decimal(pricePerSqm(project, 2026)).mul(0.35).mul(outdoorArea(archetype)))
        .toDecimalPlaces(0)
        .toFixed(2),
    },
  });

  // ---- Contract economics -------------------------------------------------
  const signingYear = plan.signingDate.getUTCFullYear();
  const rate = pricePerSqm(project, signingYear);
  const totalPrice = new Decimal(rate)
    .mul(archetype.bua)
    .plus(new Decimal(rate).mul(0.35).mul(outdoorArea(archetype)))
    .div(1000).round().mul(1000);

  const downPayment = totalPrice.mul(plan.downPaymentPct).div(100).div(1000).round().mul(1000);
  const maintenanceDeposit = totalPrice.mul(0.08).div(1000).round().mul(1000);
  const clubFee = totalPrice.mul(0.015).div(1000).round().mul(1000);
  const planStart = addMonths(plan.signingDate, 3);
  const installmentAmount = totalPrice
    .minus(downPayment)
    .div(plan.installmentsCount)
    .div(100).round().mul(100);

  const schedule = buildInstallmentSchedule({
    totalPrice,
    downPayment,
    planStart,
    frequency: plan.frequency as never,
    numberOfInstallments: plan.installmentsCount,
    installmentAmount,
    contractSigningDate: plan.signingDate,
  });

  const paidRows = schedule.filter((r) => r.dueDate <= now);
  const truePaid = paidRows.reduce((a, r) => a.plus(r.amount), new Decimal(0));
  const nextRow = schedule.find((r) => r.dueDate > now);

  // The seller's declared figure — usually right, sometimes rounded up, and in
  // the mismatch scenario materially overstated.
  const declaredPaid =
    plan.scenario === "QUEUE_RECEIPT_MISMATCH"
      ? truePaid.mul(1.16).div(1000).round().mul(1000)
      : rng() < 0.25
        ? truePaid.mul(1 + rng() * 0.012).div(1000).round().mul(1000)
        : truePaid.div(100).round().mul(100);

  const contract = await prisma.contract.create({
    data: {
      unitId: unit.id,
      sellerId: plan.sellerId,
      contractNumber: `${plan.developer.nameEn.split(" ")[0]!.toUpperCase().slice(0, 3)}-${project.slug
        .slice(0, 3)
        .toUpperCase()}-${signingYear}-${String(100000 + Math.floor(rng() * 899999))}`,
      assignmentPermitted: "UNKNOWN",
      hasArrears: rng() < 0.15,
      arrearsAmount: rng() < 0.15 ? installmentAmount.mul(1).toFixed(2) : null,
      hasBankFinance: false,
    },
  });

  const reference = `AQ-${String(1000 + plan.index)}`;
  const listing = await prisma.listing.create({
    data: {
      reference,
      contractId: contract.id,
      sellerId: plan.sellerId,
      status: "DRAFT",
      askingCash: declaredPaid.toFixed(2),
      flexibilityPct: plan.flexibilityPct,
      urgency: plan.urgency as never,
      exitReason: plan.exitReason as never,
      isDemo: true,
      wizardStep: plan.scenario === "DRAFT_MID_WIZARD" ? 3 : 6,
      wizardCompleted: plan.scenario === "DRAFT_MID_WIZARD" ? [1, 2] : [1, 2, 3, 4, 5],
      createdAt: daysAgo(rng, 4, 70),
    },
  });

  // ---- Declared contract fields (§2.2 source 1) ---------------------------
  const declared: { key: ContractFieldKey; num?: Decimal; date?: Date; text?: string }[] = [
    { key: "TOTAL_PRICE", num: totalPrice },
    { key: "DOWN_PAYMENT", num: downPayment },
    { key: "AMOUNT_PAID", num: declaredPaid },
    { key: "OUTSTANDING_BALANCE", num: totalPrice.minus(declaredPaid) },
    { key: "INSTALLMENT_AMOUNT", num: installmentAmount },
    { key: "INSTALLMENT_FREQUENCY", text: plan.frequency },
    { key: "NUMBER_OF_INSTALLMENTS", num: new Decimal(plan.installmentsCount) },
    { key: "MAINTENANCE_DEPOSIT", num: maintenanceDeposit },
    { key: "CLUB_FEE", num: clubFee },
    { key: "CANCELLATION_PENALTY_PCT", num: new Decimal(plan.cancellationPenaltyPct) },
    { key: "CONTRACT_SIGNING_DATE", date: plan.signingDate },
    { key: "PLAN_START_DATE", date: planStart },
    { key: "NEXT_DUE_DATE", date: nextRow?.dueDate ?? deliveryDate },
    { key: "DELIVERY_DATE", date: deliveryDate },
  ];

  await prisma.contractField.createMany({
    data: declared.map((d) => ({
      contractId: contract.id,
      key: d.key,
      kind: FIELD_KINDS[d.key],
      declaredNum: d.num ? d.num.toFixed(2) : null,
      declaredDate: d.date ?? null,
      declaredText: d.text ?? null,
    })),
  });

  // The seller's own understanding of the schedule.
  await prisma.installment.createMany({
    data: schedule.map((r) => ({
      contractId: contract.id,
      sequence: r.sequence,
      kind: r.kind,
      dueDate: r.dueDate,
      amount: r.amount.toFixed(2),
      status: r.dueDate <= now ? ("PAID" as const) : ("UPCOMING" as const),
      runningBalance: r.runningBalance.toFixed(2),
      source: "SELLER_DECLARED" as const,
      label: r.label ?? null,
    })),
  });

  // ---- Documents ----------------------------------------------------------
  const incomplete = plan.scenario === "QUEUE_INCOMPLETE_DOCS";
  const isDraft = plan.scenario === "DRAFT_MID_WIZARD";

  const contractDoc = renderContract({
    developerNameAr: plan.developer.nameAr,
    developerNameEn: plan.developer.nameEn,
    projectNameAr: project.nameAr,
    projectNameEn: project.nameEn,
    unitCode,
    phase: unit.phase,
    buyerNameAr: plan.sellerNameAr,
    buyerNationalId: plan.sellerNationalId,
    contractNumber: contract.contractNumber!,
    signingDate: plan.signingDate,
    unitTypeAr: UNIT_TYPE_AR[archetype.unitType],
    buaSqm: archetype.bua,
    gardenSqm: archetype.garden,
    floor: archetype.floor,
    bedrooms: archetype.bedrooms,
    totalPrice: totalPrice.toFixed(0),
    downPayment: downPayment.toFixed(0),
    installmentAmount: installmentAmount.toFixed(0),
    installmentsCount: plan.installmentsCount,
    frequency: plan.frequency as never,
    planStart,
    deliveryDate,
    maintenanceDeposit: maintenanceDeposit.toFixed(0),
    clubFee: clubFee.toFixed(0),
    assignmentFeePct: plan.developer.assignmentFeePct,
    cancellationPenaltyPct: plan.cancellationPenaltyPct,
    minMonthsBeforeAssignment: plan.developer.minMonths,
    schedule: schedule.map((r) => ({
      seq: r.sequence,
      dueDate: r.dueDate,
      amount: r.amount.toFixed(0),
      balance: r.runningBalance.toFixed(0),
      label: r.label ?? undefined,
    })),
  });

  if (!isDraft) {
    await storeMultiPageDocument(prisma, {
      listingId: listing.id,
      ownerId: plan.sellerId,
      type: "SALE_CONTRACT",
      fileName: `${contract.contractNumber}.pdf`,
      pages: contractDoc.pages,
      truth: {
        fields: contractDoc.placed
          .filter((p) => p.key !== "ASSIGNMENT_FEE_PCT")
          .map(toTruthField),
        clauses: contractDoc.clauses.map((c) => ({ kind: c.kind, text: c.text, page: c.page })),
        quirks:
          plan.scenario === "QUEUE_RECEIPT_MISMATCH"
            ? { lowConfidenceKeys: ["AMOUNT_PAID" as ContractFieldKey] }
            : rng() < 0.3
              ? { lowConfidenceKeys: ["INSTALLMENT_AMOUNT" as ContractFieldKey] }
              : undefined,
      },
    });
  }

  // ---- Receipts -----------------------------------------------------------
  // Receipts are the evidence trail. In the mismatch scenario the seller is
  // simply missing some of them, which is what the reconciliation surfaces.
  const receiptRows = paidRows.filter((r) => r.kind !== "MAINTENANCE" && r.kind !== "CLUB");
  const missing = plan.scenario === "QUEUE_RECEIPT_MISMATCH" ? Math.ceil(receiptRows.length * 0.22) : 0;
  const uploadable = isDraft ? [] : receiptRows.slice(0, receiptRows.length - missing);

  let receiptsPaid = new Decimal(0);
  let duplicateSourceBuffer: Buffer | null = null;
  let duplicateSourceSvg: string | null = null;

  for (const [i, row] of uploadable.entries()) {
    const receiptNumber = `RC-${signingYear}-${String(10000 + plan.index * 97 + i)}`;
    const method = (["BANK_TRANSFER", "CASH", "CHEQUE"] as const)[Math.floor(rng() * 3)]!;
    const rendered = renderReceipt({
      developerNameAr: plan.developer.nameAr,
      projectNameAr: project.nameAr,
      unitCode,
      buyerNameAr: plan.sellerNameAr,
      receiptNumber,
      amount: row.amount.toFixed(0),
      date: row.dueDate,
      method,
      reference: method === "BANK_TRANSFER" ? `NBE-${Math.floor(rng() * 900000) + 100000}` : null,
      installmentLabel: row.kind === "DOWN_PAYMENT" ? "الدفعة المقدمة" : `القسط رقم ${row.sequence}`,
      photographed: rng() < 0.55,
    });

    let buf = await svgToWebp(rendered.svg, 900, 82);

    // The suspicious-receipt scenario: one receipt is the same file re-uploaded
    // under a different receipt number, which the fraud scan detects by hash.
    const isDuplicate = plan.scenario === "QUEUE_SUSPICIOUS_RECEIPT" && i === uploadable.length - 1;
    if (plan.scenario === "QUEUE_SUSPICIOUS_RECEIPT" && i === 1) {
      duplicateSourceBuffer = buf;
      duplicateSourceSvg = rendered.svg;
    }
    if (isDuplicate && duplicateSourceBuffer) buf = duplicateSourceBuffer;

    const doc = await storeSinglePageDocument(prisma, {
      listingId: listing.id,
      ownerId: plan.sellerId,
      type: "PAYMENT_RECEIPT",
      fileName: `${receiptNumber}.jpg`,
      buffer: buf,
      // The duplicate re-uses an earlier receipt's bytes, so its page must carry
      // that receipt's text, not this one's — otherwise the snippet would
      // describe an image the page does not actually show.
      svg: isDuplicate && duplicateSourceSvg ? duplicateSourceSvg : rendered.svg,
      // A receipt photographed on a phone that has been through an editor is a
      // signal, not a verdict — the analyst dispositions it.
      softwareTag:
        plan.scenario === "QUEUE_SUSPICIOUS_RECEIPT" && i === uploadable.length - 2
          ? "Adobe Photoshop 25.0 (Windows)"
          : null,
      hasExif: !(plan.scenario === "QUEUE_SUSPICIOUS_RECEIPT" && i === uploadable.length - 2),
      truth: { fields: [], receipts: [{ amount: row.amount.toFixed(2), date: row.dueDate.toISOString(), method, reference: null, page: 1 }] },
    });

    await prisma.receipt.create({
      data: {
        contractId: contract.id,
        documentId: doc.id,
        declaredAmount: row.amount.toFixed(2),
        declaredDate: row.dueDate,
        method,
        reference: null,
        status: "PENDING",
        sha256: doc.sha256,
        perceptualHash: doc.phash,
      },
    });
    if (!isDuplicate) receiptsPaid = receiptsPaid.plus(row.amount);
  }

  // ---- Developer account statement ---------------------------------------
  // The single highest-value verification document. Withheld in the incomplete
  // and mismatch scenarios so the analyst has to work without it.
  // Not every seller has a recent developer statement to hand — which is exactly
  // why the verification score treats it as the highest-value document.
  const hasStatement =
    !isDraft &&
    !incomplete &&
    plan.scenario !== "QUEUE_RECEIPT_MISMATCH" &&
    plan.index % 3 !== 1;
  if (hasStatement) {
    const statement = renderStatement({
      developerNameAr: plan.developer.nameAr,
      developerNameEn: plan.developer.nameEn,
      projectNameAr: project.nameAr,
      unitCode,
      buyerNameAr: plan.sellerNameAr,
      contractNumber: contract.contractNumber!,
      issuedAt: daysAgo(rng, 3, 25),
      totalPrice: totalPrice.toFixed(0),
      amountPaid: truePaid.toFixed(0),
      outstanding: totalPrice.minus(truePaid).toFixed(0),
      nextDueDate: nextRow?.dueDate ?? deliveryDate,
      nextDueAmount: (nextRow?.amount ?? installmentAmount).toFixed(0),
      rows: paidRows.slice(-20).map((r) => ({
        date: r.dueDate,
        description: r.kind === "DOWN_PAYMENT" ? "دفعة مقدمة" : `قسط رقم ${r.sequence}`,
        credit: r.amount.toFixed(0),
        balance: r.runningBalance.toFixed(0),
      })),
    });
    await storeSinglePageDocument(prisma, {
      listingId: listing.id,
      ownerId: plan.sellerId,
      type: "DEVELOPER_ACCOUNT_STATEMENT",
      fileName: `account-statement-${unitCode}.pdf`,
      buffer: await svgToWebp(statement.svg, 1240, 84),
      svg: statement.svg,
      truth: { fields: statement.placed.map(toTruthField) },
    });
  }

  // ---- Identity documents -------------------------------------------------
  if (!isDraft && !incomplete) {
    for (const type of ["NATIONAL_ID_FRONT", "NATIONAL_ID_BACK"] as DocumentType[]) {
      const idCard = idCardSvg(plan, type === "NATIONAL_ID_FRONT");
      await storeSinglePageDocument(prisma, {
        listingId: listing.id,
        ownerId: plan.sellerId,
        type,
        fileName: `${type.toLowerCase()}.jpg`,
        buffer: await svgToWebp(idCard, 900, 80),
        // An identity card is a SENSITIVE_TYPE: its text is deliberately not
        // recorded, so it can never reach the assistant's retrieval corpus.
        svg: null,
        note: plan.sellerNameAr,
        truth: { fields: [] },
      });
    }
  }

  // ---- Media --------------------------------------------------------------
  await attachMedia(prisma, {
    listingId: listing.id,
    unitId: unit.id,
    seed: plan.index * 7919 + 13,
    archetype,
    project,
    developerName: plan.developer.nameEn,
    unitCode,
    delivered,
    isDraft,
    incomplete,
    locale: "en",
  });

  return {
    listingId: listing.id,
    contractId: contract.id,
    unitId: unit.id,
    scenario: plan.scenario,
    askingCash: declaredPaid,
    declaredPaid,
    receiptsPaid,
    totalPrice,
  };
}

function outdoorArea(a: UnitArchetype): number {
  return (a.garden ?? 0) + (a.roof ?? 0) + (a.terrace ?? 0);
}

function toTruthField(p: PlacedValue) {
  return {
    key: p.key as ContractFieldKey,
    num: p.num,
    date: p.date,
    text: p.text,
    page: p.page,
    bbox: p.bbox,
    clauseText: p.clauseText,
  };
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

interface TruthSidecar {
  fields: ReturnType<typeof toTruthField>[];
  receipts?: { amount: string; date: string; method: string; reference: string | null; page: number }[];
  clauses?: { kind: "ASSIGNMENT" | "CANCELLATION" | "DELIVERY"; text: string; page: number }[];
  quirks?: { lowConfidenceKeys?: ContractFieldKey[]; misreadKey?: ContractFieldKey; misreadFactor?: number };
}

/**
 * The text actually drawn on a rendered page.
 *
 * These documents are SVG rendered to WebP, so the page's words are already in
 * hand — pulling them out is transcription, not invention. It matters because
 * `DocumentPage.textSnippet` is what the assistant retrieves against: with it
 * null, the corpus is empty and the assistant can cite no page of any seeded
 * file, which made a real retrieval pipeline look like a stub.
 */
function svgPageText(svg: string): string | null {
  const parts: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const inner = m[1]!
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (inner) parts.push(inner);
  }
  if (parts.length === 0) return null;
  return parts.join("\n").slice(0, 4000);
}

async function storeMultiPageDocument(
  prisma: PrismaClient,
  args: {
    listingId: string;
    ownerId: string;
    type: DocumentType;
    fileName: string;
    pages: string[];
    truth: TruthSidecar;
  },
) {
  const rendered = await Promise.all(args.pages.map((svg) => svgToWebp(svg, 1240, 82)));
  const combined = Buffer.concat(rendered);
  const sha256 = createHash("sha256").update(combined).digest("hex");
  const storageKey = `listings/${args.listingId}/documents/${sha256.slice(0, 12)}/${args.fileName}`;

  await storage().put(`${storageKey}`, rendered[0]!, "image/webp");
  await storage().put(
    `${storageKey}.truth.json`,
    Buffer.from(JSON.stringify(args.truth), "utf8"),
    "application/json",
  );

  const doc = await prisma.document.create({
    data: {
      ownerId: args.ownerId,
      listingId: args.listingId,
      type: args.type,
      fileName: args.fileName,
      storageKey,
      mimeType: "image/webp",
      sizeBytes: combined.byteLength,
      sha256,
      perceptualHash: await perceptualHash(rendered[0]!),
      pageCount: rendered.length,
      status: "UPLOADED",
      exifStripped: true,
      hasExif: false,
    },
  });

  for (const [i, buf] of rendered.entries()) {
    const pageKey = `${storageKey}.page-${i + 1}.webp`;
    await storage().put(pageKey, buf, "image/webp");
    const meta = await sharp(buf).metadata();
    await prisma.documentPage.create({
      data: {
        documentId: doc.id,
        pageNumber: i + 1,
        imageKey: pageKey,
        width: meta.width ?? 1240,
        height: meta.height ?? 1754,
        textSnippet: svgPageText(args.pages[i]!),
      },
    });
  }

  return doc;
}

async function storeSinglePageDocument(
  prisma: PrismaClient,
  args: {
    listingId: string;
    ownerId: string;
    type: DocumentType;
    fileName: string;
    buffer: Buffer;
    /** Source markup, when the page was rendered from SVG — used for the text snippet. */
    svg?: string | null;
    truth: TruthSidecar;
    softwareTag?: string | null;
    hasExif?: boolean;
    note?: string;
  },
) {
  const sha256 = createHash("sha256").update(args.buffer).digest("hex");
  const storageKey = `listings/${args.listingId}/documents/${sha256.slice(0, 12)}/${args.fileName}`;

  await storage().put(storageKey, args.buffer, "image/webp");
  await storage().put(
    `${storageKey}.truth.json`,
    Buffer.from(JSON.stringify(args.truth), "utf8"),
    "application/json",
  );
  const pageKey = `${storageKey}.page-1.webp`;
  await storage().put(pageKey, args.buffer, "image/webp");

  const meta = await sharp(args.buffer).metadata();
  const phash = await perceptualHash(args.buffer);

  const doc = await prisma.document.create({
    data: {
      ownerId: args.ownerId,
      listingId: args.listingId,
      type: args.type,
      fileName: args.fileName,
      storageKey,
      mimeType: "image/webp",
      sizeBytes: args.buffer.byteLength,
      sha256,
      perceptualHash: phash,
      pageCount: 1,
      status: "UPLOADED",
      softwareTag: args.softwareTag ?? null,
      // Aqary strips EXIF on upload for privacy, so "no EXIF" is normal here.
      // The suspicious-receipt scenario passes hasExif:false explicitly to
      // simulate a file that arrived with its metadata already missing.
      hasExif: args.hasExif ?? true,
      exifStripped: args.hasExif !== false,
      note: args.note ?? null,
      pages: {
        create: {
          pageNumber: 1,
          imageKey: pageKey,
          width: meta.width ?? 900,
          height: meta.height ?? 1180,
          textSnippet: args.svg ? svgPageText(args.svg) : null,
        },
      },
    },
  });

  return { id: doc.id, sha256, phash };
}

/**
 * 64-bit difference hash, hex-encoded. Real perceptual hashing, no library.
 * dHash compares each pixel with its right-hand neighbour, which separates
 * documents that share a template far better than an average hash does.
 */
export async function perceptualHash(buf: Buffer): Promise<string> {
  // 17x16 sample -> 256 bits. A 64-bit hash cannot separate two receipts that
  // share a template and differ only in the printed amount and date.
  const w = 17;
  const h = 16;
  const raw = await sharp(buf).greyscale().resize(w, h, { fit: "fill" }).raw().toBuffer();
  const bits: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits.push(raw[y * w + x]! > raw[y * w + x + 1]! ? 1 : 0);
    }
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!).toString(16);
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const ROOM_TAG_FOR: Record<PhotoCategory, RoomTag> = {
  COMPOUND_EXTERIOR: "COMPOUND",
  BUILDING_FACADE: "EXTERIOR",
  ENTRANCE: "ENTRANCE",
  LIVING: "LIVING",
  BEDROOM: "BEDROOM",
  KITCHEN: "KITCHEN",
  BATHROOM: "BATHROOM",
  BALCONY: "BALCONY",
  AMENITY: "AMENITY",
};

/** Interiors of a unit that has not been handed over are show-unit photography. */
const INTERIOR: PhotoCategory[] = ["LIVING", "BEDROOM", "KITCHEN", "BATHROOM", "ENTRANCE", "BALCONY"];

async function attachMedia(
  prisma: PrismaClient,
  args: {
    listingId: string;
    unitId: string;
    seed: number;
    archetype: UnitArchetype;
    project: ProjectSeed;
    developerName: string;
    unitCode: string;
    delivered: boolean;
    isDraft: boolean;
    incomplete: boolean;
    locale: "en" | "ar";
  },
) {
  const available = new Set(
    (await fs.readdir(path.resolve(process.cwd(), "public/property")).catch(() => []))
      .filter((f) => f.endsWith("-card.webp"))
      .map((f) => f.replace("-card.webp", "")),
  );

  // Both galleries are real photographs. The difference is what they are OF:
  // a delivered unit is photographed directly; an off-plan unit shows the
  // project itself plus the developer's show unit, and every interior on an
  // off-plan listing is stored as SHOW_UNIT so it can never read as a
  // photograph of a unit that does not exist yet.
  const plan: { category: PhotoCategory; count: number }[] = args.delivered
    ? [
        { category: "BUILDING_FACADE", count: 1 },
        { category: "LIVING", count: 3 },
        { category: "KITCHEN", count: 1 },
        { category: "BEDROOM", count: 1 },
        { category: "BATHROOM", count: 1 },
        { category: "ENTRANCE", count: 1 },
        { category: "COMPOUND_EXTERIOR", count: 1 },
        { category: "AMENITY", count: 1 },
      ]
    : [
        { category: "COMPOUND_EXTERIOR", count: 3 },
        { category: "LIVING", count: 2 },
        { category: "KITCHEN", count: 1 },
        { category: "BEDROOM", count: 1 },
        { category: "BUILDING_FACADE", count: 1 },
        { category: "AMENITY", count: 1 },
      ];

  const picked = pickPhotos(args.seed, plan).filter((p) => available.has(p.id));
  const limit = args.isDraft ? 2 : args.incomplete ? 3 : picked.length;

  let order = 0;
  for (const photo of picked.slice(0, limit)) {
    const isInteriorOfUndelivered = !args.delivered && INTERIOR.includes(photo.category);
    const kind: MediaKind = isInteriorOfUndelivered ? "SHOW_UNIT" : "PHOTO";
    const meta = await readPhotoMeta(photo.id);
    const caption = isInteriorOfUndelivered
      ? "Developer show unit — this unit is not yet delivered"
      : args.delivered
        ? null
        : "Project photography — this unit is not yet delivered";
    await prisma.mediaAsset.create({
      data: {
        listingId: args.listingId,
        kind,
        roomTag: ROOM_TAG_FOR[photo.category],
        altEn: photo.altEn,
        altAr: photo.altAr,
        caption,
        order: order++,
        isCover: order === 1,
        storageKey: `property/${photo.id}`,
        variants: {
          thumb: `/property/${photo.id}-thumb.webp`,
          card: `/property/${photo.id}-card.webp`,
          cardJpeg: `/property/${photo.id}-card.jpg`,
          detail: `/property/${photo.id}-detail.webp`,
        },
        blurhash: meta.lqip,
        dominantColor: meta.dominantColor,
        width: meta.width,
        height: meta.height,
        moderationStatus: args.isDraft || args.incomplete ? "PENDING" : "APPROVED",
        attribution: {
          source: "Unsplash",
          licence: "Unsplash Licence",
          url: `https://unsplash.com/photos/${photo.id}`,
          note: "Real architectural photography from Unsplash. Not a photograph of this specific unit — see ASSETS.md.",
        },
      },
    });
  }

  // Floor plan and master plan — generated from this unit's own record.
  await fs.mkdir(path.join(PUBLIC_MEDIA, "plans"), { recursive: true });

  const floorSvg = floorPlanSvg({
    unitCode: args.unitCode,
    projectName: args.project.nameEn,
    unitType: args.archetype.unitType,
    buaSqm: args.archetype.bua,
    gardenSqm: args.archetype.garden,
    terraceSqm: args.archetype.terrace,
    bedrooms: args.archetype.bedrooms,
    bathrooms: args.archetype.bathrooms,
    floor: args.archetype.floor,
    locale: args.locale,
  });
  const masterSvg = masterPlanSvg({
    projectName: args.project.nameEn,
    developerName: args.developerName,
    city: args.project.city,
    unitCode: args.unitCode,
    seed: args.seed,
    locale: args.locale,
  });

  for (const [kind, svg, w, h] of [
    ["FLOOR_PLAN", floorSvg, 1400, 1000],
    ["MASTER_PLAN", masterSvg, 1400, 980],
  ] as const) {
    const slug = `${args.listingId}-${kind.toLowerCase()}`;
    for (const [suffix, width] of [["thumb", 320], ["card", 800], ["detail", 1600]] as const) {
      const buf = await renderSvgToWebp(svg, width, suffix === "thumb" ? 70 : 86);
      await fs.writeFile(path.join(PUBLIC_MEDIA, "plans", `${slug}-${suffix}.webp`), buf);
    }
    await prisma.mediaAsset.create({
      data: {
        listingId: args.listingId,
        kind,
        roomTag: "PLAN",
        altEn:
          kind === "FLOOR_PLAN"
            ? `Floor plan of unit ${args.unitCode}, ${args.archetype.bedrooms} bedrooms, ${args.archetype.bua} m² built-up area`
            : `Master plan of ${args.project.nameEn} with unit ${args.unitCode} located`,
        altAr:
          kind === "FLOOR_PLAN"
            ? `مخطط الوحدة ${args.unitCode} — ${args.archetype.bedrooms} غرف، ${args.archetype.bua} م²`
            : `المخطط العام لمشروع ${args.project.nameAr} وموقع الوحدة ${args.unitCode}`,
        order: 100,
        isCover: false,
        storageKey: `media/plans/${slug}`,
        variants: {
          thumb: `/media/plans/${slug}-thumb.webp`,
          card: `/media/plans/${slug}-card.webp`,
          cardJpeg: `/media/plans/${slug}-card.webp`,
          detail: `/media/plans/${slug}-detail.webp`,
        },
        dominantColor: "#F1EDE6",
        width: w,
        height: h,
        moderationStatus: args.isDraft ? "PENDING" : "APPROVED",
        attribution: {
          source: "Generated by Aqary from the unit record",
          note: "Schematic drawing derived from this unit's own attributes — not an architectural drawing of record.",
        },
      },
    });
  }
}

const photoMetaCache = new Map<string, { width: number; height: number; dominantColor: string; lqip: string }>();

async function readPhotoMeta(id: string) {
  const cached = photoMetaCache.get(id);
  if (cached) return cached;
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), "public/property", `${id}.json`), "utf8");
    const parsed = JSON.parse(raw);
    photoMetaCache.set(id, parsed);
    return parsed as { width: number; height: number; dominantColor: string; lqip: string };
  } catch {
    const fallback = { width: 1600, height: 1067, dominantColor: "#E8E3DA", lqip: "" };
    photoMetaCache.set(id, fallback);
    return fallback;
  }
}

// ---------------------------------------------------------------------------

function idCardSvg(plan: ListingPlan, front: boolean): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="566" viewBox="0 0 900 566">
    <rect width="100%" height="100%" fill="#D9DFE6" />
    <rect x="24" y="24" width="852" height="518" rx="14" fill="#EEF2F6" stroke="#9FB0C0" stroke-width="2" />
    <rect x="24" y="24" width="852" height="86" rx="14" fill="#C3D2DF" />
    <text x="852" y="80" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="30" fill="#1F3346">جمهورية مصر العربية</text>
    <text x="60" y="80" font-family="Consolas, monospace" font-size="15" fill="#3E556B">ARAB REPUBLIC OF EGYPT — NATIONAL ID (SPECIMEN)</text>
    ${
      front
        ? `<rect x="60" y="150" width="180" height="220" rx="6" fill="#C9D3DC" stroke="#9FB0C0" />
           <text x="150" y="270" text-anchor="middle" font-family="Consolas, monospace" font-size="16" fill="#7C8EA0">PHOTO</text>
           <text x="852" y="190" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="30" fill="#16232E">${esc(plan.sellerNameAr)}</text>
           <text x="852" y="250" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="20" fill="#42556A">الرقم القومي</text>
           <text x="852" y="300" text-anchor="end" font-family="Consolas, monospace" font-size="34" fill="#16232E" letter-spacing="4">${plan.sellerNationalId}</text>`
        : `<text x="852" y="190" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="22" fill="#42556A">الوظيفة</text>
           <text x="852" y="240" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="26" fill="#16232E">أعمال حرة</text>
           <text x="852" y="310" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="22" fill="#42556A">الحالة الاجتماعية</text>
           <text x="852" y="360" text-anchor="end" font-family="'Segoe UI', Tahoma" font-size="26" fill="#16232E">متزوج</text>
           <rect x="60" y="420" width="500" height="60" fill="#DCE3EA" />
           <text x="70" y="462" font-family="Consolas, monospace" font-size="24" fill="#5B6E80" letter-spacing="3">${plan.sellerNationalId}&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>`
    }
    <text x="450" y="530" text-anchor="middle" font-family="Consolas, monospace" font-size="13" fill="#7C8EA0">SPECIMEN — SYNTHETIC DEMO DOCUMENT, NOT A REAL IDENTITY CARD</text>
  </svg>`;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

export function daysAgo(rng: () => number, min: number, max: number): Date {
  const days = min + rng() * (max - min);
  return new Date(Date.now() - days * 86400000);
}

export { MONTHS_PER_PERIOD, CATALOGUE };
