import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { PoliciesManager, type DeveloperPolicyRow } from "@/components/admin/policies-manager";

export const dynamic = "force-dynamic";

export default async function AdminPoliciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const developers = await prisma.developer.findMany({
    orderBy: { nameEn: "asc" },
    include: {
      policy: true,
      policyVersions: { orderBy: { version: "desc" } },
      _count: { select: { projects: true } },
    },
  });

  const rows: DeveloperPolicyRow[] = developers.map((d) => ({
    developerId: d.id,
    developerNameEn: d.nameEn,
    developerNameAr: d.nameAr,
    projectCount: d._count.projects,
    policy: d.policy
      ? {
          id: d.policy.id,
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
          effectiveDate: d.policy.effectiveDate ? d.policy.effectiveDate.toISOString() : null,
          source: d.policy.source,
          verificationState: d.policy.verificationState,
          versions: d.policyVersions.map((v) => ({
            id: v.id,
            version: v.version,
            effectiveDate: v.effectiveDate ? v.effectiveDate.toISOString() : null,
            assignmentAllowed: v.assignmentAllowed,
            feeType: v.feeType,
            feePercentBps: v.feePercentBps,
            feeFixedAmount: v.feeFixedAmount?.toString() ?? null,
            minPercentPaidBps: v.minPercentPaidBps,
            minMonthsElapsed: v.minMonthsElapsed,
            typicalNocDays: v.typicalNocDays,
            waitingPeriodDays: v.waitingPeriodDays,
            source: v.source,
            verificationState: v.verificationState,
            changeReason: v.changeReason,
            createdAt: v.createdAt.toISOString(),
          })),
        }
      : null,
  }));

  const t = await getTranslations({ locale, namespace: "admin" });
  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{t("developerTerms")}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {t("developerAssignmentPoliciesVersioning")}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {t("manageAssignmentFeesNocTurnaround")}
        </p>
      </header>

      <PoliciesManager locale={locale} rows={rows} />
    </div>
  );
}
