import "server-only";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";

/**
 * ValuationService — never a single-point number.
 *
 * Inputs: the project's seeded developer price-per-sqm history, the unit's own
 * attributes (type, BUA, floor, view, finishing, delivery horizon) and
 * comparable resales. Output: a range with a confidence band, the comparables
 * it used and the drivers that moved the number.
 *
 * The comparable set and the developer price history are synthetic seed data
 * for this MVP and are labelled as such everywhere they surface.
 */

export interface ValuationDriver {
  labelEn: string;
  labelAr: string;
  effectPct: number;
  note: string;
}

export interface ValuationResult {
  low: Decimal;
  mid: Decimal;
  high: Decimal;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  method: string;
  drivers: ValuationDriver[];
  comparables: {
    label: string;
    projectName: string;
    unitType: string;
    buaSqm: string;
    price: string;
    pricePerSqm: string;
    source: string;
    observedAt: string;
  }[];
}

const FLOOR_PREMIUM_PER_LEVEL = 0.012;
const VIEW_PREMIUM: Record<string, number> = {
  "Landscape": 0.05,
  "Pool": 0.07,
  "Golf": 0.11,
  "Sea": 0.14,
  "Lagoon": 0.1,
  "Street": -0.03,
  "Internal": -0.02,
};
const FINISHING_PREMIUM: Record<string, number> = {
  CORE_AND_SHELL: -0.06,
  SEMI_FINISHED: 0,
  FULLY_FINISHED: 0.09,
  FINISHED_WITH_AC: 0.13,
  FURNISHED: 0.19,
};

export async function computeValuation(listingId: string): Promise<ValuationResult> {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      contract: {
        include: {
          fields: true,
          unit: { include: { project: { include: { developer: true, priceBenchmarks: true } } } },
        },
      },
    },
  });

  const unit = listing.contract.unit;
  const project = unit.project;
  const bua = new Decimal(unit.buaSqm.toString());

  // Latest benchmark for this unit type, falling back to the project's newest.
  const benches = project.priceBenchmarks
    .slice()
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  const typed = benches.filter((b) => b.unitType === unit.unitType);
  const bench = typed[0] ?? benches[0];

  const drivers: ValuationDriver[] = [];

  // Anchor on the most specific evidence available. The developer's own list
  // price for THIS unit already embeds its type, floor, view and finishing, so
  // when we have it we do not re-apply those adjustments on top — that is how
  // a valuation ends up above the price you could buy the same unit for today.
  const listPrice = unit.currentDeveloperPrice
    ? new Decimal(unit.currentDeveloperPrice.toString())
    : null;

  let basePerSqm: Decimal;
  let method: string;
  let applyUnitAttributes: boolean;

  if (listPrice && listPrice.gt(0)) {
    basePerSqm = listPrice.div(bua);
    method =
      "Anchored on the developer's current list price for this unit (synthetic seed data), then discounted for the secondary market and the remaining time to handover";
    applyUnitAttributes = false;
    drivers.push({
      labelEn: "Developer list price today",
      labelAr: "سعر المطوّر اليوم",
      effectPct: 0,
      note: `EGP ${listPrice.toFixed(0)} for this unit`,
    });
  } else if (bench) {
    basePerSqm = new Decimal(bench.pricePerSqm.toString());
    method = `Developer price benchmark ${project.nameEn} ${bench.year}Q${bench.quarter} (synthetic) adjusted for unit attributes`;
    applyUnitAttributes = true;
    drivers.push({
      labelEn: `${project.nameEn} developer rate`,
      labelAr: `سعر المطوّر في ${project.nameAr}`,
      effectPct: 0,
      note: `EGP ${basePerSqm.toFixed(0)}/m² baseline, ${bench.year}Q${bench.quarter}`,
    });
  } else {
    const contractPrice = listing.contract.fields.find((f) => f.key === "TOTAL_PRICE");
    const p = contractPrice?.verifiedNum ?? contractPrice?.declaredNum;
    basePerSqm = p ? new Decimal(p.toString()).div(bua) : money(45000);
    method = "Contract price per m² carried forward — no benchmark available";
    applyUnitAttributes = true;
  }

  let multiplier = new Decimal(1);

  // A contract resold before handover trades below the developer's primary
  // price: the buyer takes on delivery risk and gives up the developer's own
  // payment plan on a new unit.
  if (listPrice) {
    const liquidity = -0.04;
    multiplier = multiplier.mul(1 + liquidity);
    drivers.push({
      labelEn: "Secondary-market liquidity",
      labelAr: "سيولة السوق الثانوي",
      effectPct: round1(liquidity * 100),
      note: "An assigned contract trades below the developer's primary price",
    });
  }

  if (applyUnitAttributes && unit.floor != null && unit.floor > 0) {
    const eff = Math.min(unit.floor, 12) * FLOOR_PREMIUM_PER_LEVEL;
    multiplier = multiplier.mul(1 + eff);
    drivers.push({
      labelEn: `Floor ${unit.floor}`,
      labelAr: `الدور ${unit.floor}`,
      effectPct: round1(eff * 100),
      note: "Higher floors carry a premium in gated compounds",
    });
  }

  if (applyUnitAttributes && unit.view && VIEW_PREMIUM[unit.view] !== undefined) {
    const eff = VIEW_PREMIUM[unit.view]!;
    multiplier = multiplier.mul(1 + eff);
    drivers.push({
      labelEn: `${unit.view} view`,
      labelAr: `إطلالة ${unit.view}`,
      effectPct: round1(eff * 100),
      note: "View premium from comparable resales",
    });
  }

  const finEff = applyUnitAttributes ? (FINISHING_PREMIUM[unit.finishing] ?? 0) : 0;
  if (finEff !== 0) {
    multiplier = multiplier.mul(1 + finEff);
    drivers.push({
      labelEn: unit.finishing.replace(/_/g, " ").toLowerCase(),
      labelAr: "حالة التشطيب",
      effectPct: round1(finEff * 100),
      note: "Finishing level relative to semi-finished baseline",
    });
  }

  // Outdoor areas contribute at a discount to BUA rate.
  const outdoor = new Decimal(unit.gardenSqm?.toString() ?? 0)
    .plus(unit.roofSqm?.toString() ?? 0)
    .plus(unit.terraceSqm?.toString() ?? 0);
  const effectiveArea = applyUnitAttributes ? bua.plus(outdoor.mul(0.35)) : bua;
  if (applyUnitAttributes && outdoor.gt(0)) {
    drivers.push({
      labelEn: `${outdoor.toFixed(0)} m² outdoor area`,
      labelAr: `${outdoor.toFixed(0)} م² مساحات خارجية`,
      effectPct: round1(outdoor.mul(0.35).div(bua).mul(100).toNumber()),
      note: "Garden, roof and terrace valued at 35% of the built rate",
    });
  }

  // Delivery horizon: a unit handed over sooner is worth more today.
  const yearsToDelivery =
    (unit.contractualDeliveryDate.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  if (yearsToDelivery > 0.25) {
    const eff = -Math.min(yearsToDelivery, 6) * (applyUnitAttributes ? 0.022 : 0.012);
    multiplier = multiplier.mul(1 + eff);
    drivers.push({
      labelEn: `${yearsToDelivery.toFixed(1)} years to delivery`,
      labelAr: `${yearsToDelivery.toFixed(1)} سنة حتى التسليم`,
      effectPct: round1(eff * 100),
      note: "Discount for time to handover",
    });
  } else if (unit.deliveryStatus === "DELIVERED") {
    multiplier = multiplier.mul(1.05);
    drivers.push({
      labelEn: "Delivered unit",
      labelAr: "وحدة مستلمة",
      effectPct: 5,
      note: "Handover risk removed",
    });
  }

  const mid = basePerSqm.mul(multiplier).mul(effectiveArea).toDecimalPlaces(0);

  // Comparables from the same project and unit type, then the same city.
  const comparableUnits = await prisma.unit.findMany({
    where: {
      id: { not: unit.id },
      currentDeveloperPrice: { not: null },
      OR: [
        { projectId: project.id, unitType: unit.unitType },
        { project: { city: project.city }, unitType: unit.unitType },
      ],
    },
    include: { project: true },
    take: 6,
  });

  const comparables = comparableUnits.map((u) => {
    const price = new Decimal(u.currentDeveloperPrice!.toString());
    const area = new Decimal(u.buaSqm.toString());
    return {
      label: `${u.project.nameEn} · ${u.unitCode}`,
      projectName: u.project.nameEn,
      unitType: u.unitType,
      buaSqm: area.toFixed(0),
      price: price.toFixed(0),
      pricePerSqm: price.div(area).toFixed(0),
      source: "Synthetic developer price list (seed data)",
      observedAt: new Date().toISOString(),
    };
  });

  // Band width narrows as evidence accumulates.
  const evidence = (bench ? 2 : 0) + Math.min(comparables.length, 4);
  const spread = evidence >= 5 ? 0.07 : evidence >= 3 ? 0.11 : 0.16;
  const confidence: ValuationResult["confidence"] =
    evidence >= 5 ? "HIGH" : evidence >= 3 ? "MEDIUM" : "LOW";

  const result: ValuationResult = {
    low: mid.mul(1 - spread).toDecimalPlaces(0),
    mid,
    high: mid.mul(1 + spread).toDecimalPlaces(0),
    confidence,
    method,
    drivers,
    comparables,
  };

  const created = await prisma.valuation.create({
    data: {
      listingId,
      low: result.low.toFixed(2),
      mid: result.mid.toFixed(2),
      high: result.high.toFixed(2),
      confidence,
      method,
      drivers: drivers as unknown as object,
      isSynthetic: true,
      comparables: {
        create: comparables.map((c) => ({
          label: c.label,
          projectName: c.projectName,
          unitType: c.unitType as never,
          buaSqm: c.buaSqm,
          price: c.price,
          pricePerSqm: c.pricePerSqm,
          source: c.source,
          observedAt: new Date(c.observedAt),
          isSynthetic: true,
        })),
      },
    },
  });

  await audit({
    action: "VALUATION_COMPUTED",
    entityType: "Valuation",
    entityId: created.id,
    after: { low: result.low.toFixed(0), mid: result.mid.toFixed(0), high: result.high.toFixed(0), confidence },
    metadata: { listingId },
  });

  return result;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
