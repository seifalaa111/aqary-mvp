"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Callout, Textarea, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { egp, formatDate } from "@/lib/format";

export interface Readiness {
  ready: boolean;
  approvedImageCount: number;
  blockers: { code: string; messageEn: string; messageAr: string; detail?: string }[];
}

/** The itemised requests a seller can actually act on. Never "more info needed". */
const INFO_ITEMS = [
  {
    code: "DEVELOPER_ACCOUNT_STATEMENT",
    labelEn: "A developer account statement issued within the last 30 days",
    labelAr: "كشف حساب من المطوّر صادر خلال آخر 30 يومًا",
  },
  {
    code: "MISSING_RECEIPTS",
    labelEn: "Receipts for the instalments we could not match",
    labelAr: "إيصالات الأقساط التي لم نتمكن من مطابقتها",
  },
  {
    code: "CONTRACT_PAGES",
    labelEn: "The missing pages of the sale contract",
    labelAr: "الصفحات الناقصة من عقد البيع",
  },
  {
    code: "CLEARER_SCAN",
    labelEn: "A clearer photograph or scan — the current one cannot be read",
    labelAr: "صورة أوضح — النسخة الحالية غير مقروءة",
  },
  {
    code: "ID_MATCH",
    labelEn: "A national ID matching the name on the contract, or the power of attorney",
    labelAr: "بطاقة رقم قومي مطابقة لاسم العقد، أو التوكيل",
  },
  {
    code: "MORE_PHOTOS",
    labelEn: "More photographs of the unit — at least five are needed to publish",
    labelAr: "مزيد من صور الوحدة — يلزم خمس صور على الأقل للنشر",
  },
  {
    code: "FLOOR_PLAN",
    labelEn: "The unit floor plan",
    labelAr: "مخطط الوحدة",
  },
];

export function DecisionPanel({
  listingId,
  status,
  readiness,
  extractionMeta,
  policy,
  askingCash,
  locale,
  onPublish,
  onRequestInfo,
  onReject,
  pending,
}: {
  listingId: string;
  status: string;
  readiness: Readiness;
  extractionMeta: { mode: string; model: string; latencyMs: number; costUsd: string; fieldCount: number; createdAt: string } | null;
  policy: {
    assignmentAllowed: string;
    feeType: string;
    feePercentBps: number | null;
    minPercentPaidBps: number | null;
    minMonthsElapsed: number | null;
    typicalNocDays: number | null;
    requiredDocuments: string[];
  } | null;
  askingCash: string | null;
  locale: string;
  onPublish: (note?: string) => void;
  onRequestInfo: (items: { code: string; labelEn: string; labelAr: string; detail?: string }[], note?: string) => void;
  onReject: (reason: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("analyst");
  const tk = useTranslations("consoleUi");
  const isAr = locale === "ar";
  const [mode, setMode] = useState<"none" | "info" | "reject">("none");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const published = ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"].includes(status);

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Publish gate ---- */}
      <div
        className={cn(
          "rounded-lg border p-4",
          readiness.ready ? "border-verified/35 bg-verified-soft" : "border-pending/40 bg-pending-soft",
        )}
      >
        <p className={cn("mb-1 text-sm font-semibold", readiness.ready ? "text-verified" : "text-pending")}>
          {readiness.ready ? t("publishReady") : t("publishBlocked")}
        </p>
        <p className="mb-3 text-xs leading-relaxed text-ink-70">{t("publishBlockedSub")}</p>

        {readiness.blockers.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {readiness.blockers.map((b, i) => (
              <li key={`${b.code}-${i}`} className="flex items-start gap-2 text-xs text-ink-70">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-pending" />
                <span>
                  {isAr ? b.messageAr : b.messageEn}
                  {b.detail ? <span className="ms-1 font-mono text-[10px] text-ink-30">{b.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {published ? (
        <Callout tone="verified">
          {t("listingAlreadyPublished")}
        </Callout>
      ) : null}

      {/* ---- Actions ---- */}
      {mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            loading={pending}
            disabled={!readiness.ready || published}
            onClick={() => onPublish(note || undefined)}
          >
            {t("approve")}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setMode("info")}>
            {t("requestInfo")}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setMode("reject")}>
            {t("reject")}
          </Button>
        </div>
      ) : null}

      {mode === "info" ? (
        <div className="flex flex-col gap-3 rounded-md border border-rule bg-paper-raised p-4">
          <p className="text-sm font-semibold text-ink">{t("requestInfo")}</p>
          <p className="text-xs text-ink-50">
            {t("pickSpecificItemsSellerSees")}
          </p>
          <ul className="flex flex-col gap-1.5">
            {INFO_ITEMS.map((item) => (
              <li key={item.code}>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-70">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.code)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(item.code) ? s.filter((x) => x !== item.code) : [...s, item.code],
                      )
                    }
                    className="mt-0.5 size-3.5 accent-ink"
                  />
                  {isAr ? item.labelAr : item.labelEn}
                </label>
              </li>
            ))}
          </ul>
          <Textarea
            rows={2}
            placeholder={tk("anythingElsePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              loading={pending}
              disabled={selected.length === 0}
              onClick={() => {
                onRequestInfo(
                  INFO_ITEMS.filter((i) => selected.includes(i.code)),
                  note || undefined,
                );
                setMode("none");
                setSelected([]);
                setNote("");
              }}
            >{tk("sendTheRequest")}</Button>
            <Button variant="ghost" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className="flex flex-col gap-3 rounded-md border border-flagged/30 bg-flagged-soft p-4">
          <p className="text-sm font-semibold text-flagged">{t("reject")}</p>
          <p className="text-xs text-ink-70">
            {t("reasonGoesSellerVerbatimWrite")}
          </p>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button
              variant="danger"
              loading={pending}
              disabled={reason.trim().length < 12}
              onClick={() => {
                onReject(reason);
                setMode("none");
                setReason("");
              }}
            >
              {t("reject")}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---- Context ---- */}
      {policy ? (
        <section className="rounded-md border border-rule bg-paper-sunken/50 p-4">
          <p className="eyebrow mb-2">{tk("developerAssignmentPolicy")}</p>
          <dl className="rule-t text-xs">
            <Row label="Assignment" value={policy.assignmentAllowed.replace(/_/g, " ").toLowerCase()} />
            <Row
              label="Fee"
              value={
                policy.feeType === "PERCENT"
                  ? `${((policy.feePercentBps ?? 0) / 100).toFixed(2)}%`
                  : policy.feeType.toLowerCase()
              }
            />
            <Row label="Min % paid" value={policy.minPercentPaidBps ? `${policy.minPercentPaidBps / 100}%` : "—"} />
            <Row label="Min months" value={policy.minMonthsElapsed ? String(policy.minMonthsElapsed) : "—"} />
            <Row label="NOC turnaround" value={policy.typicalNocDays ? `${policy.typicalNocDays} days` : "—"} />
          </dl>
          <p className="eyebrow mb-1 mt-3">{tk("documentsDeveloperRequires")}</p>
          <ul className="flex flex-col gap-1">
            {policy.requiredDocuments.map((d) => (
              <li key={d} className="text-2xs text-ink-50">
                • {d}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {extractionMeta ? (
        <section className="rounded-md border border-rule bg-paper-sunken/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <p className="eyebrow">{tk("extractionRun")}</p>
            <Badge tone={extractionMeta.mode === "LIVE" ? "verified" : "info"}>
              {extractionMeta.mode.toLowerCase()}
            </Badge>
          </div>
          <dl className="rule-t text-xs">
            <Row label="Model" value={extractionMeta.model} />
            <Row label="Fields returned" value={String(extractionMeta.fieldCount)} />
            <Row label="Latency" value={`${(extractionMeta.latencyMs / 1000).toFixed(1)}s`} />
            <Row label="Cost" value={`$${Number(extractionMeta.costUsd).toFixed(4)}`} />
            <Row label="Run at" value={formatDate(extractionMeta.createdAt, locale)} />
          </dl>
        </section>
      ) : null}

      {askingCash ? (
        <p className="text-2xs text-ink-30">
          Asking cash on file: {egp(askingCash, { decimals: 0 })}. It is capped at the verified amount paid
          the moment that field is promoted.
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-ink-50">{label}</dt>
      <dd className="money text-ink">{value}</dd>
    </div>
  );
}
