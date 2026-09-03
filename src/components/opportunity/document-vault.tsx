"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button, Card, CardBody, Eyebrow, Callout } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { expressInterest } from "@/app/actions/buyer";

/**
 * The vault is locked until the buyer accepts confidentiality terms, which
 * writes a real `Consent` row. Every page view goes through the signed-URL
 * route, which logs the access against the document.
 */
export function DocumentVault({
  listingId,
  unlocked,
  documents,
  locale,
  labels,
}: {
  listingId: string;
  unlocked: boolean;
  documents: { id: string; type: string; fileName: string; pageCount: number }[];
  locale: string;
  labels: { title: string; sub: string; locked: string; express: string };
}) {
  const td = useTranslations("docType");
  const [open, setOpen] = useState(unlocked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grouped = documents.reduce<Record<string, typeof documents>>((acc, d) => {
    (acc[d.type] ??= []).push(d);
    return acc;
  }, {});

  return (
    <section>
      <Eyebrow>{labels.title}</Eyebrow>
      <h2 className="mb-2 mt-1 font-display text-xl text-ink">{labels.title}</h2>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-50">{labels.sub}</p>

      <Card>
        <CardBody>
          {error ? (
            <div className="mb-4">
              <Callout tone="flagged">{error}</Callout>
            </div>
          ) : null}

          {!open ? (
            <div className="flex flex-col items-start gap-4 py-4">
              <div className="flex items-center gap-3">
                <LockMark />
                <p className="text-sm text-ink-70">{labels.locked}</p>
              </div>
              <p className="max-w-lg text-xs leading-relaxed text-ink-50">
                {locale === "ar"
                  ? "بالضغط أدناه فإنك توافق على شروط السرية. كل اطلاع على صفحة يُسجَّل باسمك، والبيانات الشخصية محجوبة."
                  : "Continuing accepts the confidentiality terms for this deal. Every page you open is logged against your account, and personal data is redacted before you see it."}
              </p>
              <Button
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await expressInterest(listingId);
                    if (!res.ok) {
                      setError(
                        res.code === "UNAUTHENTICATED"
                          ? "Sign in as a buyer to unlock the document vault."
                          : res.error,
                      );
                      return;
                    }
                    setOpen(true);
                  })
                }
              >
                {labels.express}
              </Button>
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-ink-50">No documents on file for this listing yet.</p>
          ) : (
            <ul className="rule-t">
              {Object.entries(grouped).map(([type, docs]) => (
                <li key={type} className="rule-b py-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{td(type as "SALE_CONTRACT")}</span>
                    <Badge tone="neutral">{docs.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {docs.map((d) => (
                      <Link
                        key={d.id}
                        href={`/documents/${d.id}`}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-rule-strong px-2.5 py-1 font-mono text-2xs text-ink-70 transition-colors hover:border-ink-50 hover:text-ink"
                      >
                        <PageMark />
                        {d.fileName.slice(0, 28)}
                        <span className="text-ink-30">· {d.pageCount}p</span>
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}

function LockMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-5 text-ink-50" fill="none" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function PageMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
      <path d="M3 1.5h4l2 2v7H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M7 1.5v2h2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
