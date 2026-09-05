"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import type { PaymentKind, PaymentStatus } from "@prisma/client";
import { Button, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp, formatDate, relativeTime } from "@/lib/format";
import {
  adminRetryPaymentAction,
  adminReconcilePaymentAction,
  adminRecordPaymentExceptionAction,
} from "@/app/actions/admin";

export interface PaymentEventItem {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface PaymentRowItem {
  id: string;
  dealId: string;
  dealReference: string;
  unitCode: string;
  projectName: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: string;
  provider: string;
  providerRef: string | null;
  failureCode: string | null;
  failureReason: string | null;
  attempts: number;
  createdAt: string;
  settledAt: string | null;
  events: PaymentEventItem[];
}

export function PaymentsManager({
  locale,
  payments,
}: {
  locale: string;
  payments: PaymentRowItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [pending, startTransition] = useTransition();

  // Drawer / Modal States
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [exceptionPayment, setExceptionPayment] = useState<PaymentRowItem | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionRef, setExceptionRef] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const t = useTranslations("admin");
  const tk = useTranslations("consoleUi");
  const isAr = locale === "ar";

  const filtered = payments.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        p.dealReference.toLowerCase().includes(q) ||
        (p.providerRef && p.providerRef.toLowerCase().includes(q)) ||
        p.unitCode.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const inspected = payments.find((p) => p.id === inspectingId);

  const handleRetry = (p: PaymentRowItem) => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await adminRetryPaymentAction({ paymentId: p.id, dealId: p.dealId });
      if (!res.ok) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Retry instruction dispatched for payment ${p.id.slice(-8)}`);
        router.refresh();
      }
    });
  };

  const handleReconcile = (p: PaymentRowItem) => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await adminReconcilePaymentAction(p.id);
      if (!res.ok) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Reconciliation query completed with payment gateway.`);
        router.refresh();
      }
    });
  };

  const handleExceptionSubmit = () => {
    if (!exceptionPayment) return;
    setActionError(null);
    startTransition(async () => {
      const res = await adminRecordPaymentExceptionAction({
        paymentId: exceptionPayment.id,
        dealId: exceptionPayment.dealId,
        reason: exceptionReason,
        reference: exceptionRef,
      });
      if (!res.ok) {
        setActionError(res.error);
      } else {
        setExceptionPayment(null);
        setExceptionReason("");
        setExceptionRef("");
        setActionSuccess(`Operational exception registered and payment marked SUCCEEDED.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[260px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPaymentIdDealReference")}
          />
        </div>
        <div className="w-44">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">{t("allStatuses")}</option>
            <option value="INITIATED">INITIATED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="SUCCEEDED">SUCCEEDED</option>
            <option value="FAILED">FAILED</option>
          </Select>
        </div>
        {(search || statusFilter !== "ALL") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatusFilter("ALL");
            }}
          >
            {t("clearFilters")}
          </Button>
        )}
      </div>

      {actionError && (
        <div className="p-3 bg-flagged-soft/50 border border-flagged/40 rounded-md text-xs text-flagged">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-verified-soft/50 border border-verified/40 rounded-md text-xs text-verified font-medium">
          {actionSuccess}
        </div>
      )}

      {/* Exception Modal */}
      {exceptionPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4">
            <h2 className="font-display text-lg text-ink">
              {t("recordOperationalException")}
            </h2>
            <p className="text-xs text-ink-50">
              {t("forceSettlePaymentClearedThrough")}
            </p>

            <div>
              <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("bankRef4")}</label>
              <Input
                value={exceptionRef}
                onChange={(e) => setExceptionRef(e.target.value)}
                placeholder={tk("egBankRef")}
              />
            </div>

            <div>
              <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("justificationNote10")}</label>
              <Textarea
                rows={3}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                placeholder={tk("exceptionReasonPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setExceptionPayment(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                disabled={exceptionReason.trim().length < 10 || exceptionRef.trim().length < 4}
                onClick={handleExceptionSubmit}
              >{tk("confirmException")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Events Drawer */}
      {inspected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="h-full w-full max-w-lg overflow-y-auto bg-paper-raised p-6 shadow-2xl border-s border-rule space-y-6">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h2 className="font-display text-base text-ink">
                  Payment {inspected.id.slice(-8)}
                </h2>
                <span className="font-mono text-2xs text-ink-50">Deal {inspected.dealReference}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setInspectingId(null)}>
                ✕
              </Button>
            </div>

            <div className="rounded-md border border-rule bg-paper-sunken/40 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-50">Amount:</span>
                <span className="money font-semibold text-ink">{egp(inspected.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-50">Status:</span>
                <span className="font-bold text-ink">{inspected.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-50">{tk("providerReference")}</span>
                <span className="font-mono text-ink">{inspected.providerRef || "None"}</span>
              </div>
              {inspected.failureReason && (
                <div className="pt-1 border-t border-rule">
                  <span className="text-flagged block font-medium">{tk("failureReason")}</span>
                  <span className="text-flagged text-2xs">{inspected.failureReason}</span>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-ink mb-2">{tk("paymentEventLog")}</h3>
              {inspected.events.length === 0 ? (
                <p className="text-xs text-ink-50">{tk("noPaymentEvents")}</p>
              ) : (
                <ul className="divide-y divide-rule border border-rule rounded-md bg-paper-sunken/20">
                  {inspected.events.map((e) => (
                    <li key={e.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium text-ink">{e.type}</span>
                        <span className="text-2xs text-ink-50">{formatDate(e.createdAt, locale)}</span>
                      </div>
                      <pre className="text-[10px] bg-paper-raised p-2 rounded border border-rule overflow-x-auto text-ink-70 font-mono">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          {t("noPaymentsMatchCurrentFilters")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[1000px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("paymentDeal")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Kind</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Amount</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("gatewayRef")}</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">Status</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">{tk("attempts")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isFailed = p.status === "FAILED";
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-rule hover:bg-paper-sunken/30 transition-colors",
                      isFailed && "bg-flagged-soft/25"
                    )}
                  >
                    <td className="p-3">
                      <div className="font-mono text-xs font-semibold text-ink">{p.id.slice(-10)}</div>
                      <span className="text-2xs text-ink-50">
                        Deal {p.dealReference} · {p.projectName}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="text-xs font-medium text-ink font-mono">{p.kind}</span>
                    </td>

                    <td className="money p-3 text-end font-bold text-ink">
                      {egp(p.amount)}
                    </td>

                    <td className="p-3">
                      <div className="text-xs text-ink">{p.provider}</div>
                      <span className="font-mono text-2xs text-ink-50">
                        {p.providerRef || "—"}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      <Badge
                        tone={
                          p.status === "SUCCEEDED"
                            ? "verified"
                            : p.status === "FAILED"
                            ? "flagged"
                            : "pending"
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.failureReason && (
                        <p className="text-2xs text-flagged truncate max-w-xs mt-0.5">
                          {p.failureReason}
                        </p>
                      )}
                    </td>

                    <td className="p-3 text-center text-xs font-mono text-ink">
                      {p.attempts}
                    </td>

                    <td className="p-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setInspectingId(p.id)}
                        >
                          Events
                        </Button>
                        {isFailed && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={pending}
                            onClick={() => handleRetry(p)}
                          >
                            Retry
                          </Button>
                        )}
                        {p.providerRef && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={pending}
                            onClick={() => handleReconcile(p)}
                          >{tk("reconcile")}</Button>
                        )}
                        {p.status !== "SUCCEEDED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setExceptionPayment(p);
                              setExceptionReason("");
                              setExceptionRef("");
                            }}
                          >{tk("exception")}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
