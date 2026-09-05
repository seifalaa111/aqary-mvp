import type { ReactNode } from "react";
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
  const isAr = locale === "ar";

  const nav: NavItem[] = [
    {
      href: "/admin",
      label: isAr ? "نظرة عامة" : "Overview",
      badge: attentionTotal || undefined,
    },
    {
      href: "/admin/listings",
      label: isAr ? "العقود" : "Listings",
    },
    {
      href: "/admin/users",
      label: isAr ? "المستخدمون والتحقق" : "Users & KYC",
    },
    {
      href: "/admin/pipeline",
      label: isAr ? "مسار الصفقات" : "Pipeline",
    },
    {
      href: "/admin/policies",
      label: isAr ? "سياسات المطورين" : "Policies",
    },
    {
      href: "/admin/payments",
      label: isAr ? "المدفوعات" : "Payments",
      badge: failedPayments || undefined,
    },
    {
      href: "/admin/jobs",
      label: isAr ? "المهام الخلفية" : "Jobs",
      badge: deadJobs || undefined,
    },
    {
      href: "/admin/metrics",
      label: isAr ? "المؤشرات" : "Metrics",
    },
    {
      href: "/admin/audit",
      label: isAr ? "سجل التدقيق" : "Audit",
    },
    {
      href: "/analyst",
      label: isAr ? "منصة التحقق ←" : "Verification workbench →",
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
