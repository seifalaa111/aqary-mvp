import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { getSessionUser } from "@/lib/auth/session";
import { getOpportunity, similarOpportunities } from "@/lib/queries/opportunity";
import { cashRequiredNow } from "@/lib/queries/marketplace";
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

  const requiredNow = cashRequiredNow(listing);
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
    <div className="mx-auto max-w-[1400px] px-5 py-6 md:px-8 md:py-10">
      <nav className="mb-5">
        <Link href="/opportunities" className="text-xs text-ink-50 hover:text-ink">
          ← {t("backToMarket")}
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
            {listing.status !== "LISTED" ? <Badge tone="info">{listing.status.replace(/_/g, " ")}</Badge> : null}
          </div>
          <h1 className="display-section text-ink">{isAr ? project.nameAr : project.nameEn}</h1>
          <p className="mt-2 text-sm text-ink-50">
            {isAr ? developer.nameAr : developer.nameEn} · {project.city} · {project.area} ·{" "}
            {tu(unit.unitType as "APARTMENT")} · {unit.bedrooms} bed · {Number(unit.buaSqm).toFixed(0)} m²
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveButton listingId={id} initialSaved={Boolean(saved)} variant="labelled" />
        </div>
      </header>

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
          close: "Close",
          previous: "Previous",
          next: "Next",
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
                          {policy.assignmentAllowed.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </TermRow>
                      <TermRow label={t("assignmentFee")}>
                        {policy.feeType === "PERCENT"
                          ? `${((policy.feePercentBps ?? 0) / 100).toFixed(2)}% of ${policy.feeBasis === "OUTSTANDING_BALANCE" ? "outstanding balance" : "contract price"}`
                          : policy.feeType === "FIXED"
                            ? egp(policy.feeFixedAmount)
                            : "—"}
                      </TermRow>
                      <TermRow label={t("assignmentTimeline")}>
                        {policy.typicalNocDays ? `${policy.typicalNocDays} days` : "—"}
                      </TermRow>
                      <TermRow label="Minimum paid before assignment">
                        {policy.minPercentPaidBps ? `${(policy.minPercentPaidBps / 100).toFixed(0)}%` : "—"}
                      </TermRow>
                      <TermRow label="Minimum months elapsed">
                        {policy.minMonthsElapsed ? `${policy.minMonthsElapsed} months` : "—"}
                      </TermRow>
                    </TermSheet>

                    <p className="mt-5 text-sm leading-relaxed text-ink-70">
                      {isAr ? policy.conditionsAr : policy.conditionsEn}
                    </p>

                    <p className="eyebrow mb-2 mt-6">{t("assignmentDocs")}</p>
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
                        Synthetic policy. Real assignment terms must be confirmed with the developer
                        before any transaction — see ASSUMPTIONS.md.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-ink-50">No assignment policy on file for this developer.</p>
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
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader className="bg-paper-sunken/70">
              <CardTitle>{tm("cashToSeller")}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="money mb-1 text-money-xl font-semibold tracking-tight text-ink">
                {egp(listing.askingCash, { style: "bare", decimals: 0 })}
              </p>
              <p className="mb-5 text-xs text-ink-50">
                EGP · {t("costCashNow")} {egp(requiredNow, { decimals: 0 })}
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
                  cash {fit.cashCoveragePct}% · installment {fit.installmentCoveragePct}%
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
              <Row label="Unit code" value={unit.unitCode} />
              <Row label="Type" value={tu(unit.unitType as "APARTMENT")} />
              <Row label="Built-up area" value={`${Number(unit.buaSqm).toFixed(0)} m²`} />
              {unit.gardenSqm ? <Row label="Garden" value={`${Number(unit.gardenSqm).toFixed(0)} m²`} /> : null}
              {unit.terraceSqm ? <Row label="Terrace" value={`${Number(unit.terraceSqm).toFixed(0)} m²`} /> : null}
              <Row label="Bedrooms" value={String(unit.bedrooms)} />
              <Row label="Bathrooms" value={String(unit.bathrooms)} />
              {unit.floor !== null ? <Row label="Floor" value={String(unit.floor)} /> : null}
              {unit.view ? <Row label="View" value={unit.view} /> : null}
              <Row label="Finishing" value={tf(unit.finishing as "SEMI_FINISHED")} />
              <Row label="Delivery status" value={unit.deliveryStatus.replace(/_/g, " ").toLowerCase()} />
              <Row label="Contractual delivery" value={formatDate(unit.contractualDeliveryDate, locale)} />
            </dl>
          </div>
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
