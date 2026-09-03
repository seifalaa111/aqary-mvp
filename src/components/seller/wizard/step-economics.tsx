"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Decimal } from "decimal.js";
import { Button, Callout, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/primitives";
import { buildInstallmentSchedule, type Frequency } from "@/lib/domain/calculators";
import { egp, formatDate } from "@/lib/format";

type V = Record<string, unknown>;

interface Special {
  label: string;
  amount: number;
  monthOffset: number;
  kind: string;
}

export function StepEconomics({
  value,
  onChange,
  errors,
  locale,
}: {
  value: V;
  onChange: (v: V) => void;
  errors: Record<string, string>;
  locale: string;
}) {
  const t = useTranslations("seller");
  const set = (k: string) => (v: unknown) => onChange({ ...value, [k]: v });
  const n = (k: string) => Number(value[k] ?? 0) || 0;
  const specials = (value.specialPayments as Special[]) ?? [];

  // The seller sees their own plan rebuilt as they type it. Same function the
  // reconciliation engine uses, so what they see is what we will check.
  const preview = useMemo(() => {
    const total = n("totalPrice");
    const count = n("numberOfInstallments");
    const start = String(value.planStartDate ?? "");
    if (!total || !count || !start) return null;
    try {
      const rows = buildInstallmentSchedule({
        totalPrice: total,
        downPayment: n("downPayment"),
        planStart: new Date(start),
        frequency: String(value.frequency ?? "QUARTERLY") as Frequency,
        numberOfInstallments: count,
        installmentAmount: n("installmentAmount") || undefined,
        contractSigningDate: value.signingDate ? new Date(String(value.signingDate)) : undefined,
        specialPayments: specials.map((s) => ({
          monthOffset: s.monthOffset,
          amount: s.amount,
          kind: s.kind as "BALLOON",
          label: s.label,
        })),
      });
      const now = new Date();
      const paid = rows.filter((r) => r.dueDate <= now);
      return {
        rows,
        dueToDate: paid.reduce((a, r) => a.plus(r.amount), new Decimal(0)),
        paidCount: paid.length,
        last: rows[rows.length - 1],
      };
    } catch {
      return null;
    }
  }, [value, specials]);

  const declaredPaid = n("totalPaid");
  const scheduleSaysPaid = preview ? preview.dueToDate.toNumber() : null;
  const gap =
    scheduleSaysPaid !== null && declaredPaid > 0
      ? Math.abs(declaredPaid - scheduleSaysPaid) / Math.max(declaredPaid, scheduleSaysPaid)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl text-ink">{t("step3")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-50">
          Everything here is recorded as your statement. It is never shown to a buyer as fact until an
          analyst has confirmed it against your documents.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contract number" htmlFor="contractNumber">
          <Input id="contractNumber" dir="ltr" className="money" value={String(value.contractNumber ?? "")} onChange={(e) => set("contractNumber")(e.target.value)} />
        </Field>
        <Field label="Signing date" htmlFor="signingDate" required error={errors.signingDate}>
          <Input id="signingDate" type="date" dir="ltr" value={String(value.signingDate ?? "")} onChange={(e) => set("signingDate")(e.target.value)} />
        </Field>
        <Field label="Plan start date" htmlFor="planStartDate" required error={errors.planStartDate}>
          <Input id="planStartDate" type="date" dir="ltr" value={String(value.planStartDate ?? "")} onChange={(e) => set("planStartDate")(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total contract price" htmlFor="totalPrice" required error={errors.totalPrice}>
          <MoneyInput id="totalPrice" locale={locale} value={String(value.totalPrice ?? "")} onChange={(e) => set("totalPrice")(e.target.value)} />
        </Field>
        <Field label="Down payment" htmlFor="downPayment" required>
          <MoneyInput id="downPayment" locale={locale} value={String(value.downPayment ?? "")} onChange={(e) => set("downPayment")(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Payment frequency" htmlFor="frequency" required>
          <Select id="frequency" value={String(value.frequency ?? "QUARTERLY")} onChange={(e) => set("frequency")(e.target.value)}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="SEMI_ANNUAL">Semi-annual</option>
            <option value="ANNUAL">Annual</option>
          </Select>
        </Field>
        <Field label="Number of installments" htmlFor="numberOfInstallments" required error={errors.numberOfInstallments}>
          <Input id="numberOfInstallments" type="number" min={1} max={200} className="money" value={String(value.numberOfInstallments ?? "")} onChange={(e) => set("numberOfInstallments")(e.target.value)} />
        </Field>
        <Field label="Installment amount" htmlFor="installmentAmount" required error={errors.installmentAmount}>
          <MoneyInput id="installmentAmount" locale={locale} value={String(value.installmentAmount ?? "")} onChange={(e) => set("installmentAmount")(e.target.value)} />
        </Field>
      </div>

      {/* ---- Special / milestone payments ---- */}
      <div className="rounded-md border border-rule bg-paper-sunken/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-ink-70">
            Milestone payments (delivery payment, balloon payment)
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              set("specialPayments")([...specials, { label: "Delivery payment", amount: 0, monthOffset: 36, kind: "DELIVERY" }])
            }
          >
            Add
          </Button>
        </div>
        {specials.length === 0 ? (
          <p className="text-2xs text-ink-50">
            None. Add one if your plan has a large payment at delivery or handover — buyers need to see it.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {specials.map((s, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[1fr_140px_120px_auto]">
                <Input
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => {
                    const next = [...specials];
                    next[i] = { ...s, label: e.target.value };
                    set("specialPayments")(next);
                  }}
                />
                <Input
                  type="number"
                  className="money"
                  value={s.amount}
                  placeholder="Amount"
                  onChange={(e) => {
                    const next = [...specials];
                    next[i] = { ...s, amount: Number(e.target.value) };
                    set("specialPayments")(next);
                  }}
                />
                <Input
                  type="number"
                  className="money"
                  value={s.monthOffset}
                  placeholder="Month"
                  onChange={(e) => {
                    const next = [...specials];
                    next[i] = { ...s, monthOffset: Number(e.target.value) };
                    set("specialPayments")(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set("specialPayments")(specials.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Maintenance deposit" htmlFor="maintenanceDeposit">
          <MoneyInput id="maintenanceDeposit" locale={locale} value={String(value.maintenanceDeposit ?? "")} onChange={(e) => set("maintenanceDeposit")(e.target.value)} />
        </Field>
        <Field label="Club / membership fee" htmlFor="clubFee">
          <MoneyInput id="clubFee" locale={locale} value={String(value.clubFee ?? "")} onChange={(e) => set("clubFee")(e.target.value)} />
        </Field>
      </div>

      {/* ---- The two figures the whole deal turns on ---- */}
      <div className="rounded-md border border-brass/30 bg-brass-soft p-4">
        <p className="eyebrow mb-3 text-brass">What you have paid so far</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total paid to date" htmlFor="totalPaid" required error={errors.totalPaid}>
            <MoneyInput id="totalPaid" locale={locale} value={String(value.totalPaid ?? "")} onChange={(e) => set("totalPaid")(e.target.value)} />
          </Field>
          <Field
            label="Outstanding balance"
            htmlFor="outstandingBalance"
            hint="Leave blank and we compute it from the price less what you have paid"
          >
            <MoneyInput id="outstandingBalance" locale={locale} value={String(value.outstandingBalance ?? "")} onChange={(e) => set("outstandingBalance")(e.target.value)} />
          </Field>
        </div>

        {scheduleSaysPaid !== null && declaredPaid > 0 && gap > 0.05 ? (
          <div className="mt-3">
            <Callout tone="pending" title="These two do not agree yet">
              Your plan says {egp(scheduleSaysPaid, { decimals: 0 })} should have fallen due by today, but you
              have entered {egp(declaredPaid, { decimals: 0 })}. Either is possible — people pay ahead and
              people fall behind — and your receipts will settle it. We flag it now so it is not a surprise
              later.
            </Callout>
          </div>
        ) : null}
      </div>

      {/* ---- Live schedule preview ---- */}
      {preview ? (
        <div className="rounded-md border border-rule bg-paper-raised p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-ink-70">Your payment plan, rebuilt</p>
            <p className="money text-2xs text-ink-50">
              {preview.rows.length} payments · last {formatDate(preview.last?.dueDate, locale)}
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto scrollbar-thin">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {preview.rows.slice(0, 40).map((r) => (
                  <tr key={r.sequence} className="rule-b">
                    <td className="money py-1.5 text-ink-30">{r.sequence}</td>
                    <td className="money py-1.5 text-ink-70">{formatDate(r.dueDate, locale)}</td>
                    <td className="py-1.5 text-ink-50">{r.label ?? r.kind.toLowerCase()}</td>
                    <td className="money py-1.5 text-end text-ink">{egp(r.amount, { style: "bare", decimals: 0 })}</td>
                    <td className="money py-1.5 text-end text-ink-30">{egp(r.runningBalance, { style: "compact" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ---- Arrears, finance, assignment terms ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-70">
            <input type="checkbox" checked={Boolean(value.hasArrears)} onChange={(e) => set("hasArrears")(e.target.checked)} className="size-4 accent-ink" />
            I have overdue installments
          </label>
          {value.hasArrears ? (
            <Field label="Arrears amount" htmlFor="arrearsAmount">
              <MoneyInput id="arrearsAmount" locale={locale} value={String(value.arrearsAmount ?? "")} onChange={(e) => set("arrearsAmount")(e.target.value)} />
            </Field>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-70">
            <input type="checkbox" checked={Boolean(value.hasBankFinance)} onChange={(e) => set("hasBankFinance")(e.target.checked)} className="size-4 accent-ink" />
            There is bank finance or a lien on the unit
          </label>
          {value.hasBankFinance ? (
            <Field label="Details" htmlFor="lienNote">
              <Input id="lienNote" value={String(value.lienNote ?? "")} onChange={(e) => set("lienNote")(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Does your contract permit assignment?" htmlFor="assignmentPermitted">
          <Select id="assignmentPermitted" value={String(value.assignmentPermitted ?? "UNKNOWN")} onChange={(e) => set("assignmentPermitted")(e.target.value)}>
            <option value="UNKNOWN">I am not sure</option>
            <option value="ALLOWED">Yes</option>
            <option value="CONDITIONAL">Yes, with conditions</option>
            <option value="NOT_ALLOWED">No</option>
          </Select>
        </Field>
        <Field label="Developer assignment fee" htmlFor="assignmentFee">
          <MoneyInput id="assignmentFee" locale={locale} value={String(value.assignmentFee ?? "")} onChange={(e) => set("assignmentFee")(e.target.value)} />
        </Field>
        <Field label="Cancellation penalty (%)" htmlFor="cancellationPenaltyPct">
          <Input id="cancellationPenaltyPct" type="number" min={0} max={100} step={0.5} className="money" value={String(value.cancellationPenaltyPct ?? "")} onChange={(e) => set("cancellationPenaltyPct")(e.target.value)} />
        </Field>
      </div>

      <Field label="Assignment conditions, in your own words" htmlFor="assignmentConditionsNote">
        <Textarea id="assignmentConditionsNote" rows={2} value={String(value.assignmentConditionsNote ?? "")} onChange={(e) => set("assignmentConditionsNote")(e.target.value)} />
      </Field>
    </div>
  );
}
