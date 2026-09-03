"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui/primitives";

export interface ViewerPage {
  pageNumber: number;
  width: number;
  height: number;
  url: string;
}

export interface Highlight {
  page: number;
  bbox: { x: number; y: number; w: number; h: number };
  label?: string;
}

/**
 * The document viewer used by both the buyer vault and the analyst workspace:
 * page navigation, zoom, rotate, and a highlight overlay driven by the
 * extraction engine's own bounding boxes so a citation lands on the real region.
 */
export function DocumentViewer({
  pages,
  initialPage = 1,
  watermark,
  highlight,
  onPageChange,
  compact = false,
}: {
  pages: ViewerPage[];
  initialPage?: number;
  watermark?: string;
  highlight?: Highlight | null;
  onPageChange?: (page: number) => void;
  compact?: boolean;
}) {
  const [page, setPage] = useState(() => clamp(initialPage, 1, pages.length || 1));
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A citation click moves the viewer to the cited page.
  useEffect(() => {
    if (highlight) setPage(clamp(highlight.page, 1, pages.length || 1));
  }, [highlight, pages.length]);

  useEffect(() => {
    onPageChange?.(page);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page, onPageChange]);

  const current = pages.find((p) => p.pageNumber === page) ?? pages[0];
  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-rule-strong p-10 text-center text-sm text-ink-50">
        This document has no rendered pages.
      </div>
    );
  }

  const go = (next: number) => setPage(clamp(next, 1, pages.length));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-rule bg-paper-raised px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ←
          </Button>
          <span className="money px-1 text-xs text-ink-70">
            {page} / {pages.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go(page + 1)}
            disabled={page >= pages.length}
            aria-label="Next page"
          >
            →
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
            −
          </Button>
          <span className="money w-12 text-center text-xs text-ink-70">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">
            +
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)} aria-label="Fit width">
            fit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Rotate"
          >
            ↻
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "relative overflow-auto rounded-lg border border-rule bg-paper-sunken p-4 scrollbar-thin",
          compact ? "max-h-[70vh]" : "max-h-[80vh]",
        )}
      >
        <div
          className="relative mx-auto"
          style={{
            width: `${Math.min(100, 100 * zoom)}%`,
            maxWidth: rotation % 180 === 0 ? "100%" : "80%",
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={`Page ${current.pageNumber}`}
            width={current.width}
            height={current.height}
            className="block w-full rounded-sm bg-white shadow-e2"
          />

          {highlight && highlight.page === page ? (
            <span
              className="pointer-events-none absolute rounded-xs border-2 border-brass bg-brass/20 transition-all duration-200"
              style={{
                insetInlineStart: `${highlight.bbox.x * 100}%`,
                top: `${highlight.bbox.y * 100}%`,
                width: `${highlight.bbox.w * 100}%`,
                height: `${highlight.bbox.h * 100}%`,
              }}
            >
              {highlight.label ? (
                <span className="absolute -top-6 inset-inline-start-0 whitespace-nowrap rounded-xs bg-brass px-1.5 py-0.5 font-mono text-2xs text-ink">
                  {highlight.label}
                </span>
              ) : null}
            </span>
          ) : null}

          {watermark ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-ink/10"
                  style={{
                    top: `${8 + i * 16}%`,
                    insetInlineStart: `${i % 2 === 0 ? 4 : 22}%`,
                    transform: "rotate(-24deg)",
                  }}
                >
                  {watermark} · {watermark}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {pages.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {pages.map((p) => (
            <button
              key={p.pageNumber}
              type="button"
              onClick={() => go(p.pageNumber)}
              aria-current={p.pageNumber === page ? "page" : undefined}
              className={cn(
                "money size-8 shrink-0 rounded-sm border text-2xs transition-colors",
                p.pageNumber === page
                  ? "border-ink bg-ink text-ink-text"
                  : "border-rule-strong text-ink-50 hover:border-ink-50",
              )}
            >
              {p.pageNumber}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
