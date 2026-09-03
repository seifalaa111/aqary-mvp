import { notFound } from "next/navigation";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { auditTrail } from "@/lib/audit";
import { egp, formatDate, relativeTime } from "@/lib/format";
import { Button, Callout, Card, CardBody, CardHeader, CardTitle, Eyebrow, TermRow, TermSheet } from "@/components/ui/primitives";
import { Badge, StatusPill, VerificationScore } from "@/components/ui/badges";
import { ProvenanceChip } from "@/components/ui/provenance";
import { StatusTracker } from "@/components/seller/status-tracker";
import { AskingCashEditor } from "@/components/seller/asking-cash-editor";

export const dynamic = "force-dynamic";

export default async function SellerListingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });
  const tm = await getTranslations({ locale, namespace: "market" });
  const tl = await getTranslations({ locale, namespace: "fieldLabel" });
  const isAr = locale === "ar";

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      contract: {
        include: {
          fields: true,
          unit: { include: { project: { include: { developer: true } } } },
          receipts: true,
        },
      },
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }], take: 6 },
      documents: { select: { id: true, type: true, fileName: true } },
      discrepancies: { where: { status: "OPEN" }, orderBy: { severity: "desc" } },
      offers: {
        where: { status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
        orderBy: { createdAt: "desc" },
        include: { buyer: { select: { fullNameEn: true } } },
      },
      deal: { select: { id: true, reference: true, status: true } },
      analyst: { select: { fullNameEn: true } },
      _count: { select: { offers: true, savedBy: true, media: true, documents: true } },
    },
  });

  if (!listing || listing.sellerId !== user.id) notFound();

  const trail = await auditTrail("Listing", id, 20);
  const infoItems = listing.infoRequestItems as
    | { code: string; labelEn: string; labelAr: string; detail?: string }[]
    | null;

  const verifiedPaid = listing.contract.fields.find((f) => f.key === "AMOUNT_PAID");
  const project = listing.contract.unit.project;

  return (
    <div className="mx-auto max-w-[1200px]">
      <nav className="mb-4">
        <Link href="/seller" className="text-xs text-ink-50 hover:text-ink">
          ← {t("dashboard")}
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-50">{listing.reference}</span>
            <StatusPill status={listing.status} />
            {listing.verificationScore !== null ? (
              <VerificationScore
                score={listing.verificationScore}
                breakdown={listing.verificationScoreBreakdown as never}
                locale={locale}
                size="sm"
              />
            ) : null}
          </div>
          <h1 className="display-section text-ink">
            {isAr ? project.nameAr : project.nameEn} · {listing.contract.unit.unitCode}
          </h1>
          <p className="mt-1 text-sm text-ink-50">
            {isAr ? project.developer.nameAr : project.developer.nameEn} · {project.city}
            {listing.analyst ? ` · analyst: ${listing.analyst.fullNameEn}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["LISTED", "UNDER_OFFER"].includes(listing.status) ? (
            <Link href={`/opportunities/${listing.id}`}>
              <Button variant="secondary">View as a buyer sees it</Button>
            </Link>
          ) : null}
          {listing.status === "INFO_REQUESTED" ? (
            <Link href={`/seller/listings/${listing.id}/wizard`}>
              <Button>Supply what is missing</Button>
            </Link>
          ) : null}
          {listing._count.offers > 0 ? (
            <Link href={`/seller/listings/${listing.id}/offers`}>
              <Button>{t("offersCount", { count: listing._count.offers })}</Button>
            </Link>
          ) : null}
          {listing.deal ? (
            <Link href={`/deals/${listing.deal.id}`}>
              <Button>Deal room {listing.deal.reference}</Button>
            </Link>
          ) : null}
        </div>
      </header>

      <div className="mb-8">
        <StatusTracker status={listing.status} locale={locale} />
      </div>

      {listing.status === "INFO_REQUESTED" && infoItems?.length ? (
        <div className="mb-8">
          <Callout tone="pending" title={t("infoRequestedTitle")}>
            <ul className="mt-1 flex flex-col gap-2">
              {infoItems.map((i) => (
                <li key={i.code} className="text-sm">
                  • {isAr ? i.labelAr : i.labelEn}
                  {i.detail ? <span className="block ps-3 text-xs text-ink-50">{i.detail}</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-50">
              Requested {relativeTime(listing.infoRequestedAt, locale)}.
            </p>
          </Callout>
        </div>
      ) : null}

      {listing.status === "REJECTED" ? (
        <div className="mb-8">
          <Callout tone="flagged" title="We could not verify this file">
            {listing.rejectionReason}
          </Callout>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-8">
          {/* ---- Money ---- */}
          <Card>
            <CardHeader>
              <CardTitle>{t("cashYouReceive")}</CardTitle>
            </CardHeader>
            <CardBody>
              <AskingCashEditor
                listingId={listing.id}
                askingCash={listing.askingCash?.toString() ?? "0"}
                flexibilityPct={listing.flexibilityPct}
                verifiedPaid={
                  verifiedPaid?.verifiedSource && verifiedPaid.verifiedNum
                    ? verifiedPaid.verifiedNum.toString()
                    : null
                }
                declaredPaid={verifiedPaid?.declaredNum?.toString() ?? null}
                editable={["DRAFT", "PENDING_REVIEW", "INFO_REQUESTED", "VERIFIED", "LISTED"].includes(listing.status)}
                locale={locale}
              />
            </CardBody>
          </Card>

          {/* ---- The record, with provenance ---- */}
          <section>
            <Eyebrow>Your contract record</Eyebrow>
            <h2 className="mb-4 mt-1 font-display text-xl text-ink">
              {isAr ? "ما نعرفه عن عقدك" : "What we hold on your contract"}
            </h2>
            <Card>
              <CardBody>
                <TermSheet>
                  {listing.contract.fields
                    .filter((f) => f.declaredNum || f.declaredDate || f.declaredText || f.verifiedSource)
                    .map((f) => {
                      const verified = f.verifiedSource !== null;
                      const shown = verified
                        ? f.verifiedNum ?? f.verifiedDate ?? f.verifiedText
                        : f.declaredNum ?? f.declaredDate ?? f.declaredText;
                      return (
                        <TermRow
                          key={f.key}
                          label={
                            <span className="flex items-center gap-2">
                              {tl(f.key)}
                              <ProvenanceChip source={verified ? f.verifiedSource : "SELLER_DECLARED"} size="xs" />
                            </span>
                          }
                        >
                          {shown instanceof Date
                            ? formatDate(shown, locale)
                            : f.kind === "MONEY"
                              ? egp(shown?.toString(), { decimals: 0 })
                              : String(shown ?? "—")}
                        </TermRow>
                      );
                    })}
                </TermSheet>
              </CardBody>
            </Card>
          </section>

          {listing.discrepancies.length > 0 ? (
            <section>
              <Eyebrow>Open questions on your file</Eyebrow>
              <div className="mt-3 flex flex-col gap-2">
                {listing.discrepancies.map((d) => (
                  <Callout key={d.id} tone={d.severity === "CRITICAL" ? "flagged" : "pending"}>
                    <span className="block text-sm font-medium text-ink">{isAr ? d.titleAr : d.titleEn}</span>
                    <span className="mt-1 block text-xs">
                      {egp(d.valueA)} ({d.sourceA.replace(/_/g, " ").toLowerCase()}) vs {egp(d.valueB)} (
                      {d.sourceB.replace(/_/g, " ").toLowerCase()})
                    </span>
                  </Callout>
                ))}
              </div>
            </section>
          ) : null}

          {/* ---- Activity ---- */}
          <section>
            <Eyebrow>Everything that has happened to this file</Eyebrow>
            <ol className="rule-t mt-3">
              {trail.map((e) => (
                <li key={e.id} className="rule-b flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-sm text-ink-70">
                    {e.action.replace(/_/g, " ").toLowerCase()}
                    {e.actor ? <span className="ms-2 text-2xs text-ink-30">{e.actor.fullNameEn}</span> : null}
                  </span>
                  <span className="money shrink-0 text-2xs text-ink-30">{relativeTime(e.at, locale)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* ---- Rail ---- */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardBody>
              <p className="eyebrow mb-3">Your file at a glance</p>
              <dl className="rule-t text-sm">
                <Row label="Documents" value={String(listing._count.documents)} />
                <Row label="Receipts" value={String(listing.contract.receipts.length)} />
                <Row
                  label="Receipts verified"
                  value={String(listing.contract.receipts.filter((r) => r.status === "VERIFIED").length)}
                />
                <Row label="Images" value={String(listing._count.media)} />
                <Row label={tm("watchers", { count: listing._count.savedBy })} value={String(listing._count.savedBy)} />
                {listing.publishedAt ? (
                  <Row label="Published" value={formatDate(listing.publishedAt, locale)} />
                ) : null}
                {listing.humanVerifiedAt ? (
                  <Row label="Verified by an analyst" value={formatDate(listing.humanVerifiedAt, locale)} />
                ) : null}
              </dl>
            </CardBody>
          </Card>

          {listing.media.length > 0 ? (
            <Card>
              <CardBody>
                <p className="eyebrow mb-3">Your images</p>
                <ul className="grid grid-cols-3 gap-2">
                  {listing.media.map((m) => {
                    const v = m.variants as { thumb?: string };
                    return (
                      <li key={m.id} className="relative aspect-square overflow-hidden rounded-sm bg-paper-sunken">
                        {v.thumb ? (
                          <Image src={v.thumb} alt={m.altEn} fill sizes="100px" className="object-cover" />
                        ) : null}
                        {m.moderationStatus !== "APPROVED" ? (
                          <span className="absolute inset-inline-start-0.5 bottom-0.5">
                            <Badge tone="pending">{m.moderationStatus.toLowerCase()}</Badge>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {listing.offers.length > 0 ? (
            <Card>
              <CardBody>
                <p className="eyebrow mb-3">{t("offersTitle")}</p>
                <ul className="rule-t">
                  {listing.offers.map((o) => (
                    <li key={o.id} className="rule-b flex items-baseline justify-between gap-3 py-2.5">
                      <span className="text-xs text-ink-70">{o.buyer.fullNameEn.split(" ")[0]}</span>
                      <span className="money text-sm font-medium text-ink">{egp(o.amount, { decimals: 0 })}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/seller/listings/${listing.id}/offers`}>
                  <Button className="mt-4 w-full" size="sm">
                    {t("offersTitle")}
                  </Button>
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
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
