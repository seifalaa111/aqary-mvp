import { Decimal } from "decimal.js";
import { config } from "@/lib/config";
import { bps, money, type MoneyInput } from "@/lib/money";

/**
 * Every financial calculation in Aqary. Pure functions, Decimal throughout,
 * unit-tested in `src/lib/domain/__tests__`. Nothing here touches the database.
 */

export type Frequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";

export const MONTHS_PER_PERIOD: Record<Frequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

export function periodsPerYear(f: Frequency): number {
  return 12 / MONTHS_PER_PERIOD[f];
}

// ---------------------------------------------------------------------------
// Invariant: asking cash
// ---------------------------------------------------------------------------

export interface AskingCashCheck {
  ok: boolean;
  reason?: "ABOVE_VERIFIED_PAID" | "NEGATIVE" | "NO_VERIFIED_BASELINE";
  maxAllowed: Decimal | null;
}

/**
 * INVARIANT (§2.1): a seller may ask AT MOST what they have verifiably paid.
 * Overprice is structurally impossible; going below is a flexibility discount.
 */
export function checkAskingCash(askingCash: MoneyInput, verifiedAmountPaid: MoneyInput): AskingCashCheck {
  const asking = money(askingCash);
  if (verifiedAmountPaid === null || verifiedAmountPaid === undefined) {
    return { ok: false, reason: "NO_VERIFIED_BASELINE", maxAllowed: null };
  }
  const baseline = money(verifiedAmountPaid);
  if (asking.lt(0)) return { ok: false, reason: "NEGATIVE", maxAllowed: baseline };
  if (asking.gt(baseline)) return { ok: false, reason: "ABOVE_VERIFIED_PAID", maxAllowed: baseline };
  return { ok: true, maxAllowed: baseline };
}

/** The lowest cash the seller has pre-authorised themselves to accept. */
export function minAcceptableCash(askingCash: MoneyInput, flexibilityPct: number): Decimal {
  const pct = Math.min(Math.max(flexibilityPct, 0), config.MAX_FLEXIBILITY_PCT);
  return money(askingCash)
    .mul(new Decimal(100).minus(pct))
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

/** Seller commission is zero. Kept as a function so the invariant is testable. */
export function sellerFee(_totalContractPrice: MoneyInput): Decimal {
  return bps(0, config.SELLER_FEE_BPS);
}

/** Buyer success fee — `PLATFORM_FEE_BPS` of total contract value, on completion only. */
export function buyerPlatformFee(totalContractPrice: MoneyInput): Decimal {
  return bps(totalContractPrice, config.PLATFORM_FEE_BPS);
}

export interface AssignmentFeePolicy {
  feeType: "NONE" | "PERCENT" | "FIXED";
  feePercentBps?: number | null;
  feeFixedAmount?: MoneyInput;
  feeBasis?: string;
}

export function developerAssignmentFee(
  policy: AssignmentFeePolicy | null | undefined,
  basis: { totalContractPrice: MoneyInput; outstandingBalance?: MoneyInput },
): Decimal {
  if (!policy || policy.feeType === "NONE") return money(0);
  if (policy.feeType === "FIXED") return money(policy.feeFixedAmount).toDecimalPlaces(2);
  const base =
    policy.feeBasis === "OUTSTANDING_BALANCE"
      ? money(basis.outstandingBalance)
      : money(basis.totalContractPrice);
  return bps(base, policy.feePercentBps ?? 0);
}

// ---------------------------------------------------------------------------
// Installment schedule
// ---------------------------------------------------------------------------

export interface ScheduleSpecialPayment {
  /** Months after plan start. */
  monthOffset: number;
  amount: MoneyInput;
  kind: "BALLOON" | "DELIVERY" | "MAINTENANCE" | "CLUB";
  label?: string;
}

export interface ScheduleInput {
  totalPrice: MoneyInput;
  downPayment: MoneyInput;
  planStart: Date;
  frequency: Frequency;
  numberOfInstallments: number;
  /** When omitted, derived so the plan closes exactly on the total price. */
  installmentAmount?: MoneyInput;
  specialPayments?: ScheduleSpecialPayment[];
  contractSigningDate?: Date;
}

export interface ScheduleRow {
  sequence: number;
  kind: "DOWN_PAYMENT" | "REGULAR" | "BALLOON" | "DELIVERY" | "MAINTENANCE" | "CLUB";
  dueDate: Date;
  amount: Decimal;
  runningBalance: Decimal;
  label?: string;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/**
 * Rebuilds the contractual payment plan. The remainder after the down payment
 * and any special payments is spread across the regular installments; rounding
 * drift is absorbed by the final regular installment so the plan closes exactly
 * on the total price.
 */
export function buildInstallmentSchedule(input: ScheduleInput): ScheduleRow[] {
  const total = money(input.totalPrice);
  const down = money(input.downPayment);
  const specials = input.specialPayments ?? [];
  const specialsTotal = specials.reduce((acc, s) => acc.plus(money(s.amount)), money(0));

  const n = Math.max(0, Math.floor(input.numberOfInstallments));
  const regularTotal = total.minus(down).minus(specialsTotal);

  let per: Decimal;
  if (input.installmentAmount !== undefined && input.installmentAmount !== null) {
    per = money(input.installmentAmount);
  } else {
    per = n > 0 ? regularTotal.div(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : money(0);
  }

  const rows: ScheduleRow[] = [];
  let balance = total;
  let seq = 0;

  const signing = input.contractSigningDate ?? input.planStart;
  if (down.gt(0)) {
    balance = balance.minus(down);
    rows.push({
      sequence: seq++,
      kind: "DOWN_PAYMENT",
      dueDate: signing,
      amount: down,
      runningBalance: balance,
      label: "Down payment",
    });
  }

  const step = MONTHS_PER_PERIOD[input.frequency];
  const regular: ScheduleRow[] = [];
  for (let i = 0; i < n; i++) {
    regular.push({
      sequence: 0,
      kind: "REGULAR",
      dueDate: addMonths(input.planStart, step * i),
      amount: per,
      runningBalance: money(0),
      label: undefined,
    });
  }

  // Absorb rounding drift in the last regular instalment.
  if (regular.length > 0 && input.installmentAmount === undefined) {
    const sum = per.mul(regular.length);
    const drift = regularTotal.minus(sum);
    const last = regular[regular.length - 1]!;
    last.amount = last.amount.plus(drift);
  }

  const specialRows: ScheduleRow[] = specials.map((s) => ({
    sequence: 0,
    kind: s.kind,
    dueDate: addMonths(input.planStart, s.monthOffset),
    amount: money(s.amount),
    runningBalance: money(0),
    label: s.label,
  }));

  const merged = [...regular, ...specialRows].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
  );

  for (const row of merged) {
    balance = balance.minus(row.amount);
    rows.push({ ...row, sequence: seq++, runningBalance: balance });
  }

  return rows;
}

/** Sum of everything due on or before `asOf` — the contractually expected paid-to-date. */
export function expectedPaidToDate(rows: ScheduleRow[], asOf: Date): Decimal {
  return rows
    .filter((r) => r.dueDate.getTime() <= asOf.getTime())
    .reduce((acc, r) => acc.plus(r.amount), money(0));
}

export function remainingInstallments(rows: ScheduleRow[], asOf: Date): ScheduleRow[] {
  return rows.filter((r) => r.dueDate.getTime() > asOf.getTime());
}

export function remainingTotal(rows: ScheduleRow[], asOf: Date): Decimal {
  return remainingInstallments(rows, asOf).reduce((acc, r) => acc.plus(r.amount), money(0));
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export function sumReceipts(amounts: MoneyInput[]): Decimal {
  return amounts.reduce<Decimal>((acc, a) => acc.plus(money(a)), money(0));
}

export function outstandingBalance(totalPrice: MoneyInput, amountPaid: MoneyInput): Decimal {
  return money(totalPrice).minus(money(amountPaid)).toDecimalPlaces(2);
}

// ---------------------------------------------------------------------------
// Total effective cost (§7.6)
// ---------------------------------------------------------------------------

export interface TotalCostInput {
  cashToSeller: MoneyInput;
  totalContractPrice: MoneyInput;
  developerAssignmentFee: MoneyInput;
  maintenanceAndClubDues?: MoneyInput;
  remainingInstallmentsTotal: MoneyInput;
  /** Arrears the buyer agrees to settle as part of the assignment. */
  arrears?: MoneyInput;
  currentDeveloperPrice?: MoneyInput;
}

export interface TotalCostBreakdown {
  cashToSeller: Decimal;
  platformFee: Decimal;
  developerAssignmentFee: Decimal;
  maintenanceAndClubDues: Decimal;
  arrears: Decimal;
  /** Everything the buyer must produce at assignment time. */
  cashRequiredNow: Decimal;
  remainingInstallmentsTotal: Decimal;
  /** cashRequiredNow + remaining installments. */
  totalEffectiveCost: Decimal;
  developerTodayPrice: Decimal | null;
  /** Positive = cheaper than buying the same unit from the developer today. */
  savingVsDeveloperToday: Decimal | null;
  savingPctBps: number | null;
}

export function totalEffectiveCost(input: TotalCostInput): TotalCostBreakdown {
  const cashToSeller = money(input.cashToSeller);
  const platformFee = buyerPlatformFee(input.totalContractPrice);
  const assignFee = money(input.developerAssignmentFee);
  const dues = money(input.maintenanceAndClubDues);
  const arrears = money(input.arrears);
  const remaining = money(input.remainingInstallmentsTotal);

  const cashRequiredNow = cashToSeller.plus(platformFee).plus(assignFee).plus(dues).plus(arrears);
  const total = cashRequiredNow.plus(remaining);

  const devToday =
    input.currentDeveloperPrice === undefined || input.currentDeveloperPrice === null
      ? null
      : money(input.currentDeveloperPrice);

  let saving: Decimal | null = null;
  let savingPctBps: number | null = null;
  if (devToday && devToday.gt(0)) {
    saving = devToday.minus(total);
    savingPctBps = Math.round(saving.div(devToday).mul(10_000).toNumber());
  }

  return {
    cashToSeller,
    platformFee,
    developerAssignmentFee: assignFee,
    maintenanceAndClubDues: dues,
    arrears,
    cashRequiredNow,
    remainingInstallmentsTotal: remaining,
    totalEffectiveCost: total,
    developerTodayPrice: devToday,
    savingVsDeveloperToday: saving,
    savingPctBps,
  };
}

// ---------------------------------------------------------------------------
// Affordability
// ---------------------------------------------------------------------------

export type AffordabilityVerdict = "WITHIN" | "STRETCH" | "ABOVE";

export interface AffordabilityInput {
  availableCash: MoneyInput;
  maxInstallment: MoneyInput;
  buyerFrequency: Frequency;
  cashRequiredNow: MoneyInput;
  listingInstallmentAmount: MoneyInput;
  listingFrequency: Frequency;
}

export interface AffordabilityResult {
  verdict: AffordabilityVerdict;
  cashGap: Decimal;
  cashCoveragePct: number;
  /** Buyer capacity and listing demand, both normalised to EGP/month. */
  buyerMonthlyCapacity: Decimal;
  listingMonthlyDemand: Decimal;
  installmentGap: Decimal;
  installmentCoveragePct: number;
}

/** Within 15% short on either axis is a "stretch", beyond that is out of profile. */
const STRETCH_TOLERANCE = 0.85;

export function affordability(input: AffordabilityInput): AffordabilityResult {
  const cash = money(input.availableCash);
  const needed = money(input.cashRequiredNow);
  const cashGap = needed.minus(cash);
  const cashCoverage = needed.isZero() ? 1 : cash.div(needed).toNumber();

  const buyerMonthly = money(input.maxInstallment)
    .div(MONTHS_PER_PERIOD[input.buyerFrequency])
    .toDecimalPlaces(2);
  const listingMonthly = money(input.listingInstallmentAmount)
    .div(MONTHS_PER_PERIOD[input.listingFrequency])
    .toDecimalPlaces(2);
  const instGap = listingMonthly.minus(buyerMonthly);
  const instCoverage = listingMonthly.isZero() ? 1 : buyerMonthly.div(listingMonthly).toNumber();

  const worst = Math.min(cashCoverage, instCoverage);
  const verdict: AffordabilityVerdict =
    worst >= 1 ? "WITHIN" : worst >= STRETCH_TOLERANCE ? "STRETCH" : "ABOVE";

  return {
    verdict,
    cashGap,
    cashCoveragePct: Math.round(cashCoverage * 1000) / 10,
    buyerMonthlyCapacity: buyerMonthly,
    listingMonthlyDemand: listingMonthly,
    installmentGap: instGap,
    installmentCoveragePct: Math.round(instCoverage * 1000) / 10,
  };
}

// ---------------------------------------------------------------------------
// Cancellation comparison — the seller's real alternative
// ---------------------------------------------------------------------------

export interface CancellationComparison {
  penaltyPctBps: number;
  penaltyAmount: Decimal;
  refundIfCancelled: Decimal;
  cashViaAqary: Decimal;
  advantage: Decimal;
  refundWaitMonths: number;
}

/**
 * The brief's own worked example: cancellation deducts a percentage of the FULL
 * unit price from what the seller paid, and the remainder is refunded over years.
 */
export function cancellationComparison(args: {
  totalContractPrice: MoneyInput;
  amountPaid: MoneyInput;
  penaltyPctBps: number;
  cashViaAqary: MoneyInput;
  refundWaitMonths?: number;
}): CancellationComparison {
  const penalty = bps(args.totalContractPrice, args.penaltyPctBps);
  const paid = money(args.amountPaid);
  const refund = Decimal.max(paid.minus(penalty), money(0));
  const viaAqary = money(args.cashViaAqary);
  return {
    penaltyPctBps: args.penaltyPctBps,
    penaltyAmount: penalty,
    refundIfCancelled: refund,
    cashViaAqary: viaAqary,
    advantage: viaAqary.minus(refund),
    refundWaitMonths: args.refundWaitMonths ?? 36,
  };
}
