import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import {
  affordability,
  buildInstallmentSchedule,
  buyerPlatformFee,
  cancellationComparison,
  checkAskingCash,
  developerAssignmentFee,
  expectedPaidToDate,
  minAcceptableCash,
  outstandingBalance,
  remainingInstallments,
  remainingTotal,
  sellerFee,
  sumReceipts,
  totalEffectiveCost,
} from "@/lib/domain/calculators";
import { config } from "@/lib/config";

describe("no-overprice invariant", () => {
  it("accepts an asking cash equal to the verified amount paid", () => {
    const r = checkAskingCash("2000000", "2000000");
    expect(r.ok).toBe(true);
  });

  it("accepts an asking cash below the verified amount paid", () => {
    expect(checkAskingCash("1800000", "2000000").ok).toBe(true);
  });

  it("REJECTS an asking cash above the verified amount paid", () => {
    const r = checkAskingCash("2000001", "2000000");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("ABOVE_VERIFIED_PAID");
    expect(r.maxAllowed?.toString()).toBe("2000000");
  });

  it("rejects a negative asking cash", () => {
    expect(checkAskingCash("-1", "2000000").reason).toBe("NEGATIVE");
  });

  it("refuses to judge without a verified baseline", () => {
    expect(checkAskingCash("100", null).reason).toBe("NO_VERIFIED_BASELINE");
  });

  it("is exact at the boundary rather than floating-point approximate", () => {
    // 0.1 + 0.2 !== 0.3 in float. Decimal must not have that problem.
    const paid = new Decimal("0.1").plus("0.2");
    expect(checkAskingCash("0.3", paid).ok).toBe(true);
    expect(checkAskingCash("0.30000000001", paid).ok).toBe(false);
  });
});

describe("flexibility floor", () => {
  it("computes the lowest figure a seller has pre-authorised", () => {
    expect(minAcceptableCash("1000000", 5).toString()).toBe("950000");
  });

  it("clamps flexibility to the configured maximum", () => {
    const clamped = minAcceptableCash("1000000", 999);
    const atMax = minAcceptableCash("1000000", config.MAX_FLEXIBILITY_PCT);
    expect(clamped.toString()).toBe(atMax.toString());
  });

  it("treats zero flexibility as the full asking cash", () => {
    expect(minAcceptableCash("1234567.89", 0).toString()).toBe("1234567.89");
  });
});

describe("fees", () => {
  it("charges the seller nothing", () => {
    expect(sellerFee("9500000").toString()).toBe("0");
    expect(config.SELLER_FEE_BPS).toBe(0);
  });

  it("charges the buyer 1.25% of the total contract value", () => {
    expect(config.PLATFORM_FEE_BPS).toBe(125);
    expect(buyerPlatformFee("9500000").toString()).toBe("118750");
  });

  it("reads the fee from configuration, not a literal", () => {
    const price = new Decimal("1000000");
    const expected = price.mul(config.PLATFORM_FEE_BPS).div(10_000);
    expect(buyerPlatformFee(price).toString()).toBe(expected.toString());
  });

  it("computes a percentage developer assignment fee on the contract price", () => {
    const fee = developerAssignmentFee(
      { feeType: "PERCENT", feePercentBps: 250, feeBasis: "TOTAL_CONTRACT_PRICE" },
      { totalContractPrice: "8000000", outstandingBalance: "6000000" },
    );
    expect(fee.toString()).toBe("200000");
  });

  it("computes a percentage fee on the outstanding balance when the basis says so", () => {
    const fee = developerAssignmentFee(
      { feeType: "PERCENT", feePercentBps: 275, feeBasis: "OUTSTANDING_BALANCE" },
      { totalContractPrice: "8000000", outstandingBalance: "6000000" },
    );
    expect(fee.toString()).toBe("165000");
  });

  it("computes a fixed developer fee regardless of price", () => {
    const fee = developerAssignmentFee(
      { feeType: "FIXED", feeFixedAmount: "75000" },
      { totalContractPrice: "20000000" },
    );
    expect(fee.toString()).toBe("75000");
  });

  it("returns zero when no policy is on file", () => {
    expect(developerAssignmentFee(null, { totalContractPrice: "8000000" }).toString()).toBe("0");
  });
});

describe("installment schedule", () => {
  const base = {
    totalPrice: "8400000",
    downPayment: "840000",
    planStart: new Date(Date.UTC(2022, 7, 1)),
    frequency: "QUARTERLY" as const,
    numberOfInstallments: 30,
    contractSigningDate: new Date(Date.UTC(2022, 4, 18)),
  };

  it("produces the down payment plus every installment", () => {
    const rows = buildInstallmentSchedule(base);
    expect(rows).toHaveLength(31);
    expect(rows[0]!.kind).toBe("DOWN_PAYMENT");
  });

  it("closes exactly on the total price with no rounding drift", () => {
    const rows = buildInstallmentSchedule(base);
    const sum = rows.reduce((a, r) => a.plus(r.amount), new Decimal(0));
    expect(sum.toString()).toBe("8400000");
    expect(rows[rows.length - 1]!.runningBalance.toString()).toBe("0");
  });

  it("closes exactly even when the division does not come out evenly", () => {
    const rows = buildInstallmentSchedule({ ...base, totalPrice: "1000000", downPayment: "1", numberOfInstallments: 7 });
    const sum = rows.reduce((a, r) => a.plus(r.amount), new Decimal(0));
    expect(sum.toString()).toBe("1000000");
  });

  it("spaces quarterly instalments three months apart", () => {
    const rows = buildInstallmentSchedule(base).filter((r) => r.kind === "REGULAR");
    const first = rows[0]!.dueDate;
    const second = rows[1]!.dueDate;
    const months =
      (second.getUTCFullYear() - first.getUTCFullYear()) * 12 + (second.getUTCMonth() - first.getUTCMonth());
    expect(months).toBe(3);
  });

  it("spaces monthly instalments one month apart", () => {
    const rows = buildInstallmentSchedule({ ...base, frequency: "MONTHLY" }).filter((r) => r.kind === "REGULAR");
    const months =
      (rows[1]!.dueDate.getUTCFullYear() - rows[0]!.dueDate.getUTCFullYear()) * 12 +
      (rows[1]!.dueDate.getUTCMonth() - rows[0]!.dueDate.getUTCMonth());
    expect(months).toBe(1);
  });

  it("places milestone payments in date order among the instalments", () => {
    const rows = buildInstallmentSchedule({
      ...base,
      specialPayments: [{ monthOffset: 36, amount: "500000", kind: "DELIVERY", label: "Delivery payment" }],
    });
    const dates = rows.map((r) => r.dueDate.getTime());
    // The down payment sits first; everything after it is date-ordered.
    expect([...dates.slice(1)].sort((a, b) => a - b)).toEqual(dates.slice(1));
    expect(rows.some((r) => r.kind === "DELIVERY")).toBe(true);
  });

  it("keeps the running balance monotonically decreasing", () => {
    const rows = buildInstallmentSchedule(base);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.runningBalance.lte(rows[i - 1]!.runningBalance)).toBe(true);
    }
  });

  it("sums only what has fallen due by a given date", () => {
    const rows = buildInstallmentSchedule(base);
    const asOf = new Date(Date.UTC(2023, 7, 1));
    const due = expectedPaidToDate(rows, asOf);
    const manual = rows
      .filter((r) => r.dueDate <= asOf)
      .reduce((a, r) => a.plus(r.amount), new Decimal(0));
    expect(due.toString()).toBe(manual.toString());
  });

  it("splits remaining from paid without double counting", () => {
    const rows = buildInstallmentSchedule(base);
    const asOf = new Date(Date.UTC(2024, 0, 1));
    const paid = expectedPaidToDate(rows, asOf);
    const rest = remainingTotal(rows, asOf);
    expect(paid.plus(rest).toString()).toBe("8400000");
    expect(remainingInstallments(rows, asOf).every((r) => r.dueDate > asOf)).toBe(true);
  });
});

describe("balances", () => {
  it("sums receipts exactly", () => {
    expect(sumReceipts(["100.10", "200.20", "0.70"]).toString()).toBe("301");
  });

  it("computes outstanding as price less paid", () => {
    expect(outstandingBalance("8400000", "2520000").toString()).toBe("5880000");
  });

  it("does not lose cents across many receipts", () => {
    const many = Array.from({ length: 100 }, () => "0.01");
    expect(sumReceipts(many).toString()).toBe("1");
  });
});

describe("total effective cost", () => {
  const input = {
    cashToSeller: "2000000",
    totalContractPrice: "8000000",
    developerAssignmentFee: "200000",
    remainingInstallmentsTotal: "6000000",
    currentDeveloperPrice: "12000000",
  };

  it("adds every component the buyer actually pays", () => {
    const r = totalEffectiveCost(input);
    expect(r.platformFee.toString()).toBe("100000"); // 1.25% of 8m
    expect(r.cashRequiredNow.toString()).toBe("2300000"); // 2m + 100k + 200k
    expect(r.totalEffectiveCost.toString()).toBe("8300000");
  });

  it("compares against buying the same unit from the developer today", () => {
    const r = totalEffectiveCost(input);
    expect(r.savingVsDeveloperToday!.toString()).toBe("3700000");
    expect(r.savingPctBps).toBe(3083);
  });

  it("includes arrears the buyer agrees to settle", () => {
    const r = totalEffectiveCost({ ...input, arrears: "250000" });
    expect(r.cashRequiredNow.toString()).toBe("2550000");
    expect(r.totalEffectiveCost.toString()).toBe("8550000");
  });

  it("returns no comparison when there is no developer price", () => {
    const r = totalEffectiveCost({ ...input, currentDeveloperPrice: undefined });
    expect(r.savingVsDeveloperToday).toBeNull();
    expect(r.savingPctBps).toBeNull();
  });

  it("reports a negative saving honestly rather than clamping it", () => {
    const r = totalEffectiveCost({ ...input, currentDeveloperPrice: "7000000" });
    expect(r.savingVsDeveloperToday!.isNegative()).toBe(true);
    expect(r.savingPctBps!).toBeLessThan(0);
  });
});

describe("affordability", () => {
  const listing = {
    cashRequiredNow: "2300000",
    listingInstallmentAmount: "250000",
    listingFrequency: "QUARTERLY" as const,
  };

  it("is WITHIN when both cash and installment clear", () => {
    const r = affordability({ ...listing, availableCash: "2500000", maxInstallment: "300000", buyerFrequency: "QUARTERLY" });
    expect(r.verdict).toBe("WITHIN");
  });

  it("is STRETCH when short by less than 15% on one axis", () => {
    const r = affordability({ ...listing, availableCash: "2100000", maxInstallment: "300000", buyerFrequency: "QUARTERLY" });
    expect(r.verdict).toBe("STRETCH");
  });

  it("is ABOVE when materially short on cash", () => {
    const r = affordability({ ...listing, availableCash: "1000000", maxInstallment: "300000", buyerFrequency: "QUARTERLY" });
    expect(r.verdict).toBe("ABOVE");
    expect(r.cashGap.toString()).toBe("1300000");
  });

  it("normalises different payment frequencies to a monthly basis", () => {
    // 100k monthly is 300k per quarter — enough for a 250k quarterly instalment.
    const r = affordability({ ...listing, availableCash: "3000000", maxInstallment: "100000", buyerFrequency: "MONTHLY" });
    expect(r.buyerMonthlyCapacity.toString()).toBe("100000");
    expect(r.listingMonthlyDemand.toString()).toBe("83333.33");
    expect(r.verdict).toBe("WITHIN");
  });

  it("catches a buyer whose annual figure looks large but is not", () => {
    // 400k a year is 33.3k a month against a 83.3k monthly demand.
    const r = affordability({ ...listing, availableCash: "3000000", maxInstallment: "400000", buyerFrequency: "ANNUAL" });
    expect(r.verdict).toBe("ABOVE");
  });
});

describe("cancellation comparison", () => {
  it("reproduces the brief's own worked example", () => {
    // 10m unit, 2m paid, 15% cancellation deduction on the FULL unit price.
    const r = cancellationComparison({
      totalContractPrice: "10000000",
      amountPaid: "2000000",
      penaltyPctBps: 1500,
      cashViaAqary: "2000000",
    });
    expect(r.penaltyAmount.toString()).toBe("1500000");
    expect(r.refundIfCancelled.toString()).toBe("500000");
    expect(r.advantage.toString()).toBe("1500000");
  });

  it("never returns a negative refund", () => {
    const r = cancellationComparison({
      totalContractPrice: "10000000",
      amountPaid: "500000",
      penaltyPctBps: 1500,
      cashViaAqary: "500000",
    });
    expect(r.refundIfCancelled.toString()).toBe("0");
  });
});
