"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { useTranslations } from "next-intl";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/**
 * `feePct` is threaded in rather than read here so the buyer success fee shown
 * in the answers is the one `config.PLATFORM_FEE_BPS` actually charges — there
 * is no percentage literal anywhere in the FAQ copy.
 */
export function FaqAccordion({ feePct }: { feePct: number }) {
  const t = useTranslations("faq");

  return (
    <Accordion.Root type="single" collapsible className="border-t border-rule">
      {KEYS.map((k) => (
        <Accordion.Item key={k} value={k} className="border-b border-rule">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-start justify-between gap-6 py-4 text-start">
              <span className="text-base font-medium leading-snug text-ink">
                {t(`q${k}` as "q1", { pct: feePct })}
              </span>
              <span className="mt-1 shrink-0 text-ink-50 transition-transform duration-200 group-data-[state=open]:rotate-45">
                <svg viewBox="0 0 14 14" className="size-4" aria-hidden>
                  <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=open]:animate-fade">
            <p className="max-w-2xl pb-5 text-sm leading-relaxed text-ink-70">
              {t(`a${k}` as "a1", { pct: feePct })}
            </p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
