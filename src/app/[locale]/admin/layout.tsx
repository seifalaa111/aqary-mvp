import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { WorkspaceShell, type NavItem } from "@/components/chrome/workspace-shell";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRolePage("ADMIN");

  const [failedPayments, deadJobs, criticalDiscrepancies] = await Promise.all([
    prisma.payment.count({ where: { status: "FAILED" } }),
    prisma.job.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
    prisma.discrepancy.count({ where: { severity: "CRITICAL", status: "OPEN" } }),
  ]);

  const attentionTotal = failedPayments + deadJobs + criticalDiscrepancies;
  const t = await getTranslations({ locale, namespace: "admin" });
  const isAr = locale === "ar";

  const nav: NavItem[] = [
    {
      href: "/admin",
      label: t("overview2"),
      badge: attentionTotal || undefined,
    },
    {
      href: "/admin/listings",
      label: t("listings2"),
    },
    {
      href: "/admin/users",
      label: t("usersKyc"),
    },
    {
      href: "/admin/pipeline",
      label: t("pipeline2"),
    },
    {
      href: "/admin/policies",
      label: t("policies2"),
    },
    {
      href: "/admin/payments",
      label: t("payments2"),
      badge: failedPayments || undefined,
    },
    {
      href: "/admin/jobs",
      label: t("jobs2"),
      badge: deadJobs || undefined,
    },
    {
      href: "/admin/metrics",
      label: t("metrics2"),
    },
    {
      href: "/admin/audit",
      label: t("audit2"),
    },
    {
      href: "/analyst",
      label: t("verificationWorkbench"),
    },
  ];

  return (
    <WorkspaceShell
      locale={locale}
      role="ADMIN"
      nav={nav}
    >
      {children}
    </WorkspaceShell>
  );
}
