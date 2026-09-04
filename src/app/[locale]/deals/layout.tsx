import type { ReactNode } from "react";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export default async function DealsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRolePage("BUYER", "SELLER", "ANALYST", "ADMIN", "DEVELOPER_PARTNER");

  const developerIds = user.roles.includes("DEVELOPER_PARTNER")
    ? (await prisma.developerPartnerMembership.findMany({ where: { userId: user.id, active: true }, select: { developerId: true } })).map((m) => m.developerId)
    : [];

  const active = await prisma.deal.count({
    where: {
      status: "ACTIVE",
      OR: [
        { buyerId: user.id },
        { sellerId: user.id },
        { coordinatorId: user.id },
        ...(developerIds.length ? [{ developerId: { in: developerIds } }] : []),
      ],
    },
  });

  const isBuyer = user.roles.includes("BUYER");
  const isSeller = user.roles.includes("SELLER");

  return (
    <WorkspaceShell
      locale={locale}
      role={user.activeRole}
      nav={[
        ...(isSeller ? [{ href: "/seller", label: "Seller" }] : []),
        ...(isBuyer ? [{ href: "/opportunities", label: "Opportunities" }] : []),
        ...(user.roles.includes("DEVELOPER_PARTNER") ? [{ href: "/partner", label: "Developer portal" }] : []),
        { href: "/deals", label: "Deals", badge: active || undefined },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
