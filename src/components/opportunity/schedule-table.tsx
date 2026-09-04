"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, CardBody, Eyebrow, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp, formatDate } from "@/lib/format";

export interface ScheduleRow {
  sequence: number;
  kind: string;
  dueDate: string;
  amount: string;
  runningBalance: string;
  status: string;
  label: string | null;
}

export function ScheduleTable({
  rows,
  locale,
  reference,
  title,
  downloadLabel,
}: {
  rows: ScheduleRow[];
  locale: string;
  reference: string;
  title: string;
  downloadLabel: string;
}) {
  const t = useTranslations("opportunity");
  const tk = useTranslations("installmentKind");
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const kindLabel = (kind: string) => (tk.has(kind) ? tk(kind) : kind.replace(/_/g, " ").toLowerCase());
  const visible = expanded ? rows : rows.slice(0, 12);

  if (rows.length === 0) return null;

  const download = () => {
    const header = ["#", "Kind", "Due date", "Amount (EGP)", "Running balance (EGP)", "Status"];
    const lines = rows.map((r) => [
      r.sequence,
      r.kind,
      r.dueDate.slice(0, 10),
      r.amount,
      r.runningBalance,
      new Date(r.dueDate).getTime() <= now ? "PAID" : "UPCOMING",
    ]);
    const csv = [header, ...lines].map((l) => l.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reference}-schedule.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{title}</Eyebrow>
          <h2 className="mt-1 text-xl font-semibold text-ink">{title}</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={download}>
          {downloadLabel}
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="rule-b bg-paper-sunken/70">
                  <th className="p-3 text-start text-xs font-medium text-ink-50">{t("schedSeq")}</th>
                  <th className="p-3 text-start text-xs font-medium text-ink-50">{t("schedDue")}</th>
                  <th className="p-3 text-start text-xs font-medium text-ink-50">{t("schedType")}</th>
                  <th className="p-3 text-end text-xs font-medium text-ink-50">{t("schedAmount")}</th>
                  <th className="p-3 text-end text-xs font-medium text-ink-50">{t("schedBalance")}</th>
                  <th className="p-3 text-end text-xs font-medium text-ink-50">{t("schedStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const paid = new Date(r.dueDate).getTime() <= now;
                  return (
                    <tr key={r.sequence} className={cn("rule-b", paid && "bg-verified-soft/30")}>
                      <td className="money p-3 text-ink-50">{r.sequence}</td>
                      <td className="money p-3 text-ink">{formatDate(r.dueDate, locale)}</td>
                      <td className="p-3 text-xs text-ink-70">
                        {/* A stored label is an analyst's own wording and wins,
                            but only when it says something the localised kind
                            does not — the seed writes the English kind name
                            into `label`, which would defeat the translation. */}
                        {r.label && r.label.toLowerCase() !== r.kind.replace(/_/g, " ").toLowerCase()
                          ? r.label
                          : kindLabel(r.kind)}
                      </td>
                      <td className="money p-3 text-end font-medium text-ink">
                        {egp(r.amount, { style: "bare", decimals: 0 })}
                      </td>
                      <td className="money p-3 text-end text-ink-50">
                        {egp(r.runningBalance, { style: "bare", decimals: 0 })}
                      </td>
                      <td className="p-3 text-end">
                        <Badge tone={paid ? "verified" : "neutral"}>
                          {paid ? t("paid") : t("upcoming")}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 12 ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="w-full py-3 text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
            >
              {expanded ? t("schedShowFewer") : t("schedShowAll", { count: rows.length })}
            </button>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}
