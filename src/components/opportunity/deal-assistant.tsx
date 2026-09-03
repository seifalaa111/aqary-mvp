"use client";

import { useState, useTransition } from "react";
import { Link } from "@/i18n/routing";
import { Button, Card, CardBody, Eyebrow, Textarea, Callout } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { askAboutDeal } from "@/app/actions/assistant";

interface Turn {
  question: string;
  answer: string;
  citations: { documentId: string; page: number; quote: string }[];
  notStated: boolean;
  routeToHuman: boolean;
}

/**
 * Grounded strictly in this deal's verified documents. When the documents do
 * not answer the question it says so and routes to a human, rather than
 * producing something plausible.
 */
export function DealAssistant({
  listingId,
  locale,
  labels,
}: {
  listingId: string;
  locale: string;
  labels: { title: string; sub: string; placeholder: string; send: string };
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestions =
    locale === "ar"
      ? ["ما شروط التنازل لدى المطوّر؟", "كم المتبقي عليّ بعد النقل؟", "ماذا يحدث لو تأخرت عن قسط؟"]
      : [
          "What are the developer's assignment conditions?",
          "How much is still outstanding after the transfer?",
          "What happens if I miss an instalment?",
        ];

  const ask = (q: string) => {
    if (!q.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await askAboutDeal({ listingId, question: q, locale });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTurns((prev) => [...prev, { question: q, ...res.data! }]);
      setQuestion("");
    });
  };

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

          {turns.length > 0 ? (
            <ul className="mb-6 flex flex-col gap-5">
              {turns.map((turn, i) => (
                <li key={i}>
                  <p className="mb-2 text-sm font-medium text-ink">{turn.question}</p>
                  <div
                    className={
                      turn.notStated
                        ? "rounded-md border border-pending/30 bg-pending-soft p-3"
                        : "rounded-md border border-rule bg-paper-sunken/60 p-3"
                    }
                  >
                    <p className="text-sm leading-relaxed text-ink-70">{turn.answer}</p>
                    {turn.citations.length > 0 ? (
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {turn.citations.map((c, j) => (
                          <li key={j} className="text-2xs text-ink-50">
                            <Link
                              href={`/documents/${c.documentId}?page=${c.page}`}
                              className="font-mono text-info underline underline-offset-2"
                            >
                              page {c.page}
                            </Link>{" "}
                            — “{c.quote.slice(0, 160)}”
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {turn.routeToHuman ? (
                      <div className="mt-3">
                        <Badge tone="pending">Routed to a coordinator</Badge>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-5 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-sm border border-rule-strong px-3 py-1.5 text-xs text-ink-70 transition-colors hover:border-ink-50 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={labels.placeholder}
              rows={2}
              aria-label={labels.title}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xs text-ink-50">
                Answers come only from this deal&apos;s verified documents, with the page cited.
              </p>
              <Button type="submit" loading={pending} disabled={!question.trim()}>
                {labels.send}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </section>
  );
}
