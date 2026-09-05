"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { Card, CardBody, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp, formatDate } from "@/lib/format";

export interface TimelineRow {
  sequence: number;
  kind: string;
  dueDate: string;
  amount: string;
  status: string;
  label: string | null;
}

export interface TimelineReceipt {
  id: string;
  documentId: string | null;
  amount: string;
  date: string | null;
}

/**
 * Paid instalments are solid and clickable through to the receipt that proves
 * them; remaining instalments are outlined. Milestone payments are marked,
 * because a balloon payment two years out is the thing that catches buyers out.
 */
export function PaymentTimeline({
  rows,
  receipts,
  unlocked,
  locale,
  labels,
}: {
  rows: TimelineRow[];
  receipts: TimelineReceipt[];
  unlocked: boolean;
  locale: string;
  labels: { paid: string; upcoming: string; balloon: string; openReceipt: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const now = Date.now();

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-50">
            The verified payment schedule appears once an analyst has signed off the contract terms.
          </p>
        </CardBody>
      </Card>
    );
  }

  // Scale on the regular instalments. A down payment five times the size of an
  // instalment would otherwise flatten every other bar into a stub.
  const regular = rows.filter((r) => r.kind === "REGULAR").map((r) => Number(r.amount));
  const max = regular.length > 0 ? Math.max(...regular) : Math.max(...rows.map((r) => Number(r.amount)));
  const paidCount = rows.filter(
    (r) => r.status === "PAID",
  ).length;

  // Receipts are matched to instalments by nearest date within 45 days.
  const receiptFor = (row: TimelineRow) => {
    const target = new Date(row.dueDate).getTime();
    let best: TimelineReceipt | null = null;
    let bestDelta = Infinity;
    for (const r of receipts) {
      if (!r.date) continue;
      const delta = Math.abs(new Date(r.date).getTime() - target);
      if (delta < bestDelta && delta < 45 * 86400000) {
        best = r;
        bestDelta = delta;
      }
    }
    return best;
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-5 flex flex-wrap items-center gap-4 text-2xs">
          <span className="flex items-center gap-1.5 text-ink-70">
            <span className="size-2.5 rounded-xs bg-verified" /> {labels.paid} ({paidCount})
          </span>
          <span className="flex items-center gap-1.5 text-ink-70">
            <span className="size-2.5 rounded-xs border border-rule-strong" /> {labels.upcoming} (
            {rows.length - paidCount})
          </span>
          <span className="flex items-center gap-1.5 text-ink-70">
            <span className="size-2.5 rounded-xs bg-brass" /> {labels.balloon}
          </span>
        </div>

        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex min-w-full items-end gap-1" style={{ height: 140 }}>
            {rows.map((r) => {
              // Past due is not paid. Only the recorded status settles an instalment.
              const isPaid = r.status === "PAID";
              const isOverdue = r.status === "OVERDUE";
              const isUnverified = r.status === "UNVERIFIED";
              const isDue = r.status === "DUE";
              const milestone = r.kind !== "REGULAR" && r.kind !== "DOWN_PAYMENT";
              // Anything larger than a regular instalment is capped and hatched
              // so it reads as "bigger than the rest" without hiding them.
              const ratio = Number(r.amount) / max;
              const h = Math.max(10, Math.min(1, ratio) * 108) + (ratio > 1 ? 14 : 0);
              const receipt = isPaid ? receiptFor(r) : null;
              const barColor = isPaid
                ? milestone || ratio > 1
                  ? "bg-brass"
                  : "bg-verified"
                : isOverdue || isUnverified
                  ? "border border-b-0 border-flagged bg-flagged-soft"
                  : isDue
                    ? "border border-b-0 border-pending bg-pending-soft"
                    : ratio > 1
                      ? "border border-b-0 border-brass bg-brass-soft"
                      : "border border-b-0 border-rule-strong bg-paper-sunken";
              const bar = (
                <span
                  className={cn(
                    "block w-full rounded-t-xs transition-all duration-150",
                    barColor,
                    hover === r.sequence && "brightness-110",
                  )}
                  style={{ height: h }}
                />
              );
              const badgeTone = isPaid
                ? "verified"
                : isOverdue || isUnverified
                  ? "flagged"
                  : isDue
                    ? "pending"
                    : "neutral";
              const badgeText = isPaid
                ? labels.paid
                : isOverdue
                  ? "Overdue"
                  : isUnverified
                    ? "Unverified"
                    : isDue
                      ? "Due"
                      : labels.upcoming;

              return (
                <div
                  key={r.sequence}
                  className="group relative flex min-w-[10px] flex-1 flex-col items-center"
                  onMouseEnter={() => setHover(r.sequence)}
                  onMouseLeave={() => setHover(null)}
                >
                  {unlocked && receipt?.documentId ? (
                    <Link
                      href={`/documents/${receipt.documentId}`}
                      className="w-full"
                      aria-label={`${labels.openReceipt} — ${egp(r.amount)}`}
                    >
                      {bar}
                    </Link>
                  ) : (
                    bar
                  )}

                  {hover === r.sequence ? (
                    <div className="pointer-events-none absolute bottom-full z-20 mb-2 w-44 rounded-md border border-rule bg-paper-raised p-2.5 shadow-e3">
                      <p className="money text-sm font-semibold text-ink">{egp(r.amount, { decimals: 0 })}</p>
                      <p className="text-2xs text-ink-50">{formatDate(r.dueDate, locale)}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone={badgeTone}>{badgeText}</Badge>
                        {milestone ? <Badge tone="brass">{r.kind.toLowerCase()}</Badge> : null}
                      </div>
                      {receipt && unlocked ? (
                        <p className="mt-1.5 text-2xs text-info underline">{labels.openReceipt}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex justify-between font-mono text-2xs uppercase tracking-wider text-ink-50">
          <span>{formatDate(rows[0]!.dueDate, locale)}</span>
          <span>{formatDate(rows[rows.length - 1]!.dueDate, locale)}</span>
        </div>
      </CardBody>
    </Card>
  );
}
