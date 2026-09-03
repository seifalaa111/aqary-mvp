import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { PolicyLibrary } from "@/components/analyst/policy-library";

export const dynamic = "force-dynamic";

export default async function PoliciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const developers = await prisma.developer.findMany({
    orderBy: { nameEn: "asc" },
    include: { policy: true, _count: { select: { projects: true } } },
  });

  return (
    <>
      <Eyebrow>{t("console")}</Eyebrow>
      <h1 className="mb-2 mt-1 display-section text-ink">{t("policies")}</h1>
      <p className="mb-8 max-w-2xl text-sm text-ink-50">
        Assignment terms differ by developer, and they are what decides whether a contract can move at all.
        Every policy here is synthetic in this build and must be confirmed with the developer before use.
      </p>

      <PolicyLibrary
        locale={locale}
        developers={developers.map((d) => ({
          id: d.id,
          nameEn: d.nameEn,
          nameAr: d.nameAr,
          projectCount: d._count.projects,
          policy: d.policy
            ? {
                assignmentAllowed: d.policy.assignmentAllowed,
                feeType: d.policy.feeType,
                feePercentBps: d.policy.feePercentBps,
                feeFixedAmount: d.policy.feeFixedAmount?.toString() ?? null,
                feeBasis: d.policy.feeBasis,
                minPercentPaidBps: d.policy.minPercentPaidBps,
                minMonthsElapsed: d.policy.minMonthsElapsed,
                typicalNocDays: d.policy.typicalNocDays,
                waitingPeriodDays: d.policy.waitingPeriodDays,
                requiredDocuments: d.policy.requiredDocuments,
                conditionsEn: d.policy.conditionsEn,
                conditionsAr: d.policy.conditionsAr,
                contactName: d.policy.contactName,
                contactEmail: d.policy.contactEmail,
                contactPhone: d.policy.contactPhone,
                isSynthetic: d.policy.isSynthetic,
              }
            : null,
        }))}
      />
    </>
  );
}
