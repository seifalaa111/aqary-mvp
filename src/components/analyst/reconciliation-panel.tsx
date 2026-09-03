"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Callout, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge, SeverityBadge } from "@/components/ui/badges";
import { ProvenanceChip } from "@/components/ui/provenance";
import { egp } from "@/lib/format";

export interface ReconData {
  declaredPaid: string | null;
  receiptsPaid: string;
  developerStatedPaid: string | null;
  scheduleExpectedPaid: string | null;
  extractedPaid: string | null;
  worstDelta: string;
  worstDeltaPct: number;
  receiptCount: number;
  verifiedReceiptCount: number;
  receiptCoveragePct: number;
  totalPrice: string | null;
  outstandingFromReceipts: string | null;
}

export interface Discrepancy {
  id: string;
  fieldKey: string;
  severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL";
  status: string;
  titleEn: string;
  titleAr: string | null;
  sourceA: string;
  valueA: string | null;
  sourceB: string;
  valueB: string | null;
  delta: string | null;
  deltaPct: number | null;
  evidence: unknown;
  resolution: string | null;
}

/**
 * The four independent answers to "how much has actually been paid", side by
 * side, with the delta in large type. The brief's own example — declared 2.0m
 * against receipts 1.72m — renders exactly like this.
 */
export function ReconciliationPanel({
  data,
  discrepancies,
  locale,
  onResolve,
  pending,
}: {
  data: ReconData | null;
  discrepancies: Discrepancy[];
  locale: string;
  onResolve: (id: string, resolution: string, resolveTo?: string, waive?: boolean) => void;
  pending: boolean;
}) {
  const t = useTranslations("analyst");
  const tl = useTranslations("fieldLabel");
  const isAr = locale === "ar";
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [resolveTo, setResolveTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!data) {
    return <p className="text-sm text-ink-50">Reconciliation has not run for this file yet.</p>;
  }

  const sources: { label: string; value: string | null; source: string; note?: string }[] = [
    { label: t("reconDeclared"), value: data.declaredPaid, source: "SELLER_DECLARED" },
    {
      label: t("reconReceipts"),
      value: data.receiptsPaid,
      source: "RECEIPT_VERIFIED",
      note: `${data.verifiedReceiptCount} of ${data.receiptCount} receipts verified`,
    },
    { label: t("reconDeveloper"), value: data.developerStatedPaid, source: "DEVELOPER_CONFIRMED" },
    {
      label: t("reconSchedule"),
      value: data.scheduleExpectedPaid,
      source: "AI_EXTRACTED",
      note: "Due to date under the contract's own terms",
    },
  ];

  const present = sources.filter((s) => s.value !== null && Number(s.value) > 0);
  const max = present.length > 0 ? Math.max(...present.map((s) => Number(s.value))) : 0;

  const open = discrepancies.filter((d) => d.status === "OPEN");
  const closed = discrepancies.filter((d) => d.status !== "OPEN");

  return (
    <div className="flex flex-col gap-6">
      {/* ---- The delta, in large type ---- */}
      <div
        className={cn(
          "rounded-lg border p-5",
          data.worstDeltaPct >= 3
            ? "border-flagged/30 bg-flagged-soft"
            : data.worstDeltaPct >= 1
              ? "border-pending/30 bg-pending-soft"
              : "border-verified/30 bg-verified-soft",
        )}
      >
        <p className="eyebrow mb-1">{t("reconDelta")}</p>
        <p
          className={cn(
            "money text-money-xl font-semibold tracking-tight",
            data.worstDeltaPct >= 3 ? "text-flagged" : data.worstDeltaPct >= 1 ? "text-pending" : "text-verified",
          )}
        >
          {egp(data.worstDelta, { decimals: 0 })}
        </p>
        <p className="mt-1 text-sm text-ink-70">
          {data.worstDeltaPct.toFixed(2)}%{" "}
          {isAr
            ? "أكبر فارق بين مصدرين موجودين لقيمة المسدد."
            : "the widest gap between any two present sources for the amount paid."}
        </p>
      </div>

      {/* ---- Four sources, drawn to scale ---- */}
      <ul className="flex flex-col gap-3">
        {sources.map((s) => (
          <li key={s.label}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-ink-70">
                <ProvenanceChip source={s.source as never} size="xs" />
                {s.label}
              </span>
              <span className={cn("money text-sm font-semibold", s.value ? "text-ink" : "text-ink-30")}>
                {s.value ? egp(s.value, { decimals: 0 }) : t("reconNoData")}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-paper-sunken">
              {s.value && max > 0 ? (
                <div
                  className="h-full rounded-full bg-ink transition-[width]"
                  style={{ width: `${(Number(s.value) / max) * 100}%` }}
                />
              ) : null}
            </div>
            {s.note ? <p className="mt-1 text-2xs text-ink-30">{s.note}</p> : null}
          </li>
        ))}
      </ul>

      <dl className="rule-t text-sm">
        <Row label={isAr ? "إجمالي سعر التعاقد" : "Total contract price"} value={data.totalPrice ? egp(data.totalPrice, { decimals: 0 }) : "—"} />
        <Row
          label={isAr ? "الرصيد المتبقي حسب الإيصالات" : "Outstanding, from receipts"}
          value={data.outstandingFromReceipts ? egp(data.outstandingFromReceipts, { decimals: 0 }) : "—"}
        />
        <Row label={isAr ? "تغطية الإيصالات" : "Receipt coverage"} value={`${data.receiptCoveragePct}%`} />
      </dl>

      {/* ---- Discrepancies ---- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          {t("discrepancies")}{" "}
          <span className="ms-1 font-normal text-ink-50">
            {open.length} open · {closed.length} closed
          </span>
        </h3>

        {open.length === 0 ? (
          <Callout tone="verified">
            {isAr ? "كل المصادر متطابقة ضمن الحدود المسموحة." : "Every source reconciles within tolerance."}
          </Callout>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((d) => (
              <li key={d.id} className="rounded-md border border-pending/40 bg-paper-raised p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <SeverityBadge severity={d.severity} />
                    {tl(d.fieldKey as "TOTAL_PRICE")}
                  </span>
                  {d.delta ? (
                    <span className="money text-sm font-semibold text-pending">
                      Δ {egp(d.delta, { decimals: 0 })}
                      {d.deltaPct !== null ? (
                        <span className="ms-1 text-2xs font-normal">({d.deltaPct.toFixed(2)}%)</span>
                      ) : null}
                    </span>
                  ) : null}
                </div>

                <p className="mb-3 text-xs leading-relaxed text-ink-70">{isAr ? (d.titleAr ?? d.titleEn) : d.titleEn}</p>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <SideBySide source={d.sourceA} value={d.valueA} />
                  <SideBySide source={d.sourceB} value={d.valueB} />
                </div>

                <button
                  type="button"
                  onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                  className="mb-3 text-2xs text-info underline underline-offset-2"
                >
                  {expanded === d.id ? "Hide evidence" : t("evidence")}
                </button>
                {expanded === d.id ? (
                  <pre className="mb-3 max-h-48 overflow-auto rounded-sm bg-paper-sunken p-2 font-mono text-[10px] leading-relaxed text-ink-70 scrollbar-thin">
                    {JSON.stringify(d.evidence, null, 2)}
                  </pre>
                ) : null}

                {resolving === d.id ? (
                  <div className="flex flex-col gap-2">
                    <Select value={resolveTo} onChange={(e) => setResolveTo(e.target.value)}>
                      <option value="">{t("waive")}</option>
                      <option value={d.sourceA}>{t("resolveTo")} {d.sourceA.replace(/_/g, " ").toLowerCase()}</option>
                      <option value={d.sourceB}>{t("resolveTo")} {d.sourceB.replace(/_/g, " ").toLowerCase()}</option>
                    </Select>
                    <Textarea
                      rows={2}
                      placeholder={t("resolutionNote")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={pending}
                        disabled={note.trim().length < 8}
                        onClick={() => {
                          onResolve(d.id, note, resolveTo || undefined, !resolveTo);
                          setResolving(null);
                          setNote("");
                          setResolveTo("");
                        }}
                      >
                        {t("resolveDiscrepancy")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResolving(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setResolving(d.id)}>
                    {t("resolveDiscrepancy")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {closed.length > 0 ? (
          <ul className="rule-t mt-4">
            {closed.map((d) => (
              <li key={d.id} className="rule-b py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-50">
                    {tl(d.fieldKey as "TOTAL_PRICE")} — {d.status.toLowerCase()}
                  </span>
                  <Badge tone="neutral">{d.severity}</Badge>
                </div>
                {d.resolution ? <p className="mt-1 text-2xs text-ink-30">{d.resolution}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function SideBySide({ source, value }: { source: string; value: string | null }) {
  return (
    <div className="rounded-sm border border-rule bg-paper-sunken/60 p-2.5">
      <ProvenanceChip source={source as never} size="xs" />
      <p className="money mt-1 text-sm font-medium text-ink">{value ? egp(value, { decimals: 0 }) : "—"}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-xs text-ink">{value}</dd>
    </div>
  );
}
