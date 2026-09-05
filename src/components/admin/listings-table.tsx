"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import type { ListingStatus } from "@prisma/client";
import { Button, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge, StatusPill, VerificationScore } from "@/components/ui/badges";
import { egp, relativeTime } from "@/lib/format";
import { adminOverrideListingStatus, adminReassignAnalyst } from "@/app/actions/admin";

export interface AdminListingRow {
  id: string;
  reference: string;
  status: ListingStatus;
  verificationScore: number | null;
  verificationBreakdown: unknown;
  unitCode: string;
  projectName: string;
  projectNameAr: string;
  city: string;
  sellerName: string;
  totalPrice: number;
  askingCash: number | null;
  assignedAnalyst: { id: string; name: string } | null;
  offersCount: number;
  dealId: string | null;
  dealStatus: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

const ALL_STATUSES: ListingStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "AI_PROCESSING",
  "PENDING_REVIEW",
  "INFO_REQUESTED",
  "VERIFIED",
  "LISTED",
  "UNDER_OFFER",
  "RESERVED",
  "ASSIGNMENT_IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
];

export function AdminListingsTable({
  locale,
  rows,
  analysts,
}: {
  locale: string;
  rows: AdminListingRow[];
  analysts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [pending, startTransition] = useTransition();

  // Override Modal State
  const [overrideListingId, setOverrideListingId] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<ListingStatus>("LISTED");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Reassign Modal State
  const [reassignListingId, setReassignListingId] = useState<string | null>(null);
  const [targetAnalystId, setTargetAnalystId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignError, setReassignError] = useState<string | null>(null);

  const t = useTranslations("admin");
  const isAr = locale === "ar";

  const filtered = rows.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.reference.toLowerCase().includes(q) ||
        r.unitCode.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.sellerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOverrideSubmit = () => {
    if (!overrideListingId) return;
    setOverrideError(null);
    startTransition(async () => {
      const res = await adminOverrideListingStatus({
        listingId: overrideListingId,
        targetStatus,
        reason: overrideReason,
      });
      if (!res.ok) {
        setOverrideError(res.error);
      } else {
        setOverrideListingId(null);
        setOverrideReason("");
        router.refresh();
      }
    });
  };

  const handleReassignSubmit = () => {
    if (!reassignListingId || !targetAnalystId) return;
    setReassignError(null);
    startTransition(async () => {
      const res = await adminReassignAnalyst({
        listingId: reassignListingId,
        newAnalystId: targetAnalystId,
        reason: reassignReason || "Administrative reallocation",
      });
      if (!res.ok) {
        setReassignError(res.error);
      } else {
        setReassignListingId(null);
        setTargetAnalystId("");
        setReassignReason("");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[260px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchReferenceProjectUnitSeller")}
          />
        </div>
        <div className="w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">{t("allStatuses")}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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

      {/* Override Modal */}
      {overrideListingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4">
            <h2 className="font-display text-lg text-ink">
              {t("adminOverrideListingStatus")}
            </h2>
            <p className="text-xs text-ink-50">
              {t("everyAdministrativeOverrideRequiresWritten")}
            </p>

            {overrideError && <p className="text-xs text-flagged">{overrideError}</p>}

            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">Target Status</label>
              <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as ListingStatus)}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">
                Justification (Mandatory, min 10 characters)
              </label>
              <Textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain the business or operational reason for overriding this listing status..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setOverrideListingId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                disabled={overrideReason.trim().length < 10}
                onClick={handleOverrideSubmit}
              >
                Confirm Override
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignListingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4">
            <h2 className="font-display text-lg text-ink">
              {t("reassignVerificationAnalyst")}
            </h2>

            {reassignError && <p className="text-xs text-flagged">{reassignError}</p>}

            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">Select Analyst</label>
              <Select value={targetAnalystId} onChange={(e) => setTargetAnalystId(e.target.value)}>
                <option value="">-- Choose analyst --</option>
                {analysts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">Reason (min 5 characters)</label>
              <Input
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="e.g. Senior escalation review"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setReassignListingId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                disabled={!targetAnalystId || reassignReason.trim().length < 5}
                onClick={handleReassignSubmit}
              >
                Confirm Reassignment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          {t("noListingsMatchCurrentFilters")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[1000px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">Reference & Property</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Status & Quality</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Financials</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Analyst</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">Pipeline</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-rule hover:bg-paper-sunken/30 transition-colors">
                  <td className="p-3">
                    <Link href={`/analyst/listings/${r.id}`} className="font-medium text-ink hover:underline block">
                      {isAr ? r.projectNameAr : r.projectName} · {r.unitCode}
                    </Link>
                    <span className="font-mono text-2xs text-ink-50">
                      {r.reference} · Seller: {r.sellerName} · {r.city}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={r.status} />
                      {r.verificationScore !== null && (
                        <VerificationScore
                          score={r.verificationScore}
                          breakdown={r.verificationBreakdown as never}
                          locale={locale}
                          size="sm"
                        />
                      )}
                    </div>
                  </td>

                  <td className="p-3 text-end">
                    <div className="money text-xs font-medium text-ink">
                      {r.totalPrice > 0 ? egp(r.totalPrice, { style: "compact" }) : "—"}
                    </div>
                    {r.askingCash && (
                      <span className="text-2xs text-ink-50">
                        Cash: {egp(r.askingCash, { style: "compact" })}
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {r.assignedAnalyst ? (
                      <div className="flex items-center gap-1.5">
                        <Badge tone="neutral">{r.assignedAnalyst.name}</Badge>
                        <button
                          type="button"
                          onClick={() => {
                            setReassignListingId(r.id);
                            setTargetAnalystId(r.assignedAnalyst?.id ?? "");
                            setReassignReason("");
                          }}
                          className="text-2xs text-info hover:underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReassignListingId(r.id);
                          setTargetAnalystId("");
                          setReassignReason("");
                        }}
                        className="text-2xs text-pending hover:underline font-medium"
                      >
                        + Assign
                      </button>
                    )}
                  </td>

                  <td className="p-3 text-center text-xs">
                    {r.dealId ? (
                      <Badge tone="verified">Deal: {r.dealStatus}</Badge>
                    ) : r.offersCount > 0 ? (
                      <span className="text-2xs text-ink-70 font-mono">{r.offersCount} offers</span>
                    ) : (
                      <span className="text-2xs text-ink-30">—</span>
                    )}
                  </td>

                  <td className="p-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOverrideListingId(r.id);
                          setTargetStatus(r.status);
                          setOverrideReason("");
                          setOverrideError(null);
                        }}
                      >
                        Override
                      </Button>
                      <Link
                        href={`/analyst/listings/${r.id}`}
                        className="rounded-sm border border-rule px-2 py-1 text-2xs hover:bg-paper-sunken"
                      >
                        Inspect →
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
