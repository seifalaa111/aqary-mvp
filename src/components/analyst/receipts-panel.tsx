"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp, formatDate } from "@/lib/format";

export interface ReceiptRow {
  id: string;
  documentId: string | null;
  fileName: string | null;
  declaredAmount: string | null;
  extractedAmount: string | null;
  verifiedAmount: string | null;
  date: string | null;
  method: string;
  status: string;
  confidence: number | null;
}

/**
 * Receipt-by-receipt verification. Verifying a receipt is what makes it count
 * toward the receipt-derived amount paid, which is what the reconciliation
 * panel then compares against everything else.
 */
export function ReceiptsPanel({
  receipts,
  locale,
  onReview,
  onOpen,
  pending,
}: {
  receipts: ReceiptRow[];
  locale: string;
  onReview: (id: string, decision: "VERIFY" | "REJECT" | "DUPLICATE", amount?: string) => void;
  onOpen: (documentId: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("analyst");
  const tk = useTranslations("consoleUi");
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const totals = receipts.reduce(
    (acc, r) => {
      const v = Number(r.verifiedAmount ?? 0);
      const p = Number(r.extractedAmount ?? r.declaredAmount ?? 0);
      return {
        verified: acc.verified + (r.status === "VERIFIED" ? v : 0),
        pending: acc.pending + (r.status === "PENDING" ? p : 0),
      };
    },
    { verified: 0, pending: 0 },
  );

  if (receipts.length === 0) {
    return <p className="text-sm text-ink-50">{tk("noReceipts")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule">
        <div className="bg-paper-raised p-3">
          <dt className="eyebrow mb-1">{tk("verifiedTotal")}</dt>
          <dd className="money text-money-sm font-semibold text-verified">{egp(totals.verified, { decimals: 0 })}</dd>
        </div>
        <div className="bg-paper-raised p-3">
          <dt className="eyebrow mb-1">{tk("stillPendingReview")}</dt>
          <dd className="money text-money-sm font-semibold text-pending">{egp(totals.pending, { decimals: 0 })}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="rule-b">
              <th className="py-2 text-start text-xs font-medium text-ink-50">Date</th>
              <th className="py-2 text-end text-xs font-medium text-ink-50">{tk("declared")}</th>
              <th className="py-2 text-end text-xs font-medium text-ink-50">Read</th>
              <th className="py-2 text-end text-xs font-medium text-ink-50">{tk("statusVerified")}</th>
              <th className="py-2 text-center text-xs font-medium text-ink-50">Status</th>
              <th className="py-2 text-end text-xs font-medium text-ink-50">Action</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "rule-b",
                  r.status === "VERIFIED" && "bg-verified-soft/25",
                  r.status === "DUPLICATE" && "bg-flagged-soft/30",
                )}
              >
                <td className="money py-2 text-xs text-ink">
                  {r.documentId ? (
                    <button
                      type="button"
                      onClick={() => onOpen(r.documentId!)}
                      className="text-info underline underline-offset-2"
                    >
                      {formatDate(r.date, locale)}
                    </button>
                  ) : (
                    formatDate(r.date, locale)
                  )}
                </td>
                <td className="money py-2 text-end text-xs text-ink-50">
                  {r.declaredAmount ? egp(r.declaredAmount, { style: "bare", decimals: 0 }) : "—"}
                </td>
                <td className="money py-2 text-end text-xs text-ink-70">
                  {r.extractedAmount ? egp(r.extractedAmount, { style: "bare", decimals: 0 }) : "—"}
                  {r.confidence != null ? (
                    <span className="ms-1 text-[9px] text-ink-30">{Math.round(r.confidence * 100)}%</span>
                  ) : null}
                </td>
                <td className="money py-2 text-end text-xs font-medium text-ink">
                  {editing === r.id ? (
                    <Input
                      className="money h-8 w-28 text-end"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      autoFocus
                    />
                  ) : r.verifiedAmount ? (
                    egp(r.verifiedAmount, { style: "bare", decimals: 0 })
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 text-center">
                  <Badge
                    tone={
                      r.status === "VERIFIED"
                        ? "verified"
                        : r.status === "DUPLICATE" || r.status === "REJECTED"
                          ? "flagged"
                          : "pending"
                    }
                  >
                    {r.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="py-2 text-end">
                  {r.status === "PENDING" ? (
                    editing === r.id ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          loading={pending}
                          onClick={() => {
                            onReview(r.id, "VERIFY", amount);
                            setEditing(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" loading={pending} onClick={() => onReview(r.id, "VERIFY")}>
                          {t("receiptVerify")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(r.id);
                            setAmount(r.extractedAmount ?? r.declaredAmount ?? "");
                          }}
                        >
                          {t("correctFieldAction")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onReview(r.id, "DUPLICATE")}>
                          {t("receiptDuplicate")}
                        </Button>
                      </div>
                    )
                  ) : (
                    <span className="text-2xs text-ink-30">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
