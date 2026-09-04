import { PrismaClient, type ContractFieldKey, type PaymentFrequency, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Decimal } from "decimal.js";
import { makeDemoNationalId } from "../../src/lib/domain/national-id.js";
import { runExtractionPipeline } from "../../src/lib/services/extraction.js";
import { reconcileListing } from "../../src/lib/services/reconciliation.js";
import { computeVerificationScore } from "../../src/lib/services/verification-score.js";
import {
  approveAndPublish,
  dispositionFraudSignal,
  moderateMedia,
  rejectListing,
  requestInformation,
  resolveDiscrepancy,
  reviewReceipt,
  verifyField,
} from "../../src/lib/services/verification.js";
import { recomputeMatchesForBuyer } from "../../src/lib/services/matching.js";
import { acceptOffer, counterOffer, createOffer } from "../../src/lib/services/offers.js";
import { completeMilestone } from "../../src/lib/services/deals.js";
import { handlePaymentCallback, initiatePayment } from "../../src/lib/services/payments.js";
import { transitionListing } from "../../src/lib/services/listings.js";
import {
  ADMIN,
  ANALYSTS,
  BUYERS,
  DEMO_PASSWORD,
  DEVELOPERS,
  EXIT_REASONS,
  PARTNER,
  SELLERS,
  type PersonSeed,
  type ProjectSeed,
} from "./data.js";
import { buildListing, pickArchetype, pricePerSqm, type ListingPlan, type Scenario } from "./build-listing.js";

const prisma = new PrismaClient();

// Deterministic PRNG so a re-seed produces the same marketplace.
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCENARIOS: Scenario[] = [
  // Live marketplace — the bulk of what a buyer sees.
  ...(Array(22).fill("CLEAN_PUBLISHED") as Scenario[]),
  "PUBLISHED_WITH_OFFERS",
  "PUBLISHED_WITH_OFFERS",
  "PUBLISHED_UNDER_NEGOTIATION",
  "RESERVED_ACTIVE_DEAL",
  "COMPLETED_DEAL",
  // The analyst's queue — deliberately interesting files.
  "QUEUE_CLEAN",
  "QUEUE_CLEAN",
  "QUEUE_RECEIPT_MISMATCH",
  "QUEUE_SUSPICIOUS_RECEIPT",
  "QUEUE_INCOMPLETE_DOCS",
  "INFO_REQUESTED",
  "INFO_REQUESTED",
  "REJECTED",
  // Sellers mid-flow.
  "DRAFT_MID_WIZARD",
  "DRAFT_MID_WIZARD",
];

const REQUIRED_KEYS: ContractFieldKey[] = [
  "TOTAL_PRICE",
  "AMOUNT_PAID",
  "OUTSTANDING_BALANCE",
  "INSTALLMENT_AMOUNT",
  "INSTALLMENT_FREQUENCY",
  "DELIVERY_DATE",
];
const EXTRA_KEYS: ContractFieldKey[] = [
  "DOWN_PAYMENT",
  "NUMBER_OF_INSTALLMENTS",
  "MAINTENANCE_DEPOSIT",
  "CLUB_FEE",
  "CONTRACT_SIGNING_DATE",
  "PLAN_START_DATE",
  "NEXT_DUE_DATE",
  "CANCELLATION_PENALTY_PCT",
];

async function main() {
  const t0 = Date.now();
  console.log("Aqary seed — synthetic demonstration data\n");

  await wipe();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const rng = mulberry(20260902);

  // ---- Reference data ----------------------------------------------------
  console.log("Developers, projects and assignment policies…");
  const projectIndex: { project: ProjectSeed; projectId: string; developer: DeveloperRef }[] = [];
  const developerRefs: DeveloperRef[] = [];

  for (const dev of DEVELOPERS) {
    const developer = await prisma.developer.create({
      data: {
        slug: dev.slug,
        nameEn: dev.nameEn,
        nameAr: dev.nameAr,
        descriptionEn: dev.descriptionEn,
        descriptionAr: dev.descriptionAr,
        isDemo: true,
        policy: {
          create: {
            assignmentAllowed: dev.policy.assignmentAllowed,
            feeType: dev.policy.feeType,
            feePercentBps: dev.policy.feePercentBps ?? null,
            feeFixedAmount: dev.policy.feeFixedAmount ?? null,
            feeBasis: dev.policy.feeBasis ?? "TOTAL_CONTRACT_PRICE",
            minPercentPaidBps: dev.policy.minPercentPaidBps ?? null,
            minMonthsElapsed: dev.policy.minMonthsElapsed ?? null,
            requiredDocuments: dev.policy.requiredDocuments,
            typicalNocDays: dev.policy.typicalNocDays ?? null,
            waitingPeriodDays: dev.policy.waitingPeriodDays ?? null,
            conditionsEn: dev.policy.conditionsEn,
            conditionsAr: dev.policy.conditionsAr,
            contactName: dev.policy.contactName,
            contactEmail: dev.policy.contactEmail,
            contactPhone: dev.policy.contactPhone,
            isSynthetic: true,
          },
        },
      },
    });

    const ref: DeveloperRef = {
      id: developer.id,
      nameEn: dev.nameEn,
      nameAr: dev.nameAr,
      assignmentFeePct:
        dev.policy.feeType === "PERCENT" ? (dev.policy.feePercentBps ?? 0) / 100 : 0,
      minMonths: dev.policy.minMonthsElapsed ?? 12,
    };
    developerRefs.push(ref);

    for (const p of dev.projects) {
      const project = await prisma.project.create({
        data: {
          developerId: developer.id,
          slug: p.slug,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          city: p.city,
          area: p.area,
          lat: p.lat,
          lng: p.lng,
          descriptionEn: p.descriptionEn,
          descriptionAr: p.descriptionAr,
          isDemo: true,
        },
      });
      projectIndex.push({ project: p, projectId: project.id, developer: ref });

      // Synthetic developer price benchmark series — the ValuationService input.
      const types = ["APARTMENT", "DUPLEX", "PENTHOUSE", "STUDIO", "TOWNHOUSE", "TWIN_HOUSE", "STANDALONE_VILLA", "CHALET"] as const;
      const rows: { unitType: (typeof types)[number]; year: number; quarter: number; pricePerSqm: string }[] = [];
      for (const unitType of types) {
        const typeFactor =
          unitType === "STANDALONE_VILLA" ? 1.24 : unitType === "TWIN_HOUSE" ? 1.14 : unitType === "TOWNHOUSE" ? 1.08 : unitType === "PENTHOUSE" ? 1.1 : unitType === "STUDIO" ? 0.94 : 1;
        for (let year = 2021; year <= 2026; year++) {
          for (const quarter of [1, 3]) {
            const base = pricePerSqm(p, year) * (quarter === 3 ? 1.06 : 1);
            rows.push({
              unitType,
              year,
              quarter,
              pricePerSqm: Math.round(base * typeFactor).toFixed(2),
            });
          }
        }
      }
      await prisma.projectPriceBenchmark.createMany({
        data: rows.map((r) => ({ ...r, projectId: project.id, isSynthetic: true })),
      });
    }
  }
  console.log(`  ${DEVELOPERS.length} developers · ${projectIndex.length} projects\n`);

  // ---- People ------------------------------------------------------------
  console.log("Demo accounts…");
  const sellers = await Promise.all(
    SELLERS.map((p, i) => createPerson(p, ["SELLER"], passwordHash, i, { sellerProfile: true })),
  );
  const buyers = await Promise.all(
    BUYERS.map((p, i) => createPerson(p, ["BUYER"], passwordHash, 100 + i, { buyerSeed: p })),
  );
  const analysts = await Promise.all(
    ANALYSTS.map((p, i) => createPerson(p, ["ANALYST"], passwordHash, 200 + i, {})),
  );
  const admin = await createPerson(ADMIN, ["ADMIN", "ANALYST"], passwordHash, 300, {});
  const partner = await createPerson(PARTNER, ["DEVELOPER_PARTNER"], passwordHash, 301, {});
  // A partner role alone grants nothing. The demo desk is deliberately bound
  // to one developer organisation so tenant-isolation behaviour is observable.
  await prisma.developerPartnerMembership.create({
    data: {
      userId: partner.id,
      // The seeded active request belongs to Tatweer Misr; binding the demo
      // partner there makes the full developer workflow observable without
      // weakening tenant isolation across the other eleven developers.
      developerId: developerRefs.find((developer) => developer.nameEn === "Tatweer Misr")!.id,
    },
  });

  // One account holding both roles, to exercise the workspace switcher.
  const dual = await createPerson(
    {
      nameEn: "Sara Mounir Halim",
      nameAr: "سارة منير حليم",
      phone: "+201006660001",
      email: "dual@aqary.test",
      govCode: "01",
      birthYear: 1988,
    },
    ["SELLER", "BUYER"],
    passwordHash,
    400,
    { sellerProfile: true, buyerSeed: BUYERS[1] },
  );
  console.log(
    `  ${sellers.length} sellers · ${buyers.length} buyers · ${analysts.length} analysts · 1 admin · 1 partner · 1 dual-role\n`,
  );

  // ---- Listings ----------------------------------------------------------
  console.log(`Building ${SCENARIOS.length} contracts with documents, receipts and media…`);
  const built: { plan: ListingPlan; listingId: string }[] = [];

  for (const [index, scenario] of SCENARIOS.entries()) {
    const entry = projectIndex[index % projectIndex.length]!;
    const listingRng = mulberry(1000 + index * 7717);
    const seller = sellers[index % sellers.length]!;
    const sellerSeed = index % sellers.length < SELLERS.length ? SELLERS[index % sellers.length]! : SELLERS[0]!;

    const signingYear = 2021 + Math.floor(listingRng() * 3);
    const plan: ListingPlan = {
      index,
      scenario,
      project: entry.project,
      developer: entry.developer,
      projectId: entry.projectId,
      archetype: pickArchetype(listingRng),
      sellerId: seller.id,
      sellerNameAr: sellerSeed.nameAr,
      sellerNameEn: sellerSeed.nameEn,
      sellerNationalId: seller.nationalId!,
      signingDate: new Date(
        Date.UTC(signingYear, Math.floor(listingRng() * 12), 1 + Math.floor(listingRng() * 27)),
      ),
      frequency: (["QUARTERLY", "QUARTERLY", "QUARTERLY", "MONTHLY", "SEMI_ANNUAL"] as PaymentFrequency[])[
        Math.floor(listingRng() * 5)
      ]!,
      installmentsCount: [16, 20, 24, 28, 32, 40][Math.floor(listingRng() * 6)]!,
      downPaymentPct: [5, 10, 10, 15, 20][Math.floor(listingRng() * 5)]!,
      cancellationPenaltyPct: [10, 12.5, 15][Math.floor(listingRng() * 3)]!,
      flexibilityPct: listingRng() < 0.45 ? [3, 5, 8][Math.floor(listingRng() * 3)]! : 0,
      urgency: (["IMMEDIATE", "ONE_TO_THREE_MONTHS", "FLEXIBLE"] as const)[Math.floor(listingRng() * 3)]!,
      exitReason: EXIT_REASONS[Math.floor(listingRng() * EXIT_REASONS.length)]!,
      rng: listingRng,
    };

    const result = await buildListing(prisma, plan);
    built.push({ plan, listingId: result.listingId });
    process.stdout.write(`\r  ${index + 1}/${SCENARIOS.length}  ${plan.project.nameEn} · ${scenario}          `);
  }
  console.log("\n");

  // ---- Extraction, reconciliation, fraud, valuation, score ----------------
  console.log("Running the extraction pipeline over every submitted file…");
  for (const [i, b] of built.entries()) {
    if (b.plan.scenario === "DRAFT_MID_WIZARD") continue;
    await transitionListing({ listingId: b.listingId, to: "SUBMITTED", actorId: b.plan.sellerId });
    await runExtractionPipeline(b.listingId);
    process.stdout.write(`\r  ${i + 1}/${built.length}          `);
  }
  console.log("\n");

  // ---- Analyst work -------------------------------------------------------
  console.log("Analyst verification…");
  for (const [i, b] of built.entries()) {
    const analyst = analysts[i % analysts.length]!;
    await prisma.listing.update({
      where: { id: b.listingId },
      data: { assignedAnalystId: analyst.id },
    });

    switch (b.plan.scenario) {
      case "CLEAN_PUBLISHED":
      case "PUBLISHED_WITH_OFFERS":
      case "PUBLISHED_UNDER_NEGOTIATION":
      case "RESERVED_ACTIVE_DEAL":
      case "COMPLETED_DEAL":
        await fullVerification(b.listingId, analyst.id);
        await approveAndPublish({
          listingId: b.listingId,
          analystId: analyst.id,
          note: "All sources reconcile within tolerance; documents complete.",
        });
        break;

      case "INFO_REQUESTED":
        await verifyReceipts(b.listingId, analyst.id);
        await requestInformation({
          listingId: b.listingId,
          analystId: analyst.id,
          items: [
            {
              code: "DEVELOPER_ACCOUNT_STATEMENT",
              labelEn: "A developer account statement issued within the last 30 days",
              labelAr: "كشف حساب من المطوّر صادر خلال آخر 30 يومًا",
              detail: "This is the single fastest way to confirm your paid total and outstanding balance.",
            },
            {
              code: "MISSING_RECEIPTS",
              labelEn: "Receipts for the two instalments due in the last six months",
              labelAr: "إيصالات القسطين المستحقين خلال آخر ستة أشهر",
            },
          ],
          note: "Cannot confirm the paid total from the receipts on file alone.",
        });
        break;

      case "REJECTED":
        await rejectListing({
          listingId: b.listingId,
          analystId: analyst.id,
          reason:
            "The name on the national ID does not match the contract holder and no power of attorney was supplied. We cannot verify the seller's standing to assign this contract.",
        });
        break;

      case "QUEUE_CLEAN":
      case "QUEUE_RECEIPT_MISMATCH":
      case "QUEUE_SUSPICIOUS_RECEIPT":
      case "QUEUE_INCOMPLETE_DOCS":
        // Left in the queue on purpose — this is what an analyst opens on day one.
        if (b.plan.scenario === "QUEUE_CLEAN") await verifyReceipts(b.listingId, analyst.id);
        await reconcileListing(b.listingId);
        await computeVerificationScore(b.listingId);
        break;

      case "DRAFT_MID_WIZARD":
        break;
    }
    process.stdout.write(`\r  ${i + 1}/${built.length}          `);
  }
  console.log("\n");

  // ---- Buyer matches ------------------------------------------------------
  console.log("Computing matches…");
  for (const buyer of [...buyers, dual]) await recomputeMatchesForBuyer(buyer.id);

  // ---- Saved searches and saved listings ---------------------------------
  const listed = await prisma.listing.findMany({
    where: { status: "LISTED" },
    orderBy: { publishedAt: "desc" },
  });

  await prisma.savedSearch.createMany({
    data: [
      {
        buyerId: buyers[0]!.id,
        name: "New Cairo, 3 bed, under EGP 4m cash",
        filters: { cities: ["New Cairo"], bedroomsMin: 3, cashMax: "4000000", sort: "best-match" },
        alertsEnabled: true,
        lastRunAt: new Date(),
        lastResultCount: 0,
      },
      {
        buyerId: buyers[2]!.id,
        name: "Biggest discounts, any city",
        filters: { discountMinPct: 15, sort: "discount" },
        alertsEnabled: true,
        lastRunAt: new Date(),
        lastResultCount: 0,
      },
      {
        buyerId: buyers[4]!.id,
        name: "Coastal chalets, semi-annual plans",
        filters: { cities: ["North Coast", "Ain Sokhna"], unitTypes: ["CHALET"], sort: "cash" },
        alertsEnabled: false,
      },
    ],
  });

  for (const [i, l] of listed.slice(0, 6).entries()) {
    await prisma.savedListing.create({
      data: { buyerId: buyers[i % buyers.length]!.id, listingId: l.id },
    });
  }

  // Real result counts for saved searches.
  for (const s of await prisma.savedSearch.findMany()) {
    const filters = s.filters as { cities?: string[] };
    const count = await prisma.listing.count({
      where: {
        status: { in: ["LISTED", "UNDER_OFFER"] },
        ...(filters.cities?.length
          ? { contract: { unit: { project: { city: { in: filters.cities } } } } }
          : {}),
      },
    });
    await prisma.savedSearch.update({
      where: { id: s.id },
      data: { lastResultCount: count, lastRunAt: new Date() },
    });
  }

  // ---- Transactions -------------------------------------------------------
  console.log("Offers, negotiations, deals and payments…");
  await seedTransactions(built, buyers, admin.id);

  // ---- Summary ------------------------------------------------------------
  const counts = await summary();
  console.log(`\nSeed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  console.table(counts);
  console.log(`\nDemo accounts — password for all: ${DEMO_PASSWORD}`);
  console.table([
    { role: "Seller", email: SELLERS[0]!.email, phone: SELLERS[0]!.phone },
    { role: "Buyer (priority)", email: BUYERS[0]!.email, phone: BUYERS[0]!.phone },
    { role: "Buyer (verified)", email: BUYERS[1]!.email, phone: BUYERS[1]!.phone },
    { role: "Analyst", email: ANALYSTS[0]!.email, phone: ANALYSTS[0]!.phone },
    { role: "Admin", email: ADMIN.email, phone: ADMIN.phone },
    { role: "Developer partner", email: PARTNER.email, phone: PARTNER.phone },
    { role: "Seller + Buyer", email: "dual@aqary.test", phone: "+201006660001" },
  ]);
}

interface DeveloperRef {
  id: string;
  nameEn: string;
  nameAr: string;
  assignmentFeePct: number;
  minMonths: number;
}

// ---------------------------------------------------------------------------

async function createPerson(
  p: PersonSeed,
  roles: Role[],
  passwordHash: string,
  seq: number,
  opts: { sellerProfile?: boolean; buyerSeed?: (typeof BUYERS)[number] },
) {
  const dob = new Date(Date.UTC(p.birthYear, (seq * 7) % 12, ((seq * 13) % 27) + 1));
  const user = await prisma.user.create({
    data: {
      email: p.email,
      phone: p.phone,
      passwordHash,
      fullNameEn: p.nameEn,
      fullNameAr: p.nameAr,
      nationalId: makeDemoNationalId(dob, p.govCode, seq),
      dateOfBirth: dob,
      governorate: p.govCode,
      roles,
      kycStatus: "VERIFIED",
      phoneVerified: true,
      emailVerified: true,
      isDemo: true,
      avatarColor: ["#1F4B43", "#B4833C", "#26685C", "#5C6B66", "#8C5A38"][seq % 5]!,
    },
  });

  if (opts.sellerProfile) {
    await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        relationshipToContract: "OWNER",
        preferredContactWindow: ["Morning", "Afternoon", "Evening"][seq % 3]!,
        whatsappOptIn: seq % 2 === 0,
      },
    });
  }

  if (opts.buyerSeed) {
    const b = opts.buyerSeed;
    await prisma.buyerProfile.create({
      data: {
        userId: user.id,
        tier: b.tier,
        availableCash: b.availableCash,
        maxInstallment: b.maxInstallment,
        installmentFrequency: b.frequency,
        incomeRange: b.incomeRange,
        employmentType: b.employmentType,
        purchasePurpose: b.purpose,
        readiness: b.readiness,
        prefCities: b.cities,
        prefUnitTypes: b.unitTypes,
        prefBedroomsMin: b.bedroomsMin,
        prefBuaMin: b.buaMin,
        prefDeliveryByYear: b.deliveryByYear,
        freeTextPriorities: b.priorities,
        onboardingCompletedAt: new Date(),
        proofOfFundsVerifiedAt: b.tier === "PRIORITY" ? new Date() : null,
      },
    });
  }

  return user;
}

/** Verify every uploaded receipt, then re-reconcile so receipt-derived values exist. */
async function verifyReceipts(listingId: string, analystId: string) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { contract: { include: { receipts: true } } },
  });

  const seenHashes = new Set<string>();
  for (const r of listing.contract.receipts) {
    const duplicate = r.sha256 ? seenHashes.has(r.sha256) : false;
    if (r.sha256) seenHashes.add(r.sha256);
    await reviewReceipt({
      receiptId: r.id,
      analystId,
      decision: duplicate ? "DUPLICATE" : "VERIFY",
      note: duplicate ? "Byte-identical to an earlier receipt on this file." : undefined,
    });
  }
  await reconcileListing(listingId);
}

/** The full analyst pass that a publishable file has been through. */
async function fullVerification(listingId: string, analystId: string) {
  await verifyReceipts(listingId, analystId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { contract: { include: { fields: true } }, media: true },
  });

  for (const key of [...REQUIRED_KEYS, ...EXTRA_KEYS]) {
    const f = listing.contract.fields.find((x) => x.key === key);
    if (!f) continue;

    // An analyst prefers the developer's own statement, then the receipts,
    // then what the extraction read, and only then the seller's word.
    const source =
      f.developerStatedNum !== null || f.developerStatedDate !== null
        ? "DEVELOPER_CONFIRMED"
        : key === "AMOUNT_PAID" && f.receiptDerivedNum !== null
          ? "RECEIPT_VERIFIED"
          : f.extractedNum !== null || f.extractedDate !== null || f.extractedText !== null
            ? "AI_EXTRACTED"
            : "SELLER_DECLARED";

    await verifyField({ listingId, key, source, analystId }).catch(() => undefined);
  }

  // Outstanding balance follows from the two verified figures above.
  const refreshed = await prisma.contractField.findMany({
    where: { contractId: listing.contractId },
  });
  const total = refreshed.find((f) => f.key === "TOTAL_PRICE")?.verifiedNum;
  const paid = refreshed.find((f) => f.key === "AMOUNT_PAID")?.verifiedNum;
  if (total && paid) {
    await verifyField({
      listingId,
      key: "OUTSTANDING_BALANCE",
      source: "ANALYST_OVERRIDE",
      analystId,
      override: {
        num: Decimal.max(new Decimal(total.toString()).minus(paid.toString()), 0).toFixed(2),
        reason: "Computed as the verified contract price less the verified amount paid.",
      },
    }).catch(() => undefined);
  }

  for (const d of await prisma.discrepancy.findMany({ where: { listingId, status: "OPEN" } })) {
    await resolveDiscrepancy({
      discrepancyId: d.id,
      analystId,
      resolution:
        "Checked against the developer account statement and the verified receipts. The statement is authoritative here; the seller's figure was a rounding of the same total.",
      resolveTo: undefined,
    }).catch(() => undefined);
  }

  for (const s of await prisma.fraudSignal.findMany({ where: { listingId, status: "OPEN" } })) {
    await dispositionFraudSignal({
      signalId: s.id,
      analystId,
      status: "DISMISSED",
      note: "Reviewed against the source documents. No manipulation found; the anomaly is explained by the upload path.",
    }).catch(() => undefined);
  }

  for (const m of listing.media) {
    if (m.moderationStatus !== "APPROVED") {
      await moderateMedia({ mediaId: m.id, analystId, status: "APPROVED" }).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------

async function seedTransactions(
  built: { plan: ListingPlan; listingId: string }[],
  buyers: { id: string }[],
  adminId: string,
) {
  const eligible = (s: Scenario) => built.filter((b) => b.plan.scenario === s);

  // 1. Listings with live offers on them.
  for (const [i, b] of eligible("PUBLISHED_WITH_OFFERS").entries()) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: b.listingId } });
    if (listing.status !== "LISTED") continue;
    const asking = new Decimal(listing.askingCash!.toString());
    for (const [j, buyer] of [buyers[0]!, buyers[2]!, buyers[6]!].slice(0, 2 + i).entries()) {
      await createOffer({
        listingId: b.listingId,
        buyerId: buyer.id,
        amount: asking.mul(1 - j * 0.03).toDecimalPlaces(2).toFixed(2),
        message:
          j === 0
            ? "Ready to move immediately. Proof of funds already on file with Aqary."
            : "Happy to proceed at this figure and can complete within six weeks.",
        proposedCompletionDays: 45 - j * 10,
      }).catch((e) => console.warn(`   offer skipped: ${e.message}`));
    }
  }

  // 2. A live negotiation: buyer offers, seller counters.
  for (const b of eligible("PUBLISHED_UNDER_NEGOTIATION")) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: b.listingId } });
    if (listing.status !== "LISTED") continue;
    const asking = new Decimal(listing.askingCash!.toString());
    const offer = await createOffer({
      listingId: b.listingId,
      buyerId: buyers[1]!.id,
      amount: asking.mul(0.9).toDecimalPlaces(2).toFixed(2),
      message: "This is what I can raise in cash without borrowing. I can complete quickly.",
      proposedCompletionDays: 30,
    }).catch(() => null);
    if (!offer) continue;
    await counterOffer({
      offerId: offer.id,
      actorId: listing.sellerId,
      actorRole: "SELLER",
      amount: asking.mul(0.96).toDecimalPlaces(2).toFixed(2),
      message: "I can meet you part of the way, but I need most of what I have already paid in.",
    }).catch((e) => console.warn(`   counter skipped: ${e.message}`));
  }

  // 3. An accepted offer with an active deal, part-way through its milestones.
  for (const b of eligible("RESERVED_ACTIVE_DEAL")) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: b.listingId } });
    if (listing.status !== "LISTED") continue;
    const asking = new Decimal(listing.askingCash!.toString());
    const offer = await createOffer({
      listingId: b.listingId,
      buyerId: buyers[0]!.id,
      amount: asking.toFixed(2),
      message: "Accepting the asking figure. Let us start the developer paperwork.",
    }).catch(() => null);
    if (!offer) continue;

    const accepted = await acceptOffer({ offerId: offer.id, actorId: listing.sellerId });
    const deal = accepted.deal;

    // Reservation deposit clears; the NOC request is under way.
    const deposit = await initiatePayment({
      dealId: deal.id,
      kind: "RESERVATION_DEPOSIT",
      actorId: buyers[0]!.id,
      actorRole: "BUYER",
      simulate: "SUCCESS",
    });
    await handlePaymentCallback(deposit.id);
    await completeMilestone({
      dealId: deal.id,
      key: "RESERVATION_DEPOSIT",
      actorId: buyers[0]!.id,
      actorRole: "BUYER",
      note: "Deposit received and held in settlement.",
    });
    await prisma.milestone.updateMany({
      where: { dealId: deal.id, key: "DEVELOPER_NOC_REQUESTED" },
      data: { status: "IN_PROGRESS", startedAt: new Date(), notes: "Assignment request filed with the developer." },
    });
  }

  // 4. A deal that ran all the way to completion — including a failed payment
  //    that was retried, because that is what real transactions look like.
  for (const b of eligible("COMPLETED_DEAL")) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: b.listingId } });
    if (listing.status !== "LISTED") continue;
    const buyer = buyers[2]!;
    const asking = new Decimal(listing.askingCash!.toString());

    const offer = await createOffer({
      listingId: b.listingId,
      buyerId: buyer.id,
      amount: asking.mul(0.97).toDecimalPlaces(2).toFixed(2),
      message: "Offering slightly below asking against a fast completion.",
    }).catch(() => null);
    if (!offer) continue;

    const accepted = await acceptOffer({ offerId: offer.id, actorId: listing.sellerId });
    const deal = accepted.deal;

    // The first deposit attempt is declined by the issuing bank.
    const failed = await initiatePayment({
      dealId: deal.id,
      kind: "RESERVATION_DEPOSIT",
      actorId: buyer.id,
      actorRole: "BUYER",
      simulate: "FAILURE",
    });
    await handlePaymentCallback(failed.id);

    // The buyer retries; the second attempt clears.
    const retried = await initiatePayment({
      dealId: deal.id,
      kind: "RESERVATION_DEPOSIT",
      actorId: buyer.id,
      actorRole: "BUYER",
      simulate: "SUCCESS",
    });
    await handlePaymentCallback(retried.id);

    await completeMilestone({ dealId: deal.id, key: "RESERVATION_DEPOSIT", actorId: buyer.id, actorRole: "BUYER" });
    await completeMilestone({ dealId: deal.id, key: "DEVELOPER_NOC_REQUESTED", actorId: adminId, actorRole: "ADMIN", note: "NOC issued in 19 days." });
    await completeMilestone({ dealId: deal.id, key: "ASSIGNMENT_APPOINTMENT", actorId: adminId, actorRole: "ADMIN" });
    await completeMilestone({ dealId: deal.id, key: "DOCUMENTS_SIGNED", actorId: listing.sellerId, actorRole: "SELLER", note: "Both parties attended and signed in their own names." });
    await completeMilestone({ dealId: deal.id, key: "ASSIGNMENT_REGISTERED", actorId: adminId, actorRole: "ADMIN" });

    const release = await initiatePayment({ dealId: deal.id, kind: "SELLER_RELEASE", actorId: adminId, actorRole: "ADMIN", simulate: "SUCCESS" });
    await handlePaymentCallback(release.id);
    await completeMilestone({ dealId: deal.id, key: "CASH_RELEASED_TO_SELLER", actorId: adminId, actorRole: "ADMIN" });

    const fee = await initiatePayment({ dealId: deal.id, kind: "PLATFORM_FEE", actorId: buyer.id, actorRole: "BUYER", simulate: "SUCCESS" });
    await handlePaymentCallback(fee.id);
    await completeMilestone({ dealId: deal.id, key: "PLATFORM_FEE_COLLECTED", actorId: buyer.id, actorRole: "BUYER" });

    await completeMilestone({ dealId: deal.id, key: "COMPLETED", actorId: adminId, actorRole: "ADMIN" });

    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        buyerRating: 5,
        sellerRating: 5,
        outcomeNotes:
          "Closed in 41 days. The only friction was the developer's NOC queue; the seller had the account statement ready, which saved a full verification cycle.",
      },
    });
  }
}

// ---------------------------------------------------------------------------

async function wipe() {
  // Child-first so foreign keys never block the truncate.
  const order = [
    "paymentEvent", "payment", "milestone", "message", "deal", "offer",
    "match", "savedListing", "savedSearch", "notification", "consent",
    "documentAccessLog", "documentPage", "receipt", "document", "mediaAsset",
    "extractionField", "extraction", "discrepancy", "fraudSignal",
    "valuationComparable", "valuation", "installment", "contractField",
    "listing", "contract", "unit", "projectPriceBenchmark", "project",
    "developerPartnerMembership", "developerAssignmentPolicy", "developer", "auditEvent", "job", "otpCode",
    "session", "sellerProfile", "buyerProfile", "user",
  ] as const;

  for (const model of order) {
    // @ts-expect-error — dynamic model access over a known-safe list
    await prisma[model].deleteMany({});
  }

  // Storage is regenerated from scratch on every seed.
  const { rm } = await import("node:fs/promises");
  await rm("storage/listings", { recursive: true, force: true }).catch(() => undefined);
  await rm("public/media/plans", { recursive: true, force: true }).catch(() => undefined);
}

async function summary() {
  const [
    developers, projects, units, users, listings, published, documents, pages,
    receipts, media, extractions, discrepancies, fraudSignals, valuations,
    matches, offers, deals, payments, notifications, auditEvents,
  ] = await Promise.all([
    prisma.developer.count(), prisma.project.count(), prisma.unit.count(),
    prisma.user.count(), prisma.listing.count(),
    prisma.listing.count({ where: { status: { in: ["LISTED", "UNDER_OFFER"] } } }),
    prisma.document.count(), prisma.documentPage.count(), prisma.receipt.count(),
    prisma.mediaAsset.count(), prisma.extraction.count(), prisma.discrepancy.count(),
    prisma.fraudSignal.count(), prisma.valuation.count(), prisma.match.count(),
    prisma.offer.count(), prisma.deal.count(), prisma.payment.count(),
    prisma.notification.count(), prisma.auditEvent.count(),
  ]);
  return [{
    developers, projects, units, users, listings, published, documents, pages,
    receipts, media, extractions, discrepancies, fraudSignals, valuations,
    matches, offers, deals, payments, notifications, auditEvents,
  }];
}

main()
  .catch((e) => {
    console.error("\nSeed failed:\n", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
