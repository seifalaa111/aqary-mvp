"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { Badge, SeverityBadge, StatusPill, VerificationScore } from "@/components/ui/badges";
import { ProvenanceChip } from "@/components/ui/provenance";
import { DocumentViewer, type Highlight } from "@/components/documents/document-viewer";
import { egp, formatDate, relativeTime } from "@/lib/format";
import {
  claimListing,
  dispositionSignal,
  moderateMediaAction,
  overrideValuationAction,
  promoteField,
  publishListing,
  rejectListingAction,
  requestInfoAction,
  rerunAnalysis,
  resolveDiscrepancyAction,
  reviewReceiptAction,
} from "@/app/actions/analyst";
import { ReconciliationPanel } from "./reconciliation-panel";
import { FraudPanel } from "./fraud-panel";
import { MediaReview } from "./media-review";
import { DecisionPanel } from "./decision-panel";
import { ValuationReview } from "./valuation-review";
import { ReceiptsPanel } from "./receipts-panel";

type Src = { num: string | null; date?: string | null; text?: string | null; confidence?: number | null; documentId?: string | null; page?: number | null; bbox?: { x: number; y: number; w: number; h: number } | null; note?: string | null };

export interface WorkspaceField {
  key: string;
  kind: string;
  required: boolean;
  declared: Src;
  extracted: Src;
  receiptDerived: Src;
  developerStated: Src;
  verified: { num: string | null; date: string | null; text: string | null; source: string | null; at: string | null; overrideReason: string | null };
}

export interface WorkspaceProps {
  locale: string;
  listing: {
    id: string;
    reference: string;
    status: string;
    askingCash: string | null;
    flexibilityPct: number;
    verificationScore: number | null;
    verificationBreakdown: unknown;
    humanVerifiedBy: string | null;
    humanVerifiedAt: string | null;
    submittedAt: string | null;
    slaDueAt: string | null;
    assignedAnalyst: { id: string; name: string } | null;
    seller: { name: string; nameAr: string | null; nationalId: string | null; kycStatus: string };
    unit: {
      unitCode: string; unitType: string; buaSqm: string; bedrooms: number;
      project: string; projectAr: string; city: string; developer: string;
      currentDeveloperPrice: string | null;
    };
    policy: {
      assignmentAllowed: string; feeType: string; feePercentBps: number | null;
      minPercentPaidBps: number | null; minMonthsElapsed: number | null;
      typicalNocDays: number | null; requiredDocuments: string[];
    } | null;
  };
  fields: WorkspaceField[];
  documents: { id: string; type: string; fileName: string; status: string; sha256: string; hasExif: boolean; softwareTag: string | null; blurScore: number | null; pages: { pageNumber: number; width: number; height: number; url: string }[] }[];
  receipts: { id: string; documentId: string | null; fileName: string | null; declaredAmount: string | null; extractedAmount: string | null; verifiedAmount: string | null; date: string | null; method: string; status: string; confidence: number | null }[];
  media: { id: string; kind: string; roomTag: string | null; altEn: string; caption: string | null; moderationStatus: string; thumb: string; card: string }[];
  discrepancies: { id: string; fieldKey: string; severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL"; status: string; titleEn: string; titleAr: string | null; sourceA: string; valueA: string | null; sourceB: string; valueB: string | null; delta: string | null; deltaPct: number | null; evidence: unknown; resolution: string | null }[];
  signals: { id: string; type: string; severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL"; status: string; titleEn: string; titleAr: string | null; description: string; evidence: unknown; disposition: string | null }[];
  valuation: { id: string; low: string; mid: string; high: string; confidence: string; method: string; overrideReason: string | null; drivers: { labelEn: string; labelAr: string; effectPct: number; note: string }[]; comparables: { label: string; projectName: string; unitType: string; buaSqm: string; price: string; pricePerSqm: string; source: string }[] } | null;
  reconciliation: {
    declaredPaid: string | null; receiptsPaid: string; developerStatedPaid: string | null;
    scheduleExpectedPaid: string | null; extractedPaid: string | null;
    worstDelta: string; worstDeltaPct: number; receiptCount: number;
    verifiedReceiptCount: number; receiptCoveragePct: number;
    totalPrice: string | null; outstandingFromReceipts: string | null;
  } | null;
  readiness: { ready: boolean; approvedImageCount: number; blockers: { code: string; messageEn: string; messageAr: string; detail?: string }[] };
  extractionMeta: { mode: string; model: string; latencyMs: number; costUsd: string; fieldCount: number; createdAt: string } | null;
}

type Tab = "fields" | "reconciliation" | "receipts" | "fraud" | "media" | "valuation" | "decision";

/**
 * The split-screen review workspace. Source document on the left, extracted
 * fields on the right, keyboard-driven: j/k to move, Enter to accept, o to open
 * the citation. Accepting a field is what writes a verified value.
 */
export function ReviewWorkspace(props: WorkspaceProps) {
  const { locale, listing, fields, documents, readiness } = props;
  const t = useTranslations("analyst");
  const tl = useTranslations("fieldLabel");
  const td = useTranslations("docType");
  const router = useRouter();
  const isAr = locale === "ar";

  const [tab, setTab] = useState<Tab>("fields");
  const [cursor, setCursor] = useState(0);
  const [activeDoc, setActiveDoc] = useState<string | null>(documents[0]?.id ?? null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  // Time on file, so the 25-minute target is measurable rather than aspirational.
  const [openedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - openedAt) / 1000)), 1000);
    return () => clearInterval(i);
  }, [openedAt]);

  const doc = documents.find((d) => d.id === activeDoc);
  const openCitation = useCallback(
    (f: WorkspaceField) => {
      if (!f.extracted.documentId || !f.extracted.page) return;
      setActiveDoc(f.extracted.documentId);
      setHighlight({
        page: f.extracted.page,
        bbox: f.extracted.bbox ?? { x: 0.1, y: 0.1, w: 0.3, h: 0.03 },
        label: tl(f.key as "TOTAL_PRICE"),
      });
    },
    [tl],
  );

  const bestSource = (f: WorkspaceField): string => {
    if (f.developerStated.num) return "DEVELOPER_CONFIRMED";
    if (f.key === "AMOUNT_PAID" && f.receiptDerived.num) return "RECEIPT_VERIFIED";
    if (f.extracted.num || f.extracted.date || f.extracted.text) return "AI_EXTRACTED";
    return "SELLER_DECLARED";
  };

  const accept = useCallback(
    (index: number, source?: string) => {
      const f = fields[index];
      if (!f) return;
      startTransition(async () => {
        setError(null);
        const res = await promoteField({
          listingId: listing.id,
          key: f.key as never,
          source: (source ?? bestSource(f)) as never,
        });
        if (!res.ok) setError(res.error);
        else {
          setCursor((c) => Math.min(fields.length - 1, c + 1));
          router.refresh();
        }
      });
    },
    [fields, listing.id, router],
  );

  // Keyboard: j/k move, Enter accepts, o opens the citation.
  useEffect(() => {
    if (tab !== "fields") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(fields.length - 1, c + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        accept(cursor);
      } else if (e.key === "o") {
        e.preventDefault();
        const f = fields[cursor];
        if (f) openCitation(f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, cursor, fields, accept, openCitation]);

  // Keep the cursor row in view without touching the outer scroll.
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    const container = listRef.current?.parentElement;
    if (el && container) {
      const top = el.offsetTop - container.offsetTop;
      if (top < container.scrollTop || top > container.scrollTop + container.clientHeight - 120) {
        container.scrollTop = top - 60;
      }
    }
  }, [cursor]);

  const verifiedCount = fields.filter((f) => f.verified.source).length;
  const requiredDone = fields.filter((f) => f.required && f.verified.source).length;
  const requiredTotal = fields.filter((f) => f.required).length;
  const openDiscrepancies = props.discrepancies.filter((d) => d.status === "OPEN");
  const openSignals = props.signals.filter((s) => s.status === "OPEN" || s.status === "ESCALATED");

  const tabs: { key: Tab; label: string; badge?: number; tone?: "flagged" }[] = [
    { key: "fields", label: t("fields"), badge: fields.length - verifiedCount },
    { key: "reconciliation", label: t("reconciliation") },
    { key: "receipts", label: t("receipts"), badge: props.receipts.filter((r) => r.status === "PENDING").length },
    {
      key: "fraud",
      label: t("fraud"),
      badge: openSignals.length,
      tone: openSignals.some((s) => s.severity === "CRITICAL") ? "flagged" : undefined,
    },
    { key: "media", label: t("media"), badge: props.media.filter((m) => m.moderationStatus !== "APPROVED").length },
    { key: "valuation", label: t("valuation") },
    { key: "decision", label: t("decision") },
  ];

  return (
    <div className="flex flex-col">
      {/* ---- File header ---- */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-4 py-4 md:px-6">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-50">{listing.reference}</span>
            <StatusPill status={listing.status} />
            <VerificationScore
              score={listing.verificationScore}
              breakdown={listing.verificationBreakdown as never}
              locale={locale}
              size="sm"
            />
            {listing.assignedAnalyst ? (
              <Badge tone="neutral">{t("assigned", { name: listing.assignedAnalyst.name.split(" ")[0] })}</Badge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    await claimListing(listing.id);
                    router.refresh();
                  })
                }
              >
                {t("assignToMe")}
              </Button>
            )}
          </div>
          <h1 className="font-display text-xl text-ink">
            {isAr ? listing.unit.projectAr : listing.unit.project} · {listing.unit.unitCode}
          </h1>
          <p className="mt-0.5 text-xs text-ink-50">
            {listing.unit.developer} · {listing.unit.city} · {listing.unit.bedrooms} bed ·{" "}
            {Number(listing.unit.buaSqm).toFixed(0)} m² · seller {listing.seller.name}
            {" · KYC "}
            {listing.seller.kycStatus.toLowerCase()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-end">
          <div>
            <p className="eyebrow">{t("timeOnFile")}</p>
            <p className="money text-money-sm font-semibold text-ink">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </p>
          </div>
          <div>
            <p className="eyebrow">{isAr ? "الحقول المطلوبة" : "Required fields"}</p>
            <p
              className={cn(
                "money text-money-sm font-semibold",
                requiredDone === requiredTotal ? "text-verified" : "text-ink",
              )}
            >
              {requiredDone}/{requiredTotal}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                await rerunAnalysis(listing.id);
                router.refresh();
              })
            }
          >
            Re-run analysis
          </Button>
        </div>
      </header>

      {error ? (
        <div className="px-4 pt-4 md:px-6">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}

      {/* ---- Split screen ---- */}
      <div className="grid min-h-[calc(100vh-13rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* LEFT: documents */}
        <section className="border-e border-rule p-4 md:p-6" aria-label={t("documents")}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {documents.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setActiveDoc(d.id);
                  setHighlight(null);
                }}
                className={cn(
                  "rounded-sm border px-2.5 py-1 text-2xs transition-colors",
                  activeDoc === d.id
                    ? "border-ink bg-ink text-ink-text"
                    : "border-rule-strong text-ink-50 hover:text-ink",
                )}
              >
                {td(d.type as "SALE_CONTRACT")}
                <span className="ms-1 opacity-60">{d.pages.length}p</span>
              </button>
            ))}
          </div>

          {doc ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-2xs text-ink-30">
                <span className="font-mono">sha {doc.sha256}</span>
                {doc.softwareTag ? <Badge tone="pending">{doc.softwareTag}</Badge> : null}
                {!doc.hasExif ? <Badge tone="neutral">no exif</Badge> : null}
                {doc.blurScore !== null && doc.blurScore < 90 ? <Badge tone="pending">soft focus</Badge> : null}
              </div>
              {doc.pages.length > 0 ? (
                <DocumentViewer pages={doc.pages} highlight={highlight} />
              ) : (
                <div className="rounded-lg border border-dashed border-rule-strong p-10 text-center text-sm text-ink-50">
                  {doc.fileName} has no rendered pages — it is stored as a PDF and can be downloaded from the
                  document route.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-rule-strong p-10 text-center text-sm text-ink-50">
              No documents on this file.
            </div>
          )}
        </section>

        {/* RIGHT: review panels */}
        <section className="flex min-w-0 flex-col" aria-label={t("fields")}>
          <div className="flex gap-1 overflow-x-auto border-b border-rule px-4 py-2 md:px-6 scrollbar-thin">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                aria-pressed={tab === tb.key}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs transition-colors",
                  tab === tb.key ? "bg-paper-sunken font-medium text-ink" : "text-ink-50 hover:text-ink",
                )}
              >
                {tb.label}
                {tb.badge ? (
                  <span
                    className={cn(
                      "money rounded-xs px-1.5 text-2xs",
                      tb.tone === "flagged" ? "bg-flagged text-white" : "bg-ink text-ink-text",
                    )}
                  >
                    {tb.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
            {tab === "fields" ? (
              <>
                <p className="mb-4 font-mono text-2xs uppercase tracking-wider text-ink-30">
                  {t("keyboardHint")}
                </p>
                <ul ref={listRef} className="flex flex-col gap-2">
                  {fields.map((f, i) => {
                    const isCursor = i === cursor;
                    const verified = Boolean(f.verified.source);
                    const disc = openDiscrepancies.filter((d) => d.fieldKey === f.key);

                    const val = (s: Src) =>
                      s.num
                        ? f.kind === "MONEY"
                          ? egp(s.num, { decimals: 0 })
                          : Number(s.num).toString()
                        : s.date
                          ? formatDate(s.date, locale)
                          : (s.text ?? null);

                    return (
                      <li
                        key={f.key}
                        onClick={() => setCursor(i)}
                        className={cn(
                          "rounded-md border p-3 transition-colors",
                          isCursor ? "border-brass bg-brass-soft/40" : "border-rule bg-paper-raised",
                          verified && !isCursor && "border-verified/35 bg-verified-soft/30",
                          disc.length > 0 && "border-pending/50",
                        )}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-medium text-ink">
                            {tl(f.key as "TOTAL_PRICE")}
                            {f.required ? <Badge tone="neutral">required</Badge> : null}
                            {disc.length > 0 ? <SeverityBadge severity={disc[0]!.severity} /> : null}
                          </span>
                          <span className="flex items-center gap-2">
                            {f.extracted.confidence != null ? (
                              <Badge
                                tone={
                                  f.extracted.confidence >= 0.85
                                    ? "verified"
                                    : f.extracted.confidence >= 0.65
                                      ? "info"
                                      : "pending"
                                }
                              >
                                {Math.round(f.extracted.confidence * 100)}%
                              </Badge>
                            ) : null}
                            {f.extracted.documentId && f.extracted.page ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCitation(f);
                                }}
                                className="font-mono text-2xs text-info underline underline-offset-2"
                              >
                                p{f.extracted.page}
                              </button>
                            ) : null}
                          </span>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                          <Cell label={t("reconDeclared")} value={val(f.declared)} source="SELLER_DECLARED" />
                          <Cell label="extracted" value={val(f.extracted)} source="AI_EXTRACTED" />
                          <Cell label={t("reconReceipts")} value={val(f.receiptDerived)} source="RECEIPT_VERIFIED" />
                          <Cell label={t("reconDeveloper")} value={val(f.developerStated)} source="DEVELOPER_CONFIRMED" />
                        </div>

                        {verified ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-verified-soft px-2.5 py-2">
                            <span className="flex items-center gap-2 text-sm">
                              <ProvenanceChip source={f.verified.source as never} size="xs" />
                              <span className="money font-semibold text-verified">
                                {f.verified.num
                                  ? f.kind === "MONEY"
                                    ? egp(f.verified.num, { decimals: 0 })
                                    : f.verified.num
                                  : f.verified.date
                                    ? formatDate(f.verified.date, locale)
                                    : f.verified.text}
                              </span>
                            </span>
                            <span className="text-2xs text-verified/70">
                              {t("verifiedBy", { source: f.verified.source ?? "" })} ·{" "}
                              {relativeTime(f.verified.at, locale)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="me-1 text-2xs text-ink-50">{t("promoteFrom")}:</span>
                            {(
                              [
                                ["SELLER_DECLARED", f.declared],
                                ["AI_EXTRACTED", f.extracted],
                                ["RECEIPT_VERIFIED", f.receiptDerived],
                                ["DEVELOPER_CONFIRMED", f.developerStated],
                              ] as const
                            )
                              .filter(([, s]) => s.num || s.date || s.text)
                              .map(([src]) => (
                                <Button
                                  key={src}
                                  size="sm"
                                  variant={src === bestSource(f) ? "primary" : "secondary"}
                                  loading={pending && isCursor}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    accept(i, src);
                                  }}
                                >
                                  {src.split("_")[0]!.toLowerCase()}
                                </Button>
                              ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOverriding(f.key);
                                setOverrideValue(f.declared.num ?? "");
                                setOverrideReason("");
                              }}
                            >
                              {t("correctFieldAction")}
                            </Button>
                          </div>
                        )}

                        {overriding === f.key ? (
                          <div className="mt-3 flex flex-col gap-2 rounded-sm bg-paper-sunken p-3">
                            <p className="text-2xs font-medium text-ink-70">{t("overrideTitle")}</p>
                            <Input
                              value={overrideValue}
                              onChange={(e) => setOverrideValue(e.target.value)}
                              type={f.kind === "DATE" ? "date" : "text"}
                              className="money"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Textarea
                              rows={2}
                              placeholder={t("overrideReason")}
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                loading={pending}
                                disabled={overrideReason.trim().length < 8}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startTransition(async () => {
                                    const res = await promoteField({
                                      listingId: listing.id,
                                      key: f.key as never,
                                      source: "ANALYST_OVERRIDE",
                                      override: {
                                        ...(f.kind === "DATE" ? { date: overrideValue } : { num: overrideValue }),
                                        reason: overrideReason,
                                      },
                                    });
                                    if (!res.ok) setError(res.error);
                                    else {
                                      setOverriding(null);
                                      router.refresh();
                                    }
                                  });
                                }}
                              >
                                Save override
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverriding(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

            {tab === "reconciliation" ? (
              <ReconciliationPanel
                data={props.reconciliation}
                discrepancies={props.discrepancies}
                locale={locale}
                onResolve={(discrepancyId, resolution, resolveTo, waive) =>
                  startTransition(async () => {
                    const res = await resolveDiscrepancyAction({
                      listingId: listing.id,
                      discrepancyId,
                      resolution,
                      resolveTo: resolveTo as never,
                      waive,
                    });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
                pending={pending}
              />
            ) : null}

            {tab === "receipts" ? (
              <ReceiptsPanel
                receipts={props.receipts}
                locale={locale}
                pending={pending}
                onReview={(receiptId, decision, amount) =>
                  startTransition(async () => {
                    const res = await reviewReceiptAction({
                      listingId: listing.id,
                      receiptId,
                      decision,
                      amount,
                    });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
                onOpen={(documentId) => {
                  setActiveDoc(documentId);
                  setHighlight(null);
                }}
              />
            ) : null}

            {tab === "fraud" ? (
              <FraudPanel
                signals={props.signals}
                locale={locale}
                pending={pending}
                onDisposition={(signalId, status, note) =>
                  startTransition(async () => {
                    const res = await dispositionSignal({ listingId: listing.id, signalId, status, note });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
              />
            ) : null}

            {tab === "media" ? (
              <MediaReview
                media={props.media}
                minImages={5}
                approvedCount={readiness.approvedImageCount}
                locale={locale}
                pending={pending}
                onModerate={(mediaId, status, note) =>
                  startTransition(async () => {
                    const res = await moderateMediaAction({ listingId: listing.id, mediaId, status, note });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
              />
            ) : null}

            {tab === "valuation" ? (
              <ValuationReview
                valuation={props.valuation}
                developerToday={listing.unit.currentDeveloperPrice}
                locale={locale}
                pending={pending}
                onOverride={(low, mid, high, reason) =>
                  startTransition(async () => {
                    if (!props.valuation) return;
                    const res = await overrideValuationAction({
                      listingId: listing.id,
                      valuationId: props.valuation.id,
                      low,
                      mid,
                      high,
                      reason,
                    });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
              />
            ) : null}

            {tab === "decision" ? (
              <DecisionPanel
                listingId={listing.id}
                status={listing.status}
                readiness={readiness}
                extractionMeta={props.extractionMeta}
                policy={listing.policy}
                askingCash={listing.askingCash}
                locale={locale}
                pending={pending}
                onPublish={(note) =>
                  startTransition(async () => {
                    const res = await publishListing({ listingId: listing.id, note });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
                onRequestInfo={(items, note) =>
                  startTransition(async () => {
                    const res = await requestInfoAction({ listingId: listing.id, items, note });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
                onReject={(reason) =>
                  startTransition(async () => {
                    const res = await rejectListingAction({ listingId: listing.id, reason });
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  source,
}: {
  label: string;
  value: string | null;
  source: "SELLER_DECLARED" | "AI_EXTRACTED" | "RECEIPT_VERIFIED" | "DEVELOPER_CONFIRMED";
}) {
  return (
    <div className={cn("rounded-sm border border-rule bg-paper-sunken/50 px-2 py-1.5", !value && "opacity-50")}>
      <div className="mb-0.5 flex items-center gap-1">
        <ProvenanceChip source={source} size="xs" />
      </div>
      <p className={cn("money truncate text-xs", value ? "text-ink" : "text-ink-30")} title={value ?? ""}>
        {value ?? "—"}
      </p>
      <p className="truncate text-[9px] uppercase tracking-wider text-ink-30">{label}</p>
    </div>
  );
}
