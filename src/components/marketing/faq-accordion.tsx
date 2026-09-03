"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { useTranslations } from "next-intl";

const KEYS = ["1", "2", "3", "4", "5"] as const;

export function FaqAccordion() {
  const t = useTranslations("faq");

  return (
    <Accordion.Root type="single" collapsible className="rule-t">
      {KEYS.map((k) => (
        <Accordion.Item key={k} value={k} className="rule-b">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-start justify-between gap-6 py-5 text-start">
              <span className="font-display text-lg leading-snug text-ink md:text-xl">
                {t(`q${k}` as "q1")}
              </span>
              <span className="mt-1 shrink-0 text-ink-50 transition-transform duration-200 group-data-[state=open]:rotate-45">
                <svg viewBox="0 0 14 14" className="size-4" aria-hidden>
                  <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=open]:animate-fade">
            <p className="max-w-2xl pb-6 text-sm leading-relaxed text-ink-70">{t(`a${k}` as "a1")}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
