"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, Input, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { promoteBuyerTier, reviewKyc } from "@/app/actions/analyst";
import { egp, formatDate } from "@/lib/format";

export interface UserRow {
  id: string;
  name: string;
  nameAr: string | null;
  phone: string;
  email: string | null;
  roles: string[];
  kycStatus: string;
  nationalId: string | null;
  createdAt: string;
  tier: string | null;
  availableCash: string | null;
  maxInstallment: string | null;
  readiness: string | null;
  proofOfFunds: boolean;
  listingCount: number;
  offerCount: number;
}

/**
 * User and KYC review. National IDs are shown masked by default — an analyst
 * reveals one deliberately, and the reveal is a conscious act rather than the
 * number sitting on screen for anyone walking past.
 */
export function UserReview({ users, locale }: { users: UserRow[]; locale: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = users.filter((u) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      u.roles.join(",").toLowerCase().includes(q)
    );
  });

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="flagged">{error}</Callout> : null}

      <Input
        type="search"
        placeholder="Filter by name, email, phone or role"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-col gap-3">
        {shown.map((u) => (
          <Card key={u.id}>
            <CardBody className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{u.name}</span>
                  {u.roles.map((r) => (
                    <Badge key={r} tone="neutral">
                      {r.toLowerCase()}
                    </Badge>
                  ))}
                  <Badge
                    tone={
                      u.kycStatus === "VERIFIED" ? "verified" : u.kycStatus === "REJECTED" ? "flagged" : "pending"
                    }
                  >
                    KYC {u.kycStatus.toLowerCase()}
                  </Badge>
                  {u.tier ? <Badge tone={u.tier === "PRIORITY" ? "brass" : "info"}>{u.tier.toLowerCase()}</Badge> : null}
                </div>

                <p className="money text-2xs text-ink-50" dir="ltr">
                  {u.phone}
                  {u.email ? ` · ${u.email}` : ""}
                </p>
                <p className="money mt-0.5 text-2xs text-ink-30">
                  ID{" "}
                  {u.nationalId ? (
                    revealed === u.id ? (
                      <button type="button" onClick={() => setRevealed(null)} className="underline">
                        {u.nationalId}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setRevealed(u.id)} className="underline">
                        •••••••••{u.nationalId.slice(-4)} (reveal)
                      </button>
                    )
                  ) : (
                    "not supplied"
                  )}
                  {" · joined "}
                  {formatDate(u.createdAt, locale)}
                </p>

                {u.tier ? (
                  <p className="money mt-1 text-2xs text-ink-50">
                    cash {egp(u.availableCash, { style: "compact" })} · instalment{" "}
                    {egp(u.maxInstallment, { style: "compact" })} · {u.readiness ?? "—"} ·{" "}
                    {u.proofOfFunds ? "proof of funds on file" : "no proof of funds"}
                  </p>
                ) : null}
                <p className="mt-1 text-2xs text-ink-30">
                  {u.listingCount} listings · {u.offerCount} offers
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {u.kycStatus !== "VERIFIED" ? (
                  <Button size="sm" loading={pending} onClick={() => act(() => reviewKyc({ userId: u.id, status: "VERIFIED" }))}>
                    Verify KYC
                  </Button>
                ) : null}
                {u.kycStatus !== "REJECTED" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => act(() => reviewKyc({ userId: u.id, status: "REJECTED" }))}
                  >
                    Reject
                  </Button>
                ) : null}
                {u.tier && u.tier !== "PRIORITY" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    onClick={() => act(() => promoteBuyerTier({ userId: u.id, tier: "PRIORITY" }))}
                  >
                    Grant priority
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
