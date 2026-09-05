"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Callout, Input } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export interface MediaRow {
  id: string;
  kind: string;
  roomTag: string | null;
  altEn: string;
  caption: string | null;
  moderationStatus: string;
  thumb: string;
  card: string;
}

/**
 * Media review. Approving images is what makes them count toward the five-image
 * publish precondition — a listing cannot go live on unreviewed photography.
 */
export function MediaReview({
  media,
  minImages,
  approvedCount,
  locale,
  onModerate,
  pending,
}: {
  media: MediaRow[];
  minImages: number;
  approvedCount: number;
  locale: string;
  onModerate: (id: string, status: "APPROVED" | "FLAGGED" | "REJECTED", note?: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("analyst");
  const isAr = locale === "ar";
  const [noting, setNoting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const photos = media.filter((m) => !["FLOOR_PLAN", "MASTER_PLAN"].includes(m.kind));
  const hasFloorPlan = media.some((m) => m.kind === "FLOOR_PLAN" && m.moderationStatus === "APPROVED");
  const hasMasterPlan = media.some((m) => m.kind === "MASTER_PLAN" && m.moderationStatus === "APPROVED");

  return (
    <div className="flex flex-col gap-4">
      {approvedCount >= minImages ? (
        <Callout tone="verified">
          {approvedCount} approved images — the {minImages}-image publish precondition is met.
        </Callout>
      ) : (
        <Callout tone="pending">
          {approvedCount} of {minImages} approved. Publishing is blocked until {minImages} images are approved.
        </Callout>
      )}

      <div className="flex flex-wrap gap-2 text-2xs">
        <Badge tone={hasFloorPlan ? "verified" : "pending"}>
          floor plan {hasFloorPlan ? "approved" : "missing"}
        </Badge>
        <Badge tone={hasMasterPlan ? "verified" : "pending"}>
          master plan {hasMasterPlan ? "approved" : "missing"}
        </Badge>
        <Badge tone="neutral">{photos.length} photographs</Badge>
      </div>

      <p className="text-2xs leading-relaxed text-ink-50">
        {t("checkImagesMatchStatedUnit")}
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media.map((m) => (
          <li key={m.id} className="overflow-hidden rounded-md border border-rule bg-paper-raised">
            <button
              type="button"
              onClick={() => setPreview(preview === m.id ? null : m.id)}
              className="relative block aspect-square w-full bg-paper-sunken"
            >
              {m.thumb ? (
                <Image
                  src={preview === m.id ? m.card : m.thumb}
                  alt={m.altEn}
                  fill
                  sizes="240px"
                  className="object-cover"
                />
              ) : null}
              <span className="absolute start-1 top-1">
                <Badge
                  tone={
                    m.moderationStatus === "APPROVED"
                      ? "verified"
                      : m.moderationStatus === "PENDING"
                        ? "pending"
                        : "flagged"
                  }
                >
                  {m.moderationStatus.toLowerCase()}
                </Badge>
              </span>
            </button>

            <div className="p-2">
              <p className="truncate text-2xs text-ink-70">{m.kind.replace(/_/g, " ").toLowerCase()}</p>
              <p className="truncate text-[10px] text-ink-30">{m.roomTag?.toLowerCase() ?? "—"}</p>
              {m.caption ? <p className="mt-1 text-[10px] leading-snug text-ink-50">{m.caption}</p> : null}

              {noting === m.id ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Why?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={pending}
                      onClick={() => {
                        onModerate(m.id, "REJECTED", note);
                        setNoting(null);
                        setNote("");
                      }}
                    >
                      Reject
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNoting(null)}>
                      ✕
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.moderationStatus !== "APPROVED" ? (
                    <Button size="sm" loading={pending} onClick={() => onModerate(m.id, "APPROVED")}>
                      Approve
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setNoting(m.id)}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
