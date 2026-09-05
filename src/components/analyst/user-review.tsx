"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, Input, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { promoteBuyerTier, reviewKyc, reviewDocumentAction, verifyProofOfFundsAction } from "@/app/actions/analyst";
import { egp, formatDate } from "@/lib/format";

export interface UserDocumentRow {
  id: string;
  type: string;
  fileName: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

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
  verifiedAvailableCash?: string | null;
  verifiedMaxInstallment?: string | null;
  readiness: string | null;
  proofOfFunds: boolean;
  listingCount: number;
  offerCount: number;
  documents?: UserDocumentRow[];
}

/**
 * User and KYC review workbench.
 * Analysts inspect authentic identity and financial documents, approve or request replacements,
 * and verify buyer funds capacity.
 */
export function UserReview({ users, locale }: { users: UserRow[]; locale: string }) {
  const tk = useTranslations("consoleUi");
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeReasonDocId, setActiveReasonDocId] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<"REJECTED" | "NEEDS_REPLACEMENT">("NEEDS_REPLACEMENT");
  const [reasonText, setReasonText] = useState("");
  const [pofUserId, setPofUserId] = useState<string | null>(null);
  const [pofCash, setPofCash] = useState("");
  const [pofInstallment, setPofInstallment] = useState("");
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
      else {
        setActiveReasonDocId(null);
        setReasonText("");
        setPofUserId(null);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="flagged">{error}</Callout> : null}

      <Input
        type="search"
        placeholder={tk("filterUsersPlaceholder")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-col gap-4">
        {shown.map((u) => (
          <Card key={u.id}>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
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
                    <div className="mt-1 flex flex-col gap-0.5 text-2xs text-ink-50">
                      <p className="money">
                        Declared: cash {egp(u.availableCash, { style: "compact" })} · instalment{" "}
                        {egp(u.maxInstallment, { style: "compact" })} · {u.readiness ?? "—"}
                      </p>
                      {u.verifiedAvailableCash ? (
                        <p className="money font-medium text-brass">
                          Verified: cash {egp(u.verifiedAvailableCash, { style: "compact" })}
                          {u.verifiedMaxInstallment ? ` · instalment ${egp(u.verifiedMaxInstallment, { style: "compact" })}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-1 text-2xs text-ink-30">
                    {u.listingCount} listings · {u.offerCount} offers
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {u.kycStatus !== "VERIFIED" ? (
                    <Button size="sm" loading={pending} onClick={() => act(() => reviewKyc({ userId: u.id, status: "VERIFIED" }))}>{tk("verifyKyc")}</Button>
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
                      onClick={() => {
                        setPofUserId(u.id);
                        setPofCash(u.availableCash ?? "");
                        setPofInstallment(u.maxInstallment ?? "");
                      }}
                    >{tk("verifyPof")}</Button>
                  ) : null}
                </div>
              </div>

              {/* Proof of funds verification form */}
              {pofUserId === u.id ? (
                <div className="rounded-md border border-brass/40 bg-brass/5 p-3">
                  <p className="text-xs font-semibold text-ink">{tk("verifyPofPriority")}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Input
                      type="number"
                      placeholder={tk("verifiedCashEgp")}
                      value={pofCash}
                      onChange={(e) => setPofCash(e.target.value)}
                      className="w-44"
                    />
                    <Input
                      type="number"
                      placeholder={tk("verifiedMaxInstallmentEgp")}
                      value={pofInstallment}
                      onChange={(e) => setPofInstallment(e.target.value)}
                      className="w-48"
                    />
                    <Button
                      size="sm"
                      loading={pending}
                      onClick={() =>
                        act(() =>
                          verifyProofOfFundsAction({
                            userId: u.id,
                            verifiedCash: Number(pofCash),
                            verifiedInstallment: pofInstallment ? Number(pofInstallment) : undefined,
                          })
                        )
                      }
                    >{tk("confirmGrantPriority")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPofUserId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* User documents review section */}
              {u.documents && u.documents.length > 0 ? (
                <div className="rule-t pt-3">
                  <p className="eyebrow mb-2">Uploaded KYC & Diligence Documents ({u.documents.length})</p>
                  <div className="flex flex-col gap-2">
                    {u.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-paper-sunken px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-70">
                              {doc.type.replace(/_/g, " ")}
                            </span>
                            <Badge
                              tone={
                                doc.status === "APPROVED"
                                  ? "verified"
                                  : doc.status === "REJECTED"
                                    ? "flagged"
                                    : "pending"
                              }
                            >
                              {doc.status.toLowerCase()}
                            </Badge>
                          </div>
                          <a
                            href={`/documents/${doc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 block truncate text-ink hover:underline"
                          >
                            {doc.fileName}
                          </a>
                          {doc.rejectionReason ? (
                            <p className="mt-1 text-2xs text-flagged">Reason: {doc.rejectionReason}</p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {doc.status !== "APPROVED" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={pending}
                              onClick={() => act(() => reviewDocumentAction({ documentId: doc.id, status: "APPROVED" }))}
                            >
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveReasonDocId(doc.id);
                              setReasonAction("NEEDS_REPLACEMENT");
                              setReasonText("");
                            }}
                          >{tk("needReplacement")}</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveReasonDocId(doc.id);
                              setReasonAction("REJECTED");
                              setReasonText("");
                            }}
                          >
                            Reject
                          </Button>
                        </div>

                        {activeReasonDocId === doc.id ? (
                          <div className="mt-2 w-full rounded-md border border-rule bg-paper p-2">
                            <p className="mb-1 text-2xs font-medium text-ink">
                              Written reason for {reasonAction === "REJECTED" ? "rejection" : "replacement request"} (min 8 chars):
                            </p>
                            <div className="flex gap-2">
                              <Input
                                value={reasonText}
                                onChange={(e) => setReasonText(e.target.value)}
                                placeholder={tk("egRejectionReason")}
                                className="flex-1"
                              />
                              <Button
                                size="sm"
                                disabled={reasonText.trim().length < 8}
                                loading={pending}
                                onClick={() =>
                                  act(() =>
                                    reviewDocumentAction({
                                      documentId: doc.id,
                                      status: reasonAction,
                                      reason: reasonText,
                                    })
                                  )
                                }
                              >
                                Submit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setActiveReasonDocId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
