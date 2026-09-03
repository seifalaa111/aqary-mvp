"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The verification pipeline as a sequence: five stages joined by a rule that
 * fills as it enters view. The human sign-off stage is marked differently from
 * the machine stages, because that distinction is the whole product.
 */
export function VerificationPipeline({ steps }: { steps: { title: string; sub: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(steps.length - 1);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        steps.forEach((_, i) => setTimeout(() => setActive(i), i * 220));
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [steps]);

  return (
    <ol ref={ref} className="mt-14 grid gap-8 md:grid-cols-5 md:gap-4">
      {steps.map((s, i) => {
        const on = i <= active;
        const isHuman = i === 3;
        return (
          <li key={s.title} className="relative flex flex-col">
            {/* connector */}
            {i < steps.length - 1 ? (
              <span
                className="absolute inset-inline-start-[13px] top-7 hidden h-px w-full bg-ink-rule md:block"
                aria-hidden
              >
                <span
                  className="block h-px bg-brass transition-[width] duration-500 ease-out"
                  style={{ width: on ? "100%" : "0%" }}
                />
              </span>
            ) : null}

            <span
              className={[
                "relative z-10 flex size-7 items-center justify-center rounded-full border transition-colors duration-300",
                on
                  ? isHuman
                    ? "border-brass bg-brass text-ink"
                    : "border-brass bg-ink-surface-raised text-brass"
                  : "border-ink-rule bg-ink-surface text-ink-text-50",
              ].join(" ")}
            >
              {isHuman ? <PersonMark /> : <span className="font-mono text-2xs">{i + 1}</span>}
            </span>

            <h3 className="mt-5 font-sans text-sm font-semibold text-ink-text">{s.title}</h3>
            <p className="mt-1.5 pe-3 text-xs leading-relaxed text-ink-text-50">{s.sub}</p>
            {isHuman ? (
              <span className="mt-3 inline-flex w-fit rounded-xs border border-brass/40 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-brass">
                Human gate
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function PersonMark() {
  return (
    <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden>
      <circle cx="7" cy="4.6" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.4 12c0-2.5 2.1-4 4.6-4s4.6 1.5 4.6 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
