"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";

export interface GalleryMedia {
  id: string;
  kind: string;
  roomTag: string | null;
  altEn: string;
  altAr: string | null;
  caption: string | null;
  variants: { thumb?: string; card?: string; detail?: string };
  blurhash: string | null;
  dominantColor: string | null;
  moderationStatus: string;
}

type Tab = "gallery" | "floorPlan" | "masterPlan";

export function Gallery({
  media,
  labels,
}: {
  media: GalleryMedia[];
  labels: {
    gallery: string;
    floorPlan: string;
    masterPlan: string;
    actualPhotos: string;
    showUnit: string;
    renders: string;
    close: string;
    previous: string;
    next: string;
  };
}) {
  const locale = useLocale();
  const t = useTranslations("opportunity");
  const tr = useTranslations("roomTag");

  /** The "not this unit as delivered" disclosure, in the reader's language. */
  const caption = (m: GalleryMedia) => {
    if (!m.caption) return null;
    if (m.kind === "SHOW_UNIT") return t("captionShowUnitNotDelivered");
    if (m.kind === "PHOTO" || m.kind === "RENDER") return t("captionNotDelivered");
    return m.caption;
  };
  const isAr = locale === "ar";
  const [tab, setTab] = useState<Tab>("gallery");
  const [room, setRoom] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  const approved = media.filter((m) => m.moderationStatus === "APPROVED");
  const photos = approved.filter((m) => !["FLOOR_PLAN", "MASTER_PLAN"].includes(m.kind));
  const floorPlan = approved.find((m) => m.kind === "FLOOR_PLAN");
  const masterPlan = approved.find((m) => m.kind === "MASTER_PLAN");

  const roomTags = [...new Set(photos.map((p) => p.roomTag).filter(Boolean))] as string[];
  const shown = room ? photos.filter((p) => p.roomTag === room) : photos;
  const active = tab === "gallery" ? shown : tab === "floorPlan" ? (floorPlan ? [floorPlan] : []) : masterPlan ? [masterPlan] : [];

  const alt = useCallback(
    (m: GalleryMedia) => (isAr ? (m.altAr ?? m.altEn) : m.altEn),
    [isAr],
  );

  const label = (m: GalleryMedia) =>
    m.kind === "RENDER" ? labels.renders : m.kind === "SHOW_UNIT" ? labels.showUnit : labels.actualPhotos;

  // Keyboard navigation in the lightbox.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? null : (i + 1) % active.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? null : (i - 1 + active.length) % active.length));
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(3, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(1, z - 0.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, active.length]);

  const hero = active[0];

  return (
    <section aria-label={labels.gallery}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-sm border border-rule-strong p-0.5">
          {([
            ["gallery", labels.gallery, photos.length],
            ["floorPlan", labels.floorPlan, floorPlan ? 1 : 0],
            ["masterPlan", labels.masterPlan, masterPlan ? 1 : 0],
          ] as const).map(([key, text, count]) =>
            count > 0 ? (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setRoom(null);
                }}
                aria-pressed={tab === key}
                className={cn(
                  "rounded-xs px-3 py-1.5 text-xs transition-colors",
                  tab === key ? "bg-ink text-ink-text" : "text-ink-50 hover:text-ink",
                )}
              >
                {text}
                {key === "gallery" ? <span className="ms-1.5 opacity-60">{count}</span> : null}
              </button>
            ) : null,
          )}
        </div>

        {tab === "gallery" && roomTags.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setRoom(null)}
              className={cn(
                "rounded-xs border px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
                room === null ? "border-ink text-ink" : "border-rule-strong text-ink-50 hover:text-ink",
              )}
            >
              {t("galleryAll")}
            </button>
            {roomTags.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoom(r)}
                className={cn(
                  "rounded-xs border px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
                  room === r ? "border-ink text-ink" : "border-rule-strong text-ink-50 hover:text-ink",
                )}
              >
                {tr.has(r) ? tr(r) : r.toLowerCase()}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {hero ? (
        <div className="grid gap-3 md:grid-cols-[1fr_150px] md:items-start">
          <button
            type="button"
            onClick={() => {
              setLightbox(0);
              setZoom(1);
            }}
            className="group relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-paper-sunken"
            style={{ backgroundColor: hero.dominantColor ?? undefined }}
            aria-label={`${alt(hero)} — open full size`}
          >
            <Image
              src={hero.variants.detail ?? hero.variants.card ?? ""}
              alt={alt(hero)}
              fill
              sizes="(max-width: 768px) 100vw, 70vw"
              priority
              placeholder={hero.blurhash ? "blur" : undefined}
              blurDataURL={hero.blurhash ?? undefined}
              className={cn(
                "transition-transform duration-500 group-hover:scale-[1.02]",
                tab === "gallery" ? "object-cover" : "bg-paper object-contain",
              )}
            />
            <div className="absolute start-3 top-3 flex gap-1.5">
              <Badge tone="ink" className="backdrop-blur-sm">
                {tab === "gallery" ? label(hero) : tab === "floorPlan" ? labels.floorPlan : labels.masterPlan}
              </Badge>
            </div>
            {/* Captions are seeded English. The disclosure they carry — that the
                image is not this unit as delivered — matters too much to leave
                untranslated, so it is rendered from the media kind instead of
                the stored string. */}
            {caption(hero) ? (
              <p className="absolute inset-x-0 bottom-0 bg-ink/85 px-3 py-2 text-start text-2xs text-ink-text backdrop-blur-sm">
                {caption(hero)}
              </p>
            ) : null}
          </button>

          {active.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto md:grid md:max-h-[min(60vh,520px)] md:grid-cols-2 md:overflow-y-auto scrollbar-thin">
              {active.slice(1, 9).map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setLightbox(i + 1);
                    setZoom(1);
                  }}
                  className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-sm bg-paper-sunken md:w-auto"
                  aria-label={alt(m)}
                >
                  <Image
                    src={m.variants.thumb ?? m.variants.card ?? ""}
                    alt={alt(m)}
                    fill
                    sizes="150px"
                    className="object-cover transition-opacity hover:opacity-85"
                  />
                </button>
              ))}
              {active.length > 9 ? (
                <button
                  type="button"
                  onClick={() => setLightbox(9)}
                  className="money flex aspect-square w-28 shrink-0 items-center justify-center rounded-sm border border-rule-strong text-sm text-ink-70 md:w-auto"
                >
                  +{active.length - 9}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---- Lightbox ---- */}
      <Dialog.Root open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/92 animate-fade" />
          <Dialog.Content className="fixed inset-0 z-50 flex flex-col p-4">
            <Dialog.Title className="sr-only">{labels.gallery}</Dialog.Title>
            <div className="flex items-center justify-between text-ink-text">
              <p className="money font-mono text-xs">
                {lightbox !== null ? lightbox + 1 : 0} / {active.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                  className="size-8 rounded-sm border border-ink-rule text-ink-text"
                  aria-label={t("zoomOut")}
                >
                  −
                </button>
                <span className="money w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  className="size-8 rounded-sm border border-ink-rule text-ink-text"
                  aria-label={t("zoomIn")}
                >
                  +
                </button>
                <Dialog.Close
                  className="ms-2 size-8 rounded-sm border border-ink-rule text-ink-text"
                  aria-label={labels.close}
                >
                  ✕
                </Dialog.Close>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto">
              {lightbox !== null && active[lightbox] ? (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transform: `scale(${zoom})`, transition: "transform 150ms ease-out" }}
                >
                  <Image
                    src={active[lightbox]!.variants.detail ?? active[lightbox]!.variants.card ?? ""}
                    alt={alt(active[lightbox]!)}
                    width={1600}
                    height={1067}
                    className="max-h-full w-auto object-contain"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-4 pt-3">
              <button
                type="button"
                onClick={() => setLightbox((i) => (i === null ? null : (i - 1 + active.length) % active.length))}
                className="h-10 rounded-sm border border-ink-rule px-4 text-sm text-ink-text"
              >
                ← {labels.previous}
              </button>
              <p className="flex-1 text-center text-xs text-ink-text-70">
                {lightbox !== null && active[lightbox] ? alt(active[lightbox]!) : ""}
              </p>
              <button
                type="button"
                onClick={() => setLightbox((i) => (i === null ? null : (i + 1) % active.length))}
                className="h-10 rounded-sm border border-ink-rule px-4 text-sm text-ink-text"
              >
                {labels.next} <span className="arrow-forward inline-block">→</span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
