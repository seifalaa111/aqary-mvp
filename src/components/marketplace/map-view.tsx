"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { egp } from "@/lib/format";
import { cn } from "@/components/ui/primitives";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  city: string;
  cash: string;
  reference: string;
  image: string | null;
}

/**
 * A self-contained schematic map. Pins sit at the projects' real coordinates
 * under an equirectangular projection; clusters are computed from those
 * coordinates at the current zoom. It is deliberately not a tile map — no
 * third-party tiles are fetched — and it is labelled as schematic.
 */
export function MapView({ points }: { points: MapPoint[] }) {
  const t = useTranslations("market");
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState<string | null>(null);

  const bounds = useMemo(() => {
    if (points.length === 0) return { minLat: 29.3, maxLat: 31.5, minLng: 27.3, maxLng: 32.6 };
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const pad = 0.35;
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
  }, [points]);

  const W = 1000;
  const H = 620;

  const project = (p: { lat: number; lng: number }) => ({
    x: ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * W,
    y: H - ((p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * H,
  });

  // Real clustering: points within a pixel radius that shrinks as you zoom in.
  const clusters = useMemo(() => {
    const radius = 46 / zoom;
    const out: { x: number; y: number; items: MapPoint[] }[] = [];
    for (const p of points) {
      const xy = project(p);
      const hit = out.find((c) => Math.hypot(c.x - xy.x, c.y - xy.y) < radius);
      if (hit) {
        hit.items.push(p);
        hit.x = hit.items.reduce((a, i) => a + project(i).x, 0) / hit.items.length;
        hit.y = hit.items.reduce((a, i) => a + project(i).y, 0) / hit.items.length;
      } else {
        out.push({ x: xy.x, y: xy.y, items: [p] });
      }
    }
    return out;
  }, [points, zoom, bounds]);

  const focused = points.find((p) => p.id === focus);

  return (
    <div className="relative overflow-hidden rounded-lg border border-rule bg-paper-sunken">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[620px] w-full" role="img" aria-label={t("mapLabel")}>
        <defs>
          <pattern id="aq-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="var(--color-rule)" strokeWidth="0.6" opacity="0.55" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="var(--color-paper)" />
        <rect width={W} height={H} fill="url(#aq-grid)" />

        {/* Latitude / longitude reference lines, so the projection is readable. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <line x1={W * f} y1={0} x2={W * f} y2={H} stroke="var(--color-rule-strong)" strokeWidth="0.5" strokeDasharray="4 6" />
            <text x={W * f + 4} y={14} className="fill-[var(--color-ink-30)]" fontSize="10" fontFamily="var(--font-mono)">
              {(bounds.minLng + (bounds.maxLng - bounds.minLng) * f).toFixed(2)}°E
            </text>
          </g>
        ))}

        <g transform={`translate(${(W / 2) * (1 - zoom)} ${(H / 2) * (1 - zoom)}) scale(${zoom})`}>
          {clusters.map((c, i) => {
            const single = c.items.length === 1;
            const item = c.items[0]!;
            const active = single && focus === item.id;
            return (
              <g
                key={i}
                transform={`translate(${c.x} ${c.y})`}
                className="cursor-pointer"
                onClick={() => (single ? setFocus(active ? null : item.id) : setZoom((z) => Math.min(4, z * 1.7)))}
              >
                <circle
                  r={single ? 9 : Math.min(26, 12 + c.items.length * 2.2)}
                  className={cn(single ? "fill-[var(--color-brass)]" : "fill-[var(--color-ink)]")}
                  opacity={active ? 1 : 0.92}
                />
                {!single ? (
                  <text
                    textAnchor="middle"
                    dy="4"
                    fontSize={12}
                    fontFamily="var(--font-mono)"
                    className="fill-[var(--color-ink-text)] pointer-events-none"
                  >
                    {c.items.length}
                  </text>
                ) : (
                  <circle r="3" className="fill-[var(--color-paper)] pointer-events-none" />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Photo popover for the focused pin. */}
      {focused ? (
        <Link
          href={`/opportunities/${focused.id}`}
          className="absolute start-4 bottom-4 flex w-72 gap-3 rounded-lg border border-rule bg-paper-raised p-3 shadow-e3"
        >
          <div className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-paper-sunken">
            {focused.image ? (
              <Image src={focused.image} alt={focused.label} fill sizes="80px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{focused.label}</p>
            <p className="text-xs text-ink-50">{focused.city}</p>
            <p className="money mt-2 text-money-sm font-semibold text-ink">{egp(focused.cash, { style: "compact" })}</p>
            <p className="font-mono text-2xs text-ink-30">{focused.reference}</p>
          </div>
        </Link>
      ) : null}

      <div className="absolute end-4 top-4 flex flex-col gap-1">
        {(["+", "−"] as const).map((sign) => (
          <button
            key={sign}
            type="button"
            aria-label={sign === "+" ? "Zoom in" : "Zoom out"}
            onClick={() => setZoom((z) => (sign === "+" ? Math.min(4, z * 1.4) : Math.max(1, z / 1.4)))}
            className="size-8 rounded-sm border border-rule-strong bg-paper-raised text-sm text-ink-70 hover:text-ink"
          >
            {sign}
          </button>
        ))}
      </div>

      <p className="absolute start-4 top-4 font-mono text-2xs uppercase tracking-wider text-ink-30">
        {t("mapCaption", { count: points.length })}
      </p>
    </div>
  );
}
