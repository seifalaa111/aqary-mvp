"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up once, when the figure scrolls into view. Respects
 * `prefers-reduced-motion` by rendering the final value immediately.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  durationMs = 900,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Start at the real figure: without JS, or before the element is scrolled to,
  // the page must still show the number rather than a zero.
  const [display, setDisplay] = useState(value);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(value);
      setDone(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done) return;
        setDone(true);
        setDisplay(0);
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / durationMs);
          // easeOutQuint
          const eased = 1 - Math.pow(1 - p, 5);
          setDisplay(value * eased);
          if (p < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs, done]);

  const formatted = display.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
