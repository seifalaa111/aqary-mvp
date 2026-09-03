"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button, Callout, Select, Spinner, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { deleteUpload, setCoverImage } from "@/app/actions/seller";
import { UploadZone, type UploadedDocument } from "./upload-zone";

export interface UploadedMedia {
  id: string;
  kind: string;
  roomTag: string | null;
  altEn: string;
  isCover: boolean;
  moderationStatus: string;
  thumb: string;
}

/** The guided capture checklist. Sellers upload the wrong shots without it. */
const SHOT_LIST: { tag: string; en: string; ar: string }[] = [
  { tag: "EXTERIOR", en: "Building facade or villa exterior", ar: "واجهة المبنى أو الفيلا" },
  { tag: "ENTRANCE", en: "Entrance / hallway", ar: "المدخل" },
  { tag: "LIVING", en: "Living area / reception", ar: "غرفة المعيشة / الريسبشن" },
  { tag: "BEDROOM", en: "Each bedroom", ar: "كل غرفة نوم" },
  { tag: "KITCHEN", en: "Kitchen", ar: "المطبخ" },
  { tag: "BATHROOM", en: "Bathrooms", ar: "الحمامات" },
  { tag: "BALCONY", en: "Balcony, terrace or garden", ar: "البلكونة أو التراس أو الحديقة" },
  { tag: "COMPOUND", en: "The compound or project surroundings", ar: "الكمبوند أو محيط المشروع" },
];

const DOC_SLOTS: { type: string; en: string; hint: string; required?: boolean; highlight?: boolean }[] = [
  { type: "SALE_CONTRACT", en: "Sale contract — all pages", hint: "Every page, including annexes", required: true },
  { type: "PAYMENT_RECEIPT", en: "Payment receipts", hint: "All of them, not just the recent ones", required: true },
  {
    type: "DEVELOPER_ACCOUNT_STATEMENT",
    en: "Developer account statement (كشف حساب)",
    hint: "The single highest-value document: it confirms your paid total and balance in one page, and is the fastest route to a high verification score",
    highlight: true,
  },
  { type: "CONTRACT_ANNEX", en: "Contract annexes", hint: "Payment schedule annex and any addendum" },
  { type: "RESERVATION_FORM", en: "Reservation or booking form", hint: "" },
  { type: "BANK_TRANSFER_STATEMENT", en: "Bank transfers / cheque copies", hint: "" },
  { type: "MAINTENANCE_RECEIPT", en: "Maintenance payment receipts", hint: "" },
  { type: "DELIVERY_CERTIFICATE", en: "Delivery / handover certificate", hint: "If the unit has been handed over" },
  { type: "DEVELOPER_NOC", en: "Developer NOC", hint: "If one has already been issued" },
];

export function StepUploads({
  listingId,
  documents,
  media,
  onDocuments,
  onMedia,
  minImages,
  locale,
}: {
  listingId: string;
  documents: UploadedDocument[];
  media: UploadedMedia[];
  onDocuments: (d: UploadedDocument[]) => void;
  onMedia: (m: UploadedMedia[]) => void;
  minImages: number;
  locale: string;
}) {
  const t = useTranslations("seller");
  const tc = useTranslations("common");
  const isAr = locale === "ar";
  const [tab, setTab] = useState<"documents" | "media">("documents");

  const photos = media.filter((m) => !["FLOOR_PLAN", "MASTER_PLAN"].includes(m.kind));
  const hasFloorPlan = media.some((m) => m.kind === "FLOOR_PLAN");
  const hasMasterPlan = media.some((m) => m.kind === "MASTER_PLAN");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl text-ink">{t("step4")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-50">
          {isAr
            ? "المستندات تُوثّق الأرقام، والصور تبيع الوحدة. كلاهما مطلوب."
            : "Documents verify the numbers; photographs sell the unit. You need both."}
        </p>
      </div>

      <div className="inline-flex w-fit rounded-sm border border-rule-strong p-0.5">
        {(["documents", "media"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={cn(
              "rounded-xs px-4 py-1.5 text-xs transition-colors",
              tab === k ? "bg-ink text-ink-text" : "text-ink-50 hover:text-ink",
            )}
          >
            {k === "documents" ? `Documents (${documents.length})` : `Photos & plans (${media.length})`}
          </button>
        ))}
      </div>

      {tab === "documents" ? (
        <div className="flex flex-col gap-5">
          {DOC_SLOTS.map((slot) => (
            <div
              key={slot.type}
              className={cn(
                slot.highlight && "rounded-md border border-brass/35 bg-brass-soft p-4",
              )}
            >
              <UploadZone
                listingId={listingId}
                type={slot.type}
                label={`${slot.en}${slot.required ? " *" : ""}`}
                hint={slot.hint}
                documents={documents}
                onDocuments={onDocuments}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {photos.length < minImages ? (
            <Callout tone="pending">
              {isAr
                ? `${photos.length} من ${minImages} صور. لا يمكن نشر الإعلان بأقل من ${minImages} صورة معتمدة.`
                : `${photos.length} of ${minImages} images. A listing cannot be published with fewer than ${minImages} approved images.`}
            </Callout>
          ) : (
            <Callout tone="verified">
              {isAr ? "عدد الصور كافٍ للنشر." : `${photos.length} images — enough to publish, once an analyst approves them.`}
            </Callout>
          )}

          <MediaUploader
            listingId={listingId}
            media={media}
            onMedia={onMedia}
            locale={locale}
          />

          <div>
            <p className="eyebrow mb-3">
              {isAr ? "قائمة اللقطات المطلوبة" : "Guided shot list"}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SHOT_LIST.map((s) => {
                const done = media.some((m) => m.roomTag === s.tag);
                return (
                  <li
                    key={s.tag}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-sm border px-3 py-2 text-xs",
                      done ? "border-verified/35 bg-verified-soft text-verified" : "border-rule text-ink-50",
                    )}
                  >
                    <span>{isAr ? s.ar : s.en}</span>
                    <span>{done ? "✓" : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={cn(
                "rounded-md border px-3 py-2.5 text-xs",
                hasFloorPlan ? "border-verified/35 bg-verified-soft text-verified" : "border-pending/35 bg-pending-soft text-pending",
              )}
            >
              {isAr ? "مخطط الوحدة" : "Unit floor plan"} — {hasFloorPlan ? (isAr ? "متوفر" : "uploaded") : (isAr ? "مطلوب" : "required before publishing")}
            </div>
            <div
              className={cn(
                "rounded-md border px-3 py-2.5 text-xs",
                hasMasterPlan ? "border-verified/35 bg-verified-soft text-verified" : "border-pending/35 bg-pending-soft text-pending",
              )}
            >
              {isAr ? "المخطط العام" : "Project master plan"} — {hasMasterPlan ? (isAr ? "متوفر" : "uploaded") : (isAr ? "مطلوب" : "required before publishing")}
            </div>
          </div>

          {media.length > 0 ? (
            <MediaGrid listingId={listingId} media={media} onMedia={onMedia} removeLabel={tc("remove")} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function MediaUploader({
  listingId,
  media,
  onMedia,
  locale,
}: {
  listingId: string;
  media: UploadedMedia[];
  onMedia: (m: UploadedMedia[]) => void;
  locale: string;
}) {
  const tc = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("PHOTO");
  const [roomTag, setRoomTag] = useState("LIVING");
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isAr = locale === "ar";

  const upload = async (files: FileList) => {
    setError(null);
    for (const file of Array.from(files)) {
      setBusy((b) => b + 1);
      const form = new FormData();
      form.set("listingId", listingId);
      form.set("target", "media");
      form.set("kind", kind);
      if (!["FLOOR_PLAN", "MASTER_PLAN"].includes(kind)) form.set("roomTag", roomTag);
      else form.set("roomTag", "PLAN");
      form.set("alt", file.name.replace(/\.[^.]+$/, ""));
      form.set("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Upload failed");
        onMedia([
          ...media,
          {
            id: json.media.id,
            kind: json.media.kind,
            roomTag: json.media.roomTag,
            altEn: json.media.altEn,
            isCover: media.length === 0,
            moderationStatus: json.media.moderationStatus,
            thumb: json.media.variants.thumb,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  return (
    <div className="rounded-md border border-rule bg-paper-sunken/50 p-4">
      {error ? (
        <div className="mb-3">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-70">{isAr ? "نوع الصورة" : "What is this image?"}</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="PHOTO">A photograph of this unit</option>
            <option value="SHOW_UNIT">The developer&apos;s show unit / a comparable finished unit</option>
            <option value="RENDER">A developer render (computer-generated)</option>
            <option value="PROGRESS">Construction progress</option>
            <option value="FLOOR_PLAN">Unit floor plan</option>
            <option value="MASTER_PLAN">Project master plan</option>
          </Select>
        </label>
        {!["FLOOR_PLAN", "MASTER_PLAN"].includes(kind) ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-70">{isAr ? "المكان" : "Room / area"}</span>
            <Select value={roomTag} onChange={(e) => setRoomTag(e.target.value)}>
              {["EXTERIOR", "ENTRANCE", "LIVING", "BEDROOM", "KITCHEN", "BATHROOM", "BALCONY", "GARDEN", "VIEW", "COMPOUND", "AMENITY"].map((r) => (
                <option key={r} value={r}>
                  {r.toLowerCase()}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      <p className="mb-3 text-2xs leading-relaxed text-ink-50">
        {isAr
          ? "نلتزم بوصف الصور كما هي: صورة فعلية للوحدة، أو وحدة عرض، أو تصوّر حاسوبي. لا نعرض تصوّرًا على أنه صورة."
          : "We label images for exactly what they are — a photograph of this unit, the developer's show unit, or a computer render. A render is never presented as a photograph."}
      </p>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy > 0}>
          {busy > 0 ? <Spinner className="size-3.5" /> : null}
          {busy > 0 ? tc("uploading") : tc("uploadBrowse")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="text-2xs text-ink-30">JPEG, PNG or WebP · up to 25 MB each</span>
      </div>
    </div>
  );
}

function MediaGrid({
  listingId,
  media,
  onMedia,
  removeLabel,
}: {
  listingId: string;
  media: UploadedMedia[];
  onMedia: (m: UploadedMedia[]) => void;
  removeLabel: string;
}) {
  const [, startTransition] = useTransition();

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {media.map((m) => (
        <li key={m.id} className="group relative overflow-hidden rounded-md border border-rule bg-paper-raised">
          <div className="relative aspect-square bg-paper-sunken">
            {m.thumb ? (
              <Image src={m.thumb} alt={m.altEn} fill sizes="200px" className="object-cover" />
            ) : null}
            {m.isCover ? (
              <span className="absolute inset-inline-start-1 top-1">
                <Badge tone="ink">cover</Badge>
              </span>
            ) : null}
          </div>
          <div className="p-2">
            <p className="truncate text-2xs text-ink-70">{m.kind.replace(/_/g, " ").toLowerCase()}</p>
            <p className="text-[10px] text-ink-30">
              {m.roomTag?.toLowerCase() ?? "—"} · {m.moderationStatus.toLowerCase()}
            </p>
            <div className="mt-1.5 flex gap-1">
              {!m.isCover && !["FLOOR_PLAN", "MASTER_PLAN"].includes(m.kind) ? (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await setCoverImage(listingId, m.id);
                      onMedia(media.map((x) => ({ ...x, isCover: x.id === m.id })));
                    })
                  }
                  className="text-[10px] text-info underline"
                >
                  set cover
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await deleteUpload({ listingId, mediaId: m.id });
                    onMedia(media.filter((x) => x.id !== m.id));
                  })
                }
                className="ms-auto text-[10px] text-ink-50 underline"
              >
                {removeLabel}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
