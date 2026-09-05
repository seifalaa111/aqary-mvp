"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import type { Role } from "@prisma/client";
import { Button, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { formatDate } from "@/lib/format";
import { adminUpdateUserRoleAction } from "@/app/actions/admin";
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

  // Identity Unmasking State
  const [unmaskedId, setUnmaskedId] = useState<string | null>(null);

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
        (u.nationalId && u.nationalId.includes(q))
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

  const maskPhone = (phone: string, unmask: boolean) => {
    if (unmask) return phone;
    if (phone.length <= 4) return phone;
    return phone.slice(0, 4) + " •••• " + phone.slice(-2);
  };

  const maskId = (nid: string | null, unmask: boolean) => {
    if (!nid) return "—";
    if (unmask) return nid;
    return nid.slice(0, 3) + "••••••••" + nid.slice(-3);
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[260px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالاسم، البريد، الهاتف، الرقم القومي..." : "Search name, email, phone, national ID..."}
          />
        </div>
        <div className="w-44">
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="ALL">{isAr ? "جميع الأدوار" : "All Roles"}</option>
            {AVAILABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={kycFilter} onChange={(e) => setKycFilter(e.target.value)}>
            <option value="ALL">{isAr ? "جميع حالات KYC" : "All KYC States"}</option>
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
            {isAr ? "إلغاء التصفية" : "Clear filters"}
          </Button>
        )}
      </div>

      {/* Role Change Modal */}
      {editingUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-rule bg-paper-raised p-6 shadow-xl space-y-4">
            <h2 className="font-display text-lg text-ink">
              {isAr ? "تعديل أدوار المستخدم" : "Modify User Roles"}
            </h2>
            <p className="text-xs text-ink-50">
              {isAr
                ? "جميع تعديلات الأدوار تتطلب مبررًا إداريًا يُحفظ في سجل التدقيق."
                : "Privileged role modifications require an explicit audit justification of at least 8 characters."}
            </p>

            {roleError && <p className="text-xs text-flagged">{roleError}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-70 mb-1">Action</label>
                <Select value={roleAction} onChange={(e) => setRoleAction(e.target.value as "ADD" | "REMOVE")}>
                  <option value="ADD">Grant Role (+)</option>
                  <option value="REMOVE">Revoke Role (-)</option>
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
              <label className="block text-xs font-medium text-ink-70 mb-1">
                Justification (Mandatory, min 8 characters)
              </label>
              <Textarea
                rows={3}
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="Reason for granting or revoking this permission..."
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
              >
                Confirm Change
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-12 text-center text-sm text-ink-50">
          {isAr ? "لا يوجد مستخدمون يطابقون هذه التصفية" : "No users match current filters"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule scrollbar-thin">
          <table className="w-full min-w-[960px] border-collapse bg-paper-raised text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunken/70">
                <th className="p-3 text-start text-xs font-medium text-ink-50">User & Identity</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">Assigned Roles</th>
                <th className="p-3 text-start text-xs font-medium text-ink-50">KYC Status</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">Buyer Tier</th>
                <th className="p-3 text-center text-xs font-medium text-ink-50">Activity</th>
                <th className="p-3 text-end text-xs font-medium text-ink-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isUnmasked = unmaskedId === u.id;
                return (
                  <tr key={u.id} className="border-b border-rule hover:bg-paper-sunken/30 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-ink">{u.name}</div>
                      <div className="font-mono text-2xs text-ink-50 space-x-2">
                        <span>{maskPhone(u.phone, isUnmasked)}</span>
                        {u.email && <span>· {u.email}</span>}
                      </div>
                      <div className="text-2xs text-ink-30">
                        NID: {maskId(u.nationalId, isUnmasked)}
                        <button
                          type="button"
                          onClick={() => setUnmaskedId(isUnmasked ? null : u.id)}
                          className="ms-2 text-info hover:underline"
                        >
                          {isUnmasked ? "Mask" : "Reveal"}
                        </button>
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
                      >
                        Edit Roles
                      </Button>
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
