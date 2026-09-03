"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Callout, Textarea, cn } from "@/components/ui/primitives";
import { Badge, SeverityBadge } from "@/components/ui/badges";

export interface Signal {
  id: string;
  type: string;
  severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL";
  status: string;
  titleEn: string;
  titleAr: string | null;
  description: string;
  evidence: unknown;
  disposition: string | null;
}

/**
 * Signals, never verdicts. Every one shows its evidence and requires an analyst
 * disposition with a written note before it stops blocking anything.
 */
export function FraudPanel({
  signals,
  locale,
  onDisposition,
  pending,
}: {
  signals: Signal[];
  locale: string;
  onDisposition: (id: string, status: "DISMISSED" | "CONFIRMED" | "ESCALATED", note: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("analyst");
  const isAr = locale === "ar";
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const open = signals.filter((s) => s.status === "OPEN" || s.status === "ESCALATED");
  const closed = signals.filter((s) => s.status === "DISMISSED" || s.status === "CONFIRMED");

  return (
    <div className="flex flex-col gap-5">
      <Callout tone="info">
        {isAr
          ? "هذه مؤشرات وليست أحكامًا. كل مؤشر يحتاج قرارًا مكتوبًا من المحلل، ولا يُغلق تلقائيًا."
          : "These are signals, not verdicts. Each one needs a written analyst disposition; none of them decides anything on its own."}
      </Callout>

      {open.length === 0 ? (
        <Callout tone="verified">
          {isAr ? "لا توجد مؤشرات مفتوحة على هذا الملف." : "No open signals on this file."}
        </Callout>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((s) => {
            const evidence = s.evidence as { check?: string } | null;
            const simulated = evidence?.check !== "real";
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-md border bg-paper-raised p-3",
                  s.severity === "CRITICAL" ? "border-flagged/45" : "border-pending/40",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={s.severity} />
                    <span className="text-sm font-medium text-ink">
                      {isAr ? (s.titleAr ?? s.titleEn) : s.titleEn}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone="neutral">{s.type.replace(/_/g, " ").toLowerCase()}</Badge>
                    {simulated ? <Badge tone="info">simulated check</Badge> : <Badge tone="verified">computed</Badge>}
                  </span>
                </div>

                <p className="mb-3 text-xs leading-relaxed text-ink-70">{s.description}</p>

                <button
                  type="button"
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  className="mb-3 text-2xs text-info underline underline-offset-2"
                >
                  {expanded === s.id ? "Hide evidence" : t("evidence")}
                </button>
                {expanded === s.id ? (
                  <pre className="mb-3 max-h-56 overflow-auto rounded-sm bg-paper-sunken p-2 font-mono text-[10px] leading-relaxed text-ink-70 scrollbar-thin">
                    {JSON.stringify(s.evidence, null, 2)}
                  </pre>
                ) : null}

                {acting === s.id ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      rows={2}
                      placeholder={t("dispositionNote")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["DISMISSED", t("signalDismiss"), "secondary"],
                          ["CONFIRMED", t("signalConfirm"), "danger"],
                          ["ESCALATED", t("signalEscalate"), "primary"],
                        ] as const
                      ).map(([status, label, variant]) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={variant}
                          loading={pending}
                          disabled={note.trim().length < 8}
                          onClick={() => {
                            onDisposition(s.id, status, note);
                            setActing(null);
                            setNote("");
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setActing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setActing(s.id)}>
                    Disposition
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Closed signals</h3>
          <ul className="rule-t">
            {closed.map((s) => (
              <li key={s.id} className="rule-b py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-70">{isAr ? (s.titleAr ?? s.titleEn) : s.titleEn}</span>
                  <Badge tone={s.status === "CONFIRMED" ? "flagged" : "neutral"}>{s.status.toLowerCase()}</Badge>
                </div>
                {s.disposition ? <p className="mt-1 text-2xs text-ink-30">{s.disposition}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
