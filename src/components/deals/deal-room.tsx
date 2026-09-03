"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { Button, Callout, Card, CardBody, CardHeader, CardTitle, Eyebrow, Textarea, TermRow, TermSheet, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { advanceMilestone, flagMilestone, payNow, rate, retryFailedPayment, sendDealMessage, settlePayment } from "@/app/actions/deals";
import { egp, formatDate, formatQuarter, frequencyLabel, initials, relativeTime } from "@/lib/format";

export interface DealRoomProps {
  locale: string;
  viewer: { id: string; party: "BUYER" | "SELLER" | "COORDINATOR" };
  deal: {
    id: string; reference: string; status: string;
    cashToSeller: string; platformFee: string; developerAssignmentFee: string; reservationDeposit: string;
    contactUnmasked: boolean; createdAt: string; completedAt: string | null;
    buyerRating: number | null; sellerRating: number | null; outcomeNotes: string | null;
    offerAmount: string; completionDays: number;
  };
  listing: {
    id: string; reference: string; project: string; projectAr: string; city: string; developer: string;
    unitCode: string; bedrooms: number; buaSqm: string;
    outstandingBalance: string | null; installmentAmount: string | null;
    installmentFrequency: string | null; deliveryDate: string | null;
    cover: string | null; coverAlt: string;
    requiredDocuments: string[]; nocDays: number | null;
  };
  parties: {
    buyer: { name: string; phone: string; email: string | null; color: string; isYou: boolean };
    seller: { name: string; phone: string; email: string | null; color: string; isYou: boolean };
    coordinator: { name: string; phone: string; email: string | null; color: string; isYou: boolean } | null;
  };
  milestones: {
    key: string; order: number; status: string; ownerRole: string;
    dueDate: string | null; completedAt: string | null; blockedReason: string | null; notes: string | null;
    requiredDocuments: string[]; titleEn: string; titleAr: string; descriptionEn: string;
    requiresPayment: string | null;
  }[];
  payments: {
    id: string; kind: string; amount: string; status: string; provider: string;
    providerRef: string | null; instructionRef: string; idempotencyKey: string;
    failureCode: string | null; failureReason: string | null; attempts: number;
    createdAt: string; settledAt: string | null; events: { type: string; at: string }[];
  }[];
  messages: {
    id: string; body: string; isSystem: boolean; senderId: string | null;
    senderName: string | null; senderColor: string | null; createdAt: string;
  }[];
  events: { id: string; action: string; actor: string | null; at: string; metadata: unknown }[];
}

/**
 * The deal room. Milestones advance in order, money milestones will not close
 * without a settled payment, and every step lands in the immutable event log.
 */
export function DealRoom(props: DealRoomProps) {
  const { deal, listing, parties, milestones, payments, messages, events, viewer, locale } = props;
  const t = useTranslations("deal");
  const tm = useTranslations("milestone");
  const router = useRouter();
  const isAr = locale === "ar";

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [blocking, setBlocking] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [ratingValue, setRatingValue] = useState(5);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else router.refresh();
    });

  const paymentFor = (kind: string) =>
    payments.filter((p) => p.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  const completed = milestones.filter((m) => m.status === "COMPLETED").length;
  const progress = Math.round((completed / milestones.length) * 100);

  return (
    <div className="mx-auto max-w-[1400px]">
      <nav className="mb-4">
        <Link href={`/opportunities/${listing.id}`} className="text-xs text-ink-50 hover:text-ink">
          ← {listing.reference}
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-50">{deal.reference}</span>
            <Badge tone={deal.status === "COMPLETED" ? "verified" : deal.status === "CANCELLED" ? "flagged" : "info"}>
              {deal.status.toLowerCase()}
            </Badge>
            <Badge tone="neutral">{viewer.party.toLowerCase()}</Badge>
          </div>
          <h1 className="display-section text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-50">
            {isAr ? listing.projectAr : listing.project} · {listing.unitCode} · {listing.city}
          </p>
        </div>
        <div className="text-end">
          <p className="eyebrow mb-1">{isAr ? "التقدّم" : "Progress"}</p>
          <p className="money text-money-md font-semibold text-ink">{progress}%</p>
          <p className="text-2xs text-ink-30">
            {completed} / {milestones.length} {isAr ? "مرحلة" : "milestones"}
          </p>
        </div>
      </header>

      {error ? (
        <div className="mb-5">
          <Callout tone="flagged">{error}</Callout>
        </div>
      ) : null}

      {deal.status === "COMPLETED" ? (
        <div className="mb-6">
          <Callout tone="verified" title={t("completedTitle")}>
            {t("completedSub")}
            {deal.outcomeNotes ? <span className="mt-2 block text-xs">{deal.outcomeNotes}</span> : null}
          </Callout>
        </div>
      ) : null}

      {!deal.contactUnmasked ? (
        <div className="mb-6">
          <Callout tone="info">{t("contactMasked")}</Callout>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* ---- Milestones ---- */}
          <section>
            <Eyebrow>{t("milestones")}</Eyebrow>
            <ol className="mt-3 flex flex-col">
              {milestones.map((m, i) => {
                const done = m.status === "COMPLETED";
                const active = m.status === "IN_PROGRESS";
                const blocked = m.status === "BLOCKED";
                const payment = m.requiresPayment ? paymentFor(m.requiresPayment) : null;
                const paid = payment?.status === "SUCCEEDED";
                const canAct =
                  !done &&
                  (active || blocked) &&
                  milestones.slice(0, i).every((x) => x.status === "COMPLETED");

                return (
                  <li key={m.key} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* rail */}
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-2xs",
                          done
                            ? "border-verified bg-verified text-white"
                            : blocked
                              ? "border-flagged bg-flagged-soft text-flagged"
                              : active
                                ? "border-brass bg-brass text-ink"
                                : "border-rule-strong bg-paper text-ink-30",
                        )}
                      >
                        {done ? "✓" : m.order}
                      </span>
                      {i < milestones.length - 1 ? (
                        <span className={cn("w-px flex-1", done ? "bg-verified" : "bg-rule")} />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1 pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className={cn("text-sm font-semibold", done ? "text-verified" : "text-ink")}>
                          {isAr ? m.titleAr : m.titleEn}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">
                            {t("owner")}: {m.ownerRole.toLowerCase()}
                          </Badge>
                          {m.dueDate && !done ? (
                            <span className="money text-2xs text-ink-30">
                              {t("due")} {formatDate(m.dueDate, locale)}
                            </span>
                          ) : null}
                          {done && m.completedAt ? (
                            <span className="money text-2xs text-verified">{formatDate(m.completedAt, locale)}</span>
                          ) : null}
                        </div>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-ink-50">{m.descriptionEn}</p>

                      {m.requiredDocuments.length > 0 && !done ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {m.requiredDocuments.map((d) => (
                            <li key={d}>
                              <Badge tone="neutral">{d}</Badge>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {blocked && m.blockedReason ? (
                        <div className="mt-2">
                          <Callout tone="flagged">{m.blockedReason}</Callout>
                        </div>
                      ) : null}

                      {/* Payment gate */}
                      {m.requiresPayment && !done ? (
                        <div className="mt-3 rounded-md border border-rule bg-paper-sunken/60 p-3">
                          <PaymentBlock
                            kind={m.requiresPayment}
                            payment={payment}
                            amount={
                              m.requiresPayment === "RESERVATION_DEPOSIT"
                                ? deal.reservationDeposit
                                : m.requiresPayment === "PLATFORM_FEE"
                                  ? deal.platformFee
                                  : deal.cashToSeller
                            }
                            locale={locale}
                            pending={pending}
                            onPay={(simulate) => run(() => payNow({ dealId: deal.id, kind: m.requiresPayment as never, simulate }))}
                            onRetry={(paymentId, simulate) =>
                              run(() => retryFailedPayment({ dealId: deal.id, paymentId, simulate }))
                            }
                            onSettle={(paymentId) => run(() => settlePayment({ dealId: deal.id, paymentId }))}
                          />
                        </div>
                      ) : null}

                      {canAct ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            loading={pending}
                            disabled={Boolean(m.requiresPayment) && !paid}
                            onClick={() => run(() => advanceMilestone({ dealId: deal.id, key: m.key as never }))}
                          >
                            {t("markComplete")}
                          </Button>
                          {blocking === m.key ? (
                            <div className="flex w-full flex-col gap-2">
                              <Textarea
                                rows={2}
                                placeholder="What is blocking this?"
                                value={blockReason}
                                onChange={(e) => setBlockReason(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  loading={pending}
                                  onClick={() => {
                                    run(() => flagMilestone({ dealId: deal.id, key: m.key as never, reason: blockReason }));
                                    setBlocking(null);
                                    setBlockReason("");
                                  }}
                                >
                                  {t("blocked")}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setBlocking(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setBlocking(m.key)}>
                              {t("blocked")}
                            </Button>
                          )}
                        </div>
                      ) : null}

                      {m.notes ? <p className="mt-2 text-2xs text-ink-30">{m.notes}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ---- Messages ---- */}
          <section>
            <Eyebrow>{t("messages")}</Eyebrow>
            <Card className="mt-3">
              <CardBody>
                <ul className="mb-4 flex max-h-96 flex-col gap-3 overflow-y-auto scrollbar-thin">
                  {messages.map((m) => (
                    <li key={m.id} className={cn("flex gap-3", m.isSystem && "opacity-80")}>
                      {m.isSystem ? (
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-rule-strong text-2xs text-ink-50">
                          A
                        </span>
                      ) : (
                        <span
                          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-2xs font-semibold text-white"
                          style={{ backgroundColor: m.senderColor ?? "#5C6B66" }}
                        >
                          {initials(m.senderName ?? "?")}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-ink">
                            {m.isSystem ? "Aqary" : (m.senderName?.split(" ")[0] ?? "—")}
                          </span>
                          <span className="text-2xs text-ink-30">{relativeTime(m.createdAt, locale)}</span>
                        </div>
                        <p
                          className={cn(
                            "mt-1 rounded-md px-3 py-2 text-sm leading-relaxed",
                            m.isSystem ? "bg-paper-sunken text-ink-70" : "bg-paper-sunken/60 text-ink",
                          )}
                        >
                          {m.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const res = await sendDealMessage({ dealId: deal.id, body: message });
                      if (res.ok) setMessage("");
                      return res;
                    });
                  }}
                >
                  <Textarea
                    rows={2}
                    placeholder={t("messagePlaceholder")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <Button type="submit" className="self-end" loading={pending} disabled={!message.trim()}>
                    {t("sendMessage")}
                  </Button>
                </form>
              </CardBody>
            </Card>
          </section>

          {/* ---- Event log ---- */}
          <section>
            <Eyebrow>{t("eventLog")}</Eyebrow>
            <ol className="rule-t mt-3">
              {events.map((e) => (
                <li key={e.id} className="rule-b flex items-baseline justify-between gap-4 py-2">
                  <span className="text-xs text-ink-70">
                    {e.action.replace(/_/g, " ").toLowerCase()}
                    {e.actor ? <span className="ms-2 text-2xs text-ink-30">{e.actor}</span> : null}
                  </span>
                  <span className="money shrink-0 text-2xs text-ink-30">{relativeTime(e.at, locale)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-2xs text-ink-30">
              {isAr ? "سجل غير قابل للتعديل." : "Append-only. Rows here are never updated or deleted."}
            </p>
          </section>
        </div>

        {/* ---- Rail ---- */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("money")}</CardTitle>
            </CardHeader>
            <CardBody>
              <TermSheet>
                <TermRow label={t("cashToSeller")} emphasis>
                  {egp(deal.cashToSeller, { decimals: 0 })}
                </TermRow>
                <TermRow label={t("reservationDeposit")}>{egp(deal.reservationDeposit, { decimals: 0 })}</TermRow>
                <TermRow label={t("platformFee")}>{egp(deal.platformFee, { decimals: 0 })}</TermRow>
                <TermRow label={t("assignmentFee")}>{egp(deal.developerAssignmentFee, { decimals: 0 })}</TermRow>
              </TermSheet>

              {payments.length > 0 ? (
                <ul className="rule-t mt-4">
                  {payments.map((p) => (
                    <li key={p.id} className="rule-b py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-2xs text-ink-50">{p.kind.replace(/_/g, " ").toLowerCase()}</span>
                        <Badge
                          tone={
                            p.status === "SUCCEEDED" ? "verified" : p.status === "FAILED" ? "flagged" : "info"
                          }
                        >
                          {p.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="money mt-0.5 text-xs text-ink">{egp(p.amount, { decimals: 0 })}</p>
                      <p className="font-mono text-[10px] text-ink-30">
                        {p.providerRef ?? p.instructionRef} · attempt {p.attempts}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("parties")}</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="flex flex-col gap-3">
                {([
                  [t("buyer"), parties.buyer],
                  [t("seller"), parties.seller],
                  ...(parties.coordinator ? ([[t("coordinator"), parties.coordinator]] as const) : []),
                ] as const).map(([label, p]) => (
                  <li key={label} className="flex items-start gap-3">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-2xs font-semibold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {initials(p.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">
                        {p.name}
                        {p.isYou ? <span className="ms-1.5 text-2xs text-ink-30">(you)</span> : null}
                      </p>
                      <p className="eyebrow">{label}</p>
                      <p className="money text-2xs text-ink-50" dir="ltr">
                        {p.phone}
                      </p>
                      {p.email ? <p className="truncate text-2xs text-ink-50">{p.email}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              {listing.cover ? (
                <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-sm bg-paper-sunken">
                  <Image src={listing.cover} alt={listing.coverAlt} fill sizes="340px" className="object-cover" />
                </div>
              ) : null}
              <p className="text-sm font-medium text-ink">
                {isAr ? listing.projectAr : listing.project} · {listing.unitCode}
              </p>
              <p className="text-2xs text-ink-50">
                {listing.developer} · {listing.bedrooms} bed · {Number(listing.buaSqm).toFixed(0)} m²
              </p>
              <dl className="rule-t mt-3">
                <Row label="Remaining balance" value={egp(listing.outstandingBalance, { style: "compact" })} />
                <Row
                  label="Instalment"
                  value={`${egp(listing.installmentAmount, { style: "compact" })} ${frequencyLabel(listing.installmentFrequency, locale)}`}
                />
                <Row label="Delivery" value={formatQuarter(listing.deliveryDate, locale)} />
                {listing.nocDays ? <Row label="NOC turnaround" value={`${listing.nocDays} days`} /> : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("documents")}</CardTitle>
            </CardHeader>
            <CardBody>
              {listing.requiredDocuments.length === 0 ? (
                <p className="text-xs text-ink-50">No developer document list on file.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {listing.requiredDocuments.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-xs text-ink-70">
                      <span className="mt-1 size-1 shrink-0 rounded-full bg-brass" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {deal.status === "COMPLETED" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("rate")}</CardTitle>
              </CardHeader>
              <CardBody>
                {(viewer.party === "BUYER" && deal.buyerRating) || (viewer.party === "SELLER" && deal.sellerRating) ? (
                  <p className="text-sm text-verified">
                    Thank you — you rated this {viewer.party === "BUYER" ? deal.buyerRating : deal.sellerRating}/5.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRatingValue(n)}
                          aria-label={`${n} out of 5`}
                          className={cn(
                            "money size-9 rounded-sm border text-sm",
                            n <= ratingValue
                              ? "border-brass bg-brass text-ink"
                              : "border-rule-strong text-ink-50",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      loading={pending}
                      onClick={() => run(() => rate({ dealId: deal.id, rating: ratingValue }))}
                    >
                      {t("rate")}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PaymentBlock({
  kind,
  payment,
  amount,
  locale,
  onPay,
  onRetry,
  onSettle,
  pending,
}: {
  kind: string;
  payment: DealRoomProps["payments"][number] | null;
  amount: string;
  locale: string;
  onPay: (simulate?: "SUCCESS" | "FAILURE") => void;
  onRetry: (paymentId: string, simulate?: "SUCCESS" | "FAILURE") => void;
  onSettle: (paymentId: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("deal");
  const isAr = locale === "ar";

  if (payment?.status === "SUCCEEDED") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-verified">
          ✓ {t("paymentSucceeded")} — {egp(payment.amount, { decimals: 0 })}
        </span>
        <span className="font-mono text-[10px] text-ink-30">{payment.providerRef}</span>
      </div>
    );
  }

  if (payment?.status === "PROCESSING" || payment?.status === "INITIATED") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-info">{t("paymentProcessing")}</span>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => onSettle(payment.id)}>
          Check status
        </Button>
      </div>
    );
  }

  if (payment?.status === "FAILED") {
    return (
      <div className="flex flex-col gap-2">
        <Callout tone="flagged">
          <span className="text-xs">
            {t("paymentFailed")}: {payment.failureReason ?? payment.failureCode}
          </span>
        </Callout>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={pending} onClick={() => onRetry(payment.id, "SUCCESS")}>
            {t("retryPayment")}
          </Button>
          <Button size="sm" variant="ghost" loading={pending} onClick={() => onRetry(payment.id, "FAILURE")}>
            {t("paySimulateFailure")}
          </Button>
        </div>
        <p className="text-[10px] text-ink-30">
          {isAr
            ? "كل محاولة إعادة تنشئ سجل دفع جديدًا بمفتاح تكرار جديد."
            : "Each retry creates a new payment record with its own idempotency key — the failed attempt stays on the record."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-70">
          {kind.replace(/_/g, " ").toLowerCase()} · {egp(amount, { decimals: 0 })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pending} onClick={() => onPay("SUCCESS")}>
          {t("paySimulateSuccess")}
        </Button>
        <Button size="sm" variant="ghost" loading={pending} onClick={() => onPay("FAILURE")}>
          {t("paySimulateFailure")}
        </Button>
      </div>
      <p className="text-[10px] leading-snug text-ink-30">
        {isAr
          ? "مزوّد الدفع محاكى. كل ما عداه — سجل الدفع، الحالات، مفاتيح التكرار، سجل التدقيق — حقيقي."
          : "The payment provider is mocked. Everything else — the payment record, the state transitions, the idempotency key, the audit trail — is real."}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-ink-50">{label}</dt>
      <dd className="money text-xs text-ink">{value}</dd>
    </div>
  );
}
