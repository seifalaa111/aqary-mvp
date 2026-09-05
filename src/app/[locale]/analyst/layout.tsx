import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { WorkspaceShell, type NavItem } from "@/components/chrome/workspace-shell";

export default async function AnalystLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRolePage("ANALYST", "ADMIN");
  const t = await getTranslations({ locale, namespace: "analyst" });

  const queue = await prisma.listing.count({
    where: { status: { in: ["PENDING_REVIEW", "SUBMITTED", "AI_PROCESSING"] } },
  });

  const nav: NavItem[] = [
    { href: "/analyst", label: t("queue"), badge: queue || undefined },
    { href: "/analyst/pipeline", label: t("pipeline") },
    { href: "/analyst/policies", label: t("policies") },
    { href: "/analyst/users", label: t("users") },
  ];

  if (user.roles.includes("ADMIN")) {
    nav.unshift({
      href: "/admin",
      label: locale === "ar" ? "← لوحة الإدارة" : "← Admin console",
    });
  }

  return (
    <WorkspaceShell
      locale={locale}
      role="ANALYST"
      nav={nav}
    >
      {children}
    </WorkspaceShell>
  );
}
