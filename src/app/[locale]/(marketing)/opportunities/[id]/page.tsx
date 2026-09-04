import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { getSessionUser } from "@/lib/auth/session";
import { getOpportunity, similarOpportunities } from "@/lib/queries/opportunity";
import { affordability, type Frequency } from "@/lib/domain/calculators";
import { egp, formatDate, formatQuarter, frequencyLabel } from "@/lib/format";
import { toCardData } from "@/components/marketplace/to-card-data";
import { OpportunityCard } from "@/components/marketplace/opportunity-card";
import { Gallery } from "@/components/opportunity/gallery";
import { ContractSummary } from "@/components/opportunity/contract-summary";
import { PaymentTimeline } from "@/components/opportunity/payment-timeline";
import { ScheduleTable } from "@/components/opportunity/schedule-table";
import { ValuationPanel } from "@/components/opportunity/valuation-panel";
import { CostCalculator } from "@/components/opportunity/cost-calculator";
import { AffordabilitySimulator } from "@/components/opportunity/affordability-simulator";
import { DocumentVault } from "@/components/opportunity/document-vault";
import { DealAssistant } from "@/components/opportunity/deal-assistant";
import { OfferPanel } from "@/components/opportunity/offer-panel";
import { Badge, VerificationScore } from "@/components/ui/badges";
import { SaveButton } from "@/components/marketplace/save-button";
import { Card, CardBody, CardHeader, CardTitle, Eyebrow, TermRow, TermSheet } from "@/components/ui/primitives";
import { PositionHeader } from "@/components/opportunity/position-header";
import { MobileCtaBar } from "@/components/opportunity/mobile-cta-bar";
import type { Provenance } from "@/components/ui/provenance";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "opportunity" });
  const tm = await getTranslations({ locale, namespace: "market" });
  const tu = await getTranslations({ locale, namespace: "unitType" });
  const tf = await getTranslations({ locale, namespace: "finishing" });
  const tcity = await getTranslations({ locale, namespace: "city" });
  const tas = await getTranslations({ locale, namespace: "assignmentStatus" });
  const tds = await getTranslations({ locale, namespace: "deliveryStatus" });
  const tv = await getTranslations({ locale, namespace: "view" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tst = await getTranslations({ locale, namespace: "status" });
  const isAr = locale === "ar";

  const data = await getOpportunity(id);
  if (!data) notFound();

  const { listing, unit, project, developer, policy, fields, cost, valuation } = data;

  // Only published listings are public; the seller and analysts may preview.
  const user = await getSessionUser();
  const isPublic = ["LISTED", "UNDER_OFFER", "RESERVED", "ASSIGNMENT_IN_PROGRESS", "COMPLETED"].includes(
    listing.status,
  );
  const isPrivileged =
    user && (user.id === listing.sellerId || user.roles.includes("ANALYST") || user.roles.includes("ADMIN"));
  if (!isPublic && !isPrivileged) notFound();

  const [buyerProfile, saved, existingOffer, similar, interestConsent] = await Promise.all([
    user ? prisma.buyerProfile.findUnique({ where: { userId: user.id } }) : null,
    user
      ? prisma.savedListing.findUnique({ where: { buyerId_listingId: { buyerId: user.id, listingId: id } } })
      : null,
    user
      ? prisma.offer.findFirst({
          where: { listingId: id, buyerId: user.id, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
          orderBy: { createdAt: "desc" },
        })
      : null,
    similarOpportunities(id),
    user
      ? prisma.consent.findFirst({ where: { userId: user.id, type: "BUYER_CONFIDENTIALITY", granted: true } })
      : null,
  ]);

  // A view is a real view. Counted once per request on the public page.
  if (isPublic) {
    await prisma.listing.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  }

  // The same breakdown the cost panel renders — not a second computation.
  const requiredNow = cost.cashRequiredNow;
  // The source the analyst actually adopted for the paid amount that caps the
  // asking cash — rendered as-is rather than asserted to be a receipt.
  const paidSource = (fields.find((f) => f.key === "AMOUNT_PAID")?.source ??
    null) as Provenance | null;
  const fit =
    buyerProfile?.availableCash && buyerProfile.maxInstallment
      ? affordability({
          availableCash: buyerProfile.availableCash.toString(),
          maxInstallment: buyerProfile.maxInstallment.toString(),
          buyerFrequency: buyerProfile.installmentFrequency as Frequency,
          cashRequiredNow: requiredNow,
          listingInstallmentAmount: listing.installmentAmount?.toString() ?? 0,
          listingFrequency: (listing.installmentFrequency ?? "QUARTERLY") as Frequency,
        })
      : null;

  const media = listing.media.map((m) => ({
    id: m.id,
    kind: m.kind,
    roomTag: m.roomTag,
    altEn: m.altEn,
    altAr: m.altAr,
    caption: m.caption,
    variants: m.variants as { thumb?: string; card?: string; detail?: string },
    blurhash: m.blurhash,
    dominantColor: m.dominantColor,
    moderationStatus: m.moderationStatus,
  }));

  return (
    <div className="shell-wide py-6 pb-24 md:py-9 lg:pb-9">
      <nav className="mb-5">
        <Link href="/opportunities" className="text-xs text-ink-50 hover:text-ink">
          <span className="arrow-forward inline-block">←</span> {t("backToMarket")}
        </Link>
      </nav>

      {/* ================= HEADER ================= */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-50">{listing.reference}</span>
            <VerificationScore
              score={listing.verificationScore}
              breakdown={listing.verificationScoreBreakdown as never}
              locale={locale}
            />
            {listing.status !== "LISTED" ? (
              <Badge tone="info">
                {tst.has(listing.status) ? tst(listing.status) : listing.status.replace(/_/g, " ")}
              </Badge>
            ) : null}
          </div>
          <h1 className="display-hero text-ink">{isAr ? project.nameAr : project.nameEn}</h1>
          <p className="mt-2 text-sm text-ink-50">
            {isAr ? developer.nameAr : developer.nameEn} ·{" "}
            {tcity.has(project.city) ? tcity(project.city) : project.city}
            {/* Several projects name the area the same as the city; repeating it
                reads as a data error rather than as more precision. */}
            {project.area && project.area !== project.city ? ` · ${project.area}` : ""} ·{" "}
            {tu(unit.unitType as "APARTMENT")} · {tm("bedroomsCount", { count: unit.bedrooms })} ·{" "}
            <span dir="ltr" className="unicode-bidi-isolate">
              {Number(unit.buaSqm).toFixed(0)} m²
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveButton listingId={id} initialSaved={Boolean(saved)} variant="labelled" />
        </div>
      </header>

      {/* ================= FINANCIAL POSITION ================= */}
      <div className="mb-8">
        <PositionHeader
          cashRequiredNow={requiredNow.toString()}
          cashToSeller={listing.askingCash?.toString() ?? null}
          totalEffectiveCost={cost.totalEffectiveCost.toString()}
          developerPriceToday={unit.currentDeveloperPrice?.toString() ?? null}
          // Derived from the very total this header renders, so the figure and
          // the percentage beside it can never disagree.
          discountPctBps={cost.savingPctBps}
          hasArrears={listing.contract.hasArrears}
          outstandingBalance={listing.outstandingBalance?.toString() ?? null}
          remainingCount={listing.remainingInstallments ?? 0}
          installmentAmount={listing.installmentAmount?.toString() ?? null}
          frequencyLabel={frequencyLabel(listing.installmentFrequency, locale)}
          paidSource={paidSource}
          labels={{
            cashRequiredNow: tm("cashRequiredNow"),
            cashRequiredNowHint: tm("cashRequiredNowHint"),
            cashRequiredNowHintArrears: tm("cashRequiredNowHintArrears"),
            cashToSeller: tm("cashToSeller"),
            totalEffectiveCost: t("totalEffectiveCostLabel"),
            totalCostHint: t("totalCostHint"),
            developerPriceToday: tm("developerPriceToday"),
            vsDeveloper: t("vsDeveloper", { price: "{price}" }),
            belowDeveloper: t("belowDeveloper", { pct: "{pct}" }),
            outstandingToDeveloper: t("outstandingToDeveloper"),
            installment: tm("installment"),
            remainingPayments: tm("remainingPayments", { count: listing.remainingInstallments ?? 0 }),
          }}
          action={
            <a
              href="#offer"
              className="inline-flex h-11 items-center rounded-sm bg-brass px-5 text-sm font-semibold text-ink transition-colors hover:bg-brass-hover"
            >
              {t("makeOffer")} <span aria-hidden className="arrow-forward ms-1.5">→</span>
            </a>
          }
        />
      </div>

      {/* ================= GALLERY ================= */}
      <Gallery
        media={media}
        labels={{
          gallery: t("gallery"),
          floorPlan: t("floorPlan"),
          masterPlan: t("masterPlan"),
          actualPhotos: tm("actualPhotos"),
          showUnit: tm("showUnit"),
          renders: tm("developerRenders"),
          close: t("galleryClose"),
          previous: t("galleryPrevious"),
          next: t("galleryNext"),
        }}
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* ================= MAIN ================= */}
        <div className="flex min-w-0 flex-col gap-10">
          <ContractSummary
            fields={fields}
            locale={locale}
            title={t("contractSummary")}
            subtitle={t("contractSummarySub")}
            pendingLabel={t("pendingField")}
          />

          <section>
            <Eyebrow>{t("paymentTimeline")}</Eyebrow>
            <h2 className="mb-5 mt-1 font-display text-xl text-ink">{t("paymentTimeline")}</h2>
            <PaymentTimeline
              rows={data.schedule.map((r) => ({
                sequence: r.sequence,
                kind: r.kind,
                dueDate: r.dueDate.toISOString(),
                amount: r.amount.toString(),
                status: r.status,
                label: r.label,
              }))}
              receipts={data.receipts.map((r) => ({
                id: r.id,
                documentId: r.documentId,
                amount: r.verifiedAmount?.toString() ?? "0",
                date: r.verifiedDate?.toISOString() ?? null,
              }))}
              unlocked={Boolean(interestConsent)}
              locale={locale}
              labels={{ paid: t("paid"), upcoming: t("upcoming"), balloon: t("balloon"), openReceipt: t("openReceipt") }}
            />
          </section>

          <ScheduleTable
            rows={data.schedule.map((r) => ({
              sequence: r.sequence,
              kind: r.kind,
              dueDate: r.dueDate.toISOString(),
              amount: r.amount.toString(),
              runningBalance: r.runningBalance.toString(),
              status: r.status,
              label: r.label,
            }))}
            locale={locale}
            reference={listing.reference}
            title={t("schedule")}
            downloadLabel={t("downloadSchedule")}
          />

          <ValuationPanel
            valuation={
              valuation
                ? {
                    low: (valuation.overrideLow ?? valuation.low).toString(),
                    mid: (valuation.overrideMid ?? valuation.mid).toString(),
                    high: (valuation.overrideHigh ?? valuation.high).toString(),
                    confidence: valuation.confidence,
                    method: valuation.method,
                    overrideReason: valuation.overrideReason,
                    drivers: valuation.drivers as { labelEn: string; labelAr: string; effectPct: number; note: string }[],
                    comparables: valuation.comparables.map((c) => ({
                      label: c.label,
                      projectName: c.projectName,
                      unitType: c.unitType,
                      buaSqm: c.buaSqm.toString(),
                      price: c.price.toString(),
                      pricePerSqm: c.pricePerSqm.toString(),
                      source: c.source,
                    })),
                  }
                : null
            }
            contractPrice={listing.totalContractPrice?.toString() ?? null}
            developerToday={unit.currentDeveloperPrice?.toString() ?? null}
            locale={locale}
            labels={{
              title: t("valuation"),
              sub: t("valuationSub"),
              range: t("valuationRange"),
              confidence: t("valuationConfidence"),
              drivers: t("valuationDrivers"),
              comparables: t("comparables"),
            }}
          />

          <CostCalculator
            base={{
              cashToSeller: listing.askingCash?.toString() ?? "0",
              minAcceptableCash: listing.minAcceptableCash?.toString() ?? listing.askingCash?.toString() ?? "0",
              totalContractPrice: listing.totalContractPrice?.toString() ?? "0",
              platformFee: cost.platformFee.toString(),
              developerAssignmentFee: listing.developerAssignmentFee?.toString() ?? "0",
              dues: data.maintenanceAndClub.toString(),
              arrears: listing.contract.hasArrears ? listing.contract.arrearsAmount?.toString() ?? "0" : "0",
              remainingInstallments: data.remainingSum.toString(),
              remainingCount: data.upcoming.length,
              developerToday: unit.currentDeveloperPrice?.toString() ?? null,
              feePct: config.PLATFORM_FEE_BPS / 100,
            }}
            locale={locale}
          />

          <AffordabilitySimulator
            listing={{
              cashRequiredNow: requiredNow.toString(),
              installmentAmount: listing.installmentAmount?.toString() ?? "0",
              frequency: (listing.installmentFrequency ?? "QUARTERLY") as Frequency,
            }}
            profile={
              buyerProfile?.availableCash && buyerProfile.maxInstallment
                ? {
                    availableCash: buyerProfile.availableCash.toString(),
                    maxInstallment: buyerProfile.maxInstallment.toString(),
                    frequency: buyerProfile.installmentFrequency as Frequency,
                  }
                : null
            }
            locale={locale}
          />

          {/* ---- Developer assignment policy ---- */}
          <section>
            <Eyebrow>{t("assignmentPolicy")}</Eyebrow>
            <h2 className="mb-4 mt-1 font-display text-xl text-ink">
              {isAr ? developer.nameAr : developer.nameEn}
            </h2>
            <Card>
              <CardBody>
                {policy ? (
                  <>
                    <TermSheet>
                      <TermRow label={t("assignmentAllowed")}>
                        <Badge
                          tone={
                            policy.assignmentAllowed === "ALLOWED"
                              ? "verified"
                              : policy.assignmentAllowed === "NOT_ALLOWED"
                                ? "flagged"
                                : "pending"
                          }
                        >
                          {tas.has(policy.assignmentAllowed)
                            ? tas(policy.assignmentAllowed)
                            : policy.assignmentAllowed.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </TermRow>
                      <TermRow label={t("assignmentFee")}>
                        {policy.feeType === "PERCENT"
                          ? policy.feeBasis === "OUTSTANDING_BALANCE"
                            ? t("feeOfOutstanding", { pct: `${((policy.feePercentBps ?? 0) / 100).toFixed(2)}%` })
                            : t("feeOfContract", { pct: `${((policy.feePercentBps ?? 0) / 100).toFixed(2)}%` })
                          : policy.feeType === "FIXED"
                            ? egp(policy.feeFixedAmount)
                            : "—"}
                      </TermRow>
                      <TermRow label={t("assignmentTimeline")}>
                        {policy.typicalNocDays ? t("nocDays", { days: policy.typicalNocDays }) : "—"}
                      </TermRow>
                      <TermRow label={t("minPercentPaid")}>
                        {policy.minPercentPaidBps ? `${(policy.minPercentPaidBps / 100).toFixed(0)}%` : "—"}
                      </TermRow>
                      <TermRow label={t("minMonthsElapsed")}>
                        {policy.minMonthsElapsed ? t("monthsValue", { months: policy.minMonthsElapsed }) : "—"}
                      </TermRow>
                    </TermSheet>

                    <p className="mt-5 text-sm leading-relaxed text-ink-70">
                      {isAr ? policy.conditionsAr : policy.conditionsEn}
                    </p>

                    {/* A developer's own required-document wording is stored in
                        English only; inventing Arabic for another party's legal
                        requirements is not the presentation layer's call, so the
                        reader is told rather than left to wonder. */}
                    <p className="eyebrow mb-2 mt-6">
                      {t("assignmentDocs")}
                      {isAr ? (
                        <span className="ms-2 rounded-xs border border-rule-strong px-1 py-px text-[9px] normal-case tracking-normal text-ink-50">
                          {tc("englishOnly")}
                        </span>
                      ) : null}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {policy.requiredDocuments.map((d) => (
                        <li key={d} className="flex gap-2 text-sm text-ink-70">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brass" />
                          {d}
                        </li>
                      ))}
                    </ul>

                    {policy.isSynthetic ? (
                      <p className="mt-6 rounded-md border border-pending/30 bg-pending-soft px-3 py-2 text-2xs leading-relaxed text-ink-70">
                        {t("syntheticPolicy")}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-ink-50">{t("noPolicy")}</p>
                )}
              </CardBody>
            </Card>
          </section>

          <DocumentVault
            listingId={id}
            unlocked={Boolean(interestConsent)}
            documents={listing.documents.map((d) => ({
              id: d.id,
              type: d.type,
              fileName: d.fileName,
              pageCount: d.pageCount,
            }))}
            locale={locale}
            labels={{
              title: t("documentVault"),
              sub: t("documentVaultSub"),
              locked: t("documentVaultLocked"),
              express: t("expressInterest"),
            }}
          />

          <DealAssistant
            listingId={id}
            locale={locale}
            labels={{
              title: t("ask"),
              sub: t("askSub"),
              placeholder: t("askPlaceholder"),
              send: t("askSend"),
            }}
          />

          {similar.length > 0 ? (
            <section>
              <Eyebrow>{t("similar")}</Eyebrow>
              <h2 className="mb-5 mt-1 font-display text-xl text-ink">{t("similar")}</h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {similar.map((s) => (
                  <OpportunityCard key={s.id} data={toCardData(s, { locale })} showSave={false} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* ================= STICKY RAIL ================= */}
        <div id="offer" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader className="bg-paper-sunken">
              <CardTitle>{tm("cashRequiredNow")}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="money mb-1 figure-xl text-ink">
                {egp(requiredNow, { style: "bare", decimals: 0 })}
              </p>
              <p className="mb-5 text-xs text-ink-50">
                EGP · {tm("cashToSeller")} {egp(listing.askingCash, { decimals: 0 })}
              </p>

              <TermSheet>
                <TermRow label={tm("installment")}>
                  {egp(listing.installmentAmount, { decimals: 0 })}{" "}
                  <span className="text-2xs text-ink-50">
                    {frequencyLabel(listing.installmentFrequency, locale)}
                  </span>
                </TermRow>
                <TermRow label={tm("remaining")}>
                  {egp(listing.outstandingBalance, { style: "compact" })} / {listing.remainingInstallments ?? 0}
                </TermRow>
                <TermRow label={tm("delivery")}>{formatQuarter(listing.deliveryDate, locale)}</TermRow>
                <TermRow label={t("costTotal")} emphasis>
                  {egp(cost.totalEffectiveCost, { style: "compact" })}
                </TermRow>
              </TermSheet>

              {fit ? (
                <div
                  className={`mt-5 rounded-md px-3 py-2.5 text-xs ${
                    fit.verdict === "WITHIN"
                      ? "bg-verified-soft text-verified"
                      : fit.verdict === "STRETCH"
                        ? "bg-pending-soft text-pending"
                        : "bg-paper-sunken text-ink-50"
                  }`}
                >
                  {fit.verdict === "WITHIN"
                    ? tm("withinBudget")
                    : fit.verdict === "STRETCH"
                      ? tm("stretch")
                      : tm("aboveProfile")}
                  {" · "}
                  {t("fitCash", { pct: fit.cashCoveragePct })} ·{" "}
                  {t("fitInstallment", { pct: fit.installmentCoveragePct })}
                </div>
              ) : null}

              <div className="mt-6">
                <OfferPanel
                  listingId={id}
                  reference={listing.reference}
                  askingCash={listing.askingCash?.toString() ?? "0"}
                  minAcceptableCash={listing.minAcceptableCash?.toString() ?? null}
                  flexibilityPct={listing.flexibilityPct}
                  platformFee={cost.platformFee.toString()}
                  feePct={config.PLATFORM_FEE_BPS / 100}
                  status={listing.status}
                  signedIn={Boolean(user)}
                  isBuyer={Boolean(user?.roles.includes("BUYER"))}
                  tier={buyerProfile?.tier ?? null}
                  hasInterest={Boolean(interestConsent)}
                  existingOffer={
                    existingOffer
                      ? {
                          id: existingOffer.id,
                          amount: existingOffer.amount.toString(),
                          status: existingOffer.status,
                          expiresAt: existingOffer.expiresAt.toISOString(),
                        }
                      : null
                  }
                  locale={locale}
                />
              </div>
            </CardBody>
          </Card>

          <div className="mt-4 rounded-lg border border-rule bg-paper-sunken/50 p-4">
            <p className="eyebrow mb-2">{t("unitDetails")}</p>
            <dl className="rule-t text-sm">
              <Row label={t("unitCode")} value={unit.unitCode} />
              <Row label={t("unitTypeLabel")} value={tu(unit.unitType as "APARTMENT")} />
              <Row label={t("bua")} value={`${Number(unit.buaSqm).toFixed(0)} m²`} />
              {unit.gardenSqm ? <Row label={t("garden")} value={`${Number(unit.gardenSqm).toFixed(0)} m²`} /> : null}
              {unit.terraceSqm ? <Row label={t("terrace")} value={`${Number(unit.terraceSqm).toFixed(0)} m²`} /> : null}
              <Row label={t("bedrooms")} value={String(unit.bedrooms)} />
              <Row label={t("bathrooms")} value={String(unit.bathrooms)} />
              {unit.floor !== null ? <Row label={t("floor")} value={String(unit.floor)} /> : null}
              {unit.view ? (
                <Row label={t("view")} value={tv.has(unit.view) ? tv(unit.view) : unit.view} />
              ) : null}
              <Row label={t("finishingLabel")} value={tf(unit.finishing as "SEMI_FINISHED")} />
              <Row
                label={t("deliveryStatus")}
                value={
                  tds.has(unit.deliveryStatus)
                    ? tds(unit.deliveryStatus)
                    : unit.deliveryStatus.replace(/_/g, " ").toLowerCase()
                }
              />
              <Row label={t("contractualDelivery")} value={formatDate(unit.contractualDeliveryDate, locale)} />
            </dl>
          </div>
        </div>
      </div>

      {/* On a phone the offer panel is a long way down; the price and the next
          step stay in reach. */}
      <MobileCtaBar
        amount={`${egp(requiredNow, { style: "bare", decimals: 0 })} EGP`}
        label={tm("cashRequiredNow")}
        cta={t("ctaSticky")}
        targetId="offer"
      />
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
