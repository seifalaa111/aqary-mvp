import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guard";
import { markRead } from "@/lib/services/notifications";
import { relativeTime } from "@/lib/format";
import { EmptyState, cn } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badges";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const tn = await getTranslations({ locale, namespace: "nav" });
  const isAr = locale === "ar";

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  // Opening the page marks them read — a real state change, not a UI trick.
  await markRead(user.id);

  return (
    <WorkspaceShell locale={locale} role={user.activeRole} nav={[]}>
      <div className="mx-auto max-w-[760px]">
        <h1 className="mb-6 display-section text-ink">{tn("notifications")}</h1>
        {notifications.length === 0 ? (
          <EmptyState title={tn("notifications")} body={isAr ? "لا توجد إشعارات." : "Nothing yet."} />
        ) : (
          <ol className="rule-t">
            {notifications.map((n) => {
              const body = (
                <div className={cn("py-4", !n.readAt && "bg-brass-soft/40 -mx-3 px-3")}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{isAr ? n.titleAr : n.titleEn}</span>
                    <span className="money shrink-0 text-2xs text-ink-30">{relativeTime(n.createdAt, locale)}</span>
                  </div>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-ink-50">
                    {isAr ? n.bodyAr : n.bodyEn}
                  </p>
                  <div className="mt-1.5">
                    <Badge tone="neutral">{n.type.replace(/_/g, " ").toLowerCase()}</Badge>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="rule-b">
                  {n.linkHref ? (
                    <Link href={n.linkHref as never} className="block hover:opacity-80">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </WorkspaceShell>
  );
}
