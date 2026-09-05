"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import type { AssignmentPermission, FeeType, PolicySource, PolicyVerificationState } from "@prisma/client";
import { Button, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp, formatDate } from "@/lib/format";
import { adminSavePolicyWithHistory } from "@/app/actions/admin";

export interface PolicyVersionItem {
  id: string;
  version: number;
  effectiveDate: string | null;
  assignmentAllowed: AssignmentPermission;
  feeType: FeeType;
  feePercentBps: number | null;
  feeFixedAmount: string | null;
  minPercentPaidBps: number | null;
  minMonthsElapsed: number | null;
  typicalNocDays: number | null;
  waitingPeriodDays: number | null;
  source: PolicySource | null;
  verificationState: PolicyVerificationState | null;
  changeReason: string | null;
  createdAt: string;
}

export interface DeveloperPolicyRow {
  developerId: string;
  developerNameEn: string;
  developerNameAr: string | null;
  projectCount: number;
  policy: {
    id: string;
    assignmentAllowed: AssignmentPermission;
    feeType: FeeType;
    feePercentBps: number | null;
    feeFixedAmount: string | null;
    feeBasis: string;
    minPercentPaidBps: number | null;
    minMonthsElapsed: number | null;
    typicalNocDays: number | null;
    waitingPeriodDays: number | null;
    requiredDocuments: string[];
    conditionsEn: string | null;
    conditionsAr: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    effectiveDate: string | null;
    source: PolicySource | null;
    verificationState: PolicyVerificationState | null;
    versions: PolicyVersionItem[];
  } | null;
}

export function PoliciesManager({
  locale,
  rows,
}: {
  locale: string;
  rows: DeveloperPolicyRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  // History Drawer State
  const [historyDeveloperId, setHistoryDeveloperId] = useState<string | null>(null);

  // Edit Modal State
  const [editingRow, setEditingRow] = useState<DeveloperPolicyRow | null>(null);
  const [assignmentAllowed, setAssignmentAllowed] = useState<AssignmentPermission>("ALLOWED");
  const [feeType, setFeeType] = useState<FeeType>("PERCENT");
  const [feePercentBps, setFeePercentBps] = useState("250");
  const [feeFixedAmount, setFeeFixedAmount] = useState("");
  const [minPercentPaidBps, setMinPercentPaidBps] = useState("3000");
  const [minMonthsElapsed, setMinMonthsElapsed] = useState("6");
  const [typicalNocDays, setTypicalNocDays] = useState("14");
  const [waitingPeriodDays, setWaitingPeriodDays] = useState("0");
  const [source, setSource] = useState<PolicySource>("ANALYST_RESEARCH");
  const [verificationState, setVerificationState] = useState<PolicyVerificationState>("VERIFIED");
  const [changeReason, setChangeReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const t = useTranslations("admin");
  const tk = useTranslations("consoleUi");
  const isAr = locale === "ar";

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.developerNameEn.toLowerCase().includes(q) ||
      (r.developerNameAr && r.developerNameAr.toLowerCase().includes(q))
    );
  });

  const selectedHistory = rows.find((r) => r.developerId === historyDeveloperId);

  const openEditModal = (row: DeveloperPolicyRow) => {
    setEditingRow(row);
    setEditError(null);
    setChangeReason("");
    if (row.policy) {
      setAssignmentAllowed(row.policy.assignmentAllowed);
      setFeeType(row.policy.feeType);
      setFeePercentBps(row.policy.feePercentBps ? String(row.policy.feePercentBps) : "");
      setFeeFixedAmount(row.policy.feeFixedAmount ?? "");
      setMinPercentPaidBps(row.policy.minPercentPaidBps ? String(row.policy.minPercentPaidBps) : "");
      setMinMonthsElapsed(row.policy.minMonthsElapsed ? String(row.policy.minMonthsElapsed) : "");
      setTypicalNocDays(row.policy.typicalNocDays ? String(row.policy.typicalNocDays) : "");
      setWaitingPeriodDays(row.policy.waitingPeriodDays ? String(row.policy.waitingPeriodDays) : "");
      setSource(row.policy.source ?? "ANALYST_RESEARCH");
      setVerificationState(row.policy.verificationState ?? "PENDING_CONFIRMATION");
    } else {
      setAssignmentAllowed("ALLOWED");
      setFeeType("PERCENT");
      setFeePercentBps("250");
      setFeeFixedAmount("");
      setMinPercentPaidBps("3000");
      setMinMonthsElapsed("6");
      setTypicalNocDays("14");
      setWaitingPeriodDays("0");
      setSource("ANALYST_RESEARCH");
      setVerificationState("PENDING_CONFIRMATION");
    }
  };

  const handleSavePolicy = () => {
    if (!editingRow) return;
    setEditError(null);
    startTransition(async () => {
      const res = await adminSavePolicyWithHistory({
        developerId: editingRow.developerId,
        assignmentAllowed,
        feeType,
        feePercentBps: feeType === "PERCENT" && feePercentBps ? parseInt(feePercentBps, 10) : undefined,
        feeFixedAmount: feeType === "FIXED" && feeFixedAmount ? feeFixedAmount : undefined,
        minPercentPaidBps: minPercentPaidBps ? parseInt(minPercentPaidBps, 10) : undefined,
        minMonthsElapsed: minMonthsElapsed ? parseInt(minMonthsElapsed, 10) : undefined,
        typicalNocDays: typicalNocDays ? parseInt(typicalNocDays, 10) : undefined,
        waitingPeriodDays: waitingPeriodDays ? parseInt(waitingPeriodDays, 10) : undefined,
        source,
        verificationState,
        changeReason,
      });

      if (!res.ok) {
        setEditError(res.error);
      } else {
        setEditingRow(null);
        setChangeReason("");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="max-w-md">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchDeveloper")}
        />
      </div>

      {/* History Drawer */}
      {selectedHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-paper-raised p-6 shadow-2xl border-s border-rule space-y-6">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h2 className="font-display text-lg text-ink">
                  {selectedHistory.developerNameEn}
                </h2>
                <p className="text-xs text-ink-50">
                  {t("immutablePolicyVersionHistory")}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setHistoryDeveloperId(null)}>
                ✕
              </Button>
            </div>

            {selectedHistory.policy?.versions && selectedHistory.policy.versions.length > 0 ? (
              <div className="space-y-4">
                {selectedHistory.policy.versions.map((v) => (
                  <div key={v.id} className="rounded-lg border border-rule bg-paper-sunken/40 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-ink font-mono">Version {v.version}</span>
                      <span className="text-2xs text-ink-50">{formatDate(v.createdAt, locale)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-2xs text-ink-50 block">{tk("assignmentLabel")}</span>
                        <span className="font-medium text-ink">{v.assignmentAllowed}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-ink-50 block">{tk("feeModelLabel")}</span>
                        <span className="font-medium text-ink">
                          {v.feeType === "PERCENT" && v.feePercentBps
                            ? `${(v.feePercentBps / 100).toFixed(1)}%`
                            : v.feeType === "FIXED" && v.feeFixedAmount
                            ? egp(v.feeFixedAmount)
                            : "None"}
                        </span>
                      </div>
                      <div>
                        <span className="text-2xs text-ink-50 block">{tk("minPaidLabel")}</span>
                        <span className="font-medium text-ink">
                          {v.minPercentPaidBps ? `${(v.minPercentPaidBps / 100).toFixed(0)}%` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-2xs text-ink-50 block">{tk("nocDaysLabel")}</span>
                        <span className="font-medium text-ink">{v.typicalNocDays ? `${v.typicalNocDays}d` : "—"}</span>
                      </div>
                    </div>

                    {v.changeReason && (
                      <div className="bg-paper-raised p-2 rounded-sm text-2xs text-ink-70 border border-rule/60">
                        <span className="font-semibold text-ink">{tk("changeReasonLabel")}</span>
                        {v.changeReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-50 text-center py-8">{tk("noPolicyVersions")}</p>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-lg text-ink">
              {editingRow.policy ? "Edit Policy & Create Version" : "Initialize Developer Policy"}
            </h2>
            <p className="text-xs text-ink-50">{tk("policyEditExplainer")}</p>

            {editError && <p className="text-xs text-flagged">{editError}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("assignmentAllowed")}</label>
                <Select value={assignmentAllowed} onChange={(e) => setAssignmentAllowed(e.target.value as AssignmentPermission)}>
                  <option value="ALLOWED">ALLOWED</option>
                  <option value="NOT_ALLOWED">NOT_ALLOWED</option>
                  <option value="CONDITIONAL">CONDITIONAL</option>
                  <option value="UNKNOWN">UNKNOWN</option>
                </Select>
              </div>

              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("feeType")}</label>
                <Select value={feeType} onChange={(e) => setFeeType(e.target.value as FeeType)}>
                  <option value="PERCENT">PERCENT (%)</option>
                  <option value="FIXED">FIXED AMOUNT (EGP)</option>
                  <option value="NONE">NO FEE</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {feeType === "PERCENT" ? (
                <div>
                  <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("feePercentBps")}</label>
                  <Input value={feePercentBps} onChange={(e) => setFeePercentBps(e.target.value)} type="number" />
                </div>
              ) : feeType === "FIXED" ? (
                <div>
                  <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("fixedFee")}</label>
                  <Input value={feeFixedAmount} onChange={(e) => setFeeFixedAmount(e.target.value)} type="number" />
                </div>
              ) : null}

              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("minPaidBps")}</label>
                <Input value={minPercentPaidBps} onChange={(e) => setMinPercentPaidBps(e.target.value)} type="number" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("minMonthsElapsed")}</label>
                <Input value={minMonthsElapsed} onChange={(e) => setMinMonthsElapsed(e.target.value)} type="number" />
              </div>

              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("typicalNocDays")}</label>
                <Input value={typicalNocDays} onChange={(e) => setTypicalNocDays(e.target.value)} type="number" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("policySource")}</label>
                <Select value={source} onChange={(e) => setSource(e.target.value as PolicySource)}>
                  <option value="OFFICIAL_LETTER">OFFICIAL_LETTER</option>
                  <option value="DEVELOPER_PORTAL">DEVELOPER_PORTAL</option>
                  <option value="CONTRACT_ANNEX">CONTRACT_ANNEX</option>
                  <option value="ANALYST_RESEARCH">ANALYST_RESEARCH</option>
                  <option value="SYNTHETIC_BENCHMARK">SYNTHETIC_BENCHMARK</option>
                </Select>
              </div>

              <div>
                <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("verificationState")}</label>
                <Select value={verificationState} onChange={(e) => setVerificationState(e.target.value as PolicyVerificationState)}>
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                  <option value="SYNTHETIC">SYNTHETIC</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-2xs font-medium text-ink-70 mb-1">{tk("changeReason8")}</label>
              <Textarea
                rows={3}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder={tk("policyReasonPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingRow(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                disabled={changeReason.trim().length < 8}
                onClick={handleSavePolicy}
              >{tk("saveAndSnapshot")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
        <table className="w-full min-w-[960px] border-collapse bg-paper-raised text-sm">
          <thead>
            <tr className="border-b border-rule bg-paper-sunken/70">
              <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("developer")}</th>
              <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("assignmentTerms")}</th>
              <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("feeModel")}</th>
              <th className="p-3 text-center text-xs font-medium text-ink-50">{tk("nocTimeline")}</th>
              <th className="p-3 text-center text-xs font-medium text-ink-50">{tk("verificationState")}</th>
              <th className="p-3 text-center text-xs font-medium text-ink-50">History</th>
              <th className="p-3 text-end text-xs font-medium text-ink-50">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const p = row.policy;
              return (
                <tr key={row.developerId} className="border-b border-rule hover:bg-paper-sunken/30 transition-colors">
                  <td className="p-3">
                    <div className="font-semibold text-ink">{row.developerNameEn}</div>
                    <span className="text-2xs text-ink-50">
                      {row.developerNameAr ? `${row.developerNameAr} · ` : ""}
                      {row.projectCount} projects
                    </span>
                  </td>

                  <td className="p-3">
                    {p ? (
                      <div>
                        <Badge
                          tone={
                            p.assignmentAllowed === "ALLOWED"
                              ? "verified"
                              : p.assignmentAllowed === "CONDITIONAL"
                              ? "brass"
                              : "flagged"
                          }
                        >
                          {p.assignmentAllowed}
                        </Badge>
                        {p.minPercentPaidBps && (
                          <p className="text-2xs text-ink-50 mt-1">
                            Min {(p.minPercentPaidBps / 100).toFixed(0)}% paid
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-2xs text-ink-30">{tk("noPolicy")}</span>
                    )}
                  </td>

                  <td className="p-3">
                    {p ? (
                      <div className="text-xs">
                        <span className="font-medium text-ink">
                          {p.feeType === "PERCENT" && p.feePercentBps
                            ? `${(p.feePercentBps / 100).toFixed(1)}% fee`
                            : p.feeType === "FIXED" && p.feeFixedAmount
                            ? egp(p.feeFixedAmount)
                            : "No fee"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xs text-ink-30">—</span>
                    )}
                  </td>

                  <td className="p-3 text-center text-xs">
                    {p?.typicalNocDays ? (
                      <span className="money text-ink font-semibold">{p.typicalNocDays} days</span>
                    ) : (
                      <span className="text-2xs text-ink-30">—</span>
                    )}
                  </td>

                  <td className="p-3 text-center">
                    {p?.verificationState ? (
                      <Badge
                        tone={
                          p.verificationState === "VERIFIED"
                            ? "verified"
                            : p.verificationState === "SYNTHETIC"
                            ? "neutral"
                            : "pending"
                        }
                      >
                        {p.verificationState}
                      </Badge>
                    ) : (
                      <span className="text-2xs text-ink-30">—</span>
                    )}
                  </td>

                  <td className="p-3 text-center">
                    {p?.versions && p.versions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setHistoryDeveloperId(row.developerId)}
                        className="text-xs font-mono text-info hover:underline font-semibold"
                      >
                        v{p.versions.length} ({p.versions.length} edits)
                      </button>
                    ) : (
                      <span className="text-2xs text-ink-30">v1 (initial)</span>
                    )}
                  </td>

                  <td className="p-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      {p?.versions && p.versions.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryDeveloperId(row.developerId)}
                        >
                          History
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => openEditModal(row)}>
                        {p ? "Edit" : "Set Policy"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
