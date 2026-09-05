import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { AUDIT_ACTIONS } from "@/lib/domain/audit-actions";
import { AuditViewer, type AuditEventRow } from "@/components/admin/audit-viewer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * The audit trail is the record an operator falls back on when something has
 * already gone wrong, so it has to be readable past its most recent page.
 * Filtering and paging happen in the query, not in the browser — a fixed window
 * of the newest rows would make every older event unreachable.
 */
export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; entity?: string; cursor?: string }>;
}) {
  const { locale } = await params;
  const { action, entity, cursor } = await searchParams;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const where: Prisma.AuditEventWhereInput = {};
  if (action && action !== "ALL") where.action = action;
  if (entity && entity !== "ALL") where.entityType = entity;

  const [page, entityTypes, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      // One extra row tells us whether a next page exists without a count.
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ at: "desc" }, { id: "desc" }],
      include: { actor: { select: { id: true, fullNameEn: true, roles: true } } },
    }),
    prisma.auditEvent
      .groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } })
      .then((rows) => rows.map((r) => r.entityType)),
    prisma.auditEvent.count({ where }),
  ]);

  const hasNext = page.length > PAGE_SIZE;
  const events = hasNext ? page.slice(0, PAGE_SIZE) : page;

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

  const t = await getTranslations({ locale, namespace: "admin" });
  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{t("complianceSecurity")}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {t("immutableAuditTrail")}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {t("everyMoneyMovementVerificationPromotion")}
        </p>
      </header>

      <AuditViewer
        locale={locale}
        events={rows}
        // From the registry, so an action that has not been written yet is still
        // selectable — and a filter cannot silently disappear with the page.
        actionTypes={Object.values(AUDIT_ACTIONS).slice().sort()}
        entityTypes={entityTypes}
        activeAction={action ?? "ALL"}
        activeEntity={entity ?? "ALL"}
        nextCursor={hasNext ? events[events.length - 1]!.id : null}
        matchingTotal={total}
      />
    </div>
  );
}
