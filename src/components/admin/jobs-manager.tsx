"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import type { JobStatus } from "@prisma/client";
import { Button, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { formatDate, relativeTime } from "@/lib/format";
import { adminRetryJobAction } from "@/app/actions/admin";

export interface JobRowItem {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  lastError: string | null;
  payload: unknown;
  createdAt: string;
}

export function JobsManager({
  locale,
  jobs,
  counts,
}: {
  locale: string;
  jobs: JobRowItem[];
  counts: { status: JobStatus; count: number }[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [inspectedJob, setInspectedJob] = useState<JobRowItem | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const isAr = locale === "ar";

  const filtered = jobs.filter((j) => {
    if (statusFilter !== "ALL" && j.status !== statusFilter) return false;
    return true;
  });

  const handleRetry = (jobId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await adminRetryJobAction(jobId);
      if (!res.ok) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Stat Bar / Status Tabs */}
      <dl className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule grid-cols-2 sm:grid-cols-5">
        {(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"] as JobStatus[]).map((st) => {
          const c = counts.find((item) => item.status === st)?.count ?? 0;
          const active = statusFilter === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(active ? "ALL" : st)}
              className={cn(
                "p-4 text-start transition-colors",
                active ? "bg-paper-raised ring-2 ring-inset ring-brass" : "bg-paper-raised hover:bg-paper-sunken"
              )}
            >
              <dt className="eyebrow mb-1 text-2xs text-ink-50">{st.toLowerCase()}</dt>
              <dd
                className={cn(
                  "money text-money-sm font-semibold",
                  st === "DEAD" || st === "FAILED" ? (c > 0 ? "text-flagged" : "text-ink") : "text-ink"
                )}
              >
                {c}
              </dd>
            </button>
          );
        })}
      </dl>

      {actionError && (
        <div className="p-3 bg-flagged-soft/50 border border-flagged/40 rounded-md text-xs text-flagged">
          {actionError}
        </div>
      )}

      {/* Payload Modal */}
      {inspectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h2 className="font-display text-base text-ink font-mono">{inspectedJob.type}</h2>
                <span className="text-2xs text-ink-50">ID: {inspectedJob.id}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setInspectedJob(null)}>
                ✕
              </Button>
            </div>

            <div>
              <p className="text-2xs text-ink-50 mb-1 font-semibold">
                Sanitized Payload (Sensitive tokens, passwords and NIDs redacted):
              </p>
              <pre className="text-xs bg-paper-sunken p-3 rounded-md border border-rule overflow-x-auto text-ink-70 font-mono">
                {JSON.stringify(inspectedJob.payload, null, 2)}
              </pre>
            </div>

            {inspectedJob.lastError && (
              <div>
                <p className="text-2xs text-flagged mb-1 font-semibold">Execution Error Trace:</p>
                <div className="p-2.5 bg-flagged-soft/40 border border-flagged/30 rounded text-xs text-flagged font-mono">
                  {inspectedJob.lastError}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              {(inspectedJob.status === "FAILED" || inspectedJob.status === "DEAD") && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={pending}
                  onClick={() => {
                    handleRetry(inspectedJob.id);
                    setInspectedJob(null);
                  }}
                >
                  Retry Now
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setInspectedJob(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          No jobs found for the selected status.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[900px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">Type</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Status</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">Attempts</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">Duration</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Last Error</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">When</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const isDead = j.status === "DEAD" || j.status === "FAILED";
                return (
                  <tr
                    key={j.id}
                    className={cn(
                      "border-b border-rule hover:bg-paper-sunken/30 transition-colors",
                      isDead && "bg-flagged-soft/25"
                    )}
                  >
                    <td className="p-3">
                      <span className="font-mono text-xs font-semibold text-ink">{j.type}</span>
                    </td>

                    <td className="p-3">
                      <Badge
                        tone={
                          j.status === "SUCCEEDED"
                            ? "verified"
                            : j.status === "DEAD" || j.status === "FAILED"
                            ? "flagged"
                            : "pending"
                        }
                      >
                        {j.status}
                      </Badge>
                    </td>

                    <td className="p-3 text-center font-mono text-xs text-ink">
                      {j.attempts} / {j.maxAttempts}
                    </td>

                    <td className="p-3 text-center text-xs text-ink-50">
                      {j.durationMs !== null ? `${j.durationMs}ms` : "—"}
                    </td>

                    <td className="p-3">
                      {j.lastError ? (
                        <p className="text-2xs text-flagged truncate max-w-sm">{j.lastError}</p>
                      ) : (
                        <span className="text-2xs text-ink-30">—</span>
                      )}
                    </td>

                    <td className="p-3 text-end text-2xs text-ink-50">
                      {relativeTime(j.createdAt, locale)}
                    </td>

                    <td className="p-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setInspectedJob(j)}>
                          Payload
                        </Button>
                        {isDead && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={pending}
                            onClick={() => handleRetry(j.id)}
                          >
                            Retry
                          </Button>
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
