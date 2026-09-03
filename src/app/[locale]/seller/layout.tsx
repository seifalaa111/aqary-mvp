import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireRolePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { WorkspaceShell } from "@/components/chrome/workspace-shell";

export default async function SellerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRolePage("SELLER");
  const t = await getTranslations({ locale, namespace: "seller" });
  const tn = await getTranslations({ locale, namespace: "nav" });

  const openOffers = await prisma.offer.count({
    where: { sellerId: user.id, status: "PENDING", direction: "BUYER_TO_SELLER" },
  });

  return (
    <WorkspaceShell
      locale={locale}
      role="SELLER"
      nav={[
        { href: "/seller", label: t("dashboard") },
        { href: "/seller/offers", label: tn("marketplace") === "Opportunities" ? "Offers" : "العروض", badge: openOffers || undefined },
        { href: "/deals", label: "Deals" },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
