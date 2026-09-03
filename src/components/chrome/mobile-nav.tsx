"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@/i18n/routing";
import { Wordmark } from "./wordmark";

export function MobileNav({
  links,
  signedIn,
  dashboardHref,
  labels,
}: {
  links: { href: string; label: string }[];
  signedIn: boolean;
  dashboardHref: string;
  labels: { open: string; close: string; signIn: string; signUp: string; dashboard: string };
}) {
  const [open, setOpen] = useState(false);

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
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-paper p-5 animate-fade">
          <div className="flex items-center justify-between">
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
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>

          <nav className="mt-10 flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rule-b py-4 font-display text-2xl text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3 pb-4">
            {signedIn ? (
              <Link
                href={dashboardHref}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center justify-center rounded-md bg-ink text-base font-medium text-ink-text"
              >
                {labels.dashboard}
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center justify-center rounded-md bg-ink text-base font-medium text-ink-text"
                >
                  {labels.signUp}
                </Link>
                <Link
                  href="/signin"
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center justify-center rounded-md border border-rule-strong text-base text-ink"
                >
                  {labels.signIn}
                </Link>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
