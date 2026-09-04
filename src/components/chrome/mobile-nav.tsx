"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@/i18n/routing";
import { Wordmark } from "./wordmark";

/**
 * Mobile navigation. Grouped the same way as the desktop bar (buy / sell /
 * learn) rather than one flat list of oversized serif links, and the two
 * commercial actions are pinned to the bottom where a thumb reaches them.
 */
export function MobileNav({
  groups,
  signedIn,
  dashboardHref,
  labels,
}: {
  groups: { label: string; links: { href: string; label: string }[] }[];
  signedIn: boolean;
  dashboardHref: string;
  labels: {
    open: string;
    close: string;
    signIn: string;
    dashboard: string;
    sellCta: string;
    browseCta: string;
    account: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="inline-flex size-9 items-center justify-center rounded-sm border border-rule-strong text-ink-70 md:hidden"
        aria-label={labels.open}
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 animate-fade" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper animate-fade">
          <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
            <Wordmark className="text-lg" />
            <Dialog.Close
              className="inline-flex size-9 items-center justify-center rounded-sm border border-rule-strong text-ink-70"
              aria-label={labels.close}
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">{labels.open}</Dialog.Title>

          <nav className="flex flex-col px-5 pt-6">
            {groups.map((g) => (
              <div key={g.label} className="mb-5">
                <p className="eyebrow mb-1">{g.label}</p>
                {g.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={close}
                    className="block border-b border-rule py-3 text-base font-medium text-ink"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}

            <div>
              <p className="eyebrow mb-1">{labels.account}</p>
              <Link
                href={dashboardHref}
                onClick={close}
                className="block border-b border-rule py-3 text-base font-medium text-ink"
              >
                {signedIn ? labels.dashboard : labels.signIn}
              </Link>
            </div>
          </nav>

          <div className="sticky bottom-0 mt-auto flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pb-6 pt-4">
            <Link
              href="/signup?role=seller"
              onClick={close}
              className="flex h-12 items-center justify-center rounded-md bg-brass text-base font-semibold text-ink"
            >
              {labels.sellCta} <span aria-hidden className="arrow-forward ms-1.5">→</span>
            </Link>
            <Link
              href="/opportunities"
              onClick={close}
              className="flex h-12 items-center justify-center rounded-md border border-rule-strong bg-paper-raised text-base font-medium text-ink"
            >
              {labels.browseCta}
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
