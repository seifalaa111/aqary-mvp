import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { AuditViewer, type AuditEventRow } from "@/components/admin/audit-viewer";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const events = await prisma.auditEvent.findMany({
    take: 80,
    orderBy: { at: "desc" },
    include: {
      actor: { select: { id: true, fullNameEn: true, roles: true } },
    },
  });

  const rows: AuditEventRow[] = events.map((e) => ({
    id: e.id,
    actorId: e.actorId,
    actorName: e.actor?.fullNameEn ?? null,
    actorRoles: e.actor?.roles ?? [],
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    metadata: e.metadata,
    ip: e.ip,
    at: e.at.toISOString(),
  }));

  const actionTypes = Array.from(new Set(events.map((e) => e.action))).sort();
  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{isAr ? "الرقابة والامتثال" : "Compliance & Security"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "سجل التدقيق والرقابة الشامل" : "Immutable Audit Trail"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "سجل غير قابل للتعديل لكل حركة أموال، تغيير صلاحيات، تعديل سياسات، وتدخل إداري (WHO, WHAT, TARGET, WHEN, WHY, DIFF)."
            : "Every money movement, verification promotion, role elevation, and administrative override with full before/after state diffs."}
        </p>
      </header>

      <AuditViewer locale={locale} events={rows} actionTypes={actionTypes} />
    </div>
  );
}
