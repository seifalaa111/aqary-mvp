import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { config } from "@/lib/config";
import { Eyebrow } from "@/components/ui/primitives";
import { QueueView, type QueueListingItem } from "@/components/analyst/queue-view";

export const dynamic = "force-dynamic";

/**
 * The verification queue. Prioritisation is computed, not typed: files with
 * open critical signals come first, then contract value, then age.
 */
export default async function AnalystQueue({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });
  const isAr = locale === "ar";

  const [listings, analysts] = await Promise.all([
    prisma.listing.findMany({
      where: { status: { in: ["PENDING_REVIEW", "SUBMITTED", "AI_PROCESSING", "INFO_REQUESTED", "VERIFIED"] } },
      include: {
        analyst: { select: { id: true, fullNameEn: true } },
        seller: { select: { fullNameEn: true } },
        contract: {
          select: {
            fields: { where: { key: "TOTAL_PRICE" }, select: { declaredNum: true, verifiedNum: true } },
            unit: { select: { unitCode: true, project: { select: { nameEn: true, nameAr: true, city: true } } } },
          },
        },
        discrepancies: { where: { status: "OPEN" }, select: { severity: true } },
        fraudSignals: { where: { status: { in: ["OPEN", "ESCALATED"] } }, select: { severity: true } },
        _count: { select: { documents: true, media: true } },
      },
    }),
    prisma.user.findMany({
      where: { roles: { hasSome: ["ANALYST", "ADMIN"] } },
      select: { id: true, fullNameEn: true },
      orderBy: { fullNameEn: "asc" },
    }),
  ]);

  const items: QueueListingItem[] = listings
    .map((l) => {
      const criticalCount =
        l.discrepancies.filter((d) => d.severity === "CRITICAL").length +
        l.fraudSignals.filter((s) => s.severity === "CRITICAL").length;
      const majorCount =
        l.discrepancies.filter((d) => d.severity === "MAJOR").length +
        l.fraudSignals.filter((s) => s.severity === "MAJOR").length;
      const value = Number(
        l.contract.fields[0]?.verifiedNum ?? l.contract.fields[0]?.declaredNum ?? 0,
      );
      const ageHours = (Date.now() - (l.submittedAt ?? l.createdAt).getTime()) / 3600000;
      const overdue = l.slaDueAt ? l.slaDueAt.getTime() < Date.now() : false;

      // Flagged first, then value, then age — with overdue files pulled up.
      // An escalated file outranks everything: someone has asked for help on it.
      const priority =
        (l.escalatedAt ? 100_000 : 0) +
        criticalCount * 10_000 +
        majorCount * 2_000 +
        (overdue ? 1_500 : 0) +
        value / 1_000_000 +
        ageHours / 24;

      return {
        id: l.id,
        reference: l.reference,
        status: l.status,
        verificationScore: l.verificationScore,
        verificationBreakdown: l.verificationScoreBreakdown,
        unitCode: l.contract.unit.unitCode,
        projectName: l.contract.unit.project.nameEn,
        projectNameAr: l.contract.unit.project.nameAr ?? l.contract.unit.project.nameEn,
        city: l.contract.unit.project.city,
        sellerName: l.seller.fullNameEn.split(" ")[0] ?? "Seller",
        documentsCount: l._count.documents,
        mediaCount: l._count.media,
        value,
        criticalCount,
        majorCount,
        ageHours,
        submittedAt: l.submittedAt ? l.submittedAt.toISOString() : null,
        slaDueAt: l.slaDueAt ? l.slaDueAt.toISOString() : null,
        overdue,
        escalatedAt: l.escalatedAt ? l.escalatedAt.toISOString() : null,
        escalationReason: l.escalationReason,
        priority,
        assignedAnalyst: l.analyst ? { id: l.analyst.id, name: l.analyst.fullNameEn.split(" ")[0]! } : null,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  return (
    <>
      <header className="mb-6">
        <Eyebrow>{t("console")}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">{t("queue")}</h1>
        <p className="mt-2 text-sm text-ink-50">{t("queueSub")}</p>
      </header>

      <QueueView
        locale={locale}
        userId={user.id}
        items={items}
        analysts={analysts.map((a) => ({ id: a.id, name: a.fullNameEn }))}
        labels={{
          inQueue: isAr ? "في القائمة" : "In queue",
          assignedToMe: isAr ? "مُسندة إليّ" : "Assigned to me",
          unassigned: isAr ? "غير مُسندة" : "Unassigned",
          pastSla: isAr ? "تجاوزت الـ SLA" : "Past SLA",
          searchPlaceholder: isAr ? "بحث بالمرجع، المشروع، الوحدة، البائع..." : "Search reference, project, unit, seller...",
          statusFilter: isAr ? "الحالة" : "Status",
          signalsFilter: isAr ? "الإشارات" : "Signals",
          file: isAr ? "الملف" : "File",
          status: isAr ? "الحالة" : "Status",
          contractValue: isAr ? "قيمة العقد" : "Contract value",
          signals: isAr ? "الإشارات" : "Signals",
          timeOnFile: t("timeOnFile"),
          sla: "SLA",
          action: isAr ? "الإجراء" : "Action",
          claim: t("assignToMe"),
          reassign: isAr ? "إعادة إسناد" : "Reassign",
          openFile: t("openFile"),
          all: isAr ? "الكل" : "All",
          clear: isAr ? "مسح التصفية" : "Clear filters",
          noMatching: isAr ? "لا توجد ملفات تطابق هذه التصفية" : "No files match the selected filters",
          mine: isAr ? "لي" : "mine",
          due: isAr ? "الاستحقاق" : "Due",
          overdueBy: isAr ? "متأخر بـ" : "Overdue by",
        }}
      />

      <p className="mt-4 text-2xs text-ink-30">
        SLA target: {config.VERIFICATION_SLA_HOURS} hours from submission.
      </p>
    </>
  );
}
