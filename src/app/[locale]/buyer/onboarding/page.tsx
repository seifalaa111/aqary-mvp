import { setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { BuyerOnboarding } from "@/components/buyer/buyer-onboarding";

export const dynamic = "force-dynamic";

export default async function BuyerOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("BUYER");

  const [profile, developers, cities, unitTypes, bounds] = await Promise.all([
    prisma.buyerProfile.findUnique({ where: { userId: user.id } }),
    prisma.developer.findMany({ select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
    prisma.project
      .findMany({ select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } })
      .then((r) => r.map((x) => x.city)),
    prisma.unit
      .findMany({ select: { unitType: true }, distinct: ["unitType"] })
      .then((r) => r.map((x) => x.unitType)),
    prisma.listing.aggregate({
      where: { status: { in: ["LISTED", "UNDER_OFFER"] } },
      _min: { askingCash: true, installmentAmount: true },
      _max: { askingCash: true, installmentAmount: true },
    }),
  ]);

  return (
    <BuyerOnboarding
      locale={locale}
      initial={{
        availableCash: profile?.availableCash?.toString() ?? "",
        maxInstallment: profile?.maxInstallment?.toString() ?? "",
        installmentFrequency: profile?.installmentFrequency ?? "QUARTERLY",
        incomeRange: profile?.incomeRange ?? "",
        employmentType: profile?.employmentType ?? "",
        purchasePurpose: profile?.purchasePurpose ?? "",
        readiness: profile?.readiness ?? "",
        prefCities: profile?.prefCities ?? [],
        prefUnitTypes: profile?.prefUnitTypes ?? [],
        prefDeveloperIds: profile?.prefDeveloperIds ?? [],
        prefBedroomsMin: profile?.prefBedroomsMin ?? undefined,
        prefBuaMin: profile?.prefBuaMin ?? undefined,
        prefDeliveryByYear: profile?.prefDeliveryByYear ?? undefined,
        freeTextPriorities: profile?.freeTextPriorities ?? "",
      }}
      options={{
        developers,
        cities,
        unitTypes,
        cashMin: Number(bounds._min.askingCash ?? 0),
        cashMax: Number(bounds._max.askingCash ?? 10_000_000),
        installmentMin: Number(bounds._min.installmentAmount ?? 0),
        installmentMax: Number(bounds._max.installmentAmount ?? 500_000),
      }}
    />
  );
}
