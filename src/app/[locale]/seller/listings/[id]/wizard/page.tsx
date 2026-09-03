import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { config } from "@/lib/config";
import { IntakeWizard } from "@/components/seller/wizard/intake-wizard";

export const dynamic = "force-dynamic";

export default async function WizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { step } = await searchParams;
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      contract: {
        include: {
          fields: true,
          unit: { include: { project: { select: { id: true, developerId: true } } } },
        },
      },
      documents: {
        select: { id: true, type: true, fileName: true, pageCount: true, sizeBytes: true, blurScore: true },
        orderBy: { createdAt: "asc" },
      },
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
    },
  });

  if (!listing || listing.sellerId !== user.id) notFound();

  // A submitted file is no longer editable here; send the seller to its status page.
  if (!["DRAFT", "INFO_REQUESTED"].includes(listing.status)) {
    redirect({ href: `/seller/listings/${id}`, locale });
  }

  const [developers, profile, dbUser] = await Promise.all([
    prisma.developer.findMany({
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        projects: { select: { id: true, nameEn: true, nameAr: true, city: true, area: true }, orderBy: { nameEn: "asc" } },
      },
      orderBy: { nameEn: "asc" },
    }),
    prisma.sellerProfile.findUnique({ where: { userId: user.id } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);

  const field = (key: string) => listing.contract.fields.find((f) => f.key === key);
  const num = (key: string) => field(key)?.declaredNum?.toString() ?? "";
  const date = (key: string) => field(key)?.declaredDate?.toISOString().slice(0, 10) ?? "";

  const initial = {
    listingId: listing.id,
    reference: listing.reference,
    status: listing.status,
    wizardStep: Number(step ?? listing.wizardStep) || 1,
    wizardCompleted: listing.wizardCompleted,
    infoRequestItems: (listing.infoRequestItems as { code: string; labelEn: string; labelAr: string; detail?: string }[] | null) ?? null,
    step1: {
      fullNameAr: dbUser.fullNameAr ?? "",
      fullNameEn: dbUser.fullNameEn,
      nationalId: dbUser.nationalId ?? "",
      email: dbUser.email ?? "",
      relationshipToContract: profile?.relationshipToContract ?? "OWNER",
      coOwnerCount: profile?.coOwnerCount ?? 0,
      coOwnerNames: profile?.coOwnerNames ?? [],
      preferredContactWindow: profile?.preferredContactWindow ?? "",
      whatsappOptIn: profile?.whatsappOptIn ?? false,
    },
    step2: {
      developerId: listing.contract.unit.project.developerId,
      projectId: listing.contract.unit.projectId,
      unitCode: listing.contract.unit.unitCode.startsWith("DRAFT-") ? "" : listing.contract.unit.unitCode,
      phase: listing.contract.unit.phase ?? "",
      unitType: listing.contract.unit.unitType,
      buaSqm: Number(listing.contract.unit.buaSqm) || "",
      gardenSqm: listing.contract.unit.gardenSqm ? Number(listing.contract.unit.gardenSqm) : "",
      roofSqm: listing.contract.unit.roofSqm ? Number(listing.contract.unit.roofSqm) : "",
      terraceSqm: listing.contract.unit.terraceSqm ? Number(listing.contract.unit.terraceSqm) : "",
      floor: listing.contract.unit.floor ?? "",
      bedrooms: listing.contract.unit.bedrooms,
      bathrooms: listing.contract.unit.bathrooms,
      view: listing.contract.unit.view ?? "",
      finishing: listing.contract.unit.finishing,
      contractualDeliveryDate: listing.contract.unit.contractualDeliveryDate.toISOString().slice(0, 10),
      deliveryStatus: listing.contract.unit.deliveryStatus,
    },
    step3: {
      contractNumber: listing.contract.contractNumber ?? "",
      signingDate: date("CONTRACT_SIGNING_DATE"),
      totalPrice: num("TOTAL_PRICE"),
      downPayment: num("DOWN_PAYMENT"),
      maintenanceDeposit: num("MAINTENANCE_DEPOSIT"),
      clubFee: num("CLUB_FEE"),
      frequency: field("INSTALLMENT_FREQUENCY")?.declaredText ?? "QUARTERLY",
      numberOfInstallments: num("NUMBER_OF_INSTALLMENTS"),
      installmentAmount: num("INSTALLMENT_AMOUNT"),
      planStartDate: date("PLAN_START_DATE"),
      nextDueDate: date("NEXT_DUE_DATE"),
      totalPaid: num("AMOUNT_PAID"),
      outstandingBalance: num("OUTSTANDING_BALANCE"),
      hasArrears: listing.contract.hasArrears,
      arrearsAmount: listing.contract.arrearsAmount?.toString() ?? "",
      hasBankFinance: listing.contract.hasBankFinance,
      lienNote: listing.contract.lienNote ?? "",
      assignmentPermitted: listing.contract.assignmentPermitted,
      assignmentFee: num("ASSIGNMENT_FEE"),
      assignmentConditionsNote: listing.contract.assignmentConditionsNote ?? "",
      cancellationPenaltyPct: num("CANCELLATION_PENALTY_PCT"),
      cancellationPenaltyNote: listing.contract.cancellationPenaltyNote ?? "",
      specialPayments: [] as { label: string; amount: number; monthOffset: number; kind: string }[],
    },
    step5: {
      flexibilityPct: listing.flexibilityPct,
      urgency: listing.urgency ?? "ONE_TO_THREE_MONTHS",
      exitReason: listing.exitReason ?? "LIQUIDITY_NEED",
      isPrivate: listing.isPrivate,
      exclusivityDays: 0,
    },
    documents: listing.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      pageCount: d.pageCount,
      sizeBytes: d.sizeBytes,
      blurWarning: (d.blurScore ?? 999) < 90,
    })),
    media: listing.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      roomTag: m.roomTag,
      altEn: m.altEn,
      isCover: m.isCover,
      moderationStatus: m.moderationStatus,
      thumb: (m.variants as { thumb?: string }).thumb ?? "",
    })),
    developers,
    minImages: config.MIN_APPROVED_IMAGES,
    maxFlexibility: config.MAX_FLEXIBILITY_PCT,
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <p className="eyebrow mb-1">{listing.reference}</p>
      <h1 className="mb-8 display-section text-ink">{t("wizardTitle")}</h1>
      <IntakeWizard initial={initial} locale={locale} />
    </div>
  );
}
