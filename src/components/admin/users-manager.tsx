"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import type { Role } from "@prisma/client";
import { Button, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { formatDate } from "@/lib/format";
import { adminRevealUserIdentity, adminUpdateUserRoleAction } from "@/app/actions/admin";
import { reviewKyc, promoteBuyerTier } from "@/app/actions/analyst";

export interface AdminUserItem {
  id: string;
  name: string;
  nameAr: string | null;
  phone: string;
  email: string | null;
  roles: Role[];
  kycStatus: string;
  nationalId: string | null;
  createdAt: string;
  buyerTier: string | null;
  listingCount: number;
  offerCount: number;
  dealCount: number;
}

const AVAILABLE_ROLES: Role[] = ["BUYER", "SELLER", "ANALYST", "ADMIN", "DEVELOPER_PARTNER"];

export function UsersManager({
  locale,
  users,
}: {
  locale: string;
  users: AdminUserItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [kycFilter, setKycFilter] = useState("ALL");
  const [pending, startTransition] = useTransition();

  // Role Edit Modal State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [roleToModify, setRoleToModify] = useState<Role>("ANALYST");
  const [roleAction, setRoleAction] = useState<"ADD" | "REMOVE">("ADD");
  const [roleReason, setRoleReason] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);

  // Identity disclosure. The page never receives plaintext identity data, so a
  // reveal is a server round-trip that writes USER_PII_REVEALED to the audit
  // trail. Results are held only for this render of this admin's session.
  const [revealing, setRevealing] = useState<string | null>(null);
  const [revealReason, setRevealReason] = useState("");
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { nationalId: string | null; phone: string }>>({});

  const t = useTranslations("admin");
  const tk = useTranslations("consoleUi");
  const isAr = locale === "ar";

  const filtered = users.filter((u) => {
    if (roleFilter !== "ALL" && !u.roles.includes(roleFilter as Role)) return false;
    if (kycFilter !== "ALL" && u.kycStatus !== kycFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        u.phone.includes(q) ||
        // Masked values only — the plaintext is not in this payload by design.
        (u.nationalId !== null && u.nationalId.includes(q))
      );
    }
    return true;
  });

  const handleRoleSubmit = () => {
    if (!editingUserId) return;
    setRoleError(null);
    startTransition(async () => {
      const res = await adminUpdateUserRoleAction({
        userId: editingUserId,
        role: roleToModify,
        action: roleAction,
        reason: roleReason,
      });
      if (!res.ok) {
        setRoleError(res.error);
      } else {
        setEditingUserId(null);
        setRoleReason("");
        router.refresh();
      }
    });
  };

  const handleKycChange = (userId: string, status: "VERIFIED" | "REJECTED" | "PENDING") => {
    startTransition(async () => {
      await reviewKyc({ userId, status });
      router.refresh();
    });
  };

  const submitReveal = (userId: string) => {
    setRevealError(null);
    startTransition(async () => {
      const res = await adminRevealUserIdentity({ userId, reason: revealReason });
      if (!res.ok) {
        setRevealError(res.error);
        return;
      }
      setRevealed((prev) => ({ ...prev, [userId]: res.data! }));
      setRevealing(null);
      setRevealReason("");
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
            placeholder={t("searchNameEmailPhoneNational")}
          />
        </div>
        <div className="w-44">
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="ALL">{t("allRoles")}</option>
            {AVAILABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={kycFilter} onChange={(e) => setKycFilter(e.target.value)}>
            <option value="ALL">{t("allKycStates")}</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="PENDING">PENDING</option>
            <option value="NOT_STARTED">NOT_STARTED</option>
            <option value="REJECTED">REJECTED</option>
          </Select>
        </div>
        {(search || roleFilter !== "ALL" || kycFilter !== "ALL") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setRoleFilter("ALL");
              setKycFilter("ALL");
            }}
          >
            {t("clearFilters")}
          </Button>
        )}
      </div>

      {/* Role Change Modal */}
      {revealing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-rule bg-paper-raised p-6 shadow-xl">
            <h2 className="font-display text-lg text-ink">
              {t("revealIdentityData")}
            </h2>
            <p className="text-xs text-ink-50">
              {t("disclosesNationalIdPhoneNumber")}
            </p>

            {revealError && <p className="text-xs text-flagged">{revealError}</p>}

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-70">
                {t("reasonMinimum8Characters")}
              </label>
              <Textarea
                rows={3}
                value={revealReason}
                onChange={(e) => setRevealReason(e.target.value)}
                placeholder={
                  t("eGKycIdentityMatch")
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setRevealing(null);
                  setRevealReason("");
                  setRevealError(null);
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                disabled={pending || revealReason.trim().length < 8}
                onClick={() => submitReveal(revealing)}
              >
                {t("revealLog")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4">
            <h2 className="font-display text-lg text-ink">
              {t("modifyUserRoles")}
            </h2>
            <p className="text-xs text-ink-50">
              {t("privilegedRoleModificationsRequireExplicit")}
            </p>

            {roleError && <p className="text-xs text-flagged">{roleError}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-70 mb-1">Action</label>
                <Select value={roleAction} onChange={(e) => setRoleAction(e.target.value as "ADD" | "REMOVE")}>
                  <option value="ADD">{tk("grantRole")}</option>
                  <option value="REMOVE">{tk("revokeRole")}</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-70 mb-1">Role</label>
                <Select value={roleToModify} onChange={(e) => setRoleToModify(e.target.value as Role)}>
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">{tk("justification8")}</label>
              <Textarea
                rows={3}
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder={tk("roleReasonPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingUserId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                disabled={roleReason.trim().length < 8}
                onClick={handleRoleSubmit}
              >{tk("confirmChange")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          {t("noUsersMatchCurrentFilters")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[960px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("userIdentity")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("assignedRoles")}</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">{tk("kycStatusLabel")}</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">{tk("buyerTier")}</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">{tk("activity")}</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const clear = revealed[u.id];
                return (
                  <tr key={u.id} className="border-b border-rule hover:bg-paper-sunken/30 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-ink">{u.name}</div>
                      <div className="font-mono text-2xs text-ink-50 space-x-2">
                        <span>{clear ? clear.phone : u.phone}</span>
                        {u.email && <span>· {u.email}</span>}
                      </div>
                      <div className="text-2xs text-ink-30">
                        NID: {clear ? (clear.nationalId ?? "—") : (u.nationalId ?? "—")}
                        {clear ? (
                          <button
                            type="button"
                            onClick={() =>
                              setRevealed((prev) => {
                                const next = { ...prev };
                                delete next[u.id];
                                return next;
                              })
                            }
                            className="ms-2 text-ink-50 hover:underline"
                          >
                            {t("mask")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRevealing(u.id);
                              setRevealReason("");
                              setRevealError(null);
                            }}
                            className="ms-2 text-info hover:underline"
                          >
                            {t("revealAudited")}
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 items-center">
                        {u.roles.map((r) => (
                          <Badge
                            key={r}
                            tone={r === "ADMIN" ? "flagged" : r === "ANALYST" ? "brass" : "neutral"}
                          >
                            {r}
                          </Badge>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(u.id);
                            setRoleReason("");
                            setRoleError(null);
                          }}
                          className="text-2xs text-info hover:underline ms-1"
                        >
                          Manage
                        </button>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            u.kycStatus === "VERIFIED"
                              ? "verified"
                              : u.kycStatus === "REJECTED"
                              ? "flagged"
                              : "pending"
                          }
                        >
                          {u.kycStatus}
                        </Badge>
                        {u.kycStatus !== "VERIFIED" && (
                          <button
                            type="button"
                            onClick={() => handleKycChange(u.id, "VERIFIED")}
                            className="text-2xs text-verified hover:underline font-medium"
                          >
                            Verify
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      {u.buyerTier ? (
                        <Badge tone={u.buyerTier === "PRIORITY" ? "brass" : "neutral"}>
                          {u.buyerTier}
                        </Badge>
                      ) : (
                        <span className="text-2xs text-ink-30">—</span>
                      )}
                    </td>

                    <td className="p-3 text-center text-xs text-ink-50">
                      <span>{u.listingCount} listings</span> · <span>{u.offerCount} offers</span>
                    </td>

                    <td className="p-3 text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingUserId(u.id);
                          setRoleReason("");
                          setRoleError(null);
                        }}
                      >{tk("editRoles")}</Button>
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
