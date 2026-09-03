import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export default async function AnalystLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const queue = await prisma.listing.count({
    where: { status: { in: ["PENDING_REVIEW", "SUBMITTED", "AI_PROCESSING"] } },
  });

  return (
    <WorkspaceShell
      locale={locale}
      role="ANALYST"
      nav={[
        { href: "/analyst", label: t("queue"), badge: queue || undefined },
        { href: "/analyst/pipeline", label: t("pipeline") },
        { href: "/analyst/policies", label: t("policies") },
        { href: "/analyst/users", label: t("users") },
        { href: "/analyst/metrics", label: t("metrics") },
        { href: "/analyst/jobs", label: t("jobs") },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
