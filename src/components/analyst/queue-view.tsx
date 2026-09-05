"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { Button, Input, Select, cn } from "@/components/ui/primitives";
import { Badge, SeverityBadge, StatusPill, VerificationScore } from "@/components/ui/badges";
import { egp, formatDate, relativeTime } from "@/lib/format";
import { claimListing, reassignListingAction } from "@/app/actions/analyst";

export interface QueueListingItem {
  id: string;
  reference: string;
  status: string;
  verificationScore: number | null;
  verificationBreakdown: unknown;
  unitCode: string;
  projectName: string;
  projectNameAr: string;
  city: string;
  sellerName: string;
  documentsCount: number;
  mediaCount: number;
  value: number;
  criticalCount: number;
  majorCount: number;
  ageHours: number;
  submittedAt: string | null;
  slaDueAt: string | null;
  overdue: boolean;
  escalatedAt: string | null;
  escalationReason: string | null;
  priority: number;
  assignedAnalyst: { id: string; name: string } | null;
}

export function QueueView({
  locale,
  userId,
  items,
  analysts,
  labels,
}: {
  locale: string;
  userId: string;
  items: QueueListingItem[];
  analysts: { id: string; name: string }[];
  labels: {
    inQueue: string;
    assignedToMe: string;
    unassigned: string;
    pastSla: string;
    searchPlaceholder: string;
    statusFilter: string;
    signalsFilter: string;
    file: string;
    status: string;
    contractValue: string;
    signals: string;
    timeOnFile: string;
    sla: string;
    action: string;
    claim: string;
    reassign: string;
    openFile: string;
    all: string;
    clear: string;
    noMatching: string;
    mine: string;
    due: string;
    overdueBy: string;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "mine" | "unassigned" | "overdue">("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [signalsFilter, setSignalsFilter] = useState("ALL");
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [pending, startTransition] = useTransition();

  const t = useTranslations("analyst");
  const tk = useTranslations("consoleUi");
  const isAr = locale === "ar";

  const mineCount = items.filter((i) => i.assignedAnalyst?.id === userId).length;
  const unassignedCount = items.filter((i) => !i.assignedAnalyst).length;
  const overdueCount = items.filter((i) => i.overdue).length;

  const filtered = items.filter((item) => {
    // Tab filter
    if (tab === "mine" && item.assignedAnalyst?.id !== userId) return false;
    if (tab === "unassigned" && item.assignedAnalyst) return false;
    if (tab === "overdue" && !item.overdue) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        item.reference.toLowerCase().includes(q) ||
        item.unitCode.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        item.projectNameAr.toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Status filter
    if (statusFilter !== "ALL" && item.status !== statusFilter) return false;

    // Signals filter
    if (signalsFilter === "CRITICAL" && item.criticalCount === 0) return false;
    if (signalsFilter === "MAJOR" && item.majorCount === 0 && item.criticalCount === 0) return false;
    if (signalsFilter === "CLEAR" && (item.criticalCount > 0 || item.majorCount > 0)) return false;

    return true;
  });

  const handleClaim = (listingId: string) => {
    startTransition(async () => {
      await claimListing(listingId);
      router.refresh();
    });
  };

  const handleReassign = (listingId: string) => {
    if (!selectedAnalyst) return;
    startTransition(async () => {
      await reassignListingAction({
        listingId,
        newAnalystId: selectedAnalyst,
        reason: reassignReason || "Reassigned from verification queue",
      });
      setReassigningId(null);
      setSelectedAnalyst("");
      setReassignReason("");
      router.refresh();
    });
  };

  return (
    <div>
      {/* Metric Cards / Stat Bar */}
      <dl className="mb-6 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule grid-cols-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={cn(
            "p-4 text-start transition-colors",
            tab === "all" ? "bg-paper-raised ring-2 ring-inset ring-brass" : "bg-paper-raised hover:bg-paper-sunken"
          )}
        >
          <dt className="eyebrow mb-1.5">{labels.inQueue}</dt>
          <dd className="money text-money-md font-semibold text-ink">{items.length}</dd>
        </button>

        <button
          type="button"
          onClick={() => setTab("mine")}
          className={cn(
            "p-4 text-start transition-colors",
            tab === "mine" ? "bg-paper-raised ring-2 ring-inset ring-brass" : "bg-paper-raised hover:bg-paper-sunken"
          )}
        >
          <dt className="eyebrow mb-1.5">{labels.assignedToMe}</dt>
          <dd className="money text-money-md font-semibold text-ink">{mineCount}</dd>
        </button>

        <button
          type="button"
          onClick={() => setTab("unassigned")}
          className={cn(
            "p-4 text-start transition-colors",
            tab === "unassigned" ? "bg-paper-raised ring-2 ring-inset ring-brass" : "bg-paper-raised hover:bg-paper-sunken"
          )}
        >
          <dt className="eyebrow mb-1.5">{labels.unassigned}</dt>
          <dd className="money text-money-md font-semibold text-ink">{unassignedCount}</dd>
        </button>

        <button
          type="button"
          onClick={() => setTab("overdue")}
          className={cn(
            "p-4 text-start transition-colors",
            tab === "overdue" ? "bg-paper-raised ring-2 ring-inset ring-flagged" : "bg-paper-raised hover:bg-paper-sunken"
          )}
        >
          <dt className="eyebrow mb-1.5">{labels.pastSla}</dt>
          <dd className={cn("money text-money-md font-semibold", overdueCount > 0 ? "text-flagged" : "text-ink")}>
            {overdueCount}
          </dd>
        </button>
      </dl>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.searchPlaceholder}
          />
        </div>

        <div className="w-44">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">{labels.all} (Status)</option>
            <option value="PENDING_REVIEW">{tk("statusPendingReview")}</option>
            <option value="SUBMITTED">{tk("statusSubmitted")}</option>
            <option value="AI_PROCESSING">{tk("statusAiProcessing")}</option>
            <option value="INFO_REQUESTED">{tk("statusInfoRequested")}</option>
            <option value="VERIFIED">{tk("statusVerified")}</option>
          </Select>
        </div>

        <div className="w-44">
          <Select value={signalsFilter} onChange={(e) => setSignalsFilter(e.target.value)}>
            <option value="ALL">{labels.all} (Signals)</option>
            <option value="CRITICAL">{tk("criticalSignals")}</option>
            <option value="MAJOR">{tk("majorSignals")}</option>
            <option value="CLEAR">Clear</option>
          </Select>
        </div>

        {(search || statusFilter !== "ALL" || signalsFilter !== "ALL") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatusFilter("ALL");
              setSignalsFilter("ALL");
            }}
          >
            {labels.clear}
          </Button>
        )}
      </div>

      {/* Reassign Modal */}
      {reassigningId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-rule bg-paper-raised p-6 shadow-xl">
            <h2 className="font-display text-lg text-ink mb-4">{labels.reassign}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-70 mb-1">{tk("selectAnalyst")}</label>
                <Select value={selectedAnalyst} onChange={(e) => setSelectedAnalyst(e.target.value)}>
                  <option value="">-- Choose an analyst --</option>
                  {analysts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-70 mb-1">{tk("reasonNote")}</label>
                <Input
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder={tk("egWorkloadRebalancing")}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReassigningId(null);
                    setSelectedAnalyst("");
                    setReassignReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={pending}
                  disabled={!selectedAnalyst}
                  onClick={() => handleReassign(reassigningId)}
                >{tk("confirmReassign")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          {labels.noMatching}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[960px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">{labels.file}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{labels.status}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">{labels.contractValue}</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">{labels.signals}</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">{labels.timeOnFile}</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">{labels.sla}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">{labels.action}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b border-rule hover:bg-paper-sunken/30 transition-colors",
                    item.criticalCount > 0 && "bg-flagged-soft/30"
                  )}
                >
                  <td className="p-3">
                    <Link
                      href={`/analyst/listings/${item.id}`}
                      className="block font-medium text-ink hover:underline"
                    >
                      {isAr ? item.projectNameAr : item.projectName} · {item.unitCode}
                    </Link>
                    <span className="font-mono text-2xs text-ink-50">
                      {item.reference} · {item.sellerName} · {item.documentsCount} docs · {item.mediaCount} images
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={item.status as never} />
                      {item.verificationScore !== null && (
                        <VerificationScore
                          score={item.verificationScore}
                          breakdown={item.verificationBreakdown as never}
                          locale={locale}
                          size="sm"
                        />
                      )}
                    </div>
                  </td>

                  <td className="money p-3 text-end font-medium text-ink">
                    {item.value > 0 ? egp(item.value, { style: "compact" }) : "—"}
                  </td>

                  <td className="p-3 text-center">
                    <div className="flex flex-wrap justify-center gap-1">
                      {item.escalatedAt && (
                        <span title={item.escalationReason ?? undefined}>
                          <Badge tone="flagged">{t("escalated")}</Badge>
                        </span>
                      )}
                      {item.criticalCount > 0 && <SeverityBadge severity="CRITICAL" />}
                      {item.majorCount > 0 && <SeverityBadge severity="MAJOR" />}
                      {!item.escalatedAt && item.criticalCount === 0 && item.majorCount === 0 && (
                        <span className="text-2xs text-ink-30">{labels.clear}</span>
                      )}
                    </div>
                  </td>

                  <td className="money p-3 text-center text-xs text-ink-70">
                    {item.ageHours < 24 ? `${Math.round(item.ageHours)}h` : `${Math.round(item.ageHours / 24)}d`}
                  </td>

                  <td className="p-3 text-center">
                    {item.slaDueAt ? (
                      <div>
                        <span className={cn("money block text-2xs font-semibold", item.overdue ? "text-flagged" : "text-ink-50")}>
                          {item.overdue
                            ? `${labels.overdueBy} ${relativeTime(item.slaDueAt, locale).replace(/ ago$/, "")}`
                            : `${labels.due} ${relativeTime(item.slaDueAt, locale)}`}
                        </span>
                        <span className="text-[10px] text-ink-30">
                          {formatDate(item.slaDueAt, locale)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xs text-ink-30">—</span>
                    )}
                  </td>

                  <td className="p-3 text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.assignedAnalyst ? (
                        <>
                          <Badge tone={item.assignedAnalyst.id === userId ? "brass" : "neutral"}>
                            {item.assignedAnalyst.id === userId ? labels.mine : item.assignedAnalyst.name}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReassigningId(item.id);
                              setSelectedAnalyst(item.assignedAnalyst?.id ?? "");
                            }}
                          >
                            {labels.reassign}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={pending}
                          onClick={() => handleClaim(item.id)}
                        >
                          {labels.claim}
                        </Button>
                      )}
                      <Link
                        href={`/analyst/listings/${item.id}`}
                        className="inline-flex items-center text-xs text-ink-70 hover:text-ink px-2 py-1"
                      >
                        {labels.openFile} →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
