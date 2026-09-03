"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, Eyebrow, Input, MoneyInput, cn } from "@/components/ui/primitives";
import { Badge, SeverityBadge } from "@/components/ui/badges";
import { ProvenanceChip } from "@/components/ui/provenance";
import { DocumentViewer, type Highlight } from "@/components/documents/document-viewer";
import { confirmExtractionReview, correctField } from "@/app/actions/seller";
import { egp, formatDate } from "@/lib/format";

interface SourceVal {
  num: string | null;
  date?: string | null;
  text?: string | null;
  confidence?: number | null;
  documentId?: string | null;
  page?: number | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  note?: string | null;
}

export interface ReviewRow {
  key: string;
  kind: string;
  declared: SourceVal;
  extracted: SourceVal;
  receiptDerived: SourceVal;
  developerStated: SourceVal;
}

export interface ReviewDiscrepancy {
  id: string;
  fieldKey: string;
  severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL";
  titleEn: string;
  titleAr: string | null;
  sourceA: string;
  valueA: string | null;
  sourceB: string;
  valueB: string | null;
  delta: string | null;
}

/**
 * "Confirm your contract summary." Every field is shown beside the source it
 * was read from, with the page citation, and the seller can correct it. A
 * correction is stored as a NEW declared value — never as verified truth.
 */
export function ExtractionReview({
  listingId,
  status,
  rows,
  discrepancies,
  documents,
  extractionMeta,
  receiptTotal,
  receiptCount,
  locale,
}: {
  listingId: string;
  status: string;
  rows: ReviewRow[];
  discrepancies: ReviewDiscrepancy[];
  documents: { id: string; type: string; fileName: string; pages: { page: number; url: string; width: number; height: number }[] }[];
  extractionMeta: { mode: string; model: string; latencyMs: number; fieldCount: number; createdAt: string } | null;
  receiptTotal: string;
  receiptCount: number;
  locale: string;
}) {
  const t = useTranslations("seller");
  const tl = useTranslations("fieldLabel");
  const td = useTranslations("docType");
  const router = useRouter();
  const isAr = locale === "ar";

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [activeDoc, setActiveDoc] = useState<string | null>(documents[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const doc = documents.find((d) => d.id === activeDoc);
  const discByField = useMemo(() => {
    const m = new Map<string, ReviewDiscrepancy[]>();
    for (const d of discrepancies) {
      const list = m.get(d.fieldKey) ?? [];
      list.push(d);
      m.set(d.fieldKey, list);
    }
    return m;
  }, [discrepancies]);

  const show = (v: SourceVal, kind: string) => {
    if (v.num) return kind === "MONEY" ? egp(v.num, { decimals: 0 }) : Number(v.num).toString();
    if (v.date) return formatDate(v.date, locale);
    if (v.text) return v.text;
    return null;
  };

  const openCitation = (row: ReviewRow) => {
    if (!row.extracted.documentId || !row.extracted.page) return;
    setActiveDoc(row.extracted.documentId);
    setHighlight({
      page: row.extracted.page,
      bbox: row.extracted.bbox ?? { x: 0.1, y: 0.1, w: 0.3, h: 0.03 },
      label: tl(row.key as "TOTAL_PRICE"),
    });
  };

  const confidenceTone = (c: number | null | undefined) =>
    c === null || c === undefined ? "neutral" : c >= 0.85 ? "verified" : c >= 0.65 ? "info" : "pending";
  const confidenceLabel = (c: number | null | undefined) =>
    c === null || c === undefined
      ? "—"
      : c >= 0.85
        ? t("confidenceHigh")
        : c >= 0.65
          ? t("confidenceMedium")
          : t("confidenceLow");

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_520px]">
      <div className="min-w-0">
        {error ? (
          <div className="mb-5">
            <Callout tone="flagged">{error}</Callout>
          </div>
        ) : null}

        {extractionMeta ? (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-paper-sunken/60 px-4 py-3">
            <Badge tone={extractionMeta.mode === "LIVE" ? "verified" : "info"}>
              {extractionMeta.mode === "LIVE" ? "live extraction" : "mock extraction"}
            </Badge>
            <span className="money text-2xs text-ink-50">
              {extractionMeta.fieldCount} fields · {(extractionMeta.latencyMs / 1000).toFixed(1)}s ·{" "}
              {extractionMeta.model}
            </span>
            <span className="ms-auto text-2xs text-ink-30">
              {formatDate(extractionMeta.createdAt, locale)}
            </span>
          </div>
        ) : null}

        {discrepancies.length > 0 ? (
          <div className="mb-6">
            <Callout tone="pending" title={t("openDiscrepancy")}>
              <ul className="mt-1 flex flex-col gap-2">
                {discrepancies.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <SeverityBadge severity={d.severity} />
                    <span>{isAr ? (d.titleAr ?? d.titleEn) : d.titleEn}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs">
                {isAr
                  ? "لا يعني هذا أن أحدًا مخطئ. صحّح ما تعرف أنه غير دقيق واترك الباقي للمحلل."
                  : "This does not mean anyone is wrong. Correct what you know is inaccurate; an analyst resolves the rest against your documents."}
              </p>
            </Callout>
          </div>
        ) : null}

        {/* ---- Field-by-field ---- */}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const d = discByField.get(row.key) ?? [];
            const isEditing = editing === row.key;
            const declared = show(row.declared, row.kind);
            const extracted = show(row.extracted, row.kind);
            const receipts = show(row.receiptDerived, row.kind);
            const developer = show(row.developerStated, row.kind);

            return (
              <li key={row.key}>
                <Card className={cn(d.length > 0 && "border-pending/40")}>
                  <CardBody className="p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{tl(row.key as "TOTAL_PRICE")}</h3>
                      <div className="flex items-center gap-2">
                        {row.extracted.confidence !== null && row.extracted.confidence !== undefined ? (
                          <Badge tone={confidenceTone(row.extracted.confidence)}>
                            {confidenceLabel(row.extracted.confidence)} ·{" "}
                            {Math.round((row.extracted.confidence ?? 0) * 100)}%
                          </Badge>
                        ) : null}
                        {row.extracted.documentId && row.extracted.page ? (
                          <button
                            type="button"
                            onClick={() => openCitation(row)}
                            className="font-mono text-2xs text-info underline underline-offset-2"
                          >
                            page {row.extracted.page} →
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <SourceCell label={t("declaredLabel")} value={declared} source="SELLER_DECLARED" />
                      <SourceCell label={t("extractedLabel")} value={extracted} source="AI_EXTRACTED" />
                      <SourceCell label={t("receiptsLabel")} value={receipts} source="RECEIPT_VERIFIED" note={row.receiptDerived.note} />
                      <SourceCell label="Developer statement" value={developer} source="DEVELOPER_CONFIRMED" />
                    </div>

                    {isEditing ? (
                      <div className="mt-4 flex flex-wrap items-end gap-2">
                        {row.kind === "MONEY" ? (
                          <div className="min-w-52 flex-1">
                            <MoneyInput
                              locale={locale}
                              value={draft}
                              onChange={(e) => setDraft(e.currentTarget.value)}
                              autoFocus
                            />
                          </div>
                        ) : row.kind === "DATE" ? (
                          <Input
                            type="date"
                            dir="ltr"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="w-52"
                            autoFocus
                          />
                        ) : (
                          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1" autoFocus />
                        )}
                        <Button
                          size="sm"
                          loading={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              const res = await correctField({
                                listingId,
                                key: row.key as never,
                                ...(row.kind === "MONEY" ? { num: draft } : {}),
                                ...(row.kind === "DATE" ? { date: draft } : {}),
                                ...(row.kind !== "MONEY" && row.kind !== "DATE" ? { text: draft } : {}),
                              });
                              if (!res.ok) setError(res.error);
                              else {
                                setEditing(null);
                                router.refresh();
                              }
                            })
                          }
                        >
                          Save correction
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(row.key);
                          setDraft(
                            row.kind === "DATE"
                              ? (row.declared.date ?? "").slice(0, 10)
                              : (row.declared.num ?? row.declared.text ?? ""),
                          );
                        }}
                        className="mt-3 text-xs text-ink-50 underline underline-offset-2 hover:text-ink"
                      >
                        {t("correctField")}
                      </button>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 rounded-md border border-rule bg-paper-sunken/60 p-4">
          <p className="text-sm text-ink-70">
            {isAr
              ? `تم رفع ${receiptCount} إيصالًا بإجمالي ${egp(receiptTotal, { decimals: 0 })}. يتحقق المحلل من كل إيصال على حدة قبل احتسابه.`
              : `${receiptCount} receipts uploaded, totalling ${egp(receiptTotal, { decimals: 0 })} as read. An analyst verifies each one individually before it counts.`}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await confirmExtractionReview(listingId);
                if (!res.ok) setError(res.error);
                else router.push(`/seller/listings/${listingId}` as never);
              })
            }
          >
            {isAr ? "أؤكد هذا الملخّص" : "Confirm this summary"}
          </Button>
          <p className="text-xs text-ink-50">
            {status === "PENDING_REVIEW"
              ? isAr
                ? "ملفك بالفعل لدى محلل."
                : "Your file is already with an analyst."
              : isAr
                ? "بعد التأكيد يذهب ملفك إلى محلل بشري."
                : "Confirming sends your file to a human analyst."}
          </p>
        </div>
      </div>

      {/* ---- Document panel ---- */}
      <aside className="xl:sticky xl:top-20 xl:self-start">
        <Eyebrow>{isAr ? "المستند المصدر" : "Source document"}</Eyebrow>
        <div className="mb-3 mt-2 flex flex-wrap gap-1.5">
          {documents.slice(0, 8).map((d) => (
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
            </button>
          ))}
        </div>

        {doc && doc.pages.length > 0 ? (
          <DocumentViewer
            pages={doc.pages.map((p) => ({
              pageNumber: p.page,
              url: p.url,
              width: p.width,
              height: p.height,
            }))}
            highlight={highlight}
            compact
          />
        ) : (
          <div className="rounded-lg border border-dashed border-rule-strong p-8 text-center text-sm text-ink-50">
            {isAr ? "لا توجد صفحات معروضة لهذا المستند." : "No rendered pages for this document."}
          </div>
        )}
      </aside>
    </div>
  );
}

function SourceCell({
  label,
  value,
  source,
  note,
}: {
  label: string;
  value: string | null;
  source: "SELLER_DECLARED" | "AI_EXTRACTED" | "RECEIPT_VERIFIED" | "DEVELOPER_CONFIRMED";
  note?: string | null;
}) {
  return (
    <div className="rounded-sm border border-rule bg-paper-sunken/40 p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <ProvenanceChip source={source} size="xs" />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-ink-30">{label}</p>
      <p className={cn("money mt-0.5 text-sm", value ? "text-ink" : "text-ink-30")}>{value ?? "—"}</p>
      {note ? <p className="mt-1 text-[10px] leading-snug text-ink-30">{note}</p> : null}
    </div>
  );
}
