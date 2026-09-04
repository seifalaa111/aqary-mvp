"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Field, Input } from "@/components/ui/primitives";
import { updateCapacityAction } from "@/app/actions/buyer";
import { egp } from "@/lib/format";

export function CapacityForm({
  initialCash,
  initialInstallment,
}: {
  initialCash: number;
  initialInstallment: number;
}) {
  const router = useRouter();
  const [cash, setCash] = useState<string>(initialCash ? initialCash.toString() : "");
  const [installment, setInstallment] = useState<string>(
    initialInstallment ? initialInstallment.toString() : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [pending, startTransition] = useTransition();

  const numCash = Number(cash) || 0;
  const numInstallment = Number(installment) || 0;

  // Rule of thumb for estimated purchasing power: cash available + 12 quarters (~3 years) of installments
  const estimatedPower = numCash + numInstallment * 12;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (numCash <= 0 || numInstallment <= 0) {
      setError("Both cash and installment capacity must be greater than zero.");
      return;
    }

    startTransition(async () => {
      const res = await updateCapacityAction({
        availableCash: numCash,
        maxInstallment: numInstallment,
      });

      if (!res.ok) {
        setError(res.error);
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? <Callout tone="flagged">{error}</Callout> : null}
      {success ? (
        <Callout tone="verified">Financial capacity updated successfully.</Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Available Cash (EGP)" hint="Liquid capital ready for down payment / cash-to-seller">
          <Input
            type="number"
            min="0"
            step="10000"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="e.g. 1500000"
            required
          />
        </Field>

        <Field label="Maximum Quarterly Installment (EGP)" hint="Max installment you are comfortable paying per period">
          <Input
            type="number"
            min="0"
            step="5000"
            value={installment}
            onChange={(e) => setInstallment(e.target.value)}
            placeholder="e.g. 120000"
            required
          />
        </Field>
      </div>

      {numCash > 0 && numInstallment > 0 ? (
        <div className="rounded-sm border border-rule-subtle bg-paper-subtle p-3 text-xs text-ink-70">
          <span className="font-semibold text-ink">Estimated Purchasing Range: </span>
          <span>Up to approximately </span>
          <span className="money font-semibold text-brass">{egp(estimatedPower)}</span>
          <span className="text-ink-40"> (assumes upfront cash + 3 years installments)</span>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
